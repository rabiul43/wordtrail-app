#!/usr/bin/env node
/* Checks for the book preview (131b): the pure part BPC (clean list, estimate, words to learn first, minutes). No browser.
     node tools/book_preview_check.js
   Loads the REAL file from src/js/. Exit code 1 if a check fails, 2 if it cannot be loaded. The screen part (BPV) needs a browser and is not tested here. */
const fs = require('fs'), path = require('path'), vm = require('vm');
let BPC;
try {
  const t = fs.readFileSync(path.join(__dirname, '..', 'src/js/131b-book-preview.js'), 'utf8'), a = t.indexOf('/*BPC-START*/'), b = t.indexOf('/*BPC-END*/');
  if (a < 0 || b < a) throw new Error('markers missing');
  const ctx = vm.createContext({});
  vm.runInContext('const BPC = (() => {' + t.slice(a, b) + '\nreturn { SHARE, MIN_WORDS, MAX_LEARN, SEC_PER_WORD, clean, estimate, learn, minutes }; })(); this.BPC = BPC;', ctx); BPC = ctx.BPC;
} catch (e) { console.error('book_preview_check: cannot load the code: ' + e.message); process.exit(2); }
let n = 0, fail = 0;
const eq = (x, y, m) => { n++; if (JSON.stringify(x) !== JSON.stringify(y)) { fail++; console.log('FAIL: ' + m + '\n   got ' + JSON.stringify(x) + '\n   want ' + JSON.stringify(y)); } };

/* clean: bad rows, duplicates, case, odd counts */
const raw = [['Forlorn', 'C1', 12, 'A forlorn place.'], ['dread', 'B2', 30, 'Dread came.'], ['DREAD', 'B2', 5, 'x'], [5, 'B2'], null, 'str', ['', 'B1', 2], ['two words', 'B1', 2], ['gloom', 'C1'], ['ominous', 'C1', 0, 7]];
const c = BPC.clean(raw);
eq(c.map(x => x.w), ['forlorn', 'dread', 'gloom', 'ominous'], 'clean keeps real words once, lower case');
eq(c.map(x => x.c), [12, 30, 1, 1], 'clean: count at least 1');
eq(c[3].ex, '', 'clean: example not text -> empty');
eq(BPC.clean(null), [], 'clean(null)');

/* estimate */
const mk = (k) => Array.from({ length: 10 }, (_, i) => ({ w: 'w' + i, lv: 'C1', c: 10, ex: '' }));
const W = mk(), none = new Set(), all = new Set(W.map(x => x.w)), half = new Set(W.slice(0, 5).map(x => x.w));
eq(BPC.estimate(W, none, 2).pct, 75, 'Hard book, nothing known: 75');
eq(BPC.estimate(W, none, 1).pct, 85, 'Medium book, nothing known: 85');
eq(BPC.estimate(W, none, 0).pct, 92, 'Easy book, nothing known: 92');
eq(BPC.estimate(W, half, 2).pct, 88, 'Hard book, half known: 88 (87.5 rounds up)');
eq(BPC.estimate(W, all, 2).pct, 99, 'all known: capped at 99');
eq(BPC.estimate(W.slice(0, 7), none, 2), null, 'fewer than 8 words: null');
eq(BPC.estimate(W, none, 3), null, 'unknown level: null');
eq(BPC.estimate(W, none, undefined), null, 'no level: null');
const weighted = [{ w: 'a', c: 90 }, { w: 'b', c: 10 }].concat(Array.from({ length: 6 }, (_, i) => ({ w: 'z' + i, c: 0 })));
eq(BPC.estimate(weighted, new Set(['a']), 2).f < 0.5, true, 'frequent known word weighs more');
for (let i = 0; i <= 10; i++) { const k = new Set(W.slice(0, i).map(x => x.w)), p = BPC.estimate(W, k, 2).pct; if (i) eq(p >= BPC.estimate(W, new Set(W.slice(0, i - 1).map(x => x.w)), 2).pct, true, 'more known never lowers the percent (' + i + ')'); }

/* learn first: not known, most frequent first, then higher level, then A-Z, at most 15 */
const L = [{ w: 'b', lv: 'B2', c: 5 }, { w: 'a', lv: 'B2', c: 5 }, { w: 'c', lv: 'C2', c: 5 }, { w: 'd', lv: 'C1', c: 50 }, { w: 'e', lv: 'C1', c: 99 }];
eq(BPC.learn(L, new Set(['e']), 15).map(x => x.w), ['d', 'c', 'a', 'b'], 'order: count, level, A-Z; known left out');
eq(BPC.learn(Array.from({ length: 40 }, (_, i) => ({ w: 'x' + i, lv: '', c: 1 })), none, 15).length, 15, 'at most 15');
eq(BPC.learn(W, all, 15), [], 'all known: nothing to learn');

/* minutes: 12 s a word */
eq([1, 5, 15, 16, 30].map(BPC.minutes), [1, 1, 3, 4, 6], 'minutes');
console.log(`${n - fail}/${n} checks passed` + (fail ? `, ${fail} FAILED` : ''));
process.exit(fail ? 1 : 0);
