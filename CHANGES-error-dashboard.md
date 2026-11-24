# Error tracking, task 6: dashboard part 1 (Worker read endpoints + Errors section in the Admin page)

Worker (`tools/errors-worker/index.js`): new read endpoints, locked by the secret `ADMIN_TOKEN` (same value as the Admin token; no token set = 503 with a hint, wrong token = 401):
`GET /admin/ping`, `/admin/summary` (open/fixed/ignored counts, new this week, reports 7 days and today, 30 days per day with errors split out, busiest builds),
`/admin/issues?status=&sev=&sort=&q=&limit=&offset=` (14-day trend per problem, paging), `/admin/issue?id=` (totals, 30-day trend, by build, browser/system/mode counts,
first report with the last-actions trail, latest reports), `POST /admin/status {id,status,fixed_build?}` (open / fixed / ignored; used by the buttons in task 8).
`node tools/errors_worker_check.js`: 41 checks, all pass (counting once, secrets removed, limits, fixed/open, clean-up, and every dashboard endpoint).

Admin page (`index.html`, Errors added next to Reviews; nothing else changed):
- New menu item "Errors" (also on the phone bar). First time: paste the Errors Worker address (Save & test). Saved on the device like the Reviews address.
- Overview: five tiles (open problems, new this week, reports in 7 days, reports today, busiest build), a 30-day bar chart (hover or tap a bar for the number, "Show as table" under it).
- List: filters Open / Fixed / Ignored / All and Any kind / Errors / Warnings, sort (newest, most reports, most sessions, newest problem), search in the message, "Show more".
  Each row: Error or Warning label (symbol + word, not colour alone), plain title, message, last seen, build, reports, sessions, 14-day sparkline.
- Detail page: message, plain-words meaning, totals and dates, 30-day chart, by build, browser / system / app mode, the first report's screen and last 10 actions, technical detail, latest reports.
- Works on phone, light and dark. Marking fixed/ignored and filters by version and device come in task 8.
