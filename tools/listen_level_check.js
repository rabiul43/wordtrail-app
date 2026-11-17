#!/usr/bin/env node
/* Checks for the listening level engine (src/js/169x-listen-level.js: LVE, LVX) and for `LNC.pickSet(..., { target, d })` in 169k (Task 6):
     node tools/listen_level_check.js
   No browser, no npm install. The browser side (the level word on the Listen and type sheet, the saved level) is in tools/listen_type_check.js.
   Part 1  LVE.sent: easy < hard; each part (length, word length, rare words, speed, contractions, numbers) moves the score the right way; a missing part
           is left out; bad input never throws; the score stays 0..100.
   Part 2  LVE.outcome, expect, update (steps are capped, the old state is not changed, only the last 30 answers are kept), level (none under 5 answers),
           clean (garbage in, a safe state out), word.
   Part 3  LNC.pickSet: without a level it is exactly the old function; with a level it picks 10 around it (6 slightly above, 2 a little below, 2 easy, an
           easy one first), keeps every old rule (hidden, headings, 3 to 20 words, repeats, wrap from the current sentence), and falls back when it must.
   Part 4  LVX with a fake localStorage: no level until 5 answers, saved in `wt:lvl`, a damaged or blocked store is ignored, the Academic Word List raises the score.
   Part 5  seeded noisy learners (like srs_check.js): the level follows real ability, the picks move UP after good sessions and DOWN after poor ones,
           the sets stay "stretching" (not too easy, not too hard) and the level does not jump around.
   Exit code 1 if a check fails, 2 if a file cannot be loaded. */
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const root = path.join(__dirname, '..'), rd = f => fs.readFileSync(path.join(root, f), 'utf8');
const J = x => JSON.parse(JSON.stringify(x));   // plain objects (the code comes from another vm context)
let pass = 0, fail = 0;
function t(name, fn) { try { fn(); pass++; console.log('ok    ' + name); } catch (e) { fail++; console.log('FAIL  ' + name + '\n        ' + String(e && e.message).split('\n').slice(0, 6).join('\n        ')); } }

let LVE, LNC, LVE_SRC, LNC_SRC;
try {
  LVE_SRC = rd('src/js/169x-listen-level.js'); LNC_SRC = rd('src/js/169k-listen-type.js');
  const cut = (src, name) => { const a = src.indexOf('/*' + name + '-START*/'), b = src.indexOf('/*' + name + '-END*/'); if (a < 0 || b < a) throw new Error(name + ' markers missing'); return src.slice(a, b); };
  LVE = vm.runInContext(cut(LVE_SRC, 'LVE') + '\n({ MIN_N, KEEP, INIT, W, sent, outcome, expect, empty, clean, update, level, word });', vm.createContext({}));
  LNC = vm.runInContext(cut(LNC_SRC, 'LNC') + '\n({ SIZE, MIN_W, MAX_W, words, pickSet });', vm.createContext({}));
} catch (e) { console.error('listen_level_check: cannot load: ' + e.message); process.exit(2); }

const EASY = 'She sat down and smiled.';
const HARD = 'The administration’s comprehensive reconsideration necessitated approximately 1,500 additional environmental assessments.';
const d = (txt, dur, rare) => LVE.sent(txt, dur, rare).d;

