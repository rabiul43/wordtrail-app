#!/usr/bin/env node
/* Checks for "My hard words" (src/js/168b-hard-words.js). No browser, no npm install:   node tools/hard_words_check.js
   Part 1  The scoring (HW, between the HW-START/HW-END markers, with the real SRS from 148): each part of the formula, the examples written in the file's
           header, words never reviewed, bad input, old words (no lap / sch), the discount for words that grew back, the list (size, minimum, order, ties),
           the date label, and that nothing is changed or stored.
   Part 2  The real Review lesson (168) with the real word store: RL.plan(..., only) asks only the listed words, in that order, due or not; the old plan (no
           `only`) is unchanged; a lesson started with { words } grades through the scheduler so the scores move.
   Part 3  The screen glue of the real 168b with stand-in page objects: Calm mode (no meter, no score text, no badge, Practise button stays), the badge
           threshold, the Practise button hands exactly the listed words to RL.start, the entry button logic (HW.any).
   Exit code 1 if a check fails, 2 if a file cannot be loaded. */
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const read = f => fs.readFileSync(path.join(__dirname, '..', 'src/js', f), 'utf8');
const J = x => JSON.parse(JSON.stringify(x));
const DAY = 864e5, NOW = Date.UTC(2026, 10, 19, 9);   // a fixed "now"
let pass = 0, fail = 0;
const queue = [];
const t = (name, fn) => queue.push([name, fn]);

let HW, SRC;
try {
  SRC = read('168b-hard-words.js');
  const a = SRC.indexOf('/*HW-START*/'), b = SRC.indexOf('/*HW-END*/'); if (a < 0 || b < a) throw new Error('HW markers missing');
  const ctx = vm.createContext({});
  vm.runInContext(read('148-scheduler.js') + '\n' + SRC.slice(a, b) + '\nthis.X = { score, parts, isHard, rank, dateLabel, HARD_AT, LIST_MIN, LIST_SIZE };', ctx);
  HW = ctx.X;
} catch (e) { console.error('hard_words_check: cannot load: ' + e.message); process.exit(2); }

/* a reviewed word: last reviewed `ago` days before NOW (lr), with the scheduler fields given */
const word = (w, o, ago) => Object.assign({ ts: 1, w, lv: 'B2', ex: 'Here is ' + w + '.', sch: 1, lr: NOW - (ago || 0) * DAY, due: NOW + DAY, iv: 0, reps: 0, ease: 2.5, lap: 0 }, o || {});

