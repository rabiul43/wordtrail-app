#!/usr/bin/env node
/* Automatic checks for the small inner calculations (no browser, no npm install).
     node tools/unit_check.js
   Covers: the sentence/time plan (Core), word alignment, the sync tap + undo + resync rules.
   It pulls the REAL code out of src/js/ (same idea as music_mood_check.js), so it tests what ships.
   Exit code 1 if a check fails; 2 if a function it needs was renamed or moved.
   Add a check whenever you fix a bug in one of these. */
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, 'src/js', f), 'utf8');
const plain = x => JSON.parse(JSON.stringify(x));          // copies across the vm boundary so deepStrictEqual works

/* Cut `function name(...) { ... }` (or `const name = ...;`) out of a file by matching braces. */
function grab(src, name) {
  const m = new RegExp('(?:async\\s+)?function\\s+' + name + '\\s*\\(|const\\s+' + name + '\\s*=').exec(src);
  if (!m) throw new Error('not found: ' + name);
  if (src[m.index] === 'c') return src.slice(m.index, src.indexOf('\n', m.index));
  let i = src.indexOf('{', m.index), depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return src.slice(m.index, i + 1);
  }
  throw new Error('unbalanced: ' + name);
}

let Core, T, H;
try {
  const sync = read('170-sync-points-drift.js'), align = read('180-sync-alignment.js'), tap = read('060-position-bookmarks.js');
  /* 1. Core: a self-contained factory (it also runs inside a web worker), so the whole file loads as is. */
  const cctx = vm.createContext({});
  vm.runInContext(read('010-core.js') + '\nthis.Core = Core;', cctx);
  Core = cctx.Core;
  /* 2. Pure helpers pulled out one by one. */
  const ctx = vm.createContext({});
  vm.runInContext([
    grab(tap, 'TAP_DELAY'), grab(sync, 'resyncTime'), grab(align, 'toks'), grab(align, 'alignTokens'),
    'this.T = { toks, alignTokens, resyncTime, TAP_DELAY };'
  ].join('\n'), ctx);
  T = ctx.T;
  /* 3. The tap / undo rules, run against a small fake of the app state (S, P, audio, toast ...). */
  H = () => {
    const c = vm.createContext({});
    vm.runInContext([
      grab(tap, 'TAP_DELAY'), grab(sync, 'SYNC_REACH'), grab(sync, 'setAnchor'), grab(sync, 'undoAnchor'),
      'const calls = { replan: 0, persist: 0, toasts: [] };',
      'const S = { sec: 0, anchors: {}, autoSrc: {}, undo: null, curId: 0, sentSec: {}, sentPos: {}, plan: {} };',
      'const P = { nudge: 0 }; const audio = { currentTime: 50 };',
      'const replan = () => { calls.replan++; }, persist = () => { calls.persist++; }, toast = (m) => { calls.toasts.push(m); };',
      'this.api = { S, P, audio, calls, setAnchor, undoAnchor };'
    ].join('\n'), c);
    const a = c.api;
    /* one track of 40 sentences, 5 s of speech each, sentence k planned to start at 12 + 5k */
    const N = 40, ids = [], cost = [], starts = [];
    for (let k = 0; k < N; k++) { ids.push(k); cost.push(k * 5); starts.push(12 + k * 5); a.S.sentSec[k] = 0; a.S.sentPos[k] = k; }
    a.S.plan[0] = { ids, cost, starts };
    return a;
  };
} catch (e) { console.error('Cannot load the code under test: ' + e.message + '\nA function was probably renamed or moved; update tools/unit_check.js.'); process.exit(2); }
const { toks, alignTokens, resyncTime, TAP_DELAY } = T;

let failed = 0, total = 0;
const test = (name, fn) => { total++; try { fn(); console.log('ok    ' + name); } catch (e) { failed++; console.log('FAIL  ' + name + '\n      ' + String(e.message).split('\n').slice(0, 4).join('\n      ')); } };
const arr = x => Array.from(x);
const near = (a, b, m) => assert.ok(Math.abs(a - b) < 1e-6, (m || '') + ' expected ' + b + ', got ' + a);

