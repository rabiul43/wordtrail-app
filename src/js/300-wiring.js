  /* ---------- wiring ---------- */
  const SIZE_MIN = 0.9, SIZE_MAX = 1.9; // reader text size limits (rem): used by A- / A+ and pinch-to-zoom
  function init() {
    // Lists cached before cover art was requested have no covers: drop them once so they reload with art.
    try {
      if (store.get('wt:covfix', 0) !== 2) {
        Object.keys(localStorage).filter(k => /^wt:(genre:|home:|q:|seeall:)/.test(k)).forEach(k => localStorage.removeItem(k));
        store.set('wt:covfix', 2);
      }
    } catch (e) { /* storage unavailable */ }
    applyTheme();
    applyTidy();
    applyQuick();
    setSpeed(P.speed);
    speedInit();
    renderRecents();
    initMediaSession();
    initSkipIntro();
    initAutoPrefetch();
    ambInit();
    i18nInit();
    setPlayIcon(false);
    vizInit(); nrInit(); dlgInit();
    initHomeSections();
    psInit();
    initClearButton();
    $$('#tabbar .tab').forEach(b => b.addEventListener('click', () => { pendingBack = null; showTab(b.dataset.tab); }));
    $('#shelf-browse').addEventListener('click', () => showTab('library'));
    $$('#shelf-seg .chip').forEach(b => b.addEventListener('click', () => { shelfMode = b.dataset.m; applyShelfMode(); }));
    $('#seeall-back').addEventListener('click', closeSeeAll);
    initPullToRefresh();
    initRecentSearches();
    initSearchFilters();
    $('#mini-open').addEventListener('click', () => { showView('player'); requestAnimationFrame(() => { try { resnap(); } catch (e) { /* not ready */ } }); });
    $('#mini-play').addEventListener('click', togglePlay);
    /* Close: stop playback and tuck the bar away. It returns when a book is opened or played again. */
    $('#mini-close').addEventListener('click', () => { try { audio.pause(); } catch (e) { /* ignore */ } if (S.book) S._miniOff = S.book.id; miniUpdate(); });
    audio.addEventListener('play', () => { S._miniOff = null; });
    const ssMore = document.querySelector('#sync-status .ss-more');
    if (ssMore) ssMore.addEventListener('toggle', () => { if (ssMore.open && S.book) measureFits(S.book); });
    $('#btn-fav').addEventListener('click', () => { if (S.book) toggleFav({ id: S.book.id, title: S.book.title, authors: S.book.authors, cover: S.book.cover, ia: S.book.ia, total: S.book.total, n: S.book.n, lang: S.book.lang }); });
    window.addEventListener('resize', setTabH);
    if (window.ResizeObserver) { const ro = new ResizeObserver(setTabH); ['#tabbar', '#mini'].forEach(q => { const n = $(q); if (n) ro.observe(n); }); } /* mini-player or tab bar changes height (text size, long title) */
    $('#b-health').addEventListener('click', loadHealth);
    $('#dm-fin').addEventListener('click', dmDeleteFinished);
    $('#dm-all').addEventListener('click', dmDeleteAll);
    $('#b-bkdl').addEventListener('click', bkDownload);
    $('#b-bkrs').addEventListener('click', () => $('#in-bkfile').click());
    $('#in-bkfile').addEventListener('change', e => { const f = e.target.files && e.target.files[0]; e.target.value = ''; if (f) bkRestore(f); });
    $('#in-mdays').addEventListener('change', e => { const d = Math.max(7, Math.min(365, parseInt(e.target.value, 10) || 40)); e.target.value = d; store.set('wt:maint', Object.assign(MAINT(), { days: d })); pushMaint(); });
    $('#in-mlive').addEventListener('change', e => { store.set('wt:maint', Object.assign(MAINT(), { live: e.target.checked })); pushMaint(); });

    $('#search-form').addEventListener('submit', e => { e.preventDefault(); doSearch(el.q.value); });
    el.q.addEventListener('input', () => {
      clearTimeout(typeTimer);
      const v = el.q.value.trim();
      if (v.length >= (SX.ready ? 2 : 3)) typeTimer = setTimeout(() => doSearch(v), SX.ready ? 180 : 550);
    });
    histInit();
    $('#btn-back').addEventListener('click', () => { persist(); renderRecents(); closeSheets(); showView('home'); restoreBack(); document.title = 'Wordtrail'; if (!el.results.hidden) syncHomeRows(true); else syncHomeRows(false); });
    $('#btn-tracks').addEventListener('click', () => openSheet('sheet-tracks'));
    $('#btn-aa').addEventListener('click', () => { buzz('tick'); $('#aa-font').value = $('#in-font').value; openSheet('sheet-aa'); });
    /* the Aa sheet only has the text controls; each one presses the matching Settings control, so the saved values stay in one place */
    $('#aa-size-down').addEventListener('click', () => $('#size-down').click());
    $('#aa-size-up').addEventListener('click', () => $('#size-up').click());
    $('#aa-lh-down').addEventListener('click', () => $('#lh-down').click());
    $('#aa-lh-up').addEventListener('click', () => $('#lh-up').click());
    $('#aa-font').addEventListener('change', e => { const f = $('#in-font'); f.value = e.target.value; f.dispatchEvent(new Event('change', { bubbles: true })); });
    $('#b-more').addEventListener('click', () => { if (S.book) VER.dotSeen.add(String(S.book.id)); verChip(); qkOpt(''); qkPaint(); openSheet('sheet-quick'); });
    $('#b-cal').addEventListener('click', () => { if (!$('#sheet-quick').hidden) closeSheets(); });
    $('#btn-nr').addEventListener('click', () => { if (!$('#sheet-quick').hidden) closeSheets(); });
    $('#b-ver').addEventListener('click', () => openSheet('sheet-versions'));
    $('#dl-go').addEventListener('click', () => { if (DL.running) dlCancel(); else dlStart(); });
    { const dh = $('#b-dl-hint'); if (dh) dh.addEventListener('click', () => { hideDlHint(); dlStart(); }); }
    $('#dl-rm').addEventListener('click', dlRemove);
    window.addEventListener('beforeunload', e => { if (DL.running) { e.preventDefault(); e.returnValue = ''; } });
    $('#b-textsync').addEventListener('click', () => openSheet('sheet-text'));
    $('#btn-howto').addEventListener('click', () => openSheet('sheet-howto'));
    $$('[data-close]').forEach(b => b.addEventListener('click', closeSheets));
    fdInit();
    el.backdrop.addEventListener('click', closeSheets);

    el.play.addEventListener('click', () => { buzz('medium'); togglePlay(); });
    $('#b-prevsent').addEventListener('click', () => { buzz('light'); stepSentence(-1); });
    $('#b-nextsent').addEventListener('click', () => { buzz('light'); stepSentence(1); });
    $('#b-prevtrack').addEventListener('click', () => { buzz('light'); stepTrack(-1); });
    $('#b-nexttrack').addEventListener('click', () => { buzz('light'); stepTrack(1); });
    $('#b-back15').addEventListener('click', () => { buzz('tick'); userSeek(nowT() - 15); });
    $('#b-fwd15').addEventListener('click', () => { buzz('tick'); userSeek(nowT() + 15); });
    el.sleep.addEventListener('click', () => { buzz('medium'); setSleep(SLEEPS[(SLEEPS.indexOf(S.sleep) + 1) % SLEEPS.length]); });
    el.fix.addEventListener('click', fixSync);
    { const td = $('#b-timing');
      if (td) {
        let t = 0;
        const close = () => { clearTimeout(t); el.syncbar.classList.remove('pop'); td.setAttribute('aria-expanded', 'false'); };
        const open = () => { el.syncbar.classList.add('pop'); td.setAttribute('aria-expanded', 'true'); clearTimeout(t); t = setTimeout(() => { if (!S.calibrate && !S.aligning) close(); }, 7000); };
        td.addEventListener('click', e => { e.stopPropagation(); if (!$('#sheet-quick').hidden) { closeSheets(); open(); return; } if (el.syncbar.classList.contains('pop')) close(); else open(); });
        document.addEventListener('click', e => { if (!S.calibrate && !e.target.closest('#syncbar, #b-timing')) close(); });
      } }
    /* Player top bar: the \u22ef button opens the player menu (247-player-menu.js); "All controls" there opens the Controls sheet. */
    el.cal.addEventListener('click', () => {
      S.calibrate = !S.calibrate; syncCalUI();
      if (S.calibrate && !(S.plan[S.sec] && S.plan[S.sec].ids.length)) { S.calibrate = false; syncCalUI(); toast('This track has no text to sync.'); }
    });

    el.seek.addEventListener('input', () => { S.seeking = true; const v = +el.seek.value; el.cur.textContent = fmt(v); el.left.textContent = '-' + fmt(Math.max(0, (audio.duration || S.durs[S.sec] || 0) - v)); el.seek.style.setProperty('--fill', (v / (+el.seek.max || 1) * 100) + '%'); });
    el.seek.addEventListener('change', () => { S.seeking = false; userSeek(+el.seek.value); });

    /* Long-press a sentence to translate it. The tap that follows the press is swallowed (trPressAt). */
    {
      const LONG_MS = 480; let pt = 0, start = null;
      const cancel = () => { clearTimeout(pt); pt = 0; start = null; };
      el.page.addEventListener('pointerdown', e => {
        if (S.calibrate || (e.pointerType === 'mouse' && e.button !== 0)) return;
        const sp = e.target.closest('.s');
        if (!sp) return;
        cancel(); start = { x: e.clientX, y: e.clientY };
        const px = e.clientX, py = e.clientY;
        pt = setTimeout(() => {
          pt = 0; start = null;
          const text = (sp.textContent || '').replace(/\s+/g, ' ').trim();
          if (!text) return;
          trPressAt = performance.now(); trSid = +sp.dataset.i;
          const wd = wordAt(px, py);
          const sel = window.getSelection(); if (sel && sel.removeAllRanges) sel.removeAllRanges();
          trShow(text, wd);
        }, LONG_MS);
      });
      el.page.addEventListener('pointermove', e => { if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 10) cancel(); });
      ['pointerup', 'pointercancel', 'pointerleave'].forEach(t => el.page.addEventListener(t, cancel));
      el.page.addEventListener('scroll', cancel, { passive: true, capture: true });
      el.page.addEventListener('contextmenu', e => { if (performance.now() - trPressAt < 900 && e.target.closest('.s')) e.preventDefault(); });
      el.page.addEventListener('selectstart', e => { if (performance.now() - trPressAt < 900) e.preventDefault(); });
    }
    /* A single tap jumps to the sentence. While audio is playing the jump waits a moment so a
       second tap on the same sentence can be told apart: that double-tap resyncs instead. */
    const DBL_MS = 300;
    let lastTap = { id: -1, t: 0, pending: false }, seekTimer = 0;
    el.page.addEventListener('mousedown', e => { if (e.detail > 1 && e.target.closest('.s')) e.preventDefault(); });
    el.page.addEventListener('click', e => {
      const sp = e.target.closest('.s');
      if (!sp) return;
      if (performance.now() - trPressAt < 700) return; // this click ended a long-press
      const id = +sp.dataset.i;
      const p = S.plan[S.sec];
      if (!p || S.sentSec[id] !== S.sec) return;
      const now = performance.now();
      if (!S.calibrate && lastTap.pending && lastTap.id === id && now - lastTap.t < DBL_MS) {
        clearTimeout(seekTimer); lastTap.pending = false;
        const sel = window.getSelection(); if (sel && sel.removeAllRanges) sel.removeAllRanges();
        buzz('medium');
        resyncSentence(id);
        return;
      }
      if (window.getSelection().toString()) return;
      if (S.calibrate) { syncTap(id); hlpTapped(); return; }
      const go = () => {
        const q = S.plan[S.sec];
        if (!q || S.sentSec[id] !== S.sec) return;
        buzz('light');
        userSeek(sentTime(q, S.sentPos[id]));
        if (audio.paused) audio.play().catch(onPlayFail);
      };
      clearTimeout(seekTimer);
      if (audio.paused) { lastTap.pending = false; go(); }
      else { lastTap = { id, t: now, pending: true }; seekTimer = setTimeout(() => { lastTap.pending = false; go(); }, DBL_MS); }
    });
    const userScrolled = () => { scrollStop(); S.follow = false; checkFollowPill(); };
    el.reader.addEventListener('wheel', () => { scrollStop(); userScrolled(); }, { passive: true });
    el.reader.addEventListener('pointerdown', scrollStop, { passive: true });
    { let y0 = null;
      el.reader.addEventListener('touchstart', e => { y0 = e.touches[0] ? e.touches[0].clientY : null; }, { passive: true });
      el.reader.addEventListener('touchmove', e => {
        if (y0 == null || !e.touches[0]) return;
        const dy = e.touches[0].clientY - y0;
        if (dy < -28) { setMini(true); y0 = e.touches[0].clientY; } else if (dy > 28) { setMini(false); y0 = e.touches[0].clientY; }
      }, { passive: true });
      el.reader.addEventListener('wheel', e => { if (e.deltaY > 8) setMini(true); else if (e.deltaY < -8) setMini(false); }, { passive: true });
      $('#dock-grip').addEventListener('click', () => setMini(!S.mini));
      el.dock.addEventListener('click', e => { if (S.mini && !e.target.closest('button, input')) setMini(false); });
    }
    el.reader.addEventListener('pointerup', () => { if (S.follow) { const sp = S.spans.get(S.curId); if (sp) ensureVisible(sp); } }, { passive: true });
    /* Phones: a plain tap usually fires a few tiny touchmoves. They must not count as "the reader scrolled away",
       or the first tap switches the follow-the-highlight scrolling off. Only a real drag does. */
    { let sx = 0, sy = 0, armed = false;
      el.reader.addEventListener('touchstart', e => { const t = e.touches[0]; if (t) { sx = t.clientX; sy = t.clientY; armed = true; } }, { passive: true });
      el.reader.addEventListener('touchmove', e => {
        const t = e.touches[0]; if (!t || !armed) return;
        if (Math.abs(t.clientY - sy) > 12 || Math.abs(t.clientX - sx) > 12) { armed = false; userScrolled(); }
      }, { passive: true });
    }
    /* The reader changes height on phones (the controls slim down or come back, the browser bar hides or shows).
       Keep the highlighted line in view when that happens while following. */
    if (window.ResizeObserver) {
      let rh = 0;
      new ResizeObserver(() => {
        const h = el.reader.clientHeight;
        if (rh && Math.abs(h - rh) > 4 && S.follow && !el.player.hidden) { const sp = S.spans.get(S.curId); if (sp) ensureVisible(sp, true); }
        rh = h;
      }).observe(el.reader);
    }
    /* Phones: keep reading along without babysitting it.
       1) Any touch on the text turns following off (so you can read ahead or back). After 8 quiet seconds of
          playing, it turns itself back on and the page glides back to the narrator, so it never stays stuck on
          "Back to narrator".
       2) A light safety check twice a second while following: if the sentence being read is completely off the
          screen for any reason (a missed event, a long page whose height was only estimated), jump back to it. */
    { let userT = 0, touching = false;
      const mark = () => { userT = performance.now(); };
      el.reader.addEventListener('touchstart', () => { touching = true; mark(); }, { passive: true });
      el.reader.addEventListener('touchend', () => { touching = false; mark(); }, { passive: true });
      el.reader.addEventListener('touchcancel', () => { touching = false; mark(); }, { passive: true });
      el.reader.addEventListener('wheel', mark, { passive: true });
      el.reader.addEventListener('scroll', () => { if (!S.follow) mark(); }, { passive: true });
      const fwTick = () => {
        if (!S.book || el.player.hidden || audio.paused || touching || document.hidden) return;
        const sp = S.spans.get(S.curId); if (!sp || !sp.isConnected) return;
        if (!S.follow) {
          if (performance.now() - userT > 8000) { S.follow = true; el.follow.hidden = true; ensureVisible(sp); }
          return;
        }
        if (SCR.raf) return;
        const rr = el.reader.getBoundingClientRect(), sr = sp.getBoundingClientRect();
        if (rr.height > 0 && (sr.bottom < rr.top || sr.top > rr.bottom)) ensureVisible(sp, true);
      };
      /* The check only matters while the book is playing with the reader on screen, so the timer only runs then
         (it used to wake the page twice a second all day). */
      let fwT = 0;
      const fwSync = () => {
        const run = !el.player.hidden && !audio.paused && !document.hidden;
        if (run && !fwT) fwT = setInterval(fwTick, 500);
        else if (!run && fwT) { clearInterval(fwT); fwT = 0; }
      };
      audio.addEventListener('play', fwSync); audio.addEventListener('pause', fwSync);
      document.addEventListener('visibilitychange', fwSync);
      try { new MutationObserver(fwSync).observe(el.player, { attributes: true, attributeFilter: ['hidden'] }); } catch (e) { /* no observer */ }
      fwSync();
    }
    let fpRaf = 0;
    el.reader.addEventListener('scroll', () => {
      if (S.follow) return;
      if (P.layoutBatch === false) { checkFollowPill(); return; }
      if (fpRaf) return; // a scroll can fire several times a frame; one check is enough
      fpRaf = requestAnimationFrame(() => { fpRaf = 0; if (!S.follow) checkFollowPill(); });
    }, { passive: true });
    el.follow.addEventListener('click', () => { S.follow = true; el.follow.hidden = true; const sp = S.spans.get(S.curId); if (sp) ensureVisible(sp); });

    /* Pinch the reader with two fingers to change the text size. Same limits as A- / A+; saved when the fingers lift.
       The sentence under the fingers stays where it is on screen while the text reflows. */
    { let p0 = 0, s0 = 1, anchor = null, aTop = 0, raf = 0, want = 0, active = false, lastEnd = 0;
      const dist = t => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
      const apply = () => {
        raf = 0; if (!active) return;
        const v = Math.round(Math.max(SIZE_MIN, Math.min(SIZE_MAX, want)) * 100) / 100;
        if (v === P.size) return;
        P.size = v; document.documentElement.style.setProperty('--read-size', v.toFixed(2) + 'rem');
        if (anchor && anchor.isConnected) el.reader.scrollTop += anchor.getBoundingClientRect().top - el.reader.getBoundingClientRect().top - aTop;
      };
      el.reader.addEventListener('touchstart', e => {
        if (e.touches.length !== 2) return;
        active = true; p0 = dist(e.touches); s0 = P.size; want = s0;
        const mx = (e.touches[0].clientX + e.touches[1].clientX) / 2, my = (e.touches[0].clientY + e.touches[1].clientY) / 2;
        const hit = document.elementFromPoint(mx, my); anchor = hit && hit.closest ? hit.closest('.s, p') : null;
        aTop = anchor ? anchor.getBoundingClientRect().top - el.reader.getBoundingClientRect().top : 0;
        S.follow = false;
      }, { passive: true });
      el.reader.addEventListener('touchmove', e => {
        if (!active || e.touches.length !== 2 || !p0) return;
        e.preventDefault();
        want = s0 * dist(e.touches) / p0;
        if (!raf) raf = requestAnimationFrame(apply);
      }, { passive: false });
      const end = e => {
        if (!active || (e.touches && e.touches.length >= 2)) return;
        active = false; if (raf) { cancelAnimationFrame(raf); raf = 0; }
        lastEnd = performance.now(); anchor = null;
        applyTheme(); savePrefs();
      };
      el.reader.addEventListener('touchend', end, { passive: true });
      el.reader.addEventListener('touchcancel', end, { passive: true });
      el.reader.addEventListener('gesturestart', e => e.preventDefault()); // iOS Safari: no page zoom
      el.reader.addEventListener('click', e => { if (performance.now() - lastEnd < 400) { e.stopPropagation(); e.preventDefault(); } }, true);
    }
    $$('#seg-theme button, #aa-themes button').forEach(b => b.addEventListener('click', () => { P.theme = b.dataset.v; applyTheme(); savePrefs(); }));
    $$('#seg-cover button').forEach(b => b.addEventListener('click', () => {
      P.coverStyle = b.dataset.v; savePrefs(); covSegSync(); coverRefresh();
      if (P.bookColors !== false && S.book && !el.player.hidden) bookAccent(S.book);
      toast('Cover style: ' + ({ modern: 'Modern', auto: 'Auto', se: 'Standard Ebooks', original: 'Original' }[covStyle()]));
    }));
    $('#size-up').addEventListener('click', () => { P.size = Math.min(SIZE_MAX, P.size + 0.08); applyTheme(); savePrefs(); });
    $$('#seg-hl button').forEach(b => b.addEventListener('click', () => { P.hlStyle = b.dataset.v; applyTheme(); savePrefs(); }));
    $('#in-lf').addEventListener('change', e => { P.lineFocus = e.target.checked; applyTheme(); savePrefs(); });
    $$('#seg-lf button').forEach(b => b.addEventListener('click', () => { P.lfScope = b.dataset.v; applyTheme(); savePrefs(); }));
    $$('#hl-colors button').forEach(b => b.addEventListener('click', () => { P.hlColor = b.dataset.c; applyTheme(); savePrefs(); }));
    $('#in-clpro').addEventListener('change', e => { P.clPro = e.target.checked; savePrefs(); applyTheme(); });
    $('#in-wordhl').addEventListener('change', e => { P.wordHl = e.target.checked; savePrefs(); if (!P.wordHl) unwrapWords(); applyTheme(); tick(true); });
    const wsSet = x => { P.wordShift = Math.max(-1.5, Math.min(1.5, Math.round(x * 10) / 10)); savePrefs(); applyTheme(); tick(true); };
    $('#ws-down').addEventListener('click', () => wsSet((P.wordShift || 0) - 0.1)); // the word is early: highlight it later
    $('#ws-up').addEventListener('click', () => wsSet((P.wordShift || 0) + 0.1));   // the word is late: highlight it earlier
    $('#ws-val').addEventListener('click', () => wsSet(0));
    $('#in-wordest').addEventListener('change', e => { P.wordEst = e.target.checked; savePrefs(); unwrapWords(); applyTheme(); tick(true); });
    $('#b-read').addEventListener('click', () => setReadOnly(true));
    $('#b-words').addEventListener('click', () => vocOpen('book'));
    $('#b-find').addEventListener('click', () => { closeSheets(); fdOpenSheet(true); });
    $('#b-chars').addEventListener('click', () => { closeSheets(); charsOpen(); });
    $('#b-shadow').addEventListener('click', shOpen);
    $('#b-quiz').addEventListener('click', () => qzOpen());
    $('#vw-exp').addEventListener('click', exportWords);
    $('#vw-expbm').addEventListener('click', exportBookmarks);
    $('#b-next').addEventListener('click', () => nextOpen(false));
    $$('#seg-words button').forEach(b => b.addEventListener('click', () => { VOC.tab = b.dataset.v; vocRender(); }));
    $('#ro-exit').addEventListener('click', () => setReadOnly(false));
    $('#ro-play').addEventListener('click', togglePlay);
    ['play', 'pause'].forEach(t => audio.addEventListener(t, roPlayLabel));
    $('#lh-up').addEventListener('click', () => { P.lh = Math.min(2.6, +((P.lh || 1.78) + 0.1).toFixed(2)); applyTheme(); savePrefs(); });
    $('#lh-down').addEventListener('click', () => { P.lh = Math.max(1.3, +((P.lh || 1.78) - 0.1).toFixed(2)); applyTheme(); savePrefs(); });
    $('#in-font').addEventListener('change', e => { P.rfont = e.target.value; applyTheme(); savePrefs(); });
    $('#size-down').addEventListener('click', () => { P.size = Math.max(SIZE_MIN, P.size - 0.08); applyTheme(); savePrefs(); });
    const num = (id, apply) => $(id).addEventListener('change', e => { const v = parseFloat(e.target.value); if (isFinite(v)) apply(v); });
    $('#in-lead').addEventListener('change', e => {
      const v = parseFloat(e.target.value);
      S.lead = isFinite(v) ? Math.max(0, Math.min(60, v)) : null;
      replan(false); persist();
    });
    $('#in-awake').addEventListener('change', e => { P.keepAwake = e.target.checked; savePrefs(); wakeSync(); });
    $('#in-nn').addEventListener('change', e => { P.foldSkipped = e.target.checked; savePrefs(); if (S.model) { S.curId = -1; replan(true); } toast(P.foldSkipped ? 'Not-narrated text is folded away' : 'Not-narrated text is shown in the reader'); });
    $('#in-skipcuts').addEventListener('change', e => { P.skipCuts = e.target.checked; savePrefs(); if (S.model) replan(false); toast(P.skipCuts ? 'Intro and outro will be skipped' : 'Intro and outro skipping is off'); });
    $('#in-bcol').addEventListener('change', e => { P.bookColors = e.target.checked; savePrefs(); if (e.target.checked && S.book && !el.player.hidden) bookAccent(S.book); else clearAccent(); });
    $('#in-langs').addEventListener('change', e => { P.otherLangs = e.target.checked; savePrefs(); catPurge(); refreshHome(); toast(P.otherLangs ? 'Showing all languages' : 'Showing English only'); });
    $('#in-worker').addEventListener('change', e => { P.bgWorker = e.target.checked; savePrefs(); BG.reset(); SCP.reset(); });
    $('#in-layout').addEventListener('change', e => { P.layoutBatch = e.target.checked; savePrefs(); });
    $('#in-idle').addEventListener('change', e => { P.idleWork = e.target.checked; savePrefs(); hbSync(); });
    $('#in-net').addEventListener('change', e => { P.fastNet = e.target.checked; savePrefs(); });
    $('#in-skipbtn').addEventListener('change', e => { P.skipBtn = e.target.checked; savePrefs(); paintSkipIntro(); });
    $('#in-smartrw').addEventListener('change', e => { P.smartRewind = e.target.checked; savePrefs(); });
    $('#in-autonext').addEventListener('change', e => { P.autoNext = e.target.value; savePrefs(); AP.key = ''; if (e.target.value !== '0') autoPrefetch(true); });
    $('#in-offforce').addEventListener('click', () => offSetForce(P.offForce !== true));
    $('#in-offauto').addEventListener('click', () => offSetAuto(P.offAuto === false));
    $('#in-autodel').addEventListener('change', e => { P.autoDel = e.target.checked; savePrefs(); toast(P.autoDel ? 'Finished books will be removed from this device.' : 'Finished downloads are kept.', 2500); });
    $('#in-sharestats').addEventListener('change', e => { P.shareStats = e.target.checked; savePrefs(); });
    $('#in-lockseek').addEventListener('change', e => { P.lockSeek = e.target.checked; savePrefs(); initMediaSession(); });
    smWire();   // Settings home: search and Developer unlock (290)
    homeCustInit();   // Customise home: apply the saved switches to the Library tab (105-home-loaders.js)
    $('#in-calm').addEventListener('change', e => { P.calm = e.target.checked; applyTheme(); savePrefs(); toast(P.calm ? 'Calm mode is on.' : 'Calm mode is off.', 2000); try { renderStats(); } catch (x) {} });
    $('#in-haptics').addEventListener('change', e => { P.haptics = e.target.checked; savePrefs(); if (P.haptics) buzz('medium'); });
    $('#in-shake').addEventListener('change', e => {
      const box = e.target; P.shakeSleep = box.checked; savePrefs(); $('#row-shakemin').hidden = !P.shakeSleep;
      if (!P.shakeSleep) { shakeArm(false); return; }
      if (typeof window.DeviceMotionEvent === 'undefined') { P.shakeSleep = false; box.checked = false; $('#row-shakemin').hidden = true; savePrefs(); toast('This device has no motion sensor, so shaking is not available.', 3200); return; }
      shakeArm(true).then(ok => {
        if (!ok) { P.shakeSleep = false; box.checked = false; $('#row-shakemin').hidden = true; savePrefs(); toast('Motion access was not allowed, so shake is off.', 3200); }
        else toast('Shake is on: shake the phone while the sleep timer runs to add ' + (P.shakeMin || 10) + ' min.', 3200);
      });
    });
    $('#in-shakemin').addEventListener('change', e => { P.shakeMin = parseInt(e.target.value, 10) || 10; savePrefs(); });
    $('#in-lowpower').addEventListener('change', e => { P.lowPower = e.target.checked; savePrefs(); wakeSync(); });
    $('#in-diag').addEventListener('change', e => { P.diag = e.target.checked; savePrefs(); if (window.__wtDiag) window.__wtDiag.set(P.diag); diagShow(); });
    $('#b-textsrc').addEventListener('click', () => { $('#textsrc-out').textContent = textSrcReport(); });
    const diagShow = () => { const D = window.__wtDiag; $('#diag-out').textContent = D ? D.text() : 'Diagnostics are not available.'; };
    /* Lazy: Diagnostics buttons are wired the first time the Advanced panel is opened. */
    { const dt = $('#diag-out').closest('details'); let wired = false;
      if (dt) dt.addEventListener('toggle', () => {
        if (!dt.open) return;
        if (!wired) {
          wired = true;
    $('#b-diagrefresh').addEventListener('click', diagShow);
    $('#b-diagclear').addEventListener('click', () => { if (window.__wtDiag) window.__wtDiag.clear(); diagShow(); });
    $('#b-diagcopy').addEventListener('click', async () => {
      const D = window.__wtDiag; if (!D) return;
      const t = D.text();
      try { await navigator.clipboard.writeText(t); toast('Copied.'); return; } catch (e) { /* fall through */ }
      try { const ta = document.createElement('textarea'); ta.value = t; ta.style.cssText = 'position:fixed;opacity:0'; document.body.append(ta); ta.select(); const ok = document.execCommand('copy'); ta.remove(); toast(ok ? 'Copied.' : 'Could not copy; select the text and copy it by hand.'); }
      catch (e) { toast('Could not copy; select the text and copy it by hand.'); }
    });
        }
        diagShow();
      }); }
    // --- performance panel buttons (task 12) ---
    { const br = $('#b-perfrefresh'); if (br) br.addEventListener('click', devStartup); }
    { const bc = $('#b-perfcopy'); if (bc) bc.addEventListener('click', async () => {
      const text = (document.getElementById('dev-perf') || {}).dataset.plain || '';
      try { await navigator.clipboard.writeText(text); toast('Copied.', 1800); return; } catch (e) { /* fall through */ }
      try { const ta = document.createElement('textarea'); ta.value = text; ta.style.cssText = 'position:fixed;opacity:0'; document.body.append(ta); ta.select(); const ok = document.execCommand('copy'); ta.remove(); toast(ok ? 'Copied.' : 'Could not copy.', 2200); }
      catch (e) { toast('Could not copy.', 2200); }
    }); }
    $('#in-lite').addEventListener('change', e => { P.liteGfx = e.target.checked; savePrefs(); applyLite(); });
    $('#in-liteforce').addEventListener('change', e => { P.liteForce = e.target.checked; savePrefs(); applyLite(); });
    $('#in-tidy').addEventListener('change', e => { P.tidyPlayer = e.target.checked; savePrefs(); applyTidy(); paintBookProg(); });
    $('#in-load').addEventListener('change', e => { P.fastLoad = e.target.checked; savePrefs(); });
    $('#in-resume').addEventListener('change', e => { P.resumeCount = parseInt(e.target.value, 10) || 3; savePrefs(); renderRecents(); });
    $('#in-drift').addEventListener('change', e => { P.driftFix = e.target.checked; savePrefs(); drift.pend = null; drift.off.clear(); });
    $('#in-smart').addEventListener('change', e => { P.smartSync = e.target.checked; savePrefs(); });
    $('#in-recap').addEventListener('change', e => { P.recap = e.target.checked; savePrefs(); });
    $('#in-fast').addEventListener('change', e => { P.fastCheck = e.target.checked; savePrefs(); });
    $('#in-auto').addEventListener('change', e => { P.autoStart = e.target.checked; savePrefs(); S.autoTried.clear(); enqueueAlign(S.sec, true); });
    $('#in-bg').addEventListener('change', e => { P.bgAlign = e.target.value; savePrefs(); S.autoTried.clear(); enqueueAlign(S.sec, true); });
    num('#in-outro', v => { S.outro = Math.max(0, Math.min(60, v)); replan(false); persist(); });
    num('#in-nudge', v => { P.nudge = Math.max(-2, Math.min(2, v)); savePrefs(); tick(true); });

    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && sheetOpen()) { sheetBack(); return; }
      if (e.key === 'Escape' && NR.on) { nrClose(); return; }
      if (e.key === '?' && !e.ctrlKey && !e.metaKey && !e.altKey && !e.target.closest('input, textarea, select')) { e.preventDefault(); openSheet('sheet-keys'); return; }
      if (el.player.hidden || sheetOpen() || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.target.closest('input, textarea, select')) return;
      const k = e.key;
      if (k === ' ' && e.target.tagName !== 'BUTTON') { e.preventDefault(); togglePlay(); }
      else if (k === 'ArrowLeft') { e.preventDefault(); e.shiftKey ? userSeek(nowT() - 15) : stepSentence(-1); }
      else if (k === 'ArrowRight') { e.preventDefault(); e.shiftKey ? userSeek(nowT() + 15) : stepSentence(1); }
      else if (k === 'n' || k === 'N') stepTrack(1);
      else if (k === 'p' || k === 'P') stepTrack(-1);
    });

    if (window.ResizeObserver) {
      new ResizeObserver(() => document.documentElement.style.setProperty('--dock-h', el.dock.offsetHeight + 'px')).observe(el.dock);
    }
    hbSync();
    document.addEventListener('visibilitychange', () => { if (document.hidden) persist(); });
    window.addEventListener('pagehide', persist);
    setInterval(moodTick, 10 * 60e3);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) { moodTick(); paintOpen(); } });
  }

  /* startup timing, shown in Settings > Developer: when the first content painted and when the app was ready to use */
  const STARTUP = { ready: Math.round(performance.now()), fcp: 0 };
  try { new PerformanceObserver(l => { l.getEntries().forEach(e => { if (e.name === 'first-contentful-paint') STARTUP.fcp = Math.round(e.startTime); }); }).observe({ type: 'paint', buffered: true }); } catch (e) { /* not supported */ }
  function devStartup() {
    const tbody = document.getElementById('dev-perf-rows'); if (!tbody) return;
    const rows = [];

    // --- Startup timing ---
    rows.push(['FCP (first content)', STARTUP.fcp ? STARTUP.fcp + ' ms' : 'n/a']);
    rows.push(['App ready', STARTUP.ready + ' ms']);

    // --- LCP (Chrome/Edge) ---
    try {
      const lcpEntries = performance.getEntriesByType('largest-contentful-paint');
      if (lcpEntries.length) rows.push(['LCP', Math.round(lcpEntries[lcpEntries.length - 1].startTime) + ' ms']);
    } catch (e) { /* not supported */ }

    // --- Total transfer size from resource timing ---
    try {
      const res = performance.getEntriesByType('resource');
      if (res.length) {
        const total = res.reduce((s, r) => s + (r.transferSize || 0), 0);
        if (total > 0) rows.push(['Transferred (resources)', Math.round(total / 1024) + ' KB']);
      }
    } catch (e) { /* not supported */ }

    // --- DOM HTML size ---
    try {
      rows.push(['Page HTML size', Math.round(document.documentElement.outerHTML.length / 1024) + ' KB']);
    } catch (e) { /* ignore */ }

    // --- JS heap memory (Chrome / Samsung only) ---
    try {
      const m = performance.memory;
      if (m) {
        rows.push(['JS heap used',  Math.round(m.usedJSHeapSize  / 1048576) + ' MB']);
        rows.push(['JS heap limit', Math.round(m.jsHeapSizeLimit / 1048576) + ' MB']);
      }
    } catch (e) { /* not supported */ }

    // --- Device signals (same ones liteWeak reads) ---
    try { const mem = navigator.deviceMemory;       if (mem  != null) rows.push(['Device RAM',  mem  + ' GB']); } catch (e) { /* not supported */ }
    try { const cores = navigator.hardwareConcurrency; if (cores != null) rows.push(['CPU cores', String(cores)]); } catch (e) { /* not supported */ }

    // --- Lite mode status ---
    rows.push(['Lite mode active', document.documentElement.hasAttribute('data-lite') ? 'yes' : 'no']);

    // --- Render to table ---
    tbody.innerHTML = rows.map(([k, v]) =>
      '<tr><td class="dev-perf-k">' + k + '</td><td class="dev-perf-v">' + v + '</td></tr>'
    ).join('');

    // stash plain text for Copy button
    tbody.closest('#dev-perf').dataset.plain = rows.map(([k, v]) => k + ': ' + v).join('\n');
  }
  init();
  uiInit();
  /* after a refresh, go straight back into the book that was open (paused, at the saved position).
     The player is shown at once with a loading note, so the library never flashes in between. */
  const unhideResume = () => document.documentElement.classList.remove('resuming');
  try {
    if (RESUME_OPEN && RESUME_OPEN.id && store.get('wt:onboarded', 0) && el.player.hidden) {
      rememberOpen(RESUME_OPEN); // keep it saved while the book loads
      el.title.textContent = RESUME_OPEN.title || ''; el.sub.textContent = RESUME_OPEN.authors || '';
      el.page.textContent = ''; el.page.append(loadingNote());
      showView('player');
      unhideResume();
      resumeRecent(RESUME_OPEN);
    } else unhideResume();
  } catch (e) { unhideResume(); }
  setTimeout(() => { BOOTING = false; }, 0);
  window.__wordtrail = { S, P, openBook, doSearch, applyText, lvGet, normBook };

  /* ===================== First-run onboarding =====================
     Shows once when wt:onboarded is not set.
     Step 0: reading level (Easy=0 / Medium=1 / Hard=2, or placement quiz).
     Step 1: translation language (pre-selects common ones as chips).
     Results are written into P.readerLvl and P.tlang and saved.
     LF.lvl is seeded from P.readerLvl so "Picked for you" is personalised
     from the very first home-screen load.
     ================================================================ */
  (function initOnboarding() {
    /* --- Already completed? --- */
    if (store.get('wt:onboarded', 0)) return;

    const ov = document.getElementById('ob-overlay');
    if (!ov) return;

    /* --- Placement quiz question bank (Easy=0, Medium=1, Hard=2) ---
       Each test draws 2 easy + 2 medium + 2 hard at random and mixes their order, so the questions differ each time. */
    const QBANK = [
      { tier: 0, q: "Which word means \"to make something easier to understand\"?", right: "simplify", wrong: ["complicate", "amplify", "justify"] },
      { tier: 0, q: "Which word means \"very big\"?", right: "enormous", wrong: ["tiny", "quiet", "narrow"] },
      { tier: 0, q: "\"I am exhausted.\" Exhausted means\u2026", right: "very tired", wrong: ["very happy", "very hungry", "very late"] },
      { tier: 0, q: "What is the opposite of \"ancient\"?", right: "modern", wrong: ["old", "broken", "quiet"] },
      { tier: 0, q: "\"She ___ the door and went in.\" Which word fits best?", right: "opened", wrong: ["open", "opening", "opens"] },
      { tier: 0, q: "What does \"journey\" mean?", right: "a long trip", wrong: ["a small meal", "a loud noise", "a sudden idea"] },
      { tier: 0, q: "\"He was delighted with the gift.\" Delighted means\u2026", right: "very pleased", wrong: ["angry", "confused", "bored"] },
      { tier: 1, q: "\"She spoke with great eloquence.\" Eloquence means\u2026", right: "fluent, persuasive speech", wrong: ["sadness", "speed", "anger"] },
      { tier: 1, q: "\"He had an air of nonchalance.\" Nonchalance means\u2026", right: "Casual indifference", wrong: ["Nervousness", "Elegance", "Determination"] },
      { tier: 1, q: "What does \"reluctant\" mean?", right: "unwilling, hesitant", wrong: ["eager", "generous", "careful"] },
      { tier: 1, q: "\"Her explanation was concise.\" Concise means\u2026", right: "short and clear", wrong: ["long and boring", "confusing", "angry"] },
      { tier: 1, q: "What does \"abandon\" mean?", right: "to leave behind", wrong: ["to protect", "to borrow", "to repeat"] },
      { tier: 1, q: "\"The evidence was ambiguous.\" Ambiguous means\u2026", right: "open to more than one meaning", wrong: ["completely false", "very strong", "easy to find"] },
      { tier: 1, q: "What does \"scarce\" mean?", right: "hard to find, not enough", wrong: ["very loud", "extremely clean", "well known"] },
      { tier: 2, q: "What does \"ephemeral\" mean?", right: "Lasting a very short time", wrong: ["Very heavy", "Extremely cold", "Widely known"] },
      { tier: 2, q: "What does \"solipsism\" mean?", right: "The view that only one's own mind exists", wrong: ["A form of poetry", "Extreme loneliness", "A legal principle"] },
      { tier: 2, q: "What does \"ubiquitous\" mean?", right: "found everywhere", wrong: ["extremely rare", "easily broken", "secretly planned"] },
      { tier: 2, q: "\"He was known for his equanimity.\" Equanimity means\u2026", right: "calm composure", wrong: ["sharp wit", "great wealth", "deep curiosity"] },
      { tier: 2, q: "What does \"obsequious\" mean?", right: "excessively eager to please", wrong: ["fiercely independent", "quietly angry", "careless"] },
      { tier: 2, q: "What does \"perfunctory\" mean?", right: "done with little care or effort", wrong: ["carefully detailed", "openly generous", "deeply emotional"] },
      { tier: 2, q: "\"A laconic reply.\" Laconic means\u2026", right: "using very few words", wrong: ["full of anger", "extremely polite", "confusing"] },
    ];
    const PER_TIER = 2;
    function shuffle(arr) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
    function buildTest() {
      const pick = [];
      [0, 1, 2].forEach(t => pick.push(...shuffle(QBANK.filter(x => x.tier === t)).slice(0, PER_TIER)));
      return shuffle(pick).map(x => ({ q: x.q, opts: shuffle([{ t: x.right, correct: true, tier: x.tier }, ...x.wrong.map(w => ({ t: w, correct: false }))]) }));
    }
    let SHUFFLED = buildTest();

    /* --- State --- */
    let chosenLvl = null;   // null | 0 | 1 | 2
    let quizMode = false;
    let quizIdx = 0;
    const quizScores = [];  // tier of each correct answer

    /* --- DOM refs --- */
    const $ = id => document.getElementById(id);
    const lvBtns  = [0, 1, 2].map(i => $('ob-pick-' + i));
    const plBtn   = $('ob-pick-pl');
    const next0   = $('ob-next-0');
    const step0   = $('ob-step-0');
    const step1   = $('ob-step-1');
    const quiz    = $('ob-quiz');
    const qHd     = $('ob-q-hd');
    const qOpts   = $('ob-q-opts');
    const qNum    = $('ob-q-num');
    const qScore  = $('ob-q-score');
    const qProg   = $('ob-q-prog');
    const langGrid = $('ob-lang-grid');
    const langSel  = $('ob-lang-sel');
    const obDone  = $('ob-done');
    const dots    = [$('ob-dot-0'), $('ob-dot-1')];

    /* --- Language lists --- */
    const COMMON_LANGS = ['bn', 'hi', 'ur', 'ar', 'es', 'fr', 'de', 'pt', 'id', 'zh-CN', 'ja', 'ko'];
    const LANG_NAMES = Object.fromEntries(TR_LANGS);

    /* --- Helpers --- */
    function setDot(i) { dots.forEach((d, k) => d.classList.toggle('on', k === i)); }

    function pickLevel(v) {
      chosenLvl = v;
      quizMode = false;
      lvBtns.forEach((b, i) => b.setAttribute('aria-pressed', String(i === v)));
      plBtn.setAttribute('aria-pressed', 'false');
      quiz.hidden = true;
      next0.disabled = false;
    }

    lvBtns.forEach((b, i) => b.addEventListener('click', () => pickLevel(i)));

    /* --- Placement quiz --- */
    function renderQuestion() {
      if (quizIdx >= SHUFFLED.length) { finishQuiz(); return; }
      const q = SHUFFLED[quizIdx];
      qHd.textContent = q.q;
      qNum.textContent = 'Question ' + (quizIdx + 1) + ' of ' + SHUFFLED.length;
      qScore.textContent = quizScores.filter(t => t !== null).length + ' correct';
      qProg.style.width = Math.round(quizIdx / SHUFFLED.length * 100) + '%';
      qOpts.textContent = '';
      q.opts.forEach(opt => {
        const btn = document.createElement('button');
        btn.className = 'ob-q-opt'; btn.type = 'button'; btn.textContent = opt.t;
        btn.addEventListener('click', () => {
          if (btn.disabled) return;
          Array.from(qOpts.querySelectorAll('button')).forEach(b => b.disabled = true);
          btn.classList.add(opt.correct ? 'correct' : 'wrong');
          if (opt.correct) {
            quizScores.push(opt.tier);
          } else {
            quizScores.push(null);
            const right = q.opts.find(o => o.correct);
            Array.from(qOpts.querySelectorAll('button')).forEach(b => { if (b.textContent === right.t) b.classList.add('correct'); });
          }
          setTimeout(() => { quizIdx++; renderQuestion(); }, 800);
        });
        qOpts.append(btn);
      });
    }

    function finishQuiz() {
      qProg.style.width = '100%';
      const correct = quizScores.filter(t => t !== null);
      /* points: easy 1, medium 2, hard 3 (max 12). 9 or more = Hard, 4 or more = Medium, else Easy */
      const pts = correct.reduce((a, t) => a + t + 1, 0);
      const tier = pts >= 9 ? 2 : pts >= 4 ? 1 : 0;
      const NAMES = ['Easy', 'Medium', 'Hard'];
      qHd.textContent = 'Your level: ' + NAMES[tier];
      qOpts.textContent = '';
      const msg = document.createElement('p');
      msg.style.cssText = 'color:var(--muted);font-size:.88rem;margin:.25rem 0 0';
      msg.textContent = correct.length + ' of ' + SHUFFLED.length + ' correct';
      qOpts.append(msg);
      chosenLvl = tier;
      next0.disabled = false;
      qNum.textContent = 'Done!';
      qScore.textContent = '';
    }

    plBtn.addEventListener('click', () => {
      quizMode = true; chosenLvl = null;
      lvBtns.forEach(b => b.setAttribute('aria-pressed', 'false'));
      plBtn.setAttribute('aria-pressed', 'true');
      quiz.hidden = false;
      next0.disabled = true;
      quizIdx = 0; quizScores.length = 0; SHUFFLED = buildTest();
      renderQuestion();
    });

    /* --- Step navigation --- */
    function goStep1() {
      step0.hidden = true; step1.hidden = false;
      setDot(1);
    }
    /* Back inside onboarding: step 2 returns to step 1, an open placement quiz returns to the level choices.
       On the first step with nothing open, Back behaves as usual. */
    OB.layers = () => ov.hidden ? 0 : (!step1.hidden || !quiz.hidden) ? 1 : 0;
    OB.back = () => {
      if (!step1.hidden) { step1.hidden = true; step0.hidden = false; setDot(0); }
      else if (!quiz.hidden) { quiz.hidden = true; quizMode = false; plBtn.setAttribute('aria-pressed', 'false'); next0.disabled = chosenLvl === null; }
    };

    next0.addEventListener('click', goStep1);

    /* --- Build language grid --- */
    let pickedLang = null;

    /* --- The app in the person's own language (only for languages that have a `suggest` entry, e.g. Bengali) ---
       1) Top of the card: if the browser prefers such a language, ask once, in that language, so a person who cannot read English can answer.
       2) Step 2: after they pick it as their native language, one tap to use the app in it too.
       Either choice is saved as the app language (P.uiLang), the same setting as Settings > Reading > Language. */
    (function appLangOffer() {
      const c = i18nSuggest(); if (!c) return;
      const w = I18N_SUG[c], box = document.createElement('div'), q = document.createElement('p'), row = document.createElement('div');
      box.className = 'ob-ui'; box.lang = c; q.textContent = w.q; row.className = 'ob-ui-btns';
      const yes = document.createElement('button'), no = document.createElement('button');
      yes.type = no.type = 'button'; yes.className = 'yes'; yes.textContent = w.yes; no.textContent = w.no || 'English';
      yes.addEventListener('click', () => { setUiLang(c); box.remove(); });
      no.addEventListener('click', () => { setUiLang('en'); box.remove(); });   // "en" is saved too, so we do not ask again
      row.append(yes, no); box.append(q, row);
      const card = ov.querySelector('.ob-card'); if (card) card.prepend(box);
    })();
    const alsoBtn = document.createElement('button');
    alsoBtn.type = 'button'; alsoBtn.className = 'ob-lang ob-also'; alsoBtn.hidden = true;
    langSel.after(alsoBtn);
    function alsoUpdate() {
      const c = String(pickedLang || '').toLowerCase().split('-')[0];
      if (I18N_SUG[c] && P.uiLang !== c) {
        alsoBtn.hidden = false; alsoBtn.lang = c; alsoBtn.textContent = I18N_SUG[c].also;
        alsoBtn.onclick = () => { setUiLang(c); alsoBtn.hidden = true; };
      } else alsoBtn.hidden = true;
    }

    function pickLang(code) {
      pickedLang = code; alsoUpdate();
      Array.from(langGrid.querySelectorAll('.ob-lang')).forEach(b => b.setAttribute('aria-pressed', String(b.dataset.l === code)));
      langSel.value = '';
    }

    COMMON_LANGS.forEach(code => {
      if (!LANG_NAMES[code]) return;
      const btn = document.createElement('button');
      btn.className = 'ob-lang'; btn.type = 'button';
      btn.dataset.l = code;
      btn.setAttribute('aria-pressed', 'false');
      btn.textContent = LANG_NAMES[code];
      btn.addEventListener('click', () => pickLang(code));
      langGrid.append(btn);
    });

    /* Dropdown for other languages */
    langSel.append(new Option('Other language…', ''));
    TR_LANGS.forEach(([code, name]) => {
      if (!COMMON_LANGS.includes(code)) langSel.append(new Option(name, code));
    });
    langSel.addEventListener('change', () => {
      if (!langSel.value) return;
      pickedLang = langSel.value; alsoUpdate();
      Array.from(langGrid.querySelectorAll('.ob-lang')).forEach(b => b.setAttribute('aria-pressed', 'false'));
    });

    /* Pre-select based on browser language */
    (function preselectLang() {
      const d = (navigator.language || 'en').toLowerCase();
      const hit = TR_LANGS.find(([c]) => d === c.toLowerCase() || (d.slice(0, 2) === c.slice(0, 2) && c.indexOf('-') < 0));
      if (hit && hit[0] !== 'en') {
        if (COMMON_LANGS.includes(hit[0])) { setTimeout(() => pickLang(hit[0]), 0); }
        else { setTimeout(() => { langSel.value = hit[0]; pickedLang = hit[0]; }, 0); }
      }
    })();

    /* --- Finish onboarding --- */
    function finish() {
      /* Write level into LF.lvl so Picked-for-you is filtered from the start */
      if (chosenLvl !== null) {
        LF.lvl.clear();
        LF.lvl.add(chosenLvl);
        /* Pre-load levels data so the filter can work */
        LVL.load().then(() => { loadPicks(); }).catch(() => {});
      }
      /* Write translation language */
      if (pickedLang) P.tlang = pickedLang;
      /* Persist level choice in prefs so it's restored next session */
      P.readerLvl = chosenLvl;
      savePrefs();
      store.set('wt:onboarded', 1);
      ov.style.transition = 'opacity .22s ease';
      ov.style.opacity = '0';
      setTimeout(() => { ov.hidden = true; ov.style.transition = ''; ov.style.opacity = ''; }, 240);
    }

    obDone.addEventListener('click', finish);
    /* "Skip for now" (bottom of the card, every step): no level picked yet -> Medium; a level already picked or won in the quiz is kept. Then onboarding is marked done by finish(). */
    $('ob-skip-now').addEventListener('click', () => { if (chosenLvl === null) chosenLvl = 1; finish(); });

    /* --- Show the overlay --- */
    /* Restore level pref if user somehow has one (e.g. from backup) and is seeing onboarding again */
    if (P.readerLvl != null) pickLevel(P.readerLvl);
    if (P.tlang) setTimeout(() => {
      if (COMMON_LANGS.includes(P.tlang)) pickLang(P.tlang);
      else { langSel.value = P.tlang; pickedLang = P.tlang; }
    }, 0);

    ov.hidden = false;
  })(); /* end initOnboarding */

  /* --- On subsequent loads, seed LF.lvl from the saved readerLvl pref --- */
  (function applyReaderLvl() {
    if (P.readerLvl != null && !store.get('wt:onboarded', 0)) return; // onboarding handles it
    if (P.readerLvl != null && LF.lvl.size === 0) {
      LF.lvl.add(P.readerLvl);
      /* Kick off Picked-for-you once LVL data is ready */
      LVL.load().then(() => { if (!el.home.hidden) loadPicks(); }).catch(() => {});
    }
  })();
