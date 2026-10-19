  /* ---------- Book detail page ----------
     Tapping a book in a list, row or search lands here. Listen and Read open the player (Read starts in the
     text-only reading mode). Back from the player returns to this page; Back here returns to the old spot. */
  const detNow = () => DET.book ? { book: DET.book, rv: DET.rv } : DET.author ? { author: DET.author } : null;
  function detPush() { const cur = detNow(); if (!cur) DET.y = window.scrollY; else { DET.stack.push(cur); if (DET.stack.length > 20) DET.stack.shift(); } }
  function openDetail(b) {
    if (!b || !b.id) { openBook(b); return; }
    detPush();
    DET.book = b; DET.author = null; DET.rv = false;
    drawDetail(b);
    showView('home');
  }
  function openAuthor(a) {
    detPush();
    DET.author = a; DET.book = null; DET.rv = false;
    drawAuthor(a);
    showView('home');
  }
  /* draws whatever page DET says is open: a book, its reviews page (135-ratings.js) or an author */
  function detDraw() { if (DET.book) { if (DET.rv) drawReviews(DET.book); else drawDetail(DET.book); } else if (DET.author) drawAuthor(DET.author); }
  function closeDetail() {
    const prev = DET.stack.pop();
    if (prev) {
      DET.book = prev.book || null; DET.author = prev.author || null; DET.rv = !!prev.rv;
      detDraw();
      showView('home');
      return;
    }
    const y = DET.y;
    DET.book = null; DET.author = null; DET.rv = false; $('#detail').textContent = '';
    showView('home');
    requestAnimationFrame(() => window.scrollTo(0, y));
  }
  /* Year and description come from LibriVox (copyright_year, description); they are fetched once per book
     when its page opens and kept on the device for 30 days. */
  const plainText = html => decode(String(html || '').replace(/<\s*br\s*\/?>|<\/p>/gi, '\n').replace(/<[^>]*>/g, '')).replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n\n').trim();
  async function bookInfo(b) {
    const key = 'wt:info:' + b.id, c = store.get(key, null);
    if (c && c.t && c.a && Date.now() - c.t < 30 * 864e5) return c;
    let f = (b.year || b.desc) ? b : null;
    if (!f) { const [x] = await lvGet({ id: b.id, fields: '{id,title,authors,language,description,copyright_year}' }, { nonEmpty: true }); f = x; }
    if (!f) return null;
    const info = { t: Date.now(), y: f.year || 0, d: plainText(f.desc), a: f.authorInfo || [] };
    store.set(key, info);
    return info;
  }
  /* ---------- Follow an author ----------
     wt:follows = { "jane austen": { n: "Jane Austen", t: time, m: highest book id when followed or last seen, f: 1 } }.
     f: 0 = unfollowed; the small marker stays so the unfollow reaches your other devices too (synced with Favourites).
     m: -1 = the catalogue was not loaded yet; it is filled in as soon as it is. Books with an id above m are "new". */
  const folKey = name => String(name || '').trim().toLowerCase();
  const folAll = () => { const o = store.get('wt:follows', null); return o && typeof o === 'object' && !Array.isArray(o) ? o : {}; };
  const folList = () => Object.values(folAll()).filter(x => x && x.f && x.n).sort((x, y) => (y.t || 0) - (x.t || 0));
  const isFollowing = name => { const x = folAll()[folKey(name)]; return !!(x && x.f); };
  const catReady = () => !!(CAT.books && CAT.books.length);
  const authorTop = name => (authorIndex().get(folKey(name)) || []).reduce((m, b) => Math.max(m, parseInt(b.id, 10) || 0), 0);
  function followSet(name, on) {
    const all = folAll();
    all[folKey(name)] = on ? { n: name, t: Date.now(), m: catReady() ? authorTop(name) : -1, f: 1 } : { n: name, t: Date.now(), f: 0 };
    store.set('wt:follows', all);
    try { loadPicks(); } catch (e) { /* Home row refreshes on the next visit */ }
  }
  /* the author's books are now "seen": move m up to the newest book (and fill it in if it was waiting for the catalogue) */
  function folSeen(name) {
    const all = folAll(), x = all[folKey(name)];
    if (!x || !x.f || !catReady()) return;
    const top = authorTop(name), cur = typeof x.m === 'number' ? x.m : -1;
    if (cur >= 0 && top <= cur) return;
    x.m = Math.max(top, cur); x.t = Date.now(); store.set('wt:follows', all);
  }
  /* books by a followed author that are newer than the last time the author was seen (empty while the catalogue loads) */
  const folNew = x => (x && x.f && typeof x.m === 'number' && x.m >= 0 && catReady()) ? authorBooks(x.n).filter(b => (parseInt(b.id, 10) || 0) > x.m) : [];
  const autIni = name => { const w = String(name || '').split(/\s+/).filter(Boolean); return ((w[0] ? w[0][0] : '?') + (w.length > 1 ? w[w.length - 1][0] : '')).toUpperCase(); };
  /* "Authors you follow" chip in Home > Picked for you: books you have not heard by followed authors that are newer
     than the last time you saw the author ("New" tag); if there are none, their most recent books you have not heard.
     Nothing is shown when you follow nobody. */
  async function folSource() {
    if (!folList().length) return null;
    await catLoad();
    try { await VER.load(); } catch (e) { /* use what loaded */ }
    if (!catReady()) return null;
    const heard = new Set(listenedList().map(r => String(r.id))), idOf = b => parseInt(b.id, 10) || 0;
    const fresh = new Map(), recent = new Map(), all = folAll();
    folList().forEach(x => {
      const e = all[folKey(x.n)], mark = e && typeof e.m === 'number' ? e.m : -1;
      authorBooks(x.n).forEach(b => { if (heard.has(String(b.id))) return; (mark >= 0 && idOf(b) > mark ? fresh : recent).set(String(b.id), b); });
    });
    const top = m => [...m.values()].sort((a, b) => idOf(b) - idOf(a)).slice(0, 12);
    if (fresh.size) { const bs = top(fresh); return { key: 'fol', label: 'Authors you follow', line: 'New from authors you follow', books: bs.map(nxPub), fresh: new Set(bs.map(b => String(b.id))), first: true }; }
    return recent.size ? { key: 'fol', label: 'Authors you follow', line: 'Recent books from authors you follow', books: top(recent).map(nxPub) } : null;
  }
  /* Account tab: the list of followed authors with a "N new" badge and an unfollow button */
  function renderFollowing() {
    const host = $('#acct-fol'); if (!host) return;
    let waited = false;
    const paint = () => {
      host.textContent = '';
      const list = folList();
      if (!list.length) { host.hidden = true; return; }
      if (catReady()) Object.values(folAll()).forEach(x => { if (x && x.f && !(x.m >= 0)) folSeen(x.n); });
      host.append(h('div', { class: 'home-section-head rtl-head' }, h('h2', {}, 'Authors you follow'), h('span', {}, plural(list.length, 'author'))),
        h('ul', { class: 'rtl-list' }, list.map(x => {
          const nw = folNew(folAll()[folKey(x.n)]).length, n = catReady() ? authorBooks(x.n).length : 0;
          return h('li', { class: 'rtl-card' },
            h('button', { class: 'rtl-main', type: 'button', 'aria-label': 'Open author ' + x.n, onclick: () => openAuthor({ name: x.n }) },
              h('span', { class: 'fol-av', 'aria-hidden': 'true' }, autIni(x.n)),
              h('span', { class: 'rtl-body' }, h('b', {}, x.n), n ? h('span', { class: 'rtl-c' }, plural(n, 'book')) : null)),
            nw ? h('span', { class: 'fol-new' }, nw + ' new') : null,
            h('button', { class: 'fol-un', type: 'button', 'aria-label': 'Unfollow ' + x.n, onclick: () => { followSet(x.n, false); paint(); toast('Unfollowed ' + x.n); } }, 'Following'));
        })));
      host.hidden = false;
      if (!catReady() && !waited) { waited = true; catLoad().then(paint).catch(() => { /* the list stays without counts */ }); }
    };
    paint();
  }
  /* ---------- Wikipedia: author bio and book background ----------
     The short summary of the article is fetched when an author page or book page opens (Wikipedia's free summary
     service, no key) and kept on this device for 30 days, including "no article found". An article is shown only
     when it passes a check (a writer for an author; a book that names the author for a book), so a person or
     film with the same name is never shown by mistake. Offline or any error: the section simply stays hidden. */
  const WP = {
    jobs: /writer|author|novelist|poet|playwright|dramatist|essayist|philosopher|historian|journalist|critic|translator|scholar|theologian|satirist|memoirist|diarist|biographer|lyricist|naturalist|scientist|economist|educator|statesman|orator|clergy|priest|mathematician|explorer|physician|lawyer|politician|activist|abolitionist|humorist|columnist|screenwriter|storyteller|folklorist/i,
    work: /novel|novella|book|play|poem|poetry|collection|stor(y|ies)|treatise|essay|memoir|autobiograph|romance|fable|tale|drama|comedy|tragedy|epic|sermon|letters|diary|narrative|trilogy|series/i
  };
  async function wpSummary(title) {
    const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 8000);
    try {
      const r = await fetch('https://en.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(title.replace(/ /g, '_')) + '?redirect=true', { signal: ctl.signal });
      if (r.status === 404) return { none: true };
      if (!r.ok) return null;
      const j = await r.json();
      return { none: false, type: j.type || '', desc: j.description || '', x: String(j.extract || '').replace(/\s+/g, ' ').trim(), t: j.title || '', u: (j.content_urls && j.content_urls.desktop && j.content_urls.desktop.page) || '' };
    } catch (e) { return null; } finally { clearTimeout(to); }
  }
  const wpTrim = x => { if (x.length <= 900) return x; const cut = x.slice(0, 900), i = cut.lastIndexOf('. '); return i > 300 ? cut.slice(0, i + 1) : cut.replace(/\s+\S*$/, '') + '\u2026'; };
  const wpLast = name => { const w = String(name || '').replace(/\b(jr|sr)\b\.?/ig, '').split(/\s+/).filter(Boolean); return (w[w.length - 1] || '').toLowerCase(); };
  async function wpFind(kind, name, cands, ok) {
    const key = 'wt:wp:' + kind + ':' + String(name).toLowerCase(), c = store.get(key, null);
    if (c && c.t && Date.now() - c.t < 30 * 864e5) return c.x ? c : null;
    for (const t of cands) {
      const s = await wpSummary(t);
      if (!s) return null;                       // offline or a server error: show nothing now and try again next time
      if (s.none || s.type !== 'standard' || !s.x || !s.u) continue;
      if (ok(s)) { const rec = { t: Date.now(), x: wpTrim(s.x), u: s.u }; store.set(key, rec); return rec; }
    }
    store.set(key, { t: Date.now(), x: '' });    // nothing suitable: do not ask again for 30 days
    return null;
  }
  function wpAuthor(name) {
    name = String(name || '').trim();
    if (!name || /^(unknown|anonymous|various)/i.test(name)) return Promise.resolve(null);
    const last = wpLast(name);
    return wpFind('a', name, [name, name + ' (writer)', name + ' (author)', name + ' (poet)'], s => WP.jobs.test(s.desc + ' ' + s.x.slice(0, 250)) && (!last || last.length < 3 || (s.x + ' ' + s.t).toLowerCase().indexOf(last) >= 0));
  }
  function wpBook(b) {
    const title = String(b.title || '').replace(/\s*\([^)]*\)\s*/g, ' ').split(/;|:| - |, or /i)[0].trim(), first = String(b.authors || '').split(',')[0].trim();
    if (!title || !first || /^(unknown|anonymous|various)/i.test(first)) return Promise.resolve(null);
    const last = wpLast(first);
    return wpFind('b', title + '|' + last, [title, title + ' (novel)', title + ' (book)', title + ' (novella)', title + ' (play)'], s => WP.work.test(s.desc + ' ' + s.x.slice(0, 300)) && last.length >= 3 && s.x.toLowerCase().indexOf(last) >= 0);
  }
  /* fills a hidden section with the heading, the text (3 lines, "Read more") and the credit Wikipedia's licence asks for */
  function wpShow(sec, title, rec) {
    if (!sec || !rec) return;
    const p = h('p', { class: 'det-desc clamp wp' }, rec.x);
    const more = h('button', { class: 'sec-more', type: 'button', 'aria-expanded': 'false', onclick: () => { const open = !p.classList.toggle('clamp'); more.textContent = open ? 'Show less' : 'Read more'; more.setAttribute('aria-expanded', String(open)); } }, 'Read more');
    sec.textContent = '';
    sec.append(h('div', { class: 'home-section-head' }, h('h2', {}, title)), p, rec.x.length > 160 ? more : null,
      h('p', { class: 'wp-src' }, 'From ', h('a', { href: rec.u, target: '_blank', rel: 'noopener noreferrer' }, 'Wikipedia'), ' \u00b7 CC BY-SA'));
    sec.hidden = false;
  }
  /* Similar books, other recordings of this book and more by the same author. Heard books are kept in. */
  function detailData(b) {
    const byId = new Map((CAT.books || []).map(x => [x.id, x])), sb = byId.get(String(b.id));
    if (!sb) return null;
    const gOf = id => { const v = VER.ready && VER.map.get(String(id)); return v ? v.g : null; };
    const mine = gOf(sb.id), okL = x => P.otherLangs ? x.lang === sb.lang : (!x.lang || /^english$/i.test(x.lang));
    const seenG = new Set(), ok = x => { const g = gOf(x.id); if (g != null && (g === mine || seenG.has(g))) return false; if (g != null) seenG.add(g); return true; };
    const author = sb._a ? CAT.books.filter(x => x.id !== sb.id && okL(x) && x._a === sb._a && x.total > 0)
      .sort((x, y) => (y.ia ? 1 : 0) - (x.ia ? 1 : 0) || (+x.id) - (+y.id)).filter(ok).slice(0, 10).map(nxPub) : [];
    const skip = new Set([sb.id]); author.forEach(x => skip.add(x.id));
    const similar = recoFor(sb, skip, 24).map(nxPub).filter(ok).slice(0, 12);
    const v = VER.ready && VER.map.get(sb.id);
    const others = v && v.n > 1 ? VER.groups[v.g].i.map(String).filter(id => id !== sb.id).map(id => byId.get(id)).filter(Boolean).slice(0, 5).map(nxPub) : [];
    return { author, similar, others };
  }
  function authorLine(b) {
    const names = String(b.authors || '').split(',').map(x => x.trim()).filter(Boolean);
    if (!names.length) return null;
    if (names.length === 1 && /^unknown/i.test(names[0])) return h('p', { class: 'det-by' }, names[0]);
    const kids = [];
    names.forEach((n, i) => { if (i) kids.push(', '); kids.push(h('button', { class: 'det-author', type: 'button', onclick: () => openAuthor({ name: n }) }, n)); });
    return h('p', { class: 'det-by' }, ...kids);
  }
  /* ---------- Book stats on the details page ----------
     Two sources, both optional, both quiet when they have nothing to say:
       1. stats.json, rebuilt daily by build_stats.py: Internet Archive plays for each recording. No server needed.
       2. Wordtrail's own anonymous counts from a small Cloudflare Worker (STATS_API). Shown only once a book has
          STATS_MIN listeners, so a new book never says "2 listeners".
     Calm mode hides the row (see CSS), so nothing here turns listening into a score. */
  const STATS_API = 'https://wordtrail-stats.test-rabiulclaud-1.workers.dev';            // your Worker, e.g. 'https://wordtrail-stats.YOURNAME.workers.dev'. Empty = own counts off.
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
      about.append(h('div', { class: 'home-section-head' }, h('h2', {}, 'About this book')), p, info.d.length > 260 ? more : null);
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
    d.append(
      h('div', { class: 'det-top' },
        h('button', { class: 'ib', type: 'button', 'aria-label': 'Back', onclick: closeDetail }, svgIcon('#i-back')),
        h('span', {}, 'Book details'),
        h('div', { class: 'det-tools' }, h('button', { class: 'ib', type: 'button', 'aria-label': 'Share this book', onclick: () => shareBook(b) }, svgIcon('#i-share')))),
      h('section', { class: 'det-hero', style: '--h:' + colHue(0, (parseInt(b.id, 10) || 0) + 3) },
        heartNode(b, 'on-detail'),
        coverBox(b, 'tile-cover det-cover'),
        h('h1', {}, b.title),
        authorLine(b),
        meta ? h('p', { class: 'det-meta' }, meta) : null,
        h('div', { class: 'det-chips' }, lvl, sync, yr),
        genres,
        stats,
        prog,
        h('div', { class: 'det-actions' },
          h('button', { class: 'det-btn', type: 'button', onclick: () => openBook(b, { play: true }) }, svgIcon('#i-play'), listenLabel))),
      ratingsSection(b), about, bgrd, more);
  }
  /* ---------- Author page: years, and every book by this author, one entry per book ---------- */
  const AUTH = { map: null, n: 0 };
  function authorIndex() {
    if (AUTH.map && AUTH.n === (CAT.books || []).length) return AUTH.map;
    const m = new Map();
    (CAT.books || []).forEach(b => String(b.authors || '').split(',').map(x => x.trim()).filter(x => x && !/^unknown/i.test(x)).forEach(n => { const k = n.toLowerCase(); if (!m.has(k)) m.set(k, []); m.get(k).push(b); }));
    AUTH.map = m; AUTH.n = (CAT.books || []).length;
    return m;
  }
  function authorBooks(name) {
    const okLang = b => P.otherLangs || !b.lang || /^english$/i.test(b.lang);
    const kOf = b => { const v = VER.ready && VER.map.get(String(b.id)); return v ? v.k : 0; };
    const seen = new Set(), out = [];
    (authorIndex().get(String(name).toLowerCase()) || []).filter(b => b.total > 0 && okLang(b)).sort((x, y) => kOf(x) - kOf(y)).forEach(b => {
      const v = VER.ready && VER.map.get(String(b.id));
      if (v) { if (seen.has(v.g)) return; seen.add(v.g); }
      out.push(b);
    });
    return out;
  }
  async function authorYears(a, books) {
    for (const b of books.slice(0, 2)) {
      try { const info = await bookInfo(b), m = info && info.a && info.a.find(x => x.n.toLowerCase() === a.name.toLowerCase()); return m && (m.y1 || m.y2) ? m : null; } catch (e) { /* try the next book */ }
    }
    return null;
  }
  function drawAuthor(a) {
    const d = $('#detail'); d.textContent = '';
    const words = a.name.split(/\s+/).filter(Boolean), ini = (words[0] ? words[0][0] : '?') + (words.length > 1 ? words[words.length - 1][0] : '');
    const years = h('p', { class: 'det-meta', hidden: true }), stats = h('p', { class: 'det-meta' }), body = h('div', { class: 'det-more' });
    const bio = h('section', { class: 'det-about wp-sec', hidden: true });
    const fol = h('button', { class: 'fol-btn', type: 'button' });
    const paintFol = () => { const on = isFollowing(a.name); fol.className = 'fol-btn' + (on ? ' on' : ''); fol.textContent = on ? '\u2713 Following' : '+ Follow'; };
    fol.addEventListener('click', async () => {
      const on = !isFollowing(a.name);
      if (on && !catReady()) { try { await catLoad(); } catch (e) { /* followed anyway; the new-book mark is set when the catalogue loads */ } }
      followSet(a.name, on); paintFol();
      toast(on ? 'Following ' + a.name + '. Their new books will appear in Picked for you.' : 'Unfollowed ' + a.name);
    });
    paintFol();
    const iniEl = h('div', { class: 'aut-ini', 'aria-hidden': 'true' }, ini.toUpperCase());
    d.append(
      h('div', { class: 'det-top' }, h('button', { class: 'ib', type: 'button', 'aria-label': 'Back', onclick: closeDetail }, svgIcon('#i-back')), h('span', {}, 'Author')),
      h('section', { class: 'det-hero', style: '--h:' + Math.floor(moodHash(a.name) * 360) },
        iniEl,
        h('h1', {}, a.name), years, stats, fol),
      bio, body);
    wpAuthor(a.name).then(rec => { if (DET.author === a) wpShow(bio, 'About the author', rec); }).catch(() => { /* no bio section */ });
    (async () => {
      try { await Promise.all([catLoad(), VER.load().catch(() => {})]); } catch (e) { /* use what loaded */ }
      if (DET.author !== a) return;
      folSeen(a.name);
      const books = authorBooks(a.name);
      if (!books.length) { stats.hidden = true; body.append(stateNode('empty', 'No books found', 'There are no recordings by ' + a.name + ' in the library yet.')); return; }
      const pics = books.filter(b => b.ia).concat(books.filter(b => !b.ia)).slice(0, 3).map(nxPub);
      const fan = colFan({ books: pics }); fan.classList.add('aut-fan', 'n' + pics.length); iniEl.replaceWith(fan);
      const tot = books.reduce((x, b) => x + (b.total || 0), 0);
      stats.textContent = books.length + (books.length === 1 ? ' book' : ' books') + (tot ? ' \u00b7 ' + Math.max(1, Math.round(tot / 3600)) + ' h of audio' : '');
      authorYears(a, books).then(m => { if (DET.author !== a || !m) return; years.textContent = m.y1 && m.y2 ? m.y1 + '\u2013' + m.y2 : m.y1 ? 'Born ' + m.y1 : 'Died ' + m.y2; years.hidden = false; });
      const heard = new Set(listenedList().map(r => String(r.id)));
      const start = books.length >= 3 ? books.filter(b => !heard.has(String(b.id))).sort((x, y) => x.total - y.total)[0] : null;
      if (start) body.append(h('section', { class: 'home-section' }, h('div', { class: 'home-section-head' }, h('div', {}, h('h2', {}, 'Start here'), h('p', { class: 'mood-sub' }, 'The shortest one you have not heard'))), bookCard(nxPub(start), () => openDetail(nxPub(start)))));
      let mode = 'best', shown = 30;
      const list = h('div', { class: 'list' }), more = h('button', { class: 'genre-more', type: 'button', hidden: true }, 'Show more'), chips = h('div', { class: 'pk-chips', role: 'group', 'aria-label': 'Sort books' });
      const sorted = () => books.slice().sort(mode === 'az' ? (x, y) => x.title.localeCompare(y.title) : mode === 'short' ? (x, y) => x.total - y.total : mode === 'rated' && !rtCalm() ? rtCmp : (x, y) => (y.ia ? 1 : 0) - (x.ia ? 1 : 0) || (+x.id) - (+y.id));
      const draw = () => {
        const all = sorted();
        list.textContent = ''; all.slice(0, shown).forEach(b => list.append(bookCard(nxPub(b), () => openDetail(nxPub(b)))));
        more.hidden = all.length <= shown;
        $$('button', chips).forEach(c => c.setAttribute('aria-pressed', String(c.dataset.k === mode)));
      };
      [['best', 'Best match'], ['az', 'A\u2013Z'], ['short', 'Shortest'], ['rated', 'Top rated']].forEach(([k, t]) => { const c = h('button', { class: 'fchip' + (k === 'rated' ? ' rt-only' : ''), type: 'button', 'aria-pressed': 'false', onclick: () => { mode = k; shown = 30; draw(); if (k === 'rated') rtSumLoad().then(draw); } }, t); c.dataset.k = k; chips.append(c); });
      more.addEventListener('click', () => { shown += 30; draw(); });
      body.append(h('section', { class: 'home-section' }, h('div', { class: 'home-section-head' }, h('div', {}, h('h2', {}, 'All books'))), chips, list, more));
      draw();
    })();
  }
  guideDoc('home', 'Pick up where you left off', "Unfinished books appear at the top of Home, most recent first. Tap one to resume. How many show is set in Settings > Reading.");
  /* Large "pick up where you left off" card for the most recent book */
  function resumeHero(r) {
    const pct = Math.max(0, Math.min(100, Math.round((r.pct || 0) * 100)));
    const left = pct >= 100 ? 'Finished' : pct < 1 ? 'Just started' : pct + '% listened';
    return h('div', { class: 'resume' },
      h('div', { class: 'resume-cover', 'aria-hidden': 'true' }, coverNode({ id: r.id, title: r.title, authors: r.authors, cover: r.cover, ia: r.ia })),
      h('div', { class: 'resume-body' },
        h('div', { class: 'resume-k' }, pct >= 100 ? 'Finished' : 'Continue listening'),
        h('div', { class: 'resume-t' }, r.title),
        h('div', { class: 'resume-a' }, r.authors || '')),
      h('div', { class: 'resume-bar', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(pct), 'aria-label': 'Listening progress' }, h('i', { style: 'width:' + pct + '%' })),
      h('div', { class: 'resume-row' },
          h('span', { class: 'resume-pct' }, left),
          h('button', { class: 'resume-btn', type: 'button', 'aria-label': (pct >= 100 ? 'Listen again: ' : 'Resume: ') + r.title, onclick: () => resumeRecent(r) },
            (() => { const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('aria-hidden', 'true'); const pth = document.createElementNS('http://www.w3.org/2000/svg', 'path'); pth.setAttribute('d', 'M8 5v14l11-7z'); s.append(pth); return s; })(),
            pct >= 100 ? 'Listen again' : 'Resume')));
  }
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


  guideDoc('player', 'Choose a reader', "More > Reader lists the other recordings of the same book. Hear a 20-second sample from where you are, then switch and carry on at the same place.", '2026-10-03');
  /* ---------- in-player version picker ----------
     versions.json groups duplicate recordings of one book: g.i = ids (best first), g.w = why the first one won,
     g.s = a score per recording. The sheet lists the siblings, explains the ranking, and switches in place:
     the listening position and the text source carry over so the book resumes where it was. */
  const verOf = b => (VER.ready && b ? VER.map.get(String(b.id)) : null);
  /* short narrator label for the chip: "Mark N.", "Group", or '' when unknown */
  function verWho(b) {
    if (!b) return '';
    const rs = Array.from(new Set((b.secs || []).map(t => t.reader).filter(Boolean)));
    if (rs.length > 1) return 'Group';
    const n = String(rs[0] || b.reader || store.get('wt:rdr:' + b.id, '') || '').trim();
    const p = n.split(/\s+/);
    const out = p.length > 1 ? p.slice(0, -1).join(' ') + ' ' + p[p.length - 1][0].toUpperCase() + '.' : n;
    return out.length > 16 ? out.slice(0, 15) + '\u2026' : out;
  }
  VER.dotSeen = new Set();
  function verChip() {
    const c = $('#b-ver'); if (!c) return;
    const more = $('#b-more'), v = verOf(S.book);
    c.hidden = !(v && v.n > 1);
    if (c.hidden) { if (more) { more.classList.remove('has-dot'); more.setAttribute('aria-label', 'More: next up, words'); } return; }
    verWarm();
    const who = verWho(S.book), better = v.k > 0;
    const parts = [who || 'This recording', (v.k + 1) + ' of ' + v.n, v.sc != null ? Math.round(v.sc) + '% match' : ''].filter(Boolean);
    const d = $('#b-ver-d'), bd = $('#b-ver-b');
    if (d) d.textContent = parts.join(' \u00b7 ');
    if (bd) bd.hidden = !better;
    c.setAttribute('aria-label', 'Choose a different reader. Now: ' + (who || 'reader') + ', ' + (v.k + 1) + ' of ' + v.n + (better ? '. A better match is available.' : ''));
    if (more) {
      const dot = better && !VER.dotSeen.has(String(S.book.id));
      more.classList.toggle('has-dot', dot);
      more.setAttribute('aria-label', 'More: reader' + (dot ? ' (a better match is available)' : '') + ', next up, words');
    }
  }
  /* narrator, length and reader count of a recording; fetched once per id, and kept like any opened book */
  VER.pend = new Map(); VER.warm = new Set(); VER.pre = new Map();
  function verInfo(id) {
    id = String(id);
    if (VER.info.has(id)) return Promise.resolve(VER.info.get(id));
    if (VER.pend.has(id)) return VER.pend.get(id);
    const p = verInfoGet(id).finally(() => VER.pend.delete(id));
    VER.pend.set(id, p);
    return p;
  }
  async function verInfoGet(id) {
    const mk = b => {
      const rs = Array.from(new Set((b.secs || []).map(t => t.reader).filter(Boolean)));
      return { id, title: b.title, reader: rs[0] || b.reader || store.get('wt:rdr:' + id, '') || '', readers: rs.length, total: b.total || 0, n: b.n || (b.secs || []).length, secs: (b.secs || []).map(t => t.dur), urls: (b.secs || []).map(t => t.url || '') };
    };
    let info = null;
    if (S.book && S.book.id === id) info = mk(S.book);
    if (!info) { const c = await idb.get('b:' + id); if (c && c.secs && c.secs.length) info = mk(c); }
    if (!info) {
      try {
        const [f] = await lvGet({ id, extended: 1 }, { nonEmpty: true, tries: 1 });
        if (f && f.secs && f.secs.length) { idb.set('b:' + id, f); if (f.secs[0] && f.secs[0].reader) store.set('wt:rdr:' + id, f.secs[0].reader); info = mk(f); }
      } catch (e) { /* shown without narrator details */ }
    }
    if (info) VER.info.set(id, info);
    return info;
  }
  /* Quietly fetch the other recordings' details a few seconds after a book with several readers opens,
     one at a time, so the picker already has names and lengths when it is opened. */
  function verWarm() {
    const v = verOf(S.book); if (!v || v.n < 2 || VER.warm.has(v.g)) return;
    VER.warm.add(v.g);
    const ids = VER.groups[v.g].i.map(String);
    setTimeout(async () => { for (const id of ids) { if (navigator.onLine === false) break; try { await verInfo(id); } catch (e) { /* next */ } } }, 4000);
  }
  const verReasons = w => String(w || '').split(/\s*[;|]\s*|\s+\u00b7\s+/).map(x => x.trim()).filter(Boolean);
  /* ---- 20-second sample: the same place in the book, read by another reader ----
     The other readers' files are prepared as soon as the sheet shows them (headers only, and the seek),
     so tapping play starts quickly instead of connecting, finding the spot and buffering from scratch. */
  function verStop(resume) {
    const p = VER.pv; if (!p) return; VER.pv = null;
    clearTimeout(p.timer);
    try { p.a.pause(); p.a.removeAttribute('src'); p.a.load(); } catch (e) { /* already gone */ }
    if (p.btn) { p.btn.classList.remove('on'); p.btn.textContent = '\u25b6'; p.btn.setAttribute('aria-label', 'Hear a 20-second sample'); }
    if (resume && p.resume && audio.paused) audio.play().catch(() => {});
  }
  function verPrepClear() {
    VER.pre.forEach(x => { try { x.a.pause(); x.a.removeAttribute('src'); x.a.load(); } catch (e) { /* gone */ } });
    VER.pre.clear();
  }
  /* the file and second in a recording that match where you are in the book now */
  function verSpot(info) {
    if (!info || !S.book) return null;
    const durs = S.durs, tot = durs.reduce((a, x) => a + x, 0) || 1, pre = durs.slice(0, S.sec).reduce((a, x) => a + x, 0);
    const within = S.pendingSeek || audio.currentTime || 0;
    let sec, time;
    if (info.n === S.secs.length) { sec = S.sec; time = (info.secs[sec] || 0) * (durs[S.sec] ? within / durs[S.sec] : 0); }
    else { let at = (pre + within) / tot * (info.total || 0); sec = 0; while (sec < info.secs.length - 1 && at >= info.secs[sec]) { at -= info.secs[sec]; sec++; } time = at; }
    time = Math.max(0, Math.min(time, (info.secs[sec] || time + 20) - 20));
    return (info.urls || [])[sec] ? { url: info.urls[sec], time } : null;
  }
  function verPrep(id, info) {
    if (VER.pre.has(id) || !S.book || (navigator.connection && navigator.connection.saveData)) return;
    const sp = verSpot(info); if (!sp) return;
    const a = new Audio(); a.preload = 'metadata'; a.src = sp.url;
    if (sp.time > 0) a.addEventListener('loadedmetadata', () => { try { a.currentTime = sp.time; } catch (e) { /* plays from the start */ } }, { once: true });
    VER.pre.set(id, { a, sp });
  }
  async function verSample(id, btn) {
    if (VER.pv && VER.pv.id === id) { verStop(true); return; }
    verStop(true);
    let a, sp; const ready = VER.pre.get(id);
    if (ready) { a = ready.a; sp = ready.sp; VER.pre.delete(id); }
    else {
      btn.disabled = true;
      const info = await verInfo(id);
      btn.disabled = false;
      sp = verSpot(info);
      if (!sp) { toast('No sample available for this reader', 2500); return; }
      a = new Audio(); a.src = sp.url;
      if (sp.time > 0) a.addEventListener('loadedmetadata', () => { try { a.currentTime = sp.time; } catch (e) { /* plays from the start */ } }, { once: true });
    }
    const resume = !audio.paused;
    if (resume) audio.pause();
    a.preload = 'auto';
    const pv = VER.pv = { a, id, btn, resume, timer: 0 };
    btn.classList.add('on'); btn.textContent = '\u2026'; btn.setAttribute('aria-label', 'Loading sample');
    const live = () => VER.pv === pv;
    a.addEventListener('playing', () => { if (!live()) return; clearTimeout(pv.timer); btn.textContent = '\u25a0'; btn.setAttribute('aria-label', 'Stop sample'); });
    a.addEventListener('timeupdate', () => { if (live() && a.currentTime >= sp.time + 20) verStop(true); });
    a.addEventListener('ended', () => { if (live()) verStop(true); });
    a.addEventListener('error', () => { if (live()) { verStop(true); toast('Could not load the sample', 2500); } });
    pv.timer = setTimeout(() => { if (live()) { verStop(true); toast('The sample is slow to load. Try again in a moment.', 3000); } }, 12000);
    a.play().catch(() => { if (live()) { verStop(true); toast('Could not play the sample', 2500); } });
  }
  (() => { const sh = $('#sheet-versions'); if (sh) new MutationObserver(() => { if (sh.hidden) { verStop(true); verPrepClear(); } }).observe(sh, { attributes: true, attributeFilter: ['hidden'] }); })();

  function renderVersions() {
    verStop(true); verPrepClear();
    const body = $('#ver-body'); body.textContent = '';
    const foot = $('#ver-foot'), go = $('#ver-go'), fp = $('#ver-foot-p'); foot.hidden = true;
    const cur = verOf(S.book);
    if (!cur) { body.append(h('p', { class: 'help' }, 'There is only one recording of this book.')); return; }
    const g = VER.groups[cur.g], ids = g.i.map(String), curId = String(S.book.id);
    const score = k => g.s && typeof g.s[k] === 'number' ? g.s[k] : null;
    // one status per recording: best match, else whether the text can follow the audio
    const status = k => {
      const sc = score(k);
      if (sc == null) return k === 0 ? ['best', '\u2605 Best match'] : null;
      const pc = Math.round(sc) + '%';
      return sc >= 40 ? [k === 0 ? 'best' : 'ok', (k === 0 ? '\u2605 ' : '') + pc + ' match'] : [k === 0 ? 'best' : '', pc + ' \u00b7 audio only'];
    };
    // where you would land: the same share of the book
    const dN = S.durs.reduce((a, x) => a + x, 0) || 1, frac = (S.durs.slice(0, S.sec).reduce((a, x) => a + x, 0) + (S.pendingSeek || audio.currentTime || 0)) / dN;
    const resumeTxt = frac < 0.005 ? 'Starts from the beginning.' : 'Picks up where you are, about ' + Math.round(frac * 100) + '% in.';
    const rows = new Map();
    let pick = null;
    const nm = id => { const r = rows.get(id); return r && !r.nameEl.classList.contains('vp-sk') ? r.nameEl.textContent : 'this reader'; };
    const paintFoot = () => {
      foot.hidden = !pick;
      rows.forEach((r, id) => { r.row.classList.toggle('sel', id === pick); if (r.pickEl.tagName === 'BUTTON') r.pickEl.setAttribute('aria-pressed', id === pick ? 'true' : 'false'); });
      if (pick) { go.textContent = 'Switch to ' + nm(pick); fp.textContent = resumeTxt; }
    };
    go.onclick = () => { if (pick) verSwitch(pick); };
    const mkRow = (id, k) => {
      const isNow = id === curId, st = status(k);
      const nameEl = h('div', { class: 'vp-name vp-sk' }, '\u00a0'), metaEl = h('div', { class: 'vp-meta vp-sk' }, '\u00a0');
      const deltaEl = h('div', { class: 'vp-delta', hidden: true });
      const kids = [h('span', { class: 'vp-main' }, nameEl, metaEl, deltaEl), st ? h('span', { class: 'vp-st ' + st[0] }, st[1]) : h('span')];
      const pickEl = isNow
        ? h('div', { class: 'vp-pick' }, kids)
        : h('button', { class: 'vp-pick', type: 'button', 'aria-pressed': 'false', onclick: () => { pick = pick === id ? null : id; paintFoot(); } }, kids);
      const play = isNow ? null : h('button', { class: 'vp-play', type: 'button', 'aria-label': 'Hear a 20-second sample', onclick: e => { e.stopPropagation(); verSample(id, e.currentTarget); } }, '\u25b6');
      const row = h('div', { class: 'vp-item' + (isNow ? ' now' : '') }, pickEl, play);
      rows.set(id, { nameEl, metaEl, deltaEl, k, row, pickEl, play });
      return row;
    };
    // the one-line recommendation sits right under the best recording; "Why?" opens the details
    const recName = h('strong', {}, '\u2026');
    const reasons = verReasons(g.w);
    const scoreEls = new Map();
    const panel = h('div', { class: 'vp-panel', hidden: true },
      reasons.length > 1 ? h('div', { class: 'vp-reasons' }, reasons.map(r => h('span', {}, r))) : h('p', { class: 'help' }, reasons[0] || 'It ranked highest of the ' + ids.length + ' recordings for audio quality and read-along support.'),
      score(0) != null ? h('div', { class: 'vp-panel' }, ids.map((id, k) => { const lab = h('span', {}, 'Recording ' + (k + 1)); scoreEls.set(id, lab); return h('div', { class: 'vp-sc' }, lab, h('span', {}, score(k) != null ? Math.round(score(k)) + ' / 100' : '')); })) : null,
      score(0) != null ? h('p', { class: 'help' }, 'Match is the library\u2019s ranking score out of 100, which includes how well the text lines up with the audio. From 40 up, the text can follow along.') : null);
    const whyBtn = h('button', { class: 'vp-why-btn', type: 'button', 'aria-expanded': 'false', onclick: () => { const open = panel.hidden; panel.hidden = !open; whyBtn.setAttribute('aria-expanded', open ? 'true' : 'false'); whyBtn.textContent = open ? 'Hide' : 'Why?'; } }, 'Why?');
    const rec = h('div', { class: 'vp-rec' },
      h('div', { class: 'vp-rec-row' }, ids[0] === curId ? h('p', {}, '\u2605 You are listening to the best match.') : h('p', {}, '\u2605 Best match: ', recName, '.'), whyBtn),
      panel);

    const nowSec = h('section', { class: 'vp-sec' }, h('h3', {}, 'Now playing'), mkRow(curId, ids.indexOf(curId)));
    if (ids[0] === curId) nowSec.append(rec);
    body.append(nowSec);
    const others = ids.map((id, k) => [id, k]).filter(x => x[0] !== curId);
    if (others.length) {
      const list = h('div', { class: 'vp-list' });
      others.forEach(([id, k]) => { list.append(mkRow(id, k)); if (k === 0) list.append(rec); });
      body.append(h('section', { class: 'vp-sec' }, h('h3', {}, 'Other readers'), h('p', { class: 'help' }, 'Tap a reader to choose them, or \u25b6 to hear 20 seconds from where you are. Differences are measured against the one playing now.'), list));
    }

    const nameOf = (info, k) => info ? (info.readers > 1 ? 'Group reading' : (info.reader || 'Recording ' + (k + 1))) : 'Recording ' + (k + 1);
    const setName = (id, k, txt) => { const r = rows.get(id); if (r) { r.nameEl.classList.remove('vp-sk'); r.nameEl.textContent = txt; } const e = scoreEls.get(id); if (e) e.textContent = txt; if (k === 0) recName.textContent = txt; };
    const paint = (id, info) => {
      const r = rows.get(id); if (!r) return;
      const k = r.k;
      if (!info) {
        if (r.nameEl.classList.contains('vp-sk')) setName(id, k, 'Recording ' + (k + 1));
        if (r.metaEl.classList.contains('vp-sk')) { r.metaEl.classList.remove('vp-sk'); r.metaEl.textContent = 'Details unavailable'; }
        if (r.play) r.play.hidden = true;
        return;
      }
      setName(id, k, nameOf(info, k));
      r.metaEl.classList.remove('vp-sk');
      r.metaEl.textContent = [info.readers > 1 ? info.readers + ' readers' : (info.reader ? 'Solo reader' : ''), info.total ? fmtLong(info.total) : ''].filter(Boolean).join(' \u00b7 ') || '\u00a0';
      if (r.play) r.play.hidden = !(info.urls || []).some(Boolean);
      if (id !== curId && !$('#sheet-versions').hidden) verPrep(id, info);
      const now = VER.info.get(curId);
      if (id !== curId && now) {
        const d = [], diff = info.total && now.total ? info.total - now.total : 0;
        if (Math.abs(diff) > 300) d.push((diff > 0 ? '+' : '\u2212') + fmtLong(Math.abs(diff)));
        if (now.readers <= 1 && info.readers > 1) d.push('group reading');
        else if (now.readers > 1 && info.readers <= 1) d.push('solo reader');
        if (d.length) { r.deltaEl.textContent = d.join(' \u00b7 '); r.deltaEl.hidden = false; }
      }
      if (pick) paintFoot();
    };
    // 1) show at once whatever is already on this device: saved narrator names and the catalog's length
    ids.forEach((id, k) => {
      const r = rows.get(id), cached = store.get('wt:rdr:' + id, ''), cb = typeof CAT !== 'undefined' && CAT.books && CAT.books.find(x => x.id === id);
      if (cached) setName(id, k, cached);
      if (cb && cb.total) { r.metaEl.classList.remove('vp-sk'); r.metaEl.textContent = fmtLong(cb.total); }
    });
    // 2) then fill each row the moment its own details arrive, not when the slowest one does
    ids.forEach(id => verInfo(id).then(info => {
      if ($('#sheet-versions').hidden) return;
      paint(id, info);
      if (id === curId) ids.forEach(o => { const oi = VER.info.get(o); if (o !== curId && oi) paint(o, oi); });
    }));
    // 3) still waiting after a few seconds: stop the shimmer; the real name replaces this when it arrives
    setTimeout(() => { if ($('#sheet-versions').hidden) return; ids.forEach((id, k) => { const r = rows.get(id); if (r && r.nameEl.classList.contains('vp-sk')) setName(id, k, 'Recording ' + (k + 1)); }); }, 5000);
  }
  async function verSwitch(id) {
    id = String(id);
    if (!S.book || id === String(S.book.id)) { closeSheets(); return; }
    verStop(false);
    const from = S.book, t = S.sec, within = S.pendingSeek || audio.currentTime || 0;
    const pre = S.durs.slice(0, t).reduce((a, b) => a + b, 0), total = S.durs.reduce((a, b) => a + b, 0) || 1;
    persist(); // the recording being left keeps its own place, so switching back resumes it
    VER.carry = { id, sec: t, n: S.secs.length, secFrac: S.durs[t] ? within / S.durs[t] : 0, frac: (pre + within) / total, text: S.textSrc, from: String(from.id) };
    closeSheets();
    const info = await verInfo(id);
    const c = await idb.get('b:' + id);
    let book = c && c.secs && c.secs.length ? c : null;
    if (!book) { try { const [f] = await lvGet({ id }, { light: true }); book = f; } catch (e) { /* openBook reports a failed load */ } }
    if (!book) book = Object.assign({ id, title: from.title, authors: from.authors, cover: from.cover, ia: '', secs: [], total: info ? info.total : 0, n: info ? info.n : 0, lang: from.lang });
    const v = verOf(book);
    toast('Switching to ' + (info && info.reader ? info.reader : 'recording ' + ((v ? v.k : 0) + 1)) + '\u2026', 2500);
    await openBook(book);
  }
  /* Called by openBook once the new recording's tracks are known. Maps the old position onto them:
     the same track when both recordings are split alike, else the same share of the whole book. */
  function verApply(saved, b) {
    const c = VER.carry; VER.carry = null;
    if (!c || c.id !== String(b.id)) return saved;
    const durs = b.secs.map(x => x.dur), tot = durs.reduce((a, x) => a + x, 0);
    let sec, time;
    if (b.secs.length === c.n) { sec = c.sec; time = (durs[sec] || 0) * c.secFrac; }
    else {
      let at = c.frac * tot; sec = 0;
      while (sec < durs.length - 1 && at >= durs[sec]) { at -= durs[sec]; sec++; }
      time = Math.max(0, at);
    }
    const out = Object.assign({}, saved, { sec, time: Math.floor(time) });
    if (!out.text && c.text) out.text = c.text; // the same book text works for every recording
    return out;
  }

