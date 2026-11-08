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
  const open = read('133-open-progress-saved-state.js'), net = read('070-network-data.js'), book = read('140-open-book.js');
  /* 1. Core: a self-contained factory (it also runs inside a web worker), so the whole file loads as is. */
  const cctx = vm.createContext({});
  vm.runInContext(read('010-core.js') + '\nthis.Core = Core;', cctx);
  Core = cctx.Core;
  /* 2. Pure helpers pulled out one by one. */
  const ctx = vm.createContext({ Core, setTimeout, clearTimeout, AbortController, TextDecoder, Error });
  vm.runInContext([
    grab(tap, 'TAP_DELAY'), grab(sync, 'resyncTime'), grab(align, 'toks'), grab(align, 'alignTokens'),
    grab(open, 'takeJsonLines'),
    'const bundles = new Map(), bundleText = new Map(), saved = {}; let PROXY = "https://p.test", FETCH;',
    'const idb = { set: async (k, v) => { saved[k] = v; } };',
    'const fetch = (...a) => FETCH(...a);',
    grab(open, 'fetchBundle'),
    'const decode = x => String(x || "");',                                   // the app's decode() needs a page; same result for plain text
    grab(net, 'normBook'),
    'let GUT = async () => []; const gutendex = q => GUT(q), Core = this.Core;',
    grab(net, 'findGutenbergFor'),
    'let FT = async () => null; const fetchText = (n, sig) => FT(n, sig);',   // stands in for the data-file loader (Hugging Face, then GitHub)
    grab(book, 'srcLinkMem'), grab(book, 'httpsLink'), grab(book, 'textSourceLink'),
    grab(book, 'archiveIdOf'), grab(book, 'archiveCheck'),
    'this.T = { findGutenbergFor, setGut: f => { GUT = f; }, toks, alignTokens, resyncTime, TAP_DELAY, takeJsonLines, normBook, fetchBundle, saved, bundleText, setFetch: f => { FETCH = f; }, textSourceLink, setFT: f => { FT = f; }, archiveIdOf, archiveCheck };'
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
const { findGutenbergFor, setGut, toks, alignTokens, resyncTime, TAP_DELAY, takeJsonLines, normBook, fetchBundle, saved, bundleText, setFetch, textSourceLink, setFT, archiveIdOf, archiveCheck } = T;

let failed = 0, total = 0;
const test = (name, fn) => { total++; try { fn(); console.log('ok    ' + name); } catch (e) { failed++; console.log('FAIL  ' + name + '\n      ' + String(e.message).split('\n').slice(0, 4).join('\n      ')); } };
const arr = x => Array.from(x);
const near = (a, b, m) => assert.ok(Math.abs(a - b) < 1e-6, (m || '') + ' expected ' + b + ', got ' + a);

/* ---------- finding the Project Gutenberg text for a LibriVox recording ---------- */
test('gutTitle: drops trailing LibriVox labels, keeps real titles', () => {
  assert.strictEqual(Core.gutTitle('Robin Hood (Dramatic Reading)'), 'Robin Hood');
  assert.strictEqual(Core.gutTitle('Emma (version 2)'), 'Emma');
  assert.strictEqual(Core.gutTitle('Dracula [abridged] (Dramatic Reading)'), 'Dracula');
  assert.strictEqual(Core.gutTitle('Alice in Wonderland'), 'Alice in Wonderland');
  assert.strictEqual(Core.gutTitle('Abraham Lincoln (Volume 1)'), 'Abraham Lincoln (Volume 1)', 'a volume number is part of the real title');
  assert.strictEqual(Core.gutTitle('Faust (Part 2) (version 3)'), 'Faust (Part 2)');
  assert.strictEqual(Core.gutTitle('(Untitled)'), '(Untitled)', 'never returns an empty title');
  assert.strictEqual(Core.gutTitle(''), '');
});
test('gutQueries: cleaned title first, title-only needs an author match, no repeats', () => {
  assert.deepStrictEqual(plain(Core.gutQueries('Robin Hood (Dramatic Reading)', 'MacDonell')), [
    { q: 'Robin Hood MacDonell', needAuthor: false }, { q: 'Robin Hood', needAuthor: true },
    { q: 'Robin Hood (Dramatic Reading) MacDonell', needAuthor: false }, { q: 'Robin Hood (Dramatic Reading)', needAuthor: true }]);
  assert.deepStrictEqual(plain(Core.gutQueries('Emma', 'Austen')), [{ q: 'Emma Austen', needAuthor: false }, { q: 'Emma', needAuthor: true }]);
  assert.deepStrictEqual(plain(Core.gutQueries('Emma', '')), [{ q: 'Emma', needAuthor: false }]);
});
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

/* ---------- book loading: one bad piece must not stop the rest ---------- */
test('takeJsonLines: complete lines are returned, the unfinished part waits for the next chunk', () => {
  const a = takeJsonLines('{"a":1}\n{"b":2}\n{"c"');
  assert.deepStrictEqual(plain(a.out), [{ a: 1 }, { b: 2 }]); assert.strictEqual(a.buf, '{"c"');
  const b = takeJsonLines(a.buf + ':3}\n');
  assert.deepStrictEqual(plain(b.out), [{ c: 3 }]); assert.strictEqual(b.buf, '');
});
test('takeJsonLines: a broken line is skipped and the lines after it still arrive', () => {
  const r = takeJsonLines('{"lv":{"id":1}}\n{this is not json\n{"gut":{"id":5}}\n{"text":"hello"}\n');
  assert.deepStrictEqual(plain(r.out).map(o => Object.keys(o)[0]), ['lv', 'gut', 'text']);
});
test('takeJsonLines: lines that are valid JSON but not objects (null, numbers, text) are skipped', () => {
  assert.deepStrictEqual(plain(takeJsonLines('null\n42\n"hi"\ntrue\n{"ok":1}\n').out), [{ ok: 1 }]);
});
test('takeJsonLines: blank lines and Windows line ends are fine', () => {
  assert.deepStrictEqual(plain(takeJsonLines('\n\r\n{"a":1}\r\n   \n').out), [{ a: 1 }]);
});
test('takeJsonLines: a stream cut into odd pieces gives the same lines as one piece', () => {
  const whole = '{"lv":{"id":7}}\nBROKEN\n{"gut":{"id":9}}\n{"text":"' + 'x'.repeat(50) + '"}\n';
  let buf = '', got = [];
  for (let i = 0; i < whole.length; i += 7) { const t = takeJsonLines(buf + whole.slice(i, i + 7)); buf = t.buf; got = got.concat(plain(t.out)); }
  assert.deepStrictEqual(got, plain(takeJsonLines(whole).out)); assert.strictEqual(got.length, 3);
});
const LV = { id: 12, title: 'Tale &amp; Co', authors: [{ first_name: 'Jane', last_name: 'Austen' }], totaltimesecs: '600',
  sections: [{ id: 2, section_number: '2', title: 'Two', listen_url: 'http://x/2.mp3', playtime: '300', readers: [{ display_name: 'Ann' }] },
             { id: 1, section_number: '1', title: 'One', listen_url: 'http://x/1.mp3', playtime: '300', readers: [{ display_name: 'Ann' }] }] };
test('normBook: a normal book comes out sorted by track number with https links', () => {
  const b = plain(normBook(LV));
  assert.deepStrictEqual(b.secs.map(x => x.id), [1, 2]);
  assert.ok(b.secs.every(x => x.url.startsWith('https://')));
  assert.strictEqual(b.authors, 'Jane Austen'); assert.strictEqual(b.n, 2);
});
test('normBook: an empty entry in the track list or author list is left out, the rest is kept', () => {
  const bad = Object.assign({}, LV, { sections: [null, LV.sections[0], 'oops', LV.sections[1]], authors: [null, LV.authors[0]] });
  const b = plain(normBook(bad));
  assert.deepStrictEqual(b.secs.map(x => x.id), [1, 2]); assert.strictEqual(b.authors, 'Jane Austen');
});
test('normBook: tracks or authors that are not lists, or a missing book, do not throw', () => {
  assert.doesNotThrow(() => normBook(Object.assign({}, LV, { sections: 'none', authors: 5 })));
  assert.deepStrictEqual(plain(normBook(Object.assign({}, LV, { sections: {} }))).secs, []);
  assert.doesNotThrow(() => normBook(null));
});
test('normBook: tracks without a link are dropped', () => {
  const b = plain(normBook(Object.assign({}, LV, { sections: [{ id: 9, section_number: '9', title: 'A' }, LV.sections[1]] })));
  assert.deepStrictEqual(b.secs.map(x => x.id), [1]);
});

/* The real fetchBundle, fed a pretend /book stream (pieces cut at awkward places). */
const streamOf = (text, piece) => () => Promise.resolve({ ok: true, body: new ReadableStream({ start(c) { const e = new TextEncoder(); for (let i = 0; i < text.length; i += piece) c.enqueue(e.encode(text.slice(i, i + piece))); c.close(); } }) });
const TEXT = 'Once upon a time. '.repeat(400);
const lines = (...l) => l.join('\n') + '\n';
const asyncTest = (name, fn) => { total++; return fn().then(() => console.log('ok    ' + name), e => { failed++; console.log('FAIL  ' + name + '\n      ' + String(e.message).split('\n').slice(0, 3).join('\n      ')); }); };
const settle = p => Promise.race([p.then(v => ({ v }), e => ({ e })), new Promise(r => setTimeout(() => r({ hung: true }), 2000))]);
const queue = [];
queue.push(() => asyncTest('fetchBundle: a broken line in the middle of the stream does not stop the tracks or the text', async () => {
  for (const key of Object.keys(saved)) delete saved[key];
  setFetch(streamOf(lines(JSON.stringify({ lv: LV }), '{oops not json', 'null', JSON.stringify({ gut: { id: 77, label: 'PG 77' } }), JSON.stringify({ text: TEXT })), 13));
  const r = await settle(fetchBundle('12', { text: true }));
  assert.ok(r.v, 'book should load: ' + JSON.stringify(r)); assert.strictEqual(plain(r.v).secs.length, 2);
  await new Promise(r => setTimeout(r, 50));
  assert.strictEqual(saved['g:77'], TEXT, 'the text after the bad lines must still be saved');
}));
queue.push(() => asyncTest('fetchBundle: a broken line BEFORE the track list does not fail the whole request', async () => {
  setFetch(streamOf(lines('}{ garbage', JSON.stringify({ lv: LV })), 9));
  const r = await settle(fetchBundle('12', { text: false }));
  assert.ok(r.v && plain(r.v).secs.length === 2, 'tracks should still load: ' + JSON.stringify(r));
}));
queue.push(() => asyncTest('fetchBundle: a stream with no usable track list ends with "empty" and does not hang', async () => {
  setFetch(streamOf(lines('nonsense', 'null', JSON.stringify({ gut: null })), 9));
  const r = await settle(fetchBundle('12', { text: false }));
  assert.ok(!r.hung, 'must not hang'); assert.ok(r.e && r.e.message === 'empty', JSON.stringify(r));
}));
queue.push(() => asyncTest('fetchBundle: a book whose track list is broken everywhere is reported empty, not a crash', async () => {
  setFetch(streamOf(lines(JSON.stringify({ lv: { id: 3, sections: [null, 'x'] } })), 9));
  const r = await settle(fetchBundle('3', { text: false }));
  assert.ok(r.e && r.e.message === 'empty', JSON.stringify(r));
}));

/* ---------- finding the Project Gutenberg text (async) ---------- */
/* a stand-in for Gutendex: every search word must appear in the title or author, like the real one */
const GUTBOOKS = [
  { id: 1, title: 'Robin Hood', author: 'MacDonell, Amice', langs: ['en'] },
  { id: 2, title: 'Robin Hood', author: 'Pyle, Howard', langs: ['en'] },
  { id: 3, title: 'Emma', author: 'Austen, Jane', langs: ['en'] }];
const fakeGut = async q => { const w = q.toLowerCase().split(/\s+/); return GUTBOOKS.filter(b => w.every(x => (b.title + ' ' + b.author).toLowerCase().includes(x))); };
queue.push(() => asyncTest('findGutenbergFor: "Robin Hood (Dramatic Reading)" finds the MacDonell text', async () => {
  setGut(fakeGut);
  const g = await findGutenbergFor({ id: 'x', title: 'Robin Hood (Dramatic Reading)', authorLast: 'MacDonell', textUrl: '' });
  assert.strictEqual(g.id, '1');
}));
queue.push(() => asyncTest('findGutenbergFor: a title-only retry never picks another author\'s book', async () => {
  setGut(fakeGut);
  const r = await settle(findGutenbergFor({ id: 'x', title: 'Robin Hood (Dramatic Reading)', authorLast: 'Nobody', textUrl: '' }));
  assert.ok(r.e && r.e.message === 'No matching text', JSON.stringify(r));
  assert.strictEqual(r.e.noGutenberg, true, 'a book that is not on Gutenberg is marked, so the card can say so instead of "couldn\'t load"');
}));
queue.push(() => asyncTest('findGutenbergFor: a number from the catalog is used at once, no search', async () => {
  let searched = 0; setGut(async () => { searched++; return []; });
  const g = await findGutenbergFor({ id: 'x', title: 'Robin Hood (Dramatic Reading)', authorLast: 'MacDonell', gid: '2', textUrl: '' });
  assert.strictEqual(g.id, '2'); assert.strictEqual(searched, 0, 'must not search');
}));
queue.push(() => asyncTest('findGutenbergFor: a timed-out search says so in plain words', async () => {
  setGut(async () => { const e = new Error('signal is aborted without reason'); e.name = 'AbortError'; throw e; });
  const r = await settle(findGutenbergFor({ id: 'x', title: 'Emma', authorLast: 'Austen', textUrl: '' }));
  assert.ok(r.e && r.e.message === 'The Gutenberg search timed out', JSON.stringify(r));
  assert.ok(!r.e.noGutenberg, 'a timeout is a real error (Retry), not "not on Gutenberg"');
}));
queue.push(() => asyncTest('findGutenbergFor: a network error from the search is passed on, not hidden', async () => {
  setGut(async () => { throw new Error('Failed to fetch'); });
  const r = await settle(findGutenbergFor({ id: 'x', title: 'Emma (version 2)', authorLast: 'Austen', textUrl: '' }));
  assert.ok(r.e && r.e.message === 'Failed to fetch', JSON.stringify(r));
  assert.ok(!r.e.noGutenberg, 'a network error is a real error (Retry), not "not on Gutenberg"');
}));

/* Step 3: the checks an archive.org text must pass before it is used */
const PROSE = 'The old man said that he was in the house with his friend and she had not been to the town. ';   // 21 words, English-looking
const prose = words => PROSE.repeat(Math.ceil(words / 21));
const hourBook = (extra) => Object.assign({ title: 'Emma', authorLast: 'Austen', lang: 'English', total: 3600 }, extra);   // 1 h = about 9000 words
test('archiveIdOf: details, stream and download links give the item id; anything else gives nothing', () => {
  assert.strictEqual(archiveIdOf('https://archive.org/details/historicalplaysf00macd'), 'historicalplaysf00macd');
  assert.strictEqual(archiveIdOf('http://www.archive.org/stream/autobiographyofc01spur/autobiographyofc01spur_djvu.txt'), 'autobiographyofc01spur');
  assert.strictEqual(archiveIdOf('https://archive.org/download/TheBlackCatV02no06189703/x.pdf'), 'TheBlackCatV02no06189703');
  assert.strictEqual(archiveIdOf('https://www.hathitrust.org/details/abc'), ''); assert.strictEqual(archiveIdOf(''), '');
});
test('archiveCheck: a readable text with the title at the start and about the right length passes', () => {
  assert.strictEqual(archiveCheck('EMMA\nby Jane Austen\n\n' + prose(9000), hourBook()).ok, true);
});
test('archiveCheck: the author alone near the start is enough (title or author)', () => {
  assert.strictEqual(archiveCheck('JANE AUSTEN. A tale.\n' + prose(9000), hourBook({ title: 'A Different Name Entirely' })).ok, true);
});
test('archiveCheck: a web page, a tiny text and scan rubbish are refused with a reason', () => {
  const h = archiveCheck('<!DOCTYPE html><html>' + prose(9000), hourBook()); assert.ok(!h.ok && /web page/.test(h.why));
  const sh = archiveCheck('EMMA Jane Austen ' + prose(200), hourBook()); assert.ok(!sh.ok && /too short/.test(sh.why));
  const junk = archiveCheck('EMMA Austen ' + 'xq~~ zzrk |l| #$%^ ,;;. qwrtp '.repeat(1500), hourBook()); assert.ok(!junk.ok && /unreadable/.test(junk.why), JSON.stringify(junk));
});
test('archiveCheck: a text whose start names neither the title nor the author is refused', () => {
  const r = archiveCheck('CHAPTER ONE. Nothing here. ' + prose(9000), hourBook()); assert.ok(!r.ok && /different book/.test(r.why), JSON.stringify(r));
});
test('archiveCheck: another issue of a magazine is refused, the right one passes', () => {
  const book = hourBook({ title: 'The Black Cat Vol. 02 No. 12 September 1897', authorLast: '' });
  const other = archiveCheck('THE BLACK CAT. Vol. II. No. 6. MARCH, 1897.\n' + prose(9000), book); assert.ok(!other.ok && /different issue/.test(other.why), JSON.stringify(other));
  assert.strictEqual(archiveCheck('THE BLACK CAT. Vol. II. No. 12. SEPTEMBER, 1897.\n' + prose(9000), book).ok, true);
});
test('archiveCheck: a book of several plays (far longer than the recording) is refused; a much shorter text too', () => {
  const big = archiveCheck('HISTORICAL PLAYS. Emma by Austen\n' + prose(60000), hourBook()); assert.ok(!big.ok && /holds other books or plays/.test(big.why), JSON.stringify(big));
  const small = archiveCheck('EMMA Austen\n' + prose(3600), hourBook({ total: 7200 })); assert.ok(!small.ok && /much shorter/.test(small.why), JSON.stringify(small));
});
test('archiveCheck: when the recording length is not known, length is not judged', () => {
  assert.strictEqual(archiveCheck('EMMA Austen\n' + prose(60000), hourBook({ total: 0 })).ok, true);
});

/* Step 1: the text-source link shown on the "not on Gutenberg" card */
queue.push(() => asyncTest('textSourceLink: the link the opened book already carries is used, nothing is fetched', async () => {
  let asked = 0; setFT(async () => { asked++; return null; });
  assert.strictEqual(await textSourceLink({ id: '9903', textUrl: 'http://archive.org/details/historicalplaysf00macd' }), 'https://archive.org/details/historicalplaysf00macd');
  assert.strictEqual(asked, 0);
}));
queue.push(() => asyncTest('textSourceLink: with no link on the book, the details file for id div 1000 is read (key s)', async () => {
  let name = ''; setFT(async n => { name = n; return { json: async () => ({ '9903': { s: 'https://archive.org/details/historicalplaysf00macd' }, '9904': { s: 'https://example.org/x' } }) }; });
  assert.strictEqual(await textSourceLink({ id: '9903', textUrl: '' }), 'https://archive.org/details/historicalplaysf00macd');
  assert.strictEqual(name, 'details/9.json');
}));
queue.push(() => asyncTest('textSourceLink: a missing file, a missing book or a bad link gives no button, never an error', async () => {
  setFT(async () => null); assert.strictEqual(await textSourceLink({ id: '1001', textUrl: '' }), '');
  setFT(async () => ({ json: async () => ({ '1002': { s: 'javascript:alert(1)' } }) })); assert.strictEqual(await textSourceLink({ id: '1002', textUrl: '' }), '');
  setFT(async () => ({ json: async () => ({ '1003': {} }) })); assert.strictEqual(await textSourceLink({ id: '1003', textUrl: '' }), '');
  setFT(async () => { throw new Error('Failed to fetch'); }); assert.strictEqual(await textSourceLink({ id: '1004', textUrl: '' }), '');
  setFT(async () => ({ json: async () => { throw new Error('bad json'); } })); assert.strictEqual(await textSourceLink({ id: '1005', textUrl: '' }), '');
}));
queue.push(() => asyncTest('textSourceLink: a slow details file is given up after a few seconds (the card must not wait for ever)', async () => {
  setFT((n, sig) => new Promise((res, rej) => { sig.addEventListener('abort', () => rej(new Error('aborted'))); }));
  const t0 = Date.now(), r = await Promise.race([textSourceLink({ id: '2001', textUrl: '' }), new Promise(r => setTimeout(() => r('HUNG'), 6000))]);
  assert.strictEqual(r, ''); assert.ok(Date.now() - t0 < 5500, 'took ' + (Date.now() - t0) + ' ms');
}));

/* Step 2: text made from the speech-recognition timing file (140-open-book.js: asrTrackText, asrTrackFor, asrBuild) */
{
  const zlib = require('zlib');
  const bookSrc = read('140-open-book.js'), alignSrc = read('180-sync-alignment.js');
  const a0 = bookSrc.indexOf('const ASR_LABEL'), a1 = bookSrc.indexOf('/* The intro/outro cut of a track, from the notice engine');
  const actx = vm.createContext({ Core });
  vm.runInContext([
    bookSrc.slice(a0, a1),
    grab(alignSrc, 'toks'), grab(alignSrc, 'alignTokens'), grab(alignSrc, 'bookIndex'), grab(alignSrc, 'alignTrackToBook'),
    'const S = { model: null };',
    'this.A = { asrTrackText, asrTrackFor, asrBuild, alignTrackToBook, S, toks };'
  ].join('\n'), actx);
  const A = actx.A;
  /* words said at 0.4 s apart, with extra silence (seconds) after the words listed in gaps (index -> seconds) */
  const say = (text, gaps = {}, t0 = 10) => { const w = text.split(' '), t = []; let x = t0; w.forEach((_, i) => { t.push(+x.toFixed(2)); x += 0.4 + (gaps[i] || 0); }); return { w, t }; };
  test('asr text: a pause adds a full stop and a capital; a long pause starts a new paragraph', () => {
    const s = say('the king rode out at dawn with his men and they came to the forest where the outlaws lived in peace', { 5: 1.2, 12: 2.6 });
    const r = A.asrTrackText(s.w, s.t, 0, null);
    assert.strictEqual(r.text, 'The king rode out at dawn. With his men and they came to.\n\nThe forest where the outlaws lived in peace.');
  });
  test('asr text: a spoken "Chapter eight." on its own line is joined to the next paragraph, not made a chapter', () => {
    const s = say('chapter eight the sheriff rode out into the forest at dawn with all his men behind him', { 1: 2.5 });
    const r = A.asrTrackText(s.w, s.t, 0, null);
    assert.ok(!/\n\n/.test(r.text) && /^Chapter eight\. The sheriff/.test(r.text), r.text);
  });
  test('asr text: no pause means no invented full stop, and the last word always ends the text', () => {
    const s = say('a quiet little story about nothing much at all really nothing');
    const r = A.asrTrackText(s.w, s.t, 0, null);
    assert.strictEqual(r.text, 'A quiet little story about nothing much at all really nothing.');
  });
  test('asr text: "\'S" joins the word before it; LibriVox is spelled one way; marks are kept as they are', () => {
    const r = A.asrTrackText(['SHERIFF', "'S", 'men', 'Libra', 'Vox'.toLowerCase(), 'said', 'hello,', 'friend.'], [1, 1.4, 1.8, 2.2, 2.6, 3, 3.4, 3.8], 0, null);
    assert.ok(/^SHERIFF'S men/.test(r.text), r.text);
    const r2 = A.asrTrackText(['a', 'Librivox', 'recording', 'of', 'the', 'LibriVoxx', 'thing.'], [1, 1.4, 1.8, 2.2, 2.6, 3, 3.4], 0, null);
    assert.ok(/A LibriVox recording of the LibriVox thing\.$/.test(r2.text), r2.text);
  });
  test('asr text: words before the intro end and after the outro start are left out', () => {
    const s = say('this is a librivox recording now the real story begins here and goes on a while end of chapter one', {}, 0);
    const r = A.asrTrackText(s.w, s.t, 0.4 * 5, 0.4 * 16 - 0.1);
    assert.strictEqual(r.text, 'Now the real story begins here and goes on a while.');
  });
  test('asr text: a run of words with no pause is still cut into sentences (not one endless line)', () => {
    const w = [], t = []; for (let i = 0; i < 160; i++) { w.push('word' + (i % 7 ? 'x' : 'y')); t.push(i * 0.4 + (i % 9 === 0 ? 0.3 : 0)); }
    const r = A.asrTrackText(w, t, 0, null);
    const longest = Math.max(...r.text.split(/[.!?]\s/).map(x => x.split(/\s+/).length));
    assert.ok(longest <= 90, 'longest sentence ' + longest);
    const t2 = w.map((_, i) => i * 0.395), r2 = A.asrTrackText(w, t2, 0, null);   // no pause anywhere at all
    assert.ok(Math.max(...r2.text.split(/[.!?]\s/).map(x => x.split(/\s+/).length)) <= 115, 'no pauses: still cut');
  });
  const mk = (url, nWords, dur) => { const s = say(Array.from({ length: nWords }, (_, i) => 'word' + (i % 11) + 'q').join(' '), {}, 5); return { u: url, w: s.w.join(' '), t: s.t }; };
  test('asr file: only the same audio file is accepted; times past the recording length are refused', () => {
    const sec = { url: 'https://archive.org/download/x/book_01_64kb.mp3', dur: 400 };
    assert.ok(A.asrTrackFor(sec, 0, { 0: mk('https://www.archive.org/download/x/BOOK_01_64kb.mp3', 300) }), 'same file name, other host spelling');
    assert.strictEqual(A.asrTrackFor(sec, 0, { 0: mk('https://archive.org/download/x/book_02_64kb.mp3', 300) }), null, 'another file');
    assert.strictEqual(A.asrTrackFor({ url: sec.url, dur: 60 }, 0, { 0: mk(sec.url, 300) }), null, 'times far past the recording');
    assert.strictEqual(A.asrTrackFor(sec, 0, { 0: mk(sec.url, 10) }), null, 'too few words');
  });
  test('asr build: one "Track N" heading per track with words, tracks without a file are skipped, too little text gives nothing', () => {
    const secs = [1, 2, 3].map(n => ({ url: 'https://a.org/t' + n + '.mp3', dur: 400 }));
    const tracks = { 0: mk(secs[0].url, 200), 2: mk(secs[2].url, 200) };
    const r = A.asrBuild(secs, tracks, null);
    assert.deepStrictEqual(arr(r.idx), [0, 2]);
    const m = Core.parseBook(r.raw), real = m.chapters.filter(c => !c.front);
    assert.deepStrictEqual(arr(real.map(c => c.title)), ['Track 1', 'Track 3']);
    assert.strictEqual(A.asrBuild(secs, { 0: mk(secs[0].url, 40) }, null), null);
    assert.strictEqual(A.asrBuild(secs, {}, null), null);
  });
  test('asr build: the intro/outro cut is passed per track and a failing cut keeps all words', () => {
    const secs = [{ url: 'https://a.org/t1.mp3', dur: 400 }], tr = { 0: mk(secs[0].url, 400) };
    const all = A.asrBuild(secs, tr, null).words;
    assert.ok(A.asrBuild(secs, tr, () => [10, 160]).words < all);
    assert.strictEqual(A.asrBuild(secs, tr, () => { throw new Error('x'); }).words, all);
  });
  test('asr build on a real timing file (Robin Hood, 22 tracks): the text lines up with every track again', () => {
    const d = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(root, 'tools/samples/timing-104.json.gz'))));
    const secs = Object.keys(d.tracks).map(k => ({ url: d.tracks[k].u, dur: Math.ceil(d.tracks[k].t[d.tracks[k].t.length - 1]) + 8 }));
    const r = A.asrBuild(secs, d.tracks, null);
    assert.strictEqual(r.idx.length, 22);
    const m = Core.parseBook(r.raw);
    assert.strictEqual(m.chapters.filter(c => !c.front).length, 22);   // a spoken "Chapter eight" on its own line does not become a part of its own
    A.S.model = m;
    let low = 0;
    secs.forEach((sec, i) => { const x = A.alignTrackToBook(d.tracks[i]); if (!x || A.alignTrackToBook.fit < 0.9) low++; });
    assert.strictEqual(low, 0, low + ' tracks fit below 90%');
  });
}



