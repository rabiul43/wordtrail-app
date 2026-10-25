# Changes in this version

## 1. Finished screen layout (cards running off the right edge)
- src/css/97-controls-sheet.css  -> block "Finish card: grid tracks must not grow..."

## 2. Player menu: Speed and Sleep timer expand inline
- src/html/30-sheets-settings.html -> #dm-x-speed, #dm-x-sleep under their rows in #dm-sub
- src/js/247-player-menu.js        -> XS, xPaint, xToggle (uses setSpeed / setSleep)
- src/css/97-controls-sheet.css    -> block "Player menu: Speed and Sleep timer expand in place"

## 3. "All controls" replaced by "More tools" (compact list, name + one line, no tabs/search)
- src/html/30-sheets-settings.html -> row data-go="tools" in #dm-sub; new <section id="sheet-tools">
- src/js/247-player-menu.js        -> TOOLS list, toolsOpen(), GO.tools
- src/css/97-controls-sheet.css    -> block "More tools: compact list sheet"

## 4. Live translation strip auto-sizes to the sentence
- src/css/95-live-translate.css    -> .livetr:not(.side) height:auto + max-height, --lt-h margin, fade
- src/js/161-live-translate.js     -> ltFit(), ResizeObserver, scroll listener

Build: `python3 build.py` -> dist/index.html

## 5. App updates itself
- src/pwa/sw.js -> network first (3 s), saved page only as fallback
- src/js/298-pwa.js -> "New version ready · Reload" bar, version label, "Update now"
- src/html/30-sheets-settings.html -> #wt-ver / #wt-upd at the bottom of Settings home
- src/css/97-controls-sheet.css -> .upd-bar, .wt-ver
- build.py -> stamps the build id (date + hash) into the page

## 6. Minified build
- tools/minify.py (new) -> runs esbuild over the inline <script>/<style> blocks (JSON data blocks untouched)
- build.py              -> calls it for the public build; `--no-min` gives the readable page, `--dev` is never minified
- Needs esbuild once: `npm install -g esbuild` (if missing the build still works, unminified, with a warning)

## 7. Bengali words load on demand
- build.py                      -> a language file over 20 KB (bn.json) is written to dist/i18n-bn.json; the page keeps only a small stub
- src/js/200-player-controls.js -> i18nAdd(), i18nLoad(); i18nApply() fetches the words the first time the language is used
- src/pwa/sw.js                 -> keeps i18n-*.json for offline use
- DEPLOY: upload dist/i18n-bn.json next to index.html (without it Bengali stays English)

## 8. Self-hosted fonts (ready, switched on by one command)
- tools/fetch_fonts.py (new)     -> downloads the WOFF2 files + fonts.css into src/fonts/ (run once, needs internet)
- build.py                      -> apply_fonts(): if src/fonts/fonts.css exists, inlines the rules, preloads Inter/Fraunces/Newsreader (latin), removes the Google links, copies dist/fonts/. Without src/fonts/ the output is byte-identical to before.
- src/html/00-head.html         -> the Google Fonts preconnects and stylesheet links are wrapped in WT-FONTS markers so build.py can swap them
- src/pwa/sw.js                 -> ownFont(): fonts/*.woff2 are cache-first
- src/pwa/_headers (new)        -> /fonts/* cached for a year (Cloudflare assets)
- src/js/200-player-controls.js -> i18nFont() skips the Google request when the page has class fonts-local
- DEPLOY: commit src/fonts/ after running the fetch tool, then build as usual


## 9. Long lists are virtualized
- src/js/031-virtual-list.js (new) -> vlist(): only rows near the screen are in the page
- src/js/120-search-recommendations.js -> search results use vlist (40+ results)
- src/js/080-ui-shell-favourites.js -> My books shelf uses vlist (40+ books)
- src/js/090-synced-stats-book-search.js -> Synced list uses vlist (60+ books)
- build.py -> one new line for 031
- The reader text is not changed: it already draws one track at a time with content-visibility

## 10. Cover images
- Already in place: loading=lazy, CSS-sized cover boxes with a colour placeholder and a fade-in (100-home-covers.js, 20/40 css)
- src/js/100-home-covers.js -> cover img gets width/height (2:3)
- src/js/090-synced-stats-book-search.js -> Synced row cover gets width/height, decoding async, no-referrer

## 11. Heavy work in the background worker
- src/js/010-core.js -> Core gets the in-book search (fdNorm, fdParse, fdMatch, fdLoad, fdKeep, fdFind); the worker already runs Core
- src/js/140-open-book.js, 290-backup-maintenance.js -> the text is parsed with BG.call('parseBook') (falls back to the main thread)
- src/js/090-synced-stats-book-search.js -> search index is built and searched in the worker (if the worker was restarted, the books are sent again once)
- src/js/234-scene-prescore.js (new) + 233 (one call) + 300 (SCP.reset on the worker switch) -> scene scores are made in a second worker
- build.py -> new part kind 'copy' and the #scene-worker-src block; tools/minify.py minifies that block too
- Same Settings switch as before (background work): off = everything runs as it did

- src/pwa/sw.js                 -> catalog.json (network first, saved copy as fallback) and book covers (cache first, max 600, CORS answers only) are kept for offline
- src/js/070-network-data.js    -> a catalogue served from the saved copy (header x-wt-stale) is not stamped as freshly downloaded
