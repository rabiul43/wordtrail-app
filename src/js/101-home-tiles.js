  /* ------ tile: vertical card used inside .hrow ------ */
  function tileNode(b, onOpen) {
    const dlBadge = h('span', { class: 'tile-badge dl', hidden: true }), lvBadge = h('span', { class: 'lvl tile-lvl', hidden: true }), cov = tileCoverNode(b);
    const rateBadge = h('span', { class: 'tile-rate', hidden: true });
    cov.append(lvBadge, rateBadge);
    rtSumLoad();
    const tile = h('button', {
      class: 'tile', type: 'button',
      'aria-label': b.title + (b.authors ? ', ' + b.authors : ''),
      onclick: onOpen
    },
      cov,
      h('span', { class: 'tile-t' }, b.title),
      h('span', { class: 'tile-a' }, b.authors || ''),
      b.total ? h('span', { class: 'tile-dur' }, fmtShort(b.total)) : null,
      dlBadge
    );
    tile._wtId = b.id;
    tile._wtCv = cov; tile._wtTileDl = dlBadge; tile._wtTileLvl = lvBadge; tile._wtRate = rateBadge; tile._wtLabel = b.title + (b.authors ? ', ' + b.authors : '');
    if (b.id) paintTileBadge(tile);
    return tile;
  }

  /* Tiles stay quiet: the only badge that earns a place is the download mark on the cover (dlMarkPaint in 120). */
  function paintTileBadge(tile) {
    if (!tile._wtTileDl) return;
    offDim(tile);
    dlMarkPaint(tile._wtCv, tile._wtId);   // the text pill is gone: the mark sits on the cover, its words go into the aria-label below
    const dl = dlLabel(tile._wtId);
    if (tile._wtRate) { const rt = rtChipText(tile._wtId); tile._wtRate.textContent = rt; tile._wtRate.hidden = !rt; }
    const lb = tile._wtTileLvl; if (!lb) return;
    const v = LVL.map.get(String(tile._wtId)), t = v ? (LVL.tiers[v[0]] || '') : '', c = v && LVL.cefr[v[1]];
    lb.textContent = t ? t + (c ? ' \u00b7 ' + c[0] : '') : ''; lb.hidden = !t; lb.dataset.t = t ? v[0] : '';
    tile.setAttribute('aria-label', tile._wtLabel + (dl ? '. ' + dl : '') + (t ? '. Reading level: ' + t + (c ? ', CEFR ' + c[0] : '') : '') + (rtSpeak(tile._wtId) ? '. ' + rtSpeak(tile._wtId) : ''));
  }
  function paintTiles() {
    $$('.tile').forEach(t => { if (t._wtId && t._wtTileDl) paintTileBadge(t); });
  }

  /* ------ "Show more →" tile at end of a row ------ */
  function showMoreTile(onMore) {
    return h('button', {
      class: 'tile-more', type: 'button',
      'aria-label': 'See all',
      onclick: onMore
    },
      (() => {
        const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        s.setAttribute('viewBox', '0 0 24 24');
        s.setAttribute('aria-hidden', 'true');
        const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        p.setAttribute('d', 'M9 18l6-6-6-6');
        s.append(p);
        return s;
      })(),
      'See all'
    );
  }

  /* ------ skeleton tiles for a row while loading ------ */
  function rowSkeletons(container, count) {
    container.textContent = '';
    for (let i = 0; i < count; i++) {
      container.append(h('div', { class: 'tile sk', 'aria-hidden': 'true' },
        h('div', { class: 'tile-cover' }),
        h('div', { class: 'sk-l sk-k' }),
        h('div', { class: 'sk-l w90' }),
        h('div', { class: 'sk-l w60' }),
        h('div', { class: 'sk-l w40' })
      ));
    }
  }

  guideDoc('home', 'Refresh Home', "Pull down at the top of the Library tab to refresh the shelves.");
  /* ------ pull to refresh (Library tab, at the top of the page) ------ */
  const PTR_TRIGGER = 70;
  let ptrBusy = false, ptrNote = 0;
  function markStale(key) { const c = store.get(key, null); if (c && Array.isArray(c.books)) store.set(key, Object.assign({}, c, { t: 0 })); }
  async function refreshHome() {
    if (ptrBusy) return;
    ptrBusy = true;
    markStale('wt:home:featured'); markStale('wt:home:recent');
    { const c = store.get('wt:daily', null); if (c) store.set('wt:daily', Object.assign({}, c, { t: 0 })); }
    const jobs = [loadFeatured(), loadRecentlyAdded(), loadDaily(), loadPicks()];
    const gi = GENRES.findIndex(g => g.lv === activeGenre);
    if (gi >= 0) {
      markStale('wt:genre:' + activeGenre);
      jobs.push(openGenre(GENRES[gi], $('#genre-chips').children[gi]));
    }
    await Promise.all([Promise.allSettled(jobs), new Promise(r => setTimeout(r, 700))]);
    ptrBusy = false;
  }
  function initPullToRefresh() {
    const ind = h('div', { id: 'ptr', class: 'ptr', 'aria-hidden': 'true' }, h('span', { class: 'ptr-dot' }));
    document.body.append(ind);
    let y0 = null, dy = 0;
    const active = () => curTab === 'library' && !seeOpen && !el.home.hidden && !sheetOpen() && window.scrollY <= 0 && !ptrBusy;
    const paint = (d, spin) => {
      ind.style.setProperty('--ptr', Math.min(d, 110) + 'px');
      ind.classList.toggle('show', d > 0 || spin);
      ind.classList.toggle('ready', d >= PTR_TRIGGER);
      ind.classList.toggle('spin', !!spin);
    };
    document.addEventListener('touchstart', e => {
      y0 = active() && e.touches.length === 1 ? e.touches[0].clientY : null; dy = 0;
    }, { passive: true });
    document.addEventListener('touchmove', e => {
      if (y0 == null) return;
      dy = Math.max(0, (e.touches[0].clientY - y0) * 0.5);
      if (window.scrollY > 0) { y0 = null; paint(0); return; }
      paint(dy);
    }, { passive: true });
    document.addEventListener('touchend', async () => {
      if (y0 == null) return;
      const go = dy >= PTR_TRIGGER; y0 = null;
      if (!go) { paint(0); return; }
      /* The spinner is the visual cue; the status line (a polite live region) is the spoken one. A search message already
         showing there is left alone. */
      const free = !el.status.textContent;
      if (free) setStatus('Refreshing\u2026');
      paint(PTR_TRIGGER, true);
      await refreshHome();
      paint(0);
      if (free && el.status.textContent === 'Refreshing\u2026') {
        setStatus('Updated just now');
        clearTimeout(ptrNote); ptrNote = setTimeout(() => { if (el.status.textContent === 'Updated just now') setStatus(''); }, 3000);
      }
    }, { passive: true });
    document.addEventListener('touchcancel', () => { y0 = null; paint(0); }, { passive: true });
  }

  /* ------ fill a row with tiles + a "see all" tile at the end ------ */
  function fillRow(container, books, onMore, limit) {
    container.textContent = '';
    if (!books.length) return;
    const shown = limit ? books.slice(0, limit) : books;
    shown.forEach(b => container.append(tileNode(b, () => openDetail(b))));
    if (onMore) container.append(showMoreTile(onMore));
  }

  /* ------ stale-while-revalidate helper ------ */
  /* Shows cached data immediately, fires a background refresh, and swaps in
     fresh data silently once it arrives — no spinner, no flash. */
  async function swr(cacheKey, ttl, fetcher, onData, onError) {
    const cached = store.get(cacheKey, null);
    const fresh = cached && Array.isArray(cached.books) && cached.books.length;
    const stale = fresh && (Date.now() - cached.t > ttl);

    if (fresh) onData(cached.books, /* fromCache */ true);

    if (!fresh || stale) {
      try {
        const books = await fetcher();
        if (!books || !books.length) throw new Error('empty');
        store.set(cacheKey, { t: Date.now(), books });
        onData(books, /* fromCache */ false);
      } catch (e) {
        if (!fresh) onError(e);
        // If we had stale data, keep showing it — don't flash an error
      }
    }
  }

