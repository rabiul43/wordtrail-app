#!/usr/bin/env node
/* Checks for the Speed ladder (src/js/169zb-speed-ladder.js, Task 8): node tools/speed_ladder_check.js
   Part 1  SLC (pure): the four speeds and their words, the step after each result, the line under the answer, the fastest step of a session, the storage map
           (clean, put, cap of 60 days, junk dropped), the first speed, the sentence level.
   Part 2  Seeded learners (noisy, like srs_check): the ladder settles around each learner's real ceiling, climbs from Slow to Fast in three right answers, never leaves 0..3.
   Part 3  Structure: no emoji, every id the code uses is in the sheet, every icon is in the sprite, P.speed is never written, one timer, no network, build lines,
           docs, Bengali strings, the Listening group.
   Part 4  The real sheet and the real 169zb in Chromium, with the app stubbed (the same stand-in book as fill_gaps_check): the clip plays at the speed of the step and the
           saved speed is put back, right / almost / wrong move the next sentence, Slower and Faster, the end screen, the day's best is stored, the first speed comes from the
           store, closing in the middle puts the audio back, a damaged store never stops it, no network, no page error. (Skipped, with a message, without Playwright.)
   Exit code 1 if a check fails, 2 if a file cannot be loaded. */
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const root = path.join(__dirname, '..'), rd = f => fs.readFileSync(path.join(root, f), 'utf8');
const J = x => JSON.parse(JSON.stringify(x));
let pass = 0, fail = 0;
async function t(name, fn) { try { await fn(); pass++; console.log('ok    ' + name); } catch (e) { fail++; console.log('FAIL  ' + name + '\n        ' + String(e && e.message).split('\n').slice(0, 6).join('\n        ')); } }

const cut = (src, name) => { const a = src.indexOf('/*' + name + '-START*/'), b = src.indexOf('/*' + name + '-END*/'); if (a < 0 || b < a) throw new Error(name + ' markers missing'); return src.slice(a, b); };
let SLC, LNC, SRC, SHEET, LNCsrc, LVEsrc;
try {
  SRC = rd('src/js/169zb-speed-ladder.js'); SHEET = rd('src/html/28h-sheet-speed-ladder.html');
  const k = rd('src/js/169k-listen-type.js'); LVEsrc = rd('src/js/169x-listen-level.js');
  LNCsrc = 'const LNC = (() => {\n' + cut(k, 'LNC') + '\nreturn { SIZE, SLOW, MIN_W, MAX_W, fold, words, spans, check, pickSet, pattern, variants, diff, varNote, rows, spell };\n})();\n';
  const ctx = vm.createContext({});
  vm.runInContext(LNCsrc + 'const SLC = (() => {\n' + cut(SRC, 'SLC') + '\nreturn { RATES, NAMES, FIRST, KEEP, rate, word, label, up, down, after, note, best, say, clean, put, startStep, target };\n})();\nthis.LNC = LNC; this.SLC = SLC;', ctx);
  ({ LNC, SLC } = ctx);
} catch (e) { console.error('speed_ladder_check: cannot load: ' + e.message); process.exit(2); }

