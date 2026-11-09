#!/usr/bin/env node
/* Automatic checks for the saved-word model and its migration (146) and the store API (147), plus the real
   vocToggle / srsGrade from 160 (no browser, no npm install).
     node tools/words_check.js
   Loads the REAL files from src/js/, so it tests what ships. Exit code 1 if a check fails, 2 if a file cannot be loaded. */
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

/* ---------- the store API (147) and the old UI code that uses it ---------- */
const read = f => fs.readFileSync(path.join(root, 'src/js', f), 'utf8');
function grab(src, name) {   // cut `function name(...) {...}` or `const name = ...;` out of a file
  const m = new RegExp('(?:async\\s+)?function\\s+' + name + '\\s*\\(|const\\s+' + name + '\\s*=').exec(src);
  if (!m) throw new Error('not found: ' + name);
  if (src[m.index] === 'c') return src.slice(m.index, src.indexOf('\n', m.index));
  let i = src.indexOf('{', m.index), d = 0;
  for (; i < src.length; i++) { if (src[i] === '{') d++; else if (src[i] === '}' && --d === 0) return src.slice(m.index, i + 1); }
  throw new Error('unbalanced: ' + name);
}

/* In-memory stand-in for `store` (030): same JSON round trip, and it counts writes. */
const disk = {}, log = [];
const store = {
  get(k, d) { try { const v = disk[k]; return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set(k, v) { disk[k] = JSON.stringify(v); log.push(k); }
};
let T = {}, learn;
try {
  const l160 = read('160-learning-tools.js');
  const code = read('146-word-model.js') + '\n' + read('147-word-store.js') + '\n' + read('148-scheduler.js') + '\n' +
    ['myWords', 'srsDue', 'srsGrade', 'vocToggle', 'vocEntry'].map(n => grab(l160, n)).join('\n') +
    '\nthis.T = { WM, WS, SRS, myWords, srsDue, srsGrade, vocToggle, vocEntry };';
  const ctx = vm.createContext({ store, S: { book: { id: 7, title: 'Emma' } }, VOC: { books: new Map() } });
  vm.runInContext(code, ctx); T = ctx.T; learn = l160;
} catch (e) { console.error('words_check: cannot load the code: ' + e.message); process.exit(2); }
const WS = T.WS;
const reset = (list) => { Object.keys(disk).forEach(k => delete disk[k]); log.length = 0; if (list) disk['wt:words'] = JSON.stringify(list); };
const saved = () => JSON.parse(disk['wt:words'] || '[]');


/* ---- the old UI: vocToggle and friends ---- */
t('vocToggle saves an old-shape entry (ts, w, lv, ex, bid, bt) and returns true', () => {
  reset();
  assert.strictEqual(T.vocToggle(T.vocEntry('ample', 'B2', 'An ample supply.')), true);
  const e = saved()[0];
  ['ts', 'w', 'lv', 'ex', 'bid', 'bt'].forEach(k => assert.ok(k in e, 'missing ' + k));
  assert.deepStrictEqual([e.w, e.lv, e.ex, e.bid, e.bt], ['ample', 'B2', 'An ample supply.', '7', 'Emma']);
  assert.ok(e.ts > 0);
});
t('vocToggle again removes it and returns false', () => {
  reset(); T.vocToggle({ w: 'ample', lv: '', ex: '', bid: '1', bt: 'X' });
  assert.strictEqual(T.vocToggle({ w: 'ample', lv: '', ex: '', bid: '1', bt: 'X' }), false);
  assert.deepStrictEqual(saved(), []);
});
t('newest saved word is first, like before', () => {
  reset(); ['a', 'b', 'c'].forEach(w => T.vocToggle({ w, lv: '', ex: '', bid: '', bt: '' }));
  assert.deepStrictEqual(saved().map(e => e.w), ['c', 'b', 'a']);
});
t('the list is capped at 2000, oldest dropped', () => {
  reset(Array.from({ length: 2000 }, (_, i) => ({ ts: 1, w: 'w' + i })));
  T.vocToggle({ w: 'new', lv: '', ex: '', bid: '', bt: '' });
  const l = saved(); assert.strictEqual(l.length, 2000); assert.strictEqual(l[0].w, 'new'); assert.strictEqual(l[1999].w, 'w1998');
});
t('Review grade keeps every old field and sets the SM-2 fields', () => {
  reset([{ ts: 5, w: 'ample', lv: 'B2', ex: 'x', bid: '7', bt: 'Emma' }]);
  const e = T.myWords()[0]; T.srsGrade(e.w, 1);
  const s = saved()[0];
  assert.deepStrictEqual([s.ts, s.w, s.lv, s.ex, s.bid, s.bt], [5, 'ample', 'B2', 'x', '7', 'Emma']);
  assert.strictEqual(s.iv, 2); assert.strictEqual(s.reps, 1); assert.ok(s.due > Date.now()); assert.strictEqual(s.st, 'learning');
  assert.strictEqual(s.sch, 1); assert.strictEqual(s.cnt.rec, 1); assert.strictEqual(s.cnt.rcl, 0);   // Good = right at the recognise level
});
t('grading a word that is not saved changes nothing and writes nothing', () => {
  reset([{ ts: 1, w: 'a' }]); log.length = 0;
  assert.strictEqual(T.srsGrade('zzz', 2), null); assert.strictEqual(log.length, 0);
});
t('myWords still works with srsDue (new word is due, graded word is not)', () => {
  reset([{ ts: 1, w: 'a' }, { ts: 2, w: 'b', due: Date.now() + 1e6 }]);
  assert.deepStrictEqual(T.myWords().filter(T.srsDue).map(e => e.w), ['a']);
});

/* ---- the API ---- */
t('one entry per lowercase word (Hello and hello are one)', () => {
  reset(); WS.saveWithContext('Hello', { s: 'Hello there.', bid: 1 }); WS.saveWithContext(' hello ', { s: 'Oh hello!', bid: 1 });
  const l = saved(); assert.strictEqual(l.length, 1); assert.strictEqual(l[0].w, 'hello'); assert.strictEqual(l[0].ctx.length, 2);
});
t('contexts merge by book plus sentence', () => {
  reset();
  WS.saveWithContext('ample', { s: 'One.', bid: 1, bt: 'A' });
  WS.saveWithContext('ample', { s: 'Two.', bid: 1, bt: 'A' });
  WS.saveWithContext('ample', { s: 'One.', bid: 1, bt: 'A' });   // same book + sentence: moves to the front, not added
  assert.deepStrictEqual(saved()[0].ctx.map(c => c.s), ['One.', 'Two.']);
  WS.saveWithContext('ample', { s: 'One.', bid: 2, bt: 'B' });   // same sentence, other book: a new place
  assert.strictEqual(saved()[0].ctx.length, 3);
});
t('at most 5 contexts, newest first', () => {
  reset(); for (let i = 0; i < 7; i++) WS.saveWithContext('w', { s: 's' + i, bid: 1 });
  const c = saved()[0].ctx; assert.strictEqual(c.length, 5); assert.strictEqual(c[0].s, 's6'); assert.strictEqual(c[4].s, 's2');
});
t('saving a saved word again keeps its place, ts and old fields', () => {
  reset([{ ts: 9, w: 'b', lv: 'C1', ex: 'old' }, { ts: 8, w: 'a' }]);
  WS.saveWithContext('a', { s: 'New.', bid: 3 });
  const l = saved(); assert.deepStrictEqual(l.map(e => e.w), ['b', 'a']); assert.strictEqual(l[1].ts, 8);
  assert.strictEqual(l[0].lv, 'C1'); assert.strictEqual(l[0].ex, 'old');
});
t('get: found in any case; missing gives null; reading writes nothing', () => {
  reset([{ ts: 1, w: 'ample', ex: 'S.', bid: '4', bt: 'T' }]); log.length = 0;
  const e = WS.get('AMPLE'); assert.strictEqual(e.v, 2); assert.strictEqual(e.ctx[0].s, 'S.');
  assert.strictEqual(WS.get('nope'), null); assert.strictEqual(WS.get(''), null); WS.all(); WS.search('a');
  assert.strictEqual(log.length, 0); assert.strictEqual(saved()[0].v, undefined);
});
t('lazy migration: only the changed entry is upgraded, no field is lost', () => {
  const a = { ts: 1, w: 'a', lv: 'B1', ex: 'x', bid: '1', bt: 'T', ease: 2.5, iv: 20, reps: 3, due: 5, acq: 6, extra: 'keep' };
  const b = { ts: 2, w: 'b' };
  reset([a, b]); WS.setNote('a', 'my note');
  const l = saved(); assert.strictEqual(l[0].v, 2); assert.strictEqual(l[1].v, undefined);
  Object.keys(a).forEach(k => assert.deepStrictEqual(l[0][k], a[k], 'lost ' + k));
  assert.strictEqual(l[0].st, 'familiar');
});
t('a word from a newer app (v above 2) and non-word items are left alone', () => {
  const nw = { w: 'z', v: 3, note: 5 }, junk = 'oops';
  reset([nw, junk, { ts: 1, w: 'a' }]); WS.setNote('a', 'n');
  const l = saved(); assert.deepStrictEqual(l[0], nw); assert.strictEqual(l[1], junk);
  assert.strictEqual(WS.remove('a'), true); assert.deepStrictEqual(saved(), [nw, junk]);
});
t('remove: true when removed, false (and no write) when not saved', () => {
  reset([{ ts: 1, w: 'a' }]); assert.strictEqual(WS.remove('A'), true); assert.deepStrictEqual(saved(), []);
  log.length = 0; assert.strictEqual(WS.remove('a'), false); assert.strictEqual(log.length, 0);
});
t('setNote: trims, caps at 1000, clears; unsaved word gives null and no write', () => {
  reset([{ ts: 1, w: 'a' }]);
  assert.strictEqual(WS.setNote('a', '  hi  ').note, 'hi');
  assert.strictEqual(WS.setNote('a', 'x'.repeat(1500)).note.length, 1000);
  assert.strictEqual(WS.setNote('a', '').note, ''); assert.strictEqual(WS.setNote('a', null).note, '');
  log.length = 0; assert.strictEqual(WS.setNote('nope', 'x'), null); assert.strictEqual(log.length, 0);
});
t('toggleHard flips and returns the new value; unsaved gives null', () => {
  reset([{ ts: 1, w: 'a' }]);
  assert.strictEqual(WS.toggleHard('a'), true); assert.strictEqual(saved()[0].hard, true);
  assert.strictEqual(WS.toggleHard('a'), false); assert.strictEqual(WS.toggleHard('nope'), null);
});
t('addToCollection: trims, no duplicates (any case), on:false removes, unsaved gives null', () => {
  reset([{ ts: 1, w: 'a' }]);
  WS.addToCollection('a', ' IELTS '); WS.addToCollection('a', 'ielts'); WS.addToCollection('a', 'Emma');
  assert.deepStrictEqual(saved()[0].cols, ['ielts'.replace('ielts', 'IELTS'), 'Emma']);
  WS.addToCollection('a', 'IELTS', false); assert.deepStrictEqual(saved()[0].cols, ['Emma']);
  assert.strictEqual(WS.addToCollection('a', '   '), null); assert.strictEqual(WS.addToCollection('nope', 'x'), null);
});
t('collections: name capped at 40, at most 20 per word', () => {
  reset([{ ts: 1, w: 'a' }]);
  assert.strictEqual(WS.addToCollection('a', 'n'.repeat(60)).cols[0].length, 40);
  for (let i = 0; i < 25; i++) WS.addToCollection('a', 'c' + i);
  assert.strictEqual(saved()[0].cols.length, 20);
});
t('search: ranks exact, prefix, contains, then note/sentence/collection; filters hard and collection', () => {
  reset(); ['rename', 'name', 'name2', 'x'].forEach(w => WS.saveWithContext(w, { s: w === 'x' ? 'A fine name here.' : 's', bid: 1 }));
  WS.toggleHard('rename'); WS.addToCollection('name2', 'Trip');
  assert.deepStrictEqual(plain(WS.search('name').map(e => e.w)), ['name', 'name2', 'rename', 'x']);
  assert.deepStrictEqual(plain(WS.search('name', { hard: true }).map(e => e.w)), ['rename']);
  assert.deepStrictEqual(plain(WS.search('', { col: 'trip' }).map(e => e.w)), ['name2']);
  assert.deepStrictEqual(plain(WS.search('trip').map(e => e.w)), ['name2']);
  assert.strictEqual(WS.search('name', { limit: 2 }).length, 2);
  assert.strictEqual(WS.search('').length, 4); assert.deepStrictEqual(plain(WS.search('zzz')), []);
});
t('storage that is broken or not a list does not throw', () => {
  reset(); disk['wt:words'] = '{"not":"a list"}';
  assert.strictEqual(WS.get('a'), null); assert.deepStrictEqual(plain(WS.all()), []); assert.strictEqual(WS.remove('a'), false);
  WS.saveWithContext('a', { s: 'x', bid: 1 }); assert.strictEqual(saved().length, 1);
  disk['wt:words'] = '{{{'; assert.deepStrictEqual(plain(WS.all()), []);
});
t('entries keep key w (account sync matches words by w) and stay plain JSON', () => {
  reset(); WS.saveWithContext('Ample', { s: 'S.', bid: 1 });
  const e = saved()[0]; assert.strictEqual(e.w, 'ample'); assert.deepStrictEqual(plain(e), e); assert.ok(WM.migrate(e) === e, 'saved entry is already complete v2');
});
t('nothing outside 147 writes wt:words; BK_LISTS and sync category still name it', () => {
  fs.readdirSync(path.join(__dirname, '..', 'src/js')).filter(f => f.endsWith('.js') && f !== '147-word-store.js').forEach(f => {
    assert.ok(!/store\.set\(\s*['"]wt:words['"]/.test(read(f)), f + ' writes wt:words directly');
  });
  assert.ok(read('295-account-sync.js').includes("'wt:words'") && read('290-backup-maintenance.js').includes("'wt:words'"));
});
t('build.py loads 147 after 146 and before 160', () => {
  const b = fs.readFileSync(path.join(__dirname, '..', 'build.py'), 'utf8');
  const i = ['146-word-model', '147-word-store', '160-learning-tools'].map(x => b.indexOf(x)); assert.ok(i[0] > 0 && i[0] < i[1] && i[1] < i[2]);
});

/* ---------- two devices (295) and backup (290) ---------- */
let SY, BKC;
try {
  const sync = read('295-account-sync.js'), bk = read('290-backup-maintenance.js');
  const code = read('146-word-model.js') + '\n' +
    ['acKeyOf', 'acIsObj', 'acWords', 'acUnion', 'acResolve', 'AC_MERGE'].map(n => grab(sync, n)).join('\n') + '\n' +
    ['BK_KEYS', 'BK_PREFIX', 'BK_IDB', 'bkWanted', 'BK_MAX_IDB', 'BK_LISTS', 'bkIsObj', 'bkIsList', 'bkShapeOk', 'bkCleanPrefs', 'bkCheck'].map(n => grab(bk, n)).join('\n') +
    '\nthis.X = { WM, acWords, acUnion, acResolve, AC_MERGE, bkCheck };';
  const c = vm.createContext({ P: {} }); vm.runInContext(code, c); SY = c.X; BKC = c.X;
} catch (e) { console.error('words_check: cannot load 295 / 290 code: ' + e.message); process.exit(2); }

const DAY = 864e5, NOW = 1800000000000;
const mk = (w, o) => Object.assign({ ts: NOW - 50 * DAY, w, lv: 'B2', ex: 'Example for ' + w + '.', bid: '7', bt: 'Emma' }, o || {});
const cx = (s, bid, t, bt) => ({ s, bid: String(bid), bt: bt || 'Book ' + bid, ch: null, t });
const words = (a, b) => plain(SY.acWords(a, b));
const reviewed = (days, ago) => ({ ease: 2.5, iv: days, reps: 3, due: NOW - ago * DAY + days * DAY, acq: 0 });   // last reviewed `ago` days before NOW

t('two devices: the same word becomes one entry with the places from both, same book + sentence once', () => {
  const a = SY.WM.migrate(mk('ample')); a.ctx = [cx('Phone A.', 7, 300), cx('Both.', 7, 200)];
  const b = SY.WM.migrate(mk('ample')); b.ctx = [cx('Both.', 7, 250), cx('Tablet B.', 9, 100)];
  const m = words([a], [b]); assert.strictEqual(m.length, 1);
  assert.deepStrictEqual(m[0].ctx.map(c => c.s), ['Phone A.', 'Both.', 'Tablet B.']);
  assert.strictEqual(m[0].ctx[1].t, 250, 'the later time of the same place is kept');
});
t('two devices: at most 5 places, newest first', () => {
  const a = SY.WM.migrate(mk('w')), b = SY.WM.migrate(mk('w'));
  a.ctx = [1, 2, 3, 4].map(i => cx('a' + i, 1, 1000 - i)); b.ctx = [1, 2, 3, 4].map(i => cx('b' + i, 2, 2000 - i));
  const c = words([a], [b])[0].ctx; assert.strictEqual(c.length, 5); assert.deepStrictEqual(c.map(x => x.s), ['b1', 'b2', 'b3', 'b4', 'a1']);
});
t('two devices: the more recent review schedule wins as a whole (either way round)', () => {
  const a = mk('ample', Object.assign(reviewed(6, 1), { ease: 2.3 })), b = mk('ample', Object.assign(reviewed(20, 9), { ease: 2.8, reps: 5, acq: NOW - 9 * DAY }));
  [words([a], [b]), words([b], [a])].forEach(m => {
    assert.strictEqual(m[0].iv, 6); assert.strictEqual(m[0].ease, 2.3); assert.strictEqual(m[0].reps, 3); assert.strictEqual(m[0].due, a.due);
    assert.strictEqual(m[0].acq, b.acq, 'earliest acquired time kept'); assert.strictEqual(m[0].st, 'learning');
  });
});
t('two devices: a reviewed word beats a never reviewed one, and a tie goes to more reps', () => {
  assert.strictEqual(words([mk('a')], [mk('a', reviewed(4, 1))])[0].iv, 4);
  assert.strictEqual(words([mk('a', reviewed(4, 1))], [mk('a')])[0].iv, 4);
  const x = mk('a', { ease: 2.5, iv: 4, reps: 2, due: NOW }), y = mk('a', { ease: 2.1, iv: 4, reps: 6, due: NOW });
  assert.strictEqual(words([x], [y])[0].reps, 6);
});
t('two devices: counters take the larger value, hard is kept if either says hard, collections join without repeats', () => {
  const a = SY.WM.migrate(mk('w', { hard: true })), b = SY.WM.migrate(mk('w'));
  a.cnt = { rec: 3, und: 0, rcl: 1, use: 0 }; b.cnt = { rec: 1, und: 2, rcl: 0, use: 0 }; a.cols = ['IELTS', 'Trip']; b.cols = ['ielts', 'Emma'];
  const m = words([a], [b])[0];
  assert.deepStrictEqual(m.cnt, { rec: 3, und: 2, rcl: 1, use: 0 }); assert.strictEqual(m.hard, true);
  assert.deepStrictEqual(m.cols.map(x => x.toLowerCase()).sort(), ['emma', 'ielts', 'trip']);
});
t('two devices: both notes are kept, and merging again never makes the note grow', () => {
  const a = SY.WM.migrate(mk('w')), b = SY.WM.migrate(mk('w')); a.note = 'from phone'; b.note = 'from tablet';
  const m1 = words([a], [b])[0], m2 = words([b], [a])[0];
  assert.ok(m1.note.includes('from phone') && m1.note.includes('from tablet')); assert.strictEqual(m1.note, m2.note);
  assert.strictEqual(words([m1], [a])[0].note, m1.note); assert.strictEqual(words([m1], [m2])[0].note, m1.note);
  b.note = ''; assert.strictEqual(words([a], [b])[0].note, 'from phone');
});
t('two devices: both orders give identical data, and merging a copy with itself changes nothing', () => {
  const a = SY.WM.migrate(mk('ample', Object.assign(reviewed(6, 1), { note: 'n1', cols: ['x'] }))), b = SY.WM.migrate(mk('ample', { ts: NOW - 10 * DAY, ex: 'Other.', note: 'n2' }));
  a.ctx = [cx('A.', 1, 5)]; b.ctx = [cx('B.', 2, 6)];
  assert.strictEqual(JSON.stringify(words([a], [b])), JSON.stringify(words([b], [a])));
  const m = words([a], [b]); assert.strictEqual(JSON.stringify(words(m, m)), JSON.stringify(m)); assert.strictEqual(JSON.stringify(words(m, [a])), JSON.stringify(m));
  assert.strictEqual(JSON.stringify(words([a], [a])), JSON.stringify([SY.WM.tidy(a)]));
});
t('two devices: the earliest save time and the first saved copy\'s book fields are kept; empty fields are filled', () => {
  const a = mk('w', { ts: NOW - 5 * DAY, lv: '', bt: 'Late book' }), b = mk('w', { ts: NOW - 40 * DAY, lv: 'C1', bt: 'First book' });
  const m = words([a], [b])[0]; assert.strictEqual(m.ts, b.ts); assert.strictEqual(m.bt, 'First book'); assert.strictEqual(m.lv, 'C1');
  assert.strictEqual(words([mk('w', { lv: '' })], [mk('w', { lv: 'C1' })])[0].lv, 'C1');
});
t('two devices: words on one side only stay exactly as they are (old shape is not upgraded), newest saved first', () => {
  const a = [mk('b', { ts: 20 }), mk('a', { ts: 10 })], b = [mk('c', { ts: 30 })];
  const m = words(a, b); assert.deepStrictEqual(m.map(e => e.w), ['c', 'b', 'a']);
  assert.deepStrictEqual(m[1], plain(a[0])); assert.strictEqual(m[1].v, undefined);
});
t('two devices: Hello and hello are the same word; things that are not words are kept once; the list is capped at 2000', () => {
  const m = words([mk('Hello')], [mk('hello'), 'odd', 'odd', { x: 1 }]); assert.strictEqual(m.filter(e => e && e.w).length, 1); assert.strictEqual(m.length, 3);
  const big = n => Array.from({ length: n }, (_, i) => mk('w' + i, { ts: i + 1 }));
  assert.strictEqual(words(big(1500), big(2500).slice(1000)).length, 2000);
});
t('two devices: an old entry on one device and a v2 entry on the other merge into one v2 entry with every old field', () => {
  const old = mk('ample', { extra: 'keep', ease: 2.5, iv: 3, reps: 1, due: NOW + DAY }), v2 = SY.WM.migrate(mk('ample', { ts: NOW - 2 * DAY })); v2.note = 'hi';
  const m = words([old], [v2])[0]; assert.strictEqual(m.v, 2); assert.strictEqual(m.note, 'hi'); assert.strictEqual(m.extra, 'keep'); assert.strictEqual(m.iv, 3);
  ['ts', 'w', 'lv', 'ex', 'bid', 'bt'].forEach(k => assert.ok(k in m));
});
t('two devices: the merged entry stays small (places, note, collections limited) and valid v2', () => {
  const a = SY.WM.migrate(mk('w')), b = SY.WM.migrate(mk('w'));
  a.note = 'n'.repeat(900); b.note = 'm'.repeat(900); a.cols = Array.from({ length: 20 }, (_, i) => 'a' + i); b.cols = Array.from({ length: 20 }, (_, i) => 'b' + i + 'x'.repeat(60));
  a.ctx = [cx('s'.repeat(500), 1, 9, 'T'.repeat(200))];
  const m = words([a], [b])[0];
  assert.ok(m.note.length <= 1000); assert.strictEqual(m.cols.length, 20); assert.ok(m.cols.every(c => c.length <= 40));
  assert.ok(m.ctx[0].s.length <= 240 && m.ctx[0].bt.length <= 80); assert.ok(SY.WM.migrate(m) === m || JSON.stringify(SY.WM.migrate(m)) === JSON.stringify(m));
  const e = SY.WM.migrate(mk('w')); e.ctx = [1, 2, 3, 4, 5].map(i => cx('A sentence of ordinary length from the book, number ' + i + '.', 7, i)); assert.ok(JSON.stringify(e).length < 1500, 'a typical entry is under 1.5 KB');
});
t('two devices: not the same word, or an entry from a newer app, is not merged (the caller keeps the newer one)', () => {
  assert.strictEqual(SY.WM.merge(mk('a'), mk('b')), null); assert.strictEqual(SY.WM.merge(mk('a'), { w: 'a', v: 3 }), null); assert.strictEqual(SY.WM.merge(mk('a'), 'x'), null);
  const m = words([mk('a', { ts: 5 })], [{ w: 'a', v: 3, ts: 9, note: 'new app' }]); assert.strictEqual(m.length, 1); assert.strictEqual(m[0].v, 3); assert.strictEqual(m[0].note, 'new app');
});
t('sync wiring: wt:words is merged on a conflict (acResolve) and on the first sync (acUnion), and the other keys still behave', () => {
  assert.ok(SY.AC_MERGE('wt:words')); assert.ok(SY.AC_MERGE('wt:clips:1')); assert.ok(!SY.AC_MERGE('wt:favs'));
  const a = JSON.stringify([mk('a', { ts: 3 })]), b = JSON.stringify([mk('b', { ts: 4 })]);
  [SY.acResolve('wt:words', a, b, true), SY.acUnion('wt:words', a, b)].forEach(j => assert.deepStrictEqual(JSON.parse(j).map(e => e.w), ['b', 'a']));
  assert.strictEqual(SY.acResolve('wt:words', '{}', b, true), null); assert.strictEqual(SY.acResolve('wt:words', '{{', b, true), null);
  const f = SY.acUnion('wt:favs', JSON.stringify([{ id: 1, ts: 1 }]), JSON.stringify([{ id: 2, ts: 2 }])); assert.strictEqual(JSON.parse(f).length, 2);
});
t('sync wiring: 295 uses WM.merge and does not copy the merge rules', () => {
  assert.ok(/WM\.merge\(/.test(read('295-account-sync.js')));
});

const bkOf = list => ({ app: 'wordtrail', kind: 'backup', v: 1, created: '2026-01-01T00:00:00.000Z', ls: { 'wt:words': list, 'wt:favs': [] }, idb: {} });
const imp = list => { const r = BKC.bkCheck(JSON.parse(JSON.stringify(bkOf(list)))); return { words: plain(r.ls['wt:words']), skipped: r.skipped }; };
t('import: an old-shape backup comes back exactly as it was (every field, no upgrade)', () => {
  const old = [mk('ample', { ease: 2.5, iv: 6, reps: 2, due: NOW, acq: 5, extra: 1 }), mk('forlorn'), { ts: 1, w: 'solitude' }];
  const r = imp(old); assert.deepStrictEqual(r.words, old); assert.strictEqual(r.skipped, 0); assert.strictEqual(r.words[0].v, undefined);
});
t('import: a new-shape backup comes back the same', () => {
  const nu = [SY.WM.migrate(mk('ample', reviewed(6, 1))), SY.WM.migrate(mk('forlorn'))]; nu[0].ctx = [cx('S.', 7, 5)]; nu[0].note = 'my note'; nu[0].cols = ['IELTS']; nu[0].hard = true;
  const r = imp(nu); assert.deepStrictEqual(r.words, plain(nu)); assert.strictEqual(r.skipped, 0);
});
t('import: old and new shapes mixed in one backup, doubles merged, junk skipped and counted', () => {
  const nu = SY.WM.migrate(mk('Ample')); nu.ctx = [cx('New place.', 9, 99)];
  const r = imp([mk('ample'), mk('other'), nu, 'junk', null, { ts: 1 }, { w: '  ' }]);
  assert.deepStrictEqual(r.words.map(e => e.w), ['ample', 'other']); assert.strictEqual(r.skipped, 4);
  assert.ok(r.words[0].ctx.some(c => c.s === 'New place.') && r.words[0].v === 2); assert.strictEqual(r.words[1].v, undefined);
});
t('import: more than 2000 words keep the first 2000; oversized v2 entries are cut down; other keys are unaffected', () => {
  assert.strictEqual(imp(Array.from({ length: 2300 }, (_, i) => mk('w' + i))).words.length, 2000);
  const e = SY.WM.migrate(mk('w')); e.note = 'x'.repeat(5000); e.cols = Array.from({ length: 50 }, (_, i) => 'c' + i); e.ctx = Array.from({ length: 5 }, (_, i) => cx('s'.repeat(900), i, i));
  const w = imp([e]).words[0]; assert.ok(w.note.length <= 1000 && w.cols.length <= 20 && w.ctx.every(c => c.s.length <= 240));
  assert.deepStrictEqual(plain(BKC.bkCheck(bkOf([]).ls ? bkOf([]) : null).ls['wt:favs']), []);
});
t('import: what a backup carries is what the app stores (export is the stored list as it is), and old data still works after a round trip', () => {
  const stored = [mk('ample'), SY.WM.migrate(mk('forlorn'))];
  const file = JSON.parse(JSON.stringify(bkOf(stored))), got = BKC.bkCheck(file).ls['wt:words'];
  reset(); disk['wt:words'] = JSON.stringify(got);
  assert.strictEqual(WS.get('ample').ctx[0].s, 'Example for ample.'); assert.strictEqual(WS.setNote('forlorn', 'n').note, 'n'); assert.strictEqual(T.myWords().length, 2);
});
t('import: words that are not a list are still skipped as before', () => {
  const r = BKC.bkCheck({ ls: { 'wt:words': { not: 'a list' }, 'wt:favs': [] }, idb: {} }); assert.strictEqual(r.skipped, 1); assert.ok(!('wt:words' in r.ls));
});

console.log('\n' + (fail ? fail + ' FAILED, ' + pass + ' passed' : 'all ' + pass + ' passed'));
process.exit(fail ? 1 : 0);
