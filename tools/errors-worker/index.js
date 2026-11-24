/* wordtrail-errors: a small free Cloudflare Worker with a D1 database. The app sends it anonymous error reports (format v1, see
   CHANGES-error-collector.md); it checks them, cleans them once more, and counts each problem once. Needs a D1 binding called "DB"
   (see README.md in this folder). The dashboard (a later task) reads the tables; this file only receives and tidies up.
   POST /e   one report  -> 204 (ok) | 400 (not understood) | 403 (origin) | 413 (too big) | 429 (this session sent too many)
   GET /health -> {"ok":true}
   Dashboard (needs the secret ADMIN_TOKEN, sent as "Authorization: Bearer <token>"; the same value as your Admin token):
   GET /admin/ping | /admin/summary | /admin/issues?status=&sev=&sort=&q=&limit=&offset= | /admin/issue?id=    POST /admin/status {id,status,fixed_build?}
   A daily cron removes old rows. No IP address, user agent or account is stored. */
const ALLOWED = ['https://wordtrail.test-rabiulclaud-1.workers.dev'];   // the address(es) of your app; add your own domain if you use one
const TYPES = ['error', 'promise', 'storage', 'sw', 'network', 'http', 'audio', 'resource'];
const MAX_BODY = 40000, MAX_PROBLEMS = 20, MAX_POSTS = 30, DAY = 86400000;

