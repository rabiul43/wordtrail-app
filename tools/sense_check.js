#!/usr/bin/env node
/* Automatic checks for the sense picker and word-family rules (164-word-sense.js). No browser, no network, no npm install.
     node tools/sense_check.js
   Loads the REAL file. Exit code 1 if a check fails, 2 if the file cannot be loaded. */
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
let SENSE;
try { const c = vm.createContext({}); vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/js/164-word-sense.js'), 'utf8') + '\nthis.SENSE = SENSE;', c); SENSE = c.SENSE; }
catch (e) { console.error('sense_check: cannot load the code: ' + e.message); process.exit(2); }
const plain = x => JSON.parse(JSON.stringify(x));
const fam = (...a) => plain(SENSE.family(...a));
let pass = 0, fail = 0;
function t(name, fn) { try { fn(); pass++; console.log('ok    ' + name); } catch (e) { fail++; console.log('FAIL  ' + name + '\n        ' + String(e.message).split('\n').slice(0, 6).join('\n        ')); } }
const D = (w, meanings) => ({ v: 1, w, meanings });
const FORLORN = D('forlorn', [{ pos: 'adjective', defs: [{ d: 'Pitifully sad and lonely.', ex: 'She sat alone, looking forlorn.', syn: [], ant: [] }, { d: 'Hopeless; without any chance.', ex: '', syn: [], ant: [] }] }]);
const BANK = D('bank', [{ pos: 'noun', defs: [{ d: 'A place that keeps and lends money.', ex: '', syn: [], ant: [] }] }, { pos: 'noun', defs: [{ d: 'The land beside a river or lake.', ex: 'We sat on the bank of the river.', syn: ['shore'], ant: [] }] }]);

t('pick: the sense that shares words with the sentence wins, and it is called overlap (a best guess)', () => {
  const s = plain(SENSE.pick(FORLORN, 'She sat alone in the garden, looking forlorn and tired.'));
  assert.strictEqual(s.d, 'Pitifully sad and lonely.'); assert.strictEqual(s.basis, 'overlap'); assert.ok(s.score >= 2);
});
t('pick: a later sense can win over the first listed one', () => {
  const s = plain(SENSE.pick(BANK, 'He walked slowly along the river bank at dawn.'));
  assert.strictEqual(s.d, 'The land beside a river or lake.'); assert.strictEqual(s.basis, 'overlap'); assert.strictEqual(s.pos, 'noun');
});
t('pick: synonyms of a sense count as evidence too', () => {
  assert.strictEqual(SENSE.pick(BANK, 'They rested on the shore near the bank.').d, 'The land beside a river or lake.');
});
t('pick: nothing shared, or no sentence, gives the first listed sense and says so (basis first, never a guess)', () => {
  ['Nobody noticed the weather that evening.', '', null, undefined].forEach(sent => {
    const s = plain(SENSE.pick(BANK, sent)); assert.strictEqual(s.basis, 'first'); assert.strictEqual(s.d, 'A place that keeps and lends money.'); assert.strictEqual(s.score, 0);
  });
});
t('pick: the word itself and very common words are not evidence', () => {
  assert.strictEqual(plain(SENSE.pick(BANK, 'bank bank the and with that this')).basis, 'first');
  assert.strictEqual(plain(SENSE.pick(D('walk', [{ pos: 'verb', defs: [{ d: 'To walk on foot.', ex: '', syn: [], ant: [] }] }]), 'We walked and walked.')).basis, 'first');
});
t('pick: endings do not matter (walked / walking / walks)', () => {
  const d = D('stroll', [{ pos: 'verb', defs: [{ d: 'To walk slowly for pleasure.', ex: '', syn: [], ant: [] }] }, { pos: 'noun', defs: [{ d: 'A paper bag.', ex: '', syn: [], ant: [] }] }]);
  assert.strictEqual(plain(SENSE.pick(d, 'They were walking home.')).basis, 'overlap');
});
t('pick: no data, no meanings or empty definitions give null and never throw', () => {
  [null, undefined, {}, { meanings: [] }, { meanings: [{ defs: [] }] }, { meanings: [{ defs: [{ d: '' }] }] }, { meanings: [null] }].forEach(d => assert.strictEqual(SENSE.pick(d, 'a sentence here'), null));
});
t('pick: a tie goes to the sense listed first', () => {
  const d = D('x', [{ pos: 'noun', defs: [{ d: 'Garden tool.', ex: '', syn: [], ant: [] }, { d: 'Garden house.', ex: '', syn: [], ant: [] }] }]);
  assert.strictEqual(plain(SENSE.pick(d, 'the garden path')).d, 'Garden tool.');
});

t('family: forlorn -> forlornly, forlornness (rules only, offline)', () => assert.deepStrictEqual(fam('forlorn', ['adjective'], []), ['forlornly', 'forlornness']));
t('family: spelling changes (happy -> happily, happiness)', () => assert.deepStrictEqual(fam('happy', ['adjective'], []), ['happily', 'happiness']));
t('family: a verb gets s, ed, ing, er', () => assert.deepStrictEqual(fam('walk', ['verb'], []), ['walks', 'walked', 'walking', 'walker']));
t('family: a doubled consonant and a dropped e (stop, make)', () => {
  assert.ok(fam('stop', ['verb'], []).includes('stopping')); assert.ok(fam('make', ['verb'], []).includes('making'));
});
t('family: a derived word goes back to its root (forlornly -> forlorn, forlornness)', () => assert.deepStrictEqual(fam('forlornly', ['adverb'], []), ['forlorn', 'forlornness']));
t('family: words of the pool with the same root come first; the word itself is never listed', () => {
  const f = fam('forlorn', ['adjective'], ['Forlornness', 'garden', 'forlorn', 'forlornly', 'lonely']);
  assert.deepStrictEqual(f, ['forlornly', 'forlornness']); assert.ok(!f.includes('forlorn'));
});
t('family: a prefix is taken off only when the pool knows the root (unhappy)', () => {
  assert.strictEqual(fam('unhappy', ['adjective'], ['happy'])[0], 'happy');
  assert.ok(!fam('unhappy', ['adjective'], []).includes('happy'));
});
t('family: no wild guesses: an ordinary word with no known root keeps itself as the root', () => {
  assert.ok(fam('hundred', ['noun'], []).every(f => f.startsWith('hundred')));
  assert.ok(fam('better', [], []).every(f => f.startsWith('better')));
});
t('family: at most 6, no repeats, lower case; junk gives an empty list', () => {
  const f = fam('Play', [], ['PLAYER', 'playing', 'played', 'plays', 'playful', 'playless', 'playment', 'replay']);
  assert.ok(f.length <= 6); assert.strictEqual(new Set(f).size, f.length); assert.ok(f.every(x => x === x.toLowerCase()));
  ['', null, undefined, 'a1', 'it', 'don\'t', 42].forEach(w => assert.deepStrictEqual(fam(w, [], []), []));
  assert.deepStrictEqual(fam('forlorn', null, null).slice(0, 1).length, 1);
});
console.log('\n' + (fail ? fail + ' FAILED, ' + pass + ' passed' : 'all ' + pass + ' passed')); process.exit(fail ? 1 : 0);
