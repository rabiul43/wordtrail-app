#!/usr/bin/env node
/* Automatic checks for the offline learning pack (283-learning-pack.js pure part LPKC) and its wiring. No browser.
     node tools/learning_pack_check.js
   Loads the REAL source between the LPKC-START / LPKC-END markers; the service worker is run in a vm with stand-in Cache API and fetch.
   Exit code 1 if a check fails, 2 if the code cannot be loaded. */
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const root = path.join(__dirname, '..'), read = f => fs.readFileSync(path.join(root, f), 'utf8');
const src = read('src/js/283-learning-pack.js');
let C;
try {
  const a = src.indexOf('/*LPKC-START*/'), b = src.indexOf('/*LPKC-END*/');
  if (a < 0 || b < 0) throw new Error('markers not found');
  const ctx = vm.createContext({});
  vm.runInContext('const LPKC = (() => {' + src.slice(a + 14, b) + '\nthis.C = LPKC;', ctx); C = ctx.C;
} catch (e) { console.error('learning_pack_check: cannot load the code: ' + e.message); process.exit(2); }
let pass = 0, fail = 0;
const todo = [];
function t(name, fn) { todo.push([name, fn]); }
const J = x => JSON.parse(JSON.stringify(x));
const full = lang => ({ t: 1, lang, it: { old: { ok: 1 }, words: { ok: 1, sz: 120000 }, mean: { ok: 1, n: 240, of: 240, sz: 80000 }, tr: { ok: 1, sz: 1000000, lang }, text: { ok: 1, sz: 5000 } } });

t('no record is "none", nothing is saved', () => { const s = C.state(null, 'bn'); assert.strictEqual(s.k, 'none'); assert.strictEqual(s.done, 0); assert.strictEqual(s.total, 5); });
t('a full record is "full" and adds up the sizes', () => { const s = C.state(full('bn'), 'bn'); assert.strictEqual(s.k, 'full'); assert.strictEqual(s.size, 120000 + 80000 + 1000000 + 5000); assert.strictEqual(s.frac, 1); });
t('half-way through the meanings is "part" with a fraction between steps', () => {
  const r = { it: { old: { ok: 1 }, words: { ok: 1, sz: 10 }, mean: { n: 120, of: 240 } } };
  const s = C.state(r, 'bn'); assert.strictEqual(s.k, 'part'); assert.strictEqual(s.done, 2);
  assert.ok(Math.abs(s.frac - (2.5 / 5)) < 1e-9); assert.strictEqual(J(s.list.find(i => i.id === 'mean')).st, 'part');
});
t('a book with no word list or no translation pack counts as done ("na"), not as missing', () => {
  const r = full('bn'); r.it.words = { ok: 1, na: 1, sz: 0 }; r.it.tr = { ok: 1, na: 1, lang: 'bn', sz: 0 };
  const s = C.state(r, 'bn'); assert.strictEqual(s.k, 'full'); assert.deepStrictEqual(J(s.list.map(i => i.st)), ['done', 'na', 'done', 'na', 'done']);
});
t('a translation saved for another language is not done for the current one (Continue offers it)', () => {
  const s = C.state(full('bn'), 'hi'); assert.strictEqual(s.k, 'part'); assert.strictEqual(s.done, 4); assert.strictEqual(C.itemDone(full('bn'), 'tr', 'hi'), false);
});
t('an item without ok:1 is never done', () => assert.strictEqual(C.itemDone({ it: { words: { sz: 5 } } }, 'words', 'bn'), false));
t('wordsOf: unique, lower case, at most CAP, ignores bad rows', () => {
  const rows = [['Gloom', 'B2', 5, 'x'], ['gloom', 'B2', 1, ''], ['  Dread ', 'C1', 2, ''], [7], null, ['', 'B1'], 'plain', ['x'.repeat(50)]];
  assert.deepStrictEqual(J(C.wordsOf({ w: rows })), ['gloom', 'dread', 'plain']);
  const big = { w: Array.from({ length: 900 }, (_, i) => ['w' + i]) }; assert.strictEqual(C.wordsOf(big).length, C.CAP);
  assert.deepStrictEqual(J(C.wordsOf(null)), []); assert.deepStrictEqual(J(C.wordsOf({ w: 'no' })), []);
});
t('clean: broken or foreign data becomes empty, unknown items are dropped, a good record stays', () => {
  [null, 5, 'x', { v: 2, b: {} }, { v: 1 }, { v: 1, b: 3 }].forEach(s => assert.deepStrictEqual(J(C.clean(s)), { v: 1, b: {} }));
  const c = C.clean({ v: 1, b: { 12: { t: 5, lang: 'bn', it: { words: { ok: 1 }, junk: { ok: 1 } } }, 13: 7, 14: { it: 3 } } });
  assert.deepStrictEqual(Object.keys(c.b), ['12']); assert.deepStrictEqual(Object.keys(c.b['12'].it), ['words']);
});
t('state never throws on a damaged record', () => [undefined, {}, { it: null }, { it: { mean: null } }, 'x', 5].forEach(r => assert.strictEqual(C.state(r, 'bn').k, 'none')));