/* ---------------- Part 1: the scoring ---------------- */
t('a word never reviewed scores 0, whatever else it holds', () => {
  assert.strictEqual(HW.score({ w: 'new', ts: 1 }, NOW), 0);
  assert.strictEqual(HW.score({ w: 'new', ts: 1, ease: 1.3, lap: 9 }, NOW), 0, 'no due, no lr: never reviewed');
});
t('bad input never throws and gives 0', () => {
  [null, undefined, 5, 'x', [], {}, { w: 'a', lr: 'soon' }].forEach(x => assert.strictEqual(HW.score(x, NOW), 0));
  assert.strictEqual(HW.score(word('a', { lap: 3, ease: 1.5 }), NaN), 0);
  assert.strictEqual(HW.score(word('a', { lap: 3, ease: 1.5 }), 'now'), 0);
  assert.strictEqual(HW.score(word('a', { ease: NaN, lap: -4, reps: 'many', iv: null }), NOW), 0, 'garbage fields count as nothing');
});
t('a word answered well scores 0: ease at or above 2.5, no lapses', () => {
  assert.strictEqual(HW.score(word('easy', { ease: 2.5, reps: 1, iv: 2 }), NOW), 0);
  assert.strictEqual(HW.score(word('easier', { ease: 2.95, reps: 5, iv: 20 }), NOW), 0);
});
t('ease part: 40 x (2.5 - ease) / 1.2, nothing else counted when the run and recent parts are off', () => {
  const p = HW.parts(word('w', { ease: 1.3, reps: 5, iv: 0 }, 60), NOW);   // slipped, long run, old review
  assert.strictEqual(Math.round(p.ease * 10) / 10, 40); assert.strictEqual(p.lapses, 0); assert.strictEqual(p.run, 0); assert.strictEqual(p.recent, 0);
  assert.strictEqual(Math.round(HW.parts(word('w', { ease: 1.9, reps: 5 }, 60), NOW).ease * 10) / 10, 20);
  assert.strictEqual(HW.parts(word('w', { ease: 0.5, reps: 5 }, 60), NOW).ease, 40, 'ease below the floor is held at the floor');
});
t('lapse part: 6 points each, capped at 5 lapses', () => {
  const lp = n => HW.parts(word('w', { lap: n, reps: 9 }, 60), NOW).lapses;
  assert.deepStrictEqual(J([0, 1, 2, 5, 9, 50].map(lp)), [0, 6, 12, 30, 30, 30]);
});
t('run part: 20 with no run, 13 with 1, 7 with 2, 0 from 3; only for a word that has slipped', () => {
  const run = (reps, o) => Math.round(HW.parts(word('w', Object.assign({ lap: 1, reps }, o), 60), NOW).run);
  assert.deepStrictEqual(J([0, 1, 2, 3, 8].map(r => run(r))), [20, 13, 7, 0, 0]);
  assert.strictEqual(HW.parts(word('w', { lap: 0, ease: 2.5, reps: 0 }, 60), NOW).run, 0, 'not slipped: a short run is not trouble');
  assert.strictEqual(Math.round(HW.parts(word('w', { lap: 0, ease: 2.35, reps: 0 }, 60), NOW).run), 20, 'one Hard answer (ease below 2.5) counts as slipped');
});
t('recent part: 10 today, fading to 0 over 14 days; only for a word that has slipped', () => {
  const rc = ago => Math.round(HW.parts(word('w', { lap: 1, reps: 9 }, ago), NOW).recent * 100) / 100;
  assert.deepStrictEqual(J([0, 7, 14, 30].map(rc)), [10, 5, 0, 0]);
  assert.strictEqual(HW.parts(word('w', { lap: 0, ease: 2.5 }, 0), NOW).recent, 0);
  assert.strictEqual(HW.parts(word('w', { lap: 1, reps: 9 }, -3), NOW).recent, 10, 'a review "in the future" (clock change) is treated as now');
});
t('the worked examples in the file header are right', () => {
  assert.strictEqual(HW.score(word('a', { ease: 2.3, lap: 1, reps: 0, iv: 0 }, 0), NOW), 43);
  assert.strictEqual(HW.score(word('b', { ease: 2.1, lap: 2, reps: 0, iv: 0 }, 0), NOW), 55);
  assert.strictEqual(HW.score(word('c', { ease: 1.7, lap: 3, reps: 0, iv: 0 }, 3), NOW), 73);
  assert.strictEqual(HW.score(word('d', { ease: 1.7, lap: 3, reps: 0, iv: 40 }, 3), NOW), 36);
});
t('the discount: a long interval halves the score, a short one barely changes it', () => {
  const base = { ease: 1.7, lap: 3, reps: 0 };
  const at = iv => HW.parts(word('w', Object.assign({ iv }, base), 3), NOW);
  assert.strictEqual(at(0).keep, 1); assert.strictEqual(at(30).keep, 0.5); assert.strictEqual(at(365).keep, 0.5); assert.strictEqual(at(15).keep, 0.75);
  assert.ok(at(0).total > at(5).total && at(5).total > at(15).total && at(15).total > at(30).total);
});
t('score is always a whole number from 0 to 100, and 100 is reachable only by the worst possible word', () => {
  const worst = word('w', { ease: 1.3, lap: 20, reps: 0, iv: 0 }, 0);
  assert.strictEqual(HW.score(worst, NOW), 100);
  for (let i = 0; i < 300; i++) {
    const w = word('w' + i, { ease: 1.3 + (i % 20) * 0.08, lap: i % 8, reps: i % 6, iv: (i * 7) % 90 }, (i * 3) % 40), s = HW.score(w, NOW);
    assert.ok(Number.isInteger(s) && s >= 0 && s <= 100, 'score ' + s);
  }
});
t('more trouble never lowers the score: lapses, lower ease, a shorter run', () => {
  const s = o => HW.score(word('w', Object.assign({ ease: 2.2, lap: 1, reps: 2, iv: 3 }, o), 5), NOW);
  assert.ok(s({ lap: 2 }) >= s({ lap: 1 }) && s({ lap: 4 }) >= s({ lap: 2 }));
  assert.ok(s({ ease: 1.8 }) >= s({ ease: 2.2 }) && s({ ease: 1.4 }) >= s({ ease: 1.8 }));
  assert.ok(s({ reps: 0 }) >= s({ reps: 1 }) && s({ reps: 1 }) >= s({ reps: 3 }));
});
t('a word of the OLD kind (no sch, no lap, no lr; only ease, iv, reps, due) is scored from what it has', () => {
  const old = { ts: 1, w: 'ancient', ease: 1.9, iv: 0, reps: 0, due: NOW - 600e3 + 600e3, acq: 0 };   // after an old "Again": due 10 minutes after the review
  assert.strictEqual(SRS_lr(old), NOW - 600e3 + 600e3 - 600e3);
  const s = HW.score(old, NOW);
  assert.ok(s > 0 && s <= 100);
  assert.strictEqual(HW.score({ ts: 1, w: 'x', due: NOW + 2 * DAY, iv: 2, reps: 1 }, NOW), 0, 'an old word that was only ever right has ease undefined: no trouble');
});
function SRS_lr(e) { const c = vm.createContext({}); vm.runInContext(read('148-scheduler.js') + '\nthis.f = SRS.lastReview;', c); return c.f(e); }

