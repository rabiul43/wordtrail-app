#!/usr/bin/env node
/* Automatic checks for the question generator (167c): the sentence filter, the four question types (fill, vocab, true/false, order), the cache, and the SPOILER GUARD
   (a question can never use a chapter past the reader's furthest one). No browser, no npm install.
     node tools/question_gen_check.js
   Loads the REAL files from src/js/ (the real Core builds the book model). Exit code 1 if a check fails, 2 if a file cannot be loaded. */
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const read = f => fs.readFileSync(path.join(__dirname, '..', 'src/js', f), 'utf8');
let Core, QG;
try {
  const cctx = vm.createContext({});
  vm.runInContext(read('010-core.js') + '\nthis.Core = Core;', cctx); Core = cctx.Core;
  const ctx = vm.createContext({ setTimeout, clearTimeout });
  vm.runInContext(read('167c-question-gen.js') + '\nthis.QG = QG;', ctx); QG = ctx.QG;
} catch (e) { console.error('question_gen_check: cannot load the code: ' + e.message); process.exit(2); }

let pass = 0, fail = 0; const queue = [];
const t = (name, fn) => queue.push([name, fn]);
const J = x => JSON.parse(JSON.stringify(x));   // the code runs in its own sandbox: compare as plain data
const deepEq = (a, b) => assert.deepStrictEqual(J(a), J(b));
async function runAll() {
  for (const [name, fn] of queue) {
    try { await fn(); pass++; console.log('ok    ' + name); } catch (e) { fail++; console.log('FAIL  ' + name + '\n        ' + String(e && e.message).split('\n').slice(0, 6).join('\n        ')); }
  }
}

/* ---------- a small book: 5 chapters, each with its own marker words that no other chapter has ---------- */
const MARK = ['alabaster', 'bartholomew', 'chrysanthemum', 'dromedary', 'effervescent'];   // chapter 0..4 markers (also used as sentence words)
const ADJ = ['wretched', 'peculiar', 'luminous', 'tremendous', 'melancholy', 'splendid', 'dreadful', 'graceful', 'solitary', 'ancient', 'crumbling', 'radiant', 'fragrant', 'restless', 'invisible',
  'towering', 'sheltered', 'weathered', 'shimmering', 'venerable', 'forgotten', 'resplendent', 'mysterious', 'desolate', 'enormous', 'tranquil', 'vigilant', 'whispering', 'thunderous', 'benevolent'];
function chapterText(i) {   // 14 sentences, 28 different adjectives per chapter, so every adjective is rare in its chapter
  const m = MARK[i], out = [];
  for (let k = 0; k < 14; k++) {
    const a = ADJ[(2 * k + 3 * i) % ADJ.length], b = ADJ[(2 * k + 1 + 3 * i) % ADJ.length];
    out.push('The old ' + m + ' stood quietly beside the ' + a + ' garden while the ' + b + ' travellers rested nearby ' + (k % 2 ? 'at dusk' : 'by noon') + '.');
  }
  return out;
}
function rawBook() {
  let s = '';
  for (let i = 0; i < 5; i++) {
    s += 'CHAPTER ' + ['I', 'II', 'III', 'IV', 'V'][i] + '.\n\n';
    chapterText(i).forEach((x, k) => { s += x + (k % 4 === 3 ? '\n\n' : ' '); });
    s += '\n\n';
  }
  return s;
}
const model = Core.parseBook(rawBook());
const realCh = model.chapters.map((c, i) => i).filter(i => !model.chapters[i].front);   // indexes of real chapters
const markerOf = new Map(realCh.map((ci, k) => [ci, MARK[k]]));
const textOf = q => [q.pre, q.post, q.word, q.shown, q.text, q.full, ...q.choices].join(' ').toLowerCase();
const chS = ci => QG.sentences(model, ci, ci).map(x => x.t);   // usable sentences of a chapter
const ALL = [].concat(...realCh.map(chS));                          // every sentence of the whole book: a poisoned recap list

