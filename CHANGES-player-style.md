# Player style: Clean | Glass (Playback + Sleep timer sheets)

Settings > Reading > **Player style** switches the look of `#sheet-speed` (Playback) and `#sheet-sleep` (Sleep timer).
Behaviour, IDs, aria attributes, presets, sleep values, "End of track", Advanced and the close button are unchanged. Redesign of markup and CSS only.

## The pref
- **`P.playerStyle`** = `'clean'` | `'glass'`. Part of `wt:prefs`, so it syncs and backs up with the other settings (sync and restore reload the page, so the first-paint script picks it up).
- Default: a **fresh install gets `glass`**; settings saved before this existed get **`clean`** (rule in `030`, same rule in the first-paint script). Rule used: "wt:prefs has any key" = existing user. Edge: someone who never saved a single setting counts as new.
- Applied as `<html data-player-style="clean|glass">` by `applyPlayerStyle()` (090, next to `applyHome`) and by a tiny script in `00-head.html` (no flash). Switching is CSS only, so it works instantly, even with a sheet open.

## Files
New: `src/css/99j-player-style-clean.css`, `src/css/99k-player-style-glass.css`, `CHANGES-player-style.md`.
Changed:
- `build.py` (2 lines after `99i`: 99j, 99k)
- `src/html/00-head.html` (first-paint script), `20-sheets-player.html` (eyebrow, dial SVG, caption, scale, moon scene, `ps-sheet` class), `30-sheets-settings.html` ("Player style" cards after "App design")
- `src/js/030` (default), `090` (`playerStyleOf`, `applyPlayerStyle`, `pstyleSegSync`), `260` (`spdCaption`, `spdDial`, Reset button, dial drag), `290` (`fillSettings` calls `pstyleSegSync`), `300` (sleep card markup `slFace`, Settings wiring)
- `src/i18n/*.json` (9 files), `MODULES.md`, `DEPENDENCIES.md` (regenerated)
- `src/pwa/sw.js`: **not changed**. The page is versioned by `version.json` (build hash), so the new page is picked up without bumping `SHELL`. Note `i18n-bn.json` is refreshed in the background: the first launch after the update may show the new strings in English, the next one in Bengali.

## How it works
- **One speed source.** `setSpeed()` (260) now ends with `spdDial()`, and `spdPaint()` (sheet open) calls it too. `spdDial()` redraws the number (`<output>` now holds number + `<span class="ps-x">x</span>`), the slider value and `--fill`, the dial and the caption from `P.speed`.
- **Dial math.** `f = (speed - 0.5) / 2.5`, `angle = 180 + 180 f`. The 300x170 SVG has a half circle of radius 120 around (150,150). The gradient arc is the full half circle drawn with `pathLength=100` and `stroke-dashoffset = 100 - 100 f`; the thumb group is turned by `angle - 180` around (150,150), so it travels on the arc and both can use one CSS transition (disabled under `prefers-reduced-motion` and Calm mode).
- **Glass dial is also draggable** (pointer events on the SVG call `setSpeed` + `spdPaint`). The real `<input type=range id=sp-range>` stays in the page, visually hidden in Glass, for keyboard and screen readers; focusing it lights the thumb halo.
- **Caption** from the speed: Taking it slow / Relaxed pace / Normal speed / Slightly faster / Crisp pace / Quick listen / Full speed ahead.
- **Reset** (new dashed chip in `#sp-presets`, `.ps-reset`): sets 1x like the 1x preset.
- **Sleep choices** are built by `slDraw` as number + unit (`.ps-n`, `.ps-u`) with the same click logic. Clean shows big number over small unit; Glass shows "10 min" in a pill. "End of track" is the `.ps-wide` card/row with a play icon.
- No duplicated IDs: the dial, scene and eyebrow use classes; their gradient ids are `ps-arc-g`, `ps-moon-g`, `ps-halo-g`.
- The quick-controls panel (`#qk-o-speed`, `#qk-o-sleep`) and the dock buttons are untouched and still call `setSpeed` / `setSleep`; they update the dial because the dial is driven from `setSpeed`.