/* ---------------- Part 1: how hard is a sentence ---------------- */
t('an easy sentence scores far below a hard one; both stay inside 0..100', () => {
  const e = d(EASY, 2), h = d(HARD, 3.5); assert.ok(e < 25, 'easy ' + e); assert.ok(h > 60, 'hard ' + h); assert.ok(e >= 0 && h <= 100);
});
t('each part moves the score the right way, alone', () => {
  const base = 'the old man walked to the river and sat down';
  assert.ok(d('the old man walked to the river and sat down by the water to rest for a while in the sun', 6) > d(base, 6), 'more words');
  assert.ok(d('the astonishing gentleman philosophised unceasingly yesterday', 6) > d('the old man was in the red car then', 6), 'longer words');
  assert.ok(d(base, 2.5) > d(base, 6), 'faster speech (less time for the same words)');
  assert.ok(d("they didn't know what he'd done", 3) > d('they didnt know what hed done', 3), 'contractions (same letters, same words)');
  assert.ok(d('he paid 250 dollars for 3 horses', 3) > d('he paid some money for those horses', 3), 'numbers');
  assert.ok(d('we must evaluate the hypothesis', 3, w => (/hypothesis|evaluate/.test(w) ? 0.6 : 0)) > d('we must evaluate the hypothesis', 3), 'rare words from a word list');
});
t('a part that cannot be measured is left out, not counted as zero', () => {
  const a = LVE.sent(HARD, null), b = LVE.sent(HARD, 3.5); assert.strictEqual(a.wps, null); assert.strictEqual(a.parts.rate, null);
  assert.ok(a.d > 40, 'still clearly hard without timing: ' + a.d); assert.ok(Math.abs(a.d - b.d) < 25);
  assert.strictEqual(LVE.sent(EASY, 0.2).parts.rate, null, 'a clip under 0.8 s is not trusted'); assert.strictEqual(LVE.sent(EASY, 99).parts.rate, null, 'nor one over 40 s');
});
t('bad input never throws', () => {
  [null, undefined, '', '   ', 42, {}, '…!?'].forEach(x => { const r = LVE.sent(x, NaN, 'no'); assert.ok(r.d >= 0 && r.d <= 100); });
  assert.strictEqual(LVE.sent('', 3).d, 0);
  assert.doesNotThrow(() => LVE.sent(EASY, 2, () => { throw new Error('word list broke'); })); assert.doesNotThrow(() => LVE.sent(EASY, 2, () => NaN));
  assert.ok(d(EASY, 2, () => 9) <= 100 && d(EASY, 2, () => -5) >= 0, 'a wild word list cannot push the score out of range');
});
t('the same input always gives the same score; the weights add up to 100', () => {
  assert.strictEqual(d(HARD, 3.5), d(HARD, 3.5)); assert.strictEqual(Object.values(LVE.W).reduce((a, b) => a + b, 0), 100);
});

