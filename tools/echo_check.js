#!/usr/bin/env node
/* Checks for Echo mode (src/js/169h-echo-mode.js, 94p css, 28c sheet; Task 42):   node tools/echo_check.js
   Part 1 loads the pure helpers (ECC, between the ECC-START/END markers): countdown length, skipping hidden sentences, where to start.
   Part 2 (needs Playwright; skipped with a clear line when it is missing) loads the REAL 169h, the REAL sheet markup and css, and the REAL sentTime /
   shPlan / shClip from 150 and 140, into a page with a fake <audio> that runs 10x faster than real time. It proves: ten sentences in a row, each one
   played from its own start and paused at its end; hear again; slow (0.8x, speed restored); hidden sentences skipped; the countdown ends by itself;
   closing in any way puts the audio back (second, playing or not); Echo moves are quiet for the jump history; the tile is registered.
   It does not prove the full app: open a real book and a real narrator by hand (see the handoff note).
   Exit code 1 if a check fails, 2 if a file cannot be loaded. */
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const root = path.join(__dirname, '..'), rd = f => fs.readFileSync(path.join(root, f), 'utf8');
let ran = 0, bad = 0;
const t = (name, fn) => { ran++; return Promise.resolve().then(fn).then(() => console.log('ok   ' + name), e => { bad++; console.log('FAIL ' + name + ': ' + (e && e.message)); }); };

let SRC, ECC;
try {
  SRC = rd('src/js/169h-echo-mode.js');
  const a = SRC.indexOf('/*ECC-START*/'), b = SRC.indexOf('/*ECC-END*/');
  if (a < 0 || b < a) throw new Error('ECC markers missing');
  const ctx = {}; vm.createContext(ctx);
  ECC = vm.runInContext(SRC.slice(a, b) + '\n({ SLOW, MIN_S, MAX_S, secs, pick, first });', ctx);
} catch (e) { console.error('echo_check: cannot load: ' + e.message); process.exit(2); }

