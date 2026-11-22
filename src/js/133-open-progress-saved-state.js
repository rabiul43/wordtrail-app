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
    if (OP.ui) OP.ui.lbl.textContent = sec >= 6 || OP.detail ? (extra || '') : '';   // one calm line; details only when it is slow
    opPaintBtn(pct, Math.round(OP.f * 100));
  }
  /* Opening the book: the text is not ready yet, so Play waits. The play buttons turn into the progress ring (see 99l-opening.css),
     a press is remembered and starts the narration the moment the text is ready (or when it fails, so listening is never blocked). */
  const opGate = () => !!(OP.active && !OP.home && S.book && !S.model);
  function opPaintBtn(pct, n) {
    const on = opGate();
    $$('#b-play, #mini-play, #nr-play').forEach(b => {
      b.classList.toggle('opening', on);
      b.classList.toggle('queued', on && !!S.playWhenReady);   // the press was heard: it starts when the text is ready (Wide play bar says so)
      if (on) { b.style.setProperty('--op', String(n)); b.dataset.pct = pct; b.setAttribute('aria-busy', 'true'); b.setAttribute('aria-label', 'Opening the book ' + pct); }
      else if (b.classList.contains('opening') || b.dataset.pct) { b.classList.remove('opening'); delete b.dataset.pct; b.style.removeProperty('--op'); b.removeAttribute('aria-busy'); b.setAttribute('aria-label', audio.paused ? 'Play' : 'Pause'); }
    });
    if (el.player) el.player.classList.toggle('opening', on);
    ostProg(n);
  }
  function opQueued() { const n = Math.round(OP.f * 100); opPaintBtn(n + '%', n); }
  function opRelease() {
    opPaintBtn('0%', 0);
    el.page.classList.add('op-in'); setTimeout(() => el.page.classList.remove('op-in'), 700);
    if (S.playWhenReady) { S.playWhenReady = false; if (S.book && audio.paused) audio.play().catch(onPlayFail); }
  }
  function startOpen(title, home) {
    clearInterval(OP.timer);
    Object.assign(OP, { active: true, home: !!home, f: 0, key: 'list', t0: Date.now(), title: title || '', detail: '', timed: true, ui: null });
    OP.timer = setInterval(paintOpen, 500);
    paintOpen();
    if (!home) { try { ostShow(true); } catch (e) { /* cosmetic */ } }
  }
  function endOpen() {
    clearInterval(OP.timer);
    if (OP.active && OP.home) progress(false);
    OP.active = false; OP.home = false; OP.ui = null;
    try { opRelease(); } catch (e) { /* cosmetic */ }
    try { ostShow(false); } catch (e) { /* cosmetic */ }
  }
  function setOpen(f, key, detail, timed) {
    if (!OP.active) return;
    if (key !== OP.key) { OP.key = key; OP.t0 = Date.now(); }
    OP.f = Math.max(OP.f, Math.min(1, f)); OP.detail = detail || ''; OP.timed = !!timed;
    paintOpen();
  }
  /* ---------- Opening style screen (Settings > Reading > Opening style) ----------
     While a book opens, spotlight | bloom show ONE calm full-screen card (cover, title, author, a progress cue) instead of the
     player, and fade to the reader when the text is ready. The person never sees steps or placeholder lines. classic = the page as before. The look is all CSS (html[data-open-style]);
     this code only builds the pieces, copies the book's cover/title and sets --op (0-100). Nothing runs on an audio tick. */
  const OST_LABEL = { bloom: 'Tuning in' };
  let ostEl = null, ostBook = null, ostTimer = 0;
  const ostScreenStyle = () => ['spotlight', 'bloom'].indexOf(ostStyleOf()) >= 0;
  function ostSet(b) { ostBook = b || null; if (ostEl) ostSync(); }
  function ostBuild() {
    if (ostEl || !el.player) return ostEl;
    const root = h('div', { class: 'op-screen', role: 'group', 'aria-label': 'Opening the book', hidden: '' });
    const back = h('button', { class: 'op-back', type: 'button', 'aria-label': 'Back' });
    back.innerHTML = '<svg class="ic" aria-hidden="true"><use href="#i-back"/></svg>';
    back.addEventListener('click', () => { const x = $('#btn-back'); if (x) x.click(); });
    const cone = h('div', { class: 'op-cone', 'aria-hidden': 'true' });
    const card = h('div', { class: 'op-card' });
    const cov = h('div', { class: 'op-cov' }), refl = h('div', { class: 'op-refl', 'aria-hidden': 'true' });
    const cw = h('div', { class: 'op-cwrap', 'aria-hidden': 'true' });
    cw.innerHTML = '<i class="op-r"></i><i class="op-r op-r2"></i><i class="op-r op-r3"></i><i class="op-frame"></i>';
    cw.append(cov);
    const t = h('h2', { class: 'op-t' }), a = h('p', { class: 'op-a' });
    const bars = h('div', { class: 'op-bars', 'aria-hidden': 'true' });
    const hs = [14, 24, 32, 20, 30, 38, 22, 34, 26, 40, 18, 30, 36, 22, 28, 12, 20, 16, 26, 14, 22, 12, 18, 10];
    hs.forEach(n => bars.append(h('i', { style: 'height:' + Math.round(n * .8) + 'px' })));
    const l = h('p', { class: 'op-l', role: 'status' });
    card.append(cw, refl, t, a, bars, l);
    root.append(cone, back, card);
    el.player.append(root);
    ostEl = { root, cov, refl, t, a, l, bars: [...bars.children], id: null };
    return ostEl;
  }
  function ostSync() {
    if (!ostEl) return;
    const b = ostBook || S.book, pt = $('#ptitle');
    const title = b && b.title ? b.title : (pt && pt.firstChild ? pt.firstChild.textContent : '');
    let au = b ? String(b.authors || '').trim() : (pt && pt.lastChild && pt.lastChild !== pt.firstChild ? pt.lastChild.textContent : '');
    if (/^unknown/i.test(au)) au = '';
    ostEl.t.textContent = title; ostEl.a.textContent = au; ostEl.a.hidden = !au;
    ostEl.l.textContent = OST_LABEL[ostStyleOf()] || '';
    const id = b ? String(b.id) : '';
    if (id !== ostEl.id || !ostEl.cov.firstChild) {
      ostEl.id = id;
      /* the card takes its colour from the cover (coverColor in 100: same colour the app accent uses) */
      const rs = ostEl.root.style; rs.removeProperty('--acc'); rs.removeProperty('--acc-bg');
      if (b) coverColor(b).then(c => {
        if (!ostEl || ostEl.id !== id || !c) return;
        const hu = Math.round(c.h), sa = Math.max(55, Math.min(88, Math.round(c.s || 60)));
        rs.setProperty('--acc', 'hsl(' + hu + ' ' + sa + '% 62%)'); rs.setProperty('--acc-bg', 'hsl(' + hu + ' ' + Math.round(sa * .55) + '% 6%)');
      }).catch(() => { /* keep the app accent */ });
      [ostEl.cov, ostEl.refl].forEach(n => { n.textContent = ''; if (b) n.append(h('div', { class: 'pcover-poster op-poster' }, coverBox(b, 'pcover-art'))); });
    }
  }
  function ostProg(n) {
    if (!ostEl || !OP.active) return;   // after the book is open the screen only fades out; it keeps its last progress
    ostEl.root.style.setProperty('--op', String(n));
    const k = Math.round(n * ostEl.bars.length / 100);
    ostEl.bars.forEach((x, i) => x.classList.toggle('on', i < k));
  }
  function ostShow(on) {
    clearTimeout(ostTimer);
    if (on) {
      if (!ostScreenStyle()) { if (ostEl) ostEl.root.hidden = true; return; }
      ostBuild(); if (!ostEl) return;
      ostSync(); ostProg(Math.round(OP.f * 100));
      ostEl.root.hidden = false;
      requestAnimationFrame(() => { if (ostEl && OP.active) ostEl.root.classList.add('on'); });
    } else if (ostEl) {
      ostEl.root.classList.remove('on');
      ostTimer = setTimeout(() => { if (ostEl && !ostEl.root.classList.contains('on')) ostEl.root.hidden = true; }, 450);
    }
  }
  function loadingNote() {
    const head = h('strong', {}, 'Opening the book…'), lbl = h('small');
    const n = h('div', { class: 'note op-note', role: 'status' }, head, h('div', { class: 'op-sk', 'aria-hidden': 'true' }, h('i'), h('i'), h('i'), h('i')), lbl);
    OP.ui = { head, lbl };
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
  /* Takes the complete lines out of what has arrived so far. Returns the usable objects and the unfinished rest.
     A line that is not valid JSON, or is not an object (null, a number ...), is skipped. */
  function takeJsonLines(buf) {
    const out = []; let nl;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
      if (!line) continue;
      try { const d = JSON.parse(line); if (d && typeof d === 'object') out.push(d); } catch (e) { /* skip this line */ }
    }
    return { out, buf };
  }
  /* The text of the combined request, or null when it is not coming. The text arrives as one line near the end of the stream, so the wait
     is cut short only when the stream itself has gone quiet for BUNDLE_QUIET (a slow but moving stream is waited for), not at the 40 s abort. */
  const BUNDLE_QUIET = 10000;
  function bundleWait(p) {
    return new Promise(res => {
      let iv = 0;
      const fin = v => { clearInterval(iv); res(v); };
      iv = setInterval(() => { if (Date.now() - (p.seen || 0) > BUNDLE_QUIET) fin(null); }, 1000);
      p.then(fin, () => fin(null));
    });
  }
  function fetchBundle(id, o) {
    const gidHint = o && o.gid ? String(o.gid) : '', wantText = !!(o && o.text);
    let gutRes, textRes;
    const gut = new Promise(r => { gutRes = r; }), text = new Promise(r => { textRes = r; });
    text.seen = Date.now();   // when the stream last delivered anything (see bundleWait)
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
          /* One broken line, or one line that cannot be used (e.g. the device is out of space), is skipped:
             the lines after it still arrive, so the tracks and the text can still load. */
          const feed = async chunk => {
            const t = takeJsonLines(buf + chunk); buf = t.buf;
            for (const d of t.out) { try { await onLine(d); } catch (e) { /* skip this line, keep reading */ } }
          };
          if (r.body && r.body.getReader) {
            const rd = r.body.getReader(), dec = new TextDecoder();
            for (;;) { const { done, value } = await rd.read(); if (done) break; text.seen = Date.now(); await feed(dec.decode(value, { stream: true })); }
            await feed(dec.decode() + '\n');
          } else await feed((await r.text()) + '\n');
          if (!first) reject(new Error('empty'));   // the stream ended without a usable track list: let the other routes answer
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
    const bundleP = PROXY ? fetchBundle(String(id), { gid: st && st.kind === 'gutenberg' && st.id ? st.id : (/^\d+$/.test(String(hint.gid || '')) ? String(hint.gid) : ''), text: !st }) : Promise.reject(new Error('no proxy'));
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
  async function resumeRecent(r, opts) {   // opts.play: start the narration at once (the play button on the My Library card)
    if (OP.active && OP.home) return;
    if (offBlock(r)) return;
    startOpen(r.title, true);
    try {
      let b = await idb.get('b:' + r.id);
      if (!b || !b.secs || !b.secs.length) b = await fetchFull({ id: r.id, title: r.title, authors: r.authors, cover: r.cover });
      if (!b || !b.secs.length) throw new Error('missing');
      openBook(b, opts);
    } catch (e) { endOpen(); setStatus('Could not open that book right now.', 'error', ['Try again', () => resumeRecent(r, opts)]); }
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
