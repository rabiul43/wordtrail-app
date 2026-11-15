# Opening style (Settings > Reading > Opening style)

Choose the screen shown while a book opens. Seven choices, switched instantly (CSS only), saved as `P.openStyle` (synced and backed up with the other settings).

| Value | What the person sees |
|---|---|
| `classic` | The page as before (progress ring on Play, skeleton lines). Kept for people who already use the app. |
| `spotlight` | Cover under a gold light, with a reflection; a gold line traces round the cover as progress. |
| `aurora` | Frosted glass card over a soft colour glow, gradient progress pill, "Getting your book ready". |
| `book` | The cover swings open on a golden light (opens wider as the text loads), three soft dots. |
| `ribbon` | Large cover; a gold bookmark ribbon grows longer as the text loads, "Marking your place...". |
| `bloom` | Cover with pulsing rings and a waveform that fills, "Tuning in". |
| `bar` | The player stays; Play becomes one wide bar that fills while the text opens. A press says "Starts when ready". |

Default: settings saved before this existed = `classic`; a fresh install = `aurora` (same rule as Player style, in `030` and the first-paint script in `00-head.html`).

## How it works
- For spotlight / aurora / book / ribbon / bloom ONE full-screen card (`#player > .op-screen`) covers the player while the book opens. It shows only the cover, title, author and a progress cue: no steps, no skeleton lines, no Play button, so there is nothing to double-tap. When the text is ready it fades out and the reader fades in (the existing `op-in`).
- Built by `ostBuild()` in `133-open-progress-saved-state.js` on first use. `ostShow(true)` is called by `startOpen` (not for the Home resume path), `ostShow(false)` by `endOpen`. `ostProg(n)` (called from `opPaintBtn`) sets `--op` (0-100). Book, title and author come from `openingIdentity` (140, `ostSet`) or `S.book`.
- The Back arrow on the card clicks the normal Back button.
- `bar` is CSS only (`html[data-open-style="bar"] .player.opening #b-play`). `togglePlay` (160) now also calls `opQueued()`, so a press during opening gets a visible `queued` state on the play buttons (used by `bar`; harmless for the others).
- Accent: uses the app accent (`--accent`), gold if none. The card is always dark, whatever the theme.
- Reduced motion, Calm mode and lite mode turn the movement off.

## Files
New: `src/css/99l2-opening-styles.css`, `CHANGES-opening-style.md`.
Changed: `build.py` (1 line after `99l-opening.css`), `src/html/00-head.html` (first paint), `src/html/30-sheets-settings.html` (Opening style cards), `src/js/030` (default), `090` (`OST_ALL`, `OST_NAME`, `ostStyleOf`, `applyOpenStyle`, `ostSegSync`), `133` (screen + hooks), `140` (`ostSet` in `openingIdentity`), `160` (`opQueued`), `290` (`fillSettings`), `300` (Settings wiring).
Names start with `ost`/`OST` because `os*`/`OS` belong to the opening sound (`sound/opening-sound.js`).

## Checks done
`python build.py --no-min`, `node tools/startup_check.js`, `node tools/unit_check.js` (76 pass). The five full-screen looks were drawn in headless Chromium with the real CSS and a stand-in cover. NOT checked: a real book opening on a device, the wide play bar, iOS `backdrop-filter`, RTL (ar, ur), the 8 non-Bengali languages.

## New English texts (not translated yet)
Opening style, Choose the screen you see while a book opens. You can switch any time., Classic, The plain opening card, Spotlight, Cover under a gold light, Aurora glass, Frosted card, soft glow, Book opens, A cover swings open, Ribbon, A bookmark grows, Sound bloom, Rings and a waveform, Wide play bar, Play fills as it opens, Getting your book ready, Tuning in, Opening..., Marking your place..., Play now, Starts when ready, Opening style: <name>.

## Apply
Copy `src/` and `build.py` over your project, run `python build.py`. To remove: delete `99l2-opening-styles.css` and its build line, the Settings block, and the `ost*` code in 133 (it is one block).