t('setup: the real parser gives 5 chapters with their own marker word', () => {
  assert.strictEqual(realCh.length, 5);
  realCh.forEach(ci => assert.ok(QG.sentences(model, ci, ci).length >= 10, 'chapter ' + ci + ' has sentences'));
});

/* ---------- the sentence filter ---------- */
const W = n => Array.from({ length: n }, (_, i) => ['quiet', 'river', 'moved', 'slowly', 'under', 'bridges', 'near', 'town', 'while', 'children', 'watched', 'from', 'windows', 'above', 'streets', 'below', 'and', 'nobody', 'spoke', 'about', 'weather', 'or', 'harvest', 'at', 'all'][i]).join(' ');
const S = n => 'The ' + W(n - 1) + '.';
t('filter: 7 words out, 8 in, 25 in, 26 out', () => {
  assert.ok(!QG.usable(S(7))); assert.ok(QG.usable(S(8))); assert.ok(QG.usable(S(25))); assert.ok(!QG.usable(S(26)));
});
t('filter: headings, footnote and page debris, digits, links, all capitals are out', () => {
  const bad = ['CHAPTER IV. THE RIVER AND THE OLD STONE BRIDGE NEAR TOWN', 'Chapter 12.', '[Footnote 3: See the earlier account of the river and its bridges here.]',
    'The river moved slowly under the bridges near town [12] while children watched.', 'The river moved slowly under the bridges near town while 40 children watched.',
    'The river moved slowly under the bridges near town, see www.example.com for more.', 'THE RIVER MOVED SLOWLY UNDER THE BRIDGES NEAR TOWN WHILE CHILDREN WATCHED.',
    '[Illustration: the river moved slowly under the bridges near the town gate.]', 'the river moved slowly under the bridges near town while children watched.',
    'The river moved slowly under the bridges near town while children watched', 'Page 45 the river moved slowly under the bridges near town while children watched.'];
  bad.forEach(x => assert.ok(!QG.usable(x), 'should be rejected: ' + x));
  assert.ok(QG.usable('\u201cThe river moved slowly under the bridges near town,\u201d she said, \u201cwhile children watched.\u201d'));
});
t('filter: heading sentences flagged by the parser (h) never become questions', () => {
  const m = { chapters: [{ title: 'x', front: false, start: 0, end: 2 }], sents: [{ t: S(10), ch: 0, h: true }, { t: S(11), ch: 0, h: false }] };
  deepEq(QG.sentences(m, 0, 0).map(s => s.id), [1]);
});
t('filter: every question sentence passes the filter', () => {
  realCh.forEach(ci => QG.build('b1', model, ci, ci, { defs: DEFS, recap: chS(ci).slice(2, 6) }).forEach(q => {
    if (q.type === 'order') q.choices.forEach(c => assert.ok(QG.usable(c))); else assert.ok(QG.usable(q.full));
  }));
});

