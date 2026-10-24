#!/usr/bin/env python3
"""Wordtrail dependency tool. Uses only the Python standard library.

The app is ONE closure (src/js/020 ... 999), so every top-level name is shared. This tool makes that visible.

    python tools/deps.py                 write DEPENDENCIES.md and refresh the line counts in MODULES.md
    python tools/deps.py --check         write nothing; exit 1 if a name is declared twice, or if
                                         DEPENDENCIES.md / the line counts in MODULES.md are out of date (used by CI)
    python tools/deps.py --who NAME      which file declares NAME and which files use it

How it works (approximate, on purpose simple):
  * comments, strings and regex literals are blanked out first, so words inside them do not count;
  * a top-level declaration is a `function`, `class`, `const`, `let` or `var` that starts with exactly 2 spaces
    (the closure's indent), including destructuring and `const a = 1, b = 2;` on one line;
  * a file "uses" a name when the name appears as a word that is not a property (`x.name`) or an object key (`name:`).
    A local variable with the same name as a shared one counts as a use too, so "Needs" can list a little too much,
    never too little.
Declarations spread over several lines (`const a = 1,\\n    b = 2;`) are not seen: keep one declaration per line.
"""
import os, re, sys, collections

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OPEN, CLOSE = "020-app-open.js", "999-app-close.js"
GEN_FILE = "DEPENDENCIES.md"
MIN_LEN = 3  # one- and two-letter names ($, h, S, P, el) are used everywhere; they are listed in MODULES.md instead


def closure_files():
    """The JS files inside the closure, in build order, read from build.py (the single source of truth)."""
    text = open(os.path.join(ROOT, "build.py"), encoding="utf-8").read()
    paths = re.findall(r"\('file', '(src/js/[^']+)'\)", text)
    names = [p[len('src/js/'):] for p in paths]   # relative to src/js, e.g. sound/music-moods.js
    return [n for n in names[names.index(OPEN) + 1: names.index(CLOSE)]]


def blank(src):
    """Return src with comments, string contents and regex literals replaced by spaces (newlines kept)."""
    out, i, n = [], 0, len(src)
    stack = []            # open `${` inside template literals: brace depth to return to
    depth = 0
    last = ""             # last significant char outside strings/comments
    last_word = ""
    def put(s): out.append(s)
    while i < n:
        c = src[i]
        two = src[i:i + 2]
        if two == "//":
            j = src.find("\n", i); j = n if j < 0 else j
            put(" " * (j - i)); i = j; continue
        if two == "/*":
            j = src.find("*/", i + 2); j = n if j < 0 else j + 2
            put("".join(ch if ch == "\n" else " " for ch in src[i:j])); i = j; continue
        if c in "'\"":
            j = i + 1
            while j < n and src[j] != c and src[j] != "\n":
                j += 2 if src[j] == "\\" else 1
            put(c + " " * max(0, j - i - 1) + (src[j] if j < n and src[j] == c else "")); i = j + 1; last = c; continue
        if c == "`":
            put("`"); i += 1
            while i < n and src[i] != "`":
                if src[i] == "\\":
                    put("  "); i += 2; continue
                if src[i:i + 2] == "${":
                    put("${"); i += 2; stack.append(depth); depth += 1
                    break
                put("\n" if src[i] == "\n" else " "); i += 1
            else:
                put("`"); i += 1; last = "`"
            continue
        if c == "{":
            depth += 1
        elif c == "}":
            depth -= 1
            if stack and depth == stack[-1]:      # end of ${ ... } : back into the template text
                stack.pop(); put("}"); i += 1
                while i < n and src[i] != "`":
                    if src[i] == "\\":
                        put("  "); i += 2; continue
                    if src[i:i + 2] == "${":
                        put("${"); i += 2; stack.append(depth); depth += 1
                        break
                    put("\n" if src[i] == "\n" else " "); i += 1
                else:
                    put("`"); i += 1; last = "`"
                continue
        if c == "/" and (last == "" or last in "(,=:[!&|?{};+-*%<>~^" or last_word in ("return", "typeof", "case")):
            j, incls = i + 1, False                      # regex literal
            while j < n and src[j] != "\n":
                if src[j] == "\\": j += 2; continue
                if src[j] == "[": incls = True
                elif src[j] == "]": incls = False
                elif src[j] == "/" and not incls: break
                j += 1
            j += 1
            while j < n and src[j].isalpha(): j += 1
            put("/" + " " * (j - i - 1)); i = j; last = "/"; last_word = ""; continue
        if c.isalnum() or c in "_$":
            j = i
            while j < n and (src[j].isalnum() or src[j] in "_$"): j += 1
            last_word = src[i:j]; last = src[j - 1]; put(src[i:j]); i = j; continue
        if not c.isspace():
            last = c; last_word = ""
        put(c); i += 1
    return "".join(out)


