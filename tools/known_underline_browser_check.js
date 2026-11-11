#!/usr/bin/env node
/* Browser check for "Underline new words" (src/js/161e-known-underline.js, 95e css, 29b card, the chip strip) in real Chromium (Playwright).
   It loads the REAL 161e, 161d (for the line and tap helpers) and 148e (known words) code, the REAL card markup and the REAL css into a small page with a
   LONG made-up chapter (4,000 sentences) and stand-ins for the rest of the app (P, S, WS, DICT, vocBook ...). It proves the lines, the tap, the card, I know it,
   Learn, the chip, the setting and the speed; it does not prove the full app (open a real book by hand, see the handoff note).
     node tools/known_underline_browser_check.js            (KU_SHOT=file.png  also saves a picture to compare with the mock-up by eye)
   Exit code 1 if a check fails, 2 if the browser or a file is missing. */
const fs = require('fs'), path = require('path'), assert = require('assert');
const root = path.join(__dirname, '..'), rd = f => fs.readFileSync(path.join(root, f), 'utf8');
let chromium; try { ({ chromium } = require('playwright')); } catch (e) { console.error('known_underline_browser_check: playwright is not installed'); process.exit(2); }

const SENTS = 4000, MOCK = 700;
const filler = ['It was a quiet morning and the garden was full of birds singing in the old trees.', 'They walked home before the rain came down on the hill, and nobody spoke for a long while.', 'The letter lay on the table where she had left it the night before, folded in three.'];
const LIST = [['silent', 'B1', 40, 'The silent night.'], ['forlorn', 'C1', 30, 'She looked forlorn.'], ['gloom', 'B2', 25, 'A faint gloom.'], ['tremble', 'B2', 20, 'She began to tremble.'], ['ominous', 'C1', 9, ''], ['dread', 'B2', 8, ''], ['abandon', 'B2', 7, ''], ['solitude', 'C1', 6, ''], ['pallid', 'C2', 5, ''], ['tempest', 'C1', 4, ''], ['languid', 'C2', 3, ''], ['mournful', 'C1', 2, '']];
const html = `<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><html data-theme="dark"><head><style>
${rd('src/css/10-base-layout.css')}\n${rd('src/css/94-learn-ui.css')}\n${rd('src/css/94b-word-panel.css')}\n${rd('src/css/95d-old-words.css')}\n${rd('src/css/95e-known-underline.css')}
body{margin:0;background:var(--bg);color:var(--ink)} #page{font:1.24rem/2 var(--font-read);padding:1rem;max-width:42rem;margin:auto} #page p{margin:0 0 1rem}
</style></head><body><div id="kw-cov" class="kw-cov" role="status" hidden><span class="kw-bar" aria-hidden="true"><i id="kw-fill"></i></span><span id="kw-chip" class="kw-chip" aria-hidden="true"></span></div>
<main id="page"></main>${rd('src/html/29-old-words-card.html')}${rd('src/html/29b-known-card.html')}
<label><input id="in-oldwords" type="checkbox"> old</label> <label><input id="in-knownul" type="checkbox"> setting</label>
<script type="application/json" id="ow-words">${rd('src/data/old-words.json')}</script><script type="application/json" id="ow-idioms">${rd('src/data/idioms.json')}</script>
<script>
window.T = { sentReads: 0, toasts: [], saves: [], voice: [], pageClicks: 0, saved: new Map(), vocCalls: 0, disk: {} };
(() => {
  const $ = (s, r) => (r || document).querySelector(s);
  const h = (tag, a, ...k) => { const n = document.createElement(tag); for (const x in (a || {})) { if (x === 'text') n.textContent = a[x]; else n.setAttribute(x, a[x]); } for (const c of k) if (c != null) n.append(c); return n; };
  const P = {}, savePrefs = () => {}, guideDoc = () => {}, vocCount = () => {}, trLang = () => 'bn';
  const toast = (m, ms, a) => T.toasts.push({ m, a });
  const prVoice = w => T.voice.push(w);
  const store = { get: (k, d) => (k in T.disk ? JSON.parse(T.disk[k]) : d), set: (k, v) => { T.disk[k] = JSON.stringify(v); } };
  const el = { page: document.getElementById('page'), reader: { get scrollTop() { return window.scrollY; }, set scrollTop(v) { window.scrollTo(0, v); }, getBoundingClientRect: () => ({ top: 0, bottom: innerHeight }) } };
  const scrollGlide = (to) => window.scrollTo(0, to);
  const TP = { get: (t, l) => Promise.resolve('[bn] ' + t), drop() {} };
  const RVC = { clean: (t) => String(t).replace(/\\s+/g, ' ').trim(), MSG: { full: 'full' }, toggle: () => ({ state: 'saved' }) };
  const WM = { migrate: e => e };
  const WS = { all: () => [...T.saved.values()], get: w => T.saved.get(String(w).toLowerCase()) || null, remove: w => T.saved.delete(String(w).toLowerCase()),
    saveWithContext: (w, ctx, meta) => { T.saves.push({ w, ctx, meta }); T.saved.set(w.toLowerCase(), { w }); } };
  const DICT = { get: async w => ({ ok: true, data: { meanings: [{ defs: [{ d: 'lonely and sad; abandoned' }] }] } }) };
  const vocBook = async () => { T.vocCalls++; return { w: ${JSON.stringify(LIST)} }; };
  const sents = [];
  for (let i = 0; i < ${SENTS}; i++) {
    let t = ${JSON.stringify(filler)}[i % 3];
    if (i === ${MOCK}) t = 'The castle stood silent above the valley.';
    if (i === ${MOCK + 1}) t = 'She sat alone in the garden, looking forlorn and tired, while the evening wind moved the old trees.';
    if (i === ${MOCK + 2}) t = 'A faint gloom settled over the courtyard, and she began to tremble.';
    if (i % 12 === 5) t += ' The silent house waited in gloom.';
    if (i % 50 === 7) t += ' A forlorn dread, ominous and pallid.';
    sents.push({ get t() { T.sentReads++; return t; }, p: Math.floor(i / 4), ch: 0 });
  }
  const S = { book: { id: 'b1', title: 'Sample' }, model: { sents }, plan: [{ ids: sents.map((_, i) => i) }], spans: new Map(), sec: 0, rb: null };
  for (let i = 0; i < sents.length; i++) {
    let p = el.page.lastElementChild; if (!p || +p.dataset.p !== sents[i].p) { p = h('p', { 'data-p': sents[i].p }); el.page.append(p); } else p.append(' ');
    const sp = h('span', { class: 's', 'data-i': i }); sp.textContent = sents[i].t; S.spans.set(i, sp); p.append(sp);
  }
  el.page.addEventListener('click', () => T.pageClicks++);   // stands in for the app's own tap-on-a-sentence handler (it runs after the capture listeners)
  ${rd('src/js/148e-known-words.js')}
  ${rd('src/js/161d-old-words.js')}
  ${rd('src/js/161e-known-underline.js')}
  window.kuChapter = kuChapter; window.kuRepaint = kuRepaint; window.owChapter = owChapter; window.OW = OW; window.S = S; window.P = P; window.KU = KU; window.KW = KW;
})();
</script></body></html>`;