/* ---------- words and alignment ---------- */
test('toks: lowercase, apostrophes dropped, punctuation ignored', () => {
  assert.deepStrictEqual(arr(toks("Don't stop, Mr. O\u2019Neil!")), ['dont', 'stop', 'mr', 'oneil']);
});
test('alignTokens: identical text maps word i to word i', () => {
  const w = arr(toks('the quick brown fox jumps over the lazy dog'));
  assert.deepStrictEqual(arr(alignTokens(w, w)), w.map((_, i) => i));
});
test('alignTokens: a passage the narrator skipped maps to -1, the rest stays in step', () => {
  const map = arr(alignTokens(toks('one two three four five six seven eight nine ten'), toks('one two three eight nine ten')));
  assert.deepStrictEqual(map.slice(0, 3), [0, 1, 2]);
  assert.deepStrictEqual(map.slice(3, 7), [-1, -1, -1, -1]);
  assert.deepStrictEqual(map.slice(7), [3, 4, 5]);
});
test('alignTokens: narrator intro words the book does not have are ignored', () => {
  assert.deepStrictEqual(arr(alignTokens(toks('it was a dark night'), toks('chapter one it was a dark night'))), [2, 3, 4, 5, 6]);
});
test('alignTokens: empty input gives an empty/unmatched map, no crash', () => {
  assert.deepStrictEqual(arr(alignTokens([], toks('a b'))), []);
  assert.deepStrictEqual(arr(alignTokens(toks('a b'), [])), [-1, -1]);
});
test('alignTokens: a misheard word does not break the words around it', () => {
  const map = arr(alignTokens(toks('she opened the door slowly and left'), toks('she opened the doe slowly and left')));
  assert.deepStrictEqual(map, [0, 1, 2, 3, 4, 5, 6]);
});
test('alignTokens: with anchor pairs, text after a long skipped table still lines up', () => {
  const filler = Array.from({ length: 400 }, (_, i) => 'zz' + i);
  const B = arr(toks('start of the tale')).concat(filler, arr(toks('and so it ended well')));
  const A = arr(toks('start of the tale and so it ended well'));
  const map = arr(alignTokens(B, A, [[0, 0], [B.length - 1, A.length - 1]]));
  assert.strictEqual(map[B.length - 1], A.length - 1);
  assert.strictEqual(map[B.length - 5], A.length - 5);
  assert.strictEqual(map[0], 0);
});

test('alignTokens: a long book with a 130-word passage not read keeps the rest in step (no anchors)', () => {
  const B = Array.from({ length: 600 }, (_, i) => 'w' + ((i * 7919) % 1000) + 'x' + i);
  const A = B.slice(0, 200).concat(B.slice(330));
  const map = arr(alignTokens(B, A));
  const wrong = [...Array(200).keys(), ...Array.from({ length: 270 }, (_, i) => 330 + i)].filter(i => map[i] !== (i < 200 ? i : i - 130));
  assert.strictEqual(wrong.length, 0, wrong.length + ' words out of step, first at ' + wrong[0]);
  assert.ok(map.slice(200, 330).every(x => x === -1), 'skipped passage should be unmatched');
});

