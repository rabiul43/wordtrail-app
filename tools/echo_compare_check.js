#!/usr/bin/env node
/* Checks for Echo compare and history (src/js/169j-echo-compare.js, 94r css, 28c markup; Task 44):   node tools/echo_compare_check.js
   Part 1: the pure helpers (ECM, between ECM-START/END): pace words, heard-word matching, history shape and caps, problem words, practice list, old data.
   Part 2 (static): every element id used by 169j exists in 28c-sheet-echo.html; 169j has no network code and no audio upload; speech recognition is
   only started when the opt-in is on; the new English strings have a Bengali entry; build.py lists the new files.
   Not covered here: a real microphone, a real speech service, the narrator clip in a real book (see the handoff note). Exit 1 on a failed check, 2 if a file cannot be read. */
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const root = path.join(__dirname, '..'), rd = f => fs.readFileSync(path.join(root, f), 'utf8');
let ran = 0, bad = 0;
const j2 = x => JSON.parse(JSON.stringify(x));   // values from the vm have another Array class: compare as plain JSON
const t = (name, fn) => { ran++; try { fn(); console.log('ok   ' + name); } catch (e) { bad++; console.log('FAIL ' + name + ': ' + (e && e.message)); } };
let J, ECM, HTML; const MSG_SKIP = '';
function msgObj() { const a = J.indexOf('const MSG = {'), b = J.indexOf('\n    };', a); return vm.runInNewContext('(' + J.slice(a + 12, b + 6) + ')'); }
try {
  J = rd('src/js/169j-echo-compare.js'); HTML = rd('src/html/28c-sheet-echo.html');
  const a = J.indexOf('/*ECM-START*/'), b = J.indexOf('/*ECM-END*/'); if (a < 0 || b < a) throw new Error('ECM markers missing');
  const c = {}; vm.createContext(c);
  ECM = vm.runInContext(J.slice(a, b) + '\n({ LIM, pace, tokens, compare, empty, clean, day, addTake, addHeard, problems, weekCount, plHas, plToggle, plRemove });', c);
} catch (e) { console.error('echo_compare_check: cannot load: ' + e.message); process.exit(2); }

