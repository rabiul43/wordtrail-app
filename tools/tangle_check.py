#!/usr/bin/env python3
"""Keeps the app from getting MORE tangled. Uses only the Python standard library.

    python tools/tangle_check.py            check (used by CI): exit 1 on a new coupling or a leftover file
    python tools/tangle_check.py --accept   record the current couplings as the new baseline (tools/tangle_baseline.json)
    python tools/tangle_check.py --report   print the numbers, change nothing

The app is one closure, so any file CAN use any name. This check makes every new "file A needs a name from file B"
a conscious decision instead of an accident:

  * A new dependency between two files (one that is not in tools/tangle_baseline.json) fails the check and lists
    the names. If it is really what you want, run --accept and commit the changed baseline: the diff then shows
    in review exactly which coupling you added. A NEW file starts with no dependencies, so all its needs show up too.
  * A file in src/js/ that build.py does not use fails the check (a leftover copy confuses everyone and can be edited by mistake).
  * Removing a dependency is good news: the check says so, and --accept locks the gain in so it cannot come back unnoticed.

It builds on tools/deps.py, so it has the same limits: a local variable with the same name as a shared one counts as a use
(so a new dependency can be a false alarm: check the names, then --accept).
"""
import json, os, re, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import deps

ROOT = deps.ROOT
BASELINE = os.path.join(ROOT, "tools", "tangle_baseline.json")


def current():
    """Returns (files, edges) where edges = {(user_file, owner_file): [names]}."""
    files, code, decls, raw = deps.scan()
    owner, provides, needs = deps.build_map(files, code, decls)
    edges = {}
    for u in files:
        for o, names in needs[u].items():
            edges[(u, o)] = sorted(names)
    return files, edges


def leftovers():
    """Files under src/js/ that build.py never uses."""
    text = open(os.path.join(ROOT, "build.py"), encoding="utf-8").read()
    used = set(re.findall(r"\('(?:file|copy)', '(src/js/[^']+)'\)", text))
    found = set()
    for r, _, fs in os.walk(os.path.join(ROOT, "src", "js")):
        for f in fs:
            found.add(os.path.relpath(os.path.join(r, f), ROOT).replace(os.sep, "/"))
    return sorted(found - used)


def biggest_cycle(files, edges):
    """Size of the largest group of files that depend on each other (directly or through others)."""
    adj = {f: [] for f in files}
    for (u, o) in edges:
        adj[u].append(o)
    index, low, stack, on, best, counter = {}, {}, [], set(), [0], [0]
    sys.setrecursionlimit(10000)

    def visit(v):
        index[v] = low[v] = counter[0]; counter[0] += 1
        stack.append(v); on.add(v)
        for w in adj[v]:
            if w not in index:
                visit(w); low[v] = min(low[v], low[w])
            elif w in on:
                low[v] = min(low[v], index[w])
        if low[v] == index[v]:
            n = 0
            while True:
                w = stack.pop(); on.discard(w); n += 1
                if w == v:
                    break
            best[0] = max(best[0], n)
    for f in files:
        if f not in index:
            visit(f)
    return best[0]


def summary(files, edges):
    pos = {f: i for i, f in enumerate(files)}
    return {
        "files": len(files),
        "dependencies": len(edges),
        "pointing_to_a_later_file": sum(1 for (u, o) in edges if pos[o] > pos[u]),
        "largest_cycle": biggest_cycle(files, edges),
    }


def key(u, o):
    return u + " -> " + o


def main(argv):
    files, edges = current()
    s = summary(files, edges)
    if "--report" in argv:
        for k, v in s.items():
            print("%-26s %d" % (k.replace("_", " "), v))
        return 0
    if "--accept" in argv:
        data = {
            "note": "Written by tools/tangle_check.py --accept. Each entry means: the first file uses a name declared in the second. A new entry needs a reason; a removed entry is progress.",
            "summary": s,
            "dependencies": sorted(key(u, o) for (u, o) in edges),
        }
        with open(BASELINE, "w", encoding="utf-8", newline="\n") as fh:
            json.dump(data, fh, indent=1); fh.write("\n")
        print("Baseline written: %d files, %d dependencies, largest cycle %d files." % (s["files"], s["dependencies"], s["largest_cycle"]))
        return 0

    if not os.path.exists(BASELINE):
        print("No baseline yet. Run: python tools/tangle_check.py --accept"); return 1
    base = set(json.load(open(BASELINE, encoding="utf-8")).get("dependencies", []))
    now = {key(u, o): names for (u, o), names in edges.items()}
    new = sorted(k for k in now if k not in base)
    gone = sorted(k for k in base if k not in now)
    lost = leftovers()
    bad = False
    if lost:
        bad = True
        print("FAIL  %d file(s) in src/js/ are not used by build.py (leftover copies):" % len(lost))
        for f in lost:
            print("        " + f)
        print("      Delete them (git keeps the history), or add them to build.py if they are meant to be part of the app.")
    if new:
        bad = True
        print("FAIL  %d new dependency(ies) between files:" % len(new))
        for k in new:
            names = now[k]
            print("        %s   (%s%s)" % (k, ", ".join(names[:6]), ", ..." if len(names) > 6 else ""))
        print("      If this is intended: python tools/tangle_check.py --accept   and commit tools/tangle_baseline.json.")
        print("      If not: move the shared piece to the lower file, or pass what is needed as a function argument.")
    if gone:
        print("note  %d dependency(ies) were removed since the baseline (well done). Lock it in: python tools/tangle_check.py --accept" % len(gone))
    if not bad:
        print("ok    no new couplings: %d files, %d dependencies, largest cycle %d files" % (s["files"], s["dependencies"], s["largest_cycle"]))
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
