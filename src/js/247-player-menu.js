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
        sound: () => ambOpen(),
        bm: press('b-bm'), chars: press('b-chars'), hl: press('b-hl'), clips: press('b-clips'), textsync: press('b-textsync'),
        tools: () => toolsOpen()
      };
      /* Speed and Sleep timer open in place under their row (chips + a stepper), using the same setters as the Controls sheet. */
      const XS = {
        speed: { vals: [0.75, 1, 1.25, 1.5, 2, 3], lab: v => v + 'x', cur: () => +P.speed || 1, set: v => setSpeed(v), step: d => { const a = [0.5, 0.6, 0.7, 0.75, 0.8, 0.9, 1, 1.1, 1.2, 1.25, 1.3, 1.4, 1.5, 1.6, 1.75, 1.8, 2, 2.25, 2.5, 3]; const c = +P.speed || 1; let i = a.findIndex(x => x >= c - 1e-6); if (i < 0) i = a.length - 1; setSpeed(a[Math.max(0, Math.min(a.length - 1, i + d))]); } },
        sleep: { vals: [0, 15, 30, 45, 60, 'chapter'], lab: v => v === 0 ? 'Off' : v === 'chapter' ? 'End of track' : v === 60 ? '1 h' : v + ' min', cur: () => S.sleep || 0, set: v => setSleep(v), step: d => { const c = typeof S.sleep === 'number' ? S.sleep : 0; setSleep(Math.max(0, Math.min(240, c + d * 5))); } }
      };
      const xPaint = k => {
        const x = XS[k], box = $('#dm-x-' + k, mn); if (!x || !box) return;
        const cur = x.cur(); box.textContent = '';
        const chips = h('div', { class: 'dm-chips' });
        x.vals.forEach(v => chips.append(h('button', { type: 'button', class: 'dm-chip', 'aria-pressed': String(cur === v), onclick: e => { e.stopPropagation(); buzz('tick'); x.set(v); fill(); xPaint(k); } }, x.lab(v))));
        const odd = !x.vals.includes(cur);
        const nudge = d => h('button', { type: 'button', class: 'dm-step', 'aria-label': d < 0 ? (k === 'speed' ? 'Slower' : 'Shorter') : (k === 'speed' ? 'Faster' : 'Longer'), onclick: e => { e.stopPropagation(); buzz('tick'); x.step(d); fill(); xPaint(k); } }, d < 0 ? '\u2212' : '+');
        box.append(chips, h('div', { class: 'dm-fine' }, nudge(-1), h('span', { class: 'dm-now', 'aria-live': 'polite' }, odd ? (k === 'speed' ? cur + 'x' : cur + ' min') : (k === 'speed' ? 'Custom speed' : 'Custom timer') + ': ' + x.lab(cur)), nudge(1)));
      };
      const xToggle = (k, on) => {
        $$('.dm-x', mn).forEach(b => { const open = b.dataset.x === k && on; b.hidden = !open; const r = $('[data-go="' + b.dataset.x + '"]', mn); if (r) r.setAttribute('aria-expanded', String(open)); });
        if (on) { xPaint(k); const r = $('[data-go="' + k + '"]', mn); if (r) requestAnimationFrame(() => r.scrollIntoView({ block: 'nearest', behavior: reduceMotion ? 'auto' : 'smooth' })); }
      };
      /* "More tools": a small list (name + one line each) for everything the menu does not show; each row passes its tap to the button that already does the job. */
      const TOOLS = [
        ['qk-read', 'Hide player', 'Hide the player and just read'], ['b-words', 'Words', 'Look up words and review the ones you saved'],
        ['b-next', 'Next up', 'Similar books, and what to listen to next'], ['b-find', 'Search this book', 'Find a word or quote and jump to it'],
        ['b-trail', 'Where was I?', 'Go back after a seek, or to where you fell asleep'], ['b-ver', 'Reader', 'Choose who reads this book'],
        ['b-shadow', 'Shadow reading', 'Say a sentence after the narrator and compare'], ['b-quiz', 'Quick quiz', 'Test yourself on the chapter you are in'],
        ['qk-clip', 'Clip', 'Save a short audio snippet to share'], ['b-cal', 'Tap to align', 'Line up the highlight by tapping'],
        ['btn-nr', 'Focus page', 'Just the text and the essentials'], ['btn-howto', 'How to use', 'Double-tap, press and hold, swipe']
      ];
      const toolsOpen = () => {
        const host = $('#tools-body'); if (!host) return;
        host.textContent = '';
        const list = h('div', { class: 'tl-list' });
        TOOLS.forEach(([id, t, d]) => {
          const src = $('#' + id); if (!src || src.hidden) return;
          list.append(h('button', { type: 'button', class: 'tl-row', onclick: () => { buzz('tick'); closeSheets(); setTimeout(() => src.click(), 60); } },
            h('span', { class: 'tl-t' }, t), h('span', { class: 'tl-d' }, d)));
        });
        host.append(list); openSheet('sheet-tools');
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
        fill(); xToggle('', false); setMore(moreOpen, false); mn.hidden = false; place(); mn.scrollTop = 0;
        btn.setAttribute('aria-expanded', 'true');
        if (byKey) { const f = items()[0]; if (f) f.focus(); }
      };
      btn.addEventListener('click', e => { buzz('tick'); if (mn.hidden) open(e.detail === 0); else close(false); });
      mn.addEventListener('click', e => {
        const b = e.target.closest('.dm-it'); if (!b) return;
        e.stopPropagation();   // the app closes other pop-ups on any outside tap; this tap is on purpose
        buzz('tick');
        if (b === more) { setMore(!moreOpen, true); return; }
        if (XS[b.dataset.go]) { const k = b.dataset.go, box = $('#dm-x-' + k, mn); xToggle(k, box.hidden); return; }
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
