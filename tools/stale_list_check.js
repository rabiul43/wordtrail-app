// Simulation check: a clip that was removed from the library (404) is skipped quietly, and the saved list is refreshed once.
//   node tools/stale_list_check.js
// It runs the REAL source of music-library.js, ambient-recordings.js and ambient-spot.js with a fake network and fake saved data.
// It does NOT prove Cloudflare, the real sites, or how a real phone behaves.
const fs = require('fs'), path = require('path'), root = path.join(__dirname, '..');
const src = f => fs.readFileSync(path.join(root, 'src/js/sound', f), 'utf8').replace(/__WT_HOST_MUSIC__/g, 'https://m.test/');
let pass = 0, fail = 0; const t = (n, ok, x) => { if (ok) pass++; else { fail++; console.log('FAIL: ' + n + (x ? ' ' + x : '')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
function world(opts) {   // fake store, fake Cache API, fake network
  const mem = {}, cacheMap = new Map(), log = [];
  const store = { get: (k, d) => (k in mem ? mem[k] : d), set: (k, v) => { mem[k] = v; } };
  const caches = { open: async () => ({ match: async u => cacheMap.get(u), put: async (u, r) => { cacheMap.set(u, r); }, keys: async () => [] }) };
  const mkResp = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body, arrayBuffer: async () => new ArrayBuffer(8), clone() { return this; } });
  const fetch = async (url, o) => { log.push({ url, cache: o && o.cache }); const r = opts.route(url); if (r === 'throw') throw new Error('offline'); return mkResp(r.status, r.body); };
  return { mem, store, caches, fetch, log };
}
function load(files, w, stubs, tail) {
  const code = files.map(src).join('\n') + '\n' + (tail || '');
  const scope = Object.assign({ store: w.store, caches: w.caches, fetch: w.fetch, navigator: { onLine: true }, AbortController, setTimeout, clearTimeout, URL, Request: class { constructor(u) { this.url = u; } },
    savePrefs() {}, sndTouch() {}, sndCachePrune() {}, musNarrating: () => true, musWarnPaint() {}, musicPlay() {}, console }, stubs);
  const proxy = new Proxy(scope, { has: (o, k) => typeof k === 'string' && !(k in globalThis && k !== 'name') ? true : k in o, get: (o, k) => (k === Symbol.unscopables ? undefined : k in o ? o[k] : (...a) => {}) });
  return new Function('__s', 'with(__s){' + code + '}')(proxy);
}
(async () => {
  // ---------- Music ----------
  const fresh = { v: 1, moods: { peace: [{ f: 'peace/a.mp3', e: 0.3 }, { f: 'peace/c.mp3', e: 0.3 }] } };
  const old = { v: 1, moods: { peace: [{ f: 'peace/a.mp3', e: 0.3 }, { f: 'peace/b.mp3', e: 0.3 }, { f: 'peace/c.mp3', e: 0.3 }] } };
  const w = world({ route: u => u === 'https://m.test/music.json' ? { status: 200, body: fresh } : /peace\/b\.mp3$/.test(u) ? { status: 404, body: {} } : { status: 200, body: {} } });
  const MUS = { manifest: old, mfT: Date.now() - 20 * 3600e3, recent: [], queue: [], playing: null, base: '', ctx: { decodeAudioData: async () => ({ dur: 10 }) } };
  w.store.set('wt:music-manifest', { t: MUS.mfT, d: old });
  const api = load(['music-library.js'], w, { MUS, MUS_LOCAL: false, MUS_FALLBACK: {}, S: {}, P: {} },
    `async function musLoadNext(gen) { const n = MUS.queue.length; for (let i = 0; i < n; i++) { const clip = musTake(); if (!clip) break; const buf = await musFetch(clip.f); if (buf) { musRemember(clip); return { clip, buf }; } } return null; }
     return { musLoadNext, musQueue, musFetch, musFetchManifest };`);
  const got = [];
  for (let k = 0; k < 6; k++) { MUS.queue = [{ f: 'peace/b.mp3' }, { f: 'peace/a.mp3' }, { f: 'peace/c.mp3' }]; MUS.recent = []; const g = await api.musLoadNext(1); got.push(g && g.clip.f); await sleep(20); }
  t('music: a removed clip (404) is skipped and a good clip plays', got.every(f => f === 'peace/a.mp3' || f === 'peace/c.mp3'), JSON.stringify(got));
  const mj = w.log.filter(x => x.url === 'https://m.test/music.json');
  t('music: the list was fetched again after the 404, with cache:no-cache', mj.length === 1 && mj[0].cache === 'no-cache', JSON.stringify(mj));
  t('music: the new list no longer has the removed clip', !JSON.stringify(MUS.manifest).includes('b.mp3'));
  t('music: only one refresh within 10 minutes (6 tries, many 404s)', mj.length === 1);
  // offline must NOT trigger a refresh
  const w2 = world({ route: () => 'throw' }); const MUS2 = { manifest: old, recent: [], queue: [], playing: null, base: '', ctx: MUS.ctx };
  const api2 = load(['music-library.js'], w2, { MUS: MUS2, MUS_LOCAL: false, MUS_FALLBACK: {}, S: {}, P: {} }, 'return { musFetch };');
  const r2 = await api2.musFetch('peace/b.mp3'); await sleep(20);
  t('music: offline returns null and does NOT ask for a new list', r2 === null && !w2.log.some(x => /music\.json/.test(x.url)));
  // ---------- Ambient recordings ----------
  const w3 = world({ route: u => u.endsWith('recordings.json') ? { status: 200, body: { rain: { file: 'rain-new.mp3' } } } : /gone\.mp3$/.test(u) ? { status: 404, body: {} } : { status: 200, body: {} } });
  const AMB = { ctx: { decodeAudioData: async () => ({ duration: 5 }) }, rec: {}, recBusy: {}, recFail: {}, recMap: { rain: { url: 'https://r2.test/gone.mp3' } } };
  w3.store.set('wt:ambrec', { t: Date.now() - 3600e3, d: { rain: { file: 'gone.mp3' } } });
  const api3 = load(['ambient-recordings.js'], w3, { AMB, P: {}, ambRecPaint() {}, ambSrcRefresh() {}, $$: () => [], $: () => null }, 'return { ambRecLoad };');
  await api3.ambRecLoad('rain'); await sleep(30);
  const rl = w3.log.filter(x => x.url.endsWith('recordings.json'));
  t('ambient recording: 404 is a quiet failure (generated sound plays)', !!AMB.recFail.rain && !AMB.rec.rain);
  t('ambient recording: the list was fetched again (cache:no-cache) and now points to the new file', rl.length === 1 && rl[0].cache === 'no-cache' && /rain-new/.test(AMB.recMap.rain && AMB.recMap.rain.url), JSON.stringify(rl) + JSON.stringify(AMB.recMap));
  // ---------- Ambient one-shot clips ----------
  const F = '18_micro-sound-effects/door-opening';
  const w4 = world({ route: u => u.endsWith('ambient-index.json') ? { status: 200, body: { [F]: { url: 'https://r2.test/door-new.mp3' } } } : /door-old\.mp3$/.test(u) ? { status: 404, body: {} } : { status: 200, body: {} } });
  const AMB4 = { ctx: { decodeAudioData: async () => ({}) } };
  w4.store.set('wt:ambspot', { t: Date.now() - 3600e3, d: { [F]: { url: 'https://r2.test/door-old.mp3' } } });
  const api4 = load(['ambient-spot.js'], w4, { AMB: AMB4, P: {}, AMB_R2: 'https://r2.test/' }, 'return { ambSpotLoad, AMB_SPOT };');
  api4.AMB_SPOT.idx = { [F]: { url: 'https://r2.test/door-old.mp3' } };
  await api4.ambSpotLoad('dooropen'); await sleep(30);
  const sl = w4.log.filter(x => x.url.endsWith('ambient-index.json'));
  t('ambient clip: 404 is a quiet failure (generated sound plays)', !!api4.AMB_SPOT.fail.dooropen && !api4.AMB_SPOT.buf.dooropen);
  t('ambient clip: the list was fetched again (cache:no-cache) and has the new file', sl.length === 1 && sl[0].cache === 'no-cache' && api4.AMB_SPOT.idx && /door-new/.test(JSON.stringify(api4.AMB_SPOT.idx)), JSON.stringify(sl) + JSON.stringify(api4.AMB_SPOT.idx));
  console.log('stale_list_check: ' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
})().catch(e => { console.log('CRASH ' + e.stack.split('\n').slice(0, 4).join(' | ')); process.exit(1); });
