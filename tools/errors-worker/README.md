# wordtrail-errors (anonymous error reports)

A tiny Cloudflare Worker with a small database (D1). The app sends it ONE short report when something goes wrong (what failed, how many times, which screen,
the last 10 taps). The Worker checks it, removes anything private once more, and counts each problem once. A dashboard (a later task) reads the database.
No IP address, no account, no typed text and no book text is stored.

## Put it online (about 10 minutes, free)

1. Cloudflare dashboard > **Storage & databases** > **D1** > **Create database**. Name it `wordtrail-errors`.
2. Open it > **Console**. Paste the whole of `schema.sql` from this folder and run it. (Or: `cd tools/errors-worker`, then `npx wrangler d1 execute wordtrail-errors --remote --file=schema.sql`.)
3. **Workers & Pages** > **Create** > **Create Worker**. Name it `wordtrail-errors`, **Deploy**. Then **Edit code**, replace everything with `index.js` from this folder, **Deploy**.
4. In the Worker: **Settings** > **Bindings** > **Add** > **D1 database**. Variable name: `DB`. Pick `wordtrail-errors`. Save and deploy.
5. **Settings** > **Variables and secrets** > **Add** > type **Secret**, name `ADMIN_TOKEN`, value = the same password you use to connect the Admin page. (This is the lock of the dashboard; without it the dashboard answers 503.)
   **Settings** > **Trigger events** > **Cron Triggers** > add `17 3 * * *` (the daily clean-up).
6. At the top of `index.js`, check that the address in `ALLOWED` is the address of your app. Change it if not, and deploy again.
7. In `hosts.json` of the app project, put the Worker's address in `errors` (for example `"errors": "https://wordtrail-errors.YOURNAME.workers.dev"`), run `python build.py`, and publish the app as usual.
   Leave `errors` empty to switch sending off.

If you prefer the command line: put your database id into `wrangler.jsonc`, then `npx wrangler deploy`.

## See the problems (the Errors section of the Admin page)

Open the Admin page, connect as usual, press **Errors** in the menu, and paste the Worker's address once (**Save & test**). The page shows open problems, a 30-day chart, a list you can filter and search, and a detail page for each problem.

## Check that it works

```
curl https://wordtrail-errors.YOURNAME.workers.dev/health
```
should answer `{"ok":true}`. Then, in the app, open Settings > Basics > Error finder: the last line should say "Sending reports: on".
To see a report arrive: in the D1 Console run `SELECT msg, total, sessions, status FROM issues ORDER BY last_seen DESC LIMIT 10;`.

## Limits (as far as I know; check Cloudflare's current free limits)

- Workers free plan: 100,000 requests a day. D1 free plan: about 100,000 rows written and 5 million rows read a day, 5 GB stored. One report writes about 4 rows per problem, so there is room for thousands of reports a day.
- The app sends at most 10 reports per page load, one every 30 seconds, only errors and warnings, and only what changed.
- The Worker accepts at most 30 reports per session, 20 problems per report and 40 KB per report.
- Rows are removed by the daily clean-up: events after 30 days, daily counts after 180 days, helper rows after 2 days. Problems (the `issues` table) are kept.
- A website can always be sent fake reports by someone who wants to. The checks above keep it small and clean, not impossible. Nothing in the database is used by the app itself.

## Check the Worker's code

`node tools/errors_worker_check.js` runs the Worker against a real SQLite database (41 checks: counting once, secrets removed, limits, fixed/open status, clean-up).
