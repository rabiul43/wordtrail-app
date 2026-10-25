#!/usr/bin/env python3
"""Wordtrail build: joins the pieces in src/ into ONE file, dist/index.html,
and copies src/pwa/ (manifest, service worker, icons) next to it.

    python build.py               public app: no developer test data (this is what the website serves)
    python build.py --dev         developer build: also includes the scene-test sample cases and baseline
                                  (Settings > Developer > Scene tests), for use on your own computer
    python build.py --no-min      skip minifying (readable page, for debugging; the public build is minified with esbuild)
    python build.py --verify X    also check the result is byte-for-byte equal to file X
                                  (the original single-file app included the developer data, so use --dev --verify X)

The order below is the order of the final file. It matters: CSS is a layered cascade
and the script is one closure, so a piece may only use names declared above it.
To add a piece: create the file in src/ and add one line here, at the right place.

Web addresses (the Workers and the music site) live in hosts.json, nowhere else. The source files hold placeholders such as
__WT_HOST_PROXY__; every build fills them in, and fills the same addresses into dist/_headers (the security rules).
"""
import hashlib, json, os, re, shutil, sys
import urllib.parse

ROOT = os.path.dirname(os.path.abspath(__file__))

# ('file', path)  = copy this file as it is      ('lit', text) = a little fixed text (tags)
# ('devlit', text) = fixed text that belongs to a developer piece, left out with it
PARTS = [
    ('file', 'src/html/00-head.html'),
    ('lit', '<style>\n'),
    ('file', 'src/css/10-base-layout.css'),
    ('file', 'src/css/20-home-library.css'),
    ('file', 'src/css/30-onboarding-sync-card.css'),
    ('file', 'src/css/40-player-sheets-chips.css'),
    ('file', 'src/css/50-new-reader-tabbar-settings.css'),
    ('file', 'src/css/60-reading-search.css'),
    ('file', 'src/css/70-collections-detail-motion.css'),
    ('file', 'src/css/80-progress-v10.css'),
    ('file', 'src/css/90-reader-sheet.css'),
    ('file', 'src/css/95-live-translate.css'),
    ('file', 'src/css/96-sound-tabs.css'),
    ('file', 'src/css/97-controls-sheet.css'),
    ('lit', '</style>\n'),
    ('file', 'src/html/10-body-views.html'),
    ('file', 'src/html/20-sheets-player.html'),
    ('devlit', '<script type="text/plain" id="scene-tests">\n'),
    ('file', 'src/dev/scene-tests.txt'),
    ('devlit', '</script>\n'),
    ('file', 'src/dev/scene-baseline.html'),
    ('lit', '<script type="text/plain" id="scene-worker-src">\n'),
    ('copy', 'src/js/230-scene-words.js'),
    ('copy', 'src/js/231-scene-scoring.js'),
    ('lit', '\n</script>\n'),
    ('lit', '<script type="application/json" id="amb-map">\n'),
    ('file', 'src/data/amb-map.json'),
    ('lit', '</script>\n'),
    ('lit', '<script type="application/json" id="i18n-data">\n'),
    ('i18n', 'src/i18n'),
    ('lit', '\n</script>\n'),
    ('file', 'src/html/28-sheet-sound.html'),
    ('file', 'src/html/30-sheets-settings.html'),
    ('lit', '<script>\n'),
    ('file', 'src/js/005-settings-tabs.js'),
    ('lit', '</script>\n'),
    ('file', 'src/html/40-onboarding.html'),
    ('lit', '<script>\n'),
    ('file', 'src/js/010-core.js'),
    ('file', 'src/js/020-app-open.js'),
    ('file', 'src/js/030-helpers-offline-audio.js'),
    ('file', 'src/js/031-virtual-list.js'),
    ('file', 'src/js/040-worker-newreader.js'),
    ('file', 'src/js/050-audio-clips.js'),
    ('file', 'src/js/060-position-bookmarks.js'),
    ('file', 'src/js/070-network-data.js'),
    ('file', 'src/js/080-ui-shell-favourites.js'),
    ('file', 'src/js/090-synced-stats-book-search.js'),
    ('file', 'src/js/095-weekly-report.js'),
    ('file', 'src/js/100-home-covers.js'),
    ('file', 'src/js/101-home-tiles.js'),
    ('file', 'src/js/102-home-sections.js'),
    ('file', 'src/js/103-browse-filters.js'),
    ('file', 'src/js/104-see-all-suggestions.js'),
    ('file', 'src/js/105-home-loaders.js'),
    ('file', 'src/js/110-collections.js'),
    ('file', 'src/js/120-search-recommendations.js'),
    ('file', 'src/js/130-book-detail.js'),
    ('file', 'src/js/131-book-stats-share.js'),
    ('file', 'src/js/132-author-page-resume-card.js'),
    ('file', 'src/js/133-open-progress-saved-state.js'),
    ('file', 'src/js/134-version-picker.js'),
    ('file', 'src/js/135-ratings.js'),
    ('file', 'src/js/140-open-book.js'),
    ('file', 'src/js/145-chapter-recap.js'),
    ('file', 'src/js/150-player-reader.js'),
    ('file', 'src/js/160-learning-tools.js'),
    ('file', 'src/js/161-live-translate.js'),
    ('file', 'src/js/170-sync-points-drift.js'),
    ('file', 'src/js/180-sync-alignment.js'),
    ('file', 'src/js/190-sync-finish-retry.js'),
    ('file', 'src/js/200-player-controls.js'),
    # --- Sound: music, ambient, opening chime, story sounds (src/js/sound/, one feature per file) ---
    ('file', 'src/js/sound/music-state.js'),
    ('file', 'src/js/sound/music-moods.js'),
    ('file', 'src/js/sound/music-bus.js'),
    ('file', 'src/js/sound/music-library.js'),
    ('file', 'src/js/sound/music-playback.js'),
    ('file', 'src/js/sound/music-offline.js'),
    ('file', 'src/js/sound/music-wiring.js'),
    ('file', 'src/js/sound/music-credits.js'),
    ('file', 'src/js/sound/ambient-scenes.js'),
    ('file', 'src/js/sound/ambient-synth.js'),
    ('file', 'src/js/sound/ambient-engine.js'),
    ('file', 'src/js/sound/ambient-layers.js'),
    ('file', 'src/js/sound/ambient-recordings.js'),
    ('file', 'src/js/sound/ambient-mix.js'),
    ('file', 'src/js/sound/ambient-ducking.js'),
    ('file', 'src/js/sound/ambient-events.js'),
    ('file', 'src/js/sound/opening-sound.js'),
    ('file', 'src/js/sound/story-rules.js'),
    ('file', 'src/js/sound/story-sounds.js'),
    ('file', 'src/js/sound/story-engine.js'),
    ('file', 'src/js/sound/story-transitions.js'),
    ('file', 'src/js/sound/ambient-intensity.js'),
    # --- scene detection (what the story is about: place, weather, time, mood) ---
    ('file', 'src/js/230-scene-words.js'),
    ('file', 'src/js/231-scene-scoring.js'),
    ('file', 'src/js/232-scene-test.js'),
    ('file', 'src/js/233-scene-chapters-label.js'),
    ('file', 'src/js/234-scene-prescore.js'),
    ('file', 'src/js/sound/sound-presets.js'),
    ('file', 'src/js/sound/sound-core.js'),
    ('file', 'src/js/sound/smart-mix.js'),
    ('file', 'src/js/sound/sound-cache.js'),
    ('file', 'src/js/sound/sound-screen.js'),
    ('file', 'src/js/sound/sound-tabs.js'),
    ('file', 'src/js/246-controls-search.js'),
    ('file', 'src/js/247-player-menu.js'),
    ('file', 'src/js/250-characters.js'),
    ('file', 'src/js/260-audio-effects.js'),
    ('file', 'src/js/270-sheets-nextup-back.js'),
    ('file', 'src/js/280-downloads-progress.js'),
    ('file', 'src/js/290-backup-maintenance.js'),
    ('file', 'src/js/295-account-sync.js'),
    ('file', 'src/js/298-pwa.js'),
    ('file', 'src/js/300-wiring.js'),
    ('file', 'src/js/999-app-close.js'),
    ('file', 'src/html/90-end.html'),
]

