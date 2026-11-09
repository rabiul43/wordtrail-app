#!/usr/bin/env node
/* Automatic checks for the word scheduler (148-scheduler.js): grades, intervals, mastery, old-word mapping and simulated 60-day schedules.
   No browser, no npm install.
     node tools/srs_check.js
   Loads the REAL src/js/148-scheduler.js (and 146-word-model.js for the compatibility check, srsDue from 160 for the same-rule check).
   Exit code 1 if a check fails, 2 if a file cannot be loaded. */
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const root = path.join(__dirname, '..'), read = f => fs.readFileSync(path.join(root, 'src/js', f), 'utf8');
const plain = x => JSON.parse(JSON.stringify(x));
function grab(src, name) {
  const m = new RegExp('const\\s+' + name + '\\s*=').exec(src); if (!m) throw new Error('not found: ' + name);
  return src.slice(m.index, src.indexOf('\n', m.index));
}
const NOW0 = 1800000000000, DAY = 864e5, H9 = 9 * 36e5;
let SRS, WM, oldDue;
try {
  const c = vm.createContext({ Date: { now: () => NOW0 } });   // srsDue reads the clock; fix it
  vm.runInContext(read('148-scheduler.js') + '\n' + read('146-word-model.js') + '\n' + grab(read('160-learning-tools.js'), 'srsDue') + '\nthis.X = { SRS, WM, srsDue };', c);
  SRS = c.X.SRS; WM = c.X.WM; oldDue = c.X.srsDue;
} catch (e) { console.error('CANNOT LOAD the scheduler: ' + e.message); process.exit(2); }

let pass = 0, fail = 0;
function t(name, fn) { try { fn(); pass++; console.log('ok    ' + name); } catch (e) { fail++; console.log('FAIL  ' + name + '\n        ' + String(e.message).split('\n').slice(0, 6).join('\n        ')); } }
const old = (w, o) => Object.assign({ ts: NOW0 - 90 * DAY, w, lv: 'B2', ex: 'Sentence with ' + w + '.', bid: '7', bt: 'Emma' }, o || {});
const at = d => NOW0 + d * DAY + H9;                       // day d, 9 o'clock

/* Run one word through `days` days: reviews it whenever it is due. pick(day, entry, n) -> { g, kind } or null to skip. */
function sim(e, days, pick) {
  const log = []; let n = 0;
  for (let d = 0; d <= days; d++) {
    const now = at(d); if (!SRS.isDue(e, now)) continue;
    const p = pick ? pick(d, e, n) : { g: 2, kind: 'rcl' }; if (!p) continue;
    e = SRS.review(e, p.g, now, { kind: p.kind || 'rcl' }); n++;
    log.push({ day: d, g: p.g, iv: e.iv, due: e.due, st: e.st, rd: e.rdays.length });
  }
  return { e, log };
}
function seeded(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let x = Math.imul(seed ^ seed >>> 15, 1 | seed); x = x + Math.imul(x ^ x >>> 7, 61 | x) ^ x; return ((x ^ x >>> 14) >>> 0) / 4294967296; }; }
const deepFreeze = o => { Object.values(o).forEach(v => { if (v && typeof v === 'object') deepFreeze(v); }); return Object.freeze(o); };