/* ---- service worker: the learning files are served from the kept copy only when the page kept them ---- */
function loadSW() {
  const stores = {}, listeners = {};
  const mk = n => stores[n] || (stores[n] = new Map());
  const caches = {
    open: async n => ({ match: async k => { const r = mk(n).get(typeof k === 'string' ? k : k.url); return r ? r.clone() : undefined; }, put: async (k, r) => { mk(n).set(typeof k === 'string' ? k : k.url, r); }, keys: async () => [...mk(n).keys()].map(url => ({ url })), delete: async k => mk(n).delete(k.url || k) }),
    keys: async () => Object.keys(stores), delete: async n => delete stores[n]
  };
  const env = { net: 'ok', calls: 0 };
  const ctx = vm.createContext({
    self: { registration: { scope: 'https://x.test/app/' }, addEventListener: (e, f) => { listeners[e] = f; }, location: { href: 'https://x.test/app/sw.js' }, clients: { claim() {}, matchAll: async () => [] }, skipWaiting() {} },
    caches, URL, Response, Headers, Promise, setTimeout, clearTimeout, console, crypto: { subtle: {} }, TextDecoder,
    fetch: async () => { env.calls++; if (env.net === 'fail') throw new Error('offline'); if (env.net === '404') return new Response('no', { status: 404 }); return new Response('NET', { status: 200 }); }
  });
  vm.runInContext(read('src/pwa/sw.js'), ctx);
  const ask = async url => {
    let out; const waits = [];
    listeners.fetch({ request: { method: 'GET', url, mode: 'cors', destination: '' }, respondWith: p => { out = p; }, waitUntil: p => waits.push(p) });
    if (!out) return null;
    const r = await out; await Promise.all(waits); return r;
  };
  return { env, mk, ask, ctx, listeners, stores };
}
const HF = 'https://huggingface.co/datasets/rabiul43/wordtrail-text/resolve/main/data/';
t('sw: a learning file the page did NOT keep is left to the browser and never saved', async () => {
  const w = loadSW(); w.env.net = 'ok';
  const r = await w.ask(HF + 'vocab/84.json'); assert.strictEqual(await r.text(), 'NET'); assert.strictEqual((w.mk('wt-learn-v1')).size, 0);
});
t('sw: a kept file is served when the network fails', async () => {
  const w = loadSW(); w.mk('wt-learn-v1').set(HF + 'vocab/84.json', new Response('KEPT'));
  w.env.net = 'fail'; assert.strictEqual(await (await w.ask(HF + 'vocab/84.json')).text(), 'KEPT');
  w.env.net = '404'; assert.strictEqual(await (await w.ask(HF + 'vocab/84.json')).text(), 'KEPT');   // an error page does not replace it either
  assert.strictEqual(await w.mk('wt-learn-v1').get(HF + 'vocab/84.json').text(), 'KEPT');
});
t('sw: a quick network answer is used and renews the kept file', async () => {
  const w = loadSW(); w.mk('wt-learn-v1').set(HF + 'packs/84.bn.json.gz', new Response('OLD'));
  w.env.net = 'ok'; assert.strictEqual(await (await w.ask(HF + 'packs/84.bn.json.gz')).text(), 'NET');
  assert.strictEqual(await w.mk('wt-learn-v1').get(HF + 'packs/84.bn.json.gz').text(), 'NET');
});
t('sw: github fallback address is covered; audio, text and other data are not touched', async () => {
  const w = loadSW(); w.mk('wt-learn-v1').set('https://raw.githubusercontent.com/o/r/main/vocab/84.json', new Response('KEPT'));
  w.env.net = 'fail'; assert.strictEqual(await (await w.ask('https://raw.githubusercontent.com/o/r/main/vocab/84.json')).text(), 'KEPT');
  for (const u of ['https://archive.org/download/x/ch1.mp3', HF + 'levels.json', HF + 'vocab/sub/84.json'])
    assert.strictEqual(await w.ask(u), null, u);
  // another dataset with the same folder names: not kept by the page, so it goes to the network untouched and is never saved
  w.env.net = 'ok'; assert.strictEqual(await (await w.ask('https://huggingface.co/other/y/resolve/main/data/vocab/84.json')).text(), 'NET'); assert.strictEqual(w.mk('wt-learn-v1').size, 1);
});
t('sw: the learn cache survives activation clean-up (older wt- caches go, others stay)', async () => {
  const w = loadSW(); w.mk('wt-learn-v1').set('k', new Response('x')); w.mk('wt-shell-v0').set('k', new Response('x')); w.mk('wt-amb-rec').set('k', new Response('x'));
  let p; await new Promise(res => w.listeners.activate({ waitUntil: x => { p = x; res(); } })); await p;
  assert.ok(w.stores['wt-learn-v1'] && w.stores['wt-amb-rec'] && !w.stores['wt-shell-v0']);
});

