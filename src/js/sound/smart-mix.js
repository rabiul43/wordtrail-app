  /* ---------- smart-mix.js ----------
     Smart mix: keeps the narrator on top and music and ambient sound at a steady, comfortable distance below it, whatever the
     recording, the music clip or the scene.

     All levels are measured in the speech band (300 - 4000 Hz, SMX_BAND), not over the whole signal.

     What it measures (every 250 ms, only while the book plays and the narrator is speaking; the timer itself runs only while audio plays):
       voice   the narrator's level as heard: the analyser after the enhancement chain (enh.mon: evener, EQ, compressor, make-up gain, limiter);
               if that is missing, the raw analyser (vgraph) plus the Loudness evener's current gain
       music   the level of the music bus after its ducking (tap on MUS.duck), with the dip taken out again (see SMX_NOM)
       ambient the level of the ambient bus after its ducking (tap on AMB.master), with the dip taken out again
     What it does: every ~2 s it compares each bus with its target and moves a small trim (dB) for that bus, slowly
     (at most 1.5 dB a step, never more than -15 .. +9 dB). The trim is a multiplier inside musBusLevel() / ambGain()
     (through sndBalMus() / sndBalAmb() in sound-core.js), so the saved sliders never change (and stay free: see smxFree).
     The target of each bus is "this many dB under the voice" (SMX_REL, and a little lower for both while music and sounds play together: SMX_BOTH), moved by the user's own slider: a slider at its usual
     position gives the balanced mix, and moving it still makes the sound louder or quieter on purpose.
     The trims learned for a book are remembered (wt:smx:<book id>), so the next start is already right.
     Without a voice analyser (no CORS audio graph) it does nothing and the fixed balance in sound-core.js applies instead. */
  const SMX_REL = { mus: -18, amb: -22 };     // dB below the narrator, with the slider at its reference position
  /* The duck (the dip under the narrator) is taken out of each reading, so Smart mix works on the level BEFORE the dip and the listener's own dip
   keeps its effect. Without this the dip would be undone: the music gets quieter under the voice, Smart mix sees it and turns it up again.
   Each bus is aimed at "target + the dip it has when nothing is changed": SMX_NOM is that dip as a gain (music: the Normal setting of
   MUS_DIP, 0.28 = -11 dB; ambient: the plain speaking dip of ambDuckVec, 0.68 = -3.3 dB). So with the Normal dip the result is exactly as before
   (saved trims stay valid); a Quiet dip (-7 dB) leaves the music about 4 dB louder under the voice, a Strong dip (-16 dB) about 5 dB lower.
   With the duck switched off nothing is taken out and nothing added: the level while the narrator speaks is still the target. */
