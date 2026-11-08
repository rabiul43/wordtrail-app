  /* ---------- My Library on phones: a list of pages ----------
     Under 700px the Downloads tab is gone from the bottom bar. My Library opens on this list instead (Saved, Downloads, Following, Rated,
     Synced books), one row each with an icon, the title, how many titles it holds and a chevron. A row opens that page inside My Library,
     and the back arrow in its header (or the phone's Back) returns to the list. Wider screens keep the chips and the Downloads tab.
     State: shelfHub / shelfHubNext (080). Styles: 99e-library-hub.css. */
  function phoneUI() { return !(window.matchMedia && matchMedia('(min-width: 700px)').matches); }
  const LH_TITLES = { saved: 'Saved', fol: 'Following', rt: 'Rated', ra: 'Synced books', dl: 'Downloads' };
  function libHubTitle(m) { return LH_TITLES[m] || 'My Library'; }
  const LH_ICONS = {
    saved: ['M7 4h10a1 1 0 0 1 1 1v15l-6-4-6 4V5a1 1 0 0 1 1-1z'],
    dl: ['M12 3v13M7 11l5 5 5-5', 'M5 20h14'],
    fol: ['M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z', 'M3 20c.5-3.3 2.7-5 6-5s5.5 1.7 6 5', 'M18 8v6M15 11h6'],
    rt: ['M12 4l2.4 5 5.4.7-4 3.8 1 5.4-4.8-2.6-4.8 2.6 1-5.4-4-3.8 5.4-.7z'],
    ra: ['M4 12a8 8 0 0 1 13.7-5.6L20 8.5', 'M20 4v4.5h-4.5', 'M20 12a8 8 0 0 1-13.7 5.6L4 15.5', 'M4 20v-4.5h4.5']
  };
  function lhSvg(paths, cls) {
    const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('aria-hidden', 'true'); if (cls) s.setAttribute('class', cls);
    paths.forEach(d => { const p = document.createElementNS('http://www.w3.org/2000/svg', 'path'); p.setAttribute('d', d); s.append(p); });
    return s;
  }
  function libHubRows() {
    let signed = false, fol = 0, rt = 0, dl = 0, saved = 0;
    try { signed = shelfHooks.signedIn(); } catch (e) { /* guest */ }
    try { fol = folList().length; } catch (e) { /* none */ }
    try { saved = getFavs().length; } catch (e) { /* none */ }
    try { dl = [...dlMeta.values()].filter(m => m && m.tracks && Object.keys(m.tracks).length).length; } catch (e) { /* none */ }
    try { if (signed) rt = Object.keys(store.get(MYRT, {}) || {}).length; } catch (e) { /* none */ }
    const rows = [['saved', plural(saved, 'Title')], ['dl', plural(dl, 'Title')]];
    if (signed || fol) rows.push(['fol', plural(fol, 'Author')]);
    if (signed) rows.push(['rt', plural(rt, 'Title')]);
    rows.push(['ra', 'Books with read-along']);
    return rows;
  }
  function libHubDraw() {
    const host = $('#shelf-hub'); if (!host) return;
    if (libTilesOn()) { libTilesDraw(host); return; }   // Settings > New Library layout: the card and tiles below; off = this list, unchanged
    host.textContent = '';
    libHubRows().forEach(([m, sub]) => host.append(h('button', { class: 'lh-row', type: 'button', onclick: () => {
      shelfMode = m; shelfHub = false; applyShelfMode(); window.scrollTo(0, 0); histSoon(); uiSave();
    } }, h('span', { class: 'lh-ic', 'aria-hidden': 'true' }, lhSvg(LH_ICONS[m])),
      h('span', { class: 'lh-txt' }, h('b', {}, LH_TITLES[m]), h('small', {}, sub)),
      lhSvg(['M9 5l7 7-7 7'], 'lh-go'))));
    try {
      const nSaved = getFavs().length, nDl = [...dlMeta.values()].filter(m => m && m.tracks && Object.keys(m.tracks).length).length;
      if (!nSaved && !nDl) host.append(h('div', { class: 'lh-empty' }, lhSvg(LH_ICONS.saved), h('b', {}, 'Your library is empty'),
        h('p', {}, 'Tap the bookmark on any book to save it here, or download one to listen offline.'),
        h('button', { type: 'button', onclick: () => { const t = [...document.querySelectorAll('#tabbar button')].find(x => x.dataset.tab === 'collections'); t && t.click(); } }, 'Find a book')));
    } catch (e) { /* the empty hint is optional */ }
    /* the downloads count is known only after the saved list has loaded: draw again then */
    if (!libHubDraw.hooked) { libHubDraw.hooked = true; Promise.resolve(dlReady).then(() => { libHubDraw.ready = true; if (shelfHub && curTab === 'shelf') libHubDraw(); }); }
  }

  /* ---------- New Library layout (phones; Settings > "New Library layout", P.libTiles, default on) ----------
     <html data-lib="tiles"> (applyLib in 090, first paint in 00-head.html) makes libHubDraw call libTilesDraw: a card for the book you
     last listened to that has read-along, and a grid of tiles (Saved, Downloads, Following, Rated) that open the same pages as the list rows.
     Nothing above this line was changed, so switching it off gives the list as before. Styles: 99o-library-tiles.css. */
  const LT_BARS = [0.45, 0.8, 0.6, 1, 0.7, 0.5, 0.85, 0.65, 0.9, 0.55, 0.75, 0.4];   // the card's waveform strip: decorative heights
  const LT_TRY = { t: 0, done: false };   // the synced-book list is asked for once a minute at most; done = the first answer (or offline) is in
  function libTilesOn() { return document.documentElement.getAttribute('data-lib') === 'tiles'; }
  function ltOpen(m) { shelfMode = m; shelfHub = false; applyShelfMode(); window.scrollTo(0, 0); histSoon(); uiSave(); }
  function ltExplore() { const t = [...document.querySelectorAll('#tabbar button')].find(x => x.dataset.tab === 'collections'); t && t.click(); }
  /* the book for the card: the most recent of Continue listening (P.recents) that has read-along (the Hugging Face list the Synced books page uses).
     undefined = the list is not known yet, null = no such book */
  function ltHeroBook() {
    const ids = SYNCED_CACHE.ids;
    if (!ids) return LT_TRY.done ? null : undefined;
    return (P.recents || []).find(x => x && ids.has(String(x.id))) || null;
  }
  function ltSyncedLoad() {
    if (SYNCED_CACHE.ids) return;
    if (navigator.onLine === false) { LT_TRY.done = true; return; }
    if (Date.now() - LT_TRY.t < 60e3) return;
    LT_TRY.t = Date.now();
    Promise.resolve(loadHFSyncedIds()).catch(() => null).then(() => { LT_TRY.done = true; if (shelfHub && curTab === 'shelf' && libTilesOn()) libHubDraw(); });
  }
  function ltHero() {
    const r = ltHeroBook();
    const head = h('button', { class: 'lt-hero-head', type: 'button', onclick: () => ltOpen('ra') },
      h('span', { class: 'lt-pill' }, lhSvg(LH_ICONS.ra), 'Synced books'), lhSvg(['M9 5l7 7-7 7'], 'lt-chev'));
    if (r === undefined) return h('section', { class: 'lt-hero lt-wait', 'aria-busy': 'true' }, head, h('div', { class: 'lt-wait-body' }));
    if (!r) return h('section', { class: 'lt-hero lt-hero-empty' }, head, h('div', { class: 'lt-empty-body' },
      h('b', {}, 'Sync a book to read along'), h('p', {}, 'A synced book highlights the text as you listen.'),
      h('button', { class: 'lt-cta', type: 'button', onclick: ltExplore }, 'Explore')));
    const title = String(r.title || 'Untitled'), pct = Math.max(0, Math.min(1, +r.pct || 0)), on = Math.round(pct * LT_BARS.length);
    let ch = 0; try { const sv = store.get('wt:book:' + r.id, null); if (sv && sv.sec >= 0) ch = (sv.sec | 0) + 1; } catch (e) { /* no saved position: no chapter */ }
    const sub = [String(r.authors || '').trim(), ch ? 'Chapter\u00a0' + ch : ''].filter(Boolean).join(' · ');
    const fb = () => h('span', { class: 'lt-cover lt-cover-fb', 'aria-hidden': 'true' }, title);
    const cover = r.cover ? h('img', { class: 'lt-cover', src: r.cover, alt: '', width: '52', height: '70', decoding: 'async', referrerpolicy: 'no-referrer', onerror: e => e.target.replaceWith(fb()) }) : fb();
    const wave = h('span', { class: 'lt-wave', 'aria-hidden': 'true' }, LT_BARS.map((v, i) => { const b = h('i', { class: i < on ? 'on' : '' }); b.style.height = Math.round(v * 100) + '%'; return b; }));
    return h('section', { class: 'lt-hero' }, head,
      h('div', { class: 'lt-mid' }, cover,
        h('div', { class: 'lt-info' }, h('b', { class: 'lt-title' }, title), sub ? h('span', { class: 'lt-by' }, sub) : null, wave),
        h('button', { class: 'lt-play', type: 'button', 'aria-label': 'Play ' + title, onclick: () => resumeRecent(r, { play: true }) }, lhSvg(['M8 5v14l11-7z']))),
      h('div', { class: 'lt-foot' }, h('span', {}, 'Read-along ready'), h('span', {}, Math.round(pct * 100) + '% listened')));
  }
  function ltTile(m, top, num, label, sub, extra) {
    return h('button', { class: 'lt-tile lt-' + m, type: 'button', onclick: () => ltOpen(m) },
      h('span', { class: 'lt-top' }, top, lhSvg(['M9 5l7 7-7 7'], 'lt-chev')),
      h('span', { class: 'lt-num' }, String(num)), h('b', { class: 'lt-lab' }, label), sub ? h('small', {}, sub) : null, extra);
  }
  const ltInit = n => { const w = String(n || '').replace(/[^\p{L}\p{N}\s]/gu, ' ').trim().split(/\s+/).filter(Boolean); return ((w[0] || '?')[0] + (w.length > 1 ? w[w.length - 1][0] : '')).toUpperCase(); };
  function ltAvatars() {
    let names = []; try { names = folList().slice(0, 3).map(x => x.n); } catch (e) { /* none */ }
    return h('span', { class: 'lt-avs', 'aria-hidden': 'true' }, names.map((n, i) => h('span', { class: 'lt-av lt-av' + i }, ltInit(n))));
  }
  function ltStars() {   // 4 stars, filled for the average of your ratings (out of 5); all outlines until there is one
    let sum = 0, n = 0;
    try { Object.values(store.get(MYRT, {}) || {}).forEach(x => { if (x && x.r > 0) { sum += +x.r; n++; } }); } catch (e) { /* none */ }
    const fill = n ? Math.max(0, Math.min(4, Math.round(sum / n * 4 / 5))) : 0;
    const box = h('span', { class: 'lt-stars', role: 'img', 'aria-label': n ? 'Average rating ' + (sum / n).toFixed(1) + ' out of 5' : 'No ratings yet' });
    for (let i = 0; i < 4; i++) box.append(lhSvg(LH_ICONS.rt, i < fill ? 'on' : ''));
    return box;
  }
  function ltStorage(bar) {   // the thin bar under Downloads: what the downloads use of the space the browser gives the app (same figure as Settings > Storage)
    try {
      if (!navigator.storage || !navigator.storage.estimate) return;
      const total = [...dlMeta.values()].reduce((a, m) => a + (m ? dmSize(m) : 0), 0);
      if (!total) return;
      navigator.storage.estimate().then(e => {
        if (!e || !e.quota || !bar.isConnected) return;
        bar.firstChild.style.width = Math.max(3, Math.min(100, Math.round(total / e.quota * 100))) + '%';
        bar.setAttribute('aria-label', dmMB(total) + ' of ' + dmMB(e.quota) + ' available to the app'); bar.hidden = false;
      }).catch(() => {});
    } catch (e) { /* no Storage API: the bar stays hidden */ }
  }
  function libTilesDraw(host) {
    host.textContent = '';
    const num = {};
    libHubRows().forEach(([m, sub]) => { num[m] = parseInt(sub, 10) || 0; });   // the same rows and counts as the list: Following and Rated show under the same rules
    ltSyncedLoad();
    const ic = m => h('span', { class: 'lt-ic', 'aria-hidden': 'true' }, lhSvg(LH_ICONS[m]));
    const bar = h('span', { class: 'lt-bar', role: 'img', hidden: true }, h('i'));
    const grid = h('div', { class: 'lt-grid' }, ltTile('saved', ic('saved'), num.saved, 'Saved', 'Titles'), ltTile('dl', ic('dl'), num.dl, 'Downloads', '', bar));
    if ('fol' in num) grid.append(ltTile('fol', ltAvatars(), num.fol, 'Following', 'Authors'));
    if ('rt' in num) grid.append(ltTile('rt', ltStars(), num.rt, 'Rated', 'Titles'));
    host.append(h('p', { class: 'lt-lead' }, 'Your reading, all in one place'), ltHero(), grid);
    ltStorage(bar);
    try {
      if (!num.saved && !num.dl) host.append(h('div', { class: 'lh-empty' }, lhSvg(LH_ICONS.saved), h('b', {}, 'Your library is empty'),
        h('p', {}, 'Tap the bookmark on any book to save it here, or download one to listen offline.'),
        h('button', { type: 'button', onclick: ltExplore }, 'Find a book')));
    } catch (e) { /* the empty hint is optional */ }
    if (!libHubDraw.hooked) { libHubDraw.hooked = true; Promise.resolve(dlReady).then(() => { libHubDraw.ready = true; if (shelfHub && curTab === 'shelf') libHubDraw(); }); }
  }
