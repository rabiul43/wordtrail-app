  /* ---------- ambient-events.js ----------
     Ambient: slow movement, random one-off sounds (clink, birds, creaks, bell, crackle, thunder). */
  function ambWander() {   // every few seconds one slow movement in each running sound drifts to a new speed
    const ctx = AMB.ctx; if (!ctx) return; const now = ctx.currentTime;
    for (const k in AMB.live) {
      const l = AMB.live[k]; if (!l || !l.lfos || !l.lfos.length) continue;
      const e = l.lfos[Math.floor(Math.random() * l.lfos.length)], span = e.r > 5 ? 0.08 : 0.4;
      try { e.o.frequency.setTargetAtTime(e.r * (1 - span + Math.random() * 2 * span), now, e.r > 5 ? 1 : 3); } catch (x) {}
    }
  }
  function ambClink() {
    if (AMB.on) { ambTod(); ambWander(); }
    const L = ambLive(); if (!AMB.on || !(L.cafe > 8) || (AMB.live.cafe && AMB.live.cafe.rec) || Math.random() < 0.4) return;
    const ctx = AMB.ctx, t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.value = 2200 + Math.random() * 2400;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.05 * (L.cafe / 100), t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
    o.connect(g); g.connect(AMB.duck || AMB.master); o.start(t); o.stop(t + 0.3);
  }
  function ambTone(dest, t, f0, f1, dur, vol, type, atk) {   // one short pitched note, used by the event sounds
    const ctx = AMB.ctx, o = ctx.createOscillator(), g = ctx.createGain(), pj = AMB.pj || 1;   // pj: this story sound's own slight pitch shift
    f0 *= pj; if (f1) f1 *= pj;
    o.type = type || 'sine'; o.frequency.setValueAtTime(f0, t); if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + (atk || 0.01)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + 0.05);
  }
  function ambMoreEvents(L, ctx, now) {   // birds, owl, creaks, bell, drips, clock, heartbeat
    const due = (k, a, b, lv) => { if (Date.now() < (AMB.nx[k] || 0)) return false; AMB.nx[k] = Date.now() + (a + Math.random() * (b - a)) * (1.7 - lv / 100); return true; };
    const G = AMB.g, t = now + 0.05;
    if (L.birds > 5 && due('birds', 1200, 6000, L.birds)) {
      const n = 2 + Math.floor(Math.random() * 4), f = 2200 + Math.random() * 2200, up = Math.random() < 0.6;
      const pb = ambPanTo(G.birds, Math.random() * 1.6 - 0.8);
      for (let i = 0; i < n; i++) ambTone(pb, t + i * (0.09 + Math.random() * 0.05), f * (1 + i * 0.03), f * (up ? 1.35 : 0.8), 0.08, 0.22, 'sine', 0.008);
    }
    if (L.night > 5 && G.night && due('owl', 25000, 70000, L.night)) {
      const po = ambPanTo(G.night, Math.random() * 1.6 - 0.8);
      const ow = 0.94 + Math.random() * 0.12, oa = 0.85 + Math.random() * 0.3;   // a different owl each time
      ambTone(po, t, 430 * ow, 370 * ow, 0.45, 0.5 * oa, 'sine', 0.09); ambTone(po, t + 0.6 + Math.random() * 0.15, 400 * ow, 330 * ow, 0.6, 0.45 * oa, 'sine', 0.09);
      if (Math.random() < 0.4) ambTone(po, t + 1.4 + Math.random() * 0.2, 390 * ow, 320 * ow, 0.7, 0.35 * oa, 'sine', 0.1);
    }
    if (L.creaks > 5 && due('creak', 12000, 40000, L.creaks)) {
      const dur = 0.5 + Math.random() * 0.9, o = ctx.createOscillator(), j = ctx.createOscillator(), jg = ctx.createGain(), bp = ctx.createBiquadFilter(), g = ctx.createGain(), f = 70 + Math.random() * 60;
      o.type = 'sawtooth'; o.frequency.setValueAtTime(f, t); o.frequency.linearRampToValueAtTime(f * (Math.random() < 0.5 ? 1.35 : 0.7), t + dur);
      j.frequency.value = 18 + Math.random() * 10; jg.gain.value = 9; j.connect(jg); jg.connect(o.frequency);
      bp.type = 'bandpass'; bp.frequency.value = 280 + Math.random() * 320; bp.Q.value = 6;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.28, t + 0.06); g.gain.setValueAtTime(0.28, t + dur * 0.6); g.gain.linearRampToValueAtTime(0, t + dur);
      o.connect(bp); bp.connect(g); g.connect(ambPanTo(G.creaks, Math.random() * 1.6 - 0.8)); o.start(t); j.start(t); o.stop(t + dur + 0.05); j.stop(t + dur + 0.05);
    }
    if (L.bell > 5 && due('bell', 35000, 90000, L.bell)) {
      const f0 = 180 + Math.random() * 120, pbl = ambPanTo(G.bell, Math.random() * 1.2 - 0.6);   // a distant bell: a few inharmonic partials that ring and die away
      [[1, 0.5, 6], [2, 0.25, 4], [2.4, 0.2, 3.5], [3, 0.12, 2.5], [4.2, 0.08, 1.8]].forEach(([m, v, d]) => ambTone(pbl, t, f0 * m, 0, d, v, 'sine', 0.005));
    }
    if (L.drips > 5 && due('drip', 1500, 6000, L.drips)) {
      const f = 1500 + Math.random() * 900, pd = ambPanTo(G.drips, Math.random() * 1.6 - 0.8); ambTone(pd, t, f, f * 0.45, 0.09, 0.4, 'sine', 0.003); ambTone(pd, t + 0.14, f * 0.9, f * 0.4, 0.08, 0.16, 'sine', 0.003);
    }
    if (L.clock > 5) {   // ticks are scheduled slightly ahead so they stay evenly spaced
      if (AMB.tickAt < now) AMB.tickAt = now + 0.05;
      while (AMB.tickAt < now + 0.7) {
        const tt = AMB.tickAt, hi = (AMB.tickAlt ^= 1), s = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), g = ctx.createGain();
        s.buffer = AMB.white; bp.type = 'bandpass'; bp.frequency.value = (hi ? 2300 : 1700) * (0.96 + Math.random() * 0.08); bp.Q.value = 3;
        g.gain.setValueAtTime(0, tt); g.gain.linearRampToValueAtTime(0.45 * (0.85 + Math.random() * 0.3), tt + 0.002); g.gain.exponentialRampToValueAtTime(0.0001, tt + 0.045);
        s.connect(bp); bp.connect(g); g.connect(G.clock); s.start(tt, Math.random() * 3); s.stop(tt + 0.06);
        ambTone(G.clock, tt, hi ? 900 : 700, 400, 0.04, 0.2, 'sine', 0.002);
        AMB.tickAt += 1;
      }
    }
    const burst = (dest, tt, type, f, q, vol, dur) => {   // a short burst of noise: the click of a hoof, the scuff of a shoe, the crack of a gun
      const s = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), g = ctx.createGain();
      s.buffer = AMB.white; bp.type = type; bp.frequency.value = f; bp.Q.value = q;
      g.gain.setValueAtTime(0, tt); g.gain.linearRampToValueAtTime(vol, tt + 0.003); g.gain.exponentialRampToValueAtTime(0.0001, tt + dur);
      s.connect(bp); bp.connect(g); g.connect(dest); s.start(tt, Math.random() * 3); s.stop(tt + dur + 0.03);
    };
    if (L.hooves > 5 && G.hooves && due('hooves', 14000, 42000, L.hooves)) {   // a horse passing: a trot or a canter that comes and goes from one side to the other
      const trot = Math.random() < 0.7, n = 8 + Math.floor(Math.random() * 8), gap = trot ? 0.32 : 0.17, side = Math.random() < 0.5 ? -1 : 1, base = 700 + Math.random() * 250;
      for (let i = 0; i < n; i++) {
        const tt = t + i * gap * (0.97 + Math.random() * 0.06), env = Math.sin(Math.PI * (i + 0.5) / n), hi = i & 1, pd = ambPanTo(G.hooves, side * (-0.8 + 1.6 * i / Math.max(1, n - 1)));
        burst(pd, tt, 'bandpass', (hi ? base : base * 0.8) * (0.95 + Math.random() * 0.1), 2.2, 0.5 * env + 0.05, 0.09);
        ambTone(pd, tt, hi ? 240 : 200, 110, 0.07, 0.35 * env + 0.03, 'sine', 0.002);
      }
    }
    if (L.steps > 5 && G.steps && due('steps', 9000, 28000, L.steps)) {   // someone walking: a few steady steps, left and right, loud then fading as they pass
      const n = 4 + Math.floor(Math.random() * 6), gap = 0.5 + Math.random() * 0.12, p0 = Math.random() * 1.2 - 0.6, f = 150 + Math.random() * 60;
      for (let i = 0; i < n; i++) {
        const tt = t + i * gap * (0.95 + Math.random() * 0.1), hi = i & 1, env = 0.6 + 0.4 * Math.sin(Math.PI * (i + 0.5) / n), pd = ambPanTo(G.steps, p0 + (hi ? 0.05 : -0.05));
        ambTone(pd, tt, f * (hi ? 1.1 : 1), f * 0.5, 0.09, 0.45 * env, 'sine', 0.003);
        burst(pd, tt, 'lowpass', 1400, 0.7, 0.18 * env, 0.07);
      }
    }
    if (L.cannon > 5 && G.cannon && due('cannon', 9000, 32000, L.cannon)) {   // guns far away: a deep boom with a rumbling tail, sometimes two or three in a row
      const k = 1 + (Math.random() < 0.35 ? 1 + Math.floor(Math.random() * 2) : 0), pc = ambPanTo(G.cannon, Math.random() * 1.6 - 0.8);
      for (let i = 0; i < k; i++) {
        const tt = t + i * (0.4 + Math.random() * 0.9), dur = 1.4 + Math.random() * 0.8, s = ctx.createBufferSource(), lp = ctx.createBiquadFilter(), g = ctx.createGain();
        s.buffer = AMB.brown; lp.type = 'lowpass'; lp.frequency.setValueAtTime(420, tt); lp.frequency.exponentialRampToValueAtTime(70, tt + dur);
        g.gain.setValueAtTime(0, tt); g.gain.linearRampToValueAtTime(1.6, tt + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, tt + dur);
        s.connect(lp); lp.connect(g); g.connect(pc); s.start(tt, Math.random() * 3); s.stop(tt + dur + 0.1);
        ambTone(pc, tt, 70, 32, 0.5, 0.7, 'sine', 0.006); ambTone(pc, tt, 130, 60, 0.25, 0.3, 'sine', 0.004);   // (the second tone is for phone speakers, which give nothing below about 200 Hz)
        burst(pc, tt, 'bandpass', 1200, 0.8, 0.22, 0.07);
      }
    }
    if (L.clang > 5 && G.clang && due('clang', 6000, 20000, L.clang)) {   // swords or a blacksmith's hammer: a ring of metal partials that die away
      const hits = 1 + Math.floor(Math.random() * 3), smith = Math.random() < 0.4, f0 = 520 + Math.random() * 420, pc = ambPanTo(G.clang, Math.random() * 1.4 - 0.7);
      for (let i = 0; i < hits; i++) {
        const tt = t + i * (smith ? 0.55 : 0.22 + Math.random() * 0.18), f = f0 * (0.9 + Math.random() * 0.25), dec = smith ? 0.9 : 0.5;
        [[1, 0.5, 1], [2.76, 0.32, 0.7], [5.4, 0.2, 0.45], [8.93, 0.1, 0.3]].forEach(([m, v, d]) => ambTone(pc, tt, f * m, 0, dec * d, v * 0.5, 'sine', 0.001));
        burst(pc, tt, 'highpass', 3000, 0.7, 0.3, 0.03);
      }
    }
    if (L.heartbeat > 5) {
      if (AMB.beatAt < now) AMB.beatAt = now + 0.05;
      while (AMB.beatAt < now + 0.7) {
        const tt = AMB.beatAt, hv = 0.9 + Math.random() * 0.2; ambTone(G.heartbeat, tt, 62, 40, 0.18, 0.9 * hv, 'sine', 0.012); ambTone(G.heartbeat, tt + 0.25 + Math.random() * 0.04, 56, 38, 0.16, 0.6 * hv, 'sine', 0.012);
        AMB.beatAt += 1.05 * (0.97 + Math.random() * 0.06);   // a living pulse is never exactly even
      }
    }
  }
  function ambEvents() {   // random crackles and thunder, scaled by their levels
    if (!AMB.on) return;
    const L = ambLive(), ctx = AMB.ctx, now = ctx.currentTime;
    ambMoreEvents(L, ctx, now); ambRain(L, ctx, now);
    if (L.fire > 5 && AMB.g.fire && !(AMB.live.fire && AMB.live.fire.rec) && Math.random() < 0.45) {
      const n = 1 + Math.floor(Math.random() * 3);
      for (let i = 0; i < n; i++) {
        const t = now + i * (0.03 + Math.random() * 0.07), s = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), g = ctx.createGain();
        s.buffer = AMB.white; bp.type = 'bandpass'; bp.frequency.value = 1200 + Math.random() * 3500; bp.Q.value = 1.2;
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.25 + Math.random() * 0.3, t + 0.003); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.02 + Math.random() * 0.05);
        s.connect(bp); bp.connect(g); g.connect(ambPanTo(AMB.g.fire, Math.random() * 1.4 - 0.7)); s.start(t, Math.random() * 3); s.stop(t + 0.1);
      }
    }
    if (L.thunder > 5 && Date.now() >= AMB.nextThunder) {
      AMB.nextThunder = Date.now() + (20000 + Math.random() * 45000) * (1.7 - L.thunder / 100);
      ambRoll(AMB.g.thunder, now + 0.05, 0.9, false);
    }
  }
