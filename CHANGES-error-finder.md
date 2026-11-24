# Error tracking, task 4: Error finder page

New pieces: `src/html/28k-sheet-errors.html` (the sheet), `src/css/99u-error-finder.css`, `src/js/296b-error-finder.js` (declares `EF`), three lines in `build.py`.
Small edits: `30-sheets-settings.html` (an "Error finder" button under "Send anonymous error reports"), `300-wiring.js` (button click),
`290-backup-maintenance.js` (Settings search entry, Advanced), `i18n/bn.json` (4 lines), `MODULES.md` (one row).

The page reads `window.__wtDiag` only: nothing is recorded or sent from here.
- Summary line (errors, warnings, other) and filter chips: All, Errors, Warnings, Other (Other = 404 "file not found" notes and slow moments).
- One card per problem, most serious first, then newest: plain title, count, the message, last seen.
  Tap a card: what it usually means, where the user was, first/last time, "Before it happened" (last 10 actions), technical detail,
  and "Copy this problem".
- Refresh, Copy report (the same text as Settings > Diagnostics, scrubbed), Clear.
- A notice with a "Turn on" button when logging is off.
Open cards stay open on Refresh/filter change.

Where: Settings > Basics (Text/Language tab), under "Send anonymous error reports": "Error finder". Also Settings home search: "error finder".