/* ---- wiring: the pieces the pack needs exist, and nothing else was added to the audio downloader ---- */
t('wiring: build.py lists the file once, after 282; the card and the Downloads list use LPK; fetchText shares textUrls', () => {
  const b = read('build.py'); assert.strictEqual(b.split('283-learning-pack.js').length - 1, 1);
  assert.ok(b.indexOf('282-library-hub.js') < b.indexOf('283-learning-pack.js'));
  assert.ok(/LPK\.row\(b\)/.test(read('src/js/281-book-download-card.js')) && /LPK\.paint\(\)/.test(read('src/js/281-book-download-card.js')));
  assert.ok(/LPK\.size\(/.test(read('src/js/030-helpers-offline-audio.js')));
  assert.ok(/const textUrls/.test(read('src/js/070-network-data.js')) && /readJson, _t:/.test(read('src/js/160c-translate-pack.js')));
  assert.ok(!/dlStart|adb\./.test(src.replace(/\/\*[\s\S]*?\*\//g, '')), 'the pack must not use the audio downloader');
});
t('wiring: nothing in the pack file runs at load time except declarations', () => {
  const body = src.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter(l => /^\S|^ {2}\S/.test(l)).filter(l => !/^ {2}(const|\/\/)|^ {2}\}\)\(\);/.test(l));
  assert.deepStrictEqual(body, []);
});


/* ---- deletion: run the REAL LPK with stand-in storage and prove nothing is left behind ---- */
function loadLPK() {
  const idbm = new Map(), ls = new Map(), cstore = new Map(), log = { confirm: 0 };
  const stubs = {
    store: { get: (k, d) => ls.has(k) ? JSON.parse(ls.get(k)) : d, set: (k, v) => { ls.set(k, JSON.stringify(v)); } },
    idb: { get: async k => idbm.get(k), set: async (k, v) => { idbm.set(k, v); return true; }, del: async k => idbm.delete(k) },
    caches: { open: async () => ({ keys: async () => [...cstore.keys()].map(url => ({ url })), delete: async r => cstore.delete(r.url), put: async (k, r) => { cstore.set(k, r); } }) },
    DICT: { key: w => 'dict:' + String(w).trim().toLowerCase(), get: async () => ({ ok: true, data: {} }) },
    WS: { all: () => [{ w: 'Dread' }] }, VOC: { books: new Map() }, TR_LANGS: [['bn', 'Bengali'], ['hi', 'Hindi']],
    askConfirm: async () => { log.confirm++; return true; }, toast() {}, $: () => null, h: () => ({}), audio: { paused: true }, OFF: { on: false },
    trLang: () => 'bn', LearnHub: { refresh() {} }, S: {}, TPK: {}, vocBook: async () => null, findGutenbergFor: async () => ({ id: '1' }), getGutenberg: async () => 'x', textUrls: n => [n],
    self: { caches: {} }, navigator: {}, location: { href: 'https://x/' }, Response, URL, RegExp, encodeURIComponent, Object, Set, Map, Array, String, JSON, Date, Math, Promise
  };
  stubs.self.caches = stubs.caches;
  const code = src.replace(/^[\s\S]*?(?=  const LPKC = )/, '');
  const ctx = vm.createContext(stubs);
  vm.runInContext(code + '\nthis.LPK = LPK;', ctx);
  return { LPK: ctx.LPK, idbm, ls, cstore, log };
}
const seedPack = (w, id, extra) => {
  w.ls.set('wt:lpk', JSON.stringify({ v: 1, b: Object.assign({ [id]: { t: 1, lang: 'bn', it: { old: { ok: 1 }, words: { ok: 1, sz: 10 }, mean: { ok: 1, sz: 5, n: 3, of: 3 }, tr: { ok: 1, lang: 'bn', sz: 9 }, text: { ok: 1, gid: '55', own: 1, sz: 4 } } } }, extra || {}) }));
  w.idbm.set('vocab:' + id, { v: 1, w: [['Gloom', 'B2'], ['Dread', 'B2'], ['Shared', 'B1']] });
  w.idbm.set('trpack:' + id + '|bn', { v: 1, rows: [['a', 'b']] }); w.idbm.set('g:55', 'text');
  ['gloom', 'dread', 'shared'].forEach(x => w.idbm.set('dict:' + x, { v: 1 }));
  w.cstore.set('https://h/data/vocab/' + id + '.json', 1); w.cstore.set('https://h/data/packs/' + id + '.bn.json.gz', 1); w.cstore.set('https://h/data/vocab/999.json', 1);
};
t('delete: one pack leaves nothing of its own behind, keeps what is shared or the reader\'s', async () => {
  const w = loadLPK(); seedPack(w, '84', { 77: { t: 1, lang: 'bn', it: { words: { ok: 1 } } } });
  w.idbm.set('vocab:77', { v: 1, w: [['Shared', 'B1']] });   // another saved pack also needs "shared"
  assert.strictEqual(await w.LPK.drop('84'), true);
  assert.deepStrictEqual([...w.idbm.keys()].sort(), ['dict:dread', 'dict:shared', 'vocab:77']);   // dread: in My Words; shared: another pack; gloom, list, translation and the text it saved are gone
  assert.deepStrictEqual(Object.keys(JSON.parse(w.ls.get('wt:lpk')).b), ['77']);
  assert.deepStrictEqual([...w.cstore.keys()], ['https://h/data/vocab/999.json']);   // only this book's raw files
  assert.strictEqual(w.LPK.has('84'), false); assert.strictEqual(w.LPK.size('84'), 0); assert.strictEqual(w.log.confirm, 0);
});
t('delete: a text the pack did not save is kept; a second drop is harmless', async () => {
  const w = loadLPK(); seedPack(w, '84'); const s = JSON.parse(w.ls.get('wt:lpk')); s.b['84'].it.text.own = 0; w.ls.set('wt:lpk', JSON.stringify(s));
  await w.LPK.drop('84'); assert.ok(w.idbm.has('g:55')); assert.strictEqual(await w.LPK.drop('84'), true); assert.strictEqual(await w.LPK.drop('nope'), true);
});
t('delete: with the confirm button the pack goes and a "No" keeps it', async () => {
  const w = loadLPK(); seedPack(w, '84'); await w.LPK.remove({ id: 84, title: 'T' });
  assert.strictEqual(w.log.confirm, 1); assert.strictEqual(w.LPK.has('84'), false);
});
t('delete: the three bulk paths pass the pack along, single removals do not', () => {
  const d = read('src/js/030-helpers-offline-audio.js'), a = read('src/js/090-synced-stats-book-search.js');
  assert.strictEqual(d.split('dmDrop(m.id, true)').length - 1, 2); assert.ok(/dmDrop\(id, true\)/.test(a));
  assert.ok(/async function dmDrop\(id, withPack\)/.test(d) && /LPK\.drop\(id\)/.test(d));
  assert.ok(/dmDrop\(r\.m\.id\)/.test(d) && /dmDrop\(b\.id\)/.test(read('src/js/281-book-download-card.js')) && /dmDrop\(m\.id\)/.test(read('src/js/280-downloads-progress.js')));
});
t('dropWords: keeps shared and My Words, fmtSize reads well', () => {
  assert.deepStrictEqual(J(C.dropWords(['a', 'b', 'c'], [['b']], ['c'])), ['a']); assert.deepStrictEqual(J(C.dropWords(null, null, null)), []);
  assert.strictEqual(C.fmtSize(0), ''); assert.strictEqual(C.fmtSize(1200), '1 KB'); assert.strictEqual(C.fmtSize(120000), '120 KB'); assert.strictEqual(C.fmtSize(3.5 * 1048576), '3.5 MB');
});

(async () => {
  for (const [name, fn] of todo) { try { await fn(); pass++; console.log('ok    ' + name); } catch (e) { fail++; console.log('FAIL  ' + name + '\n        ' + String(e && e.message).split('\n').slice(0, 5).join('\n        ')); } }
  console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
})();
