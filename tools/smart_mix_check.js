#!/usr/bin/env node
/* Automatic checks for Smart mix (src/js/sound/smart-mix.js). No browser, no npm install.
     node tools/smart_mix_check.js
   It runs the REAL smart-mix.js inside a small pretend app (stub player, stub audio nodes, in-memory storage), so it tests what ships.
   Covers: the plan (dead-zone, step cap, first move, limits, slider offset, "both", dip lift), a closed loop that settles without
   swinging, the dip setting keeping its effect, the speech-band measure (a pretend analyser with a real spectrum), the trim of each
   scene / clip, learning from other books, saving, the note limit, and letting go of analysers.
   Exit code 1 if a check fails; 2 if the file could not be loaded (a name it needs was renamed or moved).
   Add a check whenever you fix a bug in Smart mix. */
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const src = fs.readFileSync(path.join(__dirname, '..', 'src/js/sound/smart-mix.js'), 'utf8');

/* ---- the pretend app ---- */
const ls = {};
const localStorage = { get length() { return Object.keys(ls).length; }, key: i => Object.keys(ls)[i] || null, getItem: k => (k in ls ? ls[k] : null), setItem: (k, v) => { ls[k] = String(v); }, removeItem: k => { delete ls[k]; } };
const store = { get: (k, d) => { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; }, set: (k, v) => localStorage.setItem(k, JSON.stringify(v)) };
const P = { smartMix: true, musVol: 40, ambVol: 70 };
const S = { book: { id: 'b1' }, loadingAudio: false };
const nodes = [];
const mkNode = n => ({ n, gain: { value: 1 }, connect(a) { nodes.push(n + '->'); this.to = a; }, disconnect(a) { nodes.push(n + 'x'); } });
let ambL = {};
const env = {
  P, S, store, localStorage, console, Math, Object, Array, Float32Array, Uint8Array, Date, JSON, Number, String, performance: { now: () => 1e6 },
  sndOn: () => true, savePrefs() {}, $: () => null, $$: () => [], idleTimer() {}, setTimeout() {}, sndBalSync() {}, musVolPaint() {}, qkPaint() {},
  musBusApply() {}, ambMaster() {}, musVol: () => (P.musVol == null ? 40 : P.musVol) / 100, ambVol: () => (P.ambVol == null ? 70 : P.ambVol) / 100,
  window: { addEventListener() {} }, document: { hidden: false, addEventListener() {} }, audio: { addEventListener() {}, paused: false, seeking: false },
  MUS: { playing: null, on: false, live: false, duck: null }, AMB: { duck: null, on: false, built: false },
  AMB_SOUNDS: [['rain'], ['wind'], ['thunder'], ['fire']], ambLive: () => ambL, vgraph: null, enh: null,
};
const ctx = vm.createContext(env);
let T;
try { vm.runInContext(src + '\n;this.__T = { SMX, SMX_REL, SMX_NOM, SMX_BOTH, SMX_LIM, SMX_BAND, smxPlan, smxDb, smxTap, smxUntap, smxSrcStep, smxMean, smxSnap, smxLearn, smxGlobal, smxSave, smxIndexTouch, smxIndexInit, smxDuckDb, smxLift, smxSrcNew };', ctx); T = ctx.__T; } catch (e) { console.error('cannot load smart-mix.js:', e.message); process.exit(2); }

let pass = 0, fail = 0;
function check(name, fn) { try { fn(); pass++; console.log('ok    ' + name); } catch (e) { fail++; console.log('FAIL  ' + name + '\n        ' + String(e.message).split('\n')[0]); } }
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, (msg || '') + ' got ' + a + ', wanted ' + b + ' (+-' + tol + ')');
const { smxPlan, SMX_REL, SMX_LIM } = T;

