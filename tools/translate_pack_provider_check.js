#!/usr/bin/env node
/* Automatic checks for the translation pack provider (160c) with the REAL translation layer (160b), the REAL sentence splitting (Core, 010)
   and the REAL sample pack (tools/samples/packs/sample.bn.json.gz). No browser, no npm install:   node tools/translate_pack_provider_check.js
   The network, IndexedDB and the clock are fakes (the IndexedDB stand-in is taken from tools/translate_provider_check.js), so this proves the
   logic, not the real browser or the real data host.
   By hand, on any real pack (the mismatch check with the app's own splitting):
     node tools/translate_pack_provider_check.js --pack packs/1342.bn.json.gz --text book.txt
   Exit code 1 if a check fails or the pack does not match the book, 2 if a file cannot be loaded. */
const fs = require('fs'), path = require('path'), vm = require('vm'), zlib = require('zlib'), assert = require('assert');
const root = path.join(__dirname, '..');
const read = (f, d) => fs.readFileSync(path.join(root, d || 'src/js', f), 'utf8');
function grab(src, name) {
  const m = new RegExp('(?:async\\s+)?function\\s+' + name + '\\s*\\(').exec(src);
  if (!m) throw new Error('not found: ' + name);
  let i = src.indexOf('{', m.index), d = 0;
  for (; i < src.length; i++) { if (src[i] === '{') d++; else if (src[i] === '}' && --d === 0) return src.slice(m.index, i + 1); }
  throw new Error('unbalanced: ' + name);
}
let SRC, CORE;
try {
  const pk = read('160c-translate-pack.js'), a = pk.indexOf('/*TPK-START*/'), b = pk.indexOf('/*TPK-END*/');
  if (a < 0 || b < a) throw new Error('TPK markers missing');
  SRC = { tp: read('160b-translate-provider.js'), pk, pure: pk.slice(a, b), idb: grab(read('translate_provider_check.js', 'tools'), 'fakeIDB') };
  const cx = vm.createContext({}); vm.runInContext(read('010-core.js') + '\nthis.Core = Core;', cx); CORE = cx.Core;
} catch (e) { console.error('translate_pack_provider_check: cannot load the code: ' + e.message); process.exit(2); }

const gunzipJson = f => JSON.parse(zlib.gunzipSync(fs.readFileSync(f)).toString('utf8'));
const sentsOf = f => CORE.parseBook(fs.readFileSync(f, 'utf8')).sents;
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* The pure part alone (parse and check), with the real TP.fnv */
function pureOnly() {
  const ctx = vm.createContext({ Set, Map, Array, String, Object, Math, Number });
  vm.runInContext(SRC.tp + '\n' + SRC.pure + '\nthis.X = { parse, check, name };', Object.assign(ctx, { localStorage: { getItem: () => null, setItem() {}, removeItem() {} }, window: {}, navigator: {}, setTimeout, clearTimeout, Date, Promise, JSON, Error, console }));
  return ctx.X;
}

/* ----- by hand: one real pack against one real book ----- */
const arg = n => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : null; };
if (arg('--pack')) {
  const textFile = arg('--text'); if (!textFile) { console.error('usage: --pack file.json.gz --text book.txt'); process.exit(2); }
  let j, sents; try { j = gunzipJson(arg('--pack')); sents = sentsOf(textFile); } catch (e) { console.error('cannot read: ' + e.message); process.exit(2); }
  const X = pureOnly(), p = X.parse(j, j.book, j.lang);
  if (!p.ok) { console.error('REFUSED by the app (' + p.why + ')'); process.exit(1); }
  const c = X.check(p.rows, sents);
  console.log('rows ' + c.rows + ', matching the app\'s sentences ' + c.matched + ' (' + (c.ratio * 100).toFixed(1) + '%), sentences of the book the pack can translate ' + c.covered + ' of ' + c.app + ' (' + (c.coverage * 100).toFixed(1) + '%)');
  if (!c.ok) { console.error('MISMATCH: the app would not use this pack. Unmatched keys: ' + c.unmatched.join(', ')); process.exit(1); }
  console.log('OK: the app uses this pack'); process.exit(0);
}

