  /* ---------- Search page (the Search tab, and the search icons on the other screens) ----------
     A page of its own: markup #sp in 10-body-views.html, styles 99d-search-page.css. #sp-body shows one of three looks:
       empty    Recent searches, Quick picks, Browse by genre
       typing   "Did you mean", matching books and authors while you type
       results  filter chips, Books / Authors switch, result count and sort
     It reads the local index (SX) and the catalog (CAT), so it adds no network calls. The old search field on Home is still there
     (classic header) and keeps working as before. spOpen (080) says whether this page is the one on screen. */
  const SP = { mode: 'empty', q: '', kind: 'text', all: null, err: false, fixed: '', sort: 'pop', seg: 'books', seq: 0, t: 0,
    f: { len: 0, ready: false, lvl: new Set() }, authIdx: null, authN: -1, popMap: null, popN: -1 };
  /* any: words looked for in a book's genres (CAT.books[]._g, lower case) */
  const SP_GENRES = [
    { label: 'Mystery', any: ['myster', 'detect'], c: '#3b3f73' },
    { label: 'Romance', any: ['romanc'], c: '#6b3a52' },
    { label: 'Sci-Fi', any: ['science fiction', 'sci-fi'], c: '#2f5a63' },
    { label: 'Classics', any: ['general fiction', 'literary'], c: '#5c4a2e' },
    { label: 'Adventure', any: ['adventure'], c: '#3f5a3a' },
    { label: 'Poetry', any: ['poetry', 'poem'], c: '#5a3d6e' }
  ];
  const SP_QUICK = [
    { label: 'Under 3 hours', f: { len: 3 } },
    { label: 'Read-along', f: { ready: true } },
    { label: 'Easy to follow', f: { lvl: [0] } }
  ];
  const SP_LENS = [1, 3, 5, 10], SP_LVLS = ['Easy', 'Medium', 'Hard'];
  const SP_SORTS = [['pop', 'Most popular'], ['az', 'A\u2013Z'], ['short', 'Shortest'], ['rated', 'Top rated']];

  const spInput = () => $('#sp-q');
  const spOk = b => P.otherLangs || !b.lang || /^english$/i.test(b.lang);
  const spNames = b => String(b.authors || '').split(',').map(x => x.trim()).filter(Boolean);
  const spKey = t => sxNorm(t).replace(/^(the|a|an) /, '');
  const spFCount = () => (SP.f.len ? 1 : 0) + (SP.f.ready ? 1 : 0) + SP.f.lvl.size;
  const spRA = b => { try { return lfReadAlong(b); } catch (e) { return false; } };
  /* 8 h 31 m, 5 h 02 m, 45 m */
  function spDur(s) {
    s = Math.round(+s || 0); if (s <= 0) return '';
    let hr = Math.floor(s / 3600), m = Math.round((s % 3600) / 60);
    if (m === 60) { hr++; m = 0; }
    return hr ? hr + ' h ' + String(m).padStart(2, '0') + ' m' : m + ' m';
  }
  function spPass(b) {
    if (SP.f.len && !(b.total > 0 && b.total <= SP.f.len * 3600)) return false;
    if (SP.f.lvl.size) { const v = LVL.map.get(String(b.id)); if (!v || !SP.f.lvl.has(v[0])) return false; }
    if (SP.f.ready && !spRA(b)) return false;
    return true;
  }
  /* how well known a book is (0 to 9, from the search index) */
  function spPopMap() {
    if (!SX.ready) return new Map();
    if (!SP.popMap || SP.popN !== SX.ids.length) { SP.popMap = new Map(SX.ids.map((id, i) => [id, SX.pop[i] || 0])); SP.popN = SX.ids.length; }
    return SP.popMap;
  }
  /* The books to show: filters applied, then the chosen order. A typed search keeps its match order unless another sort is picked. */
  function spVisible() {
    const list = (SP.all || []).filter(spPass), s = SP.sort;
    if (s === 'az') return list.sort((x, y) => spKey(x.title).localeCompare(spKey(y.title)));
    if (s === 'short') return list.sort((x, y) => (x.total || 1e9) - (y.total || 1e9));
    if (s === 'rated' && !rtCalm()) return list.sort(rtCmp);
    if (SP.kind === 'text') return list;
    const pm = spPopMap();
    return list.sort((x, y) => (pm.get(String(y.id)) || 0) - (pm.get(String(x.id)) || 0) || (+y.id) - (+x.id));
  }
  /* every author in the catalog with the number of audiobooks */
  function spAuthorIdx() {
    const n = CAT.books ? CAT.books.length : 0;
    if (SP.authIdx && SP.authN === n) return SP.authIdx;
    const m = new Map();
    (CAT.books || []).forEach(b => {
      if (!spOk(b)) return;
      spNames(b).forEach(name => {
        if (/^(unknown|various|anonymous)/i.test(name)) return;
        const k = sxNorm(name); if (!k) return;
        let r = m.get(k); if (!r) m.set(k, r = { name, k, w: k.split(' '), n: 0 });
        r.n++;
      });
    });
    SP.authIdx = m; SP.authN = n;
    return m;
  }
  /* authors whose name matches the words, then the authors of the given books */
  function spAuthorsFor(q, books, max) {
    const idx = spAuthorIdx(), out = [], seen = new Set();
    const add = (name, n) => { const k = sxNorm(name); if (!k || seen.has(k)) return; seen.add(k); const r = idx.get(k); out.push({ name, n: n || (r ? r.n : 1) }); };
    const qWords = sxNorm(q).split(' ').filter(t => t && !SX_STOP.has(t));
    if (qWords.join('').length >= 2) {
      const hit = [];
      idx.forEach(r => { if (qWords.every(t => r.w.some(w => w.startsWith(t)))) hit.push(r); });
      hit.sort((x, y) => y.n - x.n).forEach(r => add(r.name, r.n));
    }
    for (const b of books) { for (const name of spNames(b)) if (!/^(unknown|various|anonymous)/i.test(name)) add(name); if (out.length >= max) break; }
    return out.slice(0, max);
  }
  function spAuthorList(vis) {
    if (SP.q && SP.kind === 'text') return spAuthorsFor(SP.fixed || SP.q, vis.slice(0, 40), 12);
    const cnt = new Map(), idx = spAuthorIdx();
    vis.slice(0, 200).forEach(b => spNames(b).forEach(name => cnt.set(name, (cnt.get(name) || 0) + 1)));
    return [...cnt].sort((x, y) => y[1] - x[1]).slice(0, 12).map(([name]) => { const r = idx.get(sxNorm(name)); return { name, n: r ? r.n : 1 }; });
  }

  /* ------ rows ------ */
  function spOpenBook(b) { rememberQuery(SP.q || spInput().value); spInput().blur(); openDetail(b); }
  function spBookRow(b) {
    const meta = [spNames(b).join(', '), spDur(b.total), spRA(b) ? 'Read-along' : ''].filter(Boolean).join(' \u00b7 ');
    return h('button', { class: 'sp-row', type: 'button', onclick: () => spOpenBook(b) }, coverBox(b, 'sp-cover'),
      h('span', { class: 'sp-txt' }, h('span', { class: 'sp-t' }, b.title), h('span', { class: 'sp-m' }, meta)));
  }
  function spAuthorRow(a) {
    return h('button', { class: 'sp-row', type: 'button', onclick: () => { rememberQuery(SP.q || spInput().value); spInput().blur(); openAuthor({ name: a.name }); } },
      h('span', { class: 'sp-av', style: '--h:' + (covHash(a.name) % 360), 'aria-hidden': 'true' }, (a.name.trim()[0] || '?').toUpperCase()),
      h('span', { class: 'sp-txt' }, h('span', { class: 'sp-t' }, a.name), h('span', { class: 'sp-m' }, plural(a.n, 'audiobook'))));
  }
  const spHead = text => h('h2', { class: 'sp-h' }, text);

  /* ------ the three looks ------ */
  function spEmptyDraw(body) {
    const rq = getRQ().slice(0, 8);
    if (rq.length) {
      body.append(h('div', { class: 'sp-head' }, spHead('Recent'), h('button', { type: 'button', class: 'sp-link', onclick: () => { store.set(RQ_KEY, []); spPaint(); } }, 'Clear all')));
      body.append(h('div', { class: 'sp-chips' }, ...rq.map(t => h('span', { class: 'sp-chip' },
        h('button', { type: 'button', class: 'sp-chip-go', onclick: () => spGo(t) }, t),
        h('button', { type: 'button', class: 'sp-chip-x', 'aria-label': 'Remove ' + t + ' from recent searches', onclick: () => { store.set(RQ_KEY, getRQ().filter(x => x !== t)); spPaint(); } }, svgIcon('#i-x'))))));
    }
    body.append(spHead('Quick picks'));
    body.append(h('div', { class: 'sp-chips' }, ...SP_QUICK.map(x => h('button', { type: 'button', class: 'sp-chip sp-pill', onclick: () => spRun('', { f: x.f }) }, x.label))));
    body.append(spHead('Browse by genre'));
    body.append(h('div', { class: 'sp-genres' }, ...SP_GENRES.map(g => h('button', { type: 'button', class: 'sp-g', style: '--c:' + g.c, onclick: () => spRun(g.label, { genre: g }) }, g.label))));
  }
  function spSeeAll(q) { return h('button', { type: 'button', class: 'sp-all', onclick: () => spRun(q) }, 'See all results for \u201c' + q + '\u201d'); }
  function spTypeDraw(body) {
    const q = spInput().value.trim();
    if (!q) return;
    if (!SX.ready || !SX.byId) {
      SX.load().then(() => { if (SP.mode === 'typing' && spInput().value.trim() === q) spPaint(); }).catch(() => {});
      body.append(spSeeAll(q));
      return;
    }
    const r = sxSearch(q, 24) || { ids: [], fixed: null };
    const books = r.ids.map(i => SX.byId.get(i)).filter(b => b && spOk(b));
    const fixed = r.fixed && r.fixed !== sxNorm(q) ? r.fixed : '';
    if (fixed) body.append(h('button', { type: 'button', class: 'sp-fix', onclick: () => spGo(fixed) }, 'Did you mean ', h('strong', {}, fixed), '?'));
    const bs = books.slice(0, 4), as = spAuthorsFor(fixed || q, books.slice(0, 8), 3);
    if (bs.length) body.append(spHead('Books'), h('div', { class: 'sp-list' }, ...bs.map(spBookRow)));
    if (as.length) body.append(spHead('Authors'), h('div', { class: 'sp-list' }, ...as.map(spAuthorRow)));
    body.append(spSeeAll(q));
  }
  function spChipsRow() {
    const n = spFCount(), row = h('div', { class: 'sp-fchips' });
    row.append(h('button', { type: 'button', id: 'sp-fbtn', class: 'sp-fbtn' + (n ? ' on' : ''), 'aria-haspopup': 'dialog', onclick: spSheetOpen }, 'Filters', n ? h('span', { class: 'sp-fn' }, String(n)) : null));
    const chip = (label, off) => row.append(h('button', { type: 'button', class: 'sp-fchip', 'aria-label': 'Remove filter ' + label, onclick: () => spFilterSet(off) }, label, svgIcon('#i-x')));
    if (SP.f.len) chip('Under ' + SP.f.len + ' h', () => { SP.f.len = 0; });
    SP.f.lvl.forEach(i => chip(SP_LVLS[i], () => { SP.f.lvl.delete(i); }));
    if (SP.f.ready) chip('Read-along', () => { SP.f.ready = false; });
    return row;
  }
  function spSeg(nb, na) {
    return h('div', { class: 'sp-seg', role: 'group', 'aria-label': 'Result type' }, ...[['books', 'Books', nb], ['authors', 'Authors', na]].map(([k, l, n]) =>
      h('button', { type: 'button', 'aria-pressed': String(SP.seg === k), onclick: () => { SP.seg = k; spPaint(); } }, l + ' ', h('span', { class: 'sp-n' }, String(n)))));
  }
  function spBar(n) {
    const sorts = SP_SORTS.filter(s => s[0] !== 'rated' || !rtCalm()).map(s => s[0] === 'pop' && SP.kind === 'text' ? ['pop', 'Best match'] : s);
    const cur = (sorts.find(s => s[0] === SP.sort) || sorts[0])[1];
    const sel = h('select', { id: 'sp-sort', 'aria-label': 'Sort results', onchange: e => {
      SP.sort = e.target.value; spPaint();
      if (SP.sort === 'rated') rtSumLoad().then(() => { if (SP.mode === 'results' && SP.sort === 'rated') spPaint(); }).catch(() => {});
    } }, ...sorts.map(([v, l]) => h('option', { value: v, selected: v === SP.sort }, l)));
    return h('div', { class: 'sp-bar' }, h('span', { class: 'sp-count', role: 'status' }, plural(n, 'result')), h('label', { class: 'sp-sort' }, 'Sort: ', h('b', {}, cur), sel));
  }
  function spResultsDraw(body) {
    if (SP.all === null) { for (let i = 0; i < 6; i++) body.append(h('div', { class: 'sp-sk', 'aria-hidden': 'true' })); return; }
    const vis = spVisible(), auth = spAuthorList(vis);
    body.append(spChipsRow(), spSeg(vis.length, auth.length));
    if (SP.err) { body.append(stateNode('error', "Couldn't reach LibriVox", 'Check your connection and try again.', 'Try again', () => spRun(SP.q, { keep: true }))); return; }
    if (SP.seg === 'authors') {
      body.append(h('div', { class: 'sp-bar' }, h('span', { class: 'sp-count', role: 'status' }, plural(auth.length, 'author'))));
      if (!auth.length) { body.append(h('p', { class: 'sp-note' }, 'No authors for these results.')); return; }
      body.append(h('div', { class: 'sp-list' }, ...auth.map(spAuthorRow)));
      return;
    }
    if (!vis.length) {
      if (SP.all.length && spFCount()) body.append(stateNode('empty', 'Your filters are hiding these results', 'Try turning one off. Books without a reading level are left out while a level is chosen.', 'Clear filters', () => spFilterSet(() => { SP.f = { len: 0, ready: false, lvl: new Set() }; })));
      else body.append(stateNode('empty', SP.q ? 'No results for \u201c' + SP.q + '\u201d' : 'No books found', 'Check the spelling, try one word of the title, or search the author\u2019s last name.', 'Back to search', spReset));
      return;
    }
    body.append(spBar(vis.length));
    const host = h('div', { class: 'sp-list', id: 'sp-list' });
    body.append(host);
    vlist(host, vis, spBookRow, { min: 40, est: 92 });
  }
  function spPaint() {
    const root = $('#sp'), body = $('#sp-body'); if (!root || !body) return;
    root.dataset.mode = SP.mode;
    if (body._vl && body._vl.destroy) body._vl.destroy();
    const old = $('#sp-list', body); if (old && old._vl) old._vl.destroy();
    body.textContent = '';
    if (SP.mode === 'results') spResultsDraw(body); else if (SP.mode === 'typing') spTypeDraw(body); else spEmptyDraw(body);
  }
  function spClearBtn() { const b = $('#sp-x'), i = spInput(); if (b && i) b.hidden = !i.value; }

  /* ------ searching ------ */
  async function spFetch(q, o) {
    await catLoad();
    const eng = (CAT.books || []).filter(spOk);
    if (o.genre) { SP.kind = 'genre'; return eng.filter(b => o.genre.any.some(x => b._g.includes(x))); }
    if (!q) { SP.kind = 'browse'; return eng; }
    SP.kind = 'text';
    if (!SX.ready) await Promise.race([SX.load(), new Promise(r => setTimeout(r, 2500))]);
    if (SX.ready && SX.byId) {
      const r = sxSearch(q, 300) || { ids: [], fixed: null };
      let list = r.ids.map(i => SX.byId.get(i)).filter(b => b && spOk(b));
      SP.fixed = r.fixed && r.fixed !== sxNorm(q) ? r.fixed : '';
      /* a genre word ("mystery") also brings the books of that genre, most popular first */
      const gw = sxNorm(q).split(' ').filter(Boolean);
      if (gw.length && gw.length <= 2) {
        const gh = eng.filter(b => gw.every(w => b._g.includes(w)));
        if (gh.length >= 10) { const seen = new Set(list.map(b => b.id)); list = list.concat(gh.filter(b => !seen.has(b.id))); SP.kind = 'genre'; }
      }
      return list;
    }
    return await searchBooks(q);   // no local index yet: ask LibriVox
  }
  async function spRun(q, o = {}) {
    q = (q || '').trim();
    const mine = ++SP.seq; clearTimeout(SP.t);
    if (o.f) SP.f = { len: o.f.len || 0, ready: !!o.f.ready, lvl: new Set(o.f.lvl || []) };
    SP.q = q; SP.seg = 'books'; SP.fixed = ''; SP.err = false; SP.all = null; SP.mode = 'results';
    const i = spInput(); if (i) { i.value = q; i.blur(); }
    spClearBtn(); spPaint(); window.scrollTo(0, 0); histSoon();
    let list = [];
    try { list = await spFetch(q, o); } catch (e) { if (mine === SP.seq) { SP.err = true; SP.all = []; spPaint(); } return; }
    try { if (SP.f.lvl.size) await LVL.load(); if (SP.f.ready) await VER.load(); } catch (e) { /* use what loaded */ }
    if (mine !== SP.seq) return;
    SP.all = list;
    if (q) rememberQuery(q);
    spPaint();
  }
  const spGo = t => { const i = spInput(); if (i) i.value = t; spRun(t); };
  /* change a filter, show the new list at once, and again when the level or read-along data has arrived */
  async function spFilterSet(fn) {
    fn();
    if (SP.mode === 'results' && !SP.q && !spFCount() && SP.kind !== 'genre') { spReset(); return; }
    if (SP.mode === 'results') spPaint();
    spSheetDraw();
    const need = (SP.f.lvl.size && !LVL.ready) || (SP.f.ready && !VER.ready);
    if (!need) return;
    try { if (SP.f.lvl.size) await LVL.load(); if (SP.f.ready) await VER.load(); } catch (e) { /* use what loaded */ }
    if (SP.mode === 'results') spPaint();
    spSheetDraw();
  }

  /* ------ filter sheet ------ */
  function spSheetDraw() {
    const fs = $('#sp-fs'); if (!fs || fs.hidden) return;
    const opt = (label, on, fn) => h('button', { type: 'button', class: 'sp-opt', 'aria-pressed': String(!!on), onclick: fn }, label);
    const len = $('#sp-fs-len'), lv = $('#sp-fs-lvl'), ra = $('#sp-fs-ra');
    len.textContent = ''; lv.textContent = ''; ra.textContent = '';
    len.append(opt('Any', !SP.f.len, () => spFilterSet(() => { SP.f.len = 0; })),
      ...SP_LENS.map(n => opt('Under ' + n + ' h', SP.f.len === n, () => spFilterSet(() => { SP.f.len = SP.f.len === n ? 0 : n; }))));
    lv.append(...SP_LVLS.map((l, i) => opt(l, SP.f.lvl.has(i), () => spFilterSet(() => { if (SP.f.lvl.has(i)) SP.f.lvl.delete(i); else SP.f.lvl.add(i); }))));
    ra.append(opt('Read-along ready', SP.f.ready, () => spFilterSet(() => { SP.f.ready = !SP.f.ready; })));
    const n = SP.all ? spVisible().length : 0;
    $('#sp-fs-done').textContent = n ? 'Show ' + plural(n, 'book') : 'Done';
    $('#sp-fs-reset').hidden = !spFCount();
  }
  function spSheetOpen() {
    const fs = $('#sp-fs'); if (!fs) return;
    fs.hidden = false; spSheetDraw();
    const first = $('.sp-opt', fs); if (first) first.focus();
  }
  function spSheetClose() {
    const fs = $('#sp-fs'); if (!fs || fs.hidden) return;
    fs.hidden = true;
    const b = $('#sp-fbtn'); if (b) b.focus();
  }

  /* ------ opening, leaving, Back ------ */
  function spReset() {
    SP.seq++; clearTimeout(SP.t);
    SP.mode = 'empty'; SP.q = ''; SP.all = null; SP.fixed = ''; SP.seg = 'books'; SP.sort = 'pop'; SP.err = false;
    SP.f = { len: 0, ready: false, lvl: new Set() };
    const i = spInput(); if (i) i.value = '';
    spClearBtn(); spPaint(); histSoon();
  }
  /* Search tab, search icons. Starts from the empty look; the keyboard opens inside the tap on phones. */
  function spShow(q) {
    if (!el.player.hidden) return;
    pendingBack = null;
    curTab = 'library'; seeOpen = false; DET.book = null; DET.author = null; DET.rv = false; DET.stack = [];
    spOpen = true; srchTab = true;
    spReset();
    tabHlPaint(); showView('home');
    if (q) spGo(q); else { const i = spInput(); if (i) i.focus(); }
    try { VER.load(); } catch (e) { /* read-along marks stay off until it loads */ }
    uiSave();
  }
  const spLeave = () => showTab('library');
  /* Back: results go back to the empty look, anything else leaves the page */
  function spBack() { if (SP.mode === 'results') { spReset(); } else spLeave(); }

  function spInit() {
    const f = $('#sp-form'), i = spInput(); if (!f || !i) return;
    f.addEventListener('submit', e => { e.preventDefault(); const q = i.value.trim(); if (q) spRun(q); });
    i.addEventListener('input', () => {
      spClearBtn(); clearTimeout(SP.t);
      if (!i.value.trim()) { if (SP.mode !== 'empty') spReset(); return; }
      SP.t = setTimeout(() => { SP.seq++; SP.mode = 'typing'; spPaint(); histSoon(); }, 60);   // editing the words of a result list goes back to suggestions
    });
    $('#sp-x').addEventListener('click', () => { spReset(); i.focus(); });
    $('#sp-cancel').addEventListener('click', spLeave);
    $('#sp-fs-scrim').addEventListener('click', spSheetClose);
    $('#sp-fs-done').addEventListener('click', spSheetClose);
    $('#sp-fs-reset').addEventListener('click', () => spFilterSet(() => { SP.f = { len: 0, ready: false, lvl: new Set() }; }));
    document.addEventListener('keydown', e => {
      if (e.key !== 'Escape' || !spOpen) return;
      const fs = $('#sp-fs');
      if (fs && !fs.hidden) { e.preventDefault(); spSheetClose(); return; }
      if (e.target === i) { e.preventDefault(); if (i.value) { spReset(); } else spLeave(); }
    });
    spPaint();
  }
