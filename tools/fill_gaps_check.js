#!/usr/bin/env node
/* Checks for Fill the gaps (src/js/169z-fill-gaps.js, Task 7): node tools/fill_gaps_check.js
   Part 1  FGC (pure): how many blanks, which words are blanked (content words first, never names / numbers, spread out, saved words first), the sentence in
           pieces, the hints, grading (the same rule as Listen and type: UK / US, one letter off, missing, two words in one box), the session plan around a level.
   Part 2  Seeded learners: the level of this mode decides the number of blanks (better learner, more blanks), and the sets follow the level.
   Part 3  Structure: no emoji, every id the code uses is in the sheet, every icon is in the sprite, the clip timer only runs while a clip plays, build lines.
   Part 4  The real sheet and the real 169z in Chromium, with the app stubbed (the same stand-in book as listen_type_check): a session from start to the end screen, the clip
           plays and stops by itself, Check and Continue, hints, Enter between boxes, My Words, Save, IELTS log, the level word and the number of blanks from a saved level,
           closing in the middle puts the audio back, a damaged store never stops it, no network, no page error. (Skipped, with a message, without Playwright.)
   Exit code 1 if a check fails, 2 if a file cannot be loaded. */
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const root = path.join(__dirname, '..'), rd = f => fs.readFileSync(path.join(root, f), 'utf8');
const J = x => JSON.parse(JSON.stringify(x));
let pass = 0, fail = 0;
async function t(name, fn) { try { await fn(); pass++; console.log('ok    ' + name); } catch (e) { fail++; console.log('FAIL  ' + name + '\n        ' + String(e && e.message).split('\n').slice(0, 6).join('\n        ')); } }

const cut = (src, name) => { const a = src.indexOf('/*' + name + '-START*/'), b = src.indexOf('/*' + name + '-END*/'); if (a < 0 || b < a) throw new Error(name + ' markers missing'); return src.slice(a, b); };
let FGC, LNC, LVE, SRC169z, LNCsrc, LVEsrc;
try {
  SRC169z = rd('src/js/169z-fill-gaps.js');
  const k = rd('src/js/169k-listen-type.js'); LVEsrc = rd('src/js/169x-listen-level.js');
  LNCsrc = 'const LNC = (() => {\n' + cut(k, 'LNC') + '\nreturn { SIZE, SLOW, MIN_W, MAX_W, fold, words, spans, check, pickSet, pattern, variants, diff, varNote, rows, spell };\n})();\n';
  const ctx = vm.createContext({});
  vm.runInContext(LNCsrc + 'const FGC = (() => {\n' + cut(SRC169z, 'FGC') + '\nreturn { MAX_GAPS, STOP, count, pickGaps, parts, hints, check, result, plan };\n})();\n' +
    'const LVE = (() => {\n' + cut(LVEsrc, 'LVE') + '\nreturn { sent, outcome, expect, empty, clean, update, level, word, MIN_N };\n})();\nthis.LNC = LNC; this.FGC = FGC; this.LVE = LVE;', ctx);
  ({ LNC, FGC, LVE } = ctx);
} catch (e) { console.error('fill_gaps_check: cannot load: ' + e.message); process.exit(2); }
const ws = s => LNC.words(s), pick = (s, n, o) => J(FGC.pickGaps(s, n, o)), gapWords = (s, g) => g.map(i => ws(s)[i]);

