#!/usr/bin/env node
/* Automatic checks for the reveal bubble and Save phrase logic (RVC in 161c), with the REAL translation layer (160b) and the REAL word
   store (146, 147, 148). No browser, no npm install:   node tools/reveal_save_check.js
   The network, IndexedDB and the clock are fakes (the IndexedDB stand-in is taken from tools/translate_provider_check.js), so this proves
   the logic, not the real browser: the bubble markup, the CSS and the floating button need a hand test (see the handoff note).
   Exit code 1 if a check fails, 2 if a file cannot be loaded. */
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const root = path.join(__dirname, '..');
const read = (f, d) => fs.readFileSync(path.join(root, d || 'src/js', f), 'utf8');
function grab(src, name) {
  const m = new RegExp('(?:async\\s+)?function\\s+' + name + '\\s*\\(|const\\s+' + name + '\\s*=').exec(src);
  if (!m) throw new Error('not found: ' + name);
  if (src[m.index] === 'c') return src.slice(m.index, src.indexOf('\n', m.index));
  let i = src.indexOf('{', m.index), d = 0;
  for (; i < src.length; i++) { if (src[i] === '{') d++; else if (src[i] === '}' && --d === 0) return src.slice(m.index, i + 1); }
  throw new Error('unbalanced: ' + name);
}
let SRC;
try {
  const rv = read('161c-reveal-save.js'), a = rv.indexOf('/*RVC-START*/'), b = rv.indexOf('/*RVC-END*/');
  if (a < 0 || b < a) throw new Error('RVC markers missing');
  SRC = { tp: read('160b-translate-provider.js'), wm: read('146-word-model.js'), ws: read('147-word-store.js'), srs: read('148-scheduler.js'), rvc: rv.slice(a, b), lt: grab(read('161-live-translate.js'), 'LT_MSG'), idb: grab(read('translate_provider_check.js', 'tools'), 'fakeIDB') };
} catch (e) { console.error('reveal_save_check: cannot load the code: ' + e.message); process.exit(2); }

const sleep = ms => new Promise(r => setTimeout(r, ms));
const unavailable = () => Object.assign(new Error('unavailable'), { code: 'unavailable' });
const fail = code => Object.assign(new Error(code), { code });
const idb = new Function(SRC.idb + '; return fakeIDB;')();   // ONE fake database, kept between the two "sessions"
const theIDB = idb();

/* One session = one page load: its own TP (memory empty), its own word store, the same IndexedDB and the same local storage. */
const disk = {}, toasts = [];
function session(online) {
  const mem = {};
  const store = { get(k, d) { try { const v = disk[k]; return v ? JSON.parse(v) : d; } catch (e) { return d; } }, set(k, v) { disk[k] = JSON.stringify(v); } };
  const g = { store, indexedDB: theIDB, localStorage: { getItem: k => mem[k] || null, setItem: (k, v) => { mem[k] = String(v); }, removeItem: k => { delete mem[k]; } },
    navigator: { onLine: online }, setTimeout, clearTimeout, Date, Promise, Math, JSON, String, Array, Object, Error, Number, Map, Set, console,
    toast: m => toasts.push(m), SRS: undefined, WM: undefined };
  const ctx = vm.createContext(g);
  vm.runInContext([SRC.tp, SRC.wm, SRC.ws, SRC.srs, SRC.lt, SRC.rvc, 'this.T = { TP, WS, WM, RVC, LT_MSG };'].join('\n'), ctx);
  return ctx.T;
}
let pass = 0, failn = 0;
async function t(name, fn) { try { await fn(); pass++; console.log('ok    ' + name); } catch (e) { failn++; console.log('FAIL  ' + name + '\n        ' + String(e.message).split('\n').slice(0, 6).join('\n        ')); } }
/* Fake providers: `device` is never there; `mymemory` is the free service and does what the test says. */
function wire(T, impl) {
  T.TP.register({ id: 'device', order: 10, live: false, translate: async () => { throw unavailable(); } });
  const calls = { n: 0 };
  T.TP.register({ id: 'mymemory', order: 20, live: true, translate: async (text, lang) => { calls.n++; return impl(text, lang); } });
  return calls;
}
const SENT = 'She sat alone in the garden, looking forlorn and tired.', BN = 'সে বাগানে একা বসে ছিল, নিঃসঙ্গ ও ক্লান্ত দেখাচ্ছিল।';