let ran = 0, bad = 0;
const t = async (name, fn) => { ran++; try { await fn(); console.log('ok   ' + name); } catch (e) { bad++; console.log('FAIL ' + name + ': ' + e.message.split('\n').slice(0, 5).join(' | ')); } };

(async () => {
  let browser; try { browser = await chromium.launch(); } catch (e) { console.error('known_underline_browser_check: ' + e.message); process.exit(2); }
  const page = await (await browser.newContext({ viewport: { width: 420, height: 800 }, deviceScaleFactor: 1 })).newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.setContent(html);
  await page.evaluate(() => { window.__lt = []; try { new PerformanceObserver(l => l.getEntries().forEach(e => __lt.push(e.duration))).observe({ entryTypes: ['longtask'] }); } catch (e) { /* no longtask */ } });
  const size = n => page.evaluate(n => (CSS.highlights.get(n) || { size: 0 }).size, n);
  const wait = async (f, ms = 10000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await page.evaluate(f)) return; await page.waitForTimeout(40); } throw new Error('timed out'); };
  const tapWord = async (id, w) => { const p = await page.evaluate(([id, w]) => { const sp = document.querySelector('.s[data-i="' + id + '"]'); window.scrollTo(0, window.scrollY + sp.getBoundingClientRect().top - 140); const tn = sp.firstChild, i = tn.nodeValue.indexOf(w), r = document.createRange(); r.setStart(tn, i); r.setEnd(tn, i + w.length); const q = r.getClientRects()[0]; return { x: q.left + q.width / 2, y: q.top + q.height / 2 }; }, [id, w]); await page.mouse.click(p.x, p.y); await page.waitForTimeout(120); };
  const vis = () => page.evaluate(() => !document.getElementById('kw-card').hidden);
  const txt = id => page.evaluate(i => document.getElementById(i).textContent, id);
  const covVisible = () => page.evaluate(() => !document.getElementById('kw-cov').hidden);

  await t('setting OFF (the default): a chapter does nothing: no word list asked for, no lines, no chip, taps go to the app', async () => {
    await page.evaluate(() => { window.kuChapter(0); }); await page.waitForTimeout(500);
    assert.strictEqual(await page.evaluate(() => T.vocCalls), 0); assert.strictEqual(await size('wt-new'), 0); assert(!(await covVisible()));
    const before = await page.evaluate(() => T.pageClicks); await tapWord(701, 'forlorn'); assert(!(await vis()));
    assert.strictEqual(await page.evaluate(() => T.pageClicks), before + 1);
  });

  const t0 = Date.now();
  await page.check('#in-knownul');
  await wait(() => !document.getElementById('kw-cov').hidden);
  console.log('     chapter of ' + SENTS + ' sentences: chip and lines ready after about ' + (Date.now() - t0) + ' ms (browser idle time), long tasks over 50 ms: ' + (await page.evaluate(() => __lt.filter(d => d >= 50).length)));
  const firstReads = await page.evaluate(() => T.sentReads);
  await t('ON: dotted lines are drawn for new words only, and the chip shows the share known with a matching meter', async () => {
    const n = await size('wt-new');
    // 4000/12 sentences with 2 listed words, 4000/50 with 4, plus the 3 mock-up sentences = about 990
    assert(n > 900 && n < 1100, 'lines ' + n);
    const chip = await txt('kw-chip'), m = /^(\d+)% known$/.exec(chip); assert(m, 'chip: ' + chip);
    assert.strictEqual(await page.evaluate(() => document.getElementById('kw-fill').style.width), m[1] + '%');
    assert(+m[1] > 50 && +m[1] < 100, 'pct ' + m[1]);
    assert.strictEqual(await page.evaluate(() => document.getElementById('kw-cov').getAttribute('aria-label')), m[1] + '% of the words in this chapter known');
  });
  if (process.env.KU_SHOT_TOP) { await page.evaluate(() => window.scrollTo(0, 0)); await page.screenshot({ path: process.env.KU_SHOT_TOP, clip: { x: 0, y: 0, width: 420, height: 160 } }); }   // the chip strip, to compare with the mock-up by eye
  await t('the lines are on listed words only: "courtyard" and "garden" are not marked, "silent" and "gloom" and "tremble" are', async () => {
    const words = await page.evaluate(() => { const o = {}; for (const r of CSS.highlights.get('wt-new')) { const id = r.startContainer.parentElement.dataset.i; if (id >= 700 && id <= 702) o[r.toString().toLowerCase()] = 1; } return Object.keys(o).sort(); });
    assert.deepStrictEqual(words, ['forlorn', 'gloom', 'silent', 'tremble']);
  });
  let pct0, lines0;
  await t('tap on "forlorn": the card opens with the word, its meaning, I KNOW IT and LEARN; the app\'s own tap did not run; the word is marked', async () => {
    pct0 = +/(\d+)/.exec(await txt('kw-chip'))[1]; lines0 = await size('wt-new');
    const before = await page.evaluate(() => T.pageClicks); await tapWord(701, 'forlorn');
    assert(await vis(), 'card not open'); assert.strictEqual(await txt('kw-title'), 'forlorn');
    await wait(() => document.getElementById('kw-mean').textContent === 'lonely and sad');
    assert.strictEqual(await page.evaluate(() => T.pageClicks), before, 'the app tap ran');
    assert.strictEqual(await size('wt-new-sel'), 1);
    assert.strictEqual((await txt('kw-know')).trim(), 'I know it'); assert.strictEqual((await txt('kw-learn-t')).trim(), 'Learn');
  });
  if (process.env.KU_SHOT) { await page.evaluate(() => { const sp = document.querySelector('.s[data-i="700"]'); window.scrollTo(0, window.scrollY + sp.getBoundingClientRect().top - 170); }); await page.screenshot({ path: process.env.KU_SHOT }); }
  await t('the card does not hide the tapped word', async () => {
    const r = await page.evaluate(() => { const c = document.getElementById('kw-card').getBoundingClientRect(), sp = document.querySelector('.s[data-i="701"]'); const q = [...CSS.highlights.get('wt-new-sel')][0].getBoundingClientRect(); return { top: c.top, bottom: q.bottom }; });
    assert(r.bottom <= r.top, 'word bottom ' + r.bottom + ' is below the card top ' + r.top);
  });
  await t('speaker button speaks the word (device voice through prVoice)', async () => {
    await page.click('#kw-say'); assert.deepStrictEqual(await page.evaluate(() => T.voice), ['forlorn']);
  });
  await t('LEARN: saved to My words with the book, the chapter, the sentence and the level; the button says Saved; again removes it; the line stays', async () => {
    await page.click('#kw-learn');
    const s = await page.evaluate(() => T.saves.slice(-1)[0]);
    assert.strictEqual(s.w, 'forlorn'); assert.strictEqual(s.ctx.bid, 'b1'); assert.strictEqual(s.ctx.bt, 'Sample'); assert.strictEqual(s.ctx.ch, 1); assert.strictEqual(s.meta.lv, 'C1'); assert(/forlorn/.test(s.ctx.s));
    assert.strictEqual(await page.getAttribute('#kw-learn', 'aria-pressed'), 'true'); assert.strictEqual((await txt('kw-learn-t')).trim(), 'Saved');
    assert.strictEqual(await size('wt-new'), lines0, 'learning changed the lines');
    await page.click('#kw-learn'); assert.strictEqual(await page.getAttribute('#kw-learn', 'aria-pressed'), 'false');
  });
  await t('I KNOW IT: the card closes, "forlorn" is known (wt:known), every "forlorn" line goes, the chip goes up, a toast offers Undo', async () => {
    await page.click('#kw-know'); assert(!(await vis()));
    assert.strictEqual(await page.evaluate(() => KW.isKnown('forlorn')), true); assert(/forlorn/.test(await page.evaluate(() => T.disk['wt:known'])));
    const n = await size('wt-new'); assert(n < lines0, 'lines ' + n + ' vs ' + lines0);
    const gone = await page.evaluate(() => [...CSS.highlights.get('wt-new')].filter(r => r.toString().toLowerCase() === 'forlorn').length); assert.strictEqual(gone, 0);
    const pct = +/(\d+)/.exec(await txt('kw-chip'))[1]; assert(pct >= pct0, pct + ' vs ' + pct0);
    const last = await page.evaluate(() => { const x = T.toasts.slice(-1)[0]; return { m: x.m, a: x.a && x.a[0] }; }); assert.deepStrictEqual(last, { m: 'Marked as known.', a: 'Undo' });
  });
  await t('Undo: the word is unknown again and its lines are back', async () => {
    await page.evaluate(() => T.toasts.slice(-1)[0].a[1]()); await page.waitForTimeout(100);
    assert.strictEqual(await page.evaluate(() => KW.isKnown('forlorn')), false); assert.strictEqual(await size('wt-new'), lines0);
    assert.strictEqual(+/(\d+)/.exec(await txt('kw-chip'))[1], pct0);
  });
  await t('a tap away from an open card only closes it (no seek); a tap on an unmarked word with the card closed behaves as before', async () => {
    await tapWord(701, 'forlorn'); assert(await vis()); const before = await page.evaluate(() => T.pageClicks); await tapWord(701, 'garden');
    assert(!(await vis())); assert.strictEqual(await page.evaluate(() => T.pageClicks), before);
    await tapWord(701, 'garden'); assert.strictEqual(await page.evaluate(() => T.pageClicks), before + 1);
    await tapWord(701, 'forlorn'); assert(await vis()); await page.keyboard.press('Escape'); assert(!(await vis()));
  });
  await t('the old-words card and this card never show together: opening one closes the other', async () => {
    await page.evaluate(() => { window.owChapter(0); }); await page.check('#in-oldwords'); await page.waitForTimeout(100);
    await tapWord(701, 'forlorn'); assert(await vis());
    await page.evaluate(() => { OW.showCard({ k: 'w', rec: { id: 'hath', m: 'has', n: '', old: true }, id: 701, s: 0, e: 3 }); });
    assert(!(await vis()), 'new-words card stayed open'); await page.evaluate(() => OW.closeCard()); await page.uncheck('#in-oldwords');
  });
  await t('the same chapter again: no matching, the lines come back', async () => {
    const r0 = await page.evaluate(() => T.sentReads), w0 = await size('wt-new');
    await page.evaluate(() => { window.kuChapter(0); }); await page.waitForTimeout(1500);
    const reads = await page.evaluate(() => T.sentReads) - r0;
    assert.strictEqual(await size('wt-new'), w0); assert(reads < firstReads / 3, reads + ' text reads on the second run, ' + firstReads + ' on the first');
    console.log('     text reads: first run ' + firstReads + ', second run ' + reads + ' (only the sentences with a line are checked before painting)');
  });
  await t('nothing runs while the audio plays: the word highlight puts one sentence back, and only that sentence is painted again, with no matching', async () => {
    const r0 = await page.evaluate(() => T.sentReads);
    const n = await page.evaluate(() => { const sp = S.spans.get(701), txt = sp.textContent; sp.textContent = ''; for (const w of txt.split(' ')) { const e = document.createElement('span'); e.textContent = w + ' '; sp.append(e); } const before = CSS.highlights.get('wt-new').size; sp.textContent = txt; window.kuRepaint(701); return [before, CSS.highlights.get('wt-new').size]; });
    assert(n[1] >= n[0] - 1 && n[1] > 900, JSON.stringify(n)); assert(await page.evaluate(() => T.sentReads) - r0 <= 3, 'it read the text again');
  });
  await t('Settings off: lines and chip go and a tap goes to the app; on again: they return', async () => {
    await page.uncheck('#in-knownul');
    assert.strictEqual(await size('wt-new'), 0); assert(!(await covVisible()));
    const before = await page.evaluate(() => T.pageClicks); await tapWord(701, 'forlorn'); assert(!(await vis())); assert.strictEqual(await page.evaluate(() => T.pageClicks), before + 1);
    await page.check('#in-knownul'); await wait(() => CSS.highlights.get('wt-new') && CSS.highlights.get('wt-new').size > 900 && !document.getElementById('kw-cov').hidden);
  });
  await t('scrolling: frame times with the lines on are the same as with them off', async () => {
    const run = () => page.evaluate(() => new Promise(res => { const d = []; let last = performance.now(), y = 0, n = 0; (function f(now) { d.push(now - last); last = now; window.scrollTo(0, y += 90); if (++n < 150) requestAnimationFrame(f); else { d.shift(); d.sort((a, b) => a - b); res({ p50: d[d.length >> 1], p95: d[Math.floor(d.length * 0.95)], max: d[d.length - 1] }); } })(performance.now()); }));
    await page.evaluate(() => window.scrollTo(0, 0)); const on = await run();
    await page.uncheck('#in-knownul'); await page.evaluate(() => window.scrollTo(0, 0)); const off = await run(); await page.check('#in-knownul');
    console.log('     frame ms, lines on: p50 ' + on.p50.toFixed(1) + ' p95 ' + on.p95.toFixed(1) + ' max ' + on.max.toFixed(1) + ' | off: p50 ' + off.p50.toFixed(1) + ' p95 ' + off.p95.toFixed(1) + ' max ' + off.max.toFixed(1));
    assert(on.p95 <= off.p95 + 8, 'p95 is clearly worse with the lines on');
  });
  await t('no script errors, and no long task (50 ms or more) while matching and painting the whole chapter', async () => {
    assert.deepStrictEqual(errs, []); const lt = await page.evaluate(() => __lt.filter(d => d >= 50).length); assert.strictEqual(lt, 0, lt + ' long tasks');
  });
  await browser.close();
  console.log('\nran ' + ran + ', failed ' + bad); process.exit(bad ? 1 : 0);
})();
