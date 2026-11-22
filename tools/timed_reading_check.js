#!/usr/bin/env node
/* Check for Timed reading (TMR, TRC in 169q-timed-reading.js, Task 58): pure rules, wiring, then real Chromium (Playwright) in a stand-in page
   (the real styles, the real screen file, the real chapter reader Core and the real QG; not the whole app). The browser part turns the phone
   (portrait -> landscape -> portrait), sends the page to the background and back, reloads the page, finishes a read, lets the time run out.
     node tools/timed_reading_check.js [--shot dir]      Exit code 1 if a check fails, 2 if there is no browser.
   It cannot test the real Learn hub, real touch, or a real browser throwing a page away in the background (the reload test stands in for it). */
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const root = path.join(__dirname, '..'), read = f => fs.readFileSync(path.join(root, f), 'utf8');
const shotDir = process.argv.includes('--shot') ? process.argv[process.argv.indexOf('--shot') + 1] : '';
let bad = 0; const ok = (c, m) => { console.log((c ? 'ok    ' : 'FAIL  ') + m); if (!c) bad++; };
// ---- pure rules
const js = read('src/js/169q-timed-reading.js');
const ctx = vm.createContext({}); vm.runInContext(js.slice(js.indexOf('/* TRC-START */'), js.indexOf('/* TRC-END */')) + '\nthis.C = TRC;', ctx);
const C = ctx.C, J = x => JSON.parse(JSON.stringify(x));
const mkSents = (nPara, perPara, words, over) => { const ss = []; let k = 0; for (let p = 0; p < nPara; p++) for (let s = 0; s < perPara; s++, k++) {
  const w = []; for (let i = 0; i < words; i++) w.push('word' + ((k * 7 + i) % 50)); ss.push({ t: (over && over[k]) || ('Bees ' + w.join(' ') + '.'), p }); } return ss; };
{
  const ss = mkSents(30, 4, 14), r = C.pick(ss);   // 15 words a sentence, 60 a paragraph, 1800 words in all
  ok(r && r.words >= 600 && r.words <= 900, 'pick: a passage of 600 to 900 words (got ' + (r && r.words) + ')');
  ok(r && ss[r.from].p !== (ss[r.from - 1] || { p: -1 }).p, 'pick: starts where a book paragraph starts');
  ok(r && r.paras.length >= 4 && r.paras.length <= 7 && r.paras.map(p => p.L).join('') === 'ABCDEFG'.slice(0, r.paras.length), 'split: 4 to 7 paragraphs lettered from A (got ' + (r && r.paras.map(p => p.L).join('')) + ')');
  ok(r && r.paras.map(p => p.t).join(' ') === ss.slice(r.from, r.to + 1).map(s => s.t).join(' '), 'split: the paragraphs hold exactly the chosen sentences, in order, none lost or repeated');
  ok(r && r.paras.every(p => C.wc(p.t) >= 60 && C.wc(p.t) <= 260), 'split: no tiny or huge paragraph');
  const dis = mkSents(30, 4, 14, { 2: 'See the illustration [Page 12] here.', 40: 'A broken sentence {with brackets}.' }), d = C.pick(dis);
  ok(d && dis.slice(d.from, d.to + 1).every(s => !/[\[\]{}]|illustration/i.test(s.t)), 'pick: a window never contains debris (footnote, illustration, brackets)');
  ok(C.pick(mkSents(5, 4, 14)) === null, 'pick: a chapter of under 600 words gives no passage');
  ok(JSON.stringify(C.pick(ss)) === JSON.stringify(C.pick(ss)), 'pick: the same chapter always gives the same passage');
  const nxt = C.pick(ss, { from: r.to + 1 }); ok(nxt && nxt.from > r.to, 'pick: o.from asks for the next passage after the first');
  const model = { sents: [], chapters: [] };
  [[0, 5], [1, 30], [2, 30]].forEach(([c, n]) => { const st = model.sents.length; mkSents(n, 4, 14).forEach(s => model.sents.push({ t: s.t, ch: c, p: c * 100 + s.p, h: false })); model.chapters.push({ title: 'Chapter ' + c, start: st, end: model.sents.length }); });
  const f1 = C.find(model, 0, 0); ok(f1 === null, 'find: a short chapter 0 with nothing else reached gives nothing');
  const f2 = C.find(model, 2, 1); ok(f2 === null, 'find: a chapter past the furthest reached is refused (spoiler rule)');
  const f3 = C.find(model, 0, 1); ok(f3 && f3.ch === 1 && f3.ct === 'Chapter 1', 'find: a short chapter falls back to another REACHED chapter (1), never chapter 2');
  const f4 = C.find(model, 2, 2); ok(f4 && f4.ch === 2, 'find: the asked chapter is used first when it is long enough');
}
ok(C.wpm(750, 300) === 150 && C.wpm(750, 19) === 0 && C.wpm(900, 20) === 0 && C.wpm(600, 25) === 0, 'wpm: 750 words in 5 minutes = 150; under 20 seconds or over 1000 words/min is not saved');
ok(C.wpm(750, 300) === 150 && C.wpm(0, 300) === 0 && C.wpm(750, NaN) === 0 && C.wpm(750, 45) === 1000, 'wpm: nonsense gives 0; exactly 1000 words/min is allowed');
ok(C.minutes(20) === 20 && C.minutes(22) === 20 && C.minutes(23) === 25 && C.minutes(3) === 5 && C.minutes(99) === 60 && C.minutes('x') === 20 && C.minutes(undefined) === 20, 'minutes: 5 to 60 in steps of 5, default 20');
ok(C.left(10000, 7500, 20) === 3 && C.left(10000, 11000, 20) === 0 && C.left(1e12, 0, 20) === 1200 && C.left('x', 0, 20) === 0, 'left: seconds to the end, never below 0, never above the chosen minutes (a clock that jumps back cannot add time)');
ok(C.fmt(1062) === '17:42' && C.fmt(1200) === '20:00' && C.fmt(0) === '0:00' && C.fmt(-5) === '0:00' && C.fmt(3600) === '60:00', 'fmt: m:ss');
ok(C.isNonFiction('Non-fiction') === true && C.isNonFiction('Science, History') === true && C.isNonFiction('Detective Fiction, Mystery') === false && C.isNonFiction('') === null && C.isNonFiction(undefined) === null, 'isNonFiction: true, false, or null when the genres are not known');
{
  const R = (id, ts, wpm) => ({ id, ts, bid: '7', ch: 0, w: 700, s: 300, wpm }), A = [R('a', 1, 150), R('b', 3, 170)], B = [R('b', 3, 170), R('c', 2, 160), { id: 'x', ts: 'no' }, null], before = JSON.stringify([A, B]);
  const M = J(C.merge(A, B)); ok(M.map(x => x.id).join('') === 'acb', 'merge: joined by id, oldest first, bad runs dropped');
  ok(JSON.stringify([A, B]) === before && JSON.stringify(C.merge(M, B)) === JSON.stringify(M) && JSON.stringify(J(C.merge(B, A))) === JSON.stringify(M), 'merge: inputs not changed, repeatable, order does not matter');
  const big = []; for (let i = 1; i <= 230; i++) big.push(R('r' + i, i, 100)); const k = J(C.merge(big, [])); ok(k.length === 200 && k[0].id === 'r31' && k[199].id === 'r230', 'merge: the newest 200 are kept');
  ok(C.mergeJson('[]', '{}') === null && C.mergeJson('x', '{}') === null && JSON.parse(C.mergeJson(JSON.stringify({ v: 1, runs: A }), JSON.stringify({ runs: B }))).runs.length === 3, 'mergeJson: null for something that is not a history; otherwise the joined runs');
  const st = J(C.stats([R('a', 1, 100), R('b', 2, 200), R('c', 3, 300), R('d', 4, 100), R('e', 5, 100), R('f', 6, 100)]));
  ok(st.n === 6 && st.last === 100 && st.best === 300 && st.avg === 150 && st.avg5 === 160, 'stats: n, last, best, average, average of the last 5');
  ok(J(C.stats([])).n === 0 && J(C.stats(null)).best === 0, 'stats: empty history gives zeros');
  ok(J(C.series([R('a', 1, 100), R('b', 2, 200), R('c', 3, 300)], 2)).map(x => x.wpm).join() === '200,300', 'series: the last n points, oldest first (for a chart)');
}
// ---- wiring (static)
const b = read('build.py'); ok(b.indexOf('169p-paraphrase-screen.js') < b.indexOf('169q-timed-reading.js') && b.indexOf('169q-timed-reading.js') < b.indexOf('170-sync-points-drift.js') && /94x-timed-reading\.css/.test(b), 'build.py loads the new js (after 169p, before 170) and css');
const sy = read('src/js/295-account-sync.js'); ok(/k === 'wt:ielts' \|\| k === 'wt:readspeed'\]/.test(sy) && /k === 'wt:readspeed'\) return TMR\.mergeJson/.test(sy) && /AC_MERGE = [^\n]*'wt:readspeed'/.test(sy), 'sync: wt:readspeed has a category (Learning stats) and a merge rule');
ok(!/wt:readrun|wt:readmin/.test(sy), 'sync: the run in progress and the minutes setting stay on this device (no category)');
ok(/BK_KEYS = \[[^\]]*'wt:readspeed'/.test(read('src/js/290-backup-maintenance.js')), 'backup: wt:readspeed is in the backup keys');
const pk = read('src/js/270-sheets-nextup-back.js'); ok(/\(TMR\.on \? 1 : 0\)/.test(pk) && /else if \(TMR\.on\) TMR\.close\(\)/.test(pk), 'Back button closes timed reading (270)');
const bn = JSON.parse(read('src/i18n/bn.json')); const dictKeys = ['Timed reading', 'Get ready', 'I’ve finished reading', 'Speed saved', 'Time is up', 'Passage 1'];
ok(dictKeys.every(k => bn.dict[k]) && bn.rx.some(r => r[0] === '^(\\d+) words per minute$'), 'bn.json has the new strings');
// every plain English string the screen shows is in bn.json (or is a number pattern in rx)
{
  const strs = new Set(); const re = /(?:h\('[a-z0-9]+', \{[^}]*\}|toast\(|panel\([^,]+,|\bchip\(|, )\s*'((?:[^'\\]|\\.)+)'/g; let m;
  const body = js.slice(js.indexOf('const TMR = (() => {'));
  while ((m = re.exec(body))) strs.add(m[1].replace(/\\u2019/g, '’').replace(/\\u2212/g, '−'));
  const need = ['Passage 1', 'Get ready', 'Passage', 'Time', 'Start', 'Done', 'Time left', 'Fewer minutes', 'More minutes', 'Speed saved', 'Time is up', 'Close timed reading', 'I’ve finished reading',
    'The timer keeps going if you switch apps or turn your phone.', 'Take your time. Tap again when you have read the whole passage.', 'About 5 minutes left', '1 minute left',
    'Your last timed reading ran out of time. Start a new one when you like.', 'This is your first one. Come back to see how your speed grows.', 'That is fine. Your speed was not saved this time. Try again whenever you like.'];
  const miss = need.filter(k => !bn.dict[k]); ok(miss.length === 0, 'bn.json covers every fixed string of the screen' + (miss.length ? ' (missing: ' + miss.join(' | ') + ')' : ''));
  const inCode = need.filter(k => body.indexOf(k.replace(/’/g, '\\u2019')) < 0 && body.indexOf(k) < 0); ok(inCode.length === 0, 'the strings checked in bn.json are really the strings used in the code' + (inCode.length ? ' (not found in code: ' + inCode.join(' | ') + ')' : ''));
}
// ---- real Chromium
let chromium; try { ({ chromium } = require('playwright')); } catch (e) { console.error('timed_reading_check: playwright is not installed'); process.exit(2); }
const css = ['src/css/10-base-layout.css', 'src/css/94-learn-ui.css', 'src/css/94f-review-lesson.css', 'src/css/94m-questions.css', 'src/css/94x-timed-reading.css'].map(read).join('\n');
const WORDS = ['soil', 'river', 'forest', 'climate', 'colony', 'nectar', 'pollen', 'season', 'harvest', 'habitat', 'migration', 'survival', 'balance', 'pattern', 'signal'];
let raw = 'CHAPTER I.\n\n';
for (let p = 0; p < 22; p++) { for (let s = 0; s < 4; s++) { const w = []; for (let i = 0; i < 12; i++) w.push(WORDS[(p * 5 + s * 3 + i) % WORDS.length]); raw += 'Bees ' + w.join(' ') + ' each year.' + (s < 3 ? ' ' : ''); } raw += '\n\n'; }
const page = `<!doctype html><html data-theme="dark"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style></head><body>
<script>
(() => { const real = Date.now.bind(Date); Date.now = () => real() + (Number(localStorage.getItem('test:off')) || 0); })();   // the test moves the clock by writing test:off
const h = (tag, attrs, ...kids) => { const e = document.createElement(tag); Object.keys(attrs || {}).forEach(k => { const v = attrs[k]; if (v == null || v === false) return; if (k === 'class') e.className = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v === true ? '' : v); }); kids.flat().forEach(c => { if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(String(c))); }); return e; };
window.__toasts = [];
const toast = m => window.__toasts.push(m), histSoon = () => {}, LB = { ctx: () => null }, P = {};
const store = { get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }, set(k, v) { localStorage.setItem(k, JSON.stringify(v)); } };
const LearnHub = { register(t) { window.__tile = t; }, refresh() {} };
</script>
<script>${read('src/js/010-core.js')}</script>
<script>
const S = { book: { id: 7, title: 'The Hidden Life of Bees', genres: window.__genres || 'Non-fiction, Science' }, model: Core.parseBook(${JSON.stringify(raw)}), lp: { 0: 0.5 }, map: [0], span: [0] };
window.__S = S;
${read('src/js/167c-question-gen.js')}
${read('src/js/169q-timed-reading.js')}
window.TMR = TMR; window.TRC = TRC;
</script></body></html>`;
let pass = 0, fail = 0;
const t = async (name, fn) => { try { await fn(); pass++; console.log('ok    ' + name); } catch (e) { fail++; console.log('FAIL  ' + name + '\n        ' + String(e && e.message).split('\n').slice(0, 5).join('\n        ')); } };
(async () => {
  let br; try { br = await chromium.launch(); } catch (e) { console.error('timed_reading_check: no browser: ' + e.message); process.exit(2); }
  const bc = await br.newContext({ viewport: { width: 390, height: 844 } }), pg = await bc.newPage(), errs = [];
  await pg.route('https://wt.test/**', r => r.fulfill({ contentType: 'text/html', body: page }));
  pg.on('pageerror', e => errs.push(String(e))); pg.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  const load = async () => { await pg.goto('https://wt.test/'); await pg.waitForFunction('window.TMR'); };
  const shot = async n => { if (shotDir) { fs.mkdirSync(shotDir, { recursive: true }); await pg.screenshot({ path: path.join(shotDir, n + '.png') }); } };
  const clock = ms => pg.evaluate(v => { localStorage.setItem('test:off', String((Number(localStorage.getItem('test:off')) || 0) + v)); }, ms);
  const timer = async () => (await pg.locator('.tr-time').innerText()).trim();
  const secs = s => { const [m, x] = s.split(':').map(Number); return m * 60 + x; };
  await load(); await pg.evaluate(() => localStorage.clear());
  await t('the passage the page really gets: 600 to 900 words, lettered paragraphs, from the real chapter reader', async () => {
    const ok2 = await pg.evaluate(() => window.TMR.start({ bookId: '7', chapter: 0 })); assert.strictEqual(ok2, true, 'start false; toasts: ' + JSON.stringify(await pg.evaluate(() => window.__toasts)));
    assert.ok((await pg.locator('.tr-h').innerText()).includes('Passage 1')); assert.strictEqual(await pg.locator('.tr-time').innerText(), '20:00');
    const chips = await pg.locator('.tr-chip').allInnerTexts(); const wds = Number((chips[0].match(/\d+/) || [0])[0]);
    assert.ok(wds >= 600 && wds <= 900, 'words ' + chips[0]); assert.ok(/^Paragraphs A.[D-G]$/.test(chips[1]), chips[1]); await shot('1-get-ready');
  });
  await t('Get ready: minutes go 5 to 60 in steps of 5, the chip follows, the choice is kept', async () => {
    await pg.getByRole('button', { name: 'More minutes' }).click(); assert.strictEqual(await timer(), '25:00'); assert.ok((await pg.locator('.tr-mins').innerText()).includes('25'));
    await pg.getByRole('button', { name: 'Fewer minutes' }).click(); await pg.getByRole('button', { name: 'Fewer minutes' }).click(); await pg.getByRole('button', { name: 'Fewer minutes' }).click();
    assert.strictEqual(await timer(), '10:00'); await pg.getByRole('button', { name: 'Fewer minutes' }).click();
    assert.strictEqual(await timer(), '5:00'); assert.ok(await pg.getByRole('button', { name: 'Fewer minutes' }).isDisabled(), 'at 5 the minus button is off');
    assert.strictEqual(await pg.evaluate(() => localStorage.getItem('wt:readmin')), '5');
    for (let i = 0; i < 3; i++) await pg.getByRole('button', { name: 'More minutes' }).click(); assert.strictEqual(await timer(), '20:00');
  });
  await t('Start: the passage with lettered paragraphs, a timer chip and the finished button', async () => {
    await pg.getByRole('button', { name: 'Start' }).click(); await pg.waitForSelector('.tr-passage');
    assert.ok((await pg.locator('.tr-para').count()) >= 4); assert.strictEqual(await pg.locator('.tr-let').first().innerText(), 'A');
    const t0 = secs(await timer()); assert.ok(t0 >= 1198 && t0 <= 1200, 'timer ' + t0);
    assert.ok(await pg.getByRole('button', { name: /finished reading/ }).isVisible()); assert.ok(await pg.locator('.tr-timer[role="timer"]').count() === 1);
    const run = await pg.evaluate(() => JSON.parse(localStorage.getItem('wt:readrun'))); assert.ok(run && run.end - run.start === 1200000 && run.paras.length >= 4 && !run.rd, 'run saved'); await shot('2-reading');
  });
  await t('rotating the phone: same timer, same page (not redrawn), reading place kept, button on screen', async () => {
    await pg.locator('.rl__scroll').evaluate(el => { el.scrollTop = 220; }); await pg.evaluate(() => { document.querySelector('.tr-passage').__mark = 'same'; });
    const before = secs(await timer()); await clock(60000);   // a minute passes while the phone is turned
    await pg.setViewportSize({ width: 844, height: 390 }); await pg.waitForTimeout(700); await shot('3-landscape');
    const after = secs(await timer()); assert.ok(before - after >= 59 && before - after <= 62, 'a minute went by: ' + before + ' -> ' + after);
    assert.strictEqual(await pg.evaluate(() => document.querySelector('.tr-passage').__mark), 'same', 'the passage was redrawn');
    assert.ok(await pg.locator('.rl__scroll').evaluate(el => el.scrollTop) >= 200, 'reading place lost');
    const tb = await pg.locator('.tr-timer').boundingBox(), bb = await pg.getByRole('button', { name: /finished reading/ }).boundingBox();
    assert.ok(tb && tb.y >= 0 && tb.x + tb.width <= 844, 'timer on screen'); assert.ok(bb && bb.y >= 0 && bb.y + bb.height <= 390, 'finished button on screen');
    await pg.setViewportSize({ width: 390, height: 844 }); await pg.waitForTimeout(500);
    assert.ok(Math.abs(secs(await timer()) - after) <= 2, 'back to portrait: same time');
  });
  await t('switching apps: while hidden the clock keeps its own time; on return the right time is drawn at once (no wait for a tick)', async () => {
    await pg.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
    const shown = secs(await timer()); await clock(5 * 60000);   // five minutes in another app
    await pg.waitForTimeout(800); assert.strictEqual(secs(await timer()), shown, 'no ticking while hidden');
    await pg.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange')); });
    const back = secs(await timer()); assert.ok(shown - back >= 299 && shown - back <= 302, 'after 5 minutes away: ' + shown + ' -> ' + back);
  });
  await t('the browser throws the page away and loads it again: the Timed reading tile says Continue and opens the same passage with the time that is left', async () => {
    const before = secs(await timer()); const firstPara = await pg.locator('.tr-para').first().innerText(); await clock(2 * 60000);
    await load(); assert.strictEqual(await pg.evaluate(() => window.TMR.on), false);
    const sub = await pg.evaluate(() => window.__tile.subtitle()); assert.ok(/^Continue: \d+:\d\d left$/.test(sub), 'tile: ' + sub);
    const ok2 = await pg.evaluate(() => window.TMR.start()); assert.strictEqual(ok2, true);   // no book opened, no context: the run carries on
    const after = secs(await timer()); assert.ok(before - after >= 119 && before - after <= 123, 'time left after reload: ' + before + ' -> ' + after);
    assert.strictEqual(await pg.locator('.tr-para').first().innerText(), firstPara, 'same passage'); await shot('4-resumed');
  });
  await t('too quick: tapping finished at once saves nothing and says so calmly', async () => {
    await pg.evaluate(() => window.TMR.close()); await pg.evaluate(() => { window.__toasts.length = 0; });
    await clock(1000); await pg.evaluate(() => window.TMR.start({ bookId: '7', chapter: 0 })); await pg.getByRole('button', { name: 'Start' }).click();
    await pg.getByRole('button', { name: /finished reading/ }).click();
    assert.ok((await pg.evaluate(() => window.__toasts)).some(m => /Take your time/.test(m))); assert.strictEqual(await pg.evaluate(() => localStorage.getItem('wt:readspeed')), null); assert.ok(await pg.getByRole('button', { name: /finished reading/ }).isVisible());
  });
  await t('finished: speed = words / minutes from Start, saved once, green chip and the panel at the bottom, then Done ends the run', async () => {
    await clock(5 * 60000);
    await pg.getByRole('button', { name: /finished reading/ }).click(); await pg.waitForSelector('.wl-panel');
    const hist = await pg.evaluate(() => JSON.parse(localStorage.getItem('wt:readspeed'))); assert.ok(hist && hist.v === 1 && hist.runs.length === 1, 'one run saved'); const r = hist.runs[0];
    assert.ok(r.s >= 299 && r.s <= 302 && r.w >= 600 && r.w <= 900 && r.bid === '7' && r.ch === 0, JSON.stringify(r)); assert.strictEqual(r.wpm, Math.round(r.w * 60 / r.s), 'wpm = words per minute');
    assert.strictEqual((await pg.locator('.tr-chip--ok').innerText()), r.wpm + ' words/min'); assert.ok((await pg.locator('.wl-panel__title').innerText()).includes('Speed saved'));
    assert.ok((await pg.locator('.wl-panel__text').first().innerText()).includes(r.wpm + ' words per minute')); const bb = await pg.getByRole('button', { name: 'Done' }).boundingBox(); assert.ok(bb && bb.y + bb.height <= 844, 'Done on screen'); await shot('5-saved');
    await pg.getByRole('button', { name: 'Done' }).click(); assert.strictEqual(await pg.evaluate(() => localStorage.getItem('wt:readrun')), null, 'the run is dropped'); assert.strictEqual(await pg.locator('.rl.tr:not([hidden])').count(), 0);
    assert.strictEqual(await pg.evaluate(() => window.TMR.stats().n), 1); assert.ok((await pg.evaluate(() => window.__tile.subtitle())).startsWith('Last: '));
  });
  await t('time is up: a calm panel, nothing saved, no run left behind (even when the time ran out while away)', async () => {
    await pg.evaluate(() => window.TMR.start({ bookId: '7', chapter: 0 })); await pg.getByRole('button', { name: 'Fewer minutes' }).click(); await pg.getByRole('button', { name: 'Fewer minutes' }).click(); await pg.getByRole('button', { name: 'Fewer minutes' }).click();
    await pg.getByRole('button', { name: 'Start' }).click(); await pg.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
    await clock(11 * 60000); await pg.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange')); });
    await pg.waitForSelector('.wl-panel'); assert.ok((await pg.locator('.wl-panel__title').innerText()).includes('Time is up')); assert.strictEqual(await timer(), '0:00');
    assert.strictEqual(await pg.evaluate(() => window.TMR.stats().n), 1, 'history unchanged'); assert.strictEqual(await pg.evaluate(() => localStorage.getItem('wt:readrun')), null); assert.ok(!(await pg.getByRole('button', { name: /finished reading/ }).count())); await shot('6-time-up');
    await pg.getByRole('button', { name: 'Done' }).click();
  });
  await t('a run that ran out while the app was closed: a calm message, then a new Get ready screen', async () => {
    await pg.evaluate(() => { window.TMR.close(); const r = { v: 1, id: 'old', bid: '7', ch: 0, bt: 'x', ct: '', mins: 20, start: Date.now() - 3600000, end: Date.now() - 1000, words: 700, paras: [{ L: 'A', t: 'x y z.' }], rd: 0, wpm: 0 }; localStorage.setItem('wt:readrun', JSON.stringify(r)); window.__toasts.length = 0; });
    assert.ok(!/^Continue/.test(await pg.evaluate(() => window.__tile.subtitle()))); const ok2 = await pg.evaluate(() => window.TMR.start({ bookId: '7', chapter: 0 })); assert.strictEqual(ok2, true);
    assert.ok((await pg.evaluate(() => window.__toasts)).some(m => /ran out of time/.test(m))); assert.ok(await pg.getByRole('button', { name: 'Start' }).isVisible()); await pg.evaluate(() => window.TMR.close());
  });
  await t('a fiction book is refused with a plain message; unknown genres are allowed', async () => {
    await pg.evaluate(() => { window.__S.book.genres = 'Detective Fiction, Mystery'; window.__toasts.length = 0; });
    assert.strictEqual(await pg.evaluate(() => window.TMR.start({ bookId: '7', chapter: 0 })), false); assert.ok((await pg.evaluate(() => window.__toasts)).some(m => /non-fiction/.test(m)));
    await pg.evaluate(() => { window.__S.book.genres = ''; }); assert.strictEqual(await pg.evaluate(() => window.TMR.start({ bookId: '7', chapter: 0 })), true); await pg.evaluate(() => window.TMR.close());
  });
  await t('closing (X) ends the practice; Escape too; no page errors during the whole run', async () => {
    await pg.evaluate(() => window.TMR.start({ bookId: '7', chapter: 0 })); await pg.getByRole('button', { name: 'Start' }).click(); await pg.getByRole('button', { name: 'Close timed reading' }).click();
    assert.strictEqual(await pg.evaluate(() => localStorage.getItem('wt:readrun')), null); assert.strictEqual(await pg.evaluate(() => window.TMR.on), false);
    await pg.evaluate(() => window.TMR.start({ bookId: '7', chapter: 0 })); await pg.keyboard.press('Escape'); assert.strictEqual(await pg.evaluate(() => window.TMR.on), false);
    assert.deepStrictEqual(errs, []);
  });
  await br.close(); console.log('\nbrowser: ' + pass + ' passed, ' + fail + ' failed'); process.exit(bad || fail ? 1 : 0);
})();