/* ---------- Core: text, plan, time helpers ---------- */
test('Core.splitSentences: abbreviations like Mr. do not end a sentence', () => {
  const s = plain(Core.splitSentences('Mr. Smith went home. He slept soundly.'));
  assert.strictEqual(s.length, 2);
  assert.ok(s[0].startsWith('Mr. Smith'));
});
test('Core.spokenCost: longer text costs more speaking time, and never negative', () => {
  const a = Core.spokenCost('Hello.'), b = Core.spokenCost('Hello there, my dear friend, how are you doing on this fine morning?');
  assert.ok(a >= 0 && b > a, 'costs ' + a + ' vs ' + b);
});
test('Core.parseRange / parseNum: chapter labels', () => {
  assert.deepStrictEqual(plain(Core.parseRange('Chapter 4')), { a: 4, b: 4 });
  assert.deepStrictEqual(plain(Core.parseRange('Chapters 1-3')), { a: 1, b: 3 });
  assert.deepStrictEqual(plain(Core.parseRange('Chapters 4 to 6')), { a: 4, b: 6 });
  assert.strictEqual(Core.parseNum('Chapter IV'), 4);
  assert.strictEqual(Core.parseNum('Chapter 12'), 12);
  assert.strictEqual(Core.parseNum('Preface'), null);
});
test('Core.locate: finds the sentence playing at a time (edges included)', () => {
  const s = [0, 5, 10];
  assert.deepStrictEqual([-1, 0, 4.99, 5, 9.9, 10, 999].map(t => Core.locate(s, t)), [0, 0, 0, 1, 1, 2, 2]);
});
test('Core.formatTime: m:ss, h:mm:ss, and bad input shows 0:00', () => {
  assert.deepStrictEqual([65, 3661, 0, NaN, -5, Infinity].map(Core.formatTime), ['1:05', '1:01:01', '0:00', '0:00', '0:00', '0:00']);
});
test('Core.snapBoundary: picks the pause start nearest the moment, in range only', () => {
  const segs = [{ s: 1, e: 2 }, { s: 4, e: 5 }, { s: 8.2, e: 9 }, { s: 12, e: 13 }];
  assert.strictEqual(Core.snapBoundary(segs, 3, 10, 8.4), 8.2);
  assert.strictEqual(Core.snapBoundary(segs, 3, 10, 4.1), 4);
  assert.strictEqual(Core.snapBoundary(segs, 20, 30, 25), null);
});
test('Core.buildPlan: every sentence is placed once, in order, across tracks; times rise and stay inside the track', () => {
  const sents = Array.from({ length: 60 }, () => ({ cost: 4 }));
  const model = { sents, chapters: [{ start: 0, end: 60, front: false }] };
  const durs = [150, 120];
  const plan = plain(Core.buildPlan(model, durs, 'whole', null, null, 12, 5, null, null, null, null));
  const all = plan.flatMap(p => p.ids);
  assert.deepStrictEqual(all, Array.from({ length: 60 }, (_, i) => i), 'each sentence exactly once, in order');
  plan.forEach((p, i) => {
    assert.strictEqual(p.starts.length, p.ids.length);
    for (let k = 1; k < p.starts.length; k++) assert.ok(p.starts[k] >= p.starts[k - 1], 'track ' + i + ' times must not go backwards at ' + k);
    p.starts.forEach(t => assert.ok(t >= 0 && t <= durs[i], 'time ' + t + ' outside track ' + i));
  });
});
test('Core.buildPlan: a sync point pulls its sentence to the given time', () => {
  const sents = Array.from({ length: 30 }, () => ({ cost: 4 }));
  const model = { sents, chapters: [{ start: 0, end: 30, front: false }] };
  const free = plain(Core.buildPlan(model, [200], 'whole', null, null, 12, 5, null, null, null, null))[0];
  const k = 15, want = free.starts[k] + 20;
  const pinned = plain(Core.buildPlan(model, [200], 'whole', null, [[{ id: k, t: want }]], 12, 5, null, null, null, null))[0];
  near(pinned.starts[pinned.ids.indexOf(k)], want, 'pinned sentence');
});

/* ---------- resync (double-tap) ---------- */
test('resyncTime: double-tap inside the playing sentence confirms its start', () => {
  assert.deepStrictEqual({ ...resyncTime([0, 10, 20], 1, 15, 30) }, { t: 10, confirm: true, off: 0 });
});
test('resyncTime: tap after the sentence moves it to now - delay - half its length', () => {
  const r = resyncTime([0, 10, 20], 0, 25, 30);
  assert.strictEqual(r.confirm, false);
  near(r.t, 25 - TAP_DELAY - 5); near(r.off, r.t);
});
test('resyncTime: never returns a negative time', () => {
  assert.strictEqual(resyncTime([5, 15], 0, 0.2, 30).t, 0);
});
test('resyncTime: a very long sentence counts as at most 18 s, a tiny one as at least 1.5 s', () => {
  near(resyncTime([0, 100], 1, 150, 130).t, 150 - TAP_DELAY - 9);
  near(resyncTime([0, 0.2, 50], 0, 20, 60).t, 20 - TAP_DELAY - 0.75);
});

