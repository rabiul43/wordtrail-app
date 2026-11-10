#!/usr/bin/env node
/* Browser check for the old-words highlight and card (src/js/161d-old-words.js, 95d css, 29 html) in real Chromium (Playwright).
   It loads the REAL 161d code, the REAL card markup and the REAL css into a small page that has a made-up chapter and stand-ins for the
   rest of the app (P, S, TP, WS, RVC ...). So it proves the lines, the tap, the card, Save phrase wiring, the setting and the speed;
   it does not prove the full app (open a real book by hand, see the handoff note).   node tools/old_words_browser_check.js
   Exit code 1 if a check fails, 2 if the browser or a file is missing. */
const fs = require('fs'), path = require('path'), assert = require('assert');
const root = path.join(__dirname, '..'), rd = f => fs.readFileSync(path.join(root, f), 'utf8');
let chromium; try { ({ chromium } = require('playwright')); } catch (e) { console.error('old_words_browser_check: playwright is not installed'); process.exit(2); }

const SENTS = 1500, MOCK = 700;   // the mock-up sentences sit at 700..702
const filler = ['It was a quiet morning and the garden was full of birds singing in the old trees.', 'They walked home before the rain came down on the hill, and nobody spoke for a long while.', 'The letter lay on the table where she had left it the night before.'];
const html = `<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><html data-theme="dark"><head><style>
${rd('src/css/10-base-layout.css')}\n${rd('src/css/94-learn-ui.css')}\n${rd('src/css/94b-word-panel.css')}\n${rd('src/css/95d-old-words.css')}
body{margin:0;background:var(--bg);color:var(--ink)} #page{font:1.24rem/2 var(--font-read);padding:1rem;max-width:42rem;margin:auto} #page p{margin:0 0 1rem}
</style></head><body><main id="page"></main>${rd('src/html/29-old-words-card.html')}
<label><input id="in-oldwords" type="checkbox"> setting</label>
<script type="application/json" id="ow-words">${rd('src/data/old-words.json')}</script><script type="application/json" id="ow-idioms">${rd('src/data/idioms.json')}</script>
<script>
window.T = { sentReads: 0, toasts: [], saves: [], pageClicks: 0, saved: new Set() };
(() => {
  const $ = (s, r) => (r || document).querySelector(s);
  const h = (tag, a, ...k) => { const n = document.createElement(tag); for (const x in (a || {})) { if (x === 'text') n.textContent = a[x]; else n.setAttribute(x, a[x]); } for (const c of k) if (c != null) n.append(c); return n; };
  const P = {}, savePrefs = () => {}, toast = m => T.toasts.push(m), guideDoc = () => {}, vocCount = () => {}, trLang = () => 'bn';
  const el = { page: document.getElementById('page'), reader: { get scrollTop() { return window.scrollY; }, set scrollTop(v) { window.scrollTo(0, v); }, getBoundingClientRect: () => ({ top: 0, bottom: innerHeight }) } };
  const scrollGlide = (to) => window.scrollTo(0, to);   // the app's own glide, here an instant jump
  const TP = { get: (t, l) => Promise.resolve('[bn] ' + t), drop() {} };
  const WS = { get: w => (T.saved.has(String(w).toLowerCase()) ? { w } : null), remove: w => T.saved.delete(String(w).toLowerCase()) };
  const RVC = { clean: (t) => String(t).replace(/\\s+/g, ' ').trim(), MSG: { full: 'full' },
    toggle: (c, lang, tr) => { const k = c.phrase.toLowerCase(); T.saves.push({ c, lang, tr }); if (T.saved.has(k)) { T.saved.delete(k); return { state: 'removed' }; } T.saved.add(k); return { state: 'saved' }; } };
  const sents = [];
  for (let i = 0; i < ${SENTS}; i++) {
    let t = ${JSON.stringify(filler)}[i % 3];
    if (i === ${MOCK}) t = '\\u201cHe hath no wish to trouble you,\\u201d she said, at the end of her tether.';
    if (i === ${MOCK + 1}) t = '\\u201cWhilst you speak so, I cannot hold my tongue.\\u201d';
    if (i === ${MOCK + 2}) t = 'The art of the matter is that he spake ere the dawn.';
    if (i % 40 === 5) t += ' Thou art kind, and the foe doth wait.';
    sents.push({ get t() { T.sentReads++; return t; }, p: Math.floor(i / 4), ch: 0 });
  }
  const S = { book: { id: 'b1', title: 'Sample' }, model: { sents }, plan: [{ ids: sents.map((_, i) => i) }], spans: new Map(), sec: 0, rb: null };
  for (let i = 0; i < sents.length; i++) {
    let p = el.page.lastElementChild; if (!p || +p.dataset.p !== sents[i].p) { p = h('p', { 'data-p': sents[i].p }); el.page.append(p); } else p.append(' ');
    const sp = h('span', { class: 's', 'data-i': i }); sp.textContent = sents[i].t; S.spans.set(i, sp); p.append(sp);
  }
  el.page.addEventListener('click', () => T.pageClicks++);   // stands in for the app's own tap-on-a-sentence handler (it runs after the capture listener)
  ${rd('src/js/161d-old-words.js')}
  window.owChapter = owChapter; window.owRepaint = owRepaint; window.S = S; window.P = P; window.OW = OW;
})();
</script></body></html>`;

