  /* ---------- story-sounds.js ----------
     Story sounds: how each story sound is made (CUE_SOUND). */
  function cueNz(dest, t, buf, type, f, q, vol, atk, dec) {   // a burst of filtered noise; returns the filter so a sweep can be added
    const ctx = AMB.ctx, s = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = AMB[buf]; s.loop = true; fl.type = type; fl.frequency.value = f * (AMB.pj || 1); fl.Q.value = q || 0.7;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + atk); g.gain.exponentialRampToValueAtTime(0.0001, t + atk + dec);
    s.connect(fl); fl.connect(g); g.connect(dest); s.start(t, Math.random() * 3); s.stop(t + atk + dec + 0.1);
    return fl;
  }
  function cueClick(d, t, f, v) { ambTone(d, t, f, f * 0.6, 0.03, v, 'sine', 0.002); cueNz(d, t, 'white', 'bandpass', 3500, 1.2, v * 0.6, 0.002, 0.03); }   // a small metal click
  const CUE_SOUND = {
    thunder: (d, t) => ambRoll(d, t, 0.9, true, true),
    knock: (d, t, n) => { n = n ? Math.min(5, Math.max(1, n | 0)) : 3; for (let i = 0; i < n; i++) { const tt = t + i * 0.235 + Math.random() * 0.03; ambTone(d, tt, 190 * (0.96 + Math.random() * 0.08), 85, 0.1, (0.8 - i * 0.08) * (0.9 + Math.random() * 0.2), 'sine', 0.003); cueNz(d, tt, 'white', 'bandpass', 900, 1.2, 0.25, 0.002, 0.05); } },   // n knocks (default 3, at most 5)
    creak: (d, t) => {
      const ctx = AMB.ctx, dur = 0.9 + Math.random() * 0.8, o = ctx.createOscillator(), j = ctx.createOscillator(), jg = ctx.createGain(), bp = ctx.createBiquadFilter(), g = ctx.createGain(), f = 70 + Math.random() * 50;
      o.type = 'sawtooth'; o.frequency.setValueAtTime(f, t); o.frequency.linearRampToValueAtTime(f * (Math.random() < 0.5 ? 1.4 : 0.7), t + dur);
      j.frequency.value = 18 + Math.random() * 10; jg.gain.value = 9; j.connect(jg); jg.connect(o.frequency);
      bp.type = 'bandpass'; bp.frequency.value = 300 + Math.random() * 300; bp.Q.value = 6;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.4, t + 0.08); g.gain.setValueAtTime(0.4, t + dur * 0.6); g.gain.linearRampToValueAtTime(0, t + dur);
      o.connect(bp); bp.connect(g); g.connect(d); o.start(t); j.start(t); o.stop(t + dur + 0.05); j.stop(t + dur + 0.05);
    },
    slam: (d, t) => { cueNz(d, t, 'brown', 'lowpass', 420, 0.7, 1, 0.003, 0.35); ambTone(d, t, 95, 45, 0.3, 0.9, 'sine', 0.003); cueNz(d, t, 'white', 'bandpass', 1400, 0.9, 0.3, 0.002, 0.06); },
    steps: (d, t) => { for (let i = 0; i < 6; i++) { const tt = t + i * 0.56 + Math.random() * 0.03, v = 0.55 * Math.sin(Math.PI * (i + 0.6) / 6.6) + 0.12; ambTone(d, tt, 120 - (i & 1) * 15, 60, 0.09, v, 'sine', 0.004); cueNz(d, tt, 'brown', 'lowpass', 320, 0.7, v * 0.8, 0.004, 0.09); } },
    bell: (d, t, n) => { n = n ? Math.min(12, Math.max(1, n | 0)) : 1; const f0 = 190 + Math.random() * 60, many = n > 1; for (let i = 0; i < n; i++) [[1, 0.4, 6], [2, 0.2, 4], [2.4, 0.16, 3.5], [3, 0.1, 2.5], [4.2, 0.06, 1.8]].forEach(([m, v, du]) => ambTone(d, t + i * 1.1, f0 * m, 0, many ? du * 0.55 : du, (many ? v * 0.75 : v) * (i ? 0.92 + Math.random() * 0.16 : 1), 'sine', 0.005)); },   // n strokes about 1.1 s apart (at most 12); shorter, softer rings when there are several so they do not pile up
    clock: (d, t) => { for (let i = 0; i < 5; i++) { const tt = t + i, hi = i & 1; cueNz(d, tt, 'white', 'bandpass', hi ? 2300 : 1700, 3, 0.4, 0.002, 0.045); ambTone(d, tt, hi ? 900 : 700, 400, 0.04, 0.2, 'sine', 0.002); } },
    wind: (d, t) => { const bp = cueNz(d, t, 'pink', 'bandpass', 320, 1.1, 0.55, 2.2, 3.8); bp.frequency.setValueAtTime(320, t); bp.frequency.linearRampToValueAtTime(760, t + 2.4); bp.frequency.linearRampToValueAtTime(340, t + 6); },
    waves: (d, t) => { cueNz(d, t, 'brown', 'lowpass', 900, 0.7, 0.8, 0.5, 3.8); cueNz(d, t + 1.6, 'pink', 'highpass', 2500, 0.7, 0.18, 0.8, 3); },
    splash: (d, t) => { cueNz(d, t, 'white', 'bandpass', 1800, 0.8, 0.45, 0.01, 0.4); cueNz(d, t, 'brown', 'lowpass', 500, 0.7, 0.7, 0.01, 0.5); },
    fire: (d, t) => {
      cueNz(d, t, 'brown', 'lowpass', 450, 0.7, 0.3, 1, 3);
      for (let i = 0; i < 14; i++) cueNz(d, t + Math.random() * 3.2, 'white', 'bandpass', 1200 + Math.random() * 3500, 1.2, 0.2 + Math.random() * 0.3, 0.003, 0.02 + Math.random() * 0.05);
    },
    birds: (d, t) => { for (let ph = 0; ph < 3; ph++) { const n = 2 + Math.floor(Math.random() * 4), f = 2200 + Math.random() * 2200, up = Math.random() < 0.6; for (let i = 0; i < n; i++) ambTone(d, t + ph * 1.1 + i * (0.09 + Math.random() * 0.05), f * (1 + i * 0.03), f * (up ? 1.35 : 0.8), 0.08, 0.14, 'sine', 0.008); } },
    owl: (d, t) => { ambTone(d, t, 430, 370, 0.45, 0.35, 'sine', 0.09); ambTone(d, t + 0.65, 400, 330, 0.6, 0.3, 'sine', 0.09); },
    horse: (d, t) => { for (let c = 0; c < 6; c++) [0, 0.12, 0.25].forEach((o, i) => { const tt = t + c * 0.48 + o, v = 0.5 * (1 - c / 7); ambTone(d, tt, 150 - i * 10, 70, 0.07, v, 'sine', 0.003); cueNz(d, tt, 'brown', 'lowpass', 650, 0.7, v * 0.7, 0.003, 0.06); }); },
    rain: (d, t) => { cueNz(d, t, 'pink', 'bandpass', 3000, 0.5, 0.3, 0.6, 5); cueNz(d, t, 'white', 'highpass', 4500, 0.7, 0.05, 0.6, 5); }
  ,
    storm: (d, t) => { const bp = cueNz(d, t, 'pink', 'bandpass', 300, 1.1, 0.6, 0.5, 5); bp.frequency.setValueAtTime(300, t); bp.frequency.linearRampToValueAtTime(800, t + 3); bp.frequency.linearRampToValueAtTime(350, t + 7); ambRoll(d, t + 0.4, 0.55, false, true); },
    sea: (d, t) => { for (let i = 0; i < 2; i++) { const at = t + i * 3.8; cueNz(d, at, 'brown', 'lowpass', 900, 0.7, 0.7, 0.4, 2.6); cueNz(d, at + 1.2, 'pink', 'highpass', 2200, 0.7, 0.15, 0.3, 2.2); } },
    water: (d, t) => {   // a brook: bright noise with a changing colour, a few plinks on top
      const ctx = AMB.ctx, s = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), g = ctx.createGain();
      s.buffer = AMB.pink; s.loop = true; bp.type = 'bandpass'; bp.Q.value = 0.8;
      for (let i = 0; i < 40; i++) bp.frequency.setValueAtTime(1000 + Math.random() * 2200, t + i * 0.15);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.32, t + 1); g.gain.setValueAtTime(0.32, t + 4.5); g.gain.linearRampToValueAtTime(0, t + 6);
      s.connect(bp); bp.connect(g); g.connect(d); s.start(t, Math.random() * 3); s.stop(t + 6.1);
      for (let i = 0; i < 6; i++) ambTone(d, t + 0.5 + Math.random() * 4.5, 1800 + Math.random() * 1200, 900, 0.07, 0.12, 'sine', 0.004);
    },
    crickets: (d, t) => { const pn = ambPanTo(d, Math.random() * 1.2 - 0.6); [4200, 4700].forEach((f, c) => { for (let g = 0; g < 8; g++) for (let p = 0; p < 3; p++) ambTone(pn, t + c * 0.23 + g * 0.5 + p * 0.07, f, 0, 0.035, 0.07, 'sine', 0.004); }); },
    frogs: (d, t) => {
      const lp = AMB.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1100; lp.connect(ambPanTo(d, Math.random() * 1.2 - 0.6));
      for (let i = 0; i < 3; i++) { const tt = t + i * 0.95 + Math.random() * 0.1, f = 230 + Math.random() * 60; ambTone(lp, tt, f * 1.1, f * 0.7, 0.13, 0.2, 'sawtooth', 0.01); ambTone(lp, tt + 0.17, f * 1.3, f * 0.8, 0.15, 0.2, 'sawtooth', 0.01); }
    },
    wolf: (d, t) => {   // one long howl: up, held with a waver, then down
      const ctx = AMB.ctx, bp = ctx.createBiquadFilter(), g = ctx.createGain(), vib = ctx.createOscillator(), vg = ctx.createGain();
      bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 0.5;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.3, t + 0.7); g.gain.setValueAtTime(0.3, t + 2.4); g.gain.linearRampToValueAtTime(0, t + 4);
      bp.connect(g); g.connect(ambPanTo(d, Math.random() * 1.2 - 0.6));
      vib.frequency.value = 5.5; vg.gain.value = 7; vib.connect(vg);
      [[1, 1], [2, 0.4], [3, 0.2]].forEach(([m, v]) => {
        const o = ctx.createOscillator(), og = ctx.createGain(); o.type = 'sine';
        o.frequency.setValueAtTime(300 * m, t); o.frequency.linearRampToValueAtTime(480 * m, t + 1.1); o.frequency.setValueAtTime(480 * m, t + 2.2); o.frequency.linearRampToValueAtTime(330 * m, t + 3.9);
        vg.connect(o.frequency); og.gain.value = v; o.connect(og); og.connect(bp); o.start(t); o.stop(t + 4.1);
      });
      vib.start(t); vib.stop(t + 4.1);
    },
    bee: (d, t) => {   // a buzz that passes from one side to the other
      const ctx = AMB.ctx, o = ctx.createOscillator(), lfo = ctx.createOscillator(), lg = ctx.createGain(), bp = ctx.createBiquadFilter(), g = ctx.createGain(), pn = ctx.createStereoPanner ? ctx.createStereoPanner() : null, dir = Math.random() < 0.5 ? -1 : 1;
      o.type = 'sawtooth'; o.frequency.value = 220; lfo.frequency.value = 14; lg.gain.value = 18; lfo.connect(lg); lg.connect(o.frequency);
      bp.type = 'bandpass'; bp.frequency.value = 750; bp.Q.value = 1.4;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.28, t + 0.9); g.gain.linearRampToValueAtTime(0, t + 2.6);
      o.connect(bp); bp.connect(g);
      if (pn) { pn.pan.setValueAtTime(-0.9 * dir, t); pn.pan.linearRampToValueAtTime(0.9 * dir, t + 2.6); g.connect(pn); pn.connect(d); } else g.connect(d);
      o.start(t); lfo.start(t); o.stop(t + 2.7); lfo.stop(t + 2.7);
    },
    rooster: (d, t) => {   // cock-a-doodle-doo: three rising notes and a long falling one
      const ctx = AMB.ctx, bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1200; bp.Q.value = 1.2; bp.connect(ambPanTo(d, Math.random() * 1.2 - 0.6));
      [[0, 0.22, 560, 760], [0.27, 0.2, 640, 830], [0.54, 0.3, 720, 980], [0.95, 1.0, 980, 520]].forEach(([o, du, f0, f1]) => {
        const os = ctx.createOscillator(), g = ctx.createGain(), at = t + o; os.type = 'sawtooth';
        os.frequency.setValueAtTime(f0, at); os.frequency.linearRampToValueAtTime(f1, at + du);
        g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(0.22, at + 0.03); g.gain.setValueAtTime(0.22, at + du * 0.8); g.gain.linearRampToValueAtTime(0, at + du);
        os.connect(g); g.connect(bp); os.start(at); os.stop(at + du + 0.05);
      });
    }