/* ---------- the questions ---------- */
t('fill: 4 different words, the answer is right, the blank gives back the sentence, no choice is in the sentence', () => {
  const qs = QG.build('b1', model, realCh[1], realCh[1]).filter(q => q.type === 'fill');
  assert.ok(qs.length >= 5);
  qs.forEach(q => {
    assert.strictEqual(q.choices.length, 4); assert.strictEqual(new Set(q.choices).size, 4);
    assert.strictEqual(q.choices[q.answer], q.word); assert.strictEqual(q.pre + q.word + q.post, q.full);
    const inS = new Set((q.full.toLowerCase().match(/[a-z]+/g)));
    q.choices.forEach((c, i) => { if (i !== q.answer) assert.ok(!inS.has(c), 'wrong choice "' + c + '" is in the sentence'); });
    assert.ok(q.pre.length > 0, 'the blank is never the first word');
  });
  assert.strictEqual(new Set(qs.map(q => q.word)).size, qs.length, 'no word asked twice');
});
t('same book and chapter give the same questions (fixed order, cache-safe); another chapter gives other ones', () => {
  const a = QG.build('b1', model, realCh[2], realCh[2]), b = QG.build('b1', model, realCh[2], realCh[2]);
  deepEq(a, b); assert.notStrictEqual(JSON.stringify(a.map(q => q.id)), JSON.stringify(QG.build('b1', model, realCh[3], realCh[3]).map(q => q.id)));
});
const DEFS = {}; ADJ.forEach((w, i) => { DEFS[w] = 'sense number ' + i + ' as used in old books'; });
t('vocab: 4 different meanings, the right one at the answer index, the word is in the sentence, no meaning gives the word away', () => {
  const qs = QG.build('b1', model, realCh[1], realCh[1], { defs: DEFS }).filter(q => q.type === 'vocab');
  assert.ok(qs.length >= 3);
  qs.forEach(q => {
    assert.strictEqual(q.choices.length, 4); assert.strictEqual(new Set(q.choices).size, 4);
    assert.strictEqual(q.choices[q.answer], DEFS[q.word]); assert.strictEqual(q.pre + q.word + q.post, q.full);
    q.choices.forEach(c => assert.ok(!c.toLowerCase().includes(q.word.slice(0, 5))));
  });
});
t('vocab: no definitions (offline) means fill questions only, nothing else breaks', () => {
  const qs = QG.build('b1', model, realCh[1], realCh[1], {});
  assert.ok(qs.length > 0 && qs.every(q => q.type !== 'vocab') && qs.some(q => q.type === 'fill'));
});
t('vocab: fewer than 4 usable meanings means no vocab question (a bank of 4 is not possible)', () => {
  assert.ok(QG.build('b1', model, realCh[1], realCh[1], { defs: { wretched: 'poor', peculiar: 'odd', luminous: 'bright' } }).every(q => q.type !== 'vocab'));
});
t('max: the counts can be set', () => {
  const qs = QG.build('b1', model, realCh[1], realCh[1], { defs: DEFS, max: { fill: 2, vocab: 1 } });
  assert.strictEqual(qs.filter(q => q.type === 'fill').length, 2); assert.ok(qs.filter(q => q.type === 'vocab').length <= 1);
  const q2 = QG.build('b1', model, realCh[1], realCh[1], { max: { tf: 3, order: 0 }, recap: chS(realCh[1]).slice(0, 4) });
  assert.strictEqual(q2.filter(q => q.type === 'tf').length, 3); assert.strictEqual(q2.filter(q => q.type === 'order').length, 0);
});
t('front matter and bad input give no questions and no error', () => {
  deepEq(QG.build('b', null, 0, 0), []); deepEq(QG.build('b', { sents: [], chapters: [] }, 0, 0), []);
  model.chapters.forEach((c, i) => { if (c.front) deepEq(QG.build('b1', model, i, i), []); });
});


/* ---------- true or false ---------- */
const word = x => x.split(/\s+/);
t('tf: a true one is the real sentence; a false one has exactly ONE word changed, to a word of the same chapter that is not in the sentence', () => {
  const ci = realCh[2], inCh = new Set(); chS(ci).forEach(x => x.toLowerCase().match(/[a-z]+/g).forEach(w => inCh.add(w)));
  const qs = QG.build('b1', model, ci, ci).filter(q => q.type === 'tf');
  assert.ok(qs.length >= 4 && qs.some(q => q.changed) && qs.some(q => !q.changed), 'both kinds are made');
  qs.forEach(q => {
    deepEq(q.choices, ['true', 'false']); assert.strictEqual(q.answer, q.changed ? 1 : 0); assert.ok(QG.usable(q.full));
    if (!q.changed) { assert.strictEqual(q.text, q.full); assert.strictEqual(q.shown, ''); return; }
    assert.strictEqual(q.pre + q.shown + q.post, q.text); assert.strictEqual(q.pre + q.word + q.post, q.full); assert.notStrictEqual(q.text, q.full);
    const a = word(q.text), b = word(q.full); assert.strictEqual(a.length, b.length); assert.strictEqual(a.filter((x, i) => x !== b[i]).length, 1);
    assert.ok(inCh.has(q.shown), q.shown + ' is not a word of the chapter'); assert.ok(!q.full.toLowerCase().includes(q.shown));
  });
});
t('tf: the two kinds take turns, so the set is balanced', () => {
  const qs = QG.build('b1', model, realCh[3], realCh[3]).filter(q => q.type === 'tf'), f = qs.filter(q => q.changed).length;
  assert.ok(Math.abs(f - (qs.length - f)) <= 1, f + ' false of ' + qs.length);
});
t('every sentence is used by one question only (a fill answer never shows in a true/false line)', () => {
  realCh.forEach(ci => { const qs = QG.build('b1', model, ci, ci, { defs: DEFS, recap: chS(ci).slice(0, 4), max: { fill: 3, vocab: 2, tf: 3 } }); const ids = [].concat(...qs.map(q => q.sids || [q.sid])); assert.ok(qs.some(q => q.type === 'order') && qs.some(q => q.type === 'tf') && qs.some(q => q.type === 'vocab')); assert.strictEqual(new Set(ids).size, ids.length); });
});