(async () => {
  await t('secs: sized to the sentence, 3 to 25, slower narrator = more time', () => {
    assert.strictEqual(ECC.secs(1, 1), 3); assert.strictEqual(ECC.secs(2.4, 1), 4); assert.strictEqual(ECC.secs(6, 1), 9);
    assert.ok(ECC.secs(6, 0.8) > ECC.secs(6, 1)); assert.strictEqual(ECC.secs(500, 1), 25); assert.strictEqual(ECC.secs(0, 1), 4); assert.strictEqual(ECC.secs(NaN, 0), 4);
  });
  await t('pick / first: skip hidden sentences, both directions, none left', () => {
    const hid = new Set([2, 3]), h = i => hid.has(i);
    assert.strictEqual(ECC.pick(h, 6, 2, 1), 4); assert.strictEqual(ECC.pick(h, 6, 3, -1), 1); assert.strictEqual(ECC.pick(h, 6, 6, 1), -1); assert.strictEqual(ECC.pick(h, 6, 0, -1), 0);
    assert.strictEqual(ECC.first(h, 6, 2), 4); assert.strictEqual(ECC.first(i => i >= 4, 6, 5), 3); assert.strictEqual(ECC.first(() => true, 6, 2), -1);
    assert.strictEqual(ECC.first(() => false, 0, 0), -1); assert.strictEqual(ECC.first(() => false, 6, 99), 5); assert.strictEqual(ECC.first(() => false, 6, -4), 0);
  });
  await t('the file never listens to audio ticks, never writes storage, never records', () => {
    assert.ok(!/timeupdate|addEventListener\('(?:play|pause|ended)'/.test(SRC), 'audio events');
    assert.ok(!/localStorage|store\.set|getUserMedia|MediaRecorder|SpeechRecognition/.test(SRC), 'storage or microphone');
  });
  await t('wiring: build.py lines, hook in 060, registered tile, strings in bn.json', () => {
    const b = rd('build.py');
    ['src/css/94p-echo.css', 'src/html/28c-sheet-echo.html', 'src/js/169h-echo-mode.js'].forEach(f => assert.ok(b.includes(f), f));
    assert.ok(b.indexOf('169g-question-screen.js') < b.indexOf('169h-echo-mode.js'));
    assert.ok(/S\.quietJump/.test(rd('src/js/060-position-bookmarks.js')));
    const d = JSON.parse(rd('src/i18n/bn.json')).dict;
    ['Echo', 'Hear again', "I'm done, next", 'Your turn. Say it out loud', 'Slow 0.8\u00d7', 'Listen to the narrator'].forEach(k => assert.ok(d[k], k));
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
  const css = ['10-base-layout', '94-learn-ui', '40-player-sheets-chips', '60-reading-search', '80-progress-v10', '94p-echo'].map(f => rd('src/css/' + f + '.css')).join('\n');
  const html = `<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><html data-theme="dark"><head><style>${css}
body{margin:0;background:var(--bg);color:var(--ink);font-family:var(--font-ui)} .sheet.ced{animation:none}</style></head><body><div id="backdrop" hidden></div>${rd('src/html/28c-sheet-echo.html')}
<script>
window.T = { seeks: [], quiet: [], toasts: [], plays: 0, reg: null };
(() => {
  const $ = (s, r) => (r || document).querySelector(s);
  const FAST = 10, N = 31, STEP = 3;
  const P = { speed: 1.5, nudge: 0 }, S = { book: { id: 7, title: 'Dracula' }, sec: 0, durs: [N * STEP], quietJump: false, plan: [], model: null };
  S.plan[0] = { ids: Array.from({ length: N }, (_, i) => i), starts: Array.from({ length: N }, (_, i) => i * STEP) };
  S.model = { sents: Array.from({ length: N }, (_, i) => ({ t: 'Sentence number ' + (i + 1) + ' of the old book is read here.', h: false })), chapters: [{ start: 0, end: N, title: 'Ch. 3' }] };
  window.S = S; window.P = P;
  const audio = { paused: true, ended: false, currentTime: 0, playbackRate: 1, _iv: 0,
    play() { this.paused = false; T.plays++; clearInterval(this._iv); this._iv = setInterval(() => { this.currentTime += 0.02 * FAST * this.playbackRate; }, 20); return Promise.resolve(); },
    pause() { this.paused = true; clearInterval(this._iv); } };
  window.audio = audio;
  const Core = { locate: (starts, t) => { let k = 0; for (let i = 0; i < starts.length; i++) if (starts[i] <= t) k = i; return k; } };
  const nowT = () => audio.currentTime;
  const seekAudio = x => { T.seeks.push(x); T.quiet.push(S.quietJump); audio.currentTime = x; };
  const openSheet = id => { $('#' + id).hidden = false; }, closeSheets = () => { document.querySelectorAll('.sheet').forEach(s => { s.hidden = true; }); };
  const toast = m => T.toasts.push(m), onPlayFail = () => {}, goTrack = () => {}, fmt = s => Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0'), guideDoc = () => {};
  const LearnHub = { register(r) { T.reg = r; } };
  ${real}
  window.run = new Function('S','P','audio','Core','nowT','seekAudio','openSheet','closeSheets','toast','onPlayFail','goTrack','fmt','guideDoc','LearnHub','sentTime','shPlan','shClip',
    ${JSON.stringify(SRC + '\nreturn { EM };')});
  window.api = window.run(S, P, audio, Core, nowT, seekAudio, openSheet, closeSheets, toast, onPlayFail, goTrack, fmt, guideDoc, LearnHub, sentTime, shPlan, shClip);
})();
</script></body></html>`;
  let browser;
  try { browser = await chromium.launch({ channel: 'chrome' }).catch(() => chromium.launch()); } catch (e) { console.error('echo_check: no browser: ' + e.message); process.exit(2); }
  const page = await browser.newPage({ viewport: { width: 430, height: 900 } });
  const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await page.setContent(html);
  const ev = (f, a) => page.evaluate(f, a);
  const title = () => ev(() => document.getElementById('ec-title').textContent);
  const waitRepeat = () => page.waitForFunction(() => document.getElementById('ec-title').textContent.startsWith('Your turn'), null, { timeout: 4000 });
  const reset = (time, playing) => ev(([tm, pl]) => { const a = window.audio; a.pause(); a.currentTime = tm; a.playbackRate = 1.5; if (pl) a.play(); T.seeks = []; T.quiet = []; S.model.sents.forEach(s => { s.h = false; }); }, [time, playing]);
  const click = id => ev(i => document.getElementById(i).click(), id);

  await t('Echo moves are quiet; the tile is registered in the hub and the Study sheet', async () => {
    const r = await ev(() => ({ id: T.reg.id, title: T.reg.title, ps: T.reg.playerSubtitle({ time: 75 }), ps0: T.reg.playerSubtitle(null), order: T.reg.order, player: T.reg.player }));
    assert.strictEqual(r.id, 'echo'); assert.strictEqual(r.title, 'Echo'); assert.strictEqual(r.ps, 'Starts at 1:15'); assert.notStrictEqual(r.player, false);
  });
  await t('ten sentences in a row, starting at the current one; each plays from its own start and stops at its end; the countdown is sized', async () => {
    await reset(14 * 3 + 0.5, false);
    assert.strictEqual(await ev(() => api.EM.start()), true);
    const seen = [];
    for (let i = 0; i < 10; i++) {
      await waitRepeat();
      const r = await ev(() => ({ k: api.EM.k, paused: audio.paused, rate: audio.playbackRate, ct: audio.currentTime, n: document.getElementById('ec-n').textContent, pos: document.getElementById('ec-pos').textContent, sent: document.getElementById('ec-sent').textContent, st: [...document.querySelectorAll('.ec-step')].map(x => x.className.replace('wl-pill ec-step', '').trim()) }));
      seen.push(r.k);
      assert.ok(r.paused, 'paused while you speak (sentence ' + r.k + ')'); assert.strictEqual(r.rate, 1.5, 'normal speed restored while it waits');
      assert.ok(r.ct >= (r.k + 1) * 3 - 0.2 && r.ct < (r.k + 1) * 3 + 0.9, 'stopped at the end of the clip: ' + r.ct + ' k=' + r.k);
      assert.strictEqual(r.n, '5', 'countdown for a 2.98 s clip: ceil(2.98 x 1.25 + 1)'); assert.strictEqual(r.pos, 'Sentence ' + (r.k + 1) + ' of 31'); assert.ok(r.sent.includes('number ' + (r.k + 1) + ' '));
      assert.deepStrictEqual(r.st, ['is-ok', 'is-now', '']);
      await click('ec-done');
    }
    assert.deepStrictEqual(seen, [14, 15, 16, 17, 18, 19, 20, 21, 22, 23]);
    const sk = await ev(() => T.seeks.slice(0, 10)); sk.forEach((x, i) => assert.ok(Math.abs(x - ((14 + i) * 3 + 0.02)) < 1e-9, 'seek ' + i + ' = ' + x));
    assert.ok((await ev(() => T.quiet)).every(Boolean), 'every move quiet');
    await ev(() => api.EM.close());
  });
  await t('close puts the audio back at the same second: was paused', async () => {
    await reset(14 * 3 + 0.5, false); await ev(() => api.EM.start()); await waitRepeat(); await click('ec-done'); await waitRepeat();
    await click('ec-x');
    const r = await ev(() => ({ ct: audio.currentTime, paused: audio.paused, rate: audio.playbackRate, on: api.EM.on, hidden: document.getElementById('sheet-echo').hidden, q: S.quietJump }));
    assert.strictEqual(r.ct, 14 * 3 + 0.5); assert.ok(r.paused); assert.strictEqual(r.rate, 1.5); assert.ok(!r.on && r.hidden && !r.q);
  });
  await t('close puts the audio back: was playing, closed in the middle of a clip, and by the sheet (backdrop / Back) instead of the X', async () => {
    await reset(5 * 3 + 1, true); await ev(() => api.EM.start());
    await page.waitForTimeout(60); assert.ok(await ev(() => !audio.paused), 'narrator playing');
    await ev(() => { document.getElementById('sheet-echo').hidden = true; });
    await page.waitForFunction(() => !api.EM.on, null, { timeout: 2000 });
    const r = await ev(() => ({ ct: audio.currentTime, paused: audio.paused, rate: audio.playbackRate }));
    assert.ok(Math.abs(r.ct - 16) < 0.25, 'back at 16 s (+ a moment of play): ' + r.ct); assert.ok(!r.paused, 'plays again'); assert.strictEqual(r.rate, 1.5);
  });
  await t('hear again replays the same sentence; Slow plays at 0.8x, gives a longer countdown, and the saved speed comes back', async () => {
    await reset(10 * 3 + 0.5, false); await ev(() => api.EM.start()); await waitRepeat();
    const n1 = +(await ev(() => document.getElementById('ec-n').textContent));
    await ev(() => { T.seeks = []; });
    await click('ec-again'); assert.strictEqual(await title(), 'Listen to the narrator');
    await waitRepeat(); assert.strictEqual(await ev(() => api.EM.k), 10); assert.ok(Math.abs((await ev(() => T.seeks[0])) - (30.02)) < 1e-9);
    await click('ec-slow');
    await page.waitForTimeout(40); assert.strictEqual(await ev(() => audio.playbackRate), 0.8); assert.strictEqual(await ev(() => document.getElementById('ec-slow').getAttribute('aria-pressed')), 'true');
    await waitRepeat(); const n2 = +(await ev(() => document.getElementById('ec-n').textContent));
    assert.ok(n2 > n1, 'slow = more seconds: ' + n1 + ' -> ' + n2); assert.strictEqual(await ev(() => audio.playbackRate), 1.5);
    await click('ec-slow'); await page.waitForTimeout(40); assert.strictEqual(await ev(() => audio.playbackRate), 1); await ev(() => api.EM.close());
    assert.strictEqual(await ev(() => audio.playbackRate), 1.5);
  });
  await t('hidden (not narrated) sentences are skipped, at the start and in the middle', async () => {
    await reset(4 * 3 + 0.5, false); await ev(() => { S.model.sents[4].h = true; S.model.sents[6].h = true; });
    await ev(() => api.EM.start()); await waitRepeat(); assert.strictEqual(await ev(() => api.EM.k), 5);
    await click('ec-done'); await waitRepeat(); assert.strictEqual(await ev(() => api.EM.k), 7); await ev(() => api.EM.close());
  });
  await t('the countdown ends by itself and the next sentence starts (no tap needed)', async () => {
    await reset(2 * 3, false); await ev(() => api.EM.start()); await waitRepeat();
    await page.waitForFunction(() => api.EM.k === 3, null, { timeout: 7000 });
    assert.strictEqual(await title(), 'Listen to the narrator'); await ev(() => api.EM.close());
  });
  await t('last sentence of the track: a calm end screen; the button closes and returns', async () => {
    await reset(30 * 3 + 0.5, false); await ev(() => api.EM.start()); await waitRepeat(); await click('ec-done');
    assert.strictEqual(await title(), 'Well done');
    assert.strictEqual(await ev(() => document.getElementById('ec-done').textContent), 'Back to listening'); assert.ok(await ev(() => document.getElementById('ec-again').disabled));
    assert.strictEqual(await ev(() => document.getElementById('ec-status').textContent), 'That was the last sentence in this track.');
    await click('ec-done'); const r = await ev(() => ({ ct: audio.currentTime, on: api.EM.on })); assert.strictEqual(r.ct, 30 * 3 + 0.5); assert.ok(!r.on);
  });
  await t('no book text lined up: a message, nothing opens, nothing played', async () => {
    await reset(0, false); await ev(() => { S.plan[0].ids = []; T.toasts = []; });
    assert.strictEqual(await ev(() => api.EM.start()), false); assert.strictEqual((await ev(() => T.toasts)).length, 1); assert.ok(await ev(() => document.getElementById('sheet-echo').hidden));
    await ev(() => { S.plan[0].ids = Array.from({ length: 31 }, (_, i) => i); });
  });
  if (process.env.EC_SHOT) { await reset(13 * 3 + 0.5, false); await ev(() => api.EM.start()); await waitRepeat(); await page.waitForTimeout(400); await page.screenshot({ path: process.env.EC_SHOT }); await ev(() => api.EM.close()); }
  await t('no script errors', () => assert.deepStrictEqual(errs, []));
  await browser.close();
}