,
    dooropen: (d, t) => { cueClick(d, t, 2200, 0.35); CUE_SOUND.creak(d, t + 0.06); },
    doorshut: (d, t) => { ambTone(d, t, 115, 55, 0.22, 0.7, 'sine', 0.004); cueNz(d, t, 'brown', 'lowpass', 520, 0.7, 0.55, 0.004, 0.14); cueClick(d, t + 0.12, 2600, 0.3); },
    glass: (d, t) => {
      const pn = ambPanTo(d, Math.random() * 0.8 - 0.4);
      cueNz(pn, t, 'white', 'highpass', 2500, 0.7, 0.5, 0.002, 0.35);
      for (let i = 0; i < 14; i++) ambTone(pn, t + 0.05 + Math.random() * 0.7, 2500 + Math.random() * 4500, 0, 0.12 + Math.random() * 0.15, 0.1 + Math.random() * 0.1, 'sine', 0.002);
    },
    match: (d, t) => {
      const sc = cueNz(d, t, 'white', 'bandpass', 2600, 1, 0.28, 0.01, 0.18); sc.frequency.setValueAtTime(2600, t); sc.frequency.linearRampToValueAtTime(4200, t + 0.18);
      cueNz(d, t + 0.17, 'pink', 'lowpass', 1300, 0.7, 0.32, 0.05, 0.55);
      for (let i = 0; i < 4; i++) cueNz(d, t + 0.3 + Math.random() * 0.5, 'white', 'bandpass', 3000 + Math.random() * 2000, 1.2, 0.12, 0.003, 0.03);
    },
    paper: (d, t) => {
      const pn = ambPanTo(d, Math.random() * 0.8 - 0.4);
      cueNz(pn, t, 'white', 'bandpass', 3500, 0.7, 0.22, 0.03, 0.22); cueNz(pn, t + 0.18, 'white', 'bandpass', 2800, 0.7, 0.18, 0.02, 0.3);
      for (let i = 0; i < 4; i++) cueNz(pn, t + 0.1 + Math.random() * 0.5, 'white', 'bandpass', 4000, 1.5, 0.1, 0.002, 0.025);
    },
    coins: (d, t) => { const pn = ambPanTo(d, Math.random() * 0.8 - 0.4); for (let i = 0; i < 9; i++) { const tt = t + i * 0.045 + Math.random() * 0.02, f = 2800 + Math.random() * 2600; ambTone(pn, tt, f, 0, 0.18, 0.12, 'sine', 0.002); ambTone(pn, tt, f * 2.7, 0, 0.09, 0.05, 'sine', 0.002); } cueNz(pn, t, 'white', 'bandpass', 5000, 1, 0.1, 0.002, 0.08); },
    lock: (d, t) => { cueClick(d, t, 3000, 0.35); cueClick(d, t + 0.14, 2400, 0.5); for (let i = 0; i < 3; i++) ambTone(d, t + 0.3 + i * 0.05, 2500 + Math.random() * 1500, 0, 0.12, 0.09, 'sine', 0.002); },
    wheels: (d, t) => {   // rolling wheels on a road: a grainy rumble that pulses, with a hint of hooves
      const pn = ambPanTo(d, Math.random() * 0.6 - 0.3);
      for (let i = 0; i < 18; i++) { const tt = t + i * 0.12 + Math.random() * 0.02, v = (0.2 + Math.sin(Math.PI * i / 17) * 0.35) * (i % 3 ? 0.8 : 1); cueNz(pn, tt, 'pink', 'bandpass', 600 + Math.random() * 300, 0.9, v, 0.02, 0.12); cueNz(pn, tt, 'white', 'highpass', 2500, 0.7, v * 0.12, 0.004, 0.04); }
      for (let c = 0; c < 5; c++) [0, 0.14].forEach((o, i) => { const tt = t + 0.1 + c * 0.42 + o, v = 0.16 * Math.sin(Math.PI * (c + 0.7) / 5.7); ambTone(pn, tt, 330 - i * 40, 220, 0.06, v, 'sine', 0.003); cueNz(pn, tt, 'white', 'bandpass', 1300, 1.2, v * 0.8, 0.002, 0.04); });
    },
    train: (d, t) => {   // chuffing, then a steam whistle
      const pn = ambPanTo(d, Math.random() * 0.6 - 0.3);
      for (let i = 0; i < 9; i++) { const tt = t + i * (0.3 - i * 0.012), v = 0.5 * (1 - i / 14); cueNz(pn, tt, 'white', 'bandpass', 900, 0.8, v, 0.015, 0.14); cueNz(pn, tt, 'pink', 'bandpass', 450, 0.8, v * 0.6, 0.01, 0.1); }
      const w = t + 2.3, o1 = AMB.ctx.createOscillator(), o2 = AMB.ctx.createOscillator(), g = AMB.ctx.createGain();
      o1.type = 'triangle'; o2.type = 'triangle'; o1.frequency.setValueAtTime(840, w); o2.frequency.setValueAtTime(1050, w);
      g.gain.setValueAtTime(0, w); g.gain.linearRampToValueAtTime(0.22, w + 0.08); g.gain.setValueAtTime(0.22, w + 0.8); g.gain.exponentialRampToValueAtTime(0.0001, w + 1.3);
      o1.connect(g); o2.connect(g); g.connect(pn); o1.start(w); o2.start(w); o1.stop(w + 1.4); o2.stop(w + 1.4);
      cueNz(pn, w, 'white', 'bandpass', 3000, 1, 0.05, 0.08, 1.1);
    },
    ship: (d, t) => {   // a wooden creak and a distant foghorn
      const ctx = AMB.ctx, pn = ambPanTo(d, Math.random() * 0.6 - 0.3);
      const o = ctx.createOscillator(), bp = ctx.createBiquadFilter(), g = ctx.createGain();
      o.type = 'sawtooth'; o.frequency.setValueAtTime(240, t); o.frequency.linearRampToValueAtTime(300, t + 0.5); o.frequency.linearRampToValueAtTime(220, t + 1);
      bp.type = 'bandpass'; bp.frequency.value = 700; bp.Q.value = 5;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.14, t + 0.3); g.gain.linearRampToValueAtTime(0.09, t + 0.7); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
      o.connect(bp); bp.connect(g); g.connect(pn); o.start(t); o.stop(t + 1.2);
      const h = t + 1.4, h1 = ctx.createOscillator(), h2 = ctx.createOscillator(), hg = ctx.createGain(), lp = ctx.createBiquadFilter();
      h1.type = 'sawtooth'; h2.type = 'sawtooth'; h1.frequency.value = 220; h2.frequency.value = 277; lp.type = 'lowpass'; lp.frequency.value = 900;
      hg.gain.setValueAtTime(0, h); hg.gain.linearRampToValueAtTime(0.16, h + 0.25); hg.gain.setValueAtTime(0.16, h + 1.3); hg.gain.exponentialRampToValueAtTime(0.0001, h + 2.1);
      h1.connect(lp); h2.connect(lp); lp.connect(hg); hg.connect(pn); h1.start(h); h2.start(h); h1.stop(h + 2.2); h2.stop(h + 2.2);
    },
    crowd: (d, t) => {   // a murmur of many people: slow-moving bands of noise, no words
      const pn = ambPanTo(d, 0), dur = 3.2;
      [[420, 1.2, 0.3], [800, 1.5, 0.28], [1300, 1.8, 0.2], [2200, 1.5, 0.1]].forEach(([f, q, v], i) => {
        const fl = cueNz(pn, t + i * 0.05, 'pink', 'bandpass', f, q, v, 0.9, dur);
        for (let k = 1; k < 8; k++) fl.frequency.setValueAtTime(f * (0.85 + Math.random() * 0.35), t + k * 0.4);
      });
    },
    run: (d, t) => {   // quick light footsteps
      const pn = ambPanTo(d, Math.random() * 0.4 - 0.2);
      for (let i = 0; i < 8; i++) { const tt = t + i * 0.2 + (i & 1 ? 0.02 : 0) + Math.random() * 0.015, v = 0.3 * Math.sin(Math.PI * (i + 0.6) / 8.6) + 0.06; ambTone(pn, tt, 260 - (i & 1) * 30, 160, 0.06, v, 'sine', 0.003); cueNz(pn, tt, 'white', 'bandpass', 1100 + (i & 1) * 200, 1, v * 0.9, 0.002, 0.05); }
    },
    clap: (d, t) => {   // warm, soft applause: many small claps, swelling then fading
      const pn = ambPanTo(d, 0), n = 34;
      for (let i = 0; i < n; i++) { const x = i / n, tt = t + x * 2.4 + Math.random() * 0.06, v = 0.22 * Math.sin(Math.PI * Math.pow(x, 0.7)) + 0.03; cueNz(pn, tt, 'white', 'bandpass', 1700 + Math.random() * 1500, 0.9, v, 0.002, 0.03 + Math.random() * 0.02); cueNz(pn, tt, 'pink', 'bandpass', 700, 0.8, v * 0.5, 0.002, 0.05); }
    },
    laugh: (d, t) => {   // a soft, short, warm laugh: a few gentle breathy "ha"s, not loud, not words
      const ctx = AMB.ctx, pn = ambPanTo(d, Math.random() * 0.4 - 0.2);
      for (let i = 0; i < 4; i++) {
        const tt = t + i * 0.2, v = 0.1 * (1 - i * 0.18), f = 300 - i * 15;
        const o = ctx.createOscillator(), bp = ctx.createBiquadFilter(), g = ctx.createGain();
        o.type = 'sawtooth'; o.frequency.setValueAtTime(f * 1.15, tt); o.frequency.exponentialRampToValueAtTime(f, tt + 0.14);
        bp.type = 'bandpass'; bp.frequency.value = 850; bp.Q.value = 1.6;
        g.gain.setValueAtTime(0, tt); g.gain.linearRampToValueAtTime(v, tt + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, tt + 0.16);
        o.connect(bp); bp.connect(g); g.connect(pn); o.start(tt); o.stop(tt + 0.2);
        cueNz(pn, tt, 'pink', 'bandpass', 1500, 0.8, v * 0.7, 0.02, 0.12);
      }
    },
    sigh: (d, t) => {   // a soft breath out that falls away
      const pn = ambPanTo(d, 0), fl = cueNz(pn, t, 'pink', 'bandpass', 1500, 0.9, 0.2, 0.25, 1.1);
      fl.frequency.setValueAtTime(1500, t); fl.frequency.exponentialRampToValueAtTime(550, t + 1.3);
      const f2 = cueNz(pn, t + 0.05, 'white', 'highpass', 2200, 0.7, 0.025, 0.2, 0.9);
    },
    gasp: (d, t) => {   // a short breath in
      const pn = ambPanTo(d, 0), fl = cueNz(pn, t, 'pink', 'bandpass', 800, 1, 0.22, 0.12, 0.2);
      fl.frequency.setValueAtTime(800, t); fl.frequency.exponentialRampToValueAtTime(2200, t + 0.28);
      cueNz(pn, t, 'white', 'highpass', 2500, 0.7, 0.03, 0.1, 0.18);
    },
    heart: (d, t) => {   // a gentle lub-dub, four times, a little quicker each time
      let o = 0;
      for (let i = 0; i < 4; i++) {
        const tt = t + o, v = 0.5 - i * 0.04;
        ambTone(d, tt, 240, 180, 0.13, v, 'sine', 0.006); cueNz(d, tt, 'brown', 'lowpass', 550, 0.7, v * 0.5, 0.005, 0.1);
        ambTone(d, tt + 0.2, 280, 200, 0.1, v * 0.75, 'sine', 0.006); cueNz(d, tt + 0.2, 'brown', 'lowpass', 600, 0.7, v * 0.35, 0.005, 0.08);
        o += 0.82 - i * 0.04;
      }
    },
    tea: (d, t) => { const pn = ambPanTo(d, Math.random() * 0.8 - 0.4); [[0, 3200, 4800], [0.28, 2900, 4300]].forEach(([o, f, f2]) => { ambTone(pn, t + o, f, 0, 0.35, 0.2, 'sine', 0.002); ambTone(pn, t + o, f2, 0, 0.2, 0.1, 'sine', 0.002); }); }
  };
