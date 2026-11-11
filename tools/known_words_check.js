#!/usr/bin/env node
/* Checks for the known-words store (148e) and its sync rules in 295. No browser, no npm install.
     node tools/known_words_check.js
   Loads the REAL 148e file twice (two simulated devices, each with its own storage) and the REAL acResolve, AC_MERGE and category line from 295.
   Exit code 1 if a check fails, 2 if a file cannot be loaded. */
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const read = f => fs.readFileSync(path.join(__dirname, '..', 'src/js', f), 'utf8');
let pass = 0, fail = 0;
const t = (name, fn) => { try { fn(); pass++; console.log('ok    ' + name); } catch (e) { fail++; console.log('FAIL  ' + name + '\n      ' + (e && e.message)); } };

/* one device = its own disk (localStorage text) and its own copy of KW */
function device() {
  const disk = {}, ls = {};
  const sb = { store: { get(k, d) { try { const v = disk[k]; return v ? JSON.parse(v) : d; } catch (e) { return d; } }, set(k, v) { disk[k] = JSON.stringify(v); } },
    window: { addEventListener(e, f) { ls[e] = f; } } };
  vm.createContext(sb);
  vm.runInContext(read('148e-known-words.js') + '\n;this.KW = KW; this.KWC = KWC;', sb);
  return { disk, KW: sb.KW, KWC: sb.KWC, ls };
}
let A, ACR, ACM, LIB;
try {
  A = device();
  const src = read('295-account-sync.js');
  const fn = (name) => { const i = src.indexOf('function ' + name + '('); if (i < 0) throw new Error(name + ' not found'); let d = 0, j = src.indexOf('{', i); for (let k = j; k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}' && --d === 0) return src.slice(i, k + 1); } throw new Error('no end'); };
  const am = /const AC_MERGE = [^\n]+;/.exec(src), cat = /\['library', [^\n]+\],/.exec(src);
  if (!am || !cat) throw new Error('AC_MERGE or library category not found');
  const sb = { QR: {}, BT: {}, LL: {}, KW: A.KW, acWords: () => null, acKeyOf: x => x, acUnion: () => null };
  vm.createContext(sb);
  vm.runInContext(am[0] + '\nconst acIsObj = x => !!x && typeof x === "object" && !Array.isArray(x);\n' + fn('acResolve') + '\nthis.AC_MERGE = AC_MERGE; this.acResolve = acResolve; this.LIB = ' + cat[0].replace(/,\s*$/, ''), sb);
  ACR = sb.acResolve; ACM = sb.AC_MERGE; LIB = sb.LIB;
} catch (e) { console.log('cannot load: ' + e.message); process.exit(2); }

t('words are cleaned: case, spaces, curly apostrophe; numbers, spaces inside, symbols and empty are not words', () => {
  const n = A.KWC.norm;
  assert.strictEqual(n('  Dread '), 'dread'); assert.strictEqual(n("Don’t"), "don't"); assert.strictEqual(n('well-known'), 'well-known'); assert.strictEqual(n('a'), 'a');
  ['', ' ', 'two words', 'abc1', '-ab', "ab'", 'x'.repeat(41), null, 5, undefined, {}].forEach(x => assert.strictEqual(n(x), '', JSON.stringify(x)));
  assert.strictEqual(n('x'.repeat(40)), 'x'.repeat(40));
});
t('add / isKnown / count / remove on one device; stored as ONE sorted lower-case string', () => {
  const d = device();
  assert.strictEqual(d.KW.count(), 0); assert.strictEqual(d.KW.isKnown('dread'), false);
  assert.strictEqual(d.KW.add(['Forlorn', 'dread', 'DREAD', 'bad word', '']), 2);
  assert.strictEqual(d.KW.add('dread'), 0); assert.strictEqual(d.KW.add('ominous'), 1);
  assert.strictEqual(d.disk['wt:known'], '"dread forlorn ominous"');
  assert.strictEqual(d.KW.count(), 3); assert.ok(d.KW.isKnown(' Dread ')); assert.ok(!d.KW.isKnown('tremble')); assert.ok(!d.KW.isKnown(''));
  assert.strictEqual(d.KW.remove(['dread', 'nothing']), 1); assert.strictEqual(d.KW.remove('dread'), 0);
  assert.strictEqual(d.disk['wt:known'], '"forlorn ominous"'); assert.strictEqual(d.KW.count(), 2);
});
t('a second page on the same storage sees the words; a change from another tab is picked up', () => {
  const d = device(); d.KW.add(['one', 'two']);
  d.disk['wt:known'] = JSON.stringify('one two three'); assert.strictEqual(d.KW.count(), 2, 'cached until the stored text is read again');
  d.ls.storage({ key: 'wt:known' }); assert.strictEqual(d.KW.count(), 3); assert.ok(d.KW.isKnown('three'));
});
t('bad stored data is ignored and repaired by the next add', () => {
  [5, { a: 1 }, ['x'], null, ''].forEach(v => { const d = device(); if (v !== null) d.disk['wt:known'] = JSON.stringify(v); assert.strictEqual(d.KW.count(), 0); assert.strictEqual(d.KW.add('ok'), 1); assert.strictEqual(d.disk['wt:known'], '"ok"'); });
});

t('sync wiring in 295: wt:known is in the library category and is merged, not overwritten', () => {
  assert.ok(LIB[2]('wt:known')); assert.ok(LIB[2]('wt:words')); assert.ok(!LIB[2]('wt:known2'));
  assert.ok(ACM('wt:known')); assert.ok(!ACM('wt:favs'));
});
t('TWO DEVICES: each knows different words, the merge gives both devices all of them', () => {
  const a = device(), b = device();
  a.KW.add(['dread', 'forlorn', 'gloom']); b.KW.add(['ominous', 'dread', 'tremble']);
  const ra = a.disk['wt:known'], rb = b.disk['wt:known'];
  const m1 = ACR('wt:known', ra, rb, true), m2 = ACR('wt:known', rb, ra, false);   // as device A sees it, and as device B sees it
  assert.strictEqual(m1, '"dread forlorn gloom ominous tremble"'); assert.strictEqual(m1, m2, 'same result from either side');
  a.disk['wt:known'] = m1; b.disk['wt:known'] = m2;
  [a, b].forEach(d => { const k = device(); k.disk['wt:known'] = d.disk['wt:known']; ['dread', 'forlorn', 'gloom', 'ominous', 'tremble'].forEach(w => assert.ok(k.KW.isKnown(w), w)); assert.strictEqual(k.KW.count(), 5); });
});
t('merge is repeatable and order does not matter; merging a copy with itself changes nothing', () => {
  const x = '"b a c"', y = '"d c"', m = ACR('wt:known', x, y, true);
  assert.strictEqual(m, '"a b c d"'); assert.strictEqual(ACR('wt:known', m, x, true), m); assert.strictEqual(ACR('wt:known', y, m, false), m); assert.strictEqual(ACR('wt:known', m, m, true), m);
});
t('later changes: a word added on one device after a sync reaches the other on the next merge', () => {
  const a = device(), b = device(); a.KW.add(['one', 'two']); b.disk['wt:known'] = ACR('wt:known', b.disk['wt:known'] || '""', a.disk['wt:known'], false) || a.disk['wt:known'];
  assert.strictEqual(b.KW.count(), 2); b.KW.add('three');
  a.disk['wt:known'] = ACR('wt:known', a.disk['wt:known'], b.disk['wt:known'], false);
  a.ls.storage({ key: null });   // 295 reloads the page after it writes merged data; a reload reads the storage again
  assert.ok(a.KW.isKnown('three')); assert.strictEqual(a.KW.count(), 3);
});
t('an empty or damaged copy never wipes the other copy; something that is not text gives null (the newer copy wins)', () => {
  assert.strictEqual(ACR('wt:known', '""', '"x y"', true), '"x y"'); assert.strictEqual(ACR('wt:known', '"x y"', '""', true), '"x y"');
  assert.strictEqual(ACR('wt:known', '["x"]', '"y"', true), null); assert.strictEqual(ACR('wt:known', 'not json', '"y"', true), null); assert.strictEqual(ACR('wt:known', '"y"', '{"a":1}', true), null);
});
t('size: 20,000 average words stay far below the 900 KB sync limit; the next word is refused, nothing is lost', () => {
  const d = device(), mk = i => { let s = '', n = i + 1; while (n > 0) { s += String.fromCharCode(97 + (n - 1) % 26); n = Math.floor((n - 1) / 26); } return s + 'ing'; };   // ~8 letters
  const words = Array.from({ length: 20000 }, (_, i) => mk(i));
  assert.strictEqual(d.KW.add(words), 20000); const len = d.disk['wt:known'].length;
  console.log('      20,000 words = ' + len + ' characters, ' + Math.round(len / 9000) + '% of the 900,000 limit');
  assert.ok(len < 200000 && len < 900000 / 4);
  assert.strictEqual(d.KW.add('onemoreword'), 0); assert.strictEqual(d.KW.count(), 20000); assert.ok(!d.KW.isKnown('onemoreword'));
  assert.strictEqual(d.KW.remove('onemoreword'), 0); assert.strictEqual(d.KW.remove(words[0]), 1); assert.strictEqual(d.KW.add('onemoreword'), 1);
});
t('size: two full devices merge to under 400,000 characters and the merge is capped at 40,000 words', () => {
  const L = i => { let s = '', n = i + 1; while (n > 0) { s += String.fromCharCode(97 + (n - 1) % 26); n = Math.floor((n - 1) / 26); } return s; }, mk = (p, n) => Array.from({ length: n }, (_, i) => p + L(i) + 'xx').join(' ');
  const m = A.KW.merge(mk('a', 20000), mk('b', 20000)); assert.strictEqual(m.split(' ').length, 40000); assert.ok(m.length < 400000, m.length);
  const big = A.KW.merge(mk('c', 30000), mk('d', 30000)); assert.strictEqual(big.split(' ').length, 40000, 'capped');
  assert.strictEqual(A.KW.merge(big, mk('d', 30000)).split(' ').length, 40000);
});
t('speed: 20,000 isKnown calls on a full list are instant after the first load', () => {
  const d = device(); d.KW.add(Array.from({ length: 5000 }, (_, i) => 'w' + String.fromCharCode(97 + i % 26) + String.fromCharCode(97 + Math.floor(i / 26) % 26) + String.fromCharCode(97 + Math.floor(i / 676))));
  const t0 = Date.now(); let n = 0; for (let i = 0; i < 20000; i++) if (d.KW.isKnown('wab' + (i % 7 ? 'c' : 'a'))) n++; const ms = Date.now() - t0;
  assert.ok(ms < 300, ms + ' ms');
});
console.log(`${pass}/${pass + fail} checks passed` + (fail ? `, ${fail} FAILED` : ''));
process.exit(fail ? 1 : 0);
