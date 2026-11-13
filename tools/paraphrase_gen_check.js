#!/usr/bin/env node
/* Automatic checks for the paraphrase question generator (167f): right answer = one synonym swapped in, wrong answers change the meaning,
   same part of speech, no names or numbers, the spoiler guard, and that it never throws. No browser, no npm install.
     node tools/paraphrase_gen_check.js
   Loads the REAL files from src/js/ (the real Core builds the book model, the real QG gives the sentences). Exit code 1 if a check fails, 2 if a file cannot be loaded. */
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const read = f => fs.readFileSync(path.join(__dirname, '..', 'src/js', f), 'utf8');
let Core, QG, PQ;
try {
  const cctx = vm.createContext({});
  vm.runInContext(read('010-core.js') + '\nthis.Core = Core;', cctx); Core = cctx.Core;
  const ctx = vm.createContext({ setTimeout, clearTimeout });
  vm.runInContext(read('167c-question-gen.js') + '\n' + read('167f-paraphrase-gen.js') + '\nthis.QG = QG; this.PQ = PQ;', ctx); QG = ctx.QG; PQ = ctx.PQ;
} catch (e) { console.error('paraphrase_gen_check: cannot load the code: ' + e.message); process.exit(2); }

let pass = 0, fail = 0; const queue = [];
const t = (name, fn) => queue.push([name, fn]);
const J = x => JSON.parse(JSON.stringify(x));
async function runAll() {
  for (const [name, fn] of queue) {
    try { await fn(); pass++; console.log('ok    ' + name); } catch (e) { fail++; console.log('FAIL  ' + name + '\n        ' + String(e && e.message).split('\n').slice(0, 6).join('\n        ')); }
  }
}

/* ---------- a small book: 5 chapters ---------- */
const MARK = ['alabaster', 'bartholomew', 'chrysanthemum', 'dromedary', 'effervescent'];
const ADJ = ['wretched', 'peculiar', 'luminous', 'tremendous', 'melancholy', 'splendid', 'dreadful', 'graceful', 'solitary', 'ancient', 'crumbling', 'radiant', 'fragrant', 'restless', 'invisible',
  'towering', 'sheltered', 'weathered', 'shimmering', 'venerable', 'forgotten', 'resplendent', 'mysterious', 'desolate', 'enormous', 'tranquil', 'vigilant', 'whispering', 'thunderous', 'benevolent'];
function chapterText(i) {   // 14 sentences; chapter 0 uses ADJ[0..27] once each, chapter i leaves out other words
  const m = MARK[i], out = [];
  for (let k = 0; k < 14; k++) {
    const a = ADJ[(2 * k + 3 * i) % ADJ.length], b = ADJ[(2 * k + 1 + 3 * i) % ADJ.length];
    out.push('The old ' + m + ' stood quietly beside the ' + a + ' garden while the ' + b + ' travellers rested nearby ' + (k % 2 ? 'at dusk' : 'by noon') + '.');
  }
  return out;
}
function bookOf(extra) {   // extra(i) = more sentences for chapter i
  let s = '';
  for (let i = 0; i < 5; i++) {
    s += 'CHAPTER ' + ['I', 'II', 'III', 'IV', 'V'][i] + '.\n\n';
    chapterText(i).concat(extra ? extra(i) : []).forEach((x, k) => { s += x + (k % 4 === 3 ? '\n\n' : ' '); });
    s += '\n\n';
  }
  return s;
}
const model = Core.parseBook(bookOf());
const BID = 'b1', ALL = { max: 50 };
// word data like DICT.get gives: one part of speech, synonyms and antonyms made of the word itself so the suffix always matches
const entry = (w, p) => ({ w, meanings: [{ pos: p || 'adjective', defs: [{ d: 'x', ex: '', syn: [], ant: [] }], syn: ['alt' + w, 'kin' + w], ant: ['opp' + w] }] });
const mkData = over => { const d = {}; ADJ.forEach(w => { d[w] = entry(w); }); return Object.assign(d, over || {}); };
const swapped = (q, w) => q.pre + w + q.post;
const wordsDiff = (a, b) => { const x = a.split(' '), y = b.split(' '); return x.length === y.length ? x.filter((w, i) => w !== y[i]).length : -1; };

