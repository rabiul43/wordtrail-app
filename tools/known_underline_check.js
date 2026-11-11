#!/usr/bin/env node
/* Checks for "Underline new words" (src/js/161e-known-underline.js, Task 41). No browser, no npm install:   node tools/known_underline_check.js
   Part 1 loads the pure matcher (KUC, between the KUC-START/END markers): word list, simple forms, where a word is, coverage, speed on a long chapter.
   Part 2 loads the REAL 161e file and the REAL 148e store with stand-in page objects and proves the rules that matter:
     setting off = nothing runs; a chapter is matched once (opening it again matches nothing); I know it and Undo change only what they must;
     the file never listens to audio ticks.
   The dotted line itself, the tap on a real page and the look need a browser (by hand, see the handoff note).
   Exit code 1 if a check fails, 2 if a file cannot be loaded. */
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
let ran = 0, bad = 0;
const t = (name, fn) => { ran++; return Promise.resolve().then(fn).then(() => console.log('ok   ' + name), e => { bad++; console.log('FAIL ' + name + ': ' + (e && e.message)); }); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const same = (a, b, msg) => assert.strictEqual(JSON.stringify(a), JSON.stringify(b), msg);   // objects made inside the vm context have another prototype, so deepStrictEqual would refuse them

let KUC, SRC;
try {
  SRC = read('src/js/161e-known-underline.js');
  const a = SRC.indexOf('/*KUC-START*/'), b = SRC.indexOf('/*KUC-END*/');
  if (a < 0 || b < a) throw new Error('KUC markers missing');
  const ctx = {}; vm.createContext(ctx);
  KUC = vm.runInContext(SRC.slice(a, b) + '\n({ index, forms, match, summary, MIN_WORDS, MIN_TOKENS });', ctx);
} catch (e) { console.error('known_underline_check: cannot load: ' + e.message); process.exit(2); }

const WORDS = ['forlorn', 'silent', 'gloom', 'tremble', 'courtyard', 'ominous', 'dread', 'abandon', 'foe', 'carry', 'stop', 'gaze'];
const LIST = WORDS.map((w, i) => [w, 'B2', 10 - i, 'Example with ' + w + '.']);
const M = KUC.index(LIST);
const show = s => KUC.match(M, s).hits.map(h => s.slice(h.s, h.e) + '>' + h.w);

(async () => {
  await t('index: real words only, once each, lower case; null when under 8 words', () => {
    assert.ok(M && M.size === WORDS.length);
    assert.strictEqual(KUC.index(LIST.slice(0, 7)), null);
    assert.strictEqual(KUC.index(null), null);
    const m = KUC.index(LIST.concat([['Forlorn', 'C1', 1, ''], ['two words', 'B1', 1, ''], ['abc1', 'B1', 1, ''], [5], 'x', ['']]));
    assert.strictEqual(m.size, WORDS.length); assert.strictEqual(m.get('forlorn').lv, 'B2');
  });
  await t('match: exact words, any case, curly apostrophe, not inside other words', () => {
    same(show('The castle stood silent above the valley.'), ['silent>silent']);
    same(show('FORLORN and Gloom.'), ['FORLORN>forlorn', 'Gloom>gloom']);
    same(show('A silentium of gloomy hours.'), []);
    same(show('The foe\u2019s hand'), ['foe>foe']);   // the line stops before \u2019s
    same(show(''), []);
  });
  await t('match: simple forms (trembled, trembling, carried, stopped, gazes, silently) and no false hits', () => {
    same(show('She trembled.'), ['trembled>tremble']);
    same(show('trembling hands'), ['trembling>tremble']);
    same(show('He carried it; she stopped; it gazes.'), ['carried>carry', 'stopped>stop', 'gazes>gaze']);
    same(show('silently'), ['silently>silent']);
    same(show('A bed, a shed, a need, a thing, a string.'), []);
  });
  await t('match: counts every word of the sentence, positions are exact', () => {
    const s = 'She sat alone in the garden, looking forlorn and tired.', r = KUC.match(M, s);
    assert.strictEqual(r.n, 10); assert.strictEqual(r.hits.length, 1);
    assert.strictEqual(s.slice(r.hits[0].s, r.hits[0].e), 'forlorn');
    assert.strictEqual(KUC.match(M, 'Don\u2019t well-known').n, 2);
  });
  await t('summary: the coverage number', () => {
    const cnt = new Map([['silent', 3], ['gloom', 2], ['forlorn', 1]]), none = () => false;
    same(KUC.summary(cnt, 100, none), { pct: 94, unknown: 6, words: 3, total: 100 });
    assert.strictEqual(KUC.summary(cnt, 100, w => w === 'silent').pct, 97);           // one word marked known
    assert.strictEqual(KUC.summary(cnt, 100, () => true).pct, 100);                   // all known
    assert.strictEqual(KUC.summary(new Map([['gloom', 1]]), 100000, none).pct, 99);   // never 100 while a new word is left
    assert.strictEqual(KUC.summary(cnt, 49, none), null);                             // too short a chapter
    assert.strictEqual(KUC.summary(new Map(), 500, none).pct, 100);
    assert.ok(KUC.summary(new Map([['gloom', 90]]), 100, none).pct >= 0);
  });
  await t('speed: a very long chapter (100,000 words, 2,000 listed words) is matched in well under a second, worst sentence in a few ms', () => {
    const big = []; for (let i = 0; i < 2000; i++) big.push(['word' + String.fromCharCode(97 + i % 26) + String.fromCharCode(97 + (i / 26 | 0) % 26) + 'x', 'B2', 1, '']);
    const MB = KUC.index(big.concat(LIST)), sents = [];
    for (let i = 0; i < 6000; i++) sents.push('The castle stood silent above the valley, and she began to tremble while the evening wind moved the old trees over the courtyard ' + i + '.');
    let worst = 0, n = 0, hits = 0; const t0 = performance.now();
    for (const s of sents) { const a = performance.now(), r = KUC.match(MB, s); worst = Math.max(worst, performance.now() - a); n += r.n; hits += r.hits.length; }
    const ms = performance.now() - t0;
    console.log('     ' + n + ' words, ' + hits + ' hits, ' + ms.toFixed(0) + ' ms in all, worst sentence ' + worst.toFixed(2) + ' ms');
    assert.ok(n > 100000 && hits >= 18000); assert.ok(ms < 1500, ms + ' ms'); assert.ok(worst < 6, worst + ' ms');
  });

  /* ---------- part 2: the real screen code with stand-in page objects ---------- */
  const disk = {};
  const stubs = new Map(), calls = { vocBook: 0, range: 0, toast: [], saved: [], voice: [], guide: 0 };
  const stub = sel => {
    if (stubs.has(sel)) return stubs.get(sel);
    const on = {}, e = { sel, hidden: true, textContent: '', style: {}, attrs: {}, on, classList: { add() {}, remove() {} },
      setAttribute(k, v) { e.attrs[k] = v; }, addEventListener(ev, fn) { on[ev] = fn; }, focus() {}, getBoundingClientRect: () => ({ top: 500, bottom: 700 }) };
    stubs.set(sel, e); return e;
  };
  class Highlight { constructor() { this.s = new Set(); } add(r) { this.s.add(r); } delete(r) { this.s.delete(r); } clear() { this.s.clear(); } }
  const hlMap = new Map(), docOn = {};
  const sentTexts = [];
  const mk = (i, text) => { const o = { reads: 0, h: false, ch: 0 }; Object.defineProperty(o, 't', { get() { o.reads++; return text; } }); sentTexts[i] = text; return o; };
  const sents = [], filler = 'The evening wind moved over the old trees and the long grey road while nobody spoke a word at all. ';
  sents.push(mk(0, 'The castle stood silent above the valley, ' + filler));
  sents.push(mk(1, 'She sat alone in the garden, looking forlorn and tired, ' + filler));
  sents.push(mk(2, 'Nothing at all happened here, ' + filler + filler));                       // no hits: used to count matching
  sents.push(mk(3, 'A faint gloom settled over the courtyard, and she began to tremble, ' + filler));
  sents.push(mk(4, 'The gloom came back, and so did the silent night, ' + filler));
  const spans = new Map(); sents.forEach((s, i) => spans.set(i, { isConnected: true, get textContent() { return sentTexts[i]; } }));
  const S = { book: { id: 7, title: 'Dracula' }, model: { sents }, plan: [{ ids: [0, 1, 2, 3, 4] }], spans, sec: 0, rb: null };
  const P = {};
  const ws = [];
  const sb = {
    S, P, console, performance, setTimeout, clearTimeout, requestIdleCallback: f => setTimeout(f, 0), Promise, Set, Map,
    store: { get(k, d) { return k in disk ? JSON.parse(disk[k]) : d; }, set(k, v) { disk[k] = JSON.stringify(v); } },
    window: { addEventListener() {}, requestIdleCallback: f => setTimeout(f, 0), getSelection: () => null, CSS: { highlights: hlMap } },
    document: { addEventListener(ev, fn) { docOn[ev] = fn; } }, CSS: { highlights: hlMap }, Highlight,
    $: sel => stub(sel), el: { page: stub('#page'), reader: stub('#reader') },
    savePrefs() {}, guideDoc() { calls.guide++; }, scrollGlide() {}, vocCount() {},
    toast: (m, ms, a) => calls.toast.push({ m, a }), prVoice: w => calls.voice.push(w),
    vocBook: async () => { calls.vocBook++; return { w: LIST }; },
    DICT: { get: async () => ({ ok: true, data: { meanings: [{ defs: [{ d: 'lonely and sad; abandoned' }] }] } }) },
    RVC: { MSG: { full: 'full' } },
    WM: { migrate: e => e }, WS: { all: () => ws, get: w => ws.find(x => x.w === w) || null, remove: w => { const i = ws.findIndex(x => x.w === w); if (i >= 0) ws.splice(i, 1); }, saveWithContext(w, ctx, meta) { calls.saved.push({ w, ctx, meta }); ws.push({ w }); } },
    OW: { rangeOf: (sp, a, b) => { calls.range++; return { sp, a, b }; }, hitAt: (x, y, list) => (list && list[0]) || null }
  };
  vm.createContext(sb);
  try { vm.runInContext(read('src/js/148e-known-words.js') + '\n' + SRC + '\n;this.KU = KU; this.kuChapter = kuChapter; this.kuClose = kuClose; this.kuRepaint = kuRepaint; this.KW = KW;', sb); }
  catch (e) { console.error('known_underline_check: cannot run 161e: ' + e.message); process.exit(2); }
  const chip = () => stub('#kw-chip').textContent, covHidden = () => stub('#kw-cov').hidden;
  const settle = async () => { await sleep(30); await sleep(30); };
  const tap = (id) => { const ev = { target: { closest: () => ({ getAttribute: () => String(id) }) }, clientX: 1, clientY: 1, preventDefault() { ev.pd = 1; }, stopImmediatePropagation() { ev.stop = 1; } }; stubs.get('#page').on.click(ev); return ev; };

  await t('wiring: switch, card buttons and the page tap are connected; no audio-tick listener anywhere in the file', () => {
    assert.ok(stub('#in-knownul').on.change && stub('#kw-know').on.click && stub('#kw-learn').on.click && stub('#kw-say').on.click && stub('#page').on.click);
    assert.ok(calls.guide === 1);
    assert.ok(!/timeupdate|ontimeupdate|audio\.addEventListener|setInterval/.test(SRC.replace(/\/\*[\s\S]*?\*\//g, '')), 'audio tick or timer found');
  });
  await t('setting OFF (the default): a chapter does nothing, no word list is asked for, no chip', async () => {
    sb.kuChapter(0); await settle();
    assert.strictEqual(calls.vocBook, 0); assert.strictEqual(calls.range, 0); assert.ok(covHidden());
    assert.strictEqual(tap(1).stop, undefined);   // a tap is left alone
  });
  await t('setting ON: the chapter is matched, lines are drawn for new words, the chip shows the share known', async () => {
    stub('#in-knownul').on.change({ target: { checked: true } });   // same as the switch; S.sec = 0 so it runs the open chapter at once
    await settle();
    assert.strictEqual(P.knownUl, true); assert.strictEqual(calls.vocBook, 1);
    assert.strictEqual(calls.range, 7, 'ranges drawn: silent, forlorn, gloom, courtyard, tremble, gloom, silent = 7, got ' + calls.range);
    assert.strictEqual(hlMap.get('wt-new').s.size, 7);
    const m = sb.KU.model(); assert.ok(m, 'no model'); assert.strictEqual(m.unknown, 7); assert.strictEqual(m.words, 5);
    assert.strictEqual(chip(), m.pct + '% known'); assert.ok(m.pct < 100 && m.pct >= 80, 'pct ' + m.pct); assert.ok(!covHidden());
    same(m.list.map(x => x.w + ':' + x.n), ['gloom:2', 'silent:2', 'courtyard:1', 'forlorn:1', 'tremble:1']);
  });
  let before;
  await t('opening the same chapter again matches nothing (kept per chapter)', async () => {
    const reads = sents[2].reads; before = calls.range;
    sb.kuChapter(0); await settle();
    assert.strictEqual(sents[2].reads, reads, 'the chapter was matched again');
    assert.strictEqual(calls.vocBook, 1);   // the word list is kept too
    assert.ok(calls.range > before);        // only painting again, from the saved answer
    assert.strictEqual(hlMap.get('wt-new').s.size, 7);
  });
  await t('tap on a new word opens the card: word as written, meaning, button states; a tap on nothing is left alone', async () => {
    const ev = tap(3); assert.strictEqual(ev.stop, 1); assert.strictEqual(ev.pd, 1);
    assert.strictEqual(stub('#kw-card').hidden, false);
    assert.strictEqual(stub('#kw-title').textContent, 'gloom');
    await settle(); assert.strictEqual(stub('#kw-mean').textContent, 'lonely and sad');
    assert.strictEqual(stub('#kw-learn').attrs['aria-pressed'], 'false'); assert.strictEqual(stub('#kw-learn-t').textContent, 'Learn');
    assert.strictEqual(hlMap.get('wt-new-sel').s.size, 1);
    stub('#kw-say').on.click(); same(calls.voice, ['gloom']);
  });
  await t('LEARN saves to My words with the sentence and the level from the book list; again removes it', () => {
    stub('#kw-learn').on.click();
    assert.strictEqual(calls.saved.length, 1);
    const s = calls.saved[0]; assert.strictEqual(s.w, 'gloom'); assert.strictEqual(s.ctx.bid, '7'); assert.strictEqual(s.ctx.bt, 'Dracula'); assert.strictEqual(s.ctx.ch, 1);
    assert.strictEqual(s.meta.lv, 'B2'); assert.ok(/gloom/.test(s.ctx.s));
    assert.strictEqual(stub('#kw-learn').attrs['aria-pressed'], 'true'); assert.strictEqual(stub('#kw-learn-t').textContent, 'Saved');
    assert.strictEqual(sb.KW.isKnown('gloom'), false);   // learning is not knowing: still underlined
    stub('#kw-learn').on.click(); assert.strictEqual(stub('#kw-learn-t').textContent, 'Learn');
  });
  let pctBefore;
  await t('I KNOW IT stores the word in KW (wt:known), closes the card, repaints only the sentences with that word, raises the chip', () => {
    pctBefore = sb.KU.model().pct; const r0 = calls.range;
    stub('#kw-know').on.click();
    assert.strictEqual(sb.KW.isKnown('gloom'), true); assert.ok(/gloom/.test(disk['wt:known']));
    assert.strictEqual(stub('#kw-card').hidden, true);
    assert.strictEqual(calls.range - r0, 3, 'only sentences 3 and 4 hold gloom; their other lines are drawn again (courtyard, tremble, silent): got ' + (calls.range - r0));
    assert.strictEqual(hlMap.get('wt-new').s.size, 5);
    const m = sb.KU.model(); assert.ok(m.pct > pctBefore); assert.strictEqual(m.unknown, 5); assert.strictEqual(chip(), m.pct + '% known');
    const last = calls.toast[calls.toast.length - 1]; assert.strictEqual(last.m, 'Marked as known.'); assert.strictEqual(last.a[0], 'Undo');
  });
  await t('Undo takes the word out of KW and puts the line back', () => {
    calls.toast[calls.toast.length - 1].a[1]();
    assert.strictEqual(sb.KW.isKnown('gloom'), false); assert.strictEqual(hlMap.get('wt-new').s.size, 7); assert.strictEqual(sb.KU.model().pct, pctBefore);
  });
  await t('a word saved as familiar or mastered in My words counts as known at the next chapter open; setting OFF clears lines and chip', async () => {
    ws.length = 0; ws.push({ w: 'silent', st: 'mastered' });
    sb.kuChapter(0); await settle();
    assert.strictEqual(hlMap.get('wt-new').s.size, 5);   // both "silent" lines gone
    stub('#in-knownul').on.change({ target: { checked: false } });
    assert.strictEqual(hlMap.get('wt-new').s.size, 0); assert.ok(covHidden()); assert.strictEqual(sb.KU.model(), null);
    assert.strictEqual(tap(3).stop, undefined);
  });
  await t('wiring in the other files: hooks in 150 and 161d, build.py order, chip strip, settings row, card', () => {
    const r150 = read('src/js/150-player-reader.js'), r161d = read('src/js/161d-old-words.js'), bp = read('build.py');
    assert.ok(/kuChapter\(R\.i\)/.test(r150) && /kuRepaint\(S\.wId\)/.test(r150));
    assert.ok(/kuClose\(\)/.test(r161d) && /rangeOf, hitAt/.test(r161d));
    assert.ok(bp.indexOf('161d-old-words.js') < bp.indexOf('161e-known-underline.js'), 'order');
    assert.ok(/id="kw-cov"/.test(read('src/html/10-body-views.html')) && /id="in-knownul"/.test(read('src/html/30-sheets-settings.html')) && /id="kw-card"/.test(read('src/html/29b-known-card.html')));
    assert.ok(/95d-old-words\.css[\s\S]*95e-known-underline\.css/.test(bp));
  });
  console.log('\n' + (ran - bad) + ' of ' + ran + ' checks passed' + (bad ? ', ' + bad + ' FAILED' : '') + '.');
  process.exit(bad ? 1 : 0);
})();
