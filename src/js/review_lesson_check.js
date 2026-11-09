#!/usr/bin/env node
/* Automatic checks for the Review lesson data side (168): the blank in a sentence, the word bank, which words are asked, the grade sent to the
   scheduler (148) through the real word store (147), and a full 10-word session. No browser, no npm install. The screen is tested separately.
     node tools/review_lesson_check.js
   Loads the REAL files from src/js/. Exit code 1 if a check fails, 2 if a file cannot be loaded. */
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const read = f => fs.readFileSync(path.join(__dirname, '..', 'src/js', f), 'utf8');
const disk = {};
const store = { get(k, d) { try { const v = disk[k]; return v ? JSON.parse(v) : d; } catch (e) { return d; } }, set(k, v) { disk[k] = JSON.stringify(v); } };
let T;
try {
  const code = ['146-word-model.js', '147-word-store.js', '148-scheduler.js', '165-word-cards.js', '168-review-lesson.js'].map(read).join('\n') + '\nthis.T = { WM, WS, SRS, RL };';
  const ctx = vm.createContext({ store, h: () => ({}), vlist: () => {}, toast: () => {}, histSoon: () => {}, vocRender: () => {}, vocDefine: async () => '', $: () => null, prSpeech: false });
  vm.runInContext(code, ctx); T = ctx.T;
} catch (e) { console.error('review_lesson_check: cannot load the code: ' + e.message); process.exit(2); }
const { WS, SRS, RL } = T;
let pass = 0, fail = 0;
function t(name, fn) { try { fn(); pass++; console.log('ok    ' + name); } catch (e) { fail++; console.log('FAIL  ' + name + '\n        ' + String(e.message).split('\n').slice(0, 6).join('\n        ')); } }
const reset = list => { Object.keys(disk).forEach(k => delete disk[k]); if (list) disk['wt:words'] = JSON.stringify(list); };
const DAY = 86400000, now = Date.UTC(2026, 10, 9, 6);
const seq = () => { let n = 0; return () => ((n = (n * 9301 + 49297) % 233280) / 233280) || 0.123; };   // steady "random" numbers
const W = (w, ex, o) => Object.assign({ ts: 1, w, lv: 'B2', ex, bid: '345', bt: 'Dracula' }, o || {});
const POOL = () => [
  W('forlorn', 'She sat alone in the garden, looking forlorn and tired.'), W('furious', 'He was furious.'), W('ancient', 'An ancient house.'),
  W('hungry', 'The wolf was hungry.'), W('tremble', 'His hands began to tremble.')];

