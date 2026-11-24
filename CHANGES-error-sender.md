# Error tracking, task 5: offline queue + sender (and the Worker)

New in the app: `src/html/00d-error-sender.html` (one line in `build.py`, after `00c`), a new address slot `errors` in `hosts.json` (+ `build.py`).
**`errors` is empty in `hosts.json`, so nothing is sent until you deploy the Worker and put its address there.** With it empty, no timer or listener runs.
Small edits: `28k-sheet-errors.html` and `296b-error-finder.js` (a line "Sending reports: ..." at the bottom of the Error finder).

Sender rules
- Only problems of severity error or warn are sent (not 404 notes, not slow moments), only what changed since the last send, counts are absolute per session.
- When: 20 s after a new problem, when the page is hidden or closed (sendBeacon), when the phone is back online, and 8 s after start for what is still queued.
- Limits: one send per 30 s, 10 per page load, 5 reports waiting, 20 problems and about 30 KB per report, reports older than 3 days dropped.
- Failure: the report stays queued and saved (`wt:errq`), retried after 1, 3, 9, 27, 30 min. A 4xx (not 429) is dropped for good.
  When the page closes offline or after a failure nothing is handed to sendBeacon (it cannot report an answer); the report stays saved.
- Only while `__wtDiag.sendable()` allows it (logging on AND the Settings switch on). Switched off: the queue is emptied.
- Uses `__wtDiag.rawFetch`, so a failed send is never reported as a problem. `__wtDiag.flush()` sends now; `__wtDiag.sendStatus()` feeds the Error finder.

New Worker: `tools/errors-worker/` (`index.js`, `schema.sql`, `wrangler.jsonc`, `README.md`) and `tools/errors_worker_check.js` (41 checks, `node tools/errors_worker_check.js`).
- Validates the report, removes secrets again (same rules as the app), drops anything that is not error/warn, counts each problem once even if a report is re-sent,
  keeps 5 tables (issues, events, daily, seen, sessions), reopens a "fixed" problem when the fixing or a newer build reports it, cleans up daily.
- The dashboard reads these tables in tasks 7 and 8 (the admin Worker or this one will get read endpoints then).

Tested: the real browser payloads were sent to the Worker on a real SQLite database; first flush, no repeat, changed count, 500 -> queued -> sent after a reload,
beacon on pagehide, switch off -> nothing sent.
