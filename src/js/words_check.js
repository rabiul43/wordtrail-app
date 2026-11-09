#!/usr/bin/env node
/* Automatic checks for the saved-word model and its migration (no browser, no npm install).
     node tools/words_check.js
   Loads the REAL src/js/146-word-model.js, so it tests what ships. Exit code 1 if a check fails, 2 if the file cannot be loaded. */
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const root = path.join(__dirname, '..');
const plain = x => JSON.parse(JSON.stringify(x));      // copies across the vm boundary so deepStrictEqual works
const src = fs.readFileSync(path.join(root, 'src/js/146-word-model.js'), 'utf8');

let WM;
try { const c = vm.createContext({}); vm.runInContext(src + '\nthis.WM = WM;', c); WM = c.WM; }
catch (e) { console.error('CANNOT LOAD 146-word-model.js: ' + e.message); process.exit(2); }

let pass = 0, fail = 0;
function t(name, fn) { try { fn(); pass++; console.log('ok    ' + name); } catch (e) { fail++; console.log('FAIL  ' + name + '\n        ' + String(e.message).split('\n').slice(0, 6).join('\n        ')); } }
const mig = e => plain(WM.migrate(e));
const OLD = { ts: 1700000000000, w: 'forlorn', lv: 'C1', ex: 'She sat alone in the garden, looking forlorn and tired.', bid: '345', bt: 'Dracula' };
const REVIEWED = Object.assign({}, OLD, { ease: 2.5, iv: 6, reps: 2, due: 1700500000000 });
const keep = (before, after) => Object.keys(before).forEach(k => assert.deepStrictEqual(after[k], before[k], 'field lost or changed: ' + k));