t('split: the word as a whole word, any case, keeps the spaces around it', () => {
  const s = RL.split('She sat alone in the garden, looking forlorn and tired.', 'forlorn');
  assert.deepStrictEqual([s.pre, s.hit, s.post], ['She sat alone in the garden, looking ', 'forlorn', ' and tired.']);
  assert.strictEqual(RL.split('Forlorn, she waited.', 'forlorn').hit, 'Forlorn');
  assert.strictEqual(RL.split('An example of ample room.', 'ample').pre, 'An example of ');
  assert.strictEqual(RL.split('Nothing here.', 'ample'), null); assert.strictEqual(RL.split('', 'a'), null); assert.strictEqual(RL.split('text', ''), null);
  assert.doesNotThrow(() => RL.split('try a.b( now', 'a.b('));   // a word with regex characters must not throw
});
t('question: bank of 4 with the word once, answer index right, no bank word inside the sentence', () => {
  const q = RL.question(POOL()[0], POOL(), seq());
  assert.strictEqual(q.bank.length, 4); assert.strictEqual(new Set(q.bank).size, 4);
  assert.strictEqual(q.bank[q.answer], 'forlorn'); assert.strictEqual(q.pre + '_' + q.post, 'She sat alone in the garden, looking _ and tired.');
  assert.strictEqual(q.bt, 'Dracula'); assert.strictEqual(q.ch, null);
});
t('question: a bank word that also appears in the sentence is left out', () => {
  const pool = POOL(); pool.push(W('garden', 'x'));
  for (let i = 0; i < 20; i++) assert.ok(!RL.question(pool[0], pool, seq()).bank.includes('garden'));
});
t('question: only 2 saved words gives a bank of 2; 1 saved word gives none', () => {
  assert.strictEqual(RL.question(POOL()[0], POOL().slice(0, 2), seq()).bank.length, 2);
  assert.strictEqual(RL.question(POOL()[0], POOL().slice(0, 1), seq()), null);
});
t('question: no sentence with the word in it gives null', () => {
  assert.strictEqual(RL.question(W('forlorn', ''), POOL(), seq()), null);
  assert.strictEqual(RL.question(W('forlorn', 'Other words only.'), POOL(), seq()), null);
});
t('question: uses saved places, the next place after each review, the note as hint, the chapter', () => {
  const ctx = [{ s: 'Looking forlorn at dusk.', bid: '1', bt: 'Dracula', ch: 3, t: 2 }, { s: 'A forlorn little house.', bid: '2', bt: 'Emma', ch: null, t: 1 }];
  const e = W('forlorn', 'old', { v: 2, ctx, note: 'sad and alone', hard: false, cols: [], st: 'new', cnt: { rec: 0, und: 0, rcl: 0, use: 0 } });
  const a = RL.question(e, POOL(), seq()), b = RL.question(Object.assign({}, e, { reps: 1 }), POOL(), seq());
  assert.strictEqual(a.post, ' at dusk.'); assert.strictEqual(a.bt, 'Dracula'); assert.strictEqual(a.ch, 3); assert.strictEqual(a.hint, 'sad and alone');
  assert.strictEqual(b.bt, 'Emma'); assert.strictEqual(b.ch, null);
});
t('question: the same level is preferred for the bank', () => {
  const pool = [W('aaa', 'a'), W('bbb', 'b', { lv: 'A1' }), W('ccc', 'c', { lv: 'A1' }), W('ddd', 'd', { lv: 'A1' }), W('eee', 'e', { lv: 'A1' })];
  pool[0].lv = 'A1'; pool[0].ex = 'See the aaa here.';
  const q = RL.question(pool[0], pool, seq()); assert.ok(q.bank.every(w => ['aaa', 'bbb', 'ccc', 'ddd', 'eee'].includes(w)));
  const mixed = [W('aaa', 'See the aaa here.', { lv: 'C1' }), W('b1', 'x', { lv: 'C1' }), W('b2', 'x', { lv: 'C1' }), W('b3', 'x', { lv: 'C1' }), W('z1', 'x', { lv: 'A1' }), W('z2', 'x', { lv: 'A1' })];
  for (let i = 0; i < 10; i++) { const r = RL.question(mixed[0], mixed, seq()); assert.ok(!r.bank.includes('z1') && !r.bank.includes('z2')); }
});
t('plan: only due words, most overdue first, at most 10, words that cannot be asked are counted', () => {
  const list = []; for (let i = 0; i < 12; i++) list.push(W('word' + i, 'Here is word' + i + ' in use.', { due: now - (i + 1) * 1000 }));
  list.push(W('later', 'Here is later.', { due: now + DAY })); list.push(W('nosent', '', { due: now - 99999999 }));
  const p = RL.plan(list, now, 10, seq());
  assert.strictEqual(p.qs.length, 10); assert.strictEqual(p.due, 13); assert.strictEqual(p.skipped, 1);
  assert.strictEqual(p.qs[0].w, 'word11'); assert.ok(!p.qs.some(q => q.w === 'later'));
});
t('plan: a word with no due date is due', () => { assert.strictEqual(RL.plan(POOL(), now, 10, seq()).qs.length, 5); });
t('plan: nothing to ask gives no questions', () => { assert.strictEqual(RL.plan([], now, 10).qs.length, 0); assert.strictEqual(RL.plan(null, now, 10).qs.length, 0); });
t('grade right: Good, kind recall, day counted, old fields kept', () => {
  reset([W('forlorn', 'x', { due: now - 1 })]);
  const e = RL.grade('forlorn', true, now);
  assert.ok(e.iv >= 1); assert.strictEqual(e.reps, 1); assert.strictEqual(e.cnt.rcl, 1); assert.strictEqual(e.rdays.length, 1); assert.ok(e.due > now);
  const s = JSON.parse(disk['wt:words'])[0]; assert.strictEqual(s.bt, 'Dracula'); assert.strictEqual(s.lv, 'B2'); assert.strictEqual(s.sch, 1);
});
t('grade wrong: Again, back in 10 minutes, forgotten count up, no recall credit', () => {
  reset([W('forlorn', 'x', { due: now - 1, iv: 6, reps: 3, ease: 2.5 })]);
  const e = RL.grade('forlorn', false, now);
  assert.strictEqual(e.iv, 0); assert.strictEqual(e.reps, 0); assert.strictEqual(e.lap, 1); assert.strictEqual(e.due, now + 600000); assert.strictEqual((e.cnt || {}).rcl || 0, 0);
});
t('grade: a word that is not saved gives null', () => { reset([]); assert.strictEqual(RL.grade('nope', true, now), null); });
t('a full 10-word session: plan, answer, grade, nothing due afterwards, 2 left over', () => {
  const list = []; for (let i = 0; i < 12; i++) list.push(W('word' + i, 'This is word' + i + ' in a sentence.', { due: now - (i + 1) * 1000 }));
  reset(list);
  const p = RL.plan(WS.all(), now, 10, seq()); assert.strictEqual(p.qs.length, 10);
  let right = 0;
  p.qs.forEach((q, i) => {
    assert.strictEqual(q.bank[q.answer], q.w);
    const pickIdx = i % 2 === 0 ? q.answer : (q.answer + 1) % q.bank.length, ok = pickIdx === q.answer; if (ok) right++;
    assert.ok(RL.grade(q.w, ok, now));
  });
  assert.strictEqual(right, 5);
  const after = WS.all(), due = after.filter(e => SRS.isDue(e, now));
  assert.strictEqual(due.length, 2);                                                      // the 2 words past the first 10
  assert.strictEqual(after.filter(e => e.cnt && e.cnt.rcl === 1).length, 5);              // the right ones got recall credit
  assert.strictEqual(after.filter(e => e.lap === 1).length, 5);                           // the wrong ones were forgotten once
  assert.ok(after.every(e => e.v === 2 && e.ex && e.bt === 'Dracula'));                   // upgraded, nothing lost
  assert.strictEqual(RL.plan(after, now, 10, seq()).qs.length, 2);                        // the next session holds the 2 left over
});
console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
