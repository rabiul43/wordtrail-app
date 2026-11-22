#!/usr/bin/env node
/* Sound that goes silent and comes back (CHANGES-audio-wakeup.md): real code from src/js/sound/, fake clock, fake audio element, fake AudioContext.
     node tools/audio_heal_check.js
   Part 1 is the pure rules: the grace period for short buffering dips (sndHeardCalc) and the "sound is wanted" rule of the wake-up (ctxWantedFor).
   Part 2 runs the shipped functions against fakes: the grace and its real stop paths, ctxHeal (when it resumes, the one tap listener, no loop),
   the suspend timers (music's timer can now be cancelled) and the single statechange listener.
   Exit code 1 if a check fails. It cannot tell what a real phone does with the screen off: see the manual test in the CHANGES note. */
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const rd = f => fs.readFileSync(path.join(__dirname, '..', 'src/js/sound', f), 'utf8');
let pass = 0, fail = 0;
const queue = [];   // checks run one after the other (some wait for promises)
const check = (n, f) => { queue.push([n, f]); };

/* Cut one top-level (2-space indent) declaration out of a file: from its first line to the next top-level declaration or comment. */
function grab(src, re) {
  const m = re.exec(src); if (!m) throw new Error('not found: ' + re);
  const start = src.lastIndexOf('\n', m.index) + 1, rest = src.slice(start), nl = rest.indexOf('\n');
  const stop = /\n {2}(?:function |const |async function |\/\*)/.exec(rest.slice(nl));
  return stop ? rest.slice(0, nl + stop.index) : rest;
}
const fn = (src, name) => grab(src, new RegExp('^ {2}(?:async )?function ' + name + '\\(', 'm'));
const cn = (src, name) => grab(src, new RegExp('^ {2}const ' + name + ' =', 'm'));

const eng = rd('ambient-engine.js'), bus = rd('music-bus.js'), scr = rd('sound-screen.js'), wir = rd('music-wiring.js');
const CODE = [
  cn(eng, 'CTXH'), cn(eng, 'AUD_SUSP'), fn(eng, 'audioCtx'), fn(eng, 'audioSuspendCancel'), fn(eng, 'audioSuspendSoon'),
  cn(bus, 'SND_HOLD_MS'), cn(bus, 'SNDHOLD'), fn(bus, 'sndHeardCalc'), fn(bus, 'sndHeard'), fn(bus, 'sndHeardReset'), cn(bus, 'musicActive'), cn(bus, 'musNarrating'),
  fn(scr, 'ambPlaying'), fn(scr, 'ctxWantedFor'), fn(scr, 'sndCtxState'), fn(scr, 'ctxGestureArm'), fn(scr, 'ctxHeal'), fn(scr, 'ctxHealInit'),
  fn(wir, 'musWanted'), fn(wir, 'musCtxHeal')
].join('\n');