/* ---------- event order ---------- */
t('order: 3 recap sentences become one question; the answer says where each story step sits in the mixed list', () => {
  const ci = realCh[1], cs = chS(ci), rc = [cs[9], cs[1], cs[5]];   // recap in any order: the story order is the chapter order
  const q = QG.build('b1', model, ci, ci, { recap: rc }).filter(x => x.type === 'order');
  assert.strictEqual(q.length, 1); const o = q[0];
  assert.strictEqual(o.choices.length, 3); assert.strictEqual(o.answer.length, 3); assert.strictEqual(new Set(o.choices).size, 3);
  assert.ok(o.sids[0] < o.sids[1] && o.sids[1] < o.sids[2]); assert.strictEqual(o.sid, o.sids[0]);
  o.answer.forEach((idx, k) => assert.strictEqual(o.choices[idx], model.sents[o.sids[k]].t));
  assert.strictEqual(o.full, [cs[1], cs[5], cs[9]].join(' '));
  assert.notStrictEqual(JSON.stringify(o.answer), JSON.stringify([0, 1, 2]), 'the list is never already in story order');
});
t('order: at most 4 sentences; a repeated recap sentence counts once; fewer than 3 usable ones means no order question', () => {
  const ci = realCh[2], cs = chS(ci);
  assert.strictEqual(QG.build('b1', model, ci, ci, { recap: cs.slice(0, 7) }).find(q => q.type === 'order').choices.length, 4);
  assert.ok(!QG.build('b1', model, ci, ci, { recap: [cs[0], cs[0], cs[0], cs[3]] }).some(q => q.type === 'order'));
  assert.ok(!QG.build('b1', model, ci, ci, { recap: [cs[0], cs[3], 'Not a sentence of this book at all.'] }).some(q => q.type === 'order'));
  assert.ok(!QG.build('b1', model, ci, ci, { recap: [] }).some(q => q.type === 'order')); assert.ok(!QG.build('b1', model, ci, ci, {}).some(q => q.type === 'order'));
  assert.ok(!QG.build('b1', model, ci, ci, { recap: 'x' }).some(q => q.type === 'order'));
});
t('order: same questions every time for the same book and chapter', () => {
  const ci = realCh[1], o = { recap: chS(ci).slice(1, 5), defs: DEFS }; deepEq(QG.build('b1', model, ci, ci, o), QG.build('b1', model, ci, ci, o));
});
t('order spoiler: a recap list with sentences of other chapters adds nothing from them; a later chapter gives nothing at all', () => {
  const ci = realCh[1], far = realCh[1], later = chS(realCh[3]), own = chS(ci);
  const q = QG.build('b1', model, ci, far, { recap: [later[1], later[4], later[7], own[2], own[6]] }).filter(x => x.type === 'order');
  assert.strictEqual(q.length, 0, 'only 2 sentences are from this chapter');
  const q3 = QG.build('b1', model, ci, far, { recap: [later[1], later[4], own[2], own[6], own[8]] }).find(x => x.type === 'order');
  assert.ok(q3 && q3.choices.length === 3 && !textOf(q3).includes(MARK[3]));
  deepEq(QG.build('b1', model, realCh[3], far, { recap: later.slice(0, 4), defs: DEFS }), []);
});