t('builds paraphrase questions: 4 sentence choices, one right, shape is complete', () => {
  const qs = PQ.build(BID, model, 0, 0, { data: mkData(), max: 4 });
  assert.strictEqual(qs.length, 4);
  qs.forEach(q => {
    assert.strictEqual(q.type, 'para'); assert.strictEqual(q.v, 1); assert.strictEqual(q.ch, 0); assert.strictEqual(q.bid, BID);
    assert.strictEqual(q.choices.length, 4); assert.ok(q.answer >= 0 && q.answer < 4);
    assert.strictEqual(q.full, q.text); assert.strictEqual(q.pre + q.word + q.post, q.text);
    assert.strictEqual(q.bad.length, 3); assert.strictEqual(new Set(q.choices).size, 4);
  });
});
t('the right choice swaps ONE word for a synonym from the word data', () => {
  const data = mkData();
  PQ.build(BID, model, 0, 0, { data, max: 50 }).forEach(q => {
    assert.strictEqual(q.choices[q.answer], swapped(q, q.syn));
    assert.strictEqual(wordsDiff(q.text, q.choices[q.answer]), 1);
    assert.ok(data[q.word].meanings[0].syn.includes(q.syn), q.word + ' -> ' + q.syn);
  });
});
t('wrong answers change the meaning: one word swapped, never a synonym of the word, the antonym is used', () => {
  const data = mkData();
  PQ.build(BID, model, 0, 0, { data, max: 50 }).forEach(q => {
    const syns = data[q.word].meanings[0].syn;
    assert.ok(q.bad.includes('opp' + q.word), 'the antonym is used');
    q.bad.forEach(w => { assert.ok(!syns.includes(w) && w !== q.word, w); });
    q.choices.forEach((c, i) => { if (i !== q.answer) assert.strictEqual(wordsDiff(q.text, c), 1); });
    assert.deepStrictEqual(J(q.choices.filter((c, i) => i !== q.answer).sort()), J(q.bad.map(w => swapped(q, w)).sort()));
  });
});
t('other chapter words used as wrong answers share no synonym with the asked word', () => {
  const d = mkData();
  Object.keys(d).forEach(w => { d[w].meanings[0].ant = []; });   // no antonyms: the wrong answers must come from the chapter
  d.sheltered = { w: 'sheltered', meanings: [{ pos: 'adjective', syn: ['altwretched'], ant: [] }] };   // shares a synonym with 'wretched'
  const qs = PQ.build(BID, model, 0, 0, { data: d, max: 50 });
  assert.ok(qs.length >= 3);
  qs.forEach(q => { if (q.word === 'wretched') assert.ok(!q.bad.includes('sheltered')); });
  qs.forEach(q => assert.strictEqual(q.bad.length, 3));
});
t('same part of speech: a word with two parts of speech is skipped', () => {
  const d = mkData({ wretched: { w: 'wretched', meanings: [{ pos: 'adjective', syn: ['altwretched'], ant: [] }, { pos: 'noun', syn: ['kinwretched'], ant: [] }] } });
  assert.ok(!PQ.build(BID, model, 0, 0, { data: d, max: 50 }).some(q => q.word === 'wretched'));
});
t('same part of speech: wrong answers of another part of speech are not used', () => {
  const d = mkData(); Object.keys(d).forEach(w => { d[w].meanings[0].ant = []; });
  ['sheltered', 'weathered', 'shimmering', 'venerable'].forEach(w => { d[w] = entry(w, 'noun'); });
  PQ.build(BID, model, 0, 0, { data: d, max: 50 }).forEach(q => {
    assert.ok(!q.bad.some(w => d[w] && d[w].meanings[0].pos === 'noun'));
    assert.notStrictEqual(d[q.word].meanings[0].pos, 'noun');
  });
});
t('a synonym whose own data has another part of speech is rejected', () => {
  const d = mkData({ peculiar: { w: 'peculiar', meanings: [{ pos: 'adjective', syn: ['strangeness'], ant: [] }] }, strangeness: entry('strangeness', 'noun') });
  delete d.wretched;   // so 'peculiar' is the word asked in the first sentence
  assert.ok(!PQ.build(BID, model, 0, 0, { data: d, max: 50 }).some(q => q.word === 'peculiar'));
});
t('synonyms that are capitalised, a phrase, with digits or another ending are rejected', () => {
  const d = mkData({ peculiar: { w: 'peculiar', meanings: [{ pos: 'adjective', syn: ['Odd', 'out of the ordinary', 'odd2', 'oddly', 'weirds', 'strange'], ant: [] }] } });
  delete d.wretched;
  const q = PQ.build(BID, model, 0, 0, { data: d, max: 50 }).find(x => x.word === 'peculiar');
  assert.ok(q, 'a question is made'); assert.strictEqual(q.syn, 'strange');
  const d2 = mkData({ peculiar: { w: 'peculiar', meanings: [{ pos: 'adjective', syn: ['Odd', 'out of the ordinary', 'oddly', 'weirds'], ant: [] }] } });
  delete d2.wretched;
  assert.ok(!PQ.build(BID, model, 0, 0, { data: d2, max: 50 }).some(x => x.word === 'peculiar'));
});
t('the word keeps its ending: -ing words only get -ing synonyms', () => {
  const d = mkData({ crumbling: { w: 'crumbling', meanings: [{ pos: 'adjective', syn: ['decayed', 'falling'], ant: [] }] } });
  PQ.build(BID, model, 0, 0, { data: d, max: 50 }).forEach(q => { if (q.word === 'crumbling') assert.strictEqual(q.syn, 'falling'); });
});
t('a / an before the word stays right (right and wrong choices)', () => {
  const extra = i => i === 0 ? ['Beside the river stood an obsolete mill that nobody had used since the long hard winter began.'] : [];
  const m2 = Core.parseBook(bookOf(extra));
  const d = mkData({ obsolete: { w: 'obsolete', meanings: [{ pos: 'adjective', syn: ['dated', 'outdated', 'archaic'], ant: ['current', 'modern', 'active'] }] } });
  const q = PQ.build(BID, m2, 0, 0, { data: d, max: 80 }).find(x => x.word === 'obsolete');
  assert.ok(q, 'a question is made');
  assert.ok(['outdated', 'archaic'].includes(q.syn), q.syn);
  assert.ok(q.bad.every(w => /^[aeiou]/.test(w)), q.bad.join());
  q.choices.forEach(c => assert.ok(/ an [aeiou]/.test(c), c));
});
t('names are skipped (a word written with a capital inside a sentence of the chapter)', () => {
  const extra = i => i === 0 ? ['Then the Peculiar Inn kept the old lantern burning brightly through the long and silent night.'] : [];
  const m2 = Core.parseBook(bookOf(extra));
  const qs = PQ.build(BID, m2, 0, 0, { data: mkData(), max: 80 });
  assert.ok(qs.length > 0); assert.ok(!qs.some(q => q.word === 'peculiar'));
  assert.ok(!qs.some(q => q.bad.includes('peculiar') || q.syn === 'peculiar'));
});
t('number words and digits are skipped', () => {
  assert.ok(PQ.number('twelve') && PQ.number('Hundred') && PQ.number('third') && PQ.number('1920') && !PQ.number('garden'));
  const d = mkData({ twelve: entry('twelve'), hundred: entry('hundred'), thousand: entry('thousand') });
  const extra = i => i === 0 ? ['The old shepherd counted hundred sheep and twelve goats upon the thousand hills before the evening came.'] : [];
  const m2 = Core.parseBook(bookOf(extra));
  const qs = PQ.build(BID, m2, 0, 0, { data: d, max: 80 });
  assert.ok(!qs.some(q => ['hundred', 'twelve', 'thousand'].includes(q.word) || q.bad.some(w => ['hundred', 'twelve', 'thousand'].includes(w))));
  assert.ok(!PQ.words(BID, m2, 0, 0, 100).some(w => ['hundred', 'twelve', 'thousand'].includes(w)));
});
t('sentences that fail the QG quality filter are never used (digits, footnote debris)', () => {
  const extra = i => i === 0 ? ['In 1892 the wretched traveller crossed the weathered bridge before the radiant morning arrived again.',
    '[Footnote: the wretched traveller crossed the weathered bridge before the radiant morning came.]'] : [];
  const m2 = Core.parseBook(bookOf(extra));
  PQ.build(BID, m2, 0, 0, { data: mkData(), max: 80 }).forEach(q => assert.ok(!/1892|Footnote/.test(q.text)));
});
t('swap ideas: 1 to 3 fitting swaps, the asked swap first, every one from the word data', () => {
  const data = mkData(), qs = PQ.build(BID, model, 0, 0, { data, max: 50 });
  assert.ok(qs.length > 0);
  qs.forEach(q => {
    assert.ok(Array.isArray(q.ideas) && q.ideas.length >= 1 && q.ideas.length <= 3);
    assert.deepStrictEqual(J(q.ideas[0]), [q.word, q.syn]);
    assert.strictEqual(new Set(q.ideas.map(x => x[0])).size, q.ideas.length);
    q.ideas.forEach(([a, b]) => { assert.ok(q.text.split(/[^A-Za-z]+/).includes(a), a); assert.ok(data[a].meanings[0].syn.includes(b), a + ' -> ' + b); });
  });
  assert.ok(qs.some(q => q.ideas.length >= 2), 'a sentence with two usable words gives more than one idea');
});
t('one sentence serves one question; same data gives the same questions', () => {
  const a = PQ.build(BID, model, 0, 0, { data: mkData(), max: 50 }), b = PQ.build(BID, model, 0, 0, { data: mkData(), max: 50 });
  assert.deepStrictEqual(J(a), J(b));
  assert.strictEqual(new Set(a.map(q => q.sid)).size, a.length);
  assert.strictEqual(PQ.build(BID, model, 0, 0, { data: mkData(), max: 2 }).length, 2);
  assert.strictEqual(PQ.build(BID, model, 0, 0, { data: mkData(), max: 0 }).length, 0);
});
t('no word data, or word data without synonyms, gives no questions', () => {
  assert.deepStrictEqual(J(PQ.build(BID, model, 0, 0, {})), []);
  assert.deepStrictEqual(J(PQ.build(BID, model, 0, 0, { data: {} })), []);
  const d = mkData(); Object.keys(d).forEach(w => { d[w].meanings[0].syn = []; });
  assert.deepStrictEqual(J(PQ.build(BID, model, 0, 0, { data: d, max: 50 })), []);
  assert.deepStrictEqual(J(PQ.build(BID, model, 0, 0, { data: { wretched: null, peculiar: 5, luminous: { meanings: 'x' } }, max: 50 })), []);
});
t('fewer than 3 usable wrong answers = no question for that sentence', () => {
  const d = {}; ['wretched', 'peculiar'].forEach(w => { d[w] = entry(w); d[w].meanings[0].ant = []; });
  assert.deepStrictEqual(J(PQ.build(BID, model, 0, 0, { data: d, max: 50 })), []);
});
t('SPOILER GUARD: a chapter past the furthest one gives nothing', () => {
  const d = mkData();
  assert.deepStrictEqual(J(PQ.build(BID, model, 2, 0, { data: d, max: 50 })), []);
  assert.deepStrictEqual(J(PQ.words(BID, model, 2, 0, 20)), []);
  [[1, 0], [0, -1], [-1, 3], [1.5, 3], ['1', 3], [null, 3]].forEach(([c, f]) => assert.deepStrictEqual(J(PQ.build(BID, model, c, f, { data: d, max: 50 })), [], c + ',' + f));
});
t('SPOILER GUARD: words and wrong answers come only from the asked chapter', () => {
  const d = mkData({ bartholomew: entry('bartholomew'), chrysanthemum: entry('chrysanthemum') });   // marker words of chapters 1 and 2
  const only = new Set(['thunderous', 'benevolent']);   // not in chapter 0, but in later chapters
  const qs = PQ.build(BID, model, 0, 4, { data: d, max: 50 });
  assert.ok(qs.length > 0);
  qs.forEach(q => {
    const all = [q.word, q.syn, ...q.bad, ...q.choices].join(' ');
    assert.ok(!/bartholomew|chrysanthemum|dromedary|effervescent/.test(all), all);
    assert.ok(!q.bad.some(w => only.has(w)) && !only.has(q.word), all);
    assert.strictEqual(q.ch, 0);
  });
  assert.ok(!PQ.words(BID, model, 0, 4, 50).some(w => only.has(w)));
});
t('forChapter: looks up words, builds questions, reads nothing past the guard', async () => {
  const d = mkData(), asked = [];
  const lookup = async w => { asked.push(w); return d[w] || null; };
  const r = await PQ.forChapter(BID, model, 0, 0, { lookup });
  assert.strictEqual(r.ok, true); assert.ok(r.qs.length >= 1 && r.qs.length <= 4);
  assert.ok(asked.length <= 20 && asked.length > 0);
  asked.length = 0;
  const lk = await PQ.forChapter(BID, model, 3, 1, { lookup });
  assert.deepStrictEqual(J(lk), { ok: false, reason: 'locked' }); assert.strictEqual(asked.length, 0, 'nothing is looked up when locked');
});
t('forChapter never throws: failing, empty and slow lookups', async () => {
  const none = { ok: false, reason: 'none' };
  assert.deepStrictEqual(J(await PQ.forChapter(BID, model, 0, 0, { lookup: async () => { throw new Error('offline'); } })), none);
  assert.deepStrictEqual(J(await PQ.forChapter(BID, model, 0, 0, { lookup: async () => null })), none);
  assert.deepStrictEqual(J(await PQ.forChapter(BID, model, 0, 0, { lookup: () => new Promise(() => {}), wait: 20 })), none);
  assert.deepStrictEqual(J(await PQ.forChapter(BID, null, 0, 0, {})), none);
  assert.deepStrictEqual(J(await PQ.forChapter(BID, model, 0, 0, {})), none);   // no DICT here: no data, no questions, no error
});
t('the question generator (167c) still works with its new exports', () => {
  assert.ok(QG.build(BID, model, 0, 0, {}).length > 0);
  ['askable', 'toks', 'rng', 'seedOf', 'shuffle'].forEach(k => assert.strictEqual(typeof QG[k], 'function', k));
});

runAll().then(() => { console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0); });