/* ---- the plan ---- */
check('plan: inside the dead-zone nothing moves', () => {
  const target = -20 + SMX_REL.mus;                                            // voice -20 dB
  assert.strictEqual(smxPlan('mus', -20, target + 1.4, 0.4, 2, false, false, 0), 2);
  assert.strictEqual(smxPlan('mus', -20, target - 1.4, 0.4, 2, false, false, 0), 2);
});
check('plan: a step is at most 1.5 dB, and the first move at most 6 dB', () => {
  assert.strictEqual(smxPlan('mus', -20, -60, 0.4, 0, false, false, 0), 1.5);
  assert.strictEqual(smxPlan('mus', -20, -60, 0.4, 0, true, false, 0), 6);
  assert.strictEqual(smxPlan('mus', -20, 0, 0.4, 0, false, false, 0), -1.5);
});
check('plan: the trim stays within -15 .. +9 dB', () => {
  assert.strictEqual(smxPlan('mus', -20, -90, 0.4, 8.5, true, false, 0), 9);
  assert.strictEqual(smxPlan('mus', -20, 20, 0.4, -14.5, true, false, 0), -15);
});
check('plan: a slider at twice its usual position asks for 6 dB more', () => {
  const t1 = smxPlan('mus', -20, -38, 0.4, 0, true, false, 0), t2 = smxPlan('mus', -20, -38, 0.8, 0, true, false, 0);
  assert.ok(t2 > t1, 'louder slider -> higher trim');
  // target differs by 20*log10(2) = 6.02 dB: the error differs by that amount, so the (uncapped) moves differ by 0.4 * 6.02
  near(t2 - t1, 0.4 * 6.02, 0.05);
});
check('plan: with music and sounds together each sits lower; a dip lift raises the target', () => {
  const a = smxPlan('mus', -20, -38, 0.4, 0, true, false, 0), b = smxPlan('mus', -20, -38, 0.4, 0, true, true, 0), c = smxPlan('mus', -20, -38, 0.4, 0, true, false, 6);
  assert.ok(b < a, 'both -> lower'); assert.ok(c > a, 'lift -> higher');
});
check('plan: a closed loop settles near the target without swinging', () => {
  let t = 0, L = -45, last = [], flips = 0, prev = 0;
  for (let i = 0; i < 200; i++) { const nt = smxPlan('mus', -20, L, 0.4, t, i === 0, false, 0); const d = nt - t; if (d && prev && Math.sign(d) !== Math.sign(prev)) flips++; if (d) prev = d; L += d; t = nt; last.push(L); }
  near(L, -20 + SMX_REL.mus, SMX_LIM.dead + 0.1, 'settled level');
  assert.ok(flips === 0, 'no back-and-forth moves (' + flips + ')');
});

/* ---- the dip setting keeps its effect ---- */
check('dip: Quiet / Normal / Strong give the same trim and a different level under the voice', () => {
  const res = {};
  for (const [n, g] of [['subtle', 0.45], ['normal', 0.28], ['strong', 0.16]]) {
    let t = 0, speak = 0; const gd = 20 * Math.log10(g), lift = -20 * Math.log10(T.SMX_NOM.mus);
    for (let i = 0; i < 200; i++) { const post = -34 + t + gd; speak = post; t = smxPlan('mus', -20, post - gd, 0.4, t, false, false, lift); }
    res[n] = { t, speak: speak + 20 };
  }
  near(res.subtle.t, res.normal.t, 0.01); near(res.strong.t, res.normal.t, 0.01);
  near(res.subtle.speak - res.normal.speak, 20 * Math.log10(0.45 / 0.28), 0.1);
  near(res.strong.speak - res.normal.speak, 20 * Math.log10(0.16 / 0.28), 0.1);
});
check('dip: the lift and the removed dip follow the duck node, and are 0 with the duck off', () => {
  env.MUS.duck = mkNode('D'); env.MUS.duck.gain.value = 0.28; P.musDuck = true;
  near(T.smxDuckDb('mus'), 20 * Math.log10(0.28), 0.01); near(T.smxLift('mus'), 11.06, 0.05);
  P.musDuck = false; assert.strictEqual(T.smxDuckDb('mus'), 0); assert.strictEqual(T.smxLift('mus'), 0);
  delete P.musDuck; env.MUS.duck = null;
});

