#!/usr/bin/env node
/* Automatic checks for the goal logic (169l-goal.js, the pure part GLC). No browser.
     node tools/goal_check.js
   Loads the REAL source between the GLC-START / GLC-END markers. Exit code 1 if a check fails, 2 if the file cannot be loaded. */
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const src = fs.readFileSync(path.join(__dirname, '..', 'src/js/169l-goal.js'), 'utf8');
let G;
try {
  const a = src.indexOf('/* GLC-START */'), b = src.indexOf('/* GLC-END */');
  if (a < 0 || b < 0) throw new Error('markers not found');
  const ctx = vm.createContext({});
  vm.runInContext(src.slice(a, b) + '\nthis.G = GLC;', ctx); G = ctx.G;
} catch (e) { console.error('goal_check: cannot load the code: ' + e.message); process.exit(2); }
let pass = 0, fail = 0;
function t(name, fn) { try { fn(); pass++; console.log('ok    ' + name); } catch (e) { fail++; console.log('FAIL  ' + name + '\n        ' + String(e && e.message).split('\n').slice(0, 5).join('\n        ')); } }
const J = x => JSON.parse(JSON.stringify(x));   // objects made inside the vm context have another prototype
const day = (y, m, d, h) => new Date(y, m - 1, d, h || 12);
const now = day(2026, 11, 11);

