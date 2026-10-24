/* Controls sheet: search box, section nav (Listen / Read / Book / Fix), and keeping the highlighted line in view (task 6).
   The sheet is half height and shows only Listen first; the nav jumps to a group and follows the scroll; the search finds any control by name. Items are hidden
   with the class qk-nomatch (never the hidden attribute, which other code uses for its own states). */
  const QS_HAY = { 'qk-t-speed': 'speed faster slower rate', 'qk-t-sleep': 'sleep timer bed night stop', 'qk-t-amb': 'sound ambient rain background effects', 'qk-t-mus': 'music songs',
    'btn-aa': 'text size font aa bigger smaller line spacing theme', 'qk-read': 'hide player text only', 'btn-live': 'translate translation language', 'b-words': 'words dictionary vocabulary look up',
    'btn-tracks': 'tracks chapters offline download', 'b-next': 'next up similar recommend', 'b-trail': 'find my place back seek asleep', 'b-find': 'search find quote',
    'b-textsync': 'timing text and timing sync align', 'qk-clip': 'clip audio snippet share', 'b-bm': 'bookmark note', 'b-chars': 'characters people names', 'b-hl': 'highlights notes quote card',
    'b-clips': 'audio clips record', 'btn-nr': 'focus page classic', 'btn-howto': 'how to gestures help', 'b-shadow': 'shadow reading speak', 'b-quiz': 'quiz test', 'b-ver': 'reader narrator version', 'b-cal': 'tap to align calibrate' };
  function qsApply(q) {
    q = String(q || '').trim().toLowerCase();
    const sh = $('#sheet-quick'), words = q.split(/\s+/).filter(Boolean); let n = 0;
    sh.classList.toggle('qk-searching', !!q);
    $$('.qk-tile, .mrow', sh).forEach(b => {
      const hay = ((b.textContent || '') + ' ' + (b.dataset.n || '') + ' ' + (b.dataset.d || '') + ' ' + (QS_HAY[b.id] || '')).toLowerCase();
      const hit = words.every(w => hay.includes(w));
      b.classList.toggle('qk-nomatch', !hit); if (hit && !b.hidden) n++;
    });
    $$('.qk-grp', sh).forEach(g => g.classList.toggle('qk-empty', !!q && !$$('.qk-tile, .mrow', g).some(b => !b.hidden && !b.classList.contains('qk-nomatch'))));
    $('#qk-nomatch').hidden = !q || n > 0; $('#qk-q-clear').hidden = !q;
  }
  function qsClear(focus) { const i = $('#qk-q'); i.value = ''; qsApply(''); if (focus) i.focus(); }
  function qsKeepLine() {   // the highlighted sentence must not sit behind the sheet
    try {
      const sh = $('#sheet-quick'); if (sh.hidden || el.player.hidden) return;
      const sp = $('.s.now', el.page); if (!sp) return;
      requestAnimationFrame(() => {
        const limit = Math.min(sh.getBoundingClientRect().top, el.reader.getBoundingClientRect().bottom) - 12;
        const bottom = focusOf(sp).getBoundingClientRect().bottom;
        if (bottom > limit) scrollGlide(el.reader.scrollTop + (bottom - limit), false);
      });
    } catch (e) { /* the reader is not ready; nothing to keep in view */ }
  }
  { const sh = $('#sheet-quick'), q = $('#qk-q');
    if (sh && q) {
      q.addEventListener('input', () => qsApply(q.value));
      q.addEventListener('keydown', e => { if (e.key === 'Escape' && q.value) { e.preventDefault(); e.stopPropagation(); qsClear(false); } });   // first Escape clears, second closes
      $('#qk-q-clear').addEventListener('click', () => qsClear(true));
      const body = $('.body', sh), nav = $('#qk-nav');
      let navLock = 0;   // while a jump is gliding, the scroll-follow must not flip the highlighted section back
      const navMark = id => $$('.qk-nb', nav).forEach(b => { if (b.dataset.g === id) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current'); });
      const navSpy = () => {   // highlight the section at the top of the list; at the very bottom, the last one
        if (sh.hidden || Date.now() < navLock) return;
        const gs = $$('.qk-grp', sh); if (!gs.length) return;
        const top = body.getBoundingClientRect().top; let cur = gs[0];
        if (body.scrollTop > 0 && body.scrollTop + body.clientHeight >= body.scrollHeight - 2) cur = gs[gs.length - 1];
        else gs.forEach(g => { if (g.getBoundingClientRect().top - top <= 28) cur = g; });
        navMark($('h3', cur).id);
      };
      let spyRaf = 0;
      body.addEventListener('scroll', () => { if (spyRaf) return; spyRaf = requestAnimationFrame(() => { spyRaf = 0; navSpy(); }); }, { passive: true });
      nav.addEventListener('click', e => {
        const b = e.target.closest('.qk-nb'); if (!b) return;
        const h = $('#' + b.dataset.g), g = h && h.parentElement; if (!g) return;
        buzz('tick'); navMark(b.dataset.g); navLock = Date.now() + 600;
        const pad = parseFloat(getComputedStyle(body).paddingTop) || 0;
        body.scrollTo({ top: body.scrollTop + g.getBoundingClientRect().top - body.getBoundingClientRect().top - pad, behavior: reduceMotion ? 'auto' : 'smooth' });
      });
      q.addEventListener('keydown', e => {   // Enter opens the one control that is left
        if (e.key !== 'Enter' || !q.value.trim()) return;
        const hits = $$('.qk-tile, .mrow', sh).filter(b => !b.hidden && !b.classList.contains('qk-nomatch'));
        if (hits.length === 1) { e.preventDefault(); hits[0].click(); }
      });
      sh.addEventListener('click', e => {   // a result that opens a panel (Speed, Sleep, Sound, Music): leave search so the panel shows
        const t = e.target.closest('.qk-tile[aria-controls]');
        if (t && sh.classList.contains('qk-searching')) { qsClear(false); requestAnimationFrame(() => { const o = $('#' + t.getAttribute('aria-controls')); if (o && !o.hidden) o.scrollIntoView({ block: 'nearest' }); }); }
      });
      try { new MutationObserver(() => { qsClear(false); if (!sh.hidden) { $('.body', sh).scrollTop = 0; navMark('qg-listen'); qsKeepLine(); } }).observe(sh, { attributes: true, attributeFilter: ['hidden'] }); } catch (e) { /* no observer */ }
    }
  }
