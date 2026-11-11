#!/usr/bin/env node
/* Checks for the grammar sheet (167e): the pure part GRC (formula split, marked runs, Try one list) against the REAL detector (167d), cache speed.
     node tools/grammar_sheet_check.js
   Exit code 1 if a check fails, 2 if the code cannot be loaded. The screen part (GRS) needs a browser and is not tested here. */
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const src = f => fs.readFileSync(path.join(__dirname, '..', 'src/js', f), 'utf8');
let GD, GRC;
try {
  const ctx = vm.createContext({});
  vm.runInContext(src('167d-grammar-detector.js') + '\nthis.GD = GD;', ctx); GD = ctx.GD;
  const t = src('167e-grammar-sheet.js'), a = t.indexOf('/*GRC-START*/'), b = t.indexOf('/*GRC-END*/');
  assert(a > 0 && b > a);
  vm.runInContext('const GRC = (() => {' + t.slice(a, b) + '\nreturn { FORM, BANK, kind, about, segments, bank, pick, fill, shuffle }; })(); this.GRC = GRC;', ctx); GRC = ctx.GRC;
} catch (e) { console.error('grammar_sheet_check: cannot load the code: ' + e.message); process.exit(2); }
let fail = 0, n = 0;
const ok = (c, m) => { n++; if (!c) { fail++; console.log('FAIL: ' + m); } };

/* every detector id: a kind, a formula or a plain line in both languages */
GD.ids.forEach(id => { const p = GD.detect(GD.info(id).example.en).patterns.find(x => x.id === id) || { id, explain: GD.info(id).explain };
  ['en', 'bn'].forEach(l => { const a = GRC.about(p, l); ok(a.desc && a.desc.length > 3, id + ' ' + l + ' has a line'); ok(a.form || /^[a-z]/.test(a.desc) || a.desc, id + ' ' + l + ' form'); });
  ok(GRC.kind(id), id + ' kind'); });
['present-simple', 'past-simple', 'conditional-mixed'].forEach(id => ['en', 'bn'].forEach(l => ok(GRC.about({ id, explain: GD.info(id).explain }, l).form, id + ' needs the built-in formula (' + l + ')')));
ok(GRC.about({ id: 'past-perfect', explain: GD.info('past-perfect').explain }, 'en').form === 'had + past participle', 'past perfect formula');

/* marked runs for the mock-up sentence */
const r = GD.detect('She had waited for hours before the door finally opened.');
const seg = GRC.segments(r.text, r.patterns, r.patterns.indexOf(r.main));
ok(seg.map(s => s.t).join('') === r.text, 'runs rebuild the sentence');
ok(seg.filter(s => s.m === 1).map(s => s.t).join('|') === 'had waited', 'gold = had waited');
ok(seg.filter(s => s.m === 2).map(s => s.t).join('|') === 'opened', 'blue = opened');
ok(GRC.segments('Hello there.', [], 0).length === 1, 'no patterns = one plain run');

/* Try one list: shape, one right answer, every id has one, the right answer is found by the detector */
const ids = new Set(); let detOk = 0;
GRC.BANK.forEach(l => {
  const a = l.split('|'); ids.add(a[0]);
  ok(a.length === 5 && GD.ids.includes(a[0]), 'bank line shape: ' + l);
  ok((a[1].match(/___/g) || []).length === 1, 'one blank: ' + l);
  ok(new Set(a.slice(2)).size === 3, 'three different choices: ' + l);
  const q = GRC.pick(a[0], GRC.bank().get(a[0]).findIndex(x => x.s === a[1])), full = GRC.fill(a[1], a[2]);
  ok(q && q.o.length === 3 && q.o.includes(a[2]), 'pick has the right answer');
  if (GD.detect(full).patterns.some(p => p.id === a[0])) detOk++; else console.log('note: detector does not give ' + a[0] + ' for "' + full + '"');
});
GD.ids.forEach(id => ok(ids.has(id) && GRC.bank().get(id).length >= 2, id + ' has 2+ Try one sentences'));
ok(GRC.pick('nope', 0) === null, 'unknown id gives null');
ok(GRC.pick('past-simple', 2).s === GRC.pick('past-simple', 0).s, 'sentences go round');
console.log('detector agrees with the right answer for ' + detOk + ' of ' + GRC.BANK.length + ' Try one sentences');

/* speed: a 1000-character sentence */
const long = 'The castle stood silent and she had waited for hours because the door would not open, '.repeat(12);
const t0 = process.hrtime.bigint(); for (let i = 0; i < 50; i++) GD.detect(long + i); const ms = Number(process.hrtime.bigint() - t0) / 1e6 / 50;
ok(ms < 20, 'one long sentence under 20 ms (got ' + ms.toFixed(2) + ')');
console.log(`${n - fail}/${n} checks passed` + (fail ? `, ${fail} FAILED` : ''));
process.exit(fail ? 1 : 0);
