  /* ---------- smart-mix.js ----------
     Smart mix: keeps the narrator on top and music and ambient sound at a steady, comfortable distance below it, whatever the
     recording, the music clip or the scene.

     What it measures (every 250 ms, only while the book plays and the narrator is speaking):
       voice   the narrator's level, from the voice analyser (vgraph), plus the Loudness evener's current gain
       music   the level of the music bus after its ducking (tap on MUS.duck)
       ambient the level of the ambient bus after its ducking (tap on AMB.master)
     What it does: every ~2 s it compares each bus with its target and moves a small trim (dB) for that bus, slowly
     (at most 1.5 dB a step, never more than -15 .. +9 dB). The trim is a multiplier inside musBusLevel() / ambGain()
     (through sndBalMus() / sndBalAmb() in sound-core.js), so the saved sliders never change.
     The target of each bus is "this many dB under the voice" (SMX_REL), moved by the user's own slider: a slider at its usual
     position gives the balanced mix, and moving it still makes the sound louder or quieter on purpose.
     The trims learned for a book are remembered (wt:smx:<book id>), so the next start is already right.
     Without a voice analyser (no CORS audio graph) it does nothing and the fixed balance in sound-core.js applies instead. */
  const SMX_REL = { mus: -18, amb: -22 };     // dB below the narrator, with the slider at its reference position
  const SMX_REF = { mus: 0.40, amb: 0.70 };   // the reference slider positions (the defaults of musVol() and ambVol())
  const SMX_LIM = { lo: -15, hi: 9, dead: 1.5, step: 1.5, first: 6, need: 16 };
  const SMX = { t: { mus: 0, amb: 0 }, lin: { mus: 1, amb: 1 }, r: { v: [], mus: [], amb: [] }, tap: { mus: null, amb: null }, fresh: { mus: true, amb: true }, live: false, book: null, ticks: 0, saved: 0, buf: null, vbuf: null };
  const smxOn = () => P.smartMix !== false && sndOn();
  const smxLive = () => smxOn() && SMX.live;
  const smxLin = db => Math.pow(10, db / 20);
  const smxMed = (a, q) => a.slice().sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * q))];

  /* The new trim for one bus: pure arithmetic, so it can be tested without any audio.
     V voice level (dB), L this bus's measured level (dB), vol its slider (0..1), cur its present trim, first = the first move for this book. */
  function smxPlan(k, V, L, vol, cur, first) {
    const target = V + SMX_REL[k] + 20 * Math.log10(Math.max(vol, 0.02) / SMX_REF[k]);
    const err = target - L;
    if (Math.abs(err) < SMX_LIM.dead) return cur;
    const cap = first ? SMX_LIM.first : SMX_LIM.step;
    return Math.max(SMX_LIM.lo, Math.min(SMX_LIM.hi, cur + Math.max(-cap, Math.min(cap, err * 0.4))));
  }
  function smxDb(an, key) {   // level (dB, RMS) of the last few milliseconds of an analyser
    if (!an) return null;
    const n = an.fftSize; let sum = 0;
    if (an.getFloatTimeDomainData) {
      let b = SMX[key]; if (!b || b.length !== n) b = SMX[key] = new Float32Array(n);
      an.getFloatTimeDomainData(b); for (let i = 0; i < n; i++) sum += b[i] * b[i];
    } else {
      let b = SMX[key + 'B']; if (!b || b.length !== n) b = SMX[key + 'B'] = new Uint8Array(n);
      an.getByteTimeDomainData(b); for (let i = 0; i < n; i++) { const v = (b[i] - 128) / 128; sum += v * v; }
    }
    return 20 * Math.log10(Math.sqrt(sum / n) + 1e-9);
  }
  function smxTap(k, ctx, node) {   // a listening-only analyser on the bus (it is not connected to the speakers)
    const t = SMX.tap[k];
    if (t && t.node === node) return t.an;
    if (!ctx || !node) return null;
    try { const an = ctx.createAnalyser(); an.fftSize = 1024; an.smoothingTimeConstant = 0; node.connect(an); SMX.tap[k] = { node, an }; return an; } catch (e) { return null; }
  }
  function smxApply(tc) { try { musBusApply(tc); ambMaster(tc); } catch (e) { /* the buses may not exist yet */ } }
  function smxPaint() {
    const f = v => (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(Math.round(v)) + ' dB';
    const tx = !smxOn() ? '' : !SMX.live ? 'Starts when the book plays and the narrator is heard.' : 'Adjusting by itself: music ' + f(SMX.t.mus) + ', sounds ' + f(SMX.t.amb) + '.';
    $$('.smx-st').forEach(el => { el.textContent = tx; });
    $$('.smx-sw').forEach(c => { c.checked = P.smartMix !== false; });   // the switch on the Ambient sound and Music tabs always agree
  }
  function smxBook() {   // a new book: start from what was learned for it last time
    const id = S.book ? String(S.book.id) : null;
    if (id === SMX.book) return;
    SMX.book = id; SMX.r = { v: [], mus: [], amb: [] }; SMX.fresh = { mus: true, amb: true };
    const m = id ? store.get('wt:smx:' + id, null) : null;
    SMX.t = { mus: m && typeof m.m === 'number' ? m.m : 0, amb: m && typeof m.a === 'number' ? m.a : 0 };
    if (m) SMX.fresh = { mus: false, amb: false };
    SMX.lin = { mus: smxLin(SMX.t.mus), amb: smxLin(SMX.t.amb) };
    smxApply(0.3);
  }
  function smxTick() {
    try {
      smxBook();
      const live = smxOn() && !!S.book && !!vgraph;
      if (live !== SMX.live) { SMX.live = live; smxPaint(); }
      if (!live || document.hidden || audio.paused || audio.seeking || S.loadingAudio) return;
      const vf = smxDb(vgraph, 'vbuf');
      if (vf == null || vf < -48) return;                                   // the narrator is not speaking right now: hold everything
      const r = SMX.r; r.v.push(vf); if (r.v.length > 40) r.v.shift();
      const mAn = MUS.on && MUS.live ? smxTap('mus', MUS.ctx, MUS.duck) : null, aAn = AMB.on && AMB.built ? smxTap('amb', AMB.ctx, AMB.master) : null;
      if (mAn && musVol() > 0) { const l = smxDb(mAn, 'buf'); if (l > -75) { r.mus.push(l); if (r.mus.length > 40) r.mus.shift(); } }
      if (aAn && ambVol() > 0) { const l = smxDb(aAn, 'buf'); if (l > -75) { r.amb.push(l); if (r.amb.length > 40) r.amb.shift(); } }
      if (++SMX.ticks % 8) return;                                          // decide every 2 s
      if (r.v.length < SMX_LIM.need) return;
      let ev = 0; try { if (P.level && enh && enh.lev) ev = 20 * Math.log10(Math.max(enh.lev.gain.value, 0.01)); } catch (e) { ev = 0; }
      const V = smxMed(r.v, 0.8) + ev;
      let moved = false;
      [['mus', musVol()], ['amb', ambVol()]].forEach(([k, vol]) => {
        if (r[k].length < SMX_LIM.need) return;
        const nt = smxPlan(k, V, smxMed(r[k], 0.5), vol, SMX.t[k], SMX.fresh[k]);
        SMX.fresh[k] = false;
        if (nt !== SMX.t[k]) { SMX.t[k] = nt; SMX.lin[k] = smxLin(nt); moved = true; }
        r[k] = [];                                                          // the next reading must come from the new level
      });
      if (moved) {
        smxApply(1.2); smxPaint();
        if (S.book && Date.now() - SMX.saved > 10000) { SMX.saved = Date.now(); store.set('wt:smx:' + S.book.id, { m: Math.round(SMX.t.mus * 10) / 10, a: Math.round(SMX.t.amb * 10) / 10 }); }
      }
    } catch (e) { /* the smart mix is a help, never a reason to stop anything */ }
  }
  setInterval(smxTick, 250);
  $$('.smx-sw').forEach(sw => sw.addEventListener('change', e => {
    P.smartMix = e.target.checked; savePrefs();
    if (!P.smartMix) { SMX.t = { mus: 0, amb: 0 }; SMX.lin = { mus: 1, amb: 1 }; SMX.r = { v: [], mus: [], amb: [] }; }
    SMX.live = false; try { sndBalSync(); } catch (err) { /* optional */ }
    smxApply(1); smxPaint();
  }));
