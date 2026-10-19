  /* ---------- home: search, recents ---------- */
  const IDEAS = ['Pride and Prejudice', "Alice's Adventures in Wonderland", 'The Adventures of Sherlock Holmes', 'Dracula', 'Frankenstein', 'Treasure Island', 'Jane Eyre', 'The Time Machine'];
  let searchSeq = 0;

  function coverNode(b) { return coverBox(b, 'cover'); }
  /* Small status line on a card: this device's own sync state first, then whether the shared sync repo already holds timing for the book. */
  function badgeText(id, quiet) {
    const l = store.get('wt:sync:' + id, null);
    if (l && l.done) return l.done >= l.total ? '✓ Synced' : 'Synced ' + l.done + '/' + l.total;
    const pk = PKI.map.get(String(id));   // wt_packs/index.json: [tracks timed, tracks in book]
    if (pk && pk[0]) return pk[0] >= pk[1] ? '✓ Synced' : 'Synced ' + pk[0] + '/' + pk[1];
    if (store.get('wt:rdy:' + id, null) === 1) return '✓ Sync ready';
    return !quiet && PKI.ready ? 'Not synced' : '';
  }
  function dlBadgeText(id) {
    const m = dlMeta.get(String(id)), have = m ? Object.keys(m.tracks).length : 0;
    if (DL.running && DL.id === String(id)) return '↓ Downloading ' + have + '/' + DL.book.secs.length;
    if (!have) return '';
    return have >= m.n ? '✓ Available offline' : 'Offline ' + have + '/' + m.n;
  }
  function paintBadge(card) {
    offDim(card);
    const t = badgeText(card._wtId);
    card._wtBadge.textContent = t; card._wtBadge.hidden = !t; card._wtBadge.dataset.s = t === 'Not synced' ? 'no' : '';
    if (card._wtDl) { const d = dlBadgeText(card._wtId); card._wtDl.textContent = d; card._wtDl.hidden = !d; card._wtDl.classList.toggle('full', /^✓/.test(d)); }
    if (card._wtLvl) {
      const v = LVL.map.get(String(card._wtId)), c = v && LVL.cefr[v[1]], t = v ? (LVL.tiers[v[0]] || '') : '';
      card._wtLvl.textContent = t ? t + (c ? ' \u00b7 ' + c[0] : '') : ''; card._wtLvl.hidden = !t;
      card._wtLvl.dataset.t = t ? v[0] : ''; card._wtLvl.title = t ? lvlText(card._wtId) : '';
      if (t) card._wtLvl.setAttribute('aria-label', 'Reading level: ' + t + (c ? ', CEFR ' + c[0] + (c[1] ? ', ' + c[1] : '') : '')); else card._wtLvl.removeAttribute('aria-label');
    }
    if (card._wtRate) { const rl = rtLineText(card._wtId); card._wtRate.textContent = rl; card._wtRate.hidden = !rl; }
    if (card._wtChip) card._wtChip.hidden = !Array.from(card._wtChip.children).some(c => !c.hidden && c.textContent);
  }
  function paintCards() { $$('.card').forEach(c => { if (c._wtId) paintBadge(c); }); paintTiles(); offRefresh(); }
  async function checkReady(cards) {
    let ids = null;
    try { ids = await loadHFSyncedIds(); } catch (e) { return; }
    if (!ids || !ids.size) return;
    for (const c of cards.slice(0, 40)) {
      const id = c._wtId;
      if (!id || store.get('wt:rdy:' + id, null) === 1 || badgeText(id, true)) continue;
      if (ids.has(String(id))) { store.set('wt:rdy:' + id, 1); paintBadge(c); }
    }
  }
  function bookCard(b, onOpen, extra) {
    const narr = b.reader || store.get('wt:rdr:' + b.id, '');
    const lang = b.lang && !/^english$/i.test(b.lang) ? b.lang : '';
    const meta = [narr ? 'Read by ' + narr : '', b.total ? fmtLong(b.total) : '', lang].filter(Boolean).join(' \u00b7 ');
    const v = VER.ready && b.id ? VER.map.get(String(b.id)) : null;
    const bestSp = h('span', { class: 'cb-best', title: v && v.why ? v.why : 'Best audio version', hidden: !(v && v.k === 0) }, v && v.sc != null ? '\u2605 Best match \u00b7 ' + Math.round(v.sc) + '%' : '\u2605 Best match');
    const badge = h('span', { class: 'cb-sync', hidden: true }), dlb = h('div', { class: 'sbadge dl', hidden: true });
    const chip = h('div', { class: 'sbadge combo', hidden: true }, bestSp, badge);
    const lvl = h('span', { class: 'lvl', hidden: true }), rateLine = h('div', { class: 'cb-rate' }); rateLine.hidden = true;
    rtSumLoad();
    const verTxt = v && v.k > 0 ? h('div', { class: 'm' }, 'Reader ' + (v.k + 1) + ' of ' + v.n + (v.sc != null ? ' \u00b7 ' + Math.round(v.sc) + '% match' : '')) : null;
    const body = h('div', { style: 'min-width:0' },
      h('div', { class: 't' }, b.title), h('div', { class: 'a' }, b.authors),
      meta ? h('div', { class: 'm' }, meta) : null, rateLine, verTxt,
      h('div', { class: 'chips' }, lvl, chip, dlb), extra || null);
    const card = h('button', { class: 'card', type: 'button', onclick: onOpen }, coverNode(b), body,
      (() => { const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('class', 'ic go'); s.setAttribute('aria-hidden', 'true'); const u = document.createElementNS('http://www.w3.org/2000/svg', 'use'); u.setAttribute('href', '#i-go'); s.append(u); return s; })());
    card._wtId = b.id; card._wtBadge = badge; card._wtDl = dlb; card._wtChip = chip; card._wtLvl = lvl; card._wtRate = rateLine; if (b.id) paintBadge(card);
    if (!b.id) return card;
    const wrap = h('div', { class: 'card-wrap' }, card, heartNode(b, 'on-card'));
    wrap._wtId = card._wtId; wrap._wtBadge = badge; wrap._wtDl = dlb; wrap._wtChip = chip; wrap._wtLvl = lvl;
    return wrap;
  }
  let searchCtl = null, typeTimer = 0, progTimer = 0;
  const QIDX = 'wt:qidx', QTTL = 72 * 3600e3;
  function progress(on, frac, label) {
    el.prog.hidden = !on;
    el.prog.firstElementChild.firstElementChild.style.width = Math.round(Math.max(0, Math.min(1, frac || 0)) * 100) + '%';
    el.progT.textContent = label || '';
  }
  function showSkeletons() {
    el.resultList.textContent = '';
    { const rb = $('#rbar'); if (rb) rb.hidden = true; }
    for (let i = 0; i < 5; i++) el.resultList.append(h('div', { class: 'card sk', 'aria-hidden': 'true' }, h('div', { class: 'cover' }), h('div', {}, h('div', { class: 'sk-l w90' }), h('div', { class: 'sk-l w60' }), h('div', { class: 'sk-l w40' }), h('div', { class: 'sk-l sk-chip' })), h('span')));
    el.results.classList.remove('loading'); el.results.hidden = false;
  }
  guideDoc('home', 'Search', "Type in the search bar. Choose All, Title, Author or Genre to narrow it. Recent searches are kept for quick reuse, and the x button clears the box.");
  guideDoc('home', 'Read-along ready', "Filters > Read-along ready shows only books that have exact sentence timing ready, so the text follows the narrator closely.");
  /* ------ search scope: All / Title / Author / Genre. Level and Read-along ready are set in the Filters sheet (100) and still narrow search results ------ */
  const RS = { all: [], scope: 'all', sort: 'best' };
  const SCOPE_HINT = { all: 'Search a title or author', title: 'Search by title', author: 'Search by author', genre: 'Search a genre, such as mystery' };
  function rsFilter(list) {
    const q = el.q.value.trim();
    let out = list;
    if (RS.scope === 'genre' && q) out = (typeof catQuery === 'function' && catQuery({ genre: q, limit: 60 })) || [];
    else if ((RS.scope === 'title' || RS.scope === 'author') && q) {
      const toks = sxNorm(q).split(' ').filter(t => t && !SX_STOP.has(t));
      if (toks.length) out = out.filter(b => { const hay = sxNorm(RS.scope === 'title' ? b.title : b.authors); return toks.every(t => hay.includes(t)) || toks.some(t => hay.includes(t)) && toks.length > 2; });
    }
    if (lfActive()) out = out.filter(lfMatch);
    return out;
  }
  function rsCount(shown, total) {
    const c = $('#rcount'), bar = $('#rbar'); if (!c || !bar) return;
    const on = RS.scope !== 'all' || lfActive();
    bar.hidden = !shown;
    c.textContent = on && shown !== total ? shown + ' of ' + total + ' books' : shown + (shown === 1 ? ' book' : ' books');
  }
  const rsTitleKey = t => sxNorm(t).replace(/^(the|a|an) /, '');
  function rsSort(list) {
    if (RS.sort === 'az') return list.slice().sort((x, y) => rsTitleKey(x.title).localeCompare(rsTitleKey(y.title)));
    if (RS.sort === 'rated' && !rtCalm()) return list.slice().sort(rtCmp);
    if (RS.sort === 'short') return list.slice().sort((x, y) => (x.total || 1e9) - (y.total || 1e9));
    return list;
  }
  function rsPaint() {
    $$('#sfilt .fchip[data-scope]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.scope === RS.scope)));
    lfPaint();
    el.q.placeholder = SCOPE_HINT[RS.scope];
  }
  function showBooks(books) {
    RS.all = books;
    const shown = rsSort(rsFilter(books));
    rsCount(shown.length, books.length);
    el.resultList.textContent = '';
    if (!shown.length && books.length + (RS.scope === 'genre' ? 1 : 0) > 0) {
      el.resultList.append(stateNode('empty', 'Nothing matches these filters', lfActive() ? 'No books match every filter here. Try turning one off. Books without a reading level are hidden while a level is chosen.' : 'Try a different filter, or search everything.', 'Reset filters', () => { RS.scope = 'all'; LF.lvl.clear(); LF.ready = false; rsPaint(); showBooks(RS.all); }));
      el.results.classList.remove('loading'); el.results.hidden = false;
      return;
    }
    const cards = shown.map(b => bookCard(b, () => openDetail(b)));
    el.resultList.append(...cards); checkReady(cards);
    el.results.classList.remove('loading'); el.results.hidden = false;
  }
  function initSearchFilters() {
    const sb = $('#searchbar');
    if (sb && 'IntersectionObserver' in window) new IntersectionObserver(([e]) => sb.classList.toggle('stuck', e.intersectionRatio < 1), { threshold: [1], rootMargin: '-1px 0px 0px 0px' }).observe(sb);
    $$('#sfilt .fchip[data-scope]').forEach(b => b.addEventListener('click', () => {
      RS.scope = b.dataset.scope; rsPaint();
      if (el.q.value.trim()) { showBooks(RS.all); syncHomeRows(true); } else el.q.focus();
    }));
    $$('#sfilt .fchip[data-lvl]').forEach(b => b.addEventListener('click', () => lfToggle('lvl', +b.dataset.lvl, 'search')));
    const so = $('#rsort');
    if (so) so.addEventListener('change', () => { RS.sort = so.value; if (RS.all.length) showBooks(RS.all); if (so.value === 'rated') rtSumLoad().then(() => { if (RS.sort === 'rated' && RS.all.length) showBooks(RS.all); }); });
  }
  function cacheResults(key, books) {
    store.set(key, { t: Date.now(), books });
    const idx = store.get(QIDX, []).filter(k => k !== key);
    idx.unshift(key);
    while (idx.length > 25) { try { localStorage.removeItem(idx.pop()); } catch (e) { /* ignore */ } }
    store.set(QIDX, idx);
  }
  /* ---------- Search by meaning: semantic.json (built by wt_semantic.py) has a vector per book and a table of word vectors ---------- */
  const SEM = jsonLoader('semantic.json', 'semantic', d => d.d && d.ids && d.bv && d.words && d.wv && d.ww);
  let semPrep = null;
  function semB64(s) { const b = atob(s), a = new Int8Array(b.length); for (let i = 0; i < b.length; i++) a[i] = b.charCodeAt(i); return a; }
  /* null: the data is not available yet. []: nothing close. Otherwise the closest books. */
  async function semSearch(q) {
    await Promise.all([SEM.load(), catLoad()]);
    const d = SEM.data;
    if (!d || !CAT.books) return null;
    if (!semPrep || semPrep.src !== d) semPrep = { src: d, bv: semB64(d.bv), wv: semB64(d.wv), idx: new Map(d.words.map((w, i) => [w, i])), byId: new Map(CAT.books.map(b => [String(b.id), b])) };
    const D = d.d, M = semPrep, v = new Float32Array(D);
    let hit = 0;
    for (const w of (String(q).toLowerCase().match(/[a-z]+/g) || [])) {
      const i = [w, w.replace(/ies$/, 'y'), w.replace(/(es|s)$/, ''), w.replace(/(ing|ed|ly)$/, '')].map(c => M.idx.get(c)).find(x => x != null);
      if (i == null) continue;
      const wt = d.ww[i] / 10 / 127;
      for (let k = 0; k < D; k++) v[k] += wt * M.wv[i * D + k];
      hit++;
    }
    if (!hit) return [];
    const n = d.ids.length, sc = new Float32Array(n);
    for (let j = 0; j < n; j++) { let t = 0; const o = j * D; for (let k = 0; k < D; k++) t += v[k] * M.bv[o + k]; sc[j] = t; }
    const order = Array.from(sc.keys()).sort((a, b) => sc[b] - sc[a]), top = sc[order[0]], out = [];
    if (!(top > 0)) return [];
    for (const j of order) { if (out.length >= 24 || sc[j] < top * 0.6) break; const b = M.byId.get(String(d.ids[j])); if (b) out.push(b); }
    return out;
  }
  async function semShow(q) {
    setStatus('Looking for books that match the meaning\u2026');
    const list = await semSearch(q).catch(() => null);
    if (list === null) { setStatus('Meaning search data is not built yet.', 'error'); return; }
    if (!list.length) { setStatus('Nothing close in meaning to \u201c' + q + '\u201d. Try other words.'); return; }
    showBooks(list);
    setStatus(list.length + ' books close in meaning to \u201c' + q + '\u201d.', '', ['Back to results', () => doSearch(q)]);
  }
  const semAction = q => ['By meaning', () => semShow(q)];
  async function doSearch(q) {
    q = (q || '').trim();
    if (!q) return;
    clearGenre();
    clearTimeout(typeTimer); clearInterval(progTimer);
    if (searchCtl) searchCtl.abort();
    const ctl = searchCtl = new AbortController();
    const mine = ++searchSeq;
    const key = 'wt:q:' + q.toLowerCase();
    const hit = store.get(key, null);
    if (hit && Array.isArray(hit.books) && hit.books.length && Date.now() - hit.t < QTTL) {
      progress(false); showBooks(hit.books);
      setStatus(hit.books.length + ' recording' + (hit.books.length === 1 ? '' : 's') + ' found.', '', semAction(q));
      return;
    }
    // Keep the previous results on screen (dimmed) instead of blanking the page.
    if (!el.results.hidden && el.resultList.querySelector('.card:not(.sk)')) el.results.classList.add('loading'); else showSkeletons();
    const t0 = Date.now();
    let done = 0, total = 3, stage = 'Connecting to LibriVox…';
    setStatus(stage);
    const paint = () => {
      if (document.hidden && P.idleWork !== false) return;
      const sec = (Date.now() - t0) / 1000;
      const f = (done + (1 - Math.exp(-sec / 5)) * (total - done) * 0.9) / total;
      progress(true, Math.min(0.95, f), Math.floor(sec) + 's');
    };
    paint(); progTimer = setInterval(paint, 250);
    const stageTo = msg => { if (msg !== stage && mine === searchSeq) { stage = msg; setStatus(msg); } };
    try {
      const books = await searchBooks(q, {
        signal: ctl.signal,
        onStage: k => { if (k > 0) stageTo('LibriVox is slow to answer. Trying a faster route…'); },
        onUpdate: (list, n, tot) => {
          if (mine !== searchSeq) return;
          done = n; total = tot;
          if (list.length) { showBooks(list); if (n < tot) stageTo(list.length + ' found so far. Checking more…'); }
        }
      });
      if (mine !== searchSeq) return;
      clearInterval(progTimer);
      progress(true, 1, ''); setTimeout(() => { if (mine === searchSeq) progress(false); }, 250);
      if (!books.length) {
        const sem = await semSearch(q).catch(() => null);
        if (mine !== searchSeq) return;
        if (sem && sem.length) { showBooks(sem); syncHomeRows(true); setStatus('No exact match. These books are close in meaning to \u201c' + q + '\u201d.'); return; }
        setStatus('');
        el.resultList.textContent = '';
        const none = stateNode('empty', 'No results for \u201c' + q + '\u201d', 'Check the spelling, try one word of the title, or search the author\u2019s last name.', 'Clear search', () => { const cb = $('#btn-clear-q'); if (cb) cb.click(); });
        none.append(h('button', { type: 'button', class: 'state-btn alt', onclick: () => { const cb = $('#btn-clear-q'); if (cb) cb.click(); const g = $('#sec-genre'); if (g) setTimeout(() => g.scrollIntoView({ behavior: motionOk(), block: 'start' }), 60); } }, 'Browse genres'));
        none.append(h('div', { class: 'state-tip' }, 'Try ', ...IDEAS.slice(0, 3).flatMap((t, i) => [i ? ', ' : '', h('button', { type: 'button', class: 'linkbtn', onclick: () => { el.q.value = t; const cb = $('#btn-clear-q'); if (cb) cb.hidden = false; doSearch(t); } }, t)])));
        el.resultList.append(none); { const rb = $('#rbar'); if (rb) rb.hidden = true; }
        el.results.classList.remove('loading'); el.results.hidden = false;
        syncHomeRows(false); return;
      }
      if (!SX.local) cacheResults(key, books);
      showBooks(books);
      syncHomeRows(true);
      setStatus(SX.fixed ? 'Showing results for \u201c' + SX.fixed + '\u201d.' : books.length + ' recording' + (books.length === 1 ? '' : 's') + ' found.', '', semAction(q));
    } catch (e) {
      if (mine !== searchSeq) return;
      clearInterval(progTimer); progress(false);
      el.results.classList.remove('loading');
      if (hit && Array.isArray(hit.books) && hit.books.length) { showBooks(hit.books); setStatus('LibriVox did not answer, so these are earlier results for "' + q + '".', 'error', ['Try again', () => { store.set(key, null); doSearch(q); }]); return; }
      if (!el.resultList.querySelector('.card:not(.sk)')) {
        setStatus('');
        el.resultList.textContent = '';
        el.resultList.append(stateNode('error', "Couldn't reach LibriVox", 'Check your connection and try again.', 'Try again', () => doSearch(q)));
        el.results.hidden = false;
        return;
      }
      setStatus('Could not reach LibriVox. Check your connection and try again.', 'error', ['Try again', () => doSearch(q)]);
    }
  }
  /* ---------- "Because you listened to ...": recommendations from your own listening history ----------
     Runs on the phone against the local catalog. Books by the same author score highest; shared genres
     add to the score, and rarer genres count for more than common ones. Books you have already
     listened to never show up. */
  const BECAUSE_SEEDS = 2, BECAUSE_MIN_PCT = 0.05, BECAUSE_ROWS = 12;
  let genreIdf = null;
  const genreTokens = b => String(b._g || '').split(/[,;|\/]+/).map(x => x.trim()).filter(Boolean);
  function buildGenreIdf() {
    const freq = new Map(), all = CAT.books || [];
    all.forEach(b => genreTokens(b).forEach(g => freq.set(g, (freq.get(g) || 0) + 1)));
    genreIdf = { N: all.length || 1, freq };
  }
  function listenedList() {
    const m = new Map();
    [...(store.get('wt:listens', []) || []), ...P.recents].forEach(r => { const o = m.get(r.id); if (!o || (r.ts || 0) > (o.ts || 0)) m.set(r.id, r); });
    return [...m.values()].sort((a, b) => (b.ts || 0) - (a.ts || 0));
  }
  function recoFor(sb, skip, lim) {
    if (SIM.ready) {
      const ids = SIM.data.s[String(sb.id)];
      if (ids) {
        const byId = recoFor.byId && recoFor.n === CAT.books.length ? recoFor.byId : (recoFor.n = CAT.books.length, recoFor.byId = new Map(CAT.books.map(x => [x.id, x])));
        const okL = b => P.otherLangs ? b.lang === sb.lang : (!b.lang || /^english$/i.test(b.lang));
        const picks = ids.map(i => byId.get(String(i))).filter(b => b && !skip.has(b.id) && okL(b));
        if (picks.length >= 3) return picks;
      }
    }
    if (!genreIdf) buildGenreIdf();
    const okLang = b => P.otherLangs ? b.lang === sb.lang : (!b.lang || /^english$/i.test(b.lang));
    const sg = new Set(genreTokens(sb)), scored = [];
    for (const b of CAT.books) {
      if (b.id === sb.id || skip.has(b.id) || !okLang(b)) continue;
      let sc = 0;
      if (sb._a && b._a === sb._a) sc += 4; else if (sb._l && b._l && b._l === sb._l) sc += 3;
      let shared = 0;
      for (const g of genreTokens(b)) if (sg.has(g)) { shared++; sc += Math.log(genreIdf.N / (genreIdf.freq.get(g) || 1)) * 0.35; }
      if (sc <= 0 || (!shared && sc < 3)) continue;
      if (sb.total && b.total && Math.abs(b.total - sb.total) / sb.total < 0.4) sc += 0.2; // similar length
      scored.push([sc, b]);
    }
    scored.sort((x, y) => y[0] - x[0] || (+y[1].id) - (+x[1].id));
    return scored.slice(0, lim || BECAUSE_ROWS).map(x => x[1]);
  }
  /* "Because you listened to ...": one source for the Picked-for-you row (the 2 latest books with some progress). */
  async function becauseSources() {
    const hist = listenedList(); if (!hist.length) return [];
    await Promise.all([catLoad(), SIM.load().catch(() => {})]);
    if (!CAT.books || !CAT.books.length) return [];
    const byId = new Map(CAT.books.map(b => [b.id, b])), skip = new Set(hist.map(r => r.id)), out = [];
    for (const r of hist.filter(r => (+r.pct || 0) >= BECAUSE_MIN_PCT && byId.has(r.id)).slice(0, BECAUSE_SEEDS)) {
      const picks = recoFor(byId.get(r.id), skip).map(nxPub);
      if (picks.length < 3) continue;
      picks.forEach(x => skip.add(x.id));
      const short = r.title.length > 22 ? r.title.slice(0, 21).trim() + '\u2026' : r.title;
      out.push({ key: 'b:' + r.id, label: 'Like ' + short, line: 'Because you listened to ' + r.title, books: picks });
    }
    return out;
  }
  /* ---------- Mood rows on Home: picked by season and time of day (moods.json) ---------- */
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  function moodPlan(now) {
    const mo = now.getMonth(), hr = now.getHours(), plan = [];
    const season = { 9: ['spooky', 'Spooky for October', 'Shivers best heard after dark.'], 11: ['cozy', 'Cozy for December', 'Warm stories for long evenings.'], 0: ['cozy', 'Cozy winter listening', 'Something warm for cold days.'], 1: ['romantic', 'Romantic for February', 'Love stories, old and new.'], 5: ['adventurous', 'Summer adventures', 'Voyages and journeys for long days.'], 6: ['adventurous', 'Summer adventures', 'Voyages and journeys for long days.'], 7: ['adventurous', 'Summer adventures', 'Voyages and journeys for long days.'] }[mo];
    const dm = now.getDate(), seasonX = mo === 9 && dm >= 24 ? ['spooky', 'Halloween week', 'The scariest stories, just in time.']
      : mo === 8 ? ['thoughtful', 'Back-to-school reads', 'Reflective listening for the new season.']
      : mo === 10 ? ['cozy', 'Cozy autumn evenings', 'Warm stories as the days draw in.']
      : mo >= 2 && mo <= 4 ? ['funny', 'Spring in your step', 'Light, funny listens for brighter days.'] : null;
    if (seasonX) plan.push(seasonX); else if (season) plan.push(season);
    const part = hr >= 21 || hr < 5 ? ['cozy', 'Cozy tonight', 'Gentle company for the evening.'] : hr < 11 ? ['thoughtful', 'Thoughtful morning reads', 'Something to think about with your coffee.'] : hr < 17 ? ['adventurous', 'Adventure for the afternoon', 'Get lost in a good journey.'] : ['mysterious', 'A mystery for tonight', 'Puzzles and secrets for the evening.'];
    if (!plan.some(x => x[0] === part[0])) plan.push(part);
    return plan.slice(0, 2);
  }
  const moodHash = str => { let x = 2166136261; for (let i = 0; i < str.length; i++) { x ^= str.charCodeAt(i); x = Math.imul(x, 16777619); } return (x >>> 0) / 4294967296; };
  /* The rows are tied to the month and the part of the day. MOOD.sig remembers which set is on screen, so
     coming back to the app in the evening, or pulling to refresh, swaps in the new set without a reload. */
  const MOOD = { sig: '' };
  /* Part of the day for the Home card: 5:00 to 10:59 = morning (review), 20:00 to 4:59 = night (bedtime story). */
  function todPart(now) { const hr = (now || new Date()).getHours(); return hr >= 20 || hr < 5 ? 'night' : hr < 11 ? 'morning' : ''; }
  const TOD = { n: 0, seq: 0 };
  const moodSig = now => (now || new Date()).toDateString() + '|' + moodPlan(now || new Date()).map(x => x[1]).join(',') + '|' + todPart(now);
  function openMoodFilter(k) {
    FLT.mood = k;
    $$('#flt-mood button').forEach(x => x.setAttribute('aria-pressed', String(x.dataset.v === k)));
    fpanelSet(true); const m = $('#flt-mood'); if (m) m.scrollIntoView({ block: 'center', behavior: motionOk() });
    applyFilters();
  }
  function moodTick() {
    if (el.home && el.home.hidden) return;
    if (moodSig() !== MOOD.sig) loadPicks();
  }
  /* Mood and season sources (moods.json), as the same kind of entry as the "because" ones. */
  async function moodSources() {
    await Promise.all([catLoad(), MOODS.load().catch(() => {}), VER.load().catch(() => {})]);
    if (!CAT.books || !CAT.books.length) return [];
    const now = new Date(), day = now.getFullYear() + '-' + now.getMonth() + '-' + now.getDate();
    const seen = new Set(listenedList().map(r => r.id)), out = [];
    const okLang = b => P.otherLangs || !b.lang || /^english$/i.test(b.lang);
    for (const [k, title, sub] of moodPlan(now)) {
      const M = FLT_MOODS.find(x => x.k === k); if (!M) continue;
      const mi = MOODS.ready ? MOODS.data.moods.findIndex(m => m[0] === k) : -1;
      const fits = b => { const tags = MOODS.ready ? MOODS.data.b[String(b.id)] : null; return tags && mi >= 0 ? tags.includes(mi) : (M.g.some(w => (b._g || '').includes(w)) || M.t.test(b.title)); };
      const picks = CAT.books.filter(b => !seen.has(b.id) && okLang(b) && b.total > 0 && fits(b))
        .map(b => { const v = VER.ready && VER.map.get(String(b.id)); return [b, (v ? (v.k === 0 ? 1 : -1) : 0) + (b.ia ? 0.5 : 0) + moodHash(day + k + b.id)]; })
        .sort((x, y) => y[1] - x[1]).slice(0, 12).map(x => x[0]);
      if (picks.length < 4) continue;
      picks.forEach(b => seen.add(b.id));
      out.push({ key: 'm:' + k, label: title, line: sub, books: picks.map(nxPub), more: () => openMoodFilter(k) });
    }
    return out;
  }
  /* "Your genres": the genres you have heard most and saved (saved books count double), rarer genres weigh more.
     Books you have heard or saved never show up. */
  async function genreSource() {
    const hist = listenedList(), favs = getFavs();
    if (!hist.length && !favs.length) return null;
    await Promise.all([catLoad(), VER.load().catch(() => {})]);
    if (!CAT.books || !CAT.books.length) return null;
    if (!genreIdf) buildGenreIdf();
    const byId = new Map(CAT.books.map(b => [b.id, b])), tally = new Map();
    const add = (id, k) => { const b = byId.get(String(id)); if (b) genreTokens(b).forEach(g => tally.set(g, (tally.get(g) || 0) + k)); };
    hist.filter(r => (+r.pct || 0) >= BECAUSE_MIN_PCT).forEach(r => add(r.id, 1));
    favs.forEach(f => add(f.id, 2));
    const top = [...tally.entries()].map(([g, n]) => [g, n * Math.log(genreIdf.N / (genreIdf.freq.get(g) || 1))]).filter(x => x[1] > 0).sort((a, b) => b[1] - a[1]).slice(0, 3);
    if (!top.length) return null;
    const wt = new Map(top), seen = new Set([...hist.map(r => String(r.id)), ...favs.map(f => String(f.id))]), dupe = new Set();
    const now = new Date(), day = now.getFullYear() + '-' + now.getMonth() + '-' + now.getDate();
    const okLang = b => P.otherLangs || !b.lang || /^english$/i.test(b.lang);
    const picks = CAT.books.filter(b => !seen.has(String(b.id)) && okLang(b) && b.total > 0)
      .map(b => { let sc = 0; genreTokens(b).forEach(g => { sc += wt.get(g) || 0; }); if (sc <= 0) return null; const v = VER.ready && VER.map.get(String(b.id)); return [b, sc + (v ? (v.k === 0 ? 1 : -1) : 0) + moodHash(day + 'g' + b.id) * 0.8]; })
      .filter(Boolean).sort((x, y) => y[1] - x[1])
      .filter(x => { const k = x[0]._t + '|' + x[0]._a; if (dupe.has(k)) return false; dupe.add(k); return true; })
      .slice(0, 12).map(x => nxPub(x[0]));
    if (picks.length < 4) return null;
    const names = top.map(x => x[0].replace(/\b\w/g, c => c.toUpperCase()));
    return { key: 'g:mine', label: 'Your genres', line: 'More ' + names.slice(0, 2).join(' and ') + ', from what you have heard and saved', books: picks };
  }
  /* Trending (home.json) as a chip too, minus books you have already heard. */
  async function trendingSource() {
    await catLoad();
    if (!CAT.books || !CAT.books.length) return null;
    const d = await getDaily(); if (!d || !d.trending) return null;
    const map = new Map(CAT.books.map(b => [b.id, b])), seen = new Set(listenedList().map(r => String(r.id)));
    const okLang = b => P.otherLangs || !b.lang || /^english$/i.test(b.lang);
    const books = d.trending.map(i => map.get(String(i))).filter(b => b && !seen.has(String(b.id)) && okLang(b)).slice(0, 12).map(nxPub);
    return books.length >= 4 ? { key: 't:week', label: 'Trending', line: 'Most listened to this week', books } : null;
  }
  guideDoc('home', 'Morning review and bedtime story', "Between 5 and 11 in the morning Home offers your saved words that are due for review. From 8 in the evening it offers one short, gentle book for bedtime, and Show another swaps it.", '2026-10-08');
  /* ---------- Time-of-day card on Home ----------
     Morning: your saved words that are due, one tap into Review. Bedtime: one short, gentle book (a short story,
     fairy tale or fable under an hour) that you have not heard. The same book stays all evening; "Show another"
     swaps it. The card is hidden the rest of the day, and when there is nothing to offer. */
  async function loadTod() {
    const sec = $('#sec-tod'); if (!sec) return;
    const my = ++TOD.seq, part = todPart();
    try {
      if (part === 'morning') {
        const due = myWords().filter(srsDue).length;
        if (!due) { sec.hidden = true; sec.textContent = ''; return; }
        const mins = Math.max(1, Math.round(due / 3));
        sec.textContent = '';
        sec.append(h('button', { class: 'botd-hero tod', type: 'button', style: '--h:42', 'aria-label': 'Morning review: ' + due + (due === 1 ? ' word' : ' words') + ' ready', onclick: () => vocOpen('review') },
          h('span', { class: 'botd-cover tod-ic', 'aria-hidden': 'true' }, '\u2600\uFE0F'),
          h('span', { class: 'botd-body' },
            h('span', { class: 'botd-k' }, 'Morning review'),
            h('span', { class: 'botd-t' }, due + (due === 1 ? ' word is' : ' words are') + ' ready'),
            h('span', { class: 'botd-b' }, 'About ' + mins + ' min. Words come back just when you are about to forget them.'),
            h('span', { class: 'botd-go' }, 'Start review'))));
        sec.hidden = false; return;
      }
      if (part === 'night') {
        await catLoad(); await VER.load().catch(() => {});
        if (my !== TOD.seq) return;
        if (!CAT.books || !CAT.books.length) { sec.hidden = true; return; }
        const now = new Date(), day = now.getFullYear() + '-' + now.getMonth() + '-' + (now.getHours() < 5 ? now.getDate() - 1 : now.getDate());
        const seen = new Set(listenedList().map(r => String(r.id)));
        const okLang = b => P.otherLangs || !b.lang || /^english$/i.test(b.lang);
        const soft = /short stor|fairy|fable|folk|children|myth/i;
        const pool = CAT.books.filter(b => b.total >= 600 && b.total <= 3600 && !seen.has(String(b.id)) && okLang(b));
        const score = b => (soft.test(b._g || b.genres || '') ? 2 : 0) + (b.ia ? .5 : 0) + (VER.ready && (VER.map.get(String(b.id)) || {}).k === 0 ? 1 : 0) + moodHash(day + 'tod' + TOD.n + b.id);
        let best = null, bs = -1;
        pool.forEach(b => { const s = score(b); if (s > bs) { bs = s; best = b; } });
        if (!best) { sec.hidden = true; sec.textContent = ''; return; }
        const b = nxPub(best), hue = colHue(0, (parseInt(b.id, 10) || 0) + 7);
        sec.textContent = '';
        sec.append(h('div', { class: 'tod-wrap' },
          h('button', { class: 'botd-hero tod', type: 'button', style: '--h:' + hue, 'aria-label': 'Bedtime story: ' + b.title + (b.authors ? ', ' + b.authors : ''), onclick: () => openDetail(b) },
            h('span', { class: 'botd-cover', 'aria-hidden': 'true' }, coverNode(b)),
            h('span', { class: 'botd-body' },
              h('span', { class: 'botd-k' }, 'Bedtime story'),
              h('span', { class: 'botd-t' }, b.title),
              h('span', { class: 'botd-a' }, b.authors || ''),
              h('span', { class: 'botd-b' }, 'A short listen, ' + fmtLong(b.total) + '. Easy to drift off to.'),
              h('span', { class: 'botd-go' }, svgIcon('#i-play'), 'Listen'))),
          h('button', { class: 'tod-alt', type: 'button', onclick: () => { TOD.n++; loadTod(); } }, 'Show another')));
        sec.hidden = false; return;
      }
      sec.hidden = true; sec.textContent = '';
    } catch (e) { if (my === TOD.seq) sec.hidden = true; }
  }
  guideDoc('home', 'Picked for you', "One row of suggestions. Small chips switch the reason: your genres, a book you liked, the time of day, or what is trending.");
  /* ONE "Picked for you" row. Small chips switch the reason (time of day, a book you liked) instead of
     stacking a row for each. MOOD.sig makes it refresh when the part of the day or the season changes. */
  const PK = { sel: '' };
  async function loadPicks() {
    const sec = $('#sec-picks'); if (!sec) return;
    MOOD.sig = moodSig();
    loadTod();
    let src = [];
    try {
      const [m, bc, gs, tr, fo] = await Promise.all([moodSources(), becauseSources(), genreSource().catch(() => null), trendingSource().catch(() => null), folSource().catch(() => null)]);
      src = [gs, bc[0], m[0], tr, m[1], bc[1]].filter(Boolean);
      if (fo) { if (fo.first) src.unshift(fo); else src.push(fo); }   // followed authors with new books come first
    } catch (e) { /* offline: hide */ }
    HSK.done.picks = true;
    sec.textContent = '';
    if (!src.length) { sec.hidden = true; return; }
    const chips = h('div', { class: 'pk-chips', role: 'group', 'aria-label': 'Why these books' }), row = h('div', { class: 'hrow' }), line = h('p', { class: 'mood-sub' });
    const draw = x => {
      PK.sel = x.key;
      $$('button', chips).forEach(b => b.setAttribute('aria-pressed', String(b.dataset.k === x.key)));
      line.textContent = x.line; row.setAttribute('aria-label', x.line);
      fillRow(row, x.books, x.more || null, 12);
      newWeekPaint();   // the chip changed which books Picked for you shows: New this week repaints without them
      if (x.fresh) $$('.tile', row).forEach(t => { const c = t.querySelector('.tile-cover'); if (c && x.fresh.has(String(t._wtId))) c.append(h('span', { class: 'tile-new' }, 'New')); });
    };
    src.forEach(x => { const b = h('button', { class: 'fchip', type: 'button', 'aria-pressed': 'false', onclick: () => draw(x) }, x.label); b.dataset.k = x.key; chips.append(b); });
    sec.append(h('div', { class: 'home-section-head mood-head' }, h('div', {}, h('h2', {}, 'Picked for you'), line)), ...(src.length > 1 ? [chips] : []), row);
    draw(src.find(x => x.key === PK.sel) || src[0]);
    sec.hidden = false;
  }
  function renderRecents() {
    loadPicks();
    el.recentList.textContent = '';
    if (!P.recents.length) { el.recents.hidden = true; return; }
    el.recents.hidden = false;
    const want = Math.max(1, Math.min(5, parseInt(P.resumeCount, 10) || 3));
    /* Separate in-progress from finished; promote the first unfinished book to the hero slot. */
    const inProgress = P.recents.filter(r => Math.round((r.pct || 0) * 100) < 100);
    const finished   = P.recents.filter(r => Math.round((r.pct || 0) * 100) >= 100);
    const hero = inProgress[0] || P.recents[0]; // fall back to most-recent if all done
    el.recentList.append(resumeHero(hero));
    if (Math.round((hero.pct || 0) * 100) >= 100) el.recentList.append(finishCard(hero, { compact: true }));
    /* More books in progress: show up to (want - 1) additional unfinished books as mini cards. */
    const more = inProgress.filter(r => r !== hero).slice(0, want - 1);
    if (more.length) {
      el.recentList.append(h('div', { class: 'resume-more-k' }, 'Also in progress'));
      more.forEach(r => el.recentList.append(resumeMini(r)));
    }
    /* Recently finished: show as a compact row under the in-progress ones, at most 2. */
    const recentDone = finished.filter(r => r !== hero).slice(0, 2);
    if (recentDone.length && more.length) {
      el.recentList.append(h('div', { class: 'resume-more-k' }, 'Finished'));
      recentDone.forEach(r => el.recentList.append(resumeMini(r)));
    }
  }
  function resumeMini(r) {
    const pct = Math.max(0, Math.min(100, Math.round((r.pct || 0) * 100)));
    const done = pct >= 100;
    /* Time remaining: from the stored total or the catalog. */
    const total = r.total || (CAT.books && (CAT.books.find(b => String(b.id) === String(r.id)) || {}).total) || 0;
    const leftSec = total > 0 && !done ? Math.round(total * Math.max(0, 1 - (r.pct || 0)) / (P.speed || 1)) : 0;
    const leftTxt = leftSec >= 60 ? fmtLong(leftSec) + ' left' : '';
    const barLabel = done ? 'Finished' : pct < 1 ? 'Just started' : pct + '%' + (leftTxt ? ' · ' + leftTxt : '');
    const ariaLabel = (done ? 'Listen again: ' : 'Resume: ') + r.title + (r.authors ? ', ' + r.authors : '') + ', ' + (done ? 'finished' : pct < 1 ? 'just started' : pct + '% listened' + (leftTxt ? ', ' + leftTxt : ''));
    const play = (() => { const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('aria-hidden', 'true'); const pth = document.createElementNS('http://www.w3.org/2000/svg', 'path'); pth.setAttribute('d', done ? 'M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z' : 'M8 5v14l11-7z'); s.append(pth); return s; })();
    return h('button', { class: 'resume-mini', type: 'button', 'aria-label': ariaLabel, onclick: () => resumeRecent(r) },
      h('span', { class: 'rm-cover', 'aria-hidden': 'true' }, coverNode({ id: r.id, title: r.title, authors: r.authors, cover: r.cover, ia: r.ia })),
      h('span', { class: 'rm-body' }, h('span', { class: 'rm-t' }, r.title), h('span', { class: 'rm-a' }, r.authors || '')),
      h('span', { class: 'rm-go', 'aria-hidden': 'true' }, play),
      h('span', { class: 'rm-bar', 'aria-hidden': 'true' }, h('span', { class: 'rm-track' }, h('i', { style: 'width:' + pct + '%' })), barLabel));
  }
  guideDoc('home', 'Book details and authors', "Tap a book to see its details, then Listen or Read. Tap the author's name for all their books. Tap the heart to save a book.");