/* ---------- SPOILER GUARD ---------- */
t('guard: only whole numbers from 0 up to the furthest chapter pass', () => {
  assert.ok(QG.guard(0, 0)); assert.ok(QG.guard(2, 4)); assert.ok(QG.guard(4, 4));
  [[3, 2], [1, -1], [0, -1], [-1, 3], [1.5, 3], [1, 2.5], ['1', 3], [1, '3'], [NaN, 3], [1, NaN], [undefined, 3], [1, undefined], [null, null], [Infinity, Infinity], [1, Infinity]]
    .forEach(([c, f]) => assert.strictEqual(QG.guard(c, f), false, JSON.stringify([c, f])));
});
t('spoiler: with the reader at chapter k, no question for ANY later chapter exists', () => {
  realCh.forEach((far, k) => realCh.forEach(ci => {
    if (ci > far) {
      deepEq(QG.sentences(model, ci, far), []); deepEq(QG.build('b1', model, ci, far, { defs: DEFS }), []);
      deepEq(QG.vocabWords('b1', model, ci, far, 8), []);
    }
  }));
});
t('spoiler: no text of a later chapter (marker word) is in any question, choice or meaning, for every reader position and many books', () => {
  const allDefs = Object.assign({}, DEFS); MARK.forEach((m, i) => { allDefs[m] = 'a made-up meaning number ' + i + ' for the marker word'; });   // the marker words HAVE meanings: they could leak
  for (let b = 0; b < 12; b++) realCh.forEach((far, k) => realCh.forEach(ci => {
    if (ci > far) return;
    const qs = QG.build('book' + b, model, ci, far, { defs: allDefs, recap: ALL });   // the recap list holds sentences of EVERY chapter
    qs.forEach(q => {
      assert.ok(q.ch <= far && q.ch === ci);
      realCh.forEach((c2, k2) => { if (c2 > far) assert.ok(!textOf(q).includes(MARK[k2]) && !textOf(q).includes('number ' + k2 + ' for'), 'chapter ' + c2 + ' leaked into a question of chapter ' + ci + ' (reader at ' + far + ')'); });
      assert.ok(q.sid >= model.chapters[ci].start && q.sid < model.chapters[ci].end);
      (q.sids || []).forEach(id => assert.strictEqual(model.sents[id].ch, ci));
    });
  }));
});
t('spoiler: a meaning is used only for a word that is in the chapter asked (a meaning list that holds other chapters\' words cannot add choices)', () => {
  const poisoned = Object.assign({}, DEFS, { zeppelin: 'a long airship', labyrinth: 'a maze of paths', obsidian: 'a black volcanic glass', carnival: 'a festival with rides' });
  QG.build('b1', model, realCh[1], realCh[1], { defs: poisoned }).forEach(q => { const bad = ['airship', 'maze', 'volcanic', 'festival']; bad.forEach(x => assert.ok(!textOf(q).includes(x))); });
});
t('spoiler: a wrong chapter range in the model cannot pull in the next chapter (each sentence must say it is in the asked chapter)', () => {
  const m = JSON.parse(JSON.stringify(model)); const c = m.chapters[realCh[1]]; c.end = m.chapters[realCh[2]].end;   // chapter 1 now "ends" at the end of chapter 2
  const qs = QG.build('b1', m, realCh[1], realCh[1], { defs: DEFS });
  assert.ok(qs.length > 0); qs.forEach(q => { assert.ok(!textOf(q).includes(MARK[2])); assert.strictEqual(m.sents[q.sid].ch, realCh[1]); });
  assert.ok(QG.sentences(m, realCh[1], realCh[1]).every(s => m.sents[s.id].ch === realCh[1]));
});
t('spoiler: a sentence marked with a later chapter inside an earlier range is ignored', () => {
  const m = JSON.parse(JSON.stringify(model)); const c = m.chapters[realCh[0]];
  for (let k = c.start; k < c.end; k++) if (m.sents[k].t.includes(MARK[0])) m.sents[k].ch = realCh[3];
  deepEq(QG.sentences(m, realCh[0], realCh[0]), []);
});
t('furthest: from track progress, a started track counts to its first chapter, a finished one to its last', () => {
  const map = [0, 1, 3, -1, 5], span = [0, 2, 4, -1, 6];
  assert.strictEqual(QG.furthest({}, map, span), -1); assert.strictEqual(QG.furthest(null, map, span), -1); assert.strictEqual(QG.furthest({ 0: 0 }, map, span), -1);
  assert.strictEqual(QG.furthest({ 0: 0.4 }, map, span), 0); assert.strictEqual(QG.furthest({ 0: 1 }, map, span), 0);
  assert.strictEqual(QG.furthest({ 0: 1, 1: 0.2 }, map, span), 1); assert.strictEqual(QG.furthest({ 0: 1, 1: 1 }, map, span), 2);
  assert.strictEqual(QG.furthest({ 2: 0.5, 1: 1 }, map, span), 3); assert.strictEqual(QG.furthest({ 3: 1 }, map, span), -1);
  assert.strictEqual(QG.furthest({ 4: 1 }, map, span), 6); assert.strictEqual(QG.furthest({ 9: 1, x: 1 }, map, span), -1);
  assert.strictEqual(QG.furthest({ 1: 'a' }, map, span), -1); assert.strictEqual(QG.furthest({ 1: 1 }, null, null), -1);
});

