// Checks the error-report Worker (tools/errors-worker/index.js) with a real SQLite database (Node's built-in node:sqlite) behind a small D1 look-alike.
//   node tools/errors_worker_check.js            (Node 22 or newer; prints one line per check, exits 1 if any fails)
const fs = require('fs'), os = require('os'), path = require('path');
const { DatabaseSync } = require('node:sqlite');
const dir = path.join(__dirname, 'errors-worker');
const tmp = path.join(os.tmpdir(), 'wt-errors-worker-' + process.pid + '.mjs');
fs.writeFileSync(tmp, fs.readFileSync(path.join(dir, 'index.js'), 'utf8'));
let bad = 0; const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) bad++; };

function d1() {
  const db = new DatabaseSync(':memory:'); db.exec(fs.readFileSync(path.join(dir, 'schema.sql'), 'utf8'));
  const stmt = sql => { const s = { sql, args: [], bind(...a) { s.args = a; return s; }, run() { return { results: db.prepare(sql).all(...s.args) }; }, async all() { return s.run(); }, async first() { return s.run().results[0] || null; } }; return s; };
  return { db, prepare: stmt, async batch(list) { return list.map(s => s.run()); } };
}
const post = (w, env, body, o = {}) => w.fetch(new Request('https://e.example/e', { method: 'POST', headers: o.headers || {}, body: typeof body === 'string' ? body : JSON.stringify(body) }), env);
const prob = (o = {}) => ({ id: 'e_abc123', type: 'network', sev: 'warn', msg: 'GET api.example.com/x.json -> Failed to fetch', where: '', n: 2, first: 1, last: 2, stack: '', at: { screen: 'home', book: '', online: true }, crumbs: [{ t: 1, k: 'tap', d: '#b1', n: 1 }], ...o });
const rep = (o = {}) => ({ v: 1, app: 'wordtrail', sid: 'sess0001abc', t: Date.now(), ctx: { build: '2026-11-22-aaaaaa', br: 'Chrome 157', os: 'Android 14', online: true, mem: 4, cores: 8, dpr: 2.6, stor: 12.5, up: 40, prefs: { theme: 'auto' } }, problems: [prob()], ...o });