/* ---------- the fakes ---------- */
function target() {   // a tiny EventTarget that counts its listeners
  const L = {};
  return {
    addEventListener(t, f) { (L[t] = L[t] || []).push(f); },
    removeEventListener(t, f) { L[t] = (L[t] || []).filter(x => x !== f); },
    dispatchEvent(e) { (L[e.type] || []).slice().forEach(f => f(e)); return true; },
    count(t) { return (L[t] || []).length; }
  };
}
function make(o) {
  o = o || {};
  let clock = 0, id = 0; const timers = [];
  const setTimeout_ = (f, ms) => { timers.push({ id: ++id, f, at: clock + (ms || 0) }); return id; };
  const clearTimeout_ = i => { const k = timers.findIndex(t => t.id === i); if (k >= 0) timers.splice(k, 1); };
  const advance = ms => {   // run the timers that fall due, in order
    const end = clock + ms;
    for (;;) {
      const due = timers.filter(t => t.at <= end).sort((a, b) => a.at - b.at)[0]; if (!due) break;
      timers.splice(timers.indexOf(due), 1); clock = due.at; due.f();
    }
    clock = end;
  };
  const audio = Object.assign(target(), { paused: false, ended: false, error: null, seeking: false, readyState: 4 });
  const document = Object.assign(target(), { hidden: false });
  const window = target();
  const log = { resume: 0, suspend: 0, ctxMade: 0, statechangeListeners: 0, onstatechangeSet: false };
  let acceptResume = true;
  class FakeCtx {
    constructor() { this.state = 'suspended'; this._t = target(); log.ctxMade++; }
    addEventListener(t, f) { if (t === 'statechange') log.statechangeListeners++; this._t.addEventListener(t, f); }
    set onstatechange(v) { log.onstatechangeSet = true; }
    resume() { log.resume++; if (!acceptResume) return Promise.reject(new Error('needs a tap')); this.state = 'running'; this._t.dispatchEvent({ type: 'statechange' }); return Promise.resolve(); }
    suspend() { log.suspend++; this.state = 'suspended'; this._t.dispatchEvent({ type: 'statechange' }); return Promise.resolve(); }
    flip(s) { this.state = s; this._t.dispatchEvent({ type: 'statechange' }); }   // the OS takes the context away
  }
  const ctx = vm.createContext({
    P: Object.assign({ sndOn: true, ambOn: true, ambAuto: true, ambCues: true, musOn: false }, o.P), S: { book: { id: 1 }, loadingAudio: false },
    SND: { focus: 0 }, AMB: { on: false, ctx: null, narr: null }, MUS: { on: false, live: false, playing: null, ctx: null },
    AMB_SOUNDS: [['rain'], ['wind']], ambLive: () => ({ rain: 0, wind: 0 }), sndOn() { return this.P.sndOn !== false; },
    audio, document, window, performance: { now: () => clock + 1000 }, setTimeout: setTimeout_, clearTimeout: clearTimeout_,
    Event: class { constructor(t) { this.type = t; } }, Promise, console, Math, ctxHook: { get: null }
  });
  ctx.sndOn = () => ctx.P.sndOn !== false;
  ctx.window.AudioContext = FakeCtx;
  vm.runInContext(CODE + '\nthis.T = { SNDHOLD, CTXH, AUD_SUSP, sndHeardCalc, sndHeard, sndHeardReset, ambPlaying, musNarrating, ctxWantedFor, sndCtxState, ctxHeal, ctxHealInit, musCtxHeal, musWanted, audioCtx, audioSuspendSoon, audioSuspendCancel, ctxGestureArm };', ctx);
  return { ctx, T: ctx.T, audio, document, window, log, advance, now: () => clock + 1000, accept: v => { acceptResume = v; },
    makeCtx(state) { const c = ctx.T.audioCtx(); c.state = state || 'suspended'; return c; },
    async settle() { for (let i = 0; i < 5; i++) await Promise.resolve(); } };
}
/* the window fake: audioCtx reads window.AudioContext, so the code's `window` must be the object that holds it */
const mk = make;