const SMX_NOM = { mus: 0.28, amb: 0.68 };
const SMX_BOTH = { mus: -2, amb: -1 };      // extra dB under the voice for each bus while BOTH are heard: together they then sit about where one alone would (music -20 and sounds -23 add up to about -18)
const SMX_REF = { mus: 0.40, amb: 0.70 };   // the reference slider positions (the defaults of musVol() and ambVol())
  const SMX_LIM = { lo: -15, hi: 9, dead: 1.5, step: 1.5, first: 6, need: 16 };
  const SMX = { t: { mus: 0, amb: 0 }, lin: { mus: 1, amb: 1 }, r: { v: [], mus: [], amb: [] }, tap: { mus: null, amb: null }, fresh: { mus: true, amb: true }, live: false, book: null, ticks: 0, saved: 0, buf: null, vbuf: null, dec: { mus: 0, amb: 0 }, learned: false, src: null, dirty: false };
  const smxOn = () => P.smartMix !== false && sndOn();
  const smxLive = () => smxOn() && SMX.live;
  const smxLin = db => Math.pow(10, db / 20);
  const smxMed = (a, q) => a.slice().sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * q))];

  /* The new trim for one bus: pure arithmetic, so it can be tested without any audio.
     V voice level (dB), L this bus's measured level (dB), vol its slider (0..1), cur its present trim, first = the first move for this book,
     both = music and ambient are both being heard (the listener hears their sum, so each one sits a little lower, SMX_BOTH),
     lift = the dip the bus normally has (dB, positive), added when L is a level from which the present dip was taken out (see SMX_NOM). */
  function smxPlan(k, V, L, vol, cur, first, both, lift) {
    const target = V + SMX_REL[k] + (both ? SMX_BOTH[k] : 0) + (lift || 0) + 20 * Math.log10(Math.max(vol, 0.02) / SMX_REF[k]);
    const err = target - L;
    if (Math.abs(err) < SMX_LIM.dead) return cur;
    const cap = first ? SMX_LIM.first : SMX_LIM.step;
    return Math.max(SMX_LIM.lo, Math.min(SMX_LIM.hi, cur + Math.max(-cap, Math.min(cap, err * 0.4))));
  }
  /* Level (dB) of the last ~40 ms (2048 samples) of an analyser, counted in the speech band only (SMX_BAND, Hz). That band carries the
     consonants, and it is where music and room sounds hide them; rumble and bass would otherwise count as much as the band that matters.
     It reads the analyser's spectrum (bins inside the band), turned into the same scale as a plain RMS reading: the one-sided spectrum
     is x2 and the Blackman window (its mean square is 0.3046) is divided out, so a sine inside the band reads as its own RMS and the
     fixed gates (-48 / -75 dB) keep their meaning. Without a float spectrum it falls back to the old whole-signal RMS. */
  const SMX_BAND = { lo: 300, hi: 4000 }, SMX_WIN = 0.3046;
  function smxDb(an, key) {
    if (!an) return null;
    const n = an.fftSize;
    if (an.getFloatFrequencyData) {
      const m = an.frequencyBinCount; let b = SMX[key + 'F']; if (!b || b.length !== m) b = SMX[key + 'F'] = new Float32Array(m);
      an.getFloatFrequencyData(b);
      const hz = (an.context && an.context.sampleRate ? an.context.sampleRate : 48000) / n;
      const i0 = Math.max(1, Math.floor(SMX_BAND.lo / hz)), i1 = Math.min(m - 1, Math.ceil(SMX_BAND.hi / hz));
      let sum = 0; for (let i = i0; i <= i1; i++) { const d = b[i]; if (d > -200) sum += Math.pow(10, d / 10); }
      return 10 * Math.log10(2 * sum / SMX_WIN + 1e-18);
    }
    let sum = 0;
    if (an.getFloatTimeDomainData) {
      let b = SMX[key]; if (!b || b.length !== n) b = SMX[key] = new Float32Array(n);
      an.getFloatTimeDomainData(b); for (let i = 0; i < n; i++) sum += b[i] * b[i];
    } else {
      let b = SMX[key + 'B']; if (!b || b.length !== n) b = SMX[key + 'B'] = new Uint8Array(n);
      an.getByteTimeDomainData(b); for (let i = 0; i < n; i++) { const v = (b[i] - 128) / 128; sum += v * v; }
    }
    return 20 * Math.log10(Math.sqrt(sum / n) + 1e-9);
  }
  function smxUntap(k) {   // let go of the analyser on a bus: it is disconnected from its node, so nothing keeps feeding it
    const t = SMX.tap[k]; if (!t) return;
    SMX.tap[k] = null;
    try { t.node.disconnect(t.an); } catch (e) { /* the node may be gone already */ }
  }
  function smxTap(k, ctx, node) {   // a listening-only analyser on the bus (it is not connected to the speakers)
    const t = SMX.tap[k];
    if (t && t.node === node) return t.an;
    if (t) smxUntap(k);   // the bus was rebuilt (a new node): the old analyser must not stay attached to the old one
    if (!ctx || !node) return null;
    try { const an = ctx.createAnalyser(); an.fftSize = 2048; an.smoothingTimeConstant = 0; node.connect(an); SMX.tap[k] = { node, an }; return an; } catch (e) { return null; }
  }
  function smxGainOf(k) { try { const n = k === 'mus' ? MUS.duck : AMB.duck; return n && n.gain ? n.gain.value : null; } catch (e) { return null; } }
  const smxDuckOn = k => (k === 'mus' ? P.musDuck !== false : P.ambDuck !== false) && smxGainOf(k) != null;
  const smxDuckDb = k => smxDuckOn(k) ? 20 * Math.log10(Math.max(smxGainOf(k), 0.05)) : 0;    // the dip the bus has right now (dB, usually negative)
  const smxLift = k => smxDuckOn(k) ? -20 * Math.log10(SMX_NOM[k]) : 0;
  function smxApply(tc) { try { musBusApply(tc); ambMaster(tc); } catch (e) { /* the buses may not exist yet */ } }
  /* The music and ambient sliders stay free while Smart mix is on. The target of each bus already follows its slider (smxPlan), so a slider
     at its usual position gives the balanced mix, and moving it makes the sound a little louder or quieter than balanced, on purpose.
     An older version locked the sliders at their usual position and kept the listener's own values in P.smxSaved: smxFree puts those back
     once and removes the note, so nobody is left with a slider stuck at a value they never chose. */
  const SMX_SLIDERS = ['#mus-vol', '#amb-vol', '#qk-mus-vol', '#qk-amb-vol'];
  function smxFree() {
    if (!P.smxSaved) return;
    const o = P.smxSaved; delete P.smxSaved;
    if (o.m == null) delete P.musVol; else P.musVol = o.m;
    if (o.a == null) delete P.ambVol; else P.ambVol = o.a;
    savePrefs();
    SMX_SLIDERS.forEach(q => { const e = $(q); if (!e) return; e.value = String(q.includes('mus') ? (P.musVol == null ? 40 : P.musVol) : (P.ambVol == null ? 70 : P.ambVol)); e.style.opacity = ''; });
    try { musVolPaint(); } catch (e) { /* optional */ }
    try { qkPaint(); } catch (e) { /* optional */ }
    try { musBusApply(0.1); ambMaster(0.1); } catch (e) { /* the buses may not exist yet */ }
  }
  function smxPaint() {
    try { smxFree(); } catch (e) { /* optional */ }
    const f = v => (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(Math.round(v)) + ' dB';
    const tx = !smxOn() ? '' : !SMX.live ? 'Starts when the book plays and the narrator is heard.' : 'Adjusting by itself: music ' + f(SMX.t.mus) + ', sounds ' + f(SMX.t.amb) + '.';
    $$('.smx-st').forEach(el => { el.textContent = tx; });
    $$('.smx-sw').forEach(c => { c.checked = P.smartMix !== false; });   // the switch on the Ambient sound and Music tabs always agree
  }
  /* Each source has its own trim. A storm and a quiet forest, or one music clip and the next, are not equally loud, so one trim for the
     whole book would be wrong for some of them. SMX.src[k] follows what is playing on bus k:
       key  who is playing now: for the music the clip's file name, for the ambient sounds the (up to three) loudest sounds of the scene
       mem  the trim each source settled on (by key), kept for the book, at most SMX_MEM of them (the oldest go first), saved with the book
       n    decisions made since this source began; hold  readings are ignored until then (the crossfade); need  readings wanted for the next decision
     When a source ends, its trim is remembered (if it had at least 3 decisions). When one begins, a remembered trim is put back at once; a new
     source is read again from scratch, quickly (2 s of readings, a first move of up to SMX_LIM.first). The music clips are already levelled by
     their LUFS gain (music-bus.js), so for the music this mostly adds a quick re-check; the ambient scenes are the ones that differ a lot. */
  const SMX_MEM = 12, SMX_SRC_MIN = 3, SMX_SRC_HOLD = 2000, SMX_SRC_NEED = 8;
  const smxSrcNew = () => ({ key: '', n: 0, mem: {}, hold: 0, need: SMX_LIM.need });
  SMX.src = { mus: smxSrcNew(), amb: smxSrcNew() };
  function smxSrcKey(k) {
    try {
      if (k === 'mus') return MUS.playing && MUS.playing._file ? String(MUS.playing._file) : '';
      const L = ambLive();
      return AMB_SOUNDS.map(([n]) => [n, L[n] || 0]).filter(x => x[1] > 0.15).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, 3).map(x => x[0]).sort().join('+');
    } catch (e) { return ''; }
  }
  function smxRemember(st, key, val) { delete st.mem[key]; st.mem[key] = val; const ks = Object.keys(st.mem); while (ks.length > SMX_MEM) delete st.mem[ks.shift()]; }
  function smxSnap(k) { const st = SMX.src[k], o = Object.assign({}, st.mem); if (st.key) o[st.key] = SMX.t[k]; return o; }   // every trim of this book, the present one included
  function smxMean(k) { const v = Object.values(smxSnap(k)); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : SMX.t[k]; }
  function smxSrcStep(k) {   // true when the trim of bus k was changed because a remembered source came back
    const st = SMX.src[k], key = smxSrcKey(k);
    if (key === st.key) return false;
    const first = !st.key;   // nothing was playing on this bus before: the book's own trim still stands
    if (st.key && st.n >= SMX_SRC_MIN) smxRemember(st, st.key, SMX.t[k]);
    st.key = key; st.n = 0; SMX.r[k] = [];
    if (!key) { st.need = SMX_LIM.need; return false; }
    if (!first) { st.hold = performance.now() + SMX_SRC_HOLD; st.need = SMX_SRC_NEED; }
    if (st.mem[key] != null) { SMX.t[k] = st.mem[key]; SMX.lin[k] = smxLin(SMX.t[k]); SMX.fresh[k] = false; st.need = SMX_LIM.need; return true; }
    if (!first) SMX.fresh[k] = true;
    return false;
  }

  /* What a new book starts from, when nothing was learned for it yet: the average of the trims that earlier books settled on
     (wt:smx:global, a running average of the last 8 books, each bus kept within +-6 dB). A book counts once, when the listener leaves it
     (another book, or the page closes), and only for a bus that had at least 5 decisions, so a bus that was off teaches nothing. */
  const SMX_GLOBAL = 'wt:smx:global', SMX_GL = 6, SMX_GN = 8, SMX_GMIN = 5;
  const smxClamp = (v, m) => Math.max(-m, Math.min(m, v));
  function smxGlobal() { const g = store.get(SMX_GLOBAL, null) || {}; return { m: typeof g.m === 'number' ? smxClamp(g.m, SMX_GL) : 0, a: typeof g.a === 'number' ? smxClamp(g.a, SMX_GL) : 0, n: typeof g.n === 'number' ? Math.max(0, Math.min(SMX_GN, g.n)) : 0 }; }
  function smxLearn() {
    if (!SMX.book || SMX.learned) return;
    const use = { mus: SMX.dec.mus >= SMX_GMIN, amb: SMX.dec.amb >= SMX_GMIN };
    if (!use.mus && !use.amb) return;
    SMX.learned = true;
    const g = smxGlobal(), w = 1 / (g.n + 1);
    const m = use.mus ? smxClamp(g.m + (smxMean('mus') - g.m) * w, SMX_GL) : g.m, a = use.amb ? smxClamp(g.a + (smxMean('amb') - g.a) * w, SMX_GL) : g.a;
    store.set(SMX_GLOBAL, { m: Math.round(m * 10) / 10, a: Math.round(a * 10) / 10, n: Math.min(SMX_GN, g.n + 1) });
  }
  /* Saves what was learned for the present book (wt:smx:<id>). Only when something changed since the last save (SMX.dirty). It is called
     while playing (at most every 10 s), and also on a pause, when the page is hidden or closed, and when another book opens, so the last
     seconds of learning are never lost. SMX.book (not S.book) is the book the trims belong to: S.book may already be the next one. */
  /* Every book leaves one small note (wt:smx:<id>). Without a limit they would stay forever, so the ids are kept in a list
     (wt:smxidx, newest last) and only the last SMX_KEEP books keep their note; older notes are removed. These notes are not part of the
     account sync (see the categories in 295-account-sync.js), so removing them here is safe. Notes written by older versions are
     added to the list once, when the page starts (smxIndexInit). */
  const SMX_KEEP = 150, SMX_IDX = 'wt:smxidx', SMX_NOTE = 'wt:smx:';
  function smxIndexTouch(id) {
    let idx = store.get(SMX_IDX, null); if (!Array.isArray(idx)) idx = [];
    idx = idx.filter(x => x !== id); idx.push(id);
    while (idx.length > SMX_KEEP) { const old = idx.shift(); try { localStorage.removeItem(SMX_NOTE + old); } catch (e) { /* storage unavailable */ } }
    store.set(SMX_IDX, idx);
  }
  function smxIndexInit() {
    if (Array.isArray(store.get(SMX_IDX, null))) return;
    const ids = [];
    try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith(SMX_NOTE) && k !== SMX_NOTE + 'global') ids.push(k.slice(SMX_NOTE.length)); } } catch (e) { return; }
    let idx = ids; while (idx.length > SMX_KEEP) { const old = idx.shift(); try { localStorage.removeItem(SMX_NOTE + old); } catch (e) { /* storage unavailable */ } }
    store.set(SMX_IDX, idx);
  }
  function smxSave() {
    if (!SMX.dirty || !SMX.book || !SMX.src) return;
    SMX.dirty = false; SMX.saved = Date.now();
    const rd = o => { const q = {}; Object.keys(o).forEach(key => { q[key] = Math.round(o[key] * 10) / 10; }); return q; };
    smxIndexTouch(SMX.book);
    store.set('wt:smx:' + SMX.book, { m: Math.round(smxMean('mus') * 10) / 10, a: Math.round(smxMean('amb') * 10) / 10, s: { mus: rd(smxSnap('mus')), amb: rd(smxSnap('amb')) } });
  }
  function smxBook() {   // a new book: start from what was learned for it last time (or, for a book never heard before, from the average of the others)
    const id = S.book ? String(S.book.id) : null;
    if (id === SMX.book) return;
    try { smxLearn(); } catch (e) { /* learning is a help */ }
    try { smxSave(); } catch (e) { /* saving is a help */ }
    SMX.book = id; SMX.dec = { mus: 0, amb: 0 }; SMX.learned = false; SMX.src = { mus: smxSrcNew(), amb: smxSrcNew() }; SMX.r = { v: [], mus: [], amb: [] }; SMX.fresh = { mus: true, amb: true };
    const m = id ? store.get('wt:smx:' + id, null) : null;
    const g = m ? null : smxGlobal();
    SMX.t = { mus: m && typeof m.m === 'number' ? m.m : g ? g.m : 0, amb: m && typeof m.a === 'number' ? m.a : g ? g.a : 0 };
    if (m) SMX.fresh = { mus: false, amb: false };
    if (m && m.s && typeof m.s === 'object') ['mus', 'amb'].forEach(k => { const o = m.s[k]; if (o && typeof o === 'object') Object.keys(o).slice(0, SMX_MEM).forEach(key => { if (typeof o[key] === 'number') SMX.src[k].mem[key] = Math.max(SMX_LIM.lo, Math.min(SMX_LIM.hi, o[key])); }); });
    SMX.lin = { mus: smxLin(SMX.t.mus), amb: smxLin(SMX.t.amb) };
    smxApply(0.3);
  }
  function smxTick() {
    try {
      smxBook(); if (P.smxSaved) smxFree();
      const live = smxOn() && !!S.book && !!vgraph;
      if (live !== SMX.live) { SMX.live = live; smxPaint(); try { sndBalSync(); } catch (e) { /* the balance is a help */ } }
      if (!live || document.hidden || audio.paused || audio.seeking || S.loadingAudio) return;
      const heard = !!(enh && enh.mon);                                     // true: the voice is read after the whole enhancement chain, as the listener hears it
      const vf = smxDb(heard ? enh.mon : vgraph, 'vbuf');
      if (vf == null || vf < -48) return;                                   // the narrator is not speaking right now: hold everything
      let back = false; if (SMX.ticks % 4 === 0) { back = smxSrcStep('mus') || back; back = smxSrcStep('amb') || back; }   // every second: has a source begun or ended?
      if (back) { SMX.dirty = true; smxApply(1.2); smxPaint(); }
      const r = SMX.r; r.v.push(vf); if (r.v.length > 40) r.v.shift();
      const mAn = MUS.on && MUS.live ? smxTap('mus', MUS.ctx, MUS.duck) : null, aAn = AMB.on && AMB.built ? smxTap('amb', AMB.ctx, AMB.master) : null;
      if (mAn && musVol() > 0 && performance.now() >= SMX.src.mus.hold) { const l = smxDb(mAn, 'buf'); if (l > -75) { r.mus.push(l - smxDuckDb('mus')); if (r.mus.length > 40) r.mus.shift(); } }
      if (aAn && ambVol() > 0 && performance.now() >= SMX.src.amb.hold) { const l = smxDb(aAn, 'buf'); if (l > -75) { r.amb.push(l - smxDuckDb('amb')); if (r.amb.length > 40) r.amb.shift(); } }
      if (++SMX.ticks % 8) return;                                          // decide every 2 s
      if (r.v.length < SMX_LIM.need) return;   // (the voice is read for the whole book, so this is only the first seconds)
      let ev = 0;   // only the raw tap (vgraph) needs the evener's gain added; the heard tap already contains it
      if (!heard) { try { if (P.level && enh && enh.lev) ev = 20 * Math.log10(Math.max(enh.lev.gain.value, 0.01)); } catch (e) { ev = 0; } }
      const V = smxMed(r.v, 0.8) + ev;
      let moved = false;
      const both = r.mus.length >= SMX.src.mus.need && r.amb.length >= SMX.src.amb.need;   // decided before the readings are cleared below
      [['mus', musVol()], ['amb', ambVol()]].forEach(([k, vol]) => {
        if (r[k].length < SMX.src[k].need) return;
        const nt = smxPlan(k, V, smxMed(r[k], 0.5), vol, SMX.t[k], SMX.fresh[k], both, smxLift(k));
        SMX.fresh[k] = false; SMX.dec[k]++; SMX.src[k].n++; SMX.src[k].need = SMX_LIM.need;
        if (nt !== SMX.t[k]) { SMX.t[k] = nt; SMX.lin[k] = smxLin(nt); moved = true; }
        r[k] = [];                                                          // the next reading must come from the new level
      });
      if (moved) {
        smxApply(1.2); smxPaint();
        SMX.dirty = true; if (Date.now() - SMX.saved > 10000) smxSave();   // at most every 10 s while playing; a pause, a hidden page, a closed page and a new book save the rest (below)
      }
    } catch (e) { /* the smart mix is a help, never a reason to stop anything */ }
  }
  const smxLeave = () => { try { smxSave(); smxLearn(); } catch (e) { /* optional */ } };
  window.addEventListener('pagehide', smxLeave);
  document.addEventListener('visibilitychange', () => { if (document.hidden) smxLeave(); });
  try { audio.addEventListener('pause', () => { try { smxSave(); } catch (e) { /* optional */ } }); } catch (e) { /* the player may not exist yet */ }
  idleTimer(smxTick, 250);   // only while the book plays (see idleTimer in sound-core.js)
  $$('.smx-sw').forEach(sw => sw.addEventListener('change', e => {
    P.smartMix = e.target.checked; savePrefs();
    if (!P.smartMix) { SMX.t = { mus: 0, amb: 0 }; SMX.lin = { mus: 1, amb: 1 }; SMX.r = { v: [], mus: [], amb: [] }; SMX.dec = { mus: 0, amb: 0 }; SMX.src = { mus: smxSrcNew(), amb: smxSrcNew() }; }   // off: the trims are zero again, so nothing learned from this book
    if (!P.smartMix) { smxUntap('mus'); smxUntap('amb'); }   // switched off: no analysers left on the buses
    SMX.live = false; try { sndBalSync(); } catch (err) { /* optional */ }
    smxApply(1); smxPaint();
  }));
  setTimeout(() => { try { smxFree(); } catch (e) { /* optional */ } try { smxIndexInit(); } catch (e) { /* optional */ } }, 0);
