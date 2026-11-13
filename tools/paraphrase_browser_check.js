#!/usr/bin/env node
/* Browser check for the paraphrase screen (169p) in real Chromium (Playwright): the real styles (10, 94, 94f, 94m, 94w), the real screen file and the REAL
   generator on a small book, inside a stand-in page (not the whole app). It runs a full 5-question set by tapping, checks what is on screen, that the
   Check button and the panel stay on screen on a phone size, and that the set logs one Reading and one Writing session. It cannot test the real reader,
   the real Learn hub or real touch.
     node tools/paraphrase_browser_check.js [--shot dir]      Exit code 1 if a check fails, 2 if there is no browser. */
const fs = require('fs'), path = require('path'), assert = require('assert');
let chromium; try { ({ chromium } = require('playwright')); } catch (e) { console.error('paraphrase_browser_check: playwright is not installed'); process.exit(2); }
const root = path.join(__dirname, '..'), read = f => fs.readFileSync(path.join(root, f), 'utf8');
const shotDir = process.argv.includes('--shot') ? process.argv[process.argv.indexOf('--shot') + 1] : '';
const css = ['src/css/10-base-layout.css', 'src/css/94-learn-ui.css', 'src/css/94f-review-lesson.css', 'src/css/94m-questions.css', 'src/css/94w-paraphrase.css'].map(read).join('\n');
const ADJ = ['wretched', 'peculiar', 'luminous', 'tremendous', 'melancholy', 'splendid', 'dreadful', 'graceful', 'solitary', 'ancient', 'crumbling', 'radiant', 'fragrant', 'restless', 'invisible',
  'towering', 'sheltered', 'weathered', 'shimmering', 'venerable', 'forgotten', 'resplendent', 'mysterious', 'desolate', 'enormous', 'tranquil', 'vigilant', 'whispering', 'thunderous', 'benevolent'];