(async () => {
  const w = (await import('file://' + tmp)).default, dbo = d1(), env = { DB: dbo }, q = (s, ...a) => dbo.db.prepare(s).all(...a);
  let r = await post(w, env, rep()); ok(r.status === 204, 'a good report is accepted (204)');
  let i = q('SELECT * FROM issues')[0]; ok(i && i.total === 2 && i.sessions === 1 && i.status === 'open' && i.last_build === '2026-11-22-aaaaaa', 'one issue: total 2, 1 session, open, build kept');
  ok(q('SELECT * FROM events').length === 1 && q('SELECT n FROM daily')[0].n === 2, 'one event and a daily count of 2');
  await post(w, env, rep()); ok(q('SELECT total FROM issues')[0].total === 2 && q('SELECT * FROM events').length === 1, 'the same report sent again is counted once');
  await post(w, env, rep({ problems: [prob({ n: 5 })] })); ok(q('SELECT total FROM issues')[0].total === 5 && q('SELECT sessions FROM issues')[0].sessions === 1, 'a higher count adds only the difference (5) and is still 1 session');
  await post(w, env, rep({ sid: 'sess0002abc', problems: [prob({ n: 1 })] })); i = q('SELECT * FROM issues')[0]; ok(i.total === 6 && i.sessions === 2, 'a second session: total 6, 2 sessions');
  ok(q('SELECT ctx FROM events WHERE ctx IS NULL').length === 1, 'context is stored only the first time a session reports a problem');

  await post(w, env, rep({ sid: 'sess0003abc', problems: [prob({ id: 'e_sec1', msg: 'load https://h.com/a.json?token=ZZZ9 for me@x.com with Bearer abc.def', where: 'C:\\Users\\Rabiul\\x.js:1:2', stack: 'at /home/rabiul/y.js', crumbs: [{ t: 1, k: 'tap', d: 'key=SECRETVALUE', n: 1 }] })] }));
  const all = JSON.stringify([q('SELECT * FROM issues'), q('SELECT * FROM events')]);
  ok(!/ZZZ9|me@x\.com|abc\.def|Rabiul|rabiul|SECRETVALUE/.test(all), 'secrets in an old or changed app are removed again by the Worker');

  r = await post(w, env, rep({ problems: [prob({ id: 'e_n1', type: 'missing' }), prob({ id: 'e_n2', sev: 'info' }), prob({ id: 'e_n3', type: 'longtask', sev: 'perf' }), prob({ id: 'BAD ID' }), prob({ id: 'e_ok9', n: 0 })] }));
  ok(r.status === 204 && !q("SELECT * FROM issues WHERE id IN ('e_n1','e_n2','e_n3','e_ok9')").length, '404 notes, info, slow moments, bad ids and zero counts are dropped');
  ok((await post(w, env, '{nope')).status === 400, 'broken JSON -> 400');
  ok((await post(w, env, { ...rep(), v: 2 })).status === 400, 'another format version -> 400');
  ok((await post(w, env, { ...rep(), sid: 'x' })).status === 400, 'a bad session id -> 400');
  ok((await post(w, env, 'x'.repeat(40001))).status === 413, 'too big -> 413');
  ok((await post(w, env, rep({ problems: [] }))).status === 204, 'an empty report is fine and stores nothing');
  ok((await w.fetch(new Request('https://e.example/e', { method: 'POST', headers: { Origin: 'https://evil.example' }, body: JSON.stringify(rep()) }), env)).status === 403, 'a foreign website is refused (403)');
  ok((await w.fetch(new Request('https://e.example/e', { method: 'GET' }), env)).status === 404 && (await (await w.fetch(new Request('https://e.example/health'), env)).json()).ok, 'GET /e is 404, /health answers');

  let last = 204; for (let k = 0; k < 32; k++) last = (await post(w, env, rep({ sid: 'flood0000aa', problems: [prob({ id: 'e_f' + k })] }))).status;
  ok(last === 429, 'a session that sends more than 30 reports gets 429');

  q("UPDATE issues SET status='fixed', fixed_build='2026-11-22-bbbbbb' WHERE id='e_abc123'");
  await post(w, env, rep({ sid: 'sess0004abc', ctx: { build: '2026-11-20-oldold' }, problems: [prob({ n: 1 })] })); ok(q("SELECT status FROM issues WHERE id='e_abc123'")[0].status === 'fixed', 'a fixed problem reported by an OLDER build stays fixed');
  await post(w, env, rep({ sid: 'sess0005abc', ctx: { build: '2026-11-22-bbbbbb' }, problems: [prob({ n: 1 })] })); ok(q("SELECT status FROM issues WHERE id='e_abc123'")[0].status === 'open', 'reported again by the fixing build -> open again');
  q("UPDATE issues SET status='fixed', fixed_build='2026-11-22-bbbbbb' WHERE id='e_abc123'");
  await post(w, env, rep({ sid: 'sess0006abc', ctx: { build: '2026-11-25-cccccc' }, problems: [prob({ n: 1 })] })); ok(q("SELECT status FROM issues WHERE id='e_abc123'")[0].status === 'open', 'reported by a NEWER build -> open again');
  q("UPDATE issues SET status='ignored' WHERE id='e_abc123'");
  await post(w, env, rep({ sid: 'sess0007abc', problems: [prob({ n: 1 })] })); ok(q("SELECT status FROM issues WHERE id='e_abc123'")[0].status === 'ignored', 'an ignored problem stays ignored');

  const old = Date.now() - 40 * 864e5; q('UPDATE events SET ts=?', old); q('UPDATE seen SET ts=?', old); q('UPDATE sessions SET t1=?', old); q("INSERT INTO daily(day,id,build,n) VALUES('2020-01-01','e_x','b',1)");
  await w.scheduled({}, env, { waitUntil: p => p }); await new Promise(r => setTimeout(r, 50));
  ok(!q('SELECT * FROM events').length && !q('SELECT * FROM seen').length && !q('SELECT * FROM sessions').length && !q("SELECT * FROM daily WHERE day='2020-01-01'").length && q('SELECT * FROM issues').length > 0, 'the daily clean-up removes old rows and keeps the issues');

  // ---- dashboard endpoints (task 6) ----
  const adm = (pth, o = {}, e = env) => w.fetch(new Request('https://e.example' + pth, { method: o.method || 'GET', headers: o.noauth ? {} : { Authorization: 'Bearer ' + (o.token || 'secret-123') }, body: o.body }), e);
  ok((await adm('/admin/ping', {}, { DB: dbo })).status === 503, 'no ADMIN_TOKEN set on the Worker -> 503 with a hint');
  const env2 = { DB: dbo, ADMIN_TOKEN: 'secret-123' };
  ok((await adm('/admin/ping', { noauth: true }, env2)).status === 401 && (await adm('/admin/ping', { token: 'wrong' }, env2)).status === 401, 'no token or a wrong token -> 401');
  ok((await (await adm('/admin/ping', {}, env2)).json()).ok === true, 'the right token -> ping ok');
  ok((await w.fetch(new Request('https://e.example/admin/issues', { method: 'OPTIONS' }), env2)).headers.get('access-control-allow-headers').includes('Authorization'), 'the dashboard preflight allows the Authorization header');
  // fresh data set
  q('DELETE FROM issues'); q('DELETE FROM events'); q('DELETE FROM daily'); q('DELETE FROM seen'); q('DELETE FROM sessions');
  const mk = (sid, build, br, os, ps) => post(w, env, rep({ sid, ctx: { build, br, os, mode: 'installed', online: true }, problems: ps }));
  await mk('dash0001aa', '2026-11-20-aaaaaa', 'Chrome 157', 'Android 14', [prob({ id: 'e_net1', n: 5 }), prob({ id: 'e_err1', type: 'error', sev: 'error', msg: 'Uncaught TypeError: x is undefined', n: 1, stack: 'at a (index.html:1:2)' })]);
  await mk('dash0002aa', '2026-11-22-bbbbbb', 'Safari 17', 'iOS', [prob({ id: 'e_net1', n: 3 })]);
  await mk('dash0003aa', '2026-11-22-bbbbbb', 'Chrome 157', 'Android 14', [prob({ id: 'e_net1', n: 2 })]);
  q("UPDATE issues SET first_seen=? WHERE id='e_net1'", Date.now() - 20 * 864e5);
  q("UPDATE daily SET day=? WHERE id='e_net1' AND build='2026-11-20-aaaaaa'", new Date(Date.now() - 3 * 864e5).toISOString().slice(0, 10));
  let sm = await (await adm('/admin/summary', {}, env2)).json();
  ok(sm.open === 2 && sm.fixed === 0 && sm.new7 === 1 && sm.events7 === 11 && sm.perDay.length === 30 && sm.perDay[29].n === 6 && sm.perDay[26].n === 5, 'summary: 2 open, 1 new this week, 11 events in 7 days, 30 days with zeros filled');
  ok(sm.perDay.reduce((a, x) => a + x.e, 0) === 1 && sm.builds[0][0] === '2026-11-20-aaaaaa' && sm.sessions24h === 3, 'summary: 1 event is an error, builds ranked, 3 sessions in 24 h');
  let ls = await (await adm('/admin/issues?status=open&sort=total', {}, env2)).json();
  ok(ls.items.length === 2 && ls.items[0].id === 'e_net1' && ls.items[0].total === 10 && ls.items[0].sessions === 3 && ls.items[0].trend.length === 14, 'issues: sorted by total, trend of 14 days');
  ok(ls.items[0].trend[13] === 5 && ls.items[0].trend[10] === 5 && ls.items[0].trend.reduce((a, b) => a + b, 0) === 10, 'issues: the trend puts counts on the right days');
  ls = await (await adm('/admin/issues?sev=error', {}, env2)).json(); ok(ls.items.length === 1 && ls.items[0].id === 'e_err1', 'issues: filter by severity');
  ls = await (await adm('/admin/issues?q=TypeError', {}, env2)).json(); ok(ls.items.length === 1, 'issues: search in the message');
  ls = await (await adm('/admin/issues?q=%25', {}, env2)).json(); ok(ls.items.length === 0, 'issues: a % in the search is not a wildcard');
  ls = await (await adm('/admin/issues?limit=1&sort=total', {}, env2)).json(); ok(ls.items.length === 1 && ls.more === true, 'issues: paging says there is more');
  let dt = await (await adm('/admin/issue?id=e_net1', {}, env2)).json();
  ok(dt.issue.total === 10 && dt.trend.length === 30 && dt.builds.length === 2 && dt.events.length === 3 && dt.ctxCount === 3, 'issue: totals, 30-day trend, 2 builds, 3 events with context');
  ok(dt.devices.br[0][0] === 'Chrome 157' && dt.devices.br[0][1] === 2 && dt.devices.os.length === 2, 'issue: devices counted from the first report of each session');
  ok((await adm('/admin/issue?id=e_nope', {}, env2)).status === 404 && (await adm('/admin/issue?id=bad!', {}, env2)).status === 400, 'issue: unknown id 404, bad id 400');
  let sr = await adm('/admin/status', { method: 'POST', body: JSON.stringify({ id: 'e_net1', status: 'fixed', fixed_build: '2026-11-23-cccccc' }) }, env2);
  ok(sr.status === 200 && q("SELECT status,fixed_build FROM issues WHERE id='e_net1'")[0].fixed_build === '2026-11-23-cccccc', 'status: mark fixed with the fixing build');
  sm = await (await adm('/admin/summary', {}, env2)).json(); ok(sm.open === 1 && sm.fixed === 1, 'summary follows the status');
  await adm('/admin/status', { method: 'POST', body: JSON.stringify({ id: 'e_net1', status: 'open' }) }, env2); ok(q("SELECT status,fixed_build FROM issues WHERE id='e_net1'")[0].fixed_build === null, 'status: open again clears the fixing build');
  ok((await adm('/admin/status', { method: 'POST', body: JSON.stringify({ id: 'e_net1', status: 'boom' }) }, env2)).status === 400, 'status: an unknown status is refused');
  fs.unlinkSync(tmp);
  console.log(bad ? bad + ' check(s) FAILED' : 'all checks passed'); process.exit(bad ? 1 : 0);
})().catch(e => { console.log('FAIL crash:', e); process.exit(1); });