/* ----- one page load = one session: its own TP and TPK, the same fake disk ----- */
const SAMPLE_TXT = path.join(root, 'tools/samples/sample-book.txt'), SAMPLE_PACK = path.join(root, 'tools/samples/packs/sample.bn.json.gz'), TABLE = path.join(root, 'tools/samples/sample-bn-table.json');
const idbFake = new Function(SRC.idb + '; return fakeIDB;')();   // the translation layer's own database: a fresh one per session, so the sentences themselves are not answered from the translation cache
const texts = new Map();   // stands in for the app's text store (idb 'texts'), kept between sessions
function session(o) {
  o = o || {};
  const mem = {}, calls = { fetch: [], live: 0 };
  const g = { Set, Map, Array, String, Object, Math, Number, Date, Promise, JSON, Error, console: { warn() {}, log: console.log }, setTimeout, clearTimeout, TextDecoder, Uint8Array, Response, Blob, DecompressionStream, AbortController,
    indexedDB: idbFake(), localStorage: { getItem: k => mem[k] || null, setItem: (k, v) => { mem[k] = String(v); }, removeItem: k => { delete mem[k]; } }, window: {}, navigator: { onLine: true },
    S: { book: o.book === undefined ? { id: 'sample' } : o.book, model: o.model || { sents: sentsOf(SAMPLE_TXT) } },
    idb: { async get(k) { return texts.get(k); }, async set(k, v) { texts.set(k, JSON.parse(JSON.stringify(v))); return true; } },
    fetchText: async name => {
      calls.fetch.push(name);
      if (o.slow) await sleep(o.slow);
      if (o.offline || !o.files || !o.files[name]) return null;
      const buf = o.files[name]; return { ok: true, arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) };
    } };
  const ctx = vm.createContext(g);
  vm.runInContext([SRC.tp, SRC.pk, 'this.T = { TP, TPK };'].join('\n'), ctx);
  const T = ctx.T;
  T.TP.register({ id: 'device', order: 10, live: false, async translate() { throw Object.assign(new Error('unavailable'), { code: 'unavailable' }); } });   // no browser translator here
  T.TP.register({ id: 'mymemory', order: 20, live: true, async translate(t) { calls.live++; return 'LIVE:' + t; } });
  return Object.assign(T, { calls, S: g.S });
}
const sampleFiles = { 'packs/sample.bn.json.gz': fs.readFileSync(SAMPLE_PACK) };
const table = JSON.parse(fs.readFileSync(TABLE, 'utf8'));

const results = [];
async function t(name, fn) { try { await fn(); results.push([name, true]); } catch (e) { results.push([name, false, e.message]); } }