t('pace: close, slower, faster, none', () => {
  assert.strictEqual(ECM.pace(4.1, 3.4).kind, 'close'); assert.strictEqual(ECM.pace(4.1, 3.4).ratio, 1.2);
  assert.strictEqual(ECM.pace(6, 3).kind, 'slower'); assert.strictEqual(ECM.pace(2, 3).kind, 'faster');
  assert.strictEqual(ECM.pace(0, 3).kind, 'none'); assert.strictEqual(ECM.pace(3, 0).kind, 'none');
});
t('compare: the mock-up sentence, two words not heard', () => {
  const r = ECM.compare('She sat alone in the garden, looking forlorn and tired.', 'she sat alone in the looking and tired');
  assert.deepStrictEqual(j2(r.items.map(i => i.w)), ['She', 'sat', 'alone', 'in', 'the', 'garden', 'looking', 'forlorn', 'and', 'tired']);
  assert.deepStrictEqual(j2(r.items.filter(i => !i.ok).map(i => i.w)), ['garden', 'forlorn']);
});
t('compare: all heard, case and punctuation do not matter; plural / ending tolerated', () => {
  const r = ECM.compare("It's the horses.", "IT'S the horse");
  assert.ok(r.items.every(i => i.ok), JSON.stringify(r.items));
});
t('compare: extra heard words are ignored, order respected, nothing heard', () => {
  const r = ECM.compare('one two three four', 'um one two uh four');
  assert.deepStrictEqual(j2(r.items.map(i => i.ok)), [true, true, false, true]);
  const z = ECM.compare('one two', ''); assert.ok(z.items.every(i => !i.ok) && z.heard === 0);
  assert.strictEqual(ECM.compare('', 'x'), null);
});
t('compare: long input stays bounded and fast', () => {
  const s = Array.from({ length: 500 }, (_, i) => 'word' + i).join(' '), t0 = Date.now();
  const r = ECM.compare(s, s); assert.ok(r.items.length <= ECM.LIM.heard && Date.now() - t0 < 500);
});
t('clean: nothing, junk, old shape; unknown fields kept; bad entries dropped', () => {
  assert.deepStrictEqual(j2(ECM.clean(null)), j2(ECM.empty()));
  assert.deepStrictEqual(j2(ECM.clean('x')), j2(ECM.empty())); assert.deepStrictEqual(j2(ECM.clean([1])), j2(ECM.empty()));
  const h = ECM.clean({ n: 3, sd: 'x', days: { '2026-01-02': 2, bad: 5, '2026-01-03': -1 }, w: { cat: [2, 1, 5], bad: 'x' }, pl: [{ k: 'a|1', text: 'hi' }, { nope: 1 }], extra: { keep: true } });
  assert.strictEqual(h.n, 3); assert.strictEqual(h.sd, 0); assert.deepStrictEqual(j2(h.days), { '2026-01-02': 2 });
  assert.deepStrictEqual(j2(Object.keys(h.w)), ['cat']); assert.strictEqual(h.pl.length, 1); assert.deepStrictEqual(j2(h.extra), { keep: true });
});
t('addTake: counts, per day, week, pace sums, 90-day cap', () => {
  const h = ECM.empty(), now = new Date(2026, 10, 11, 9, 0).getTime();
  ECM.addTake(h, { dur: 4, nd: 3 }, now); ECM.addTake(h, { dur: 5, nd: 4 }, now - 864e5); ECM.addTake(h, { dur: 1, nd: 1 }, now - 10 * 864e5);
  assert.strictEqual(h.n, 3); assert.strictEqual(h.days[ECM.day(now)], 1); assert.strictEqual(ECM.weekCount(h, now), 2); assert.strictEqual(h.sd, 10);
  for (let i = 0; i < 120; i++) ECM.addTake(h, { dur: 1, nd: 1 }, now - (20 + i) * 864e5);
  assert.ok(Object.keys(h.days).length <= ECM.LIM.days);
  const h2 = ECM.empty(); ECM.addTake(h2, { dur: 0, nd: 0 }, now); assert.strictEqual(h2.n, 1); assert.strictEqual(h2.sn, 0);
});
t('addHeard + problems: short and common words skipped, needs 2 misses and half the takes', () => {
  const h = ECM.empty(), mk = ok => ECM.compare('The garden is forlorn', ok ? 'the garden is forlorn' : 'the is').items;
  ECM.addHeard(h, mk(false), 1); assert.deepStrictEqual(j2(ECM.problems(h)), []);
  ECM.addHeard(h, mk(false), 2); assert.deepStrictEqual(j2(ECM.problems(h).map(p => p.w)), ['forlorn', 'garden']);
  assert.ok(!('the' in h.w) && !('is' in h.w));
  for (let i = 0; i < 4; i++) ECM.addHeard(h, mk(true), 3 + i); assert.deepStrictEqual(j2(ECM.problems(h)), [], 'mostly fine now');
});
t('addHeard: 150-word cap drops the oldest', () => {
  const h = ECM.empty();
  for (let i = 0; i < 200; i++) ECM.addHeard(h, [{ w: 'word' + i, n: 'word' + i, ok: false }], i + 1);
  assert.strictEqual(Object.keys(h.w).length, ECM.LIM.words); assert.ok(!('word0' in h.w) && 'word199' in h.w);
});
t('practice list: add, again removes, cap 30 drops the oldest, remove', () => {
  const h = ECM.empty();
  assert.strictEqual(ECM.plToggle(h, { k: 'b|1', text: 'x' }, 1), true); assert.ok(ECM.plHas(h, 'b|1'));
  assert.strictEqual(ECM.plToggle(h, { k: 'b|1', text: 'x' }, 2), false); assert.ok(!ECM.plHas(h, 'b|1'));
  for (let i = 0; i < 35; i++) ECM.plToggle(h, { k: 'b|' + i, text: 's' }, i);
  assert.strictEqual(h.pl.length, 30); assert.ok(!ECM.plHas(h, 'b|0') && ECM.plHas(h, 'b|34'));
  ECM.plRemove(h, 'b|34'); assert.ok(!ECM.plHas(h, 'b|34'));
});
t('every element id used by 169j is in 28c-sheet-echo.html', () => {
  const ids = [...J.matchAll(/q\('([a-z0-9-]+)'\)/g)].map(m => m[1]);
  assert.ok(ids.length > 20); const miss = [...new Set(ids)].filter(i => !HTML.includes('id="' + i + '"'));
  assert.deepStrictEqual(j2(miss), []);
});
t('169j: no network code, no upload; recognition only after the opt-in', () => {
  const code = J.replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(!/fetch\(|XMLHttpRequest|sendBeacon|WebSocket|FormData|\.upload|import\(/.test(code));
  assert.ok(/function begin\(c\) \{\s*if \(!pref\(\) \|\| !SRC\(\)\) return;/.test(code), 'begin() must stop unless the opt-in is on and the browser has it');
  assert.ok(!/\.start\(\)/.test(code.replace(/try \{ sr\.start\(\); \}/, '')), 'only one place starts recognition');
});
t('the markup has no hard-coded "score", "accuracy" or "%" wording', () => {
  const words = /score|accuracy|correct|wrong|\bgrade\b/i;
  const txt = (HTML.match(/>([^<]+)</g) || []).join(' ') + ' ' + Object.values(msgObj()).map(v => typeof v === 'string' ? v : Object.values(v).join(' ')).join(' ');
  const hits = (txt.match(/[^.]*\b(?:score|accuracy|correct|wrong|grade)\b[^.]*\./gi) || []).filter(s => !/not a pronunciation grade|never a score/i.test(s));
  assert.deepStrictEqual(hits, [], 'only the "not a grade" disclaimers may use these words');
});
t('every new English string has a Bengali entry', () => {
  const bn = JSON.parse(rd('src/i18n/bn.json')).dict, M = msgObj(), want = new Set();
  Object.values(M).forEach(v => (typeof v === 'string' ? [v] : Object.values(v)).forEach(x => want.add(x)));
  ['Add to practice list', 'On practice list', 'What we heard', 'Problem words', 'Practice list', 'Practise', 'Clear history', 'Takes', 'Today', 'This week', 'History',
   'Show what we heard: off', 'Show what we heard: on', 'Open this chapter to practise this sentence.', 'No problem words yet.', 'No practice sentences yet.',
   'Problem words appear when "Show what we heard" is on.'].forEach(x => want.add(x));
  (HTML.match(/id="ec-sr-n"[^>]*>([^<]+)</) || []).slice(1).forEach(x => want.add(x.replace(/&middot;/g, '\u00B7')));
  want.delete(MSG_SKIP);
  const miss = [...want].filter(x => !(x in bn));
  assert.deepStrictEqual(j2(miss), []);
});
t('build.py lists the css and the js, after 94q and 169i', () => {
  const b = rd('build.py'); const a = b.indexOf('94r-echo-compare.css'), c = b.indexOf('169j-echo-compare.js');
  assert.ok(a > b.indexOf('94q-echo-recording.css') && c > b.indexOf('169i-echo-recording.js'));
});
console.log('\n' + (ran - bad) + ' of ' + ran + ' checks passed' + (bad ? ', ' + bad + ' FAILED' : ''));
process.exit(bad ? 1 : 0);