/* ---------- the cache (a fake IndexedDB that counts what is read) ---------- */
function fakeIdb(start) {
  const d = Object.assign({}, start || {}), log = { get: [], set: [] };
  return { d, log, async get(k) { log.get.push(k); return d[k]; }, async set(k, v) { log.set.push(k); d[k] = JSON.parse(JSON.stringify(v)); return true; } };
}
const defineOk = async w => DEFS[w] || '';
t('cache: first call makes and saves the questions under qg:<book>:<chapter>, second call reads them', async () => {
  const db = fakeIdb(), ci = realCh[1];
  const a = await QG.forChapter('b1', model, ci, ci, { idb: db, define: defineOk, now: 1000 });
  assert.ok(a.ok && a.from === 'new' && a.qs.length > 0); deepEq(db.log.set, ['qg:b1:' + ci]);
  let called = 0; const b = await QG.forChapter('b1', model, ci, ci, { idb: db, define: async () => { called++; return ''; }, now: 2000 });
  assert.ok(b.ok && b.from === 'cache'); deepEq(b.qs, a.qs); assert.strictEqual(called, 0); assert.strictEqual(db.log.set.length, 1);
});
t('cache: it is per chapter (two chapters, two keys)', async () => {
  const db = fakeIdb();
  await QG.forChapter('b1', model, realCh[0], realCh[4], { idb: db, define: defineOk }); await QG.forChapter('b1', model, realCh[2], realCh[4], { idb: db, define: defineOk });
  deepEq(db.log.set.sort(), ['qg:b1:' + realCh[0], 'qg:b1:' + realCh[2]].sort());
});
t('cache: a locked chapter is refused BEFORE the cache is read, even when a saved copy exists', async () => {
  const later = realCh[3], db = fakeIdb({ ['qg:b1:' + later]: { v: QG.VER, ch: later, sig: QG.sig(model, later), ts: 1, vocab: true, qs: QG.build('b1', model, later, later, { defs: DEFS }) } });
  const r = await QG.forChapter('b1', model, later, realCh[1], { idb: db, define: defineOk });
  deepEq(r, { ok: false, reason: 'locked' }); deepEq(db.log.get, []); deepEq(db.log.set, []);
  for (const bad of [-1, NaN, undefined, null, "9", 2.5]) { const x = await QG.forChapter('b1', model, later, bad, { idb: db, define: defineOk }); assert.strictEqual(x.ok, false); }
  deepEq(db.log.get, []);
});
t('cache: a copy saved for another chapter under this chapter\'s key is thrown away and made again from the right chapter', async () => {
  const ci = realCh[1], later = realCh[3], planted = QG.build('b1', model, later, later, { defs: DEFS });
  const db = fakeIdb({ ['qg:b1:' + ci]: { v: QG.VER, ch: ci, sig: QG.sig(model, ci), ts: 1, vocab: true, qs: planted } });   // right header, wrong questions inside
  const r = await QG.forChapter('b1', model, ci, ci, { idb: db, define: defineOk });
  assert.ok(r.ok && r.from === 'new'); r.qs.forEach(q => { assert.strictEqual(q.ch, ci); assert.ok(!textOf(q).includes(MARK[3])); });
  const db2 = fakeIdb({ ['qg:b1:' + ci]: { v: QG.VER, ch: later, sig: QG.sig(model, later), ts: 1, vocab: true, qs: planted } });   // wrong header
  const r2 = await QG.forChapter('b1', model, ci, ci, { idb: db2, define: defineOk }); assert.strictEqual(r2.from, 'new'); r2.qs.forEach(q => assert.strictEqual(q.ch, ci));
});
t('cache: the reader moving back (furthest smaller than before) never shows a chapter saved earlier', async () => {
  const db = fakeIdb(); await QG.forChapter('b1', model, realCh[3], realCh[3], { idb: db, define: defineOk });
  const r = await QG.forChapter('b1', model, realCh[3], realCh[2], { idb: db, define: defineOk }); assert.strictEqual(r.reason, 'locked');
});
t('cache: changed text, an old version or another book is not served from the cache', async () => {
  const db = fakeIdb(), ci = realCh[1]; await QG.forChapter('b1', model, ci, ci, { idb: db, define: defineOk });
  const m2 = JSON.parse(JSON.stringify(model)); m2.sents[m2.chapters[ci].start + 1].t = S(12);
  assert.strictEqual((await QG.forChapter('b1', m2, ci, ci, { idb: db, define: defineOk })).from, 'new');
  db.d['qg:b1:' + ci].v = 0; assert.strictEqual((await QG.forChapter('b1', model, ci, ci, { idb: db, define: defineOk })).from, 'new');
  const e = JSON.parse(JSON.stringify(db.d['qg:b1:' + ci])); e.v = QG.VER; const db3 = fakeIdb({ ['qg:b2:' + ci]: e });
  assert.strictEqual((await QG.forChapter('b2', model, ci, ci, { idb: db3, define: defineOk })).from, 'new');   // questions inside say book b1
});
t('offline: no meanings means fill questions only, saved with vocab:false, and tried again after a day (not sooner)', async () => {
  const db = fakeIdb(), ci = realCh[1]; let calls = 0; const fail = async () => { calls++; throw new Error('offline'); };
  const a = await QG.forChapter('b1', model, ci, ci, { idb: db, define: fail, now: 0 });
  assert.ok(a.ok && a.qs.every(q => q.type !== 'vocab') && db.d['qg:b1:' + ci].vocab === false);
  const n = calls; assert.strictEqual((await QG.forChapter('b1', model, ci, ci, { idb: db, define: fail, now: 3600e3 })).from, 'cache'); assert.strictEqual(calls, n);
  const c = await QG.forChapter('b1', model, ci, ci, { idb: db, define: defineOk, now: 2 * 864e5 }); assert.strictEqual(c.from, 'new'); assert.ok(c.qs.some(q => q.type === 'vocab'));
});
t('lookups: at most 8 words are looked up, all from the asked chapter', async () => {
  const asked = []; await QG.forChapter('b1', model, realCh[1], realCh[1], { idb: fakeIdb(), define: async w => { asked.push(w); return DEFS[w] || ''; } });
  assert.ok(asked.length > 0 && asked.length <= 8);
  const inCh = new Set(); QG.sentences(model, realCh[1], realCh[1]).forEach(x => x.t.toLowerCase().match(/[a-z]+/g).forEach(w => inCh.add(w)));
  asked.forEach(w => assert.ok(inCh.has(w), w + ' is not in the chapter'));
});
t('failures: a broken cache or a broken lookup never throws and never blocks the questions', async () => {
  const ci = realCh[1], broken = { async get() { throw new Error('idb'); }, async set() { throw new Error('idb'); } };
  const r = await QG.forChapter('b1', model, ci, ci, { idb: broken, define: async () => { throw new Error('x'); } }); assert.ok(r.ok && r.qs.length > 0);
  assert.strictEqual((await QG.forChapter('b1', null, 0, 0, { idb: fakeIdb() })).ok, false);
  assert.strictEqual((await QG.forChapter('b1', model, ci, ci, { idb: fakeIdb(), define: () => new Promise(() => {}) , now: 0 })).ok, true);   // a lookup that never answers is cut after 6 s
});

