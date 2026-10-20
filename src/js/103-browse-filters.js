  /* ---------- browse filters: length, mood, language, narrator ----------
     Everything runs on the local catalog. Mood is a best guess from each book's genres and title words
     (the catalog has no mood field). The catalog has no narrator field either, so the narrator list is
     made of the narrators of books you have opened. An active genre chip narrows the filtered list too. */
  const FLT_LEN = [['short', 'Under 2 h', 0, 2 * 3600], ['medium', '2 to 6 h', 2 * 3600, 6 * 3600], ['long', '6 to 12 h', 6 * 3600, 12 * 3600], ['epic', 'Over 12 h', 12 * 3600, 1e9]];
  const FLT_MOODS = [
    { k: 'cozy', label: 'Cozy', g: ['children', 'humor', 'romance', 'domestic', 'nature', 'family', 'essay'], t: /\b(tea|garden|home|cottage|village|christmas|family|little|fairy|house|kitchen|winter|spring|farm)\b/i },
    { k: 'spooky', label: 'Spooky', g: ['horror', 'gothic', 'ghost', 'supernatural'], t: /\b(ghosts?|haunt\w*|vampires?|dracula|frankenstein|witch\w*|demons?|terror|monsters?|grave|dead|death|dark|curse\w*|shadows?|horror|weird|macabre)\b/i },
    { k: 'adventurous', label: 'Adventurous', g: ['adventure', 'western', 'sea', 'pirate', 'war', 'exploration', 'travel'], t: /\b(island|treasure|voyage|journey|adventures?|quest|expedition|pirates?|explorers?|captain|ship|jungle)\b/i },
    { k: 'romantic', label: 'Romantic', g: ['romance', 'love'], t: /\b(love|heart|bride|marriage|lover|romance|courtship|wedding)\b/i },
    { k: 'mysterious', label: 'Mysterious', g: ['mystery', 'detective', 'crime', 'thriller'], t: /\b(murder|detective|mystery|case|crime|secret|clue|thief|poison|holmes)\b/i },
    { k: 'funny', label: 'Funny', g: ['humor', 'satire', 'comedy', 'comic'], t: /\b(funny|humou?r\w*|jest\w*|comedy|laugh\w*|nonsense|wit)\b/i },
    { k: 'thoughtful', label: 'Thoughtful', g: ['philosoph', 'essay', 'religion', 'psycholog', 'ethic', 'self-help'], t: /\b(thoughts|meditations?|wisdom|philosophy|reflections|essays?|mind|soul)\b/i }
  ];
  const FLT_LVL = [['easy', 'Easy \u00b7 A2\u2013B1', 0], ['medium', 'Medium \u00b7 B2', 1], ['hard', 'Hard \u00b7 C1\u2013C2', 2]];
  /* Level and read-along filters are shared by the search chips and the Library filters, and combine:
     any chosen level (Easy, Medium and Hard can be mixed) AND read-along ready, when it is on. */
  const LF = { lvl: new Set(), ready: false };
  function lfReadAlong(b) {
    const id = String(b.id), v = VER.ready && VER.map.get(id);
    if (v && v.tm) return true;
    if (store.get('wt:rdy:' + id, null) === 1) return true;
    const l = store.get('wt:sync:' + id, null); return !!(l && l.done > 0);
  }
  function lfMatch(b) {
    if (LF.lvl.size) { const v = LVL.map.get(String(b.id)); if (!v || !LF.lvl.has(v[0])) return false; }
    return !LF.ready || lfReadAlong(b);
  }
  const lfActive = () => LF.lvl.size > 0 || LF.ready;
  function lfPaint() {
    $$('#sfilt .fchip[data-lvl]').forEach(b => b.setAttribute('aria-pressed', String(LF.lvl.has(+b.dataset.lvl))));
    $$('#flt-lvl button').forEach(b => b.setAttribute('aria-pressed', String(LF.lvl.has(+b.dataset.v))));
    { const r = $('#flt-ready'); if (r) r.setAttribute('aria-checked', String(LF.ready)); }
  }
  async function lfToggle(kind, v, from) {
    if (kind === 'lvl') { if (LF.lvl.has(v)) LF.lvl.delete(v); else LF.lvl.add(v); } else LF.ready = !LF.ready;
    lfPaint();
    try { if (LF.lvl.size && !LVL.ready) await LVL.load(); if (LF.ready && !VER.ready) await VER.load(); } catch (e) { /* use what loaded */ }
    if (from === 'search') { if (el.q.value.trim() && !el.results.hidden) showBooks(RS.all); } else applyFilters();
  }
  const FLT = { len: '', mood: '', lang: '', nar: '', rate: '', sort: '', shown: 0 };
  /* Sort by (Newest is the default, so '' means Newest) and Minimum rating. Both need the ratings summary (135-ratings.js),
     which only has books with at least 5 ratings, so a rating filter or Top rated leaves unrated books out. Calm mode
     hides the rating controls and ignores them. */
  const FLT_SORTS = [['new', 'Newest'], ['rated', 'Top rated'], ['short', 'Shortest']];
  const FLT_RATES = [['', 'Any'], ['3', '3\u2605 +'], ['4', '4\u2605 +'], ['4.5', '4.5\u2605 +']];
  const fltRate = () => rtCalm() ? '' : FLT.rate, fltSort = () => FLT.sort === 'rated' && rtCalm() ? '' : FLT.sort;
  function fltSegPaint() {
    [['#flt-sort', 'sort', 'new'], ['#flt-rate', 'rate', '']].forEach(([q, k, d]) => $$(q + ' button').forEach(x => x.setAttribute('aria-pressed', String((FLT[k] || d) === x.dataset.v))));
  }
  function fltSeg(host, items, key, dflt) {
    host.textContent = '';
    items.forEach(([v, label]) => { const b = h('button', { type: 'button', 'aria-pressed': 'false', onclick: () => { FLT[key] = v === dflt ? '' : v; fltSegPaint(); applyFilters(); } }, label); b.dataset.v = v; host.append(b); });
    fltSegPaint();
  }
  const FLT_PAGE = 30;
  function fltNarrators() {
    const m = new Map();
    try { Object.keys(localStorage).forEach(k => { if (k.indexOf('wt:rdr:') === 0) { const n = store.get(k, ''); if (n && typeof n === 'string') { if (!m.has(n)) m.set(n, new Set()); m.get(n).add(k.slice(7)); } } }); } catch (e) { /* storage unavailable */ }
    return m;
  }
  function fltMatch(b, nar, genreWords) {
    if (!lfMatch(b)) return false;
    if (FLT.len) { const L = FLT_LEN.find(x => x[0] === FLT.len); if (!(b.total > 0) || b.total < L[2] || b.total >= L[3]) return false; }
    if (FLT.mood) {
      const M = FLT_MOODS.find(x => x.k === FLT.mood), tags = MOODS.ready ? MOODS.data.b[String(b.id)] : null;
      if (tags) { const mi = MOODS.data.moods.findIndex(m => m[0] === FLT.mood); if (!tags.includes(mi)) return false; }
      else if (!(M.g.some(w => b._g.includes(w)) || M.t.test(b.title))) return false; // book not tagged yet: keyword guess
    }
    if (FLT.lang) { if ((b.lang || 'English').toLowerCase() !== FLT.lang.toLowerCase()) return false; }
    else if (!P.otherLangs && b.lang && !/^english$/i.test(b.lang)) return false;
    if (nar && !nar.has(b.id)) return false;
    const rate = fltRate();
    if (rate || fltSort() === 'rated') { const i = rtInfo(b.id); if (!i || (rate && i.avg < +rate)) return false; }
    if (genreWords && !genreWords.every(w => b._g.includes(w))) return false;
    return true;
  }
  function fltActiveCount() { return (FLT.len ? 1 : 0) + (LF.lvl.size ? 1 : 0) + (LF.ready ? 1 : 0) + (FLT.mood ? 1 : 0) + (FLT.lang ? 1 : 0) + (FLT.nar ? 1 : 0) + (fltRate() ? 1 : 0) + (fltSort() ? 1 : 0); }
  async function applyFilters(more) {
    const n = fltActiveCount(), res = $('#filter-results'), g = genreEls();
    { const dn = $('#fp-done'); if (dn && !n) dn.textContent = 'Done'; }
    if (!n) { res.hidden = true; $('#filter-list').textContent = ''; if (g.wrap && activeGenre) g.wrap.hidden = false; return; }
    if (g.wrap) g.wrap.hidden = true; // the filtered list stands in for the genre list while filters are on
    res.hidden = false;
    await catLoad();
    const list = $('#filter-list'), count = $('#filter-count'), moreBtn = $('#filter-more');
    if (!CAT.books || !CAT.books.length) { list.textContent = ''; count.textContent = 'Filters need the book catalog, which has not loaded yet. Check your connection and try again.'; moreBtn.hidden = true; return; }
    if (LF.ready) { try { await VER.load(); } catch (e) { /* use what loaded */ } }
    if (LF.lvl.size) {
      await LVL.load();
      if (!LVL.ready) { list.textContent = ''; count.textContent = 'Reading levels have not loaded yet. Check your connection and try again.'; moreBtn.hidden = true; return; }
    }
    if (FLT.mood) await MOODS.load(); // if it cannot load, the keyword guess is used
    const nar = FLT.nar ? (fltNarrators().get(FLT.nar) || new Set()) : null;
    const gdef = activeGenre ? GENRES.find(x => x.lv === activeGenre) : null;
    const gw = gdef ? String(gdef.lv).replace(/\+/g, ' ').toLowerCase().split(/\s+/) : null;
    if (fltRate() || fltSort() === 'rated') {
      await rtSumLoad();
      if (!RTSUM.ready) { list.textContent = ''; count.textContent = 'Ratings have not loaded yet. Check your connection and try again.'; moreBtn.hidden = true; return; }
    }
    const so = fltSort(), byNew = (a, b) => (+b.id) - (+a.id);
    const cmp = so === 'rated' ? (a, b) => rtCmp(a, b) || byNew(a, b) : so === 'short' ? (a, b) => (a.total || 1e12) - (b.total || 1e12) || byNew(a, b) : byNew;
    const all = CAT.books.filter(b => fltMatch(b, nar, gw)).sort(cmp);
    FLT.matches = all;
    FLT.shown = more ? Math.min(all.length, FLT.shown + FLT_PAGE) : Math.min(all.length, FLT_PAGE);
    count.textContent = all.length ? plural(all.length, 'audiobook') + (gdef ? ' in ' + gdef.label : '') : 'No audiobooks match these filters.';
    { const dn = $('#fp-done'); if (dn) dn.textContent = all.length ? 'Show ' + plural(all.length, 'book') : 'Done'; }
    if (!more) list.textContent = '';
    const from = more ? list.children.length : 0;
    const cards = all.slice(from, FLT.shown).map(({ _t, _a, _l, _g, ...b }) => bookCard(b, () => openDetail(b)));
    list.append(...cards);
    checkReady(cards);
    moreBtn.hidden = FLT.shown >= all.length;
  }
  function fltChips(host, items, key) {
    host.textContent = '';
    items.forEach(([v, label]) => {
      const b = h('button', { type: 'button', 'aria-pressed': 'false', onclick: () => { FLT[key] = FLT[key] === v ? '' : v; $$('button', host).forEach(x => x.setAttribute('aria-pressed', String(x.dataset.v === FLT[key]))); applyFilters(); } }, label);
      b.dataset.v = v; host.append(b);
    });
  }
  async function fltFillSelects() {
    await catLoad();
    const ls = $('#flt-lang'), ns = $('#flt-nar');
    if (CAT.books && CAT.books.length) {
      const cnt = new Map(); CAT.books.forEach(b => { const l = b.lang || 'English'; cnt.set(l, (cnt.get(l) || 0) + 1); });
      const langs = [...cnt.entries()].sort((a, b) => b[1] - a[1]);
      ls.textContent = '';
      ls.append(h('option', { value: '' }, P.otherLangs ? 'Any language' : 'English (change in Settings)'));
      langs.forEach(([l, c]) => ls.append(h('option', { value: l }, l + ' (' + c + ')')));
      ls.value = FLT.lang;
    }
    const nm = fltNarrators(), names = [...nm.keys()].sort();
    ns.textContent = '';
    ns.append(h('option', { value: '' }, 'Any narrator'));
    names.forEach(n => ns.append(h('option', { value: n }, n + ' (' + nm.get(n).size + ')')));
    ns.value = FLT.nar;
    $('#flt-nar-help').textContent = names.length ? 'Narrators of the books you have opened.' : 'Narrators appear here once you have opened a few books. The catalog does not list narrators.';
  }
  /* ---------- Filters: one bottom sheet (#fpanel) ----------
     Sort, Minimum rating, Level, Length, Mood, Genre, Language, Narrator and Read-along ready live here. The scope chips under the
     search bar (All, Title, Author, Genre) only choose what the search looks in. The sheet is a normal .sheet, so the backdrop,
     Back button and Close work like every other sheet. "Show N books" is updated by applyFilters as filters change. */
  function fpanelSet(open) {
    const p = $('#fpanel'), b = $('#btn-fpanel');
    if (!p || !b) return;
    if (open) { fltFillSelects(); applyFilters(); openSheet('fpanel'); }
    else if (!p.hidden) { p.hidden = true; if (!$$('.sheet').some(x => !x.hidden)) el.backdrop.hidden = true; histSoon(); }
  }
  function fltClearAll() {
    if (activeGenre) clearGenre();
    FLT.len = FLT.mood = FLT.lang = FLT.nar = FLT.rate = FLT.sort = ''; LF.lvl.clear(); LF.ready = false; lfPaint(); fltSegPaint();
    $$('#flt-len button, #flt-mood button').forEach(x => x.setAttribute('aria-pressed', 'false'));
    $('#flt-lang').value = ''; $('#flt-nar').value = ''; applyFilters();
  }
  function fpanelChips() {
    const host = $('#fchips'); if (!host) return;
    const items = [];
    const g = activeGenre ? GENRES.find(x => x.lv === activeGenre) : null;
    if (g) items.push([g.label, () => clearGenre()]);
    FLT_LVL.forEach(([k, label, tier]) => { if (LF.lvl.has(tier)) items.push([label.split(' \u00b7 ')[0], () => lfToggle('lvl', tier, 'lib')]); });
    if (LF.ready) items.push(['Read-along ready', () => lfToggle('ready', 0, 'lib')]);
    if (FLT.len) { const x = FLT_LEN.find(y => y[0] === FLT.len); if (x) items.push([x[1], () => { FLT.len = ''; $$('#flt-len button').forEach(b => b.setAttribute('aria-pressed', 'false')); applyFilters(); }]); }
    if (FLT.mood) { const x = FLT_MOODS.find(y => y.k === FLT.mood); if (x) items.push([x.label, () => { FLT.mood = ''; $$('#flt-mood button').forEach(b => b.setAttribute('aria-pressed', 'false')); applyFilters(); }]); }
    if (fltSort()) { const x = FLT_SORTS.find(y => y[0] === fltSort()); if (x) items.push(['Sort: ' + x[1], () => { FLT.sort = ''; fltSegPaint(); applyFilters(); }]); }
    if (fltRate()) { const x = FLT_RATES.find(y => y[0] === fltRate()); if (x) items.push([x[1].replace(' +', '+') + ' rated', () => { FLT.rate = ''; fltSegPaint(); applyFilters(); }]); }
    if (FLT.lang) items.push([FLT.lang, () => { FLT.lang = ''; $('#flt-lang').value = ''; applyFilters(); }]);
    if (FLT.nar) items.push(['Narrator: ' + FLT.nar, () => { FLT.nar = ''; $('#flt-nar').value = ''; applyFilters(); }]);
    const sig = items.map(i => i[0]).join('|');
    if (host._sig === sig) return;
    host._sig = sig; host.textContent = '';
    items.forEach(([label, off]) => host.append(h('button', { type: 'button', 'aria-label': 'Remove filter ' + label, onclick: () => { off(); setTimeout(fpanelBadge, 0); setTimeout(fpanelBadge, 350); } }, label, h('span', { class: 'x', 'aria-hidden': 'true' }, '\u2715'))));
    if (items.length > 1) host.append(h('button', { type: 'button', class: 'clear', onclick: () => { fltClearAll(); setTimeout(fpanelBadge, 0); setTimeout(fpanelBadge, 350); } }, 'Clear all'));
    host.hidden = !items.length;
  }
  function fpanelBadge() {
    const n = fltActiveCount() + (activeGenre ? 1 : 0), bd = $('#fpanel-n'), b = $('#btn-fpanel');
    if (!bd || !b) return;
    bd.hidden = !n; bd.textContent = String(n);
    b.setAttribute('aria-label', n ? 'Filters, ' + n + ' active' : 'Filters');
    fpanelChips();
  }
  function initFpanel() {
    const p = $('#fpanel'), b = $('#btn-fpanel');
    if (!p || !b || b._wt) return;
    b._wt = true;
    b.addEventListener('click', () => fpanelSet(p.hidden));
    $('#fp-done').addEventListener('click', () => fpanelSet(false));
    { const ff = $('#f-find'); if (ff) ff.addEventListener('click', () => fpanelSet(false)); }
    $('#fp-clear').addEventListener('click', () => { fltClearAll(); setTimeout(fpanelBadge, 0); });
    $('#genre-chips').addEventListener('click', () => { setTimeout(fpanelBadge, 350); }); 
    p.addEventListener('change', () => setTimeout(fpanelBadge, 0));
    new MutationObserver(fpanelBadge).observe(p, { attributes: true, attributeFilter: ['aria-pressed', 'aria-checked'], subtree: true });
    /* keep the Filters button in step with the sheet however it was closed (Close, backdrop, Back, Done) and hand focus back to it */
    new MutationObserver(() => { const o = !p.hidden; b.setAttribute('aria-expanded', String(o)); if (!o && b._open && !$$('.sheet').some(x => !x.hidden)) { try { b.focus({ preventScroll: true }); } catch (e) { /* ignore */ } } b._open = o; }).observe(p, { attributes: true, attributeFilter: ['hidden'] });
    el.q.addEventListener('input', () => { if (el.q.value && !p.hidden) fpanelSet(false); });
    fpanelBadge();
  }

  function initFilters() {
    { const host = $('#flt-lvl'); host.textContent = '';
      FLT_LVL.forEach(([k, label, tier]) => { const b = h('button', { type: 'button', 'aria-pressed': 'false', onclick: () => lfToggle('lvl', tier, 'lib') }, label); b.dataset.v = tier; b.dataset.t = tier; host.append(b); });
      $('#flt-ready').addEventListener('click', () => lfToggle('ready', 0, 'lib')); lfPaint(); }
    fltSeg($('#flt-sort'), FLT_SORTS, 'sort', 'new');
    fltSeg($('#flt-rate'), FLT_RATES, 'rate', '');
    fltChips($('#flt-len'), FLT_LEN.map(x => [x[0], x[1]]), 'len');
    fltChips($('#flt-mood'), FLT_MOODS.map(x => [x.k, x.label]), 'mood');
    $('#flt-lang').addEventListener('change', e => { FLT.lang = e.target.value; applyFilters(); });
    $('#flt-nar').addEventListener('change', e => { FLT.nar = e.target.value; applyFilters(); });
    $('#filter-more').addEventListener('click', () => applyFilters(true));
  }
  function buildGenreChips() {
    const container = $('#genre-chips');
    const sec = $('#sec-genre');
    container.textContent = '';

    GENRES.forEach(g => {
      const chip = h('button', {
        class: 'genre-chip', type: 'button', 'aria-pressed': 'false',
        onclick: () => toggleGenre(g, chip)
      },
        h('span', { class: 'gic', 'aria-hidden': 'true' }, g.icon),
        g.label
      );
      container.append(chip);
    });

    $('#genre-more').addEventListener('click', () => {
      const g = GENRES.find(x => x.lv === activeGenre);
      if (!g) return;
      el.q.value = g.q;
      const cb = $('#btn-clear-q'); if (cb) cb.hidden = false;
      doSearch(g.q);
      window.scrollTo({ top: 0, behavior: motionOk() });
    });

    sec.hidden = false;

    // Re-expand the last selected genre (page reload or returning from a book)
    const saved = store.get(GENRE_KEY, null);
    const idx = GENRES.findIndex(g => g.lv === saved);
    if (idx >= 0) {
      const chip = container.children[idx];
      openGenre(GENRES[idx], chip);
      // centre the chip horizontally inside the row without scrolling the page
      const cr = container.getBoundingClientRect(), r = chip.getBoundingClientRect();
      container.scrollLeft += (r.left - cr.left) - (cr.width - r.width) / 2;
    }
  }