/* ---------- Part 1: the pure rules ---------- */
check('grace: data there (readyState 3 or more) is heard, and stamps the time', () => {
  const m = mk(); assert.deepStrictEqual(JSON.parse(JSON.stringify(m.T.sndHeardCalc(4, false, 0, 5000, 2000))), { ok: true, at: 5000 });
  assert.strictEqual(m.T.sndHeardCalc(3, false, 100, 5000, 2000).ok, true);
});
check('grace: a dip under 2 s after a good reading still counts as heard; the stamp is kept', () => {
  const m = mk(); const r = m.T.sndHeardCalc(1, false, 5000, 6500, 2000); assert.strictEqual(r.ok, true); assert.strictEqual(r.at, 5000);
  assert.strictEqual(m.T.sndHeardCalc(2, false, 5000, 6999, 2000).ok, true);
});
check('grace: at 2 s and beyond it is not heard', () => {
  const m = mk(); assert.strictEqual(m.T.sndHeardCalc(1, false, 5000, 7000, 2000).ok, false); assert.strictEqual(m.T.sndHeardCalc(0, false, 5000, 9000, 2000).ok, false);
});
check('grace: never held without a good reading first (stamp 0), nor when the clock went backwards', () => {
  const m = mk(); assert.strictEqual(m.T.sndHeardCalc(1, false, 0, 100, 2000).ok, false); assert.strictEqual(m.T.sndHeardCalc(1, false, 5000, 4000, 2000).ok, false);
});
check('grace: a recording that is loading is never held, however fresh the stamp', () => {
  const m = mk(); assert.strictEqual(m.T.sndHeardCalc(4, true, 5000, 5001, 2000).ok, false); assert.strictEqual(m.T.sndHeardCalc(1, true, 5000, 5001, 2000).ok, false);
});
check('wanted rule: Sound on + narrator heard + one of ambient / music / narrator graph', () => {
  const m = mk(), w = s => m.T.ctxWantedFor(s), base = { sound: true, playing: true, amb: false, mus: false, narr: false };
  assert.strictEqual(w(Object.assign({}, base, { amb: true })), true); assert.strictEqual(w(Object.assign({}, base, { mus: true })), true); assert.strictEqual(w(Object.assign({}, base, { narr: true })), true);
});
check('wanted rule: not wanted with Sound off, with the narrator not heard, or with nothing that needs the engine', () => {
  const m = mk(), w = s => m.T.ctxWantedFor(s), all = { sound: true, playing: true, amb: true, mus: true, narr: true };
  assert.strictEqual(w(all), true);
  assert.strictEqual(w(Object.assign({}, all, { sound: false })), false); assert.strictEqual(w(Object.assign({}, all, { playing: false })), false);
  assert.strictEqual(w({ sound: true, playing: true, amb: false, mus: false, narr: false }), false); assert.strictEqual(w(null), false); assert.strictEqual(w({}), false);
});

/* ---------- Part 2: the shipped code against fakes ---------- */
check('dip under 2 s: ambPlaying and musNarrating stay true; a re-check is armed; the data coming back clears it', () => {
  const m = mk(); m.T.sndHeard(); m.advance(300); m.audio.readyState = 1;
  assert.strictEqual(m.T.ambPlaying(), true); assert.strictEqual(m.T.musNarrating(), true);
  m.advance(1200); assert.strictEqual(m.T.ambPlaying(), true);
  m.audio.readyState = 4; assert.strictEqual(m.T.ambPlaying(), true); assert.strictEqual(m.T.SNDHOLD.t, 0, 'the re-check timer is cleared');
});
check('dip over 2 s: not heard any more, and the re-check fires a wt-sndhold event so the sound really stops', () => {
  const m = mk(); let ev = 0; m.audio.addEventListener('wt-sndhold', () => ev++);
  m.T.sndHeard(); m.advance(100); m.audio.readyState = 1; assert.strictEqual(m.T.ambPlaying(), true);
  m.advance(2300); assert.strictEqual(ev, 1, 'one re-check event'); assert.strictEqual(m.T.ambPlaying(), false); assert.strictEqual(m.T.musNarrating(), false);
});
check('real stops are not held: pause, ended, error, loading a recording, focus mode', () => {
  const m = mk(); m.T.sndHeard(); m.audio.readyState = 1;
  m.audio.paused = true; assert.strictEqual(m.T.ambPlaying(), false); assert.strictEqual(m.T.musNarrating(), false); m.audio.paused = false;
  m.audio.ended = true; assert.strictEqual(m.T.ambPlaying(), false); m.audio.ended = false;
  m.audio.error = {}; assert.strictEqual(m.T.musNarrating(), false); m.audio.error = null;
  m.ctx.S.loadingAudio = true; assert.strictEqual(m.T.ambPlaying(), false); assert.strictEqual(m.T.musNarrating(), false); m.ctx.S.loadingAudio = false;
  m.ctx.SND.focus = 1; assert.strictEqual(m.T.ambPlaying(), false); assert.strictEqual(m.T.musNarrating(), false); m.ctx.SND.focus = 0;
  assert.strictEqual(m.T.ambPlaying(), true, 'and back to held once they end, inside the grace');
});
check('a new track (loadstart / emptied / pause reset) leaves no grace behind', () => {
  const m = mk(); m.T.sndHeard(); m.T.sndHeardReset(); m.audio.readyState = 0;
  assert.strictEqual(m.T.ambPlaying(), false); assert.strictEqual(m.T.musNarrating(), false); assert.strictEqual(m.T.SNDHOLD.t, 0);
});
check('a long pause then play: the old stamp is long past, so a slow start is not held', () => {
  const m = mk(); m.T.sndHeard(); m.advance(600000); m.audio.readyState = 1;
  assert.strictEqual(m.T.ambPlaying(), false);
});
check('a seek keeps the old rule: ambient follows AMB.on, music follows MUS.live / MUS.playing', () => {
  const m = mk(); m.audio.seeking = true; assert.strictEqual(m.T.ambPlaying(), false); assert.strictEqual(m.T.musNarrating(), false);
  m.ctx.AMB.on = true; m.ctx.MUS.live = true; assert.strictEqual(m.T.ambPlaying(), true); assert.strictEqual(m.T.musNarrating(), true);
});

