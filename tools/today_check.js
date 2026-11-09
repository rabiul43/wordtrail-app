#!/usr/bin/env node
/* Automatic checks for the Today page data side (169c): the plan from due words, new words, minutes and questions, the streak, the week of dots,
   the daily goal. No browser. The screen is tested by hand.
     node tools/today_check.js
   Loads the REAL 148b-learn-log.js and 169c-today.js from src/js/. Exit code 1 if a check fails, 2 if a file cannot be loaded. */
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const read = f => fs.readFileSync(path.join(__dirname, '..', 'src/js', f), 'utf8');
const disk = {}, tiles = [];
const store = { get(k, d) { try { const v = disk[k]; return v ? JSON.parse(v) : d; } catch (e) { return d; } }, set(k, v) { disk[k] = JSON.stringify(v); } };
const dayKey = d => { d = d || new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const fake = (tag, a, kids) => { const e = { tag, a: a || {}, kids: [], hidden: false, style: { setProperty(k, v) { e.vars = Object.assign(e.vars || {}, { [k]: v }); } }, append(...x) { e.kids.push(...x); }, set textContent(v) { e.kids = []; e._t = v; }, get textContent() { return e.kids.map(k => typeof k === 'string' ? k : k.textContent).join(' ') + (e._t || ''); } }; (kids || []).forEach(k => k !== '' && e.kids.push(k)); return e; };
const fh = (tag, a, ...kids) => fake(tag, a, kids), SEC = fake('section', {}, []); SEC.hidden = true;
let T;
try {
  const code = ['148b-learn-log.js', '169c-today.js', '169d-today-card.js'].map(read).join('\n') + '\nthis.T = { LL, TD, TDH, tiles, P };';
  const ctx = vm.createContext({ store, tiles, dayKey, document: { addEventListener() {} }, window: { addEventListener() {} }, setTimeout, clearTimeout,
    h: fh, $: id => id === '#td-home' ? SEC : null, P: {}, S: {}, ST: { goal: 15, days: {} }, stDirty: false, stSave() {}, homeGoal() {}, srsDue: () => true,
    WS: { all: () => [] }, RL: {}, histSoon() {}, toast() {}, LearnHub: { register: t => tiles.push(t), refresh() {} } });
  vm.runInContext(code, ctx); T = ctx.T;
} catch (e) { console.error('today_check: cannot load the code: ' + e.message); process.exit(2); }
const { LL, TD } = T;
let pass = 0, fail = 0;
function t(name, fn) { try { fn(); pass++; console.log('ok    ' + name); } catch (e) { fail++; console.log('FAIL  ' + name + '\n        ' + String(e && e.message).split('\n').slice(0, 5).join('\n        ')); } }
const now = new Date(2026, 10, 9, 10, 43);   // Monday 9 November 2026
const book = { id: 345, title: 'Dracula' };
const ids = p => p.tasks.map(x => x.id).join(',');
const get = (p, id) => p.tasks.find(x => x.id === id);

t('the mock-up day: 9 of 15 minutes, review 12 done, 5 new words done, read 4 of 10', () => {
  const p = TD.plan({ goal: 15, min: 9, log: { r: 12, c: 11, n: 5 }, due: 0, book }, now);
  assert.strictEqual(ids(p), 'review,new,read'); assert.strictEqual(p.left, 6); assert.strictEqual(p.met, false);
  assert.deepStrictEqual([get(p, 'review').target, get(p, 'review').done, get(p, 'review').correct], [12, true, 11]);
  assert.deepStrictEqual([get(p, 'new').target, get(p, 'new').done, get(p, 'new').book], [5, true, 'Dracula']);
  assert.deepStrictEqual([get(p, 'read').target, get(p, 'read').have, get(p, 'read').done], [10, 9, false]);
});
t('review is left out when nothing is due and nothing was reviewed', () => { assert.ok(!get(TD.plan({ goal: 15, min: 0, log: {}, due: 0, book }, now), 'review')); });
t('review: due words at the start of the day, capped by the goal (15 -> 12)', () => {
  const r = get(TD.plan({ goal: 15, min: 0, log: {}, due: 40, book }, now), 'review'); assert.strictEqual(r.target, 12); assert.strictEqual(r.done, false);
});
t('review target stays steady while you review: 10 due, 4 done -> 10 due left means target 10 (cap 12)', () => {
  const a = get(TD.plan({ goal: 15, min: 0, log: {}, due: 10, book }, now), 'review'), b = get(TD.plan({ goal: 15, min: 0, log: { r: 4 }, due: 6, book }, now), 'review');
  assert.strictEqual(a.target, 10); assert.strictEqual(b.target, 10); assert.strictEqual(b.have, 4);
});
t('review is done, not gone, when the last due word is answered', () => {
  const r = get(TD.plan({ goal: 15, min: 0, log: { r: 7, c: 6 }, due: 0, book }, now), 'review'); assert.ok(r.done); assert.strictEqual(r.target, 7);
});
t('goal sizes: 5 / 15 / 30 / custom 45', () => {
  const g = (goal, o) => TD.plan(Object.assign({ goal, min: 0, log: {}, due: 99, book }, o || {}), now);
  assert.deepStrictEqual([5, 15, 30, 45].map(x => [get(g(x), 'review').target, get(g(x), 'new').target, get(g(x), 'read').target]), [[5, 2, 5], [12, 5, 10], [24, 8, 20], [30, 8, 30]]);
});
t('new words: needs a current book, or a word saved today', () => {
  assert.ok(!get(TD.plan({ goal: 15, min: 0, log: {}, due: 0, book: null }, now), 'new'));
  const n = get(TD.plan({ goal: 15, min: 0, log: { n: 2 }, due: 0, book: null }, now), 'new'); assert.ok(n && n.have === 2 && !n.done);
});
t('questions only when a feature supplies them', () => {
  assert.ok(!get(TD.plan({ goal: 15, min: 0, log: {}, due: 0, book }, now), 'questions'));
  const q = get(TD.plan({ goal: 15, min: 0, log: {}, due: 0, book, q: 8 }, now), 'questions'); assert.strictEqual(q.target, 5);
  const d = get(TD.plan({ goal: 15, min: 0, log: { q: 5 }, due: 0, book, q: 8 }, now), 'questions'); assert.ok(d.done);
});
t('read is always there and done at its target; goal met flag', () => {
  const p = TD.plan({ goal: 15, min: 20, log: {}, due: 0, book }, now); assert.ok(get(p, 'read').done); assert.ok(p.met); assert.strictEqual(p.left, 0); assert.strictEqual(get(p, 'read').have, 10);
});
t('bad input does not break the plan', () => { const p = TD.plan({ goal: 'x', min: -3, log: { r: 'a', n: NaN }, due: null }, now); assert.strictEqual(p.goal, 15); assert.strictEqual(ids(p), 'read'); });
t('streak: any activity counts, counted from today', () => {
  const on = new Set(['2026-11-09', '2026-11-08', '2026-11-07', '2026-11-05']); assert.strictEqual(TD.streak(k => on.has(k), now), 3);
});
t('streak: an empty today does not break it (counted from yesterday)', () => {
  const on = new Set(['2026-11-08', '2026-11-07', '2026-11-06', '2026-11-05', '2026-11-04']); assert.strictEqual(TD.streak(k => on.has(k), now), 5);
});
t('streak: 0 when yesterday and today are empty', () => { assert.strictEqual(TD.streak(k => k === '2026-11-01', now), 0); });
t('week: Monday to Sunday, today and future marked', () => {
  const on = new Set(['2026-11-09']), w = TD.week(k => on.has(k), now);
  assert.strictEqual(w.map(d => d.letter).join(''), 'MTWTFSS'); assert.strictEqual(w[0].k, '2026-11-09'); assert.strictEqual(w[6].k, '2026-11-15');
  assert.deepStrictEqual([w[0].on, w[0].today, w[0].future, w[1].future], [true, true, false, true]);
});
t('week on a Sunday starts the Monday before', () => { const w = TD.week(() => false, new Date(2026, 10, 15, 9)); assert.deepStrictEqual([w[0].k, w[6].k, w[6].today], ['2026-11-09', '2026-11-15', true]); });
t('week across a month end', () => { const w = TD.week(() => false, new Date(2026, 11, 2, 9)); assert.deepStrictEqual([w[0].k, w[6].k], ['2026-11-30', '2026-12-06']); });
t('goal: setGoal rounds, clamps to 1-180 and ignores nonsense', () => {
  assert.strictEqual(TD.setGoal(30), 30); assert.strictEqual(TD.setGoal('45'), 45); assert.strictEqual(TD.setGoal(999), 180); assert.strictEqual(TD.setGoal(7.9), 7); assert.strictEqual(TD.setGoal(1), 1);
});
t('goal: nonsense leaves the goal as it was', () => {
  const ctxGoal = () => T.TD.setGoal('abc'); const before = TD.setGoal(15); assert.strictEqual(ctxGoal(), before);
});
t('the learn log feeds the plan (real LL): reviews, new words and minutes today', () => {
  LL.review(true); LL.review(false); LL.newWord(); LL.bump({ m: 3 });
  const p = TD.plan({ goal: 15, min: 3, log: LL.today(), due: 4, book }, now);
  assert.deepStrictEqual([get(p, 'review').have, get(p, 'review').target, get(p, 'review').correct, get(p, 'new').have, get(p, 'read').have], [2, 6, 1, 1, 3]);
});
t('the Today tile is registered first in the hub', () => { const x = T.tiles.find(y => y.id === 'today'); assert.ok(x && x.order === 1 && typeof x.open === 'function' && x.title === 'Today'); assert.ok(typeof x.subtitle() === 'string'); });
t('setQuestions accepts only { count, open }', () => { TD.setQuestions({ count: () => 3 }); TD.setQuestions({ count: () => 3, open() {} }); TD.setQuestions(null); });
const { TDH, P } = T;
t('Today card: on by default, off by setting, off in Calm mode', () => {
  delete P.todayCard; delete P.calm; assert.strictEqual(TDH.on(), true);
  P.todayCard = false; assert.strictEqual(TDH.on(), false); P.todayCard = true; P.calm = true; assert.strictEqual(TDH.on(), false); delete P.calm;
});
t('Today card: off leaves the Home slot hidden and empty (Home as before)', () => {
  P.todayCard = false; SEC.hidden = false; SEC.kids.push('x'); TDH.paint(); assert.strictEqual(SEC.hidden, true); assert.strictEqual(SEC.kids.length, 0);
});
t('Today card: on draws one card that opens Today, with N of M done', () => {
  delete P.todayCard; TDH.paint(); assert.strictEqual(SEC.hidden, false); assert.strictEqual(SEC.kids.length, 1);
  const c = SEC.kids[0]; assert.strictEqual(typeof c.a.onclick, 'function'); assert.ok(/ of \d+ done/.test(c.textContent), c.textContent); assert.ok(/CONTINUE/.test(c.textContent));
});
t('Today card: turning it off again hides it', () => { P.todayCard = false; TDH.paint(); assert.strictEqual(SEC.hidden, true); assert.strictEqual(SEC.kids.length, 0); });
console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
