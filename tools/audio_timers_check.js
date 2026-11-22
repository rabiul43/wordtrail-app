/* Silence skipping and loudness evener timers (Task 9, src/js/260-audio-effects.js): real code, fake clock and analyser.
   Run: node tools/audio_timers_check.js */
const fs = require('fs'), vm = require('vm'), assert = require('assert');
const src = fs.readFileSync(__dirname + '/../src/js/260-audio-effects.js', 'utf8');
const a = src.indexOf('const SIL_MS'), b = src.indexOf('function levSet(');
assert.ok(a > 0 && b > a, 'cannot find the timer code in 260');
let pass = 0, fail = 0;
const check = (n, f) => { try { f(); pass++; console.log('ok    ' + n); } catch (e) { fail++; console.log('FAIL  ' + n + '\n        ' + e.message); } };

function make(opts) {
  let clock = 1000, amp = 0.5; const ivs = [], saved = {};
  const audio = { paused: false, seeking: false, playbackRate: 1 };
  const gainSets = [];
  const ctx = {
    performance: { now: () => clock }, Date: { now: () => clock }, Math, Uint8Array, Float32Array, Number, Object, console,
    setInterval: (fn, ms) => { ivs.push({ fn, ms, on: true }); return ivs.length; }, clearInterval: id => { if (id && ivs[id - 1]) ivs[id - 1].on = false; },
    audio, P: Object.assign({ speed: 1, silence: false, level: false, enh: 'off' }, opts), S: { book: { id: 7 }, sec: 0, loadingAudio: false },
    vgraph: { fftSize: 64, getByteTimeDomainData(buf) { for (let i = 0; i < buf.length; i++) buf[i] = 128 + Math.round(amp * 127 * (i % 2 ? 1 : -1)); } },
    enh: { gain: { gain: { setTargetAtTime() {} } }, lev: { gain: { cancelScheduledValues() {}, setValueAtTime(v) { gainSets.push(v); }, setTargetAtTime(v) { gainSets.push(v); } } } },
    guideDoc() {}, vctx: { currentTime: 0 }, store: { get: (k, d) => saved[k] === undefined ? d : saved[k], set: (k, v) => { saved[k] = v; } }
  };
  vm.createContext(ctx);
  vm.runInContext(src.slice(a, b) + '\nthis.T = { silSync, levSync, silTick, levTick, LEV, SIL_MS, get silOn() { return silOn; }, get levMs() { return levMs; }, get levRing() { return levRing; } };', ctx);
  return { ctx, ivs, audio, T: ctx.T, setAmp: v => { amp = v; }, advance: ms => { clock += ms; }, gainSets, saved,
    run(n, step) { for (let i = 0; i < n; i++) { clock += step; ivs.filter(x => x.on).forEach(x => x.fn()); } } };
}

check('the timers are slower than before and only run while playing with the feature on', () => {
  const m = make({ silence: true, level: true }); m.T.silSync(); m.T.levSync();
  assert.deepStrictEqual(m.ivs.map(x => x.ms), [120, 250]);
  m.audio.paused = true; m.T.silSync(); m.T.levSync(); assert.ok(m.ivs.every(x => !x.on));
  const off = make({}); off.T.silSync(); off.T.levSync(); assert.strictEqual(off.ivs.length, 0);
});
check('silence skipping: 220 ms of quiet speeds up, sound brings the speed back (real elapsed time)', () => {
  const m = make({ silence: true }); m.T.silSync(); m.setAmp(0.01);
  m.run(1, 120); assert.strictEqual(m.T.silOn, false);   // 120 ms of quiet: not yet
  m.run(1, 120); assert.strictEqual(m.T.silOn, true); assert.ok(m.audio.playbackRate >= 2.5);
  m.setAmp(0.5); m.run(1, 120); assert.strictEqual(m.T.silOn, false); assert.strictEqual(m.audio.playbackRate, 1);
});
check('silence skipping uses real time: a late tick (a busy phone) counts the real gap, capped at 400 ms', () => {
  const m = make({ silence: true }); m.T.silSync(); m.setAmp(0.01); m.run(1, 5000);   // one tick 5 s after the start
  assert.strictEqual(m.T.silOn, true);
});
check('loudness evener: starts measuring after about 2 s, levMs follows real time, the ring holds about 5 s', () => {
  const m = make({ level: true }); m.T.levSync(); m.setAmp(0.2);
  m.run(7, 250); assert.strictEqual(m.ctx.audio.playbackRate, 1); assert.ok(m.T.levRing.length === 7);
  const before = m.gainSets.length; m.run(1, 250); assert.ok(m.gainSets.length > before, 'gain is trimmed from the 8th frame');
  m.run(40, 250); assert.strictEqual(m.T.levRing.length, m.T.LEV.ring);
  assert.ok(Math.abs(m.T.levMs - 48 * 250) < 300, 'levMs = ' + m.T.levMs);
});
check('loudness evener: the learned level is saved after 20 s and not more than once per 15 s', () => {
  const m = make({ level: true }); m.T.levSync(); m.setAmp(0.2);
  m.run(79, 250); assert.ok(!('wt:lev:7' in m.saved)); m.run(2, 250); assert.ok('wt:lev:7' in m.saved);
  const first = JSON.stringify(m.saved['wt:lev:7']); m.saved['wt:lev:7'] = { marker: 1 }; m.run(20, 250); assert.deepStrictEqual(m.saved['wt:lev:7'], { marker: 1 });
});
check('a pause stops both timers; no measuring while paused or seeking', () => {
  const m = make({ level: true, silence: true }); m.T.silSync(); m.T.levSync(); m.audio.paused = true; m.T.silSync(); m.T.levSync();
  assert.ok(m.ivs.every(x => !x.on)); m.audio.paused = false; m.audio.seeking = true; m.T.levSync(); const n = m.T.levRing.length; m.run(3, 250); assert.strictEqual(m.T.levRing.length, n);
});
console.log('\n' + (fail ? fail + ' FAILED, ' : 'all ') + pass + ' passed'); process.exit(fail ? 1 : 0);
