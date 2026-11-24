  /* ---------- ambient-spot.js ----------
     Spot sounds (thunder, bell, creak, clock, heartbeat, doors, footsteps): use a real clip from
     ambient-index.json on R2 when one is loaded; otherwise the generated sound plays, as before.
     It changes only the CUE_SOUND entries listed below, after story-sounds.js has defined them.
     Settings > Sound > Real recordings for story sounds (P.ambSpot) turns it on; it is off by default.
     The first time a sound is needed the generated one plays at once and the clip loads in the background. */

  const AMB_SPOT = { idx: null, idxBusy: false, idxFail: 0, buf: {}, busy: {}, fail: {}, used: {} };

  /* CUE_SOUND name -> index folders (first one present wins), longest seconds to play, and a small level offset in dB on top of the measured level
     (it replaces the old hand-set volume: 0.7 became 0 dB, 0.6 became -1.3 dB, 0.5 became -2.9 dB, so the sounds keep their order of loudness) */
  const AMB_SPOT_MAP = {
    thunder:  { f: ['03_weather/thunder/rolling-thunder', '03_weather/thunder/distant-low-thunder', '03_weather/thunder/sharp-thunderclap'], max: 14, off: 0 },
    bell:     { f: ['18_micro-sound-effects/bell-strike', '15_religious/bells/distant-bell'], max: 9, off: -1.3 },
    creak:    { f: ['18_micro-sound-effects/floorboard-creak', '06_indoor-rooms/old-house/floorboard-creaks'], max: 4, off: -1.3 },
    clock:    { f: ['18_micro-sound-effects/clock-tick', '11_fire/clock/wall-clock'], max: 5, off: -2.9 },
    heart:    { f: ['12_horror/suspense/slow-heartbeat'], max: 6, off: 0 },
    steps:    { f: ['18_micro-sound-effects/footstep-approaching', '10_human-activity/walking-styles/slow-footsteps'], max: 6, off: -1.3 },
    dooropen: { f: ['18_micro-sound-effects/door-opening'], max: 7, off: -1.3 },
    doorshut: { f: ['18_micro-sound-effects/door-closing'], max: 7, off: -1.3 },
    slam:     { f: ['18_micro-sound-effects/heavy-door-slam'], max: 3, off: 0 },
  };

  function ambSpotEntry(key) {   // first folder of this sound that is in the loaded index
    const m = AMB_SPOT_MAP[key]; if (!AMB_SPOT.idx || !m) return null;
    for (const f of m.f) { const e = AMB_SPOT.idx[f]; if (e && e.url) return e; }
    return null;
  }

  async function ambSpotLoadIdx() {   // ambient-index.json once; only the folders used here are kept for offline
    if (AMB_SPOT.idx || AMB_SPOT.idxBusy || Date.now() - AMB_SPOT.idxFail < 60000) return;
    AMB_SPOT.idxBusy = true;
    const want = {}; Object.keys(AMB_SPOT_MAP).forEach(k => AMB_SPOT_MAP[k].f.forEach(f => { want[f] = 1; }));
    try {
      const c = store.get('wt:ambspot', null);
      if (c && c.d) AMB_SPOT.idx = c.d;
      if (c && Date.now() - c.t < 24 * 3600e3) { AMB_SPOT.idxBusy = false; return; }
      const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 10000);
      const r = await fetch(AMB_R2 + 'ambient-index.json', { signal: ctl.signal, cache: 'no-cache' }); clearTimeout(to);
      if (!r.ok) throw new Error('http ' + r.status);
      const all = await r.json(), d = {};
      Object.keys(want).forEach(f => { const e = all[f]; if (e && e.url) d[f] = { url: e.url, license: e.license || '', author: e.author || '' }; });
      AMB_SPOT.idx = d; store.set('wt:ambspot', { t: Date.now(), d });
    } catch (e) { AMB_SPOT.idxFail = Date.now(); }
    AMB_SPOT.idxBusy = false;
  }

  /* A clip answered "not found": it was removed from the library, so the saved list is old. Mark it old and get the new list
     (at most once in 10 minutes). The sound itself already falls back to the generated one. */
  function ambSpotGone() {
    if (AMB_SPOT.goneT && Date.now() - AMB_SPOT.goneT < 600e3) return;
    AMB_SPOT.goneT = Date.now();
    try { const c = store.get('wt:ambspot', null); if (c && c.d) store.set('wt:ambspot', { t: 0, d: c.d }); } catch (e) { /* nothing saved */ }
    AMB_SPOT.idx = null; ambSpotLoadIdx();
  }

  /* How loud a spot clip is played: its speech-band level (300-4000 Hz, the part that hides the narrator) is brought to AMB_SPOT_REF, plus the small
     offset of its sound, and its loudest sample is held under a ceiling. That ceiling is what the old peak levelling gave (0.9 x volume 0.7 = 0.63), so a clip is
     never louder at its peak than before; a clip that is short and spiky gets less gain than its level asks for. The reference sits near the generated
     ambient beds (cafe -21.8 dB), so a spot sound is heard without covering the voice. Still to be checked against the real clips (see CHANGES-ambient-loudness.md). */
  const AMB_SPOT_REF = -22, AMB_SPOT_PEAK = 0.63, AMB_SPOT_LIMIT = { minDb: -30, maxDb: 30 };
  function ambSpotLevel(chans, sr, len) {   // speech-band level in dB of mean power, all channels, silence ignored (same method as tools/ambient_prep.py); null when there is nothing to measure
    try {
      const nch = chans.length, bl = Math.max(1, Math.round(sr / 10)), nb = Math.ceil(len / bl), pw = new Float64Array(nb);
      if (!nch || !(len > 0) || !(sr > 0)) return null;
      const co = (hp, f) => { const w = 2 * Math.PI * f / sr, c = Math.cos(w), al = Math.sin(w) / (2 * 0.7071), a0 = 1 + al, b0 = (hp ? 1 + c : 1 - c) / 2 / a0; return [b0, (hp ? -(1 + c) : 1 - c) / a0, b0, -2 * c / a0, (1 - al) / a0]; };
      const H = co(true, 300), L = co(false, Math.min(4000, sr * 0.45));   // high-pass 300 Hz, then low-pass 4 kHz (second order, like the browser's own filters)
      for (let c = 0; c < nch; c++) {
        const d = chans[c]; let x1 = 0, x2 = 0, y1 = 0, y2 = 0, u1 = 0, u2 = 0, v1 = 0, v2 = 0;
        for (let i = 0; i < len; i++) {
          const x = d[i], y = H[0] * x + H[1] * x1 + H[2] * x2 - H[3] * y1 - H[4] * y2; x2 = x1; x1 = x; y2 = y1; y1 = y;
          const v = L[0] * y + L[1] * u1 + L[2] * u2 - L[3] * v1 - L[4] * v2; u2 = u1; u1 = y; v2 = v1; v1 = v;
          pw[(i / bl) | 0] += v * v;
        }
      }
      const db = p => (p > 1e-12 ? 10 * Math.log10(p) : -120), p = [];
      for (let b = 0; b < nb; b++) { const n = (b === nb - 1 ? len - b * bl : bl) * nch; p.push(pw[b] / n); }
      if (p.some(x => !isFinite(x))) return null;
      const loud = p.filter(x => db(x) >= -70); if (!loud.length) return null;
      const avg = db(loud.reduce((a, x) => a + x, 0) / loud.length), keep = loud.filter(x => db(x) >= avg - 20);   // drop silence, then the quiet gaps between sounds
      return db(keep.reduce((a, x) => a + x, 0) / keep.length);
    } catch (e) { return null; }
  }
  function ambSpotGain(off, level, peak) {   // the multiplier for a clip: off = its dB offset, level = ambSpotLevel (or null), peak = its loudest sample
    try {
      const cap = AMB_SPOT_PEAK * Math.pow(10, off / 20);   // the loudest sample allowed after levelling
      let g = typeof level === 'number' && isFinite(level) ? Math.pow(10, Math.max(AMB_SPOT_LIMIT.minDb, Math.min(AMB_SPOT_LIMIT.maxDb, AMB_SPOT_REF + off - level)) / 20) : (peak > 0 ? cap / peak : 1);   // no level to go by: level the peak, as before
      if (peak > 0) g = Math.min(g, cap / peak);
      return g > 0 && isFinite(g) ? g : 1;
    } catch (e) { return 1; }
  }

  function ambSpotPrep(buf, max, off) {   // one-shot: no loop blend; level it by its speech-band loudness (peak held under a ceiling), cut to the longest length with a short fade
    const sr = buf.sampleRate, ch = buf.numberOfChannels, len = Math.min(buf.length, Math.floor(max * sr));
    const chans = []; for (let c = 0; c < ch; c++) chans.push(buf.getChannelData(c));
    let pk = 0; for (let c = 0; c < ch; c++) { const a = chans[c]; for (let i = 0; i < len; i++) { const v = Math.abs(a[i]); if (v > pk) pk = v; } }
    const gain = ambSpotGain(off || 0, ambSpotLevel(chans, sr, len), pk), fade = Math.min(len, Math.floor(0.25 * sr));
    const out = AMB.ctx.createBuffer(ch, Math.max(1, len), sr);
    for (let c = 0; c < ch; c++) {
      const a = buf.getChannelData(c), o = out.getChannelData(c);
      for (let i = 0; i < len; i++) o[i] = a[i] * gain;
      if (len < buf.length) for (let i = 0; i < fade; i++) o[len - 1 - i] *= i / fade;   // only when cut short
    }
    return out;
  }

  async function ambSpotLoad(key) {   // fetch, decode and keep one clip; the sound itself never waits for this
    if (!AMB_SPOT.idx) await ambSpotLoadIdx();
    if (!AMB_SPOT.idx || !AMB.ctx || AMB_SPOT.buf[key] || AMB_SPOT.busy[key] || Date.now() - (AMB_SPOT.fail[key] || 0) < 60000) return;
    const entry = ambSpotEntry(key); if (!entry) return;
    AMB_SPOT.busy[key] = true;
    try {
      let resp = null, cache = null;
      try { cache = await caches.open('wt-amb-rec'); resp = await cache.match(entry.url); if (resp) sndTouch(entry.url); } catch (e) { /* no cache here */ }
      if (!resp) {
        const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 15000);
        const r = await fetch(entry.url, { signal: ctl.signal }); clearTimeout(to);
        if (!r.ok) { if (r.status === 404) ambSpotGone(); throw new Error('http ' + r.status); }
        if (cache) { try { await cache.put(entry.url, r.clone()); sndTouch(entry.url); sndCachePrune(); } catch (e) { /* full or blocked */ } }
        resp = r;
      }
      AMB_SPOT.buf[key] = ambSpotPrep(await AMB.ctx.decodeAudioData(await resp.arrayBuffer()), AMB_SPOT_MAP[key].max, AMB_SPOT_MAP[key].off);
      AMB_SPOT.used[key] = { author: entry.author, license: entry.license };
      delete AMB_SPOT.fail[key];
    } catch (e) { AMB_SPOT.fail[key] = Date.now(); }
    AMB_SPOT.busy[key] = false;
  }

  function ambSpotWrap(key, genFn) {   // same signature as CUE_SOUND: (destination, start time, count)
    return function (d, t, n) {
      const buf = AMB_SPOT.buf[key];
      if (P.ambSpot !== true || P.ambSrc === 'gen' || (key === 'bell' && n > 1)) { genFn(d, t, n); return; }   // switch off (the default) or generated-only mode; a counted bell stays generated
      if (!buf) { ambSpotLoad(key); genFn(d, t, n); return; }   // not ready: generated now, the clip loads for next time
      try {
        const ctx = AMB.ctx, g = ctx.createGain(), s = ctx.createBufferSource(), pj = AMB.pj || 1;
        s.buffer = buf; s.playbackRate.value = pj; g.gain.value = 1;   // the level is already in the buffer (ambSpotPrep)
        s.connect(g); g.connect(d); s.start(t); s.stop(t + buf.duration / pj + 0.05);
      } catch (e) { genFn(d, t, n); }
    };
  }

  Object.keys(AMB_SPOT_MAP).forEach(k => { if (CUE_SOUND[k]) CUE_SOUND[k] = ambSpotWrap(k, CUE_SOUND[k]); });

  setTimeout(() => { if (P.ambSpot === true) ambSpotLoadIdx(); }, 7000);   // only when the switch is on; not blocking
