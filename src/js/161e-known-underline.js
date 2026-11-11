  /* ---------- Known words: underline, tap card and coverage chip (KUC, KU) ----------
     Task 41, built on the known-words store of Task 40 (KW, 148e). Setting "Underline new words" (P.knownUl, default OFF; Settings > Reading).
     On: a word of the book's hard-word list that you have not marked as known gets a soft dotted line. Tap it: a card shows the meaning,
     a speaker button, I KNOW IT and LEARN. A chip above the text says how much of the chapter you know, such as "94% known".
     Off: nothing runs, no chip, no lines. Taps behave as before.
     "New word"  a word in vocab/<book id>.json (the hard words of the book, vocBook in 160, saved on the device, so it works offline) that is
                 not known. Known = KW.isKnown(word) (I know it) or a My Words entry whose stage is familiar or mastered (as in BPV, 131b).
                 Also found: simple forms (tremble, trembled, trembling, foe's). Everyday words are never marked and count as known.
     Coverage    100 x (words of the chapter - occurrences of new words) / words of the chapter. Never 100 while one new word is left, never
                 shown for a chapter under 50 words, and not shown when the book has no word list (fewer than 8 words). It says "known" because
                 it counts every everyday word as known: it is a guide, not a test. Hidden in Calm mode (it is a score); the lines stay.
     When it runs  once when a chapter has been built (kuChapter, called by buildSents in 150, next to owChapter). The text is matched from the book
                 model in slices of about 6 ms when the browser is idle; the answer is kept per book + chapter (memory, 8 chapters), so opening the
                 chapter again matches nothing. NEVER on an audio tick. I know it only repaints the sentences that hold that word (no new matching).
     Lines       CSS Custom Highlights wt-new (dotted) and wt-new-sel (the tapped word), drawn with OW.rangeOf (161d): the sentence spans are not
                 touched. A browser without the API shows no lines (and no tap card); the chip still works.
     Storage     none of its own. I KNOW IT = KW.add(word) (wt:known, synced in 295). LEARN = WS.saveWithContext (wt:words). Setting = wt:prefs.
     Taps        a tap on a marked word is for the card (like 161d, which is checked first when a word is both old and new). A tap away from an
                 open card only closes it.
       KUC.index(list) / forms(token) / match(M, text) / summary(counts, total, isKnown)    pure, tested by tools/known_underline_check.js
       KU.run(i) / KU.repaint(id) / KU.showCard(hit) / KU.closeCard() / KU.model()
         KU.model() -> { pct, unknown, words, total, list: [ { w, n } ] } for the open chapter (list = new words, most frequent first), or null
     Remove this file, its CSS, the card HTML, the chip strip, the settings row, their build.py lines, the 3 small hooks (kuChapter, kuRepaint in 150;
     kuClose in 161d) and the OW.rangeOf / OW.hitAt exports in 161d to go back. */
  const KUC = (() => {
    /*KUC-START*/
    const MIN_WORDS = 8, MIN_TOKENS = 50;
    const TOK = /\p{L}+(?:['’-]\p{L}+)*/gu;
    const norm = s => String(s).toLowerCase().replace(/’/g, "'");
    const OK = /^[a-z][a-z'-]*$/;
    /* the vocabulary file list -> Map of lower-case word -> { w, lv, ex }; only real words, once each; null when the list is too short to say anything */
    function index(list) {
      const M = new Map();
      for (const x of Array.isArray(list) ? list : []) {
        if (!Array.isArray(x) || typeof x[0] !== 'string') continue;
        const w = norm(x[0]).trim();
        if (!OK.test(w) || M.has(w)) continue;
        M.set(w, { w, lv: typeof x[1] === 'string' ? x[1] : '', ex: typeof x[3] === 'string' ? x[3] : '' });
      }
      return M.size >= MIN_WORDS ? M : null;
    }
    /* the forms a token may come from, the token itself first: foe's, gazes, carried, trembled, stopped, trembling, silently */
    function forms(t) {
      const out = [t]; let b = t;
      if (/'s$/.test(b)) { b = b.slice(0, -2); out.push(b); }
      if (b.length < 4) return out;
      const add = x => { if (x.length >= 3) out.push(x); };
      if (/ies$/.test(b)) add(b.slice(0, -3) + 'y');
      if (/ied$/.test(b)) add(b.slice(0, -3) + 'y');
      if (/(?:s|x|z|ch|sh)es$/.test(b)) add(b.slice(0, -2));
      if (/[^s]s$/.test(b)) add(b.slice(0, -1));
      if (/ed$/.test(b)) { const r = b.slice(0, -2); add(r); add(r + 'e'); if (/(.)\1$/.test(r)) add(r.slice(0, -1)); }
      if (/ing$/.test(b)) { const r = b.slice(0, -3); add(r); add(r + 'e'); if (/(.)\1$/.test(r)) add(r.slice(0, -1)); }
      if (/ly$/.test(b)) add(b.slice(0, -2));
      return out;
    }
    /* One sentence: how many words it has, and the words of the list in it: { n, hits: [ { s, e, w } ] } (w = the word of the list; s..e = where it is in the text) */
    function match(M, text) {
      const hits = []; let n = 0, m; TOK.lastIndex = 0; text = String(text || '');
      while ((m = TOK.exec(text))) {
        n++;
        const t = norm(m[0]); let w = '';
        if (M.has(t)) w = t;
        else if (t.length > 3) for (const c of forms(t)) if (M.has(c)) { w = c; break; }
        if (w) hits.push({ s: m.index, e: m.index + m[0].length - (w !== t && t === w + "'s" ? 2 : 0), w });
      }
      return { n, hits };
    }
    /* counts: Map word -> times in the chapter; total: words in the chapter. -> { pct, unknown, words, total } or null (too short to say) */
    function summary(counts, total, isKnown) {
      if (!(total >= MIN_TOKENS)) return null;
      let unknown = 0, words = 0;
      counts.forEach((n, w) => { if (!isKnown(w)) { unknown += n; words++; } });
      const pct = unknown > 0 ? Math.min(99, Math.round(100 * (total - unknown) / total)) : 100;
      return { pct: Math.max(0, pct), unknown, words, total };
    }
    /*KUC-END*/
    return { MIN_WORDS, MIN_TOKENS, index, forms, match, summary };
  })();

  const KU = (() => {
    const st = { idx: new Map(), cache: new Map(), tok: 0, C: null, hl: null, sel: null, rng: new Map(), ws: new Set(), cur: null, seq: 0, card: null, cov: null };
    const can = () => typeof Highlight !== 'undefined' && !!(window.CSS && CSS.highlights);
    const on = () => P.knownUl === true;
    const idle = f => (window.requestIdleCallback ? requestIdleCallback(f, { timeout: 600 }) : setTimeout(f, 40));
    function lines() { if (!st.hl) { st.hl = new Highlight(); CSS.highlights.set('wt-new', st.hl); } return st.hl; }
    function selLine() { if (!st.sel) { st.sel = new Highlight(); CSS.highlights.set('wt-new-sel', st.sel); } return st.sel; }
    function clearLines() { if (st.hl) st.hl.clear(); if (st.sel) st.sel.clear(); st.rng.clear(); }

    /* ----- what counts as known: I know it (KW) and My Words entries that are familiar or mastered (as BPV does) ----- */
    function wsKnown() {
      const s = new Set();
      try { WS.all().forEach(e => { const m = WM.migrate(e); if (m && typeof m.w === 'string' && (m.st === 'familiar' || m.st === 'mastered')) s.add(m.w.trim().toLowerCase()); }); } catch (e) { /* no saved words */ }
      return s;
    }
    const isKnown = w => { try { return st.ws.has(w) || KW.isKnown(w); } catch (e) { return false; } };

    /* ----- the word list of the book (saved on the device by vocBook, 160) ----- */
    function getIndex(bid) {
      if (st.idx.has(bid)) return Promise.resolve(st.idx.get(bid));
      if (typeof vocBook !== 'function') return Promise.resolve(null);
      return vocBook(bid).then(d => { const M = d ? KUC.index(d.w) : null; if (M) st.idx.set(bid, M); return M; }, () => null);
    }

    /* ----- the chip ----- */
    function chip() {
      const box = st.cov, C = st.C; if (!box) return;
      const m = C && C.done ? KUC.summary(C.cnt, C.total, isKnown) : null;
      if (!m) { box.hidden = true; return; }
      $('#kw-chip').textContent = m.pct + '% known';
      $('#kw-fill').style.width = m.pct + '%';
      box.setAttribute('aria-label', m.pct + '% of the words in this chapter known');
      box.hidden = false;
    }

    /* ----- the lines ----- */
    function paintId(id, C) {
      const old = st.rng.get(id);
      if (old) { for (const x of old) st.hl.delete(x.r); st.rng.delete(id); }
      const hits = C && C.hits.get(id); if (!hits || !hits.length || !can()) return;
      const sp = S.spans && S.spans.get(id), s = S.model && S.model.sents[id];
      if (!sp || !s || !sp.isConnected || sp.textContent !== s.t) return;   // not on the page, or not the same text: leave it
      const out = [];
      for (const hit of hits) {
        if (isKnown(hit.w)) continue;
        const r = OW.rangeOf(sp, hit.s, hit.e); if (r) { lines().add(r); out.push({ r, hit }); }
      }
      if (out.length) st.rng.set(id, out);
    }

    /* ----- one chapter: match once, paint, in short slices ----- */
    function cacheFor(i, p, bid) {
      const key = bid + '|' + i, c = st.cache.get(key);
      if (c && c.m === S.model) return c;
      const n = { m: S.model, ids: p.ids.slice(), hits: new Map(), cnt: new Map(), where: new Map(), total: 0, done: false };
      st.cache.set(key, n);
      if (st.cache.size > 8) st.cache.delete(st.cache.keys().next().value);
      return n;
    }
    function off() { st.tok++; closeCard(); clearLines(); st.C = null; chip(); }
    function run(i) {
      st.tok++; closeCard(); clearLines(); st.C = null; chip();
      if (!on() || !S.model || !S.plan || !S.book) return;
      const p = S.plan[i]; if (!p || !p.ids || !p.ids.length) return;
      const tok = st.tok, bid = String(S.book.id), C = cacheFor(i, p, bid);
      st.ws = wsKnown();
      getIndex(bid).then(M => {
        if (tok !== st.tok || !M) return;   // another chapter or the setting went off meanwhile, or this book has no word list
        st.C = C; let pos = 0;
        const slice = () => {
          if (tok !== st.tok) return;
          const t0 = performance.now();
          while (pos < C.ids.length && performance.now() - t0 < 6) {
            const id = C.ids[pos++], s = S.model.sents[id];
            if (!C.done && s && !s.h) {
              const r = KUC.match(M, s.t); C.total += r.n;
              if (r.hits.length) {
                C.hits.set(id, r.hits);
                for (const x of r.hits) {
                  C.cnt.set(x.w, (C.cnt.get(x.w) || 0) + 1);
                  let a = C.where.get(x.w); if (!a) C.where.set(x.w, a = new Set()); a.add(id);
                }
              }
            }
            paintId(id, C);
          }
          if (pos < C.ids.length) idle(slice); else { C.done = true; chip(); }
        };
        idle(slice);
      });
    }
    function repaint(id) { if (st.C && st.C.done && on()) paintId(id, st.C); }
    function model() {
      const C = st.C, m = C && C.done ? KUC.summary(C.cnt, C.total, isKnown) : null; if (!m) return null;
      const list = [];
      C.cnt.forEach((n, w) => { if (!isKnown(w)) list.push({ w, n }); });
      list.sort((a, b) => b.n - a.n || (a.w < b.w ? -1 : 1));
      return { pct: m.pct, unknown: m.unknown, words: m.words, total: m.total, list };
    }

    /* ----- the tap ----- */
    function onTap(e) {
      const sp = e.target && e.target.closest && e.target.closest('.s');
      if (!sp) return;
      const open = st.card && !st.card.hidden;
      if (!st.rng.size && !open) return;
      const sel = window.getSelection && window.getSelection(); if (sel && !sel.isCollapsed) return;
      const id = +sp.getAttribute('data-i'), it = OW.hitAt(e.clientX, e.clientY, st.rng.get(id));
      if (!it && !open) return;
      e.preventDefault(); e.stopImmediatePropagation();   // a tap on a marked word is for the card; a tap away from an open card only closes it
      if (it) showCard({ w: it.hit.w, id, s: it.hit.s, e: it.hit.e }, true); else closeCard();
    }

    /* ----- the card ----- */
    const sentOf = id => (S.model && S.model.sents[id] ? S.model.sents[id].t : '');
    const short = d => { d = String(d || '').split(/[;.]/)[0].trim(); return d.length > 90 ? d.slice(0, 87).trimEnd() + '\u2026' : d; };
    function setLearnBtn() {
      const b = $('#kw-learn'), c = st.cur; if (!b || !c) return;
      const sv = !!WS.get(c.w);
      b.setAttribute('aria-pressed', String(sv)); $('#kw-learn-t').textContent = sv ? 'Saved' : 'Learn';
    }
    function fillMeaning(w, n) {
      const box = $('#kw-mean'); box.textContent = 'Looking up\u2026';
      if (typeof DICT === 'undefined') { box.textContent = ''; return; }
      DICT.get(w).then(r => {
        if (n !== st.seq) return;
        if (r.ok) { const m = r.data.meanings && r.data.meanings[0], d = m && m.defs && m.defs[0] && m.defs[0].d; box.textContent = d ? short(d) : ''; }
        else box.textContent = r.reason === 'none' ? 'No dictionary entry for this form of the word.' : 'No meaning on this device yet. It loads when you are online.';
      }, () => { if (n === st.seq) box.textContent = ''; });
    }
    /* The card must not hide the tapped word: same keep-in-view rule as the old-words card (161d). */
    function keepInView(c) {
      try {
        const sp = S.spans && S.spans.get(c.id), r = sp && OW.rangeOf(sp, c.s, c.e); if (!r) return;
        requestAnimationFrame(() => {
          const limit = Math.min(st.card.getBoundingClientRect().top, el.reader.getBoundingClientRect().bottom) - 16, bottom = r.getBoundingClientRect().bottom;
          if (bottom > limit) scrollGlide(el.reader.scrollTop + (bottom - limit), false);
        });
      } catch (e) { /* the reader is not ready: the card just opens */ }
    }
    function showCard(c, tapped) {
      const card = st.card; if (!card || !c) return;
      const sent = sentOf(c.id), text = sent.slice(c.s, c.e), n = ++st.seq;
      st.cur = { w: c.w, text, sent, id: c.id };
      $('#kw-title').textContent = text;
      fillMeaning(c.w, n); setLearnBtn();
      if (st.sel) st.sel.clear();
      if (can()) { const sp = S.spans && S.spans.get(c.id), r = sp && OW.rangeOf(sp, c.s, c.e); if (r) selLine().add(r); }
      card.hidden = false; card.classList.add('is-open');
      if (tapped) keepInView(c);
      const t = $('#kw-title'); try { t.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
    }
    function closeCard() {
      const card = st.card; if (!card || card.hidden) return;
      st.seq++; card.classList.remove('is-open'); card.hidden = true; st.cur = null;
      if (st.sel) st.sel.clear();
    }
    function repaintWord(w) {
      const C = st.C, ids = C && C.where.get(w); if (!ids) return;
      ids.forEach(id => paintId(id, C));
    }
    function onKnow() {
      const c = st.cur; if (!c) return;
      const w = c.w; KW.add(w);
      if (!KW.isKnown(w)) { toast('Could not save. Storage may be full.', 3000); return; }
      closeCard(); repaintWord(w); chip();
      toast('Marked as known.', 4500, ['Undo', () => { KW.remove(w); repaintWord(w); chip(); }]);
    }
    function onLearn() {
      const c = st.cur; if (!c) return;
      if (WS.get(c.w)) { WS.remove(c.w); toast('Removed from My words.', 1400); }
      else if (WS.all().length >= 2000) toast(RVC.MSG.full, 6000);
      else {
        const e = st.idx.get(S.book ? String(S.book.id) : '') && st.idx.get(String(S.book.id)).get(c.w), m = S.model && S.model.sents[c.id];
        WS.saveWithContext(c.w, { s: c.sent, bid: S.book ? String(S.book.id) : '', bt: S.book ? S.book.title : '', ch: m && typeof m.ch === 'number' ? m.ch + 1 : null }, { lv: e ? e.lv : '', ex: (e && e.ex) || c.sent });
        toast('Saved to My words.', 1600);
      }
      try { vocCount(); } catch (e) { /* the word list screen is not there yet */ }
      setLearnBtn();
    }

    /* ----- wiring (taps and the switch only; nothing per audio tick) ----- */
    st.card = $('#kw-card'); st.cov = $('#kw-cov');
    if (st.card) {
      $('#kw-know').addEventListener('click', onKnow);
      $('#kw-learn').addEventListener('click', onLearn);
      $('#kw-say').addEventListener('click', () => { const c = st.cur; if (c && typeof prVoice === 'function') prVoice(c.w); });
      $('#kw-grip').addEventListener('click', closeCard);
      document.addEventListener('keydown', e => { if (e.key === 'Escape' && st.card && !st.card.hidden) closeCard(); });
    }
    el.page.addEventListener('click', onTap, true);
    const sw = $('#in-knownul');
    if (sw) {
      sw.checked = on();
      sw.addEventListener('change', e => {
        P.knownUl = e.target.checked; savePrefs();
        if (!P.knownUl) off(); else if (S.model && !S.rb && S.sec != null) run(S.sec);
      });
    }
    guideDoc('reading', 'New words', 'Turn on Underline new words in Settings > Reading. Words from the book\u2019s word list that you have not marked as known get a soft dotted line. Tap one for its meaning, then I know it or Learn. The chip above the text shows how much of the chapter you know.');
    return { run, repaint, showCard, closeCard, model };
  })();
  function kuChapter(i) { KU.run(i); }
  function kuRepaint(id) { KU.repaint(id); }
  function kuClose() { KU.closeCard(); }
