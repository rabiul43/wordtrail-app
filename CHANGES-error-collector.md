# Error tracking, task 1: collector core + report format

New piece: `src/html/00b-error-collector.html` (one line added to `build.py`, right after `00-head.html`).
Small edit in `src/html/00-head.html`: `add()` now calls `D.hook(type, msg, stack)` and the error/promise listeners pass the stack.

What it does (memory only, nothing is sent yet; follows the Settings > Diagnostics switch):
- Same problem = one entry with a count (numbers and ids are ignored in the fingerprint).
- New things caught: failed network requests (`network`, `http`, `missing` for 404/410), audio errors and stalls (`audio`),
  images/scripts/links that fail to load (`resource`), localStorage full (`storage`; the error still reaches the app).
- Addresses are kept as host + path only (no query, no hash). At most 40 different problems per session; extra ones are counted in `dropped`.
- `__wtDiag.rawFetch` = the original fetch. The sender (task 5) must use it so a failed report is never reported again.

Report format v1 (`__wtDiag.report()`):
    { v:1, sid, t, dropped, problems:[ { id:'e_<fingerprint>', type, sev:'error|warn|info|perf', msg, where, n, first, last, stack } ] }
Task 2 will add `ctx` (version, theme, device...) and `crumbs` (last 10 actions) next to `problems`.

Test: Settings > Diagnostics shows a new "Problems (the same error merged)" list under the old log.
Or in the browser console: `__wtDiag.report()`.
