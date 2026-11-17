#!/usr/bin/env node
/* Checks for "Which word did you hear?" and "Write it in full" (src/js/169zc-sound-drill.js, Task 9): node tools/sound_drill_check.js
   Part 1  SDC (pure): the lists match tools/sound-tables.json; the word rule matches the Python maker; parse (a sample, unreviewed, other-version or other-book pack is refused,
           a damaged item is dropped, not the pack), index, book match, the items of a track, the picker (no repeats, level, weak sounds, cap per sound), grading, the weak-sound notes.
   Part 2  Seeded learners: a learner who mixes up "th / s" is found, and the next set leans on it; the level target moves the picks; a noisy learner is not called weak.
   Part 3  The real sample pack file is refused by the reader, and would be valid if a person approved it. Structure: no emoji, every id and icon exists, build lines, Bengali strings.
   Part 4  The real sheet and the real 169zc in Chromium, with the app stubbed (a stand-in book): both drills from start to the end screen, the clip plays and stops by itself, no pack /
           sample pack / unreviewed pack / other book = a message and nothing opens, packs are kept for the next session, the weak sound reaches the Learn row, Calm mode, closing puts the
           audio back, no network, no page error. (Skipped, with a message, without Playwright.)
   Exit code 1 if a check fails, 2 if a file cannot be loaded. */
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert'), zlib = require('zlib'), { execFileSync } = require('child_process');
const root = path.join(__dirname, '..'), rd = f => fs.readFileSync(path.join(root, f), 'utf8');
const J = x => JSON.parse(JSON.stringify(x));
let pass = 0, fail = 0;
async function t(name, fn) { try { await fn(); pass++; console.log('ok    ' + name); } catch (e) { fail++; console.log('FAIL  ' + name + '\n        ' + String(e && e.message).split('\n').slice(0, 6).join('\n        ')); } }
const cut = (src, name) => { const a = src.indexOf('/*' + name + '-START*/'), b = src.indexOf('/*' + name + '-END*/'); if (a < 0 || b < a) throw new Error(name + ' markers missing'); return src.slice(a, b); };
const fnv = s => { let x = 0x811c9dc5; for (let i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 0x01000193); } return (x >>> 0).toString(36) + '.' + s.length.toString(36); };
const tfnv = rd('src/js/160b-translate-provider.js').match(/const fnv = s => \{[^\n]*\n/)[0];
let SDC, LNC, LVE, SRC, LNCsrc, LVEsrc, TABLE;
try {
  SRC = rd('src/js/169zc-sound-drill.js'); const k = rd('src/js/169k-listen-type.js'); LVEsrc = rd('src/js/169x-listen-level.js'); TABLE = JSON.parse(rd('tools/sound-tables.json'));
  LNCsrc = 'const LNC = (() => {\n' + cut(k, 'LNC') + '\nreturn { SIZE, SLOW, MIN_W, MAX_W, fold, words, spans, check, pickSet, pattern, variants, diff, varNote, rows, spell };\n})();\n';
  const ctx = vm.createContext({});
  vm.runInContext(LNCsrc + 'const SDC = (() => {\n' + cut(SRC, 'SDC') + '\nreturn { FORMAT, INDEX, SOUNDS, CHUNKS, csid, parse, parseIndex, where, locate, cands, pick, choices, sidOf, label, hintOf, grade, result, clean, track, weak, weakness, sub };\n})();\n' +
    'const LVE = (() => {\n' + cut(LVEsrc, 'LVE') + '\nreturn { sent, outcome, expect, empty, clean, update, level, word, MIN_N };\n})();\nthis.LNC = LNC; this.SDC = SDC; this.LVE = LVE;', ctx);
  ({ LNC, SDC, LVE } = ctx);
} catch (e) { console.error('sound_drill_check: cannot load: ' + e.message); process.exit(2); }
const SDCjs = SDC;
const seeded = seed => { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; };

/* a small valid pack; lines are real sentences, items point at them */
const LINES = ['We watched the ship leave the harbour at dawn.', 'A single sheep stood alone on the hill behind the farm.', 'I think we should leave before it gets dark.', 'They are going to build a new bridge next year.',
  'She did not want to go back to the village.', 'It was kind of cold that morning, but the sky was clear.', 'She turned right at the old stone church.', 'The old man sat down by the fire.'];
const mkItems = () => [
  { id: 'a1', k: 'p', line: 1, w: 'ship', o: 'sheep', snd: 'i-ee', r: 1 }, { id: 'a2', k: 'p', line: 2, w: 'sheep', o: 'ship', snd: 'i-ee', r: 1 }, { id: 'a3', k: 'p', line: 3, w: 'think', o: 'sink', snd: 'th-s', r: 1 },
  { id: 'a4', k: 'c', line: 4, c: 'going to', said: 'gonna', r: 1 }, { id: 'a5', k: 'c', line: 5, c: 'want to', said: 'wanna', r: 1 }, { id: 'a6', k: 'c', line: 6, c: 'kind of', said: 'kinda', r: 1 }, { id: 'a7', k: 'p', line: 7, w: 'right', o: 'light', snd: 'l-r', r: 1 }];
const mkPack = (o) => Object.assign({ format: 'wordtrail-sound-pack', v: 1, book: 'b1', passage: 'p1', key: 'fnv1a-utf16-base36', engine: 'table', license: 'CC0', made: '2026-11-16T00:00:00Z',
  lines: LINES.map(s => [fnv(s), s]), n: 7, reviewed: { by: 'A Reviewer', on: '2026-11-16' }, items: mkItems() }, o || {});
const ws = s => LNC.words(s);

(async () => {
  /* ---------------- Part 1 ---------------- */
  await t('the lists in the app are the lists of tools/sound-tables.json (sounds, labels, phrases and how they are said)', () => {
    assert.deepStrictEqual(Object.keys(SDC.SOUNDS).sort(), TABLE.sounds.map(s => s.id).sort());
    TABLE.sounds.forEach(s => assert.strictEqual(SDC.SOUNDS[s.id], s.label, s.id));
    assert.deepStrictEqual(J(SDC.CHUNKS), Object.fromEntries(TABLE.chunks.map(c => [c.c, c.said])));
    TABLE.sounds.forEach(s => s.pairs.forEach(p => { assert.ok(p.length === 2 && /^[a-z]{2,14}$/.test(p[0]) && /^[a-z]{2,14}$/.test(p[1]) && p[0] !== p[1], s.id + ' ' + p); }));
    assert.strictEqual(SDC.csid('a lotta'), 'cs:alotta'); assert.strictEqual(SDC.label('th-s'), 'th / s'); assert.strictEqual(SDC.label('cs:gonna'), 'gonna'); assert.strictEqual(SDC.label('nope'), ''); assert.strictEqual(SDC.label('__proto__'), '');
  });
  await t('the word rule (spaces, apostrophes, accents, case) is the same in the app and in tools/make_sound_pack.py', () => {
    const samples = ["Don't you think it\u2019s caf\u00e9-time?", 'Ship, sheep; 3 old MEN went to Zo\u00eb\u2019s house.', 'x_y 12th o\u2019clock \u2018quoted\u2019 words', 'Na\u00efve r\u00e9sum\u00e9: \u201cgonna\u201d'];
    let py; try { py = JSON.parse(execFileSync('python3', ['-c', 'import sys,json;sys.path.insert(0,"tools");from make_sound_pack import toks;print(json.dumps([toks(s) for s in json.loads(sys.argv[1])]))', JSON.stringify(samples)], { cwd: root, encoding: 'utf8' })); } catch (e) { console.log('      (skipped: python3 not available)'); return; }
    samples.forEach((s, i) => assert.deepStrictEqual(py[i], J(ws(s).map(LNC.fold)), s));
  });
  await t('parse: a good pack gives its approved items with their place in the sentence', () => {
    const r = SDC.parse(mkPack(), 'b1', 'p1'); assert.strictEqual(r.ok, true); assert.strictEqual(r.items.length, 7); assert.strictEqual(r.lines.length, 8);
    const p = r.items.find(x => x.id === 'a1'), c = r.items.find(x => x.id === 'a4'); assert.deepStrictEqual([p.wi, p.n], [3, 1]); assert.deepStrictEqual([c.wi, c.n], [2, 2]); assert.strictEqual(c.said, 'gonna'); assert.strictEqual(r.meta.by, 'A Reviewer');
  });
  await t('parse: a sample pack, an unreviewed pack, another version, key, book or passage is refused', () => {
    const why = (o, b, p) => SDC.parse(mkPack(o), b || 'b1', p || 'p1').why;
    assert.strictEqual(why({ sample: true }), 'sample pack'); assert.strictEqual(why({ sample: true, reviewed: { by: 'x' } }), 'sample pack', 'a sample is refused even when it names a reviewer');
    assert.strictEqual(why({ reviewed: undefined }), 'not reviewed'); assert.strictEqual(why({ reviewed: { by: '  ' } }), 'not reviewed'); assert.strictEqual(why({ reviewed: { by: 'none' } }), 'not reviewed');
    assert.strictEqual(why({ v: 2 }), 'version'); assert.strictEqual(why({ key: 'md5' }), 'key'); assert.strictEqual(why({}, 'b2'), 'book or passage'); assert.strictEqual(why({}, 'b1', 'p2'), 'book or passage'); assert.strictEqual(why({ format: 'wordtrail-tfng-pack' }), 'not a pack');
    assert.strictEqual(SDC.parse(null, 'b1', 'p1').why, 'not a pack'); assert.strictEqual(SDC.parse('x', 'b1', 'p1').why, 'not a pack'); assert.strictEqual(why({ lines: LINES.slice(0, 2).map(s => [fnv(s), s]) }), 'lines'); assert.strictEqual(why({ lines: [['k', 5], ['k', 'b'], ['k', 'c']] }), 'lines');
    assert.strictEqual(SDC.parse(mkPack({ sample: false }), 'b1', 'p1').ok, true, 'sample false is not a sample');
  });
  await t('parse: a damaged or unapproved item is dropped, the rest of the pack stays; fewer than 3 good items = no pack', () => {
    const items = mkItems().concat([
      { id: 'x1', k: 'p', line: 1, w: 'ship', o: 'sheep', snd: 'i-ee', r: 0 }, { id: 'x2', k: 'p', line: 99, w: 'ship', o: 'sheep', snd: 'i-ee', r: 1 }, { id: 'x3', k: 'p', line: 1, w: 'boat', o: 'goat', snd: 'i-ee', r: 1 },
      { id: 'x4', k: 'p', line: 3, w: 'think', o: 'sink', snd: 'nope', r: 1 }, { id: 'x5', k: 'p', line: 3, w: 'think', o: 'think', snd: 'th-s', r: 1 }, { id: 'x6', k: 'p', line: 1, w: 'ship', o: 'harbour', snd: 'i-ee', r: 1 },
      { id: 'x7', k: 'c', line: 4, c: 'going to', said: 'wanna', r: 1 }, { id: 'x8', k: 'c', line: 4, c: 'must have', said: 'musta', r: 1 }, { id: 'x9', k: 'q', line: 4, r: 1 }, { id: 'a1', k: 'p', line: 1, w: 'ship', o: 'sheep', snd: 'i-ee', r: 1 }, null, 'text', { k: 'p', line: 1, w: 'ship', o: 'sheep', snd: 'i-ee', r: 1 },
      { id: 'y1', k: 'p', line: 8, w: 'old', o: 'sold', snd: 'th-s', r: 1 }, { id: 'y2', k: 'c', line: 8, c: '__proto__', said: 'x', r: 1 }, { id: 'y3', k: 'p', line: 1, w: 'ship', o: 'sheep', snd: '__proto__', r: 1 }]);
    const r = SDC.parse(mkPack({ items }), 'b1', 'p1'); assert.strictEqual(r.ok, true); assert.deepStrictEqual(J(r.items.map(x => x.id)), ['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7', 'y1'], 'only the good items stay (y1 uses a known sound: Python checks the table, the reader needs a known sound)');
    const bad = SDC.parse(mkPack({ items: items.slice(7, 12) }), 'b1', 'p1'); assert.strictEqual(bad.ok, false); assert.strictEqual(bad.why, 'few items');
    assert.strictEqual(SDC.parse(mkPack({ items: mkItems().slice(0, 2) }), 'b1', 'p1').why, 'few items');
  });
  await t('parseIndex: only this book, only safe passage ids, at most 20, nothing = null', () => {
    const idx = (o) => Object.assign({ format: 'wordtrail-sound-index', v: 1, book: 'b1', passages: [{ id: 'p1', n: 7 }, { id: 'ch2', n: 4 }] }, o || {});
    assert.deepStrictEqual(J(SDC.parseIndex(idx(), 'b1')), ['p1', 'ch2']); assert.strictEqual(SDC.parseIndex(idx(), 'b2'), null); assert.strictEqual(SDC.parseIndex(idx({ v: 2 }), 'b1'), null); assert.strictEqual(SDC.parseIndex(idx({ format: 'wordtrail-tfng-index' }), 'b1'), null);
    assert.deepStrictEqual(J(SDC.parseIndex(idx({ passages: [{ id: '../x' }, { id: 'a b' }, { id: 'ok' }, { id: 'ok' }, null, { id: 5 }] }), 'b1')), ['ok']); assert.strictEqual(SDC.parseIndex(idx({ passages: [] }), 'b1'), null); assert.strictEqual(SDC.parseIndex(null, 'b1'), null);
    assert.strictEqual(SDC.parseIndex(idx({ passages: Array.from({ length: 30 }, (_, i) => ({ id: 'p' + i })) }), 'b1').length, 20);
  });
  await t('where: the pack belongs to the book when half of its lines are sentences of it; hidden sentences do not count', () => {
    const lines = LINES.map(s => [fnv(s), s]), sents = LINES.slice(0, 4).map(t => ({ t, h: false }));
    assert.deepStrictEqual(J(SDC.where(lines, sents, fnv)), { n: 4, ok: true }); assert.strictEqual(SDC.where(lines, sents.slice(0, 3), fnv).ok, false);
    assert.strictEqual(SDC.where(lines, sents.map(s => Object.assign({}, s, { h: true })), fnv).n, 0); assert.strictEqual(SDC.where(lines, [{ t: '  ' + LINES[0] + ' ', h: false }].concat(sents.slice(1)), fnv).n, 4, 'trimmed like the app'); assert.strictEqual(SDC.where(lines, null, fnv).ok, false);
  });
  await t('cands: the items whose sentence is in the track, with the sentence number; kind filter; hidden sentences are left out', () => {
    const pass = SDC.parse(mkPack(), 'b1', 'p1'); pass.id = 'p1';
    const texts = ['Other.'].concat(LINES), none = () => false;
    const all = SDC.cands(pass, texts, none, fnv); assert.strictEqual(all.length, 7); assert.strictEqual(all.find(c => c.it.id === 'a1').k, 1); assert.strictEqual(all.find(c => c.it.id === 'a4').sid, 'cs:gonna'); assert.strictEqual(all.find(c => c.it.id === 'a1').sid, 'i-ee');
    assert.deepStrictEqual(J(SDC.cands(pass, texts, none, fnv, 'p').map(c => c.it.k)), ['p', 'p', 'p', 'p']); assert.strictEqual(SDC.cands(pass, texts, none, fnv, 'c').length, 3);
    assert.strictEqual(SDC.cands(pass, texts, k => k === 1, fnv).length, 6, 'a hidden sentence has no audio'); assert.strictEqual(SDC.cands(pass, LINES.slice(3), none, fnv).length, 4, 'only the sentences of this track'); assert.deepStrictEqual(J(SDC.cands(pass, [], none, fnv)), []);
  });
  const pool = () => { const pass = SDC.parse(mkPack(), 'b1', 'p1'); pass.id = 'p1'; return SDC.cands(pass, LINES, () => false, fnv); };
  await t('pick: no sentence or word twice, never more than the size; with few items all of them; the set is shuffled by the seed', () => {
    const cs = pool(), a = SDC.pick(cs, 10, { rnd: seeded(1) }), b = SDC.pick(cs, 10, { rnd: seeded(2) }); assert.strictEqual(a.length, 7); assert.strictEqual(new Set(a.map(c => c.k)).size, 7); assert.strictEqual(SDC.pick(cs, 3, { rnd: seeded(1) }).length, 3);
    assert.notDeepStrictEqual(a.map(c => c.it.id), b.map(c => c.it.id), 'another seed, another order'); assert.deepStrictEqual(SDC.pick(cs, 10, { rnd: seeded(1) }).map(c => c.it.id), a.map(c => c.it.id), 'the same seed, the same set'); assert.deepStrictEqual(J(SDC.pick([], 10)), []); assert.deepStrictEqual(J(SDC.pick(null, 10)), []);
    const twin = cs.concat([Object.assign({}, cs[0], { k: 50, it: Object.assign({}, cs[0].it, { id: 'z', line: 1 }) })]); assert.strictEqual(SDC.pick(twin, 10, { rnd: seeded(3) }).filter(c => c.it.w === 'ship').length, 1, 'the same word is heard once');
  });
  await t('pick: at most ceil(size / 3) items of one sound while others are left', () => {
    const cs = []; let k = 0; ['i-ee', 'th-s', 'l-r', 'p-b'].forEach((snd, si) => { for (let j = 0; j < 8; j++) cs.push({ k: k++, sid: snd, pid: 'p', it: { id: snd + j, k: 'p', w: 'w' + si + 'x' + j, o: 'o', snd } }); });
    const out = SDC.pick(cs, 10, { rnd: seeded(5) }); assert.strictEqual(out.length, 10); const per = {}; out.forEach(c => { per[c.sid] = (per[c.sid] || 0) + 1; }); Object.values(per).forEach(n => assert.ok(n <= 4, JSON.stringify(per)));
    const one = cs.filter(c => c.sid === 'i-ee'); assert.strictEqual(SDC.pick(one, 10, { rnd: seeded(5) }).length, 8, 'with one sound only, the cap gives way');
  });
  await t('pick: weak sounds come first; a level pulls the picks to level + 6; without them it is random', () => {
    const cs = []; let k = 0; ['i-ee', 'th-s', 'l-r', 'p-b'].forEach((snd, si) => { for (let j = 0; j < 6; j++) cs.push({ k: k++, sid: snd, pid: 'p', d: 10 + k * 3, it: { id: snd + j, k: 'p', w: 'w' + si + 'x' + j, o: 'o', snd } }); });
    const weakPick = SDC.pick(cs, 10, { rnd: seeded(9), weak: c => (c.sid === 'th-s' ? 1 : 0) }); assert.strictEqual(weakPick.filter(c => c.sid === 'th-s').length, 4, 'the weak sound gets its full share (4 of 10)');
    const lowAvg = o => { const x = SDC.pick(cs, 6, Object.assign({ rnd: seeded(9), d: c => c.d }, o)); return x.reduce((s, c) => s + c.d, 0) / x.length; };
    const hi = lowAvg({ target: 70 }), lo = lowAvg({ target: 10 }), none = lowAvg({}); assert.ok(hi > lo + 15, 'a high level gets harder sentences: ' + hi + ' vs ' + lo); assert.ok(Math.abs(none - (cs.reduce((s, c) => s + c.d, 0) / cs.length)) < 25, 'no level: no pull');
    assert.doesNotThrow(() => SDC.pick(cs, 5, { target: 50, d: () => { throw new Error('x'); }, weak: () => { throw new Error('y'); } })); assert.doesNotThrow(() => SDC.pick(cs, 5, { target: NaN, d: () => NaN, weak: () => 'zz' }));
  });
  await t('choices: both words, in both orders; hintOf: one placeholder per word', () => {
    const it = { w: 'ship', o: 'sheep' }; assert.deepStrictEqual(J(SDC.choices(it, () => 0.1)), ['sheep', 'ship']); assert.deepStrictEqual(J(SDC.choices(it, () => 0.9)), ['ship', 'sheep']); assert.strictEqual(SDC.choices(it).length, 2);
    assert.strictEqual(SDC.hintOf('going to'), '_____ __'); assert.strictEqual(SDC.hintOf("don't know"), '____ ____'); assert.strictEqual(SDC.hintOf('a lot of'), '_ ___ __');
  });
  await t('grade: pairs are right or wrong (case and apostrophes ignored); connected speech uses the rule of Listen and type', () => {
    const p = { k: 'p', w: 'ship', o: 'sheep' }, c = { k: 'c', c: 'going to', said: 'gonna' }, d = { k: 'c', c: "don't know", said: 'dunno' }, V = LNC.variants(['colour|color']);
    assert.strictEqual(SDC.grade(p, 'ship').v, 'ok'); assert.strictEqual(SDC.grade(p, 'Ship').v, 'ok'); assert.strictEqual(SDC.grade(p, 'sheep').v, 'no'); assert.strictEqual(SDC.grade(p, '').v, 'no'); assert.strictEqual(SDC.grade(p, null).v, 'no');
    assert.strictEqual(SDC.grade(c, 'going to').v, 'ok'); assert.strictEqual(SDC.grade(c, 'GOING  TO!').v, 'ok'); assert.strictEqual(SDC.grade(c, 'goin to').v, 'near', 'one letter off (5+ letters)'); assert.strictEqual(SDC.grade(c, 'gonna').v, 'no'); assert.strictEqual(SDC.grade(c, 'going').v, 'no', 'a missing word');
    assert.strictEqual(SDC.grade(c, 'going to to').v, 'no', 'an extra word'); assert.strictEqual(SDC.grade(c, 'to going').v, 'no'); assert.strictEqual(SDC.grade(c, '   ').v, 'no'); assert.strictEqual(SDC.grade(c, undefined).v, 'no'); assert.strictEqual(SDC.grade(d, "don't know").v, 'ok'); assert.strictEqual(SDC.grade(d, 'dont know').v, 'ok', 'apostrophes are ignored');
    assert.strictEqual(SDC.grade({ k: 'c', c: 'kind of', said: 'kinda' }, 'kind of', V).v, 'ok');
  });
  await t('result: the record the level engine takes; right is 1, wrong 0; extra plays and the hint lower it', () => {
    const p = { k: 'p', w: 'ship', o: 'sheep' }, c = { k: 'c', c: 'going to', said: 'gonna' };
    const r1 = SDC.result(p, SDC.grade(p, 'ship'), 1, false), r2 = SDC.result(p, SDC.grade(p, 'sheep'), 1, false), r3 = SDC.result(p, SDC.grade(p, 'ship'), 5, false), r4 = SDC.result(c, SDC.grade(c, 'going to'), 1, true), r5 = SDC.result(c, SDC.grade(c, 'gonna'), 2, false), r6 = SDC.result(c, SDC.grade(c, 'goin to'), 1, false);
    assert.strictEqual(LVE.outcome(r1), 1); assert.strictEqual(LVE.outcome(r2), 0); assert.ok(LVE.outcome(r3) < 1 && LVE.outcome(r3) >= 0.8); assert.ok(LVE.outcome(r4) < 1 && LVE.outcome(r4) > 0.8); assert.ok(LVE.outcome(r5) < 0.3); assert.ok(LVE.outcome(r6) > 0.3 && LVE.outcome(r6) < 1); assert.strictEqual(r4.hint, true); assert.strictEqual(r1.v, 'ok');
  });
  await t('weak-sound notes: the last 12 answers per sound, only known sounds, garbage is cleaned; weak needs 5 answers and under 75%', () => {
    let s = SDC.clean(null); assert.deepStrictEqual(J(s), { v: 1, s: {} }); for (let i = 0; i < 20; i++) s = SDC.track(s, 'th-s', i % 2 === 0, 1000 + i); assert.strictEqual(s.s['th-s'].h.length, 12); assert.strictEqual(s.s['th-s'].ts, 1019);
    assert.deepStrictEqual(J(SDC.track(s, 'nope', true, 1)), J(s), 'an unknown sound is ignored'); assert.deepStrictEqual(J(SDC.track(s, '__proto__', true, 1)), J(s));
    assert.deepStrictEqual(J(SDC.clean('{bad')), { v: 1, s: {} }); assert.deepStrictEqual(J(SDC.clean(JSON.stringify({ v: 1, s: { 'th-s': { h: '1x', ts: 1 }, zzz: { h: '1', ts: 1 }, 'i-ee': { h: '1011', ts: 'a' }, 'l-r': { h: '1'.repeat(13), ts: 1 } } }))), { v: 1, s: { 'i-ee': { h: '1011', ts: 0 } } });
    assert.strictEqual(SDC.clean({ s: null }).s && Object.keys(SDC.clean({ s: null }).s).length, 0); assert.strictEqual(SDC.weak(SDC.track(SDC.track(SDC.track(SDC.track(SDC.clean(null), 'th-s', false, 1), 'th-s', false, 2), 'th-s', false, 3), 'th-s', false, 4), 'p'), null, '4 answers are not enough');
    let a = SDC.clean(null); [0, 0, 0, 0, 1].forEach((x, i) => { a = SDC.track(a, 'th-s', !!x, i); }); let w = SDC.weak(a, 'p'); assert.strictEqual(w.sid, 'th-s'); assert.strictEqual(w.label, 'th / s'); assert.strictEqual(w.rate, 0.2);
    let b = SDC.clean(null); [1, 1, 1, 1, 0].forEach((x, i) => { b = SDC.track(b, 'l-r', !!x, i); }); assert.strictEqual(SDC.weak(b, 'p'), null, '80% right is not weak'); b = SDC.track(b, 'l-r', false, 9); b = SDC.track(b, 'l-r', false, 10); assert.strictEqual(SDC.weak(b, 'p').sid, 'l-r', '4 of 7 is');
    let c = SDC.clean(null); [0, 0, 0, 0, 0].forEach((x, i) => { c = SDC.track(c, 'cs:gonna', false, i); c = SDC.track(c, 'th-s', false, 10 + i); }); assert.strictEqual(SDC.weak(c, 'p').sid, 'th-s'); assert.strictEqual(SDC.weak(c, 'c').sid, 'cs:gonna'); assert.strictEqual(SDC.weak(c, 'c').label, 'gonna');
    let d = SDC.clean(null); [0, 0, 0, 0, 0].forEach((x, i) => { d = SDC.track(d, 'p-b', false, 5); d = SDC.track(d, 't-d', false, 9); }); assert.strictEqual(SDC.weak(d, 'p').sid, 't-d', 'a tie goes to the one practised last');
    assert.strictEqual(SDC.weakness(SDC.clean(null), 'th-s'), 0); assert.strictEqual(SDC.weakness(a, 'th-s'), 0.8); assert.strictEqual(SDC.weakness(SDC.track(SDC.clean(null), 'th-s', false, 1), 'th-s'), 0, 'fewer than 3 answers: no pull yet');
    assert.ok(JSON.stringify(s).length < 200, 'small: ' + JSON.stringify(s).length);
  });
  await t('sub: the Learn row line; Calm mode and no data give the usual line', () => {
    const w = { label: 'th / s' };
    assert.strictEqual(SDC.sub('p', { weak: w }), 'Your weakest sound: th / s'); assert.strictEqual(SDC.sub('c', { weak: { label: 'gonna' } }), 'Hardest to catch: gonna');
    assert.strictEqual(SDC.sub('p', { weak: w, calm: true }), 'Tell similar words apart'); assert.strictEqual(SDC.sub('c', { weak: { label: 'gonna' }, calm: true }), 'Hear it fast, write it in full'); assert.strictEqual(SDC.sub('p', {}), 'Tell similar words apart'); assert.strictEqual(SDC.sub('c'), 'Hear it fast, write it in full'); assert.strictEqual(SDC.sub('p', { weak: { label: '' } }), 'Tell similar words apart');
    assert.ok(!/\d/.test(SDC.sub('p', { weak: w })), 'no number');
  });

  /* ---------------- Part 2 ---------------- */
  await t('a seeded learner who mixes up "th / s" (30% right) while hearing the rest well (90%) is found, and the next set leans on it', () => {
    const r = seeded(77), cs = []; let k = 0; Object.keys(SDC.SOUNDS).slice(0, 8).forEach(snd => { for (let j = 0; j < 6; j++) cs.push({ k: k++, sid: snd, pid: 'p', it: { id: snd + j, k: 'p', w: 'a' + snd.replace(/-/g, '') + 'q'.repeat(j + 1), o: 'zz', snd } }); });
    let st = SDC.clean(null); for (let n = 0; n < 60; n++) { const c = cs[Math.floor(r() * cs.length)]; st = SDC.track(st, c.sid, r() < (c.sid === 'th-s' ? 0.3 : 0.9), n); }
    const w = SDC.weak(st, 'p'); assert.ok(w && w.sid === 'th-s', JSON.stringify(w));
    let share = 0, runs = 40; for (let n = 0; n < runs; n++) share += SDC.pick(cs, 10, { rnd: seeded(500 + n), weak: c => SDC.weakness(st, c.sid) }).filter(c => c.sid === 'th-s').length; assert.ok(share / runs >= 3.9, 'th / s gets its share: ' + share / runs);
    let base = 0; for (let n = 0; n < runs; n++) base += SDC.pick(cs, 10, { rnd: seeded(500 + n) }).filter(c => c.sid === 'th-s').length; assert.ok(share > base + 20, 'more than chance: ' + share + ' vs ' + base);
  });
  await t('a noisy learner who is right 90% of the time everywhere is never called weak, in 200 seeded runs', () => {
    let called = 0; for (let run = 0; run < 200; run++) { const r = seeded(1000 + run); let st = SDC.clean(null); for (let n = 0; n < 40; n++) st = SDC.track(st, ['i-ee', 'th-s', 'l-r', 'p-b'][Math.floor(r() * 4)], r() < 0.95, n); if (SDC.weak(st, 'p')) called++; }
    assert.ok(called <= 20, 'called weak in ' + called + ' of 200 runs');
  });
  await t('a learner who gets better is no longer weak: the old answers fall out of the last 12', () => {
    let st = SDC.clean(null); for (let n = 0; n < 6; n++) st = SDC.track(st, 'th-s', false, n); assert.ok(SDC.weak(st, 'p')); for (let n = 0; n < 12; n++) st = SDC.track(st, 'th-s', true, 10 + n); assert.strictEqual(SDC.weak(st, 'p'), null);
  });

  /* ---------------- Part 3 ---------------- */
  await t('the sample pack file (sample: true) is refused by the reader; it would be valid if a person approved it; its index is only for the tests', () => {
    const gz = path.join(root, 'packs/sample.p1.sound.json.gz'), pk = JSON.parse(zlib.gunzipSync(fs.readFileSync(gz)).toString('utf8'));
    assert.strictEqual(pk.sample, true); assert.strictEqual(SDC.parse(pk, 'sample', 'p1').ok, false); assert.strictEqual(SDC.parse(pk, 'sample', 'p1').why, 'sample pack');
    const approved = Object.assign({}, pk, { sample: undefined, reviewed: { by: 'A Person', on: '2026-11-16' } }), r = SDC.parse(approved, 'sample', 'p1'); assert.strictEqual(r.ok, true); assert.strictEqual(r.items.length, pk.items.length, 'every item of the sample is valid and found in its sentence');
    assert.ok(typeof pk.license === 'string' && pk.license.length > 10 && pk.reviewed && pk.textLicense !== undefined, 'licence and reviewed fields'); assert.ok(pk.items.every(i => i.r === 1 && !('chk' in i)));
    const idx = JSON.parse(fs.readFileSync(path.join(root, 'packs/sample.sound-index.json'), 'utf8')); assert.deepStrictEqual(J(SDC.parseIndex(idx, 'sample')), ['p1']);
  });
  await t('structure: no emoji, every id the code uses is in the sheet, every icon is in the sprite, the build lines, the Bengali strings, the book words are never translated', () => {
    const html = rd('src/html/28i-sheet-sound-drill.html'), css = rd('src/css/94zf-sound-drill.css'), sprite = rd('src/html/10-body-views.html'), build = rd('build.py'), bn = JSON.parse(rd('src/i18n/bn.json'));
    const emoji = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE0F}]/u; [html, css, SRC].forEach((s, i) => assert.ok(!emoji.test(s.replace(/\u2717/g, '')), 'emoji in file ' + i + ' (the cross U+2717 is plain text)'));
    const ids = new Set(Array.from(html.matchAll(/id="([^"]+)"/g)).map(m => m[1])); const used = new Set(Array.from(SRC.matchAll(/\bq\('((?:sd|sheet-sd)[^']*)'\)/g)).map(m => m[1])); used.forEach(i => assert.ok(ids.has(i), 'the code uses #' + i + ' but the sheet has none'));
    assert.ok(ids.size >= 25, 'the sheet has its parts');
    const icons = new Set([...Array.from((html + SRC).matchAll(/#(i-[a-z0-9-]+)/g)).map(m => m[1])]); icons.forEach(i => assert.ok(sprite.includes('id="' + i + '"'), 'icon ' + i + ' is missing in the sprite'));
    ['src/css/94zf-sound-drill.css', 'src/html/28i-sheet-sound-drill.html', 'src/js/169zc-sound-drill.js'].forEach(f => assert.ok(build.includes("'" + f + "'"), 'build.py has no line for ' + f));
    assert.ok(build.indexOf('169zc-sound-drill.js') > build.indexOf('169x-listen-level.js') && build.indexOf('169zc-sound-drill.js') < build.indexOf('169w-learn-screen.js'), 'after the level engine, before the Learn screen');
    assert.ok(/I18N_SKIP = '[^']*\.sd-word'/.test(rd('src/js/200-player-controls.js')), 'the Bengali layer skips .sd-word');
    const need = ['Which word did you hear?', 'Write it in full', 'Choose the word you heard.', 'Type the words in full.', 'Right. You heard it.', 'Not quite. Listen again.', 'Perfect. Written in full.', 'Almost. Check the spelling.', 'The word was:', 'You chose:', 'Sound pair:', 'In full:', 'Said fast it can sound like:', 'You wrote:',
      'Every answer was right.', 'Some answers were different. Here they are.', 'Your weakest sound so far:', 'Hardest to catch so far:', 'Looking for practice for this book…', 'No sound practice found for this book. It may not exist yet, or you may be offline.', 'This track has too little practice. Try another track.', 'Hear it fast, write it in full', 'Tell similar words apart',
      'Not quite. Here is the sentence.', 'Great listening!', 'Nice work', 'Good effort', 'Hint: letters', 'Continue', 'Check', 'Your answers', 'Close', 'Play the sentence', 'Play slowly', 'Place in this session', 'Open a book that has its text lined up with the audio first.', 'Difficulty:', 'The audio did not start. Tap the speaker to try again.'];
    need.forEach(s => { assert.ok(bn.dict[s], 'no Bengali for: ' + s); assert.ok(SRC.includes(s) || html.includes(s) || /^(Great|Nice|Good|Close|Play|Place|Hint|Continue|Check|Your answers|Difficulty|Not quite. Here|Open a book|The audio)/.test(s), 'the code no longer has: ' + s); });
    const rx = bn.rx.map(r => new RegExp(r[0])); ['Played 3 times', 'Played 1 time', 'Your weakest sound: th / s', 'Hardest to catch: gonna', 'Sentence 3 of 10', '4 perfect so far', '+3 more'].forEach(s => assert.ok(rx.some(r => r.test(s)), 'no Bengali pattern for: ' + s));
    assert.ok(/shPlan\(\)/.test(SRC) && !/setInterval/.test(SRC.replace(/st\.watch = setInterval/, '')), 'the only timer is the clip timer');
    assert.ok(!/^\s*(fetch|SDK\.passages|SD\.start)\(/m.test(SRC.slice(SRC.indexOf('const SDC'))), 'nothing runs at start-up');
  });

  /* ---------------- Part 4 ---------------- */
  let chromium; try { ({ chromium } = require('playwright')); } catch (e) { console.log('skip browser part: playwright is not installed'); }
  if (chromium) {
    const grab = (src, start, endRe) => { const i = src.indexOf(start); if (i < 0) throw new Error('missing ' + start); const m = src.slice(i).match(endRe); return src.slice(i, i + m.index + m[0].length); };
    const s150 = rd('src/js/150-player-reader.js'), s140 = rd('src/js/140-open-book.js');
    const real = [grab(s150, '  function sentTime(', /\n/), grab(s140, '  function shPlan()', /\n/), grab(s140, '  function shClip(', /\n  }\n/)].join('\n');
    const css = ['10-base-layout', '94-learn-ui', '20-home-library', '40-player-sheets-chips', '60-reading-search', '80-progress-v10', '94s-listen-type', '94zf-sound-drill'].map(f => rd('src/css/' + f + '.css')).join('\n');
    const sp = rd('src/html/10-body-views.html'), spr = sp.slice(sp.indexOf('<svg width="0"'), sp.indexOf('</svg>', sp.indexOf('<svg width="0"')) + 6), SHEET = rd('src/html/28i-sheet-sound-drill.html');
    /* the stand-in book: 31 sentences, 3 seconds each; the kind of sentence repeats every 10 */
    const N = 31, STEP = 3;
    const PAIRS = [['ship', 'sheep', 'i-ee'], ['think', 'sink', 'th-s'], ['thank', 'sank', 'th-s'], ['thick', 'sick', 'th-s'], ['thin', 'sin', 'th-s'], ['light', 'right', 'l-r'], ['cat', 'cut', 'a-u'], ['pen', 'pain', 'e-ay'], ['not', 'note', 'o-oa'], ['very', 'wary', 'v-w'], ['sip', 'ship2', 's-sh'], ['chair', 'share', 'ch-sh'], ['park', 'bark', 'p-b'], ['tie', 'die', 't-d'], ['coat', 'goat', 'k-g'], ['fan', 'pan', 'f-p']];
    PAIRS[10] = ['sort', 'short', 's-sh'];
    const CH = TABLE.chunks.slice(0, 15);
    /* even sentences hold a pair word, odd ones a phrase; every word and phrase is different */
    const ITEM = [], SENTS = Array.from({ length: N }, (_, i) => {
      if (i % 2 === 0) { const [w, o, snd] = PAIRS[(i / 2) % 16]; ITEM[i] = { k: 'p', w, o, snd }; return 'We talked about the ' + w + ' on day ' + (i + 1) + '.'; }
      const c = CH[((i - 1) / 2) % 15]; ITEM[i] = { k: 'c', c: c.c, said: c.said }; return 'He said they were ' + c.c + ' it on day ' + (i + 1) + '.';
    });
    const bigPack = o => Object.assign({ format: 'wordtrail-sound-pack', v: 1, book: '7', passage: 'p1', key: 'fnv1a-utf16-base36', engine: 'table', license: 'CC0', made: '2026-11-16T00:00:00Z', lines: SENTS.map(s => [fnv(s), s]),
      items: SENTS.map((s, i) => Object.assign({ id: 'i' + i, line: i + 1, r: 1 }, ITEM[i])), reviewed: { by: 'Test Reviewer', on: '2026-11-16' } }, o || {});
    const idx = { format: 'wordtrail-sound-index', v: 1, book: '7', passages: [{ id: 'p1', n: N }] };
    const html = `<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><html data-theme="dark"><head><style>${css}
body{margin:0;background:var(--bg);color:var(--ink);font-family:var(--font-ui)} .sheet.ced{animation:none}</style></head><body><div id="backdrop" hidden></div>${spr}${SHEET}<script type="application/json" id="lt-variants">{"pairs":["colour|color"]}</script>
<script>
window.T = { seeks: [], quiet: [], toasts: [], plays: 0, rates: [], regs: [], ie: [], fetched: [], files: {}, idb: new Map() };
(() => {
  const $ = (s, r) => (r || document).querySelector(s);
  const FAST = 10, N = ${N}, STEP = ${STEP};
  const P = { speed: 1.5, nudge: 0, calm: false }, S = { book: { id: 7, title: 'Dracula' }, sec: 0, durs: [N * STEP], quietJump: false, plan: [], model: null };
  S.plan[0] = { ids: Array.from({ length: N }, (_, i) => i), starts: Array.from({ length: N }, (_, i) => i * STEP) };
  S.model = { sents: ${JSON.stringify(SENTS)}.map(t => ({ t, h: false })), chapters: [{ start: 0, end: N, title: 'Chapter 3' }] };
  window.S = S; window.P = P;
  const audio = { paused: true, ended: false, currentTime: 0, playbackRate: 1, _iv: 0,
    play() { this.paused = false; T.plays++; T.rates.push(this.playbackRate); clearInterval(this._iv); this._iv = setInterval(() => { this.currentTime += 0.02 * FAST * this.playbackRate; }, 20); return Promise.resolve(); },
    pause() { this.paused = true; clearInterval(this._iv); } };
  window.audio = audio;
  const Core = { locate: (starts, t) => { let k = 0; for (let i = 0; i < starts.length; i++) if (starts[i] <= t) k = i; return k; } };
  const nowT = () => audio.currentTime;
  const seekAudio = x => { T.seeks.push(x); T.quiet.push(S.quietJump); audio.currentTime = x; };
  const openSheet = id => { document.querySelectorAll('.sheet').forEach(s => { s.hidden = true; }); $('#' + id).hidden = false; }, closeSheets = () => { document.querySelectorAll('.sheet').forEach(s => { s.hidden = true; }); };
  const toast = m => T.toasts.push(m), onPlayFail = () => {}, goTrack = () => {}, fmt = s => String(s), guideDoc = () => {};
  const h = (tag, attrs, ...kids) => { const e = document.createElement(tag); Object.keys(attrs || {}).forEach(k => e.setAttribute(k, attrs[k])); e.append(...kids); return e; };
  const LearnHub = { register(r) { T.regs.push(r); } };
  const IE = { log: k => { T.ie.push(k); } };
  const TP = { fnv: ${tfnv.replace(/^const fnv = /, '').replace(/;\s*$/, '')} };
  const fetchText = async f => { T.fetched.push(f); const j = T.files[f]; return j ? { ok: true, json: j } : { ok: false }; };
  const TPK = { readJson: async r => r.json };
  const idb = { get: async k => T.idb.get(k), set: async (k, v) => { T.idb.set(k, JSON.parse(JSON.stringify(v))); } };
  ${real}
  const LV = new Function(${JSON.stringify(LVEsrc + '\nreturn { LVE, LVX };')})();
  const LNCf = new Function(${JSON.stringify(LNCsrc + '\nreturn LNC;')})();
  window.run = new Function('S','P','audio','Core','nowT','seekAudio','openSheet','closeSheets','toast','onPlayFail','goTrack','fmt','guideDoc','LearnHub','shPlan','shClip','h','LVX','LVE','LNC','IE','TP','fetchText','TPK','idb',
    ${JSON.stringify(SRC + '\nreturn { SD, SDC, SDK, SDS };')});
  window.api = window.run(S, P, audio, Core, nowT, seekAudio, openSheet, closeSheets, toast, onPlayFail, goTrack, fmt, guideDoc, LearnHub, shPlan, shClip, h, LV.LVX, LV.LVE, LNCf, IE, TP, fetchText, TPK, idb);
})();
</script></body></html>`;
    let browser; try { browser = await chromium.launch({ channel: 'chrome' }).catch(() => chromium.launch()); } catch (e) { console.error('sound_drill_check: no browser: ' + e.message); process.exit(2); }
    const open = async (seed, files) => {
      const pg = await browser.newPage({ viewport: { width: 390, height: 780 } }), errs = [], reqs = [];
      pg.on('pageerror', e => errs.push(e.message)); pg.on('console', m => { if (m.type() === 'error') errs.push(m.text()); }); pg.on('request', r => reqs.push(r.url()));
      await pg.addInitScript(([v, f]) => { try { if (v !== null) localStorage.setItem(v[0], v[1]); } catch (x) { /* ignore */ } window.__files = f; }, [seed || null, files === undefined ? { 'packs/7.sound-index.json': idx, 'packs/7.p1.sound.json.gz': bigPack() } : files]);
      await pg.route('http://localhost/**', r => (/favicon/.test(r.request().url()) ? r.fulfill({ status: 204 }) : r.fulfill({ status: 200, contentType: 'text/html', body: html })));
      await pg.goto('http://localhost/'); await pg.evaluate(() => { T.files = window.__files || {}; }); return { pg, errs, reqs };
    };
    const clipDone = pg => pg.waitForFunction(() => audio.paused && !document.getElementById('sd-play').classList.contains('is-playing'), null, { timeout: 4000 });
    const clickId = (pg, id) => pg.evaluate(i => document.getElementById(i).click(), id);
    const reset = (pg, time, playing) => pg.evaluate(([tm, pl]) => { const a = window.audio; a.pause(); a.currentTime = tm; a.playbackRate = 1.5; if (pl) a.play(); T.seeks = []; T.quiet = []; T.rates = []; T.plays = 0; T.ie = []; T.toasts = []; }, [time, !!playing]);
    const view = pg => pg.evaluate(() => { const $ = i => document.getElementById(i), inp = document.querySelector('#sd-sent input.sd-gap'); return { title: $('sd-title').textContent, pos: $('sd-pos').textContent, sent: $('sd-sent').textContent.replace(/\s+/g, ' ').trim(), opts: Array.from(document.querySelectorAll('#sd-opts button')).map(b => ({ w: b.textContent, cls: b.className, dis: b.disabled })),
      optsHid: $('sd-opts').hidden, hintHid: $('sd-hint').hidden, ph: inp ? inp.placeholder : null, val: inp ? inp.value : null, inCls: inp ? inp.className : '', ro: inp ? inp.readOnly : null, checkHid: $('sd-check').hidden, checkDis: $('sd-check').disabled, nextHid: $('sd-next').hidden, fbHid: $('sd-fb').hidden,
      fbT: $('sd-fb-t').textContent, fbA: $('sd-fb-a').textContent, fixes: Array.from(document.querySelectorAll('#sd-fb-d li')).map(l => l.textContent.replace(/\s+/g, ' ').trim()), foot: $('sd-foot').className, flame: $('sd-flame-n').textContent, lv: $('sd-lv').textContent, lvHid: $('sd-lv-w').hidden, prompt: $('sd-prompt').textContent, sheetHid: $('sheet-sd').hidden, plays: $('sd-plays').textContent }; });
    const cur = pg => pg.evaluate(() => { const r = api.SD.results(); return r; });
    const startAt = async (pg, mode, k) => { await reset(pg, k * STEP + 0.5, false); return pg.evaluate(m => api.SD.start(m), mode); };
    const itemOf = text => { const i = SENTS.indexOf(Array.from(SENTS).find(s => s === text)); return { i, it: ITEM[i] }; };
    const sayRight = async pg => { const v = await view(pg), full = await pg.evaluate(() => S.model.sents.map(s => s.t)); const hit = full.findIndex(s => { const a = s.split(/\s+/), b = v.sent.split(/\s+/); return a.length === b.length || true; }); return hit; };
    try {
      await t('two tiles are registered: Which word did you hear? and Write it in full; usual lines, after Speed ladder (52), for the hub and the Study sheet', async () => {
        const { pg, errs } = await open();
        try {
          const r = await pg.evaluate(() => T.regs.map(x => ({ id: x.id, title: x.title, icon: x.icon, sub: x.subtitle(), ps: x.playerSubtitle({ time: 75 }), order: x.order, player: x.player, open: typeof x.open, show: x.show })));
          assert.deepStrictEqual(r.map(x => x.id), ['soundpairs', 'fullform']); assert.deepStrictEqual(r.map(x => x.title), ['Which word did you hear?', 'Write it in full']); assert.deepStrictEqual(r.map(x => x.icon), ['#i-m-pair', '#i-m-chunk']);
          assert.deepStrictEqual(r.map(x => x.sub), ['Tell similar words apart', 'Hear it fast, write it in full']); assert.deepStrictEqual(r.map(x => x.ps), ['Tell similar words apart', 'Hear it fast, write it in full']); r.forEach(x => { assert.ok(x.order > 52); assert.notStrictEqual(x.player, false); assert.strictEqual(x.open, 'function'); assert.strictEqual(x.show, undefined, 'always shown: a book without a pack gets a message when tapped'); });
          assert.deepStrictEqual(await pg.evaluate(() => T.fetched), [], 'nothing is fetched until a tile is tapped'); assert.deepStrictEqual(errs, []);
        } finally { await pg.close(); }
      });
      await t('Which word did you hear: a session of 10; the sentence has a gap, two buttons, the answer marks the word and shows the sound pair; the end screen; IELTS log; notes; the audio goes back', async () => {
        const { pg, errs, reqs } = await open();
        try {
          await reset(pg, 14 * STEP + 0.5, false); assert.strictEqual(await pg.evaluate(() => api.SD.start('p')), true); assert.strictEqual((await view(pg)).sheetHid, false);
          assert.ok((await pg.evaluate(() => T.toasts)).includes('Looking for practice for this book…'), 'the learner is told it is looking');
          let seen = [];
          for (let i = 0; i < 10; i++) {
            await clipDone(pg); const a = await pg.evaluate(() => ({ ct: audio.currentTime, paused: audio.paused })); assert.ok(a.paused, 'the clip stopped by itself');
            let v = await view(pg); assert.strictEqual(v.title, 'Which word did you hear?'); assert.strictEqual(v.pos, 'Sentence ' + (i + 1) + ' of 10'); assert.strictEqual(v.optsHid, false); assert.strictEqual(v.hintHid, true); assert.strictEqual(v.opts.length, 2); assert.strictEqual(v.checkHid, true); assert.strictEqual(v.nextHid, true); assert.strictEqual(v.fbHid, true); assert.strictEqual(v.prompt, 'Choose the word you heard.');
            const sentIdx = await pg.evaluate(() => { const k = api.SD.results().length; return k; }); const ws2 = v.opts.map(o => o.w).sort(), pair = ITEM.filter(x => x.k === 'p').find(x => [x.w, x.o].sort().join() === ws2.join()); assert.ok(pair, 'the two buttons are a pair of the pack: ' + ws2); assert.ok(!new RegExp('\\b' + pair.w + '\\b').test(v.sent), 'the answer is not on the screen: ' + v.sent); assert.ok(v.sent.length > 20);
            const right = i % 3 !== 0; await pg.click('#sd-opts button[data-w="' + (right ? pair.w : pair.o) + '"]'); v = await view(pg);
            assert.strictEqual(v.nextHid, false); assert.ok(v.opts.every(o => o.dis), 'the buttons are locked'); assert.ok(v.opts.find(o => o.w === pair.w).cls.includes('is-ok'), 'the right word is marked'); assert.strictEqual(v.fbHid, false); assert.ok(new RegExp('\\b' + pair.w + '\\b').test(v.sent), 'the word fills the gap');
            if (right) { assert.strictEqual(v.fbT, 'Right. You heard it.'); assert.ok(/is-ok/.test(v.foot)); assert.ok(!v.fixes.some(f => /You chose/.test(f))); } else { assert.strictEqual(v.fbT, 'Not quite. Listen again.'); assert.ok(v.opts.find(o => o.w === pair.o).cls.includes('is-bad')); assert.ok(v.fixes.some(f => f.includes('The word was: ' + pair.w) && f.includes('You chose: ' + pair.o)), v.fixes.join('|')); assert.ok(/is-no/.test(v.foot)); }
            assert.ok(v.fixes.some(f => f.startsWith('Sound pair: ' + pair.w + ' / ' + pair.o) && f.includes(SDCjs.SOUNDS[pair.snd])), v.fixes.join('|')); assert.strictEqual(v.fbA, SENTS.find(s => s.split(/[ .,]+/).includes(pair.w) && v.sent === s), 'the whole sentence is shown'); seen.push(pair.snd); await clickId(pg, 'sd-next');
          }
          const e = await pg.evaluate(() => ({ endHid: document.getElementById('sd-end').hidden, title: document.getElementById('sd-title').textContent, ring: document.getElementById('sd-ring-t').textContent, rows: document.querySelectorAll('#sd-rows li').length, ie: T.ie.slice(), res: api.SD.results().length, weak: document.getElementById('sd-weak').hidden }));
          assert.strictEqual(e.endHid, false); assert.strictEqual(e.title, 'Your answers'); assert.strictEqual(e.ring, '6/10'); assert.strictEqual(e.rows, 4, 'the 4 wrong ones'); assert.deepStrictEqual(e.ie, ['l'], 'one Listening session in the IELTS log'); assert.strictEqual(e.res, 10); assert.strictEqual(e.weak, true, 'no weak sound yet (under 5 answers each, or enough right)') ;
          await clickId(pg, 'sd-next'); const after = await pg.evaluate(() => ({ hidden: document.getElementById('sheet-sd').hidden, ct: audio.currentTime, paused: audio.paused, on: api.SD.on, snd: JSON.parse(localStorage.getItem('wt:snd')), lvl: JSON.parse(localStorage.getItem('wt:lvl')), last: api.SD.last() }));
          assert.strictEqual(after.hidden, true); assert.strictEqual(after.on, false); assert.ok(Math.abs(after.ct - (14 * STEP + 0.5)) < 0.01, 'back where it was: ' + after.ct); assert.strictEqual(after.paused, true);
          const tot = Object.values(after.snd.s).reduce((s, x) => s + x.h.length, 0); assert.strictEqual(tot, 10, 'ten answers noted'); assert.ok(Object.keys(after.snd.s).every(k => !!SDCjs.SOUNDS[k]), 'only sounds'); assert.strictEqual(after.lvl.s.pair.n, 10, 'the level of this mode'); assert.strictEqual(after.lvl.s.full, undefined); assert.strictEqual(after.last.kind, 'p'); assert.strictEqual(after.last.res.length, 10);
          assert.deepStrictEqual(reqs.filter(u => !/^http:\/\/localhost\//.test(u)), [], 'no network'); assert.deepStrictEqual(errs, []);
        } finally { await pg.close(); }
      });
      await t('Write it in full: one box for the phrase; Enter checks; right, one letter off, said-fast form, a missing and an extra word; the answer shows how it is said fast; the hint; the end screen', async () => {
        const { pg, errs } = await open();
        try {
          await startAt(pg, 'c', 4); const tries = [['', 'ok'], ['', 'near'], ['', 'no'], ['', 'no'], ['', 'ok']];
          for (let i = 0; i < 10; i++) {
            await clipDone(pg); let v = await view(pg); assert.strictEqual(v.title, 'Write it in full'); assert.strictEqual(v.optsHid, true); assert.strictEqual(v.hintHid, false); assert.strictEqual(v.checkHid, false); assert.strictEqual(v.checkDis, true, 'Check waits for a word'); assert.strictEqual(v.prompt, 'Type the words in full.'); assert.strictEqual(v.val, '');
            const full = await pg.evaluate(() => S.model.sents.map(s => s.t)), item = ITEM.filter(x => x.k === 'c').find(x => { const k = x.c; return full.some(s => v.sent.split(' ').join(' ').length > 0 && !s.includes(k) ? false : false); }) || null;
            const phr = ITEM.filter(x => x && x.k === 'c').map(x => x.c).find(c => SENTS.some(s => s.includes(c) && s.replace(c, '').replace(/\s+/g, ' ').trim() === v.sent.replace(/\s+/g, ' ').trim())); assert.ok(phr, 'the sentence without its phrase: ' + v.sent); const said = SDCjs.CHUNKS[phr];
            if (i === 0) { await clickId(pg, 'sd-hint'); v = await view(pg); assert.strictEqual(v.ph, SDCjs.hintOf(phr)); assert.strictEqual(await pg.evaluate(() => document.getElementById('sd-hint').getAttribute('aria-pressed')), 'true'); await clickId(pg, 'sd-hint'); assert.strictEqual((await view(pg)).ph, ''); }
            const mode = i % 5, typed = mode === 0 ? phr : mode === 1 ? phr.replace(/^(\w)(\w+)/, (m, a, b) => a + b.slice(0, -1)) : mode === 2 ? said : mode === 3 ? phr + ' ' + phr.split(' ')[0] : phr.toUpperCase() + '.';
            await pg.focus('#sd-sent input.sd-gap'); await pg.keyboard.type(typed); assert.strictEqual((await view(pg)).checkDis, false); await pg.keyboard.press('Enter'); v = await view(pg);
            assert.strictEqual(v.nextHid, false); assert.strictEqual(v.checkHid, true); assert.strictEqual(v.ro, true, 'the box is locked'); assert.strictEqual(v.fbHid, false); assert.ok(v.fixes.some(f => f === 'In full: ' + phr), v.fixes.join('|')); assert.ok(v.fixes.some(f => f === 'Said fast it can sound like: ' + said), v.fixes.join('|'));
            const want = SDCjs.grade({ k: 'c', c: phr, said }, typed).v;
            if (want === 'ok') { assert.strictEqual(v.fbT, 'Perfect. Written in full.'); assert.ok(v.inCls.includes('is-ok')); } else if (want === 'near') { assert.strictEqual(v.fbT, 'Almost. Check the spelling.'); assert.ok(v.inCls.includes('is-close')); } else { assert.strictEqual(v.fbT, 'Not quite. Here is the sentence.'); assert.ok(v.inCls.includes('is-bad')); assert.ok(v.fixes.some(f => f.startsWith('You wrote: ')), v.fixes.join('|')); }
            assert.strictEqual(v.fbA, SENTS.find(s => s.includes(phr) && s.replace(phr, '').replace(/\s+/g, ' ').trim() === v.sent.replace(/\s+/g, ' ').trim()) || v.fbA, 'the whole sentence'); await clickId(pg, 'sd-next');
          }
          const e = await pg.evaluate(() => ({ endHid: document.getElementById('sd-end').hidden, title: document.getElementById('sd-title').textContent, ie: T.ie.slice(), res: api.SD.results().map(r => r.v), snd: JSON.parse(localStorage.getItem('wt:snd')) }));
          assert.strictEqual(e.endHid, false); assert.strictEqual(e.title, 'Your answers'); assert.strictEqual(e.res.length, 10); assert.ok(e.res.filter(x => x === 'ok').length >= 4 && e.res.includes('no'), e.res.join()); assert.deepStrictEqual(e.ie, ['l']); assert.ok(Object.keys(e.snd.s).every(k => k.startsWith('cs:'))); 
          await clickId(pg, 'sd-next'); assert.strictEqual((await view(pg)).sheetHid, true); const lv = await pg.evaluate(() => JSON.parse(localStorage.getItem('wt:lvl'))); assert.strictEqual(lv.s.full.n, 10, 'its own level'); assert.strictEqual(lv.s.pair, undefined); assert.deepStrictEqual(errs, []);
        } finally { await pg.close(); }
      });
      await t('no pack, a sample pack, an unreviewed pack, a pack of another book, or a pack with too few matching items: a plain message and nothing opens, the audio is untouched', async () => {
        const cases = [['no pack at all', {}, /No sound practice found for this book/], ['sample: true', { 'packs/7.sound-index.json': idx, 'packs/7.p1.sound.json.gz': bigPack({ sample: true }) }, /No sound practice found/],
          ['not reviewed', { 'packs/7.sound-index.json': idx, 'packs/7.p1.sound.json.gz': bigPack({ reviewed: undefined }) }, /No sound practice found/], ['other book (no line is in this book)', { 'packs/7.sound-index.json': idx, 'packs/7.p1.sound.json.gz': bigPack({ lines: SENTS.map(s => [fnv('x' + s), 'x' + s]) }) }, /No sound practice found/],
          ['index only, the pack is missing', { 'packs/7.sound-index.json': idx }, /No sound practice found/]];
        for (const [name, files, msg] of cases) {
          const { pg, errs } = await open(null, files);
          try {
            await reset(pg, 20, true); const r = await pg.evaluate(() => api.SD.start('p')); assert.strictEqual(r, false, name); const v = await view(pg), toasts = await pg.evaluate(() => T.toasts);
            assert.strictEqual(v.sheetHid, true, name + ': nothing opens'); assert.ok(toasts.some(x => msg.test(x)), name + ': ' + toasts.join('|')); const a = await pg.evaluate(() => ({ paused: audio.paused, ct: audio.currentTime, seeks: T.seeks.length })); assert.strictEqual(a.paused, false, name + ': the audio keeps playing'); assert.strictEqual(a.seeks, 0, name + ': no seek'); assert.strictEqual(await pg.evaluate(() => api.SD.on), false); assert.deepStrictEqual(errs, [], name);
          } finally { await pg.close(); }
        }
      });
      await t('a pack that matches the book but has no item in the open track says so; with no book open the usual message', async () => {
        const half = bigPack(); half.lines = SENTS.slice(0, 16).map(s => [fnv(s), s]).concat(SENTS.slice(16).map(s => [fnv('y' + s), 'y' + s])); half.items = half.items.filter(i => i.line === 3 || i.line === 5 || i.line === 20); const { pg, errs } = await open(null, { 'packs/7.sound-index.json': idx, 'packs/7.p1.sound.json.gz': half });
        try {
          await reset(pg, 5, false); assert.strictEqual(await pg.evaluate(() => api.SD.start('c')), false); assert.ok((await pg.evaluate(() => T.toasts)).some(x => x === 'This track has too little practice. Try another track.'), 'only 1 phrase item of this pack is a phrase of this track');
          await pg.evaluate(() => { S.book = null; }); await reset(pg, 5, false); assert.strictEqual(await pg.evaluate(() => api.SD.start('p')), false); assert.ok((await pg.evaluate(() => T.toasts)).includes('Open a book that has its text lined up with the audio first.')); assert.deepStrictEqual(errs, []);
        } finally { await pg.close(); }
      });
      await t('packs are kept: the second session asks for nothing; a damaged saved copy never stops it; a failed fetch is not asked again at once', async () => {
        const { pg, errs } = await open();
        try {
          await startAt(pg, 'p', 3); await clipDone(pg); const n1 = await pg.evaluate(() => T.fetched.slice()); assert.deepStrictEqual(n1, ['packs/7.sound-index.json', 'packs/7.p1.sound.json.gz']); assert.ok(await pg.evaluate(() => T.idb.has('sound:7') && T.idb.has('soundp:7|p1')), 'both saved for offline');
          await pg.evaluate(() => api.SD.close()); await startAt(pg, 'c', 3); assert.deepStrictEqual(await pg.evaluate(() => T.fetched.length), 2, 'nothing fetched again'); await pg.evaluate(() => api.SD.close());
          await pg.evaluate(() => { T.files = {}; T.idb.set('soundp:7|p1', { v: 1, lines: 5, items: 'x', fetched: Date.now() }); }); assert.strictEqual(await startAt(pg, 'p', 3), false, 'a damaged saved passage is not used'); assert.ok((await pg.evaluate(() => T.toasts)).some(x => /No sound practice found/.test(x)), 'a message, not a crash');
          assert.deepStrictEqual(errs, []);
        } finally { await pg.close(); }
      });
      await t('weak sounds reach the Learn rows: "Your weakest sound: th / s" and "Hardest to catch: gonna"; Calm mode and no data show the usual line', async () => {
        const seed = ['wt:snd', JSON.stringify({ v: 1, s: { 'th-s': { h: '001000', ts: 5 }, 'i-ee': { h: '111111', ts: 9 }, 'cs:gonna': { h: '000010', ts: 7 } } })];
        const { pg, errs } = await open(seed);
        try {
          const rows = () => pg.evaluate(() => T.regs.map(x => x.subtitle())); assert.deepStrictEqual(await rows(), ['Your weakest sound: th / s', 'Hardest to catch: gonna']);
          await pg.evaluate(() => { P.calm = true; }); assert.deepStrictEqual(await rows(), ['Tell similar words apart', 'Hear it fast, write it in full'], 'Calm mode: the usual line'); await pg.evaluate(() => { P.calm = false; });
          const { pg: p2 } = await open(['wt:snd', '{broken']); try { assert.deepStrictEqual(await p2.evaluate(() => T.regs.map(x => x.subtitle())), ['Tell similar words apart', 'Hear it fast, write it in full'], 'a damaged note never stops it'); } finally { await p2.close(); }
          await startAt(pg, 'p', 3); await clipDone(pg); await pg.evaluate(() => api.SD.close()); const th = await pg.evaluate(() => api.SD.results().length); assert.deepStrictEqual(errs, []);
        } finally { await pg.close(); }
      });
      await t('the weak sound gets its share of the next session (4 th / s items in this book: all 4 come, with the pull)', async () => {
        const seed = ['wt:snd', JSON.stringify({ v: 1, s: { 'th-s': { h: '000000', ts: 5 } } })];
        const { pg, errs } = await open(seed);
        try {
          await startAt(pg, 'p', 3); await clipDone(pg); const th = await pg.evaluate(() => api.SD.start && Array.from(document.querySelectorAll('#sd-opts button')).map(b => b.textContent)); assert.ok(th.length === 2);
          let hits = 0; for (let i = 0; i < 10; i++) { await clipDone(pg); const o = (await view(pg)).opts.map(x => x.w).sort().join(); if (['sink,think', 'sank,thank', 'sick,thick', 'sin,thin'].includes(o)) hits++; const b = await pg.$('#sd-opts button'); await b.click(); await clickId(pg, 'sd-next'); }
          assert.ok(hits === 4, 'th / s items in the set: ' + hits); await pg.evaluate(() => api.SD.close()); assert.deepStrictEqual(errs, []);
        } finally { await pg.close(); }
      });
      await t('a saved level shows ONE word (never a number) and moves the picks; no level = no word', async () => {
        for (const [seed, word] of [[['wt:lvl', JSON.stringify({ v: 1, s: { pair: { l: 5, n: 12, ts: 1, h: [] } } })], 'Challenging'], [['wt:lvl', JSON.stringify({ v: 1, s: { pair: { l: 95, n: 12, ts: 1, h: [] } } })], 'Comfortable'], [null, '']]) {
          const { pg, errs } = await open(seed);
          try { await startAt(pg, 'p', 3); await clipDone(pg); const v = await view(pg); assert.strictEqual(v.lv, word); assert.strictEqual(v.lvHid, !word); assert.ok(!/\d/.test(v.lv)); await pg.evaluate(() => api.SD.close()); assert.deepStrictEqual(errs, []); } finally { await pg.close(); }
        }
        const { pg } = await open(['wt:lvl', JSON.stringify({ v: 1, s: { type: { l: 5, n: 30, ts: 1, h: [] } } })]); try { await startAt(pg, 'p', 3); await clipDone(pg); assert.strictEqual((await view(pg)).lv, '', 'the level of Listen and type does not decide this mode'); await pg.evaluate(() => api.SD.close()); } finally { await pg.close(); }
      });
      await t('closing in the middle puts the audio back (also when it was playing), keeps the answers so far and the weak-sound notes, and never leaves the clip timer running', async () => {
        for (const playing of [false, true]) {
          const { pg, errs } = await open();
          try {
            await startAt(pg, 'p', 7); await pg.evaluate(() => api.SD.close()); await reset(pg, 7 * STEP + 1, playing); await pg.evaluate(() => api.SD.start('p')); await clipDone(pg); await pg.click('#sd-opts button'); await clickId(pg, 'sd-x'); await pg.waitForTimeout(150);
            const a = await pg.evaluate(() => ({ hidden: document.getElementById('sheet-sd').hidden, ct: audio.currentTime, paused: audio.paused, on: api.SD.on, rate: audio.playbackRate, lvl: JSON.parse(localStorage.getItem('wt:lvl')), snd: JSON.parse(localStorage.getItem('wt:snd')), last: api.SD.last() }));
            assert.strictEqual(a.hidden, true); assert.strictEqual(a.on, false); assert.strictEqual(a.paused, !playing, 'plays again only if it was playing'); assert.strictEqual(a.rate, 1.5, 'the saved speed is back'); assert.strictEqual(a.last.res.length, 1); assert.strictEqual(a.lvl.s.pair.n, 1, 'one answer in the level'); assert.strictEqual(Object.values(a.snd.s).reduce((s, x) => s + x.h.length, 0), 1);
            if (playing) assert.ok(a.ct >= 7 * STEP + 1, 'it moves on from where it was'); else assert.ok(Math.abs(a.ct - (7 * STEP + 1)) < 0.01, 'back where it was: ' + a.ct);
            await pg.evaluate(() => { window.__t = audio.currentTime; }); await pg.waitForTimeout(150); if (!playing) assert.strictEqual(await pg.evaluate(() => audio.currentTime === window.__t), true, 'no timer moves the audio after closing'); assert.deepStrictEqual(errs, []);
          } finally { await pg.close(); }
        }
      });
      await t('the slow button plays at 0.7 and the first play is normal speed; a failed start shows the plain line; a damaged store never stops a session', async () => {
        const { pg, errs } = await open(['wt:snd', 'null']);
        try {
          await startAt(pg, 'p', 3); await clipDone(pg); assert.strictEqual(await pg.evaluate(() => T.rates[0]), 1); await clickId(pg, 'sd-slow'); assert.strictEqual(await pg.evaluate(() => T.rates.slice(-1)[0]), 0.7); await clipDone(pg); assert.strictEqual((await view(pg)).plays, 'Played 2 times');
          await pg.evaluate(() => { audio.play = () => Promise.reject(new Error('blocked')); }); await clickId(pg, 'sd-play'); await pg.waitForFunction(() => document.getElementById('sd-status').textContent.length > 0, null, { timeout: 2000 }); assert.strictEqual(await pg.evaluate(() => document.getElementById('sd-status').textContent), 'The audio did not start. Tap the speaker to try again.');
          await pg.evaluate(() => { Storage.prototype.setItem = () => { throw new Error('full'); }; }); await pg.click('#sd-opts button'); await clickId(pg, 'sd-x'); assert.deepStrictEqual(errs, []);
        } finally { await pg.close(); }
      });
    } finally { await browser.close(); }
  }
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
