  /* ---------- Collections tab ----------
     Index: a filter box, jump chips and every shelf as a row. Tap See all for one collection as a grid with
     sorting, "hide heard" and a random pick. "New this week" is the first shelf. */
  const COL = { open: null, q: '', sort: 'curated', hide: false, data: null, tok: 0 };
  const colShelves = d => (d.nw.length >= 3 ? [{ key: 'new', title: 'New this week', blurb: 'Fresh arrivals, just added to the library.', books: d.nw }] : []).concat(d.gen || [], d.cols, d.all || []);
  const svgIcon = id => { const sv = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); sv.setAttribute('class', 'ic'); sv.setAttribute('aria-hidden', 'true'); const u = document.createElementNS('http://www.w3.org/2000/svg', 'use'); u.setAttribute('href', id); sv.append(u); return sv; };
  function openCollection(key) { COL.open = key; COL.q = ''; showTab('collections', true); window.scrollTo(0, 0); }
  async function renderCollections() {
    histSoon();
    const body = $('#col-body'), my = ++COL.tok;
    if (!COL.data) colSkeleton(body);
    let d = null;
    try { d = await curBuild(60); } catch (e) { /* offline: keep what was shown */ }
    if (my !== COL.tok) return;
    if (d) COL.data = d;
    d = COL.data; body.textContent = '';
    if (!d) { $('#col-head').hidden = false; body.append(stateNode('error', "Couldn't load collections", 'They are rebuilt daily and appear once you are online.', 'Try again', renderCollections)); return; }
    const shelves = colShelves(d), cur = COL.open ? shelves.find(x => x.key === COL.open) : null;
    if (COL.open && !cur) COL.open = null;
    if (cur) drawCollection(body, cur); else drawCollections(body, shelves);
  }
  const colHue = (k, i) => (i * 47 + 28) % 360;
  const colStats = c => { const tot = c.books.reduce((a, b) => a + (b.total || 0), 0); return c.books.length + ' books' + (tot ? ' \u00b7 ' + Math.max(1, Math.round(tot / 3600)) + ' h' : ''); };
  const colFan = c => h('span', { class: 'col-fan', 'aria-hidden': 'true' }, c.books.slice(0, 3).map(b => coverNode(b)));
  function colSkeleton(body) {
    body.textContent = '';
    const g = h('div', { class: 'col-grid', 'aria-busy': 'true', 'aria-label': 'Loading collections' }, [h('div', { class: 'col-sk hero' })].concat([1, 2, 3, 4].map(() => h('div', { class: 'col-sk' }))));
    body.append(g);
  }
  function drawCollections(body, shelves) {
    $('#col-head').hidden = false;
    $('#col-sub').textContent = shelves.length ? shelves.length + ' shelves, rebuilt daily.' : 'No collections yet. Check back soon.';
    const q = h('input', { type: 'search', class: 'col-q', placeholder: 'Find a shelf, book or author', 'aria-label': 'Find in collections', value: COL.q });
    const clr = h('button', { class: 'btn-clear', type: 'button', 'aria-label': 'Clear search', hidden: !COL.q, onclick: () => { q.value = ''; COL.q = ''; clr.hidden = true; draw(); q.focus(); } }, svgIcon('#i-x'));
    const field = h('div', { class: 'col-field' }, svgIcon('#i-search'), q, clr), list = h('div', { class: 'col-list' });
    const go = key => { COL.open = key; renderCollections(); window.scrollTo(0, 0); };
    const rowBlock = (c, books) => {
      const row = h('div', { class: 'hrow', 'aria-label': c.title });
      const block = h('section', { class: 'col-block' },
        h('div', { class: 'home-section-head' }, h('div', {}, h('h2', {}, c.title, h('span', { class: 'col-count' }, String(books.length))), c.blurb ? h('p', { class: 'mood-sub' }, c.blurb) : null), h('button', { class: 'sec-more', type: 'button', onclick: () => go(c.key) }, 'See all \u2192')),
        row);
      fillRow(row, books, () => go(c.key), 12);
      return block;
    };
    const tile = c => h('button', { class: 'col-tile', type: 'button', style: '--h:' + colHue(c.key, shelves.indexOf(c)), onclick: () => go(c.key) },
      colFan(c), h('span', {}, h('strong', {}, c.title), h('small', {}, colStats(c))));
    const pill = c => h('button', { class: 'col-pill', type: 'button', onclick: () => go(c.key) }, c.title, c.n ? h('small', {}, String(c.n)) : null);   // "All genres": one compact pill per genre, with its book count
    const draw = () => {
      list.textContent = '';
      const t = COL.q.trim().toLowerCase();
      if (t) { // searching: matching shelves as rows, with only the matching books
        let n = 0;
        shelves.forEach(c => {
          let books = c.books;
          if (!(c.title + ' ' + c.blurb).toLowerCase().includes(t)) books = c.books.filter(b => (b.title + ' ' + (b.authors || '')).toLowerCase().includes(t));
          if (!books.length) return;
          n++; list.append(rowBlock(c, books));
        });
        if (!n) list.append(stateNode('empty', 'No matches', 'Nothing in the collections matches \u201c' + COL.q.trim() + '\u201d. Try a title, author or shelf name.', 'Clear search', () => { q.value = ''; COL.q = ''; clr.hidden = true; draw(); }));
        return;
      }
      if (!shelves.length) { list.append(stateNode('empty', 'No collections yet', 'Shelves are rebuilt every week. Check back soon.')); return; }
      const [hero, ...rest] = shelves;
      list.append(h('button', { class: 'col-hero', type: 'button', style: '--h:' + colHue(hero.key, 0), onclick: () => go(hero.key) },
        h('span', { class: 'col-hero-top' }, h('span', {}, h('span', { class: 'eyebrow' }, 'Start here'), h('h2', {}, hero.title), h('p', {}, hero.blurb || colStats(hero))), colFan(hero)),
        h('span', { class: 'col-go' }, colStats(hero) + ' \u00b7 Open', svgIcon('#i-go'))));
      // Every other shelf goes under its section heading (Popular, Genres, Learn English...). Small sections are rows, big ones are tiles.
      const groups = new Map();
      rest.forEach(c => { const g = c.group || 'More collections'; if (!groups.has(g)) groups.set(g, []); groups.get(g).push(c); });
      const heads = new Map(), secs = [];
      groups.forEach((cs, g) => {
        const noHead = g === 'Browse by genre';   // its rows (Sci-Fi & Horror, Romance...) already say what they are, so no heading; the jump chip scrolls to the first row instead
        const head = noHead ? null : h('h2', { class: 'col-gh' }, g, h('span', { class: 'col-count' }, String(cs.length)));
        const nRows = g === 'Browse by genre' ? cs.length : g === 'All genres' ? 0 : cs.length <= 5 ? cs.length : 2;   // small sections: every shelf is a row of covers; big ones: the first two are rows, the rest are tiles
        const sec = h('section', { class: 'col-group' }, head,
          h('div', { class: 'col-list' }, cs.slice(0, nRows).map(c => rowBlock(c, c.books))),
          g === 'All genres' ? h('div', { class: 'col-pills' }, cs.map(pill)) : cs.length > nRows ? h('div', { class: 'col-grid' }, cs.slice(nRows).map(tile)) : null);
        heads.set(g, head || sec);
        secs.push(sec);
      });
      if (groups.size > 1) list.append(h('div', { class: 'col-jump', role: 'group', 'aria-label': 'Jump to a section' },
        [...groups.keys()].map(g => h('button', { class: 'col-toggle', type: 'button', onclick: () => heads.get(g).scrollIntoView({ behavior: motionOk(), block: 'start' }) }, g))));
      list.append(...secs);
    };
    q.addEventListener('input', () => { COL.q = q.value; clr.hidden = !q.value; draw(); });
    body.append(field, list); draw();
  }
  function drawCollection(body, c) {
    $('#col-head').hidden = true;
    const cleanCardTitle = t => { const x = String(t || '').replace(/\s*[\(\[](?:version|ver\.?|v\.?|vol\.?|volume|dramatic reading|librivox recording)[^\)\]]*[\)\]]\s*/ig, ' ').replace(/\s{2,}/g, ' ').trim(); return x || String(t || ''); };
    const heardRec = new Map(listenedList().map(r => [r.id, r]));
    const heard = new Set(listenedList().map(r => r.id)), nHeard = c.books.filter(b => heard.has(b.id)).length;
    const tot = c.books.reduce((a, b) => a + (b.total || 0), 0);
    const idx = COL.data ? colShelves(COL.data).findIndex(x => x.key === c.key) : 0;
    const back = h('button', { class: 'ib', type: 'button', 'aria-label': 'Back to collections', onclick: () => { COL.open = null; renderCollections(); window.scrollTo(0, 0); } }, svgIcon('#i-back'));
    const grid = h('div', { class: 'grid3' }), seg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Sort' });
    const draw = () => {
      $$('button', seg).forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === COL.sort)));
      hide.setAttribute('aria-pressed', String(COL.hide));
      hide.textContent = COL.hide && nHeard ? '\u2713 Hiding ' + nHeard : 'Hide heard';
      hide.disabled = !nHeard; hide.title = nHeard ? '' : 'Nothing heard yet';
      const arr = c.books.filter(b => !(COL.hide && heard.has(b.id)));
      if (COL.sort === 'short') arr.sort((a, b) => (a.total || 1e12) - (b.total || 1e12));
      else if (COL.sort === 'long') arr.sort((a, b) => (b.total || -1) - (a.total || -1));
      else if (COL.sort === 'rated' && !rtCalm()) arr.sort(rtCmp);
      else if (COL.sort === 'az') arr.sort((a, b) => String(a.title).localeCompare(String(b.title)));
      grid.textContent = '';
      if (!arr.length) { grid.append(h('p', { class: 'help' }, 'You have heard everything on this shelf.')); return; }
      arr.forEach(b => {
        const t = tileNode(b, () => openDetail(b));
        // Clean card text: no "(Version 2)"-style subtitles, then duration and listening progress under the author
        const tt = t.querySelector('.tile-t'); if (tt) { const ct = cleanCardTitle(b.title); tt.textContent = ct; tt.title = b.title; }
        const lr = heardRec.get(b.id), pc = lr && lr.pct > 0.01 && lr.pct < 0.98 ? lr.pct : 0;
        const ta = t.querySelector('.tile-a');
        if (b.total) { const old = t.querySelector('.tile-dur'); if (old) old.remove(); const dur = h('span', { class: 'tile-dur' }, fmtShort(b.total) + (pc ? ' \u00b7 ' + Math.round(pc * 100) + '%' : '')); (ta || t.firstChild).after(dur); if (pc) dur.after(h('span', { class: 'tile-prog', 'aria-hidden': 'true' }, h('b', { style: 'width:' + Math.round(pc * 100) + '%' }))); }
        if (heard.has(b.id)) { t.classList.add('is-heard'); const cv = t.querySelector('.tile-cover'); if (cv) cv.append(h('span', { class: 'heard-mark', 'aria-label': 'Heard' }, '\u2713')); }
        grid.append(t);
      });
    };
    [['curated', 'Curated'], ['short', 'Shortest'], ['long', 'Longest'], ['rated', 'Top rated'], ['az', 'A\u2013Z']].forEach(([v, t]) => seg.append(h('button', { type: 'button', class: v === 'rated' ? 'rt-only' : '', 'data-v': v, 'aria-pressed': 'false', onclick: () => { COL.sort = v; draw(); if (v === 'rated') rtSumLoad().then(draw); } }, t)));
    const hide = h('button', { class: 'col-toggle', type: 'button', 'aria-pressed': String(COL.hide), onclick: () => { COL.hide = !COL.hide; draw(); } }, 'Hide heard');
    const rnd = h('button', { class: 'btn small ghost', type: 'button', onclick: () => { const pool = c.books.filter(b => !heard.has(b.id)), from = pool.length ? pool : c.books; const b = from[Math.floor(Math.random() * from.length)]; if (b) openBook(b); } }, 'Surprise me');
    const next = c.books.find(b => !heard.has(b.id));
    const play = next ? h('button', { class: 'btn small', type: 'button', onclick: () => openBook(next) }, nHeard ? 'Next unheard' : 'Start with ' + (cleanCardTitle(next.title).length > 22 ? cleanCardTitle(next.title).slice(0, 21) + '\u2026' : cleanCardTitle(next.title))) : null;
    const pct = c.books.length ? Math.round(nHeard / c.books.length * 100) : 0;
    const mini = next ? h('button', { class: 'btn small col-mini-go', type: 'button', 'aria-label': 'Play next book', onclick: () => openBook(next) }, [svgIcon('#i-play'), 'Play']) : null;
    const head = h('div', { class: 'seeall-head col-sticky' }, back, h('span', { class: 'col-crumb' }, h('button', { class: 'crumb-a', type: 'button', onclick: () => { COL.open = null; renderCollections(); window.scrollTo(0, 0); } }, 'Collections'), h('span', { class: 'crumb-sep', 'aria-hidden': 'true' }, '\u203a'), h('span', { class: 'crumb-b' }, c.title)), mini);
    body.append(
      head,
      h('section', { class: 'col-banner', style: '--h:' + colHue(c.key, Math.max(idx, 0)) },
        h('div', { class: 'col-banner-top' }, h('div', {}, h('h1', {}, c.title), c.blurb ? h('p', {}, c.blurb) : null), colFan(c)),
        h('div', { class: 'col-prog' }, h('span', {}, [c.books.length + ' books', tot ? fmtLong(tot) : ''].filter(Boolean).join(' \u00b7 ') + (nHeard ? ' \u00b7 ' + nHeard + ' heard' : '')), nHeard ? h('i', {}, h('b', { style: 'width:' + pct + '%' })) : null),
        h('div', { class: 'col-acts' }, play, rnd)),
      h('div', { class: 'col-bar' }, seg, hide),
      grid);
    draw();
    // Collapse the header into a slim title bar once the banner has scrolled away
    const ban = body.querySelector('.col-banner');
    if (ban && 'IntersectionObserver' in window) new IntersectionObserver(es => { head.classList.toggle('is-compact', !es[0].isIntersecting && es[0].boundingClientRect.top < 0); }, { threshold: 0 }).observe(ban);
  }

  function initHomeSections() {
    const bootSk = document.getElementById('boot-sk'); if (bootSk) bootSk.remove();
    homeSkeletons();
    // Inject "See all" buttons into section headers now that JS is running
    const featHead = $('#sec-featured .home-section-head');
    if (featHead && !featHead.querySelector('.sec-more')) featHead.append(seeAllBtn(SEE_FEATURED));

    const recentHead = $('#sec-recent .home-section-head');
    if (recentHead && !recentHead.querySelector('.sec-more')) recentHead.append(seeAllBtn(SEE_RECENT));

    buildGenreChips(); initFilters(); initFpanel();
    loadFeatured();
    setTimeout(prefetchGenres, 4000);
    setTimeout(loadRecentlyAdded, 300);
    setTimeout(loadDaily, 150);
    setTimeout(loadCuration, 250);
    initHomeWatch();
  }

  /* ------ Library: when nothing could be loaded, say so and offer a retry, instead of an empty page ------
     'content' = something real is on screen, 'loading' = placeholders are still showing, 'empty' = nothing came. A section that
     already shows its own error card counts as a message, so the two are never stacked. */
  const HOME_IDS = ['recents', 'sec-botd', 'sec-tod', 'sec-picks', 'sec-newweek', 'sec-collections'];   // the sections on the Library tab itself (Featured and Recently added live in Collections)
  const HS = { start: Date.now(), obs: null, timer: 0 };
  function homeStatus() {
    let loading = false, skipped = false;
    for (const id of HOME_IDS) {
      const sec = document.getElementById(id); if (!sec || sec.hidden) continue;
      if (sec.classList.contains('hh-off') || sec.classList.contains('hh-cap')) { skipped = true; continue; }   // switched off in Settings > Customise home
      if (sec.querySelector('.tile:not(.sk), .botd-hero, .col-card, .card:not(.sk), .state')) return 'content';
      if (sec.querySelector('.sk')) loading = true;
    }
    if (loading && navigator.onLine !== false && Date.now() - HS.start < 45000) return 'loading';
    return skipped ? 'content' : 'empty';   // everything switched off on purpose is not an error
  }
  function homeStateCheck() {
    const st = $('#home-state'); if (!st) return;
    const searching = el.results && !el.results.hidden;
    const status = searching ? 'content' : homeStatus();
    if (status !== 'empty') { if (!st.hidden) { st.hidden = true; st.textContent = ''; } return; }
    if (!st.hidden) return;
    HOME_IDS.forEach(skSweep);   // drop placeholders that are still waiting
    st.textContent = '';
    st.append(stateNode('error', "Couldn't load the library", 'Books come from the internet and Wordtrail could not reach them just now. Your saved books and downloads still work.', 'Try again', homeRetry));
    st.hidden = false;
  }
  function homeRetry() {
    const st = $('#home-state'); if (st) { st.hidden = true; st.textContent = ''; }
    if (!CAT.books) CAT.p = null;   // the catalog promise is kept after a failure: forget it so it is asked for again
    HS.start = Date.now(); HSK.done = {};
    homeSkeletons();
    loadDaily(); loadPicks(); loadCuration();
    [3000, 12000, 30000, 47000].forEach(ms => setTimeout(homeStateCheck, ms));
  }
  function initHomeWatch() {
    const home = $('#home'); if (!home || HS.obs) return;
    const soon = () => { clearTimeout(HS.timer); HS.timer = setTimeout(homeStateCheck, 700); };
    try { HS.obs = new MutationObserver(soon); HS.obs.observe(home, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden'] }); } catch (e) { /* no observer: the timers below still check */ }
    [2500, 8000, 20000, 47000].forEach(ms => setTimeout(homeStateCheck, ms));
    window.addEventListener('online', () => { const st = $('#home-state'); if (st && !st.hidden) homeRetry(); });
  }

  /* Empty the search and bring the home rows back. Back uses it too (focus = false, so no keyboard pops up), and it
     stops any search that is still running so late results cannot reopen the list. */
  function clearSearch(focus) {
    clearTimeout(typeTimer); clearInterval(progTimer);
    if (searchCtl) searchCtl.abort();
    searchSeq++;
    el.q.value = '';
    const cb = $('#btn-clear-q'); if (cb) cb.hidden = true;
    el.results.hidden = true;
    el.resultList.textContent = '';
    setStatus('');
    progress(false);
    syncHomeRows(false);
    if (focus) el.q.focus(); else el.q.blur();
  }
  /* ------ Clear button wiring ------ */
  function initClearButton() {
    const clearBtn = $('#btn-clear-q');
    if (!clearBtn) return;
    el.q.addEventListener('input', () => {
      clearBtn.hidden = !el.q.value;
    });
    clearBtn.addEventListener('click', () => clearSearch(true));
  }

  /* Hide homepage rows when a search is active; restore when search is cleared */
  function syncHomeRows(searching) {
    const ids = ['sec-tod', 'sec-picks', 'sec-genre', 'sec-newweek', 'sec-collections'];
    ids.forEach(id => {
      const el = $('#' + id);
      if (el) el.style.display = searching ? 'none' : '';
    });
  }