check('statechange: audioCtx adds ONE addEventListener listener, never onstatechange, and the context calls CTXH.fn', () => {
  const m = mk(); const c = m.makeCtx('running'); m.ctx.AMB.ctx = c;
  assert.strictEqual(m.log.statechangeListeners, 1); assert.strictEqual(m.log.onstatechangeSet, false); assert.strictEqual(m.T.audioCtx(), c, 'the second call makes no new context');
  assert.strictEqual(m.log.ctxMade, 1); assert.strictEqual(m.log.statechangeListeners, 1);
  let n = 0; m.T.CTXH.fn = () => n++; c.flip('suspended'); assert.strictEqual(n, 1);
});
check('source: the sound code adds exactly ONE statechange listener (addEventListener, in audioCtx), never onstatechange', () => {
  const dir = path.join(__dirname, '..', 'src/js/sound'); let add = 0, on = 0;
  fs.readdirSync(dir).filter(f => /\.js$/.test(f)).forEach(f => { const t = fs.readFileSync(path.join(dir, f), 'utf8'); add += (t.match(/addEventListener\('statechange'/g) || []).length; on += (t.match(/onstatechange\s*=/g) || []).length; });
  assert.strictEqual(add, 1); assert.strictEqual(on, 0);
  assert.ok(/addEventListener\('statechange'/.test(rd('ambient-engine.js')), 'and it is in ambient-engine.js');
});

/* the heal tests build the context through audioCtx so the one listener is really in place */
function healWorld(o) {
  const m = mk(o); const c = m.T.audioCtx(); m.ctx.AMB.ctx = c; m.ctx.MUS.ctx = c; m.T.ctxHealInit(); c.state = 'running'; m.audio.readyState = 4; m.T.sndHeard();
  return Object.assign(m, { c });
}
check('heal: ambient only (music off): the OS suspends the context while the book plays, the heal resumes it at once', () => {
  const m = healWorld(); m.log.resume = 0; m.c.flip('suspended');
  assert.strictEqual(m.log.resume, 1); assert.strictEqual(m.c.state, 'running');
});
check('heal: also on the page being shown again, pageshow and the narrator reporting "playing"', () => {
  const m = healWorld(); m.log.resume = 0;
  m.c.state = 'suspended'; m.document.dispatchEvent({ type: 'visibilitychange' }); assert.strictEqual(m.log.resume, 1);
  m.advance(1000); m.c.state = 'suspended'; m.window.dispatchEvent({ type: 'pageshow' }); assert.strictEqual(m.log.resume, 2);
  m.advance(1000); m.c.state = 'interrupted'; m.audio.dispatchEvent({ type: 'playing' }); assert.strictEqual(m.log.resume, 3, "Safari's 'interrupted' is healed too");
  m.advance(1000); m.c.state = 'suspended'; m.document.hidden = true; m.document.dispatchEvent({ type: 'visibilitychange' }); assert.strictEqual(m.log.resume, 3, 'a hidden page is not woken by visibilitychange');
});
check('heal: not while the narrator is paused, ended, failed, in focus mode, or loading a recording', () => {
  const m = healWorld(); m.log.resume = 0; m.c.state = 'suspended';
  m.audio.paused = true; m.T.ctxHeal(); m.audio.paused = false; m.audio.ended = true; m.T.ctxHeal(); m.audio.ended = false; m.audio.error = {}; m.T.ctxHeal(); m.audio.error = null;
  m.ctx.SND.focus = 1; m.T.ctxHeal(); m.ctx.SND.focus = 0; m.ctx.S.loadingAudio = true; m.T.ctxHeal(); m.ctx.S.loadingAudio = false;
  assert.strictEqual(m.log.resume, 0);
});
check('heal: not with Sound off, and not when nothing needs the engine (ambient off, cues off, music off, no narrator graph)', () => {
  let m = healWorld({ P: { sndOn: false } }); m.log.resume = 0; m.c.state = 'suspended'; m.T.ctxHeal(); assert.strictEqual(m.log.resume, 0);
  m = healWorld({ P: { ambOn: false, ambCues: false } }); m.log.resume = 0; m.c.state = 'suspended'; m.T.ctxHeal(); assert.strictEqual(m.log.resume, 0);
  m = healWorld({ P: { ambOn: false, ambCues: false } }); m.ctx.AMB.narr = () => true; m.log.resume = 0; m.c.state = 'suspended'; m.T.ctxHeal(); assert.strictEqual(m.log.resume, 1, 'the narrator graph alone is enough');
});
check('heal: ambient on but scenes off and every level at 0 (and cues off) is nothing to play: no wake-up', () => {
  const m = healWorld({ P: { ambAuto: false, ambCues: false } }); m.log.resume = 0; m.c.state = 'suspended'; m.T.ctxHeal(); assert.strictEqual(m.log.resume, 0);
});
check('heal: music on is wanted only while a clip sounds or loads (musWanted); musCtxHeal keeps that rule', () => {
  const m = healWorld({ P: { ambOn: false, ambCues: false, musOn: true } }); m.log.resume = 0; m.c.state = 'suspended';
  m.ctx.MUS.on = true; m.T.musCtxHeal(); assert.strictEqual(m.log.resume, 0, 'music on but no clip: nothing');
  m.ctx.MUS.live = true; m.T.musCtxHeal(); assert.strictEqual(m.log.resume, 1, 'a clip loading: wake the engine');
  m.advance(1000); m.c.state = 'suspended'; m.audio.paused = true; m.T.musCtxHeal(); assert.strictEqual(m.log.resume, 1, 'narrator paused: nothing');
});
check('heal: a refusal arms ONE tap/key listener set; a tap retries and the listeners remove themselves', async () => {
  const m = healWorld(); m.accept(false); m.log.resume = 0; m.c.state = 'suspended';
  m.T.ctxHeal(); await m.settle();
  assert.strictEqual(m.document.count('pointerdown'), 1); assert.strictEqual(m.document.count('touchend'), 1); assert.strictEqual(m.document.count('keydown'), 1);
  m.advance(1000); m.T.ctxHeal(); await m.settle(); assert.strictEqual(m.document.count('pointerdown'), 1, 'a second refusal arms no second set');
  m.accept(true); m.advance(1000); const before = m.log.resume; m.document.dispatchEvent({ type: 'pointerdown' }); await m.settle();
  assert.strictEqual(m.log.resume, before + 1, 'the tap retried'); assert.strictEqual(m.c.state, 'running');
  assert.strictEqual(m.document.count('pointerdown') + m.document.count('touchend') + m.document.count('keydown'), 0, 'listeners removed after the first use');
});
check('heal: a context that flips back at once does not loop (one try, one delayed retry)', () => {
  const m = healWorld(); m.log.resume = 0;
  m.c.resume = function () { m.log.resume++; return Promise.resolve(); };   // resume "works" but the state never reaches running
  m.c.state = 'suspended'; m.T.ctxHeal(); m.T.ctxHeal(); m.T.ctxHeal(); m.c.flip('suspended'); m.c.flip('interrupted');
  assert.strictEqual(m.log.resume, 1, 'five triggers in a row: one resume now'); assert.strictEqual(m.T.CTXH.t > 0, true, 'one retry waits');
  m.advance(500); assert.strictEqual(m.log.resume, 2, 'the retry'); m.advance(5000); assert.strictEqual(m.log.resume, 2, 'and then it stops');
});
check('heal: when sound is wanted it cancels both suspend timers', () => {
  const m = healWorld(); m.T.audioSuspendSoon(5000, 'timer'); m.T.audioSuspendSoon(5000, 'sTimer'); m.c.state = 'suspended'; m.T.ctxHeal();
  assert.strictEqual(m.T.AUD_SUSP.timer, 0); assert.strictEqual(m.T.AUD_SUSP.sTimer, 0);
});

check('suspend timers: music sets under sTimer and the same key is cancelled (the old key mismatch)', () => {
  const m = healWorld(); m.log.suspend = 0; m.T.audioSuspendSoon(600, 'sTimer'); m.T.audioSuspendCancel(); m.advance(2000);
  assert.strictEqual(m.log.suspend, 0, 'cancelled, so no suspend');
  m.T.audioSuspendSoon(600, 'sTimer'); m.T.audioSuspendCancel('sTimer'); m.advance(2000); assert.strictEqual(m.log.suspend, 0);
  m.T.audioSuspendSoon(600, 'timer'); m.T.audioSuspendCancel('sTimer'); m.advance(2000); assert.strictEqual(m.log.suspend, 1, "cancelling one key leaves the other timer alone");
});
check('suspend timers: a restarted timer replaces the old one; the old guards still hold (ambient on, music active, narrator in the graph)', () => {
  let m = healWorld(); m.log.suspend = 0; m.T.audioSuspendSoon(1000, 'sTimer'); m.advance(500); m.T.audioSuspendSoon(1000, 'sTimer'); m.advance(700); assert.strictEqual(m.log.suspend, 0); m.advance(500); assert.strictEqual(m.log.suspend, 1);
  m = healWorld(); m.ctx.AMB.on = true; m.T.audioSuspendSoon(100, 'timer'); m.advance(500); assert.strictEqual(m.log.suspend, 0, 'ambient on');
  m = healWorld(); m.ctx.MUS.on = true; m.ctx.MUS.live = true; m.T.audioSuspendSoon(100, 'sTimer'); m.advance(500); assert.strictEqual(m.log.suspend, 0, 'music active');
  m = healWorld(); m.ctx.AMB.narr = () => true; m.T.audioSuspendSoon(100, 'timer'); m.advance(500); assert.strictEqual(m.log.suspend, 0, 'narrator in the graph');
});
check('source: nothing clears MUS.sTimer or AMB.timer any more (they are not set)', () => {
  const dir = path.join(__dirname, '..', 'src/js'); let bad = [];
  (function walk(d) { fs.readdirSync(d, { withFileTypes: true }).forEach(e => { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (/\.js$/.test(e.name)) { const t = fs.readFileSync(p, 'utf8'); if (/MUS\.sTimer|AMB\.timer/.test(t)) bad.push(e.name); } }); })(dir);
  assert.deepStrictEqual(bad, []);
});

(async () => {
  for (const [n, f] of queue) { try { await f(); pass++; console.log('ok    ' + n); } catch (e) { fail++; console.log('FAIL  ' + n + '\n        ' + e.message); } }
  console.log('\n' + (fail ? fail + ' FAILED, ' : 'all ') + pass + ' passed'); process.exit(fail ? 1 : 0);
})();
