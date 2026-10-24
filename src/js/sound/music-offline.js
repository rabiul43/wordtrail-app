  /* ---------- music-offline.js ----------
     Music: "Download music for offline" in the Music panel. */
  /* ---------- Offline music ----------
     "Download music for offline" saves clips into the 'wt-music' cache and puts their addresses on a keep list
     (localStorage 'wt-music-keep', see sndKeepSet in sound-cache.js). The 150 MB prune never removes a clip on that list.
     The keep list itself is limited to SND_KEEP_CAP, and the panel says so before it starts. Clips are encoded at 128 kbps. */
  const MUS_BYTES_PER_SEC = 16000;
  function musOffMoods() { const m = (MUS.manifest && MUS.manifest.moods) || {}; return Object.keys(m).filter(musHas); }
  function musOffClips(moods) {   // each clip once, even when it sits under two moods
    const m = (MUS.manifest && MUS.manifest.moods) || {}, seen = new Set(), out = [];
    moods.forEach(k => (m[k] || []).forEach(c => { if (c && c.f && !seen.has(c.f)) { seen.add(c.f); out.push({ f: c.f, bytes: Math.round((+c.dur || 90) * MUS_BYTES_PER_SEC) }); } }));
    return out;
  }
  const musMB = n => Math.round(n / 1048576);
  function musOffMsg(t) { const e = $('#mus-off-msg'); if (e) e.textContent = t || ''; }
  async function musKeptInfo() {   // the clips of the current list that are saved for offline: how many and how big
    const keep = sndKeepSet(), want = new Set(musOffClips(musOffMoods()).map(c => new Request(musClipUrl(c.f)).url));
    let n = 0, bytes = 0;
    for (const x of await sndCacheList()) if (x.cache === 'wt-music' && keep.has(x.url)) { bytes += x.size; if (want.has(x.url)) n++; }
    return { n, bytes, total: want.size };
  }
  function musOffPaint(again) {
    try {
      const box = $('#mus-off-moods'); if (!box) return;
      const est = $('#mus-off-est'), have = $('#mus-off-have'), go = $('#mus-off-go'), cancel = $('#mus-off-cancel'), clr = $('#mus-off-clear'), when = $('#mus-off-when');
      cancel.hidden = !MUS.dl; go.disabled = !!MUS.dl;
      if (!MUS.manifest) {
        const sm0 = $('#mus-off-sum'); if (sm0 && !again) sm0.textContent = 'Loading\u2026';
        box.textContent = ''; box.dataset.sig = ''; have.textContent = ''; clr.hidden = true; go.disabled = true; when.hidden = true;
        est.textContent = again ? 'The music list could not load. Connect to the internet and try again.' : 'Loading the music list…';
        if (!again && !MUS.offBusy) { MUS.offBusy = true; musFetchManifest().then(() => { MUS.offBusy = false; musOffPaint(true); }); }
        return;
      }
      const moods = musOffMoods(), sig = moods.join(',');
      if (!MUS.dlPick) MUS.dlPick = new Set();
      if (box.dataset.sig !== sig) {   // build the mood choices once per list; a mood new to the list starts ticked
        const old = (box.dataset.sig || '').split(','); moods.forEach(k => { if (old.indexOf(k) < 0) MUS.dlPick.add(k); });
        box.dataset.sig = sig; box.textContent = '';
        moods.forEach(k => {
          const cb = h('input', { type: 'checkbox' }); cb.checked = MUS.dlPick.has(k); cb.dataset.k = k;
          box.append(h('label', { class: 'amb-opt' }, cb, h('span', { text: MUS_MOOD_NAME[k] || k }), h('small', { class: 'spd-s', text: '~' + Math.max(1, musMB(musOffClips([k]).reduce((a, c) => a + c.bytes, 0))) + ' MB' })));
        });
      }
      when.hidden = !MUS.mfT;
      if (MUS.mfT) { const d = $('#mus-off-date'); if (d) d.textContent = new Date(MUS.mfT).toLocaleDateString(document.documentElement.lang || undefined, { day: 'numeric', month: 'short', year: 'numeric' }); }
      musKeptInfo().then(k => {
        const picked = musOffClips([...MUS.dlPick].filter(x => moods.indexOf(x) >= 0)), keep = sndKeepSet();
        const todo = picked.filter(c => !keep.has(new Request(musClipUrl(c.f)).url));
        const need = todo.reduce((a, c) => a + c.bytes, 0), over = k.bytes + need > SND_KEEP_CAP;
        est.textContent = over ? 'That is more than the 100 MB limit. Choose fewer moods.'
          : !picked.length ? 'Choose at least one mood.'
          : !todo.length ? 'All of this music is already saved.'
          : 'Selected: ' + todo.length + (todo.length === 1 ? ' clip' : ' clips') + ', about ' + Math.max(1, musMB(need)) + ' MB';
        go.disabled = !!MUS.dl || over || !todo.length;
        have.textContent = k.n ? 'Saved on this device: ' + k.n + ' of ' + k.total + (k.total === 1 ? ' clip' : ' clips') + ' (' + musMB(k.bytes) + ' MB)' : '';
        clr.hidden = !k.n || !!MUS.dl;
        const sm = $('#mus-off-sum'); if (sm) {   // the one-line status on the Offline music row
          const keepNow = sndKeepSet(), full = moods.filter(m => { const c = musOffClips([m]); return c.length && c.every(x => keepNow.has(new Request(musClipUrl(x.f)).url)); }).length;
          sm.textContent = k.n ? full + (full === 1 ? ' mood saved' : ' moods saved') + ' \u00b7 ' + musMB(k.bytes) + ' MB' : 'Not saved yet';
        }
      }).catch(() => { /* the numbers are a help only */ });
    } catch (err) { /* the offline panel must never break the sound screen */ }
  }
  async function musOffRun() {
    if (MUS.dl) return;
    if (MUS_LOCAL) { musOffMsg('Offline music is not available in local test mode.'); return; }
    if (!self.caches) { musOffMsg('This browser cannot save music for offline.'); return; }
    if (navigator.onLine === false) { musOffMsg('You are offline. Connect to the internet to download music.'); return; }
    const ctl = new AbortController(); MUS.dl = { ctl }; musOffPaint();
    let c = null, done = 0, bytes = 0, failed = 0, full = false, list = [];
    try {
      musOffMsg('Checking the music list…');
      await musFetchManifest(true);   // a fresh list first, so new clips are included
      const moods = musOffMoods().filter(k => MUS.dlPick && MUS.dlPick.has(k));
      list = musOffClips(moods);
      c = await caches.open('wt-music');
      const keep = sndKeepSet();
      for (const clip of list) {
        if (ctl.signal.aborted) break;
        const url = musClipUrl(clip.f);
        try {
          if (!(await c.match(url))) {   // a clip that already played once is in the cache: only mark it as kept
            const resp = await fetch(url, { signal: ctl.signal });
            if (!resp.ok) throw new Error('http ' + resp.status);
            const buf = await resp.arrayBuffer();
            await c.put(url, new Response(buf, { headers: { 'content-type': 'audio/mpeg', 'content-length': String(buf.byteLength) } }));
            bytes += buf.byteLength;
          }
          keep.add(new Request(url).url); sndKeepSave(keep); sndTouch(url); done++;
        } catch (err) {
          if (ctl.signal.aborted) break;
          if (err && err.name === 'QuotaExceededError') { full = true; break; }
          failed++;
        }
        musOffMsg('Saving music: ' + (done + failed) + ' of ' + list.length + ' clips (' + musMB(bytes) + ' MB)');
      }
    } catch (err) { failed++; }
    const cancelled = ctl.signal.aborted;
    MUS.dl = null;
    musOffMsg(cancelled ? 'Download cancelled. Music already saved stays on this device.'
      : full ? 'Not enough space on this device. Remove some files and try again.'
      : failed || !list.length ? 'Some music could not be downloaded. Check your connection and try again.'
      : 'Music saved. It now plays without a connection.');
    try { await sndCachePrune(true); } catch (err) { /* best effort */ }
    musOffPaint(); sndCacheSizePaint();
  }
  async function musOffClear() {
    if (!confirm('Remove the music saved for offline? It downloads again when needed.')) return;
    try {
      const keep = sndKeepSet(), c = await caches.open('wt-music');
      for (const url of keep) { try { await c.delete(url); } catch (err) { /* skip */ } }
      try { localStorage.removeItem(SND_KEEP_KEY); } catch (err) { /* ignore */ }
    } catch (err) { /* ignore */ }
    musOffMsg(''); musOffPaint(); sndCacheSizePaint(); toast('Saved music removed.');
  }
  function musOffInit() {
    const go = $('#mus-off-go'); if (!go) return;
    go.addEventListener('click', musOffRun);
    $('#mus-off-cancel').addEventListener('click', () => { if (MUS.dl) MUS.dl.ctl.abort(); });
    $('#mus-off-clear').addEventListener('click', musOffClear);
    $('#mus-off-moods').addEventListener('change', e => {
      const cb = e.target.closest('input[data-k]'); if (!cb || !MUS.dlPick) return;
      if (cb.checked) MUS.dlPick.add(cb.dataset.k); else MUS.dlPick.delete(cb.dataset.k);
      musOffMsg(''); musOffPaint();
    });
    window.addEventListener('online', () => {   // the connection is back: a mood that failed to load is tried again at once
      try {
        musWarnPaint(); musOffPaint();
        if (P.musOn === true && sndOn() && MUS.on && musNarrating() && (MUS.fail || !MUS.playing) && osLeadWait() <= 0) {
          if (!MUS.manifest) musManifestRetry(); else { clearTimeout(MUS.rt); musSwitchMood(MUS.mood || 'neutral', true); }
        }
      } catch (err) { /* a help only */ }
    });
    window.addEventListener('offline', () => { musWarnPaint(); musOffPaint(); });
  }