t('an old entry keeps every old field and gets v:2 with the new fields', () => {
  const m = mig(OLD); keep(OLD, m);
  assert.strictEqual(m.v, 2); assert.strictEqual(m.note, ''); assert.strictEqual(m.hard, false);
  assert.deepStrictEqual(m.cols, []); assert.deepStrictEqual(m.cnt, { rec: 0, und: 0, rcl: 0, use: 0 }); assert.strictEqual(m.st, 'new');
});
t('the old entry becomes exactly one context (sentence, book id, book title, chapter, time)', () => {
  const m = mig(OLD);
  assert.deepStrictEqual(m.ctx, [{ s: OLD.ex, bid: '345', bt: 'Dracula', ch: null, t: OLD.ts }]);
});
t('an old entry with no sentence and no book gets no empty context', () => {
  assert.deepStrictEqual(mig({ ts: 5, w: 'tremble', lv: '', ex: '', bid: '', bt: '' }).ctx, []);
  assert.deepStrictEqual(mig({ w: 'solitude' }).ctx, []);
});
t('a book id that is a number is kept as text in the context', () => { assert.strictEqual(mig({ w: 'a', ex: 'x', bid: 12 }).ctx[0].bid, '12'); });
t('strength comes from the Review fields', () => {
  const st = o => mig(Object.assign({ w: 'x' }, o)).st;
  assert.strictEqual(st({}), 'new');
  assert.strictEqual(st({ iv: 1, reps: 1, due: 1, ease: 2.5 }), 'learning');
  assert.strictEqual(st({ iv: 0, reps: 0, due: 99, ease: 2.3 }), 'learning');     // graded "again" once
  assert.strictEqual(st({ iv: 14, reps: 4, acq: 5 }), 'familiar');
  assert.strictEqual(st({ iv: 29, reps: 6 }), 'familiar');
  assert.strictEqual(st({ iv: 30, reps: 7 }), 'mastered');
  assert.strictEqual(st({ iv: 0, reps: 0, acq: 5, ease: 2.1, due: 9 }), 'learning');   // lapsed after being acquired: acq stays, strength drops
  assert.strictEqual(mig(REVIEWED).st, 'learning');
});
t('migration does not change its input and keeps unknown fields', () => {
  const x = Object.assign({}, REVIEWED, { mystery: { a: [1, 2] }, acq: 1700400000000 }), snap = JSON.stringify(x);
  const m = mig(x); assert.strictEqual(JSON.stringify(x), snap); keep(x, m);
});
t('migration twice gives the same result (idempotent) and returns the same object once v2', () => {
  [OLD, REVIEWED, { w: 'a' }].forEach(o => {
    const once = WM.migrate(o), twice = WM.migrate(once);
    assert.strictEqual(twice, once); assert.deepStrictEqual(plain(twice), plain(once));
  });
});
t('a v2 entry keeps what the learner added (note, hard, cols, strength, counters, contexts)', () => {
  const v2 = { v: 2, w: 'tremble', ctx: [{ s: 'a', bid: '1', bt: 'B', ch: 2, t: 9 }], note: 'my note', hard: true, cols: ['IELTS'], st: 'mastered', cnt: { rec: 3, und: 2, rcl: 1, use: 0 } };
  assert.strictEqual(WM.migrate(v2), v2);
});
t('a half-written v2 entry is completed without touching what is there', () => {
  const m = mig({ v: 2, w: 'x', note: 'keep me', hard: true, cnt: { rec: 4 } });
  assert.strictEqual(m.note, 'keep me'); assert.strictEqual(m.hard, true);
  assert.deepStrictEqual(m.cnt, { rec: 4, und: 0, rcl: 0, use: 0 }); assert.deepStrictEqual(m.cols, []); assert.strictEqual(m.st, 'new');
});
t('bad values in the new fields are repaired, not thrown', () => {
  const m = mig({ w: 'x', note: 5, hard: 'yes', cols: ['a', 3, null], st: 'great', cnt: { rec: -2, und: 'x', rcl: 2.9, use: NaN } });
  assert.strictEqual(m.note, ''); assert.strictEqual(m.hard, false); assert.deepStrictEqual(m.cols, ['a']);
  assert.strictEqual(m.st, 'new'); assert.deepStrictEqual(m.cnt, { rec: 0, und: 0, rcl: 2, use: 0 });
});
t('more than 5 contexts are cut to the first 5', () => {
  const ctx = [1, 2, 3, 4, 5, 6, 7].map(i => ({ s: 's' + i, bid: 'b', bt: 'B', ch: i, t: i }));
  assert.deepStrictEqual(mig({ v: 2, w: 'x', ctx, note: '', hard: false, cols: [], st: 'new', cnt: {} }).ctx.map(c => c.s), ['s1', 's2', 's3', 's4', 's5']);
});
t('things that are not word entries, and entries from a newer app, come back untouched', () => {
  const future = { v: 3, w: 'x', extra: { k: 1 } };
  [null, undefined, 'text', 42, [], {}, { w: 7 }, future].forEach(x => assert.strictEqual(WM.migrate(x), x));
});
t('a whole list: nothing dropped, same order, junk kept, unknown fields kept', () => {
  const list = [OLD, null, 'junk', REVIEWED, { v: 3, w: 'later', extra: 1 }, { ts: 3, w: 'plain' }, { notes: 'no w' }];
  const before = JSON.stringify(list), r = WM.migrateList(list);
  assert.strictEqual(JSON.stringify(list), before); assert.strictEqual(r.changed, true); assert.strictEqual(r.list.length, list.length);
  list.forEach((o, i) => { if (o && typeof o === 'object' && typeof o.w === 'string' && !(o.v > 2)) keep(o, plain(r.list[i])); else assert.strictEqual(r.list[i], o); });
});
t('a list that is already migrated is returned as the same array with changed:false', () => {
  const r1 = WM.migrateList([OLD, REVIEWED]), r2 = WM.migrateList(r1.list);
  assert.strictEqual(r2.changed, false); assert.strictEqual(r2.list, r1.list);
  assert.deepStrictEqual(WM.migrateList([]).changed, false);
});
t('something that is not a list gives an empty list', () => { [null, undefined, {}, 'x', 3].forEach(x => assert.deepStrictEqual(plain(WM.migrateList(x)), { list: [], changed: false })); });
t('an old list of 2000 saved words migrates without losing anything (round trip through JSON too)', () => {
  const old = [];
  for (let i = 0; i < 2000; i++) {
    const e = { ts: 1700000000000 + i, w: 'word' + i, lv: ['B1', 'B2', 'C1', ''][i % 4], ex: i % 5 ? 'Sentence number ' + i + ' with the word in it.' : '', bid: i % 7 ? String(100 + i % 9) : '', bt: i % 7 ? 'Book ' + (i % 9) : '' };
    if (i % 3 === 0) Object.assign(e, { ease: 2.5, iv: i % 40, reps: i % 6, due: 1700000000000 + i * 1000 });
    if (i % 11 === 0) e.acq = 1700000000000 + i;
    old.push(e);
  }
  const snap = JSON.stringify(old), r = WM.migrateList(old);
  assert.strictEqual(JSON.stringify(old), snap); assert.strictEqual(r.list.length, 2000);
  const back = JSON.parse(JSON.stringify(r.list));
  old.forEach((o, i) => { keep(o, back[i]); assert.strictEqual(back[i].v, 2); });
  assert.strictEqual(WM.migrateList(back).changed, false);
  const a = snap.length / 2000, b = JSON.stringify(r.list).length / 2000;
  console.log('      size per word: ' + a.toFixed(0) + ' -> ' + b.toFixed(0) + ' bytes (2000 words: ' + (snap.length / 1024).toFixed(0) + ' KB -> ' + (JSON.stringify(r.list).length / 1024).toFixed(0) + ' KB)');
});
t('addCtx: newest first, the same sentence in the same book is not added twice, at most 5', () => {
  let e = WM.migrate(OLD);
  for (let i = 1; i <= 7; i++) e = WM.addCtx(e, { s: 'Sentence ' + i, bid: '9', bt: 'Emma', ch: i, t: 100 + i });
  assert.deepStrictEqual(plain(e.ctx).map(c => c.s), ['Sentence 7', 'Sentence 6', 'Sentence 5', 'Sentence 4', 'Sentence 3']);
  const again = WM.addCtx(e, { s: 'Sentence 5', bid: '9', bt: 'Emma', ch: 5, t: 999 });
  assert.deepStrictEqual(plain(again.ctx).map(c => c.s), ['Sentence 5', 'Sentence 7', 'Sentence 6', 'Sentence 4', 'Sentence 3']);
  assert.strictEqual(again.ctx[0].t, 999);
  const other = WM.addCtx(e, { s: 'Sentence 5', bid: '10', bt: 'Other', ch: 1, t: 1 });   // same sentence, other book: a new place
  assert.strictEqual(other.ctx.length, 5); assert.strictEqual(other.ctx[0].bid, '10');
});
t('addCtx: an old entry is migrated first, an empty sentence is ignored, a long sentence is shortened, input is not changed', () => {
  const snap = JSON.stringify(OLD), e = WM.addCtx(OLD, { s: 'x'.repeat(500), bid: '1', bt: 'B' });
  assert.strictEqual(JSON.stringify(OLD), snap); assert.strictEqual(e.v, 2); assert.strictEqual(e.ctx.length, 2); assert.ok(e.ctx[0].s.length <= 240);
  assert.strictEqual(e.ctx[1].s, OLD.ex);
  const same = WM.addCtx(OLD, { s: '   ', bid: '1' }); assert.strictEqual(same.ctx.length, 1);
  assert.strictEqual(WM.addCtx(null, { s: 'a' }), null);
});
t('the model file is pure (no storage, clock, network or screen) and is listed in build.py', () => {
  ['localStorage', 'store.', 'Date.now', 'new Date', 'document', 'fetch(', 'Math.random'].forEach(w => assert.ok(src.indexOf(w) < 0, 'model uses ' + w));
  assert.ok(fs.readFileSync(path.join(root, 'build.py'), 'utf8').indexOf("src/js/146-word-model.js") >= 0, 'not in build.py');
});

console.log('\n' + (fail ? fail + ' FAILED, ' + pass + ' passed' : 'all ' + pass + ' passed'));
process.exit(fail ? 1 : 0);
