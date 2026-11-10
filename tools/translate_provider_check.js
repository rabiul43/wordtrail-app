#!/usr/bin/env node
/* Automatic checks for the translation provider layer (160b) and how the live panel (161) uses it.
   No browser, no npm install:   node tools/translate_provider_check.js
   Loads the REAL files from src/js/. The network, IndexedDB and the clock are fakes (a small IndexedDB stand-in that
   supports only what 160b calls), so the checks prove the logic, not the real browser. Exit code 1 if a check fails, 2 if a file cannot be loaded. */
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const read = f => fs.readFileSync(path.join(__dirname, '..', 'src/js', f), 'utf8');
const SRC_TP = (() => { try { return read('160b-translate-provider.js'); } catch (e) { console.error('translate_provider_check: cannot load 160b: ' + e.message); process.exit(2); } })();
const SRC_LT = (() => { try { return read('161-live-translate.js'); } catch (e) { console.error('translate_provider_check: cannot load 161: ' + e.message); process.exit(2); } })();

const sleep = ms => new Promise(r => setTimeout(r, ms));
const settle = async (n = 8) => { for (let i = 0; i < n; i++) await new Promise(r => setImmediate(r)); };
const until = async (cond, ms = 3000) => { const t0 = Date.now(); while (!cond()) { if (Date.now() - t0 > ms) throw new Error('timed out waiting'); await sleep(5); } };
const rejects = async (p, code) => { try { await p; } catch (e) { assert.strictEqual(e.code, code, 'expected code ' + code + ', got ' + e.code); return e; } throw new Error('expected a rejection (' + code + ')'); };

/* ---------- fakes ---------- */
function fakeIDB() {
  const dbs = new Map(), later = fn => setImmediate(fn);
  function mkTx(rows) {
    const os = {
      get(k) { const r = {}; later(() => { r.result = rows.get(k); if (r.onsuccess) r.onsuccess(); }); return r; },
      put(v, k) { const r = {}; rows.set(k, JSON.parse(JSON.stringify(v))); later(() => { if (r.onsuccess) r.onsuccess(); }); return r; },
      count() { const r = {}; later(() => { r.result = rows.size; if (r.onsuccess) r.onsuccess(); }); return r; },
      index() {
        return { openCursor() {
          const r = {}, keys = [...rows.keys()].sort((a, b) => rows.get(a).ts - rows.get(b).ts); let i = -1;
          const step = () => later(() => { i++; r.result = i < keys.length ? { delete() { rows.delete(keys[i]); }, continue() { step(); } } : null; if (r.onsuccess) r.onsuccess(); });
          step(); return r;
        } };
      }
    };
    const tx = { objectStore: () => os };
    later(() => later(() => { if (tx.oncomplete) tx.oncomplete(); }));
    return tx;
  }
  return {
    dbs,
    rows: () => (dbs.get('wordtrail-tr') || { rows: new Map() }).rows,
    open(name) {
      const req = {};
      later(() => {
        let d = dbs.get(name); const fresh = !d; if (fresh) { d = { rows: new Map() }; dbs.set(name, d); }
        req.result = { createObjectStore() { return { createIndex() {} }; }, transaction() { return mkTx(d.rows); } };
        if (fresh && req.onupgradeneeded) req.onupgradeneeded();
        if (req.onsuccess) req.onsuccess();
      });
      return req;
    }
  };
}
const mkLS = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), has: k => m.has(k) }; };
const okRes = t => ({ ok: true, status: 200, json: async () => ({ responseData: { translatedText: t }, responseStatus: 200 }) });
const QUOTA = 'MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS FOR TODAY. NEXT AVAILABLE IN 02 HOURS 10 MINUTES 05 SECONDS';