t('the scoring changes nothing it is given and gives the same answer twice', () => {
  const list = [word('a', { ease: 1.8, lap: 2 }, 1), word('b', { ease: 2.5 }, 1)], before = JSON.stringify(list);
  const r1 = JSON.stringify(HW.rank(list, NOW)), r2 = JSON.stringify(HW.rank(list, NOW));
  assert.strictEqual(JSON.stringify(list), before); assert.strictEqual(r1, r2);
  assert.strictEqual(HW.score(list[0], NOW), HW.score(list[0], NOW));
});
t('the score file stores nothing: no storage key, no store.set, no localStorage in the pure part', () => {
  const pure = SRC.slice(SRC.indexOf('/*HW-START*/'), SRC.indexOf('/*HW-END*/'));
  assert.ok(!/store\s*\.|localStorage|sessionStorage|indexedDB|Date\.now|new Date\(\)|Math\.random|wt:/.test(pure), 'the pure part must not touch storage, the clock or random numbers');
  assert.ok(!/store\.set|localStorage\.setItem|wt:[a-z]/i.test(SRC.replace(/^\s*\/\*[\s\S]*?\*\//, '').replace(/\/\/.*$/gm, '')), 'no storage write anywhere in the file');
});

t('rank: highest first, at most 20, none under 15, ties by lapses then most recent review then A to Z', () => {
  const list = [];
  for (let i = 0; i < 30; i++) list.push(word('w' + String(i).padStart(2, '0'), { ease: 1.3 + i * 0.03, lap: 3, reps: 0 }, 2));   // later = easier = lower
  list.push(word('fine', { ease: 2.5 }, 1)); list.push({ w: 'never', ts: 1 }); list.push(word('tiny', { ease: 2.45, reps: 9 }, 40));   // 0, 0, and a ~3 wobble
  const r = HW.rank(list, NOW);
  assert.strictEqual(r.length, 20); assert.strictEqual(r[0].w, 'w00'); assert.strictEqual(r[19].w, 'w19');
  for (let i = 1; i < r.length; i++) assert.ok(r[i - 1].score >= r[i].score);
  assert.ok(!r.some(x => ['fine', 'never', 'tiny'].includes(x.w)));
  assert.strictEqual(HW.rank(list, NOW, 5).length, 5); assert.strictEqual(HW.rank(list, NOW, 0).length, 20);
  assert.strictEqual(HW.rank(list, NOW, 100, 1).length, 31, 'minimum 1: the 30 words plus the 3-point wobble; fine and never still score 0');
  assert.strictEqual(HW.rank([word('x', { ease: 2.0, lap: 1, reps: 1 }, 1)], NOW, 20, 99).length, 0, 'a higher minimum leaves it out');
  // ties
  const a = word('beta', { ease: 2, lap: 2, reps: 0 }, 5), b = word('alpha', { ease: 2, lap: 2, reps: 0 }, 5), c = word('gamma', { ease: 2, lap: 2, reps: 0 }, 1);
  assert.deepStrictEqual(J(HW.rank([a, b, c], NOW).map(x => x.w)), ['gamma', 'alpha', 'beta'], 'same score and lapses: newest review first, then A to Z');
  const d = word('delta', { ease: 1.9, lap: 3, reps: 0 }, 5), e = word('epsilon', { ease: 2.14, lap: 2, reps: 0 }, 5);
  const sd = HW.score(d, NOW), se = HW.score(e, NOW);
  if (sd === se) assert.deepStrictEqual(J(HW.rank([e, d], NOW).map(x => x.w)), ['delta', 'epsilon'], 'same score: more lapses first');
});
t('rank: entries that are not words, and a bad list, are skipped; words come back lower case and trimmed', () => {
  assert.deepStrictEqual(J(HW.rank(null, NOW)), []); assert.deepStrictEqual(J(HW.rank('x', NOW)), []);
  const r = HW.rank([null, 5, { w: 7 }, { w: '  ' }, word('  Gloom ', { ease: 1.5, lap: 3 }, 1)], NOW);
  assert.strictEqual(r.length, 1); assert.strictEqual(r[0].w, 'gloom'); assert.ok(r[0].last > 0);
});
t('badge threshold: 50 is hard, 49 is not', () => {
  assert.strictEqual(HW.HARD_AT, 50); assert.strictEqual(HW.isHard(word('b', { ease: 2.1, lap: 2, reps: 0 }, 0), NOW), true);   // 55
  assert.strictEqual(HW.isHard(word('a', { ease: 2.3, lap: 1, reps: 0 }, 0), NOW), false);   // 43
  assert.strictEqual(HW.isHard(word('x', { ease: 1.5, lap: 3, reps: 0, iv: 40 }, 0), NOW), false, 'grown back: no badge');
});
t('dateLabel: Today, Yesterday, day + month, with the year only in another year; 0 is "Not reviewed yet"', () => {
  const at = (y, m, d, hh) => new Date(y, m, d, hh || 12).getTime(), now = at(2026, 10, 19, 9);
  assert.strictEqual(HW.dateLabel(at(2026, 10, 19, 1), now), 'Today'); assert.strictEqual(HW.dateLabel(at(2026, 10, 18, 23), now), 'Yesterday');
  assert.strictEqual(HW.dateLabel(at(2026, 10, 12), now), '12 Nov'); assert.strictEqual(HW.dateLabel(at(2026, 0, 3), now), '3 Jan');
  assert.strictEqual(HW.dateLabel(at(2025, 11, 30), now), '30 Dec 2025');
  assert.strictEqual(HW.dateLabel(0, now), 'Not reviewed yet'); assert.strictEqual(HW.dateLabel(undefined, now), 'Not reviewed yet'); assert.strictEqual(HW.dateLabel(NaN, now), 'Not reviewed yet');
  assert.strictEqual(HW.dateLabel(now + 5 * DAY, now), 'Today', 'a date in the future (clock change) reads as today');
});

/* ---------------- Part 2: the real Review lesson ---------------- */
const disk = {};
const store = { get(k, d) { try { const v = disk[k]; return v ? JSON.parse(v) : d; } catch (e) { return d; } }, set(k, v) { disk[k] = JSON.stringify(v); } };
let T;
try {
  const code = ['146-word-model.js', '147-word-store.js', '148-scheduler.js', '148b-learn-log.js', '165-word-cards.js', '167b-review-types.js', '168-review-lesson.js'].map(read).join('\n') + '\nthis.T = { WM, WS, SRS, RL, WC };';
  const ctx = vm.createContext({ store, h: () => ({}), vlist: () => {}, toast: () => {}, histSoon: () => {}, vocRender: () => {}, vocDefine: async () => '', setTimeout, clearTimeout, $: () => null, prSpeech: false, document: { addEventListener() {}, body: { append() {} } }, window: { addEventListener() {} }, Date });
  vm.runInContext(code, ctx); T = ctx.T;
} catch (e) { console.error('hard_words_check: cannot load the lesson code: ' + e.message); process.exit(2); }
const { WS, RL, SRS } = T;
const seq = () => { let n = 0; return () => ((n = (n * 9301 + 49297) % 233280) / 233280) || 0.123; };
const lessonWord = (w, o) => Object.assign({ ts: 1, w, lv: 'B2', ex: 'Here is ' + w + ' in use.', bid: '1', bt: 'Emma' }, o || {});
const POOL = () => {
  const l = []; ['aaa', 'bbb', 'ccc', 'ddd', 'eee', 'fff'].forEach((w, i) => l.push(lessonWord(w, { due: i < 3 ? NOW - (i + 1) * 1000 : NOW + 5 * DAY, ease: 1.8, lap: 2, reps: 0, iv: i < 3 ? 0 : 5, sch: 1, lr: NOW - DAY })));
  l.push(lessonWord('plain', { due: NOW - 99999 })); return l;
};
t('RL.plan(only): asks just the listed words, in the listed order, due or not (fff is due in 5 days)', () => {
  const p = RL.plan(POOL(), NOW, 20, seq(), true, ['fff', 'bbb', 'ddd']);
  assert.deepStrictEqual(J(p.qs.map(q => q.w)), ['fff', 'bbb', 'ddd']); assert.strictEqual(p.due, 3);
});
t('RL.plan(only): a word that is not saved is ignored, the case of the list does not matter, max still limits', () => {
  assert.deepStrictEqual(J(RL.plan(POOL(), NOW, 20, seq(), true, ['nope', 'CCC', ' aaa ']).qs.map(q => q.w)), ['ccc', 'aaa']);   // listed order: ccc first
  assert.strictEqual(RL.plan(POOL(), NOW, 2, seq(), true, ['aaa', 'bbb', 'ccc', 'ddd']).qs.length, 2);
  assert.strictEqual(RL.plan(POOL(), NOW, 20, seq(), true, []).qs.length, 0, 'an empty list asks nothing (it does NOT fall back to the due words)');
});
t('RL.plan without `only` is unchanged: the due words, most overdue first', () => {
  const p = RL.plan(POOL(), NOW, 10, seq(), true);
  assert.deepStrictEqual(J(p.qs.map(q => q.w).sort()), ['aaa', 'bbb', 'ccc', 'plain'].sort()); assert.ok(!p.qs.some(q => q.w === 'fff'));
});
t('RL.plan(only): words that cannot be asked (no sentence, no note) are skipped and counted', () => {
  const l = POOL(); l.push(lessonWord('mute', { ex: '', ease: 1.5, lap: 3, reps: 0, due: NOW + DAY, sch: 1, lr: NOW - DAY }));
  const p = RL.plan(l, NOW, 20, seq(), true, ['mute', 'aaa']); assert.deepStrictEqual(J(p.qs.map(q => q.w)), ['aaa']); assert.strictEqual(p.skipped, 1);
});
t('RL.start() still takes no argument, and an unknown argument is ignored (checked on the source: o is only read for words, max, after)', () => {
  const src = read('168-review-lesson.js');
  assert.ok(/function start\(o\)/.test(src) && /o = o && typeof o === 'object' \? o : \{\}/.test(src));
  assert.ok(/L\.after = null/.test(src), 'the after hook is cleared once called');
});
t('a hard-words answer goes through the scheduler: an Again raises the score, a run of Good answers lowers it', () => {
  disk['wt:words'] = JSON.stringify([lessonWord('gloom', { sch: 1, ease: 2.5, iv: 3, reps: 2, lap: 0, due: NOW, lr: NOW - 3 * DAY })]);
  const s0 = HW.score(WS.get('gloom'), NOW);
  RL.grade('gloom', false, NOW, 'fill');
  const e1 = WS.get('gloom'), s1 = HW.score(e1, NOW);
  assert.strictEqual(e1.lap, 1); assert.ok(s1 > s0, 'one Again: ' + s0 + ' -> ' + s1);
  RL.grade('gloom', false, NOW + 1, 'fill');
  const s2 = HW.score(WS.get('gloom'), NOW + 1); assert.ok(s2 > s1, 'two Agains: ' + s1 + ' -> ' + s2);
  let e = WS.get('gloom'), now = NOW + DAY;
  for (let i = 0; i < 6; i++) { RL.grade('gloom', true, now, 'fill'); e = WS.get('gloom'); now = Math.max(now, e.due) + 1; }
  assert.ok(HW.score(e, now) < s2, 'six right answers later: ' + s2 + ' -> ' + HW.score(e, now));
});

/* ---------------- Part 3: the screen glue ---------------- */
const mkEl = (tag, attrs, kids) => { const el = { tag, attrs: attrs || {}, kids: [], hidden: false, textContent: '', listeners: {}, dataset: {}, append(...k) { k.forEach(x => { if (x != null) el.kids.push(x); }); }, addEventListener(n, f) { el.listeners[n] = f; } }; (kids || []).forEach(k => { if (k != null) el.kids.push(k); }); return el; };
const hh = (tag, attrs, ...kids) => mkEl(tag, attrs, kids);
const flat = el => (el && typeof el === 'object') ? [el].concat(...(el.kids || []).map(flat)) : [];
const texts = el => flat(el).map(x => (x.tag ? x.attrs && x.attrs['aria-label'] || '' : '') + ' ' + (x.kids || []).filter(k => typeof k === 'string').join(' ')).join(' ');
function screen(P, words, startResult) {
  const els = { '#sheet-hw': mkEl('section'), '#hw-list': mkEl('ol'), '#hw-help': mkEl('p'), '#hw-go': mkEl('button') };
  els['#sheet-hw'].hidden = true; els['#hw-go'].hidden = true;
  const calls = { start: [], open: [], toast: [] };
  const ctx = vm.createContext({ P, h: hh, $: s => els[s] || null, WS: { all: () => J(words) }, SRS: null, RL: { start: o => { calls.start.push(o); return startResult !== false; } }, openSheet: id => { calls.open.push(id); els['#sheet-hw'].hidden = false; }, toast: m => calls.toast.push(m), Date: class extends Date { static now() { return NOW; } }, Math, Number, Array, Map, Object, JSON, String, isFinite, Integer: null });
  vm.runInContext(read('148-scheduler.js') + '\n' + SRC + '\nthis.HW = HW; this.SRS = SRS;', ctx);
  return { HW: ctx.HW, els, calls };
}
const HARDS = () => [word('gloom', { ease: 1.5, lap: 3, reps: 0 }, 1), word('dread', { ease: 2.1, lap: 2, reps: 0 }, 2), word('calm', { ease: 2.5, reps: 3, iv: 10 }, 2), { w: 'fresh', ts: 1 }];
t('sheet: lists the hardest words with a meter and a last-review line, hardest first; the Practise button shows', () => {
  const s = screen({}, HARDS()); s.HW.open();
  assert.deepStrictEqual(J(s.calls.open), ['sheet-hw']);
  const rows = s.els['#hw-list'].kids; assert.strictEqual(rows.length, 2);
  assert.strictEqual(flat(rows[0]).find(x => x.attrs && x.attrs.class === 'hw__w').kids[0], 'gloom');
  assert.ok(rows.every(r => flat(r).some(x => x.attrs && /hw__meter/.test(x.attrs.class || ''))), 'every row has a meter');
  assert.ok(/Difficulty \d+ out of 100/.test(texts(rows[0])));
  assert.ok(/Last reviewed: Yesterday/.test(texts(rows[0])) && /Last reviewed: /.test(texts(rows[1])));
  assert.strictEqual(s.els['#hw-go'].hidden, false); assert.ok(/2 words need another look/.test(s.els['#hw-help'].textContent) || /2 words that need another look/.test(s.els['#hw-help'].textContent));
});
t('sheet: no hard words -> a kind empty line, no Practise button', () => {
  const s = screen({}, [word('calm', { ease: 2.5 }, 1)]); s.HW.open();
  assert.strictEqual(s.els['#hw-list'].kids.length, 0); assert.strictEqual(s.els['#hw-go'].hidden, true); assert.ok(/No hard words right now/.test(s.els['#hw-help'].textContent));
});
t('Calm mode: no meter, no score or "difficulty" text, no counts; the words, the dates and the Practise button stay', () => {
  const s = screen({ calm: true }, HARDS()); s.HW.open();
  const rows = s.els['#hw-list'].kids; assert.strictEqual(rows.length, 2);
  rows.forEach(r => { assert.ok(!flat(r).some(x => x.attrs && /hw__meter|hw__fill/.test(x.attrs.class || ''))); assert.ok(!/Difficulty|out of 100/.test(texts(r))); assert.ok(/Last reviewed:/.test(texts(r))); });
  assert.ok(!/\d/.test(s.els['#hw-help'].textContent), 'no count in the help line: "' + s.els['#hw-help'].textContent + '"');
  assert.strictEqual(s.els['#hw-go'].hidden, false);
});
t('badge: a "hard" badge at 50 and above; none under 50; none in Calm mode; a broken entry gives none', () => {
  const s = screen({}, []), c = screen({ calm: true }, []);
  const b = s.HW.badge(word('b', { ease: 2.1, lap: 2, reps: 0 }, 0)); assert.ok(b && b.attrs.class === 'wc__hard' && b.kids[0] === 'hard');
  assert.strictEqual(s.HW.badge(word('a', { ease: 2.3, lap: 1, reps: 0 }, 0)), null);
  assert.strictEqual(c.HW.badge(word('b', { ease: 2.1, lap: 2, reps: 0 }, 0)), null);
  assert.strictEqual(s.HW.badge(null), null); assert.strictEqual(s.HW.badge({ w: 'x' }), null);
});
t('Practise hard words: starts the review lesson with exactly the listed words (hardest first), as many questions as words', () => {
  const s = screen({}, HARDS()); s.HW.open(); s.els['#hw-go'].listeners.click();
  assert.strictEqual(s.calls.start.length, 1); const o = s.calls.start[0];
  assert.deepStrictEqual(J(o.words), ['gloom', 'dread']); assert.strictEqual(o.max, 2); assert.strictEqual(typeof o.after, 'function');
  assert.deepStrictEqual(J(s.calls.toast), []);
});
t('Practise hard words works the same in Calm mode', () => {
  const s = screen({ calm: true }, HARDS()); s.HW.open(); s.els['#hw-go'].listeners.click();
  assert.deepStrictEqual(J(s.calls.start[0].words), ['gloom', 'dread']);
});
t('Practise hard words: when no question can be made the person is told, nothing breaks', () => {
  const s = screen({}, HARDS(), false); s.HW.open(); s.els['#hw-go'].listeners.click();
  assert.strictEqual(s.calls.toast.length, 1); assert.ok(/saved sentence or a note/.test(s.calls.toast[0]));
});
t('the lesson\'s after() hook redraws an open sheet and does nothing when the sheet is closed', () => {
  const s = screen({}, HARDS()); s.HW.open(); s.els['#hw-go'].listeners.click(); const after = s.calls.start[0].after;
  s.els['#hw-list'].kids.length = 0; after(); assert.strictEqual(s.els['#hw-list'].kids.length, 2);
  s.els['#sheet-hw'].hidden = true; s.els['#hw-list'].kids.length = 0; after(); assert.strictEqual(s.els['#hw-list'].kids.length, 0);
});
t('HW.any: true with at least one listed word, false with none (the My words button)', () => {
  const s = screen({}, []); assert.strictEqual(s.HW.any(HARDS()), true); assert.strictEqual(s.HW.any([word('c', { ease: 2.5 }, 1)]), false); assert.strictEqual(s.HW.any(null), false);
});
t('word cards: the badge hook in 165 never lets a missing or broken HW break a card (HW is not defined in that test context)', () => {
  assert.strictEqual(typeof T.WC.card, 'function');
  const src = read('165-word-cards.js'); assert.ok(/const hardBadge = e => \{ try \{ return HW\.badge\(e\); \} catch/.test(src));
});

(async () => {
  for (const [name, fn] of queue) {
    try { await fn(); pass++; console.log('ok    ' + name); } catch (e) { fail++; console.log('FAIL  ' + name + '\n        ' + String(e && e.message).split('\n').slice(0, 6).join('\n        ')); }
  }
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
