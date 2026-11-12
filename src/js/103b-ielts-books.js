  /* ---------- IELTS books (AC) and Essay phrases (EP), Task 54 ----------
     Helps exam learners find books. Everything extends what is already there: the browse filters (103) get two more filters,
     the Learn hub's IELTS section gets one button, My words (166) gets one collection. Nothing runs at start-up and playback is never touched.
     Data: academic.json (built by tools/academic_share.py, hosted next to levels.json, read with fetchText from 070, saved in IndexedDB for 3 days):
       { v: 1, min: 5, b: { '<book id>': percent of academic words }, a: { '<book id>': 0 British | 1 American } }   ('a' only when the data has it)
     Percent = academic-list words among the listed hard words of the book (vocab/<id>.json), a rough guide, never a score.
     Filters (state lives in FLT, 103):  FLT.ielts  true = only books with at least `min` percent;  FLT.acc  '' | '0' | '1'.
     Level already exists (LF.lvl). A book with no entry in the data is not IELTS-friendly; with no accent entry it is left out of an accent filter.
       AC.load()        promise, fills itself once (tries again next time when the file could not be read)
       AC.pct(id)       number or null          AC.match(b)   used by fltMatch (103)       AC.extra(b)   the bar for a book card, or null
       AC.shelf()       opens Home with only IELTS-friendly books (the "Books for IELTS" shelf)       AC.fill() / AC.paint()   the filter sheet controls
       EP.offer(host, redraw)  in My words: a button that adds saved linking words and collocations to the collection "Essay phrases"
     Pure rules between AC-START / AC-END and EP-START / EP-END. Test: node tools/ielts_books_check.js
     To go back: remove this file, 99q-ielts-books.css, their build.py lines, the AC/EP hooks in 103, 166, 169o, and the IELTS group in 30-sheets-settings.html. */
  const AC = (() => {
    /*AC-START*/
    const MIN_DEFAULT = 5, CEFR_NAME = { A1: 'Beginner', A2: 'Elementary', B1: 'Intermediate', B2: 'Upper-int.', C1: 'Advanced', C2: 'Advanced' };
    function clean(j) {
      if (!j || j.v !== 1 || !j.b || typeof j.b !== 'object') return null;
      const m = +j.min > 0 && +j.min <= 100 ? +j.min : MIN_DEFAULT, b = new Map(), a = new Map();
      for (const k in j.b) { const p = +j.b[k]; if (p >= 0 && p <= 100) b.set(String(k), Math.round(p)); }
      if (j.a && typeof j.a === 'object') for (const k in j.a) if (j.a[k] === 0 || j.a[k] === 1) a.set(String(k), j.a[k]);
      return { min: m, b, a };
    }
    const pct = (d, id) => d && d.b.has(String(id)) ? d.b.get(String(id)) : null;
    function match(d, id, ielts, acc) {
      if (ielts) { const p = pct(d, id); if (p == null || p < d.min) return false; }
      if (acc !== '') { if (!d || d.a.get(String(id)) !== +acc) return false; }
      return true;
    }
    /*AC-END*/
    const st = { d: null, promise: null };
    const load = () => st.promise || (st.promise = (async () => {
      let j = null;
      try { j = await idb.get('academic'); } catch (e) { /* no saved copy */ }
      if (!(j && j.b && Date.now() - (j.fetched || 0) < 3 * 24 * 3600e3)) {
        try {
          const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 15000);
          const r = await fetchText('academic.json', ctl.signal); clearTimeout(to);
          if (r && r.ok) { const n = await r.json(); if (clean(n)) { n.fetched = Date.now(); idb.set('academic', n); j = n; } }
        } catch (e) { /* use the saved copy if any */ }
      }
      st.d = clean(j);
      if (!st.d) st.promise = null;
    })());
    const ready = () => !!st.d;
    const match2 = b => match(st.d, b.id, FLT.ielts, FLT.acc);
    function extra(b) {
      const p = pct(st.d, b.id); if (p == null || !FLT.ielts) return null;
      const v = LVL.map.get(String(b.id)), c = v && LVL.cefr[v[1]], lv = c && CEFR_NAME[c[0]], ac = st.d.a.get(String(b.id));
      return h('div', { class: 'ac-row' },
        h('div', { class: 'ac-line' }, h('div', { class: 'ac-bar', role: 'img', 'aria-label': p + '% academic words' }, h('i', { style: 'width:' + Math.min(100, p * 4) + '%' })), h('b', { class: 'ac-p' }, p + '%')),
        h('div', { class: 'ac-lab' }, 'academic words'),
        h('div', { class: 'ac-chips' }, ac === 0 ? h('span', {}, 'British') : null, ac === 1 ? h('span', {}, 'American') : null, lv ? h('span', {}, lv) : null));
    }
    function paint() {
      $$('#flt-ielts button').forEach(b => b.setAttribute('aria-pressed', String(FLT.ielts)));
      const s = $('#flt-acc'); if (s) s.value = FLT.acc;
    }
    async function fill() {
      const host = $('#flt-ielts'), s = $('#flt-acc'); if (!host || !s) return;
      if (!host.firstChild) {
        host.append(h('button', { type: 'button', 'aria-pressed': 'false', onclick: () => { FLT.ielts = !FLT.ielts; paint(); applyFilters(); } }, 'IELTS-friendly'));
        s.append(h('option', { value: '' }, 'Any accent'), h('option', { value: '0' }, 'British'), h('option', { value: '1' }, 'American'));
        s.addEventListener('change', () => { FLT.acc = s.value; applyFilters(); });
      }
      paint();
      await load();
      $('#flt-acc-g').hidden = !(st.d && st.d.a.size);   // no accent in the data: no accent control
    }
    /* "Books for IELTS": every other filter off, IELTS-friendly on, results shown on Home */
    async function shelf() {
      try { fltClearAll(); } catch (e) { /* nothing to clear */ }
      FLT.ielts = true; FLT.acc = ''; paint();
      showTab('library');
      await load();
      await applyFilters(); fpanelBadge();
      const r = $('#filter-results'); if (r && !r.hidden) r.scrollIntoView({ block: 'start', behavior: motionOk() });
    }
    return { load, ready, pct: id => pct(st.d, id), match: match2, extra, shelf, fill, paint, clean, ACC: ['British', 'American'] };
  })();

  const EP = (() => {
    /*EP-START*/
    const NAME = 'Essay phrases';
    const LINK = new Set(('however moreover furthermore therefore thus hence consequently nevertheless nonetheless whereas although whilst despite meanwhile likewise similarly conversely additionally subsequently accordingly notwithstanding alternatively otherwise besides overall finally firstly secondly thirdly ultimately eventually indeed namely thereby whereby albeit').split(' '));
    /* a linking word, or a collocation: two to five words, letters only */
    function isPhrase(w) {
      w = String(w == null ? '' : w).trim().toLowerCase();
      if (!w || w.length > 60) return false;
      if (/\s/.test(w)) return /^[a-z][a-z'\u2019 -]*$/.test(w) && w.split(/\s+/).length <= 5;
      return LINK.has(w);
    }
    const inCol = (e, name) => (Array.isArray(e && e.cols) ? e.cols : []).some(c => String(c).trim().toLowerCase() === name.toLowerCase());
    const pending = (words, name) => (words || []).filter(e => e && typeof e.w === 'string' && isPhrase(e.w) && !inCol(e, name || NAME));
    /*EP-END*/
    function offer(host, redraw) {
      const old = $('#ep-offer'); if (old) old.remove();
      if (!host) return;
      const todo = pending(WS.all());
      if (!todo.length) return;
      host.append(h('div', { id: 'ep-offer', class: 'ep-offer' },
        h('button', { type: 'button', class: 'wl-btn', onclick: () => {
          WF.create(NAME);
          todo.forEach(e => WS.addToCollection(e.w, NAME, true));
          toast(plural(todo.length, 'word') + ' added to ' + NAME, 2200);
          if (redraw) redraw();
        } }, 'Add linking words and collocations to Essay phrases', h('span', { class: 'ep-n' }, String(todo.length)))));
    }
    const prepare = () => { try { WF.create(NAME); } catch (e) { /* keep going */ } };   // the collection exists even when it is empty
    return { NAME, isPhrase, pending, offer, prepare };
  })();
