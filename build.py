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
import hashlib, os, shutil, sys

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
    ('file', 'src/js/100-home-rows-filters.js'),
    ('file', 'src/js/110-collections.js'),
    ('file', 'src/js/120-search-recommendations.js'),
    ('file', 'src/js/130-book-detail.js'),
    ('file', 'src/js/135-ratings.js'),
    ('file', 'src/js/140-open-book.js'),
    ('file', 'src/js/150-player-reader.js'),
    ('file', 'src/js/160-learning-tools.js'),
    ('file', 'src/js/170-sync-points-drift.js'),
    ('file', 'src/js/180-sync-alignment.js'),
    ('file', 'src/js/190-sync-finish-retry.js'),
    ('file', 'src/js/200-player-controls.js'),
    ('file', 'src/js/210-sound-mixer.js'),
    ('file', 'src/js/220-story-sounds.js'),
    ('file', 'src/js/230-scene-detection.js'),
    ('file', 'src/js/240-sound-presets.js'),
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
        else:
            if value in DEV_PARTS and not include_dev:
                continue
            with open(os.path.join(ROOT, value), "rb") as f:
                out.append(f.read())
    return b"".join(out)

if __name__ == "__main__":
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
