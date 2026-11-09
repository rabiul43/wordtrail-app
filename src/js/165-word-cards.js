  /* ---------- My Words: cards with a strength bar (Words sheet > "My words") ----------
     One card per saved word: the word, a hard flag, its status, a four-segment strength bar, up to 2 places where you met it
     (+N more), and a note count. Tap a card to open it: your note, the meaning, Voice, Remove. Long lists go through vlist (031) with
     the sheet body as the scrolling box, so 2000 words keep only the cards near the screen in the page.
     Reads only; it never writes a word. Old entries show correctly: WS.all() hands out upgraded copies, and an entry without
     places or stage still gets a card (its old example sentence and book count as one place; stage comes from WM.stage).
       WC.strength(e)   0-4 filled segments    WC.places(e)   the places (list of { s, bid, bt })
       WC.card(e)       one card (Element)     WC.render(host, words)   fills the list host; vocRender (160) calls it
       WC.keep          scroll position to put back after Remove re-draws the list (set by the card, read by vocRender) */
  const WC = (() => {
    const LABEL = { new: 'New', learning: 'Learning', familiar: 'Familiar', mastered: 'Mastered' };
    const whole = x => (typeof x === 'number' && isFinite(x) && x > 0) ? Math.floor(x) : 0;
    const str = x => (typeof x === 'string' ? x : '');
    const stageOf = e => (WM.STAGES.indexOf(e.st) >= 0 ? e.st : WM.stage(e));
    /* new 0 | learning 1 (just started, or forgotten) or 2 (interval of 3 days or more) | familiar 3 | mastered 4 */
    function strength(e) {
      const st = stageOf(e);
      if (st === 'mastered') return 4;
      if (st === 'familiar') return 3;
      if (st === 'learning') return whole(e.iv) >= 3 ? 2 : 1;
      return 0;
    }
    function places(e) {
      let c = Array.isArray(e.ctx) ? e.ctx.filter(x => x && typeof x === 'object') : [];
      if (!c.length && (str(e.ex) || str(e.bt))) c = [{ s: str(e.ex), bid: str(e.bid), bt: str(e.bt) }];   // an entry that was never upgraded
      return c;
    }
    /* A sentence cut down to about 90 characters around the word. */
    function snippet(s, w) {
      s = str(s).replace(/\s+/g, ' ').trim();
      if (s.length <= 90) return s;
      const i = s.toLowerCase().indexOf(String(w).toLowerCase());
      if (i < 0) return s.slice(0, 89).trimEnd() + '\u2026';
      let a = Math.max(0, i - 40), b = Math.min(s.length, i + String(w).length + 45);
      if (a > 0) { const k = s.indexOf(' ', a); if (k >= 0 && k < i) a = k + 1; }
      if (b < s.length) { const k = s.lastIndexOf(' ', b); if (k > i + String(w).length) b = k; }
      return (a > 0 ? '\u2026' : '') + s.slice(a, b).trim() + (b < s.length ? '\u2026' : '');
    }

    function card(e) {
      const st = stageOf(e), n = strength(e), ps = places(e), note = str(e.note).trim();
      const withText = ps.filter(c => str(c.s).trim()), shown = withText.slice(0, 2), rest = ps.length - shown.length;
      const seg = []; for (let i = 0; i < 4; i++) seg.push(h('span', { class: 'wc__seg' + (i < n ? ' on' : '') }));
      const head = h('button', { class: 'wc__head', type: 'button', 'aria-expanded': 'false' },
        h('span', { class: 'wc__top' },
          h('span', { class: 'wc__id' }, h('strong', { class: 'wc__w' }, str(e.w)),
            e.hard === true ? h('span', { class: 'wc__flag', role: 'img', 'aria-label': 'Hard', title: 'Hard' }, '\u2691') : null,
            str(e.lv) ? h('span', { class: 'vlv' }, e.lv) : null),
          h('span', { class: 'wc__st' }, LABEL[st])),
        h('span', { class: 'wc__bar', role: 'img', 'aria-label': 'Strength ' + n + ' of 4' }, ...seg));
      const card = h('article', { class: 'wl-card wc wc--' + st }, head);
      shown.forEach((c, i) => card.append(h('p', { class: 'wc__q' + (i === 0 ? ' wc__q--1' : '') },
        h('q', {}, snippet(c.s, e.w)), str(c.bt) ? h('span', { class: 'wc__src' }, ' \u00b7 ' + str(c.bt)) : null)));
      const meta = [];
      if (shown.length) { if (rest > 0) meta.push(h('span', {}, '+' + rest + ' more place' + (rest === 1 ? '' : 's') + ' you met it')); }
      else if (ps.length) {
        const names = [...new Set(ps.map(c => str(c.bt).trim()).filter(Boolean))].slice(0, 2);
        meta.push(h('span', {}, ps.length + ' place' + (ps.length === 1 ? '' : 's') + (names.length ? ' \u00b7 ' + names.join(', ') : '')));
      }
      if (note) meta.push(h('span', {}, h('span', { 'aria-hidden': 'true' }, '\u{1F4DD} '), h('span', {}, '1 note')));
      if (meta.length) card.append(h('p', { class: 'wc__meta' }, ...meta));

      let more = null, filled = false;
      const toggle = () => {
        const open = head.getAttribute('aria-expanded') !== 'true';
        head.setAttribute('aria-expanded', String(open));
        if (!more) {
          const meaning = h('div', { class: 'vmean', hidden: true }), box = h('div', { class: 'wc__more' });
          if (note) box.append(h('p', { class: 'wc__note' }, note));
          if (prSpeech) box.append(prButtons(e.w, null));
          box.append(meaning, h('div', { class: 'wc__acts' }, vocSaveBtn(e, true)));
          box.addEventListener('click', ev => { if (ev.target.closest('.chip')) { const sc = card.closest('.body'); WC.keep = sc ? sc.scrollTop : 0; } }, true);
          more = box; more._meaning = meaning; card.append(box);
        }
        more.hidden = !open;
        if (open && !filled) { filled = true; vocFill(more._meaning, e.w); }
      };
      card.addEventListener('click', ev => { if (!ev.target.closest('.wc__more')) toggle(); });
      return card;
    }

    function render(host, words, deco) {   // deco(cardElement, entry) may add to a card (My Words search and collections, 166)
      vlist(host, words, deco ? e => deco(card(e), e) : card, { min: 40, est: 150, scroller: host.closest('.body') || null });
    }
    return { strength, places, snippet, card, render, keep: 0 };
  })();
