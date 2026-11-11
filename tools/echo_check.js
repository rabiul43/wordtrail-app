#!/usr/bin/env node
/* Checks for Echo mode (src/js/169h-echo-mode.js, 94p css, 28c sheet; Task 42):   node tools/echo_check.js
   Part 1 loads the pure helpers (ECC, between the ECC-START/END markers): countdown length, skipping hidden sentences, where to start.
   Part 2 (needs Playwright; skipped with a clear line when it is missing) loads the REAL 169h, the REAL sheet markup and css, and the REAL sentTime /
   shPlan / shClip from 150 and 140, into a page with a fake <audio> that runs 10x faster than real time. It proves: ten sentences in a row, each one
   played from its own start and paused at its end; hear again; slow (0.8x, speed restored); hidden sentences skipped; the countdown ends by itself;
   closing in any way puts the audio back (second, playing or not); Echo moves are quiet for the jump history; the tile is registered.
   It does not prove the full app: open a real book and a real narrator by hand (see the handoff note).
   Task 43 (recording, src/js/169i-echo-recording.js): the pure helpers (ERC), no network code in 169i, and in the browser part a REAL Chromium with a fake
   microphone and a real IndexedDB: the microphone is asked only on the Record tap, record / stop / take card / saved, the countdown waits while recording,
   Next and close, denied / none / busy / other / unsupported, nothing recorded, a browser that will not keep data, the cap of 20, the My recordings list,
   and no network request apart from the page itself. Playing a take is checked with a stand-in Audio (the blob URL and the buttons), not by ear.
   Exit code 1 if a check fails, 2 if a file cannot be loaded. */
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const root = path.join(__dirname, '..'), rd = f => fs.readFileSync(path.join(root, f), 'utf8');
let ran = 0, bad = 0;
const t = (name, fn) => { ran++; return Promise.resolve().then(fn).then(() => console.log('ok   ' + name), e => { bad++; console.log('FAIL ' + name + ': ' + (e && e.message)); }); };