/* One sandbox: 160b alone (extra = '' ) or 160b + 161 with the stubs the panel needs. */
function make(o = {}) {
  const ctl = { off: 0, calls: [], online: true, device: null, delay: 0, active: 0, maxActive: 0, onlineFn: null,
    fetchImpl: null };
  ctl.fetchImpl = async (url) => {
    const q = decodeURIComponent((/[?&]q=([^&]*)/.exec(url) || [])[1] || '');
    ctl.calls.push({ q, t: Date.now() }); ctl.active++; ctl.maxActive = Math.max(ctl.maxActive, ctl.active);
    try { if (ctl.delay) await sleep(ctl.delay); } finally { ctl.active--; }
    return ctl.respond ? ctl.respond(q) : okRes('T:' + q);
  };
  const ls = o.ls || mkLS(), idb = o.idb === null ? undefined : (o.idb || fakeIDB());
  const g = {
    setTimeout, clearTimeout, AbortController, Math, JSON, String, Promise, Error,
    Date: { now: () => Date.now() + ctl.off },
    localStorage: ls, indexedDB: idb,
    window: { addEventListener: (n, f) => { if (n === 'online') ctl.onlineFn = f; }, matchMedia: () => ({ matches: false }) },
    navigator: { get onLine() { return ctl.online; } },
    trChunks: o.chunks || (t => [t]), trDecode: x => x,
    ltOnDevice: async (t, l) => (ctl.device ? ctl.device(t, l) : null),
    fetch: (u, op) => ctl.fetchImpl(u, op)
  };
  const ctx = vm.createContext(g);
  let src = SRC_TP + '\nthis.TP = TP;';
  if (o.panel) {   // the live panel: its real code with the smallest stubs that let it run
    const el = (tag) => ({ tag, textContent: '', hidden: false, value: '', cls: new Set(), kids: [],
      classList: { toggle(c, on) { on ? this._s.add(c) : this._s.delete(c); }, add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); }, contains(c) { return this._s.has(c); }, _s: new Set() },
      setAttribute() {}, addEventListener() {}, append() {}, getBoundingClientRect: () => ({ height: 0 }), scrollHeight: 0, scrollTop: 0, clientHeight: 0 });
    g.h = (tag, attrs, ...kids) => { const e = el(tag); e.attrs = attrs || {}; return e; };
    g.$ = () => null; g.$$ = () => []; g.P = { liveTr: true, tlang: 'bn' }; g.savePrefs = () => {}; g.guideDoc = () => {};
    g.TR_LANGS = [['bn', 'Bengali'], ['hi', 'Hindi']]; g.trLang = () => g.P.tlang;
    g.S = { book: {}, model: { sents: o.sents }, curId: 0, spans: new Map(), follow: false };
    g.NR = { on: false }; g.nrEl = { root: { hidden: true } }; g.el = { player: { hidden: false } };
    g.document = { body: { append() {} }, documentElement: { classList: { toggle() {}, remove() {} }, style: { setProperty() {}, removeProperty() {} } } };
    src += '\n' + SRC_LT + '\nthis.LT = LT; this.ltUpdate = ltUpdate; this.ltCache = ltCache;';
  }
  vm.runInContext(src, ctx);
  ctx.TP._t.CFG.gap = o.gap == null ? 20 : o.gap;
  return { TP: ctx.TP, ctl, ls, idb, ctx, g };
}

/* ---------- the checks ---------- */
let pass = 0, fail = 0; const queue = [];
const t = (name, fn) => queue.push([name, fn]);

