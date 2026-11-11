#!/usr/bin/env node
/* Checks for Listen and type (src/js/169k-listen-type.js, 94s css, 28d sheet; Task 45):   node tools/listen_type_check.js
   Part 1 loads the pure helpers (LNC, between the LNC-START/END markers): word splitting, the word-by-word check (case, punctuation, apostrophes,
   missing / extra / wrong / close words, an empty answer), picking the 10 sentences (hidden, headings, too short or long, repeats, wrap), the hint line, spans.
   Part 2 (needs Playwright; skipped with a clear line when it is missing) loads the REAL 169k, the REAL sheet markup and css, and the REAL sentTime /
   shPlan / shClip from 150 and 140, into a page with a fake <audio> that runs 10x faster than real time. It proves: a 10-sentence session from the
   current sentence, each clip played from its own start and stopped at its end, Check off while the box is empty, Enter checks, the answer panel (perfect /
   almost / not quite, words to fix, "You typed"), the end screen, play / turtle (0.7x, saved speed restored), Hint and first letters, the play counter,
   closing in any way puts the audio back (second, playing or not), moves are quiet for the jump history, the tile is registered (hub + Study sheet).
   Set LT_SHOT=/some/dir to also save screenshots at phone size. It does not prove the full app: a real book, a real narrator and a real phone keyboard are by hand.
   Exit code 1 if a check fails, 2 if a file cannot be loaded. */
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const root = path.join(__dirname, '..'), rd = f => fs.readFileSync(path.join(root, f), 'utf8');
let ran = 0, bad = 0;
const t = (name, fn) => { ran++; return Promise.resolve().then(fn).then(() => console.log('ok   ' + name), e => { bad++; console.log('FAIL ' + name + ': ' + (e && e.message)); }); };

let SRC, LNC;
try {
  SRC = rd('src/js/169k-listen-type.js');
  const a = SRC.indexOf('/*LNC-START*/'), b = SRC.indexOf('/*LNC-END*/');
  if (a < 0 || b < a) throw new Error('LNC markers missing');
  const ctx = {}; vm.createContext(ctx);
  LNC = vm.runInContext(SRC.slice(a, b) + '\n({ SIZE, SLOW, MIN_W, MAX_W, fold, words, spans, check, pickSet, pattern });', ctx);
} catch (e) { console.error('listen_type_check: cannot load: ' + e.message); process.exit(2); }
const J = x => JSON.parse(JSON.stringify(x));   // plain objects (the helpers come from another vm context)

