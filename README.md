# Wordtrail

HEllo textcf

One app, many small files. `build.py` joins them into a single `dist/index.html`.

## Build

    python build.py          # the public app (this is what GitHub publishes)
    python build.py --dev    # for your own computer: also includes the Developer scene-test sample cases
    python build.py --dev --verify path/to/old-index.html   # checks the result is the same file as an older all-in-one build

## Folder

    build.py                  joins everything (the ORDER of the pieces is listed here)
    MODULES.md                what is inside each file (read this first)
    src/html/                 page structure and pop-up sheets
    src/css/                  styles, in cascade order (do not reorder)
    src/js/                   the app, one slice per feature
    src/data/                 data the app needs inside the page (amb-map.json)
    src/i18n/                 one JSON file per app language (ar.json, bn.json ...), joined into the page by build.py
    tools/                    helper scripts (i18n_check.py lists missing words in a language; deps.py checks names and writes DEPENDENCIES.md)
    src/dev/                  Developer scene tests only (left out of the public build, included by --dev)
    src/pwa/                  Install + offline files copied next to index.html: manifest.json, sw.js (service worker), icons/
    firebase/                 firestore.rules (paste into the Firebase console) and rules.test.js; not part of the app
    tests/                    Playwright browser tests + the Firestore rules test runner, with their own package.json (the app has no dependencies). See tests/README.md
    .github/workflows/        builds and publishes on every push

## Working with Claude (saves usage)

1. Tell Claude which feature to change, and upload ONLY that file from `src/js/` (or `src/css/`) plus `MODULES.md`.
   Example: "change the Characters screen" -> upload `250-characters.js` + `MODULES.md`.
2. Claude sends back the changed file(s). Put them in the same folder, run `python build.py`, test `dist/index.html`.
3. Commit and push. GitHub builds and publishes the app.

If a change needs a name from another file, say so or upload that file too. Shared names are listed in `MODULES.md`.

## Rules that keep it safe

- All of `src/js/020` ... `src/js/999` are slices of ONE function. They share names; do not add `import` / `export`.
- A new file needs one new line in `build.py`, at the right place.
- After you change anything in `src/js/`, run `python tools/deps.py`. It refreshes `DEPENDENCIES.md` (who uses which shared name) and the line counts in `MODULES.md`. `python build.py` stops if two files declare the same name, and CI runs `python tools/deps.py --check`.
- To see who uses a name before you change it: `python tools/deps.py --who toast`.
- CSS order matters: later rules win.

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
background and a "New version ready - Reload" message appears when it differs; only the very first visit waits for the network) and it keeps the Google Fonts files.
Audio, books, sign-in and sync are not touched by it. To change the icons, replace the PNGs in `src/pwa/icons/`.
When you change `sw.js` itself, the browser installs the new one on the next visit by itself. If you ever need every
device to drop its saved page, change `SHELL = 'wt-shell-v1'` to `v2` in `sw.js`.
