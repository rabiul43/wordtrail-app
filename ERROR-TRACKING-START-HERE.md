# Wordtrail error tracking: start here

What you have: the app records its own errors (privately, no typed text or book text), keeps a list in **Settings > Basics > Error finder**,
sends short anonymous reports to your own small Worker, and the **Errors** section of the Admin page shows them.
Nothing is sent until step 3 is done.

## What is in this zip (same folders as your project)

| Part | Files |
|---|---|
| The app | `src/html/00a..00d-error-*.html` (new), `src/html/28k-sheet-errors.html` (new), `src/css/99u-error-finder.css` (new), `src/js/296b-error-finder.js` (new); small edits in `src/html/00-head.html`, `30-sheets-settings.html`, `src/js/290-backup-maintenance.js`, `300-wiring.js`, `src/i18n/bn.json`, `build.py`, `hosts.json`, `MODULES.md` |
| The Worker | `tools/errors-worker/` (`index.js`, `schema.sql`, `wrangler.jsonc`, `README.md`) and its test `tools/errors_worker_check.js` |
| The dashboard | `admin/index.html` (your Admin page with the new **Errors** section) |
| Notes | `CHANGES-error-*.md` (one per task) |

## Put it online, in this order (about 20 minutes)

1. **The app.** Unzip into your project folder (say yes to replace). Run `python build.py`. Do NOT publish yet if you want to do step 2 first; it is also fine to publish now, the app sends nothing while `errors` in `hosts.json` is empty.
2. **The Worker.** Follow `tools/errors-worker/README.md`: create the D1 database `wordtrail-errors`, run `schema.sql`, create the Worker `wordtrail-errors` with `index.js`, bind the database as `DB`, add the secret `ADMIN_TOKEN` (the same password as your Admin page), add the daily cron `17 3 * * *`. In `index.js`, check that `ALLOWED` holds the address of your app.
3. **Switch sending on.** In `hosts.json` set `"errors": "https://wordtrail-errors.YOURNAME.workers.dev"`, run `python build.py`, publish the app as usual.
4. **The dashboard.** Replace your Admin `index.html` with `admin/index.html`, open it, connect, press **Errors**, paste the Worker address, **Save & test**.

## Check that it works

- In the app: Settings > Basics > Error finder. The last line should say "Sending reports: on".
- Make a test report: open the browser console in the app and run `__wtDiag.flush()` (or just use the app for a while: reports go out 20 seconds after a new problem).
- Admin page > Errors: the problem should appear. If it does not, in the Worker's D1 Console run `SELECT msg, total FROM issues ORDER BY last_seen DESC LIMIT 10;`.

## Good to know

- Users can switch reporting off: Settings > Basics > "Send anonymous error reports" (on by default).
- To stop sending completely, empty `errors` in `hosts.json` and rebuild.
- Rows are cleaned automatically (reports after 30 days, daily counts after 180 days). Problems stay.
- Not included: buttons to mark a problem Fixed or Ignored (the Worker supports them, the buttons are not in the page yet), filters by app version and device, and alerts.
- Tested here: the app in a browser, the Worker on a real SQLite database (41 checks), and the Admin page against that Worker. Not tested: your real Cloudflare account and your phone.
