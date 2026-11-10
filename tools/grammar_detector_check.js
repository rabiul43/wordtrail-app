#!/usr/bin/env node
/* Automatic checks for the grammar detector (167d): tenses, continuous, perfect, passive, modals, conditionals, old-style English, contractions,
   and the shape of every answer (English + Bengali explanation and example for every pattern). No browser, no npm install.
     node tools/grammar_detector_check.js        (add -v to list every sentence)
   Loads the REAL file from src/js/. Exit code 1 if a check fails, 2 if the file cannot be loaded. */
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
let GD;
try {
  const ctx = vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'src/js/167d-grammar-detector.js'), 'utf8') + '\nthis.GD = GD;', ctx); GD = ctx.GD;
} catch (e) { console.error('grammar_detector_check: cannot load the code: ' + e.message); process.exit(2); }
const verbose = process.argv.includes('-v');
const J = x => JSON.parse(JSON.stringify(x));

/* [sentence, the ids it must give, in order]. The expected answers come from grammar, not from what the code printed. */
const CASES = [
  /* simple */
  ['She walks to school every day.', ['present-simple']],
  ['They play football after school.', ['present-simple']],
  ['The sun rises in the east.', ['present-simple']],
  ['Water boils at 100 degrees.', ['present-simple']],
  ['We visited my uncle yesterday.', ['past-simple']],
  ['He went to the market.', ['past-simple']],
  ['The children played in the garden.', ['past-simple']],
  ['I will call you tomorrow.', ['future-simple']],
  ['Do you like tea?', ['present-simple']],
  ['She did not come to the party.', ['past-simple']],
  ['I think he is happy.', ['present-simple', 'present-simple']],
  /* continuous */
  ['I am reading a story.', ['present-continuous']],
  ['They were playing cricket when it started to rain.', ['past-continuous', 'past-simple']],
  ['This time tomorrow we will be flying to Dhaka.', ['future-continuous']],
  ['Is he coming with us?', ['present-continuous']],
  ['What are you doing?', ['present-continuous']],
  ['He is going to buy a new phone.', ['future-going-to']],
  ['She is going to school.', ['present-continuous']],
  /* perfect */
  ['I have finished my homework.', ['present-perfect']],
  ['She has never seen snow.', ['present-perfect']],
  ['Have you eaten lunch?', ['present-perfect']],
  ['The train had left before we arrived.', ['past-perfect', 'past-simple']],
  ['By next June I will have finished school.', ['future-perfect']],
  /* perfect continuous */
  ['She has been studying since morning.', ['present-perfect-continuous']],
  ['They had been waiting for two hours.', ['past-perfect-continuous']],
  ['By May he will have been working here for ten years.', ['future-perfect-continuous']],
  /* passive */
  ['Rice is grown in Bangladesh.', ['passive-present-simple']],
  ['The bridge was built in 1990.', ['passive-past-simple']],
  ['The result will be announced tomorrow.', ['passive-future']],
  ['The room is being cleaned now.', ['passive-present-continuous']],
  ['The house was being painted.', ['passive-past-continuous']],
  ['The letter has been sent.', ['passive-present-perfect']],
  ['The door had been locked by the guard.', ['passive-past-perfect']],
  ['The work will have been finished by Friday.', ['passive-future-perfect']],
  ['The work must be finished today.', ['passive-modal']],
  ['Was the window broken by the boy?', ['passive-past-simple']],
  ['She was tired after the long walk.', ['past-simple']],
  /* modal */
  ['She can swim very fast.', ['modal-can']],
  ['Could you open the window, please?', ['modal-could']],
  ['It may rain this evening.', ['modal-may']],
  ['He might be late.', ['modal-might']],
  ['We must leave now.', ['modal-must']],
  ['You should drink more water.', ['modal-should']],
  ['I would like some tea.', ['modal-would']],
  ['You ought to see a doctor.', ['modal-ought']],
  ['He could have won the race.', ['modal-could']],
  ['I have to go home now.', ['modal-have-to']],
  ['She will be late. May is a hot month.', ['future-simple', 'present-simple']],
  ['I will do my best.', ['future-simple']],
  ['She will have a drink.', ['future-simple']],
  /* conditional */
  ['If you heat ice, it melts.', ['conditional-0']],
  ['If it rains tomorrow, we will stay at home.', ['conditional-1']],
  ['Unless you hurry, you will miss the bus.', ['conditional-1']],
  ['If you see him, tell him.', ['conditional-1']],
  ['If I had a car, I would drive to work.', ['conditional-2']],
  ['I would buy a house if I won the lottery.', ['conditional-2']],
  ['If I were you, I would apologise.', ['conditional-2']],
  ['If she had studied harder, she would have passed the exam.', ['conditional-3']],
  ['Had I known, I would have come.', ['conditional-3']],
  ['If I had slept well, I would feel fine now.', ['conditional-mixed']],
  ['I asked if he was at home.', ['past-simple', 'past-simple']],
  /* contractions */
  ["I don't know.", ['present-simple']],
  ["She isn't coming today.", ['present-continuous']],
  ["He's gone to the shop.", ['present-perfect']],
  ["She's reading a letter.", ['present-continuous']],
  ["They've finished the work.", ['present-perfect']],
  ["We'll see you at six.", ['future-simple']],
  ["I can't swim.", ['modal-can']],
  ["Won't you come in?", ['future-simple']],
  ["I'd gone before he came.", ['past-perfect', 'past-simple']],
  /* old-style text */
  ['Thou art my friend.', ['present-simple']],
  ['Thou shalt not steal.', ['future-simple']],
  ['He that hath ears to hear, let him hear.', ['present-simple']],
  ['I have loved thee with an everlasting love.', ['present-perfect']],
  ['Thou hast done well.', ['present-perfect']],
  ['The Lord is my shepherd; I shall not want.', ['present-simple', 'future-simple']],
  ['Whither goest thou?', ['present-simple']],
  ['He doth protest too much.', ['present-simple']],
  ['If thou hadst been here, my brother would not have died.', ['conditional-3']],
  ['I know not what thou wilt do.', ['present-simple', 'future-simple']],
  ['Blessed are the meek, for they shall inherit the earth.', ['present-simple', 'future-simple']],
  ['It was the best of times, it was the worst of times.', ['past-simple', 'past-simple']],
  ["'Twas the night before Christmas, when all through the house not a creature was stirring.", ['past-simple', 'past-continuous']],
  ['He loveth the sea and the ships that sail upon it.', ['present-simple', 'present-simple']],
  ['Thou lovest me, and I love thee.', ['present-simple', 'present-simple']],
  ['What hath God wrought?', ['present-perfect']],
  ['Were I rich, I would help you.', ['conditional-2']],
  ['Thou wast with me in the garden.', ['past-simple']],
  ['The King hath spoken, and the people have heard.', ['present-perfect', 'present-perfect']],
  /* nothing to find (not a tense, or not covered) */
  ['Good morning!', []],
  ['What a lovely day!', []],
  ['Close the door.', []],
  ['', []]
];

