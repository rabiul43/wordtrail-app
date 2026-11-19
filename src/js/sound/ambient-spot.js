  /* ---------- ambient-spot.js ----------
     Spot sounds (thunder, bell, creak, clock, heartbeat, doors, footsteps): use a real clip from
     ambient-index.json on R2 when one is loaded; otherwise the generated sound plays, as before.
     It changes only the CUE_SOUND entries listed below, after story-sounds.js has defined them.
     Settings > Sound > Real recordings for story sounds (P.ambSpot) turns it on; it is off by default.
     The first time a sound is needed the generated one plays at once and the clip loads in the background. */

  const AMB_SPOT = { idx: null, idxBusy: false, idxFail: 0, buf: {}, busy: {}, fail: {}, used: {} };

  /* CUE_SOUND name -> index folders (first one present wins), longest seconds to play, volume */
  const AMB_SPOT_MAP = {
    thunder:  { f: ['03_weather/thunder/rolling-thunder', '03_weather/thunder/distant-low-thunder', '03_weather/thunder/sharp-thunderclap'], max: 14, vol: 0.7 },
    bell:     { f: ['18_micro-sound-effects/bell-strike', '15_religious/bells/distant-bell'], max: 9, vol: 0.6 },
    creak:    { f: ['18_micro-sound-effects/floorboard-creak', '06_indoor-rooms/old-house/floorboard-creaks'], max: 4, vol: 0.6 },
    clock:    { f: ['18_micro-sound-effects/clock-tick', '11_fire/clock/wall-clock'], max: 5, vol: 0.5 },
    heart:    { f: ['12_horror/suspense/slow-heartbeat'], max: 6, vol: 0.7 },
    steps:    { f: ['18_micro-sound-effects/footstep-approaching', '10_human-activity/walking-styles/slow-footsteps'], max: 6, vol: 0.6 },
    dooropen: { f: ['18_micro-sound-effects/door-opening'], max: 7, vol: 0.6 },
    doorshut: { f: ['18_micro-sound-effects/door-closing'], max: 7, vol: 0.6 },
    slam:     { f: ['18_micro-sound-effects/heavy-door-slam'], max: 3, vol: 0.7 },
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
      const r = await fetch(AMB_R2 + 'ambient-index.json', { signal: ctl.signal }); clearTimeout(to);
      if (!r.ok) throw new Error('http ' + r.status);
      const all = await r.json(), d = {};
      Object.keys(want).forEach(f => { const e = all[f]; if (e && e.url) d[f] = { url: e.url, license: e.license || '', author: e.author || '' }; });
      AMB_SPOT.idx = d; store.set('wt:ambspot', { t: Date.now(), d });
    } catch (e) { AMB_SPOT.idxFail = Date.now(); }
    AMB_SPOT.idxBusy = false;
  }

  function ambSpotPrep(buf, max) {   // one-shot: no loop blend; level the peak, cut to the longest length with a short fade
    const sr = buf.sampleRate, ch = buf.numberOfChannels, len = Math.min(buf.length, Math.floor(max * sr));
    let pk = 0; for (let c = 0; c < ch; c++) { const a = buf.getChannelData(c); for (let i = 0; i < len; i++) { const v = Math.abs(a[i]); if (v > pk) pk = v; } }
    const gain = Math.max(0.2, Math.min(4, 0.9 / (pk || 0.9))), fade = Math.min(len, Math.floor(0.25 * sr));
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
        if (!r.ok) throw new Error('http ' + r.status);
        if (cache) { try { await cache.put(entry.url, r.clone()); sndTouch(entry.url); sndCachePrune(); } catch (e) { /* full or blocked */ } }
        resp = r;
      }
      AMB_SPOT.buf[key] = ambSpotPrep(await AMB.ctx.decodeAudioData(await resp.arrayBuffer()), AMB_SPOT_MAP[key].max);
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
        const ctx = AMB.ctx, g = ctx.createGain(), s = ctx.createBufferSource(), m = AMB_SPOT_MAP[key], pj = AMB.pj || 1;
        s.buffer = buf; s.playbackRate.value = pj; g.gain.value = m.vol;
        s.connect(g); g.connect(d); s.start(t); s.stop(t + buf.duration / pj + 0.05);
      } catch (e) { genFn(d, t, n); }
    };
  }

  Object.keys(AMB_SPOT_MAP).forEach(k => { if (CUE_SOUND[k]) CUE_SOUND[k] = ambSpotWrap(k, CUE_SOUND[k]); });

  setTimeout(() => { if (P.ambSpot === true) ambSpotLoadIdx(); }, 7000);   // only when the switch is on; not blocking