(async () => {
  const sents = sentsOf(SAMPLE_TXT).filter(s => !s.h && s.t.trim()).map(s => s.t.trim());

  await t('the provider is registered first, before the device translator and the free service', async () => {
    const s = session(); assert.strictEqual(s.TP.providers().join(','), 'pack,device,mymemory');
  });

  await t('sample pack: every sentence of the sample book comes from the pack, no live request', async () => {
    const s = session({ files: sampleFiles });
    assert.ok(sents.length >= 10, 'sample book has sentences');
    for (const x of sents) { const r = await s.TP.get(x, 'bn'); assert.strictEqual(r, table[x], 'wrong text for: ' + x); }
    assert.strictEqual(s.calls.live, 0); assert.strictEqual(s.calls.fetch.length, 1, 'one file request for the whole book');
    const st = s.TPK.status('sample', 'bn');
    assert.strictEqual(st.state, 'ready'); assert.strictEqual(st.n, 12); assert.strictEqual(st.ratio, 1); assert.strictEqual(st.coverage, 1); assert.strictEqual(st.meta.engine, 'table');
  });

  await t('the pack is saved: a new session offline still translates from it', async () => {
    const s = session({ offline: true });   // new page load, no network at all
    const r = await s.TP.get(sents[0], 'bn');
    assert.strictEqual(r, table[sents[0]]); assert.strictEqual(s.calls.live, 0);
    assert.strictEqual(s.calls.fetch.length, 0, 'fresh saved copy: no request');
  });

  await t('an old saved copy is refreshed, and kept when the host cannot be reached', async () => {
    const k = 'trpack:sample|bn', d = texts.get(k); d.fetched = Date.now() - 20 * 24 * 3600e3; texts.set(k, d);
    const s = session({ offline: true });
    const r = await s.TP.get(sents[1], 'bn');
    assert.strictEqual(r, table[sents[1]]); assert.strictEqual(s.calls.fetch.length, 1, 'it tried the host');
  });

  await t('no pack for this book: live translation as before, and the host is not asked again at once', async () => {
    const s = session({ book: { id: 'nopack' }, files: sampleFiles });
    const a = await s.TP.get('A sentence nobody packed.', 'bn'), b = await s.TP.get('Another one.', 'bn');
    assert.strictEqual(a, 'LIVE:A sentence nobody packed.'); assert.strictEqual(b, 'LIVE:Another one.');
    assert.strictEqual(s.calls.live, 2); assert.strictEqual(s.calls.fetch.length, 1);
    assert.strictEqual(s.TPK.status('nopack', 'bn').state, 'none');
  });

  await t('another language has no pack: live translation', async () => {
    const s = session({ files: sampleFiles });
    assert.strictEqual(await s.TP.get(sents[0], 'hi'), 'LIVE:' + sents[0]); assert.deepStrictEqual(s.calls.fetch, ['packs/sample.hi.json.gz']);
  });

  await t('a sentence that is not in the pack falls back to live translation', async () => {
    const s = session({ files: sampleFiles });
    assert.strictEqual(await s.TP.get('This sentence is not in the sample pack.', 'bn'), 'LIVE:This sentence is not in the sample pack.');
    assert.strictEqual(s.calls.live, 1);
  });

  await t('no open book: the pack is not asked for', async () => {
    const s = session({ book: null, files: sampleFiles });
    assert.strictEqual(await s.TP.get(sents[0], 'bn'), 'LIVE:' + sents[0]); assert.strictEqual(s.calls.fetch.length, 0);
  });

  await t('the test pack (placeholder text) in the packs folder is refused, never shown', async () => {
    const dummy = fs.readFileSync(path.join(root, 'packs/sample.bn.json.gz')), j = gunzipJson(path.join(root, 'packs/sample.bn.json.gz'));
    if (j.test !== true) return;   // the folder holds a real pack: nothing to prove
    texts.clear();
    const s = session({ files: { 'packs/sample.bn.json.gz': dummy } });
    assert.strictEqual(await s.TP.get(sents[0], 'bn'), 'LIVE:' + sents[0]);
  });

  await t('slow download: the sentence goes live after 3 s and later ones use the pack', async () => {
    texts.clear();
    const s = session({ files: sampleFiles, slow: 3300 });
    const a = await s.TP.get(sents[0], 'bn');
    assert.strictEqual(a, 'LIVE:' + sents[0], 'did not wait longer than 3 s');
    await sleep(600);
    assert.strictEqual(await s.TP.get(sents[2], 'bn'), table[sents[2]]);
  });

  await t('MISMATCH: the same pack against a book split differently is detected and not used', async () => {
    texts.clear();
    const other = sentsOf(SAMPLE_TXT).map(x => Object.assign({}, x, { t: x.t.replace(/[.,;]/g, '') }));   // a different splitting or edition: every sentence differs
    const s = session({ files: sampleFiles, model: { sents: other } });
    const r = await s.TP.get(other.filter(x => !x.h)[0].t, 'bn');
    assert.ok(r.startsWith('LIVE:'), 'a mismatched pack must not answer');
    const st = s.TPK.status('sample', 'bn'); assert.strictEqual(st.state, 'mismatch'); assert.ok(st.ratio < 0.5);
  });

  await t('pure check: ratio, coverage and unmatched keys are right', async () => {
    const X = pureOnly(), p = X.parse(gunzipJson(SAMPLE_PACK), 'sample', 'bn'), ss = sentsOf(SAMPLE_TXT);
    let c = X.check(p.rows, ss); assert.ok(c.ok && c.ratio === 1 && c.coverage === 1 && c.matched === 12 && c.unmatched.length === 0);
    c = X.check(p.rows, ss.slice(0, 6)); assert.ok(c.ratio < 1 && c.coverage === 1 && c.ok);   // the book text is only a part of the pack: still used
    c = X.check(p.rows, ss.map(x => ({ t: 'x' + x.t, h: x.h })));   // nothing matches: both shares are 0 assert.strictEqual(c.ok, false); assert.strictEqual(c.matched, 0); assert.ok(c.unmatched.length > 0);
    assert.strictEqual(X.check(p.rows, []), null); assert.strictEqual(X.check(p.rows, null), null);
  });

  await t('pure parse: another version, a test pack, a wrong key, book or language, and junk are refused', async () => {
    const X = pureOnly(), j = gunzipJson(SAMPLE_PACK), bad = (o, why) => { const r = X.parse(Object.assign({}, j, o), 'sample', 'bn'); assert.ok(!r.ok && r.why === why, 'expected ' + why + ', got ' + JSON.stringify(r)); };
    assert.ok(X.parse(j, 'sample', 'bn').ok);
    bad({ v: 2 }, 'version'); bad({ test: true }, 'test pack'); bad({ key: 'other' }, 'key'); bad({ book: '9' }, 'book or language'); bad({ lang: 'hi' }, 'book or language'); bad({ s: 'x' }, 'rows'); bad({ s: [[1, 2]] }, 'empty'); bad({ format: 'x' }, 'not a pack');
    assert.strictEqual(X.parse(null, 'sample', 'bn').ok, false); assert.strictEqual(X.parse('text', 'sample', 'bn').ok, false);
  });

  await t('the sample pack keys are the app\'s own sentence keys (pack file and app splitting agree)', async () => {
    const X = pureOnly(), p = X.parse(gunzipJson(SAMPLE_PACK), 'sample', 'bn'), keys = new Set(p.rows.map(r => r[0]));
    const vmx = vm.createContext({ localStorage: { getItem: () => null }, window: {}, navigator: {}, setTimeout, Date, Promise, JSON, Error, Math, Map, Set }); vm.runInContext(SRC.tp + '\nthis.TP = TP;', vmx);
    for (const x of sents) assert.ok(keys.has(vmx.TP.fnv(x)), 'no row for: ' + x);
  });

  let bad = 0;
  for (const r of results) { console.log((r[1] ? 'PASS  ' : 'FAIL  ') + r[0] + (r[1] ? '' : '\n      ' + r[2])); if (!r[1]) bad++; }
  console.log('\n' + (results.length - bad) + ' of ' + results.length + ' checks passed');
  process.exit(bad ? 1 : 0);
})();