## Themes, desktop, RTL
- Clean: Dark and Black use the spec palette (#121418 sheet, #8CC0DA accent). Light, White, Sepia, High contrast and Auto-light borrow the theme variables.
- Glass: dark glass for Dark / Black / High contrast; a light glass (white tint, dark text, softer orbs) for Light / White / Sepia / Auto-light.
- Desktop (>= 900px): the app centres sheets as dialogs (`98b`); both styles keep that (Clean rounds all four corners). Glass applies at every width (not phones only).
- RTL (ar, ur): Clean mirrors (slider, scale, - and +). Glass keeps the dial and its - / + row left-to-right (a gauge), the preset pills follow the page direction.

## Known gaps / decisions to review
- **Palette:** the spec's Clean palette (#121418 / #8CC0DA) differs from the app's current Midnight Library (#171B2E / gold, per-book accent). Existing users on Clean therefore see a refined, bluer sheet, not an identical one. To keep the app accent instead, in `99j` set `--ps-acc: var(--accent)`.
- Speed number is `min(84px, 21vw)` (Clean) and `min(76px, 21vw)` (Glass) so it fits 320-360px phones.
- Translations: Bengali is complete. The other 8 languages only have their own short dictionaries, so only 5 headline strings were added (Player style, Clean, Glass, Now reading, Good night) and they **need native review**; everything else falls back to English as the rest of that UI does.
- `python tools/tangle_check.py` reports 5 new dependencies that are **not from this change** (`isModern`, `tileCoverNode`, `acInfo`, `lfReadAlong`); this patch adds none, so `--accept` was not run and `tools/tangle_baseline.json` is untouched.
- Checked in headless Chromium (390x844 and 1280x800): Glass and Clean, Dark/Light/White/Black/Sepia, ar + bn, flows below on the built page. Not checked: real devices (iOS Safari `backdrop-filter`), Firefox, a real book playing, account sync.

## Apply
1. Copy the `src/` folder of this zip over your project's `src/` (same paths).
2. Replace `build.py` (it is yours + 2 lines after the `99i-explore-design.css` line:
   `('file', 'src/css/99j-player-style-clean.css'),` and `('file', 'src/css/99k-player-style-glass.css'),`).
3. Copy `MODULES.md`, `DEPENDENCIES.md`, `CHANGES-player-style.md` to the project root.
4. Run `python build.py`. Optional checks: `python build.py --no-min` then `node tools/startup_check.js` and `node tools/unit_check.js`.
To remove: delete 99j/99k and their build.py lines, the `.ps-*` markup in the two sheets, the Settings block (`.ps-pick-sec`) and the first-paint script.

## Manual test list
Run each in **Glass and Clean** unless noted.
1. **Speed:** open Playback from the dock; press + and - (0.05 steps, number, slider/dial and caption move together); drag the slider (Clean) and the dial (Glass); arrow keys on the focused slider; the 0.5x and 3x ends.
2. **Presets:** tap each of 0.75, 1, 1.25, 1.5, 2, 2.5, 3: the selected one is highlighted (filled / gradient + glow), the number, dial and the dock badge follow; audio rate changes.
3. **Reset:** tap Reset -> 1x, saved after reload. Also change speed from Quick controls (Speed tile) and the player menu, then open Playback: the dial/arc match.
4. **Advanced:** opens and closes; the 5 switches and the balance slider still work; chevron turns.
5. **Sleep:** each of 10 / 15 / 30 / 45 min, 1 hour, 1.5 hours: sheet closes, toast shows, reopen shows it selected and "Pauses in about N min."; **End of track** -> "Pauses at the end of this track."; **Off** -> "The book keeps playing."; the timer really pauses the book.
6. **Switch while open:** the Settings screen cannot be tapped while a sheet is open, so (a) open Settings, switch style, then open Playback and Sleep timer: both use the new style at once, no reload; (b) with Playback open, flip `data-player-style` on `<html>` in dev tools: the sheet restyles immediately.
7. **Persistence:** pick Clean, reload: still Clean and the Settings card shows it selected. Fresh profile (clear site data): Glass. Profile with old settings and no `playerStyle`: Clean. Sign in on a second device: the choice syncs.
8. **Themes:** Settings > Theme = Auto (dark and light OS), Light, White, Dark, Black, Sepia, High contrast: text readable, selected states obvious, backdrop orbs not harsh.
9. **Bengali (bn) and Arabic (ar, RTL):** units (মিনিট, ঘণ্টা), eyebrow, captions in bn; in ar the sheet mirrors (close button on the left), Clean slider/scale mirror, Glass dial stays left-to-right; no clipped text.
10. **Settings:** the two cards are 44px+ tall, reachable by Tab, toggled with Space/Enter, `aria-pressed` announced, check badge on the selected one, helper text visible.
11. **Layouts:** 320px wide phone (number does not overflow), landscape phone, tablet, desktop >= 900px (centred dialog).
12. **Motion:** with "Reduce motion" on (or Calm mode) the dial arc, thumb and pills change without animation.