let raw = 'CHAPTER I.\n\n';
for (let k = 0; k < 14; k++) raw += 'The old alabaster stood quietly beside the ' + ADJ[(2 * k) % 30] + ' garden while the ' + ADJ[(2 * k + 1) % 30] + ' travellers rested nearby ' + (k % 2 ? 'at dusk' : 'by noon') + '.' + (k % 4 === 3 ? '\n\n' : ' ');
const page = `<!doctype html><html data-theme="dark"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style></head><body>
<script>${read('src/js/010-core.js')}</script>
<script>
const h = (tag, attrs, ...kids) => { const e = document.createElement(tag); Object.keys(attrs || {}).forEach(k => { if (k === 'class') e.className = attrs[k]; else if (k.startsWith('on')) e.addEventListener(k.slice(2), attrs[k]); else if (k === 'hidden') e.hidden = !!attrs[k]; else e.setAttribute(k, attrs[k]); }); kids.forEach(x => { if (x != null && x !== '' && x !== false) e.append(x); }); return e; };
window.__logs = []; window.__toasts = [];
const P = { calm: false }, toast = m => window.__toasts.push(m), histSoon = () => {}, LB = { ctx: () => null }, PG = { model: () => ({ streak: 5 }) }, IE = { log: s => window.__logs.push(s) };
const LearnHub = { register(t) { window.__tile = t; }, refresh() {} };
const DATA = {}; ${JSON.stringify(ADJ)}.forEach(w => { DATA[w] = { w, meanings: [{ pos: 'adjective', defs: [], syn: ['alt' + w, 'kin' + w], ant: ['opp' + w] }] }; });
const S = { book: { id: 7, title: 'Test book' }, model: Core.parseBook(${JSON.stringify(raw)}), lp: { 0: 0.5 }, map: [0], span: [0] };
${read('src/js/167c-question-gen.js')}
${read('src/js/167f-paraphrase-gen.js')}
const realFor = PQ.forChapter; const PQx = { forChapter: (b, m, c, f, o) => realFor(b, m, c, f, Object.assign({}, o, { lookup: async w => DATA[w] || null })) };
${read('src/js/169p-paraphrase-screen.js').replace('await PQ.forChapter(', 'await PQx.forChapter(')}
window.PP = PP;
</script></body></html>`;
let pass = 0, fail = 0;
const t = async (name, fn) => { try { await fn(); pass++; console.log('ok    ' + name); } catch (e) { fail++; console.log('FAIL  ' + name + '\n        ' + String(e && e.message).split('\n').slice(0, 5).join('\n        ')); } };
(async () => {
  let br; try { br = await chromium.launch(); } catch (e) { console.error('paraphrase_browser_check: no browser: ' + e.message); process.exit(2); }
  const ctx = await br.newContext({ viewport: { width: 390, height: 844 } }), pg = await ctx.newPage(), errs = [];
  pg.on('pageerror', e => errs.push(String(e))); pg.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await pg.setContent(page); await pg.waitForFunction('window.PP');
  const shot = async n => { if (shotDir) { fs.mkdirSync(shotDir, { recursive: true }); await pg.screenshot({ path: path.join(shotDir, n + '.png') }); } };
  await t('opens a 5-question set from the real generator', async () => {
    const ok = await pg.evaluate(() => window.PP.start({ bookId: '7', chapter: 0 })); assert.strictEqual(ok, true, 'start returned false; messages shown: ' + JSON.stringify(await pg.evaluate(() => window.__toasts)));
    assert.strictEqual(await pg.locator('.rl.pp:not([hidden])').count(), 1); assert.strictEqual(await pg.locator('.qs__opt').count(), 4);
    assert.strictEqual(await pg.locator('.pp-hit').count(), 1); assert.ok((await pg.locator('.pp-lab').innerText()).includes('Original'));
    assert.ok(await pg.locator('.rl__foot button', { hasText: 'Check' }).isDisabled()); await shot('1-question');
  });
  const answerOne = async (i, right) => {
    const q = await pg.evaluate(() => { const o = [...document.querySelectorAll('.qs__opt .qs__txt')].map(x => x.textContent); return o; });
    // find the right choice by asking the screen's own data: the right one has the synonym of the underlined word
    const word = await pg.locator('.pp-hit').innerText();
    const idx = right ? await pg.evaluate(w => { const o = [...document.querySelectorAll('.qs__opt .qs__txt')].map(x => x.textContent); return o.findIndex(s => /(^|\s)(alt|kin)/.test(s) && s.includes('alt' + w) || s.includes('kin' + w)); }, word) : -1;
    const pick = right ? idx : [0, 1, 2, 3].find(k => k !== idx2(q, word));
    await pg.locator('.qs__opt').nth(pick).click(); await pg.locator('.rl__foot button', { hasText: 'Check' }).click();
  };
  const idx2 = (q, word) => q.findIndex(s => s.includes('alt' + word) || s.includes('kin' + word));
  await t('right answer: green mark, bold swapped words, Swap ideas chips, panel and Continue on screen', async () => {
    await answerOne(0, true);
    assert.strictEqual(await pg.locator('.qs__opt.is-correct').count(), 1); assert.strictEqual(await pg.locator('.qs__opt .qs__hit').count(), 4);
    assert.ok(await pg.locator('.pp-chip').count() >= 1); assert.ok((await pg.locator('.wl-panel__title').innerText()).includes('Correct'));
    const b = await pg.locator('.rl__foot button', { hasText: 'Continue' }).boundingBox(); assert.ok(b && b.y + b.height <= 844 && b.y >= 0, 'Continue is on the screen');
    await pg.waitForTimeout(600);
    const cb = await pg.locator('.pp-chip').first().boundingBox(), pb = await pg.locator('.wl-panel').boundingBox(); assert.ok(cb && pb && cb.y + cb.height <= pb.y + 1, 'the chips are above the panel, not behind it');
    await shot('2-correct');
    await pg.locator('.rl__foot button', { hasText: 'Continue' }).click();
  });
  await t('wrong answer: calm panel, wrong choice marked', async () => {
    await answerOne(1, false);
    assert.strictEqual(await pg.locator('.qs__opt.is-wrong').count(), 1); assert.strictEqual(await pg.locator('.qs__opt.is-correct').count(), 1);
    assert.ok((await pg.locator('.wl-panel__title').innerText()).includes('Not quite')); await shot('3-wrong');
    await pg.locator('.rl__foot button', { hasText: 'Continue' }).click();
  });
  await t('questions 3 to 5, then Set complete with 4 of 5 and one Reading + one Writing session', async () => {
    for (let i = 2; i < 5; i++) {
      await answerOne(i, true);
      await pg.locator('.rl__foot button', { hasText: i === 4 ? 'Finish' : 'Continue' }).click();
    }
    assert.ok((await pg.locator('.rl__score').innerText()).includes('4 of 5 right'));
    assert.deepStrictEqual(await pg.evaluate(() => window.__logs), ['r', 'w']); await shot('4-done');
    await pg.locator('.rl__foot button', { hasText: 'Done' }).click(); assert.strictEqual(await pg.evaluate(() => window.PP.on), false);
  });
  await t('light theme and a narrow screen: the Check button and choices stay inside the screen', async () => {
    await pg.evaluate(() => document.documentElement.setAttribute('data-theme', 'light')); await pg.setViewportSize({ width: 320, height: 640 });
    await pg.evaluate(() => window.PP.start({ bookId: '7', chapter: 0 })); await pg.waitForSelector('.qs__opt');
    const w = await pg.evaluate(() => document.documentElement.scrollWidth); assert.ok(w <= 320, 'no sideways scroll: ' + w);
    const b = await pg.locator('.rl__foot button', { hasText: 'Check' }).boundingBox(); assert.ok(b && b.y + b.height <= 640 && b.x >= 0 && b.x + b.width <= 320); await shot('5-light-320');
    await pg.evaluate(() => window.PP.close());
  });
  await t('no page errors', async () => { assert.deepStrictEqual(errs, []); });
  await br.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
})();
