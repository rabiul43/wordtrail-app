  /* ---------- ambient-recordings.js ----------
     Ambient: real recordings instead of generated sound: load, level, test file, Settings. */
  /* ---------- real recordings ----------
     Sound source (Settings > Audio): Generated = only the sounds made on the device; Hybrid = a real recording where one
     exists, the generated sound for the rest; Recordings = real recordings only. Recordings are listed in recordings.json
     in the repo (a sound name, a file, who made it and its licence), downloaded once and kept in the browser cache so they
     work offline. For trying one out, a file or a link can be set for a single sound. Only the steady sounds can be
     recordings; one-off sounds (thunder, bell, birds, creaks, drips, clock, heartbeat) are always generated. */
  const AMB_REC_KEYS = new Set(['rain', 'wind', 'waves', 'river', 'night', 'fire', 'cafe', 'drone', 'engine', 'brown', 'crowd', 'train']);
  const AMB_REC_NAMES = { rain: 'Rain', wind: 'Wind', waves: 'Waves', river: 'River', night: 'Night', fire: 'Fire', cafe: 'Café', drone: 'Drone', engine: 'Engine room', brown: 'Brown noise', crowd: 'Crowd', train: 'Train' };
  const ambRecBuf = k => (P.ambSrc === 'gen' || !AMB_REC_KEYS.has(k)) ? null : (AMB.rec[k] || null);
  function ambRecSrc(k) {   // where this sound's recording comes from: the reader's own test file or link first, then the repo list
    const u = (P.ambRecUser || {})[k];
    if (u && u.kind === 'file') return { key: 'https://wt-rec.invalid/user/' + k, url: '', name: u.name, own: true };
    if (u && u.kind === 'url' && u.url) return { key: u.url, url: u.url, name: u.url, own: true };
    const m = AMB.recMap[k]; return m ? { key: m.url, url: m.url, name: m.by ? m.by + ' (' + (m.license || 'CC0') + ')' : (m.license || ''), own: false } : null;
  }
  function ambRecPrep(buf) {   // level it to a steady loudness, and blend the end into the start so the loop has no seam
    const sr = buf.sampleRate, len = buf.length, ch = buf.numberOfChannels;
    let sum = 0, n = 0; const d0 = buf.getChannelData(0); for (let i = 0; i < len; i += 7) { sum += d0[i] * d0[i]; n++; }
    const rms = Math.sqrt(sum / Math.max(1, n)) || 0.1, gain = Math.max(0.15, Math.min(5, 0.12 / rms));
    const fade = buf.duration > 6 ? Math.floor(Math.min(1.5, buf.duration * 0.2) * sr) : 0, nl = len - fade;
    const out = AMB.ctx.createBuffer(ch, Math.max(1, nl), sr);
    for (let c = 0; c < ch; c++) {
      const a = buf.getChannelData(c), o = out.getChannelData(c);
      for (let i = 0; i < nl; i++) o[i] = a[i] * gain;
      for (let i = 0; i < fade; i++) { const t = i / fade, wi = Math.sin(t * Math.PI / 2), wo = Math.cos(t * Math.PI / 2); o[i] = (a[i] * wi + a[nl + i] * wo) * gain; }
    }
    return out;
  }
  function ambRecLayer(k, buf) {
    const ctx = AMB.ctx, g = ctx.createGain(); g.gain.value = 0; g.connect(AMB.duck); AMB.g[k] = g;
    const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.connect(g); s.start(0, Math.random() * Math.max(0.1, buf.duration - 0.5));
    AMB.live[k] = { nodes: [s], lfos: [], off: 0, rec: true };
  }
  async function ambRecLoad(k) {
    if (!AMB.ctx || AMB.rec[k] || AMB.recBusy[k] || Date.now() - (AMB.recFail[k] || 0) < 60000) return;
    const u = ambRecSrc(k); if (!u) return;
    AMB.recBusy[k] = true; ambRecPaint();
    try {
      let resp = null, cache = null;
      try { cache = await caches.open('wt-amb-rec'); resp = await cache.match(u.key); if (resp) sndTouch(u.key); } catch (e) { /* no cache here: download each time */ }
      if (!resp) {
        if (!u.url) throw new Error('missing');
        const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 30000);
        const r = await fetch(u.url, { signal: ctl.signal }); clearTimeout(to);
        if (!r.ok) throw new Error('http ' + r.status);
        if (cache) { try { await cache.put(u.key, r.clone()); sndTouch(u.key); sndCachePrune(); } catch (e) { /* too big or blocked: still play it */ } }
        resp = r;
      }
      const buf = await AMB.ctx.decodeAudioData(await resp.arrayBuffer());
      AMB.rec[k] = ambRecPrep(buf); delete AMB.recFail[k];
    } catch (e) { AMB.recFail[k] = Date.now(); }
    AMB.recBusy[k] = false; ambRecPaint(); ambSrcRefresh(k);
  }
  function ambSrcRefresh(k) {   // the source or a recording changed: rebuild the steady sounds so they use the right one
    if (!AMB.built) return;
    Object.keys(AMB.live).forEach(x => { if (AMB_REC_KEYS.has(x) && (!k || x === k)) ambLayerOff(x); });
    ambApply(0.6);
  }
  async function ambRecManifest() {
    const set = (d, base) => { if (!d || typeof d !== 'object') return; AMB.recMap = {}; Object.keys(d).forEach(k => { const m = d[k]; if (AMB_REC_KEYS.has(k) && m && m.file) { try { AMB.recMap[k] = { url: new URL(m.file, base).href, by: m.by || '', license: m.license || '' }; } catch (e) { /* bad address */ } } }); };
    try {
      const c = store.get('wt:ambrec', null);
      if (c && c.d) set(c.d, c.base);
      if (c && Date.now() - c.t < 24 * 3600e3) return;
      const base = 'https://raw.githubusercontent.com/' + ghCfg().repo + '/main/';
      const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 8000);
      const r = await fetch(base + 'recordings.json', { signal: ctl.signal }); clearTimeout(to);
      if (!r.ok) return;
      const d = await r.json(); set(d, base); store.set('wt:ambrec', { t: Date.now(), d, base }); ambRecPaint();
    } catch (e) { /* offline, or no recordings.json in the repo yet */ }
  }
  function ambRecPaint() {
    $$('#seg-ambsrc button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === (P.ambSrc || 'hybrid'))));
    const sel = $('#amb-rec-k'), st = $('#amb-rec-st'); if (!sel || !st) return;
    const k = sel.value, u = ambRecSrc(k), nm = AMB_REC_NAMES[k] || k;
    st.textContent = AMB.recBusy[k] ? nm + ': getting the recording...' : AMB.rec[k] ? nm + ': ' + (u && u.own ? 'your test recording' : 'real recording') + (u && u.name ? ' (' + u.name + ')' : '') + '.' : u ? (AMB.recFail[k] ? nm + ': the recording could not be loaded, so ' + (P.ambSrc === 'rec' ? 'it is silent.' : 'the generated sound plays.') : nm + ': a recording is set; it loads when the sound plays.') : nm + ': no recording yet, so the generated sound plays.';
    const any = Object.keys(P.ambRecUser || {}).length > 0; const rs = $('#amb-rec-reset'); if (rs) rs.disabled = !(P.ambRecUser || {})[k];
    const note = $('#amb-src-note'); if (note) note.textContent = (P.ambSrc || 'hybrid') === 'gen' ? 'Only sounds made on this device.' : (P.ambSrc === 'rec' ? 'Real recordings only. Sounds with no recording are silent, except one-off sounds like thunder.' : 'Real recordings where there is one, generated sound for the rest.');
  }
  async function ambRecPick(file) {
    const k = $('#amb-rec-k').value; if (!file) return;
    try {
      if (!ambBuild()) throw new Error('no audio');
      const ab = await file.arrayBuffer();
      const buf = await AMB.ctx.decodeAudioData(ab.slice(0));
      try { const c = await caches.open('wt-amb-rec'); await c.put('https://wt-rec.invalid/user/' + k, new Response(ab, { headers: { 'content-type': file.type || 'audio/mpeg' } })); } catch (e) { /* works for this session only */ }
      AMB.rec[k] = ambRecPrep(buf); delete AMB.recFail[k];
      P.ambRecUser = Object.assign({}, P.ambRecUser, { [k]: { kind: 'file', name: file.name } }); ambRecUse(k);
    } catch (e) { toast('That file could not be read as audio.', 3500); }
  }
  function ambRecUse(k) {   // after a test recording is set: make sure it is heard, then open the mixer so it can be played
    if (P.ambSrc === 'gen') P.ambSrc = 'hybrid';
    const L = Object.assign({}, ambLevels()); if (!(L[k] > 0)) { P.amb = Object.assign({}, P.amb, { [k]: 60 }); }
    savePrefs(); ambRecPaint(); ambSrcRefresh(k);
    toast('Test recording ready. Opening the mixer so you can hear it.', 3000);
    closeSheets(); ambOpen(); setTimeout(() => ambAudition(k), 500);
  }
  function ambRecInit() {
    const sel = $('#amb-rec-k'); if (!sel) return;
    AMB_REC_KEYS.forEach(k => { const o = document.createElement('option'); o.value = k; o.textContent = AMB_REC_NAMES[k] || k; sel.append(o); });
    sel.addEventListener('change', ambRecPaint);
    $$('#seg-ambsrc button').forEach(b => b.addEventListener('click', () => { P.ambSrc = b.dataset.v; savePrefs(); ambRecPaint(); ambSrcRefresh(); if (P.ambSrc !== 'gen') ambRecManifest(); }));
    const f = $('#amb-rec-file');
    $('#amb-rec-pick').addEventListener('click', () => { f.value = ''; f.click(); });
    f.addEventListener('change', () => ambRecPick(f.files && f.files[0]));
    $('#amb-rec-url').addEventListener('click', async () => {
      const k = sel.value, u = (prompt('Link to an audio file (https, MP3, M4A, WAV or OGG). The site must allow other sites to use it.') || '').trim();
      if (!u) return;
      if (!/^https:\/\//i.test(u)) { toast('The link must start with https://', 3000); return; }
      try { if (!ambBuild()) throw 0; const r = await fetch(u); if (!r.ok) throw 0; const ab = await r.arrayBuffer(); const buf = await AMB.ctx.decodeAudioData(ab.slice(0));
        try { const c = await caches.open('wt-amb-rec'); await c.put(u, new Response(ab, { headers: { 'content-type': r.headers.get('content-type') || 'audio/mpeg' } })); } catch (e) { /* session only */ }
        AMB.rec[k] = ambRecPrep(buf); delete AMB.recFail[k]; P.ambRecUser = Object.assign({}, P.ambRecUser, { [k]: { kind: 'url', url: u, name: u.replace(/^https:\/\//i, '').slice(0, 40) } }); ambRecUse(k);
      } catch (e) { toast('That link could not be loaded as audio.', 3500); }
    });
    $('#amb-rec-reset').addEventListener('click', () => { const k = sel.value, o = Object.assign({}, P.ambRecUser); delete o[k]; P.ambRecUser = o; delete AMB.rec[k]; try { caches.open('wt-amb-rec').then(c => c.delete('https://wt-rec.invalid/user/' + k)); } catch (e) { /* nothing cached */ } savePrefs(); ambRecPaint(); ambSrcRefresh(k); if (P.ambSrc !== 'gen') ambRecLoad(k); });
    ambRecPaint();
  }