let SRC, ECC, SRC_I, ERCx, SRC_J;
try {
  SRC = rd('src/js/169h-echo-mode.js');
  const a = SRC.indexOf('/*ECC-START*/'), b = SRC.indexOf('/*ECC-END*/');
  if (a < 0 || b < a) throw new Error('ECC markers missing');
  const ctx = {}; vm.createContext(ctx);
  ECC = vm.runInContext(SRC.slice(a, b) + '\n({ SLOW, MIN_S, MAX_S, secs, pick, first });', ctx);
} catch (e) { console.error('echo_check: cannot load: ' + e.message); process.exit(2); }
try {
  SRC_J = rd('src/js/169j-echo-compare.js');
  SRC_I = rd('src/js/169i-echo-recording.js');
  const a = SRC_I.indexOf('/*ERC-START*/'), b = SRC_I.indexOf('/*ERC-END*/');
  if (a < 0 || b < a) throw new Error('ERC markers missing');
  const ctx = {}; vm.createContext(ctx);
  ERCx = vm.runInContext(SRC_I.slice(a, b) + '\n({ MAX, MAX_S, MIN_S, pickType, limit, over, supported, errKind, fmtS, newId, ok });', ctx);
} catch (e) { console.error('echo_check: cannot load 169i: ' + e.message); process.exit(2); }

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

  await t('ERC: mime type, stop limit, keep the newest 20, support, error kinds, labels', () => {
    assert.strictEqual(ERCx.MAX, 20);
    assert.strictEqual(ERCx.pickType(x => x === 'audio/mp4'), 'audio/mp4'); assert.strictEqual(ERCx.pickType(() => false), ''); assert.strictEqual(ERCx.pickType(() => { throw new Error('x'); }), '');
    assert.strictEqual(ERCx.pickType(() => true), 'audio/webm;codecs=opus');
    assert.strictEqual(ERCx.limit(2), 10); assert.strictEqual(ERCx.limit(8), 20); assert.strictEqual(ERCx.limit(100), 30); assert.strictEqual(ERCx.limit(0), 10); assert.strictEqual(ERCx.limit(NaN), 10);
    const l = Array.from({ length: 23 }, (_, i) => ({ id: 'a' + i, t: 1000 + i }));
    assert.deepStrictEqual(ERCx.over(l, 20).sort(), ['a0', 'a1', 'a2']); assert.deepStrictEqual(ERCx.over(l.slice(0, 20), 20), []); assert.strictEqual(ERCx.over(l, 0).length, 23);
    assert.deepStrictEqual(ERCx.over([{ id: 'b', t: 5 }, { id: 'a', t: 5 }, { id: 'c', t: 5 }], 2), ['a']);
    const nav = { mediaDevices: { getUserMedia() { /* stand-in */ } } }, win = { MediaRecorder() { /* stand-in */ } };
    assert.ok(ERCx.supported(nav, win)); assert.ok(!ERCx.supported({}, win)); assert.ok(!ERCx.supported(nav, {})); assert.ok(!ERCx.supported(null, null)); assert.ok(!ERCx.supported({ mediaDevices: {} }, win));
    ['NotAllowedError', 'SecurityError', 'PermissionDeniedError'].forEach(n => assert.strictEqual(ERCx.errKind(n), 'denied'));
    ['NotFoundError', 'DevicesNotFoundError', 'OverconstrainedError'].forEach(n => assert.strictEqual(ERCx.errKind(n), 'none'));
    ['NotReadableError', 'TrackStartError', 'AbortError'].forEach(n => assert.strictEqual(ERCx.errKind(n), 'busy'));
    assert.strictEqual(ERCx.errKind('TypeError'), 'other'); assert.strictEqual(ERCx.errKind(undefined), 'other');
    assert.strictEqual(ERCx.fmtS(4.14), '4.1 s'); assert.strictEqual(ERCx.fmtS(0), '0.0 s'); assert.strictEqual(ERCx.fmtS(NaN), '0.0 s'); assert.strictEqual(ERCx.fmtS(-2), '0.0 s');
    assert.strictEqual(typeof ERCx.newId(1.7e12, 0.5), 'string'); assert.notStrictEqual(ERCx.newId(1.7e12, 0.5), ERCx.newId(1.7e12, 0.6));
    assert.ok(ERCx.ok({ id: 'x', t: 1, blob: { size: 3 } })); assert.ok(!ERCx.ok({ id: 'x', t: 1, blob: { size: 0 } })); assert.ok(!ERCx.ok(null)); assert.ok(!ERCx.ok({ id: 5, t: 1, blob: { size: 3 } }));
  });
  await t('169i: nothing is uploaded (no network, account or other storage code); one microphone request; Echo (169h) itself stays free of recording code', () => {
    assert.ok(!/fetch\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource|acDb|acLoad|acInfo|firebase|localStorage|store\.set|SpeechRecognition/.test(SRC_I), 'network, account or storage code in 169i');
    assert.strictEqual((SRC_I.match(/getUserMedia\(/g) || []).length, 1);
    assert.ok(!/getUserMedia|MediaRecorder|indexedDB/.test(SRC), '169h must not record');
  });
  await t('wiring (Task 43): build.py lines and order, strings in bn.json', () => {
    const b = rd('build.py');
    ['src/css/94q-echo-recording.css', 'src/js/169i-echo-recording.js'].forEach(f => assert.ok(b.includes(f), f));
    assert.ok(b.indexOf('169h-echo-mode.js') < b.indexOf('169i-echo-recording.js')); assert.ok(b.indexOf('94p-echo.css') < b.indexOf('94q-echo-recording.css'));
    const d = JSON.parse(rd('src/i18n/bn.json')).dict;
    ['Record', 'Record again', 'Stop', 'Recording', 'Your recording', 'You', 'Narrator', 'Play mine', 'Delete', 'Deleted.', 'My recordings', 'No recordings yet.', 'Close',
      'Recording is not supported in this browser.', 'The microphone is blocked. Allow it in your browser settings, then try again.', 'No microphone was found on this device.',
      'The microphone is busy in another app. Close that app and try again.', 'Could not start recording. Try again.', 'Nothing was recorded. Try again.',
      'Saved on this device only. Nothing is uploaded.', 'Saved on this device only. Your oldest recording was removed (up to 20 are kept).',
      'Could not save this recording on this device. You can still play it now.', 'Could not play the recording.', 'Saved recordings cannot be opened in this browser.',
      'Up to 20 recordings are kept. The oldest is removed first.'].forEach(k => assert.ok(d[k], k));
  });

  let chromium; try { ({ chromium } = require('playwright')); } catch (e) { console.log('skip browser part: playwright is not installed'); }
  if (chromium) await browserPart(chromium);
  console.log('\nran ' + ran + ', failed ' + bad);
  process.exit(bad ? 1 : 0);
})();

