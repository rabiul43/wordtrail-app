  /* ---------- helpers ---------- */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const h = (tag, props = {}, ...kids) => {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (v === false || v == null) continue;
      if (k === 'class') e.className = v;
      else if (k === 'text') e.textContent = v;
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat()) if (kid != null && kid !== false) e.append(kid.nodeType ? kid : document.createTextNode(kid));
    return e;
  };
  const decode = s => { const t = document.createElement('textarea'); t.innerHTML = String(s || ''); return t.value; };
  const reduceMotion = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const motionOk = () => (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) ? 'auto' : 'smooth';
  const fmt = Core.formatTime;
  /* Short length for tiles: 45m, 5h, 4h 15m (whole hours once a book passes ten hours). */
  const fmtShort = s => { s = Math.round(s); const hh = Math.floor(s / 3600), mm = Math.floor((s % 3600) / 60); return hh >= 10 ? (hh + (mm >= 30 ? 1 : 0)) + 'h' : hh ? hh + 'h' + (mm ? ' ' + mm + 'm' : '') : Math.max(1, mm) + 'm'; };
  const fmtLong = s => { s = Math.round(s); const hh = Math.floor(s / 3600), mm = Math.floor((s % 3600) / 60); return hh ? hh + ' h ' + mm + ' min' : mm + ' min'; };
  /* ---------- feature guide registry ----------
     Each feature describes itself where its code lives: guideDoc(section, title, text, since).
     The Feature guide (Account) is built from these calls, so changing a feature means changing its help text
     in the same place. `since` is the day (YYYY-MM-DD) a feature was added; for 30 days it carries a "New" badge.
     A feature added without a guideDoc call simply does not appear in the guide. */
  const GUIDE_SECS = [
    ['home', '\u{1F3E0}', 'Home and Library', 'Find a book and pick up where you left off'],
    ['collections', '\u{1F4DA}', 'Collections', 'Curated shelves'],
    ['mybooks', '\u{1F516}', 'My books', 'Saved books and synced books'],
    ['account', '\u{1F464}', 'Account', 'Your numbers, history and help'],
    ['player', '\u25B6\uFE0F', 'Player', 'Listening controls'],
    ['reading', '\u{1F4D6}', 'Reading along', 'Text that follows the narrator'],
    ['timing', '\u{1F9E9}', 'Text and timing', 'Make the text match the audio'],
    ['words', '\u{1F524}', 'Words and learning', 'Vocabulary and practice'],
    ['highlights', '\u270D\uFE0F', 'Highlights and notes', 'Keep what matters'],
    ['audio', '\u{1F3A7}', 'Audio', 'Make it easier to hear'],
    ['offline', '\u2B07\uFE0F', 'Offline', 'Listen without internet'],
    ['settings', '\u2699\uFE0F', 'Settings', 'Look, feel and backup'],
    ['keys', '\u2328\uFE0F', 'Keyboard shortcuts', 'On a computer']
  ];
  const GUIDE_REG = [];
  const guideDoc = (sec, title, desc, since) => { GUIDE_REG.push({ sec, title, desc, since: since || '' }); };

  /* Cloudflare Worker go-between, for networks that cannot reach LibriVox / Internet Archive / Gutenberg directly. */
  const PROXY = 'https://wordtrail-proxy.test-rabiulclaud-1.workers.dev';
  const PX_HOSTS = /(^|\.)(librivox\.org|archive\.org|gutenberg\.org|gutendex\.com)$/;
  const px = u => {
    try { const t = new URL(u, location.href); return PROXY && /^https?:$/.test(t.protocol) && PX_HOSTS.test(t.hostname) ? PROXY + '/?url=' + encodeURIComponent(t.href) : u; } catch (e) { return u; }
  };
  /* Hugging Face refuses browser requests that come from some web addresses (the app's workers.dev address is one),
     so those requests go through the wordtrail-hf Worker. If that Worker is down or unreachable the app asks
     Hugging Face directly, exactly as before. Empty string = always ask directly. */
  const HF_PROXY = 'https://wordtrail-hf.test-rabiulclaud-1.workers.dev';
  { const f0 = window.fetch.bind(window);
    window.fetch = (input, init) => {
      if (HF_PROXY && typeof input === 'string') {
        try {
          const t = new URL(input, location.href);
          if (t.hostname === 'huggingface.co') return f0(HF_PROXY + t.pathname + t.search, init).then(r => r.status >= 500 ? f0(input, init) : r, () => f0(input, init));
        } catch (e) { /* fall through to a normal request */ }
      }
      return f0(typeof input === 'string' ? px(input) : input, init);
    }; }
  let storeHook = null; // set by 295-account-sync.js: called with the key after every saved item
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { if (window.__wtRestoring) return; try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { return; /* storage unavailable */ } if (storeHook) storeHook(k); }
  };
  const idb = (() => {
    let dbp = null;
    const db = () => dbp || (dbp = new Promise((res, rej) => {
      try {
        const r = indexedDB.open('wordtrail', 1);
        r.onupgradeneeded = () => r.result.createObjectStore('texts');
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      } catch (e) { rej(e); }
    }));
    return {
      async get(k) {
        try { const d = await db(); return await new Promise(res => { const q = d.transaction('texts').objectStore('texts').get(k); q.onsuccess = () => res(q.result); q.onerror = () => res(undefined); }); } catch (e) { return undefined; }
      },
      async set(k, v) {
        if (window.__wtRestoring) return false;
        try { const d = await db(); return await new Promise(res => { const tx = d.transaction('texts', 'readwrite'); tx.objectStore('texts').put(v, k); tx.oncomplete = () => res(true); tx.onerror = tx.onabort = () => res(false); }); } catch (e) { return false; /* cache unavailable */ }
      }
    };
  })();

  /* ---------- offline audio: saved tracks ----------
     Whole tracks are saved as Blobs in a database of their own ('wordtrail-audio'), apart from the text cache.
       store 'audio': '<book id>:<track>' -> { blob, url, size, ts }
       store 'books': '<book id>' -> { id, title, authors, cover, n, tracks: { <track>: { u: url, s: bytes } }, ts }
     The 'books' records are small and are all the cards and the track list need. A saved track plays through a
     blob: URL made from its Blob. A track and its book record are written in one transaction, so a record never
     points at audio that is not there. */
  const adb = (() => {
    let dbp = null;
    const open = () => dbp || (dbp = new Promise((res, rej) => {
      try {
        if (!window.indexedDB) throw new Error('IndexedDB is not available');
        const r = indexedDB.open('wordtrail-audio', 1);
        r.onupgradeneeded = () => { r.result.createObjectStore('audio'); r.result.createObjectStore('books'); };
        r.onsuccess = () => { r.result.onversionchange = () => { r.result.close(); dbp = null; }; res(r.result); };
        r.onerror = () => { dbp = null; rej(r.error || new Error('open failed')); };
        r.onblocked = () => { dbp = null; rej(new Error('blocked')); };
      } catch (e) { dbp = null; rej(e); }
    }));
    const req = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    const fin = tx => { const p = new Promise((res, rej) => { tx.oncomplete = () => res(true); tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error || new Error('aborted')); }); p.catch(() => {}); return p; };
    const key = (id, i) => String(id) + ':' + i;
    return {
      async books() { const d = await open(); return req(d.transaction('books').objectStore('books').getAll()); },
      async blob(id, i) { const d = await open(); const rec = await req(d.transaction('audio').objectStore('audio').get(key(id, i))); return rec && rec.blob ? rec.blob : null; },
      async saveTrack(book, i, blob, url) {
        const d = await open(), tx = d.transaction(['audio', 'books'], 'readwrite'), done = fin(tx), id = String(book.id);
        tx.objectStore('audio').put({ blob, url, size: blob.size, ts: Date.now() }, key(id, i));
        tx.objectStore('audio').delete(key(id, i) + ':part');   // the half-finished copy is no longer needed
        const bs = tx.objectStore('books'), g = bs.get(id);
        let meta = null;
        g.onsuccess = () => {
          meta = g.result || { id, title: book.title, authors: book.authors, cover: book.cover, n: book.secs.length, tracks: {} };
          meta.n = book.secs.length; meta.ts = Date.now(); meta.tracks[i] = { u: url, s: blob.size };
          bs.put(meta, id);
        };
        await done;
        return meta;
      },
      /* A half-downloaded track: the bytes received so far, kept under '<book>:<track>:part' so a later try can continue with a Range request. */
      async getPart(id, i) { const d = await open(); const rec = await req(d.transaction('audio').objectStore('audio').get(key(id, i) + ':part')); return rec && rec.blob ? rec : null; },
      async putPart(id, i, rec) { const d = await open(), tx = d.transaction('audio', 'readwrite'), done = fin(tx); tx.objectStore('audio').put(rec, key(id, i) + ':part'); await done; },
      async dropPart(id, i) { const d = await open(), tx = d.transaction('audio', 'readwrite'), done = fin(tx); tx.objectStore('audio').delete(key(id, i) + ':part'); await done; },
      async dropTrack(bookId, i) {
        const d = await open(), tx = d.transaction(['audio', 'books'], 'readwrite'), done = fin(tx), id = String(bookId);
        tx.objectStore('audio').delete(key(id, i));
        tx.objectStore('audio').delete(key(id, i) + ':part');
        const bs = tx.objectStore('books'), g = bs.get(id);
        g.onsuccess = () => { const m = g.result; if (!m) return; delete m.tracks[i]; if (Object.keys(m.tracks).length) bs.put(m, id); else bs.delete(id); };
        await done;
      },
      async dropBook(bookId) {
        const d = await open(), tx = d.transaction(['audio', 'books'], 'readwrite'), done = fin(tx), id = String(bookId);
        tx.objectStore('audio').delete(IDBKeyRange.bound(id + ':', id + ':\uffff'));
        tx.objectStore('books').delete(id);
        await done;
      }
    };
  })();
  const dlMeta = new Map();    // book id -> its 'books' record
  const dlUrls = new Map();    // 'bookid:track' -> blob: URL (a few are kept so a saved track starts at once)
  const dlWarming = new Map(); // 'bookid:track' -> promise of its blob: URL
  let dlOk = true, srcSeq = 0;
  const dlKey = (id, i) => String(id) + ':' + i;
  const isLocal = (id, i, url) => { const m = dlMeta.get(String(id)), t = m && m.tracks[i]; return !!t && (!url || t.u === url); };
  const dlSaved = id => { const m = dlMeta.get(String(id)); return m ? Object.keys(m.tracks).length : 0; };
  /* Offline mode (navigator.onLine === false; screen code in 280). A book counts as available when at least one of its tracks is saved here. */
  const OFF = { on: false, ready: false, net: false };   // on = what the screens obey; net = the real-request probe says there is no connection (280)
  const offHave = id => !!id && dlSaved(id) > 0;
  const offBooks = () => { let n = 0; for (const m of dlMeta.values()) if (Object.keys(m.tracks || {}).length) n++; return n; };
  function offDim(node) {   // (name kept) a tile or card whose book is not on this device is HIDDEN while offline (.off-hide); 280 offHide() also hides rows and sections left empty
    if (!node || !node._wtId) return;
    const hide = OFF.on && !offHave(node._wtId);
    node.classList.toggle('off-hide', hide);
    const w = node.parentElement; if (w && w.classList.contains('card-wrap')) w.classList.toggle('off-hide', hide);   // the heart sits in the wrap
  }
  /* OFF.on = P.offForce (Settings > Storage > Offline > Downloads only) OR (P.offAuto, default on, AND the probe says offline). */
  const offForced = () => P.offForce === true && !(P.offAuto !== false && OFF.net);   // "Downloads only" chosen by hand, not just a lost connection
  const offMsg = () => (offForced() ? 'Downloads only is on and this book is not downloaded.' : "You're offline and this book is not downloaded.");
  function offBlock(b) {   // true (with a message) when this book cannot be played now: offline and nothing of it is saved
    if (!OFF.on || !b || !b.id || offHave(b.id)) return false;
    toast(offMsg(), 4000);
    return true;
  }
  /* Partly downloaded book while offline: a track (chapter) plays only when it is saved here. offNearSaved scans from `from` (included) in
     direction dir (+1 / -1) and returns the nearest saved track index, or -1. Used by the chapter list and the skipping in 280, and by openBook in 140. */
  const offTrackOn = (b, i) => !!b && !!b.secs && !!b.secs[i] && isLocal(b.id, i, b.secs[i].url);
  function offNearSaved(b, from, dir) {
    if (!b || !b.secs) return -1;
    for (let j = from; j >= 0 && j < b.secs.length; j += dir) if (offTrackOn(b, j)) return j;
    return -1;
  }
  function dlLocalFor(url) { for (const m of dlMeta.values()) for (const i in m.tracks) if (m.tracks[i].u === url) return [m.id, +i]; return null; }
  /* The saved Blob of a track file, or null when it is not on this device. Used to read audio without the network. */
  async function dlBlob(url) { const f = dlLocalFor(url); if (!f) return null; try { return await adb.blob(f[0], f[1]); } catch (e) { return null; } }
  function warmUrl(id, i) {
    const k = dlKey(id, i);
    if (dlUrls.has(k)) return Promise.resolve(dlUrls.get(k));
    if (dlWarming.has(k)) return dlWarming.get(k);
    const p = (async () => {
      let blob = null;
      try { blob = await adb.blob(id, i); } catch (e) { /* unreadable */ }
      if (!blob) return '';
      const u = URL.createObjectURL(blob);
      dlUrls.set(k, u);
      for (const [k2, u2] of dlUrls) { // keep only a handful, never the one that is playing or buffering
        if (dlUrls.size <= 6) break;
        if (u2 === u || audio.src === u2 || pre.src === u2) continue;
        URL.revokeObjectURL(u2); dlUrls.delete(k2);
      }
      return u;
    })().finally(() => dlWarming.delete(k));
    dlWarming.set(k, p);
    return p;
  }
  function dlClearUrls(keep) { for (const [k, u] of dlUrls) if (k !== keep) { URL.revokeObjectURL(u); dlUrls.delete(k); } }
  function dlWarmAround(i) { for (const j of [i + 1, i - 1]) if (S.secs[j] && isLocal(S.book.id, j, S.secs[j].url) && !dlUrls.has(dlKey(S.book.id, j))) warmUrl(S.book.id, j); }
  /* What the audio element should load for the current track right now: its saved copy if it is ready, else the network. */
  function curSrc() { const s = S.secs[S.sec], u = dlUrls.get(dlKey(S.book.id, S.sec)); return u && isLocal(S.book.id, S.sec, s.url) ? u : px(s.url); }
  function dlDropTrack(id, i) {
    const m = dlMeta.get(String(id)); if (m) { delete m.tracks[i]; if (!Object.keys(m.tracks).length) dlMeta.delete(String(id)); }
    adb.dropTrack(id, i).catch(() => {});
    const k = dlKey(id, i), u = dlUrls.get(k);
    if (u && audio.src !== u) { URL.revokeObjectURL(u); dlUrls.delete(k); }
    paintCards(); paintDl();
  }
  let dlReady = adb.books().then(list => { list.forEach(m => dlMeta.set(String(m.id), m)); }).catch(() => { dlOk = false; }).then(() => { paintCards(); });
  guideDoc('offline', 'Offline badge and auto-delete', "Books saved on this device show a filled \"Available offline\" badge on cards and tiles. Settings > Audio > Auto-delete finished downloads removes a book's audio when you reach its end.");
  guideDoc('offline', 'Resume interrupted downloads', "A download that stops (closed page, lost connection) keeps what it already received. Retry, or the next start on Wi-Fi, continues each track where it stopped instead of starting over.");
  guideDoc('offline', 'Manage downloads', "Settings > Storage shows how much space each downloaded book uses, can remove one book, or delete finished books in one go.");
  /* ---------- Download management (Settings): space used, size of each downloaded book, delete finished books ---------- */
  const dmSize = m => Object.values(m.tracks || {}).reduce((a, t) => a + (t.s || 0), 0);
  const dmMB = n => n < 1e5 ? Math.max(0, Math.round(n / 1e3)) + ' KB' : fmtMB(n);
  function dmFinished() { try { if (stDirty) stSave(); else ST = stLoad(); return new Set(stSummary().done.map(x => String(x.id))); } catch (e) { return new Set(); } }
  async function dmDrop(id) {   // removes one book's saved audio; false if it could not (or is downloading right now)
    id = String(id);
    if (DL.running && DL.id === id) return false;
    try { await adb.dropBook(id); } catch (e) { return false; }
    dlMeta.delete(id);
    { const q = dqGet(); if (q && q.id === id) dqClear(); }
    if (DL.id === id) DL.st = {};
    if (S.book && String(S.book.id) === id) {
      const fromBlob = /^blob:/.test(audio.currentSrc || audio.src), t = audio.currentTime, was = !audio.paused;
      dlClearUrls(); if (fromBlob) loadAudio(S.sec, t, was);
      renderTracks(); updateHeader();
    } else {
      for (const [k, u] of dlUrls) if (k.indexOf(id + ':') === 0) { URL.revokeObjectURL(u); dlUrls.delete(k); }
    }
    return true;
  }
  /* Storage protection: ask the browser not to evict the offline audio. Called from a user tap (first download). The answer is
     remembered on this device ('wt:persist' = { ok, ts }); it is not synced. Returns true / false / null (not supported). */
  const dmPersistGet = () => { const v = store.get('wt:persist', null); return v && typeof v.ok === 'boolean' ? v.ok : null; };
  async function dlPersist() {
    try {
      const sg = navigator.storage; if (!sg || !sg.persist) return null;
      let ok = sg.persisted ? await sg.persisted() : false;
      if (!ok) ok = await sg.persist();
      ok = !!ok;
      if (dmPersistGet() !== ok) store.set('wt:persist', { ok, ts: Date.now() });
      dmNote();
      return ok;
    } catch (e) { return null; /* optional */ }
  }
  /* The short note under the space bar: protected or may be removed. Stays hidden until the browser has given an answer. */
  function dmNote() {
    const n = $('#dm-note'); if (!n) return;
    const ok = dmPersistGet();
    n.hidden = ok === null;
    n.classList.toggle('dm-note-ok', ok === true);
    n.textContent = ok === true ? 'Protected from automatic clean-up' : ok === false ? 'May be removed if the phone runs low on space' : '';
  }
  /* Percent of the browser's storage allowance that is used (null if unknown). */
  async function dmUsedPct() {
    try { const e = navigator.storage && navigator.storage.estimate ? await navigator.storage.estimate() : null; return e && e.quota ? (e.usage || 0) / e.quota * 100 : null; } catch (e) { return null; }
  }
  async function dmRender() {
    const sum = $('#dm-sum'), list = $('#dm-list'), fin = $('#dm-fin'); if (!sum) return;
    await dlReady;
    const fset = dmFinished();
    const rows = [...dlMeta.values()].map(m => ({ m, size: dmSize(m), n: Object.keys(m.tracks || {}).length, done: fset.has(String(m.id)) })).sort((a, b) => b.size - a.size);
    const total = rows.reduce((a, r) => a + r.size, 0), fr = rows.filter(r => r.done), fsz = fr.reduce((a, r) => a + r.size, 0);
    const big = $('#dm-big'); if (big) big.textContent = rows.length ? dmMB(total) : '0 KB';
    const all = $('#dm-all'); if (all) { all.disabled = !rows.length; all.textContent = rows.length ? 'Delete all downloads (' + dmMB(total) + ')' : 'Delete all downloads'; }
    sum.textContent = rows.length ? 'Downloaded audio uses ' + dmMB(total) + ' across ' + plural(rows.length, 'book') + '.' : 'No books are downloaded on this device.';
    const spEl = $('#dm-space'); if (spEl) spEl.textContent = '';
    dmNote();
    if (navigator.storage && navigator.storage.persisted) navigator.storage.persisted().then(ok => { if (ok && dmPersistGet() !== true) { store.set('wt:persist', { ok: true, ts: Date.now() }); } dmNote(); }).catch(() => {});
    try { if (navigator.storage && navigator.storage.estimate) navigator.storage.estimate().then(e => { if (!e || !e.quota) return; const used = e.usage || 0, quota = e.quota, free = Math.max(0, quota - used), pct = Math.min(100, Math.round(used / quota * 100)); if ($('#dm-sum') === sum && spEl) { const wn = $('#dm-warn'); if (wn) { wn.hidden = pct <= 90; wn.textContent = pct > 90 ? 'Storage is almost full (' + pct + '% used). Downloads may fail. Remove finished books to free space.' : ''; } spEl.innerHTML = '<b>' + dmMB(used) + '</b> used · <b>' + dmMB(free) + '</b> free <span class="dm-sp-bar" aria-hidden="true"><b style="width:' + pct + '%"></b></span>'; } }).catch(() => {}); } catch (e) { /* optional */ }
    list.textContent = '';
    if (!rows.length) list.append(h('p', { class: 'dm-empty' }, 'Open a book and tap Download book to listen offline.'));
    rows.forEach(r => {
      const sub = h('small', {}, r.n + ' of ' + r.m.n + (r.m.n === 1 ? ' track' : ' tracks'));
      if (r.done) sub.append(' · ', h('span', { class: 'dm-tag' }, 'Finished'));
      list.append(h('div', { class: 'dm-row' },
        h('div', { class: 'dm-t' }, h('b', {}, r.m.title || 'Untitled'), sub),
        h('span', { class: 'dm-sz' }, dmMB(r.size)),
        h('button', { class: 'btn small ghost', type: 'button', 'aria-label': 'Remove download of ' + (r.m.title || 'this book'), onclick: async () => {
          if (!confirm('Remove the downloaded audio of "' + (r.m.title || 'this book') + '" (' + dmMB(r.size) + ') from this device?')) return;
          if (!await dmDrop(r.m.id)) toast('Could not remove it right now.', 4000); else toast('Download removed.');
          paintCards(); paintDl(); dmRender();
        } }, 'Remove')));
    });
    fin.disabled = !fr.length;
    fin.textContent = fr.length ? 'Delete finished books (' + fr.length + ' · ' + dmMB(fsz) + ')' : 'Delete finished books';
  }
  async function dmDeleteAll() {
    await dlReady;
    const rows = [...dlMeta.values()];
    if (!rows.length) { toast('No books are downloaded.'); return; }
    const size = rows.reduce((a, m) => a + dmSize(m), 0);
    if (!confirm('Delete the downloaded audio of ' + plural(rows.length, 'book') + ' (' + dmMB(size) + ')? Your positions, stats and favourites are kept.')) return;
    let ok = 0; for (const m of rows) if (await dmDrop(m.id)) ok++;
    toast(ok === rows.length ? plural(ok, 'book') + ' deleted, ' + dmMB(size) + ' freed.' : ok + ' of ' + rows.length + ' deleted. A book that is downloading right now was skipped.', 4500);
    paintCards(); paintDl(); dmRender();
  }
  async function dmDeleteFinished() {
    await dlReady;
    const fset = dmFinished(), rows = [...dlMeta.values()].filter(m => fset.has(String(m.id)));
    if (!rows.length) { toast('No finished books are downloaded.'); return; }
    const size = rows.reduce((a, m) => a + dmSize(m), 0);
    if (!confirm('Delete the downloaded audio of ' + plural(rows.length, 'finished book') + ' (' + dmMB(size) + ')? Your positions, stats and favourites are kept.')) return;
    let ok = 0; for (const m of rows) if (await dmDrop(m.id)) ok++;
    toast(ok === rows.length ? plural(ok, 'finished book') + ' deleted, ' + dmMB(size) + ' freed.' : ok + ' of ' + rows.length + ' deleted. A book that is downloading right now was skipped.', 4500);
    paintCards(); paintDl(); dmRender();
  }

  const P = Object.assign({ theme: 'auto', size: 1.24, speed: 1, nudge: 0.15, recents: [], viz: (reduceMotion || /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) ? 'off' : 'bars' }, store.get('wt:prefs', {}));
  const savePrefs = () => store.set('wt:prefs', P);
  /* Haptics: one small vocabulary of vibrations, used the same way everywhere. Off switch: Settings > Audio. */
  guideDoc('audio', 'Haptic feedback', "Small vibrations when you tap play, skip, change speed and reach your goal. Turn them off in Settings > Audio.");
  const HAPTIC = { tick: 6, light: 10, medium: 16, heavy: 26, success: [16, 50, 28], goal: [20, 60, 20, 60, 44] };
  function buzz(kind) {
    if (P.haptics === false || P.calm === true) return;
    try { if (navigator.vibrate) navigator.vibrate(HAPTIC[kind] || 10); } catch (e) { /* not supported */ }
  }

