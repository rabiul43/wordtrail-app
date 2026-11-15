# Learn screen, drawn from the mock-up

The Learn tab now looks like the mock-up: big "Learn" title with the account button, gold Today card (ring, "N of M min", Start practice), Review row with the due count, then four groups of rows (Your words, Reading, Speaking and writing, Listening) with coloured icon tiles and chevrons. On phones the Learn tab is a pill in the bottom bar and the shared header bar steps aside on this screen.

Only how the hub is drawn changed. Tiles, subtitles, badges and open() still come from `LearnHub`; a tile with a `show` rule (True / False / Not Given) is still hidden until it applies; a tile registered later that is in no group lands in a last group, "More". The IELTS head still draws between the Review row and the groups.

## Files
- New: `src/js/169w-learn-screen.js` (`LS.draw`, sets `LSW.render`), `src/css/99s-learn-screen.css` (all `.lsc-*`; classes are not `.ls-*` because `.ls-ring` already exists in 70-collections)
- Changed: `build.py` (two lines), `src/js/169b-learn-hub.js` (`LearnHub.headNodes()`), `tools/ielts_check.js` (selectors for the new markup)
- Exact colours are for the Black theme (the mock-up's look); other themes follow their own variables.
- To go back: remove the two build.py lines.

## Tests
`python build.py --no-min`, then `node tools/ielts_check.js`, `tfng_screen_check.js`, `goal_check.js`, `learn_gate_check.js`, `startup_check.js`: all pass.
