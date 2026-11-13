#!/usr/bin/env node
/* Check for Speaking Part 2 (SPK, SPC in 169r-speaking-part2.js, Task 62): pure rules, wiring, then real Chromium (Playwright) with a FAKE microphone
   in a stand-in page (the real styles, the real 169i recording code and the real 169r screen file; not the whole app).
     node tools/speaking_part2_check.js [--shot dir]      Exit code 1 if a check fails, 2 if there is no browser.
   The browser part proves: the microphone is not touched before the tap, prep and talk timers follow the clock (and the real clock for a few seconds),
   a 2:00 talk stops by itself, a take is saved in the device store only, Review shows time / pace / pauses and Part 3, the session is logged
   once and only for 30 s or more, a blocked microphone still allows "Speak without recording", closing mid-talk keeps nothing, and the page makes
   no network request. It cannot test a real microphone, real speech (pace and pauses are tested on made-up signals), or a phone's app switching. */
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const root = path.join(__dirname, '..'), read = f => fs.readFileSync(path.join(root, f), 'utf8');
const shotDir = process.argv.includes('--shot') ? process.argv[process.argv.indexOf('--shot') + 1] : '';
let bad = 0; const ok = (c, m) => { console.log((c ? 'ok    ' : 'FAIL  ') + m); if (!c) bad++; };
// ---- pure rules
const js = read('src/js/169r-speaking-part2.js');
const ctx = vm.createContext({}); vm.runInContext(js.slice(js.indexOf('/* SPC-START */'), js.indexOf('/* SPC-END */')) + '\nthis.C = SPC;', ctx);
const C = ctx.C;
ok(C.PREP === 60 && C.TALK === 120 && C.COUNT_S === 30 && C.LONG_PAUSE === 2, 'constants: 60 s prep, 120 s talk, 30 s to count, 2 s long pause');
ok(C.TPL.length === 6 && C.TPL.every(t => t.pts.length === 3 && t.q.length === 3 && t.head && t.tail), 'templates: 6 cards, each with 3 points tail and 3 Part 3 questions');
ok(C.TPL[0].head === 'Describe a character from a book you enjoyed.' && C.TPL[0].tail === 'and explain how the character changed.', 'template 1 is the card of the mock-up');
{
  const f = C.fill(C.TPL[0], '  Dracula '); ok(f.pts[1] === 'what happens in Dracula' && !JSON.stringify(f).includes('{book}'), 'fill: the book title goes into the card, nothing left in braces');
  ok(C.fill(C.TPL[0], '').pts[1] === 'what happens in the story' && C.fill(C.TPL[0], null).pts[1] === 'what happens in the story', 'fill: no title = "the story"');
  ok(C.TPL.every(t => C.fill(t, 'X').pts.some(p => p.includes('X'))), 'fill: every template uses the book');
  ok(C.fill(C.TPL[0], 'x'.repeat(200)).pts[1].length < 120, 'fill: a very long title is cut');
  const g = C.TPL[0].pts.join('|'); C.fill(C.TPL[0], 'Z'); ok(C.TPL[0].pts.join('|') === g, 'fill: the template itself is not changed');
}
ok(C.pick(0).id === 'character' && C.pick(1).id !== C.pick(0).id && C.pick(6).id === C.pick(0).id && C.pick(-3).id === 'character' && C.pick('x').id === 'character' && C.pick(NaN).id === 'character', 'pick: rotates through the 6 cards; nonsense gives the first');
ok(C.left(10000, 7500, 60) === 3 && C.left(10000, 11000, 60) === 0 && C.left(1e12, 0, 60) === 60 && C.left('x', 0, 60) === 0 && C.left(60000, 0, 120) === 60, 'left: whole seconds (rounded up), never below 0, never above the total');
ok(C.fmt(120) === '2:00' && C.fmt(59) === '0:59' && C.fmt(0) === '0:00' && C.fmt(-4) === '0:00' && C.fmt(61) === '1:01', 'fmt: m:ss');
ok(C.paceWord(0) === '' && C.paceWord(70) === 'slow' && C.paceWord(90) === 'steady' && C.paceWord(170) === 'steady' && C.paceWord(171) === 'fast', 'paceWord: slow under 90, steady to 170, fast above');
ok(JSON.stringify(C.clean(null)) === '{"v":1,"n":0}' && C.clean({ n: 5 }).n === 5 && C.clean({ n: -1 }).n === 0 && C.clean({ n: 'x' }).n === 0 && C.clean('junk').n === 0 && C.clean({ n: 2.7 }).n === 2, 'clean: wt:speak2 is repaired when it is missing or damaged');
{   // made-up signals: 16 kHz, bursts of "syllables" (150 ms loud, 100 ms quiet), pauses of low noise
  const R = 16000; let seed = 7; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff * 2 - 1; };
  const build = parts => { const n = Math.round(parts.reduce((t, p) => t + p[1], 0) * R), x = new Float32Array(n); let i = 0;
    parts.forEach(([kind, sec]) => { const m = Math.round(sec * R); for (let k = 0; k < m; k++, i++) {
      let a = 0.003 * rnd();   // room noise
      if (kind === 's') { const ph = (k / R) % 0.25; if (ph < 0.15) a += 0.3 * Math.sin(Math.PI * ph / 0.15) ** 2 * Math.sin(2 * Math.PI * 180 * k / R) * (0.8 + 0.2 * Math.sin(k / 900)); }
      x[i] = a; } }); return x; };
  const sig = build([['q', 1], ['s', 8], ['q', 3], ['s', 8], ['q', 1], ['s', 4], ['q', 1]]), a = C.analyse(sig, R);
  ok(a && !a.quiet && Math.abs(a.dur - 26) < 0.01, 'analyse: the length of the take is read from the samples (' + (a && a.dur.toFixed(2)) + ' s)');
  ok(a && a.nLong === 1 && Math.abs(a.longest - 3) < 0.35, 'analyse: one long pause of 3 s (the 1 s pause is not long; silence at the ends is ignored): ' + (a && a.nLong + ' / ' + a.longest));
  ok(a && a.speech > 17 && a.speech < 22.5, 'analyse: speaking time about 20 s (got ' + (a && a.speech.toFixed(1)) + ')');
  ok(a && a.syl >= 68 && a.syl <= 92, 'analyse: about 80 syllables found (got ' + (a && a.syl) + ')');
  ok(a && a.wpm >= 115 && a.wpm <= 170 && C.paceWord(a.wpm) === 'steady', 'analyse: pace near 140 words a minute (got ' + (a && a.wpm) + ')');
  const noLong = C.analyse(build([['s', 10], ['q', 1.2], ['s', 10]]), R); ok(noLong && noLong.nLong === 0 && noLong.wpm > 0, 'analyse: a 1.2 s breath is not a long pause');
  const shortT = C.analyse(build([['s', 8]]), R); ok(shortT && shortT.wpm === 0 && shortT.syl > 0, 'analyse: under 20 s of speech gives no pace number (only syllables)');
  const silent = C.analyse(build([['q', 5]]), R); ok(silent && silent.quiet === true && silent.wpm === 0, 'analyse: a take with no speech is "quiet", no invented numbers');
  ok(C.analyse(new Float32Array(R / 2), R) === null && C.analyse(null, R) === null && C.analyse(sig, 0) === null && C.analyse(new Float32Array(0), R) === null, 'analyse: under a second, nothing, or no rate gives null');
  const slow = C.analyse(build([['s', 6], ['q', 0.6], ['s', 6], ['q', 0.6], ['s', 6], ['q', 0.6], ['s', 6]]), R); ok(slow && slow.nLong === 0, 'analyse: short pauses between sentences are not flagged');
}
// ---- wiring
const body = js.replace(/\/\*[\s\S]*?\*\//g, ''), build = read('build.py'), nav = read('src/js/270-sheets-nextup-back.js'), sync = read('src/js/295-account-sync.js');
ok(build.includes("'src/js/169r-speaking-part2.js'") && build.includes("'src/css/94y-speaking-part2.css'"), 'build.py lists the new script and style');
ok(build.indexOf('169r-speaking-part2.js') > build.indexOf('169i-echo-recording.js') && build.indexOf('169r-speaking-part2.js') > build.indexOf('169o-ielts-hub.js') && build.indexOf('169r-speaking-part2.js') < build.indexOf('270-sheets-nextup-back.js'), 'the script is after 169i (recording) and 169o (IELTS log) and before 270');
ok(!/\b(fetch|XMLHttpRequest|WebSocket|sendBeacon|EventSource|importScripts)\b/.test(body) && !/https?:\/\//.test(body.replace('http://www.w3.org/2000/svg', '')), 'no network code in 169r');
ok(!/\b(firebase|acSync|acUnion)\b/i.test(body), 'no account or sync code in 169r');
ok(/IE\.log\('s'\)/.test(body) && /L\.dur >= SPC\.COUNT_S/.test(body) && /L\.logged/.test(body), 'Speaking is logged with IE.log(\'s\'), once, only from 30 s');
ok(!/wt:speak2/.test(sync), 'wt:speak2 is not in the account sync (this device only)');
ok(nav.includes('(SPK.on ? 1 : 0)') && nav.includes('else if (SPK.on) SPK.close();'), 'the back button closes the screen (270 histLayers and histBack)');
ok(/LearnHub\.register\(\{\s*id: 'speaking2'/.test(js), 'the Learn hub has the Speaking Part 2 tile');
ok(!/getUserMedia/.test(body.split('async function startTalk')[0]), 'the microphone is asked for only inside startTalk (the tap)');
ok(/ERC\.supported/.test(body) && /ERC\.errKind/.test(body) && /ER\.saveBlob/.test(body), 'the recording code of 169i is reused (ERC, ER)');
{   // strings in bn.json are really in the code, and the main new strings have a translation
  const bn = JSON.parse(read('src/i18n/bn.json')), need = ['1 Prep', '2 Speak', '3 Review', 'Start speaking now', 'Speak without recording', 'Recording stays on this device', 'I’m finished', 'Talk finished', 'Long pauses',
    'Play my recording', 'Part 3 · Follow-up questions', 'IELTS-style practice. There is no score.', 'Speaking Part 2', 'Your notes', 'Linked to'];
  ok(need.every(k => bn.dict[k]), 'bn.json has the main new strings'); const miss = need.filter(k => !js.includes(k)); ok(!miss.length, 'those strings are really used in the code' + (miss.length ? ' (not found: ' + miss.join(', ') + ')' : ''));
  const MSGS = [...js.matchAll(/^\s{6}\w+: '((?:[^'\\]|\\.)*)',?$/gm)].map(m => m[1]).filter(s => /[A-Z]/.test(s[0] || '')); const lack = MSGS.filter(s => !bn.dict[s.replace(/\\'/g, "'")]); ok(lack.length === 0, 'every message in MSG has a Bengali line' + (lack.length ? ' (missing: ' + lack.join(' | ') + ')' : ''));
}
// ---- real Chromium with a fake microphone
let chromium; try { ({ chromium } = require('playwright')); } catch (e) { console.error('speaking_part2_check: playwright is not installed'); process.exit(2); }
const css = ['src/css/10-base-layout.css', 'src/css/94-learn-ui.css', 'src/css/94f-review-lesson.css', 'src/css/94m-questions.css', 'src/css/94x-timed-reading.css', 'src/css/94y-speaking-part2.css'].map(read).join('\n');
const SRC_I = read('src/js/169i-echo-recording.js');
const page = `<!doctype html><html data-theme="dark"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style></head><body>
<div id="ec-rec"></div><div id="ec-play"></div><div id="ec-del"></div><div id="ec-mine"></div><div id="ec-lib-x"></div><div id="ec-status"></div>
<script>
(() => { const real = Date.now.bind(Date); Date.now = () => real() + (Number(localStorage.getItem('test:off')) || 0); })();   // the test moves the clock by writing test:off
const h = (tag, attrs, ...kids) => { const e = document.createElement(tag); Object.keys(attrs || {}).forEach(k => { const v = attrs[k]; if (v == null || v === false) return; if (k === 'class') e.className = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else if (v === true) e.setAttribute(k, ''); else e.setAttribute(k, v); }); kids.forEach(c => { if (c != null && c !== false) e.append(c instanceof Node ? c : document.createTextNode(String(c))); }); return e; };
window.__toasts = []; window.__ie = []; window.__gum = 0; window.__streams = [];
const toast = m => window.__toasts.push(m), histSoon = () => {}, LB = { ctx: () => null }, EM = { use() {}, on: false };
const IE = { log: s => window.__ie.push(s) }, QG = { furthest: () => 2 }, audio = { paused: false, pause() { this.paused = true; window.__paused = true; } };
const store = { get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }, set(k, v) { localStorage.setItem(k, JSON.stringify(v)); } };
const LearnHub = { register(t) { window.__tile = t; }, refresh() {} };
const S = { book: { id: 7, title: 'Dracula' }, model: { sents: [{ ch: 2, h: false }], chapters: [{ title: 'One' }, { title: 'Two' }, { title: 'Three' }] }, curId: 0, lp: {}, map: [], span: [] };
const gum = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
navigator.mediaDevices.getUserMedia = async c => { window.__gum++; if (window.__deny) { const e = new Error('no'); e.name = 'NotAllowedError'; throw e; } const s = await gum(c); window.__streams.push(s); return s; };
${SRC_I}
${js}
window.SPK = SPK; window.ER = ER;
</script></body></html>`;
let pass = 0, fail = 0;
const t = async (name, fn) => { try { await fn(); pass++; console.log('ok    ' + name); } catch (e) { fail++; console.log('FAIL  ' + name + '\n        ' + String(e && e.message).split('\n').slice(0, 5).join('\n        ')); } };
(async () => {
  let br; const args = ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'];
  try { br = await chromium.launch({ args }); } catch (e) { console.error('speaking_part2_check: no browser: ' + e.message); process.exit(2); }
  const bc = await br.newContext({ viewport: { width: 390, height: 844 } }), pg = await bc.newPage(), errs = [], reqs = [];
  await pg.route('https://wt.test/**', r => r.fulfill({ contentType: 'text/html', body: page }));
  pg.on('request', r => reqs.push(r.url())); pg.on('pageerror', e => errs.push(String(e))); pg.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await pg.goto('https://wt.test/'); await pg.waitForFunction('window.SPK'); await pg.evaluate(() => localStorage.clear());
  const shot = async n => { if (shotDir) { fs.mkdirSync(shotDir, { recursive: true }); await pg.screenshot({ path: path.join(shotDir, n + '.png') }); } };
  const clock = ms => pg.evaluate(v => { localStorage.setItem('test:off', String((Number(localStorage.getItem('test:off')) || 0) + v)); window.dispatchEvent(new Event('focus')); }, ms);
  const secs = s => { const [m, x] = s.trim().split(':').map(Number); return m * 60 + x; };
  const timer = async () => secs(await pg.locator('.sk-time').innerText());
  const vals = () => pg.evaluate(() => Object.fromEntries([...document.querySelectorAll('.sk-vr')].map(r => [r.children[0].textContent, r.children[1].textContent])));
  const hasBtn = n => pg.getByRole('button', { name: n });
  const takes = () => pg.evaluate(async () => (await window.ER.list()).map(r => ({ kind: r.kind, title: r.title, dur: r.dur, size: r.blob.size })));
  await t('the tile is registered and the screen opens with a card made from the template and the open book', async () => {
    assert.strictEqual(await pg.evaluate(() => window.__tile.id + '|' + window.__tile.title), 'speaking2|Speaking Part 2');
    assert.strictEqual(await pg.evaluate(() => window.SPK.start({ bookId: '7', chapter: 2 })), true);
    assert.strictEqual((await pg.locator('.sk-head').innerText()), 'Describe a character from a book you enjoyed.');
    assert.ok((await pg.locator('.sk-pts li').allInnerTexts()).includes('what happens in Dracula'));
    assert.ok((await pg.locator('.sk-link').innerText()).includes('Dracula · Ch. 3'), await pg.locator('.sk-link').innerText());
    assert.strictEqual((await pg.locator('.sk-stage').innerText()), '1 Prep'); assert.strictEqual(await pg.evaluate(() => window.__paused), true, 'the book audio was paused');
    const t0 = await timer(); assert.ok(t0 >= 59 && t0 <= 60, 'prep timer ' + t0); await shot('1-prep');
  });
  await t('preparation: no microphone is asked for; the time follows the clock; at 0:00 it waits for the tap', async () => {
    assert.strictEqual(await pg.evaluate(() => window.__gum), 0, 'microphone asked on opening');
    await pg.locator('.sk-notes').fill('• Jonathan, brave\n• castle, danger');
    await clock(30000); const a = await timer(); assert.ok(a >= 29 && a <= 31, 'after 30 s: ' + a);
    await clock(31000); assert.strictEqual(await timer(), 0); assert.strictEqual(await pg.evaluate(() => window.SPK.mode()), 'prep', 'prep does not move on by itself');
    assert.strictEqual(await pg.evaluate(() => window.__gum), 0, 'microphone asked when prep ended');
    assert.ok((await pg.locator('.tr-live').innerText()).includes('Preparation time is over')); assert.ok(await pg.locator('.rl__foot.is-ready').count() === 1, 'the button glows');
    await shot('2-prep-over');
  });
  await t('Start speaking: the microphone is asked on the tap, the 2:00 clock starts, notes stay', async () => {
    await hasBtn(/Start speaking now/).click(); await pg.waitForFunction(() => window.SPK.mode() === 'speak', null, { timeout: 4000 });
    assert.strictEqual(await pg.evaluate(() => window.__gum), 1); const s = await timer(); assert.ok(s >= 119 && s <= 120, 'talk timer ' + s);
    assert.strictEqual((await pg.locator('.sk-stage').innerText()), '2 Speak'); assert.strictEqual(await pg.locator('.sk-notes').inputValue(), '• Jonathan, brave\n• castle, danger');
    assert.ok(await hasBtn(/finished/).isVisible()); await shot('3-speak');
  });
  await t('real clock: about 3 seconds later the timer reads about 1:57 and I\'m finished gives a 3 s review under 30 s (not counted)', async () => {
    await pg.waitForTimeout(3000); const s = await timer(); assert.ok(s >= 115 && s <= 118, 'after ~3 s: ' + s);
    await hasBtn(/finished/).click(); await pg.waitForSelector('.sk-panel'); const v = await vals();
    const m = /^(\d+):(\d\d) of 2:00$/.exec(v.Time); assert.ok(m && secs(m[1] + ':' + m[2]) >= 2 && secs(m[1] + ':' + m[2]) <= 5, 'Time row: ' + v.Time);
    assert.ok((await pg.locator('.sk-panel').innerText()).includes('Under 30 seconds')); assert.deepStrictEqual(await pg.evaluate(() => window.__ie), [], 'not logged under 30 s');
    assert.strictEqual((await pg.locator('.sk-stage').innerText()), '3 Review');
  });
  await t('review: the take is on this device only (kind speak2), pace and pauses are measured, Part 3 has 3 questions, IELTS-style label, no score', async () => {
    await pg.waitForFunction(() => !/Looking at/.test(document.querySelector('.sk-v-pace').textContent), null, { timeout: 8000 });
    await pg.waitForFunction(() => /Saved on this device only/.test(document.querySelector('.sk-savenote').textContent), null, { timeout: 4000 });
    const tk = await takes(); assert.strictEqual(tk.length, 1); assert.strictEqual(tk[0].kind, 'speak2'); assert.ok(tk[0].size > 0 && tk[0].dur >= 2 && tk[0].dur <= 5, JSON.stringify(tk)); assert.ok(/^Speaking Part 2 · Dracula$/.test(tk[0].title));
    assert.strictEqual(await pg.locator('.sk-q').count(), 3); assert.ok((await pg.locator('.sk-panel').innerText()).includes('IELTS-style practice. There is no score.'));
    const txt = (await pg.locator('.sk-panel').innerText()); assert.ok(!/\bscore\b[^.]*\d/.test(txt.replace('There is no score', '')), 'no score shown'); await shot('4-review');
  });
  await t('Play and Delete: playing starts and stops, Delete removes the take from the device store', async () => {
    await hasBtn(/Play my recording/).click(); assert.ok((await hasBtn(/Stop/).count()) === 1); await hasBtn(/Stop/).click(); assert.ok(await hasBtn(/Play my recording/).count() === 1);
    await pg.locator('.sk-del').click(); await pg.waitForTimeout(400); assert.strictEqual((await takes()).length, 0);
  });
  await t('Done closes; the next card is a different one (rotates) and the count is kept on this device', async () => {
    await hasBtn(/^Done$/).click(); assert.strictEqual(await pg.evaluate(() => window.SPK.on), false);
    await pg.evaluate(() => window.SPK.start({ bookId: '7', chapter: 2 })); assert.ok((await pg.locator('.sk-head').innerText()).startsWith('Describe a place'));
    assert.strictEqual(await pg.evaluate(() => JSON.parse(localStorage.getItem('wt:speak2')).n), 2);
  });
  await t('a talk that reaches 2:00 stops by itself at 2:00 and is logged once for Speaking', async () => {
    await clock(61000); await hasBtn(/Start speaking now/).click(); await pg.waitForFunction(() => window.SPK.mode() === 'speak', null, { timeout: 4000 });
    await pg.waitForTimeout(600); await clock(120000); await pg.waitForSelector('.sk-panel', { timeout: 6000 });
    const v = await vals(); assert.strictEqual(v.Time, '2:00 of 2:00'); assert.deepStrictEqual(await pg.evaluate(() => window.__ie), ['s']);
    assert.ok((await pg.locator('.sk-panel').innerText()).includes('Counted as a Speaking session'));
    await pg.waitForFunction(() => !/Looking at/.test(document.querySelector('.sk-v-paus').textContent), null, { timeout: 8000 });
    assert.strictEqual((await takes()).length, 1); await clock(5000); assert.deepStrictEqual(await pg.evaluate(() => window.__ie), ['s'], 'still logged once');
    assert.ok(await pg.evaluate(() => window.__streams.every(s => s.getTracks().every(t => t.readyState === 'ended'))), 'the microphone is released after the talk');
    await hasBtn(/^Done$/).click();
  });
  await t('closing in the middle of a talk keeps nothing, logs nothing and releases the microphone', async () => {
    await pg.evaluate(() => localStorage.setItem('test:off', '0')); await pg.evaluate(() => window.ER.list().then(a => Promise.all(a.map(r => window.ER.remove(r.id)))));
    await pg.evaluate(() => { window.__ie.length = 0; window.SPK.start({ bookId: '7', chapter: 2 }); }); await hasBtn(/Start speaking now/).click(); await pg.waitForFunction(() => window.SPK.mode() === 'speak', null, { timeout: 4000 });
    await pg.waitForTimeout(500); await pg.keyboard.press('Escape'); await pg.waitForTimeout(600);
    assert.strictEqual(await pg.evaluate(() => window.SPK.on), false); assert.strictEqual((await takes()).length, 0); assert.deepStrictEqual(await pg.evaluate(() => window.__ie), []);
    assert.ok(await pg.evaluate(() => window.__streams.every(s => s.getTracks().every(t => t.readyState === 'ended'))), 'the microphone is released');
  });
  await t('blocked microphone: a plain message, and "Speak without recording" still runs the timer and logs a 30 s talk', async () => {
    await pg.evaluate(() => { window.__deny = true; window.__ie.length = 0; window.SPK.start({ bookId: '7', chapter: 2 }); }); await clock(61000);
    await hasBtn(/Start speaking now/).click(); await pg.waitForFunction(() => /blocked/.test(document.querySelector('.sk-msg').textContent), null, { timeout: 3000 });
    assert.strictEqual(await pg.evaluate(() => window.SPK.mode()), 'prep'); await hasBtn(/Speak without recording/).click();
    assert.strictEqual(await pg.evaluate(() => window.SPK.mode()), 'speak'); assert.ok((await pg.locator('.rl__foot').innerText()).includes('Not recording'));
    await clock(40000); await hasBtn(/finished/).click(); await pg.waitForSelector('.sk-panel'); const v = await vals();
    assert.ok(/^0:(3[89]|4\d) of 2:00$/.test(v.Time) || /^0:4\d of 2:00$/.test(v.Time), 'time ' + v.Time); assert.strictEqual(v.Pace, '—');
    assert.ok((await pg.locator('.sk-panel').innerText()).includes('spoke without recording')); assert.deepStrictEqual(await pg.evaluate(() => window.__ie), ['s']); assert.strictEqual((await takes()).length, 0, 'nothing saved');
    assert.strictEqual(await pg.locator('.sk-mine').count(), 0, 'no recording card');
  });
  await t('only the page itself was loaded: no network request, no console or page error', async () => {
    const extra = reqs.filter(u => !/^https:\/\/wt\.test\/?$/.test(u) && !/^(data|blob):/.test(u)); assert.deepStrictEqual(extra, [], 'requests: ' + extra.join(', ')); assert.deepStrictEqual(errs, []);
  });
  await br.close();
  console.log('\nspeaking_part2_check: ' + (bad ? bad + ' pure/wiring check(s) FAILED, ' : 'pure and wiring checks passed, ') + 'browser: ' + pass + ' passed, ' + fail + ' failed');
  process.exit(bad || fail ? 1 : 0);
})();
