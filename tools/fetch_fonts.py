#!/usr/bin/env python3
"""Download the app's fonts once and save them in src/fonts/, so the page serves them itself
(no Google round trip before the first paint).

    python tools/fetch_fonts.py            download (needs internet, run it on your own computer)
    python tools/fetch_fonts.py --check    only report what is in src/fonts/ (no internet needed)

Writes:
    src/fonts/*.woff2     the font files (Latin + Latin Extended; Bengali for Noto Sans Bengali)
    src/fonts/fonts.css   the @font-face rules, pointing at fonts/<file>.woff2
    src/fonts/preload.txt the few files the first screen needs; build.py turns them into <link rel=preload>

Then run `python build.py`. build.py sees src/fonts/fonts.css and:
    - puts the rules into the page and removes the Google Fonts <link>s and preconnects
    - copies the files to dist/fonts/
If src/fonts/ does not exist, build.py leaves the Google Fonts links in place (nothing breaks).

To change which weights or families ship, edit FAMILIES below and run this again.
Keep the lists in step with what the CSS really uses (grep font-weight in src/css/).
"""
import hashlib, os, re, sys, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "src", "fonts")

# Same families, weights and axes as the old Google Fonts link in 00-head.html.
# family -> (css2 spec, subsets to keep). Subsets not listed are never downloaded.
FAMILIES = {
    "Fraunces":          ("Fraunces:opsz,wght@9..144;500;600;700",                 {"latin", "latin-ext"}),
    "Inter":             ("Inter:wght@400;500;600;700",                            {"latin", "latin-ext"}),
    "Newsreader":        ("Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;0,6..72,600;1,6..72,400", {"latin", "latin-ext"}),
    "Literata":          ("Literata:opsz,wght@7..72,600",                          {"latin", "latin-ext"}),
    "Outfit":            ("Outfit:wght@300;400;500;600",                           {"latin", "latin-ext"}),
    # Only the Bengali letters: Inter / Newsreader already cover Latin text inside a Bengali page.
    "Noto Sans Bengali": ("Noto+Sans+Bengali:wght@400;500;600;700",                {"bengali"}),
}

# Files worth preloading: the upright Latin face of the fonts the first screen uses.
PRELOAD_FAMILIES = ("Inter", "Fraunces", "Newsreader")

# Google only answers with WOFF2 when the browser looks modern.
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"

BLOCK = re.compile(r"/\*\s*([\w-]+)\s*\*/\s*@font-face\s*\{(.*?)\}", re.S)


def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read()


def prop(body, name):
    m = re.search(r"\b" + name + r"\s*:\s*([^;]+);", body)
    return m.group(1).strip() if m else None


def parse(css):
    """Google CSS text -> list of dicts: subset, family, style, weight, range, url."""
    out = []
    for subset, body in BLOCK.findall(css):
        u = re.search(r"url\((https?://[^)]+\.woff2)\)", body)
        if not u:
            continue
        out.append({
            "subset": subset,
            "family": prop(body, "font-family").strip("'\""),
            "style": prop(body, "font-style") or "normal",
            "weight": prop(body, "font-weight") or "400",
            "range": prop(body, "unicode-range"),
            "url": u.group(1),
        })
    return out


def file_name(face, data):
    slug = re.sub(r"[^a-z0-9]+", "-", face["family"].lower()).strip("-")
    style = "-italic" if face["style"] == "italic" else ""
    return "%s%s-%s-%s.woff2" % (slug, style, face["subset"], hashlib.sha1(data).hexdigest()[:8])


def render(faces):
    parts = []
    for f in faces:
        rule = ("@font-face{font-family:'%s';font-style:%s;font-weight:%s;font-display:swap;"
                "src:url(fonts/%s) format('woff2')" % (f["family"], f["style"], f["weight"], f["file"]))
        rule += ";unicode-range:%s}" % f["range"] if f["range"] else "}"
        parts.append(rule)
    return "\n".join(parts) + "\n"


def run():
    os.makedirs(OUT, exist_ok=True)
    faces, by_url = [], {}
    for family, (spec, keep) in FAMILIES.items():
        css = get("https://fonts.googleapis.com/css2?family=%s&display=swap" % spec).decode("utf-8")
        got = [f for f in parse(css) if f["subset"] in keep]
        if not got:
            sys.exit("No usable faces came back for %s. Check the spec in FAMILIES." % family)
        for f in got:
            if f["url"] not in by_url:                     # one file may serve several weights: save it once
                data = get(f["url"])
                name = file_name(f, data)
                with open(os.path.join(OUT, name), "wb") as fh:
                    fh.write(data)
                by_url[f["url"]] = (name, len(data))
            f["file"] = by_url[f["url"]][0]
            faces.append(f)
        print("%-18s %d rules" % (family, len(got)))

    with open(os.path.join(OUT, "fonts.css"), "w", encoding="utf-8") as fh:
        fh.write(render(faces))

    pre = []
    for f in faces:
        if f["family"] in PRELOAD_FAMILIES and f["subset"] == "latin" and f["style"] == "normal" and f["file"] not in pre:
            pre.append(f["file"])
    with open(os.path.join(OUT, "preload.txt"), "w", encoding="utf-8") as fh:
        fh.write("\n".join(pre) + "\n")

    # drop files no rule uses any more (an older run)
    used = {f["file"] for f in faces}
    for name in os.listdir(OUT):
        if name.endswith(".woff2") and name not in used:
            os.remove(os.path.join(OUT, name))
    report()


def report():
    css = os.path.join(OUT, "fonts.css")
    if not os.path.exists(css):
        print("src/fonts/ is empty: the build keeps using Google Fonts.")
        return
    files = sorted(n for n in os.listdir(OUT) if n.endswith(".woff2"))
    total = sum(os.path.getsize(os.path.join(OUT, n)) for n in files)
    missing = [n for n in re.findall(r"url\(fonts/([^)]+)\)", open(css, encoding="utf-8").read()) if n not in files]
    print("%d font files, %.0f KB in total (the browser only fetches the ones a page needs)" % (len(files), total / 1024))
    if missing:
        sys.exit("fonts.css points at files that are missing: " + ", ".join(sorted(set(missing))))


if __name__ == "__main__":
    report() if "--check" in sys.argv else run()
