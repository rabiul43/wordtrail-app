-- wordtrail-errors: the database (Cloudflare D1). Run once. Safe to run again.
-- issues   one row per unique problem (the fingerprint made by the app), with totals and a status: open / fixed / ignored
-- events   recent reports of a problem (kept 30 days); heavy details (context, last actions) only the first time a session reports it
-- daily    counts per day, problem and app build (kept 180 days) for the trend charts
-- seen     how much each session already reported (makes a re-sent report count once; kept 2 days)
-- sessions how many reports each session sent (a limit against floods; kept 2 days)
CREATE TABLE IF NOT EXISTS issues (
  id TEXT PRIMARY KEY, type TEXT NOT NULL, sev TEXT NOT NULL, msg TEXT NOT NULL, loc TEXT NOT NULL DEFAULT '',
  first_seen INTEGER NOT NULL, last_seen INTEGER NOT NULL, total INTEGER NOT NULL DEFAULT 0, sessions INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'open', fixed_build TEXT, fixed_at INTEGER, last_build TEXT NOT NULL DEFAULT '', sample TEXT NOT NULL DEFAULT '{}');
CREATE INDEX IF NOT EXISTS issues_status_last ON issues(status, last_seen);
CREATE TABLE IF NOT EXISTS events (
  rid INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL, ts INTEGER NOT NULL, build TEXT NOT NULL DEFAULT '', sid TEXT NOT NULL, n INTEGER NOT NULL, ctx TEXT, detail TEXT);
CREATE INDEX IF NOT EXISTS events_id_ts ON events(id, ts);
CREATE INDEX IF NOT EXISTS events_ts ON events(ts);
CREATE TABLE IF NOT EXISTS daily (day TEXT NOT NULL, id TEXT NOT NULL, build TEXT NOT NULL, n INTEGER NOT NULL, PRIMARY KEY (day, id, build));
CREATE TABLE IF NOT EXISTS seen (sid TEXT NOT NULL, id TEXT NOT NULL, n INTEGER NOT NULL, ts INTEGER NOT NULL, PRIMARY KEY (sid, id));
CREATE INDEX IF NOT EXISTS seen_ts ON seen(ts);
CREATE TABLE IF NOT EXISTS sessions (sid TEXT PRIMARY KEY, t0 INTEGER NOT NULL, t1 INTEGER NOT NULL, posts INTEGER NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS sessions_t1 ON sessions(t1);