(async () => {
  /* ----- text rules ----- */
  const R = session(true).RVC;
  await t('clean: a selection loses the quotes and punctuation around it, a whole sentence keeps them', () => {
    assert.strictEqual(R.clean('  “looking   forlorn,” ', false), 'looking forlorn');
    assert.strictEqual(R.clean(' Nobody came to find her. ', true), 'Nobody came to find her.');
  });
  await t('ok: needs a letter or number, 2 to 240 characters', () => {
    assert.ok(R.ok('forlorn')); assert.ok(R.ok('looking forlorn')); assert.ok(!R.ok('')); assert.ok(!R.ok('!!')); assert.ok(!R.ok('x')); assert.ok(!R.ok('a'.repeat(241))); assert.ok(R.ok('a'.repeat(240)));
  });

  /* ----- reveal: online, then offline from the saved copy ----- */
  let s1 = session(true), c1 = wire(s1, async () => BN);
  await t('reveal: a new sentence is translated by the free service and saved', async () => {
    const r = await s1.RVC.reveal(SENT, 'bn'); assert.deepStrictEqual({ ok: r.ok, t: r.t }, { ok: true, t: BN }); assert.strictEqual(c1.n, 1);
  });
  await sleep(60);   // let the saved copy reach IndexedDB
  const s2 = session(false), c2 = wire(s2, async () => { throw fail('offline'); });   // a new page load, no connection
  await t('reveal OFFLINE: a sentence opened before opens again from the saved copy, with no request', async () => {
    const r = await s2.RVC.reveal(SENT, 'bn'); assert.strictEqual(r.ok, true); assert.strictEqual(r.t, BN); assert.strictEqual(c2.n, 0);
  });
  await t('reveal OFFLINE: a new sentence gets the friendly offline message, nothing breaks', async () => {
    const r = await s2.RVC.reveal('Nobody came to find her.', 'bn');
    assert.strictEqual(r.ok, false); assert.strictEqual(r.code, 'offline'); assert.strictEqual(r.msg, s2.RVC.MSG.offline); assert.ok(/offline/i.test(r.msg));
  });

  /* ----- reveal: the free limit ----- */
  const s3 = session(true), c3 = wire(s3, async () => { throw fail('limit'); });
  await t('reveal at the free limit: friendly message, and a saved sentence still opens while the limit lasts', async () => {
    const r = await s3.RVC.reveal('The evening wind moved the old trees.', 'bn');
    assert.strictEqual(r.ok, false); assert.strictEqual(r.code, 'limit'); assert.strictEqual(r.msg, s3.LT_MSG.limit);
    const again = await s3.RVC.reveal('Another sentence here.', 'bn'); assert.strictEqual(again.code, 'limit'); assert.strictEqual(c3.n, 1);   // paused: nothing more is sent
    const have = await s3.RVC.reveal(SENT, 'bn'); assert.strictEqual(have.ok, true); assert.strictEqual(have.t, BN);
  });

  /* ----- save phrase ----- */
  const s4 = session(true); wire(s4, async () => BN);
  const { WS, RVC } = s4;
  const ctx = { sent: SENT, bid: '7', bt: 'Dracula', ch: 3 };
  await t('save: a selected phrase goes to My Words with its sentence, book and chapter, and ph: 1', () => {
    const r = RVC.toggle(Object.assign({ phrase: 'looking forlorn', whole: false }, ctx), 'bn', '');
    assert.strictEqual(r.state, 'saved');
    const e = WS.get('looking forlorn');
    assert.strictEqual(e.w, 'looking forlorn'); assert.strictEqual(e.ph, 1); assert.strictEqual(e.bt, 'Dracula'); assert.strictEqual(e.bid, '7');
    assert.strictEqual(e.ctx[0].s, SENT); assert.strictEqual(e.ctx[0].ch, 3); assert.strictEqual(e.v, 2); assert.strictEqual(e.tr, undefined);
  });
  await t('save: a whole revealed sentence keeps its translation as tr { l, t }', () => {
    const r = RVC.toggle(Object.assign({ phrase: SENT, whole: true }, ctx), 'bn', BN);
    assert.strictEqual(r.state, 'saved');
    const e = WS.get(SENT); assert.deepStrictEqual(JSON.parse(JSON.stringify(e.tr)), { l: 'bn', t: BN }); assert.strictEqual(e.ph, 1);
  });
  await t('save: a single selected word is saved as a normal word (no ph)', () => {
    assert.strictEqual(RVC.toggle(Object.assign({ phrase: '“Forlorn.”', whole: false }, ctx), 'bn', '').state, 'saved');
    const e = WS.get('forlorn'); assert.ok(e); assert.strictEqual(e.ph, undefined);
  });
  await t('save works OFFLINE: it only writes local storage; the translation is added later only if it can be fetched', async () => {
    const off = session(false); wire(off, async () => { throw fail('offline'); });
    assert.strictEqual(off.RVC.toggle(Object.assign({ phrase: 'moved the old trees', whole: false }, ctx), 'bn', '').state, 'saved');
    assert.strictEqual(await off.RVC.later('moved the old trees', 'bn'), false);   // no translation, no harm
    assert.strictEqual(off.WS.get('moved the old trees').tr, undefined);
  });
  await t('later: when the translation can be fetched it is added as tr, and never overwritten', async () => {
    const on = session(true), c = wire(on, async () => 'অনুবাদ');
    on.RVC.toggle(Object.assign({ phrase: 'stood silent', whole: false }, ctx), 'bn', '');
    assert.strictEqual(await on.RVC.later('stood silent', 'bn'), true);
    assert.deepStrictEqual(JSON.parse(JSON.stringify(on.WS.get('stood silent').tr)), { l: 'bn', t: 'অনুবাদ' });
    on.WS.update('stood silent', x => { x.tr = { l: 'bn', t: 'mine' }; return x; });
    await on.RVC.later('stood silent', 'bn'); assert.strictEqual(on.WS.get('stood silent').tr.t, 'mine'); assert.ok(c.n >= 1);
  });
  await t('save: the same phrase again removes it (like the word card)', () => {
    assert.strictEqual(RVC.toggle(Object.assign({ phrase: 'looking forlorn', whole: false }, ctx), 'bn', '').state, 'removed');
    assert.strictEqual(WS.get('looking forlorn'), null);
  });
  await t('save: text that is not a phrase (no letters, too long) is refused', () => {
    assert.strictEqual(RVC.toggle({ phrase: '?!', whole: false }, 'bn', '').state, 'bad');
    assert.strictEqual(RVC.toggle({ phrase: 'a'.repeat(300), whole: true }, 'bn', '').state, 'bad');
  });
  await t('save at the limit: friendly message, nothing saved and nothing dropped', () => {
    const full = session(true); wire(full, async () => BN);
    const list = []; for (let i = 0; i < 2000; i++) list.push({ ts: i + 1, w: 'word' + i, lv: '', ex: '', bid: '', bt: '' });
    disk['wt:words'] = JSON.stringify(list);
    const r = full.RVC.toggle(Object.assign({ phrase: 'looking forlorn', whole: false }, ctx), 'bn', '');
    assert.strictEqual(r.state, 'full'); assert.strictEqual(full.WS.all().length, 2000); assert.strictEqual(full.WS.get('looking forlorn'), null); assert.strictEqual(full.WS.get('word1999').w, 'word1999');
    assert.ok(/full/i.test(full.RVC.MSG.full) && /2,000/.test(full.RVC.MSG.full));
  });
  await t('old saved words are untouched: no field removed, nothing rewritten except the new entry', () => {
    const old = { ts: 5, w: 'ample', lv: 'B1', ex: 'ample room', bid: '3', bt: 'Emma', ease: 2.5, iv: 6, reps: 2, due: 9 };
    disk['wt:words'] = JSON.stringify([old]);
    const o = session(true); wire(o, async () => BN);
    o.RVC.toggle(Object.assign({ phrase: 'in the garden', whole: false }, ctx), 'bn', '');
    const kept = JSON.parse(disk['wt:words']).find(e => e.w === 'ample'); assert.deepStrictEqual(kept, old);
  });
  await t('the sync rule keeps the new fields: merging two copies of a phrase keeps tr and ph', () => {
    const a = session(true); a.WM.migrate;
    const x = a.WM.migrate({ ts: 1, w: 'looking forlorn', lv: '', ex: '', bid: '7', bt: 'Dracula', ph: 1, tr: { l: 'bn', t: BN } }), y = a.WM.migrate({ ts: 2, w: 'looking forlorn', lv: '', ex: '', bid: '7', bt: 'Dracula' });
    const m = a.WM.merge(y, x); assert.strictEqual(m.ph, 1); assert.strictEqual(m.tr.t, BN);
  });

  console.log('\n' + pass + ' passed, ' + failn + ' failed');
  process.exit(failn ? 1 : 0);
})();
