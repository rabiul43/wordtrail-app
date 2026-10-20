  /* ------ one book, one row per screen ------
     Rows on the same screen are filled by separate loaders that finish in any order, so each screen keeps the FULL list
     every loader received (RW) and repaints its rows top to bottom, skipping any book a higher row already shows.
     Painting is repeatable: when a higher row arrives late, the lower rows simply paint again without it.
     Collections > #col-extra: Trending, then Featured, then Recently added.
     Library: Picked for you (whatever chip is chosen) above New this week. */
  const RW = { trending: null, featured: null, recent: null, nw: null };
  const bookKey = b => String(b && b.id);
  function colExtraPaint() {
    const seen = new Set();
    [['trending', '#trending-row', '#sec-trending', 20, 3, null],
     ['featured', '#featured-row', '#sec-featured', HOME_LIMIT, 1, () => openSeeAll(SEE_FEATURED)],
     ['recent', '#recent-row', '#sec-recent', HOME_LIMIT, 1, () => openSeeAll(SEE_RECENT)]].forEach(([k, rowSel, secSel, limit, min, more]) => {
      if (!RW[k]) return;   // not loaded yet (or it failed and shows its own error card): leave the row alone
      const row = $(rowSel), sec = $(secSel);
      const books = RW[k].filter(b => !seen.has(bookKey(b))).slice(0, limit);
      if (books.length < min) { row.textContent = ''; sec.hidden = true; return; }   // nothing new left for this row: hide it rather than show a repeat
      books.forEach(b => seen.add(bookKey(b)));
      fillRow(row, books, more, limit);
      sec.hidden = false;
    });
  }
  /* New this week, minus the books "Picked for you" (and a visible Book of the day) already show on Library */
  function newWeekPaint() {
    if (!RW.nw) return;
    const nrow = $('#newweek-row'), nsec = $('#sec-newweek');
    const seen = new Set($$('.tile', $('#sec-picks')).map(t => t._wtId).filter(Boolean).map(String));
    const bo = $('#sec-botd .botd-hero'); if (bo && !$('#sec-botd').hidden && RW.botd) seen.add(String(RW.botd));
    const books = RW.nw.filter(b => !seen.has(bookKey(b))).slice(0, 20);
    if (books.length >= 3) { fillRow(nrow, books, null, 20); nsec.hidden = false; } else { nrow.textContent = ''; nsec.hidden = true; }
  }

  /* ------ Featured section ------ */
  async function loadFeatured() {
    const row = $('#featured-row'), sec = $('#sec-featured'), errEl = $('#featured-err');
    errEl.hidden = true;

    // Show skeletons only on a cold load (no cache at all)
    const cached = store.get('wt:home:featured', null);
    if (!cached || !cached.books || !cached.books.length) {
      rowSkeletons(row, 6);
      sec.hidden = false;
    }

    await swr(
      'wt:home:featured',
      TTL_FEATURED,
      async () => {
        const results = await Promise.allSettled(
          FEATURED_IDS.map(id => lvGet({ id }, { light: true }))
        );
        return results
          .filter(r => r.status === 'fulfilled' && r.value.length)
          .map(r => r.value[0]);
      },
      (books) => {
        RW.featured = books;
        colExtraPaint();   // skips books Trending already shows
      },
      () => {
        row.textContent = '';
        row.append(stateNode('error', "Couldn't load featured books", 'LibriVox did not answer.', 'Try again', () => loadFeatured()));
        sec.hidden = false;
      }
    );
  }

  /* ------ Recently Added section ------ */
  async function loadRecentlyAdded() {
    const row = $('#recent-row'), sec = $('#sec-recent');

    const cached = store.get('wt:home:recent', null);
    if (!cached || !cached.books || !cached.books.length) {
      rowSkeletons(row, 6);
      sec.hidden = false;
    }

    // LibriVox uses `since` as a Unix timestamp, not a date string
    const sinceTs = Math.floor((Date.now() - 90 * 24 * 3600e3) / 1000);

    await swr(
      'wt:home:recent',
      TTL_RECENT,
      () => lvGet({ since: sinceTs, limit: 20 }, { light: true }),
      (books) => {
        RW.recent = books;
        colExtraPaint();   // skips books Trending and Featured already show
      },
      () => {
        row.textContent = '';
        row.append(stateNode('error', "Couldn't load new books", 'LibriVox did not answer.', 'Try again', () => loadRecentlyAdded()));
        sec.hidden = false;
      }
    );
  }

  /* ------ Genre chips + results ------ */
  const GENRE_KEY = 'wt:active-genre';
  let activeGenre = null;

  const plural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');

  function genreEls() {
    return { wrap: $('#genre-results'), count: $('#genre-count'), note: $('#genre-note'), list: $('#genre-list'), more: $('#genre-more') };
  }

  function genreSkeletons(list, n) {
    list.textContent = '';
    for (let i = 0; i < n; i++) {
      list.append(h('div', { class: 'card sk', 'aria-hidden': 'true' },
        h('div', { class: 'cover' }),
        h('div', {}, h('div', { class: 'sk-l w60' }), h('div', { class: 'sk-l w40' })),
        h('span')));
    }
  }

  /* Collapse the genre panel and forget the selection (used by chip re-tap and by any search). */
  function clearGenre() {
    activeGenre = null;
    document.body.classList.remove('genre-on');
    store.set(GENRE_KEY, null);
    const chips = $('#genre-chips');
    if (chips) $$('.genre-chip', chips).forEach(c => c.setAttribute('aria-pressed', 'false'));
    const e = genreEls();
    if (!e.wrap) return;
    e.wrap.hidden = true;
    e.list.textContent = '';
    e.count.hidden = true;
    e.note.hidden = true;
    e.more.hidden = true;
  }

  function renderGenre(g, books) {
    const e = genreEls();
    const viaSearch = books.some(b => b.viaSearch);
    e.count.textContent = plural(books.length, 'recording') + ' in ' + g.label;
    e.count.hidden = false;
    e.note.textContent = viaSearch ? "Showing search results for '" + g.label + "'" : '';
    e.note.hidden = !viaSearch;
    e.list.textContent = '';
    const cards = books.map(b => bookCard(b, () => openDetail(b)));
    e.list.append(...cards);
    checkReady(cards);
    e.more.hidden = false;
  }

  let retryGenreLater = null;
  window.addEventListener('online', () => { const f = retryGenreLater; retryGenreLater = null; if (f) f(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && retryGenreLater) { const f = retryGenreLater; retryGenreLater = null; f(); } });
  /* Warm the genre caches quietly, one at a time, so tapping a genre is instant. */
  async function prefetchGenres() {
    for (const g of GENRES) {
      const key = 'wt:genre:' + g.lv, c = store.get(key, null);
      if (c && c.books && c.books.length && Date.now() - c.t < TTL_GENRE) continue;
      try { const b = await lvGet({ genre: g.lv, limit: 20 }, { light: true }); if (b.length) store.set(key, { t: Date.now(), books: b }); } catch (e) {}
      await new Promise(r => setTimeout(r, 1500));
    }
  }

  async function openGenre(g, chip) {
    retryGenreLater = null;
    const chips = $('#genre-chips');
    $$('.genre-chip', chips).forEach(c => c.setAttribute('aria-pressed', 'false'));
    activeGenre = g.lv;
    document.body.classList.add('genre-on');
    store.set(GENRE_KEY, g.lv);
    chip.setAttribute('aria-pressed', 'true');

    const e = genreEls();
    e.wrap.hidden = false;
    e.count.hidden = true;
    e.note.hidden = true;
    e.more.hidden = true;

    const cacheKey = 'wt:genre:' + g.lv;
    const cached = store.get(cacheKey, null);
    if (!cached || !cached.books || !cached.books.length) genreSkeletons(e.list, 4);

    await swr(
      cacheKey,
      TTL_GENRE,
      async () => {
        const books = await lvGet({ genre: g.lv, limit: 20 }, { light: true });
        if (books.length) return books;
        // LibriVox's genre taxonomy is inconsistent: fall back to a normal search for the label
        const found = await searchBooks(g.q);
        return found.slice(0, 20).map(b => Object.assign({}, b, { viaSearch: true }));
      },
      (books) => {
        if (activeGenre !== g.lv) return; // user switched genre mid-load
        renderGenre(g, books);
      },
      (err) => {
        if (activeGenre !== g.lv) return;
        e.count.hidden = true;
        e.note.hidden = true;
        e.list.textContent = '';
        if (err && err.message === 'empty') {
          e.list.append(stateNode('empty', 'Nothing in ' + g.label + ' yet', 'Try a search instead.', 'Search ' + g.label, () => { el.q.value = g.q; doSearch(g.q); window.scrollTo({ top: 0, behavior: motionOk() }); }));
          e.more.hidden = false;
        } else {
          e.list.append(stateNode('error', "Couldn't load " + g.label, 'LibriVox is slow right now. Retrying when you are back online or in a moment.', 'Try again', () => openGenre(g, chip)));
          retryGenreLater = () => openGenre(g, chip);
          e.more.hidden = true;
        }
      }
    );
  }

  function toggleGenre(g, chip) {
    if (activeGenre === g.lv) clearGenre(); else openGenre(g, chip);
    if (fltActiveCount()) applyFilters();
  }

  guideDoc('home', 'Genres and filters', "Tap the Filters button next to the search bar to sort (newest, top rated, shortest) and to narrow by genre, level (CEFR and age guides), length, mood, minimum rating, language and narrator. Books with fewer than 5 ratings are left out of Top rated and the rating filter. Active filters show as chips under the bar. Clear all resets them.");
