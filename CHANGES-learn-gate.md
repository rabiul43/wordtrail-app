# Standard | Learn gate: learning features hidden completely in Standard mode

One switch, **Settings > Reading > Learning > Learn mode** (it already existed, off by default). Off = **Standard**. On = **Learn**. Nothing new is stored: it is the `P.goal` setting from CHANGES-goal.md.

## What changes for the person
**Hidden in Standard** (by CSS, so it is gone at once, also while the player is open): Learn tab, the gold Learn button and the Learn item in the player menu, the Words tile in Controls, "Save word" in the word card, "Save phrase", the "N% known" chip and its card, the book preview ("Will this book be too hard?"), "Your learning progress" in Account > Your activity, and the learning rows in Settings (IELTS, Show the Learn button, Underline new words).
**Switched off in code** (no work in the background): Underline new words, the morning review card on Home, the progress block, the preview request.
**Also hidden in Standard**: old words and idioms (the purple and blue lines, the Old use card and its Save phrase button; the Settings row moved into Learning tools), the English / Both / Translation bar and the eye bubbles after every sentence. Standard always shows the original text; a saved Both or Translation choice (`P.rmode`) comes back when Learn mode is on.
**Stays in Standard** (as asked): tap-a-word card and dictionary, press-and-hold translate, Live translate. The word card in Standard has no Save button.
**Learn mode on**: everything above is back. Saved words, the review schedule, progress, exam date and target are never deleted.
**Existing users with saved words** (and no goal chosen) see one toast after 3 s: "Learning tools are now optional. Turn on Learn mode to bring them back [Turn on]" (`P.learnNote`, shown once). Users with no saved words get nothing.

## Settings design
The Learn mode switch is now the first thing in Settings > Reading, as a card (`99e4-learn-mode-card.css`, markup in `30-sheets-settings.html`): a big switch with an icon, a one-line state, a short note, and chips for what each mode includes (the Learn-only chips are dashed in Standard and filled in Learn mode). Below it, a "Learning tools" card with IELTS, Show the Learn button, Highlight old words and idioms and Underline new words; it appears only in Learn mode. Colours come from the theme variables, so every theme follows. The text swaps with `<html data-learn>`; no extra JavaScript.

## How it works (for the next feature)
1. Mark any learning-only element with `data-lrn` (HTML, or `h(..., { 'data-lrn': true })`). `99e3-learn-gate.css` hides it unless `<html data-learn>` is set. `GL.paint()` (169l) sets that attribute.
2. Anything that does work (timers, highlights, requests) asks `learnOn()` (030, safe to call at start-up) first.
3. When Learn mode is switched, `GL.paint()` also calls `KU.sync()` (161e), `OW.sync()` (161d), `rmSync()` (161b) and `loadTod()` (120), and closes translations opened with the bubbles.

## Files
- New: `src/css/99e3-learn-gate.css`, `src/css/99e4-learn-mode-card.css`, `tools/learn_gate_check.js`, this file
- Changed: `src/js/030` (`learnOn`), `120` (morning card), `131b` (preview), `161b` (`rmSync`), `161c`, `161d` (`enabled`, `sync`), `161e` (`on`, `sync`), `163`, `169e`, `169f`, `169l` (gate, `legacyNote`, notes), `src/html/10-body-views.html`, `29-old-words-card.html`, `29b-known-card.html`, `30-sheets-settings.html` (marks; Underline new words moved into the Learning group `#gl-tools`), `build.py`, `DEPENDENCIES.md`, `MODULES.md` (made by `tools/deps.py`)
- To go back: remove `99e3-learn-gate.css` and its `build.py` line (then everything shows again; also `99e4-learn-mode-card.css` for the plain Settings rows), and the `data-lrn` marks if you want them gone.

## Not done
- Closing an open learning sheet when Learn is switched off: the switch is inside Settings, so none is normally open. Not added.
- Weekly report and chapter recap still mention words; they are listening summaries and were left alone.
- New English words (the toast, the Settings text) are not in `src/i18n/*.json` yet (`python tools/i18n_check.py bn`).
- `python tools/tangle_check.py` still fails as before this change (stale baseline); not accepted.

## Tests
`python build.py --no-min`, then `node tools/learn_gate_check.js` (real Chromium on the built page: Standard hides every marked element including the reading-mode bar and the bubbles, a saved Both mode is shown as English only and comes back in Learn mode, the real switch turns Learn on and off live, the choice is saved, no page errors), `node tools/startup_check.js`, `node tools/goal_check.js` (17 passed), `python tools/deps.py`. Not tested by hand: a real book in the player (Learn button, word card, underline) on a phone.
