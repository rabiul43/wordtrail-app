  /* ---------- music-library.js ----------
     Music: music.json (manifest), the clip queue, which clip is next (energy, not repeating), fetching and caching clips. */
  /* Where music.json and the clips live: Cloudflare Pages (the files are too big for GitHub). Change this one line to move them. */
  const MUS_HOST = 'https://wordtrail-music.pages.dev/';
  /* Fetch and cache music.json from MUS_HOST. `force` skips the 24 hour saved copy (used before an offline download).
     When the network fails, an older saved copy is used whatever its age, so music that is already on the device still plays offline. */
  async function musFetchManifest(force) {
    if (MUS_LOCAL) {
      try {
        const r = await fetch('/_data/music.json', { cache: 'no-store' });
        if (r.ok) {
          const d = await r.json();
          if (d && d.v === 1 && d.moods) {
            MUS.manifest = d; MUS.base = location.origin + '/_data/'; MUS.mfT = Date.now();
            console.info('[music] local test mode: using /_data/music.json');
            return;
          }
        }
      } catch (e) { /* no local data — fall through to GitHub */ }
    }
    let cached = null;
    try {
      cached = store.get('wt:music-manifest', null);
      if (!force && cached && cached.d && Date.now() - cached.t < 24 * 3600e3) {
        MUS.manifest = cached.d; MUS.mfT = cached.t; return;
      }
      const base = MUS_HOST;
      const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 8000);
      const r = await fetch(base + 'music.json', { signal: ctl.signal }); clearTimeout(to);
      if (r.ok) {
        const d = await r.json();
        if (d && d.v === 1 && d.moods) {
          MUS.manifest = d; MUS.mfT = Date.now();
          store.set('wt:music-manifest', { t: MUS.mfT, d });
          return;
        }
      }
    } catch (e) { /* offline or not yet published: use the saved copy below */ }
    if (!MUS.manifest && cached && cached.d) { MUS.manifest = cached.d; MUS.mfT = cached.t || 0; }   // an old list is better than silence
  }
  /* The manifest is missing (first play offline, or the first fetch failed): try again, once at a time. */
  function musManifestRetry() {
    if (MUS.mfBusy) return;
    MUS.mfBusy = true;
    musFetchManifest().then(() => {
      MUS.mfBusy = false;
      if (MUS.manifest) { if (musNarrating()) musicPlay(); }
      else if (P.musOn === true && sndOn() && musNarrating()) { MUS.fail = true; musWarnPaint(); }
    });
  }

  /* Build a shuffled clip queue for a mood. Rotates if first clip equals the last-played one. */
  function musQueue(mood) {
    const clips = (MUS.manifest && MUS.manifest.moods && MUS.manifest.moods[mood]) || [];
    if (!clips.length) return [];
    const skip = MUS.recent.slice(-2).concat(MUS.playing ? [MUS.playing._file] : []);   // never the clip now playing or the one before it
    const fresh = clips.filter(c => skip.indexOf(c.f) < 0);
    return (fresh.length ? fresh : clips.filter(c => !MUS.playing || c.f !== MUS.playing._file).length ? clips.filter(c => !MUS.playing || c.f !== MUS.playing._file) : clips).slice();
  }

  /* How busy the music should be for what is being read: quiet under talk, fuller in action. 0 = soft, 1 = full. */
  function musDens() {   // share of the last three sentences that are quoted speech (computed here: AMB.scene.dens only exists while the ambient engine runs, and AMB.scene is also a plain scene name)
    try {
      const sents = S.model && S.model.sents, id = S.curId;
      if (!sents || id == null || id < 0 || !sents[id]) return 0.5;
      let q = 0, n = 0;
      for (let i = Math.max(0, id - 2); i <= id; i++) { const t = sents[i] && sents[i].t; if (t == null) continue; n++; if (/[\"\u201c\u201d]/.test(t)) q++; }
      return n ? q / n : 0.5;
    } catch (e) { return 0.5; }
  }
  function musTargetEnergy() {
    const dens = musDens();
    let t = dens >= 0.5 ? 0.2 : dens >= 0.25 ? 0.4 : 0.55;
    if (MUS.mood === 'danger' || MUS.mood === 'chase') t = Math.max(t, 0.75);
    else if (MUS.mood === 'peace' || MUS.mood === 'sorrow') t = Math.min(t, 0.4);
    return t;
  }
  function musSeenList() { const b = S.book; return (b && P.musSeen && P.musSeen[String(b.id)]) || []; }
  function musRemember(clip) {   // note a clip as played: not repeated soon, and the book prefers clips it has not heard yet
    MUS.recent.push(clip.f); if (MUS.recent.length > 4) MUS.recent.shift();
    try {
      const b = S.book; if (!b) return;
      const all = P.musSeen || (P.musSeen = {}), id = String(b.id), list = all[id] || (all[id] = []);
      const i = list.indexOf(clip.f); if (i >= 0) list.splice(i, 1);
      list.push(clip.f); if (list.length > 80) list.shift();
      const ids = Object.keys(all); if (ids.length > 40) delete all[ids[0]];   // keep the 40 most recent books
      savePrefs();
    } catch (e) { /* memory is a nicety */ }
  }
  function musTake() {   // remove and return the best clip left in the queue for now: unheard in this book first, then the right energy
    const q = MUS.queue; if (!q.length) return null;
    const seen = musSeenList(), want = musTargetEnergy();
    let bi = 0, bs = 1e9;
    q.forEach((c, i) => {
      const s = Math.abs((typeof c.e === 'number' ? c.e : 0.5) - want) + (seen.indexOf(c.f) >= 0 ? 0.6 : 0) + Math.random() * 0.3;   // the random part keeps it varied
      if (s < bs) { bs = s; bi = i; }
    });
    return q.splice(bi, 1)[0];
  }

  /* Resolve a clip path to an absolute raw GitHub URL. */
  function musClipUrl(f) {
    return (MUS.base || MUS_HOST) + 'music/' + f;
  }

  /* Fetch a clip, cache it in the Cache API, decode it. Returns AudioBuffer or null. */
  async function musFetch(f) {
    const url = musClipUrl(f);
    try {
      let resp;
      if (MUS.base) {
        resp = await fetch(url, { cache: 'no-store' });   // local test mode: never cache
      } else try {
        const c = await caches.open('wt-music');
        resp = await c.match(url);
        if (!resp) { resp = await fetch(url); if (resp.ok) { await c.put(url, resp.clone()); sndTouch(url); sndCachePrune(); } }
        else sndTouch(url);
      } catch (e) { resp = await fetch(url); }
      if (!resp || !resp.ok) return null;
      return await MUS.ctx.decodeAudioData(await resp.arrayBuffer());
    } catch (e) { return null; }
  }

