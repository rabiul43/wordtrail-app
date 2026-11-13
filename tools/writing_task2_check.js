#!/usr/bin/env node
/* Check for Writing Task 2 (WT2, WRC in 169s-writing-task2.js, Task 63): syntax of the whole file, the pure rules (prompts, word count, clock, saved-word
   forms, used-word analysis, draft clean-up) with the real academic-word matcher (AWC from 161f) and a small stand-in word list, and the wiring
   (build.py, back button in 270, IELTS skill sheet in 169o, Bengali strings).
     node tools/writing_task2_check.js      Exit code 1 if a check fails.
   It does NOT open a browser, so it cannot test the real screen: typing, the mirror layer, rotating the phone or closing the app (test those by hand). */
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.join(__dirname, '..'), read = f => fs.readFileSync(path.join(root, f), 'utf8');
let bad = 0; const ok = (c, m) => { console.log((c ? 'ok    ' : 'FAIL  ') + m); if (!c) bad++; };
const js = read('src/js/169s-writing-task2.js');
try { new vm.Script('(function(){' + js + '\n})', { filename: '169s-writing-task2.js' }); ok(true, 'syntax: the whole file compiles'); } catch (e) { ok(false, 'syntax: ' + e.message); }
const aw = read('src/js/161f-academic-words.js');
const awc = aw.slice(aw.indexOf('/*AWC-START*/'), aw.indexOf('/*AWC-END*/'));
const ctx = vm.createContext({});
vm.runInContext('const AWC = (() => {' + awc + '\nreturn { compile, lookup, match }; })();\n' + js.slice(js.indexOf('/* WRC-START */'), js.indexOf('/* WRC-END */')) + '\nthis.C = WRC; this.A = AWC;', ctx);
const C = ctx.C, A = ctx.A, J = x => JSON.parse(JSON.stringify(x));
// ---- prompts
ok(C.PROMPTS.length >= 12 && new Set(C.PROMPTS.map(p => p.id)).size === C.PROMPTS.length, 'prompts: at least 12, every id different (' + C.PROMPTS.length + ')');
ok(C.PROMPTS.every(p => C.THEMES.some(t => t.id === p.theme) && p.text.length > 40 && p.kind), 'prompts: each has a known theme, a question and a kind');
ok(C.THEMES.every(t => C.PROMPTS.some(p => p.theme === t.id)), 'prompts: every theme has at least one question');
ok(C.PROMPTS.some(p => /reading fiction is a waste of time/.test(p.text)), 'prompts: the books theme has the fiction question');
ok(C.pick('books', 0).id !== C.pick('books', 1).id && C.pick('books', 2).id === C.pick('books', 0).id, 'pick: rotates inside the theme');
ok(C.pick('nope', 3).id === C.PROMPTS[3].id && C.byTheme('all').length === C.PROMPTS.length, 'pick: "all" or an unknown theme uses every question');
ok(C.pick('books', -5).id && C.pick('books', NaN).id, 'pick: a bad counter still gives a question');
// ---- counting and clock
ok(C.countWords('') === 0 && C.countWords('  \n ') === 0 && C.countWords(null) === 0, 'countWords: empty is 0');
ok(C.countWords("Don't stop; well-known facts (2020) matter.") === 6, 'countWords: don\'t and well-known are one word each, numbers count (got ' + C.countWords("Don't stop; well-known facts (2020) matter.") + ')');
ok(C.countWords('one\ntwo\n\nthree') === 3, 'countWords: new lines separate words');
ok(C.countWords('এটি বাংলা লেখা') === 3, 'countWords: other scripts count too');
ok(C.left(1000 + 40 * 60000, 1000, 2400) === 2400 && C.left(5000, 4001, 2400) === 1 && C.left(5000, 9999, 2400) === 0 && C.left(NaN, 1, 2400) === 0, 'left: whole seconds, never below 0 or above the total');
ok(C.fmt(2400) === '40:00' && C.fmt(65) === '1:05' && C.fmt(-3) === '0:00' && C.fmt(0) === '0:00', 'fmt: 40:00, 1:05, never negative');
ok(C.MINS === 40 && C.MIN_WORDS === 250 && C.COUNT_W === 100, 'constants: 40 minutes, 250 words, a session counts from 100 words');
// ---- saved-word forms
const f = w => C.forms(w).sort().join(',');
ok(C.forms('establish').includes('establishes') && C.forms('establish').includes('established') && C.forms('establish').includes('establishing'), 'forms: -es -ed -ing');
ok(C.forms('make').includes('making') && C.forms('study').includes('studies') && C.forms('study').includes('studied'), 'forms: e+ing and y to ies/ied');
ok(f('Give up') === 'give up' && C.forms('') .length === 0, 'forms: a phrase is kept as written, empty gives nothing');
// ---- analyse
const M = A.compile({ w: [[1, 'establish', 'established establishes establishing'], [2, 'research', 'researcher researchers'], [4, 'indicate', 'indicates indicated indication']], l: ['moreover', 'however', 'in addition'] });
const text = "I strongly disagree with this view. Firstly, fiction can establish empathy because readers live inside another person's mind. Moreover, research indicates that regular readers have a wider vocabulary. However, I accept that some books are written only for entertainment.";
const a = C.analyse(text, M, ['establish', 'Indicate', 'vocabulary', 'give up', 'zebra']);
ok(a.words === 39, 'analyse: words (got ' + a.words + ')');
ok(a.acad.map(x => x.h).sort().join() === 'establish,indicate,research', 'analyse: three academic word families (got ' + a.acad.map(x => x.h) + ')');
ok(a.links.map(x => x.l).sort().join() === 'however,moreover', 'analyse: linking words however, moreover (got ' + a.links.map(x => x.l) + ')');
ok(a.mine.join() === 'establish,indicate,vocabulary', 'analyse: My Words used by form, case ignored; a word not used is not listed (got ' + a.mine + ')');
ok(a.spans.every((s, i) => s.s < s.e && (i === 0 || a.spans[i - 1].e <= s.s)), 'analyse: spans are sorted and never overlap');
ok(a.spans.every(s => s.k === 'a' ? A.lookup(M, text.slice(s.s, s.e)) : /^(however|moreover)$/i.test(text.slice(s.s, s.e))), 'analyse: every span covers exactly a listed word or a linking word');
const g = C.analyse('Please give up smoking. They gave up.', M, ['give up', 'gave up', 'giveup']);
ok(g.mine.join() === 'gave up,give up', 'analyse: a saved phrase must appear as written (got ' + g.mine + ')');
ok(C.analyse('Researching is good', M, ['research']).mine.join() === 'research' && C.analyse('A researchable idea', M, ['research']).mine.length === 0, 'analyse: a simple form (researching) matches the saved word, a longer word (researchable) does not');
const two = C.analyse('Moreover it works.\nHowever it fails.', M, []);
ok(two.spans.length === 2 && two.spans[1].s === 19, 'analyse: spans count from the start of the whole text across lines (got ' + JSON.stringify(two.spans) + ')');
const e = C.analyse('', M, ['x']); ok(e.words === 0 && !e.acad.length && !e.mine.length && !e.spans.length, 'analyse: empty text gives nothing');
const n = C.analyse('Hello there friend', null, null); ok(n.words === 3 && !n.acad.length && !n.links.length && !n.mine.length, 'analyse: no word list and no saved words still counts words');
// ---- draft clean-up
const d0 = { pid: 'b1', text: 'hello', start: 1000, end: 1000 + 2400000, mins: 40, fin: 0, logged: 0 };
ok(JSON.stringify(J(C.clean(d0))) === JSON.stringify(d0), 'clean: a good draft is returned as it is');
ok(C.clean(null) === null && C.clean({}) === null && C.clean(Object.assign({}, d0, { pid: 'zz' })) === null && C.clean(Object.assign({}, d0, { text: 5 })) === null && C.clean(Object.assign({}, d0, { end: 500 })) === null && C.clean(Object.assign({}, d0, { start: 'x' })) === null, 'clean: wrong shapes are ignored');
ok(C.clean(Object.assign({}, d0, { text: 'x'.repeat(30000) })).text.length === C.MAX_TEXT, 'clean: very long text is cut at ' + C.MAX_TEXT + ' characters');
ok(C.clean(Object.assign({}, d0, { fin: true, logged: 2 })).fin === 1 && C.clean(Object.assign({}, d0, { mins: 99 })).mins === 40, 'clean: flags are 0 or 1, minutes are always 40');
// ---- wiring
const build = read('build.py');
ok(build.indexOf('169r-speaking-part2.js') < build.indexOf('169s-writing-task2.js') && build.indexOf('169s-writing-task2.js') < build.indexOf('170-sync-points-drift.js'), 'build.py: the JS file is after 169r and before 170');
ok(build.includes('src/css/94z-writing-task2.css') && build.indexOf('94y-speaking-part2.css') < build.indexOf('94z-writing-task2.css'), 'build.py: the CSS file is listed after 94y');
ok(build.indexOf('161f-academic-words.js') < build.indexOf('169s-writing-task2.js') && build.indexOf('147-word-store.js') < build.indexOf('169s-writing-task2.js') && build.indexOf('169o-ielts-hub.js') < build.indexOf('169s-writing-task2.js'), 'build.py: AWC (161f), WS (147) and IE (169o) are loaded before it');
const back = read('src/js/270-sheets-nextup-back.js');
ok(/\(WT2\.on \? 1 : 0\)/.test(back) && /else if \(WT2\.on\) WT2\.close\(\)/.test(back), '270: Back counts the screen and closes it');
ok(/w: \['writing', 'paraphrase'\]/.test(read('src/js/169o-ielts-hub.js')), '169o: Writing Task 2 is the main Writing button in the IELTS skill sheet');
ok(/id: 'writing'/.test(js) && /LearnHub\.register/.test(js), 'hub: registered as the Learn hub tile "writing"');
ok(!/localStorage\.setItem|fetch\(|XMLHttpRequest|sendBeacon/.test(js), 'privacy: the file makes no network call and writes only through store');
ok(!/audio\.(play|pause)|\bS\.book\b/.test(js), 'playback: the file does not touch the audio or the open book');
const bn = JSON.parse(read('src/i18n/bn.json'));
const strings = ['Start writing', 'Finish writing', 'Another question', 'Essay finished', 'Writing Task 2', 'Used from My Words:', 'Linking words:', 'Academic words:', 'Counted as a Writing session.', 'Keep editing', 'New essay'];
ok(strings.every(s => bn.dict[s]), 'bn.json: the main new strings are there');
const used = Array.from(js.matchAll(/'([A-Z][^'\n]{6,})'/g)).map(m => m[1]).filter(s => /^[A-Z][a-z]/.test(s) && !/^(Escape|Error)/.test(s) && !/ $/.test(s) && !C.PROMPTS.some(p => p.text === s));   // the questions are exam text and stay in English; strings ending in a space are the first part of a joined line (checked by the rx lines below)
const miss = used.filter(s => !bn.dict[s] && !bn.rx.some(r => new RegExp(r[0]).test(s)));
ok(miss.length === 0, 'bn.json: every visible English string in the file has a Bengali line' + (miss.length ? ' (missing: ' + miss.join(' | ') + ')' : ''));
ok(['40 minutes', '186 / 250 words', '3 academic words', '1 academic word', '12:30 left'.replace(/^/, 'Continue: '), '85 words in 12:05'].every(s => bn.rx.some(r => new RegExp(r[0]).test(s)) || bn.dict[s]), 'bn.json: the joined lines (minutes, word counts, Continue) have a Bengali rule');
console.log(bad ? '\n' + bad + ' check(s) failed' : '\nAll checks passed'); process.exit(bad ? 1 : 0);