IDENT = r"[A-Za-z_$][\w$]*"
DECL = re.compile(r"^  (?:async\s+)?(?:function\*?\s+(%s)|class\s+(%s)|(?:const|let|var)\s+(.*))" % (IDENT, IDENT))


def declared_names(code):
    """[(name, line_number)] for top-level declarations in blanked code."""
    found = []
    for ln, line in enumerate(code.split("\n"), 1):
        m = DECL.match(line)
        if not m:
            continue
        if m.group(1) or m.group(2):
            found.append((m.group(1) or m.group(2), ln)); continue
        rest = m.group(3)
        # walk the rest of the line; take a name at the start and after each top-level comma
        d, start, parts = 0, 0, []
        for k, ch in enumerate(rest):
            if ch in "([{": d += 1
            elif ch in ")]}": d -= 1
            elif ch == "," and d == 0:
                parts.append(rest[start:k]); start = k + 1
        parts.append(rest[start:])
        for p in parts:
            p = p.strip()
            if p[:1] in "{[":                              # destructuring: const { a, b: c } = ...  /  const [x, y] = ...
                close = p.find("}" if p[0] == "{" else "]")
                inner = p[1:close] if close > 0 else p[1:]
                for piece in inner.split(","):
                    piece = piece.split(":")[-1].split("=")[0].strip()
                    if re.fullmatch(IDENT, piece): found.append((piece, ln))
            else:
                m2 = re.match(r"(%s)\s*(=|$|;)" % IDENT, p)
                if m2: found.append((m2.group(1), ln))
    return found


def scan():
    """Read every closure file once. Returns (files, code, decls) where decls = {name: [(file, line), ...]}."""
    files = closure_files()
    code, decls, raw_lines = {}, collections.defaultdict(list), {}
    for f in files:
        raw = open(os.path.join(ROOT, "src", "js", f), encoding="utf-8").read()
        raw_lines[f] = raw.count("\n") + (0 if raw.endswith("\n") or not raw else 1)
        code[f] = blank(raw)
        for name, ln in declared_names(code[f]):
            decls[name].append((f, ln))
    return files, code, decls, raw_lines


def find_duplicates(decls):
    return {n: v for n, v in decls.items() if len(v) > 1}


def uses_of(name, code):
    """Files (other than the declaring one is decided by the caller) whose code mentions `name` as a plain word."""
    pat = re.compile(r"(?<![\w$.])" + re.escape(name) + r"(?![\w$])(?!\s*:(?!:))")
    return [f for f, c in code.items() if pat.search(c)]


def build_map(files, code, decls):
    owner = {n: v[0][0] for n, v in decls.items()}
    provides = {f: {} for f in files}      # file -> {name: [users]}
    needs = {f: collections.defaultdict(list) for f in files}   # file -> {owner file: [names]}
    for name, o in owner.items():
        if len(name) < MIN_LEN:
            continue
        users = [f for f in uses_of(name, code) if f != o]
        if users:
            provides[o][name] = users
            for u in users:
                needs[u][o].append(name)
    return owner, provides, needs


def short(f):
    return f.split("-")[0]