(async () => {
  /* ---------------- Part 1 ---------------- */
  await t('four speeds, each with a plain word and a label; a wrong step is clamped, never an error', () => {
    assert.deepStrictEqual(J(SLC.RATES), [0.7, 0.85, 1, 1.2]); assert.deepStrictEqual(J(SLC.NAMES), ['Very slow', 'Slow', 'Normal', 'Fast']);
    assert.strictEqual(SLC.label(0), 'Very slow (0.7x)'); assert.strictEqual(SLC.label(1), 'Slow (0.85x)'); assert.strictEqual(SLC.label(2), 'Normal (1x)'); assert.strictEqual(SLC.label(3), 'Fast (1.2x)');
    assert.strictEqual(SLC.rate(-5), 0.7); assert.strictEqual(SLC.rate(99), 1.2); assert.strictEqual(SLC.rate(NaN), 0.85); assert.strictEqual(SLC.rate(undefined), 0.85); assert.strictEqual(SLC.rate('x'), 0.85);
    assert.strictEqual(SLC.up(3), 3); assert.strictEqual(SLC.up(0), 1); assert.strictEqual(SLC.down(0), 0); assert.strictEqual(SLC.down(3), 2); assert.strictEqual(SLC.FIRST, 1);
  });
  await t('after: perfect = one step faster; almost = same; wrong = one step slower; never outside 0..3', () => {
    for (let s = 0; s <= 3; s++) {
      assert.strictEqual(SLC.after(s, 'ok', s), Math.min(3, s + 1), 'ok at ' + s); assert.strictEqual(SLC.after(s, 'near', s), s, 'near at ' + s); assert.strictEqual(SLC.after(s, 'no', s), Math.max(0, s - 1), 'no at ' + s);
      assert.strictEqual(SLC.after(s, 'zzz', s), Math.max(0, s - 1), 'an unknown result counts as wrong'); assert.strictEqual(SLC.after(s, undefined, s), Math.max(0, s - 1));
    }
    assert.strictEqual(SLC.after(3, 'ok', 3), 3, 'the top stays the top'); assert.strictEqual(SLC.after(0, 'no', 0), 0, 'the bottom stays the bottom');
    [NaN, undefined, null, 'x', -3, 77].forEach(x => ['ok', 'near', 'no'].forEach(v => { const n = SLC.after(x, v, x); assert.ok(Number.isInteger(n) && n >= 0 && n <= 3, String(x) + ' ' + v + ' -> ' + n); }));
  });
  await t('after: the learner tapped Slower and got it right = the next sentence stays at that speed (not one above); tapped Faster and right = one above that', () => {
    assert.strictEqual(SLC.after(1, 'ok', 2), 1, 'started Normal, slowed to Slow, right: stay Slow'); assert.strictEqual(SLC.after(0, 'ok', 3), 0);
    assert.strictEqual(SLC.after(2, 'ok', 1), 3, 'started Slow, raised to Normal, right: Fast next'); assert.strictEqual(SLC.after(1, 'no', 2), 0, 'slowed and still wrong: one more step down');
    assert.strictEqual(SLC.after(1, 'ok'), 2, 'no start given: same as an ordinary right answer');
  });
  await t('note: says faster / slower / the same in plain words', () => {
    assert.strictEqual(SLC.note(1, 2), 'Next sentence: one step faster.'); assert.strictEqual(SLC.note(2, 1), 'Next sentence: one step slower.'); assert.strictEqual(SLC.note(3, 3), 'Next sentence: the same speed.'); assert.strictEqual(SLC.note(0, 0), 'Next sentence: the same speed.');
  });
  await t('best: the fastest step where the learner was right more often than wrong; one lucky guess does not count; -1 with none; junk rows are ignored', () => {
    assert.strictEqual(SLC.best([{ v: 'ok', step: 1 }, { v: 'ok', step: 3 }, { v: 'ok', step: 3 }, { v: 'no', step: 3 }]), 3);
    assert.strictEqual(SLC.best([{ v: 'ok', step: 1 }, { v: 'ok', step: 3 }, { v: 'no', step: 3 }, { v: 'near', step: 3 }]), 1, 'a tie at the fast step is not comfortable');
    assert.strictEqual(SLC.best([{ v: 'ok', step: 1 }, { v: 'ok', step: 2 }, { v: 'no', step: 3 }]), 2);
    assert.strictEqual(SLC.best([{ v: 'ok', step: 3 }]), 3, 'a single right answer is enough when nothing went wrong at that speed');
    assert.strictEqual(SLC.best([{ v: 'ok', step: 1 }, { v: 'no', step: 2 }, { v: 'no', step: 2 }, { v: 'ok', step: 2 }]), 1);
    assert.strictEqual(SLC.best([{ v: 'near', step: 3 }, { v: 'near', step: 3 }, { v: 'ok', step: 2 }]), 2, 'almost counts for nothing and against nothing');
    assert.strictEqual(SLC.best([{ v: 'no', step: 0 }, { v: 'near', step: 1 }]), -1); assert.strictEqual(SLC.best([]), -1); assert.strictEqual(SLC.best(null), -1); assert.strictEqual(SLC.best([null, undefined, {}, { v: 'ok' }, { v: 'ok', step: 'x' }]), -1);
    assert.strictEqual(SLC.best([{ v: 'ok', step: 99 }]), 3, 'a bad step is clamped');
  });
  await t('say: plain words, no number of points', () => {
    assert.strictEqual(SLC.say(-1), 'No sentence was fully right this time. Slow speeds are a good place to practise.'); assert.strictEqual(SLC.say(3), 'You followed the fastest step. Great listening!'); assert.strictEqual(SLC.say(1), 'The fastest speed you followed.'); assert.strictEqual(SLC.say(NaN), SLC.say(-1));
    [-1, 0, 1, 2, 3].forEach(b => assert.ok(!/\d/.test(SLC.say(b)), 'a digit in: ' + SLC.say(b)));
  });
  await t('clean: only valid days with one of the four speeds; junk, arrays and odd keys are dropped; a JSON string works; the newest 60 days are kept', () => {
    assert.deepStrictEqual(J(SLC.clean(null)), {}); assert.deepStrictEqual(J(SLC.clean('{not json')), {}); assert.deepStrictEqual(J(SLC.clean([1, 2])), {}); assert.deepStrictEqual(J(SLC.clean(5)), {}); assert.deepStrictEqual(J(SLC.clean(undefined)), {});
    assert.deepStrictEqual(J(SLC.clean({ '2026-01-02': 1.2, '2026-01-03': 0.9, '2026-1-4': 1, abc: 1, '2026-01-05': 'x', '2026-01-06': '0.85', '2026-01-07': 1.205, '2026-01-08': NaN })), { '2026-01-02': 1.2, '2026-01-06': 0.85, '2026-01-07': 1.2 });
    assert.deepStrictEqual(J(SLC.clean('{"2026-02-01":1}')), { '2026-02-01': 1 });
    const o = JSON.parse('{"__proto__":1.2,"constructor":1,"2026-03-01":1}'); const c = SLC.clean(o); assert.deepStrictEqual(Object.keys(c), ['2026-03-01']); assert.strictEqual(({}).polluted, undefined);
    const big = {}; for (let i = 0; i < 90; i++) big[new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10)] = 1; const k = Object.keys(SLC.clean(big));
    assert.strictEqual(k.length, 60); assert.strictEqual(k[k.length - 1], '2026-03-31'); assert.strictEqual(k[0], '2026-01-31');
  });
  await t('put: keeps the fastest of the day, adds a new day, caps at 60, returns a new map, ignores a bad day or step', () => {
    const m0 = { '2026-05-01': 1 }, m1 = SLC.put(m0, '2026-05-02', 2); assert.deepStrictEqual(J(m1), { '2026-05-01': 1, '2026-05-02': 1 }); assert.deepStrictEqual(J(m0), { '2026-05-01': 1 }, 'the input is not changed');
    const m2 = SLC.put(m1, '2026-05-02', 3); assert.strictEqual(m2['2026-05-02'], 1.2); const m3 = SLC.put(m2, '2026-05-02', 1); assert.strictEqual(m3['2026-05-02'], 1.2, 'a slower result later the same day does not lower the best');
    assert.deepStrictEqual(J(SLC.put(m3, 'today', 2)), J(m3)); assert.deepStrictEqual(J(SLC.put(m3, '2026-05-09', NaN)), J(m3)); assert.deepStrictEqual(J(SLC.put(null, '2026-05-09', 0)), { '2026-05-09': 0.7 });
    let m = {}; for (let i = 0; i < 80; i++) m = SLC.put(m, new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10), i % 4); assert.strictEqual(Object.keys(m).length, 60);
    assert.ok(JSON.stringify(m).length < 1500, 'a small value: ' + JSON.stringify(m).length);
  });
  await t('startStep: the speed of the latest day; Slow when there is nothing or the store is damaged', () => {
    assert.strictEqual(SLC.startStep({}), 1); assert.strictEqual(SLC.startStep(null), 1); assert.strictEqual(SLC.startStep('{bad'), 1);
    assert.strictEqual(SLC.startStep({ '2026-05-01': 1.2, '2026-05-03': 0.85, '2026-05-02': 1 }), 1, 'the latest day, not the fastest'); assert.strictEqual(SLC.startStep({ '2026-05-01': 1.2 }), 3); assert.strictEqual(SLC.startStep({ '2026-05-01': 0.7 }), 0);
  });
  await t('target: 10 points below the Listen-and-type level, kept in 0..100; no level stays no level', () => {
    assert.strictEqual(SLC.target(null), null); assert.strictEqual(SLC.target(undefined), null); assert.strictEqual(SLC.target(NaN), null); assert.strictEqual(SLC.target(50), 40); assert.strictEqual(SLC.target(5), 0); assert.strictEqual(SLC.target(100), 90); assert.strictEqual(SLC.target(150), 100);
  });

  /* ---------------- Part 2 ---------------- */
  const rng = seed => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let x = Math.imul(seed ^ seed >>> 15, 1 | seed); x = x + Math.imul(x ^ x >>> 7, 61 | x) ^ x; return ((x ^ x >>> 14) >>> 0) / 4294967296; };
  const learner = (ceiling, seed) => { const r = rng(seed); return step => (step <= ceiling ? (r() < 0.93 ? 'ok' : r() < 0.6 ? 'near' : 'no') : (r() < 0.08 ? 'ok' : r() < 0.4 ? 'near' : 'no')); };
  const run = (ceiling, seed, sessions) => {
    const hear = learner(ceiling, seed); let map = {}, steps = [], bests = [];
    for (let s = 0; s < sessions; s++) {
      let sp = SLC.startStep(map); const res = [];
      for (let i = 0; i < 10; i++) { const v = hear(sp); res.push({ v, step: sp }); steps.push(sp); sp = SLC.after(sp, v, sp); }
      const b = SLC.best(res); bests.push(b); if (b >= 0) map = SLC.put(map, new Date(Date.UTC(2026, 0, 1 + s)).toISOString().slice(0, 10), b);
    }
    return { steps, bests };
  };
  await t('seeded noisy learners: the ladder settles at the learner\'s ceiling or one step above it, and the day\'s best is the ceiling', () => {
    [0, 1, 2, 3].forEach(c => [11, 22, 33].forEach(seed => {
      const r = run(c, seed, 40), late = r.steps.slice(100), near = late.filter(s => s === c || s === Math.min(3, c + 1)).length / late.length;
      assert.ok(near >= 0.8, 'ceiling ' + c + ' seed ' + seed + ': ' + Math.round(near * 100) + '% of the sentences were at the ceiling or one above');
      assert.ok(r.steps.every(s => s >= 0 && s <= 3));
      const lb = r.bests.slice(10), atC = lb.filter(b => b === c || b === Math.min(3, c + 1)).length / lb.length; assert.ok(atC >= 0.9, 'ceiling ' + c + ' seed ' + seed + ': best = ceiling (or one above) in ' + Math.round(atC * 100) + '% of sessions');
      assert.ok(lb.filter(b => b <= Math.min(3, c + 1)).length / lb.length >= 0.9, 'a lucky guess rarely lifts the best more than one step above the ceiling');
      assert.ok(lb.filter(b => b === c).length / lb.length >= 0.85, 'ceiling ' + c + ' seed ' + seed + ': the day\'s best is the real ceiling in most sessions');
    }));
  });
  await t('from Slow it takes three right answers to reach Fast; three wrong answers from Fast reach Very slow', () => {
    let s = SLC.FIRST; for (let i = 0; i < 2; i++) s = SLC.after(s, 'ok', s); assert.strictEqual(s, 3);
    s = 3; for (let i = 0; i < 3; i++) s = SLC.after(s, 'no', s); assert.strictEqual(s, 0);
  });
  await t('a poor learner (ceiling 0) does not get stuck at the bottom, a strong one (ceiling 3) reaches the top fast', () => {
    const w = run(0, 5, 30).steps.slice(60), top = run(3, 5, 30).steps.slice(20);
    assert.ok(w.filter(s => s <= 1).length / w.length >= 0.88, 'weak: stays at the bottom two steps'); assert.ok(top.filter(s => s === 3).length / top.length >= 0.8, 'strong: at the top');
  });

  /* ---------------- Part 3 ---------------- */
  await t('no emoji in the sheet, the code or the style; the icons are all in the sprite', () => {
    const css = rd('src/css/94ze-speed-ladder.css'), all = SHEET + SRC + css; assert.ok(!/\p{Extended_Pictographic}/u.test(all), 'an emoji: ' + (all.match(/\p{Extended_Pictographic}/u) || [''])[0]);
    const sp = rd('src/html/10-body-views.html'), used = Array.from(new Set((SHEET.match(/#(i-[a-z0-9-]+)/g) || []).map(x => x.slice(1)).concat((SRC.match(/#(i-[a-z0-9-]+)/g) || []).map(x => x.slice(1)))));
    assert.ok(used.length >= 4); used.forEach(i => assert.ok(sp.includes('id="' + i + '"'), i + ' is not in the sprite'));
  });
  await t('every id the code uses is in the sheet; ids are unique and all start with sl-; the sheet is the one the code opens', () => {
    const ids = (SHEET.match(/\bid="([^"]+)"/g) || []).map(x => x.slice(4, -1)), used = new Set((SRC.match(/\bq\('([a-z-]+)'\)/g) || []).map(x => x.slice(3, -2)).filter(x => x !== 'lt-variants'));
    assert.strictEqual(new Set(ids).size, ids.length, 'duplicate id'); ids.forEach(i => assert.ok(/^(sl-|sheet-sl$)/.test(i), i)); used.forEach(i => assert.ok(ids.includes(i), 'the code uses #' + i + ' which the sheet does not have'));
    assert.ok(/openSheet\('sheet-sl'\)/.test(SRC)); assert.ok(/class="sheet ced lt sl"/.test(SHEET) && /aria-labelledby="sl-title"/.test(SHEET) && /role="dialog"/.test(SHEET));
    ['sl-down', 'sl-up', 'sl-play', 'sl-x'].forEach(i => assert.ok(new RegExp('id="' + i + '"[^>]*aria-label="[^"]+"').test(SHEET), i + ' has a screen-reader name'));
    assert.ok(/id="sl-rate"[^>]*role="status"/.test(SHEET), 'the speed is announced when it changes');
  });
  await t('the saved speed is never written; one timer that stops with the clip; no network; the only storage is wt:ladder', () => {
    assert.ok(!/P\.speed\s*=[^=]/.test(SRC), 'P.speed is written'); assert.ok(!/setSpeed|defaultPlaybackRate|store\.set/.test(SRC.replace(/\/\*[\s\S]*?\*\//g, '')), 'a call that saves the speed');
    assert.ok(/audio\.playbackRate = P\.speed/.test(SRC), 'the saved speed is put back when a clip stops');
    assert.strictEqual((SRC.match(/setInterval\(/g) || []).length, 1); assert.ok(!/setTimeout/.test(SRC)); assert.ok(/function halt\(\) \{ clearInterval\(st\.watch\)/.test(SRC));
    assert.ok(!/fetch\(|XMLHttpRequest|sendBeacon|WebSocket|sessionStorage|indexedDB/.test(SRC)); const keys = (SRC.match(/localStorage\.(get|set|remove)Item\(([A-Za-z_']+)/g) || []); assert.ok(keys.length >= 2 && keys.every(x => /KEY$/.test(x)), 'only KEY: ' + keys.join(','));
    assert.ok(/const KEY = 'wt:ladder'/.test(SRC)); assert.ok(/MutationObserver\(\(\) => \{ if \(q\('sheet-sl'\)\.hidden\) finish\(\)/.test(SRC), 'closing the sheet any way ends the session and restores the audio');
    assert.ok(!/LVX\.record/.test(SRC), 'this mode does not write the level');
  });
  await t('build and docs: the files are in build.py in the right order; the header says how to remove it; MODULES.md has a row; the Learn tile is in the Listening group', () => {
    const b = rd('build.py'), at = s => b.indexOf(s); ['src/css/94ze-speed-ladder.css', 'src/html/28h-sheet-speed-ladder.html', 'src/js/169zb-speed-ladder.js'].forEach(f => assert.strictEqual(b.split(f).length - 1, 1, f));
    assert.ok(at('169zb-speed-ladder.js') > at('169k-listen-type.js') && at('169zb-speed-ladder.js') > at('169x-listen-level.js') && at('169zb-speed-ladder.js') < at('169w-learn-screen.js'), 'after the code it uses, before the Learn screen');
    assert.ok(at('94ze-speed-ladder.css') > at('94s-listen-type.css'), 'the style comes after the Listen and type style it builds on');
    assert.ok(/Remove this file, 94ze-speed-ladder\.css, 28h-sheet-speed-ladder\.html and their build\.py lines to go back/.test(SRC)); assert.ok(/id: 'speedladder'/.test(SRC));
    assert.ok(/\| `169zb-speed-ladder\.js` \|/.test(rd('MODULES.md')), 'a row in MODULES.md'); const ls = rd('src/js/169w-learn-screen.js'); assert.ok(/ids: \['echo', 'listentype'[^\]]*'speedladder'/.test(ls), 'the Listening group'); assert.ok(/\n\s+speedladder: I\(/.test(ls), 'its own icon');
  });
  await t('Bengali: every English line this mode shows is in bn.json', () => {
    const d = JSON.parse(rd('src/i18n/bn.json')).dict;
    ['Speed ladder', 'Hear it faster, step by step', 'Slower', 'Faster', 'Speed', 'Play one step slower', 'Play one step faster', 'Next sentence: one step faster.', 'Next sentence: one step slower.', 'Next sentence: the same speed.', 'The fastest speed you followed.', 'You followed the fastest step. Great listening!',
      'No sentence was fully right this time. Slow speeds are a good place to practise.', 'Keep practising', 'Perfect', 'Almost', 'To fix', 'Continue', 'Check', 'Your answers']
      .concat(SLC.NAMES, SLC.NAMES.map((n, i) => SLC.label(i)), SLC.NAMES.map(n => 'Fastest today: ' + n)).forEach(k => assert.ok(typeof d[k] === 'string' && d[k], 'missing: ' + k));
    assert.ok(/Speed ladder \(Task 8/.test(rd('BN-REVIEW.md')), 'listed for a native speaker');
  });

  /* ---------------- Part 4 ---------------- */
  let chromium; try { ({ chromium } = require('playwright')); } catch (e) { console.log('skip browser part: playwright is not installed'); }
  if (chromium) {
    const grab = (src, start, endRe) => { const i = src.indexOf(start); if (i < 0) throw new Error('missing ' + start); const m = src.slice(i).match(endRe); return src.slice(i, i + m.index + m[0].length); };
    const s150 = rd('src/js/150-player-reader.js'), s140 = rd('src/js/140-open-book.js');
    const real = [grab(s150, '  function sentTime(', /\n/), grab(s140, '  function shPlan()', /\n/), grab(s140, '  function shClip(', /\n  }\n/)].join('\n');
    const css = ['10-base-layout', '94-learn-ui', '20-home-library', '40-player-sheets-chips', '60-reading-search', '80-progress-v10', '94s-listen-type', '94ze-speed-ladder'].map(f => rd('src/css/' + f + '.css')).join('\n');
    const sp = rd('src/html/10-body-views.html'), spr = sp.slice(sp.indexOf('<svg width="0"'), sp.indexOf('</svg>', sp.indexOf('<svg width="0"')) + 6);
    const html = `<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><html data-theme="dark"><head><style>${css}
body{margin:0;background:var(--bg);color:var(--ink);font-family:var(--font-ui)} .sheet.ced{animation:none}</style></head><body><div id="backdrop" hidden></div>${spr}${SHEET}<script type="application/json" id="lt-variants">{"pairs":["colour|color","grey|gray"]}</script>
<script>
window.T = { seeks: [], quiet: [], toasts: [], plays: 0, rates: [], reg: null, ie: [] };
(() => {
  const $ = (s, r) => (r || document).querySelector(s);
  const FAST = 10, N = 31, STEP = 3;
  const P = { speed: 1.5, nudge: 0, calm: false }, S = { book: { id: 7, title: 'Dracula' }, sec: 0, durs: [N * STEP], quietJump: false, plan: [], model: null };
  S.plan[0] = { ids: Array.from({ length: N }, (_, i) => i), starts: Array.from({ length: N }, (_, i) => i * STEP) };
  const W1 = ['mountain', 'village', 'harbour', 'silver', 'garden', 'forest', 'window', 'castle'];
  S.model = { sents: Array.from({ length: N }, (_, i) => ({ t: 'The ' + W1[i % 8] + ' looked quiet and ancient under the morning sky on day ' + (i + 1) + '.', h: false })), chapters: [{ start: 0, end: N, title: 'Chapter 3' }] };
  window.S = S; window.P = P;
  const audio = { paused: true, ended: false, currentTime: 0, playbackRate: 1.5, _iv: 0,
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
  const IE = { log: k => { T.ie.push(k); } };
  ${real}
  const LV = new Function(${JSON.stringify(LVEsrc + '\nreturn { LVE, LVX };')})();
  const LNCf = new Function(${JSON.stringify(LNCsrc + '\nreturn LNC;')})();
  window.run = new Function('S','P','audio','Core','nowT','seekAudio','openSheet','closeSheets','toast','onPlayFail','goTrack','fmt','guideDoc','LearnHub','shPlan','shClip','h','LVX','LVE','LNC','IE',
    ${JSON.stringify(SRC + '\nreturn { SL, SLC };')});
  window.api = window.run(S, P, audio, Core, nowT, seekAudio, openSheet, closeSheets, toast, onPlayFail, goTrack, fmt, guideDoc, LearnHub, shPlan, shClip, h, LV.LVX, LV.LVE, LNCf, IE);
})();
</script></body></html>`;
    let browser; try { browser = await chromium.launch({ channel: 'chrome' }).catch(() => chromium.launch()); } catch (e) { console.error('speed_ladder_check: no browser: ' + e.message); process.exit(2); }
    const W1 = ['mountain', 'village', 'harbour', 'silver', 'garden', 'forest', 'window', 'castle'], sentOf = k => 'The ' + W1[k % 8] + ' looked quiet and ancient under the morning sky on day ' + (k + 1) + '.';
    const today = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
    const open = async seed => {
      const pg = await browser.newPage({ viewport: { width: 390, height: 780 } }), errs = [], reqs = [];
      pg.on('pageerror', e => errs.push(e.message)); pg.on('console', m => { if (m.type() === 'error') errs.push(m.text()); }); pg.on('request', r => reqs.push(r.url()));
      if (seed !== undefined) await pg.addInitScript(v => { try { if (v !== null) localStorage.setItem('wt:ladder', v); } catch (x) { /* ignore */ } }, seed === null ? null : typeof seed === 'string' ? seed : JSON.stringify(seed));
      await pg.route('http://localhost/**', r => (/favicon/.test(r.request().url()) ? r.fulfill({ status: 204 }) : r.fulfill({ status: 200, contentType: 'text/html', body: html })));
      await pg.goto('http://localhost/'); return { pg, errs, reqs };
    };
    const clipDone = pg => pg.waitForFunction(() => audio.paused && !document.getElementById('sl-play').classList.contains('is-playing'), null, { timeout: 5000 });
    const state = pg => pg.evaluate(() => ({ pos: document.getElementById('sl-pos').textContent, title: document.getElementById('sl-title').textContent, rate: document.getElementById('sl-rate').textContent, downDis: document.getElementById('sl-down').disabled, upDis: document.getElementById('sl-up').disabled, checkDis: document.getElementById('sl-check').disabled, checkHid: document.getElementById('sl-check').hidden, nextHid: document.getElementById('sl-next').hidden, fbHid: document.getElementById('sl-fb').hidden, fbT: document.getElementById('sl-fb-t').textContent, fbN: document.getElementById('sl-fb-n').textContent, fbNHid: document.getElementById('sl-fb-n').hidden, endHid: document.getElementById('sl-end').hidden, scH: document.getElementById('sl-sc-h').textContent, scS: document.getElementById('sl-sc-s').textContent, steps: Array.from(document.querySelectorAll('#sl-steps li')).map(x => x.textContent), val: document.getElementById('sl-in').value, ro: document.getElementById('sl-in').readOnly, status: document.getElementById('sl-status').textContent }));
    const clickId = (pg, id) => pg.evaluate(i => document.getElementById(i).click(), id);
    const type = (pg, v) => pg.fill('#sl-in', v);
    const reset = (pg, time, playing) => pg.evaluate(([tm, pl]) => { const a = window.audio; a.pause(); a.currentTime = tm; a.playbackRate = 1.5; if (pl) a.play(); T.seeks = []; T.quiet = []; T.rates = []; T.plays = 0; T.ie = []; }, [time, !!playing]);
    const stored = pg => pg.evaluate(() => { try { return JSON.parse(localStorage.getItem('wt:ladder')); } catch (x) { return 'bad'; } });
    const lastRate = pg => pg.evaluate(() => T.rates.slice(-1)[0]);
    const near = k => sentOf(k).replace('quiet', 'quiat');
    try {
      await t('the tile is registered: Speed ladder, the zap icon, a generic line; Calm mode keeps the generic line even with data', async () => {
        const { pg, errs } = await open({ [today()]: 1.2 });
        try {
          const r = await pg.evaluate(() => ({ id: T.reg.id, title: T.reg.title, icon: T.reg.icon, sub: T.reg.subtitle(), ps: T.reg.playerSubtitle({ time: 75 }), ps0: T.reg.playerSubtitle(null), order: T.reg.order, open: typeof T.reg.open }));
          assert.strictEqual(r.id, 'speedladder'); assert.strictEqual(r.title, 'Speed ladder'); assert.strictEqual(r.icon, '#i-m-zap'); assert.strictEqual(r.sub, 'Fastest today: Fast'); assert.strictEqual(r.ps, 'Starts at 1:15'); assert.strictEqual(r.ps0, 'Hear it faster, step by step'); assert.strictEqual(r.open, 'function'); assert.ok(r.order > 51);
          assert.strictEqual(await pg.evaluate(() => { P.calm = true; return T.reg.subtitle(); }), 'Hear it faster, step by step', 'Calm: no numbers, no speed');
          assert.deepStrictEqual(errs, []);
        } finally { await pg.close(); }
      });
      await t('with nothing stored the line is the generic one', async () => {
        const { pg } = await open(); try { assert.strictEqual(await pg.evaluate(() => T.reg.subtitle()), 'Hear it faster, step by step'); } finally { await pg.close(); }
      });
      await t('a full session: the clip plays at the step\'s speed and the saved speed comes back; the next speed follows the result; Slower works; end screen; the day\'s best is stored; the audio goes back', async () => {
        const { pg, errs, reqs } = await open();
        try {
          await reset(pg, 14 * 3 + 0.5, false);
          assert.strictEqual(await pg.evaluate(() => api.SL.start()), true); assert.strictEqual(await pg.evaluate(() => document.getElementById('sheet-sl').hidden), false);
          const plan = ['ok', 'ok', 'ok', 'no', 'near', 'slow-ok', 'ok', 'ok', 'no', 'ok'];
          let sp = SLC.FIRST; const model = [];
          for (let i = 0; i < 10; i++) {
            const k = 14 + i; await clipDone(pg);
            let s = await state(pg); const from = sp;
            assert.strictEqual(await lastRate(pg), SLC.rate(sp), 'sentence ' + i + ' played at ' + SLC.rate(sp)); assert.strictEqual(s.rate, SLC.label(sp)); assert.strictEqual(s.pos, 'Sentence ' + (i + 1) + ' of 10'); assert.strictEqual(s.title, 'Speed ladder');
            const a = await pg.evaluate(() => ({ ct: audio.currentTime, paused: audio.paused, rate: audio.playbackRate, sp: P.speed })); assert.ok(a.paused, 'the clip stopped by itself'); assert.ok(a.ct >= (k + 1) * 3 - 0.2 && a.ct < (k + 1) * 3 + 1, 'ends at the next sentence: ' + a.ct);
            assert.strictEqual(a.rate, 1.5, 'the saved speed is back after the clip'); assert.strictEqual(a.sp, 1.5, 'P.speed is untouched');
            assert.strictEqual(s.checkDis, true, 'Check waits for text'); assert.strictEqual(s.downDis, sp === 0); assert.strictEqual(s.upDis, sp === 3);
            const what = plan[i];
            if (what === 'slow-ok') { await clickId(pg, 'sl-down'); sp = SLC.down(sp); await clipDone(pg); assert.strictEqual(await lastRate(pg), SLC.rate(sp), 'Slower replays one step slower'); assert.strictEqual((await state(pg)).rate, SLC.label(sp)); }
            await type(pg, what === 'no' ? 'zzz zzz zzz' : what === 'near' ? near(k) : sentOf(k)); assert.strictEqual((await state(pg)).checkDis, false);
            await clickId(pg, 'sl-check'); s = await state(pg);
            const v = what === 'no' ? 'no' : what === 'near' ? 'near' : 'ok'; model.push({ v, step: sp });
            assert.strictEqual(s.fbHid, false); assert.strictEqual(s.nextHid, false); assert.strictEqual(s.checkHid, true); assert.strictEqual(s.ro, true); assert.strictEqual(s.downDis && s.upDis, true, 'the speed is locked once checked');
            assert.strictEqual(s.fbT, v === 'ok' ? 'Perfect. Every word is right.' : v === 'near' ? 'Almost. Check the spelling of the marked words.' : 'Not quite. Here is the sentence.');
            const nx = SLC.after(sp, v, from);
            if (i < 9) assert.strictEqual(s.fbN, SLC.note(sp, nx), 'the line under the answer: ' + s.fbN); else assert.strictEqual(s.fbNHid, true, 'no "next" line after the last sentence');
            sp = nx; await clickId(pg, 'sl-next');
          }
          const e = await state(pg), best = SLC.best(model);
          assert.strictEqual(e.endHid, false); assert.strictEqual(e.title, 'Your answers'); assert.strictEqual(e.scH, SLC.label(best)); assert.strictEqual(e.scS, SLC.say(best)); assert.strictEqual(e.steps.length, 10); assert.ok(e.steps[3].includes('To fix') && e.steps[4].includes('Almost') && e.steps[0].includes('Perfect'), e.steps.join('|'));
          assert.ok(!/\d\s*\/\s*\d|%/.test(e.scH + e.scS), 'no score'); assert.deepStrictEqual(await pg.evaluate(() => T.ie), ['l']);
          assert.strictEqual(await stored(pg), null, 'nothing is stored until the session is closed');
          await clickId(pg, 'sl-next');
          const c = await pg.evaluate(() => ({ hidden: document.getElementById('sheet-sl').hidden, ct: audio.currentTime, paused: audio.paused, rate: audio.playbackRate, sp: P.speed, on: api.SL.on }));
          assert.strictEqual(c.hidden, true); assert.strictEqual(c.on, false); assert.ok(Math.abs(c.ct - (14 * 3 + 0.5)) < 0.05, 'back at the same second: ' + c.ct); assert.strictEqual(c.paused, true); assert.strictEqual(c.rate, 1.5); assert.strictEqual(c.sp, 1.5);
          assert.deepStrictEqual(await stored(pg), { [today()]: SLC.rate(best) }, 'the fastest comfortable speed today'); assert.strictEqual(await pg.evaluate(() => api.SL.today()), best);
          const l = await pg.evaluate(() => api.SL.last()); assert.strictEqual(l.res.length, 10); assert.strictEqual(l.best, best);
          assert.deepStrictEqual(errs, []); assert.ok(reqs.every(u => /^http:\/\/localhost\/?$/.test(u)), 'no network: ' + reqs.join());
        } finally { await pg.close(); }
      });
      await t('the first sentence starts at the speed of the last day on this device; at Fast the Faster button is off; a Very slow start disables Slower', async () => {
        for (const [seed, step] of [[{ '2026-01-01': 0.7, '2026-02-01': 1.2 }, 3], [{ '2026-01-01': 1.2, '2026-02-01': 0.7 }, 0], [{ '2026-02-01': 1 }, 2]]) {
          const { pg } = await open(seed);
          try { await reset(pg, 14 * 3 + 0.5, false); await pg.evaluate(() => api.SL.start()); await clipDone(pg); const s = await state(pg); assert.strictEqual(await lastRate(pg), SLC.rate(step)); assert.strictEqual(s.rate, SLC.label(step)); assert.strictEqual(s.upDis, step === 3); assert.strictEqual(s.downDis, step === 0); await pg.evaluate(() => api.SL.close()); } finally { await pg.close(); }
        }
      });
      await t('Faster and Slower in the middle of a sentence: each replays at the new speed; at the edges the button is off; a right answer after Faster goes one above', async () => {
        const { pg } = await open({ '2026-02-01': 1 });   // starts at Normal (2)
        try {
          await reset(pg, 14 * 3 + 0.5, false); await pg.evaluate(() => api.SL.start()); await clipDone(pg);
          await clickId(pg, 'sl-up'); await clipDone(pg); let s = await state(pg); assert.strictEqual(await lastRate(pg), 1.2); assert.strictEqual(s.rate, 'Fast (1.2x)'); assert.strictEqual(s.upDis, true);
          await clickId(pg, 'sl-up'); assert.strictEqual(await lastRate(pg), 1.2, 'at the top nothing changes');
          await clickId(pg, 'sl-down'); await clipDone(pg); await clickId(pg, 'sl-down'); await clipDone(pg); await clickId(pg, 'sl-down'); await clipDone(pg); s = await state(pg); assert.strictEqual(s.rate, 'Very slow (0.7x)'); assert.strictEqual(s.downDis, true); assert.strictEqual(await lastRate(pg), 0.7);
          await clickId(pg, 'sl-up'); await clipDone(pg); await clickId(pg, 'sl-up'); await clipDone(pg); await clickId(pg, 'sl-up'); await clipDone(pg);   // 0.7 -> 0.85 -> 1 -> 1.2
          await type(pg, sentOf(14)); await clickId(pg, 'sl-check'); s = await state(pg); assert.strictEqual(s.fbN, 'Next sentence: the same speed.', 'right at the top stays at the top');
          assert.strictEqual(await pg.evaluate(() => P.speed), 1.5); await pg.evaluate(() => api.SL.close());
        } finally { await pg.close(); }
      });
      await t('closing in the middle: the sheet closes, the audio goes back to the same second and plays again if it was playing, the best so far is kept, the saved speed is untouched', async () => {
        const { pg, errs } = await open();
        try {
          await reset(pg, 20 * 3 + 0.5, true); await pg.evaluate(() => api.SL.start()); await clipDone(pg);
          await type(pg, sentOf(20)); await clickId(pg, 'sl-check'); await clickId(pg, 'sl-next'); await clipDone(pg); await clickId(pg, 'sl-x');
          const a = await pg.evaluate(() => ({ hidden: document.getElementById('sheet-sl').hidden, ct: audio.currentTime, paused: audio.paused, rate: audio.playbackRate, sp: P.speed, on: api.SL.on }));
          assert.strictEqual(a.hidden, true); assert.strictEqual(a.on, false); assert.strictEqual(a.paused, false, 'it was playing, so it plays again'); assert.ok(a.ct >= 20 * 3 + 0.5 && a.ct < 85, 'same second (and playing on): ' + a.ct); assert.strictEqual(a.rate, 1.5); assert.strictEqual(a.sp, 1.5);
          assert.deepStrictEqual(await stored(pg), { [today()]: 0.85 }, 'one right answer at Slow is kept'); assert.strictEqual((await pg.evaluate(() => api.SL.last())).res.length, 1);
          assert.deepStrictEqual(errs, []);
        } finally { await pg.close(); }
      });
      await t('closing by the sheet being hidden (back button, backdrop) ends the session in the same way', async () => {
        const { pg } = await open();
        try {
          await reset(pg, 20 * 3 + 0.5, false); await pg.evaluate(() => api.SL.start()); await clipDone(pg); await type(pg, sentOf(20)); await clickId(pg, 'sl-check');
          await pg.evaluate(() => { document.getElementById('sheet-sl').hidden = true; }); await pg.waitForFunction(() => !api.SL.on);
          const a = await pg.evaluate(() => ({ ct: audio.currentTime, paused: audio.paused, rate: audio.playbackRate })); assert.ok(Math.abs(a.ct - (20 * 3 + 0.5)) < 0.05, 'same second: ' + a.ct); assert.strictEqual(a.paused, true); assert.strictEqual(a.rate, 1.5); assert.deepStrictEqual(await stored(pg), { [today()]: 0.85 });
        } finally { await pg.close(); }
      });
      await t('no right answer = nothing stored; a wrong answer moves one step slower and the speed word says so; the end screen is gentle', async () => {
        const { pg } = await open({ '2026-02-01': 1.2 });
        try {
          await reset(pg, 14 * 3 + 0.5, false); await pg.evaluate(() => api.SL.start()); await clipDone(pg); await type(pg, 'zzz'); await clickId(pg, 'sl-check');
          assert.strictEqual((await state(pg)).fbN, 'Next sentence: one step slower.'); await clickId(pg, 'sl-next'); await clipDone(pg); assert.strictEqual(await lastRate(pg), 1); assert.strictEqual((await state(pg)).rate, 'Normal (1x)');
          await pg.evaluate(() => api.SL.close());
          assert.deepStrictEqual(await stored(pg), { '2026-02-01': 1.2 }, 'the old day is kept, nothing added'); assert.strictEqual(await pg.evaluate(() => api.SL.last().best), -1);
        } finally { await pg.close(); }
      });
      await t('a damaged store never stops a session: it starts at Slow, and is repaired by the next right answer', async () => {
        const { pg, errs } = await open('{not json');
        try {
          await reset(pg, 14 * 3 + 0.5, false); assert.strictEqual(await pg.evaluate(() => api.SL.start()), true); await clipDone(pg); assert.strictEqual(await lastRate(pg), 0.85);
          await type(pg, sentOf(14)); await clickId(pg, 'sl-check'); await pg.evaluate(() => api.SL.close()); assert.deepStrictEqual(await stored(pg), { [today()]: 0.85 }); assert.deepStrictEqual(errs, []);
        } finally { await pg.close(); }
      });
      await t('a store that cannot be read or written (private mode, full) does not break it', async () => {
        const { pg, errs } = await open();
        try {
          await pg.evaluate(() => { const bad = () => { throw new Error('blocked'); }; Storage.prototype.getItem = bad; Storage.prototype.setItem = bad; });
          await reset(pg, 14 * 3 + 0.5, false); assert.strictEqual(await pg.evaluate(() => api.SL.start()), true); await clipDone(pg); await type(pg, sentOf(14)); await clickId(pg, 'sl-check'); await clickId(pg, 'sl-next'); await pg.evaluate(() => api.SL.close());
          assert.strictEqual(await pg.evaluate(() => api.SL.on), false); assert.deepStrictEqual(errs, []);
        } finally { await pg.close(); }
      });
      await t('Enter checks; the Continue button after the last sentence closes; the audio that fails to start shows a plain line and Check still works', async () => {
        const { pg } = await open();
        try {
          await reset(pg, 14 * 3 + 0.5, false); await pg.evaluate(() => api.SL.start()); await clipDone(pg); await type(pg, sentOf(14)); await pg.press('#sl-in', 'Enter'); assert.strictEqual((await state(pg)).nextHid, false, 'Enter = Check');
          await clickId(pg, 'sl-next'); await pg.evaluate(() => { audio.play = function () { return Promise.reject(new Error('NotAllowed')); }; }); await clickId(pg, 'sl-play');
          await pg.waitForFunction(() => document.getElementById('sl-status').textContent.length > 0); assert.strictEqual((await state(pg)).status, 'The audio did not start. Tap the speaker to try again.');
          await type(pg, sentOf(15)); await clickId(pg, 'sl-check'); assert.strictEqual((await state(pg)).nextHid, false); await pg.evaluate(() => api.SL.close());
        } finally { await pg.close(); }
      });
    } finally { await browser.close(); }
  }
  console.log('\n' + (pass + fail) + ' checks, ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
