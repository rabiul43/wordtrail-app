  /* ---------- reveal bubble and Save phrase (RVC, RV) ----------
     Task 32. Two small things on the reader, both on demand, nothing runs while the audio plays.
       Reveal bubble   in English mode every sentence has a small bubble after it (a real button, no text, so copying text is clean).
                       Tap it: the translation opens under that sentence (data-rv, drawn by 95c-reveal-save.css); tap again: it closes.
                       The text comes from TP (160b): saved copy first (memory, then IndexedDB), so a sentence that was translated before
                       opens with no connection. A new sentence asks the providers in the normal order. Both and Translation modes (161b)
                       already show translations, so the bubbles are hidden there. Nothing here touches playback or the sentence highlight.
       Save phrase     a chunky button above the player controls. It shows when you have selected some text in the reader (that is the phrase)
                       or when a translation is open (the phrase is that sentence). Tap: the phrase goes to My Words (WS, 147) with the
                       sentence, book and chapter, plus ph: 1 (more than one word) and tr: { l: language, t: translation } when known.
                       Tap again: it is removed (same as the word card). Saving works offline (it only writes local storage).
     Limits are explained in plain words: the free translation limit (message from 161) and a full My Words list (2,000, the cap in 147,
     which would otherwise drop the oldest word without a word).
     RVC = pure logic (no screen), tested by tools/reveal_save_check.js. RV = the screen part.
       RVC.reveal(text, lang)          -> Promise<{ ok: true, t } | { ok: false, code, msg }>
       RVC.toggle(c, lang, tr)         -> { state: 'saved' | 'removed' | 'full' | 'bad', entry? }     c = { phrase, whole, sent, bid, bt, ch }
       RVC.clean(text, whole) / RVC.ok(phrase) / RVC.later(phrase, lang)   (later: fetch a missing translation and add it as tr)
       RV.closeAll()                   closes every open translation */
  /*RVC-START*/
  const RVC = (() => {
    const MAX_WORDS = 2000, MAX_PHRASE = 240, MAX_TR = 400;   // 2,000 = the cap in WS (147); 240 = the longest sentence kept in a word's places (146)
    const MSG = {
      full: 'My words is full (2,000 saved). Remove a few you know well, then save again.',
      offline: 'You are offline, and this sentence has not been translated yet. Sentences you opened before still work without a connection.'
    };
    const words = t => (String(t).match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu) || []).length;
    /* One line of text. A selection loses the quotes and punctuation around it; a whole sentence keeps them. */
    function clean(t, whole) {
      let s = String(t == null ? '' : t).replace(/\s+/g, ' ').trim();
      if (!whole) s = s.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
      return s;
    }
    const ok = p => typeof p === 'string' && p.length >= 2 && p.length <= MAX_PHRASE && words(p) >= 1;
    function why(e) {
      const c = e && e.code;
      if (c === 'dropped') return { ok: false, code: 'dropped', msg: '' };
      if (c === 'offline') return { ok: false, code: c, msg: MSG.offline };
      if (c === 'limit' || c === 'wait') return { ok: false, code: c, msg: LT_MSG[c] };
      return { ok: false, code: 'fail', msg: LT_MSG.fail };
    }
    function reveal(text, lang) {
      return TP.get(text, lang, { prio: 0, owner: 'rv' }).then(t => (t ? { ok: true, t } : why(null)), why);
    }
    function toggle(c, lang, tr) {
      const p = clean(c && c.phrase, !!(c && c.whole)); if (!ok(p)) return { state: 'bad' };
      if (WS.get(p)) { WS.remove(p); return { state: 'removed' }; }
      if (WS.all().length >= MAX_WORDS) return { state: 'full' };
      WS.saveWithContext(p, { s: c.sent || p, bid: c.bid, bt: c.bt, ch: c.ch }, { lv: '', ex: c.sent || p });
      const t = tr ? String(tr).trim().slice(0, MAX_TR) : '', multi = words(p) > 1;
      const e = WS.update(p, x => { if (multi) x.ph = 1; if (t && !x.tr) x.tr = { l: lang, t }; return x; });
      return { state: 'saved', entry: e || WS.get(p) };
    }
    /* After saving without a translation: one quiet try. Offline, paused or refused: the phrase stays saved without it. */
    function later(phrase, lang) {
      const p = String(phrase || '').trim();
      if (!p || TP.state().state !== 'ok') return Promise.resolve(false);
      return TP.get(p, lang, { prio: 1, owner: 'rv' }).then(t => {
        t = String(t || '').trim().slice(0, MAX_TR);
        if (!t || !WS.get(p)) return false;
        WS.update(p, x => { if (!x.tr) x.tr = { l: lang, t }; return x; }); return true;
      }, () => false);
    }
    return { MAX_WORDS, MAX_PHRASE, MSG, clean, ok, reveal, toggle, later };
  })();
  /*RVC-END*/

  const RV = (() => {
    const open = new Map();   // sentence id -> language it was opened in
    const st = { lang: '', last: -1, cur: null, hold: null, on: null, tm: 0, wrap: null, btn: null };

    /* ----- the bubble ----- */
    function addBubble(sp) {
      const p = sp.parentElement; if (!p || p.tagName !== 'P') return;
      const nx = sp.nextElementSibling; if (nx && nx.classList.contains('rv-b')) return;
      sp.after(h('button', { class: 'rv-b', 'data-lrn': true, type: 'button', 'aria-expanded': 'false', 'aria-label': 'Show translation', title: 'Show translation' }));
    }
    function decorate(n) {
      if (!n || n.nodeType !== 1) return;
      if (n.classList.contains('s')) addBubble(n);
      else if (n.tagName === 'P') n.querySelectorAll('.s').forEach(addBubble);
      else if (n.querySelectorAll) n.querySelectorAll('p > .s').forEach(addBubble);
    }
    function mark(b, on) {
      if (!b) return;
      b.setAttribute('aria-expanded', String(on));
      const t = on ? 'Hide translation' : 'Show translation';
      b.setAttribute('aria-label', t); b.setAttribute('title', t);
    }
    const bubbleOf = sp => { const b = sp && sp.nextElementSibling; return b && b.classList.contains('rv-b') ? b : null; };
    function shut(id) {
      open.delete(id);
      const sp = S.spans && S.spans.get(id);
      if (sp) { sp.classList.remove('rv-open', 'rv-wait'); sp.removeAttribute('data-rv'); const b = bubbleOf(sp); mark(b, false); if (b) b.removeAttribute('aria-busy'); }
      if (st.last === id) st.last = -1;
    }
    function closeAll() { [...open.keys()].forEach(shut); paint(); }
    async function toggleOpen(sp) {
      const id = +sp.getAttribute('data-i');
      if (open.has(id)) { shut(id); paint(); return; }
      const text = ltSent(id); if (!text) return;
      const lang = trLang(), b = bubbleOf(sp); st.lang = lang;
      open.set(id, lang); st.last = id; sp.classList.add('rv-open'); mark(b, true);
      const have = TP.peek(text, lang) || ltCache.get(ltKey(lang, text)) || '';
      if (have) sp.setAttribute('data-rv', have);
      else {
        sp.classList.add('rv-wait'); if (b) b.setAttribute('aria-busy', 'true');
        const r = await RVC.reveal(text, lang);
        if (open.get(id) !== lang) return;   // closed, or the language changed, while it was on its way
        sp.classList.remove('rv-wait'); if (b) b.removeAttribute('aria-busy');
        if (r.ok) sp.setAttribute('data-rv', r.t);
        else { shut(id); if (r.msg) toast(r.msg, 5200); }
      }
      paint();
    }

    /* ----- the phrase to save ----- */
    function fromSelection() {
      const sel = window.getSelection && window.getSelection();
      if (!sel || sel.isCollapsed || !sel.rangeCount) return null;
      const a = sel.anchorNode, n = a && (a.nodeType === 1 ? a : a.parentElement);
      if (!n || !el.page.contains(n)) return null;
      const p = RVC.clean(sel.toString(), false); if (!RVC.ok(p)) return null;
      const sp = n.closest && n.closest('.s');
      return { phrase: p, whole: false, id: sp ? +sp.getAttribute('data-i') : -1, tr: '' };
    }
    function fromOpen() {
      const ids = [...open.keys()]; if (st.last >= 0) ids.push(st.last);
      for (let i = ids.length - 1; i >= 0; i--) {
        const id = ids[i], sp = S.spans && S.spans.get(id);
        if (!sp || !sp.isConnected || !open.has(id)) continue;
        const p = RVC.clean(ltSent(id), true);
        if (RVC.ok(p)) return { phrase: p, whole: true, id, tr: sp.getAttribute('data-rv') || '' };
      }
      return null;
    }
    function ctxOf(c) {
      const m = c.id >= 0 && S.model && S.model.sents && S.model.sents[c.id];
      return { sent: c.id >= 0 ? ltSent(c.id) : '', bid: S.book ? String(S.book.id) : '', bt: S.book ? S.book.title : '', ch: m && typeof m.ch === 'number' ? m.ch + 1 : null };
    }

    /* ----- the Save phrase button ----- */
    function build() {
      const btn = h('button', { class: 'wl-btn wl-btn--primary rv-save', 'data-lrn': true, type: 'button', 'aria-pressed': 'false', hidden: true });
      btn.addEventListener('mousedown', e => e.preventDefault());   // keep the selection while the button is pressed
      btn.addEventListener('pointerdown', () => { st.hold = st.cur; });
      btn.addEventListener('click', onSave);
      document.body.append(btn);
      st.btn = btn;
    }
    function paint() {
      const b = st.btn; if (!b) return;
      const shown = typeof ltVisible === 'function' ? ltVisible() : true;
      const c = st.cur = shown ? (fromSelection() || fromOpen()) : null;
      if (!c) { b.hidden = true; st.on = null; return; }
      const on = !!WS.get(RVC.clean(c.phrase, c.whole));
      b.hidden = false;
      if (on === st.on) return;
      st.on = on; b.setAttribute('aria-pressed', String(on));
      b.textContent = ''; b.append(h('span', { 'aria-hidden': 'true' }, '★'), h('span', {}, on ? 'Saved' : 'Save phrase'));
    }
    function onSave() {
      const c = st.hold || st.cur || fromSelection() || fromOpen(); st.hold = null;
      if (!c) return;
      const x = ctxOf(c), lang = trLang();
      const tr = c.whole ? c.tr : TP.peek(c.phrase, lang);
      const r = RVC.toggle({ phrase: c.phrase, whole: c.whole, sent: x.sent, bid: x.bid, bt: x.bt, ch: x.ch }, lang, tr);
      if (r.state === 'full') toast(RVC.MSG.full, 6000);
      else if (r.state === 'saved') { toast('Saved to My words.', 1600); if (!tr) RVC.later(r.entry ? r.entry.w : c.phrase, lang); }
      else if (r.state === 'removed') toast('Removed from My words.', 1400);
      try { vocCount(); } catch (e) { /* the word list screen is not there yet */ }
      st.on = null; paint();
    }

    /* ----- wiring (only reacts to taps, selections and new text on the page; nothing per audio tick) ----- */
    build();
    el.page.addEventListener('click', e => {
      const b = e.target.closest && e.target.closest('.rv-b'); if (!b) return;
      e.preventDefault(); e.stopPropagation();
      const sp = b.previousElementSibling; if (sp && sp.classList.contains('s')) toggleOpen(sp);
    });
    document.addEventListener('selectionchange', () => { clearTimeout(st.tm); st.tm = setTimeout(paint, 150); });
    document.addEventListener('change', e => { if (e.target && e.target.tagName === 'SELECT') setTimeout(() => { if (open.size && trLang() !== st.lang) closeAll(); }, 0); }, true);   // a new language: the open translations are old
    if (window.MutationObserver) {
      new MutationObserver(recs => { for (const r of recs) for (const n of r.addedNodes) decorate(n); }).observe(el.page, { childList: true, subtree: true });
    }
    el.page.querySelectorAll('p > .s').forEach(addBubble);
    guideDoc('reading', 'Reveal and save', 'In English mode a small bubble sits after each sentence. Tap it to open the translation under the sentence, and tap it again to close it. Translations you opened before open without a connection. Select a few words, or open a translation, and the Save phrase button adds it to My words.');
    return { closeAll, decorate };
  })();
