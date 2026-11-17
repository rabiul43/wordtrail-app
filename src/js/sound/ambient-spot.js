  /* ---------- ambient-spot.js ----------
     Spot sounds (thunder, bell, creak, drip, clock, heartbeat, door, footstep, birds):
     try a real clip from ambient-index.json on R2; fall back to the generated CUE_SOUND
     when the index is not loaded yet, the folder is absent, or the fetch fails.
     Does NOT change story-engine.js — it patches CUE_SOUND entries after they are defined. */

  const AMB_SPOT = { idx: null, idxBusy: false, idxFail: 0, buf: {}, busy: {}, fail: {} };

  /* Which index folder(s) to try for each spot-sound key (first present wins). */
  const AMB_SPOT_FOLDERS = {
    thunder:   ['03_weather/thunder/rolling-thunder',
                '03_weather/thunder/distant-low-thunder',
                '03_weather/thunder/long-thunder-rumble'],
    bell:      ['05_villages/town-square/bells',
                '06_indoor-rooms/castle/distant-bells',
                '07_historical/monastery/bells'],
    creak:     ['06_indoor-rooms/old-house/floorboard-creaks',
                '12_horror/floorboards/single-creak',
                '12_horror/doors/slow-creaking-door'],
    drip:      ['01_nature/cave-details/slow-water-drips',
                '03_weather/rain-details/dripping-eaves',
                '06_indoor-rooms/basement/dripping-pipes'],
    clock:     ['06_indoor-rooms/study-room/clock-ticking',
                '11_fire/clock-details/soft-ticking',
                '11_fire/clock/wall-clock'],
    heartbeat: ['12_horror/suspense/slow-heartbeat'],
    door:      ['12_horror/doors/slow-creaking-door',
                '12_horror/doors/sudden-door-movement',
                '12_horror/doors/latch'],
    footstep:  ['10_human-activity/spatial-variations/close-footsteps',
                '05_villages/alley-ambience/echoing-footsteps',
                '10_human-activity/walking-styles/slow-footsteps'],
    birds:     ['09_animals/songbirds/forest-birds',
                '01_nature/woodland-wildlife/close-birds',
                '09_animals/songbirds/dawn-chorus'],
  };

  function ambSpotEntry(key) {   // first folder present in the loaded index
    if (!AMB_SPOT.idx) return null;
    for (const f of (AMB_SPOT_FOLDERS[key] || [])) {
      const e = AMB_SPOT.idx[f]; if (e && e.url) return e;
    }
    return null;
  }

  async function ambSpotLoadIdx() {   // fetch ambient-index.json once; 1-min retry on failure
    if (AMB_SPOT.idx || AMB_SPOT.idxBusy || Date.now() - AMB_SPOT.idxFail < 60000) return;
    AMB_SPOT.idxBusy = true;
    try {
      const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 10000);
      const r = await fetch(AMB_R2 + 'ambient-index.json', { signal: ctl.signal }); clearTimeout(to);
      if (!r.ok) throw new Error('http ' + r.status);
      AMB_SPOT.idx = await r.json();
    } catch (e) { AMB_SPOT.idxFail = Date.now(); }
    AMB_SPOT.idxBusy = false;
  }

  async function ambSpotBuf(key) {   // decode and cache one clip; returns AudioBuffer or null
    if (!AMB_SPOT.idx) { await ambSpotLoadIdx(); }
    if (!AMB_SPOT.idx) return null;
    if (AMB_SPOT.buf[key]) return AMB_SPOT.buf[key];
    if (AMB_SPOT.busy[key] || Date.now() - (AMB_SPOT.fail[key] || 0) < 60000) return null;
    const entry = ambSpotEntry(key); if (!entry) return null;
    AMB_SPOT.busy[key] = true;
    try {
      let resp = null, cache = null;
      try { cache = await caches.open('wt-amb-rec'); resp = await cache.match(entry.url); if (resp) sndTouch(entry.url); } catch (e) { /* no cache API */ }
      if (!resp) {
        const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 15000);
        const r = await fetch(entry.url, { signal: ctl.signal }); clearTimeout(to);
        if (!r.ok) throw new Error('http ' + r.status);
        if (cache) { try { await cache.put(entry.url, r.clone()); sndTouch(entry.url); sndCachePrune(); } catch (e) { /* full or blocked */ } }
        resp = r;
      }
      AMB_SPOT.buf[key] = ambRecPrep(await AMB.ctx.decodeAudioData(await resp.arrayBuffer()));
      delete AMB_SPOT.fail[key];
      if (entry.license === 'CC-BY' && entry.author)
        console.info('Wordtrail sound credit:', entry.author, '(' + entry.license + ')');
    } catch (e) { AMB_SPOT.fail[key] = Date.now(); }
    AMB_SPOT.busy[key] = false;
    return AMB_SPOT.buf[key] || null;
  }

  function ambSpotWrap(key, genFn) {   // returns a CUE_SOUND-compatible function
    return function(d, t, n) {
      if (P.ambSrc === 'gen') { genFn(d, t, n); return; }   // generated-only mode
      ambSpotBuf(key).then(buf => {
        if (!buf) { genFn(d, t, n); return; }   // not loaded / no folder -> generated
        try {
          const ctx = AMB.ctx, g = ctx.createGain(), s = ctx.createBufferSource();
          g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.7, t + 0.04);
          g.gain.setValueAtTime(0.7, t + buf.duration * 0.85); g.gain.linearRampToValueAtTime(0, t + buf.duration);
          s.buffer = buf; s.connect(g); g.connect(d); s.start(t); s.stop(t + buf.duration + 0.05);
        } catch (e) { genFn(d, t, n); }
      });
    };
  }

  /* Patch CUE_SOUND after story-sounds.js has defined it. */
  Object.keys(AMB_SPOT_FOLDERS).forEach(k => {
    if (CUE_SOUND[k]) CUE_SOUND[k] = ambSpotWrap(k, CUE_SOUND[k]);
  });

  /* Kick off index fetch soon after the app opens (non-blocking). */
  setTimeout(ambSpotLoadIdx, 7000);