/* The same cleaning the app does (00a-error-privacy.html), again here, so an old or changed app can never store a secret. */
const RULES = [
  [/(https?:\/\/)[^\s\/@]*@/gi, '$1'],
  [/(https?:\/\/[^\s?#)'"]*)[?#][^\s)'"]*/gi, '$1'],
  [/([\w\/.\-])\?[\w%.\-]+=[^\s)'"]*/g, '$1'],
  [/[\w.+\-]+@[\w\-]+(\.[\w\-]+)+/g, '[email]'],
  [/\bBearer\s+[\w.~+\/=\-]+/gi, 'Bearer [token]'],
  [/\beyJ[\w\-]{5,}\.[\w\-]{5,}\.[\w\-]*/g, '[token]'],
  [/\b(token|key|secret|passw(?:or)?d|pwd|auth|authorization|sig|signature|apikey|api_key|access_token|session|sid)(["']?\s*[:=]\s*["']?)[^\s"'&,;)]+/gi, '$1$2[x]'],
  [/\b(?:hf_|sk-|ghp_|gho_|github_pat_|xox[a-z]-|AIza)[\w\-]{8,}/g, '[token]'],
  [/\b\d{1,3}(?:\.\d{1,3}){3}\b/g, '[ip]'],
  [/\b\d{9,}\b/g, '[num]'],
  [/((?:[A-Za-z]:\\Users\\)|(?:\/Users\/)|(?:\/home\/))[^\\\/\s]+/g, '$1[user]']
];
const HARD = [
  [/(['"])([^'"\n]{41,})\1/g, (m, q, t) => q + t.slice(0, 20) + '…' + q],
  [/\b(?=[\w\-]*\d)(?=[\w\-]*[A-Za-z])[\w\-]{24,}\b/g, '[id]']
];
const scrub = (s, soft) => { s = String(s == null ? '' : s); for (const [re, to] of RULES) s = s.replace(re, to); if (!soft) for (const [re, to] of HARD) s = s.replace(re, to); return s; };
const str = (v, max, soft) => typeof v === 'string' ? scrub(v, soft).slice(0, max) : '';
const int = (v, lo, hi) => { v = Math.round(Number(v)); return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : null; };

function cleanCtx(c) {
  if (!c || typeof c !== 'object') return {};
  const o = {};
  [['build', 24], ['mode', 12], ['theme', 12], ['design', 12], ['lang', 12], ['net', 8], ['win', 14], ['br', 24], ['os', 16], ['sw', 4]].forEach(([k, m]) => { if (typeof c[k] === 'string') o[k] = str(c[k], m, true); });
  ['lite', 'online', 'saver'].forEach(k => { if (typeof c[k] === 'boolean') o[k] = c[k]; });
  [['mem', 0, 512], ['cores', 0, 256], ['dpr', 0, 10], ['stor', 0, 100], ['up', 0, 1e7]].forEach(([k, lo, hi]) => { const v = int(c[k] * (k === 'dpr' ? 10 : 1), lo * (k === 'dpr' ? 10 : 1), hi * (k === 'dpr' ? 10 : 1)); if (v != null && c[k] != null) o[k] = k === 'dpr' ? v / 10 : v; });
  if (c.prefs && typeof c.prefs === 'object') {
    o.prefs = {};
    Object.keys(c.prefs).slice(0, 8).forEach(k => { const v = c.prefs[k]; if (/^\w{1,16}$/.test(k) && (typeof v === 'boolean' || typeof v === 'number' || typeof v === 'string')) o.prefs[k] = typeof v === 'string' ? str(v, 20, true) : v; });
  }
  return o;
}

function clean(b) {
  if (!b || b.v !== 1 || typeof b.sid !== 'string' || !/^[A-Za-z0-9]{6,40}$/.test(b.sid) || !Array.isArray(b.problems)) return null;
  const problems = [];
  for (const p of b.problems.slice(0, MAX_PROBLEMS)) {
    if (!p || typeof p.id !== 'string' || !/^e_[0-9a-z]{1,10}$/.test(p.id) || !TYPES.includes(p.type) || (p.sev !== 'error' && p.sev !== 'warn')) continue;   // 404 notes and slow moments are not sent by the app
    const n = Number(p.n) >= 1 ? int(p.n, 1, 9999) : null, msg = str(p.msg, 300); if (!n || !msg) continue;
    problems.push({ id: p.id, type: p.type, sev: p.sev, msg, loc: str(p.where, 80, true), n, stack: str(p.stack, 400, true),
      at: p.at && typeof p.at === 'object' ? { screen: str(p.at.screen, 60, true), book: str(p.at.book, 40, true), online: p.at.online !== false } : null,
      crumbs: Array.isArray(p.crumbs) ? p.crumbs.slice(-10).map(c => ({ t: int(c && c.t, 0, 4e12) || 0, k: str(c && c.k, 12, true), d: str(c && c.d, 60, true), n: int(c && c.n, 1, 999) || 1 })) : [] });
  }
  return { sid: b.sid, ctx: cleanCtx(b.ctx), problems };
}

/* A fixed problem comes back to "open" when it is reported by the build that was meant to fix it, or by a newer one (builds are named YYYY-MM-DD-hash). */
const reopens = (row, build) => !!(row && row.status === 'fixed' && row.fixed_build && build && (build === row.fixed_build || build.slice(0, 10) > row.fixed_build.slice(0, 10)));

async function ingest(req, env) {
  const raw = await req.text();
  if (raw.length > MAX_BODY) return 413;
  let b; try { b = JSON.parse(raw); } catch (e) { return 400; }
  const c = clean(b); if (!c) return 400;
  if (!c.problems.length) return 204;
  const db = env.DB, now = Date.now(), day = new Date(now).toISOString().slice(0, 10), build = (c.ctx && c.ctx.build) || '';
  const s = await db.prepare('INSERT INTO sessions(sid,t0,t1,posts) VALUES(?,?,?,1) ON CONFLICT(sid) DO UPDATE SET t1=excluded.t1, posts=posts+1 RETURNING posts').bind(c.sid, now, now).first();
  if (s && s.posts > MAX_POSTS) return 429;
  const reads = [];
  c.problems.forEach(p => { reads.push(db.prepare('SELECT n FROM seen WHERE sid=? AND id=?').bind(c.sid, p.id)); reads.push(db.prepare('SELECT id,status,fixed_build FROM issues WHERE id=?').bind(p.id)); });
  const rr = await db.batch(reads), writes = [], ctxJson = JSON.stringify(c.ctx);
  c.problems.forEach((p, i) => {
    const prev = rr[2 * i].results[0], row = rr[2 * i + 1].results[0], before = prev ? prev.n : 0, delta = p.n - before;
    if (delta <= 0) return;                       // a re-sent report: already counted
    const first = !prev, status = row ? (reopens(row, build) ? 'open' : row.status) : 'open', detail = JSON.stringify({ at: p.at, crumbs: p.crumbs, stack: p.stack });
    writes.push(db.prepare("INSERT INTO issues(id,type,sev,msg,loc,first_seen,last_seen,total,sessions,status,last_build,sample) VALUES(?,?,?,?,?,?,?,?,?,'open',?,?) " +
      "ON CONFLICT(id) DO UPDATE SET total=total+excluded.total, sessions=sessions+excluded.sessions, last_seen=MAX(last_seen,excluded.last_seen), " +
      "last_build=CASE WHEN excluded.last_build<>'' THEN excluded.last_build ELSE last_build END, status=?")
      .bind(p.id, p.type, p.sev, p.msg, p.loc, now, now, delta, first ? 1 : 0, build, detail, status));
    writes.push(db.prepare('INSERT INTO seen(sid,id,n,ts) VALUES(?,?,?,?) ON CONFLICT(sid,id) DO UPDATE SET n=excluded.n, ts=excluded.ts').bind(c.sid, p.id, p.n, now));
    writes.push(db.prepare('INSERT INTO daily(day,id,build,n) VALUES(?,?,?,?) ON CONFLICT(day,id,build) DO UPDATE SET n=n+excluded.n').bind(day, p.id, build, delta));
    writes.push(db.prepare('INSERT INTO events(id,ts,build,sid,n,ctx,detail) VALUES(?,?,?,?,?,?,?)').bind(p.id, now, build, c.sid, delta, first ? ctxJson : null, first ? detail : null));
  });
  if (writes.length) await db.batch(writes);
  return 204;
}

async function cleanup(env) {
  const now = Date.now(), db = env.DB;
  await db.batch([
    db.prepare('DELETE FROM events WHERE ts<?').bind(now - 30 * DAY),
    db.prepare('DELETE FROM seen WHERE ts<?').bind(now - 2 * DAY),
    db.prepare('DELETE FROM sessions WHERE t1<?').bind(now - 2 * DAY),
    db.prepare('DELETE FROM daily WHERE day<?').bind(new Date(now - 180 * DAY).toISOString().slice(0, 10))]);
}


/* ---------- the dashboard side: read the tables (the Errors section of the Admin page, task 6) ---------- */
const dayOf = t => new Date(t).toISOString().slice(0, 10);
const jparse = t => { try { return t ? JSON.parse(t) : null; } catch (e) { return null; } };
function sameToken(a, b) { a = String(a); b = String(b); let d = a.length ^ b.length; for (let i = 0; i < Math.max(a.length, b.length); i++) d |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0); return d === 0; }
const rows = r => (r && r.results) || [];
function top(list, key, n) { const c = {}; list.forEach(x => { const v = x && x[key]; if (v) c[v] = (c[v] || 0) + 1; }); return Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, n); }

async function admin(req, env, url) {
  const db = env.DB, now = Date.now(), path = url.pathname.slice(6);
  if (path === '/ping') return [200, { ok: true, now }];
  if (path === '/summary' && req.method === 'GET') {
    const d30 = dayOf(now - 29 * DAY), d7 = dayOf(now - 6 * DAY);
    const r = await db.batch([
      db.prepare('SELECT status, COUNT(*) c FROM issues GROUP BY status'),
      db.prepare('SELECT COUNT(*) c FROM issues WHERE first_seen>=?').bind(now - 7 * DAY),
      db.prepare("SELECT d.day day, SUM(d.n) n, SUM(CASE WHEN i.sev='error' THEN d.n ELSE 0 END) e FROM daily d JOIN issues i ON i.id=d.id WHERE d.day>=? GROUP BY d.day").bind(d30),
      db.prepare('SELECT build, SUM(n) n FROM daily WHERE day>=? GROUP BY build ORDER BY n DESC LIMIT 5').bind(d7),
      db.prepare('SELECT COUNT(*) c FROM sessions WHERE t1>=?').bind(now - DAY)]);
    const by = {}; rows(r[0]).forEach(x => { by[x.status] = x.c; });
    const have = {}; rows(r[2]).forEach(x => { have[x.day] = x; });
    const perDay = []; for (let k = 29; k >= 0; k--) { const d = dayOf(now - k * DAY), x = have[d]; perDay.push({ day: d, n: x ? x.n : 0, e: x ? x.e : 0 }); }
    return [200, { open: by.open || 0, fixed: by.fixed || 0, ignored: by.ignored || 0, new7: rows(r[1])[0].c, events7: perDay.slice(-7).reduce((a, x) => a + x.n, 0), today: perDay[29].n, sessions24h: rows(r[4])[0].c, perDay, builds: rows(r[3]).map(x => [x.build || '?', x.n]) }];
  }
  if (path === '/issues' && req.method === 'GET') {
    const q = url.searchParams, status = q.get('status') || 'open', sev = q.get('sev') || 'all', text = (q.get('q') || '').slice(0, 80);
    const limit = Math.min(100, Math.max(1, parseInt(q.get('limit'), 10) || 50)), offset = Math.max(0, parseInt(q.get('offset'), 10) || 0);
    const order = { last: 'last_seen DESC', total: 'total DESC', sessions: 'sessions DESC', first: 'first_seen DESC' }[q.get('sort')] || 'last_seen DESC';
    const where = [], args = [];
    if (['open', 'fixed', 'ignored'].includes(status)) { where.push('status=?'); args.push(status); }
    if (sev === 'error' || sev === 'warn') { where.push('sev=?'); args.push(sev); }
    if (text) { where.push("msg LIKE ? ESCAPE '\\'"); args.push('%' + text.replace(/[\\%_]/g, m => '\\' + m) + '%'); }
    const list = rows(await db.prepare('SELECT id,type,sev,msg,loc,first_seen,last_seen,total,sessions,status,last_build FROM issues' + (where.length ? ' WHERE ' + where.join(' AND ') : '') + ' ORDER BY ' + order + ', id LIMIT ? OFFSET ?').bind(...args, limit + 1, offset).all());
    const more = list.length > limit; if (more) list.pop();
    const days = []; for (let k = 13; k >= 0; k--) days.push(dayOf(now - k * DAY));
    if (list.length) {
      const tr = rows(await db.prepare('SELECT id, day, SUM(n) n FROM daily WHERE day>=? AND id IN (' + list.map(() => '?').join(',') + ') GROUP BY id, day').bind(days[0], ...list.map(x => x.id)).all()), m = {};
      tr.forEach(x => { (m[x.id] = m[x.id] || {})[x.day] = x.n; });
      list.forEach(x => { x.trend = days.map(d => (m[x.id] && m[x.id][d]) || 0); });
    }
    return [200, { items: list, more }];
  }
  if (path === '/issue' && req.method === 'GET') {
    const id = url.searchParams.get('id') || '';
    if (!/^e_[0-9a-z]{1,10}$/.test(id)) return [400, { error: 'bad id' }];
    const r = await db.batch([
      db.prepare('SELECT * FROM issues WHERE id=?').bind(id),
      db.prepare('SELECT day, SUM(n) n FROM daily WHERE id=? AND day>=? GROUP BY day').bind(id, dayOf(now - 29 * DAY)),
      db.prepare('SELECT build, SUM(n) n, MIN(day) a, MAX(day) b FROM daily WHERE id=? GROUP BY build ORDER BY b DESC LIMIT 12').bind(id),
      db.prepare('SELECT ts,build,sid,n,ctx,detail FROM events WHERE id=? ORDER BY ts DESC LIMIT 100').bind(id)]);
    const is = rows(r[0])[0]; if (!is) return [404, { error: 'not found' }];
    is.sample = jparse(is.sample) || {};
    const have = {}; rows(r[1]).forEach(x => { have[x.day] = x.n; });
    const trend = []; for (let k = 29; k >= 0; k--) { const d = dayOf(now - k * DAY); trend.push({ day: d, n: have[d] || 0 }); }
    const ev = rows(r[3]).map(x => ({ ts: x.ts, build: x.build, sid: x.sid.slice(0, 6), n: x.n, ctx: jparse(x.ctx), detail: jparse(x.detail) }));
    const withCtx = ev.map(x => x.ctx).filter(Boolean);
    return [200, { issue: is, trend, builds: rows(r[2]), events: ev.slice(0, 15), devices: { br: top(withCtx, 'br', 6), os: top(withCtx, 'os', 6), mode: top(withCtx, 'mode', 3) }, ctxCount: withCtx.length }];
  }
  if (path === '/status' && req.method === 'POST') {
    let b; try { b = JSON.parse(await req.text()); } catch (e) { return [400, { error: 'bad request' }]; }
    if (!b || !/^e_[0-9a-z]{1,10}$/.test(b.id || '') || !['open', 'fixed', 'ignored'].includes(b.status)) return [400, { error: 'bad request' }];
    const is = await db.prepare('SELECT id,last_build FROM issues WHERE id=?').bind(b.id).first(); if (!is) return [404, { error: 'not found' }];
    const fb = b.status === 'fixed' ? (typeof b.fixed_build === 'string' && /^[\w.\-]{1,40}$/.test(b.fixed_build) ? b.fixed_build : is.last_build || null) : null;
    await db.prepare('UPDATE issues SET status=?, fixed_build=?, fixed_at=? WHERE id=?').bind(b.status, fb, b.status === 'fixed' ? now : null, b.id).run();
    return [200, { ok: true, status: b.status, fixed_build: fb }];
  }
  return [404, { error: 'not found' }];
}

export default {
  async fetch(req, env) {
    const origin = req.headers.get('Origin') || '', url = new URL(req.url);
    const known = !origin || ALLOWED.includes(origin) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin) || origin === 'null';
    const cors = { 'Access-Control-Allow-Origin': known && origin ? origin : ALLOWED[0], 'Access-Control-Allow-Methods': 'POST, GET, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Vary': 'Origin' };
    const reply = (status, obj) => new Response(status === 204 ? null : JSON.stringify(obj || { error: 'no' }), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
    if (url.pathname.startsWith('/admin/')) {   // the dashboard: any website may ask, the secret token is the lock (no cookies are used)
      const ac = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Content-Type': 'application/json' };
      const say = (st, o) => new Response(JSON.stringify(o), { status: st, headers: ac });
      if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: ac });
      if (!env.ADMIN_TOKEN) return say(503, { error: 'ADMIN_TOKEN is not set on this Worker.', hint: 'Worker > Settings > Variables and secrets: add ADMIN_TOKEN with the same value as your Admin token.' });
      const m = /^Bearer (.+)$/.exec(req.headers.get('Authorization') || '');
      if (!m || !sameToken(m[1].trim(), env.ADMIN_TOKEN)) return say(401, { error: 'wrong token' });
      if (!env.DB) return say(500, { error: 'no database' });
      try { const [st, o] = await admin(req, env, url); return say(st, o); } catch (e) { return say(500, { error: 'busy' }); }
    }
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (req.method === 'GET' && url.pathname === '/health') return reply(200, { ok: true });
    if (req.method !== 'POST' || (url.pathname !== '/e' && url.pathname !== '/')) return reply(404);
    if (!known) return reply(403);
    if (!env.DB) return reply(500, { error: 'no database' });
    try { return reply(await ingest(req, env)); } catch (e) { return reply(500, { error: 'busy' }); }
  },
  async scheduled(event, env, ctx) { ctx.waitUntil(cleanup(env)); }
};
