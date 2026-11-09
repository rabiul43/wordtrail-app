  /* ---------- My Library: Books | Learn switch (LSW) ----------
     A small switch at the top of the My Library tab. Books is the page that was always there and is not changed.
     Learn is a panel (#shelf-learn) that is built the first time it is opened, so nothing is drawn for it at start-up.
     The choice is remembered in wt:shelf-top ('books' | 'learn'). It stays on this device (no sync category, same as wt:ui).
     The gold badge counts the saved words that are due (WS + srsDue, the same rule as the Review lesson). It is worked out
     only when the My Library tab is drawn, never while a book plays. It is hidden in Calm mode (see 94g-learn-switch.css).
     Hooks: 080 (applyShelfMode) calls shelfHooks.top(hub); showTab calls shelfHooks.toBooks() for the Synced books page.
     Later tasks: set LSW.render = host => { ... } to draw the Learn page. It runs each time Learn opens. Styles 94g-learn-switch.css. */
  const LSW = (() => {
    const KEY = 'wt:shelf-top';
    let cur = 'books', wired = false, built = false;
    try { cur = store.get(KEY, 'books') === 'learn' ? 'learn' : 'books'; } catch (e) { /* storage unavailable: Books */ }
    const dueN = () => { try { return WS.all().filter(srsDue).length; } catch (e) { return 0; } };
    function emptyState(host) {   // shown until the learning page is built (later tasks replace LSW.render)
      host.textContent = '';
      host.append(h('div', { class: 'tab-empty' }, h('h2', {}, 'Learning will live here'), h('p', {}, 'Your saved words and practice will show up on this page.')));
    }
    function set(t) {
      cur = t === 'learn' ? 'learn' : 'books';
      try { store.set(KEY, cur); } catch (e) { /* storage unavailable */ }
      applyShelfMode();
    }
    function wire() {
      if (wired) return; wired = true;
      $$('#shelf-top .wl-seg__btn').forEach(b => b.addEventListener('click', () => set(b.dataset.t)));
    }
    /* Called by applyShelfMode (080). hub = phones: My Library is showing its list of pages. Returns true when Learn is on screen. */
    function top(hub) {
      wire();
      const show = shelfMode !== 'dl' && (!phoneUI() || hub);   // not on a Books sub-page, and not on the Downloads page
      const learn = show && cur === 'learn';
      $('#shelf-top').hidden = !show;
      if (show) {
        $$('#shelf-top .wl-seg__btn').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.t === cur)));
        const n = dueN(), badge = $('#sht-badge');
        badge.hidden = !n; badge.textContent = n > 99 ? '99+' : String(n);
        $('#sht-due').textContent = n ? n + (n === 1 ? ' word due' : ' words due') : '';
      }
      $('#shelf-learn').hidden = !learn;
      if (learn) {
        if (!built) built = true;   // first open: nothing was drawn before this
        try { LSW.render($('#shelf-learn')); } catch (e) { emptyState($('#shelf-learn')); }
      }
      return learn;
    }
    return { KEY, get cur() { return cur; }, set, top, dueN, render: emptyState, toBooks() { if (cur !== 'books') { cur = 'books'; try { store.set(KEY, cur); } catch (e) { /* storage unavailable */ } } } };
  })();
  shelfHooks.top = LSW.top;
  shelfHooks.toBooks = LSW.toBooks;
