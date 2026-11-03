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
  async function musSaveClips(list, ctl, step) {   // saves each clip in the 'wt-music' cache and on the keep list; step(done + failed, bytes) after each one
    const c = await caches.open('wt-music');
    let done = 0, bytes = 0, failed = 0, full = false;
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
        const keep = sndKeepSet(); keep.add(new Request(url).url); sndKeepSave(keep); sndTouch(url); done++;   // read again each time: two saves must not overwrite each other
        if (MUS.have) MUS.have.add(new Request(url).url);
      } catch (err) {
        if (ctl.signal.aborted) break;
        if (err && err.name === 'QuotaExceededError') { full = true; break; }
        failed++;
      }
      if (step) step(done + failed, bytes);
    }
    return { done, bytes, failed, full };
  }
  async function musOffRun() {
    if (MUS.dl) return;
    if (MUS_LOCAL) { musOffMsg('Offline music is not available in local test mode.'); return; }
    if (!self.caches) { musOffMsg('This browser cannot save music for offline.'); return; }
    if (navigator.onLine === false) { musOffMsg('You are offline. Connect to the internet to download music.'); return; }
    const ctl = new AbortController(); MUS.dl = { ctl }; musOffPaint();
    let r = { done: 0, bytes: 0, failed: 0, full: false }, list = [];
    try {
      musOffMsg('Checking the music list…');
      await musFetchManifest(true);   // a fresh list first, so new clips are included
      const moods = musOffMoods().filter(k => MUS.dlPick && MUS.dlPick.has(k));
      list = musOffClips(moods);
      r = await musSaveClips(list, ctl, (n, bytes) => musOffMsg('Saving music: ' + n + ' of ' + list.length + ' clips (' + musMB(bytes) + ' MB)'));
    } catch (err) { r.failed++; }
    const cancelled = ctl.signal.aborted, failed = r.failed, full = r.full;
    MUS.dl = null;
    musOffMsg(cancelled ? 'Download cancelled. Music already saved stays on this device.'
      : full ? 'Not enough space on this device. Remove some files and try again.'
      : failed || !list.length ? 'Some music could not be downloaded. Check your connection and try again.'
      : 'Music saved. It now plays without a connection.');
    try { await sndCachePrune(true); } catch (err) { /* best effort */ }
    musOffPaint(); sndCacheSizePaint();
  }
  /* ---------- Music for one book (the "Also save background music" box on the book's download card, 281) ----------
     The moods a book will use are decided paragraph by paragraph from its text, and that text is not read until the book is opened. So the
     card saves the moods the book is LIKELY to use: neutral, what its mood tags in moods.json suggest, and its genre. A mood that was not
     saved is covered offline by musOfflineMood (music-library.js). Only a few clips per mood are saved, spread over quiet to busy,
     so one book adds at most MUS_BOOK_CAP; clips another book already saved cost nothing. */
  const MUS_BOOK_CAP = 40 * 1048576;
  const MUS_FROM_LIB = { cozy: ['peace', 'merry'], spooky: ['dread', 'tension'], adventurous: ['danger', 'chase', 'wonder'], romantic: ['romance', 'peace', 'sorrow'], mysterious: ['tension', 'dread'], funny: ['merry'], thoughtful: ['peace', 'sorrow'] };
  function musBookMoods(b) {   // music moods that have clips, most general first
    const out = [], add = k => { const r = k ? musResolve(k) : ''; if (r && musHas(r) && out.indexOf(r) < 0) out.push(r); };
    add('neutral');
    let tags = null; try { tags = MOODS.ready ? MOODS.data.b[String(b.id)] : null; } catch (e) { tags = null; }
    (tags || []).forEach(i => { const m = MOODS.data.moods[i]; (MUS_FROM_LIB[m && m[0]] || []).forEach(add); });
    add(musGenreMood(b));
    if (out.length < 2) add('peace');
    return out;
  }
  function musSpread(n) {   // 0..n-1 in an order where every prefix is spread out: both ends, the middle, then the gaps
    if (n <= 2) return Array.from({ length: n }, (x, i) => i);
    const out = [0, n - 1], q = [[0, n - 1]];
    while (q.length) { const [a, z] = q.shift(), m = (a + z) >> 1; if (m > a && m < z) { out.push(m); q.push([a, m], [m, z]); } }
    return out;
  }
  function musBookPlan(b) {   // { moods, todo: clips still to save, need: their bytes, have: clips already saved, free: false when the keep list is full }
    const moods = musBookMoods(b), all = (MUS.manifest && MUS.manifest.moods) || {}, keep = sndKeepSet(), urlOf = c => new Request(musClipUrl(c.f)).url;
    const cl = {}; Object.keys(all).forEach(k => (all[k] || []).forEach(c => { if (c && c.f) cl[c.f] = c; }));
    let kept = 0; Object.keys(cl).forEach(f => { if (keep.has(urlOf(cl[f]))) kept += Math.round((+cl[f].dur || 90) * MUS_BYTES_PER_SEC); });   // an estimate, like the Music panel's
    const limit = Math.min(MUS_BOOK_CAP, SND_KEEP_CAP - kept);
    const lists = moods.map(k => (all[k] || []).filter(c => c && c.f).slice().sort((x, y) => (typeof x.e === 'number' ? x.e : 0.5) - (typeof y.e === 'number' ? y.e : 0.5)));
    const order = lists.map(l => musSpread(l.length)), seen = new Set(), todo = [];
    let need = 0, have = 0, used = 0;   // used: the bytes this book's music takes in all, clips saved earlier included, so a second tap adds nothing
    for (let r = 0, more = true; more; r++) {
      more = false;
      for (let i = 0; i < lists.length; i++) {
        const j = order[i][r]; if (j == null) continue;
        more = true;
        const c = lists[i][j]; if (seen.has(c.f)) continue;
        const bytes = Math.round((+c.dur || 90) * MUS_BYTES_PER_SEC);
        if (used + bytes > MUS_BOOK_CAP) continue;
        if (keep.has(urlOf(c))) { seen.add(c.f); have++; used += bytes; continue; }
        if (need + bytes > limit) continue;
        seen.add(c.f); todo.push({ f: c.f, bytes }); need += bytes; used += bytes;
      }
    }
    return { moods, todo, need, have, free: limit > 0 };
  }
  async function musBookRun(b, step) {   // saves the plan; resolves { done, failed, full, cancelled, total } (busy / unsupported when it cannot start)
    if (MUS.dl) return { busy: true };
    if (MUS_LOCAL || !self.caches) return { unsupported: true };
    const ctl = new AbortController(), id = String(b.id); MUS.dl = { ctl, book: id, n: 0, total: 0, bytes: 0 };
    if (step) step();   // the card shows "Saving music" at once
    let r = { done: 0, bytes: 0, failed: 0, full: false }, total = 0;
    try {
      await musFetchManifest(true);   // a fresh list first, so new clips are included
      try { await MOODS.load(); } catch (e) { /* the genre is used */ }
      const plan = musBookPlan(b); total = plan.todo.length; MUS.dl.total = total; if (step) step();
      r = await musSaveClips(plan.todo, ctl, (n, bytes) => { if (MUS.dl) { MUS.dl.n = n; MUS.dl.bytes = bytes; } if (step) step(); });
    } catch (err) { r.failed++; }
    const cancelled = ctl.signal.aborted;
    MUS.dl = null;
    try { await sndCachePrune(true); } catch (err) { /* best effort */ }
    musOffPaint(); sndCacheSizePaint();
    return Object.assign({ total, cancelled }, r);
  }
  async function musOffClear() {
    if (!await askConfirm({ title: 'Remove offline music?', text: 'It downloads again when needed.', ok: 'Remove' })) return;
    try {
      const keep = sndKeepSet(), c = await caches.open('wt-music');
      for (const url of keep) { try { await c.delete(url); } catch (err) { /* skip */ } }
      try { localStorage.removeItem(SND_KEEP_KEY); } catch (err) { /* ignore */ }
    } catch (err) { /* ignore */ }
    musOffMsg(''); musOffPaint(); sndCacheSizePaint(); toast('Saved music removed.');
  }
  function musOffInit() {
    musCacheScan();   // which clips are on the device, for musOfflineMood
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
    window.addEventListener('offline', () => { musCacheScan(); musWarnPaint(); musOffPaint(); });
  }

