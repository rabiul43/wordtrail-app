# IELTS hub (Task 52)

While "Prepare for IELTS" is on, the Learn hub (the IELTS tab) starts with an IELTS section. The usual tiles (My Words, Review, Questions, Echo, Listen and type, Today) stay below it, unchanged.

- **Exam card:** days left, exam date, target band (set by the learner, never predicted), a thin bar from choosing the exam to exam day, "Week N of M". Edit opens date and target on the card itself (saved to the goal, same code as Settings). No date: "When is your exam?". Exam day and "date has passed" have calm texts.
- **Four skill cards:** Listening, Reading, Writing, Speaking. Each shows **sessions this calendar month** (a count, never a score) and a ring (full ring = 12 sessions). The least-practised skill gets a **Focus** tag. All four equal (a new month): no tag. Tied lowest: they share it.
- **Today button:** opens the Focus skill's sheet (or the Today plan when there is no Focus).
- **Skill sheet:** this month's count, what counts, "Practise" (opens Listen and type / Questions / Echo), "add one" for practice done elsewhere (Writing has no tool, so it is always by hand), and Undo for today.

## What counts as a session (real activity)
Listening: a finished Listen and type set. Reading: a finished set of chapter questions. Speaking: an Echo practice with 3 or more sentences. Writing: added by hand. Logged whatever the goal is, so nothing is lost when the goal changes.

## New synced key
`wt:ielts = { 'YYYY-MM-DD': { l, r, w, s } }`. Merge: per day the larger value of each skill (repeatable, never loses a day). Category "Learning stats" in 295; also in backups (290). Last 400 days kept.
Goal, exam date and target are **not copied** into it: they stay in `P.goal` (wt:prefs, already synced), so Settings, Home and the hub can never disagree.

## Files
New: `src/js/169o-ielts-hub.js`, `src/css/94v-ielts-hub.css`, `src/html/28f-sheet-ielts.html`, `tools/ielts_check.js`. Changed: `build.py`, `169b-learn-hub.js` (`LearnHub.head`), `169l-goal.js` (exports `setExamField`), `169g`, `169h`, `169k` (one `IE.log` each), `295-account-sync.js`, `290-backup-maintenance.js`, `bn.json`, `MODULES.md`, `DEPENDENCIES.md`.

## Known limits
- Undo after a sync with another device that already holds the higher number can be brought back by the merge (larger value wins).
- The three automatic hooks are one line each and were not run end to end (they need a book with synced text); the log, hub and sheet were.
- The Today button scrolls with the page; it is not pinned above the tab bar as in the mock-up.