/* ---- the speech-band measure, with a pretend analyser that has a real spectrum ---- */
function fakeAnalyser(signal, n) {   // Blackman window + DFT, like the Web Audio spec, in dB (|X|/N)
  const sr = 48000, w = i => 0.42 - 0.5 * Math.cos(2 * Math.PI * i / n) + 0.08 * Math.cos(4 * Math.PI * i / n), x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = signal(i / sr) * w(i);
  return { fftSize: n, frequencyBinCount: n / 2, context: { sampleRate: sr }, getFloatFrequencyData(b) {
    for (let k = 0; k < n / 2; k++) { let re = 0, im = 0; for (let i = 0; i < n; i++) { const a = 2 * Math.PI * k * i / n; re += x[i] * Math.cos(a); im -= x[i] * Math.sin(a); } b[k] = 20 * Math.log10(Math.hypot(re, im) / n + 1e-12); }
  } };
}
const sine = (f, a) => t => a * Math.sin(2 * Math.PI * f * t);
check('measure: a sound inside the speech band reads as its own RMS', () => {
  near(T.smxDb(fakeAnalyser(sine(1000, 0.5), 2048), 'k1'), 20 * Math.log10(0.5 / Math.SQRT2), 0.3);
  near(T.smxDb(fakeAnalyser(sine(2000, 0.1), 2048), 'k2'), 20 * Math.log10(0.1 / Math.SQRT2), 0.3);
});
check('measure: bass and very high sounds are left out', () => {
  assert.ok(T.smxDb(fakeAnalyser(sine(100, 0.5), 2048), 'k3') < -60, 'bass');
  assert.ok(T.smxDb(fakeAnalyser(sine(9000, 0.5), 2048), 'k4') < -60, 'treble');
});
check('measure: without a spectrum it falls back to the whole-signal level', () => {
  const an = { fftSize: 256, getFloatTimeDomainData(b) { for (let i = 0; i < b.length; i++) b[i] = 0.5 * Math.sin(2 * Math.PI * 100 * i / 48000 * 8); } };
  near(T.smxDb(an, 'k5'), 20 * Math.log10(0.5 / Math.SQRT2), 0.5);
});

/* ---- each scene and clip has its own trim ---- */
function freshBook() { T.SMX.src = { mus: T.smxSrcNew(), amb: T.smxSrcNew() }; T.SMX.t = { mus: 0, amb: 0 }; T.SMX.fresh = { mus: true, amb: true }; T.SMX.r = { v: [], mus: [], amb: [] }; }
check('scene: the first source keeps the book trim; a new scene is re-read quickly', () => {
  freshBook(); ambL = { rain: 0.8, wind: 0.4, thunder: 0.3, fire: 0.05 };
  assert.strictEqual(T.smxSrcStep('amb'), false); assert.strictEqual(T.SMX.src.amb.key, 'rain+thunder+wind');
  T.SMX.src.amb.n = 5; T.SMX.t.amb = 6; ambL = { fire: 0.9, wind: 0.2, rain: 0, thunder: 0 };
  assert.strictEqual(T.smxSrcStep('amb'), false);
  assert.strictEqual(T.SMX.fresh.amb, true); assert.strictEqual(T.SMX.src.amb.need, 8);
});
check('scene: a scene that comes back gets its trim at once; a level change alone is not a new scene', () => {
  T.SMX.src.amb.n = 4; T.SMX.t.amb = -3; ambL = { rain: 0.8, wind: 0.4, thunder: 0.3, fire: 0.05 };
  assert.strictEqual(T.smxSrcStep('amb'), true); assert.strictEqual(T.SMX.t.amb, 6);
  ambL = { rain: 0.5, wind: 0.25, thunder: 0.18, fire: 0.03 };
  assert.strictEqual(T.smxSrcStep('amb'), false);
});
check('scene: a source left after fewer than 3 decisions is not remembered; at most 12 are kept', () => {
  freshBook(); ambL = { fire: 0.9 }; T.smxSrcStep('amb'); T.SMX.src.amb.n = 1; T.SMX.t.amb = 4; ambL = { rain: 0.9 }; T.smxSrcStep('amb');
  assert.deepStrictEqual(Object.keys(T.SMX.src.amb.mem), []);
  for (let i = 0; i < 20; i++) { env.MUS.playing = { _file: 'c' + i + '.mp3' }; T.SMX.src.mus.n = 5; T.SMX.t.mus = i; T.smxSrcStep('mus'); }
  assert.strictEqual(Object.keys(T.SMX.src.mus.mem).length, 12); env.MUS.playing = null;
});

