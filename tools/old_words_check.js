#!/usr/bin/env node
/* Automatic checks for the old-words and idioms matcher (OWC in src/js/161d-old-words.js) with the REAL data files
   (src/data/old-words.json, idioms.json). No browser, no npm install:   node tools/old_words_check.js
   It proves the matching rules and the speed of matching; the lines, the tap and the card need a browser (tools/old_words_browser_check.js).
   Exit code 1 if a check fails, 2 if a file cannot be loaded. */
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const root = path.join(__dirname, '..');
let OWC, W, I;
try {
  const src = fs.readFileSync(path.join(root, 'src/js/161d-old-words.js'), 'utf8'), a = src.indexOf('/*OWC-START*/'), b = src.indexOf('/*OWC-END*/');
  if (a < 0 || b < a) throw new Error('OWC markers missing');
  const ctx = {}; vm.createContext(ctx);
  OWC = vm.runInContext(src.slice(a, b) + '\nOWC;', ctx);
  W = JSON.parse(fs.readFileSync(path.join(root, 'src/data/old-words.json'), 'utf8'));
  I = JSON.parse(fs.readFileSync(path.join(root, 'src/data/idioms.json'), 'utf8'));
} catch (e) { console.error('old_words_check: cannot load: ' + e.message); process.exit(2); }

let ran = 0, bad = 0;
const t = (name, fn) => { ran++; try { fn(); console.log('ok   ' + name); } catch (e) { bad++; console.log('FAIL ' + name + ': ' + e.message); } };
const M = OWC.compile(W, I);
const show = s => Array.from(OWC.match(M, s).map(x => x.k + ':' + s.slice(x.s, x.e)));

t('the mock-up sentence: hath, the idiom, Whilst, hold my tongue', () => {
  const s = '\u201cHe hath no wish to trouble you,\u201d she said, at the end of her tether. \u201cWhilst you speak so, I cannot hold my tongue.\u201d';
  assert.deepStrictEqual(show(s), ['w:hath', 'i:at the end of her tether', 'w:Whilst', 'i:hold my tongue']);
});
t('capitals and curly apostrophes are ignored', () => assert.deepStrictEqual(show('HATH it so; ne\u2019er again, \u2019tis said'), ['w:HATH', 'w:ne\u2019er', 'w:\u2019tis']));
t('a quote mark in front of a word is not part of it', () => assert.deepStrictEqual(show("He said 'hath' twice"), ['w:hath']));
t("a possessive on an old word still marks the word only", () => assert.deepStrictEqual(show("the foe's camp"), ['w:foe']));
t('an idiom form with {p} works for every possessive and other forms', () => {
  assert.deepStrictEqual(show('She held their tongue.'), ['i:held their tongue']);
  assert.deepStrictEqual(show('at the end of my tether'), ['i:at the end of my tether']);
});
t('an idiom is not matched across a comma or a full stop', () => assert.deepStrictEqual(show('hold, my tongue'), []));
t('words inside an idiom are not marked twice (no overlap)', () => {
  const h = OWC.match(M, 'at the end of her tether and hath');
  for (let i = 1; i < h.length; i++) assert(h[i].s >= h[i - 1].e, 'overlap');
});
t('a word that is also a modern word is not marked on its own', () => {
  assert.deepStrictEqual(show('The art of war. Leaves wilt in the sun.'), []);
  assert.deepStrictEqual(show('Thou art kind, and thou wilt see.'), ['w:Thou', 'w:art', 'w:thou', 'w:wilt']);
});
t('ordinary modern text is left alone', () => assert.deepStrictEqual(show('The cat sat on the mat while it rained before noon.'), []));
t('an empty or odd text does not throw', () => { assert.strictEqual(OWC.match(M, '').length, 0); assert.strictEqual(OWC.match(M, null).length, 0); OWC.match(M, '\u2026 \u201c \u201d --'); });
t('every entry of both files can be found', () => {
  for (const e of W.w) if (!e.amb) assert(show('x ' + e.id + ' y').length === 1, 'word not found: ' + e.id);
  for (const e of I.i) {
    const forms = [e.p].concat(e.f || []);
    for (const f of forms) { const s = 'x ' + f.replace(/\{p\}/g, 'her') + ' y', h = OWC.match(M, s); assert(h.length >= 1 && h.some(x => x.k === 'i'), 'idiom not found: ' + f); }
  }
});
t('speed: 2000 sentences matched in under 250 ms (one chapter), second call is just reading the saved answer', () => {
  const base = ['It was a quiet morning and the garden was full of birds.', 'He hath no wish to trouble you, she said, at the end of her tether.', 'Whilst you speak so, I cannot hold my tongue.', 'They walked home before the rain came down on the hill.'];
  const t0 = process.hrtime.bigint(); let n = 0;
  for (let i = 0; i < 2000; i++) n += OWC.match(M, base[i % 4]).length;
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  console.log('     2000 sentences, ' + n + ' hits, ' + ms.toFixed(1) + ' ms');
  assert(ms < 250, ms.toFixed(1) + ' ms');
});
console.log('\nran ' + ran + ', failed ' + bad);
process.exit(bad ? 1 : 0);