t('translates a sentence, saves it, and a repeat makes no request', async () => {
  const m = make(), a = await m.TP.get('Hello world.', 'bn', { prio: 0, owner: 'x' });
  assert.strictEqual(a, 'T:Hello world.'); assert.strictEqual(m.ctl.calls.length, 1);
  assert.strictEqual(await m.TP.get('Hello world.', 'bn'), a); assert.strictEqual(m.ctl.calls.length, 1);
  assert.strictEqual(m.TP.peek('Hello world.', 'bn'), a); assert.strictEqual(m.TP.peek('Never asked.', 'bn'), '');
});
t('empty text gives an empty answer without a request; the answer is trimmed', async () => {
  const m = make(); assert.strictEqual(await m.TP.get('   ', 'bn'), ''); assert.strictEqual(m.ctl.calls.length, 0);
  m.ctl.respond = () => okRes('  spaced  '); assert.strictEqual(await m.TP.get('x one', 'bn'), 'spaced');
});
t('saved in IndexedDB: a new session (new instance, same database) makes no request', async () => {
  const idb = fakeIDB(), m1 = make({ idb }); await m1.TP.get('The castle stood silent.', 'bn'); await settle();
  assert.strictEqual(idb.rows().size, 1);
  const m2 = make({ idb }); assert.strictEqual(await m2.TP.get('The castle stood silent.', 'bn'), 'T:The castle stood silent.'); assert.strictEqual(m2.ctl.calls.length, 0);
});
t('one record per sentence and language', async () => {
  const idb = fakeIDB(), m = make({ idb }); await m.TP.get('Same words.', 'bn'); await m.TP.get('Same words.', 'hi'); await m.TP.get('Other words.', 'bn'); await settle();
  assert.strictEqual(m.ctl.calls.length, 3); assert.strictEqual(idb.rows().size, 3);
  const rec = [...idb.rows().values()][0]; assert.deepStrictEqual(Object.keys(rec).sort(), ['p', 's', 't', 'ts']); assert.strictEqual(rec.p, 'mymemory');
});
t('a hash clash is a miss (the saved sentence must match exactly)', async () => {
  const idb = fakeIDB(), m1 = make({ idb }); await m1.TP.get('Real sentence.', 'bn'); await settle();
  for (const v of idb.rows().values()) v.s = 'A different sentence.';
  const m2 = make({ idb }); await m2.TP.get('Real sentence.', 'bn'); assert.strictEqual(m2.ctl.calls.length, 1);
});
t('works without IndexedDB (memory only)', async () => {
  const m = make({ idb: null }); await m.TP.get('Only memory.', 'bn'); await m.TP.get('Only memory.', 'bn'); assert.strictEqual(m.ctl.calls.length, 1);
});
t('the same sentence asked three times at once is one request', async () => {
  const m = make(); m.ctl.delay = 15;
  const r = await Promise.all([m.TP.get('Shared one.', 'bn'), m.TP.get('Shared one.', 'bn', { prio: 1 }), m.TP.get('Shared one.', 'bn')]);
  assert.deepStrictEqual([...r], ['T:Shared one.', 'T:Shared one.', 'T:Shared one.']); assert.strictEqual(m.ctl.calls.length, 1);
});
t('one request at a time, at least the gap apart', async () => {
  const m = make({ gap: 40 }); m.ctl.delay = 10;
  await Promise.all(['a one', 'b two', 'c three', 'd four', 'e five'].map(s => m.TP.get(s, 'bn')));
  assert.strictEqual(m.ctl.maxActive, 1);
  const ts = m.ctl.calls.map(c => c.t); for (let i = 1; i < ts.length; i++) assert.ok(ts[i] - ts[i - 1] >= 35, 'gap ' + (ts[i] - ts[i - 1]));
});
t('the sentence being read (prio 0) goes before sentences fetched ahead (prio 1)', async () => {
  const m = make(); m.ctl.delay = 40;
  const first = m.TP.get('first one', 'bn', { prio: 1, owner: 'lt' });
  await until(() => m.ctl.calls.length === 1);
  const a1 = m.TP.get('ahead one', 'bn', { prio: 1, owner: 'lt' }), a2 = m.TP.get('ahead two', 'bn', { prio: 1, owner: 'lt' }), now = m.TP.get('now one', 'bn', { prio: 0, owner: 'lt' });
  await Promise.all([first, a1, a2, now]);
  assert.deepStrictEqual(m.ctl.calls.map(c => c.q), ['first one', 'now one', 'ahead one', 'ahead two']);
});
t('drop(owner) cancels waiting requests but not the one already running', async () => {
  const m = make(); m.ctl.delay = 40;
  const first = m.TP.get('running one', 'bn', { prio: 0, owner: 'lt' });
  await until(() => m.ctl.calls.length === 1);
  const x = m.TP.get('waiting x', 'bn', { prio: 1, owner: 'lt' }), y = m.TP.get('waiting y', 'bn', { prio: 1, owner: 'lt' }), keep = m.TP.get('other owner', 'bn', { prio: 1, owner: 'zz' });
  await settle(); m.TP.drop('lt');
  await rejects(x, 'dropped'); await rejects(y, 'dropped');
  assert.strictEqual(await first, 'T:running one'); assert.strictEqual(await keep, 'T:other owner');
  assert.deepStrictEqual(m.ctl.calls.map(c => c.q), ['running one', 'other owner']);
});
t('drop right after asking (still reading the saved copy) rejects; asking again at once revives it', async () => {
  const m = make(), z = m.TP.get('quick z', 'bn', { owner: 'lt' }); m.TP.drop('lt'); await rejects(z, 'dropped');
  const w = m.TP.get('quick w', 'bn', { owner: 'lt' }); m.TP.drop('lt'); const w2 = m.TP.get('quick w', 'bn', { owner: 'lt' });
  assert.strictEqual(await w2, 'T:quick w'); assert.strictEqual(await w, 'T:quick w'); assert.strictEqual(m.ctl.calls.length, 1);
});
t('daily limit in the answer text: limit state, wait read from the text, warning text never saved, nothing sent while paused, saved sentences still work', async () => {
  const m = make(); await m.TP.get('Saved before.', 'bn');
  m.ctl.respond = () => okRes(QUOTA);
  const e = await rejects(m.TP.get('New one.', 'bn'), 'limit');
  const s = m.TP.state(); assert.strictEqual(s.state, 'limit');
  const w = s.until - Date.now() - m.ctl.off; assert.ok(w > 128 * 60000 && w <= 131 * 60000, 'wait ' + w); assert.ok(e.retryAt === s.until);
  assert.ok(m.ls.has('wt:trlimit'));
  const n = m.ctl.calls.length; await rejects(m.TP.get('Another new.', 'bn'), 'limit'); assert.strictEqual(m.ctl.calls.length, n);
  assert.strictEqual(await m.TP.get('Saved before.', 'bn'), 'T:Saved before.');
  m.ctl.off += 3 * 3600000; assert.strictEqual(m.TP.state().state, 'ok');
  m.ctl.respond = null; assert.strictEqual(await m.TP.get('New one.', 'bn'), 'T:New one.');   // the warning was not saved as a translation
  assert.ok(!m.ls.has('wt:trlimit'));
});
t('HTTP 429 without text: waits grow 30 min, then 1 h; a success clears it', async () => {
  const m = make(); m.ctl.respond = () => ({ ok: false, status: 429, json: async () => ({}) });
  await rejects(m.TP.get('Limit a.', 'bn'), 'limit'); let w = m.TP.state().until - Date.now() - m.ctl.off; assert.ok(w > 29 * 60000 && w <= 30 * 60000 + 100, 'first ' + w);
  m.ctl.off += 31 * 60000; await rejects(m.TP.get('Limit b.', 'bn'), 'limit'); w = m.TP.state().until - Date.now() - m.ctl.off; assert.ok(w > 59 * 60000 && w <= 60 * 60000 + 100, 'second ' + w);
  m.ctl.off += 61 * 60000; m.ctl.respond = null; await m.TP.get('Limit c.', 'bn'); assert.strictEqual(m.TP.state().state, 'ok'); assert.ok(!m.ls.has('wt:trlimit'));
});
t('the limit is remembered on this device (new session starts paused; an old one starts normal)', async () => {
  const m1 = make(); m1.ctl.respond = () => okRes(QUOTA); await rejects(m1.TP.get('Over.', 'bn'), 'limit');
  const m2 = make({ ls: m1.ls }); assert.strictEqual(m2.TP.state().state, 'limit'); await rejects(m2.TP.get('Over again.', 'bn'), 'limit'); assert.strictEqual(m2.ctl.calls.length, 0);
  const ls = mkLS(); ls.setItem('wt:trlimit', JSON.stringify({ until: Date.now() - 1000, hits: 2 })); assert.strictEqual(make({ ls }).TP.state().state, 'ok');
});
t('network trouble: backoff 1.5 s, 3 s, 6 s ... (with a little jitter), cap 60 s, nothing sent while waiting, success resets', async () => {
  const m = make(); m.ctl.fetchImpl = async () => { throw new TypeError('network'); };
  for (let n = 1; n <= 9; n++) {
    const e = await rejects(m.TP.get('Net ' + n, 'bn'), 'wait');
    const w = m.TP.state().until - Date.now() - m.ctl.off, base = Math.min(60000, 1500 * Math.pow(2, n - 1));
    assert.ok(w >= base * 0.8 - 5 && w <= base * 1.2 + 5, 'step ' + n + ' wait ' + w + ' base ' + base); assert.ok(e.retryAt);
    m.ctl.off += 70000;
  }
  const m2 = make(); m2.ctl.fetchImpl = async () => { throw new TypeError('x'); };
  await rejects(m2.TP.get('Wait a.', 'bn'), 'wait'); let calls = 0; m2.ctl.fetchImpl = async () => { calls++; return okRes('x'); };
  await rejects(m2.TP.get('Wait b.', 'bn'), 'wait'); assert.strictEqual(calls, 0);   // paused: not even tried
  m2.ctl.off += 5000; assert.strictEqual(await m2.TP.get('Wait b.', 'bn'), 'x'); assert.strictEqual(m2.TP.state().state, 'ok'); assert.strictEqual(m2.TP.state().fails, 0);
});
t('server errors (5xx) back off; a refused sentence (4xx) does not pause anything', async () => {
  const m = make(); m.ctl.respond = () => ({ ok: false, status: 503, json: async () => ({}) }); await rejects(m.TP.get('Five.', 'bn'), 'wait');
  const m2 = make(); m2.ctl.respond = () => ({ ok: false, status: 400, json: async () => ({}) }); await rejects(m2.TP.get('Four.', 'bn'), 'fail'); assert.strictEqual(m2.TP.state().state, 'ok');
  m2.ctl.respond = null; assert.strictEqual(await m2.TP.get('Four again.', 'bn'), 'T:Four again.');
});
t('offline is its own short state and clears when the browser says it is back', async () => {
  const m = make(); m.ctl.online = false; m.ctl.fetchImpl = async () => { throw new TypeError('offline'); };
  const e = await rejects(m.TP.get('Off.', 'bn'), 'offline'); assert.strictEqual(m.TP.state().state, 'offline'); assert.ok(e.retryAt);
  let seen = ''; m.TP.onState(s => { seen = s.state; }); m.ctl.online = true; m.ctl.onlineFn(); assert.strictEqual(m.TP.state().state, 'ok'); assert.strictEqual(seen, 'ok');
});
t('a request that never answers is cut off after the timeout and backs off', async () => {
  const m = make(); m.TP._t.CFG.timeout = 40;
  m.ctl.fetchImpl = (u, o) => new Promise((res, rej) => { o.signal.addEventListener('abort', () => rej(new Error('aborted'))); });
  await rejects(m.TP.get('Hangs.', 'bn'), 'wait');
});
t('the device translator goes first and needs no request; when it has no language pack the free service is used', async () => {
  const m = make(); m.ctl.device = (txt) => 'D:' + txt;
  assert.strictEqual(await m.TP.get('From device.', 'bn'), 'D:From device.'); assert.strictEqual(m.ctl.calls.length, 0); await settle();
  assert.strictEqual([...m.idb.rows().values()][0].p, 'device');
  m.ctl.device = () => null; assert.strictEqual(await m.TP.get('No pack.', 'bn'), 'T:No pack.'); assert.strictEqual(m.ctl.calls.length, 1);
  m.ctl.device = () => { throw new Error('boom'); }; assert.strictEqual(await m.TP.get('Pack broke.', 'bn'), 'T:Pack broke.');
});
t('a limit does not stop the device translator', async () => {
  const m = make(); m.ctl.respond = () => okRes(QUOTA); await rejects(m.TP.get('Hit it.', 'bn'), 'limit');
  m.ctl.device = txt => 'D:' + txt; assert.strictEqual(await m.TP.get('Device still works.', 'bn'), 'D:Device still works.');
});
t('another provider can be registered (order decides) and replaced by id', async () => {
  const m = make(); m.TP.register({ id: 'mine', order: 5, live: false, async translate(x) { return 'M:' + x; } });
  assert.deepStrictEqual([...m.TP.providers()], ['mine', 'device', 'mymemory']); assert.strictEqual(await m.TP.get('Plug in.', 'hi'), 'M:Plug in.');
  m.TP.register({ id: 'mine', order: 30, live: false, async translate(x) { return 'N:' + x; } }); assert.deepStrictEqual([...m.TP.providers()], ['device', 'mymemory', 'mine']);
});
t('a long sentence sent in parts is joined (language-neutral, parts come from trChunks)', async () => {
  const m = make({ chunks: x => x.split('|') }); assert.strictEqual(await m.TP.get('part one|part two', 'hi'), 'T:part one T:part two'); assert.strictEqual(m.ctl.calls.length, 2);
});
t('the cache is trimmed: above the maximum the oldest are removed down to the lower mark', async () => {
  const idb = fakeIDB(), m = make({ idb }); const C = m.TP._t.CFG; C.maxEntries = 5; C.pruneTo = 3; C.pruneEvery = 1;
  for (let i = 0; i < 8; i++) { await m.TP.get('sentence number ' + i, 'bn'); m.ctl.off += 10; await settle(12); }
  assert.strictEqual(idb.rows().size, 5);
  const texts = [...idb.rows().values()].map(r => r.s).sort();
  assert.deepStrictEqual(texts, [3, 4, 5, 6, 7].map(i => 'sentence number ' + i));
});
t('SIMULATION: 40 sentences read at speed against a service that stops after 25 requests; then the next day', async () => {
  const m = make({ gap: 25 }); let served = 0, limited = 0;
  m.ctl.respond = q => { if (served >= 25) { limited++; return { ok: false, status: 429, json: async () => ({}) }; } served++; return okRes('T:' + q); };
  const sents = Array.from({ length: 40 }, (_, i) => 'Sentence number ' + i + ' of the sample chapter.'), got = [], refused = [];
  for (let i = 0; i < 40; i++) {   // the reader: ask for the current one (prio 0) and the next one (prio 1), drop what is stale, move on
    m.TP.drop('lt');
    m.TP.get(sents[i], 'bn', { prio: 0, owner: 'lt' }).then(v => got.push(i), e => { if (e.code !== 'dropped') refused.push(e.code); });
    if (sents[i + 1]) m.TP.get(sents[i + 1], 'bn', { prio: 1, owner: 'lt' }).catch(() => {});
    await sleep(45);
  }
  await sleep(150);
  assert.strictEqual(m.ctl.maxActive, 1, 'never two at once'); assert.strictEqual(limited, 1, 'after the limit answer nothing more was sent (probe count ' + limited + ')');
  assert.strictEqual(served, 25); assert.ok(got.length >= 20, 'translated ' + got.length); assert.ok(refused.length > 0 && refused.every(c => c === 'limit'), 'refused: ' + refused.join());
  assert.strictEqual(m.TP.state().state, 'limit');
  const idbCount = (await settle(10), m.idb.rows().size); assert.strictEqual(idbCount, 25);
  m.ctl.off += 8 * 3600000; m.ctl.respond = null; assert.strictEqual(await m.TP.get(sents[39], 'bn'), 'T:' + sents[39]); assert.strictEqual(m.TP.state().state, 'ok');
});

