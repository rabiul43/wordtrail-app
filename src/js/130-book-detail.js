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
