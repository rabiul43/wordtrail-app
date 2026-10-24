#!/usr/bin/env python3
"""Wordtrail build: joins the pieces in src/ into ONE file, dist/index.html,
and copies src/pwa/ (manifest, service worker, icons) next to it.

    python build.py               public app: no developer test data (this is what the website serves)
    python build.py --dev         developer build: also includes the scene-test sample cases and baseline
                                  (Settings > Developer > Scene tests), for use on your own computer
    python build.py --verify X    also check the result is byte-for-byte equal to file X
                                  (the original single-file app included the developer data, so use --dev --verify X)

The order below is the order of the final file. It matters: CSS is a layered cascade
and the script is one closure, so a piece may only use names declared above it.
To add a piece: create the file in src/ and add one line here, at the right place.
"""
import hashlib, json, os, shutil, sys

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
    ('file', 'src/js/sound/sound-presets.js'),
    ('file', 'src/js/sound/sound-core.js'),
    ('file', 'src/js/sound/sound-cache.js'),
    ('file', 'src/js/sound/sound-screen.js'),
    ('file', 'src/js/sound/sound-tabs.js'),
    ('file', 'src/js/246-controls-search.js'),
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
DEV_PARTS = {"src/dev/scene-tests.txt", "src/dev/scene-baseline.html"}

def build(include_dev=False):
    out = []
    for kind, value in PARTS:
        if kind == "devlit":
            if include_dev:
                out.append(value.encode("utf-8"))
        elif kind == "lit":
            out.append(value.encode("utf-8"))
        elif kind == "i18n":
            # one JSON file per language in src/i18n/ -> one JSON object {code: {...}} (the code is the file name)
            langs = {}
            for name in sorted(os.listdir(os.path.join(ROOT, value))):
                if name.endswith(".json"):
                    with open(os.path.join(ROOT, value, name), "r", encoding="utf-8") as f:
                        langs[name[:-5]] = json.load(f)
            out.append(json.dumps(langs, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/").encode("utf-8"))
        else:
            if value in DEV_PARTS and not include_dev:
                continue
            with open(os.path.join(ROOT, value), "rb") as f:
                out.append(f.read())
    return b"".join(out)

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
    dist = os.path.join(ROOT, "dist")
    os.makedirs(dist, exist_ok=True)
    with open(os.path.join(dist, "index.html"), "wb") as f:
        f.write(data)
    # install/offline files (manifest, service worker, icons) go next to index.html, as they are
    pwa = os.path.join(ROOT, "src", "pwa")
    shutil.copytree(pwa, dist, dirs_exist_ok=True)
    print("dist/index.html  %d bytes  sha256 %s  (%s)" % (len(data), hashlib.sha256(data).hexdigest()[:16], "developer build" if dev else "public build"))
    if "--verify" in sys.argv:
        other = open(sys.argv[sys.argv.index("--verify") + 1], "rb").read()
        print("IDENTICAL to the original" if other == data else "DIFFERENT from the original")
        sys.exit(0 if other == data else 1)
