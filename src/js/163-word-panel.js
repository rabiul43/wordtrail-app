  /* ---------- Word panel: the card that opens when you press and hold a word (WPNL) ----------
     Layout from the mock-up, built with the learning UI kit (94-learn-ui.css) and 94b-word-panel.css.
       header   the word, its sound (IPA) and part of speech, and the existing Voice and Narrator buttons (prVoice / prNarrator in 160)
       tabs     In this story | Dictionary | Old use      (a tab with nothing in it is not shown)
       story    Meaning, the translation (auto-translated), then Similar, Opposite, Same family   (a section with nothing in it is not shown)
       footer   Save word (the same save as the Save button on the word list) and Back to reading
     The words come from DICT.get (149-dictionary-data.js), the translation from trFetch (160).
     Honest labels: Similar, Opposite and the Dictionary tab are the dictionary's own words. Everything the app works out itself says so:
     the chosen sense of the word says "best guess" (or "first listed" when nothing in the sentence points to a sense), the translation
     says "auto-translated", and Same family says "guessed from spelling" (rules in 164-word-sense.js, no network). Guesses never look like
     dictionary facts: they carry their label and the family chips have a dashed edge.
       WPNL.render(box, w, sentence, sid)   fills box (the .tr-word box of the sentence popup) and returns at once; the dictionary part fills in when it arrives */
  const WPNL = (() => {
    const TABS = [['story', 'In this story'], ['dict', 'Dictionary'], ['old', 'Old use']];
    let seq = 0;
    const pill = t => h('span', { class: 'wl-pill' }, t);
    const badge = t => h('span', { class: 'wp-badge' }, t);
    /* a section label, with a badge when what is under it is a guess made by the app */
    const label = (t, note) => h('h3', { class: 'wp-label' + (note ? ' wp-label--row' : '') }, t, note ? badge(note) : null);
    function chips(title, items, note) {
      if (!Array.isArray(items) || !items.length) return null;
      return h('section', { class: 'wp-sec' }, label(title, note), h('div', { class: 'wp-chips' + (note ? ' wp-chips--guess' : '') }, ...items.map(pill)));
    }
    function storyPane(d, trBox, sentence, fam) {
      const s = SENSE.pick(d, sentence), guess = s && s.basis === 'overlap';
      return h('div', { class: 'wp-pane' },
        s ? h('div', { class: 'wp-card' }, label(guess ? 'Here it means' : 'Meaning', guess ? 'best guess' : 'first listed'), h('p', { class: 'wp-big' }, s.d)) : null,
        trBox,
        chips('Similar', d.syn), chips('Opposite', d.ant), chips('Same family', fam, 'guessed from spelling'));
    }
    /* words known on this device, used only to tell which family forms really occur: this book's word list, saved words, the dictionary answer */
    function familyPool(d) {
      const pool = [];
      try { const b = S.book && VOC.books.get(String(S.book.id)); if (b && Array.isArray(b.w)) b.w.forEach(x => pool.push(x[0])); } catch (e) { /* no book list */ }
      myWords().forEach(x => pool.push(x.w));
      d.meanings.forEach(m => m.defs.forEach(x => (String(x.d + ' ' + x.ex).toLowerCase().match(/[a-z]+/g) || []).forEach(t => pool.push(t))));
      return pool.concat(d.syn, d.ant);
    }
    function dictPane(d) {
      return h('div', { class: 'wp-pane' }, ...d.meanings.map(m => h('section', { class: 'wp-sec' },
        h('h3', { class: 'wp-label' }, m.pos || 'meaning'),
        h('ol', { class: 'wp-defs' }, ...m.defs.map(x => h('li', {}, x.d, x.ex ? h('em', { class: 'wp-ex' }, x.ex) : null))))));
    }
    const oldPane = d => h('div', { class: 'wp-pane' }, h('div', { class: 'wp-card' }, h('h3', { class: 'wp-label' }, 'Origin'), h('p', { class: 'wp-text' }, d.origin)));

    function render(box, w, sentence, sid) {
      const my = ++seq;
      box.textContent = ''; box.hidden = false;
      const e = vocEntry(w, '', sentence);
      const sub = h('div', { class: 'wp-sub' }), tabs = h('div', { class: 'wp-tabs', role: 'tablist', 'aria-label': 'About this word', hidden: true });
      const body = h('div', { class: 'wp-body', 'aria-live': 'polite' }, h('p', { class: 'wp-text dim' }, 'Looking up…'));
      const save = h('button', { class: 'wl-btn wl-btn--primary wl-btn--block', 'data-lrn': true, type: 'button', 'aria-pressed': 'false' });   // Standard mode: look up and translate only, no saving
      const paint = () => { const on = myWords().some(x => x.w === e.w); save.setAttribute('aria-pressed', String(on)); save.textContent = ''; save.append(h('span', { 'aria-hidden': 'true' }, '★'), h('span', {}, on ? 'Saved' : 'Save word')); };
      /* Save keeps the sentence, the book and the chapter (WS.saveWithContext, 147). It never touches the audio: no hold, no seek. */
      const here = () => { const m = S.model && S.model.sents && S.model.sents[sid]; return m && typeof m.ch === 'number' ? m.ch + 1 : null; };   // chapter number = its place in the book
      save.addEventListener('click', () => {
        let on;
        if (WS.get(e.w)) { WS.remove(e.w); on = false; }
        else { WS.saveWithContext(e.w, { s: sentence || e.ex, bid: e.bid, bt: e.bt, ch: here() }, { lv: e.lv, ex: e.ex }); on = true; }
        paint(); vocCount(); toast(on ? 'Saved to My words.' : 'Removed from My words.', 1400);
      });
      const back = h('button', { class: 'wl-panel__link wp-back', type: 'button' }, 'Back to reading');
      back.addEventListener('click', trClose);
      paint();
      box.append(h('div', { class: 'wp' },
        h('div', { class: 'wp-head' }, h('div', { class: 'wp-id' }, h('strong', { class: 'wp-word' }, w), sub), prButtons(w, PR.ref, true)),
        tabs, body, save, back));

      /* the translation card: hidden until a translation arrives (a failed or empty one just leaves it out) */
      const lang = trLang(), tr = h('div', { class: 'wp-card wp-tr', hidden: true });
      trFetch(w, lang).then(t => {
        if (my !== seq || !t) return;
        tr.append(h('span', { class: 'wp-trtext', lang }, t), badge('auto-translated')); tr.hidden = false;
      }).catch(() => { /* no translation: the card stays out */ });

      DICT.get(w).then(r => {
        if (my !== seq) return;
        body.textContent = '';
        if (!r.ok) {
          body.append(h('p', { class: 'wp-text dim' }, r.reason === 'none' ? 'No dictionary entry for this form of the word.' : 'Could not look this word up. Check your connection and try again.'), tr);
          return;
        }
        const d = r.data;
        sub.textContent = [d.ipa, d.pos.slice(0, 2).join(', ')].filter(Boolean).join(' · ');
        const panes = { story: storyPane(d, tr, sentence, Array.isArray(d.fam) ? d.fam : SENSE.family(w, d.pos, familyPool(d))), dict: dictPane(d), old: d.origin ? oldPane(d) : null };
        const shown = TABS.filter(t => panes[t[0]]);
        const pick = k => {
          body.textContent = ''; body.append(panes[k]);
          [...tabs.children].forEach(b => { const on = b.dataset.k === k; b.setAttribute('aria-selected', String(on)); b.classList.toggle('is-selected', on); b.tabIndex = on ? 0 : -1; });
        };
        shown.forEach(t => tabs.append(h('button', { class: 'wl-pill wl-pill--tap', type: 'button', role: 'tab', 'data-k': t[0], onclick: () => pick(t[0]) }, t[1])));
        tabs.addEventListener('keydown', ev => {   // arrow keys move between tabs
          const i = shown.findIndex(t => t[0] === document.activeElement.dataset.k), j = ev.key === 'ArrowRight' ? i + 1 : ev.key === 'ArrowLeft' ? i - 1 : -1;
          if (j >= 0 && j < shown.length) { ev.preventDefault(); pick(shown[j][0]); tabs.children[j].focus(); }
        });
        tabs.hidden = shown.length < 2; pick('story');
      });
    }
    return { render };
  })();
