#!/usr/bin/env node
/* Automatic checks for Progress (169f) and the mt field in the scheduler (148).
     node tools/progress_check.js
   Loads the REAL 146-word-model.js, 148-scheduler.js and 169f-progress.js in one simulated page (no browser, no npm install).
   Exit code 1 if a check fails, 2 if a file cannot be loaded. */
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const read = f => fs.readFileSync(path.join(__dirname, '..', 'src/js', f), 'utf8');
let pass = 0, fail = 0;
const norm = x => JSON.parse(JSON.stringify(x));
const t = (name, fn) => { try { fn(); pass++; console.log('ok    ' + name); } catch (e) { fail++; console.log('FAIL  ' + name + '\n      ' + (e && e.message)); } };
const disk = {}, listeners = {};
const sb = { store: { get(k, d) { try { const v = disk[k]; return v ? JSON.parse(v) : d; } catch (e) { return d; } }, set(k, v) { disk[k] = JSON.stringify(v); } }, window: { addEventListener(e, f) { listeners[e] = f; } }, console, Math, Date, JSON, Object, Array, Number, String, RegExp, localStorage: { getItem: () => '' }, P: {}, ST: { days: {} }, h: () => ({}), document: { hidden: false, getElementById: () => null, addEventListener(e, f) { listeners[e] = f; } } };
vm.createContext(sb);
try { vm.runInContext(read('146-word-model.js') + '\n' + read('148-scheduler.js') + '\n' + read('148c-book-time.js') + '\n' + read('169f-progress.js') + '\n;this.WM=WM;this.SRS=SRS;this.PG=PG;this.BT=BT;', sb); }
catch (e) { console.log('cannot load: ' + e.message); process.exit(2); }
const { PG, SRS, BT } = sb, DAY = 864e5;
const NOW = new Date(2026, 10, 10, 12, 0, 0).getTime();
const day = n => { const d = new Date(NOW); d.setDate(d.getDate() - n); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const w = (name, daysAgo, extra) => Object.assign({ w: name, ts: NOW - daysAgo * DAY }, extra || {});
const mast = (name, saved, masteredAgo) => w(name, saved, { v: 2, st: 'mastered', mt: NOW - masteredAgo * DAY, iv: 40 });

t('empty data gives zeros and no accuracy', () => {
  const m = PG.calc({ words: [], log: {}, days: {} }, NOW);
  eq(m, { streak: 0, best: 0, minutes: 0, collected: 0, mastered: 0, reviews: 0, correct: 0, accuracy: null });
});
function eq(m, exp) { Object.keys(exp).forEach(k => assert.deepStrictEqual(m[k], exp[k], k)); }

t('streak counts any activity, from today or from yesterday', () => {
  const log = { [day(0)]: { r: 3 }, [day(1)]: { m: 5 }, [day(2)]: { n: 1 }, [day(4)]: { q: 1 } };
  eq(PG.calc({ words: [], log, days: {} }, NOW), { streak: 3, best: 3 });
  eq(PG.calc({ words: [], log: { [day(1)]: { m: 1 }, [day(2)]: { m: 1 } }, days: {} }, NOW), { streak: 2 });   // today still empty
  eq(PG.calc({ words: [], log: {}, days: { [day(0)]: { s: 59 } } }, NOW), { streak: 0 });                      // under a minute
  eq(PG.calc({ words: [], log: {}, days: { [day(0)]: { s: 60 } } }, NOW), { streak: 1 });
});
t('longest streak looks at the whole history', () => {
  const log = {}; [9, 8, 7, 6, 5, 4, 3, 2, 1].forEach(n => { log[day(n)] = { m: 1 }; });
  const m = PG.calc({ words: [], log: Object.assign(log, { [day(0)]: { m: 1 }, [day(20)]: { m: 1 } }), days: {} }, NOW);
  eq(m, { streak: 10, best: 10 });
  eq(PG.calc({ words: [], log: { [day(0)]: { m: 1 }, [day(30)]: { m: 1 }, [day(29)]: { m: 1 }, [day(28)]: { m: 1 } }, days: {} }, NOW), { streak: 1, best: 3 });
});
t('time: larger of listening and learning minutes per day, summed', () => {
  const m = PG.calc({ words: [], log: { [day(0)]: { m: 30 }, [day(1)]: { m: 10 } }, days: { [day(0)]: { s: 20 * 60 }, [day(1)]: { s: 40 * 60 }, [day(5)]: { s: 90 } } }, NOW);
  eq(m, { minutes: 30 + 40 + 1 });   // 30 (m wins), 40 (s wins), 90 s = 1 min after the final floor of the total
});
t('review accuracy = correct / reviews over every logged day', () => {
  const m = PG.calc({ words: [], log: { [day(0)]: { r: 10, c: 9 }, [day(3)]: { r: 4, c: 1 } }, days: {} }, NOW);
  eq(m, { reviews: 14, correct: 10, accuracy: 71 });
});
t('collected and mastered match the words; the last chart point is the real count', () => {
  const words = [w('a', 1), w('b', 10), w('c', 30), mast('d', 50, 3), mast('e', 20, 25)];
  const m = PG.calc({ words, log: {}, days: {} }, NOW);
  eq(m, { collected: 5, mastered: 2 });
  assert.strictEqual(m.cs.length, 8); assert.strictEqual(m.ms.length, 8);
  assert.strictEqual(m.cs[7], 5); assert.strictEqual(m.ms[7], 2);
});
t('chart is cumulative, never goes down, and mastered never passes collected', () => {
  const words = [w('a', 1), w('b', 10), w('c', 30), w('d', 70), mast('e', 50, 3), mast('f', 12, 11), mast('g', 100, 90)];
  const m = PG.calc({ words, log: {}, days: {} }, NOW);
  for (let i = 1; i < 8; i++) { assert.ok(m.cs[i] >= m.cs[i - 1], 'cs up ' + i); assert.ok(m.ms[i] >= m.ms[i - 1], 'ms up ' + i); }
  for (let i = 0; i < 8; i++) assert.ok(m.ms[i] <= m.cs[i], 'ms<=cs ' + i);
  assert.strictEqual(m.cs[0], 3);   // saved 49+ days before today: d (70), e (50), g (100)
});
t('exact weekly points for a known set', () => {
  // week ends are today-49, -42, -35, -28, -21, -14, -7, 0 (end of day)
  const words = [w('p', 60), w('q', 40), w('r', 5), mast('s', 60, 20)];   // s mastered 20 days ago
  const m = PG.calc({ words, log: {}, days: {} }, NOW);
  // p (60 days ago) and s (60) are there from the start, q (40) joins at -35, r (5) is the last point; s is mastered from the week ending -14
  assert.deepStrictEqual(norm(m.cs), [2, 2, 3, 3, 3, 3, 3, 4]);
  assert.deepStrictEqual(norm(m.ms), [0, 0, 0, 0, 0, 1, 1, 1]);
});
t('an old mastered word without mt is dated by its last review, and never before it was saved', () => {
  const old = w('x', 100, { v: 2, st: 'mastered', iv: 40, lr: NOW - 8 * DAY, due: NOW + 30 * DAY });
  const m = PG.calc({ words: [old], log: {}, days: {} }, NOW);
  assert.deepStrictEqual(norm(m.ms), [0, 0, 0, 0, 0, 0, 1, 1]);   // lr 8 days ago: counted from the week ending 7 days ago
  const odd = w('y', 3, { v: 2, st: 'mastered', iv: 40, mt: NOW - 30 * DAY });
  const m2 = PG.calc({ words: [odd], log: {}, days: {} }, NOW);
  assert.ok(m2.ms.every((v, i) => v <= m2.cs[i]));
});
t('a word without ts counts as collected from the start', () => {
  const m = PG.calc({ words: [{ w: 'z' }], log: {}, days: {} }, NOW);
  assert.strictEqual(m.cs[0], 1);
});
t('junk input is ignored', () => {
  const m = PG.calc({ words: [null, 5, { x: 1 }, w('ok', 1)], log: { bad: { m: 5 }, [day(0)]: 'x' }, days: { [day(0)]: null } }, NOW);
  eq(m, { collected: 1, minutes: 0, streak: 0 });
});
t('SRS.review sets mt only when a word becomes mastered', () => {
  let e = { w: 'k', ts: NOW - 90 * DAY, sch: 1, st: 'learning', iv: 20, reps: 5, ease: 2.5, lr: NOW - 20 * DAY, due: NOW, rdays: [SRS.dayOf(NOW - 5 * DAY, 0), SRS.dayOf(NOW - 3 * DAY, 0)], cnt: { rec: 0, und: 0, rcl: 2, use: 0 }, lap: 0 };
  const a = SRS.review(e, 2, NOW, { kind: 'rcl', tz: 0 });
  assert.strictEqual(a.st, 'mastered'); assert.strictEqual(a.mt, NOW);
  const b = SRS.review(a, 2, NOW + 30 * DAY, { kind: 'rcl', tz: 0 });
  assert.strictEqual(b.st, 'mastered'); assert.strictEqual(b.mt, NOW);   // still mastered: the date stays
  const c = SRS.review(a, 0, NOW + DAY, { kind: 'rcl', tz: 0 });
  assert.notStrictEqual(c.st, 'mastered'); assert.strictEqual(c.mt, NOW);   // forgotten: mt is kept (never deleted), the word is not counted
  const d = SRS.review(c, 2, NOW + 2 * DAY, { kind: 'rcl', tz: 0 });
  assert.ok(!d.mt || d.mt === NOW);
  const n = SRS.review({ w: 'n', ts: NOW }, 2, NOW, { kind: 'rcl', tz: 0 });
  assert.strictEqual(n.mt, undefined);
});

const wb = (name, bid, bt, extra) => w(name, 5, Object.assign({ bid, bt }, extra || {}));
t('per book: time, words found, mastered, chapters done', () => {
  const words = [wb('a', 11, 'Dracula'), wb('b', 11, 'Dracula', { v: 2, st: 'mastered', mt: NOW - DAY, iv: 40 }), wb('c', 22, 'Walden'),
    w('d', 5, { bid: 22, bt: 'Walden', ctx: [{ s: 'x', bid: '11', bt: 'Dracula' }, { s: 'y', bid: '22', bt: 'Walden' }] })];
  const m = PG.calc({ words, log: {}, days: {}, booktime: { 11: 4000, 33: 90 }, lp: { 11: { 0: 1, 1: 1, 2: 0.6 }, 22: { 0: 0.99 }, 44: {} }, titles: { 33: 'Emma' }, finished: 0 }, NOW);
  const by = id => m.books.find(b => b.id === String(id));
  eq(by(11), { title: 'Dracula', secs: 4000, minutes: 66, words: 3, mastered: 1, chapters: 2 });   // a, b and d (its ctx)
  eq(by(22), { title: 'Walden', secs: 0, words: 2, mastered: 0, chapters: 0 });                     // c and d: a track at 0.99 is not done
  eq(by(33), { title: 'Emma', secs: 90, words: 0, chapters: 0 });
  assert.strictEqual(by(44), undefined);                                                          // nothing to show for it
  assert.deepStrictEqual(m.books.map(b => b.id), ['11', '33', '22']);                              // most time first, then words
});
t('milestones come from the data and stop at the target', () => {
  const words = []; for (let i = 0; i < 120; i++) words.push(w('w' + i, i));
  const log = {}; for (let i = 0; i < 7; i++) log[day(i)] = { m: 1 };
  let m = PG.calc({ words, log, days: {}, finished: 1 }, NOW);
  assert.deepStrictEqual(norm(m.milestones.map(x => [x.id, x.have, x.done])), [['words100', 100, true], ['streak7', 7, true], ['book1', 1, true], ['mastered500', 0, false]]);
  m = PG.calc({ words: words.slice(0, 40), log: { [day(0)]: { m: 1 }, [day(1)]: { m: 1 } }, days: {}, finished: 0 }, NOW);
  assert.deepStrictEqual(norm(m.milestones.map(x => [x.have, x.done])), [[40, false], [2, false], [0, false], [0, false]]);
  const many = []; for (let i = 0; i < 520; i++) many.push(w('m' + i, 1, { v: 2, st: 'mastered', mt: NOW - DAY, iv: 40 }));
  m = PG.calc({ words: many, log: {}, days: {}, finished: 0 }, NOW);
  assert.deepStrictEqual(norm(m.milestones[3]), { id: 'mastered500', have: 500, target: 500, done: true });
});
t('book time: memory first, written about once a minute, merge keeps the larger value', () => {
  BT.add(7, 30); assert.strictEqual(disk['wt:booktime'], undefined); assert.strictEqual(BT.get()['7'], 30);
  BT.add(7, 31); assert.deepStrictEqual(JSON.parse(disk['wt:booktime']), { 7: 61 });
  BT.add(8, 5); BT.add(8, 9999); BT.add(8, -3); BT.add(null, 5); assert.strictEqual(BT.get()['8'], 5);
  listeners.pagehide && listeners.pagehide(); assert.strictEqual(JSON.parse(disk['wt:booktime'])['8'], 5);
  assert.deepStrictEqual(norm(BT.merge({ a: 5, b: 9 }, { a: 7, c: 1 })), { a: 7, b: 9, c: 1 });
  assert.deepStrictEqual(JSON.parse(BT.mergeJson('{"a":5}', '{"a":2,"b":3}')), { a: 5, b: 3 });
  assert.strictEqual(BT.mergeJson('[1]', '{}'), null); assert.strictEqual(BT.mergeJson('nope', '{}'), null);
  const big = {}; for (let i = 0; i < 450; i++) big['b' + i] = i + 1;
  assert.strictEqual(Object.keys(BT.merge(big, {})).length, 400);
});
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
