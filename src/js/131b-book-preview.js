  /* ---------- Book preview: "Will this book be too hard?" (BPV, Task 39) ----------
     A block on the book page (between the top of the page and "About this book"), from the mock-up "Book preview":
       a ring with the share of the words you probably know, "Learn these first" chips (up to 15), a short time note,
       and two buttons: LEARN N WORDS FIRST and START LISTENING NOW. It says "Estimate": it is a rough guess, not a test.
     Data (all already in the app, nothing new is fetched except what the book page loads anyway):
       vocab/<book id>.json   the hard words of the book: [word, CEFR level, times in the book, example]  (vocBook, 160)
       My words (WS, 147)     a word counts as known when its stage is familiar or mastered (WM.stage, 146)
       levels.json (LVL, 070) the reading level of the book (Easy / Medium / Hard): how much of the running text is hard words
     The estimate (BPC.estimate): f = the share of the listed hard words (counted by how often they occur) that you do not know yet.
       The share of everyday words you do not know is taken as 0. Hard words are SHARE[level] of the running text (8 / 15 / 25 %),
       so  percent = 100 - SHARE x f x 100,  never shown above 99. These numbers are a rough guess, which is why the block says "Estimate".
     The block stays hidden when the book has no vocabulary file (or fewer than 8 listed words), no reading level, or on any error.
     Lazy: nothing runs at start-up. The page asks for the block when a book page is drawn; the work starts half a second later, in one go,
       and is a few hundred additions. Playback is never touched.
     LEARN N WORDS FIRST adds the words you have not saved yet to My words (with the example from the book), then opens the Review lesson
       (RL.start, 168; the old Review tab if it cannot start). The lesson also asks other words that are due.
       BPV.section(b)   returns the (still hidden) section for the book page; it fills itself in when the data is ready
       BPV.model(b)     promise of { pct, n, learn: [ { w, lv, c, ex } ], min } or null (later tasks can reuse it)
     Pure parts between the BPC-START / BPC-END markers: BPC.clean, BPC.estimate, BPC.learn, BPC.minutes.
     Styles src/css/94o-book-preview.css, test: node tools/book_preview_check.js, strings in src/i18n/bn.json.
     Remove this file, the CSS file, their build.py lines and the BPV.section call in drawDetail (131) to go back. */
  const BPC = (() => {
    /*BPC-START*/
    const SHARE = [0.08, 0.15, 0.25], MIN_WORDS = 8, MAX_LEARN = 15, SEC_PER_WORD = 12;
    const LV = { A1: 1, A2: 2, B1: 3, B2: 4, C1: 5, C2: 6 };
    /* the vocabulary file -> [{ w, lv, c, ex }], only real words, once each, whatever else is in it */
    function clean(list) {
      const seen = new Set(), out = [];
      (Array.isArray(list) ? list : []).forEach(x => {
        if (!Array.isArray(x) || typeof x[0] !== 'string') return;
        const w = x[0].trim().toLowerCase();
        if (!/^[a-z][a-z'’-]*$/.test(w) || seen.has(w)) return;
        seen.add(w); out.push({ w, lv: typeof x[1] === 'string' ? x[1] : '', c: Math.max(1, Math.floor(+x[2]) || 1), ex: typeof x[3] === 'string' ? x[3] : '' });
      });
      return out;
    }
    /* known: a Set of lower-case words you know. tier: 0 Easy, 1 Medium, 2 Hard. Returns null when there is too little to say anything. */
    function estimate(words, known, tier) {
      if (!words || words.length < MIN_WORDS || !(tier >= 0 && tier <= 2)) return null;
      let all = 0, miss = 0;
      words.forEach(x => { all += x.c; if (!known.has(x.w)) miss += x.c; });
      const f = all ? miss / all : 0;
      return { pct: Math.max(1, Math.min(99, Math.round(100 - SHARE[tier] * f * 100))), f };
    }
    /* the words to learn first: not known yet, the most frequent first, then the higher level, then A-Z */
    function learn(words, known, max) {
      return words.filter(x => !known.has(x.w)).sort((a, b) => b.c - a.c || (LV[b.lv] || 0) - (LV[a.lv] || 0) || (a.w < b.w ? -1 : 1)).slice(0, max > 0 ? max : MAX_LEARN);
    }
    const minutes = n => Math.max(1, Math.ceil(n * SEC_PER_WORD / 60));
    /*BPC-END*/
    return { SHARE, MIN_WORDS, MAX_LEARN, SEC_PER_WORD, clean, estimate, learn, minutes };
  })();

  const BPV = (() => {
    const CHIPS = 5, MAX_WORDS = 2000;   // chips shown before "+N more"; the My words limit (WS keeps 2000)
    const known = () => {
      const s = new Set();
      try { WS.all().forEach(e => { const m = WM.migrate(e); if (m && typeof m.w === 'string' && (m.st === 'familiar' || m.st === 'mastered')) s.add(m.w.trim().toLowerCase()); }); } catch (e) { /* no saved words */ }
      return s;
    };
    async function model(b) {
      if (!b || !b.id) return null;
      await LVL.load().catch(() => {});
      const v = LVL.map.get(String(b.id)); if (!v) return null;
      const d = await vocBook(String(b.id)); if (!d) return null;
      const words = BPC.clean(d.w), k = known(), est = BPC.estimate(words, k, v[0]); if (!est) return null;
      const learn = BPC.learn(words, k, BPC.MAX_LEARN);
      return { pct: est.pct, n: learn.length, learn, min: BPC.minutes(learn.length) };
    }
    function ring(pct) {
      const C = 2 * Math.PI * 40, w = h('div', { class: 'bpv-ring', role: 'img', 'aria-label': pct + '%' });
      w.innerHTML = '<svg viewBox="0 0 100 100" aria-hidden="true"><circle class="bpv-track" cx="50" cy="50" r="40"/><circle class="bpv-arc" cx="50" cy="50" r="40" transform="rotate(-90 50 50)" stroke-dasharray="' + (C * pct / 100).toFixed(1) + ' ' + C.toFixed(1) + '"/></svg>';
      w.append(h('span', { class: 'bpv-pct', 'aria-hidden': 'true' }, pct + '%'));
      return w;
    }
    function learnNow(b, m) {
      const have = new Set(WS.all().map(e => String(e.w || '').toLowerCase())), fresh = m.learn.filter(x => !have.has(x.w));
      if (have.size + fresh.length > MAX_WORDS) { toast('My words is full. Remove a few words first.', 3200); return; }
      fresh.forEach(x => WS.saveWithContext(x.w, { s: x.ex, bid: String(b.id), bt: b.title }, { lv: x.lv, ex: x.ex }));
      try { vocCount(); } catch (e) { /* word count label not ready */ }
      if (fresh.length) toast('Added ' + fresh.length + (fresh.length === 1 ? ' word' : ' words') + ' to My words.', 2200);
      if (!RL.start()) vocOpen('review');   // the Review lesson (168); the old Review tab is the fallback
    }
    function paint(sec, b, m) {
      sec.textContent = '';
      const chips = h('div', { class: 'bpv-chips' });
      const draw = all => {
        chips.textContent = '';
        const shown = all ? m.learn : m.learn.slice(0, CHIPS);
        shown.forEach(x => chips.append(h('span', { class: 'wl-pill' }, x.w)));
        if (!all && m.learn.length > CHIPS) chips.append(h('button', { class: 'wl-pill wl-pill--tap', type: 'button', 'aria-expanded': 'false', onclick: () => draw(true) }, '+' + (m.learn.length - CHIPS) + ' more'));
      };
      draw(false);
      sec.append(
        h('div', { class: 'wl-card bpv-card' }, ring(m.pct), h('div', { class: 'bpv-txt' },
          h('h2', { class: 'bpv-h' }, 'You probably know ' + m.pct + '% of the words'),
          h('p', { class: 'bpv-sub' }, 'Based on the words you saved and marked as known'),
          h('span', { class: 'wp-badge' }, 'Estimate'))),
        m.n ? h('h3', { class: 'bpv-label' }, 'Learn these first') : null, m.n ? chips : null,
        m.n ? h('div', { class: 'wl-card bpv-note' }, h('span', { class: 'bpv-ic', 'aria-hidden': 'true' }, '⏱'),
          h('p', {}, 'About ' + m.min + (m.min === 1 ? ' minute' : ' minutes') + ' to learn ' + m.n + (m.n === 1 ? ' word' : ' words') + '. Then the first chapters will feel much easier.')) : null,
        h('div', { class: 'bpv-acts' },
          m.n ? h('button', { class: 'wl-btn wl-btn--primary wl-btn--block', type: 'button', onclick: () => learnNow(b, m) }, 'Learn ' + m.n + (m.n === 1 ? ' word' : ' words') + ' first') : null,
          h('button', { class: 'wl-btn wl-btn--secondary wl-btn--block', type: 'button', onclick: () => openBook(b, { play: true }) }, 'Start listening now')));
      sec.hidden = false;
    }
    function section(b) {
      const sec = h('section', { class: 'bpv', hidden: true, 'aria-label': 'Book preview' });
      if (b && b.id) setTimeout(() => { model(b).then(m => { if (m && DET.book === b) paint(sec, b, m); }).catch(() => { /* no preview: the block stays hidden */ }); }, 500);
      return sec;
    }
    return { section, model };
  })();
