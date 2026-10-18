  /* ---------- toast, status, views ---------- */
  let toastTimer = 0;
  function toast(msg, ms = 2800, action) {
    el.toast.textContent = msg; el.toast.hidden = false;
    if (action) el.toast.append(h('button', { type: 'button', onclick: () => { el.toast.hidden = true; clearTimeout(toastTimer); action[1](); } }, action[0]));
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.toast.hidden = true; }, ms);
  }
  function setStatus(msg, kind, action) {
    el.status.className = 'status' + (kind ? ' ' + kind : '');
    el.status.textContent = msg || '';
    if (action) el.status.append(h('button', { class: 'btn small ghost', onclick: action[1] }, action[0]));
  }
  let BOOTING = true;
  let curTab = 'library', seeOpen = false;
  const DET = { book: null, author: null, rv: false, y: 0, stale: false, stack: [] };   // book detail page: open while DET.book is set
  let backTo = null, pendingBack = null;
  function restoreBack() {
    const b = backTo; backTo = null;
    if (!b) return;
    if (b.tab !== curTab) showTab(b.tab);
    else if (b.see && !seeOpen) { seeOpen = true; showView('home'); }
  }
  /* Refresh keeps you in the book: the open book is remembered while the player is showing and forgotten when you go back home. */
  const RESUME_OPEN = (() => { try { return store.get('wt:open', null); } catch (e) { return null; } })();
  function rememberOpen(b) { try { store.set('wt:open', b ? { id: b.id, title: b.title, authors: b.authors || '', cover: b.cover || '', ia: b.ia || '' } : null); } catch (e) { /* storage unavailable */ } }
  function showView(v) {
    if (v === 'home' && !BOOTING) rememberOpen(null);
    if (v !== 'player' && el.player.classList.contains('ro')) setReadOnly(false);
    if (v !== 'player' && ACC.cur) clearAccent();
    const home = v === 'home';
    if (v === 'player' && el.player.hidden) { backTo = pendingBack || { tab: curTab, see: seeOpen }; pendingBack = null; }
    const det = home && !!(DET.book || DET.author);
    el.home.hidden = !(home && curTab === 'library' && !seeOpen && !det);
    $('#seeall').hidden = !(home && seeOpen && !det);
    $('#collections').hidden = !(home && curTab === 'collections' && !seeOpen && !det);
    $('#shelf').hidden = !(home && curTab === 'shelf' && !seeOpen && !det);
    $('#account').hidden = !(home && curTab === 'account' && !seeOpen && !det);
    $('#detail').hidden = !det;
    if (det && DET.stale && DET.book) { DET.stale = false; detDraw(); }
    $('#tabbar').hidden = !home;
    el.player.hidden = v !== 'player';
    if (home) window.scrollTo(0, 0);
    wakeSync();
    miniUpdate(home);
    if (v === 'player') paintPlayerHeart();
    histSoon();
  }
  guideDoc('player', 'Mini player', "When you leave a book, a bar at the bottom keeps it one tap away. Tap it to return, or tap its play button. Tap the x to stop and close it; it comes back when you play a book again.", '2026-10-10');
  /* ------ mini-player: keeps the current book one tap away while browsing ------ */
  function setTabH() { const tb = $('#tabbar'); if (tb && !tb.hidden) document.documentElement.style.setProperty('--tabbar-h', tb.offsetHeight + 'px'); }
  function miniProgress() { const i = $('#mini-prog'); if (i && S.book) i.style.width = Math.round(Math.min(1, bookPct()) * 1000) / 10 + '%'; }
  function miniPlayIcon(playing) {
    const b = $('#mini-play'); if (!b) return;
    $('use', b).setAttribute('href', playing ? '#i-pause' : '#i-play');
    b.setAttribute('aria-label', playing ? 'Pause' : 'Play');
  }
  function miniUpdate(home) {
    const box = $('#mini'); if (!box) return;
    if (S.book && S._miniOff && S._miniOff !== S.book.id) S._miniOff = null;
    const show = home !== false && !!(S.book && S.secs && S.secs.length) && el.player.hidden && !(S.book && S._miniOff === S.book.id);
    box.hidden = !show;
    document.body.classList.toggle('has-mini', show);
    setTabH();
    if (!show) return;
    if (box._wtId !== S.book.id) {
      box._wtId = S.book.id;
      const c = $('#mini-cover'); c.textContent = ''; c.append(coverNode(S.book));
      $('#mini-t').textContent = S.book.title;
      $('#mini-a').textContent = S.book.authors || '';
    }
    miniPlayIcon(!audio.paused);
    miniProgress();
  }

  /* ---------- feature guide (Account > Feature guide) ----------
     Built from GUIDE_REG, which every feature fills in beside its own code with guideDoc(). */
  const GUIDE_NEW_DAYS = 30;
  const guideIsNew = f => { if (!f.since) return false; const t = Date.parse(f.since + 'T00:00:00'); return isFinite(t) && Date.now() - t < GUIDE_NEW_DAYS * 864e5; };
  function guideBadge() {
    const sp = $('#acct-guide > span'); if (!sp) return;
    const seen = store.get('wt:guide:seen', ''), unseen = GUIDE_REG.some(f => guideIsNew(f) && f.since > seen);
    let b = sp.querySelector('.gd-new');
    if (unseen && !b) { b = h('em', { class: 'gd-new' }, 'New'); sp.insertBefore(b, sp.querySelector('small')); }
    else if (!unseen && b) b.remove();
  }
  function initGuide() {
    const list = $('#guide-list'), q = $('#guide-q'), none = $('#guide-none');
    if (!list) return;
    list.textContent = ''; q.value = ''; none.hidden = true;
    const bySec = new Map();
    GUIDE_REG.forEach(f => { if (!bySec.has(f.sec)) bySec.set(f.sec, []); bySec.get(f.sec).push(f); });
    const secs = GUIDE_SECS.filter(x => bySec.has(x[0])).concat([...bySec.keys()].filter(k => !GUIDE_SECS.some(x => x[0] === k)).map(k => [k, '\u2728', k, '']));
    const badge = () => h('em', { class: 'gd-new' }, 'New');
    secs.forEach(([key, ic, title, sub]) => {
      const items = bySec.get(key), fresh = items.filter(guideIsNew).length;
      list.append(h('details', { class: 'guide-sec' },
        h('summary', {}, h('span', { class: 'gs-ic', 'aria-hidden': 'true' }, ic), h('span', {}, title, fresh ? badge() : null, h('small', { class: 'gs-sub' }, sub))),
        h('ul', { class: 'guide-items' }, ...items.map(f => h('li', {}, h('b', {}, f.title, guideIsNew(f) ? badge() : null), h('span', {}, f.desc))))));
    });
    q.oninput = () => {
      const w = q.value.trim().toLowerCase();
      let any = false;
      $$('.guide-sec', list).forEach(sec => {
        let hit = false;
        $$('li', sec).forEach(li => { const m = !w || li.textContent.toLowerCase().includes(w) || sec.firstChild.textContent.toLowerCase().includes(w); li.hidden = !m; if (m) hit = true; });
        sec.hidden = !hit; if (w && hit) sec.open = true; if (!w) sec.open = false; if (hit) any = true;
      });
      none.hidden = any;
    };
    const latest = GUIDE_REG.reduce((m, f) => f.since > m ? f.since : m, '');
    if (latest) store.set('wt:guide:seen', latest);
    guideBadge();
  }
  let shelfMode = 'saved';
  function applyShelfMode() {
    $('#shelf-saved').hidden = shelfMode !== 'saved'; $('#shelf-ra').hidden = shelfMode !== 'ra';
    $$('#shelf-seg .chip').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.m === shelfMode)));
    if (shelfMode === 'ra') { $('#shelf-sub').textContent = ''; renderSynced(); } else renderShelf();
  }
  function showTab(t, keep) {
    if (t === 'synced') { t = 'shelf'; shelfMode = 'ra'; }
    if (t === 'collections' && curTab === 'collections' && !keep && COL.open) COL.open = null; // tapping the tab again goes back to the shelves
    curTab = t; seeOpen = false; DET.book = null; DET.author = null; DET.rv = false; DET.stack = [];
    $$('#tabbar .tab').forEach(b => { if (b.dataset.tab === t) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
    if (t === 'shelf') applyShelfMode();
    if (t === 'collections') renderCollections();
    if (t === 'account') renderAccount();
    if (t === 'synced') renderSynced();
    showView('home');
    uiSave();
  }

  /* ---------- remember the last tab and scroll position (wt:ui), restored when the app reopens ---------- */
  const UI_KEY = 'wt:ui';
  let uiBusy = true, uiT = 0;
  function uiSave() {
    if (uiBusy || !el.player.hidden) return;   // while the player is open, keep the last home screen
    const tab = curTab === 'shelf' && shelfMode === 'ra' ? 'synced' : curTab;
    const plain = !seeOpen && !DET.book && !DET.author && !(curTab === 'collections' && COL.open);
    const q = curTab === 'library' && !DET.book && !DET.author && !seeOpen && !el.results.hidden ? (el.q.value || '').trim() : '';
    const col = curTab === 'collections' && COL.open && !DET.book && !DET.author ? String(COL.open) : '';
    store.set(UI_KEY, { tab, y: plain ? Math.round(window.scrollY) : 0, q, col });
  }
  function uiInit() {
    window.addEventListener('scroll', () => { clearTimeout(uiT); uiT = setTimeout(uiSave, 250); }, { passive: true });
    document.addEventListener('visibilitychange', () => { if (document.hidden) { clearTimeout(uiT); uiSave(); } });
    window.addEventListener('pagehide', () => { clearTimeout(uiT); uiSave(); });
    const s = store.get(UI_KEY, null);
    if (!s || typeof s.tab !== 'string') { uiBusy = false; return; }
    try { if (s.tab !== 'library' && ['collections', 'shelf', 'account', 'synced'].includes(s.tab)) showTab(s.tab); } catch (e) { /* stay on the library */ }
    /* an open collection and a search are brought back too (search results come from the saved cache when they can) */
    try { if (s.col && s.tab === 'collections') openCollection(s.col); } catch (e) { /* stay on the shelves */ }
    let again = false;
    try {
      if (s.q && typeof s.q === 'string' && s.tab === 'library') {
        el.q.value = s.q; const cb = $('#btn-clear-q'); if (cb) cb.hidden = false;
        again = true; doSearch(s.q);
      }
    } catch (e) { again = false; }
    const y = Math.max(0, +s.y || 0);
    if (!y) { if (again) setTimeout(() => { uiBusy = false; }, 3500); else uiBusy = false; return; }
    // Rows can still be filling in, so keep trying for a moment, and stop as soon as the reader scrolls themselves.
    let user = false; const t0 = performance.now();
    const stop = () => { user = true; };
    ['touchstart', 'wheel', 'keydown', 'mousedown'].forEach(ev => window.addEventListener(ev, stop, { once: true, passive: true }));
    const step = () => {
      if (user || performance.now() - t0 > 3000) { uiBusy = false; return; }
      window.scrollTo(0, y);
      if (Math.abs(window.scrollY - y) < 2) { uiBusy = false; return; }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  guideDoc('mybooks', 'Saved', "Every book you hearted. Tap one to open it. Tap the heart again to remove it.");
  /* ---------- favourites ("My books") ---------- */
  const FAV_KEY = 'wt:favs';
  const getFavs = () => { const f = store.get(FAV_KEY, []); return Array.isArray(f) ? f : []; };
  const isFav = id => getFavs().some(f => f.id === String(id));
  function toggleFav(b, quiet) {
    const id = String(b.id);
    let favs = getFavs();
    const adding = !favs.some(f => f.id === id);
    if (!adding) favs = favs.filter(f => f.id !== id);
    else favs.unshift({ id, title: b.title, authors: b.authors || '', cover: b.cover || '', ia: b.ia || '', total: b.total || 0, n: b.n || 0, lang: b.lang || '' });
    store.set(FAV_KEY, favs.slice(0, 300));
    paintHearts();
    if (!quiet) {
      buzz(adding ? 'medium' : 'light');
      if (adding) $$('.heart').filter(x => x._wtId === id).forEach(x => { x.classList.remove('pop'); void x.offsetWidth; x.classList.add('pop'); });
      toast(adding ? 'Saved to My books' : 'Removed from My books', 3500, ['Undo', () => toggleFav(b, true)]);
    }
    if (curTab === 'shelf' && !$('#shelf').hidden && shelfMode === 'saved') renderShelf();
  }
  function paintHeart(btn) {
    const on = isFav(btn._wtId);
    btn.setAttribute('aria-pressed', String(on));
    btn.setAttribute('aria-label', (on ? 'Remove from My books: ' : 'Save to My books: ') + btn._wtTitle);
  }
  function paintHearts() { $$('.heart').forEach(paintHeart); paintPlayerHeart(); }
  function paintPlayerHeart() {
    const b = $('#btn-fav'); if (!b) return;
    const on = !!(S.book && isFav(S.book.id));
    b.setAttribute('aria-pressed', String(on));
    b.setAttribute('aria-label', on ? 'Remove from My books' : 'Save to My books');
  }
  function heartNode(b, cls) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.6-7 10-7 10z');
    svg.append(path);
    const btn = h('button', { class: 'heart ' + (cls || ''), type: 'button', onclick: e => { e.stopPropagation(); const now = Date.now(); if (now - (btn._wtLast || 0) < 400) return; btn._wtLast = now; toggleFav(b); } }, svg);
    btn._wtId = String(b.id); btn._wtTitle = b.title;
    paintHeart(btn);
    return btn;
  }
  function renderShelf() {
    const favs = getFavs(), list = $('#shelf-list');
    list.textContent = '';
    $('#shelf-empty').hidden = favs.length > 0;
    $('#shelf-sub').textContent = favs.length ? plural(favs.length, 'book') + ' saved' : '';
    const cards = favs.map(f => bookCard(f, () => { pendingBack = { tab: 'shelf', see: false }; showTab('library'); resumeRecent(f); }));
    cards.forEach((c, i) => { if (favs[i] && favs[i].id) c.append(bmChipRow(favs[i])); });
    list.append(...cards);
    checkReady(cards);
  }
  guideDoc('mybooks', 'Synced books', "Books with timing published for everyone. Use the filters (Recently synced, Current book, Incomplete, Saved, A\u2013Z) to find one, then tap it to open.");
