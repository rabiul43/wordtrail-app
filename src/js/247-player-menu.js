/* Player menu: the three-dot button in the top bar opens a small dropdown with the five things people reach for most
   (Timing, Text and reading, Live translation, Tracks, Settings). "More" opens the rest in place, grouped as Listen, Book and Fix.
   Every row passes its tap on to the button that already does the job (those buttons live in the Controls sheet, so nothing is
   duplicated); "All controls" opens the full Controls sheet with its search and sections. */
  { const btn = $('#btn-topmore'), mn = $('#dmenu'), more = $('#dm-more'), sub = $('#dm-sub');
    if (btn && mn && more && sub) {
      let moreOpen = false;   // once opened, More stays open for the rest of the session
      const items = () => $$('.dm-it', mn).filter(b => !b.hidden && b.offsetParent !== null);
      const viaSheet = tile => () => { qkOpt(''); qkPaint(); openSheet('sheet-quick'); const t = $('#' + tile); if (t) t.click(); };   // open Controls with that panel showing
      const press = id => () => { const b = $('#' + id); if (b) b.click(); };
      const GO = {
        timing: press('b-timing'), text: press('btn-aa'), live: press('btn-live'), tracks: press('btn-tracks'), settings: () => openSettingsHome(),
        speed: viaSheet('qk-t-speed'), sleep: viaSheet('qk-t-sleep'), sound: () => ambOpen(),
        bm: press('b-bm'), chars: press('b-chars'), hl: press('b-hl'), clips: press('b-clips'), textsync: press('b-textsync'),
        all: () => { qkOpt(''); qkPaint(); openSheet('sheet-quick'); }
      };
      const SRC = { timing: 'b-timing', text: 'btn-aa', live: 'btn-live', tracks: 'btn-tracks', bm: 'b-bm', chars: 'b-chars', hl: 'b-hl', clips: 'b-clips', textsync: 'b-textsync' };
      const fill = () => {   // current values on the rows, and hide a row whose button is not available right now
        try { qkPaint(); } catch (e) { /* values below may be one tap old */ }
        const txt = id => { const n = $('#' + id); return n ? n.textContent : ''; };
        const val = (go, v) => { const n = $('[data-go="' + go + '"] .dm-v', mn); if (n) n.textContent = v; };
        val('speed', txt('qk-v-speed')); val('sleep', txt('qk-v-sleep'));
        val('sound', txt('qk-v-amb') !== 'Off' || txt('qk-v-mus') !== 'Off' ? 'On' : 'Off');
        const lv = $('#btn-live'); val('live', lv && lv.getAttribute('aria-pressed') === 'true' ? 'On' : '');
        Object.keys(SRC).forEach(go => { const r = $('[data-go="' + go + '"]', mn), s = $('#' + SRC[go]); if (r) r.hidden = !s || s.hidden; });
        const tr = $('#dm-timing'); if (tr && !tr.hidden) { tr.dataset.state = el.syncbar.dataset.state || ''; $('.dm-t', tr).textContent = el.sstate.textContent || 'Timing'; }
      };
      const place = () => {
        const r = btn.getBoundingClientRect(), root = document.documentElement;
        mn.style.top = Math.round(r.bottom + 6) + 'px';
        mn.style.maxHeight = Math.max(220, window.innerHeight - r.bottom - 16) + 'px';
        if (root.dir === 'rtl') { mn.style.left = Math.max(8, Math.round(r.left)) + 'px'; mn.style.right = 'auto'; }
        else { mn.style.right = Math.max(8, Math.round(root.clientWidth - r.right)) + 'px'; mn.style.left = 'auto'; }
      };
      const setMore = (on, scroll) => {
        moreOpen = on; sub.hidden = !on; more.setAttribute('aria-expanded', String(on));
        if (on && scroll) requestAnimationFrame(() => mn.scrollTo({ top: Math.max(0, more.offsetTop - 6), behavior: reduceMotion ? 'auto' : 'smooth' }));
      };
      const close = refocus => {
        if (mn.hidden) return;
        mn.hidden = true; btn.setAttribute('aria-expanded', 'false'); if (refocus) btn.focus();
      };
      const open = byKey => {
        if (S.book) VER.dotSeen.add(String(S.book.id)); verChip();
        fill(); setMore(moreOpen, false); mn.hidden = false; place(); mn.scrollTop = 0;
        btn.setAttribute('aria-expanded', 'true');
        if (byKey) { const f = items()[0]; if (f) f.focus(); }
      };
      btn.addEventListener('click', e => { buzz('tick'); if (mn.hidden) open(e.detail === 0); else close(false); });
      mn.addEventListener('click', e => {
        const b = e.target.closest('.dm-it'); if (!b) return;
        e.stopPropagation();   // the app closes other pop-ups on any outside tap; this tap is on purpose
        buzz('tick');
        if (b === more) { setMore(!moreOpen, true); return; }
        const go = GO[b.dataset.go]; if (!go) return;
        close(false); go();
      });
      document.addEventListener('click', e => {   // a tap anywhere else only closes the menu
        if (mn.hidden || e.target.closest('#dmenu, #btn-topmore')) return;
        e.preventDefault(); e.stopPropagation(); close(false);
      }, true);
      document.addEventListener('keydown', e => { if (!mn.hidden && e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(true); } }, true);
      mn.addEventListener('keydown', e => {
        const k = e.key; if (k === 'Tab') { close(false); return; }
        if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(k)) return;
        e.preventDefault();
        const it = items(), i = it.indexOf(document.activeElement); if (!it.length) return;
        it[k === 'Home' ? 0 : k === 'End' ? it.length - 1 : k === 'ArrowDown' ? (i + 1) % it.length : (i - 1 + it.length) % it.length].focus();
      });
      window.addEventListener('resize', () => close(false));
      window.addEventListener('popstate', () => close(false));
    }
  }
