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

/* ---- four more charts: level, part of speech, learned per day, skill balance ---- */
t('empty data gives empty arrays of the right size for the new charts', () => {
  const m = PG.calc({ words: [], log: {}, days: {} }, NOW);
  assert.deepStrictEqual(norm(m.cefr), [0, 0, 0, 0, 0, 0, 0]);
  assert.deepStrictEqual(norm(m.pos), [0, 0, 0, 0, 0, 0]);
  assert.deepStrictEqual(norm(m.learned), new Array(30).fill(0));
  assert.deepStrictEqual(norm(m.skills), { l: 0, r: 0, w: 0, s: 0 });
  assert.strictEqual(m.month, '2026-11'); assert.strictEqual(m.dayStarts.length, 30);
});
t('level: A1..C2 in order, odd spellings read, no or bad level = Unknown, nothing dropped', () => {
  const words = [w('a', 1, { lv: 'A1' }), w('b', 1, { lv: 'b1' }), w('c', 1, { lv: ' B2 ' }), w('d', 1, { lv: 'C1 \u00b7 Advanced' }), w('e', 1, { lv: 'C2' }), w('f', 1, { lv: 'C3' }), w('g', 1, { lv: '' }), w('h', 1), w('i', 1, { lv: 7 }), w('j', 1, { lv: 'A2' }), w('k', 1, { lv: 'B1' })];
  const m = PG.calc({ words, log: {}, days: {} }, NOW);
  assert.deepStrictEqual(norm(m.cefr), [1, 1, 2, 1, 1, 1, 4]);   // A1 A2 B1 B1 B2 C1 C2 | C3, '', none, 7
  assert.strictEqual(m.cefr.reduce((x, y) => x + y, 0), m.collected);
  assert.strictEqual(PG.cefrOf('a2'), 'A2'); assert.strictEqual(PG.cefrOf('XB1X'), ''); assert.strictEqual(PG.cefrOf(null), '');
});
t('part of speech: first part of speech of an entry; other; unknown; the word is counted once', () => {
  assert.strictEqual(PG.posOf(['noun', 'verb']), 'noun'); assert.strictEqual(PG.posOf(['Verb']), 'verb'); assert.strictEqual(PG.posOf('adjective'), 'adjective');
  assert.strictEqual(PG.posOf(['', 'adverb']), 'adverb'); assert.strictEqual(PG.posOf(['preposition']), 'other'); assert.strictEqual(PG.posOf(['interjection', 'noun']), 'other');
  assert.strictEqual(PG.posOf([]), 'unknown'); assert.strictEqual(PG.posOf(null), 'unknown'); assert.strictEqual(PG.posOf([5, null]), 'unknown');
  const words = [w('cat', 1), w('Run ', 1), w('big', 1), w('very', 1), w('of', 1), w('zzz', 1), w('constructor', 1), w('odd', 1)];
  const pos = { cat: 'noun', run: 'verb', big: 'adjective', very: 'adverb', of: 'other', odd: 'bogus' };
  const m = PG.calc({ words, log: {}, days: {}, pos }, NOW);
  assert.deepStrictEqual(norm(m.pos), [1, 1, 1, 1, 1, 3]);   // zzz (no data), constructor (a name on every object), odd (bad value) = Unknown
  assert.strictEqual(m.pos.reduce((x, y) => x + y, 0), m.collected);
  assert.deepStrictEqual(norm(PG.calc({ words, log: {}, days: {} }, NOW).pos), [0, 0, 0, 0, 0, 8]);   // no lookup yet: all Unknown
});
t('learned per day: last 30 days, today is the last bar, same rule as Reading analytics', () => {
  const words = [
    w('today', 40, { acq: NOW - 3600e3 }),            // today
    w('edge', 40, { acq: NOW - 29 * DAY }),           // 29 days ago = the first bar
    w('old', 40, { acq: NOW - 30 * DAY }),            // 30 days ago: outside
    w('later', 40, { acq: NOW + DAY }),               // in the future: outside
    w('gap', 3, { iv: 20 }),                          // no acq, interval 14+: learned when it was saved (3 days ago)
    w('short', 3, { iv: 5 }),                         // interval under 14: not learned
    w('two', 40, { acq: NOW - 3600e3 * 2 }),          // today again
    w('none', 3)];
  const m = PG.calc({ words, log: {}, days: {} }, NOW);
  assert.strictEqual(m.learned.length, 30);
  assert.strictEqual(m.learned[29], 2); assert.strictEqual(m.learned[0], 1); assert.strictEqual(m.learned[26], 1);
  assert.strictEqual(m.learned.reduce((x, y) => x + y, 0), 4);
  const d0 = new Date(NOW); assert.strictEqual(m.dayStarts[29], new Date(d0.getFullYear(), d0.getMonth(), d0.getDate()).getTime());
  for (let i = 1; i < 30; i++) assert.ok(m.dayStarts[i] > m.dayStarts[i - 1]);
});
t('skills: sessions this calendar month only, junk ignored', () => {
  const ielts = { '2026-11-02': { l: 2, r: 1 }, '2026-11-09': { l: 1, w: 3, s: 1 }, '2026-10-31': { l: 9 }, '2026-12-01': { r: 9 }, bad: { l: 5 }, '2026-11-05': 'x', '2026-11-06': { l: -3, r: '4', w: 1.9 } };
  assert.deepStrictEqual(norm(PG.calc({ words: [], log: {}, days: {}, ielts }, NOW).skills), { l: 3, r: 1, w: 4, s: 1 });
  assert.deepStrictEqual(norm(PG.calc({ words: [], log: {}, days: {}, ielts: [1, 2] }, NOW).skills), { l: 0, r: 0, w: 0, s: 0 });
  assert.deepStrictEqual(norm(PG.calc({ words: [], log: {}, days: {}, ielts: null }, NOW).skills), { l: 0, r: 0, w: 0, s: 0 });
});
t('the new numbers do not change the old ones', () => {
  const words = [w('a', 1, { lv: 'B1' }), mast('b', 50, 3)];
  const m = PG.calc({ words, log: {}, days: {}, pos: { a: 'noun' }, ielts: { [day(0)]: { l: 1 } } }, NOW);
  eq(m, { collected: 2, mastered: 1 }); assert.strictEqual(m.cs[7], 2);
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
