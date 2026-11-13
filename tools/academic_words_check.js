#!/usr/bin/env node
/* Checks for academic words, linking words and the panel tag (src/js/161f-academic-words.js, Task 53). No browser, no npm install:   node tools/academic_words_check.js
   Part 1  the data file (570 families, sublist sizes, no form in two families) and the pure matcher (AWC, between the AWC-START/END markers) on a sample chapter.
   Part 2  the REAL 161f file with stand-in page objects: setting off = nothing is matched or drawn, a chapter is matched once, the tag follows its own setting.
   Part 3  credit text is in About, the data and the hook lines are wired in build.py / 150 / 163.
   The blue line, the gold mark and the tag on a real page need a browser (by hand, see the handoff note).
   Exit code 1 if a check fails, 2 if a file cannot be loaded. */
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
let ran = 0, bad = 0;
const t = (name, fn) => { ran++; return Promise.resolve().then(fn).then(() => console.log('ok   ' + name), e => { bad++; console.log('FAIL ' + name + ': ' + (e && e.message)); }); };
const same = (a, b, msg) => assert.strictEqual(JSON.stringify(a), JSON.stringify(b), msg);

let AWC, SRC, DATA;
try {
  SRC = read('src/js/161f-academic-words.js'); DATA = JSON.parse(read('src/data/awl.json'));
  const a = SRC.indexOf('/*AWC-START*/'), b = SRC.indexOf('/*AWC-END*/');
  if (a < 0 || b < a) throw new Error('AWC markers missing');
  const ctx = {}; vm.createContext(ctx);
  AWC = vm.runInContext(SRC.slice(a, b) + '\n({ compile, lookup, match });', ctx);
} catch (e) { console.error('academic_words_check: cannot load: ' + e.message); process.exit(2); }

const M = AWC.compile(DATA);
const words = (text) => AWC.match(M, text).acad.map(x => text.slice(x.s, x.e));
const links = (text) => AWC.match(M, text).link.map(x => text.slice(x.s, x.e));