t('parse accepts real days and refuses the rest', () => {
  assert.deepStrictEqual(J(G.parse('2026-12-20')), { y: 2026, m: 12, d: 20 });
  ['', null, undefined, '2026-02-30', '2026-13-01', '20-12-2026', '2026-1-1'].forEach(s => assert.strictEqual(G.parse(s), null, String(s)));
  assert.ok(G.parse('2028-02-29')); assert.strictEqual(G.parse('2027-02-29'), null);
});
t('the mock-up: 11 Nov to 20 Dec is 39 days, not 42', () => assert.strictEqual(G.days('2026-11-11', '2026-12-20'), 39));
t('days is not moved by a daylight-saving change', () => assert.strictEqual(G.days('2026-03-07', '2026-03-09'), 2));
t('mode: no goal, or a broken one, is unset', () => {
  [undefined, null, {}, { v: 0, ask: 'done' }, { v: 1 }, { v: 1, learn: 'yes' }].forEach(g => assert.strictEqual(G.mode(g), 'unset'));
});
t('the three choices map to the two settings', () => {
  const s = G.fromChoice('stories', now, null), l = G.fromChoice('learn', now, null), i = G.fromChoice('ielts', now, null);
  assert.deepStrictEqual([s.learn, G.mode(s)], [false, 'stories']);
  assert.deepStrictEqual([l.learn, G.mode(l)], [true, 'learn']);
  assert.deepStrictEqual([i.learn, G.mode(i), i.exam.kind, i.exam.date, i.exam.from], [true, 'exam', 'ielts', '', '2026-11-11']);
  [s, l, i].forEach(g => assert.strictEqual(g.ask, 'done'));
});
t('switching IELTS -> Learn -> IELTS keeps the date and target', () => {
  let g = G.fromChoice('ielts', now, null);
  g.exam.date = '2026-12-20'; g.exam.target = 7;
  g = G.fromChoice('learn', now, g);
  assert.strictEqual(G.mode(g), 'learn'); assert.strictEqual(g.learn, true);
  assert.strictEqual(G.examState(g, now).k, 'none');
  g = G.fromChoice('ielts', now, g);
  assert.strictEqual(G.mode(g), 'exam'); assert.strictEqual(g.exam.date, '2026-12-20'); assert.strictEqual(g.exam.target, 7);
});
t('learning off turns the exam off, and learning on brings it back', () => {
  let g = G.fromChoice('ielts', now, null); g.exam.date = '2026-12-20';
  g = G.withLearn(g, false, now);
  assert.deepStrictEqual([g.learn, G.mode(g), g.exam.on, g.exam.date], [false, 'stories', false, '2026-12-20']);
  g = G.withLearn(g, true, now);
  assert.strictEqual(G.mode(g), 'learn');
});
t('withExam(on) also turns learning on', () => {
  const g = G.withExam(G.fromChoice('stories', now, null), true, now);
  assert.deepStrictEqual([g.learn, G.mode(g)], [true, 'exam']);
  assert.strictEqual(G.mode(G.withExam(g, false, now)), 'learn');
});
t('withLearn on a person who has not chosen yet', () => {
  assert.strictEqual(G.mode(G.withLearn(undefined, true, now)), 'learn');
  assert.strictEqual(G.mode(G.withLearn(undefined, false, now)), 'stories');
});
t('examState: no date, future, today, past', () => {
  const g = G.fromChoice('ielts', now, null);
  assert.strictEqual(G.examState(g, now).k, 'unset');
  g.exam.date = '2026-12-20'; assert.deepStrictEqual(J(G.examState(g, now)), { k: 'future', days: 39 });
  g.exam.date = '2026-11-11'; assert.strictEqual(G.examState(g, now).k, 'today');
  assert.strictEqual(G.examState(g, day(2026, 11, 11, 0)).k, 'today'); assert.strictEqual(G.examState(g, day(2026, 11, 11, 23)).k, 'today');
  g.exam.date = '2026-11-08'; assert.deepStrictEqual(J(G.examState(g, now)), { k: 'past', days: 3 });
  assert.strictEqual(G.examState(G.fromChoice('learn', now, null), now).k, 'none');
  assert.strictEqual(G.examState(undefined, now).k, 'none');
});
t('examState ignores a broken date', () => { const g = G.fromChoice('ielts', now, null); g.exam.date = 'soon'; assert.strictEqual(G.examState(g, now).k, 'unset'); });
t('elapsed runs from 0 to 1 and never leaves that range', () => {
  const g = G.fromChoice('ielts', day(2026, 11, 1), null); g.exam.date = '2026-12-01';   // 30 days
  assert.strictEqual(G.elapsed(g, day(2026, 11, 1)), 0);
  assert.strictEqual(G.elapsed(g, day(2026, 11, 16)), 0.5);
  assert.strictEqual(G.elapsed(g, day(2026, 12, 1)), 1);
  assert.strictEqual(G.elapsed(g, day(2027, 1, 1)), 1);
  assert.strictEqual(G.elapsed(g, day(2026, 10, 1)), 0);
  g.exam.from = '2026-12-01'; assert.strictEqual(G.elapsed(g, day(2026, 11, 20)), 0);   // exam on the day it was chosen: no division by zero
  assert.strictEqual(G.elapsed(G.fromChoice('learn', now, null), now), 0);
});
t('tab label: IELTS while an exam is on, else Learn', () => {
  assert.strictEqual(G.tabLabel(G.fromChoice('ielts', now, null)), 'IELTS');
  assert.strictEqual(G.tabLabel(G.fromChoice('learn', now, null)), 'Learn');
  assert.strictEqual(G.tabLabel(undefined), 'Learn');
});
t('target is 4 to 9 in halves, else none', () => {
  assert.strictEqual(G.normTarget('7.0'), 7); assert.strictEqual(G.normTarget(6.74), 6.5); assert.strictEqual(G.normTarget(6.76), 7);
  ['', null, undefined, 3, 9.5, 'x'].forEach(v => assert.strictEqual(G.normTarget(v), null, String(v)));
});
t('the ask card shows only to someone who has not chosen and has not dismissed it', () => {
  assert.strictEqual(G.askOn(undefined), true); assert.strictEqual(G.askOn({}), true);
  assert.strictEqual(G.askOn({ v: 0, ask: 'done' }), false);
  assert.strictEqual(G.askOn(G.fromChoice('stories', now, null)), false);
});
t('the Learn-tab offer: Enjoy stories only, from the third saved word, once', () => {
  const s = G.fromChoice('stories', now, null);
  assert.strictEqual(G.offerOn(s, 2), false); assert.strictEqual(G.offerOn(s, 3), true);
  assert.strictEqual(G.offerOn(Object.assign({}, s, { offered: true }), 9), false);
  assert.strictEqual(G.offerOn(G.fromChoice('learn', now, null), 9), false);
  assert.strictEqual(G.offerOn(undefined, 9), false);
});
t('the offer flag survives a change of goal', () => {
  const g = G.fromChoice('learn', now, Object.assign(G.fromChoice('stories', now, null), { offered: true }));
  assert.strictEqual(g.offered, true);
});
console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
