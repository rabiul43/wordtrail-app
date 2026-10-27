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
    const years = h('p', { class: 'det-meta', hidden: true }), stats = h('p', { class: 'det-meta' }), body = h('div', { class: 'det-more aut-more' });
    const bio = h('section', { class: 'det-about aut-about wp-sec', hidden: true });
    /* desktop banner only (phones hide these, see 98-desktop-layout.css): bio teaser, "Start with" button, blurred cover backdrop */
    const bioHero = h('div', { class: 'aut-bio', hidden: true });
    const startBtn = h('button', { class: 'aut-start-btn', type: 'button', hidden: true });
    const detBack = h('div', { class: 'det-bg', 'aria-hidden': 'true' });
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
      h('section', { class: 'det-hero aut-hero', style: '--h:' + Math.floor(moodHash(a.name) * 360) },
        detBack,
        iniEl,
        h('div', { class: 'aut-info' },
          h('h1', {}, a.name), h('div', { class: 'aut-meta' }, years, stats), bioHero,
          h('div', { class: 'aut-actions' }, startBtn, fol))),
      bio, body);
    wpAuthor(a.name).then(rec => {
      if (DET.author !== a) return;
      wpShow(bio, 'About the author', rec);
      if (!rec) return;
      const p = h('p', { class: 'det-desc clamp wp' }, rec.x);
      const more = h('button', { class: 'sec-more', type: 'button', 'aria-expanded': 'false', onclick: () => { const open = !p.classList.toggle('clamp'); more.textContent = open ? 'Show less' : 'Read more'; more.setAttribute('aria-expanded', String(open)); } }, 'Read more');
      bioHero.textContent = '';
      bioHero.append(p, ...(rec.x.length > 160 ? [more] : []), h('p', { class: 'wp-src' }, 'From ', h('a', { href: rec.u, target: '_blank', rel: 'noopener noreferrer' }, 'Wikipedia'), ' \u00b7 CC BY-SA'));
      bioHero.hidden = false;
    }).catch(() => { /* no bio section */ });
    (async () => {
      try { await Promise.all([catLoad(), VER.load().catch(() => {})]); } catch (e) { /* use what loaded */ }
      if (DET.author !== a) return;
      folSeen(a.name);
      const books = authorBooks(a.name);
      if (!books.length) { stats.hidden = true; body.append(stateNode('empty', 'No books found', 'There are no recordings by ' + a.name + ' in the library yet.')); return; }
      const pics = books.filter(b => b.ia).concat(books.filter(b => !b.ia)).slice(0, 3).map(nxPub);
      const fan = colFan({ books: pics }); fan.classList.add('aut-fan', 'n' + pics.length); iniEl.replaceWith(fan);
      try {   // desktop banner: the first cover, blurred, fills the back of the hero (hidden on small screens)
        const fillBack = () => { const im = fan.querySelector('img.loaded'); if (!im) return false; detBack.style.backgroundImage = 'url("' + (im.currentSrc || im.src) + '")'; detBack.classList.add('on'); return true; };
        if (!fillBack()) { const mo = new MutationObserver(() => { if (fillBack()) mo.disconnect(); }); mo.observe(fan, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'src'] }); setTimeout(() => mo.disconnect(), 15000); }
      } catch (e) { /* no blurred backdrop */ }
      const tot = books.reduce((x, b) => x + (b.total || 0), 0);
      stats.textContent = books.length + (books.length === 1 ? ' book' : ' books') + (tot ? ' \u00b7 ' + Math.max(1, Math.round(tot / 3600)) + ' h of audio' : '');
      authorYears(a, books).then(m => { if (DET.author !== a || !m) return; years.textContent = m.y1 && m.y2 ? m.y1 + '\u2013' + m.y2 : m.y1 ? 'Born ' + m.y1 : 'Died ' + m.y2; years.hidden = false; });
      const heard = new Set(listenedList().map(r => String(r.id)));
      const start = books.length >= 3 ? books.filter(b => !heard.has(String(b.id))).sort((x, y) => x.total - y.total)[0] : null;
      if (start) {
        startBtn.append(svgIcon('#i-play'), h('span', {}, 'Start with ' + start.title));
        startBtn.title = 'The shortest book you have not heard yet';
        startBtn.addEventListener('click', () => openDetail(nxPub(start)));
        startBtn.hidden = false;
      }
      if (start) body.append(h('section', { class: 'home-section aut-start' }, h('div', { class: 'home-section-head' }, h('div', {}, h('h2', {}, 'Start here'), h('p', { class: 'mood-sub' }, 'The shortest one you have not heard'))), bookCard(nxPub(start), () => openDetail(nxPub(start)))));
      let mode = 'best', shown = 30;
      const list = h('div', { class: 'list aut-list' }), grid = h('div', { class: 'aut-grid' }), more = h('button', { class: 'genre-more', type: 'button', hidden: true }, 'Show more'), chips = h('div', { class: 'pk-chips', role: 'group', 'aria-label': 'Sort books' });
      const sorted = () => books.slice().sort(mode === 'az' ? (x, y) => x.title.localeCompare(y.title) : mode === 'short' ? (x, y) => x.total - y.total : mode === 'rated' && !rtCalm() ? rtCmp : (x, y) => (y.ia ? 1 : 0) - (x.ia ? 1 : 0) || (+x.id) - (+y.id));
      const draw = () => {
        const all = sorted();
        list.textContent = ''; grid.textContent = '';
        all.slice(0, shown).forEach(b => { list.append(bookCard(nxPub(b), () => openDetail(nxPub(b)))); grid.append(tileNode(nxPub(b), () => openDetail(nxPub(b)))); });   // rows on phones, cover grid on desktop (CSS shows one)
        more.hidden = all.length <= shown;
        $$('button', chips).forEach(c => c.setAttribute('aria-pressed', String(c.dataset.k === mode)));
      };
      [['best', 'Best match'], ['az', 'A\u2013Z'], ['short', 'Shortest'], ['rated', 'Top rated']].forEach(([k, t]) => { const c = h('button', { class: 'fchip' + (k === 'rated' ? ' rt-only' : ''), type: 'button', 'aria-pressed': 'false', onclick: () => { mode = k; shown = 30; draw(); if (k === 'rated') rtSumLoad().then(draw); } }, t); c.dataset.k = k; chips.append(c); });
      more.addEventListener('click', () => { shown += 30; draw(); });
      body.append(h('section', { class: 'home-section aut-books' }, h('div', { class: 'home-section-head' }, h('div', {}, h('h2', {}, 'All books'))), chips, list, grid, more));
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