(async () => {
  await t('words and fold: punctuation, capitals, apostrophes (straight and curly), accents', () => {
    assert.deepStrictEqual(J(LNC.words('Don’t stop, Mina! "Go."')), ['Don’t', 'stop', 'Mina', 'Go']);
    assert.strictEqual(LNC.fold('Don’t'), 'dont'); assert.strictEqual(LNC.fold("O'Clock"), 'oclock'); assert.strictEqual(LNC.fold('Café'), 'cafe');
    assert.deepStrictEqual(J(LNC.words('well-known 3 dogs')), ['well', 'known', '3', 'dogs']); assert.deepStrictEqual(J(LNC.words('')), []); assert.deepStrictEqual(J(LNC.words(null)), []);
  });
  await t('spans: the pieces put back together are the text; words are numbered, the rest is -1', () => {
    const s = '“She sat,” he said — alone.'; const sp = J(LNC.spans(s));
    assert.strictEqual(sp.map(x => x.t).join(''), s); assert.deepStrictEqual(sp.filter(x => x.w >= 0).map(x => x.t), ['She', 'sat', 'he', 'said', 'alone']);
    assert.deepStrictEqual(sp.filter(x => x.w >= 0).map(x => x.w), [0, 1, 2, 3, 4]);
  });
  await t('check: capitals, punctuation and apostrophes do not matter', () => {
    const c = LNC.check('she sat alone in the garden looking sad and tired', 'She sat alone in the garden, looking sad and tired.');
    assert.strictEqual(c.v, 'ok'); assert.strictEqual(c.ok, 10); assert.strictEqual(c.total, 10); assert.strictEqual(c.wrong + c.miss + c.nExtra + c.close, 0);
    assert.strictEqual(LNC.check('i dont know', 'I don’t know.').v, 'ok');
  });
  await t('check: one missing word does not spoil the words after it', () => {
    const c = LNC.check('She sat in the garden looking sad and tired', 'She sat alone in the garden, looking sad and tired.');
    assert.strictEqual(c.v, 'no'); assert.strictEqual(c.miss, 1); assert.strictEqual(c.ok, 9); assert.strictEqual(c.wrong, 0);
    assert.deepStrictEqual(J(c.words.filter(w => w.v === 'miss').map(w => w.w)), ['alone']);
  });
  await t('check: an extra word is found and listed; the rest still matches', () => {
    const c = LNC.check('She sat very alone in the garden', 'She sat alone in the garden');
    assert.strictEqual(c.v, 'no'); assert.strictEqual(c.nExtra, 1); assert.deepStrictEqual(J(c.extra), ['very']); assert.strictEqual(c.ok, 6);
    assert.strictEqual(c.tw.find(x => x.w === 'very').v, 'extra');
  });
  await t('check: a different word is "no" with what was typed; a spelling slip on a 5+ letter word is "close" (near); short words are not close', () => {
    let c = LNC.check('She sat alone in the garden', 'She sat alone in the castle');
    assert.strictEqual(c.v, 'no'); assert.strictEqual(c.wrong, 1); assert.strictEqual(c.words[5].v, 'no'); assert.strictEqual(c.words[5].t, 'garden');
    c = LNC.check('She sat alone in the gardin', 'She sat alone in the garden');
    assert.strictEqual(c.v, 'near'); assert.strictEqual(c.close, 1); assert.strictEqual(c.words[5].v, 'close');
    c = LNC.check('She sat alone in the gardne', 'She sat alone in the garden'); assert.strictEqual(c.v, 'near', 'two letters swapped = one slip');
    c = LNC.check('teh cat sat', 'the cat sat'); assert.strictEqual(c.v, 'no', 'a 3-letter word is right or wrong');
    c = LNC.check('She sat alone in the gardens', 'She sat alone in the garden'); assert.strictEqual(c.v, 'near', 'a plural is a slip');
  });
  await t('check: nothing typed, nothing to match, same words in another order', () => {
    let c = LNC.check('', 'She sat alone.'); assert.strictEqual(c.v, 'no'); assert.strictEqual(c.miss, 3); assert.strictEqual(c.ok, 0);
    c = LNC.check('hello', ''); assert.strictEqual(c.v, 'no'); assert.strictEqual(c.total, 0);
    c = LNC.check('alone sat she', 'She sat alone'); assert.strictEqual(c.v, 'no'); assert.ok(c.ok < 3);
    c = LNC.check('She sat alone', 'She sat alone'); assert.strictEqual(c.words.length, 3); assert.strictEqual(c.tw.length, 3);
  });
  await t('pickSet: from the current sentence on, then the start; skips hidden, headings, too short, too long, repeats; at most the size', () => {
    const texts = ['CHAPTER III', 'He walked home slowly.', 'Yes.', 'Hidden one is here for sure.', 'She sat alone in the garden.', 'She sat alone in the garden.', 'A '.repeat(25) + 'end',
      'They ran to the old gate.', 'We saw the big red ship today.', 'It rained all day long again.'];
    const hidden = i => i === 3;
    assert.deepStrictEqual(J(LNC.pickSet(texts, hidden, 4, 10)), [4, 7, 8, 9, 1]);
    assert.deepStrictEqual(J(LNC.pickSet(texts, hidden, 4, 2)), [4, 7]);
    assert.deepStrictEqual(J(LNC.pickSet(texts, hidden, 99, 10)), [9, 1, 4, 7, 8]);
    assert.deepStrictEqual(J(LNC.pickSet([], hidden, 0, 10)), []); assert.strictEqual(LNC.SIZE, 10);
  });
  await t('pattern: letters only, first letters only, both, none', () => {
    assert.deepStrictEqual(J(LNC.pattern('She sat alone.', true, false)), ['___', '___', '_____']);
    assert.deepStrictEqual(J(LNC.pattern('She sat alone.', true, true)), ['s__', 's__', 'a____']);
    assert.deepStrictEqual(J(LNC.pattern('She sat alone.', false, true)), ['s…', 's…', 'a…']);
    assert.deepStrictEqual(J(LNC.pattern('She sat alone.', false, false)), []);
  });
  await t('source: no network, no storage, no timers at start-up', () => {
    assert.ok(!/fetch\(|XMLHttpRequest|localStorage|store\.set|WebSocket|sendBeacon/.test(SRC), 'no network or storage code');
    const top = SRC.split('\n').filter(l => /^ {2}[A-Za-z]/.test(l) && /setInterval|setTimeout/.test(l)); assert.strictEqual(top.length, 0);
  });
  await t('wiring: build.py lists the js, css and html; bn.json has the words', () => {
    const b = rd('build.py'); ['src/js/169k-listen-type.js', 'src/css/94s-listen-type.css', 'src/html/28d-sheet-listen-type.html'].forEach(f => assert.strictEqual(b.split(f).length - 1, 1, f));
    assert.ok(b.indexOf('169j-echo-compare.js') < b.indexOf('169k-listen-type.js'), 'after Echo');
    const bn = JSON.parse(rd('src/i18n/bn.json')); ['Listen and type', 'Type what you hear', 'Show first letters', 'Play slowly'].forEach(k => assert.ok(bn.dict[k], k));
    const ids = [...rd('src/html/28d-sheet-listen-type.html').matchAll(/id="(lt-[a-z-]+)"/g)].map(m => m[1]); ['lt-in', 'lt-check', 'lt-next', 'lt-play', 'lt-slow', 'lt-hint', 'lt-first'].forEach(i => assert.ok(ids.includes(i), i));
    assert.strictEqual(new Set(ids).size, ids.length, 'ids are unique');
  });

  let chromium; try { ({ chromium } = require('playwright')); } catch (e) { console.log('skip browser part: playwright is not installed'); }
  if (chromium) await browserPart(chromium);
  console.log('\nran ' + ran + ', failed ' + bad);
  process.exit(bad ? 1 : 0);
})();

async function browserPart(chromium) {
  const grab = (src, start, endRe) => { const i = src.indexOf(start); if (i < 0) throw new Error('missing ' + start); const m = src.slice(i).match(endRe); return src.slice(i, i + m.index + m[0].length); };
  const s150 = rd('src/js/150-player-reader.js'), s140 = rd('src/js/140-open-book.js');
  const real = [grab(s150, '  function sentTime(', /\n/), grab(s140, '  function shPlan()', /\n/), grab(s140, '  function shClip(', /\n  }\n/)].join('\n');
  const css = ['10-base-layout', '94-learn-ui', '20-home-library', '40-player-sheets-chips', '60-reading-search', '80-progress-v10', '94s-listen-type'].map(f => rd('src/css/' + f + '.css')).join('\n');
  const html = `<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><html data-theme="dark"><head><style>${css}
body{margin:0;background:var(--bg);color:var(--ink);font-family:var(--font-ui)} .sheet.ced{animation:none}</style></head><body><div id="backdrop" hidden></div>${rd('src/html/28d-sheet-listen-type.html')}
<script>
window.T = { seeks: [], quiet: [], toasts: [], plays: 0, rates: [], reg: null };
(() => {
  const $ = (s, r) => (r || document).querySelector(s);
  const FAST = 10, N = 31, STEP = 3;
  const P = { speed: 1.5, nudge: 0 }, S = { book: { id: 7, title: 'Dracula' }, sec: 0, durs: [N * STEP], quietJump: false, plan: [], model: null };
  S.plan[0] = { ids: Array.from({ length: N }, (_, i) => i), starts: Array.from({ length: N }, (_, i) => i * STEP) };
  S.model = { sents: Array.from({ length: N }, (_, i) => ({ t: 'Sentence number ' + (i + 1) + ' of the old book is read here.', h: false })), chapters: [{ start: 0, end: N, title: 'Chapter 3' }] };
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
  ${real}
  window.run = new Function('S','P','audio','Core','nowT','seekAudio','openSheet','closeSheets','toast','onPlayFail','goTrack','fmt','guideDoc','LearnHub','sentTime','shPlan','shClip','h',
    ${JSON.stringify(SRC + '\nreturn { LN, LNC };')});
  window.api = window.run(S, P, audio, Core, nowT, seekAudio, openSheet, closeSheets, toast, onPlayFail, goTrack, fmt, guideDoc, LearnHub, sentTime, shPlan, shClip, h);
})();
</script></body></html>`;
  let browser;
  try { browser = await chromium.launch({ channel: 'chrome' }).catch(() => chromium.launch()); } catch (e) { console.error('listen_type_check: no browser: ' + e.message); process.exit(2); }
  const page = await browser.newPage({ viewport: { width: 390, height: 780 } });
  const reqs = []; page.on('request', r => reqs.push(r.url()));
  const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await page.route('http://localhost/**', r => (/favicon/.test(r.request().url()) ? r.fulfill({ status: 204 }) : r.fulfill({ status: 200, contentType: 'text/html', body: html })));
  await page.goto('http://localhost/');
  const ev = (f, a) => page.evaluate(f, a);
  const $t = id => ev(i => document.getElementById(i).textContent, id);
  const click = id => ev(i => document.getElementById(i).click(), id);
  const shot = async n => { if (process.env.LT_SHOT) { fs.mkdirSync(process.env.LT_SHOT, { recursive: true }); await page.screenshot({ path: path.join(process.env.LT_SHOT, n + '.png') }); } };
  const clipDone = () => page.waitForFunction(() => audio.paused && !document.getElementById('lt-play').classList.contains('is-playing'), null, { timeout: 4000 });
  const reset = (time, playing) => ev(([tm, pl]) => { const a = window.audio; a.pause(); a.currentTime = tm; a.playbackRate = 1.5; if (pl) a.play(); T.seeks = []; T.quiet = []; T.rates = []; T.plays = 0; S.model.sents.forEach(s => { s.h = false; }); }, [time, playing]);
  const sentOf = k => 'Sentence number ' + (k + 1) + ' of the old book is read here.';

  await t('the tile is registered once, for the hub and the Study sheet', async () => {
    const r = await ev(() => ({ id: T.reg.id, title: T.reg.title, sub: T.reg.subtitle, ps: T.reg.playerSubtitle({ time: 75 }), ps0: T.reg.playerSubtitle(null), order: T.reg.order, player: T.reg.player, open: typeof T.reg.open }));
    assert.strictEqual(r.id, 'listentype'); assert.strictEqual(r.title, 'Listen and type'); assert.strictEqual(r.ps, 'Starts at 1:15'); assert.strictEqual(r.ps0, 'Type what you hear');
    assert.notStrictEqual(r.player, false); assert.strictEqual(r.open, 'function'); assert.ok(r.order > 40, 'after Echo');
  });
  await t('a 10-sentence session: own start, own end, Check, panel, Continue; mixed answers; the end screen; Back to listening restores the audio', async () => {
    await reset(14 * 3 + 0.5, false);
    assert.strictEqual(await ev(() => api.LN.start()), true);
    assert.strictEqual(await ev(() => document.getElementById('sheet-lt').hidden), false);
    const verdicts = [];
    for (let i = 0; i < 10; i++) {
      const k = 14 + i;
      await clipDone();
      const r = await ev(() => ({ ct: audio.currentTime, paused: audio.paused, rate: audio.playbackRate, pos: document.getElementById('lt-pos').textContent, plays: document.getElementById('lt-plays').textContent, dis: document.getElementById('lt-check').disabled, title: document.getElementById('lt-title').textContent, prog: document.getElementById('lt-prog').getAttribute('aria-valuenow'), ch: document.getElementById('lt-ch').textContent }));
      assert.ok(r.paused, 'paused after the clip'); assert.strictEqual(r.rate, 1.5, 'saved speed restored');
      assert.ok(r.ct >= (k + 1) * 3 - 0.2 && r.ct < (k + 1) * 3 + 0.9, 'stopped at the end of the clip: ' + r.ct + ' k=' + k);
      assert.strictEqual(r.pos, 'Sentence ' + (i + 1) + ' of 10'); assert.strictEqual(r.plays, 'Played 1 time · tap 🐢 for slow'); assert.strictEqual(r.dis, true, 'Check is off while the box is empty');
      assert.strictEqual(r.title, 'Type what you hear'); assert.strictEqual(r.prog, String(i * 10)); assert.strictEqual(r.ch, 'Dracula · Chapter 3');
      if (i === 0) await shot('1-type');
      const typed = i === 2 ? sentOf(k).replace('old ', '') : i === 4 ? sentOf(k).replace('number', 'numbr').replace('Sentence', 'sentence') : i === 6 ? 'I do not know' : sentOf(k).toLowerCase().replace(/\./, '');
      await page.fill('#lt-in', typed);
      assert.strictEqual(await ev(() => document.getElementById('lt-check').disabled), false);
      if (i === 1) await page.press('#lt-in', 'Enter'); else await click('lt-check');
      const f = await ev(() => ({ t: document.getElementById('lt-fb-t').textContent, s: document.getElementById('lt-fb-s').textContent, a: document.getElementById('lt-fb-a').textContent, yh: document.getElementById('lt-fb-y').hidden, foot: document.getElementById('lt-foot').className, nextHidden: document.getElementById('lt-next').hidden, checkHidden: document.getElementById('lt-check').hidden, ro: document.getElementById('lt-in').readOnly, flame: document.getElementById('lt-flame-n').textContent, bad: [...document.querySelectorAll('#lt-fb-a .is-bad')].map(x => x.textContent), close: [...document.querySelectorAll('#lt-fb-a .is-close')].map(x => x.textContent) }));
      verdicts.push(/^Perfect/.test(f.t) ? 'ok' : /^Almost/.test(f.t) ? 'near' : 'no');
      assert.strictEqual(f.a, sentOf(k), 'the right sentence is shown'); assert.strictEqual(f.nextHidden, false); assert.strictEqual(f.checkHidden, true); assert.strictEqual(f.ro, true);
      if (i === 2) { assert.ok(/^Not quite/.test(f.t)); assert.strictEqual(f.s, 'Words to fix: old'); assert.deepStrictEqual(f.bad, ['old']); assert.strictEqual(f.yh, false); await shot('2-not-quite'); }
      if (i === 4) { assert.ok(/^Almost/.test(f.t)); assert.strictEqual(f.s, 'Words to fix: number'); assert.deepStrictEqual(f.close, ['number']); await shot('3-almost'); }
      if (i === 6) { assert.ok(/^Not quite/.test(f.t)); assert.ok(f.bad.length >= 8); }
      if (i === 0) { assert.ok(/^Perfect/.test(f.t)); assert.ok(f.foot.includes('is-ok')); assert.strictEqual(f.yh, true); assert.strictEqual(f.s, ''); assert.strictEqual(f.flame, '1'); await shot('4-perfect'); }
      assert.strictEqual(await ev(() => document.getElementById('lt-prog').getAttribute('aria-valuenow')), String((i + 1) * 10));
      await click('lt-next');
    }
    assert.deepStrictEqual(verdicts, ['ok', 'ok', 'no', 'ok', 'near', 'ok', 'no', 'ok', 'ok', 'ok']);
    const e = await ev(() => ({ title: document.getElementById('lt-title').textContent, sum: [...document.querySelectorAll('#lt-sum li')].map(x => x.textContent), prac: document.querySelectorAll('#lt-prac li').length, all: document.getElementById('lt-all').hidden, main: document.getElementById('lt-main').hidden, btn: document.getElementById('lt-next').textContent, res: api.LN.results().map(r => [r.k, r.v, r.plays, r.hint, r.first]) }));
    assert.strictEqual(e.title, 'Well done'); assert.deepStrictEqual(e.sum, ['7 perfect', '1 almost', '2 to practise']); assert.strictEqual(e.prac, 3); assert.strictEqual(e.all, true); assert.strictEqual(e.main, true); assert.strictEqual(e.btn, 'Back to listening');
    assert.strictEqual(e.res.length, 10); assert.deepStrictEqual(e.res.map(r => r[0]), [14, 15, 16, 17, 18, 19, 20, 21, 22, 23]);
    await shot('5-end');
    const sk = await ev(() => T.seeks.slice(0, 10)); sk.forEach((x, i) => assert.ok(Math.abs(x - ((14 + i) * 3 + 0.02)) < 1e-9, 'seek ' + i + ' = ' + x));
    assert.ok((await ev(() => T.quiet)).every(Boolean), 'every move quiet');
    await click('lt-next');
    const r = await ev(() => ({ ct: audio.currentTime, paused: audio.paused, rate: audio.playbackRate, on: api.LN.on, hidden: document.getElementById('sheet-lt').hidden, q: S.quietJump, last: api.LN.last() && api.LN.last().res.length }));
    assert.strictEqual(r.ct, 14 * 3 + 0.5); assert.ok(r.paused); assert.strictEqual(r.rate, 1.5); assert.ok(!r.on && r.hidden && !r.q); assert.strictEqual(r.last, 10);
  });
  await t('a perfect session says so and lists nothing to practise', async () => {
    await reset(2 * 3, false); await ev(() => api.LN.start());
    for (let i = 0; i < 10; i++) { await page.fill('#lt-in', sentOf(2 + i)); await click('lt-check'); await click('lt-next'); }
    const e = await ev(() => ({ all: document.getElementById('lt-all').hidden, h: document.getElementById('lt-prac-h').hidden, sum: [...document.querySelectorAll('#lt-sum li')].map(x => x.textContent), flame: document.getElementById('lt-flame').getAttribute('aria-label') }));
    assert.strictEqual(e.all, false); assert.strictEqual(e.h, true); assert.deepStrictEqual(e.sum, ['10 perfect', '0 almost', '0 to practise']); assert.strictEqual(e.flame, '10 perfect so far');
    await click('lt-next');
  });
  await t('near the end of the track the session carries on from the start of the track; a short track gives a short session', async () => {
    await reset(29 * 3 + 0.5, false); await ev(() => api.LN.start());
    const pos = await ev(() => document.getElementById('lt-pos').textContent); assert.strictEqual(pos, 'Sentence 1 of 10');
    await ev(() => api.LN.close());
    await reset(0, false); await ev(() => { S.plan[0].ids = [0, 1, 2]; S.plan[0].starts = [0, 3, 6]; });
    await ev(() => api.LN.start()); assert.strictEqual(await $t('lt-pos'), 'Sentence 1 of 3'); await ev(() => api.LN.close());
    await ev(() => { S.plan[0].ids = Array.from({ length: 31 }, (_, i) => i); S.plan[0].starts = Array.from({ length: 31 }, (_, i) => i * 3); });
    await ev(() => { S.model.sents.forEach(s => { s.h = true; }); });
    assert.strictEqual(await ev(() => api.LN.start()), false); assert.ok((await ev(() => T.toasts)).length > 0, 'a friendly message'); assert.ok(!(await ev(() => api.LN.on)));
    await ev(() => { S.model.sents.forEach(s => { s.h = false; }); });
  });
  await t('play again counts; the turtle plays at 0.7x and the saved speed comes back; Hint and first letters; help is noted, never blocks', async () => {
    await reset(10 * 3 + 0.5, false); await ev(() => api.LN.start()); await clipDone();
    await ev(() => { T.seeks = []; T.rates = []; }); await click('lt-play'); await clipDone();
    assert.strictEqual(await $t('lt-plays'), 'Played 2 times · tap 🐢 for slow'); assert.ok(Math.abs((await ev(() => T.seeks[0])) - 30.02) < 1e-9);
    await click('lt-slow'); await page.waitForTimeout(40); assert.strictEqual(await ev(() => audio.playbackRate), 0.7); await clipDone();
    assert.strictEqual(await ev(() => audio.playbackRate), 1.5); assert.strictEqual(await $t('lt-plays'), 'Played 3 times · tap 🐢 for slow');
    assert.strictEqual(await $t('lt-hint-l'), 'Hint: 10 words'); assert.strictEqual(await ev(() => document.getElementById('lt-pat').hidden), true);
    await click('lt-hint'); const a = await ev(() => ({ p: document.getElementById('lt-pat').textContent, hid: document.getElementById('lt-pat').hidden, pr: document.getElementById('lt-hint').getAttribute('aria-pressed'), al: document.getElementById('lt-pat').getAttribute('aria-label') }));
    assert.strictEqual(a.hid, false); assert.strictEqual(a.pr, 'true'); assert.strictEqual(a.p.trim().split(/\s+/).length, 10); assert.ok(/^_{8}\s/.test(a.p)); assert.strictEqual(a.al, 'Letters per word: 8, 6, 2, 2, 3, 3, 4, 2, 4, 4');
    await click('lt-first'); const b = await ev(() => ({ p: document.getElementById('lt-pat').textContent, al: document.getElementById('lt-pat').getAttribute('aria-label') }));
    assert.ok(/^s_{7}\s+n_{5}\s/.test(b.p), b.p); assert.ok(b.al.startsWith('First letters: s, n, '));
    await shot('6-hints');
    await click('lt-hint'); await click('lt-first'); assert.strictEqual(await ev(() => document.getElementById('lt-pat').hidden), true);
    await page.fill('#lt-in', sentOf(10)); await click('lt-check');
    const r = await ev(() => api.LN.results()[0]); assert.strictEqual(r.plays, 3); assert.strictEqual(r.v, 'ok');
    assert.strictEqual(await ev(() => document.getElementById('lt-hint').disabled), true, 'no hints once checked');
    await click('lt-play'); await clipDone(); assert.strictEqual(await $t('lt-fb-a'), sentOf(10), 'the speaker still works after Check');
    await ev(() => api.LN.close());
  });
  await t('close puts the audio back: was playing, closed by X in the middle of a clip, and by the sheet (Back / backdrop) instead of the X', async () => {
    await reset(5 * 3 + 1, true); await ev(() => api.LN.start());
    await page.waitForTimeout(60); assert.ok(await ev(() => !audio.paused), 'narrator playing');
    await click('lt-x');
    let r = await ev(() => ({ ct: audio.currentTime, paused: audio.paused, rate: audio.playbackRate, on: api.LN.on }));
    assert.ok(Math.abs(r.ct - 16) < 0.25, 'back at 16 s (+ a moment of play): ' + r.ct); assert.ok(!r.paused, 'plays again'); assert.strictEqual(r.rate, 1.5); assert.ok(!r.on);
    await reset(5 * 3 + 1, false); await ev(() => api.LN.start()); await page.waitForTimeout(60);
    await ev(() => { document.getElementById('sheet-lt').hidden = true; });
    await page.waitForFunction(() => !api.LN.on, null, { timeout: 2000 });
    r = await ev(() => ({ ct: audio.currentTime, paused: audio.paused, rate: audio.playbackRate })); assert.strictEqual(r.ct, 16); assert.ok(r.paused); assert.strictEqual(r.rate, 1.5);
  });
  await t('closing half way keeps the answers so far in LN.last() and leaves no clip running; no network request apart from the page', async () => {
    await reset(0, false); await ev(() => api.LN.start()); await page.fill('#lt-in', sentOf(0)); await click('lt-check'); await click('lt-next'); await page.waitForTimeout(80); await click('lt-x');
    const r = await ev(() => ({ last: api.LN.last(), paused: audio.paused })); assert.strictEqual(r.last.res.length, 1); assert.strictEqual(r.last.bookId, '7'); assert.ok(r.paused);
    const before = await ev(() => T.plays); await page.waitForTimeout(250); assert.strictEqual(await ev(() => T.plays), before, 'nothing plays by itself after close');
    assert.deepStrictEqual(reqs.filter(u => !/^http:\/\/localhost\/?(favicon.*)?$/.test(u)), [], 'no request');
  });
  await t('no page errors; the sheet fits a phone: the box, Check and the speaker are all inside the screen', async () => {
    assert.deepStrictEqual(errs, []);
    await reset(0, false); await ev(() => api.LN.start());
    const g = await ev(() => { const r = id => document.getElementById(id).getBoundingClientRect(); return { h: innerHeight, w: innerWidth, check: r('lt-check'), play: r('lt-play'), inp: r('lt-in'), ox: document.documentElement.scrollWidth > innerWidth }; });
    assert.ok(g.check.bottom <= g.h && g.play.top >= 0 && g.inp.bottom < g.check.top && g.check.right <= g.w && !g.ox, JSON.stringify(g)); assert.ok(g.check.height >= 44 && g.play.width >= 44);
    await ev(() => api.LN.close());
  });
  await browser.close();
}
