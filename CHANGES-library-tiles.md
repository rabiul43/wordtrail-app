# New Library layout (phones, Settings switch)

Settings > "New Library layout" (default on, saved as P.libTiles). Under 700 px only; tablets and computers are unchanged.
- On: My Library shows a hero card (the most recent Continue-listening book that has read-along; play button; waveform from its progress; "Read-along ready" / "NN% listened") and a 2x2 grid of tiles (Saved, Downloads with a storage bar, Following with author initials, Rated with 4 stars). Following and Rated show under the same rules as the old rows. An odd tile out spans both columns.
- No synced book: a calmer card "Sync a book to read along" with an Explore button.
- Off: the old list, byte-identical to before.
- <html data-lib="tiles"> is set by the first-paint script (00-head.html) and applyLib (090), like applyHome.

## Files touched
- NEW src/css/99o-library-tiles.css (all rules under html[data-lib="tiles"]); build.py (1 line after 99n)
- src/js/282-library-hub.js: one branch at the top of libHubDraw + new libTilesDraw code at the end (old list code untouched)
- src/js/090 (applyLib), 290 (load switch), 300 (init, switch, breakpoint listener)
- src/js/133: resumeRecent(r, opts) passes opts to openBook (play button uses {play:true})
- src/html/00-head.html (first paint), src/html/30-sheets-settings.html (switch row)
- tools/tangle_baseline.json (+2 couplings: 282->090, 282->133), DEPENDENCIES.md, MODULES.md (regenerated)

## How to undo
Remove src/css/99o-library-tiles.css and its build.py line, and restore the previous 282, 090, 133, 290, 300, 00-head.html and 30-sheets-settings.html (and the baseline/doc files).
Quick off-switch without undoing: turn the setting off.

## Checked
360/390 px, dark + white, with/without synced book, signed in/out: no overflow, targets >= 44 px, no errors. Switch off = original markup.
Not run: the Playwright tests (no tests/ folder in the zip).
