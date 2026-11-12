#!/usr/bin/env node
/* Automatic checks for the class worksheet (169m-class-worksheet.js): the pure part WSC (no browser), then the REAL screen code and print
   style in headless Chromium (stand-in app objects): the sheet is drawn, Download calls the browser print, and the page is printed to an
   A4 PDF that must be clean (A4 size, only the sheet, no cut-off rows, the answer key on its own page).
     node tools/class_worksheet_check.js [--png dir]    (--png also writes the PDF pages as PNG for a look by eye; needs pdftoppm)
   Exit code 1 if a check fails, 2 if the code cannot be loaded. The browser part is skipped (and said so) when Playwright is missing. */
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert'), cp = require('child_process');
const root = path.join(__dirname, '..'), read = f => fs.readFileSync(path.join(root, f), 'utf8');
const src = read('src/js/169m-class-worksheet.js');
let W;
try {
  const a = src.indexOf('/*WSC-START*/'), b = src.indexOf('/*WSC-END*/');
  if (a < 0 || b < 0) throw new Error('markers not found');
  const ctx = vm.createContext({}); vm.runInContext('const WSC = (() => {' + src.slice(a + 13, b) + '\nthis.W = WSC;', ctx); W = ctx.W;
} catch (e) { console.error('class_worksheet_check: cannot load the code: ' + e.message); process.exit(2); }
const J = x => JSON.parse(JSON.stringify(x));
const todo = []; const t = (n, f) => todo.push([n, f]);

