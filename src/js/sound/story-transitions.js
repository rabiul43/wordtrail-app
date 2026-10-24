  /* ---------- story-transitions.js ----------
     Story sounds: transition sounds (door, gate, footsteps) when the story moves to a new place. */
  /* Transition sounds: when the story moves to a new place, a short door, gate or footsteps sound plays as the scene
     crossfades. Indoors gets a door, a farm, garden or village a gate, anywhere else a few footsteps. Moves by
     vehicle or sea get none, a seek or a new book gets none, and there is at most one every 15 seconds. */
  const TRANS_SKIP = new Set(['train', 'carriage', 'sea', 'seastorm', 'reef', 'battle', 'trench', 'machine', 'waterfall']);
  const TRANS_GATE = new Set(['farm', 'garden', 'orchard', 'graveyard', 'country', 'village', 'manor', 'castle', 'palace', 'prairie', 'harbour', 'fair', 'school']);
  function ambTransKind(from, to) {
    const a = SC_PLACES[from], b = SC_PLACES[to];
    if (!a || !b || TRANS_SKIP.has(from) || TRANS_SKIP.has(to)) return null;
    if (!b.out) return 'door';   // arriving indoors
    if (TRANS_GATE.has(to)) return 'gate';
    if (!a.out) return 'door';   // leaving a building
    return 'steps';
  }
  function transSteps(d, t, n, v, out) {   // n footsteps about 0.42 s apart: gravel crunch outdoors, wood tap indoors
    for (let i = 0; i < n; i++) {
      const tt = t + i * 0.42 + Math.random() * 0.025, vv = v * (0.9 + Math.random() * 0.2);
      ambTone(d, tt, 130 - (i & 1) * 14, 65, 0.08, vv, 'sine', 0.004); cueNz(d, tt, 'brown', 'lowpass', 380, 0.7, vv * 0.8, 0.004, 0.08);
      if (out) cueNz(d, tt, 'white', 'bandpass', 1800 + (i & 1) * 250, 0.9, vv * 0.18, 0.003, 0.07); else cueNz(d, tt, 'white', 'bandpass', 700, 1.2, vv * 0.22, 0.002, 0.04);
    }
  }
  const TRANS_SOUND = {
    door: (d, t, out) => { CUE_SOUND.dooropen(d, t); transSteps(d, t + 0.9, 3, 0.45, out); CUE_SOUND.doorshut(d, t + 2.3); },   // open it, walk through, close it
    gate: (d, t, out) => {   // latch, a long iron squeal, a clank, then steps through
      const ctx = AMB.ctx, dur = 0.8 + Math.random() * 0.3, o = ctx.createOscillator(), bp = ctx.createBiquadFilter(), g = ctx.createGain(), s0 = t + 0.1;
      cueClick(d, t, 1800, 0.3);
      o.type = 'sawtooth'; o.frequency.setValueAtTime(480, s0); o.frequency.linearRampToValueAtTime(700 + Math.random() * 120, s0 + dur);
      bp.type = 'bandpass'; bp.frequency.value = 1100; bp.Q.value = 9;
      g.gain.setValueAtTime(0, s0); g.gain.linearRampToValueAtTime(0.2, s0 + 0.15); g.gain.setValueAtTime(0.2, s0 + dur * 0.7); g.gain.linearRampToValueAtTime(0, s0 + dur);
      o.connect(bp); bp.connect(g); g.connect(d); o.start(s0); o.stop(s0 + dur + 0.05);
      cueNz(d, s0 + dur, 'brown', 'lowpass', 420, 0.7, 0.5, 0.004, 0.16); cueClick(d, s0 + dur + 0.04, 2400, 0.3);
      transSteps(d, s0 + dur + 0.6, 3, 0.45, true);
    },
    steps: (d, t, out) => { transSteps(d, t, 5, 0.5, out); }
  };
  function ambTrans(from, to, id, look, skipped) {   // called by the scene detector the moment the place changes
    try {
      if (skipped || !from || !to || from === to || !AMB.on || !AMB.cue || P.ambTrans === false || P.calm === true || !ambPlaying()) return;
      const kind = ambTransKind(from, to); if (!kind) return;
      const ms = Date.now(); if (ms < (AMB.transNx || 0)) return;
      AMB.transNx = ms + 15000; clearTimeout(AMB.transH);
      const e = { id, kind, to, T: null }, ts = look ? wordTimesAny(id) : null;   // looking ahead: wait for the new paragraph's first word
      if (ts && ts[0] != null) { e.T = ts[0]; ambTransWait(e); } else ambTransFire(e);
    } catch (e) { console.warn('transition sound', e); }   // a bonus: never let it break reading
  }
  function ambTransWait(e) {   // on the audio's own clock, like the story sounds
    try {
      const ts = wordTimesAny(e.id); if (ts && ts[0] != null) e.T = ts[0];
      const left = e.T - (nowT() + P.nudge + (P.wordShift || 0) - (P.ambCueShift || 0));
      if (left <= 0.02 || left > 20) { AMB.transH = 0; if (left <= 0.02) ambTransFire(e); return; }
      AMB.transH = setTimeout(() => ambTransWait(e), Math.max(15, Math.min(250, left / (audio.playbackRate || 1) * 1000)));
    } catch (x) { console.warn('transition sound', x); }
  }
  function ambTransFire(e) {
    try {
      if (!AMB.on || !AMB.cue || P.ambTrans === false || P.calm === true || audio.paused || audio.seeking || Math.abs((S.curId == null ? -9 : S.curId) - e.id) > 1) return;
      const ctx = AMB.ctx, dst = ctx.createGain(), pl = SC_PLACES[e.to];
      dst.gain.value = 0.8; dst.connect(AMB.cue); (AMB.cueG = (AMB.cueG || []).slice(-3)).push(dst);   // fades out if the book pauses
      ctx.resume().catch(() => {}); AMB.pj = 0.95 + Math.random() * 0.1;
      TRANS_SOUND[e.kind](dst, ctx.currentTime + 0.03, !!(pl && pl.out));
      AMB.cueGap = Date.now() + 3500;   // keep a story sound from landing on top of it
    } catch (x) { console.warn('transition sound', x); }
    AMB.pj = 1;
  }