let pass = 0, fail = 0;
const ok = (name, fn) => { try { fn(); pass++; if (verbose) console.log('ok    ' + name); } catch (e) { fail++; console.log('FAIL  ' + name + '\n        ' + String(e && e.message).split('\n').slice(0, 6).join('\n        ')); } };
const ids = s => GD.detectText(s).reduce((a, r) => a.concat(r.patterns.map(p => p.id)), []);

CASES.forEach(([s, want]) => ok('"' + s + '" -> ' + (want.join(', ') || 'nothing'), () => deepEq(ids(s), want)));
function deepEq(a, b) { assert.deepStrictEqual(J(a), J(b)); }

ok('at least 40 sentences are tested', () => assert.ok(CASES.length >= 40, 'only ' + CASES.length));
ok('at least 12 old-style sentences are tested', () => assert.ok(CASES.filter(c => /thou|thee|hath|doth|hast|wilt|shalt|goest|lovest|loveth|'Twas|Whither|wast|hadst|Lord|King|Blessed|best of times/i.test(c[0])).length >= 12));
ok('every id in the catalogue has English and Bengali name, explanation and example', () => {
  assert.ok(GD.ids.length >= 35);
  GD.ids.forEach(id => { const i = GD.info(id); ['name', 'explain', 'example'].forEach(k => ['en', 'bn'].forEach(l => assert.ok(i[k] && typeof i[k][l] === 'string' && i[k][l].length > 2, id + '.' + k + '.' + l))); assert.ok(/[\u0980-\u09FF]/.test(i.explain.bn) && /[\u0980-\u09FF]/.test(i.example.bn), id + ' bn is not Bengali'); });
});
ok('the short examples are short', () => GD.ids.forEach(id => { const i = GD.info(id); assert.ok(i.example.en.length <= 60 && i.explain.en.length <= 130, id); }));
ok('every id the detector returns for the tested sentences exists in the catalogue', () => CASES.forEach(c => ids(c[0]).forEach(id => assert.ok(GD.info(id), id))));
ok('all tense, passive, modal and conditional groups were seen at least once in the tests', () => {
  const seen = new Set(); CASES.forEach(c => ids(c[0]).forEach(id => seen.add(id)));
  const miss = GD.ids.filter(id => !seen.has(id)); assert.strictEqual(miss.length, 0, 'never tested: ' + miss.join(', '));
});
ok('a pattern carries its words and the range matches the sentence', () => {
  const s = 'They had been waiting for an hour.', r = GD.detect(s), p = r.patterns[0];
  assert.strictEqual(p.id, 'past-perfect-continuous'); assert.strictEqual(p.text, 'had been waiting'); assert.strictEqual(s.slice(p.s, p.e), p.text);
  assert.ok(p.explain.en && p.explain.bn && p.example.en && p.example.bn);
});
ok('a conditional joins both parts and says which', () => {
  const p = GD.detect('If I had a car, I would drive to work.').patterns;
  assert.strictEqual(p.length, 1); deepEq(p[0].parts, ['past-simple', 'modal-would']); assert.strictEqual(p[0].text, 'had a car, I would');
});
ok('old-style forms are listed with their modern form', () => {
  const p = GD.detect('He that hath ears to hear.').patterns[0]; deepEq(p.old, [{ from: 'hath', to: 'has' }]);
  deepEq(GD.detect('Thou art my friend.').patterns[0].old, [{ from: 'art', to: 'are' }]);
  assert.strictEqual(GD.detect('She walks home.').patterns[0].old, undefined);
});
ok('"art" and "may" as ordinary words are not verbs', () => {
  deepEq(ids('The art of war is old.'), ['present-simple']);
  deepEq(ids('We go there in May.'), ['present-simple']);
});
ok('modal variants (could have / will have been) are marked', () => {
  assert.strictEqual(GD.detect('He could have won.').patterns[0].variant, 'perfect');
  assert.strictEqual(GD.detect('She had to leave early.').patterns[0].variant, 'past');
});
ok('main is the clause that is not a sub clause', () => {
  const r = GD.detect('When she arrived, he was cooking.');
  assert.strictEqual(r.main.id, 'past-continuous'); assert.strictEqual(r.patterns[0].sub, true);
  assert.strictEqual(GD.detect('If it rains, we will stay.').main.id, 'conditional-1');
});
ok('a text is split into sentences with positions', () => {
  const t = 'Mr. Smith lives here. He was walking home! Have you seen it?', r = GD.detectText(t);
  assert.strictEqual(r.length, 3); deepEq(r.map(x => x.main.id), ['present-simple', 'past-continuous', 'present-perfect']);
  r.forEach(x => assert.ok(t.slice(x.s, x.e).length > 5 && t.slice(x.s, x.e).trim() === t.slice(x.s, x.e)));
});
ok('curly apostrophes work like straight ones', () => deepEq(ids('She\u2019s reading. They\u2019ve gone.'), ['present-continuous', 'present-perfect']));
ok('bad input never throws', () => {
  [null, undefined, 5, {}, [], '   ', '...', '!!!', '1234', "'''", 'a'.repeat(5000), '\u0985\u0986\u0987', '- , ; :'].forEach(x => { const r = GD.detect(x); assert.strictEqual(typeof r.ok, 'boolean'); assert.ok(Array.isArray(r.patterns)); GD.detectText(x); });
});
ok('speed: 1000 sentences in well under a second', () => {
  const t0 = Date.now(); for (let i = 0; i < 1000; i++) GD.detect(CASES[i % CASES.length][0]);
  const ms = Date.now() - t0; assert.ok(ms < 1000, ms + ' ms');
});

console.log('\ngrammar_detector_check: ' + pass + ' passed, ' + fail + ' failed (' + CASES.length + ' sentences)');
process.exit(fail ? 1 : 0);
