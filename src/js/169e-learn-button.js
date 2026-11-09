  /* ---------- Learn button and the "Study this chapter" sheet (LB) ----------
     A gold "Learn" button floats on the player screen (above the dock, right side). It opens a sheet with the tiles that were
     registered in LearnHub (169b) that want to be in the player (register({ player: false }) keeps one out). Playback is not touched:
     the sheet is a normal .sheet, the audio keeps running, and the saved place is written with persist() (133) when the sheet opens.
     Each tile gets ctx = { book, bookId, chapter, chapterTitle, track, time } in playerSubtitle(ctx) and open(ctx), so a later tool
     can work on this chapter. Back to listening closes the sheet; the player is exactly where it was.
     Hidden: Settings > Reading > "Show the Learn button" off (P.learnBtn === false, saved with wt:prefs, which already syncs),
     reading-only mode (#player.ro), Focus mode (slim dock) and the Focus page. The player menu item "Learn" always works.
     The sheet is built the first time it opens; nothing is drawn while a book plays. Styles 94k-learn-button.css.
     Keeping your place (task 23): opening the sheet only saves the place (persist(true)); it never touches the audio, the speed, the sleep
     timer, the dock or the gestures. When a tile is chosen, a snapshot is taken { bookId, sec, time, playing }; if the narrator was playing it
     is paused for the practice. While a practice screen is open (Review lesson, Today, a sheet such as My Words) a "Back to mm:ss" chip shows.
     The chip, or closing the practice any other way, restores: same track, same second (only if the audio is still paused, so a press on
     Play during practice is never undone), and plays again if it was playing. Leaving the player forgets the snapshot and resumes nothing.
     LB.open()  LB.paint()  LB.ctx()  LB.place (the snapshot, or null)  LB.back() */
  const LB = (() => {
    const fab = h('button', { id: 'lrn-fab', type: 'button', class: 'lrn-fab', 'aria-haspopup': 'dialog', 'aria-label': 'Learn: study this chapter' },
      h('span', { class: 'lrn-ic', 'aria-hidden': 'true' }, '🎓'), h('span', { class: 'lrn-t' }, 'Learn'));
    fab.hidden = P.learnBtn === false;
    el.dock.after(fab);   // next to the dock, so a slim dock (Focus mode) can hide it with CSS
    let sheet = null, sub = null, where = null, grid = null, pl = null, chip = null, timer = 0;
    function ctx() {
      if (!S.book) return null;
      let ci = -1, title = '';
      try {
        const m = S.model;
        if (m && m.chapters && S.curId != null) { ci = m.chapters.findIndex(c => S.curId >= c.start && S.curId < c.end); if (ci >= 0) title = m.chapters[ci].title || ''; }
      } catch (e) { /* no chapter info: the tools get -1 */ }
      return { book: S.book, bookId: String(S.book.id), chapter: ci, chapterTitle: title, track: S.sec, time: audio.currentTime || 0 };
    }
    function build() {
      if (sheet) return;
      sub = h('p', { class: 'lrn-sub', role: 'status' });
      where = h('p', { class: 'lrn-where' });
      grid = h('div', { class: 'lhub-grid lrn-grid' });
      const x = h('button', { class: 'ib', type: 'button', 'aria-label': 'Close', onclick: closeSheets });
      x.innerHTML = '<svg class="ic" aria-hidden="true"><use href="#i-x"/></svg>';
      sheet = h('section', { id: 'sheet-learn', class: 'sheet sheet-learn', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'h-learn', hidden: true },
        h('header', {}, h('h2', { id: 'h-learn' }, 'Study this chapter'), x),
        h('div', { class: 'body' }, h('div', { class: 'lrn-head' }, sub, where), grid,
          h('button', { type: 'button', class: 'wl-btn wl-btn--secondary wl-btn--block lrn-back', onclick: closeSheets }, 'Back to listening')));
      document.body.append(sheet);
    }
    /* ----- keep your place ----- */
    const layersOpen = () => !!(RL.on || TD.on || $$('.sheet').some(x => !x.hidden && x.id !== 'sheet-learn'));
    function restore(p) {
      if (!S.book || String(S.book.id) !== p.bookId) return;
      if (S.sec !== p.sec) { goTrack(p.sec, p.time, p.playing, false); return; }
      if (!audio.paused) return;   // the person pressed Play during practice: leave it
      if (Math.abs((audio.currentTime || 0) - p.time) > 0.3) audio.currentTime = p.time;
      if (p.playing) { try { const r = audio.play(); if (r && r.catch) r.catch(() => {}); } catch (e) { /* the play button still works */ } }
    }
    function finish(doRestore) {
      clearInterval(timer); timer = 0;
      if (chip) chip.hidden = true;
      const p = pl; pl = null;
      if (p && doRestore) { try { restore(p); } catch (e) { /* leave the audio as it is */ } }
    }
    function tick() {   // runs only while a practice screen is being opened or shown
      if (!pl) { finish(false); return; }
      if (el.player.hidden || !S.book || String(S.book.id) !== pl.bookId) { finish(false); return; }
      if (layersOpen()) { pl.seen = true; if (chip) chip.hidden = false; }
      else if (pl.seen || Date.now() - pl.t0 > 1500) finish(true);
    }
    function back() {   // the chip: close the practice screen, return to the same second
      try { if (RL.on) RL.close(); } catch (e) { /* already closed */ }
      try { if (TD.on) TD.close(); } catch (e) { /* already closed */ }
      closeSheets();
      finish(true);
    }
    function remember() {
      const c = ctx(); if (!c) return;
      pl = { bookId: c.bookId, sec: S.sec, time: audio.currentTime || 0, playing: !audio.paused && !audio.ended, seen: false, t0: Date.now() };
      if (pl.playing) { try { audio.pause(); } catch (e) { /* keep playing */ } }
      if (!chip) {
        chip = h('button', { type: 'button', class: 'lrn-chip', hidden: true, onclick: back });
        document.body.append(chip);
      }
      chip.textContent = 'Back to ' + fmt(pl.time);
      clearInterval(timer); timer = setInterval(tick, 400);
    }
    const go = fn => { try { buzz('tick'); } catch (e) { /* no vibration */ } remember(); closeSheets(); setTimeout(fn, 60); };
    function open() {
      const c = ctx(); if (!c) return;
      try { persist(true); } catch (e) { /* the place is still kept by the normal saving */ }
      build();
      sub.textContent = 'Your place is saved at ' + fmt(c.time);
      where.textContent = [c.book.title, c.chapterTitle].filter(Boolean).join(' · ');
      grid.textContent = '';
      LearnHub.list().filter(t => t.inPlayer).forEach(t => { try { grid.append(LearnHub.tile(t, c, go)); } catch (e) { /* skip a broken tile */ } });
      if (!grid.children.length) grid.append(h('p', { class: 'help' }, 'No study tools yet.'));
      openSheet('sheet-learn');
      const f = $('.lhub-tile', grid); if (f) f.focus();
    }
    function paint() {   // button and the Settings switch follow P.learnBtn
      fab.hidden = P.learnBtn === false;
      const c = $('#in-learnbtn'); if (c) c.checked = P.learnBtn !== false;
    }
    fab.addEventListener('click', () => { try { buzz('tick'); } catch (e) { /* no vibration */ } open(); });
    { const c = $('#in-learnbtn'); if (c) c.addEventListener('change', e => { P.learnBtn = e.target.checked; savePrefs(); paint(); }); }
    /* Settings restored from the account can change P.learnBtn while the player is closed: look again each time the player appears. */
    new MutationObserver(paint).observe(el.player, { attributes: true, attributeFilter: ['hidden'] });
    paint();
    return { open, paint, ctx, back, get place() { return pl; } };
  })();
