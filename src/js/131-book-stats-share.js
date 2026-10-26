  /* ---------- Book stats on the details page ----------
     Two sources, both optional, both quiet when they have nothing to say:
       1. stats.json, rebuilt daily by build_stats.py: Internet Archive plays for each recording. No server needed.
       2. Wordtrail's own anonymous counts from a small Cloudflare Worker (STATS_API). Shown only once a book has
          STATS_MIN listeners, so a new book never says "2 listeners".
     Calm mode hides the row (see CSS), so nothing here turns listening into a score. */
  const STATS_API = '__WT_HOST_STATS__';   // set in hosts.json. Empty = own counts off.
  const STATS_MIN = 10, STATS_TTL = 6 * 3600e3, OWN_TTL = 15 * 60e3;
  const fmtCount = n => n >= 1e6 ? (n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace(/\.0$/, '') + 'M' : n >= 1e4 ? Math.round(n / 1e3) + 'K' : n >= 1e3 ? (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'K' : String(n);
  guideDoc('home', 'Book stats', "A book's page shows how many times it has been listened to and how many this week. Once enough people have listened on Wordtrail it also shows how many, and how many finish it. Calm mode hides these numbers. Settings > Audio > Share anonymous listen counts controls whether your own listening is counted.", '2026-10-17');
  async function getStatsFile() {
    let c = null; try { c = await idb.get('stats'); } catch (e) { /* no saved copy */ }
    if (c && c.d && Date.now() - c.t < STATS_TTL) return c.d;
    try {
      const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 8000);
      const r = await fetch('https://raw.githubusercontent.com/' + ghCfg().repo + '/main/stats.json', { signal: ctl.signal }); clearTimeout(to);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const d = await r.json();
      if (d && d.v === 1 && d.s) { idb.set('stats', { t: Date.now(), d }); return d; }
    } catch (e) { /* offline or not built yet: use the saved copy if there is one */ }
    return c && c.d ? c.d : null;
  }
  const OWN = new Map();
  async function getOwnStats(id) {
    if (!STATS_API) return null;
    const m = OWN.get(id); if (m && Date.now() - m.t < OWN_TTL) return m.d;
    try {
      const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 6000);
      const r = await fetch(STATS_API + '/s/' + encodeURIComponent(id), { signal: ctl.signal }); clearTimeout(to);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json(), d = { s: +j.s || 0, f: +j.f || 0 };
      OWN.set(id, { t: Date.now(), d }); return d;
    } catch (e) { return null; }
  }
  /* [[value, label], ...] for the details page; empty when there is nothing worth showing. */
  async function bookStats(b) {
    const id = String(b.id), out = [];
    const [file, own] = await Promise.all([getStatsFile(), getOwnStats(id)]);
    const row = file && file.s && file.s[id];
    if (row) {
      const per = Math.max(1, +b.n || 1);   // the Archive counts every track file that is fetched, so divide by the track count to get listens
      const total = Math.round((+row[0] || 0) / per), wk = Math.round((+row[1] || 0) / per);
      if (total >= 1) out.push([fmtCount(total), 'listens']);
      if (wk >= 1) out.push([fmtCount(wk), 'this week']);
    }
    if (own && own.s >= STATS_MIN) {
      out.push([fmtCount(own.s), 'on Wordtrail']);
      if (own.f >= 1) out.push([Math.min(100, Math.round(own.f / own.s * 100)) + '%', 'finish it']);
    }
    return out.slice(0, 4);
  }
  /* Sending: one 'start' per device and book (after a minute of real playback), and one 'finish' (only if that start was sent). */
  const statDev = () => {
    let d = store.get('wt:did', null);
    if (!d) { d = String((window.crypto && crypto.randomUUID) ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36)).replace(/[^a-z0-9-]/gi, ''); store.set('wt:did', d); }
    return d;
  };
  function statSend(id, kind) {
    if (!STATS_API || P.shareStats === false) return;
    id = String(id); const key = id + ':' + kind, sent = store.get('wt:sent', {}) || {};
    if (sent[key]) return;
    if (kind === 'finish' && !sent[id + ':start']) return;
    sent[key] = 1; store.set('wt:sent', sent);
    const undo = () => { const o = store.get('wt:sent', {}) || {}; delete o[key]; store.set('wt:sent', o); };   // failed: try again next time
    try {
      fetch(STATS_API + '/e', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: JSON.stringify({ b: id, k: kind, d: statDev() }), keepalive: true })
        .then(r => { if (!r.ok && r.status !== 429) undo(); }).catch(undo);
    } catch (e) { undo(); }
  }
  /* Share button at the top of the book page: the phone share sheet with the title, author and the app link; copies the text when sharing is not available */
  async function shareBook(b) {
    const by = String(b.authors || '').split(',')[0].trim(), url = location.origin + location.pathname;
    const text = '\u201c' + b.title + '\u201d' + (by && !/^unknown/i.test(by) ? ' by ' + by : '') + ' \u2013 listen and read along free on Wordtrail.';
    try { if (navigator.share) { await navigator.share({ title: b.title, text, url }); return; } } catch (e) { if (e && e.name === 'AbortError') return; }
    try { await navigator.clipboard.writeText(text + ' ' + url); toast('Link copied.', 2000); } catch (e) { toast('Could not share on this device.', 3000); }
  }
  function drawDetail(b) {
    const d = $('#detail'); d.textContent = '';
    const meta = [b.total ? fmtLong(b.total) : '', b.n ? b.n + (b.n === 1 ? ' track' : ' tracks') : '', b.lang || ''].filter(Boolean).join(' \u00b7 ');
    const lvl = h('span', { class: 'lvl', hidden: true }), sync = h('span', { class: 'det-chip', hidden: true }), yr = h('span', { class: 'det-chip', hidden: true });
    const genres = h('div', { class: 'det-genres', hidden: true }), about = h('section', { class: 'det-about', hidden: true });
    const bgrd = h('section', { class: 'det-about wp-sec', hidden: true });
    const stats = h('div', { class: 'det-stats', role: 'group', 'aria-label': 'Listening stats', hidden: true });
    const paint = () => {
      if (DET.book !== b) return;
      const v = LVL.map.get(String(b.id)), c = v && LVL.cefr[v[1]], t = v ? (LVL.tiers[v[0]] || '') : '';
      lvl.textContent = t ? t + (c ? ' \u00b7 ' + c[0] : '') : ''; lvl.hidden = !t; lvl.dataset.t = t ? v[0] : '';
      const sy = badgeText(b.id, true); sync.textContent = sy; sync.hidden = !sy;
    };
    const paintGenres = () => {
      if (DET.book !== b) return;
      const row = b.genres || ((CAT.books || []).find(x => x.id === String(b.id)) || {}).genres || '';
      const list = genreDedupe(String(row).split(/[,;|\/]+/).map(x => x.trim()).filter(Boolean)).slice(0, 4);
      genres.textContent = ''; list.forEach(g => genres.append(h('span', { class: 'det-chip g' }, g.replace(/\b\w/g, c => c.toUpperCase()))));
      genres.hidden = !list.length;
    };
    const showInfo = info => {
      if (DET.book !== b || !info) return;
      if (info.y >= 1000 && info.y <= 2100) { yr.textContent = 'Published ' + info.y; yr.hidden = false; }
      if (!info.d) return;
      const p = h('p', { class: 'det-desc clamp' }, info.d);
      const more = h('button', { class: 'sec-more', type: 'button', 'aria-expanded': 'false', onclick: () => { const open = !p.classList.toggle('clamp'); more.textContent = open ? 'Show less' : 'Read more'; more.setAttribute('aria-expanded', String(open)); } }, 'Read more');
      about.textContent = '';
      about.append(h('div', { class: 'home-section-head' }, h('h2', {}, 'About this book')), p);
      if (info.d.length > 260) about.append(more);   // only add the button for long text (a null here would print the word "null")
      about.hidden = false;
    };
    paint(); paintGenres();
    bookStats(b).then(items => {
      if (DET.book !== b || !items.length) return;
      stats.textContent = ''; items.forEach(([v, l]) => stats.append(h('div', { class: 'det-stat' }, h('b', {}, v), h('span', {}, l))));
      stats.hidden = false;
    }).catch(() => { /* no stats: the row stays hidden */ });
    if (!LVL.ready) LVL.load().then(paint).catch(() => {});
    if (!CAT.books) catLoad().then(paintGenres).catch(() => {});
    bookInfo(b).then(showInfo).catch(() => { /* offline: the page simply has no year or description */ });
    wpBook(b).then(rec => { if (DET.book === b) wpShow(bgrd, 'Background', rec); }).catch(() => { /* no Background section */ });
    const rec = listenedList().find(r => String(r.id) === String(b.id)), pct = rec ? Math.round((+rec.pct || 0) * 100) : 0;
    const resuming = pct >= 1 && pct < 99, listenLabel = pct >= 99 ? 'Read and listen again' : resuming ? 'Resume \u00b7 ' + pct + '%' : 'Read and listen';   // one button: the player shows the text and plays the narration together
    const prog = resuming ? h('div', { class: 'det-prog-w' }, h('div', { class: 'det-prog', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(pct), 'aria-label': 'Listening progress' }, h('i', { style: 'width:' + pct + '%' })), h('p', { class: 'det-prog-l' }, pct + '% listened')) : null;
    const more = h('div', { class: 'det-more' });
    (async () => {
      try { await Promise.all([catLoad(), SIM.load().catch(() => {}), VER.load().catch(() => {})]); } catch (e) { /* use what loaded */ }
      if (DET.book !== b) return;
      const x = detailData(b); if (!x) return;
      const first = String(b.authors || 'this author').split(',')[0];
      const sec = (title, node) => h('section', { class: 'home-section' }, h('div', { class: 'home-section-head' }, h('div', {}, h('h2', {}, title))), node);
      const row = (books, label) => { const r = h('div', { class: 'hrow', 'aria-label': label }); fillRow(r, books, null, 12); return r; };
      if (x.similar.length >= 3) more.append(sec('More like this', row(x.similar, 'Similar books')));
      if (x.others.length) more.append(sec('Other recordings', h('div', { class: 'list' }, x.others.map(o => bookCard(o, () => openDetail(o))))));
      if (x.author.length) more.append(sec('More by ' + first, row(x.author, 'More by ' + first)));
    })();
    /* desktop banner: the cover, blurred, fills the back of the hero (hidden on small screens, see 98-desktop-layout.css) */
    const detCover = coverBox(b, 'tile-cover det-cover'); if (b.id) dlMarkPaint(detCover, b.id);
    const detBack = h('div', { class: 'det-bg', 'aria-hidden': 'true' });
    try {
      const fillBack = () => { const im = detCover.querySelector('img.loaded'); if (!im) return false; detBack.style.backgroundImage = 'url("' + (im.currentSrc || im.src) + '")'; detBack.classList.add('on'); return true; };
      const mo = new MutationObserver(() => { if (fillBack()) mo.disconnect(); });
      mo.observe(detCover, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'src'] });
      setTimeout(() => mo.disconnect(), 15000);
    } catch (e) { /* no blurred backdrop */ }
    d.append(
      h('div', { class: 'det-top' },
        h('button', { class: 'ib', type: 'button', 'aria-label': 'Back', onclick: closeDetail }, svgIcon('#i-back')),
        h('span', {}, 'Book details'),
        h('div', { class: 'det-tools' }, h('button', { class: 'ib', type: 'button', 'aria-label': 'Share this book', onclick: () => shareBook(b) }, svgIcon('#i-share')))),
      h('section', { class: 'det-hero', style: '--h:' + colHue(0, (parseInt(b.id, 10) || 0) + 3) },
        detBack,
        detCover,
        h('h1', {}, b.title),
        authorLine(b),
        meta ? h('p', { class: 'det-meta' }, meta) : null,
        h('div', { class: 'det-chips' }, lvl, sync, yr),
        genres,
        stats,
        prog,
        h('div', { class: 'det-actions' },
          h('button', { class: 'det-btn', type: 'button', onclick: () => openBook(b, { play: true }) }, svgIcon('#i-play'), listenLabel),
          heartNode(b, 'on-detail'),
          h('button', { class: 'det-share', type: 'button', 'aria-label': 'Share this book', onclick: () => shareBook(b) }, svgIcon('#i-share')))),
      ratingsSection(b), about, bgrd, more);
  }