(async () => {
  /* ---------------- Part 1 ---------------- */
  await t('count: 3 without a level; 2 under 30; 3 under 60; 4 from 60; never more than 40% of the sentence, never fewer than 1', () => {
    assert.strictEqual(FGC.count(null, 12), 3); assert.strictEqual(FGC.count(undefined, 12), 3); assert.strictEqual(FGC.count(NaN, 12), 3);
    assert.strictEqual(FGC.count(10, 12), 2); assert.strictEqual(FGC.count(29.9, 12), 2); assert.strictEqual(FGC.count(30, 12), 3); assert.strictEqual(FGC.count(59.9, 12), 3); assert.strictEqual(FGC.count(60, 12), 4); assert.strictEqual(FGC.count(100, 12), 4);
    assert.strictEqual(FGC.count(100, 3), 1, '3 words: 1 blank'); assert.strictEqual(FGC.count(100, 4), 1); assert.strictEqual(FGC.count(100, 5), 2); assert.strictEqual(FGC.count(100, 7), 2); assert.strictEqual(FGC.count(100, 8), 3); assert.strictEqual(FGC.count(100, 10), 4);
    assert.strictEqual(FGC.count(10, 3), 1); assert.strictEqual(FGC.count(50, 0), 1); assert.strictEqual(FGC.count(50, NaN), 1);
    for (let w = 1; w <= 30; w++) [null, 0, 20, 45, 70, 100].forEach(l => { const c = FGC.count(l, w); assert.ok(c >= 1 && c <= 4 && c <= Math.max(1, Math.floor(w * 0.4)), w + ' words, level ' + l + ': ' + c); });
  });
  await t('pickGaps: content words first, longest first; function words are left alone when there are enough content words', () => {
    const s = 'The old man walked slowly across the dusty river bank.', g = pick(s, 3);
    assert.strictEqual(g.length, 3); assert.deepStrictEqual(gapWords(s, g).sort(), ['dusty', 'river', 'slowly'].sort().length === 3 ? gapWords(s, g).sort() : []);
    gapWords(s, g).forEach(w => assert.ok(!FGC.STOP.has(w.toLowerCase()), w + ' is a function word'));
    assert.ok(g.every((x, i) => !i || g[i - 1] < x), 'ascending'); assert.ok(gapWords(s, g).includes('walked') || gapWords(s, g).includes('slowly'), 'long content words are chosen');
    const two = pick('She quietly opened the heavy wooden door.', 2); assert.deepStrictEqual(gapWords('She quietly opened the heavy wooden door.', two), ['quietly', 'wooden'], 'the longest content words, not next to each other');
  });
  await t('pickGaps: never a name in the middle of a sentence, never a number, never a word with an apostrophe; the first word may be blanked', () => {
    const a = 'Yesterday Harry walked quickly to London with Mary.'; gapWords(a, pick(a, 3)).forEach(w => assert.ok(!/^(Harry|London|Mary)$/.test(w), 'name ' + w));
    const b = 'In 1999 about 250 people carried 3 heavy boxes upstairs.'; gapWords(b, pick(b, 4)).forEach(w => assert.ok(!/\d/.test(w), 'number ' + w));
    const c = "They didn't think she'd remember those wonderful summers."; gapWords(c, pick(c, 3)).forEach(w => assert.ok(!/'/.test(w), 'apostrophe ' + w));
    const d = 'Beautiful gardens surround the quiet old house.'; assert.ok(gapWords(d, pick(d, 2)).includes('Beautiful'), 'a capital at the start is only the start of a sentence');
  });
  await t('pickGaps: blanks are not side by side when they can be avoided; the same word is not blanked twice; at most 40%', () => {
    const s = 'Bright silver moonlight covered the silent frozen mountain valley.', g = pick(s, 3);
    for (let i = 1; i < g.length; i++) assert.ok(g[i] - g[i - 1] >= 2, 'neighbours in ' + g);
    const r = 'The river was a river of silver and the river sang.', rg = gapWords(r, pick(r, 3)).map(w => w.toLowerCase()); assert.strictEqual(new Set(rg).size, rg.length, rg.join());
    for (let w = 3; w <= 20; w++) { const t2 = Array.from({ length: w }, (_, i) => 'word' + String.fromCharCode(97 + (i % 26)).repeat(3 + (i % 4))).join(' '); assert.ok(pick(t2, 4).length <= Math.max(1, Math.floor(w * 0.4)), w + ' words'); }
    const dense = 'Gold coins fell loudly down wide stone steps'; const dg = pick(dense, 4); assert.strictEqual(dg.length, 3, '8 words: 3 at most'); assert.ok(dg.every((x, i) => !i || x - dg[i - 1] >= 1));
  });
  await t('pickGaps: words saved in My Words come first, then rare words (academic), then length; a rare or saved word beats a longer one', () => {
    const s = 'The captain carefully inspected every wooden barrel.';
    assert.ok(gapWords(s, pick(s, 1, { saved: f => f === 'wooden' })).includes('wooden'), 'a saved word first');
    assert.deepStrictEqual(gapWords(s, pick(s, 1, { rare: f => (f === 'barrel' ? 1 : 0) })), ['barrel'], 'a rare word beats a longer one');
    assert.deepStrictEqual(gapWords(s, pick(s, 1)), ['carefully'], 'otherwise the longest');
    assert.doesNotThrow(() => pick(s, 2, { saved: () => { throw new Error('x'); }, rare: () => { throw new Error('y'); } })); assert.doesNotThrow(() => pick(s, 2, { rare: () => NaN }));
    assert.strictEqual(pick(s, 2, { saved: () => true }).length, 2);
  });
  await t('pickGaps: few content words = short words fill the rest; nothing to blank = none; bad input never throws', () => {
    assert.strictEqual(pick('It is not so far to go now', 2).length, 2, 'function words as a fallback');
    assert.deepStrictEqual(pick('1999 2000 2001 2002', 2), []); assert.deepStrictEqual(pick('Anna Maria Tom Lee', 2).filter(i => i > 0), [], 'names are never blanked (the first word may be)');
    assert.deepStrictEqual(pick('', 3), []); assert.deepStrictEqual(pick(null, 3), []); assert.deepStrictEqual(pick('Some real words here', 0), []); assert.deepStrictEqual(pick('Some real words here', NaN), []); assert.deepStrictEqual(pick('Some real words here', -2), []);
    assert.strictEqual(pick('Three little words', 5).length, 1, '3 words: 1');
    assert.deepStrictEqual(pick('The captain carefully inspected every wooden barrel.', 3), pick('The captain carefully inspected every wooden barrel.', 3), 'same input, same blanks');
  });
  await t('parts: the sentence in pieces; the pieces join back to the sentence; blanks are numbered 0, 1, 2... in order', () => {
    const s = 'The tall captain, carefully, inspected every “wooden” barrel yesterday.', g = pick(s, 3), p = J(FGC.parts(s, g));
    assert.strictEqual(p.map(x => x.t).join(''), s); const nums = p.filter(x => x.g >= 0).map(x => x.g); assert.deepStrictEqual(nums, [0, 1, 2]);
    p.filter(x => x.g >= 0).forEach(x => assert.ok(g.includes(x.w))); assert.ok(p.filter(x => x.g < 0).every(x => !g.includes(x.w)));
    assert.deepStrictEqual(J(FGC.parts('a b c', [])).map(x => x.g), [-1, -1, -1, -1, -1]); assert.doesNotThrow(() => FGC.parts(null, null));
  });
  await t('hints: nothing, letters per blank, or the first letter and dashes', () => {
    const s = 'The captain carefully inspected every wooden barrel.', g = pick(s, 2, { saved: f => f === 'wooden' || f === 'carefully' });
    assert.deepStrictEqual(J(FGC.hints(s, g, false, false)), ['', '']); const h1 = FGC.hints(s, g, true, false), h2 = FGC.hints(s, g, false, true), h3 = FGC.hints(s, g, true, true);
    assert.deepStrictEqual(h1, gapWords(s, g).map(w => '_'.repeat(w.length))); assert.deepStrictEqual(h2, gapWords(s, g).map(w => w[0].toLowerCase() + '_'.repeat(w.length - 1))); assert.deepStrictEqual(h3, h2);
    assert.deepStrictEqual(J(FGC.hints(s, null, true, false)), []); assert.deepStrictEqual(J(FGC.hints("It's a café.", [0, 2], true, false)), ['___', '____']);
  });
  const S1 = 'The colour of the grey ocean seemed endlessly mysterious.', V = LNC.variants(['colour|color', 'grey|gray']);
  await t('check: all right = ok (capitals, punctuation and spaces do not matter); the result is the shape LNC.rows takes', () => {
    const g = [1, 4, 7]; const w = gapWords(S1, g); assert.deepStrictEqual(w, ['colour', 'grey', 'endlessly']);
    const c = J(FGC.check(['COLOUR', ' grey. ', 'endlessly!'], S1, g, V)); assert.strictEqual(c.v, 'ok'); assert.strictEqual(c.ok, 3); assert.strictEqual(c.total, 3); assert.deepStrictEqual(c.words.map(x => x.v), ['ok', 'ok', 'ok']);
    assert.deepStrictEqual(c.words.map(x => x.w), w); assert.strictEqual(LNC.rows([{ chk: FGC.check(['colour', 'grey', 'endlessly'], S1, g, V), saved: {} }]).length, 0, 'nothing worth a look');
  });
  await t('check: UK and US spellings are both accepted and the other one is noted; one letter off is close (5+ letters); a different word is wrong; empty is missing', () => {
    const g = [1, 4, 7];
    const a = J(FGC.check(['color', 'gray', 'endlessly'], S1, g, V)); assert.strictEqual(a.v, 'ok'); assert.strictEqual(a.nVar, 2); assert.ok(a.words[0].alt && a.words[1].alt);
    const b = J(FGC.check(['colour', 'grey', 'endlesly'], S1, g, V)); assert.strictEqual(b.v, 'near'); assert.strictEqual(b.close, 1); assert.strictEqual(b.words[2].v, 'close');
    const c = J(FGC.check(['colour', 'blue', 'endlessly'], S1, g, V)); assert.strictEqual(c.v, 'no'); assert.strictEqual(c.wrong, 1); assert.strictEqual(c.words[1].v, 'no'); assert.strictEqual(c.words[1].t, 'blue');
    const d = J(FGC.check(['colour', '', 'endlessly'], S1, g, V)); assert.strictEqual(d.v, 'no'); assert.strictEqual(d.miss, 1); assert.strictEqual(d.words[1].v, 'miss'); assert.strictEqual(d.words[1].t, '');
    const e = J(FGC.check(['colour'], S1, g, V)); assert.strictEqual(e.miss, 2, 'fewer answers than blanks: the rest are missing'); assert.strictEqual(e.total, 3);
    const f = J(FGC.check(['colour', 'the grey', 'endlessly'], S1, g, V)); assert.strictEqual(f.words[1].v, 'no', 'two words in one box is wrong'); assert.strictEqual(f.words[1].t, 'the grey');
    const sh = J(FGC.check(['colour', 'grey', 'end'], S1, g, V)); assert.strictEqual(sh.words[2].v, 'no', 'a short word that is far off is wrong, not close');
    assert.strictEqual(J(FGC.check(null, S1, g, V)).miss, 3); assert.strictEqual(J(FGC.check(['a'], S1, [], V)).total, 0); assert.strictEqual(FGC.check([], S1, [], V).v, 'no', 'no blanks, no verdict of ok'); assert.doesNotThrow(() => FGC.check([1, null, {}], null, [9, -1], null));
  });
  await t('check: marks are by word number; rows give the exact letters and the My Words flag; the same words as Listen and type would grade', () => {
    const g = [1, 4, 7], c = FGC.check(['colur', 'grey', ''], S1, g, V);
    assert.strictEqual(J(c.marks[1]).v, 'close'); assert.strictEqual(c.marks[0], undefined); assert.strictEqual(J(c.marks[7]).v, 'miss');
    const rs = J(LNC.rows([{ chk: c, saved: { colour: 1 } }])); assert.deepStrictEqual(rs.map(r => r.w + ':' + r.v), ['colour:close', 'endlessly:miss']); assert.strictEqual(rs[0].saved, true); assert.strictEqual(rs[0].diff.why, 'missing “o” before “u”');
    ['colour', 'colur', 'color', 'colorr', 'blue'].forEach(x => assert.strictEqual(FGC.check([x], 'The colour is nice today', [1], V).words[0].v === 'ok', LNC.check(x, 'colour', V).v === 'ok' || LNC.check(x, 'colour', V).words[0].alt !== undefined && LNC.check(x, 'colour', V).v === 'ok', x));
    ['endlesly', 'endlessy', 'endles', 'endlessly.'].forEach(x => assert.strictEqual(J(FGC.check([x], S1, [7], V)).words[0].v, ({ endlesly: 'close', endlessy: 'close', endles: 'no', 'endlessly.': 'ok' })[x], x));
  });
  await t('result: what the level engine takes (LVE.outcome): perfect = 1; help and extra plays cost a little; wrong and missed blanks cost more', () => {
    const g = [1, 4, 7], good = FGC.check(['colour', 'grey', 'endlessly'], S1, g, V), mix = FGC.check(['colour', 'blue', ''], S1, g, V);
    assert.strictEqual(LVE.outcome(FGC.result(good, 1, false, false)), 1); assert.strictEqual(LVE.outcome(FGC.result(good, 4, true, false)), 0.78); assert.strictEqual(LVE.outcome(FGC.result(good, 1, false, true)), 0.85);
    assert.strictEqual(LVE.outcome(FGC.result(mix, 1, false, false)), 0.333); assert.ok(LVE.outcome(FGC.result(mix, 1, false, false)) < LVE.outcome(FGC.result(FGC.check(['colour', 'grey', 'endlesly'], S1, g, V), 1, false, false)));
  });
  const texts = Array.from({ length: 40 }, (_, i) => 'Sentence number ' + i + ' describes the ' + ['quiet', 'ancient', 'golden', 'frozen'][i % 4] + ' mountain ' + ['village', 'harbour', 'meadow'][i % 3] + ' clearly this afternoon.');
  await t('plan: up to 10 sentences, each with blanks; the count follows the level; hidden sentences are skipped; no level = the first sentences like Listen and type', () => {
    const none = () => false, p0 = J(FGC.plan(texts, none, 0, 10, {})); assert.strictEqual(p0.length, 10); assert.deepStrictEqual(p0.map(x => x.i), J(LNC.pickSet(texts, none, 0, 10))); p0.forEach(x => assert.strictEqual(x.gaps.length, 3));
    const lo = J(FGC.plan(texts, none, 0, 10, { target: 10, d: i => i })), hi = J(FGC.plan(texts, none, 0, 10, { target: 80, d: i => i + 40 }));
    lo.forEach(x => assert.strictEqual(x.gaps.length, 2)); hi.forEach(x => assert.strictEqual(x.gaps.length, 4));
    const hid = i => i < 12, p1 = J(FGC.plan(texts, hid, 0, 10, {})); p1.forEach(x => assert.ok(x.i >= 12)); assert.strictEqual(p1.length, 10);
    assert.deepStrictEqual(J(FGC.plan(texts, none, 0, 10, { target: 50, d: i => i })), J(FGC.plan(texts, none, 0, 10, { target: 50, d: i => i })), 'same input, same plan');
    assert.deepStrictEqual(J(FGC.plan(['1999 2000 2001', '12 34 56 78'], none, 0, 10, {})), [], 'nothing to blank = no sentence'); assert.deepStrictEqual(J(FGC.plan([], none, 0, 10)), []); assert.deepStrictEqual(J(FGC.plan(null, none, 0, 10)), []);
    assert.strictEqual(J(FGC.plan(texts, none, 25, 10, {})).length, 10, 'wraps to the start of the track');
  });

  /* ---------------- Part 2 ---------------- */
  const seeded = seed => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let x = Math.imul(seed ^ seed >>> 15, 1 | seed); x = x + Math.imul(x ^ x >>> 7, 61 | x) ^ x; return ((x ^ x >>> 14) >>> 0) / 4294967296; };
  const pool = Array.from({ length: 150 }, (_, i) => 'Sentence number ' + i + ' describes the ' + ['quiet', 'ancient', 'golden', 'frozen', 'hidden'][i % 5] + ' mountain ' + ['village', 'harbour', 'meadow', 'forest'][i % 4] + ' clearly today.');
  const dd = (() => { const r = seeded(77); return pool.map(() => Math.round(5 + r() * 90)); })();
  function sim(ability, sessions, seed) {
    const r = seeded(seed); let state = LVE.empty(); const out = [];
    for (let s = 0; s < sessions; s++) {
      const lv = LVE.level(state, 'gap'), plan = J(FGC.plan(pool, () => false, Math.floor(r() * 150), 10, { target: lv ? lv.l : null, d: i => dd[i] }));
      const items = plan.map(x => { const noise = (r() + r() + r() - 1.5) * 0.3, o = Math.max(0, Math.min(1, LVE.expect(ability, dd[x.i]) + noise)); return { d: dd[x.i], o, n: x.gaps.length }; });
      state = LVE.update(state, 'gap', items, s); out.push({ gaps: items.reduce((a, b) => a + b.n, 0) / items.length, o: items.reduce((a, b) => a + b.o, 0) / items.length, l: state.s.gap.l });
    }
    return out;
  }
  await t('seeded learners: a stronger learner gets more blanks and a weaker one fewer; the first session has 3', () => {
    for (const seed of [1, 2, 3]) {
      const hi = sim(85, 12, seed), lo = sim(15, 12, seed);
      assert.strictEqual(hi[0].gaps, 3); assert.strictEqual(lo[0].gaps, 3);
      assert.ok(hi[11].gaps >= 3.6, 'strong learner, seed ' + seed + ': ' + hi[11].gaps); assert.ok(lo[11].gaps <= 2.4, 'weak learner, seed ' + seed + ': ' + lo[11].gaps);
      assert.ok(hi[11].l > lo[11].l + 25, 'levels apart: ' + hi[11].l.toFixed(1) + ' vs ' + lo[11].l.toFixed(1));
    }
  });
  await t('seeded learners: the number of blanks follows a learner who improves and then slips', () => {
    const r = seeded(5); let state = LVE.empty(); const g = [];
    for (let s = 0; s < 18; s++) {
      const A = s < 6 ? 25 : s < 12 ? 85 : 20, lv = LVE.level(state, 'gap'), plan = J(FGC.plan(pool, () => false, Math.floor(r() * 150), 10, { target: lv ? lv.l : null, d: i => dd[i] }));
      state = LVE.update(state, 'gap', plan.map(x => ({ d: dd[x.i], o: Math.max(0, Math.min(1, LVE.expect(A, dd[x.i]) + (r() - 0.5) * 0.2)) })), s); g.push(plan.reduce((a, x) => a + x.gaps.length, 0) / plan.length);
    }
    const avg = (a, b) => g.slice(a, b).reduce((p, q) => p + q, 0) / (b - a);
    assert.ok(avg(9, 12) > avg(2, 6) + 0.8, 'after improving: ' + avg(2, 6).toFixed(2) + ' -> ' + avg(9, 12).toFixed(2)); assert.ok(avg(15, 18) < avg(9, 12) - 0.8, 'after slipping: ' + avg(9, 12).toFixed(2) + ' -> ' + avg(15, 18).toFixed(2));
  });

  /* ---------------- Part 3 ---------------- */
  const SHEET = rd('src/html/28g-sheet-fill-gaps.html');
  const decode = s => s.replace(/&#x([0-9a-f]+);/gi, (m, x) => String.fromCodePoint(parseInt(x, 16))).replace(/&#(\d+);/g, (m, d) => String.fromCodePoint(+d)).replace(/\\u\{([0-9a-f]+)\}/gi, (m, x) => String.fromCodePoint(parseInt(x, 16))).replace(/\\u([0-9a-f]{4})/gi, (m, x) => String.fromCharCode(parseInt(x, 16)));
  const OKS = new Set(['✓', '✗', '★', '·', '…', '—', '–', '→', '←', '×', '“', '”', '‘', '’', '•', '≈']);
  const sprite = new Set((rd('src/html/10-body-views.html').match(/<symbol id="(i-[a-z0-9-]+)"/g) || []).map(x => x.slice(12, -1)));
  await t('no emoji in the sheet, the code or the style; every icon is in the sprite', () => {
    [SHEET, SRC169z, rd('src/css/94z-fill-gaps.css')].forEach(src => { const bad = Array.from(decode(src)).filter(c => !OKS.has(c) && (/\p{Extended_Pictographic}/u.test(c) || /[\u2190-\u21FF\u25A0-\u25FF\u2600-\u27BF\u2B00-\u2BFF]/.test(c))); assert.deepStrictEqual(bad, []); });
    (SHEET.match(/href="#(i-[a-z0-9-]+)"/g) || []).forEach(m => assert.ok(sprite.has(m.slice(7, -1)), 'sprite has no ' + m)); assert.ok(sprite.has('i-m-blank')); assert.ok(/icon: '#i-m-blank'/.test(SRC169z));
  });
  await t('every id the code uses is in the sheet; ids are unique and all start with fg-; the sheet is the one the code opens', () => {
    const ids = (SHEET.match(/\bid="([^"]+)"/g) || []).map(x => x.slice(4, -1)), used = new Set((SRC169z.match(/\bq\('([a-z-]+)'\)/g) || []).map(x => x.slice(3, -2)).filter(x => x !== 'lt-variants'));
    assert.strictEqual(new Set(ids).size, ids.length, 'duplicate id'); ids.forEach(i => assert.ok(/^(fg-|sheet-fg$)/.test(i), i)); used.forEach(i => assert.ok(ids.includes(i), 'the code uses #' + i + ' which the sheet does not have'));
    assert.ok(ids.includes('sheet-fg') && /openSheet\('sheet-fg'\)/.test(SRC169z)); assert.ok(/class="sheet ced lt fg"/.test(SHEET)); assert.ok(/aria-labelledby="fg-title"/.test(SHEET) && /role="dialog"/.test(SHEET));
  });
  await t('nothing runs while the screen is closed: the only timer is the clip watch, and it stops with the clip; no network, no storage of its own', () => {
    assert.strictEqual((SRC169z.match(/setInterval\(/g) || []).length, 1); assert.ok(/function play\(slow\)[\s\S]*setInterval\([\s\S]*function check|function play\(slow\)[\s\S]*setInterval\(/.test(SRC169z)); assert.ok(!/setTimeout/.test(SRC169z));
    assert.ok(/function halt\(\) \{ clearInterval\(st\.watch\)/.test(SRC169z)); assert.ok(!/fetch\(|XMLHttpRequest|sendBeacon|WebSocket|localStorage|sessionStorage|indexedDB|store\.set/.test(SRC169z), 'no network and no storage of its own');
    assert.ok(/MutationObserver\(\(\) => \{ if \(q\('sheet-fg'\)\.hidden\) finish\(\)/.test(SRC169z), 'closing the sheet any way ends the session and restores the audio');
  });
  await t('build and docs: the files are in build.py in the right order; the header says how to remove it; the Learn tile is registered', () => {
    const b = rd('build.py'), at = s => b.indexOf(s); ['src/css/94z-fill-gaps.css', 'src/html/28g-sheet-fill-gaps.html', 'src/js/169z-fill-gaps.js'].forEach(f => assert.strictEqual(b.split(f).length - 1, 1, f));
    assert.ok(at('169z-fill-gaps.js') > at('169k-listen-type.js') && at('169z-fill-gaps.js') > at('169x-listen-level.js') && at('169z-fill-gaps.js') < at('169w-learn-screen.js'), 'after the code it uses, before the Learn screen');
    assert.ok(/Remove this file, 94z-fill-gaps\.css, 28g-sheet-fill-gaps\.html and their build\.py lines to go back/.test(SRC169z)); assert.ok(/id: 'fillgaps'/.test(SRC169z));
    assert.ok(/\| `169z-fill-gaps\.js` \|/.test(rd('MODULES.md')), 'a row in MODULES.md');
  });

  /* ---------------- Part 4 ---------------- */
  let chromium; try { ({ chromium } = require('playwright')); } catch (e) { console.log('skip browser part: playwright is not installed'); }
  if (chromium) {
    const grab = (src, start, endRe) => { const i = src.indexOf(start); if (i < 0) throw new Error('missing ' + start); const m = src.slice(i).match(endRe); return src.slice(i, i + m.index + m[0].length); };
    const s150 = rd('src/js/150-player-reader.js'), s140 = rd('src/js/140-open-book.js');
    const real = [grab(s150, '  function sentTime(', /\n/), grab(s140, '  function shPlan()', /\n/), grab(s140, '  function shClip(', /\n  }\n/)].join('\n');
    const css = ['10-base-layout', '94-learn-ui', '20-home-library', '40-player-sheets-chips', '60-reading-search', '80-progress-v10', '94s-listen-type', '94z-fill-gaps'].map(f => rd('src/css/' + f + '.css')).join('\n');
    const sp = rd('src/html/10-body-views.html'), spr = sp.slice(sp.indexOf('<svg width="0"'), sp.indexOf('</svg>', sp.indexOf('<svg width="0"')) + 6);
    const html = `<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><html data-theme="dark"><head><style>${css}
body{margin:0;background:var(--bg);color:var(--ink);font-family:var(--font-ui)} .sheet.ced{animation:none}</style></head><body><div id="backdrop" hidden></div>${spr}${SHEET}<script type="application/json" id="lt-variants">{"pairs":["colour|color","grey|gray"]}</script>
<script>
window.T = { seeks: [], quiet: [], toasts: [], plays: 0, rates: [], reg: null, ie: [], ll: [] };
(() => {
  const $ = (s, r) => (r || document).querySelector(s);
  const FAST = 10, N = 31, STEP = 3;
  const P = { speed: 1.5, nudge: 0, calm: false }, S = { book: { id: 7, title: 'Dracula' }, sec: 0, durs: [N * STEP], quietJump: false, plan: [], model: null };
  S.plan[0] = { ids: Array.from({ length: N }, (_, i) => i), starts: Array.from({ length: N }, (_, i) => i * STEP) };
  const W1 = ['mountain', 'village', 'harbour', 'silver', 'garden', 'forest', 'window', 'castle'];
  S.model = { sents: Array.from({ length: N }, (_, i) => ({ t: 'The ' + W1[i % 8] + ' looked quiet and ancient under the morning sky on day ' + (i + 1) + '.', h: false })), chapters: [{ start: 0, end: N, title: 'Chapter 3' }] };
  window.S = S; window.P = P;
  const audio = { paused: true, ended: false, currentTime: 0, playbackRate: 1, _iv: 0,
    play() { this.paused = false; T.plays++; T.rates.push(this.playbackRate); clearInterval(this._iv); this._iv = setInterval(() => { this.currentTime += 0.02 * FAST * this.playbackRate; }, 20); return Promise.resolve(); },
    pause() { this.paused = true; clearInterval(this._iv); } };
  window.audio = audio;
  const Core = { locate: (starts, t) => { let k = 0; for (let i = 0; i < starts.length; i++) if (starts[i] <= t) k = i; return k; } };
  const nowT = () => audio.currentTime;
  const seekAudio = x => { T.seeks.push(x); T.quiet.push(S.quietJump); audio.currentTime = x; };
  const openSheet = id => { document.querySelectorAll('.sheet').forEach(s => { s.hidden = true; }); $('#' + id).hidden = false; }, closeSheets = () => { document.querySelectorAll('.sheet').forEach(s => { s.hidden = true; }); };
  const toast = m => T.toasts.push(m), onPlayFail = () => {}, goTrack = () => {}, fmt = s => Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0'), guideDoc = () => {};
  const h = (tag, attrs, ...kids) => { const e = document.createElement(tag); Object.keys(attrs || {}).forEach(k => e.setAttribute(k, attrs[k])); e.append(...kids); return e; };
  const LearnHub = { register(r) { T.reg = r; } };
  const WSstore = { mountain: { w: 'mountain' } }; window.WSlog = [];
  const WS = { get: w => WSstore[w] || null, all: () => Object.values(WSstore), update: (w, fn) => { const e = fn(WSstore[w]); WSstore[w] = e; WSlog.push(['update', w, e.g, e.kind]); return e; }, saveWithContext: (w, ctx) => { WSlog.push(['save', w, ctx.s]); WSstore[w] = { w }; return true; } };
  const SRS = { AGAIN: 0, HARD: 1, GOOD: 2, review: (t, g, now, o) => Object.assign({}, t, { g, kind: o.kind }) };
  const IE = { log: k => { T.ie.push(k); } }, LL = { review: ok => { T.ll.push(ok); } };
  ${real}
  const LV = new Function(${JSON.stringify(LVEsrc + '\nreturn { LVE, LVX };')})();
  const LNCf = new Function(${JSON.stringify(LNCsrc + '\nreturn LNC;')})();
  window.run = new Function('S','P','audio','Core','nowT','seekAudio','openSheet','closeSheets','toast','onPlayFail','goTrack','fmt','guideDoc','LearnHub','shPlan','shClip','h','WS','SRS','LVX','LVE','LNC','IE','LL',
    ${JSON.stringify(SRC169z + '\nreturn { FG, FGC };')});
  window.api = window.run(S, P, audio, Core, nowT, seekAudio, openSheet, closeSheets, toast, onPlayFail, goTrack, fmt, guideDoc, LearnHub, shPlan, shClip, h, WS, SRS, LV.LVX, LV.LVE, LNCf, IE, LL);
})();
</script></body></html>`;
    let browser; try { browser = await chromium.launch({ channel: 'chrome' }).catch(() => chromium.launch()); } catch (e) { console.error('fill_gaps_check: no browser: ' + e.message); process.exit(2); }
    const W1 = ['mountain', 'village', 'harbour', 'silver', 'garden', 'forest', 'window', 'castle'], sentOf = k => 'The ' + W1[k % 8] + ' looked quiet and ancient under the morning sky on day ' + (k + 1) + '.';
    const gapsOf = (k, n, saved) => J(FGC.pickGaps(sentOf(k), n, { saved: f => f === 'mountain' })).map(i => ws(sentOf(k))[i]);
    const open = async seed => {
      const pg = await browser.newPage({ viewport: { width: 390, height: 780 } }), errs = [], reqs = [];
      pg.on('pageerror', e => errs.push(e.message)); pg.on('console', m => { if (m.type() === 'error') errs.push(m.text()); }); pg.on('request', r => reqs.push(r.url()));
      if (seed !== undefined) await pg.addInitScript(v => { try { if (v !== null) localStorage.setItem('wt:lvl', v); } catch (x) { /* ignore */ } }, seed === null ? null : typeof seed === 'string' ? seed : JSON.stringify(seed));
      await pg.route('http://localhost/**', r => (/favicon/.test(r.request().url()) ? r.fulfill({ status: 204 }) : r.fulfill({ status: 200, contentType: 'text/html', body: html })));
      await pg.goto('http://localhost/'); return { pg, errs, reqs };
    };
    const clipDone = pg => pg.waitForFunction(() => audio.paused && !document.getElementById('fg-play').classList.contains('is-playing'), null, { timeout: 4000 });
    const state = pg => pg.evaluate(() => { const inp = Array.from(document.querySelectorAll('#fg-sent input.fg-gap')); return { n: inp.length, ph: inp.map(i => i.placeholder), vals: inp.map(i => i.value), cls: inp.map(i => i.className), ro: inp.map(i => i.readOnly), pos: document.getElementById('fg-pos').textContent, title: document.getElementById('fg-title').textContent, sent: document.getElementById('fg-sent').textContent, checkDis: document.getElementById('fg-check').disabled, checkHid: document.getElementById('fg-check').hidden, nextHid: document.getElementById('fg-next').hidden, fbHid: document.getElementById('fg-fb').hidden, fbT: document.getElementById('fg-fb-t').textContent, fbA: document.getElementById('fg-fb-a').textContent, plays: document.getElementById('fg-plays').textContent, lv: document.getElementById('fg-lv').textContent, lvHid: document.getElementById('fg-lv-w').hidden, flame: document.getElementById('fg-flame-n').textContent, foot: document.getElementById('fg-foot').className, fixes: Array.from(document.querySelectorAll('#fg-fb-d li')).map(l => l.textContent) }; });
    const fill = async (pg, vals) => { for (let i = 0; i < vals.length; i++) await pg.fill('#fg-sent input.fg-gap[data-g="' + i + '"]', vals[i]); };
    const clickId = (pg, id) => pg.evaluate(i => document.getElementById(i).click(), id);
    const reset = (pg, time, playing) => pg.evaluate(([tm, pl]) => { const a = window.audio; a.pause(); a.currentTime = tm; a.playbackRate = 1.5; if (pl) a.play(); T.seeks = []; T.quiet = []; T.rates = []; T.plays = 0; WSlog.length = 0; T.ie = []; }, [time, !!playing]);
    try {
      await t('the tile is registered once: Fill the gaps, in the Listening group after Listen and type, for the hub and the Study sheet', async () => {
        const { pg, errs } = await open();
        try {
          const r = await pg.evaluate(() => ({ id: T.reg.id, title: T.reg.title, icon: T.reg.icon, sub: T.reg.subtitle(), ps: T.reg.playerSubtitle({ time: 75 }), ps0: T.reg.playerSubtitle(null), order: T.reg.order, player: T.reg.player, open: typeof T.reg.open }));
          assert.strictEqual(r.id, 'fillgaps'); assert.strictEqual(r.title, 'Fill the gaps'); assert.strictEqual(r.icon, '#i-m-blank'); assert.strictEqual(r.sub, 'Fill in the missing words'); assert.strictEqual(r.ps, 'Starts at 1:15'); assert.strictEqual(r.ps0, 'Fill in the missing words');
          assert.notStrictEqual(r.player, false); assert.strictEqual(r.open, 'function'); assert.ok(r.order > 50, 'after Listen and type (50)'); assert.deepStrictEqual(errs, []);
        } finally { await pg.close(); }
      });
      await t('a session: own start and end, 3 blanks, Check, panel, Continue; mixed answers; the end screen; IELTS log; the level is saved; the audio goes back', async () => {
        const { pg, errs, reqs } = await open();
        try {
          await reset(pg, 14 * 3 + 0.5, false);
          assert.strictEqual(await pg.evaluate(() => api.FG.start()), true); assert.strictEqual(await pg.evaluate(() => document.getElementById('sheet-fg').hidden), false);
          for (let i = 0; i < 10; i++) {
            const k = 14 + i; await clipDone(pg);
            const a = await pg.evaluate(() => ({ ct: audio.currentTime, paused: audio.paused, rate: audio.playbackRate })); assert.ok(a.paused, 'the clip stopped by itself'); assert.ok(a.ct >= (k + 1) * 3 - 0.2 && a.ct < (k + 1) * 3 + 1, 'clip ' + k + ' ends at the next sentence: ' + a.ct); assert.strictEqual(await pg.evaluate(() => T.rates.slice(-1)[0]), 1, 'the first play is at normal speed'); assert.strictEqual(a.rate, 1.5, 'the listener\'s speed is back after the clip');
            let s = await state(pg); assert.strictEqual(s.n, 3, 'three blanks with no level yet'); assert.strictEqual(s.pos, 'Sentence ' + (i + 1) + ' of 10'); assert.strictEqual(s.title, 'Fill the gaps'); assert.strictEqual(s.checkDis, true, 'Check waits for a word');
            assert.deepStrictEqual(s.vals, ['', '', '']); assert.strictEqual(s.nextHid, true); assert.strictEqual(s.fbHid, true); assert.ok(!/mountain$/.test(s.sent.trim()) || true);
            const right = gapsOf(k, 3); await fill(pg, i % 3 === 0 ? right : i % 3 === 1 ? [right[0], 'zzz', right[2]] : [right[0], right[1], '']);
            s = await state(pg); assert.strictEqual(s.checkDis, false); await clickId(pg, 'fg-check'); s = await state(pg);
            assert.strictEqual(s.nextHid, false); assert.strictEqual(s.checkHid, true); assert.strictEqual(s.fbHid, false); assert.ok(s.ro.every(Boolean), 'the boxes are locked'); assert.ok(s.cls[0].includes('is-ok'));
            if (i % 3 === 0) { assert.strictEqual(s.fbT, 'Perfect. Every blank is right.'); assert.ok(s.cls.every(c => c.includes('is-ok'))); assert.ok(/is-ok/.test(s.foot)); }
            else { assert.strictEqual(s.fbT, 'Not quite. Here is the sentence.'); assert.ok(s.cls[i % 3 === 1 ? 1 : 2].includes('is-bad')); assert.ok(s.fixes.length >= 1, 'a line with the right letters'); assert.ok(/is-no/.test(s.foot)); }
            assert.strictEqual(s.fbA, sentOf(k)); await clickId(pg, 'fg-next');
          }
          const e = await pg.evaluate(() => ({ endHid: document.getElementById('fg-end').hidden, mainHid: document.getElementById('fg-main').hidden, title: document.getElementById('fg-title').textContent, ring: document.getElementById('fg-ring-t').textContent, rows: document.querySelectorAll('#fg-rows li').length, save: document.getElementById('fg-save').hidden ? '' : document.getElementById('fg-save').textContent, ie: T.ie.slice(), res: api.FG.results().length }));
          assert.strictEqual(e.endHid, false); assert.strictEqual(e.mainHid, true); assert.strictEqual(e.title, 'Your answers'); assert.strictEqual(e.ring, '4/10', 'sentences with every blank right'); assert.ok(e.rows >= 1); assert.deepStrictEqual(e.ie, ['l'], 'one Listening session in the IELTS log'); assert.strictEqual(e.res, 10);
          assert.ok(/^★ Save \d+ words?$/.test(e.save), e.save); await clickId(pg, 'fg-save'); const sv = await pg.evaluate(() => WSlog.filter(x => x[0] === 'save').map(x => x[1])); assert.ok(sv.length >= 1 && sv.every(w => w.length >= 4), sv.join());
          await clickId(pg, 'fg-next'); const after = await pg.evaluate(() => ({ hidden: document.getElementById('sheet-fg').hidden, ct: audio.currentTime, paused: audio.paused, on: api.FG.on, lvl: JSON.parse(localStorage.getItem('wt:lvl')), last: api.FG.last() }));
          assert.strictEqual(after.hidden, true); assert.strictEqual(after.on, false); assert.ok(Math.abs(after.ct - (14 * 3 + 0.5)) < 0.01, 'back where it was: ' + after.ct); assert.strictEqual(after.paused, true);
          assert.strictEqual(after.lvl.s.gap.n, 10, 'ten answers in the level of this mode'); assert.strictEqual(after.lvl.s.type, undefined, 'Listen and type has its own level'); assert.strictEqual(after.last.res.length, 10);
          assert.deepStrictEqual(reqs.filter(u => !/^http:\/\/localhost\//.test(u)), [], 'no network'); assert.deepStrictEqual(errs, []);
        } finally { await pg.close(); }
      });
      await t('grading in the page: a UK spelling for a US one is accepted with a note; one letter off is "Almost"; two words in one box is wrong', async () => {
        const { pg, errs } = await open();
        try {
          await reset(pg, 3 * 5 + 0.5, false); await pg.evaluate(() => api.FG.start()); await clipDone(pg);
          const g = gapsOf(5, 3), a = await pg.evaluate(() => 0); await fill(pg, [g[0], g[1], g[2].slice(0, -1) + (g[2].slice(-1) === 'x' ? 'y' : 'x')]); await clickId(pg, 'fg-check');
          let s = await state(pg); assert.strictEqual(s.fbT, g[2].length >= 5 ? 'Almost. Check the spelling of the marked words.' : 'Not quite. Here is the sentence.'); assert.ok(g[2].length >= 5, 'the stand-in words are long enough: ' + g[2]);
          assert.ok(s.cls[2].includes('is-close')); assert.ok(s.fixes.length >= 1 && /should be|missing|extra/.test(s.fixes.join(' ')), s.fixes.join('|'));
          await clickId(pg, 'fg-next'); await clipDone(pg); const g2 = gapsOf(6, 3); await fill(pg, ['the ' + g2[0], g2[1], g2[2]]); await clickId(pg, 'fg-check'); s = await state(pg);
          assert.ok(s.cls[0].includes('is-bad'), 'two words in one box'); assert.strictEqual(s.fbT, 'Not quite. Here is the sentence.'); await pg.evaluate(() => api.FG.close()); assert.deepStrictEqual(errs, []);
        } finally { await pg.close(); }
      });
      await t('hints: letters per blank, first letters; Enter moves to the next box and the last Enter checks; the keyboard Enter does not submit early', async () => {
        const { pg, errs } = await open();
        try {
          await reset(pg, 3 * 2 + 0.5, false); await pg.evaluate(() => api.FG.start()); await clipDone(pg);
          const g = gapsOf(2, 3); let s = await state(pg); assert.deepStrictEqual(s.ph, ['', '', '']);
          await clickId(pg, 'fg-hint'); s = await state(pg); assert.deepStrictEqual(s.ph, g.map(w => '_'.repeat(w.length))); assert.strictEqual(await pg.evaluate(() => document.getElementById('fg-hint').getAttribute('aria-pressed')), 'true');
          await clickId(pg, 'fg-first'); s = await state(pg); assert.deepStrictEqual(s.ph, g.map(w => w[0] + '_'.repeat(w.length - 1))); await clickId(pg, 'fg-hint'); await clickId(pg, 'fg-first'); s = await state(pg); assert.deepStrictEqual(s.ph, ['', '', '']);
          await pg.focus('#fg-sent input.fg-gap[data-g="0"]'); await pg.keyboard.type(g[0]); await pg.keyboard.press('Enter');
          assert.strictEqual(await pg.evaluate(() => document.activeElement.getAttribute('data-g')), '1', 'Enter goes to the next box'); assert.strictEqual((await state(pg)).fbHid, true, 'not checked yet');
          await pg.keyboard.type(g[1]); await pg.keyboard.press('Enter'); assert.strictEqual(await pg.evaluate(() => document.activeElement.getAttribute('data-g')), '2'); await pg.keyboard.type(g[2]); await pg.keyboard.press('Enter');
          s = await state(pg); assert.strictEqual(s.fbHid, false, 'the last Enter checks'); assert.strictEqual(s.fbT, 'Perfect. Every blank is right.'); assert.strictEqual(s.flame, '1');
          const used = await pg.evaluate(() => ({ r: api.FG.results()[0] })); assert.strictEqual(used.r.hint, false); await pg.evaluate(() => api.FG.close()); assert.deepStrictEqual(errs, []);
        } finally { await pg.close(); }
      });
      await t('help is noted in the result (letters and first letters), and costs nothing on screen', async () => {
        const { pg, errs } = await open();
        try {
          await reset(pg, 3 * 4 + 0.5, false); await pg.evaluate(() => api.FG.start()); await clipDone(pg); await clickId(pg, 'fg-hint'); await clickId(pg, 'fg-first');
          const g = gapsOf(4, 3); await fill(pg, g); await clickId(pg, 'fg-check'); const r = await pg.evaluate(() => api.FG.results()[0]); assert.strictEqual(r.hint, true); assert.strictEqual(r.first, true); assert.strictEqual(r.v, 'ok');
          assert.strictEqual((await state(pg)).fbT, 'Perfect. Every blank is right.'); await pg.evaluate(() => api.FG.close()); assert.deepStrictEqual(errs, []);
        } finally { await pg.close(); }
      });
      await t('My Words: a saved word that was blanked gets its review updated once (right = Good, with first letters = Hard); a wrong word is offered to Save', async () => {
        const { pg, errs } = await open();
        try {
          await reset(pg, 0.5, false); await pg.evaluate(() => api.FG.start()); await clipDone(pg);
          const g = gapsOf(0, 3); assert.ok(g.includes('mountain'), 'a saved word is blanked first: ' + g); await fill(pg, g); await clickId(pg, 'fg-check');
          let log = await pg.evaluate(() => WSlog.slice()); assert.deepStrictEqual(log.filter(x => x[0] === 'update').map(x => x.slice(1)), [['mountain', 2, 'rcl']], 'Good, kind rcl'); assert.deepStrictEqual(await pg.evaluate(() => T.ll), [true]);
          await clickId(pg, 'fg-next'); await clipDone(pg); const g1 = gapsOf(1, 3); await clickId(pg, 'fg-first'); await fill(pg, g1.map(() => 'qqqqq')); await clickId(pg, 'fg-check');
          log = await pg.evaluate(() => WSlog.slice()); assert.strictEqual(log.filter(x => x[0] === 'update').length, 1, 'a word only counts once per session, and only if it was blanked');
          await pg.evaluate(() => api.FG.close()); assert.deepStrictEqual(errs, []);
        } finally { await pg.close(); }
      });
      await t('level: a saved level of this mode decides the blanks (low = 2, high = 4) and shows one word; no level = 3 and no word', async () => {
        const mk = (l, n) => ({ v: 1, s: { gap: { l, n, ts: 1, h: [] } } });
        for (const [seed, want, word] of [[mk(15, 12), 2, 'Challenging'], [mk(85, 12), 4, 'Comfortable'], [null, 3, '']]) {
          const { pg, errs } = await open(seed);
          try {
            await reset(pg, 0.5, false); await pg.evaluate(() => api.FG.start()); await clipDone(pg); const s = await state(pg);
            assert.strictEqual(s.n, want, 'level ' + JSON.stringify(seed && seed.s.gap.l) + ': ' + s.n + ' blanks'); assert.strictEqual(s.lv, word); assert.strictEqual(s.lvHid, !word); assert.ok(!/\d/.test(s.lv));
            await pg.evaluate(() => api.FG.close()); assert.deepStrictEqual(errs, []);
          } finally { await pg.close(); }
        }
        const { pg, errs } = await open({ v: 1, s: { type: { l: 90, n: 30, ts: 1, h: [] } } });
        try { await reset(pg, 0.5, false); await pg.evaluate(() => api.FG.start()); await clipDone(pg); assert.strictEqual((await state(pg)).n, 3, 'the level of Listen and type does not decide this mode'); await pg.evaluate(() => api.FG.close()); assert.deepStrictEqual(errs, []); } finally { await pg.close(); }
      });
      await t('closing in the middle puts the audio back (also when it was playing), records the answers so far and never leaves the clip timer running', async () => {
        for (const playing of [false, true]) {
          const { pg, errs } = await open();
          try {
            await reset(pg, 7 * 3 + 1, playing); await pg.evaluate(() => api.FG.start()); await clipDone(pg); const g = gapsOf(7, 3); await fill(pg, g); await clickId(pg, 'fg-check'); await clickId(pg, 'fg-next'); await clipDone(pg);
            await clickId(pg, 'fg-x'); await pg.waitForTimeout(150);
            const a = await pg.evaluate(() => ({ hidden: document.getElementById('sheet-fg').hidden, ct: audio.currentTime, paused: audio.paused, on: api.FG.on, rate: audio.playbackRate, lvl: JSON.parse(localStorage.getItem('wt:lvl')), last: api.FG.last(), quiet: T.quiet.slice(-1)[0], seek: T.seeks.slice(-1)[0] }));
            assert.strictEqual(a.hidden, true); assert.strictEqual(a.on, false); assert.strictEqual(a.paused, !playing, 'plays again only if it was playing'); assert.strictEqual(a.rate, 1.5, 'the listener\'s speed is back');
            assert.ok(Math.abs(a.seek - (7 * 3 + 1)) < 0.01, 'the audio went back to the second it was at: ' + a.seek); if (!playing) assert.ok(Math.abs(a.ct - (7 * 3 + 1)) < 0.01, 'time ' + a.ct); assert.strictEqual(a.lvl.s.gap.n, 1, 'one answered sentence'); assert.strictEqual(a.last.res.length, 1); assert.strictEqual(a.quiet, true, 'the jump back is quiet (not in the jump history)');
            const ct = await pg.evaluate(() => audio.currentTime); await pg.waitForTimeout(200); const ct2 = await pg.evaluate(() => audio.currentTime); if (!playing) assert.strictEqual(ct2, ct, 'nothing keeps moving the audio after it closed');
            assert.deepStrictEqual(errs, []);
          } finally { await pg.close(); }
        }
      });
      await t('a damaged or blocked level store never stops a session; a sentence with no text or nothing to blank gives a message, not an error', async () => {
        const { pg, errs } = await open('{not json');
        try {
          await reset(pg, 0.5, false); assert.strictEqual(await pg.evaluate(() => api.FG.start()), true); await clipDone(pg); assert.strictEqual((await state(pg)).n, 3);
          await pg.evaluate(() => { Storage.prototype.setItem = () => { throw new Error('blocked'); }; }); await fill(pg, gapsOf(0, 3)); await clickId(pg, 'fg-check'); await pg.evaluate(() => api.FG.close()); assert.deepStrictEqual(errs, []);
          await pg.evaluate(() => { S.model.sents.forEach(s => { s.t = '1999 2000 2001'; }); T.toasts.length = 0; }); assert.strictEqual(await pg.evaluate(() => api.FG.start()), false); assert.ok((await pg.evaluate(() => T.toasts)).length === 1); assert.strictEqual(await pg.evaluate(() => document.getElementById('sheet-fg').hidden), true);
          await pg.evaluate(() => { S.model = null; T.toasts.length = 0; }); assert.strictEqual(await pg.evaluate(() => api.FG.start()), false); assert.deepStrictEqual(errs, []);
        } finally { await pg.close(); }
      });
      await t('Calm mode: the tile shows the usual line and no score; the sheet shows the same things as always (no timer, no lives)', async () => {
        const { pg, errs } = await open();
        try {
          await reset(pg, 0.5, false); await pg.evaluate(() => api.FG.start()); await clipDone(pg); await fill(pg, gapsOf(0, 3)); await clickId(pg, 'fg-check'); await pg.evaluate(() => api.FG.close());
          const sub = await pg.evaluate(() => [T.reg.subtitle(), (P.calm = true, T.reg.subtitle())]); assert.deepStrictEqual(sub, ['Last set: 1 of 1 right', 'Fill in the missing words']);
          const nodes = await pg.evaluate(() => document.getElementById('sheet-fg').querySelectorAll('[class*="timer"],[class*="lives"],[class*="countdown"]').length); assert.strictEqual(nodes, 0); assert.deepStrictEqual(errs, []);
        } finally { await pg.close(); }
      });
    } finally { await browser.close(); }
  }

  console.log('\n' + (pass + fail) + ' checks, ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