/* The player must show the book being opened, not the one open before (screenshot bug: new title on top, old cover/title below) */
{
  const bookSrc = read('140-open-book.js');
  const els = {}, mk = () => ({ textContent: '', hidden: false, children: [], _wtId: undefined, append(...a) { this.children.push(...a); }, firstChild: { textContent: 'OLD' }, lastChild: { textContent: 'OLD' }, value: 9, style: { setProperty() {} } });
  const q = {}; ['#ptitle', '#pcover', '#book-prog', '#nr-bp', '#trk-sum'].forEach(k => { q[k] = mk(); });
  q['#pcover']._wtId = 'old-book';
  const c = vm.createContext({ $: k => q[k] || null, h: () => ({}), coverBox: b => ({ cover: b.id }), el: { cur: mk(), left: mk(), seek: mk() }, nrEl: { title: mk() }, document: { title: '' } });
  vm.runInContext(grab(bookSrc, 'openingIdentity') + '\nthis.f = openingIdentity;', c);
  test('opening a book: the player shows the new book at once (title, author, cover, times), not the previous one', () => {
    c.f({ id: '777', title: 'Selected Articles on Child Labor', authors: 'Unknown author' });
    assert.strictEqual(q['#ptitle'].firstChild.textContent, 'Selected Articles on Child Labor');
    assert.strictEqual(q['#ptitle'].lastChild.textContent, '', 'an unknown author is not shown');
    assert.strictEqual(q['#pcover']._wtId, '777'); assert.strictEqual(q['#pcover'].children.length, 2);
    assert.strictEqual(c.el.cur.textContent, '0:00'); assert.strictEqual(c.el.seek.value, 0);
    assert.strictEqual(q['#book-prog'].hidden, true); assert.strictEqual(c.nrEl.title.textContent, 'Selected Articles on Child Labor');
    c.f({ id: '778', title: 'Mildred', authors: 'Martha Finley' });
    assert.strictEqual(q['#ptitle'].lastChild.textContent, 'Martha Finley'); assert.strictEqual(q['#pcover']._wtId, '778');
  });
  test('opening a book: a missing element never stops the opening', () => {
    const c2 = vm.createContext({ $: () => null, h: () => ({}), coverBox: () => ({}), el: {}, nrEl: {}, document: { title: '' } });
    vm.runInContext(grab(bookSrc, 'openingIdentity') + '\nthis.f = openingIdentity;', c2);
    c2.f({ id: '1', title: 'x' });
  });
}

(async () => {
  for (const q of queue) await q();
  console.log('\n' + (failed ? failed + ' of ' + total + ' failed' : 'all ' + total + ' passed'));
  process.exit(failed ? 1 : 0);
})();