def render(files, code, decls, raw_lines):
    owner, provides, needs = build_map(files, code, decls)
    total, shared = len(owner), sum(len(p) for p in provides.values())
    L = []
    L.append("# Wordtrail dependencies\n")
    L.append("GENERATED by `python tools/deps.py`. Do not edit by hand; run the tool after you change `src/js/`.\n")
    L.append("The app is one closure, so every top-level name is visible to every file. This page shows who really uses what. "
             "It is approximate: a local variable with the same name as a shared one counts as a use (the list can be a little too long, never too short). "
             "Names of one or two letters (`$`, `h`, `S`, `P`, `el`) are left out; see `MODULES.md`.\n")
    L.append("- Top-level names: **%d**, declared twice: **0** (the tool fails otherwise)" % total)
    L.append("- Used only inside their own file (private): **%d**" % (total - len([n for p in provides.values() for n in p]) - sum(1 for n in owner if len(n) < MIN_LEN)))
    L.append("- Used by at least one other file (shared): **%d**\n" % shared)
    L.append("## Summary\n")
    L.append("| File | Lines | Declares | Shared with others | Needs from other files |")
    L.append("|---|---|---|---|---|")
    declared_count = collections.Counter(owner.values())
    for f in files:
        n_need = sum(len(v) for v in needs[f].values())
        L.append("| `%s` | %d | %d | %d | %d |" % (f, raw_lines[f], declared_count[f], len(provides[f]), n_need))
    L.append("\n## Per file\n")
    for f in files:
        L.append("### `%s`\n" % f)
        if needs[f]:
            parts = ["`%s` (%s)" % (o, ", ".join("`%s`" % n for n in sorted(ns))) for o, ns in sorted(needs[f].items())]
            L.append("**Needs:** " + "; ".join(parts) + "\n")
        else:
            L.append("**Needs:** nothing from other files in this closure.\n")
        if provides[f]:
            parts = []
            for n in sorted(provides[f]):
                us = provides[f][n]
                parts.append("`%s` (%s)" % (n, ", ".join(short(u) for u in us) if len(us) <= 6 else "%d files" % len(us)))
            L.append("**Shared:** " + ", ".join(parts) + "\n")
        else:
            L.append("**Shared:** nothing; every name here is private to the file.\n")
    return "\n".join(L).rstrip("\n") + "\n"


ROW = re.compile(r"^(\| `((?:[\w-]+/)?[\w-]+\.js)` \| )(\d+)( \|)")


def refresh_modules(raw_lines):
    """Return MODULES.md text with the Lines column set from the real files."""
    path = os.path.join(ROOT, "MODULES.md")
    out = []
    for line in open(path, encoding="utf-8").read().split("\n"):
        m = ROW.match(line)
        if m and m.group(2) in raw_lines:
            line = m.group(1) + str(raw_lines[m.group(2)]) + line[m.end(3):]
        out.append(line)
    return "\n".join(out)


def main(argv):
    files, code, decls, raw_lines = scan()
    if "--who" in argv:
        name = argv[argv.index("--who") + 1]
        if name not in decls:
            print("%s is not declared at the top level of the closure" % name); return 1
        owner = decls[name][0]
        print("%s is declared in %s line %d" % (name, owner[0], owner[1]))
        users = [f for f in uses_of(name, code) if f != owner[0]]
        print("used by: " + (", ".join(users) if users else "no other file"))
        return 0
    dups = find_duplicates(decls)
    if dups:
        print("ERROR: these names are declared more than once in the closure (the later one silently wins for functions):")
        for n, v in sorted(dups.items()):
            print("  %s: %s" % (n, ", ".join("%s:%d" % x for x in v)))
        return 1
    gen = render(files, code, decls, raw_lines)
    mod = refresh_modules(raw_lines)
    gen_path, mod_path = os.path.join(ROOT, GEN_FILE), os.path.join(ROOT, "MODULES.md")
    cur_gen = open(gen_path, encoding="utf-8").read() if os.path.exists(gen_path) else ""
    cur_mod = open(mod_path, encoding="utf-8").read()
    stale = [n for n, a, b in ((GEN_FILE, cur_gen, gen), ("MODULES.md (line counts)", cur_mod, mod)) if a != b]
    if "--check" in argv:
        if stale:
            print("OUT OF DATE: %s. Run: python tools/deps.py" % ", ".join(stale)); return 1
        print("OK: %d names, none declared twice; %s and MODULES.md are up to date" % (len(decls), GEN_FILE)); return 0
    open(gen_path, "w", encoding="utf-8", newline="\n").write(gen)
    open(mod_path, "w", encoding="utf-8", newline="\n").write(mod)
    print("OK: %d names, none declared twice. Wrote %s%s" % (len(decls), GEN_FILE, " and refreshed MODULES.md line counts" if "MODULES.md (line counts)" in stale else ""))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
