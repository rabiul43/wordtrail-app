  /* ---------- opening progress ---------- */
  /* One bar for the whole open: 1 track list (0-25%), 2 find the text (25-35%), 3 download the
     text (35-85%, real bytes), 4 prepare it (85-100%). It shows on the home page for step 1 and
     in the reader afterwards. The bar only moves when something really happens. */
  const STEPS = { list: [1, 'Getting the track list'], find: [2, 'Finding the text'], dl: [3, 'Downloading the text'], prep: [4, 'Preparing the text'] };
  const OP = { active: false, home: false, f: 0, key: 'list', t0: 0, title: '', detail: '', timed: true, ui: null, timer: 0 };
  const mb = n => (n / 1e6).toFixed(1) + ' MB';
  function paintOpen() {
    if (!OP.active) return;
    if (document.hidden && P.idleWork !== false) return; // nobody can see it; the page repaints when it is shown again
    const st = STEPS[OP.key] || STEPS.list, pct = Math.round(OP.f * 100) + '%';
    const sec = Math.floor((Date.now() - OP.t0) / 1000);
    const extra = OP.detail || (OP.timed && sec >= 3 ? sec + 's' : '');
    if (OP.home) { progress(true, OP.f, pct); setStatus('Opening "' + OP.title + '": ' + st[1].toLowerCase() + '…' + (extra ? ' (' + extra + ')' : '')); }
    if (OP.ui) {
      OP.ui.head.textContent = st[1];
      OP.ui.bar.style.width = pct; OP.ui.pct.textContent = pct;
      OP.ui.lbl.textContent = ['Step ' + st[0] + ' of 4', extra].filter(Boolean).join(' · ');
    }
  }
  function startOpen(title, home) {
    clearInterval(OP.timer);
    Object.assign(OP, { active: true, home: !!home, f: 0, key: 'list', t0: Date.now(), title: title || '', detail: '', timed: true, ui: null });
    OP.timer = setInterval(paintOpen, 500);
    paintOpen();
  }
  function endOpen() {
    clearInterval(OP.timer);
    if (OP.active && OP.home) progress(false);
    OP.active = false; OP.home = false; OP.ui = null;
  }
  function setOpen(f, key, detail, timed) {
    if (!OP.active) return;
    if (key !== OP.key) { OP.key = key; OP.t0 = Date.now(); }
    OP.f = Math.max(OP.f, Math.min(1, f)); OP.detail = detail || ''; OP.timed = !!timed;
    paintOpen();
  }
  function loadingNote() {
    const head = h('strong', {}, 'Loading the book text…'), bar = h('i'), pct = h('span'), lbl = h('small');
    const n = h('div', { class: 'note', role: 'status' }, head, h('div', { class: 'prog', style: 'width:100%;max-width:20rem' }, h('div', { class: 'bar' }, bar), pct), lbl);
    OP.ui = { head, bar, pct, lbl };
    paintOpen();
    return n;
  }
  /* The track list of one recording. Tries the full LibriVox record, then a plainer request,
     then the recording's RSS feed. Returns null when LibriVox answered but lists no tracks, and
     throws only when nothing could be reached. */
  function parseClock(t) {
    const p = String(t || '').trim().split(':').map(Number);
    if (!p.length || p.some(x => !isFinite(x))) return 0;
    return p.reduce((a, x) => a * 60 + x, 0);
  }
  async function rssTracks(id) {
    const xml = await fetchVia('https://librivox.org/rss/' + encodeURIComponent(id), r => r.text(), 15000);
    const doc = new DOMParser().parseFromString(xml, 'text/xml');
    return [...doc.querySelectorAll('item')].map((it, i) => {
      const enc = it.querySelector('enclosure'), ti = it.querySelector('title'), du = it.getElementsByTagName('itunes:duration')[0];
      return { id: String(i), title: decode(ti ? ti.textContent : '') || 'Track ' + (i + 1), url: String(enc ? enc.getAttribute('url') : '').replace(/^http:/, 'https:'), dur: parseClock(du && du.textContent), reader: '' };
    }).filter(t => t.url);
  }
  /* ---------- combined /book request ----------
     One call to the Worker returns the track list, the Gutenberg id and the text (answered from its cache after
     the first time). It streams one JSON object per line, so the tracks show up as soon as they are known and the
     text follows. The text is saved under g:<id>, exactly where the usual download would put it. If the Worker
     has no /book route or fails, the older routes below run as before. */
  const bundles = new Map(), bundleText = new Map();
  function fetchBundle(id, o) {
    const gidHint = o && o.gid ? String(o.gid) : '', wantText = !!(o && o.text);
    let gutRes, textRes;
    const gut = new Promise(r => { gutRes = r; }), text = new Promise(r => { textRes = r; });
    bundles.set(id, { gut, text });
    let gid = gidHint;
    if (gid) { gutRes({ id: gid, label: 'Project Gutenberg #' + gid }); if (wantText) bundleText.set(gid, text); }
    return new Promise((resolve, reject) => {
      const c = new AbortController(), to = setTimeout(() => c.abort(), 40000);
      let first = false;
      const onLine = async d => {
        if (d.error) { if (!first) reject(new Error(d.error === 'no tracks' ? 'empty' : d.error)); return; }
        if (d.lv && !first) { const bk = normBook(d.lv); if (!bk.secs.length) { reject(new Error('empty')); return; } first = true; resolve(bk); }
        if (d.gut !== undefined && !gid) {
          if (d.gut && d.gut.id) { gid = String(d.gut.id); if (wantText) bundleText.set(gid, text); gutRes({ id: gid, label: d.gut.label || 'Project Gutenberg #' + gid }); }
          else gutRes(null);
        }
        if (typeof d.text === 'string' && d.text.length >= 4000 && gid) { await idb.set('g:' + gid, d.text); textRes(d.text); }
      };
      (async () => {
        try {
          const r = await fetch(PROXY + '/book?id=' + encodeURIComponent(id) + (gidHint ? '&gid=' + gidHint : '') + (wantText ? '' : '&text=0'), { signal: c.signal });
          if (!r.ok) throw new Error('HTTP ' + r.status);
          let buf = '';
          const feed = async chunk => {
            buf += chunk;
            let nl;
            while ((nl = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1); if (line) await onLine(JSON.parse(line)); }
          };
          if (r.body && r.body.getReader) {
            const rd = r.body.getReader(), dec = new TextDecoder();
            for (;;) { const { done, value } = await rd.read(); if (done) break; await feed(dec.decode(value, { stream: true })); }
            await feed(dec.decode() + '\n');
          } else await feed((await r.text()) + '\n');
        } catch (e) { if (!first) reject(e); }
        finally { clearTimeout(to); gutRes(null); textRes(null); if (gid && bundleText.get(gid) === text) bundleText.delete(gid); }
      })();
    });
  }
  async function fetchFull(hint) {
    const id = hint.id;
    setOpen(0.04, 'list', '', true);
    const ok = f => f && f.secs && f.secs.length;
    let won = false;
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    // The combined request starts first (and at once). A book opened before already has its text on this device, so only the tracks are asked for.
    const st = (store.get('wt:book:' + id, null) || {}).text;
    const bundleP = PROXY ? fetchBundle(String(id), { gid: st && st.kind === 'gutenberg' && st.id ? st.id : '', text: !st }) : Promise.reject(new Error('no proxy'));
    bundleP.catch(() => {});
    // The older routes wait a moment for it, and start straight away if it fails.
    const gate = ms => new Promise(res => { const t = setTimeout(res, ms); bundleP.catch(() => { clearTimeout(t); res(); }); });
    const legacy = async (extra, fn) => { await gate(2500); if (extra) await sleep(extra); if (won) throw new Error('skipped'); return fn(); };
    const viaBundle = () => bundleP.catch(e => { throw (e && e.message === 'empty') ? e : new Error('bundle: ' + (e && e.message)); });
    const viaApi = async () => {
      const [f] = await lvGet({ id }, { nonEmpty: true, onStage: k => { if (k > 0) setOpen(0.1, 'list', 'LibriVox is slow, trying another route', true); } });
      if (!ok(f)) throw new Error('empty'); return f;
    };
    const viaLight = async () => { const [f] = await lvGet({ id, extended: 1 }, { light: true, nonEmpty: true }); if (!ok(f)) throw new Error('empty'); return f; };
    const viaRss = async () => {
      const secs = await rssTracks(id);
      if (!secs.length) throw new Error('empty');
      const last = String(hint.authors || '').split(',')[0].trim().split(/\s+/).pop() || '';
      return Object.assign({ authorLast: last, lang: '', textUrl: '', cover: '' }, hint, { secs, n: secs.length, total: secs.reduce((a, t) => a + t.dur, 0) });
    };
    // The first with tracks wins.
    try {
      const full = await Promise.any([viaBundle(), legacy(0, viaApi), legacy(1500, viaRss), legacy(3000, viaLight)]);
      won = true;
      setOpen(0.25, 'list', 'done');
      idb.set('b:' + id, full); // next time this book opens without asking LibriVox again
      return full;
    } catch (e) {
      won = true;
      const errs = ((e && e.errors) || [e]).filter(x => !(x && /^(bundle:|skipped)/.test(x.message)));
      if (errs.every(x => x && x.message === 'empty')) return null;
      throw errs.find(x => x && x.message !== 'empty') || e;
    }
  }
  async function resumeRecent(r) {
    if (OP.active && OP.home) return;
    if (offBlock(r)) return;
    startOpen(r.title, true);
    try {
      let b = await idb.get('b:' + r.id);
      if (!b || !b.secs || !b.secs.length) b = await fetchFull({ id: r.id, title: r.title, authors: r.authors, cover: r.cover });
      if (!b || !b.secs.length) throw new Error('missing');
      openBook(b);
    } catch (e) { endOpen(); setStatus('Could not open that book right now.', 'error', ['Try again', () => resumeRecent(r)]); }
  }
  function bookPct() {
    const total = S.durs.reduce((a, b) => a + b, 0) || 1;
    let before = 0;
    for (let i = 0; i < S.sec; i++) before += S.durs[i];
    return Math.min(1, (before + (S.pendingSeek || audio.currentTime || 0)) / total);
  }
  /* ---------- saved state of a book ----------
     localStorage keeps only what is small and needed at once: the position, lead/outro and the text source.
     The sync state (chapter map, anchors, ranges) can grow large and is written often, so it lives in
     IndexedDB under s:<book id>. Older saves that still hold it in localStorage are moved on first open.
     If IndexedDB refuses a write, the state is kept in localStorage instead, so nothing is lost. */
  /* ---------- heartbeat ----------
     Saving the position and the drift check only matter while something is playing, so the 5-second timer is
     only running then (it used to wake the phone every 5 seconds all day). Every 6th beat does a full save as a
     safety net. With the setting off in Settings > Advanced, it runs all the time and saves in full, as before. */
  const HB = { id: 0, n: 0 };
  const hbSaver = () => P.idleWork !== false;
  function hbTick() {
    HB.n++;
    if (S.book && !audio.paused) persist(hbSaver() && HB.n % 6 !== 0 ? true : undefined);
    driftTick();
  }
  function hbSync() {
    const want = !hbSaver() || !audio.paused;
    if (want && !HB.id) HB.id = setInterval(hbTick, 5000);
    else if (!want && HB.id) { clearInterval(HB.id); HB.id = 0; }
  }
  const SAVED_V = 1;
  const heavyOf = () => ({ v: SAVED_V, mode: S.mode, map: S.map, span: S.span, mv: MAP_VERSION, anchors: S.anchors, ranges: S.ranges, auto: S.autoSrc });
  const slimOf = r => ({ sec: r.sec, time: r.time, lead: r.lead, outro: r.outro, text: r.text });
  async function loadSaved(id) {
    const local = store.get('wt:book:' + id, null) || {};
    if (local.anchors || local.ranges || local.map || local.mode) { // newest copy: legacy, or IndexedDB was unavailable last time
      const heavy = { v: SAVED_V, mode: local.mode, map: local.map, span: local.span, mv: local.mv, anchors: local.anchors || {}, ranges: local.ranges || {}, auto: local.auto || {} };
      if (await idb.set('s:' + id, heavy)) store.set('wt:book:' + id, slimOf(local));
      return Object.assign({}, local, heavy);
    }
    const heavy = await idb.get('s:' + id);
    return heavy && heavy.v === SAVED_V ? Object.assign({}, local, heavy) : local;
  }
  /* persist(true) is the light save used while playing: only the listening position. The sync state, the recents
     and the listening history go out with a full persist(), which every real change, pause, track switch and
     leaving the page already calls. (The page-hide handler passes an event, so only an exact true counts.) */
  function persist(quick) {
    if (!S.book) return;
    if (S.lp) lpSave();
    const id = S.book.id;
    const rec = { sec: S.sec, time: S.pendingSeek || audio.currentTime || 0, lead: S.lead, outro: S.outro, text: S.textSrc };
    if (quick === true && S.heavyFail !== id) { store.set('wt:book:' + id, rec); return; }
    const heavy = heavyOf(), blob = JSON.stringify(heavy);
    if (blob !== S.heavyBlob || S.heavyFail === id) { // the sync state only goes out when it changed
      S.heavyBlob = blob;
      idb.set('s:' + id, heavy).then(ok => {
        if (ok) { if (S.heavyFail === id) S.heavyFail = null; return; }
        S.heavyFail = id; store.set('wt:book:' + id, Object.assign({}, rec, heavy));
      });
    }
    store.set('wt:book:' + id, S.heavyFail === id ? Object.assign(rec, heavy) : rec);
    const rd = S.book.secs && S.book.secs[0] && S.book.secs[0].reader;
    if (rd) store.set('wt:rdr:' + S.book.id, rd);
    const entry = { id: S.book.id, title: S.book.title, authors: S.book.authors, cover: S.book.cover, ia: S.book.ia || '', pct: bookPct(), ts: Date.now(), total: S.book.total || 0 };
    P.recents = [entry, ...P.recents.filter(r => r.id !== entry.id)].slice(0, 10);
    savePrefs();
    if (entry.pct >= 0.02) { // a longer listening history than the 8 recents, used for recommendations
      const L = store.get('wt:listens', []) || [];
      store.set('wt:listens', [{ id: entry.id, title: entry.title, authors: entry.authors, pct: entry.pct, ts: entry.ts }, ...L.filter(x => x.id !== entry.id)].slice(0, 40));
    }
  }


  guideDoc('player', 'Choose a reader', "Controls > Reader lists the other recordings of the same book. Hear a 20-second sample from where you are, then switch and carry on at the same place.", '2026-10-03');
