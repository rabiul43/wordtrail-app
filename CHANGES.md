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