/* ---------- the live panel, with the real 161 code ---------- */
const SENTS = Array.from({ length: 30 }, (_, i) => ({ t: 'Sentence ' + i + ' reads here.' }));
t('PANEL: shows "Translating…" first, then the sentence and the next one; the next sentence is ready when the reader moves on', async () => {
  const m = make({ panel: true, sents: SENTS, gap: 10 }), { LT, ltUpdate } = m.ctx;
  m.g.S.curId = 3; ltUpdate(); assert.strictEqual(LT.box.cur.textContent, 'Translating\u2026');
  await until(() => LT.box.cur.textContent === 'T:Sentence 3 reads here.' && LT.box.next.textContent === 'T:Sentence 4 reads here.');
  m.g.S.curId = 4; ltUpdate(); assert.strictEqual(LT.box.cur.textContent, 'T:Sentence 4 reads here.'); assert.strictEqual(LT.box.prev.textContent, 'T:Sentence 3 reads here.');
});
t('PANEL: at the limit it says so, sends nothing more, and still shows saved sentences from an earlier session', async () => {
  const idb = fakeIDB(), a = make({ panel: true, sents: SENTS, gap: 10, idb }), A = a.ctx;
  a.g.S.curId = 3; A.ltUpdate(); await until(() => A.LT.box.next.textContent === 'T:Sentence 4 reads here.'); await settle(10);
  const b = make({ panel: true, sents: SENTS, gap: 10, idb, ls: a.ls }), B = b.ctx;   // a new session, same database
  b.ctl.respond = () => okRes(QUOTA);
  b.g.S.curId = 20; B.ltUpdate(); await until(() => B.LT.box.cur.textContent.indexOf('limit') >= 0);
  assert.ok(/free translation limit is used up/.test(B.LT.box.cur.textContent)); const n = b.ctl.calls.length; assert.strictEqual(n, 1);
  b.g.S.curId = 21; B.ltUpdate(); await sleep(60); assert.strictEqual(b.ctl.calls.length, n, 'paused: no new request'); assert.ok(/limit/.test(B.LT.box.cur.textContent));
  b.g.S.curId = 3; B.ltUpdate(); await until(() => B.LT.box.cur.textContent === 'T:Sentence 3 reads here.');   // saved earlier: shown although the limit is on
  assert.strictEqual(b.ctl.calls.length, n);
  b.ctl.off += 3 * 3600000; b.ctl.respond = null; b.g.S.curId = 22; B.ltUpdate();   // the pause is over: it asks again by itself
  await until(() => B.LT.box.cur.textContent === 'T:Sentence 22 reads here.');
});
t('PANEL: offline shows the offline message and recovers when the browser is back', async () => {
  const m = make({ panel: true, sents: SENTS, gap: 10 }), { LT, ltUpdate } = m.ctx;
  m.ctl.online = false; m.ctl.fetchImpl = async () => { throw new TypeError('offline'); };
  m.g.S.curId = 7; ltUpdate(); await until(() => /offline/.test(LT.box.cur.textContent));
  m.ctl.fetchImpl = async (u) => okRes('T:' + decodeURIComponent(/q=([^&]*)/.exec(u)[1])); m.ctl.online = true; m.ctl.onlineFn();
  await until(() => LT.box.cur.textContent === 'T:Sentence 7 reads here.');
});

(async () => {
  for (const [name, fn] of queue) {
    try { await fn(); pass++; console.log('ok    ' + name); } catch (e) { fail++; console.log('FAIL  ' + name + '\n        ' + String(e && e.message).split('\n').slice(0, 5).join('\n        ')); }
  }
  console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
})();
