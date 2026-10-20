  /* ------ "See all" button builder for section headers ------ */
  function seeAllBtn(cfg) {
    return h('button', { class: 'sec-more', type: 'button', onclick: () => openSeeAll(cfg) }, 'See all →');
  }

  /* ------ "See all" page: the full list for one home section, as a 3-column grid ------ */
  const HOME_LIMIT = 10;
  const SEE_FEATURED = { title: 'Featured', sub: 'Hand-picked classics', key: 'wt:home:featured', ttl: TTL_FEATURED,
    fetch: () => Promise.allSettled(FEATURED_IDS.map(id => lvGet({ id }, { light: true })))
      .then(rs => rs.filter(r => r.status === 'fulfilled' && r.value.length).map(r => r.value[0])) };
  const SEE_RECENT = { title: 'Recently added', sub: 'New in the last 90 days', key: 'wt:seeall:recent', ttl: TTL_RECENT,
    fetch: () => lvGet({ since: Math.floor((Date.now() - 90 * 24 * 3600e3) / 1000), limit: 60 }, { light: true }) };
  let seeSeq = 0;

  function openSeeAll(cfg) {
    const mine = ++seeSeq, grid = $('#seeall-grid'), err = $('#seeall-err');
    seeOpen = true;
    $('#seeall-title').textContent = cfg.title;
    $('#seeall-sub').textContent = cfg.sub || '';
    err.hidden = true;
    const cached = store.get(cfg.key, null);
    if (!cached || !cached.books || !cached.books.length) rowSkeletons(grid, 9);
    showView('home');
    swr(cfg.key, cfg.ttl, cfg.fetch,
      (books) => {
        if (mine !== seeSeq) return;
        grid.textContent = '';
        books.forEach(b => grid.append(tileNode(b, () => openDetail(b))));
        $('#seeall-sub').textContent = plural(books.length, 'recording') + (cfg.sub ? ' · ' + cfg.sub : '');
      },
      () => {
        if (mine !== seeSeq) return;
        grid.textContent = '';
        grid.append(stateNode('error', "Couldn't load this list", 'LibriVox did not answer.', 'Try again', () => openSeeAll(cfg)));
      });
  }
  function closeSeeAll() { seeOpen = false; seeSeq++; showView('home'); }

  /* ------ friendly empty / error states ------ */
  const STATE_ICONS = {
    error: 'M12 8v5M12 16.5v.01M10.3 4.2L2.9 17a2 2 0 0 0 1.7 3h14.8a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0z',
    offline: 'M3 9a14 14 0 0 1 18 0M6 12.5a9 9 0 0 1 12 0M9 16a4 4 0 0 1 6 0M12 19.5v.01M4 4l16 16',
    empty: 'M5 4.5h9a3 3 0 0 1 3 3V20H8a3 3 0 0 1-3-3V4.5zM17 8h2v12M8.5 9h5'
  };
  function stateNode(kind, title, text, actionLabel, onAction) {
    if (kind === 'error' && navigator.onLine === false) { kind = 'offline'; title = "You're offline"; text = 'Check your connection and try again.'; }
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', STATE_ICONS[kind] || STATE_ICONS.empty);
    svg.append(path);
    return h('div', { class: 'state ' + kind, role: kind === 'empty' ? null : 'alert' },
      h('span', { class: 'state-ic' }, svg),
      h('strong', {}, title),
      text ? h('p', {}, text) : null,
      actionLabel ? h('button', { class: 'state-btn', type: 'button', onclick: onAction }, actionLabel) : null);
  }

  /* ------ recent searches ------ */
  const POP = { list: [] };
  const RQ_KEY = 'wt:recent-q';
  const getRQ = () => { const r = store.get(RQ_KEY, []); return Array.isArray(r) ? r : []; };
  function rememberQuery(q) {
    q = (q || '').trim();
    if (q.length < 3) return;
    const list = [q, ...getRQ().filter(x => x.toLowerCase() !== q.toLowerCase())].slice(0, 8);
    store.set(RQ_KEY, list);
  }
  /* ------ live suggestions while typing: matching books with covers, matched letters highlighted ------ */
  function sugHL(text, q) {
    const toks = q.split(/\s+/).map(t => t.replace(/[^\p{L}\p{N}']/gu, '')).filter(Boolean).sort((x, y) => y.length - x.length);
    if (!toks.length) return [text];
    const re = new RegExp('(' + toks.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')', 'ig');
    return String(text).split(re).map((part, i) => i % 2 ? h('mark', { class: 'sug-m' }, part) : part);
  }
  function sugShow() {
    const box = $('#rq'), q = el.q.value.trim();
    if (!box) return;
    if (q.length < 2 || !SX.ready || !SX.byId) { box.hidden = true; return; }
    const r = sxSearch(q, 14);
    const okLang = b => P.otherLangs || !b.lang || /^english$/i.test(b.lang);
    const books = r ? r.ids.map(i => SX.byId.get(i)).filter(b => b && okLang(b)).slice(0, 5) : [];
    if (!books.length) { box.hidden = true; return; }
    box.classList.add('sug');
    box.textContent = '';
    const pick = fn => { rememberQuery(q); hideRQ(); el.q.blur(); fn(); };
    if (r.fixed && r.fixed !== q.toLowerCase()) box.append(h('button', { type: 'button', class: 'sug-fix', onclick: () => { el.q.value = r.fixed; pick(() => doSearch(r.fixed)); } }, 'Did you mean ', h('strong', {}, r.fixed), '?'));
    books.forEach(b => box.append(h('button', { type: 'button', class: 'sug-row', onclick: () => pick(() => openDetail(b)) },
      coverNode(b),
      h('span', { class: 'sug-txt' }, h('span', { class: 'sug-t' }, ...sugHL(b.title || '', q)), h('span', { class: 'sug-a' }, ...sugHL(b.authors || '', q))),
      h('span', { class: 'sug-go', 'aria-hidden': 'true' }))));
    box.append(h('button', { type: 'button', class: 'sug-all', onclick: () => pick(() => doSearch(q)) }, 'See all results for \u201c' + q + '\u201d'));
    box.hidden = false;
  }
  function hideRQ() { const r = $('#rq'); if (r) r.hidden = true; }
  function showRQ() {
    const box = $('#rq'), list = getRQ();
    if (!box) return;
    if (el.q.value.trim()) { sugShow(); return; }
    box.classList.remove('sug');
    box.textContent = '';
    const clockPath = 'M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z';
    const mk = d => { const sv = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); sv.setAttribute('viewBox', '0 0 24 24'); sv.setAttribute('aria-hidden', 'true'); const pt = document.createElementNS('http://www.w3.org/2000/svg', 'path'); pt.setAttribute('d', d); sv.append(pt); return sv; };
    const go = (q, open) => { el.q.value = q; const cb = $('#btn-clear-q'); if (cb) cb.hidden = false; hideRQ(); el.q.blur(); rememberQuery(q); if (open) open(); else doSearch(q); };
    if (list.length) {
      box.append(h('div', { class: 'rq-head' }, h('span', {}, 'Recent searches'),
        h('button', { type: 'button', class: 'rq-clear', onclick: () => { store.set(RQ_KEY, []); showRQ(); } }, 'Clear all')));
      box.append(h('div', { class: 'rq-chips' }, ...list.slice(0, 6).map(q => h('span', { class: 'rchip' },
        h('button', { type: 'button', class: 'rchip-go', onclick: () => go(q) }, mk(clockPath), h('span', {}, q)),
        h('button', { type: 'button', class: 'rchip-x', 'aria-label': 'Remove ' + q + ' from recent searches', onclick: () => { store.set(RQ_KEY, getRQ().filter(x => x !== q)); showRQ(); } }, mk('M6 6l12 12M18 6L6 18'))))));
    }
    const seen = new Set(list.map(x => x.toLowerCase()));
    const ideas = IDEAS.filter(t => !seen.has(t.toLowerCase())).slice(0, 4);
    if (ideas.length) {
      box.append(h('div', { class: 'rq-head' }, h('span', {}, 'Try searching')));
      box.append(h('div', { class: 'rq-ideas' }, ...ideas.map(t => h('button', { type: 'button', class: 'chip', onclick: () => go(t) }, t))));
    }
    const pop = POP.list.length >= 3 ? POP.list.slice(0, 5) : null;
    if (pop) {
      box.append(h('div', { class: 'rq-head' }, h('span', {}, 'Popular right now')));
      box.append(h('div', { class: 'rq-pop' }, ...pop.map((b, n) => h('button', { type: 'button', class: 'pop-row', onclick: () => { hideRQ(); el.q.blur(); openDetail(b); } },
        h('span', { class: 'pop-n' }, String(n + 1)), coverNode(b), h('span', { class: 'pop-txt' }, h('span', { class: 'pop-t' }, b.title), h('span', { class: 'pop-a' }, b.authors || ''))))));
    }
    box.hidden = false;
  }
  function initRecentSearches() {
    const box = $('#rq');
    box.addEventListener('pointerdown', e => e.preventDefault()); // keep focus so taps register
    el.q.addEventListener('focus', showRQ);
    el.q.addEventListener('input', () => { if (el.q.value.trim()) sugShow(); else showRQ(); });
    el.q.addEventListener('blur', () => {
      setTimeout(hideRQ, 120);
      if (el.q.value.trim().length >= 3 && !el.results.hidden && el.resultList.querySelector('.card:not(.sk)')) rememberQuery(el.q.value);
    });
    $('#search-form').addEventListener('submit', () => { rememberQuery(el.q.value); hideRQ(); });
  }