/* ---- grades and intervals ---- */
t('a new word: Again, Hard, Good, Easy give 10 minutes, 1, 2 and 4 days', () => {
  const r = g => SRS.review(old('ample'), g, at(0));
  assert.strictEqual(r(0).due, at(0) + 10 * 6e4); assert.strictEqual(r(0).iv, 0);
  assert.deepStrictEqual([1, 2, 3].map(g => r(g).iv), [1, 2, 4]); assert.strictEqual(r(2).due, at(0) + 2 * DAY);
  assert.strictEqual(SRS.review(old('ample'), 2, at(0)).reps, 1);
});
t('same state, on time: Hard < Good < Easy, and Easy raises ease, Hard lowers it', () => {
  const e = SRS.fromOld(old('ample', { ease: 2.5, iv: 10, reps: 3, due: at(0), acq: 1 }));
  const [h, g, z] = [1, 2, 3].map(x => SRS.review(e, x, at(0)));
  assert.ok(h.iv < g.iv && g.iv < z.iv, [h.iv, g.iv, z.iv].join(' '));
  assert.ok(h.ease < e.ease && g.ease === e.ease && z.ease > e.ease);
  [h, g, z].forEach(x => assert.strictEqual(x.due, at(0) + x.iv * DAY));
});
t('late and early: a late right answer earns a longer interval, an early one a shorter one', () => {
  const e = SRS.fromOld(old('ample', { ease: 2.5, iv: 10, reps: 3, due: at(0) }));   // last review: day -10
  const on = SRS.review(e, 2, at(0)).iv, late = SRS.review(e, 2, at(10)).iv, early = SRS.review(e, 2, at(-6)).iv;
  assert.ok(early < on && on < late, [early, on, late].join(' '));
  assert.ok(late <= Math.round(10 * 1.5 * 2.5 * 1.08), 'lateness is capped');
});
t('Again: interval 0, reps 0, lap +1, ease -0.2 (never below 1.3), and the next Good starts small again', () => {
  const e = SRS.fromOld(old('ample', { ease: 1.4, iv: 30, reps: 6, due: at(0) }));
  const a = SRS.review(e, 0, at(0)); assert.deepStrictEqual([a.iv, a.reps, a.lap, a.ease], [0, 0, 1, 1.3]);
  const g = SRS.review(a, 2, at(0) + 6e5); assert.strictEqual(g.iv, 1); assert.strictEqual(g.reps, 1);
});
t('ease stays between 1.3 and 3.0 and the interval is never above 365 days', () => {
  let e = old('ample'); for (let i = 0; i < 40; i++) e = SRS.review(e, 3, at(i * 400));
  assert.ok(e.ease <= 3 && e.iv <= 365, e.ease + ' ' + e.iv);
  let f = old('ample'); for (let i = 0; i < 40; i++) f = SRS.review(f, 0, at(i));
  assert.strictEqual(f.ease, 1.3);
});
t('acq is set once, when the interval first reaches 14 days, and never moved', () => {
  const e = SRS.fromOld(old('ample', { ease: 2.5, iv: 8, reps: 3, due: at(0) }));
  const a = SRS.review(e, 2, at(0)); assert.ok(a.iv >= 14); assert.strictEqual(a.acq, at(0));
  assert.strictEqual(SRS.review(a, 2, at(40)).acq, at(0));
});

/* ---- views never count, four levels ---- */
t('a view, an unknown kind or a bad grade changes nothing (the same object comes back)', () => {
  const e = old('ample', { ease: 2.5, iv: 5, reps: 2, due: at(0) });
  assert.strictEqual(SRS.review(e, 3, at(0), { kind: 'view' }), e); assert.strictEqual(SRS.review(e, 3, at(0), { kind: 'peek' }), e);
  assert.strictEqual(SRS.review(e, 7, at(0)), e); assert.strictEqual(SRS.review(e, undefined, at(0)), e); assert.strictEqual(SRS.review(e, 2, NaN), e);
  assert.strictEqual(SRS.review(null, 2, at(0)), null);
});
t('four levels: a right answer raises only its own counter; Again raises none; top() is the highest level reached', () => {
  let e = old('ample'); assert.strictEqual(SRS.top(e), '');
  e = SRS.review(e, 2, at(0), { kind: 'rec' }); assert.deepStrictEqual(plain(e.cnt), { rec: 1, und: 0, rcl: 0, use: 0 }); assert.strictEqual(SRS.top(e), 'rec');
  e = SRS.review(e, 1, at(1), { kind: 'und' }); e = SRS.review(e, 3, at(2), { kind: 'use' });
  assert.deepStrictEqual(plain(SRS.levels(e)), { rec: 1, und: 1, rcl: 0, use: 1 }); assert.strictEqual(SRS.top(e), 'use');
  const a = SRS.review(e, 0, at(3), { kind: 'rcl' }); assert.deepStrictEqual(plain(a.cnt), plain(e.cnt));
});

