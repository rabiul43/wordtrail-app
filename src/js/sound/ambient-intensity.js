  /* ---------- ambient-intensity.js ----------
     Ambient: intensity slider, the levels actually played (ambLive), night and time of day. */
  /* Intensity and time of day. One slider turns the whole mix down to a hush or up to the full scene: the steady
     sounds (rain, wind, waves) simply get louder, while the extra details (thunder, creaks, a bell) only come in
     as it goes up. At night the mix gets a little quieter and warmer (the high end is softened), if switched on.
     The sliders and saved mixes stay as set; this only changes what is played. */
  const AMB_ONSET = { cannon: 0.55, clang: 0.5, hooves: 0.4, steps: 0.4, crowd: 0.1, train: 0.1, thunder: 0.55, bell: 0.5, heartbeat: 0.5, creaks: 0.45, drips: 0.35, clock: 0.3, birds: 0.25, night: 0.2, fire: 0.1, cafe: 0.1 };
  function ambNight() {   // 0 by day, 1 in the middle of the night, easing in and out over two hours
    const d = new Date(), h = d.getHours() + d.getMinutes() / 60;
    if (h >= 22 || h < 5) return 1;
    if (h >= 20) return (h - 20) / 2;
    if (h < 7) return (7 - h) / 2;
    return 0;
  }
  function ambLive() {   // the levels that are actually played: the mix, scaled by intensity and by the night setting
    const L = ambBase(), i = Math.max(0, Math.min(1, (P.ambInt == null ? 100 : P.ambInt) / 100 * ambMoodShape().i)) * (1 - 0.25 * (P.ambTod !== false ? (AMB.nf || 0) : 0)), o = {};
    AMB_SOUNDS.forEach(([k]) => { const on = AMB_ONSET[k] || 0; o[k] = i <= on ? 0 : (L[k] || 0) * Math.pow((i - on) / (1 - on), 0.8); });
    const a = AMB.aud; if (a && Date.now() < a.until) { if (a.solo) for (const k in o) o[k] = 0; o[a.k] = Math.max(o[a.k], a.lv); }   // a sound being tried: alone when the book is paused, on top of the mix when it plays
    return o;
  }
  function ambStoryNight() {   // 1 when the story itself is at night (and scenes are on, and the reader's own mix is not held), else 0
    const A = AMB.auto;
    return P.ambTod !== false && P.ambAuto !== false && A && !A.hold && !A.fix && A.time === 'night' ? 1 : 0;
  }
  function ambTod(quiet, slow) {   // follow the clock and the story; called when the sound starts and every few seconds while it plays. slow: the story changed time of day, so ramp over several seconds
    const nf = P.ambTod === false ? 0 : Math.max(ambNight(), ambStoryNight());
    if (AMB.nf != null && Math.abs(nf - AMB.nf) < 0.02) return;
    AMB.nf = nf;
    if (AMB.warm) AMB.warm.gain.setTargetAtTime(-6 * nf, AMB.ctx.currentTime, slow ? 4 : 2);
    if (!quiet) ambApply(slow ? 4 : 3);
  }
  function ambTonight() { return (P.ambTod !== false && ambNight() > 0.5) ? (AMB_SCENES.find(s => s.k === 'sleep') || null) : null; }
