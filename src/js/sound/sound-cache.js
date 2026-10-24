  /* ---------- sound-cache.js ----------
     Sound: size cap, keep list and clear for saved music and recordings. */
  /* ---------- Sound cache: size cap and clear ----------
     Downloaded music and opening clips live in the Cache API ('wt-music', 'wt-amb-rec'). Keep them under about 150 MB:
     when over, the least recently used are removed first. A recording the reader added themselves (wt-rec.invalid/user/)
     cannot be downloaded again, so it is never removed here. Everything is best effort and must never break playback. */
  const SND_CACHES = ['wt-music', 'wt-amb-rec'], SND_CACHE_CAP = 150 * 1048576, SND_USER_KEY = 'https://wt-rec.invalid/user/';
  const SND_KEEP_KEY = 'wt-music-keep', SND_KEEP_CAP = 100 * 1048576;   // music the reader chose to save for offline: the prune skips it; at most 100 MB of it
  function sndKeepSet() { try { return new Set(JSON.parse(localStorage.getItem(SND_KEEP_KEY) || '[]') || []); } catch (e) { return new Set(); } }
  function sndKeepSave(set) { try { localStorage.setItem(SND_KEEP_KEY, JSON.stringify([...set])); } catch (e) { /* no storage: the clips may be pruned later */ } }
  let sndPruneBusy = false, sndPruneAt = 0;
  function sndUsedMap() { try { return JSON.parse(localStorage.getItem('wt-snd-used') || '{}') || {}; } catch (e) { return {}; } }
  function sndTouch(url) {   // remember when a cached clip was last used or added
    try { const m = sndUsedMap(), k = new Request(url).url; m[k] = Date.now(); localStorage.setItem('wt-snd-used', JSON.stringify(m)); } catch (e) { /* no storage: oldest-first falls back to cache order */ }
  }
  async function sndCacheList() {
    const out = [];
    if (!self.caches) return out;
    for (const name of SND_CACHES) {
      let c, keys; try { c = await caches.open(name); keys = await c.keys(); } catch (e) { continue; }
      for (const req of keys) {
        if (req.url.indexOf(SND_USER_KEY) === 0) continue;
        let size = 0;
        try { const r = await c.match(req); size = +r.headers.get('content-length') || 0; if (!size) size = (await r.clone().blob()).size; } catch (e) { /* size unknown: counts as 0 */ }
        out.push({ cache: name, url: req.url, size });
      }
    }
    return out;
  }
  async function sndCachePrune(force) {
    if (sndPruneBusy || (!force && Date.now() - sndPruneAt < 60000)) return;
    sndPruneBusy = true; sndPruneAt = Date.now();
    try {
      const list = await sndCacheList(), used = sndUsedMap(), keep = sndKeepSet();
      let total = list.reduce((a, x) => a + x.size, 0);
      if (total > SND_CACHE_CAP) {
        list.sort((a, b) => (used[a.url] || 0) - (used[b.url] || 0));   // never-seen entries count as oldest
        for (const x of list) {
          if (total <= SND_CACHE_CAP) break;
          if (keep.has(x.url)) continue;   // saved for offline on purpose
          try { const c = await caches.open(x.cache); if (await c.delete(x.url)) { total -= x.size; delete used[x.url]; } } catch (e) { /* skip this one */ }
        }
        try { localStorage.setItem('wt-snd-used', JSON.stringify(used)); } catch (e) { /* ignore */ }
      }
    } catch (e) { /* best effort */ }
    sndPruneBusy = false; sndCacheSizePaint();
  }
  async function sndCacheSizePaint() {
    const el = $('#snd-cache-size'); if (!el) return;
    try { const n = (await sndCacheList()).reduce((a, x) => a + x.size, 0); el.textContent = n < 1048576 ? '0 MB' : Math.round(n / 1048576) + ' MB'; } catch (e) { el.textContent = ''; }
  }
  async function sndCacheClear() {
    if (!confirm('Remove the music and sound files saved on this device? They download again when needed. Your own recordings are kept.')) return;
    try {
      for (const x of await sndCacheList()) { try { await (await caches.open(x.cache)).delete(x.url); } catch (e) { /* skip */ } }
      try { localStorage.removeItem('wt-snd-used'); localStorage.removeItem(SND_KEEP_KEY); } catch (e) { /* ignore */ }
    } catch (e) { /* ignore */ }
    sndCacheSizePaint(); musOffPaint(); toast('Saved sound files removed.');
  }