# Pieces that exist only for developers (Settings > Developer scene tests).
# The public build leaves them out. The app still works without them: the scene-test panel then
# starts with an empty case box and no shipped baseline (the code checks for both).
LAZY_BYTES = 20000   # a language file bigger than this is loaded on demand
LAZY = {}            # code -> JSON bytes, filled by build() and written next to index.html
DEV_PARTS = {"src/dev/scene-tests.txt", "src/dev/scene-baseline.html"}

def build(include_dev=False):
    out = []
    for kind, value in PARTS:
        if kind == "devlit":
            if include_dev:
                out.append(value.encode("utf-8"))
        elif kind == "lit":
            out.append(value.encode("utf-8"))
        elif kind == "copy":
            # the same file a second time, as plain text (the scene worker is built from it; it is not part of the closure)
            with open(os.path.join(ROOT, value), "rb") as f:
                out.append(f.read())
        elif kind == "i18n":
            # one JSON file per language in src/i18n/ -> one JSON object {code: {...}} (the code is the file name)
            # A big language (over LAZY_BYTES) is not put in the page: the page only keeps its name, direction, order, first-run offer
            # and digits switch, plus "lazy": 1, and the words go to dist/i18n-<code>.json, which the app fetches the first time that
            # language is used (and the service worker keeps for offline). Small languages stay inline.
            langs = {}; LAZY.clear()
            for name in sorted(os.listdir(os.path.join(ROOT, value))):
                if name.endswith(".json"):
                    with open(os.path.join(ROOT, value, name), "r", encoding="utf-8") as f:
                        d = json.load(f)
                    if os.path.getsize(os.path.join(ROOT, value, name)) > LAZY_BYTES:
                        LAZY[name[:-5]] = json.dumps(d, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
                        d = {k: d[k] for k in ("name", "dir", "order", "suggest", "digits") if k in d}; d["lazy"] = 1
                    langs[name[:-5]] = d
            out.append(json.dumps(langs, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/").encode("utf-8"))
        else:
            if value in DEV_PARTS and not include_dev:
                continue
            with open(os.path.join(ROOT, value), "rb") as f:
                out.append(f.read())
    return b"".join(out)

FONTS_DIR = os.path.join(ROOT, "src", "fonts")

def apply_fonts(data):
    """Self-hosted fonts. If src/fonts/fonts.css exists (made by tools/fetch_fonts.py), the page gets those @font-face rules,
    <link rel=preload> for the first-screen files, and the Google Fonts preconnects + stylesheet links are removed.
    If it does not exist, the Google Fonts links stay exactly as they are. The marker comments in 00-head.html are removed either way."""
    css_path = os.path.join(FONTS_DIR, "fonts.css")
    pre_re = re.compile(rb"<!--WT-FONTS-PRECONNECT-->.*?<!--/WT-FONTS-PRECONNECT-->", re.S)
    link_re = re.compile(rb"<!--WT-FONTS-LINKS-->.*?<!--/WT-FONTS-LINKS-->", re.S)
    if not os.path.exists(css_path):
        print("fonts: src/fonts/ not found, keeping Google Fonts (run tools/fetch_fonts.py to self-host)")
        data = pre_re.sub(lambda m: m.group(0)[len(b"<!--WT-FONTS-PRECONNECT-->"):-len(b"<!--/WT-FONTS-PRECONNECT-->")], data)
        return link_re.sub(lambda m: m.group(0).replace(b"<!--WT-FONTS-LINKS-->", b"").replace(b"<!--/WT-FONTS-LINKS-->", b""), data)
    with open(css_path, "rb") as f:
        css = f.read().strip()
    files = {n for n in os.listdir(FONTS_DIR) if n.endswith(".woff2")}
    for n in re.findall(rb"url\(fonts/([^)]+)\)", css):
        if n.decode() not in files:
            sys.exit("BUILD STOPPED: src/fonts/fonts.css uses %s but the file is missing (run tools/fetch_fonts.py)" % n.decode())
    pre = b""
    pre_path = os.path.join(FONTS_DIR, "preload.txt")
    if os.path.exists(pre_path):
        for n in open(pre_path, encoding="utf-8").read().split():
            pre += b'<link rel="preload" href="fonts/%s" as="font" type="font/woff2" crossorigin>\n' % n.encode()
    block = pre + b"<style>\n" + css + b"\n</style>\n<script>document.documentElement.classList.add('fonts-local')</script>\n"
    data = pre_re.sub(b"", data)
    return link_re.sub(lambda m: block, data)

HOSTS_FILE = os.path.join(ROOT, "hosts.json")
# hosts.json name -> (placeholder in the source files, may be left empty, must end with "/")
HOST_SLOTS = {
    "proxy":    (b"__WT_HOST_PROXY__",    False, False),
    "hf_proxy": (b"__WT_HOST_HF_PROXY__", True,  False),
    "stats":    (b"__WT_HOST_STATS__",    True,  False),
    "music":    (b"__WT_HOST_MUSIC__",    False, True),
}

def load_hosts():
    """Read hosts.json and check it. Stops the build with a plain message if an address is missing or malformed.
    The trailing slash is tidied (the app adds its own after the proxies, and expects one after the music address)."""
    try:
        with open(HOSTS_FILE, encoding="utf-8") as f:
            d = json.load(f)
    except FileNotFoundError:
        sys.exit("BUILD STOPPED: hosts.json is missing (it holds the web addresses the app uses)")
    except ValueError as e:
        sys.exit("BUILD STOPPED: hosts.json is not valid JSON (%s)" % e)
    out = {}
    for key, (_ph, may_be_empty, slash) in HOST_SLOTS.items():
        v = d.get(key)
        if not isinstance(v, str):
            sys.exit('BUILD STOPPED: hosts.json needs a "%s" address (text in quotes)' % key)
        v = v.strip()
        if v == "" and may_be_empty:
            out[key] = ""          # empty = that feature is off, as the app already allows
            continue
        if not re.fullmatch(r"https://[A-Za-z0-9.-]+(:[0-9]+)?(/[A-Za-z0-9._~/-]*)?", v):
            sys.exit('BUILD STOPPED: hosts.json "%s" must be an https:// address (letters, digits, dots and dashes only), got: %s' % (key, v))
        out[key] = v.rstrip("/") + ("/" if slash else "")
    return out

def host_origin(url):
    p = urllib.parse.urlsplit(url)
    return p.scheme + "://" + p.netloc

def apply_hosts(data, hosts):
    """Fill the addresses from hosts.json into the page."""
    for key, (ph, _e, _s) in HOST_SLOTS.items():
        data = data.replace(ph, hosts[key].encode("utf-8"))
    return data

def csp_covers(sources, origin):
    """True when one of the CSP sources already allows this origin (exact match, https:, or a *.domain wildcard)."""
    p = urllib.parse.urlsplit(origin)
    for s in sources:
        if s in ("https:", "*", origin):
            return True
        if not p.port and s.startswith("https://*.") and p.hostname.endswith("." + s[len("https://*."):]):
            return True
    return False

def apply_hosts_headers(text, hosts):
    """dist/_headers: the proxy's address goes into script-src (the app loads a script from it), and every configured address
    is made sure to be allowed in connect-src. With today's addresses the wildcards there already cover them, so nothing is added;
    after a move to a new domain the new address is added for you."""
    text = text.replace("__WT_HOST_PROXY__", host_origin(hosts["proxy"]))
    origins = [host_origin(hosts[k]) for k in ("proxy", "hf_proxy", "stats", "music") if hosts[k]]
    lines = text.split("\n")
    for i, line in enumerate(lines):
        if not line.lstrip().startswith("Content-Security-Policy-Report-Only:"):
            continue
        m = re.search(r"connect-src([^;]*)", line)
        if not m:
            continue
        have = m.group(1).split()
        missing = []
        for o in origins:
            if not csp_covers(have + missing, o):
                missing.append(o)
        if missing:
            lines[i] = line[:m.end()].rstrip() + " " + " ".join(missing) + line[m.end():]
    return "\n".join(lines)

def check_no_placeholders(dist):
    """Stop the build if a __WT_HOST_ placeholder was left unfilled anywhere in the output."""
    for root, _dirs, files in os.walk(dist):
        for n in files:
            if n.endswith((".html", ".json", ".js")) or n == "_headers":
                with open(os.path.join(root, n), "rb") as f:
                    if b"__WT_HOST_" in f.read():
                        sys.exit("BUILD STOPPED: %s still contains a __WT_HOST_ placeholder (add it to HOST_SLOTS in build.py)" % os.path.join(root, n))

def check_names():
    """Stop the build if two files declare the same top-level name (see tools/deps.py)."""
    sys.path.insert(0, os.path.join(ROOT, "tools"))
    import deps
    _files, _code, decls, _lines = deps.scan()
    dups = deps.find_duplicates(decls)
    if dups:
        print("BUILD STOPPED: these names are declared more than once in the closure:")
        for n, v in sorted(dups.items()):
            print("  %s: %s" % (n, ", ".join("%s:%d" % x for x in v)))
        sys.exit(1)

if __name__ == "__main__":
    check_names()
    dev = "--dev" in sys.argv
    data = build(include_dev=dev)
    data = apply_fonts(data)
    hosts = load_hosts()
    data = apply_hosts(data, hosts)
    if "--no-min" not in sys.argv and not dev:
        sys.path.insert(0, os.path.join(ROOT, "tools"))
        import minify
        data = minify.minify_html(data)
    import datetime
    stamp = datetime.date.today().isoformat() + '-' + hashlib.sha256(data).hexdigest()[:6]   # e.g. 2026-10-25-a1b2c3
    data = data.replace(b'__WT_BUILD__', stamp.encode())
    dist = os.path.join(ROOT, "dist")
    os.makedirs(dist, exist_ok=True)
    with open(os.path.join(dist, "index.html"), "wb") as f:
        f.write(data)
    for code, blob in LAZY.items():
        with open(os.path.join(dist, "i18n-%s.json" % code), "wb") as f:
            f.write(blob)
    # install/offline files (manifest, service worker, icons) go next to index.html, as they are
    pwa = os.path.join(ROOT, "src", "pwa")
    shutil.copytree(pwa, dist, dirs_exist_ok=True)
    hp = os.path.join(dist, "_headers")
    if os.path.exists(hp):
        with open(hp, "r", encoding="utf-8", newline="") as f:
            ht = f.read()
        with open(hp, "w", encoding="utf-8", newline="") as f:
            f.write(apply_hosts_headers(ht, hosts))
    check_no_placeholders(dist)
    print("hosts:  " + "  ".join("%s=%s" % (k, hosts[k] or "(off)") for k in ("proxy", "hf_proxy", "stats", "music")))
    # self-hosted fonts (only when tools/fetch_fonts.py has been run); a stale dist/fonts from an older build is replaced
    fonts_out = os.path.join(dist, "fonts")
    shutil.rmtree(fonts_out, ignore_errors=True)
    if os.path.exists(os.path.join(FONTS_DIR, "fonts.css")):
        os.makedirs(fonts_out)
        for n in os.listdir(FONTS_DIR):
            if n.endswith(".woff2"):
                shutil.copy2(os.path.join(FONTS_DIR, n), os.path.join(fonts_out, n))
    print("dist/index.html  %d bytes  sha256 %s  (%s)" % (len(data), hashlib.sha256(data).hexdigest()[:16], "developer build" if dev else "public build"))
    if "--verify" in sys.argv:
        other = open(sys.argv[sys.argv.index("--verify") + 1], "rb").read()
        print("IDENTICAL to the original" if other == data else "DIFFERENT from the original")
        sys.exit(0 if other == data else 1)