t('cache: an order question whose sentences are from a later chapter is thrown away even under the right chapter header', async () => {
  const ci = realCh[1], later = realCh[3], bad = QG.build('b1', model, later, later, { recap: chS(later).slice(0, 4) }).find(q => q.type === 'order'), J2 = J(bad);
  J2.ch = ci;   // lies about its chapter; its sentence numbers are from the later one
  const db = fakeIdb({ ['qg:b1:' + ci]: { v: QG.VER, ch: ci, sig: QG.sig(model, ci), ts: 1, vocab: true, rc: true, qs: [J2] } });
  const r = await QG.forChapter('b1', model, ci, ci, { idb: db, define: defineOk, recap: chS(ci).slice(0, 4) });
  assert.strictEqual(r.from, 'new'); r.qs.forEach(q => { assert.ok(!textOf(q).includes(MARK[3])); (q.sids || [q.sid]).forEach(id => assert.strictEqual(model.sents[id].ch, ci)); });
});
t('cache: an old (version 1) entry is not served', async () => {
  const ci = realCh[1], db = fakeIdb(); await QG.forChapter('b1', model, ci, ci, { idb: db, define: defineOk, recap: chS(ci).slice(0, 3) });
  db.d['qg:b1:' + ci].v = 1; assert.strictEqual((await QG.forChapter('b1', model, ci, ci, { idb: db, define: defineOk, recap: chS(ci).slice(0, 3) })).from, 'new');
});
t('cache: saved without recap sentences, it is made again once they exist, then served from the cache', async () => {
  const ci = realCh[1], db = fakeIdb(), o = rc => ({ idb: db, define: defineOk, recap: rc, max: { fill: 3, vocab: 2, tf: 3 } });
  const a = await QG.forChapter('b1', model, ci, ci, o([])); assert.ok(a.ok && !a.qs.some(q => q.type === 'order') && db.d['qg:b1:' + ci].rc === false);
  assert.strictEqual((await QG.forChapter('b1', model, ci, ci, o([]))).from, 'cache');
  const b = await QG.forChapter('b1', model, ci, ci, o(chS(ci).slice(0, 4))); assert.strictEqual(b.from, 'new'); assert.ok(b.qs.some(q => q.type === 'order') && b.qs.some(q => q.type === 'tf'));
  const c = await QG.forChapter('b1', model, ci, ci, o(chS(ci).slice(0, 4))); assert.strictEqual(c.from, 'cache'); deepEq(c.qs, b.qs);
});
t('recap default: the open book\'s recap list (rcList, 145) is used; a model that is not the open book gets none', async () => {
  const ci = realCh[1], c2 = vm.createContext({ setTimeout, clearTimeout, S: { model }, rcList: x => chS(x).slice(1, 5) });
  vm.runInContext(read('167c-question-gen.js') + '\nthis.QG = QG;', c2);
  const r = await c2.QG.forChapter('b1', model, ci, ci, { idb: fakeIdb(), define: defineOk }); assert.ok(r.qs.some(q => q.type === 'order'));
  c2.S.model = { other: true }; const r2 = await c2.QG.forChapter('b1', model, ci, ci, { idb: fakeIdb(), define: defineOk }); assert.ok(r2.ok && !r2.qs.some(q => q.type === 'order'));
  c2.S.model = model; const r3 = await c2.QG.forChapter('b1', model, realCh[3], realCh[1], { idb: fakeIdb(), define: defineOk }); assert.strictEqual(r3.reason, 'locked');
});

runAll().then(() => { console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0); });