/* ---------- sync tap / undo (setAnchor, undoAnchor) ---------- */
const byId = (a, id) => plain(a.S.anchors[0]).find(x => x.id === id);
test('setAnchor: the tapped sentence gets the tap time and two soft edge points are added', () => {
  const a = H(); a.setAnchor(20, { at: 110 });
  const L = plain(a.S.anchors[0]);
  assert.deepStrictEqual(L.map(x => x.id), [11, 20, 29]);
  assert.strictEqual(byId(a, 20).t, 110); assert.strictEqual(byId(a, 20).s, undefined);
  assert.strictEqual(byId(a, 11).s, 1); assert.strictEqual(byId(a, 29).s, 1);
  assert.strictEqual(a.calls.persist, 1); assert.strictEqual(a.calls.replan, 1); assert.strictEqual(a.S.curId, -1);
  assert.strictEqual(a.calls.toasts.length, 1);
});
test('setAnchor: without an explicit time it uses now + nudge - tap delay', () => {
  const a = H(); a.audio.currentTime = 50; a.P.nudge = 0.3; a.setAnchor(20);
  near(byId(a, 20).t, 50 + 0.3 - TAP_DELAY);
});
test('setAnchor: a time before zero is clamped to 0', () => {
  const a = H(); a.setAnchor(2, { at: -5 });
  assert.strictEqual(byId(a, 2).t, 0);
});
test('setAnchor: a sentence from another track is ignored', () => {
  const a = H(); a.S.sentSec[20] = 3; a.setAnchor(20, { at: 110 });
  assert.strictEqual(a.S.anchors[0], undefined); assert.strictEqual(a.calls.persist, 0);
});
test('setAnchor: an earlier tap the reader made stays, and stops the soft edge point on its side', () => {
  const a = H(); a.setAnchor(20, { at: 110 }); a.setAnchor(22, { at: 125 });
  const first = byId(a, 20);
  assert.ok(first && first.t === 110 && first.s === undefined, 'the reader\'s first tap must be kept as it was');
  assert.strictEqual(byId(a, 22).t, 125);
  /* 11 = old soft edge point outside the stretch (kept); 20 = hard tap kept; 22 = new tap;
     29 = old soft point inside the stretch (replaced by the new one at 31); no new soft point between 11 and 20. */
  assert.deepStrictEqual(plain(a.S.anchors[0]).map(x => x.id), [11, 20, 22, 31]);
});
test('setAnchor: a tap that contradicts an earlier point drops it, so times never run backwards', () => {
  const a = H(); a.setAnchor(20, { at: 110 }); a.setAnchor(25, { at: 40 });
  const L = plain(a.S.anchors[0]);
  assert.ok(!L.some(x => x.id === 20), 'point at 110 must go once sentence 25 is pinned to 40');
  for (let i = 1; i < L.length; i++) assert.ok(L[i].t >= L[i - 1].t, 'times must not go backwards: ' + JSON.stringify(L));
});
test('setAnchor: anchors stay sorted by sentence after many taps', () => {
  const a = H(); [[30, 160], [5, 40], [18, 100], [12, 70]].forEach(([id, t]) => a.setAnchor(id, { at: t }));
  const ids = plain(a.S.anchors[0]).map(x => x.id);
  assert.deepStrictEqual(ids, ids.slice().sort((x, y) => x - y));
});
test('setAnchor: extras read from the audio are kept as audio-sourced soft points', () => {
  const a = H(); a.setAnchor(20, { at: 110, fromAudio: true, extras: [{ id: 19, t: 105 }, { id: 21, t: 115 }] });
  assert.strictEqual(byId(a, 20).a, 1); assert.strictEqual(byId(a, 20).s, 1);
  assert.deepStrictEqual([19, 21].map(i => byId(a, i).t), [105, 115]);
});
test('setAnchor quiet:true makes no toast; undo:true offers Undo', () => {
  const a = H(); a.setAnchor(20, { at: 110, quiet: true }); assert.strictEqual(a.calls.toasts.length, 0);
  a.setAnchor(21, { at: 116, undo: true, msg: 'x' }); assert.strictEqual(a.calls.toasts.length, 1);
});
test('undoAnchor: brings back exactly the points from before the tap', () => {
  const a = H(); a.setAnchor(20, { at: 110, quiet: true });
  const before = plain(a.S.anchors[0]);
  a.setAnchor(25, { at: 150, quiet: true });
  assert.notDeepStrictEqual(plain(a.S.anchors[0]), before);
  a.undoAnchor();
  assert.deepStrictEqual(plain(a.S.anchors[0]), before);
  assert.strictEqual(a.S.undo, null);
});
test('undoAnchor: does nothing when there is nothing to undo or the track has changed', () => {
  const a = H(); a.undoAnchor(); assert.strictEqual(a.calls.persist, 0);
  a.setAnchor(20, { at: 110, quiet: true }); a.S.sec = 1; a.undoAnchor();
  assert.ok(a.S.undo, 'undo kept for the track it belongs to');
});
test('setAnchor keepUndo: a snap right after a tap does not overwrite the undo of the tap', () => {
  const a = H(); a.setAnchor(20, { at: 110, quiet: true });
  const u = plain(a.S.undo);
  a.setAnchor(20, { at: 110.4, quiet: true, keepUndo: true });
  assert.deepStrictEqual(plain(a.S.undo), u);
});

console.log('\n' + (failed ? failed + ' of ' + total + ' failed' : 'all ' + total + ' passed'));
process.exit(failed ? 1 : 0);