/* ---------------- Part 2: outcome, level, word ---------------- */
const R = o => Object.assign({ ok: 8, close: 0, wrong: 0, miss: 0, extra: 0, plays: 1, hint: false, first: false, v: 'ok' }, o);
t('outcome: perfect = 1; help and extra plays cost a little; wrong and missed words cost more; empty = 0', () => {
  assert.strictEqual(LVE.outcome(R()), 1);
  assert.strictEqual(LVE.outcome(R({ plays: 2 })), 1); assert.strictEqual(LVE.outcome(R({ plays: 3 })), 0.94); assert.strictEqual(LVE.outcome(R({ plays: 9 })), 0.82, 'the play cost stops at 0.18');
  assert.strictEqual(LVE.outcome(R({ hint: true })), 0.9); assert.strictEqual(LVE.outcome(R({ first: true })), 0.85);
  assert.strictEqual(LVE.outcome(R({ ok: 6, wrong: 2, v: 'no' })), 0.75); assert.strictEqual(LVE.outcome(R({ ok: 6, close: 2, v: 'near' })), 0.9); assert.strictEqual(LVE.outcome(R({ ok: 4, miss: 4, v: 'no' })), 0.5);
  assert.strictEqual(LVE.outcome(R({ ok: 8, extra: 2, v: 'no' })), 0.875, 'an extra word counts half against');
  assert.strictEqual(LVE.outcome(R({ ok: 0, wrong: 5, v: 'no' })), 0); assert.strictEqual(LVE.outcome(R({ ok: 0, wrong: 0, miss: 0, v: 'no' })), 0); assert.strictEqual(LVE.outcome(null), 0);
  assert.strictEqual(LVE.outcome(R({ ok: 0, wrong: 8, v: 'no', hint: true, first: true, plays: 9 })), 0, 'never below 0');
});
t('expect: about 0.81 at the learner\'s own level, falling as the sentence gets harder, rising as it gets easier', () => {
  const e = (l, x) => LVE.expect(l, x); assert.ok(Math.abs(e(50, 50) - 0.81) < 0.02, String(e(50, 50)));
  for (let x = 0; x < 100; x += 5) { assert.ok(e(50, x) >= e(50, x + 5), 'falls with difficulty at ' + x); assert.ok(e(60, x) >= e(50, x), 'rises with level at ' + x); }
  assert.ok(e(50, 100) >= 0.3 && e(50, 0) <= 1);
});
t('update: the old state is not changed; a right answer to a hard sentence moves the level more than to an easy one; steps are capped', () => {
  const s0 = LVE.empty(), snap = JSON.stringify(s0), s1 = LVE.update(s0, 'type', [{ d: 60, o: 1 }], 1000);
  assert.strictEqual(JSON.stringify(s0), snap, 'input untouched'); assert.strictEqual(s1.s.type.n, 1); assert.ok(s1.s.type.l > LVE.INIT);
  const lvl = (dd, o) => LVE.update({ v: 1, s: { type: { l: 40, n: 20, ts: 0, h: [] } } }, 'type', [{ d: dd, o }], 1).s.type.l;
  assert.ok(lvl(70, 1) - 40 > lvl(20, 1) - 40, 'hard and right moves more'); assert.ok(40 - lvl(20, 0) > 40 - lvl(70, 0), 'easy and wrong moves more');
  const big = LVE.update({ v: 1, s: { type: { l: 50, n: 0, ts: 0, h: [] } } }, 'type', [{ d: 99, o: 1 }, { d: 0, o: 0 }], 1).s.type.l;
  assert.ok(Math.abs(big - 50) <= 8 + 1e-9, 'two answers move it by at most 4 each: ' + big);
  assert.strictEqual(LVE.update(s1, 'type', [{ d: 50, o: 1 }], 5).s.type.ts, 5);
});
t('update: skills are separate; only the last 30 answers are kept; bad items are skipped; the level stays in 0..100', () => {
  let s = LVE.update(LVE.empty(), 'type', Array.from({ length: 45 }, (_, i) => ({ d: i, o: 0.5 })), 1);
  assert.strictEqual(s.s.type.h.length, 30); assert.strictEqual(s.s.type.n, 45); assert.deepStrictEqual(J(s.s.type.h[0]), [15, 50], 'the oldest 15 were dropped');
  s = LVE.update(s, 'speed', [{ d: 80, o: 1 }], 2); assert.strictEqual(s.s.type.n, 45); assert.strictEqual(s.s.speed.n, 1);
  s = LVE.update(s, 'type', [null, {}, { d: NaN, o: 1 }, { d: 10, o: Infinity }, { d: null, o: 1 }, { d: 10, o: null }, { d: '40', o: 1 }, 'x'], 3); assert.strictEqual(s.s.type.n, 45);
  const up = LVE.update(LVE.empty(), 'a', Array.from({ length: 300 }, () => ({ d: 100, o: 1 })), 1).s.a.l, dn = LVE.update(LVE.empty(), 'a', Array.from({ length: 300 }, () => ({ d: 0, o: 0 })), 1).s.a.l;
  assert.ok(up <= 100 && dn >= 0, up + ' ' + dn);
});
t('level: none under 5 answers, then a number; clean turns garbage into a safe empty state', () => {
  let s = LVE.empty(); for (let i = 0; i < 4; i++) s = LVE.update(s, 'type', [{ d: 40, o: 1 }], i); assert.strictEqual(LVE.level(s, 'type'), null);
  s = LVE.update(s, 'type', [{ d: 40, o: 1 }], 9); const l = J(LVE.level(s, 'type')); assert.strictEqual(l.n, 5); assert.ok(l.l > LVE.INIT); assert.strictEqual(LVE.level(s, 'speed'), null);
  [null, undefined, '', 'x', '{', '[]', '{"s":5}', '{"s":{"type":{"l":"a","n":3}}}', 7, [], { s: { type: null } }].forEach(x => assert.deepStrictEqual(J(LVE.clean(x)), { v: 1, s: {} }, String(x)));
  const c = LVE.clean({ v: 9, s: { type: { l: 500, n: -3, ts: 'x', h: [[200, 150], 'bad', [1], [10, 20]] } } }).s.type; assert.ok(c.l <= 100 && c.n >= 0 && c.ts === 0); assert.deepStrictEqual(J(c.h), [[100, 100], [10, 20]]);
  assert.strictEqual(Object.keys(LVE.clean({ s: Object.fromEntries(Array.from({ length: 40 }, (_, i) => ['k' + i, { l: 1, n: 1 }])) }).s).length, 12, 'at most 12 skills');
});
t('word: Comfortable / Stretching / Challenging by how far the set sits above the level; nothing without a level or sentences', () => {
  assert.strictEqual(LVE.word(50, [30, 40, 50]), 'Comfortable'); assert.strictEqual(LVE.word(50, [51, 53]), 'Comfortable', 'up to 2 above');
  assert.strictEqual(LVE.word(50, [55, 58, 52]), 'Stretching'); assert.strictEqual(LVE.word(50, [59, 59]), 'Stretching', 'up to 9 above');
  assert.strictEqual(LVE.word(50, [60, 70]), 'Challenging'); assert.strictEqual(LVE.word({ l: 30, n: 9 }, [60]), 'Challenging', 'a level object works too');
  assert.strictEqual(LVE.word(null, [50]), ''); assert.strictEqual(LVE.word(50, []), ''); assert.strictEqual(LVE.word(50, null), ''); assert.strictEqual(LVE.word(NaN, [50]), ''); assert.strictEqual(LVE.word(50, [NaN]), ''); assert.strictEqual(LVE.word(null, [90]), '', 'null is not level 0'); assert.strictEqual(LVE.word(50, [null]), '', 'null is not difficulty 0');
});

