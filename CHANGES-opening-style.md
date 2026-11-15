# Opening style (Settings > Reading > Opening style)

Choose the screen shown while a book opens. Three choices, switched instantly (CSS only), saved as `P.openStyle` (synced and backed up with the other settings).

| Value | What the person sees |
|---|---|
| `classic` | The page as before (progress ring on Play, skeleton lines). Kept for people who already use the app. |
| `spotlight` | Cover under a gold light, with a reflection; a gold line traces round the cover as progress. |
| `bloom` | Cover with pulsing rings and a waveform that fills, "Tuning in". |

Default: settings saved before this existed = `classic`; a fresh install = `spotlight` (same rule as Player style, in `030` and the first-paint script in `00-head.html`).

## How it works
- For spotlight / bloom ONE full-screen card (`#player > .op-screen`) covers the player while the book opens. It shows only the cover, title, author and a progress cue: no steps, no skeleton lines, no Play button, so there is nothing to double-tap. When the text is ready it fades out and the reader fades in (the existing `op-in`).
- Built by `ostBuild()` in `133-open-progress-saved-state.js` on first use. `ostShow(true)` is called by `startOpen` (not for the Home resume path), `ostShow(false)` by `endOpen`. `ostProg(n)` (called from `opPaintBtn`) sets `--op` (0-100). Book, title and author come from `openingIdentity` (140, `ostSet`) or `S.book`.
- The Back arrow on the card clicks the normal Back button.
- Colour: the card takes the book's own cover colour (`coverColor` in 100, set as `--acc` / `--acc-bg` in `ostSync`); app accent, then gold, until the cover is read. The card is always dark, whatever the theme.
- Remembering: the choice is saved in `wt:prefs` (`P.openStyle`) and also under its own device key `wt:openstyle`, which wins on start, so a sync or restore of older settings can't undo it.
- Reduced motion, Calm mode and lite mode turn the movement off.

## Files
New: `src/css/99l2-opening-styles.css`, `CHANGES-opening-style.md`.
Changed: `build.py` (1 line after `99l-opening.css`), `src/html/00-head.html` (first paint), `src/html/30-sheets-settings.html` (Opening style cards), `src/js/030` (default), `090` (`OST_ALL`, `OST_NAME`, `ostStyleOf`, `applyOpenStyle`, `ostSegSync`), `133` (screen + hooks), `140` (`ostSet` in `openingIdentity`), `160` (`opQueued`), `290` (`fillSettings`), `300` (Settings wiring).
Names start with `ost`/`OST` because `os*`/`OS` belong to the opening sound (`sound/opening-sound.js`).

## Checks done
`python build.py --no-min`, `node tools/startup_check.js`, `node tools/unit_check.js` (76 pass). The full-screen looks were drawn in headless Chromium with the real CSS and a stand-in cover. NOT checked: a real book opening on a device, the wide play bar, iOS `backdrop-filter`, RTL (ar, ur), the 8 non-Bengali languages.

## Removed
Aurora glass, Book opens, Ribbon and Wide play bar were removed (Settings cards, CSS, and the pieces built in 133). A saved `aurora` / `book` / `ribbon` / `bar` value is not in the list any more, so it falls back to `classic`. `opQueued()` in 160 is kept; it is harmless.

## Apply
Copy `src/` and `build.py` over your project, run `python build.py`. To remove: delete `99l2-opening-styles.css` and its build line, the Settings block, and the `ost*` code in 133 (it is one block).
