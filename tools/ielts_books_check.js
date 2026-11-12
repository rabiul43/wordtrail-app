#!/usr/bin/env node
/* Check for 103b-ielts-books.js (AC, EP): the pure rules only (no browser).  node tools/ielts_books_check.js
   Exit code 1 if a check fails. */
const fs = require('fs'), path = require('path'), vm = require('vm'), root = path.join(__dirname, '..');
let bad = 0; const ok = (c, m) => { console.log((c ? 'ok    ' : 'FAIL  ') + m); if (!c) bad++; };
const s = fs.readFileSync(path.join(root, 'src/js/103b-ielts-books.js'), 'utf8');
const cut = (a, b) => s.slice(s.indexOf(a) + a.length, s.indexOf(b));
const ctx = vm.createContext({});
vm.runInContext(cut('/*AC-START*/', '/*AC-END*/') + '\nthis.AC = { clean, pct, match };\n' + cut('/*EP-START*/', '/*EP-END*/') + '\nthis.EP = { NAME, isPhrase, pending };', ctx);
const { AC, EP } = ctx, J = x => JSON.parse(JSON.stringify(x));
ok(AC.clean(null) === null && AC.clean({ v: 2, b: {} }) === null && AC.clean({ v: 1 }) === null && AC.clean({ v: 1, b: 5 }) === null, 'clean: refuses missing, wrong-version and malformed data');
const d = AC.clean({ v: 1, min: 5, b: { 1: 11, 2: 4.6, 3: 'x', 4: 120, 5: 7 }, a: { 1: 0, 2: 1, 5: 'british', 9: 1 } });
ok(d.min === 5 && d.b.size === 3 && d.b.get('2') === 5 && !d.b.has('3') && !d.b.has('4'), 'clean: keeps percents 0-100 as whole numbers, drops junk');
ok(d.a.size === 3 && d.a.get('1') === 0 && !d.a.has('5'), 'clean: accent only 0 or 1');
ok(AC.clean({ v: 1, b: {} }).min === 5 && AC.clean({ v: 1, min: 500, b: {} }).min === 5, 'clean: default minimum is 5, bad minimum ignored');
ok(AC.pct(d, 1) === 11 && AC.pct(d, '7') === null && AC.pct(null, 1) === null, 'pct: number or null');
ok(AC.match(d, 1, true, '') && AC.match(d, 2, true, '') && !AC.match(d, 7, true, '') && !AC.match(d, 3, true, ''), 'IELTS-friendly: at the minimum counts, a book with no entry does not');
ok(AC.match(d, 7, false, '') && AC.match(null, 1, false, ''), 'no filter on: everything passes, even with no data');
ok(AC.match(d, 1, false, '0') && !AC.match(d, 1, false, '1') && !AC.match(d, 7, false, '0') && !AC.match(d, 5, false, '1'), 'accent: exact match; unknown accent is left out');
ok(AC.match(d, 1, true, '0') && !AC.match(d, 2, true, '0'), 'IELTS-friendly and accent combine (AND)');
ok(!AC.match(null, 1, true, ''), 'IELTS-friendly with no data: nothing passes');
ok(['however', 'Moreover', ' in addition ', 'make a decision', 'on the other hand', "it's a trade-off"].every(EP.isPhrase), 'isPhrase: linking words and 2-5 word collocations');
ok(['table', 'run', '', null, 'one two three four five six', 'a b1', 'x'.repeat(70)].every(w => !EP.isPhrase(w)), 'isPhrase: plain words, empty, too long, digits are not');
const words = [{ w: 'however', cols: [] }, { w: 'Make a decision', cols: ['essay PHRASES'] }, { w: 'table' }, { w: 'in addition', cols: ['Mine'] }, null, { w: 5 }];
const p = J(EP.pending(words)).map(e => e.w);
ok(p.length === 2 && p[0] === 'however' && p[1] === 'in addition', 'pending: only phrases not yet in the collection (name compared without case); bad entries skipped');
ok(EP.NAME === 'Essay phrases', 'collection name');
console.log(bad ? bad + ' check(s) FAILED' : 'all checks passed'); process.exit(bad ? 1 : 0);