/* ---- learning and saving ---- */
check('learn: a book counts once, a quiet bus teaches nothing, the average stays within +-6 dB', () => {
  for (const k of Object.keys(ls)) delete ls[k];
  freshBook(); T.SMX.book = 'a'; T.SMX.learned = false; T.SMX.dec = { mus: 9, amb: 2 }; T.SMX.t = { mus: -4, amb: 5 };
  T.smxLearn(); T.smxLearn();
  assert.deepStrictEqual(JSON.parse(ls['wt:smx:global']), { m: -4, a: 0, n: 1 });
  T.SMX.book = 'b'; T.SMX.learned = false; T.SMX.dec = { mus: 9, amb: 9 }; T.SMX.t = { mus: -15, amb: 9 }; T.smxLearn();
  const g = JSON.parse(ls['wt:smx:global']); assert.ok(g.m >= -6 && g.a <= 6 && g.n === 2, JSON.stringify(g));
});
check('save: only when something changed, under the book the trims belong to', () => {
  for (const k of Object.keys(ls)) delete ls[k];
  freshBook(); T.SMX.book = 'old'; S.book = { id: 'next' }; T.SMX.dirty = false; T.smxSave(); assert.ok(!('wt:smx:old' in ls));
  T.SMX.dirty = true; T.SMX.t = { mus: 1.26, amb: -2.34 }; T.smxSave(); const n = JSON.parse(ls['wt:smx:old']);
  assert.ok(n && typeof n.m === 'number' && n.s && typeof n.s.mus === 'object'); assert.ok(!('wt:smx:next' in ls)); assert.strictEqual(T.SMX.dirty, false);
});
check('notes: only the last 150 books keep a note; other keys are left alone', () => {
  for (const k of Object.keys(ls)) delete ls[k];
  for (let i = 0; i < 5; i++) ls['wt:smx:old' + i] = '{}'; ls['wt:smx:global'] = '{}'; ls['wt:prefs'] = '{}';
  T.smxIndexInit(); assert.strictEqual(JSON.parse(ls['wt:smxidx']).length, 5);
  for (let i = 0; i < 160; i++) { ls['wt:smx:b' + i] = '{}'; T.smxIndexTouch('b' + i); }
  const idx = JSON.parse(ls['wt:smxidx']); assert.strictEqual(idx.length, 150); assert.ok(!('wt:smx:b0' in ls) && 'wt:smx:b159' in ls);
  assert.ok('wt:smx:global' in ls && 'wt:prefs' in ls);
  T.smxIndexTouch('b20'); assert.strictEqual(JSON.parse(ls['wt:smxidx']).slice(-1)[0], 'b20');
});

/* ---- analysers ---- */
check('taps: one connection per node, a rebuilt bus lets go of the old one, switching off clears', () => {
  nodes.length = 0; const ac = { createAnalyser: () => ({ fftSize: 0, smoothingTimeConstant: 0 }) }, a = mkNode('A'), b = mkNode('B');
  T.smxUntap('mus'); T.smxTap('mus', ac, a); T.smxTap('mus', ac, a); T.smxTap('mus', ac, b); T.smxUntap('mus');
  assert.deepStrictEqual(nodes, ['A->', 'Ax', 'B->', 'Bx']); assert.strictEqual(T.SMX.tap.mus, null);
});

console.log('\n' + (fail ? fail + ' FAILED, ' : 'all ') + pass + ' passed');
process.exit(fail ? 1 : 0);