/* ---- mastered ---- */
t('mastered needs recall on 3 separate days AND an interval of 21+ days (all Good recall: mastered at the review that satisfies both)', () => {
  const r = sim(old('ample'), 60, null);
  const i = r.log.findIndex(x => x.st === 'mastered'); assert.ok(i > 0, 'never mastered');
  assert.ok(r.log[i].rd >= 3 && r.log[i].iv >= 21); assert.ok(r.log.slice(0, i).every(x => x.rd < 3 || x.iv < 21));
  assert.ok(r.log.slice(i).every(x => x.st === 'mastered'), 'stays mastered while it keeps going right');
});
t('recognise and understand answers never make a word mastered, however long the interval', () => {
  ['rec', 'und'].forEach(kind => {
    const r = sim(old('ample'), 200, () => ({ g: 3, kind })); assert.ok(r.e.iv >= 21); assert.notStrictEqual(r.e.st, 'mastered'); assert.deepStrictEqual(plain(r.e.rdays), []);
  });
});
t('a view-only word is never mastered, never scheduled and never counted', () => {
  let e = old('ample', { ease: 2.5, iv: 40, reps: 8, due: at(0), acq: 5 }); const before = JSON.stringify(e);
  for (let i = 0; i < 10; i++) e = SRS.review(e, 3, at(i), { kind: 'view' });
  assert.strictEqual(JSON.stringify(e), before); assert.strictEqual(SRS.mastered(SRS.fromOld(e)), false);
});
t('many recall answers on ONE day count as one day', () => {
  let e = SRS.fromOld(old('ample', { ease: 2.5, iv: 25, reps: 4, due: at(0), acq: 5 }));
  for (let i = 0; i < 5; i++) e = SRS.review(e, 2, at(0) + i * 6e4);
  assert.strictEqual(e.rdays.length, 1); assert.ok(e.iv >= 21); assert.notStrictEqual(e.st, 'mastered'); assert.strictEqual(e.cnt.rcl, 5);
  e = SRS.review(e, 2, at(1)); assert.notStrictEqual(e.st, 'mastered'); e = SRS.review(e, 2, at(2));
  assert.strictEqual(e.rdays.length, 3); assert.strictEqual(e.st, 'mastered');
});
t('recall on 3 days with a short interval is not mastered; days are counted in your time zone', () => {
  let e = old('ample'); [0, 1, 2].forEach(d => { e = SRS.review(e, 2, at(d)); });
  assert.strictEqual(e.rdays.length, 3); assert.ok(e.iv < 21); assert.notStrictEqual(e.st, 'mastered');
  const lateNight = Date.UTC(2026, 0, 1, 20, 0);   // 20:00 UTC = 02:00 next day in Bangladesh (+360)
  assert.strictEqual(SRS.dayOf(lateNight, 360), SRS.dayOf(lateNight, 0) + 1);
  assert.deepStrictEqual(plain(SRS.review(old('a'), 2, lateNight, { tz: 360 }).rdays), [SRS.dayOf(lateNight, 0) + 1]);
});
t('typed recall (use) counts as recall; Again after mastery takes mastered away; the days are kept', () => {
  let e = old('ample'); [0, 1, 2].forEach(d => { e = SRS.review(e, 2, at(d), { kind: 'use' }); });
  assert.strictEqual(e.rdays.length, 3);
  const m = SRS.fromOld(old('ample', { ease: 2.5, iv: 30, reps: 5, due: at(0), rdays: [1, 2, 3] })); assert.strictEqual(SRS.mastered(m), true);
  const a = SRS.review(m, 0, at(0)); assert.strictEqual(a.st, 'learning'); assert.deepStrictEqual(plain(a.rdays), [1, 2, 3]);
});
t('only the last 10 recall days are kept, no repeats', () => {
  let e = old('ample'); for (let d = 0; d < 15; d++) e = SRS.review(e, 2, at(d)); assert.strictEqual(e.rdays.length, 10);
  assert.strictEqual(new Set(e.rdays).size, 10); assert.deepStrictEqual(plain(e.rdays), plain(e.rdays.slice().sort((a, b) => a - b)));
});