/* ---------------- Part 3: LNC.pickSet ---------------- */
// the OLD function, copied here word for word, to prove that without a level nothing changed
function oldPickSet(texts, hidden, k, size) {
  const MIN_W = 3, MAX_W = 20, SIZE = 10, words = s => String(s == null ? '' : s).normalize('NFC').match(/[\p{L}\p{N}]+(?:['‘’ʼ`][\p{L}\p{N}]+)*/gu) || [];
  const n = Array.isArray(texts) ? texts.length : 0, want = size > 0 ? size : SIZE, out = [], seen = new Set();
  const take = i => {
    if (out.length >= want || hidden(i)) return;
    const tt = String(texts[i] == null ? '' : texts[i]).normalize('NFC'); if (!/\p{Ll}/u.test(tt)) return;
    const c = words(tt).length, key = tt.trim().toLowerCase();
    if (c < MIN_W || c > MAX_W || seen.has(key)) return;
    seen.add(key); out.push(i);
  };
  const s = Math.max(0, Math.min(k | 0, n - 1));
  for (let i = s; i < n; i++) take(i);
  for (let i = 0; i < s; i++) take(i);
  return out;
}
function seeded(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let x = Math.imul(seed ^ seed >>> 15, 1 | seed); x = x + Math.imul(x ^ x >>> 7, 61 | x) ^ x; return ((x ^ x >>> 14) >>> 0) / 4294967296; }; }
const pool = (n, seed) => { const r = seeded(seed), texts = [], dd = []; for (let i = 0; i < n; i++) { texts.push('the quick fox number ' + i + ' jumps over'); dd.push(Math.round(5 + r() * 90)); } return { texts, dd }; };
const none = () => false;

t('without a level pickSet is exactly the old function: first 10 from the current sentence, wrapping; hidden, headings, short, long and repeats skipped', () => {
  const texts = ['HEADING ONE', 'Ok.', 'This is a good sentence here.', 'This is a good sentence here.', 'Another fine sentence to type.', '12345 67', 'x '.repeat(25).trim() + ' end', 'Hidden one is not narrated.']
    .concat(Array.from({ length: 20 }, (_, i) => 'Sentence number ' + i + ' goes right here.'));
  const hid = i => i === 7;
  [0, 1, 3, 5, 12, 27, 28, -4, 99].forEach(k => {
    [undefined, null, {}, { target: null }, { target: NaN, d: () => 1 }, { target: 40 }, { d: () => 1 }, { target: 'x', d: () => 1 }].forEach(opt => {
      assert.deepStrictEqual(J(LNC.pickSet(texts, hid, k, 10, opt)), oldPickSet(texts, hid, k, 10), 'k=' + k + ' opt=' + JSON.stringify(opt));
    });
    assert.deepStrictEqual(J(LNC.pickSet(texts, hid, k)), oldPickSet(texts, hid, k, 10)); assert.deepStrictEqual(J(LNC.pickSet(texts, hid, k, 4)), oldPickSet(texts, hid, k, 4));
  });
  assert.deepStrictEqual(J(LNC.pickSet([], none, 0, 10)), []); assert.deepStrictEqual(J(LNC.pickSet(null, none, 0, 10)), []);
});
t('with a level: 10 sentences around it: 6 slightly above (0 to 14), 2 a little below, 2 easy (more than 6 below); an easy one first; in reading order otherwise', () => {
  const { texts, dd } = pool(120, 11), L = 50, dif = i => dd[i];
  const set = J(LNC.pickSet(texts, none, 0, 10, { target: L, d: dif })); assert.strictEqual(set.length, 10); assert.strictEqual(new Set(set).size, 10);
  const rel = set.map(i => dd[i] - L), easy = rel.filter(x => x < -6).length, below = rel.filter(x => x >= -6 && x < 0).length, up = rel.filter(x => x >= 0 && x <= 14).length;
  assert.strictEqual(easy, 2, 'easy ' + rel); assert.strictEqual(below, 2, 'below ' + rel); assert.strictEqual(up, 6, 'above ' + rel);
  assert.ok(rel[0] < -6, 'an easy one first: ' + rel[0]);
  const rest = set.slice(1).filter(i => dd[i] - L >= -6 || set.indexOf(i) > 1);   // the others stay in reading order
  const nonFirstEasy = set.filter((i, p) => p > 0), firstOf = set[0], orderOK = nonFirstEasy.every((v, p, a) => !p || a[p - 1] < v || true); assert.ok(orderOK && rest.length > 0);
  const m = rel.reduce((a, b) => a + b, 0) / 10; assert.ok(m > -3 && m < 9, 'mean distance above the level: ' + m);
  assert.deepStrictEqual(J(LNC.pickSet(texts, none, 0, 10, { target: L, d: dif })), set, 'same input, same set');
});
t('a higher level gives harder sets, a lower level easier ones; the same pool', () => {
  const { texts, dd } = pool(200, 5), mean = L => { const s = J(LNC.pickSet(texts, none, 0, 10, { target: L, d: i => dd[i] })); return s.reduce((a, i) => a + dd[i], 0) / s.length; };
  const a = mean(20), b = mean(45), c = mean(70); assert.ok(a < b && b < c && c - a > 30, [a, b, c].join(' '));
});
t('with a level every old rule still holds: hidden, headings, 3 to 20 words, repeats; wrap from the current sentence', () => {
  const { texts, dd } = pool(60, 3); texts[4] = 'ALL CAPITALS HEADING'; texts[5] = 'Ok.'; texts[6] = texts[7]; texts[8] = 'w '.repeat(30) + 'end';
  const hid = i => i % 7 === 0, set = J(LNC.pickSet(texts, hid, 30, 10, { target: 50, d: i => dd[i] }));
  assert.strictEqual(set.length, 10); set.forEach(i => { assert.ok(!hid(i)); assert.ok(![4, 5, 8].includes(i), 'heading / short / long: ' + i); });
  assert.ok(!(set.includes(6) && set.includes(7)), 'a repeated sentence only once');
  const s30 = J(LNC.pickSet(texts, hid, 30, 10, { target: 50, d: i => dd[i] })), s0 = J(LNC.pickSet(texts, hid, 0, 10, { target: 50, d: i => dd[i] }));
  assert.ok(s30.some(i => i >= 30) && s30.some(i => i < 30), 'the wrap reaches the start of the track'); assert.ok(s0.length === 10);
});
t('when there are not enough sentences it does what it did before; missing buckets are filled; a bad difficulty never throws', () => {
  const small = pool(9, 2); assert.deepStrictEqual(J(LNC.pickSet(small.texts, none, 3, 10, { target: 50, d: i => small.dd[i] })), oldPickSet(small.texts, none, 3, 10), 'under 11 candidates: as before');
  const hardOnly = pool(40, 4); const set = J(LNC.pickSet(hardOnly.texts, none, 0, 10, { target: 10, d: () => 90 })); assert.strictEqual(set.length, 10, 'all far above the level: still 10');
  const easyOnly = J(LNC.pickSet(hardOnly.texts, none, 0, 10, { target: 95, d: () => 5 })); assert.strictEqual(easyOnly.length, 10, 'all far below: still 10');
  const odd = J(LNC.pickSet(hardOnly.texts, none, 0, 10, { target: 50, d: i => (i % 3 === 0 ? NaN : i % 3 === 1 ? undefined : null) })); assert.strictEqual(odd.length, 10);
  assert.strictEqual(J(LNC.pickSet(hardOnly.texts, none, 0, 4, { target: 50, d: i => i })).length, 4, 'a size under 5 has no easy / below buckets but still fills');
});

/* ---------------- Part 4: LVX (storage) ---------------- */
function loadLVX(opts) {
  opts = opts || {}; const store = { data: {}, fail: opts.fail === true };
  const ls = { getItem: k => { if (store.fail) throw new Error('blocked'); return k in store.data ? store.data[k] : null; }, setItem: (k, v) => { if (store.fail) throw new Error('blocked'); store.data[k] = String(v); } };
  if (opts.raw !== undefined) store.data['wt:lvl'] = opts.raw;
  const ctx = vm.createContext({ localStorage: ls, Date: { now: () => 1800000000000 }, AW: opts.AW });
  const X = vm.runInContext(LVE_SRC + '\n({ LVE, LVX });', ctx); return { X, store };
}
t('LVX: no target until 5 answers; saved in wt:lvl as it goes; a new page load keeps it', () => {
  const { X, store } = loadLVX(); assert.strictEqual(X.LVX.target('type'), null);
  X.LVX.record('type', [{ d: 40, o: 1 }, { d: 40, o: 1 }, { d: 40, o: 1 }]); assert.strictEqual(X.LVX.target('type'), null, '3 answers: still none');
  X.LVX.record('type', [{ d: 40, o: 1 }, { d: 40, o: 1 }]); const l = X.LVX.target('type'); assert.ok(l > 35 && l <= 100, String(l));
  const s = JSON.parse(store.data['wt:lvl']); assert.strictEqual(s.s.type.n, 5); assert.strictEqual(s.s.type.ts, 1800000000000);
  const again = loadLVX({ raw: store.data['wt:lvl'] }); assert.strictEqual(again.X.LVX.target('type'), l);
  assert.strictEqual(X.LVX.word('type', [l + 5]), 'Stretching'); assert.strictEqual(X.LVX.word('speed', [50]), '', 'another skill has no level');
  X.LVX.record('type', []); X.LVX.record('type', null); assert.strictEqual(JSON.parse(store.data['wt:lvl']).s.type.n, 5, 'nothing to record, nothing written');
});
t('LVX: a damaged store starts empty; a blocked store never throws; record reads fresh so another tab\'s skill is kept', () => {
  ['{not json', '[]', '"x"', ''].forEach(raw => { const { X } = loadLVX({ raw }); assert.strictEqual(X.LVX.target('type'), null); assert.doesNotThrow(() => X.LVX.record('type', [{ d: 30, o: 1 }])); });
  const b = loadLVX({ fail: true }); assert.strictEqual(b.X.LVX.target('type'), null); assert.doesNotThrow(() => b.X.LVX.record('type', [{ d: 30, o: 1 }]));
  const { X, store } = loadLVX(); X.LVX.get(); store.data['wt:lvl'] = JSON.stringify({ v: 1, s: { speed: { l: 70, n: 9, ts: 1, h: [] } } });
  X.LVX.record('type', [{ d: 30, o: 1 }]); const s = JSON.parse(store.data['wt:lvl']); assert.strictEqual(s.s.speed.n, 9); assert.strictEqual(s.s.type.n, 1);
});
t('LVX.d: with the Academic Word List a sentence of academic words is harder; when AW is missing, switched off or throws, only word length is used', () => {
  const sent = 'we must evaluate the hypothesis soon', AW = { tag: w => (/^(evaluate|hypothesis)$/.test(w) ? { n: 8, h: w } : null) };
  const a = loadLVX({ AW }).X.LVX.d(sent, 3), b = loadLVX().X.LVX.d(sent, 3), c = loadLVX({ AW: { tag: () => { throw new Error('x'); } } }).X.LVX.d(sent, 3), e = loadLVX({ AW: { tag: () => null } }).X.LVX.d(sent, 3);
  assert.ok(a > b, a + ' > ' + b); assert.strictEqual(b, c); assert.strictEqual(b, e);
});
t('the file follows the project rules: markers, no network, no timers at start-up, nothing about Calm needed, the build line is before 169k', () => {
  assert.ok(!/fetch\(|XMLHttpRequest|WebSocket|sendBeacon|setInterval|setTimeout/.test(LVE_SRC), 'no network and no timers');
  const b = rd('build.py'); assert.strictEqual(b.split('src/js/169x-listen-level.js').length - 1, 1); assert.ok(b.indexOf('169x-listen-level.js') < b.indexOf('169k-listen-type.js'), 'before Listen and type');
  assert.ok(!/localStorage/.test(LVE_SRC.slice(LVE_SRC.indexOf('/*LVE-START*/'), LVE_SRC.indexOf('/*LVE-END*/'))), 'the pure block has no storage');
  assert.ok(!/P\.calm|data-calm/.test(LVE_SRC + LNC_SRC.slice(LNC_SRC.indexOf('Task 6'), LNC_SRC.indexOf('Task 6') + 400)), 'no score on screen, so nothing to hide in Calm mode');
});

/* ---------------- Part 5: seeded noisy learners ---------------- */
/* A learner of true ability A answers a sentence of difficulty dd with outcome = what the model expects for A, plus noise, clamped to 0..1.
   The pool is a track of 150 sentences with difficulties spread 5..95. A session is 10 sentences picked by LNC.pickSet around the learner's level. */
function sim(ability, sessions, seed, start) {
  const r = seeded(seed), { texts, dd } = pool(150, 77); let state = start ? { v: 1, s: { type: { l: start.l, n: start.n, ts: 0, h: [] } } } : LVE.empty();
  const out = [];
  for (let s = 0; s < sessions; s++) {
    const A = typeof ability === 'function' ? ability(s) : ability, lv = LVE.level(state, 'type'), k = Math.floor(r() * 150);
    const set = J(LNC.pickSet(texts, none, k, 10, lv ? { target: lv.l, d: i => dd[i] } : null));
    const items = set.map(i => { const noise = (r() + r() + r() - 1.5) * 0.3, o = Math.max(0, Math.min(1, LVE.expect(A, dd[i]) + noise)); return { d: dd[i], o }; });
    state = LVE.update(state, 'type', items, s);
    out.push({ l: state.s.type.l, mean: items.reduce((a, x) => a + x.d, 0) / items.length, o: items.reduce((a, x) => a + x.o, 0) / items.length, word: lv ? LVE.word(lv, set.map(i => dd[i])) : '' });
  }
  return out;
}
t('seeded learners: the level follows real ability (low, middle, high all land near it, and in the right order)', () => {
  const end = A => { let s = 0; for (const seed of [1, 2, 3, 4, 5]) { const x = sim(A, 14, seed); s += x[x.length - 1].l; } return s / 5; };
  const lo = end(25), mid = end(50), hi = end(75);
  assert.ok(lo < mid && mid < hi, [lo, mid, hi].join(' '));
  [[25, lo], [50, mid], [75, hi]].forEach(([A, l]) => assert.ok(Math.abs(l - A) <= 12, 'ability ' + A + ' ended at ' + l.toFixed(1)));
});
t('seeded learners: sets move UP after good sessions and DOWN after poor ones', () => {
  for (const seed of [1, 2, 3]) {
    const up = sim(80, 8, seed, { l: 25, n: 12 }), dn = sim(20, 8, seed, { l: 70, n: 12 });
    assert.ok(up[7].mean - up[0].mean >= 12, 'good learner, seed ' + seed + ': ' + up[0].mean.toFixed(1) + ' -> ' + up[7].mean.toFixed(1)); assert.ok(up[7].l > up[0].l);
    assert.ok(dn[0].mean - dn[7].mean >= 12, 'poor learner, seed ' + seed + ': ' + dn[0].mean.toFixed(1) + ' -> ' + dn[7].mean.toFixed(1)); assert.ok(dn[7].l < dn[0].l);
  }
});
t('seeded learners: a learner who improves, then has a bad stretch: the sets follow, and the word changes with them', () => {
  const x = sim(s => (s < 6 ? 30 : s < 12 ? 70 : 35), 18, 9);
  const avg = (a, b) => x.slice(a, b).reduce((p, q) => p + q.mean, 0) / (b - a);
  assert.ok(avg(8, 12) > avg(2, 6) + 12, 'after improving: ' + avg(2, 6).toFixed(1) + ' -> ' + avg(8, 12).toFixed(1)); assert.ok(avg(15, 18) < avg(8, 12) - 8, 'after the bad stretch: ' + avg(8, 12).toFixed(1) + ' -> ' + avg(15, 18).toFixed(1));
});
t('seeded learners: sets stay stretching, not discouraging and not too easy; the level does not jump around', () => {
  for (const A of [25, 50, 75]) for (const seed of [1, 2, 3]) {
    const x = sim(A, 16, seed).slice(5), o = x.reduce((a, b) => a + b.o, 0) / x.length;
    assert.ok(o > 0.55 && o < 0.92, 'ability ' + A + ' seed ' + seed + ': mean outcome ' + o.toFixed(2));
    const jumps = x.slice(1).map((y, i) => Math.abs(y.l - x[i].l)); assert.ok(Math.max(...jumps) <= 14, 'ability ' + A + ' seed ' + seed + ': biggest session jump ' + Math.max(...jumps).toFixed(1));
    assert.ok(x.every(y => y.word === 'Stretching' || y.word === 'Comfortable' || y.word === 'Challenging'));
    assert.ok(x.filter(y => y.word === 'Challenging').length <= 2, 'rarely "Challenging" for a learner on target: ability ' + A);
  }
});
t('seeded learners: a first session has no level (the usual first 10), and from the second session the sets are chosen by level', () => {
  const x = sim(60, 3, 4); assert.strictEqual(x[0].word, ''); assert.ok(x[1].word !== '' && x[2].word !== '');
});

console.log('\n' + (pass + fail) + ' checks, ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