t('find: the word and simple forms, not part of another word', () => {
  assert.deepStrictEqual(J(W.find('The trees trembled in the gloom.', 'tremble')), { s: 10, e: 18, form: 'trembled' });
  assert.strictEqual(W.find('Dreadful things', 'dread'), null); assert.ok(W.find('She stopped.', 'stop')); assert.ok(W.find('He was dreading it', 'dread')); assert.ok(W.find('It was a gloomy night', 'gloom'));
  assert.ok(W.find("the foe's hand", 'foe')); assert.strictEqual(W.find('', 'x'), null);
});
t('blank: the word becomes a line, the form is kept for the key', () => {
  const b = W.blank('She looked forlorn and tired.', 'forlorn'); assert.strictEqual(b.text, 'She looked _______ and tired.'); assert.strictEqual(b.form, 'forlorn');
  assert.strictEqual(W.blank('nothing here', 'forlorn').ok, false);
});
const sents = [{ t: 'Title', ch: 0, h: 1 }, { t: 'She looked forlorn and tired after the long road.', ch: 0 }, { t: 'The trees trembled in the cold wind of the valley.', ch: 0 }, { t: 'Gloom.', ch: 0 }, { t: 'A heavy gloom settled over the old house at night.', ch: 1 }, { t: 'He felt dread as the door opened slowly.', ch: 2 }, { t: 'Far away, the ominous bell rang once more.', ch: 3 }];
const list = [['dread', 'B2', 3], ['forlorn', 'C1', 2], ['tremble', 'B2', 2], ['gloom', 'B1', 4], ['ominous', 'C1', 1], ['absent', 'B2', 1], ['dread', 'B2', 1]];
t('pick: only words that occur in the chosen chapters, reading order, once each, usable sentence', () => {
  const p = J(W.pick(list, sents, 0, 2, 24)); assert.deepStrictEqual(p.map(x => x.word), ['forlorn', 'tremble', 'gloom', 'dread']);
  assert.strictEqual(p[2].sent, 'A heavy gloom settled over the old house at night.');   // not the one-word "Gloom."
  assert.deepStrictEqual(J(W.pick(list, sents, 3, 3, 24)).map(x => x.word), ['ominous']);   // chapter 4 (index 3) only
});
t('pick: spoilers cannot get in (a later chapter is never read) and max is kept', () => {
  assert.ok(!W.pick(list, sents, 0, 1, 24).some(x => x.word === 'dread' || x.word === 'ominous'));
  assert.strictEqual(W.pick(list, sents, 0, 3, 2).length, 2); assert.deepStrictEqual(J(W.pick(null, sents, 0, 3)), []); assert.deepStrictEqual(J(W.pick(['forlorn', 5, ''], sents, 0, 0)).map(x => x.word), ['forlorn']);
});
t('rows: options decide what is printed; a write-on line only when no meaning or translation is printed', () => {
  const p = W.pick(list, sents, 0, 2, 24), info = { forlorn: { ipa: 'fəˈlɔːn', meaning: 'sad and alone', bn: 'একা' } };
  let r = J(W.rows(p, info, { mean: true, bn: true, sent: true })); assert.strictEqual(r[0].meaning, 'sad and alone'); assert.strictEqual(r[0].bn, 'একা'); assert.strictEqual(r[0].line, false);
  assert.strictEqual(r[1].line, true);   // no meaning found for tremble: a line to write on
  assert.strictEqual(r[0].sentence, 'She looked _______ and tired after the long road.');
  r = J(W.rows(p, info, { mean: false, bn: false, sent: false })); assert.strictEqual(r[0].meaning, ''); assert.strictEqual(r[0].line, true); assert.strictEqual(r[0].sentence, ''); assert.strictEqual(r[0].keyMeaning, 'sad and alone');
});
t('bank is the forms as written, alphabetical, only for rows with a sentence; range label', () => {
  const rs = W.rows(W.pick(list, sents, 0, 2, 24), {}, { sent: true }); assert.deepStrictEqual(J(W.bank(rs)), ['dread', 'forlorn', 'gloom', 'trembled']);
  assert.strictEqual(W.range(0, 0), 'Ch. 1'); assert.strictEqual(W.range(0, 2), 'Ch. 1–3');
});
t('clip: long text is cut with an ellipsis, spaces tidied', () => { assert.strictEqual(W.clip('a  b', 10), 'a b'); assert.strictEqual(W.clip('x'.repeat(50), 10).length, 10); assert.strictEqual(W.clip(null, 5), ''); });
t('wiring: three build lines, tile registered, no new library or storage key', () => {
  const b = read('build.py'); ['169m-class-worksheet.js', '94u-class-worksheet.css', '28e-sheet-class-worksheet.html'].forEach(f => assert.strictEqual(b.split(f).length - 1, 1, f));
  assert.ok(/LearnHub\.register\(\{\s*id: 'worksheet'/.test(src)); assert.ok(!/store\.set|localStorage|import\(|<script/.test(src.replace(/\/\*[\s\S]*?\*\//g, '')));
  assert.ok(/size: A4/.test(read('src/css/94u-class-worksheet.css')));
});

/* ---- real screen code + print style in Chromium ---- */
async function browser() {
  let pw; try { pw = require('playwright'); } catch (e) { console.log('skip  browser part: Playwright is not installed here'); return; }
  const words = ['forlorn', 'tremble', 'gloom', 'ominous', 'dread', 'melancholy', 'lantern', 'hesitate', 'solitude', 'ancient', 'whisper', 'shadow', 'threshold', 'peculiar', 'wretched', 'tempest', 'vigil', 'grim', 'reluctant', 'stagger', 'haunt', 'dismal', 'beckon', 'tremulous'];
  const ssn = words.map((w, i) => ({ t: 'In the grey hours of the evening the old man felt ' + w + ' as the long road wound slowly on towards the distant hills.', ch: i < 12 ? 0 : 1 }));
  const css = read('src/css/94u-class-worksheet.css'), html = read('src/html/28e-sheet-class-worksheet.html');
  const a = src.indexOf('const WSC'), code = src.slice(a);
  const page0 = `<!doctype html><meta charset="utf-8"><style>${css} .sheet{display:flex;flex-direction:column;position:fixed;inset:0;background:#0F1220;color:#F2EBDD} .sheet[hidden]{display:none} .sr-only{position:absolute;left:-9999px}</style>
  <main id="app" style="height:100vh;overflow:hidden">APP SCREEN SHOULD NOT PRINT</main>${html}<aside id="other">OTHER</aside>
  <svg style="display:none"><symbol id="i-x"/></svg>`;
  const b = await pw.chromium.launch(); const pg = await b.newPage({ viewport: { width: 390, height: 800 } });
  const errs = []; pg.on('pageerror', e => errs.push(String(e))); pg.on('console', m => { if (process.env.WS_DEBUG) console.log('      [page] ' + m.text()); });
  await pg.setContent(page0);
  await pg.addScriptTag({ content: `(() => {
    const $$ = s => [...document.querySelectorAll(s)];
    const h = (tag, props = {}, ...kids) => { const e = document.createElement(tag); for (const [k, v] of Object.entries(props || {})) { if (v === false || v == null) continue; if (k === 'class') e.className = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v === true ? '' : v); } for (const c of kids.flat()) if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(String(c))); return e; };
    const S = { book: { id: 5, title: 'Dracula' }, model: { sents: ${JSON.stringify(ssn)} }, lp: {}, map: {}, span: {}, curId: 0 };
    const LB = { ctx: () => ({ bookId: 5, chapter: 0 }) }, QG = { furthest: () => 1, vocabWords: () => [] };
    const TR_LANGS = [['bn', 'Bengali']], trLang = () => 'bn', toast = m => { window.__toast = m; };
    const vocBook = async () => ({ w: ${JSON.stringify(words.map((w, i) => [w, 'B2', 1, '']))} });
    const DICT = { get: async w => ({ ok: true, data: { ipa: 'ɪpa-' + w.slice(0, 3), meanings: [{ defs: [{ d: 'A short meaning of the word ' + w + ' that is written for learners.' }] }] } }) };
    const TP = { get: async w => 'বাংলা-' + w };
    const LearnHub = { register: o => { window.__tile = o; } }, guideDoc = () => {}, openSheet = id => { document.getElementById(id).hidden = false; }, closeSheets = () => { $$('.sheet').forEach(s => { s.hidden = true; }); };
    ${code}
    window.WSH = WSH;
  })();` });
  const tx = (n, f) => todo2.push([n, f]); const todo2 = [];
  const ok = async (n, f) => { try { await f(); pass++; console.log('ok    ' + n); } catch (e) { fail++; console.log('FAIL  ' + n + '\n        ' + String(e && e.message).split('\n').slice(0, 4).join('\n        ')); } };
  await ok('screen: the tile opens the sheet with the current chapter and 12 words, download enabled when ready', async () => {
    await pg.evaluate(() => window.__tile.open({ bookId: 5, chapter: 0 }));
    await pg.waitForFunction(() => !document.getElementById('ws-dl').disabled, null, { timeout: 5000 });
    assert.strictEqual(await pg.locator('#ws-paper .wsx-w').count(), 12);
    assert.ok((await pg.textContent('#ws-sub')).includes('Dracula') && (await pg.textContent('#ws-sub')).includes('12 words'));
    assert.ok((await pg.textContent('#ws-paper')).includes('Word worksheet · Dracula, Ch. 1'));
  });
  await ok('screen: Bengali chip is named by the language; options change the paper', async () => {
    assert.deepStrictEqual(await pg.locator('#ws-opts .lt-chip').allTextContents(), ['Meanings', 'Bengali', 'Sentences', 'Answer key']);
    assert.strictEqual(await pg.locator('#ws-paper .wsx-key').count(), 0); await pg.click('[data-k=key]'); assert.strictEqual(await pg.locator('#ws-paper .wsx-key').count(), 1);
    await pg.click('[data-k=sent]'); assert.strictEqual(await pg.locator('#ws-paper .wsx-s').count(), 0); await pg.click('[data-k=sent]'); assert.strictEqual(await pg.locator('#ws-paper .wsx-s').count(), 12);
    assert.strictEqual(await pg.getAttribute('[data-k=key]', 'aria-pressed'), 'true');
  });
  await ok('screen: a wider chapter range finds more words; chapters after the reached one are not offered', async () => {
    assert.strictEqual(await pg.locator('#ws-to option').count(), 2);
    await pg.selectOption('#ws-to', { index: 1 });
    try { await pg.waitForFunction(() => !document.getElementById('ws-dl').disabled && document.querySelectorAll('#ws-paper .wsx-w').length === 24, null, { timeout: 5000 }); }
    catch (e) { throw new Error('state ' + JSON.stringify(await pg.evaluate(() => ({ s: WSH.state(), n: document.querySelectorAll('#ws-paper .wsx-w').length, dis: document.getElementById('ws-dl').disabled, st: document.getElementById('ws-status').textContent })))); }
    assert.ok((await pg.textContent('#ws-sub')).includes('Chapters 1–2') && (await pg.textContent('#ws-sub')).includes('24 words'));
  });
  await ok('print: Download calls the browser print; the page prints to A4 with only the sheet, the key on its own page, nothing cut off', async () => {
    await pg.evaluate(() => { window.__printed = 0; window.print = () => { window.__printed++; }; });
    await pg.click('#ws-dl'); await pg.waitForFunction(() => window.__printed === 1, null, { timeout: 3000 });
    assert.strictEqual(await pg.evaluate(() => document.body.classList.contains('ws-printing')), true);
    const out = process.env.WS_PDF || path.join(require('os').tmpdir(), 'wt-worksheet.pdf');
    await pg.pdf({ path: out, preferCSSPageSize: true, printBackground: true });
    const buf = fs.readFileSync(out), txt = buf.toString('latin1');
    const pages = (txt.match(/\/Type\s*\/Page[^s]/g) || []).length, mb = txt.match(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/);
    assert.ok(mb && Math.abs(mb[1] - 595.28) < 1.5 && Math.abs(mb[2] - 841.89) < 1.5, 'page size is not A4: ' + (mb && mb[1] + 'x' + mb[2]));
    assert.ok(pages >= 2 && pages <= 6, 'unexpected page count ' + pages);
    let text = ''; try { text = cp.execFileSync('pdftotext', ['-layout', out, '-'], { encoding: 'utf8' }); } catch (e) { text = null; }
    if (text !== null) {
      assert.ok(!/APP SCREEN SHOULD NOT PRINT|OTHER/.test(text), 'the app screen leaked into the print');
      const pp = text.split('\f'); const ki = pp.findIndex(p => /Answer key/.test(p)); assert.ok(ki > 0, 'answer key not on a later page'); assert.ok(!/Fill the blanks/.test(pp[ki]), 'answer key shares a page with the exercise');
      words.forEach(w => assert.ok(text.includes(w), w + ' missing from the print'));
      assert.ok((text.match(/_______/g) || []).length >= 24, 'blanks missing');
    }
    if (process.argv.includes('--png')) { const d = process.argv[process.argv.indexOf('--png') + 1]; try { cp.execFileSync('pdftoppm', ['-png', '-r', '60', out, path.join(d, 'ws')]); console.log('      png pages written to ' + d); } catch (e) { console.log('      (pdftoppm not available: no png)'); } }
  });
  await ok('print: the print copy is removed afterwards, the app comes back', async () => {
    await pg.evaluate(() => window.dispatchEvent(new Event('afterprint')));
    assert.strictEqual(await pg.evaluate(() => !document.body.classList.contains('ws-printing') && !document.getElementById('ws-print')), true);
  });
  await ok('screen: Close hides the sheet', async () => { await pg.click('#ws-x'); assert.strictEqual(await pg.evaluate(() => document.getElementById('sheet-ws').hidden && !window.WSH.on), true); });
  await ok('no script errors', async () => assert.deepStrictEqual(errs, []));
  await b.close();
}
let pass = 0, fail = 0;
(async () => {
  for (const [name, fn] of todo) { try { await fn(); pass++; console.log('ok    ' + name); } catch (e) { fail++; console.log('FAIL  ' + name + '\n        ' + String(e && e.message).split('\n').slice(0, 5).join('\n        ')); } }
  try { await browser(); } catch (e) { fail++; console.log('FAIL  browser part crashed: ' + e.message); }
  console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
})();
