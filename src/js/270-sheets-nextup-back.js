  /* ---------- sheets ---------- */
  /* ---------- Pre-sync: pick many books, open one sync issue per book ---------- */
  const PS = { sel: new Map(), shown: [], busy: false, seq: 0 };
  const PS_MAX = 20;
  const psHasText = b => b.gid === undefined || !!b.gid || /gutenberg/i.test(b.textUrl || '');
  const psSent = id => Date.now() - (store.get('wt:req:' + id, 0) || 0) < 864e5;
  function psCount() {
    $('#ps-count').textContent = PS.sel.size + ' selected';
    $('#ps-send').disabled = PS.busy || !PS.sel.size;
  }
  function psRender() {
    const list = $('#ps-list'); list.textContent = '';
    if (!PS.shown.length) { list.append(h('p', { class: 'help' }, 'No books found.')); return; }
    PS.shown.forEach(b => {
      const sent = psSent(b.id), cb = h('input', { type: 'checkbox' });
      cb.checked = PS.sel.has(b.id); cb.disabled = sent;
      cb.addEventListener('change', () => {
        if (cb.checked && PS.sel.size >= PS_MAX) { cb.checked = false; toast('Up to ' + PS_MAX + ' books at a time.'); return; }
        if (cb.checked) PS.sel.set(b.id, b); else PS.sel.delete(b.id);
        psCount();
      });
      list.append(h('label', { class: 'row', style: 'gap:.7rem;align-items:center' }, cb,
        h('span', { style: 'flex:1;min-width:0' }, h('strong', {}, b.title), h('br'),
          h('small', {}, b.authors + (b.total ? ' · ' + fmtLong(b.total) : '') + (sent ? ' · already requested' : '')))));
    });
  }
  async function psSearch() {
    const mine = ++PS.seq, q = $('#ps-q').value.trim(), gi = $('#ps-g').value;
    $('#ps-msg').textContent = '';
    try {
      let books;
      if (q) {
        const r = await Promise.all([lvGet({ title: '^' + q, limit: 30 }, { light: true }), lvGet({ author: '^' + q.split(/\s+/).pop(), limit: 30 }, { light: true })]);
        const seen = new Set(); books = r.flat().filter(b => !seen.has(b.id) && seen.add(b.id));
      } else if (gi !== '') books = await lvGet({ genre: GENRES[+gi].lv, limit: 30 }, { light: true });
      else books = await lvGet({ since: 1, limit: 30 }, { light: true });
      if (mine !== PS.seq) return;
      PS.shown = books.filter(psHasText); psRender();
    } catch (e) { if (mine === PS.seq) { PS.shown = []; psRender(); $('#ps-msg').textContent = 'Could not load books. Try again.'; } }
  }
  async function psSend() {
    const { repo, token } = ghCfg(), msg = $('#ps-msg');
    if (!repo || !token) { msg.textContent = 'Add your GitHub repository and token under Advanced first.'; return; }
    PS.busy = true; psCount();
    const items = [...PS.sel.values()]; let ok = 0, stop = '';
    for (const b of items) {
      msg.textContent = 'Sending ' + (ok + 1) + ' of ' + items.length + '…';
      try {
        const r = await fetch('https://api.github.com/repos/' + repo + '/issues', { method: 'POST', headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json' }, body: JSON.stringify({ title: 'sync ' + b.id, body: 'cur=0' + (store.get('wt:ntfy', '') ? '\nntfy=' + store.get('wt:ntfy', '') : '') + '\n' + b.title }) });
        if (r.ok) { store.set('wt:req:' + b.id, Date.now()); PS.sel.delete(b.id); ok++; }
        else { stop = r.status === 401 ? 'GitHub did not accept the token.' : r.status === 403 || r.status === 429 ? 'GitHub asked us to slow down. Wait a few minutes, then send the rest.' : 'GitHub refused the request (code ' + r.status + ').'; break; }
      } catch (e) { stop = 'Could not reach GitHub. Check your connection.'; break; }
      await new Promise(r => setTimeout(r, 2500)); // spaced out so GitHub does not block the burst
    }
    PS.busy = false;
    msg.textContent = (ok ? ok + ' sent. They will be ready in a few minutes each. ' : '') + stop;
    psRender(); psCount();
  }
  function psInit() {
    const g = $('#ps-g');
    g.append(h('option', { value: '' }, 'Newest'), ...GENRES.map((x, i) => h('option', { value: String(i) }, x.label)));
    let t = 0; $('#ps-q').addEventListener('input', () => { clearTimeout(t); t = setTimeout(psSearch, 300); });
    g.addEventListener('change', () => { $('#ps-q').value = ''; psSearch(); });
    $('#ps-send').addEventListener('click', psSend);
    $('#btn-presync').addEventListener('click', () => { openSheet('sheet-presync'); psSearch(); psCount(); });
  }

  guideDoc('player', 'Next up', "More > Next up suggests similar books and books at your level. The Slightly easier, Same level and Slightly harder buttons show what comes next.");
  /* ---------- Next up: more like this + books at your level (similar.json + levels.json) ---------- */
  const NX = { lvl: 'same', token: 0 };
  const nxPub = ({ _t, _a, _l, _g, ...b }) => b;
  const nxScore = id => { const v = LVL.map.get(String(id)); return v ? (typeof v[1] === 'number' ? v[1] : v[0] * 2) : null; };

  /* Finishing a book: pick one "slightly harder" and one "same level" book from levels.json.
     A level is the CEFR index (nxScore); slightly harder = the next step up (two at most).
     Candidates are the close matches first, widened by shared genre when those run out. Of any set of
     duplicate recordings only the best version is offered, and never a recording of the book just finished. */
  const NX_FIN = 'wt:finlv';
  function nxRecordFinish(book, here) {
    const L = store.get(NX_FIN, []) || [];
    const prev = L.filter(x => x.id !== book.id);
    if (here != null && !L.some(x => x.id === book.id)) store.set(NX_FIN, [{ id: book.id, sc: here, ts: Date.now() }, ...prev].slice(0, 12));
    return prev; // the books finished before this one
  }
  function nxLevelPicks(book, sb, pool, more, hist, here, prev, okL) {
    const gOf = id => { const v = VER.ready && VER.map.get(String(id)); return v ? 'g' + v.g : null; };
    const mine = gOf(book.id), seenG = new Set(mine ? [mine] : []), seen = new Set([String(book.id)]), cands = [];
    const add = b => {
      if (!b || seen.has(String(b.id)) || hist.has(b.id)) return;
      const v = VER.ready && VER.map.get(String(b.id));
      if (v && v.k > 0 && CAT.books) { const top = CAT.books.find(x => x.id === String(VER.groups[v.g].i[0])); if (top && top.id !== b.id) b = nxPub(top); }
      const g = gOf(b.id);
      if (seen.has(String(b.id)) || hist.has(b.id) || (g && seenG.has(g))) return;
      const sc = nxScore(b.id); if (sc == null) return;
      seen.add(String(b.id)); if (g) seenG.add(g);
      cands.push({ b, sc, rank: cands.length });
    };
    pool.forEach(add); more.forEach(add);
    const slot = () => {
      const up = cands.filter(x => x.sc > here && x.sc - here <= 2).sort((a, c) => (a.sc - here) - (c.sc - here) || a.rank - c.rank);
      const eq = cands.filter(x => x.sc === here).sort((a, c) => a.rank - c.rank);
      return { harder: up[0] || null, same: eq[0] || null };
    };
    let picks = slot();
    if ((!picks.harder || !picks.same) && sb && CAT.books && sb._g) { // widen by genre
      const toks = new Set(String(sb._g).split(/[,;|\/]+/).map(x => x.trim()).filter(Boolean));
      CAT.books.filter(x => x.id !== sb.id && okL(x) && x._g && Array.from(toks).some(t => x._g.includes(t)) && LVL.map.has(x.id))
        .sort((x, y) => (y.ia ? 1 : 0) - (x.ia ? 1 : 0) || (+y.id) - (+x.id)).slice(0, 150).forEach(x => add(nxPub(x)));
      picks = slot();
    }
    const climbed = prev.slice(0, 1).some(x => typeof x.sc === 'number' && x.sc <= here);
    const lead = picks.harder && (climbed || !picks.same) ? 'harder' : (picks.same ? 'same' : 'harder');
    return { cands, harder: picks.harder, same: picks.same, lead, climbed };
  }
  const nxCode = sc => { const c = LVL.cefr[sc]; return c ? c[0] : ''; };
  async function nextOpen(finished) {
    if (!S.book) return;
    const my = ++NX.token, body = $('#next-body'), book = S.book;
    openSheet('sheet-next');
    body.textContent = '';
    body.append(h('p', { class: 'help' }, 'Finding books for you\u2026'));
    try { await Promise.all([catLoad(), SIM.load().catch(() => {}), LVL.load().catch(() => {})]); } catch (e) { /* use what loaded */ }
    if (my !== NX.token || !S.book || S.book.id !== book.id) return;
    body.textContent = '';
    const sb = CAT.books && CAT.books.find(x => x.id === book.id);
    if (finished) body.append(h('p', { class: 'nx-done' }, 'You finished ', h('strong', {}, book.title), '. What would you like next?'));
    const hist = new Set(listenedList().map(r => r.id)); hist.add(book.id);
    const pool = sb ? recoFor(sb, hist, 60).map(nxPub) : [];
    const okL = x => P.otherLangs ? x.lang === sb.lang : (!x.lang || /^english$/i.test(x.lang));
    const more = sb && sb._a ? CAT.books.filter(x => x.id !== sb.id && !hist.has(x.id) && okL(x) && x._a === sb._a).sort((x, y) => (y.ia ? 1 : 0) - (x.ia ? 1 : 0) || (+y.id) - (+x.id)).map(nxPub) : [];
    const here = nxScore(book.id);
    const okLs = sb ? okL : (() => false);
    const prevFin = finished ? nxRecordFinish(book, here) : (store.get(NX_FIN, []) || []).filter(x => x.id !== book.id);
    const lv = LVL.ready && here != null ? nxLevelPicks(book, sb, pool, more, hist, here, prevFin, okLs) : null;
    if (lv && finished) {
      NX.lvl = lv.lead;
      const sec = h('section', { class: 'nx-sec nx-lvl' }), lv0 = nxCode(here);
      const mk = (kind, pk) => {
        const lab = kind === 'harder' ? 'Slightly harder' : 'Same level', to = nxCode(pk.sc);
        return h('div', { class: 'nx-pick' },
          h('div', { class: 'nx-tag' + (lv.lead === kind ? ' lead' : '') }, h('b', {}, lab), lv0 && to ? (lv0 === to ? to : lv0 + ' \u2192 ' + to) : ''),
          bookCard(pk.b, () => { closeSheets(); openBook(pk.b); }));
      };
      const order = lv.lead === 'harder' ? ['harder', 'same'] : ['same', 'harder'];
      const shown = order.filter(k => lv[k]);
      sec.append(h('h3', {}, 'Matched to your level'));
      if (shown.length) {
        sec.append(h('p', { class: 'help' }, 'You finished a ' + (lvlText(book.id) || 'rated') + ' book. ' + (lv.climbed && lv.harder ? 'You have kept up at this level, so a small step up is first.' : lv.lead === 'same' ? 'A book at the same level builds confidence before a step up.' : 'Here is a gentle next step.')));
        shown.forEach(k => sec.append(mk(k, lv[k])));
        if (!lv.harder) sec.append(h('p', { class: 'help' }, 'No slightly harder match among similar books yet. Use the level buttons below to look wider.'));
        if (!lv.same) sec.append(h('p', { class: 'help' }, 'No other book at exactly this level among similar books yet.'));
      } else sec.append(h('p', { class: 'help' }, 'No close matches at this level or one step up yet. Use the level buttons below to look wider.'));
      body.append(sec);
    }
    if (!pool.length && !more.length && !(lv && lv.cands.length)) { body.append(h('p', { class: 'help' }, 'No close matches for this book yet. Try a genre from the Library tab.')); return; }
    const pick = row => row.addEventListener('click', () => closeSheets());
    const lvIds = lv && finished ? new Set([lv.harder, lv.same].filter(Boolean).map(x => x.b.id)) : new Set();
    const feat = finished ? ([...more, ...pool].find(x => !lvIds.has(x.id)) || null) : null;
    if (feat) body.append(h('section', { class: 'nx-sec nx-feat' }, h('h3', {}, 'Up next'), bookCard(feat, () => { closeSheets(); openBook(feat); })));
    const moreRest = more.filter(x => !feat || x.id !== feat.id);
    if (moreRest.length) {
      const authRow = h('div', { class: 'hrow', 'aria-label': 'More by this author' });
      fillRow(authRow, moreRest, null, 12); pick(authRow);
      body.append(h('section', { class: 'nx-sec' }, h('h3', {}, 'More by ' + (book.authors || 'this author')), authRow));
    }
    const simList = pool.filter(x => !feat || x.id !== feat.id);
    if (simList.length) {
      const simRow = h('div', { class: 'hrow', 'aria-label': 'More like this' });
      fillRow(simRow, simList.slice(0, 12), null, 12); pick(simRow);
      body.append(h('section', { class: 'nx-sec' }, h('h3', {}, 'More like this'), simRow));
    }
    if (!pool.length && !(lv && lv.cands.length)) return;
    if (!LVL.ready || here == null) { body.append(h('p', { class: 'help' }, 'This book has no reading level yet, so level picks are not available.')); return; }
    const sec = h('section', { class: 'nx-sec' }), seg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Reading level' }), list = h('div', { class: 'list nx-list' });
    const draw = () => {
      $$('button', seg).forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === NX.lvl)));
      let items = (lv ? lv.cands.map(x => ({ b: x.b, sc: x.sc })) : pool.map(b => ({ b, sc: nxScore(b.id) })).filter(x => x.sc != null));
      if (NX.lvl === 'easier') items = items.filter(x => x.sc < here).sort((a, c) => c.sc - a.sc);
      else if (NX.lvl === 'harder') items = items.filter(x => x.sc > here).sort((a, c) => a.sc - c.sc); // stable: ties keep the similarity order
      else items = items.filter(x => x.sc === here);
      list.textContent = '';
      const rows = items.slice(0, 6).map(x => bookCard(x.b, () => { closeSheets(); openBook(x.b); }));
      if (!rows.length) list.append(h('p', { class: 'help' }, NX.lvl === 'same' ? 'No other books at exactly this level among the close matches. Try a slightly harder one.' : 'No close matches at that level yet.'));
      else list.append(...rows);
    };
    [['easier', 'Slightly easier'], ['same', 'Same level'], ['harder', 'Slightly harder']].forEach(([v, t]) => seg.append(h('button', { type: 'button', 'data-v': v, 'aria-pressed': 'false', onclick: () => { NX.lvl = v; draw(); } }, t)));
    sec.append(h('h3', {}, 'Keep your level'), h('p', { class: 'help' }, 'This book is ' + (lvlText(book.id) || 'rated') + '. Pick what comes next.'), seg, list);
    body.append(sec); draw();
  }

  /* Tag the book text with its language so screen readers pick the right voice (the page itself is lang="en"). */
  const LANG_CODES = { english: 'en', german: 'de', french: 'fr', spanish: 'es', italian: 'it', dutch: 'nl', portuguese: 'pt', bengali: 'bn', latin: 'la', russian: 'ru', chinese: 'zh', japanese: 'ja', finnish: 'fi', swedish: 'sv', polish: 'pl', greek: 'el', hebrew: 'he', danish: 'da', hungarian: 'hu', catalan: 'ca', esperanto: 'eo', arabic: 'ar', hindi: 'hi', czech: 'cs', norwegian: 'no', ukrainian: 'uk', turkish: 'tr' };
  function setReaderLang(name) {
    const c = LANG_CODES[String(name || '').trim().toLowerCase()], r = $('#reader');
    if (!r) return;
    if (c) r.setAttribute('lang', c); else r.removeAttribute('lang');
  }
  function openSheet(id) {
    if (id !== 'sheet-shadow') shCleanup();
    if (id !== 'sheet-clipedit') clEdCleanup();
    $$('.sheet').forEach(s => { s.hidden = true; });
    ghHide();
    if (id === 'sheet-tracks') renderTracks();
    if (id === 'sheet-text') renderTextSheet();
    if (id === 'sheet-settings') fillSettings();
    if (id === 'sheet-versions') renderVersions();
    $('#' + id).hidden = false; el.backdrop.hidden = false;
    const cur = $('[aria-current="true"]', $('#' + id));
    if (cur) cur.scrollIntoView({ block: 'center' });
    histSoon();
  }
  function closeSheets() { if (AMB.preview) { AMB.preview = false; ambSync(); } shCleanup(); try { clEdCleanup(); } catch (e) { /* clips not ready yet */ } $$('.sheet').forEach(s => { s.hidden = true; }); el.backdrop.hidden = true; histSoon(); }

  guideDoc('home', 'Back button and swipe-back', "Back closes the top layer first (a panel, the player, a book page, an open collection) instead of leaving the app.");
  /* ---------- Back button / swipe-back ----------
     Each open layer (a sheet, the reading view, the player, a book or author page, See all, an open collection,
     a tab other than Library) owns one history entry. Back closes the top layer instead of leaving the app;
     with nothing open, Back leaves as usual. When a layer is closed with an on-screen button, its entry is
     removed again, so the two never drift apart. */
  var HIST = null;
  /* Layers that live inside other code: the first-run onboarding fills these in (see initOnboarding). */
  var OB = { layers: () => 0, back() {} };
  /* The search results belong to the Library home, so they only count while that tab is showing. (The Filters sheet is a .sheet and counts as one.) */
  const searchOn = () => curTab === 'library' && !!el.results && !el.results.hidden;
  function histLayers() {
    return OB.layers() + ($$('.sheet').some(s => !s.hidden) ? 1 : 0) + (NR.on ? 1 : 0) + (el.player.hidden ? 0 : 1) +
      ((DET.book || DET.author) ? 1 + (DET.stack || []).length : 0) + (seeOpen ? 1 : 0) +
      ((curTab === 'collections' && COL.open) ? 1 : 0) + (searchOn() ? 1 : 0) + (curTab !== 'library' ? 1 : 0);
  }
  function histBack() {
    try {
      if (OB.layers()) OB.back();
      else if ($$('.sheet').some(s => !s.hidden)) closeSheets();
      else if (NR.on) nrClose();
      else if (!el.player.hidden) $('#btn-back').click();
      else if (DET.book || DET.author) closeDetail();
      else if (seeOpen) closeSeeAll();
      else if (curTab === 'collections' && COL.open) { COL.open = null; renderCollections(); window.scrollTo(0, 0); }
      else if (searchOn()) clearSearch(false);
      else if (curTab !== 'library') showTab('library');
    } catch (e) { /* leave the screen as it is */ }
  }
  function histGo(k) {
    HIST.busy = true; history.go(-k);
    setTimeout(() => { if (HIST.busy) { HIST.busy = false; histSync(); } }, 800);
  }
  function histSync() {
    if (!HIST || HIST.busy) return;
    const d = histLayers();
    if (d > HIST.n) { for (let i = HIST.n + 1; i <= d; i++) history.pushState({ wt: i }, ''); HIST.n = d; }
    else if (d < HIST.n) { const k = HIST.n - d; HIST.n = d; histGo(k); }
  }
  function histSoon() {
    if (!HIST || HIST.t) return;
    HIST.t = setTimeout(() => { HIST.t = 0; histSync(); }, 0);
  }
  function histInit() {
    HIST = { n: 0, busy: false, t: 0 };
    /* These screens are shown and hidden from many places; watching them keeps the history entries in step. */
    const mo = new MutationObserver(() => histSoon());
    ['results', 'fpanel', 'ob-overlay', 'ob-step-0', 'ob-step-1', 'ob-quiz'].forEach(id => { const n = document.getElementById(id); if (n) mo.observe(n, { attributes: true, attributeFilter: ['hidden'] }); });
    addEventListener('popstate', e => {
      if (HIST.busy) { HIST.busy = false; histSync(); return; }
      HIST.n = (e.state && e.state.wt) || 0;
      if (histLayers() > HIST.n) histBack();
      histSync();
    });
    const w = history.state && history.state.wt;
    if (w) { HIST.busy = true; history.go(-w); setTimeout(() => { if (HIST.busy) { HIST.busy = false; histSync(); } }, 800); }
    else histSoon();
  }
  const sheetOpen = () => !el.backdrop.hidden;

  guideDoc('offline', 'Download a book', "Open More > Tracks, then Listen offline > Download book. Remove download frees the space. A downloaded book plays without a connection.");
