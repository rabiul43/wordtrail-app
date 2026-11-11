# Goal: choose how you use Wordtrail (Approach 4)

One saved choice shapes Home and the bottom bar. Underneath it is **two settings**, not three modes:

| Setting | Values |
|---|---|
| Learning | on / off |
| Exam | none, or IELTS with a date and a target band (needs learning on) |

The three-way choice the person sees is only a view of those two: **Enjoy stories** = learning off, **Learn English** = learning on, **Prepare for IELTS** = learning on + exam on.
Saved as `P.goal` in `wt:prefs`, so it syncs like every other setting. **No `P.goal` = the app is exactly as before.**

## What changes for the person
- **Onboarding**: a new first card "What brings you to Wordtrail?" (Enjoy stories preselected). "Skip for now" leaves the goal unset unless a card was tapped.
- **Bottom bar**: a Learn tab appears for learners, labelled **IELTS** while an exam is on. It opens My Library on its Learn side. The other tabs never move. The phone bar goes from 4 to 5 columns only when the tab shows.
- **Home**: IELTS users get an exam card (days left, bar of the preparation time, target, "N of M done today", a Today's plan button). It also handles: no date yet ("When is your exam?"), exam day, and date passed (set a new date / done).
- **Today card**: hidden in Enjoy stories (uncluttered) and during an exam (the exam card replaces it).
- **My Library**: the Books | Learn switch is hidden once a goal is chosen (the tab replaces it).
- **Existing users**: nothing changes until they choose. Home shows one dismissible card "How do you want to use Wordtrail?". Dismissing it is permanent.
- **Enjoy stories, later**: after the 3rd saved word, once, a toast "Want a Learn tab to review these words? [Add it]".
- **Settings > Reading > Learning**: the three-way control, exam date and target band. Switching never deletes saved words or progress; switching IELTS -> Learn -> IELTS keeps the date and target.
- **The reader's Learn button** (`P.learnBtn`) is independent of the goal. Only the very first choice sets its default (off for Enjoy stories, on otherwise).

## Files
- New: `src/js/169l-goal.js`, `src/css/99e2-goal.css`, `tools/goal_check.js`
- Changed: `src/html/40-onboarding.html`, `10-body-views.html` (tab, `#gl-home`), `30-sheets-settings.html`, `src/js/300-wiring.js` (onboarding step, tab click, `GL.start()`), `080` (tab highlight), `169` (switch), `169d` (`TDH.on`), `147` (`GL.newWord`), `270` (back-button observer), `290` (settings sync), `build.py`, `MODULES.md`
- To go back: remove the new files, their `build.py` lines and the hooks above.

## Also fixed (was already in the source)
`src/css/94s-listen-type.css`: the closed "Type what you hear" sheet (`#sheet-lt`) stayed on screen and covered the whole app, because `.sheet.lt { display:flex }` has the same weight as `.sheet[hidden]` and comes later. Added `.sheet.lt[hidden] { display: none; }`. The `dist/` that came in the zip is older than `src/` and does not have this sheet, so it had not shown up yet.

## Not done
- No IELTS practice content (Listening / Reading / Writing / Speaking tiles, "Books for IELTS"). The exam card's button opens the existing Today plan.
- New words are English only; add them to `src/i18n/bn.json` etc. (`python tools/i18n_check.py bn`).

## Tests
`node tools/goal_check.js` (17 checks of the date, mode and switching rules, including 11 Nov -> 20 Dec = 39 days), `node tools/startup_check.js`, and a real-Chromium walk-through (new user, existing user, skip, switching modes, date and target, Learn tab, no page errors).
`python tools/tangle_check.py` was already failing before this change (stale baseline, 8 leftover files in `src/js/`), so the baseline was not accepted here.
