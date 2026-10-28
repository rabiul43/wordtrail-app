# Wordtrail

One app, many small files. `build.py` joins them into a single `dist/index.html`.

## Build

    python build.py          # the public app (this is what GitHub publishes)
    python build.py --dev    # for your own computer: also includes the Developer scene-test sample cases
    python build.py --dev --verify path/to/old-index.html   # checks the result is the same file as an older all-in-one build

## Folder

    build.py                  joins everything (the ORDER of the pieces is listed here)
    hosts.json                the web addresses the app depends on (the Workers, the music site). Change one here and run build.py: the app and dist/_headers both follow
    MODULES.md                what is inside each file (read this first)
    src/html/                 page structure and pop-up sheets
    src/css/                  styles, in cascade order (do not reorder)
    src/js/                   the app, one slice per feature
    src/js/sound/             all sound code, one feature per file: music-*, ambient-*, opening-*, story-*, sound-* (see MODULES.md)
    src/data/                 data the app needs inside the page (amb-map.json)
    src/i18n/                 one JSON file per app language (ar.json, bn.json ...), joined into the page by build.py
    MUSIC-GUIDE.md            how to add or change music (steps to follow when you forget)
    tools/                    helper scripts (fetch_fonts.py downloads the fonts once; i18n_check.py lists missing words in a language; deps.py checks names and writes DEPENDENCIES.md; unit_check.js tests the inner calculations; tangle_check.py stops the files getting more tangled; startup_check.js checks the built page still starts)
    src/dev/                  Developer scene tests only (left out of the public build, included by --dev)
    src/fonts/                self-hosted fonts (WOFF2 + fonts.css), made by `python tools/fetch_fonts.py`; not in the project until you run it
    src/pwa/                  Install + offline files copied next to index.html: manifest.json, sw.js (service worker), icons/
    firebase/                 firestore.rules (paste into the Firebase console) and rules.test.js; not part of the app
    tests/                    Playwright browser tests + the Firestore rules test runner, with their own package.json (the app has no dependencies). See tests/README.md
    .github/workflows/        builds and publishes on every push

## Working with Claude (saves usage)

1. Tell Claude which feature to change, and upload ONLY that file from `src/js/` (or `src/css/`) plus `MODULES.md`.
   Example: "change the Characters screen" -> upload `250-characters.js` + `MODULES.md`.
   Sound examples: new story trigger word -> `sound/story-rules.js`; new music mood word -> `sound/music-moods.js`; Sound screen -> `sound/sound-screen.js`.
2. Claude sends back the changed file(s). Put them in the same folder, run `python build.py`, test `dist/index.html`.
3. Commit and push. GitHub builds and publishes the app.

If a change needs a name from another file, say so or upload that file too. Shared names are listed in `MODULES.md`.

## Moving to a new web address

Edit `hosts.json` only, then run `python build.py`. The build checks every address (it must be https://, and `proxy` and `music` cannot be empty; `hf_proxy`, `stats` and `scene` (the free AI Worker) may be left empty to switch that feature off), puts them into the app, and makes sure `dist/_headers` allows them. It stops with a plain message if one is wrong or if a `__WT_HOST_...` placeholder is left unfilled. Do not type an address into `src/js/` again: those files hold placeholders.

## Rules that keep it safe

- All of `src/js/020` ... `src/js/999` are slices of ONE function. They share names; do not add `import` / `export`.
- A new file needs one new line in `build.py`, at the right place (a file may sit in a subfolder such as `src/js/sound/`; `tools/deps.py` reads the paths from `build.py`).
- After you change anything in `src/js/`, run `python tools/deps.py`. It refreshes `DEPENDENCIES.md` (who uses which shared name) and the line counts in `MODULES.md`. `python build.py` stops if two files declare the same name, and CI runs `python tools/deps.py --check`.
- To see who uses a name before you change it: `python tools/deps.py --who toast`.
- CSS order matters: later rules win.
- Before you push, run `python tools/tangle_check.py`. It fails when a change makes one file depend on another in a NEW way (it names the shared names), or when a file in `src/js/` is not used by `build.py`. If the new dependency is really what you want, run `python tools/tangle_check.py --accept` and commit `tools/tangle_baseline.json`: the diff shows the reviewer exactly what you coupled. Plan for reducing the tangle: `UNTANGLING.md`.
- After moving files or changing their order in `build.py`: `python build.py --no-min` then `node tools/startup_check.js`. It starts the page's code in Node and fails if a name is used before its file has loaded, or no longer exists.

## Checking reports (reviews)
Reports are kept in Firestore at `ratings/{bookId}/votes/{reviewerUid}/reports/{reporterUid}` (`k` = spam, offensive, spoiler or other). The app cannot read them; you do, in the Firebase console > Firestore Database.
- A review with 3 or more reports (its field `x`) is hidden from everyone except its writer. To find them, filter `votes` (collection group) by `x >= 3`, or open a book's `votes`.
- To remove a review: open its vote document and set `c` to an empty string (its stars still count, so the average stays right). Do NOT delete the vote document by hand: that would leave the totals wrong.
- To put a review back: set `x` to 0 and delete its documents under `reports`.
- Editing a review resets `x` (the writer's new text starts fresh).

## Install and offline

The build puts `manifest.json`, `sw.js` and `icons/` next to `index.html`, so the app can be installed (Android/desktop
Chrome and Edge: the install button in the address bar; iPhone/iPad: Share > Add to Home Screen) and opens without a
connection. `sw.js` only does two things: it keeps the app page (opened from the saved copy at once for a fast start; the newest page is fetched in the
background and a "New version ready - Reload" message appears when it differs; only the very first visit waits for the network) and it keeps the font files (our own `fonts/*.woff2`, or Google's while the fonts are not self-hosted yet).
Audio, books, sign-in and sync are not touched by it. To change the icons, replace the PNGs in `src/pwa/icons/`.
When you change `sw.js` itself, the browser installs the new one on the next visit by itself. If you ever need every
device to drop its saved page, change `SHELL = 'wt-shell-v1'` to `v2` in `sw.js`.

## Fonts (self-hosted)

By default the page still loads its fonts from Google. To serve them yourself (one fewer connection before the first paint, and no third party):

    python tools/fetch_fonts.py     # once, with internet: fills src/fonts/
    python build.py

`build.py` then puts the `@font-face` rules into the page, preloads the two first-screen files (Inter, Fraunces), drops the Google `<link>`s and copies the files to `dist/fonts/`.
Commit `src/fonts/` so the GitHub build has it. `src/pwa/_headers` gives `/fonts/*` a one-year cache (the file names carry a hash, so they never change).
Change families or weights in `FAMILIES` at the top of `tools/fetch_fonts.py` and run it again. Lexend, Atkinson and OpenDyslexic (picked in Settings > Reading) are still loaded from their CDNs on demand.