/* ---- old words ---- */
t('fromOld: due and acq are never changed; a word with no due stays without one; nothing is removed', () => {
  const table = [old('a'), old('b', { ease: 2.5, iv: 4, reps: 2, due: 1700000000000 }), old('c', { ease: 1.3, iv: 0, reps: 0, due: 1700000000000 + 600000 }),
    old('d', { ease: 2.8, iv: 45, reps: 9, due: 1750000000000, acq: 1740000000000, note: 'n', ctx: [{ s: 'x' }], extra: { deep: 1 } }), old('e', { ease: 9, iv: 3.7, reps: 2.2, due: 5 })];
  table.forEach(e => {
    const m = SRS.fromOld(e);
    assert.strictEqual(m.due, e.due, e.w + ' due'); assert.strictEqual('due' in m, 'due' in e); assert.strictEqual(m.acq, e.acq);
    Object.keys(e).forEach(k => { if (!['ease', 'iv', 'reps'].includes(k)) assert.deepStrictEqual(m[k], e[k], 'lost ' + k); });
    assert.strictEqual(m.sch, 1); assert.strictEqual(m.lap, 0); assert.deepStrictEqual(plain(m.cnt), { rec: 0, und: 0, rcl: 0, use: 0 }); assert.deepStrictEqual(plain(m.rdays), []);
  });
  assert.strictEqual(SRS.fromOld(table[0]).ease, undefined); assert.strictEqual(SRS.fromOld(table[0]).st, 'new'); assert.strictEqual('lr' in SRS.fromOld(table[0]), false);
  assert.strictEqual(SRS.fromOld(table[4]).ease, 3); assert.strictEqual(SRS.fromOld(table[4]).iv, 3); assert.strictEqual(SRS.fromOld(table[4]).reps, 2);
});
t('fromOld: last review is worked out from due and iv, running it twice changes nothing, the input is not changed', () => {
  const e = deepFreeze(old('b', { ease: 2.5, iv: 4, reps: 2, due: 1700000000000 })), m = SRS.fromOld(e);
  assert.strictEqual(m.lr, 1700000000000 - 4 * DAY); assert.strictEqual(SRS.fromOld(m), m);
  assert.strictEqual(SRS.fromOld(old('c', { ease: 2, iv: 0, due: 1700000000000 })).lr, 1700000000000 - 600000);
  assert.strictEqual(SRS.lastReview(m), m.lr); assert.strictEqual(SRS.lastReview({}), 0);
});
t('fromOld: stage of old words (no recall evidence): long interval is familiar, never mastered; short is learning; unreviewed is new', () => {
  const st = o => SRS.fromOld(old('w', o)).st;
  assert.strictEqual(st({ ease: 2.5, iv: 60, reps: 9, due: 5 }), 'familiar'); assert.strictEqual(st({ ease: 2.5, iv: 14, reps: 3, due: 5 }), 'familiar');
  assert.strictEqual(st({ ease: 2.5, iv: 5, reps: 2, due: 5 }), 'learning'); assert.strictEqual(st({}), 'new');
});
t('reviewing an old-shape word gives the same result as reviewing it after fromOld, and the old fields keep their meaning', () => {
  const e = old('ample', { ease: 2.5, iv: 6, reps: 2, due: at(0), acq: 7 });
  assert.deepStrictEqual(plain(SRS.review(e, 2, at(0))), plain(SRS.review(SRS.fromOld(e), 2, at(0))));
  const r = SRS.review(e, 2, at(0)); ['ts', 'w', 'lv', 'ex', 'bid', 'bt', 'acq'].forEach(k => assert.deepStrictEqual(r[k], e[k], k));
  assert.ok(r.iv > 6 && r.reps === 3 && r.due === at(0) + r.iv * DAY);
});
t('old Review buttons map: Again->0, Good->2, Easy->3', () => { assert.deepStrictEqual([0, 1, 2].map(SRS.fromOldGrade), [0, 2, 3]); });
t('isDue is the same rule as the old srsDue (no due time, or due now or past)', () => {
  [{}, { due: 0 }, { due: NOW0 - 1 }, { due: NOW0 }, { due: NOW0 + 1 }, { due: undefined }].forEach(e => assert.strictEqual(SRS.isDue(e, NOW0), oldDue(e), JSON.stringify(e)));
});
t('the result still fits the saved-word model: WM.migrate keeps every field and it stays a valid v2 entry', () => {
  const r = SRS.review(old('ample', { ease: 2.5, iv: 6, reps: 2, due: at(0) }), 2, at(0)), m = WM.migrate(r);
  Object.keys(r).forEach(k => { if (k !== 'st') assert.deepStrictEqual(plain(m[k]), plain(r[k]), k); });
  assert.strictEqual(m.v, 2); assert.deepStrictEqual(plain(WM.migrate(m)), plain(m));
});

/* ---- pure ---- */
t('pure: the input is never changed, the same input gives the same answer, no clock and no random numbers', () => {
  const e = deepFreeze(old('ample', { ease: 2.5, iv: 6, reps: 2, due: at(0), cnt: { rec: 1, und: 0, rcl: 0, use: 0 }, rdays: [1] }));
  const a = SRS.review(e, 2, at(3)), b = SRS.review(e, 2, at(3)); assert.notStrictEqual(a, e); assert.deepStrictEqual(plain(a), plain(b));
  const src = read('148-scheduler.js'); ['Date.now', 'new Date', 'Math.random', 'localStorage', 'store.', 'document', 'fetch(', 'WM.'].forEach(w => assert.ok(src.indexOf(w) < 0, 'uses ' + w));
  const b2 = fs.readFileSync(path.join(root, 'build.py'), 'utf8'); assert.ok(b2.indexOf('src/js/148-scheduler.js') > b2.indexOf('src/js/147-word-store.js'), 'not in build.py after 147');
});

