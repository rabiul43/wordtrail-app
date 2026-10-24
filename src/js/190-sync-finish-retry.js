  /* ---------- finished sync, saved and shared ----------
     Lining the timing files up with the book text is the slow part of opening a synced book. Once it is
     done, the result (a time for every sentence and every word) is kept as one merged record: on this
     device in IndexedDB, and, when a GitHub token is set, as data/<book id>/book.json in the sync
     repository so any other device can load it and skip the alignment completely.
     A record only fits the device that reads it if the book text splits into exactly the same sentences,
     so it carries a signature of the sentence list (and the audio file of every track); on any mismatch
     it is ignored and the normal alignment runs. */
  function bookSig() {
    const m = S.model;
    if (!m) return '';
    if (m._sig) return m._sig;
    let hsh = 2166136261;
    for (const s of m.sents) {
      const t = s.t;
      for (let i = 0; i < t.length; i++) { hsh ^= t.charCodeAt(i); hsh = Math.imul(hsh, 16777619) >>> 0; }
      hsh ^= 10; hsh = Math.imul(hsh, 16777619) >>> 0;
    }
    return (m._sig = 's1:' + m.sents.length + ':' + hsh.toString(36));
  }
  const trackDone = i => !!(S.tdone.get(i) && S.tdone.get(i) === S.anchors[i]);
  function buildMerged() {
    const tracks = {};
    S.secs.forEach((sec, i) => {
      if (!trackDone(i) || !S.ranges[i]) return;
      const w = {}, src = S.wordT[i] || {};
      for (const id of Object.keys(src)) { // word times as centiseconds: the first, then the step to each next word
        const a = src[id], out = [];
        let prev = 0;
        for (let q = 0; q < a.length; q++) { const cs = Math.round(a[q] * 100); out.push(q ? cs - prev : cs); prev = cs; }
        w[id] = out;
      }
      tracks[i] = { u: sec.url, r: S.ranges[i], a: S.tdone.get(i).map(x => [x.id, x.t]), w };
      if (S.tfit && typeof S.tfit[i] === 'number') tracks[i].p = S.tfit[i];
      if (S.skip && Array.isArray(S.skip[i])) tracks[i].k = S.skip[i];   // passages the narrator did not read
      if (S.edge && Array.isArray(S.edge[i])) tracks[i].ke = S.edge[i];   // unread text at the start and end of the track
    });
    return { v: 1, ar: 2, id: S.book.id, n: S.secs.length, sig: bookSig(), text: S.textSrc ? { kind: S.textSrc.kind, id: S.textSrc.id || '', label: S.textSrc.label || '' } : null, tracks };
  }
  function applyMerged() {
    const m = S.merged;
    if (!m || !S.model || !S.book) return 0;
    if (m.v !== 1 || m.ar !== 2 || m.n !== S.secs.length || m.sig !== bookSig()) { S.mergedBad = true; return 0; }   // ar: the alignment rules changed, so older saved copies are made again from the timing
    const N = S.model.sents.length;
    let done = 0;
    S.secs.forEach((sec, i) => {
      const tr = m.tracks && m.tracks[i];
      if (!tr || tr.u !== sec.url || trackDone(i)) return;
      if (!Array.isArray(tr.a) || tr.a.length < 3 || !Array.isArray(tr.r) || !(tr.r[1] > tr.r[0]) || tr.r[1] > N) return;
      if (tr.a.some(x => !(x[0] >= 0 && x[0] < N && isFinite(x[1])))) return;
      const list = tr.a.map(x => ({ id: x[0], t: x[1] })), words = {};
      for (const id of Object.keys(tr.w || {})) {
        let t = 0;
        words[id] = tr.w[id].map((v, q) => +((t = q ? t + v : v) / 100).toFixed(2));
      }
      S.ranges[i] = tr.r; S.anchors[i] = list; S.autoSrc[i] = 'full'; S.tdone.set(i, list); S.wordT[i] = words;
      S.tstat[i] = 'matched (saved copy), ' + list.length + ' sentences timed';
      if (Array.isArray(tr.k)) (S.skip || (S.skip = {}))[i] = tr.k.filter(r => Array.isArray(r) && r[0] >= 0 && r[1] > r[0] && r[1] <= N);
      if (Array.isArray(tr.ke)) (S.edge || (S.edge = {}))[i] = [0, 1].map(q => { const r = tr.ke[q]; return Array.isArray(r) && r[0] >= 0 && r[1] > r[0] && r[1] <= N ? r : null; });
      if (typeof tr.p === 'number') { loadFits(S.book); S.tfit[i] = tr.p; }
      done++;
    });
    return done;
  }
  function saveMerged() {
    if (!S.book || !S.model) return;
    const m = buildMerged();
    if (!Object.keys(m.tracks).length) return;
    S.merged = m; // later re-applications (for example from the Sync card) reuse this instead of aligning again
    idb.set('m:' + S.book.id, m);
  }
  async function loadMerged(b) {
    const shape = x => x && x.v === 1 && x.n === b.secs.length && typeof x.sig === 'string' && x.tracks && typeof x.tracks === 'object';
    let local = null;
    try { local = await idb.get('m:' + b.id); } catch (e) { /* none saved */ }
    if (S.book !== b) return;
    if (shape(local)) { S.merged = local; if (S.model) applyTimings(); }
    const { repo } = ghCfg();
    if (S.merged && Object.keys(S.merged.tracks).length >= b.secs.length) return;
    /* The library check (wt_sync_check.js, run on the computer and published to the packs dataset) leaves a finished
       sync for the book at wt_merged/<id>.json.gz. It is used only if it fits this exact text (same signature). */
    try {
      let r = await timedFetch('https://huggingface.co/datasets/rabiul43/wordtrail-packs/resolve/main/wt_merged/' + encodeURIComponent(b.id) + '.json.gz', 15000);
      if (r.ok) {
        const buf = new Uint8Array(await r.arrayBuffer());
        let txt;
        if (buf[0] === 0x1f && buf[1] === 0x8b) txt = typeof DecompressionStream === 'undefined' ? null : await new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
        else txt = new TextDecoder().decode(buf);
        const pub = txt ? JSON.parse(txt) : null;
        if (S.book === b && shape(pub) && pub.ar === 2 && (!S.model || pub.sig === bookSig())
            && Object.keys(pub.tracks).length > (S.merged ? Object.keys(S.merged.tracks).length : 0)) {
          S.merged = pub; idb.set('m:' + b.id, pub);
          if (S.model) applyTimings();
        }
      }
    } catch (e) { /* no published check for this book */ }
  }
  /* Uploads the finished record once every track is aligned. Needs a token that may write to the sync
     repository's contents; if GitHub refuses, it says so once and the book simply stays local. */
  async function shareSync() {
    return; /* sharing to GitHub was removed */
    // eslint-disable-next-line no-unreachable
    const b = S.book, { repo, token } = ghCfg();
    if (!b || !S.model || !repo || !token || S.sharing) return;
    if (S.secs.some((_, i) => !trackDone(i))) return;
    const sig = bookSig();
    if (store.get('wt:pub:' + b.id, '') === sig) return;
    S.sharing = true;
    try {
      const api = 'https://api.github.com/repos/' + repo + '/contents/data/' + encodeURIComponent(b.id) + '/book.json';
      const hd = { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json' };
      try { // already shared (by this or another device) for the same text?
        const ex = await fetch('https://raw.githubusercontent.com/' + repo + '/main/data/' + encodeURIComponent(b.id) + '/book.json', { cache: 'no-store' });
        if (ex.ok) { const j = await ex.json(); if (j && j.sig === sig && j.tracks && Object.keys(j.tracks).length >= b.secs.length) { store.set('wt:pub:' + b.id, sig); return; } }
      } catch (e) { /* not there yet */ }
      const json = JSON.stringify(buildMerged());
      const put = sha => fetch(api, { method: 'PUT', headers: hd, body: JSON.stringify(Object.assign({ message: 'book.json for ' + b.id, branch: 'main', content: btoa(unescape(encodeURIComponent(json))) }, sha ? { sha } : {})) });
      let r = await put();
      if (r.status === 422 || r.status === 409) { // a different copy is there: replace it with the one that fits this text
        const g = await fetch(api + '?ref=main', { headers: hd, cache: 'no-store' });
        if (g.ok) r = await put((await g.json()).sha);
      }
      if (r.ok) { store.set('wt:pub:' + b.id, sig); }
      else if (!S.shareWarned && (r.status === 401 || r.status === 403 || r.status === 404)) {
        S.shareWarned = true;
        toast('Could not share the finished sync. The GitHub token needs read and write access to the sync repository\'s contents.', 7000);
      }
    } catch (e) { console.warn('Wordtrail: sharing the sync failed', e); }
    finally { S.sharing = false; }
  }
  /* A saved copy made before not-narrated passages were detected has no list of them. Find them once, from the
     timing file, for the track on screen. */
  function backfillSkip(i) {
    if (!S.model || !S.book || i == null || i < 0 || !trackDone(i)) return;
    const sk = S.skip || (S.skip = {}), ed = S.edge || (S.edge = {});
    if (sk[i] !== undefined && ed[i] !== undefined) return;
    const tm = S.timings, sec = S.secs[i];
    if (!tm || !tm.tracks || !sec) return;
    const tr = Object.values(tm.tracks).find(x => x.u && x.u === sec.url) || tm.tracks[i];
    if (!tr) return;
    const book0 = S.book, model0 = S.model;
    const r = alignTrackToBook(tr);
    if (S.book !== book0 || S.model !== model0) return;
    sk[i] = r && r.skip ? r.skip : []; ed[i] = r && r.edge ? [r.edge.l, r.edge.e] : [null, null];
    saveMerged();
    S.curId = -1; replan(true);
  }
  function applyTimings() {
    if (!S.model) return 0;
    const tm = S.timings || { tracks: {} };
    let done = applyMerged(), fresh = 0;
    S.secs.forEach((sec, i) => {
      if (trackDone(i)) return;
      const tr = Object.values(tm.tracks || {}).find(x => x.u && x.u === sec.url) || (tm.tracks || {})[i];
      /* A track that was already tried against this exact text and did not fit is not aligned again
         (the Sync card re-applies every few seconds, and alignment is the slow part). */
      const bad = S.fitBad || (S.fitBad = new Map()), seen = tr && bad.get(i);
      if (seen && seen.tr === tr && seen.m === S.model) { S.tstat[i] = seen.msg; return; }
      const r = tr && alignTrackToBook(tr), pct = Math.round(alignTrackToBook.fit * 100);
      S.tstat[i] = !tr ? 'no timing file' : r ? 'matched ' + pct + '% of words, ' + r.list.length + ' sentences timed' + (r.skip && r.skip.length ? ', ' + r.skip.length + ' not-narrated passage' + (r.skip.length > 1 ? 's' : '') : '') : 'did not fit the text (' + pct + '% of words matched)';
      if (tr && !r) bad.set(i, { tr, m: S.model, msg: S.tstat[i] });
      if (r) { S.ranges[i] = r.range; S.anchors[i] = r.list; S.autoSrc[i] = 'full'; S.tdone.set(i, r.list); S.wordT[i] = r.words; (S.skip || (S.skip = {}))[i] = r.skip || []; (S.edge || (S.edge = {}))[i] = r.edge ? [r.edge.l, r.edge.e] : [null, null]; done++; fresh++; loadFits(S.book); S.tfit[i] = pct; saveFits(S.book); }
    });
    if (S.book && S.tdone.size) store.set('wt:sync:' + S.book.id, { done: S.tdone.size, total: S.secs.length });
    if (done) { S.curId = -1; replan(false); persist(); } // same sentences on screen: no rebuild, so no flicker or scroll jump
    if (fresh) { saveMerged(); shareSync(); }
    setTimeout(() => backfillSkip(S.sec), 0);
    return done;
  }
  /* Precise timing comes from a free GitHub Actions job (see Settings > Precise timing). Opening a
     book asks for it once; finished tracks are then picked up and applied as they appear. */
  /* Opens a "sync <book id>" issue in the sync repository. Returns a message to show, or '' if nothing was needed. */
  async function requestSync(b, force) {
    return ''; /* GitHub sync requests were removed; timing is published to Hugging Face by the batch job */
    // eslint-disable-next-line no-unreachable
    const { repo, token } = ghCfg();
    if (!repo) return 'Add your sync repository under Advanced first.';
    if (!token) return 'Add your GitHub token under Advanced first.';
    const key = 'wt:req:' + b.id;
    if (!force && Date.now() - (store.get(key, 0) || 0) < 864e5) return '';
    try {
      const r = await fetch('https://api.github.com/repos/' + repo + '/issues', { method: 'POST', headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json' }, body: JSON.stringify({ title: 'sync ' + b.id, body: 'cur=' + S.sec + (store.get('wt:ntfy', '') ? '\nntfy=' + store.get('wt:ntfy', '') : '') + '\n' + b.title }) });
      if (r.ok) { store.set(key, Date.now()); return 'Sync requested. It will switch on by itself in a few minutes.'; }
      if (r.status === 401) return 'GitHub did not accept the token. Create a new one and paste it under Advanced.';
      return 'GitHub refused the request (code ' + r.status + '). Check the repository name, and that the token allows Issues.';
    } catch (e) { return 'Could not reach GitHub. Check your connection.'; }
  }
  /* data/<book id>/status.json, written by the sync job: { stage, msg, track, tracks, pct (0..1 of the whole job), updated (unix seconds) }. */
  async function grabStatus(b) {
    return null; /* status.json lived on GitHub; no longer used */
    // eslint-disable-next-line no-unreachable
    const { repo, token } = ghCfg();
    if (!repo) return null;
    try {
      const r = token
        ? await fetch('https://api.github.com/repos/' + repo + '/contents/data/' + encodeURIComponent(b.id) + '/status.json?ref=main', { cache: 'no-store', headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github.raw+json' } })
        : await fetch('https://raw.githubusercontent.com/' + repo + '/main/data/' + encodeURIComponent(b.id) + '/status.json?_=' + Date.now(), { cache: 'no-store' });
      if (!r.ok) return null;
      const d = await r.json();
      return d && typeof d === 'object' ? { id: b.id, d } : null;
    } catch (e) { return null; }
  }
  function notifyDone(b) {
    buzz('success');
    try { if (window.Notification && window.isSecureContext && Notification.permission === 'granted') new Notification('Sync finished', { body: b.title + ' is ready.' }); } catch (e) { /* unsupported */ }
  }
  /* Packed sync: popular books are pre-synced and stored as ONE compressed file (wt_packs/<id>.json.gz, built by
     wt23_build_packs.py). One request brings every track's timings, so the precise highlight is ready at once.
     Anything unexpected returns null and the per-track files below are used as before. */
  async function grabPack(b, n, bust, info) {
    try {
      /* Try the precise aligned pack (wt_packs_v2) first; if the book has none, use the older pack. */
      const base = 'https://huggingface.co/datasets/rabiul43/wordtrail-packs/resolve/main/';
      let r = null;
      let v2err = false;
      try { const c = new AbortController(), to = setTimeout(() => c.abort(), 20000); try { r = await fetch(base + 'wt_packs_v2/' + encodeURIComponent(b.id) + '.json.gz' + (bust ? '?t=' + Date.now() : ''), Object.assign({ signal: c.signal }, bust ? { cache: 'no-store' } : {})); } finally { clearTimeout(to); } } catch (e) { r = null; v2err = true; }
      if (!r || !r.ok) {
        try { const c = new AbortController(), to = setTimeout(() => c.abort(), 20000); try { r = await fetch(base + 'wt_packs/' + encodeURIComponent(b.id) + '.json.gz', { signal: c.signal }); } finally { clearTimeout(to); } } catch (e) { if (info) info.err = true; return null; }
      }
      if (!r.ok) { if (info && (r.status >= 500 || v2err)) info.err = true; return null; }
      const buf = new Uint8Array(await r.arrayBuffer());
      let text;
      if (buf[0] === 0x1f && buf[1] === 0x8b) { // still gzip: unpack it here
        if (typeof DecompressionStream === 'undefined') return null;
        text = await new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
      } else text = new TextDecoder().decode(buf); // the host already unpacked it
      const pk = JSON.parse(text);
      if (!pk || pk.v !== 1 || +pk.n !== n || !pk.tracks || typeof pk.tracks !== 'object') return null;
      return pk.tracks;
    } catch (e) { if (info) info.err = true; return null; }
  }
  async function fetchTimings(b) {
    const gen = S.tmGen = (S.tmGen || 0) + 1; TM.fail = '';
    const mp = loadMerged(b); // the finished sync saved on this device, then the shared copy in the sync repository
    const { repo, token } = ghCfg();
    const n = b.secs.length, tracks = (S.timings = { tracks: {} }).tracks;
    S.timingWait = true;
    const packInfo = {}, packP = grabPack(b, n, false, packInfo); // starts now, so it does not wait for the shared-copy check below
    const grab = async i => {
      if (!repo) return false;
      try {
        const r = await fetch('https://raw.githubusercontent.com/' + repo + '/main/data/' + encodeURIComponent(b.id) + '/' + i + '.json', { cache: 'no-store' });
        if (r.ok) { tracks[i] = await r.json(); return true; }
      } catch (e) { /* not ready yet */ }
      return false;
    };
    const aligned = () => { let c = 0; S.secs.forEach((_, i) => { if (trackDone(i)) c++; }); return c; };
    await mp;
    let got = false, started = false, waits = 0;
    if (S.book === b && aligned() < n) { const pk = await packP; if (pk && S.book === b) { Object.assign(tracks, pk); got = true; } else if (!pk && packInfo.err && S.book === b && S.tmGen === gen && !trackDone(S.sec)) TM.fail = 'net'; }
    if (S.book === b && S.tmGen === gen) { S.timingWait = false; const cp = S.plan[S.sec]; if (S.model && !S.tPending && (!cp || !cp.ids.length)) { if (got) applyTimings(); const c2 = S.plan[S.sec]; if (!c2 || !c2.ids.length) renderSection(S.sec); } }
    /* Without a sync repository only the pack is available: use it and stop (no GitHub polling). */
    if (!repo || !token) { /* no GitHub token: Hugging Face packs only, no GitHub requests or messages */
      if (got && S.book === b && S.model) applyTimings();
      /* Partial pack (e.g. 21 of 22 tracks): the missing tracks use the estimated highlight for now.
         Tell the person once, then quietly re-check the pack until the missing tracks are published. */
      const missing = () => { const m = []; for (let i = 0; i < n; i++) if (!tracks[i] && !trackDone(i)) m.push(i); return m; };
      let miss = got ? missing() : [];
      if (miss.length && S.book === b) {
        // silent: estimated highlight is used until the precise timing arrives
        for (let tries = 0; tries < 12 && miss.length && S.book === b; tries++) {
          await new Promise(r => setTimeout(r, 5 * 60e3));
          if (S.book !== b) return;
          const pk2 = await grabPack(b, n, true);
          if (pk2) { Object.assign(tracks, pk2); if (S.model) applyTimings(); }
          miss = missing();
        }
      }
      return;
    }
    while (S.book === b) {
      if (aligned() >= n) { if (S.syncWatch === b.id) { S.syncWatch = null; S.syncText = ''; updateHeader(); notifyDone(b); } return; }
      // A saved or shared sync only needs the book text to be ready: wait for it instead of asking the sync job.
      if (S.merged && (!S.model || S.tPending) && !S.mergedBad && waits++ < 60) { await new Promise(r => setTimeout(r, 800)); continue; }
      if (!started) {
        started = true;
        if (!trackDone(S.sec)) {
          got = tracks[S.sec] ? true : await grab(S.sec);
          if (!got) { const m = await requestSync(b, false); if (m) { if (/^Sync requested/.test(m)) { S.syncWatch = b.id; S.syncStart = Date.now(); } } }
        }
      }
      const watching = S.syncWatch === b.id;
      for (let k = 0; k < (watching ? n : Math.min(n, 8)) && S.book === b; k++) {
        const i = (S.sec + k) % n;
        if (!tracks[i] && !trackDone(i) && await grab(i)) got = true;
      }
      if (got && S.model) { got = false; if (applyTimings()) { if (!store.get('wt:hint:tap', 0)) { store.set('wt:hint:tap', 1); setTimeout(() => toast('Tip: tap any sentence to jump there. Double-tap it if the highlight is off.', 6500), 4500); } } }
      if (watching && S.book === b) { S.syncStatus = await grabStatus(b); reportSync(b, Math.max(Object.keys(tracks).length, aligned()), 'Sync requested.'); }
      if (Object.keys(tracks).length >= n) { if (S.syncWatch === b.id) { S.syncWatch = null; S.syncText = ''; updateHeader(); notifyDone(b); } return; }
      await new Promise(r => setTimeout(r, watching ? 6000 : 30000));
    }
  }

  /* Precise sync card (Settings). Shows what happened in plain words; technical lines are tucked under Details. */
  /* ---- how well each track's spoken words match the book text (percent) ---- */
  function loadFits(b) {
    if (S.tfit && S.tfitBook === String(b.id)) return;
    S.tfitBook = String(b.id); S.tfit = {}; S.retry = {}; S.trkSel = null;
    const c = store.get('wt:fit:' + b.id, null);
    if (c && c.sig === bookSig() && c.f && typeof c.f === 'object') Object.assign(S.tfit, c.f);
  }
  function saveFits(b) { store.set('wt:fit:' + b.id, { sig: bookSig(), f: S.tfit }); }
  let fitBusy = false;
  /* Tracks that were applied from a saved copy have no percentage yet: measure them once from the timing files, one at a time, and remember it. */
  async function measureFits(b) {
    if (fitBusy || !S.model || !S.timings || !S.timings.tracks) return;
    loadFits(b);
    let changed = false;
    fitBusy = true; S.fitMeasuring = true;
    try {
      for (let i = 0; i < b.secs.length; i++) {
        if (S.book !== b || !S.model) break;
        if (!trackDone(i) || typeof S.tfit[i] === 'number') continue;
        const tm = S.timings.tracks, tr = Object.values(tm).find(x => x.u && x.u === b.secs[i].url) || tm[i];
        if (!tr) continue;
        await new Promise(r => setTimeout(r, 40));
        alignTrackToBook(tr);
        S.tfit[i] = Math.round(alignTrackToBook.fit * 100);
        changed = true;
      }
    } finally { fitBusy = false; S.fitMeasuring = false; }
    if (changed) { saveFits(b); if (S.book === b && S.lastReport && S.lastReport[0] === b) reportSync(...S.lastReport); }
  }
  /* ---- try just one track again (the others are left alone) ---- */
  const sigOf = tr => tr ? String(tr.w || '').length + ':' + (tr.t || []).length + ':' + ((tr.t || [])[(tr.t || []).length - 1] || 0) : '';
  const readyCount = () => S.secs.filter((_, i) => trackDone(i)).length;
  async function retryTrack(i) {
    const b = S.book; if (!b) return;
    const g = ghCfg();
    if (!g.repo || !g.token) {
      toast('Re-timing one track happens in the next batch run on Hugging Face.', 5000);
      return;
    }
    S.retry = S.retry || {};
    if (S.retry[i]) return;
    const keep = trackDone(i);   // already matched: keep it in place until a better match arrives
    const old = S.timings && S.timings.tracks ? S.timings.tracks[i] : null;
    let oldPct = 0;
    if (keep) {
      loadFits(b); oldPct = typeof S.tfit[i] === 'number' ? S.tfit[i] : 0;
      if (!oldPct && old && S.model) { alignTrackToBook(old); oldPct = Math.round(alignTrackToBook.fit * 100); }
    }
    const me = S.retry[i] = { since: Date.now(), oldSig: sigOf(old), keep, oldPct };
    if (!keep) {
      if (S.timings && S.timings.tracks) delete S.timings.tracks[i];
      if (S.fitBad) S.fitBad.delete(i);
      delete S.tstat[i]; if (S.tfit) delete S.tfit[i];
    }
    const rd = () => Math.max(Object.keys((S.timings || { tracks: {} }).tracks).length, readyCount());
    reportSync(b, rd(), '');
    const hd = { Authorization: 'Bearer ' + g.token, Accept: 'application/vnd.github+json' };
    const file = 'https://api.github.com/repos/' + g.repo + '/contents/data/' + encodeURIComponent(b.id) + '/' + i + '.json';
    let cleared = false;
    try { // remove the old timing file so the job treats this one track as missing and redoes only it
      const r = await fetch(file + '?ref=main', { headers: hd, cache: 'no-store' });
      if (r.ok) { const j = await r.json(); const d = await fetch(file, { method: 'DELETE', headers: hd, body: JSON.stringify({ message: 'redo track ' + (i + 1) + ' of book ' + b.id, sha: j.sha, branch: 'main' }) }); cleared = d.ok; }
      else if (r.status === 404) cleared = true;
    } catch (e) { /* the request below still goes out */ }
    let ok = false;
    try {
      const r = await fetch('https://api.github.com/repos/' + g.repo + '/issues', { method: 'POST', headers: hd, body: JSON.stringify({ title: 'sync ' + b.id, body: 'cur=' + i + '\nonly=' + i + '\nforce=1' + (store.get('wt:ntfy', '') ? '\nntfy=' + store.get('wt:ntfy', '') : '') + '\n' + b.title }) });
      ok = r.ok;
      if (!ok) toast(r.status === 401 ? 'GitHub did not accept the token.' : 'GitHub refused the request (code ' + r.status + ').', 6000);
    } catch (e) { toast('Could not reach GitHub. Check your connection.', 5000); }
    if (!ok) { delete S.retry[i]; if (S.book === b) reportSync(b, rd(), ''); return; }
    toast('Track ' + (i + 1) + ' requested again. It takes a few minutes.', 4500);
    while (S.book === b && S.retry[i] === me && Date.now() - me.since < 20 * 60e3) {
      await new Promise(r => setTimeout(r, 6000));
      try {
        const r = await fetch('https://raw.githubusercontent.com/' + g.repo + '/main/data/' + encodeURIComponent(b.id) + '/' + i + '.json?_=' + Date.now(), { cache: 'no-store' });
        if (!r.ok) continue;
        const tr = await r.json();
        if (!(cleared || !me.oldSig || sigOf(tr) !== me.oldSig)) continue;
        if (!S.timings) S.timings = { tracks: {} };
        delete S.retry[i];
        if (!keep) {
          S.timings.tracks[i] = tr;
          if (S.model) applyTimings();
          const st = syncTrackState(S.tstat[i], i);
          toast(st.s === 'ready' ? 'Track ' + (i + 1) + ' now matches' + (st.pct != null ? ' (' + st.pct + '%)' : '') + '.' : 'Track ' + (i + 1) + " still doesn't fit the book text.", 5000);
        } else {
          let res = null, np = 0;
          if (S.model) { res = alignTrackToBook(tr); np = Math.round(alignTrackToBook.fit * 100); }
          if (res && np > oldPct) {   // better: swap it in
            if (S.merged && S.merged.tracks) delete S.merged.tracks[i];
            S.tdone.delete(i); if (S.skip) delete S.skip[i]; if (S.edge) delete S.edge[i]; delete S.ranges[i]; delete S.anchors[i]; delete S.autoSrc[i]; delete S.wordT[i]; delete S.tstat[i];
            S.timings.tracks[i] = tr;
            applyTimings();
            toast('Track ' + (i + 1) + ' improved: ' + oldPct + '% \u2192 ' + np + '%.', 5000);
          } else {                    // not better: keep what we had
            if (old) S.timings.tracks[i] = old;
            toast('Track ' + (i + 1) + ': the new try gave ' + np + '%, so the earlier ' + oldPct + '% was kept.', 6000);
          }
        }
        reportSync(b, rd(), '');
        return;
      } catch (e) { /* not ready yet */ }
    }
    if (S.retry && S.retry[i] === me) {
      delete S.retry[i];
      if (S.book === b) { toast('No new timing for track ' + (i + 1) + ' yet. Try again in a few minutes.', 6000); reportSync(b, rd(), ''); }
    }
  }
  async function retryTracks(list) { for (const i of list) { await Promise.race([retryTrack(i), new Promise(r => setTimeout(r, 1500))]); } }
  /* Plain-language state for one track, from the raw match note. */
  function syncTrackState(t, i) {
    const rt = S.retry && S.retry[i];
    if (rt && !rt.keep) return { s: 'wait', retrying: true, pct: null, note: 'Trying this track again…' };
    const st = baseTrackState(t, i);
    if (rt) { st.retrying = true; st.note += ' · trying again…'; }
    return st;
  }
  function baseTrackState(t, i) {
    t = String(t || '');
    const known = S.tfit && typeof S.tfit[i] === 'number' ? S.tfit[i] : null;
    if (t.startsWith('matched')) {
      const m = t.match(/(\d+) sentences?/), pm = t.match(/matched (\d+)%/);
      const pct = known != null ? known : pm ? +pm[1] : null;
      return { s: 'ready', pct, note: (pct != null ? pct + '% match' : 'Precise') + (m ? ' · ' + m[1] + ' sentences timed' : '') };
    }
    if (t.startsWith('did not fit')) { const m = t.match(/\((\d+)%/); return { s: 'bad', pct: m ? +m[1] : null, note: "Doesn't fit the book text" + (m ? ' (' + m[1] + '% of words matched)' : '') }; }
    if (t.startsWith('no timing')) return { s: 'wait', pct: null, note: 'Waiting for timing' };
    return { s: 'wait', pct: null, note: 'No text for this track yet' };
  }
  const fitClass = p => p == null ? 'q-na' : p >= 90 ? 'q-hi' : p >= 70 ? 'q-mid' : 'q-lo';
  function renderSyncDetails(box, d, prog) {
    const bar = box.querySelector('.ss-bar'), cap = box.querySelector('.ss-cap'), stats = box.querySelector('.ss-stats');
    const more = box.querySelector('.ss-more'), body = more.querySelector('.ss-detail');
    const obj = d && typeof d === 'object';
    bar.hidden = !prog; cap.hidden = !prog;
    if (prog) {
      const pct = Math.round(100 * prog.done / Math.max(1, prog.total));
      bar.firstElementChild.style.width = pct + '%';
      cap.children[0].textContent = obj ? (d.job || d.ready + ' of ' + d.n + ' tracks ready') : '';
      cap.children[1].textContent = pct + '%';
    }
    stats.textContent = ''; body.textContent = '';
    if (!d) { stats.hidden = true; more.hidden = true; return; }
    if (!obj) { stats.hidden = true; more.hidden = false; body.append(h('pre', { class: 'ss-raw' }, String(d))); return; }
    const tr = d.tracks, count = k => tr.filter(t => t.s === k).length;
    const good = count('ready'), wait = count('wait'), bad = count('bad');
    const tile = (n, label, k) => h('div', { class: 'ss-stat ' + k + (n ? '' : ' zero') }, h('b', {}, String(n)), h('span', {}, label));
    stats.hidden = tr.length < 2;
    stats.append(tile(good, 'Precise', 'ready'), tile(wait, 'Waiting', 'wait'), tile(bad, "Can't match", 'bad'));
    more.hidden = false;

    // overall match quality
    const scored = tr.map((t, i) => ({ i, p: t.pct })).filter(x => typeof x.p === 'number');
    if (scored.length) {
      const avg = Math.round(scored.reduce((a, x) => a + x.p, 0) / scored.length);
      const low = scored.reduce((m, x) => x.p < m.p ? x : m, scored[0]);
      const unknown = tr.filter(t => t.s === 'ready' && t.pct == null).length;
      body.append(h('div', { class: 'ss-avg' },
        h('div', {}, h('b', { class: fitClass(avg) }, avg + '%'), h('span', {}, 'average match')),
        scored.length > 1 ? h('div', {}, h('b', { class: fitClass(low.p) }, low.p + '%'), h('span', {}, 'lowest · track ' + (low.i + 1))) : null,
        unknown || S.fitMeasuring ? h('small', {}, 'Measuring the rest…') : null));
    } else if (S.fitMeasuring) {
      body.append(h('p', { class: 'ss-note' }, 'Measuring how well each track matches…'));
    }

    // tracks that could be redone: failed ones, ones being redone, and matches under 80%
    const need = tr.map((t, i) => ({ t, i })).filter(x => x.t.s === 'bad' || (x.t.retrying && x.t.s !== 'ready') || (x.t.s === 'ready' && x.t.pct != null && x.t.pct < 80));
    if (need.length) {
      const todo = need.filter(x => !x.t.retrying).map(x => x.i);
      const anyBad = need.some(x => x.t.s === 'bad');
      body.append(h('div', { class: 'ss-need' },
        h('div', { class: 'ss-need-head' }, h('strong', {}, anyBad ? 'Needs another try' : 'Could be better'),
          todo.length > 1 ? h('button', { type: 'button', class: 'ss-retry', onclick: () => retryTracks(todo) }, 'Try all ' + todo.length + ' again') : null),
        h('ul', { class: 'ss-issues', role: 'list' }, ...need.map(x => h('li', { role: 'listitem' },
          h('span', {}, h('b', {}, 'Track ' + (x.i + 1)), ' · ', x.t.retrying ? 'Trying again…' : (x.t.s === 'bad' ? x.t.note : x.t.pct + '% match')),
          h('button', { type: 'button', class: 'ss-retry', disabled: !!x.t.retrying, onclick: () => retryTrack(x.i) }, x.t.retrying ? 'Waiting…' : 'Try again')))),
        h('p', { class: 'ss-note' }, 'Only the track you pick is requested again. A better match replaces the old one; otherwise the old one is kept.')));
    }

    // one square per track: the fill shows the match. Tap a square to see it and redo just that track.
    const rerender = () => renderSyncDetails(box, box._d, box._prog);
    box._d = d; box._prog = prog;
    body.append(h('ul', { class: 'ss-tracks', role: 'list' }, ...tr.map((t, i) =>
      h('li', { role: 'listitem' }, h('button', {
        type: 'button', 'aria-pressed': String(S.trkSel === i),
        class: 'ss-trk ' + t.s + ' ' + (t.s === 'wait' ? '' : fitClass(t.pct)) + (t.retrying ? ' retrying' : ''),
        style: '--fill:' + (t.s === 'wait' ? 0 : t.pct != null ? Math.max(4, Math.min(100, t.pct)) : 100) + '%',
        'aria-label': 'Track ' + (i + 1) + ': ' + t.note, title: 'Track ' + (i + 1) + ': ' + t.note,
        onclick: () => { S.trkSel = S.trkSel === i ? null : i; rerender(); }
      }, h('b', {}, String(i + 1)), t.retrying && t.s !== 'ready' ? h('em', {}, '…') : t.s === 'wait' ? null : h('em', {}, t.pct != null ? t.pct + '%' : '…'))))));
    if (S.trkSel != null && tr[S.trkSel]) {
      const i = S.trkSel, t = tr[i];
      body.append(h('div', { class: 'ss-pick' },
        h('div', {}, h('strong', {}, 'Track ' + (i + 1)), h('span', {}, t.note)),
        h('button', { type: 'button', class: 'ss-retry', disabled: !!t.retrying, onclick: () => retryTrack(i) }, t.retrying ? 'Waiting…' : 'Try this track again')));
    } else if (tr.length > 1) body.append(h('p', { class: 'ss-note' }, 'Tap a square for details, or to redo just that track.'));
    const has = k => tr.some(t => t.s !== 'wait' && fitClass(t.pct) === k);
    const legend = [['q-hi', '90%+ great', has('q-hi')], ['q-mid', '70–89% good', has('q-mid')], ['q-lo', 'Under 70% weak', has('q-lo')], ['q-na', 'Not measured yet', has('q-na')], ['wait', 'Waiting', wait > 0]].filter(x => x[2]);
    body.append(h('div', { class: 'ss-legend' }, ...legend.map(x => h('span', {}, h('i', { class: 'dot ' + x[0] }), x[1]))));
    body.append(h('p', { class: 'ss-note' }, 'Match is the share of spoken words found in the book text. 90% or more follows the narrator closely.'));
    body.append(h('p', { class: 'ss-tech' }, 'Book ' + d.bookId + (d.job && !prog ? ' · ' + d.job : '')));
  }
  function showSync(kind, title, msg, details, prog) {
    const box = document.getElementById('sync-status'), btn = document.getElementById('b-syncnow');
    if (!box) return;
    box.hidden = false; box.dataset.kind = kind;
    box.querySelector('.ss-ic').textContent = { ok: '✓', warn: '!', err: '!', info: 'i', setup: '→', work: '', wait: '' }[kind] || '';
    box.querySelector('.ss-title').textContent = title;
    box.querySelector('.ss-msg').textContent = msg || '';
    renderSyncDetails(box, details, prog);
    if (btn) { btn.disabled = kind === 'work'; btn.textContent = kind === 'work' ? 'Working…' : kind === 'wait' ? 'Check now' : (kind === 'ok' ? 'Sync again' : 'Sync this book'); }
  }
  /* Turns what is known (tracks ready, how they matched the text) into one plain-language card with a real progress bar. */
  function reportSync(b, ready, req) {
    const n = b.secs.length, plural = (c, w) => c + ' ' + w + (c === 1 ? '' : 's');
    const reqOk = /^Sync requested/.test(req || '');
    if (!S.model) { showSync('info', 'Almost there', 'The book text is still loading. Give it a moment, then tap Sync again.'); return; }
    S.tdone.clear(); S.skip = {}; S.edge = {}; applyTimings(); loadFits(b); S.lastReport = [b, ready, req];
    const good = [], bad = [];
    for (let i = 0; i < n; i++) { const t = String(S.tstat[i] || ''); if (t.startsWith('matched')) good.push(i); else if (t.startsWith('did not fit')) bad.push(i); }
    const pending = n - ready, watching = S.syncWatch === b.id && pending > 0;
    const st = S.syncStatus && S.syncStatus.id === b.id ? S.syncStatus.d : null;
    const frac = Math.min(1, Math.max(ready / n, st && typeof st.pct === 'number' ? st.pct : 0));
    const prog = watching ? { done: frac, total: 1 } : null;
    const age = st && st.updated ? Math.floor((Date.now() / 1000 - st.updated) / 60) : 0;
    const mins = watching && S.syncStart ? Math.floor((Date.now() - S.syncStart) / 60000) : 0;
    S.syncText = watching ? 'syncing ' + ready + '/' + n : ''; updateHeader();
    const lines = { tracks: S.secs.map((_, i) => syncTrackState(S.tstat[i], i)), ready, n, bookId: b.id, job: st ? (st.msg || st.stage || '') : '' };
    if (good.length === n) showSync('ok', 'All set', 'All ' + plural(n, 'track') + (n === 1 ? ' is' : ' are') + ' in sync. The highlight now follows the narrator word by word.', lines);
    else if (good.length) showSync(watching ? 'wait' : 'ok', 'Partly in sync', (watching ? 'Tracks switch on by themselves as they finish, so you can keep listening.' : '') + (bad.length ? (watching ? ' ' : '') + plural(bad.length, 'track') + (bad.length === 1 ? " couldn't" : " couldn't") + ' be matched to the book text.' : '') || 'Part of the book follows the narrator word by word.', lines, prog);
    else if (bad.length && !watching) showSync('warn', "Couldn't line this book up", "The recording and the book text are too different to match automatically (for example a different edition, or extra words read aloud). You can still listen and follow along. If the highlight drifts, tap Fix under the header and tap the sentence you are hearing.", lines);
    else if (watching && st && st.stage === 'error') showSync('err', 'The sync hit a problem', (st.msg || 'The sync job reported an error.') + ' Tap Sync to try again.', lines);
    else if (watching) showSync('wait', 'Preparing your sync', 'You can keep listening. Each track switches on as soon as it is ready.' + (mins >= 1 ? ' (' + mins + ' min so far.)' : '') + (age >= 10 && st && st.stage !== 'done' ? ' No news from the sync job for ' + age + ' min, so it may be waiting for a free GitHub slot.' : '') + (mins >= 30 ? ' This is taking longer than usual.' : ''), lines, prog);
    else if (bad.length) showSync('warn', "Couldn't line this book up", "The recording and the book text are too different to match automatically. You can still listen; tap Fix and then the sentence you are hearing to line it up by hand.", lines);
    else showSync('err', "Couldn't start the sync", req || 'Something went wrong. Please try again.', lines);
    const mo = document.querySelector('#sync-status .ss-more');
    if (mo && mo.open) measureFits(b);
  }
  async function syncNow() {
    if (!S.book) { showSync('info', 'Open a book first', 'Pick a book, then come back here to sync it.'); return; }
    const g = ghCfg();
    if (!g.token) {
      /* No GitHub token: use the ready-made pack from Hugging Face (wt_packs_v2) and show how well each track matched. */
      showSync('work', 'Checking\u2026', 'Looking for ready timing for this book.');
      const b0 = S.book, n0 = b0.secs.length;
      if (!S.timings) S.timings = { tracks: {} };
      const pk0 = await grabPack(b0, n0);
      if (S.book !== b0) return;
      if (pk0) Object.assign(S.timings.tracks, pk0);
      let ready0 = 0; for (let j = 0; j < n0; j++) if (S.timings.tracks[j]) ready0++;
      S.syncWatch = null;
      reportSync(b0, ready0, ready0 ? '' : 'No precise timing for this book yet. It is added when the next batch run reaches it.');
      return;
    }
    try { if (window.Notification && window.isSecureContext && Notification.permission === 'default') Notification.requestPermission(); } catch (e) { /* unsupported */ }
    showSync('work', 'Checking…', 'Looking for ready timing for this book.');
    const b = S.book, n = b.secs.length, plural = (c, w) => c + ' ' + w + (c === 1 ? '' : 's');
    if (!S.timings) S.timings = { tracks: {} };
    let ready = 0;
    for (let i = 0; i < n && S.book === b; i += 10) {
      await Promise.all(Array.from({ length: Math.min(10, n - i) }, async (_, k) => {
        const j = i + k;
        if (S.timings.tracks[j]) { ready++; return; }
        try {
          const r = await fetch('https://raw.githubusercontent.com/' + ghCfg().repo + '/main/data/' + encodeURIComponent(b.id) + '/' + j + '.json', { cache: 'no-store' });
          if (r.ok) { S.timings.tracks[j] = await r.json(); ready++; }
        } catch (e) { /* not ready */ }
      }));
    }
    if (S.book !== b) return;
    let req = '';
    if (ready < n) {
      const recent = Date.now() - (store.get('wt:req:' + b.id, 0) || 0) < 20 * 60e3;
      req = recent ? 'Sync requested. It is already running.' : await requestSync(b, true);
      if (/^Sync requested/.test(req)) { S.syncWatch = b.id; S.syncStart = Date.now(); }
    } else S.syncWatch = null;
    if (S.syncWatch === b.id) S.syncStatus = await grabStatus(b);
    reportSync(b, ready, req);
  }
  function loadTimingFile(file) {
    if (!file) return;
    file.text().then(txt => {
      S.timings = JSON.parse(txt);
      if (!S.model) { toast('Open a book first, then load its timing file.', 4000); return; }
      const n = applyTimings();
      toast(n ? 'Precise timing applied to ' + n + ' of ' + S.secs.length + ' tracks.' : 'This timing file does not match the open book.', 5000);
    }).catch(() => toast('That file could not be read.', 4000));
  }
  /* books.csv for wt_sync_check.js: every book this device has a Gutenberg text for, plus every pre-synced book in the packs index. */
  async function exportBookList() {
    try { if (!PKI.ready) await PKI.load(); } catch (e) { /* index not reachable: device books only */ }
    const rows = new Map();
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k || k.indexOf('wt:book:') !== 0) continue;
        const id = k.slice(8), r = store.get(k, null) || {}, st = r.text;
        let title = r.title || '';
        if (!title) { try { const b = await idb.get('b:' + id); title = (b && b.title) || ''; } catch (e) { /* none */ } }
        rows.set(id, { id, gid: st && st.kind === 'gutenberg' && st.id ? String(st.id).replace(/\D/g, '') : '', title });
      }
    } catch (e) { /* storage unavailable */ }
    PKI.map.forEach((v, id) => { id = String(id); if (!rows.has(id)) rows.set(id, { id, gid: '', title: '' }); });
    const list = [...rows.values()].filter(r => r.id).sort((a, b) => (+a.id - +b.id) || (a.id < b.id ? -1 : 1));
    if (!list.length) { toast('No books to export yet.'); return; }
    const cell = v => String(v == null ? '' : v).replace(/[,\r\n]+/g, ' ').trim();
    download('books.csv', 'id,gutenberg,title\n' + list.map(r => [r.id, r.gid, cell(r.title)].join(',')).join('\n') + '\n', 'text/csv');
    const miss = list.filter(r => !r.gid).length;
    toast(list.length + ' books saved to books.csv' + (miss ? '. ' + miss + ' still need a Gutenberg id.' : '.'), 6000);
  }
  { const bb = document.getElementById('b-booklist'); if (bb) bb.addEventListener('click', exportBookList); }
  { const g = store.get('wt:gh', {}) || {}, r = document.getElementById('in-ghrepo'), sb = document.getElementById('b-syncnow');
    const save = () => { if (r) store.set('wt:gh', { repo: r.value.trim() }); }; // only the repository name is kept; no token is ever stored
    if (r) { r.value = g.repo || ''; ['input', 'change'].forEach(ev => r.addEventListener(ev, save)); }
    if (sb) sb.addEventListener('click', () => { save(); syncNow(); }); }
  { const cb = document.getElementById('in-ntfy'), hp = document.getElementById('ntfy-help');
    if (cb && hp) {
      const show = () => { const t = store.get('wt:ntfy', ''); cb.checked = !!t; hp.hidden = !t; hp.textContent = t ? 'Install the free "ntfy" app, tap +, and subscribe to this name: ' + t + '. You will get a push alert when a sync finishes, even if this app is closed. Applies to the next sync you start.' : ''; };
      cb.addEventListener('change', () => {
        let t = '';
        if (cb.checked) { const a = new Uint8Array(8); (window.crypto || {}).getRandomValues ? crypto.getRandomValues(a) : a.forEach((_, i) => { a[i] = Math.random() * 256; }); t = 'wordtrail-' + Array.from(a, x => (x % 36).toString(36)).join(''); }
        store.set('wt:ntfy', t); show();
      });
      show();
    } }
  { const tf = document.getElementById('in-tim'); if (tf) tf.addEventListener('change', () => { loadTimingFile(tf.files[0]); tf.value = ''; }); }
  async function autoAlign(i) {
    if (S.aligning) return;
    const p = S.plan[i];
    if (!S.model || !p || !p.ids.length || !S.secs[i]) { toast('This track has no text to align.'); return false; }
    S.aligning = true; renderTextSheet(); updateSyncUI();
    let ok = false;
    try {
      const list = await computeFull(i, m => toast(m, 60000));
      S.anchors[i] = list; S.autoSrc[i] = 'full';
      S.curId = -1; replan(true); persist();
      toast('Aligned this track to the narrator\'s pauses.', 4000);
      ok = true;
    } catch (e) {
      console.error('Wordtrail: auto-align failed', e);
      S.alignFailed.add(i);
      toast(e.message === 'blocked' ? 'The audio host would not let the app read this file. Use Sync instead.'
        : e.message === 'nofit' ? 'The pauses did not match the text well enough. Use Sync instead.'
        : 'Could not analyse this audio on this device. Use Sync instead.', 5000);
    } finally {
      S.aligning = false; renderTextSheet(); updateSyncUI();
    }
    return ok;
  }
  function countAnchors() { return Object.values(S.anchors).reduce((a, l) => a + l.length, 0); }
