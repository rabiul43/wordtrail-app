  /* ---------- live translation: follows the narrator, sentence by sentence ----------
     Controls (the three-dot button) > Live translation. A panel shows the sentence being read (highlighted) with the one
     before and the one after in a softer colour. Wide screens: a card in the empty space left of the text.
     Narrow screens and the Focus page: a fixed-height strip above the player controls.
     Translation comes from the on-device browser translator when it is ready (Chrome), else from the same free
     MyMemory service as the long-press translation (trFetch, language from trLang). One request per sentence:
     the next sentence is fetched ahead, so it is usually ready when the narrator gets there. */
  const LT = { box: null, tok: 0, tm: 0, failUntil: 0, lastLang: '' };
  const ltCache = new Map(), ltDev = new Map();
  const ltKey = (lang, t) => lang + '|' + t;
  function ltSent(id) {
    const s = S.model && S.model.sents && S.model.sents[id];
    return s && !s.h && typeof s.t === 'string' && s.t.trim() ? s.t.trim() : '';
  }
  async function ltOnDevice(text, lang, allowDownload) {
    if (!('Translator' in self)) return null;
    const tl = lang.split('-')[0];
    let t = ltDev.get(tl);
    if (t === undefined || (t === null && allowDownload)) {
      t = null;
      try {
        const av = await self.Translator.availability({ sourceLanguage: 'en', targetLanguage: tl });
        if (av === 'available' || (av === 'downloadable' && allowDownload)) t = await self.Translator.create({ sourceLanguage: 'en', targetLanguage: tl });
      } catch (e) { t = null; }
      ltDev.set(tl, t);
    }
    return t ? await t.translate(text) : null;
  }
  async function ltGet(text, lang) {
    const key = ltKey(lang, text);
    if (ltCache.has(key)) return ltCache.get(key);
    let r = null;
    try { r = await ltOnDevice(text, lang, false); } catch (e) { r = null; }
    if (!r) r = await trFetch(text, lang);
    ltCache.set(key, r);
    if (ltCache.size > 400) ltCache.delete(ltCache.keys().next().value);
    return r;
  }
  function ltBuild() {
    const mk = cls => h('p', { class: 'lt-r ' + cls });
    const prev = mk('lt-prev'), cur = mk('lt-cur'), next = mk('lt-next');
    const src = h('p', { class: 'lt-src' });
    const sel = h('select', { 'aria-label': 'Translate into' }, ...TR_LANGS.map(l => h('option', { value: l[0] }, l[1])));
    const x = h('button', { class: 'lt-x', type: 'button', 'aria-label': 'Turn off live translation' }, '\u2715');
    const root = h('div', { class: 'livetr', role: 'region', 'aria-label': 'Live translation', hidden: true },
      h('div', { class: 'lt-top' }, h('strong', {}, 'Live translation'), sel, x), prev, cur, src, next);
    document.body.append(root);
    sel.addEventListener('change', () => {
      P.tlang = sel.value; savePrefs(); LT.failUntil = 0;
      ltOnDevice('Hello', sel.value, true).catch(() => {}).then(() => ltUpdate());   // the tap lets the browser download an on-device language pack
    });
    x.addEventListener('click', () => ltSet(false));
    return (LT.box = { root, prev, cur, src, next, sel });
  }
  function ltVisible() { return !!(S.book && S.model && ((NR.on && !nrEl.root.hidden) || !el.player.hidden)); }
  function ltLayout() {
    const b = LT.box; if (!b) return;
    const side = !NR.on && window.matchMedia('(min-width: 1200px)').matches;
    b.root.classList.toggle('side', side);
    document.documentElement.classList.toggle('lt-strip', !b.root.hidden && !side);
  }
  function ltHide() {
    if (LT.box) LT.box.root.hidden = true;
    clearTimeout(LT.tm); LT.tok++;
    document.documentElement.classList.remove('lt-strip');
  }
  function ltRow(row, text, cls) {
    row.textContent = text || '';
    row.hidden = !text;
    row.classList.toggle('dim', cls === 'dim');
  }
  function ltUpdate() {
    if (!P.liveTr || !ltVisible()) { ltHide(); return; }
    const b = LT.box || ltBuild(), lang = trLang();
    b.root.hidden = false; ltLayout();
    b.sel.value = lang;
    [b.prev, b.cur, b.next].forEach(r => r.setAttribute('lang', lang));
    const id = S.curId, cur = ltSent(id), nxt = ltSent(id + 1), prv = ltSent(id - 1);
    clearTimeout(LT.tm); const tok = ++LT.tok;
    if (!cur) { ltRow(b.prev, ''); ltRow(b.next, ''); b.src.hidden = true; ltRow(b.cur, 'Press play or tap a sentence to begin.', 'dim'); return; }
    const peek = t => (t && ltCache.get(ltKey(lang, t))) || '';
    ltRow(b.prev, peek(prv), 'dim');
    b.src.textContent = cur; b.src.hidden = false;
    const have = peek(cur);
    if (have) ltRow(b.cur, have); else ltRow(b.cur, Date.now() < LT.failUntil ? LT.msg : 'Translating\u2026', 'dim');
    ltRow(b.next, peek(nxt), 'dim');
    if (have && (!nxt || peek(nxt))) return;
    if (Date.now() < LT.failUntil) return;
    LT.tm = setTimeout(async () => {
      try {
        if (!have) { const t = await ltGet(cur, lang); if (tok !== LT.tok) return; ltRow(b.cur, t); }
        if (nxt && !peek(nxt)) { const t = await ltGet(nxt, lang); if (tok !== LT.tok) return; ltRow(b.next, t, 'dim'); }
      } catch (e) {
        if (tok !== LT.tok) return;
        LT.msg = navigator.onLine === false ? 'You are offline. Live translation needs a connection.' : 'Could not translate. The free daily limit may be used up. It will try again in a moment.';
        LT.failUntil = Date.now() + 15000;
        if (!peek(cur)) ltRow(b.cur, LT.msg, 'dim');
      }
    }, have ? 0 : 220);
  }
  function ltSyncMenu() {
    const m = $('#btn-live'); if (!m) return;
    m.setAttribute('aria-pressed', String(!!P.liveTr));
    const l = $('.mi-l', m); if (l) l.textContent = 'Live translation';   // on/off shows through aria-pressed (gold icon), not the label
  }
  function ltSet(on) {
    P.liveTr = !!on; savePrefs(); ltSyncMenu(); LT.failUntil = 0;
    if (on) { ltOnDevice('Hello', trLang(), true).catch(() => {}); ltUpdate(); } else ltHide();
  }
  guideDoc('reading', 'Live translation', 'Controls (the three-dot button) > Live translation shows each sentence in your language while the narrator reads it, with the sentence being read highlighted. Pick the language in the panel.');
  { const m = $('#btn-live');
    if (m) m.addEventListener('click', () => ltSet(!P.liveTr));
    ltSyncMenu();
    window.addEventListener('resize', () => { if (LT.box && !LT.box.root.hidden) ltLayout(); });
    if (window.MutationObserver) {
      const mo = new MutationObserver(() => { if (P.liveTr) ltUpdate(); });
      mo.observe(el.player, { attributes: true, attributeFilter: ['hidden'] });
      mo.observe(nrEl.root, { attributes: true, attributeFilter: ['hidden'] });
    } }