(async () => {
  /* ----- Part 1 ----- */
  await t('data: 570 families, 10 sublists of 60 (the last 30)', () => {
    assert.strictEqual(DATA.w.length, 570);
    const n = {}; DATA.w.forEach(r => { n[r[0]] = (n[r[0]] || 0) + 1; });
    same(n, { 1: 60, 2: 60, 3: 60, 4: 60, 5: 60, 6: 60, 7: 60, 8: 60, 9: 60, 10: 30 });
  });
  await t('data: no form belongs to two families, every row has the right shape', () => {
    const seen = new Map();
    for (const r of DATA.w) {
      assert.ok(Number.isInteger(r[0]) && typeof r[1] === 'string' && typeof r[2] === 'string' && /^[a-z-]+$/.test(r[1]), 'bad row ' + JSON.stringify(r));
      for (const f of [r[1]].concat(r[2] ? r[2].split(' ') : [])) { assert.ok(/^[a-z-]+$/.test(f), 'bad form ' + f); assert.ok(!seen.has(f) || seen.get(f) === r[1], f + ' in two families'); seen.set(f, r[1]); }
    }
    assert.strictEqual(M.forms.size, seen.size);
  });
  await t('data: credit and the licence note are in the file', () => {
    assert.ok(/Coxhead/.test(DATA._credit) && /Victoria University of Wellington/.test(DATA._credit) && /UNCONFIRMED/.test(DATA._licence));
  });
  await t('known words keep their sublist (establish 1, hypothesis 4, academic 5, whereas 5, abandon 8, accommodate 9, albeit 10)', () => {
    const n = w => { const x = AWC.lookup(M, w); return x && x.n; };
    same([n('establish'), n('hypothesis'), n('academic'), n('whereas'), n('abandon'), n('accommodate'), n('albeit')], [1, 4, 5, 5, 8, 9, 10]);
  });
  await t('forms come from the family list: established, Evidence, indicates, data; not guessed (establishish, dataful)', () => {
    same([AWC.lookup(M, 'established').h, AWC.lookup(M, 'Evidence').h, AWC.lookup(M, 'indicates').h, AWC.lookup(M, 'DATA').h], ['establish', 'evident', 'indicate', 'data']);
    assert.strictEqual(AWC.lookup(M, 'establishish'), null); assert.strictEqual(AWC.lookup(M, 'dataful'), null); assert.strictEqual(AWC.lookup(M, 'cat'), null);
  });
  const SAMPLE = 'Researchers analyse the data each year; however, the results remain uncertain. Therefore, further evidence is required to establish the hypothesis. In addition, smaller studies indicate a similar trend.';
  await t('sample chapter: blue words are right', () => same(words(SAMPLE), ['Researchers', 'analyse', 'data', 'evidence', 'required', 'establish', 'hypothesis', 'indicate', 'similar', 'trend']));
  await t('sample chapter: gold words are right (case ignored, phrase kept whole)', () => same(links(SAMPLE), ['however', 'Therefore', 'In addition']));
  await t('a word is not matched inside another word (however-ish, therefore1) and common words stay clear', () => {
    same(links('Howeverish things, nonetheless.'), ['nonetheless']);
    same(words('The cat sat on the mat and looked at the dog.'), []);
  });
  await t('gold wins over blue where the lists meet (furthermore, in contrast, hence)', () => {
    const s = 'Furthermore, in contrast the plan failed; hence it ended.';
    same(links(s), ['Furthermore', 'in contrast', 'hence']); same(words(s), []);
    assert.strictEqual(AWC.lookup(M, 'hence').n, 4);   // the panel tag still says Sublist 4
  });
  await t('found (past of find), max and vol are never marked; founded and founder are', () => {
    same(words('She found the key. Max went home. A founder founded it.'), ['founder', 'founded']);
    assert.strictEqual(AWC.lookup(M, 'found'), null);
  });
  await t('names in the middle of a sentence are skipped; the first word of a sentence is not', () => {
    same(words('Then General Grant spoke to Major Smith.'), []);
    same(words('Grant was given to him. The grant was large.'), ['Grant', 'grant']);
  });
  await t("foe's style endings and hyphenated forms: the author's, co-operate, so-called", () => {
    same(words("The author's view; they co-operate; the so-called plan."), ["author", 'co-operate', 'so-called']);
  });
  await t('bad or empty data never throws', () => {
    for (const bad of [null, {}, { w: 5 }, { w: [[0, 'x', 'y'], 7, [1, 5, 5]] }, { l: [null, ''] }]) { const m = AWC.compile(bad); assert.deepStrictEqual(Object.keys(AWC.match(m, 'however data')), ['acad', 'link']); }
    assert.strictEqual(AWC.lookup(null, 'data'), null);
  });
  await t('speed: 3,000 sentences in under 400 ms', () => {
    const s = SAMPLE + ' The old man walked slowly down the road, and the dog followed him home.'; const t0 = Date.now();
    for (let i = 0; i < 3000; i++) AWC.match(M, s);
    assert.ok(Date.now() - t0 < 400, (Date.now() - t0) + ' ms');
  });

  /* ----- Part 2: the real 161f file with stand-ins ----- */
  const mk = (P0, mode) => {
    const calls = { matched: 0, added: 0, parse: 0 }, hl = {};
    class Highlight { constructor() { this.s = new Set(); } add(r) { this.s.add(r); calls.added++; } delete(r) { this.s.delete(r); } clear() { this.s.clear(); } }
    const sents = { 1: { t: 'However, the data indicate a trend.' }, 2: { t: 'Plain words only here.' }, 3: { t: 'CHAPTER I', h: true } };
    const spans = new Map(Object.keys(sents).map(k => [+k, { isConnected: true, textContent: sents[k].t }]));
    const sw = {}, win = { CSS: { highlights: { set: (n, h) => { hl[n] = h; } } }, requestIdleCallback: f => setTimeout(f, 0) };
    const doc = { getElementById: () => ({ get textContent() { calls.parse++; return JSON.stringify(DATA); } }) };
    const ctx = { window: win, document: doc, Highlight, CSS: win.CSS, performance, setTimeout, P: P0, learnOn: () => learn.v, savePrefs: () => {}, $: s => (sw[s] = sw[s] || { checked: false, listeners: {}, addEventListener(n, f) { this.listeners[n] = f; } }),
      S: { model: { sents }, plan: [{ ids: [1, 2, 3] }], book: { id: 'b1' }, spans, rb: false, sec: 0 }, OW: { rangeOf: () => ({}) }, NodeFilter: {}, requestIdleCallback: win.requestIdleCallback };
    const learn = { v: mode === undefined ? true : mode }; ctx.learnOn = () => learn.v;
    vm.createContext(ctx);
    const a = SRC.indexOf('const AWC'), src = SRC.slice(a) + '\n({ AW, awChapter });';
    // count real matching work
    const wrapped = src.replace('const r = AWC.match(M, s.t);', 'calls.matched++; const r = AWC.match(M, s.t);');
    ctx.calls = calls; const api = vm.runInContext(wrapped, ctx);
    return { api, calls, hl, sw, learn, ctx };
  };
  const wait = ms => new Promise(r => setTimeout(r, ms));
  await t('settings off (default): a chapter is not matched, nothing is drawn, the data is not even read', async () => {
    const k = mk({}); k.api.awChapter(0); await wait(60);
    assert.strictEqual(k.calls.matched, 0); assert.strictEqual(k.calls.added, 0); assert.strictEqual(k.calls.parse, 0);
  });
  await t('Standard mode: even with both settings on, nothing runs', async () => {
    const k = mk({ acadHl: true, linkHl: true }, false); k.api.awChapter(0); await wait(60);
    assert.strictEqual(k.calls.matched, 0); assert.strictEqual(k.calls.added, 0);
  });
  await t('blue only: draws blue, no gold; headings are skipped; the chapter is matched once', async () => {
    const k = mk({ acadHl: true }); k.api.awChapter(0); await wait(80);
    assert.strictEqual(k.calls.matched, 2);   // sentence 3 is a heading
    assert.ok(k.hl['wt-acad'] && k.hl['wt-acad'].s.size === 3, 'data, indicate, trend: got ' + (k.hl['wt-acad'] && k.hl['wt-acad'].s.size));   // data, indicate, trend
    assert.ok(!k.hl['wt-link'] || k.hl['wt-link'].s.size === 0);
    k.api.awChapter(0); await wait(80);
    assert.strictEqual(k.calls.matched, 2, 'opening the chapter again must match nothing'); assert.strictEqual(k.calls.parse, 1);
  });
  await t('turning gold on repaints from the saved answer (no new matching); turning both off clears', async () => {
    const k = mk({ acadHl: true }); k.api.awChapter(0); await wait(80);
    k.ctx.P.linkHl = true; k.api.AW.sync();
    assert.strictEqual(k.hl['wt-link'].s.size, 1); assert.strictEqual(k.calls.matched, 2);
    k.ctx.P.acadHl = false; k.ctx.P.linkHl = false; k.api.AW.sync();
    assert.strictEqual(k.hl['wt-acad'].s.size + k.hl['wt-link'].s.size, 0);
  });
  await t('tag: on by default, own setting, null for other words, works in Standard mode', () => {
    const k = mk({}, false);
    same(k.api.AW.tag('establish'), { h: 'establish', n: 1 }); assert.strictEqual(k.api.AW.tag('house'), null);
    k.ctx.P.acadTag = false; assert.strictEqual(k.api.AW.tag('establish'), null);
  });
  await t('model(): counted words and links for the open chapter', async () => {
    const k = mk({ acadHl: true, linkHl: true }); k.api.awChapter(0); await wait(80);
    same(k.api.AW.model(), { words: [{ h: 'data', n: 1, c: 1 }, { h: 'indicate', n: 1, c: 1 }, { h: 'trend', n: 5, c: 1 }], links: [{ l: 'however', c: 1 }] });
  });
  await t('the file never listens to audio ticks', () => assert.ok(!/timeupdate|\.ontimeupdate|requestAnimationFrame/.test(SRC.replace(/\/\*[\s\S]*?\*\//g, ''))));

  /* ----- Part 3: wiring and credit ----- */
  await t('credit is shown in About, and the three settings rows exist', () => {
    assert.ok(/Averil Coxhead \(2000\)[\s\S]*Victoria University of Wellington/.test(read('src/html/10-body-views.html')));
    const s = read('src/html/30-sheets-settings.html'); ['in-acadhl', 'in-linkhl', 'in-acadtag'].forEach(i => assert.ok(s.includes('id="' + i + '"'), i));
  });
  await t('build.py: data, CSS and JS are listed; 150, 169l and 163 call the module', () => {
    const b = read('build.py'); ['src/data/awl.json', 'src/css/95f-academic-words.css', 'src/js/161f-academic-words.js', 'id="awl-data"'].forEach(x => assert.ok(b.includes(x), x));
    assert.ok(read('src/js/150-player-reader.js').includes('awChapter(R.i)') && read('src/js/150-player-reader.js').includes('awRepaint(S.wId)'));
    assert.ok(read('src/js/169l-goal.js').includes('AW.sync()') && read('src/js/163-word-panel.js').includes('AW.tag(w)'));
  });
  await t('Bengali: the settings strings and the tag pattern exist', () => {
    const d = JSON.parse(read('src/i18n/bn.json'));
    ['Highlight academic words', 'Highlight linking words', 'Show the Academic tag in the word panel'].forEach(k => assert.ok(d.dict[k], k));
    assert.ok(d.rx.some(r => new RegExp(r[0]).test('Academic · Sublist 7')));
  });
  console.log(`\n${ran - bad}/${ran} checks passed` + (bad ? `, ${bad} FAILED` : ''));
  process.exit(bad ? 1 : 0);
})();