/* ---- simulated 60-day schedules ---- */
t('60 days, all Good: reviews are on or after the due day, intervals only grow, and the workload is small', () => {
  const r = sim(old('ample'), 60, null);
  assert.strictEqual(r.log[0].day, 0); for (let i = 1; i < r.log.length; i++) { assert.ok(r.log[i].iv > r.log[i - 1].iv, 'interval fell at review ' + i); assert.ok(at(r.log[i].day) >= r.log[i - 1].due); }
  assert.ok(r.log.length >= 4 && r.log.length <= 7, 'reviews: ' + r.log.length); console.log('      all Good: review days ' + r.log.map(x => x.day).join(', ') + '; intervals ' + r.log.map(x => x.iv).join(', '));
});
t('60 days: Easy reaches longer intervals than Good, Hard shorter; Again in the middle sends the word back', () => {
  const run = g => sim(old('ample'), 60, () => ({ g, kind: 'rcl' })), h = run(1), g = run(2), z = run(3);
  for (let i = 0; i < 3; i++) assert.ok(h.log[i].iv < g.log[i].iv && g.log[i].iv < z.log[i].iv, 'review ' + (i + 1) + ': ' + [h.log[i].iv, g.log[i].iv, z.log[i].iv].join(' '));   // same review number, not same day
  assert.ok(h.log.length > g.log.length && g.log.length > z.log.length, 'reviews in 60 days: ' + [h.log.length, g.log.length, z.log.length].join(' '));
  const x = sim(old('ample'), 60, (d, e, n) => ({ g: n === 3 ? 0 : 2, kind: 'rcl' })); const i = x.log.findIndex(y => y.g === 0);
  assert.strictEqual(x.log[i].iv, 0); assert.ok(x.log[i + 1].iv <= 2, 'comes back small'); assert.strictEqual(x.e.lap, 1);
  console.log('      reviews in 60 days  Hard ' + h.log.length + ' (last iv ' + h.e.iv + ')  Good ' + g.log.length + ' (' + g.e.iv + ')  Easy ' + z.log.length + ' (' + z.e.iv + ')');
});
t('60 days, 30 words saved the same day with the same answers: they do not all get the same intervals or due days', () => {
  const ws = Array.from({ length: 30 }, (_, i) => sim(old('word' + i), 60, null).e);
  const ivs = new Set(ws.map(e => e.iv)), dues = new Set(ws.map(e => e.due));
  const third = new Set(Array.from({ length: 30 }, (_, i) => sim(old('word' + i), 20, null).log.map(x => x.iv).join('-')));
  console.log('      30 words: ' + ivs.size + ' different intervals, ' + dues.size + ' different due times, ' + third.size + ' different interval paths after 20 days');
  assert.ok(ivs.size >= 5 && dues.size >= 5 && third.size >= 3);
});
t('60 days, 40 words answered by a noisy learner (seeded): every step keeps the rules', () => {
  const rnd = seeded(12345); let reviews = 0, lapses = 0, mastered = 0;
  for (let i = 0; i < 40; i++) {
    let prev = null;
    const r = sim(old('w' + i), 60, (d, e, n) => {
      const x = rnd(), g = x < 0.1 ? 0 : x < 0.3 ? 1 : x < 0.8 ? 2 : 3, kind = ['rec', 'und', 'rcl', 'use'][Math.floor(rnd() * 4)];
      return { g, kind };
    });
    r.log.forEach((s, k) => {
      reviews++; if (s.g === 0) { lapses++; assert.strictEqual(s.iv, 0); } else { assert.ok(Number.isInteger(s.iv) && s.iv >= 1 && s.iv <= 365); assert.strictEqual(s.due, at(s.day) + s.iv * DAY); }
      if (s.st === 'mastered') assert.ok(s.rd >= 3 && s.iv >= 21);
    });
    const e = r.e; assert.ok(e.ease >= 1.3 && e.ease <= 3); assert.ok(Number.isInteger(e.reps) && e.reps >= 0);
    assert.strictEqual(e.cnt.rec + e.cnt.und + e.cnt.rcl + e.cnt.use, r.log.filter(s => s.g > 0).length);
    assert.strictEqual(e.lap, r.log.filter(s => s.g === 0).length); if (SRS.mastered(e)) mastered++;
  }
  assert.ok(reviews / 40 > 3 && reviews / 40 < 20, 'reviews per word ' + reviews / 40); assert.ok(lapses > 0);
  console.log('      noisy learner: ' + (reviews / 40).toFixed(1) + ' reviews per word in 60 days, ' + lapses + ' lapses, ' + mastered + ' of 40 mastered');
});

console.log('\n' + (fail ? fail + ' FAILED, ' + pass + ' passed' : 'all ' + pass + ' passed'));
process.exit(fail ? 1 : 0);
