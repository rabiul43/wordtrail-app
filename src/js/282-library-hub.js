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
    host.textContent = '';
    libHubRows().forEach(([m, sub]) => host.append(h('button', { class: 'lh-row', type: 'button', onclick: () => {
      shelfMode = m; shelfHub = false; applyShelfMode(); window.scrollTo(0, 0); histSoon(); uiSave();
    } }, h('span', { class: 'lh-ic', 'aria-hidden': 'true' }, lhSvg(LH_ICONS[m])),
      h('span', { class: 'lh-txt' }, h('b', {}, LH_TITLES[m]), h('small', {}, sub)),
      lhSvg(['M9 5l7 7-7 7'], 'lh-go'))));
    /* the downloads count is known only after the saved list has loaded: draw again then */
    if (!libHubDraw.hooked) { libHubDraw.hooked = true; Promise.resolve(dlReady).then(() => { libHubDraw.ready = true; if (shelfHub && curTab === 'shelf') libHubDraw(); }); }
  }