async function browserPart(chromium) {
  const grab = (src, start, endRe) => { const i = src.indexOf(start); if (i < 0) throw new Error('missing ' + start); const m = src.slice(i).match(endRe); return src.slice(i, i + m.index + m[0].length); };
  const s150 = rd('src/js/150-player-reader.js'), s140 = rd('src/js/140-open-book.js');
  const micShim = () => {   // runs inside the test page: counts microphone requests, can make them fail, and stands in for Audio
    T.gum = 0; T.gumFail = ''; T.streams = []; T.audios = [];
    const md = navigator.mediaDevices;
    if (md) { const orig = md.getUserMedia.bind(md); md.getUserMedia = c => { T.gum++; if (T.gumFail) return Promise.reject(new DOMException('x', T.gumFail)); return orig(c).then(x => { T.streams.push(x); return x; }); }; }
    window.Audio = function (u) { return { url: u, paused: true, play() { this.paused = false; T.audios.push(this.url); return Promise.resolve(); }, pause() { this.paused = true; } }; };
  };
  const real = [grab(s150, '  function sentTime(', /\n/), grab(s140, '  function shPlan()', /\n/), grab(s140, '  function shClip(', /\n  }\n/)].join('\n');
  const css = ['10-base-layout', '94-learn-ui', '40-player-sheets-chips', '60-reading-search', '80-progress-v10', '94p-echo', '94q-echo-recording', '94r-echo-compare'].map(f => rd('src/css/' + f + '.css')).join('\n');
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
  (${micShim.toString()})();
  T.srStarts = 0; T.srText = ''; T.srErr = '';
  try { Object.defineProperty(window, 'SpeechRecognition', { value: undefined, writable: true, configurable: true }); } catch (e) { window.SpeechRecognition = undefined; }   // only the fake prefixed one below is used
  window.webkitSpeechRecognition = class { start() { T.srStarts++; this.on = true; } stop() { if (!this.on) return; this.on = false; setTimeout(() => {
    if (T.srErr) { if (this.onerror) this.onerror({ error: T.srErr }); } else if (T.srText && this.onresult) this.onresult({ results: [[{ transcript: T.srText }]] });
    if (this.onend) this.onend(); }, 30); } abort() { this.on = false; } };
  window.run = new Function('S','P','audio','Core','nowT','seekAudio','openSheet','closeSheets','toast','onPlayFail','goTrack','fmt','guideDoc','LearnHub','sentTime','shPlan','shClip',
    ${JSON.stringify(SRC + '\n' + SRC_I + '\n' + SRC_J + '\nreturn { EM, ER, ECX, ECM };')});
  window.api = window.run(S, P, audio, Core, nowT, seekAudio, openSheet, closeSheets, toast, onPlayFail, goTrack, fmt, guideDoc, LearnHub, sentTime, shPlan, shClip);
})();
</script></body></html>`;
  let browser;
  try { const args = ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream']; browser = await chromium.launch({ channel: 'chrome', args }).catch(() => chromium.launch({ args })); } catch (e) { console.error('echo_check: no browser: ' + e.message); process.exit(2); }
  const page = await browser.newPage({ viewport: { width: 430, height: 900 } });
  const reqs = []; page.on('request', r => reqs.push(r.url()));
  const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await page.route('http://localhost/**', r => (/favicon/.test(r.request().url()) ? r.fulfill({ status: 204 }) : r.fulfill({ status: 200, contentType: 'text/html', body: html })));
  await page.goto('http://localhost/');   // a real origin (secure context), so IndexedDB and the microphone work
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

  /* ---------- Task 43: recording ---------- */
  const toRepeat = async k => { await reset(k * 3 + 0.5, false); await ev(() => api.EM.start()); await waitRepeat(); };
  const clearDb = () => ev(() => new Promise(res => { const r = indexedDB.deleteDatabase('wordtrail-rec'); r.onsuccess = r.onerror = r.onblocked = () => res(); }));
  const count = () => ev(() => api.ER.list().then(a => a.length));
  const text = id => ev(i => document.getElementById(i).textContent, id);
  const until = async (fn, what) => { for (let i = 0; i < 60; i++) { if (await fn()) return; await page.waitForTimeout(100); } assert.fail('timed out: ' + what); };
  const recording = () => ev(() => api.ER.recording);
  const micOff = () => ev(() => T.streams.every(s => s.getTracks().every(x => x.readyState === 'ended')));
  const MIC = { off: 'The microphone is blocked. Allow it in your browser settings, then try again.' };
  await clearDb();

  await t('the microphone is asked only when Record is tapped; Record waits for the Your turn step', async () => {
    await ev(() => { T.gum = 0; T.gumFail = ''; });
    await reset(3 * 3 + 0.5, false); await ev(() => api.EM.start());
    assert.ok(await ev(() => document.getElementById('ec-rec').disabled), 'disabled while the narrator plays');
    await waitRepeat();
    assert.strictEqual(await ev(() => T.gum), 0, 'opening Echo never asks for the microphone'); assert.ok(!(await ev(() => document.getElementById('ec-rec').disabled)));
    assert.strictEqual(await text('ec-rec-l'), 'Record');
  });
  await t('record: the countdown waits, Stop shows the take card, the take is saved on this device, the microphone is released', async () => {
    await click('ec-rec'); await until(recording, 'recording starts');
    assert.strictEqual(await ev(() => T.gum), 1); assert.strictEqual(await title(), 'Recording'); assert.strictEqual(await text('ec-rec-l'), 'Stop');
    assert.strictEqual(await ev(() => document.getElementById('ec-rec').getAttribute('aria-pressed')), 'true'); assert.ok(await ev(() => document.getElementById('ec-mine').disabled));
    await page.waitForTimeout(5800);   // longer than the 5 s countdown of this sentence: Echo must NOT move on
    assert.strictEqual(await ev(() => api.EM.k), 3); assert.ok(await recording(), 'still recording');
    await click('ec-rec');
    await until(() => ev(() => !document.getElementById('ec-take').hidden), 'take card');
    const d = await text('ec-take-d'), nd = await text('ec-take-nd');
    assert.ok(/^\d\.\d s$/.test(d) && parseFloat(d) > 4, 'you: ' + d); assert.strictEqual(nd, '3.0 s'); assert.strictEqual(await title(), 'Your recording'); assert.strictEqual(await text('ec-rec-l'), 'Record again');
    await until(async () => (await text('ec-take-n')) !== '', 'saved note'); assert.strictEqual(await text('ec-take-n'), 'Saved on this device only. Nothing is uploaded.');
    const a = await ev(() => api.ER.list().then(l => l.map(x => ({ size: x.blob.size, type: x.type, dur: x.dur, nd: x.nd, book: x.book, sec: x.sec, sid: x.sid, text: x.text }))));
    assert.strictEqual(a.length, 1); assert.ok(a[0].size > 0 && /^audio\//.test(a[0].type), JSON.stringify(a[0])); assert.strictEqual(a[0].book, '7'); assert.strictEqual(a[0].sid, 3); assert.strictEqual(a[0].sec, 0); assert.ok(a[0].text.includes('number 4 '));
    assert.ok(await micOff(), 'every microphone track ended'); assert.ok(!(await recording()));
    assert.strictEqual(await ev(() => api.EM.k), 3, 'still on the same sentence');
  });
  await t('Play mine uses a blob URL and toggles with Stop; Delete removes the take and the saved copy', async () => {
    await click('ec-play'); assert.strictEqual(await ev(() => T.audios.length), 1); assert.ok((await ev(() => T.audios[0])).startsWith('blob:')); assert.strictEqual(await text('ec-play-l'), 'Stop');
    await click('ec-play'); assert.strictEqual(await text('ec-play-l'), 'Play mine');
    await click('ec-del');
    assert.ok(await ev(() => document.getElementById('ec-take').hidden)); assert.strictEqual(await count(), 0); assert.strictEqual(await text('ec-status'), 'Deleted.'); assert.strictEqual(await title(), 'Your turn. Say it out loud'); assert.strictEqual(await text('ec-rec-l'), 'Record');
  });
  await t('"I\'m done, next" while recording keeps the take (saved quietly), moves on, releases the microphone', async () => {
    await click('ec-rec'); await until(recording, 'recording starts'); await page.waitForTimeout(700);
    await click('ec-done');
    await until(async () => (await count()) === 1, 'saved'); assert.ok(!(await recording())); assert.ok(await ev(() => document.getElementById('ec-take').hidden), 'no take card on the next sentence');
    assert.strictEqual(await title(), 'Listen to the narrator'); assert.strictEqual(await ev(() => api.EM.k), 4); assert.ok(await micOff());
    assert.ok(await ev(() => document.getElementById('ec-rec').disabled), 'Record waits for the next Your turn step');
  });
  await t('closing Echo while recording throws the take away and releases the microphone', async () => {
    await waitRepeat(); await click('ec-rec'); await until(recording, 'recording starts'); await page.waitForTimeout(500);
    await click('ec-x'); await page.waitForTimeout(500);
    assert.strictEqual(await count(), 1, 'nothing new saved'); assert.ok(!(await recording())); assert.ok(await micOff()); assert.ok(await ev(() => document.getElementById('sheet-echo').hidden));
  });
  await t('microphone denied / none / busy / other: a clear message, no recording, the countdown starts again, nothing saved', async () => {
    const cases = [['NotAllowedError', MIC.off], ['NotFoundError', 'No microphone was found on this device.'], ['NotReadableError', 'The microphone is busy in another app. Close that app and try again.'], ['TypeError', 'Could not start recording. Try again.']];
    for (const [name, msg] of cases) {
      await toRepeat(6); await ev(m => { T.gumFail = m; }, name); await click('ec-rec');
      await until(async () => (await text('ec-status')) === msg, name + ' message');
      assert.ok(!(await recording())); assert.strictEqual(await title(), 'Your turn. Say it out loud'); assert.strictEqual(await text('ec-n'), '5', 'a fresh countdown'); assert.ok(await ev(() => document.getElementById('ec-take').hidden));
      await ev(() => api.EM.close());
    }
    await ev(() => { T.gumFail = ''; }); assert.strictEqual(await count(), 1);
  });
  await t('an old browser (no MediaRecorder): a clear message and the microphone is never asked', async () => {
    await toRepeat(6); const g = await ev(() => { T.keep = window.MediaRecorder; window.MediaRecorder = undefined; return T.gum; });
    await click('ec-rec'); assert.strictEqual(await text('ec-status'), 'Recording is not supported in this browser.'); assert.strictEqual(await ev(() => T.gum), g); assert.ok(!(await recording()));
    await ev(() => { window.MediaRecorder = T.keep; api.EM.close(); });
  });
  await t('a recording with no sound in it: "Nothing was recorded", no take card, nothing saved, the countdown starts again', async () => {
    await toRepeat(7);
    await ev(() => { T.keep = window.MediaRecorder; window.MediaRecorder = class { constructor() { this.state = 'inactive'; this.mimeType = 'audio/webm'; } start() { this.state = 'recording'; } stop() { this.state = 'inactive'; setTimeout(() => this.onstop && this.onstop(), 10); } static isTypeSupported() { return true; } }; });
    await click('ec-rec'); await until(recording, 'recording starts'); await click('ec-rec');
    await until(async () => (await text('ec-status')) === 'Nothing was recorded. Try again.', 'empty message');
    assert.ok(await ev(() => document.getElementById('ec-take').hidden)); assert.strictEqual(await count(), 1); assert.strictEqual(await title(), 'Your turn. Say it out loud'); assert.ok(await micOff());
    await ev(() => { window.MediaRecorder = T.keep; api.EM.close(); });
  });
  await t('a browser that will not keep data: the take can still be played, with an honest message', async () => {
    await clearDb(); await ev(() => { indexedDB.open = () => { throw new Error('blocked by the test'); }; });
    await toRepeat(8); await click('ec-rec'); await until(recording, 'recording starts'); await page.waitForTimeout(600); await click('ec-rec');
    await until(() => ev(() => !document.getElementById('ec-take').hidden), 'take card');
    await until(async () => (await text('ec-take-n')) !== '', 'note'); assert.strictEqual(await text('ec-take-n'), 'Could not save this recording on this device. You can still play it now.');
    const n = await ev(() => T.audios.length); await click('ec-play'); assert.strictEqual(await ev(() => T.audios.length), n + 1);
    await click('ec-mine'); await until(async () => !(await ev(() => document.getElementById('ec-lib-e').hidden)), 'list message'); assert.strictEqual(await text('ec-lib-e'), 'Saved recordings cannot be opened in this browser.');
    await ev(() => { delete indexedDB.open; api.EM.close(); }); await clearDb();
  });
  await t('at most 20 are kept: the 21st removes the oldest and says so; the newest come first', async () => {
    const r = await ev(async () => {
      const out = { nulls: 0, dropped: [] };
      for (let i = 0; i < 25; i++) { const x = await api.ER.saveBlob(new Blob([new Uint8Array(10 + i)], { type: 'audio/webm' }), { text: 'n' + i, dur: 1, nd: 1 }); if (!x) out.nulls++; else out.dropped.push(x.dropped); await new Promise(z => setTimeout(z, 3)); }
      const a = await api.ER.list(); out.n = a.length; out.texts = a.map(x => x.text); return out;
    });
    assert.strictEqual(r.nulls, 0); assert.strictEqual(r.n, 20); assert.strictEqual(r.texts[0], 'n24'); assert.strictEqual(r.texts[19], 'n5'); assert.deepStrictEqual(r.dropped.slice(0, 20), Array(20).fill(0)); assert.deepStrictEqual(r.dropped.slice(20), Array(5).fill(1));
  });
  await t('My recordings: the list, count, play, delete one, empty message; closing it hears the sentence again', async () => {
    await toRepeat(2); await click('ec-mine');
    assert.ok(!(await ev(() => document.getElementById('ec-lib').hidden))); assert.strictEqual(await text('ec-lib-n'), '20 / 20');
    await until(async () => (await ev(() => document.querySelectorAll('#ec-lib-l .ec-row').length)) === 20, '20 rows');
    assert.strictEqual(await ev(() => document.querySelector('#ec-lib-l .ec-row-s').textContent), 'n24');
    const n = await ev(() => T.audios.length); await ev(() => document.querySelector('#ec-lib-l [data-play]').click());
    assert.strictEqual(await ev(() => T.audios.length), n + 1); assert.ok((await ev(() => T.audios[T.audios.length - 1])).startsWith('blob:'));
    await ev(() => document.querySelector('#ec-lib-l .ec-row-b button:last-child').click());
    await until(async () => (await text('ec-lib-n')) === '19 / 20', 'one fewer'); assert.strictEqual(await count(), 19); assert.strictEqual(await ev(() => document.querySelector('#ec-lib-l .ec-row-s').textContent), 'n23');
    await click('ec-lib-x'); assert.ok(await ev(() => document.getElementById('ec-lib').hidden)); await waitRepeat(); assert.strictEqual(await ev(() => api.EM.k), 2);
    await ev(() => api.EM.close()); await clearDb();
    await toRepeat(2); await click('ec-mine'); await until(async () => !(await ev(() => document.getElementById('ec-lib-e').hidden)), 'empty message');
    assert.strictEqual(await text('ec-lib-e'), 'No recordings yet.'); assert.strictEqual(await text('ec-lib-n'), '0 / 20'); await click('ec-lib-x'); await ev(() => api.EM.close());
  });
  if (process.env.EC_SHOT) { await reset(13 * 3 + 0.5, false); await ev(() => api.EM.start()); await waitRepeat(); await page.waitForTimeout(400); await page.screenshot({ path: process.env.EC_SHOT }); await ev(() => api.EM.close()); }

  /* ---------- Task 44: compare, what we heard (optional), history (169j) ---------- */
  const lsGet = k => ev(x => localStorage.getItem(x), k), hist = async () => JSON.parse((await lsGet('wt:echo')) || 'null');
  const toRep = async k => { await ev(() => api.EM.close()); await toRepeat(k); };
  const take1 = async k => { await toRep(k); await click('ec-rec'); await until(recording, 'recording starts'); await page.waitForTimeout(600); await click('ec-rec'); await until(() => ev(() => !document.getElementById('ec-take').hidden), 'take card'); };
  await t('169j without speech recognition: no switch, no chips; durations, pace, Narrator and practice list work; nothing is asked or started', async () => {
    await clearDb(); await ev(() => { localStorage.clear(); T.keepSR = window.webkitSpeechRecognition; window.SpeechRecognition = undefined; window.webkitSpeechRecognition = undefined; T.srStarts = 0; });
    await take1(3);
    assert.ok(await ev(() => document.getElementById('ec-sr').hidden), 'switch hidden'); assert.ok(await ev(() => document.getElementById('ec-heard').hidden), 'no chips');
    const r = await ev(() => ({ y: document.getElementById('ec-bar-y').style.width, n: document.getElementById('ec-bar-n').style.width, w: document.getElementById('ec-pace-w').textContent, x: document.getElementById('ec-pace-x').textContent, note: document.getElementById('ec-pace-n').textContent, srs: T.srStarts }));
    assert.ok(r.y && r.n && /^×\d\.\d$/.test(r.x), JSON.stringify(r)); assert.ok(/narrator/.test(r.w) && /pause/.test(r.note)); assert.strictEqual(r.srs, 0);
    const k0 = await ev(() => audio.currentTime);
    await click('ec-narr'); assert.strictEqual(await text('ec-narr-l'), 'Stop'); assert.ok(!(await ev(() => audio.paused)), 'the narrator clip plays');
    await until(async () => (await text('ec-narr-l')) === 'Narrator', 'clip ends by itself'); assert.ok(await ev(() => audio.paused)); assert.strictEqual(await ev(() => audio.playbackRate), 1.5, 'speed restored'); assert.strictEqual(await ev(() => api.EM.step), 'repeat', 'still on the same step');
    await click('ec-narr'); await click('ec-narr'); assert.ok(await ev(() => audio.paused), 'Stop works'); assert.strictEqual(await text('ec-narr-l'), 'Narrator');
    await click('ec-prac'); assert.strictEqual(await ev(() => document.getElementById('ec-prac').getAttribute('aria-pressed')), 'true'); assert.strictEqual(await text('ec-prac-l'), 'On practice list');
    const h = await hist(); assert.strictEqual(h.n, 1); assert.strictEqual(h.pl.length, 1); assert.strictEqual(h.pl[0].sid, 3); assert.strictEqual(Object.values(h.days)[0], 1); assert.deepStrictEqual(h.w, {});
    await ev(() => api.EM.close());
  });
  await t('169j with speech recognition but the switch OFF: switch and note shown, recognition never started, no chips', async () => {
    await ev(() => { window.webkitSpeechRecognition = T.keepSR; localStorage.removeItem('wt:echoheard'); T.srStarts = 0; });
    await take1(4);
    assert.ok(!(await ev(() => document.getElementById('ec-sr').hidden))); assert.strictEqual(await text('ec-sr-l'), 'Show what we heard: off');
    assert.ok(/browser maker/.test(await text('ec-sr-n')) && /not a pronunciation grade/.test(await text('ec-sr-n')));
    assert.strictEqual(await ev(() => T.srStarts), 0); assert.ok(await ev(() => document.getElementById('ec-heard').hidden));
    await ev(() => api.EM.close());
  });
  await t('169j switch ON: chips from what was heard (green, orange with ?), "guide, not a grade", problem words and history; never a score', async () => {
    await toRep(5); await click('ec-sr-t'); assert.strictEqual(await lsGet('wt:echoheard'), '1'); assert.strictEqual(await text('ec-sr-l'), 'Show what we heard: on');
    await ev(() => { T.srText = 'sentence number 6 of the is read here'; T.srStarts = 0; });
    await click('ec-rec'); await until(recording, 'recording starts'); await page.waitForTimeout(500); await click('ec-rec');
    await until(async () => (await ev(() => document.querySelectorAll('#ec-heard-l .ec-hw').length)) > 0, 'chips');
    assert.strictEqual(await ev(() => T.srStarts), 1);
    const r = await ev(() => ({ all: [...document.querySelectorAll('#ec-heard-l .ec-hw')].map(x => x.textContent), q: [...document.querySelectorAll('#ec-heard-l .ec-hw--q')].map(x => x.textContent), note: document.getElementById('ec-heard-n').textContent, h: document.getElementById('ec-take').textContent }));
    assert.deepStrictEqual(r.q, ['old?', 'book?']); assert.strictEqual(r.all[0], 'Sentence'); assert.ok(/guide, not a pronunciation grade/.test(r.note) && /Orange/.test(r.note));
    assert.ok(!/score|%/i.test(r.h), 'no score on the card');
    const h = await hist(); assert.deepStrictEqual([h.w.old, h.w.book].map(a => a.slice(0, 2)), [[1, 1], [1, 1]]); assert.ok(!('the' in h.w) && !('of' in h.w));
    await ev(() => { T.srText = 'sentence number 6 of the old book is read here'; });
    await click('ec-rec'); await until(recording, 'recording again'); await page.waitForTimeout(400); await click('ec-rec');
    await until(async () => (await ev(() => document.getElementById('ec-heard-n').textContent)).startsWith('We heard every word'), 'all heard');
    assert.strictEqual(await ev(() => document.querySelectorAll('#ec-heard-l .ec-hw--q').length), 0);
    await ev(() => api.EM.close());
  });
  await t('169j recognition errors (blocked, nothing heard, unavailable): a plain message, the recording is kept, the take card still works', async () => {
    for (const [err, text0, want] of [['not-allowed', 'x', /did not allow speech recognition/], ['', '', /did not hear any words/], ['network', '', /could not run now/]]) {
      await ev(([e, x]) => { T.srErr = e; T.srText = x; }, [err, text0]);
      await take1(6);
      await until(async () => (await text('ec-heard-n')) !== 'Working out the words…', 'message');
      assert.ok(want.test(await text('ec-heard-n')), err + ': ' + await text('ec-heard-n')); assert.strictEqual(await ev(() => document.querySelectorAll('#ec-heard-l .ec-hw').length), 0);
      assert.ok(!(await ev(() => document.getElementById('ec-take').hidden)), 'take card stays'); assert.ok(await ev(() => document.getElementById('ec-play').offsetParent !== null));
      await ev(() => api.EM.close());
    }
    await ev(() => { T.srErr = ''; });
  });
  await t('169j closing Echo while recording throws the take and its words away (no history count, no chips)', async () => {
    const before = (await hist()).n; await ev(() => { T.srText = 'whatever'; });
    await toRep(7); await click('ec-rec'); await until(recording, 'recording starts'); await ev(() => api.EM.close()); await page.waitForTimeout(150);
    assert.strictEqual((await hist()).n, before); assert.ok(await ev(() => document.getElementById('ec-heard').hidden));
  });
  await t('169j History: counts, pace, problem words, practice list; Practise opens that sentence; Remove; Clear history needs a second tap', async () => {
    await toRep(0); await click('ec-hist-b');
    assert.ok(!(await ev(() => document.getElementById('ec-hist').hidden)));
    const r = await ev(() => ({ s: [...document.querySelectorAll('#ec-hist-s .ec-stat')].map(x => x.textContent), p: document.getElementById('ec-hist-pw').textContent, rows: document.querySelectorAll('#ec-hist-l .ec-row').length, pw: [...document.querySelectorAll('#ec-hist-w .ec-hw')].map(x => x.textContent) }));
    const h = await hist(); assert.strictEqual(r.s[0], h.n + 'Takes'); assert.strictEqual(r.s[1], h.n + 'Today'); assert.strictEqual(r.s[2], h.n + 'This week'); assert.ok(/narrator/.test(r.p)); assert.strictEqual(r.rows, 1);
    assert.strictEqual(await ev(() => document.querySelector('#ec-hist-l .ec-row-b button').disabled), false);
    await ev(() => document.querySelector('#ec-hist-l .ec-row-b button').click());
    assert.ok(await ev(() => document.getElementById('ec-hist').hidden)); await waitRepeat(); assert.strictEqual(await ev(() => api.EM.k), 3, 'Practise went to the saved sentence');
    await click('ec-hist-b'); await click('ec-hist-c'); assert.strictEqual(await text('ec-hist-c'), 'Tap again to clear'); assert.ok((await hist()).n > 0, 'one tap clears nothing');
    await click('ec-hist-c'); assert.strictEqual(await lsGet('wt:echo'), null); assert.strictEqual(await ev(() => document.querySelectorAll('#ec-hist-l .ec-row').length), 0); assert.strictEqual(await ev(() => document.getElementById('ec-hist-le').hidden), false);
    await ev(() => localStorage.setItem('wt:echo', JSON.stringify({ n: 'junk', days: 5, w: [], pl: 'x', keepme: 1 })));
    await click('ec-hist-x'); await ev(() => api.EM.close()); await toRep(1); await click('ec-hist-b');
    assert.ok(!(await ev(() => document.getElementById('ec-hist').hidden)), 'old or damaged data does not break the panel');
    await ev(() => api.EM.close());
  });
  await t('169j: no network request and no new script error (the audio and words never leave through this file)', async () => {
    assert.ok(reqs.every(u => u.startsWith('http://localhost/')), reqs.join(' '));
  });
  await t('no script errors', () => assert.deepStrictEqual(errs, []));
  await t('nothing was uploaded: the only network request in the whole run is the test page itself', () => assert.deepStrictEqual(reqs.filter(u => /^https?:/.test(u) && !/favicon/.test(u)), ['http://localhost/']));
  await browser.close();
}
