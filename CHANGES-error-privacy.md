# Error tracking, task 3: privacy filter + Settings switch

New piece: `src/html/00a-error-privacy.html` (one line in `build.py`, before `00b-error-collector.html`).
Small edits: `00-head.html` (add() scrubs first), `00c-error-context.html` (breadcrumbs scrubbed), `30-sheets-settings.html` (new row),
`290-backup-maintenance.js` (row filled when Settings opens + a Settings-search entry), `300-wiring.js` (saves P.errSend), `i18n/bn.json` (3 lines).

Filter `__wtDiag.scrub(text, soft)`, applied before anything is kept (memory log, Diagnostics > Copy, reports):
- web addresses lose ?query, #hash, user:password@; e-mails, Bearer values, JWTs, token/key/secret/password/sig/sid values,
  known key prefixes (hf_, sk-, ghp_, github_pat_, xox*, AIza), IP addresses, 9+ digit numbers, home-folder names in paths
- quoted text over 40 characters is cut to 20 + ...; long letter+digit strings (24+) become [id]
- soft = true (breadcrumbs, stacks) skips the last two, so a book id stays readable

Settings > Basics (the Text/Language tab), under "Show books in other languages": "Send anonymous error reports", ON by default.
Saved as P.errSend. `__wtDiag.canSend()` reads it; `__wtDiag.sendable()` returns the v1 report only if logging is on AND sending is allowed,
else null. The sender (task 5) must send only what sendable() returns. Switching it off does not stop the local log (Diagnostics switch does that).

Test: console `__wtDiag.scrub('https://a.com/x?token=SECRET me@x.com')`, then flip the switch and run `__wtDiag.sendable()`.