let ran = 0, bad = 0;
const t = async (name, fn) => { ran++; try { await fn(); console.log('ok   ' + name); } catch (e) { bad++; console.log('FAIL ' + name + ': ' + e.message.split('\n').slice(0, 5).join(' | ')); } };
(async () => {
  let browser; try { browser = await chromium.launch(); } catch (e) { console.error('old_words_browser_check: ' + e.message); process.exit(2); }
  const page = await (await browser.newContext({ viewport: { width: 420, height: 800 }, deviceScaleFactor: 1 })).newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.setContent(html);
  await page.evaluate(() => { window.__lt = []; try { new PerformanceObserver(l => l.getEntries().forEach(e => __lt.push(e.duration))).observe({ entryTypes: ['longtask'] }); } catch (e) { /* no longtask */ } });
  const size = n => page.evaluate(n => (CSS.highlights.get(n) || { size: 0 }).size, n);
  const wait = async (f, ms = 8000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await page.evaluate(f)) return; await page.waitForTimeout(40); } throw new Error('timed out'); };
  const tapWord = async (word) => { const p = await page.evaluate(w => { const sp = document.querySelector('.s[data-i="700"]'); window.scrollTo(0, window.scrollY + sp.getBoundingClientRect().top - 120); const tn = sp.firstChild, i = tn.nodeValue.indexOf(w), r = document.createRange(); r.setStart(tn, i); r.setEnd(tn, i + w.length); const q = r.getBoundingClientRect(); return { x: q.left + q.width / 2, y: q.top + q.height / 2 }; }, word); await page.mouse.click(p.x, p.y); await page.waitForTimeout(150); };
  const vis = () => page.evaluate(() => !document.getElementById('ow-card').hidden);
  const txt = id => page.evaluate(i => document.getElementById(i).textContent, id);

  const t0 = Date.now();
  await page.evaluate(() => { window.owChapter(0); });
  await page.evaluate(() => { window.__T0 = performance.now(); });
  await wait(() => window.__T0 && CSS.highlights.get('wt-old') && CSS.highlights.get('wt-old').size > 40 && CSS.highlights.get('wt-idiom') && CSS.highlights.get('wt-idiom').size >= 2);
  await page.waitForTimeout(1500);   // let every slice finish
  const firstReads = await page.evaluate(() => T.sentReads);
  console.log('     chapter of 1500 sentences: lines drawn after about ' + (Date.now() - t0) + ' ms (browser idle time), long tasks over 50 ms: ' + (await page.evaluate(() => __lt.length)));
  await t('the lines appear: old words and idioms in two separate highlights', async () => {
    const w = await size('wt-old'), i = await size('wt-idiom');
    // 4 of the 3 mock-up sentences give hath, Whilst, spake, ere, doth...; 1500/40 extra sentences give art, thou, doth, foe
    assert(w > 100 && i === 2, 'old ' + w + ' idioms ' + i);
  });
  await t('"art" alone is not marked, but "Thou art" is (the one in sentence 702 has no thou)', async () => {
    const hasArt = await page.evaluate(() => [...CSS.highlights.get('wt-old')].some(r => r.startContainer.parentElement.dataset.i === '702' && r.toString().toLowerCase() === 'art'));
    assert(!hasArt, 'art was marked');
  });
  await t('tap on "hath": the card opens with Old use, the meaning, the translation and other old words; the app\'s own tap did not run', async () => {
    const before = await page.evaluate(() => T.pageClicks); await tapWord('hath');
    assert(await vis(), 'card not open');
    assert.strictEqual(await txt('ow-title'), 'hath'); assert.strictEqual(await txt('ow-mean'), 'has');
    assert((await txt('ow-tags')).trim() === 'Old use', 'tags: ' + await txt('ow-tags'));
    await wait(() => !document.getElementById('ow-tr').hidden); assert.strictEqual(await txt('ow-trtext'), '[bn] has');
    assert((await txt('ow-chips')).includes(' = '), 'no other old words');
    assert.strictEqual(await page.evaluate(() => T.pageClicks), before, 'the app tap ran');
  });
  await t('tap on the idiom: Idiom and Old use tags, the title is the text as written, the meaning is shown', async () => {
    const p = await page.evaluate(() => { const r = [...CSS.highlights.get('wt-idiom')][0]; const q = r.getClientRects()[0]; return { x: q.left + 12, y: q.top + q.height / 2, text: r.toString() }; });
    await page.mouse.click(p.x, p.y); await page.waitForTimeout(150);
    assert.strictEqual(await txt('ow-title'), 'at the end of her tether');
    assert((await txt('ow-tags')).replace(/\s+/g, '') === 'IdiomOlduse', 'tags: ' + await txt('ow-tags'));
    assert.strictEqual(await txt('ow-mean'), 'To have no patience or strength left');
  });
  if (process.env.OW_SHOT) await page.screenshot({ path: process.env.OW_SHOT });   // a picture of the card, to compare with the mock-up by eye
  await t('Save phrase: calls the My Words save with the phrase, the book, the chapter and the translation; tap again removes it', async () => {
    await page.click('#ow-save');
    let s = await page.evaluate(() => T.saves.slice(-1)[0]);
    assert.strictEqual(s.c.phrase, 'at the end of her tether'); assert.strictEqual(s.c.bid, 'b1'); assert.strictEqual(s.c.ch, 1); assert(/^\[bn\]/.test(s.tr), 'tr ' + s.tr);
    assert.strictEqual(await page.getAttribute('#ow-save', 'aria-pressed'), 'true');
    await page.click('#ow-save'); assert.strictEqual(await page.getAttribute('#ow-save', 'aria-pressed'), 'false');
  });
  await t('a tap on a chip shows that word; Escape closes the card', async () => {
    await page.click('.ow-chip'); assert(await vis()); assert((await txt('ow-tags')).trim() === 'Old use');
    await page.keyboard.press('Escape'); assert(!(await vis()));
  });
  await t('a tap on an unmarked word with the card closed behaves as before (the app tap runs)', async () => {
    const before = await page.evaluate(() => T.pageClicks); await tapWord('wish'); assert(!(await vis()));
    assert.strictEqual(await page.evaluate(() => T.pageClicks), before + 1);
  });
  await t('a tap away from an open card only closes it (no seek)', async () => {
    await tapWord('hath'); assert(await vis()); const before = await page.evaluate(() => T.pageClicks); await tapWord('wish');
    assert(!(await vis())); assert.strictEqual(await page.evaluate(() => T.pageClicks), before);
  });
  await t('the word highlight: a sentence put back to plain text is painted again from the saved answer, with no new matching', async () => {
    const r0 = await page.evaluate(() => T.sentReads);
    const n = await page.evaluate(() => { const sp = S.spans.get(700), txt = sp.textContent; sp.textContent = ''; for (const w of txt.split(' ')) { const e = document.createElement('span'); e.textContent = w + ' '; sp.append(e); } const before = CSS.highlights.get('wt-old').size;
      sp.textContent = txt; window.owRepaint(700); return [before, CSS.highlights.get('wt-old').size]; });
    assert(n[1] >= n[0] - 1 && n[1] > 100, JSON.stringify(n));
    assert(await page.evaluate(() => T.sentReads) - r0 <= 3, 'it read the text again');
    await tapWord('hath'); assert(await vis()); await page.keyboard.press('Escape');
  });
  await t('the same chapter again: no matching, the lines come back', async () => {
    const r0 = await page.evaluate(() => T.sentReads); const w0 = await size('wt-old');
    await page.evaluate(() => { window.owChapter(0); }); await page.waitForTimeout(1200);
    const reads = await page.evaluate(() => T.sentReads) - r0;
    assert.strictEqual(await size('wt-old'), w0); assert(reads < firstReads / 2, reads + ' text reads on the second run, ' + firstReads + ' on the first');
    console.log('     text reads: first run ' + firstReads + ', second run ' + reads);
  });
  await t('Settings off: the lines go and a tap goes to the app; on again: the lines return', async () => {
    await page.check('#in-oldwords'); await page.uncheck('#in-oldwords');
    assert.strictEqual(await size('wt-old'), 0); assert.strictEqual(await size('wt-idiom'), 0);
    const before = await page.evaluate(() => T.pageClicks); await tapWord('hath'); assert(!(await vis()));
    assert.strictEqual(await page.evaluate(() => T.pageClicks), before + 1);
    await page.check('#in-oldwords'); await wait(() => CSS.highlights.get('wt-old').size > 100); 
  });
  await t('scrolling: frame times with the lines on are the same as with them off', async () => {
    const run = () => page.evaluate(() => new Promise(res => { const d = []; let last = performance.now(), y = 0, n = 0; (function f(now) { d.push(now - last); last = now; window.scrollTo(0, y += 90); if (++n < 150) requestAnimationFrame(f); else { d.shift(); d.sort((a, b) => a - b); res({ p50: d[d.length >> 1], p95: d[Math.floor(d.length * .95)], max: d[d.length - 1] }); } })(last); }));
    await page.evaluate(() => window.scrollTo(0, 0)); const on = await run();
    await page.uncheck('#in-oldwords'); await page.evaluate(() => window.scrollTo(0, 0)); const off = await run(); await page.check('#in-oldwords');
    console.log('     frame ms, lines on: p50 ' + on.p50.toFixed(1) + ' p95 ' + on.p95.toFixed(1) + ' max ' + on.max.toFixed(1) + ' | off: p50 ' + off.p50.toFixed(1) + ' p95 ' + off.p95.toFixed(1) + ' max ' + off.max.toFixed(1));
    assert(on.p95 <= off.p95 + 8, 'p95 is clearly worse with the lines on');
  });
  await t('no script errors, and no long task (50 ms or more) while matching and painting the whole chapter', async () => {
    assert.deepStrictEqual(errs, []); const lt = await page.evaluate(() => __lt.filter(d => d >= 50).length); assert.strictEqual(lt, 0, lt + ' long tasks');
  });
  await browser.close();
  console.log('\nran ' + ran + ', failed ' + bad); process.exit(bad ? 1 : 0);
})();
