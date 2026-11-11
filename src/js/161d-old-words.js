  /* ---------- old words and idioms: highlight and card (OWC, OW) ----------
     Task 36. Old-fashioned words (hath, whilst) get a purple line and idioms (hold my tongue) a blue line. Tap one: a card says what it
     means today, with the translation (auto-translated), the other old words of the chapter, and Save phrase (My Words).
     The lists are the two data files of Task 35 (src/data/old-words.json, idioms.json), put into the page by build.py as
     <script type="application/json" id="ow-words"> and id="ow-idioms">. Only listed entries are marked. Nothing is guessed.
     When it runs   once, when a chapter has been built (owChapter, called by buildSents in 150). The text is matched from the book model, in
                    short slices of about 6 ms when the browser is idle, then the answer is kept for that chapter (memory, by book and track,
                    8 chapters). Opening the same chapter again does no matching at all. The words file is parsed the first time it is needed.
     No change to the text   the lines are drawn with the CSS Custom Highlight API (CSS.highlights): the sentence spans are not touched, so the
                    sentence highlight, the word highlight, quotes and notes work as before, and scrolling costs nothing extra. A browser
                    without that API (older Firefox, older WebViews) simply shows no lines; nothing else changes.
     During playback  nothing is matched. When the word highlight puts a sentence back to plain text (unwrapWords, 150) that one sentence is
                    painted again from the saved answer (owRepaint): no matching, a few ranges.
     Setting         P.oldWords (default on; Settings > Reading). Off: the lines go, the cache stays, taps behave as before.
     Save phrase     the same save as the Save phrase button (RVC.toggle in 161c): the phrase as written, ph: 1 when more than one word,
                    tr: { l, t } = the translation of the meaning. No new storage key, no new field.
       OWC.compile(words, idioms) -> matcher    OWC.match(matcher, text) -> [ { s, e, k: 'w' | 'i', key, rec } ]  (pure, tested by tools/old_words_check.js)
       OW.run(i) / OW.repaint(id) / OW.showCard(hit) / OW.closeCard() */
  /*OWC-START*/
  const OWC = (() => {
    const POSS = ['my', 'your', 'his', 'her', 'its', 'our', 'their'];
    const NEAR = new Set(['thou', 'thee', 'thy', 'thine', 'ye']);   // a word that is also a modern word (amb) is only marked next to one of these
    const TOK = /['’]?[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu;
    const norm = s => String(s).toLowerCase().replace(/’/g, "'");
    /* Words of a text with where they start and end: [ { t: lower case form, s, e } ] */
    function tokens(text) {
      const out = []; let m; TOK.lastIndex = 0;
      while ((m = TOK.exec(text))) out.push({ t: norm(m[0]), s: m.index, e: m.index + m[0].length });
      return out;
    }
    function compile(words, idioms) {
      const W = new Map(), I = new Map();
      for (const e of (words && words.w) || []) {
        if (!e || typeof e.id !== 'string') continue;
        const rec = { id: e.id, m: String(e.m || ''), n: String(e.n || ''), amb: !!e.amb, old: true };
        for (const f of [e.id].concat(Array.isArray(e.f) ? e.f : [])) { const k = norm(f); if (k && !W.has(k)) W.set(k, rec); }
      }
      for (const e of (idioms && idioms.i) || []) {
        if (!e || typeof e.p !== 'string') continue;
        const rec = { id: e.id, m: String(e.m || ''), n: '', amb: false, old: !!e.old };
        for (const f of [e.p].concat(Array.isArray(e.f) ? e.f : [])) {
          for (const p of (/\{p\}/.test(f) ? POSS : [''])) {
            const tk = tokens(f.replace(/\{p\}/g, p)).map(x => x.t); if (tk.length < 2) continue;
            let a = I.get(tk[0]); if (!a) I.set(tk[0], a = []);
            a.push({ tk, rec });
          }
        }
      }
      for (const a of I.values()) a.sort((x, y) => y.tk.length - x.tk.length);   // the longest idiom first
      return { W, I };
    }
    /* A word of the list for this token (also "foe's" and 'word), or null. Returns { rec, s, e }. */
    function lookup(M, x) {
      let s = x.s, e = x.e, t = x.t, r = M.W.get(t);
      if (!r && t[0] === "'" && M.W.has(t.slice(1))) { t = t.slice(1); s++; r = M.W.get(t); }
      if (!r && /'s$/.test(t) && M.W.has(t.slice(0, -2))) { r = M.W.get(t.slice(0, -2)); e -= 2; }
      return r ? { rec: r, s, e } : null;
    }
    function match(M, text) {
      const tk = tokens(String(text || '')), out = [];
      for (let i = 0; i < tk.length;) {
        const c = M.I.get(tk[i].t); let done = 0;
        if (c) for (const it of c) {
          const n = it.tk.length; if (i + n > tk.length) continue;
          let ok = true;
          for (let j = 0; j < n && ok; j++) {
            ok = tk[i + j].t === it.tk[j] && (j === 0 || /^['\u2019]?\s+$/.test(text.slice(tk[i + j - 1].e, tk[i + j].s)));   // only spaces (or a closing apostrophe, wits' end) between the words
          }
          if (ok) { out.push({ s: tk[i].s, e: tk[i + n - 1].e, k: 'i', key: 'i:' + it.rec.id, rec: it.rec }); done = n; break; }
        }
        if (done) { i += done; continue; }
        const w = lookup(M, tk[i]);
        if (w) {
          let show = true;
          if (w.rec.amb) { show = false; for (let j = Math.max(0, i - 3); j <= Math.min(tk.length - 1, i + 1); j++) if (j !== i && NEAR.has(tk[j].t)) show = true; }
          if (show) out.push({ s: w.s, e: w.e, k: 'w', key: 'w:' + w.rec.id, rec: w.rec });
        }
        i++;
      }
      return out;
    }
    return { compile, match, tokens };
  })();
  /*OWC-END*/

  const OW = (() => {
    const st = { m: null, C: null, cache: new Map(), tok: 0, tm: 0, rng: new Map(), hl: {}, card: null, cur: null, seq: 0, tr: '' };
    const can = () => typeof Highlight !== 'undefined' && !!(window.CSS && CSS.highlights);
    const enabled = () => P.oldWords !== false && can();
    function matcher() {
      if (st.m) return st.m;
      let w = {}, i = {};
      try { w = JSON.parse(document.getElementById('ow-words').textContent); i = JSON.parse(document.getElementById('ow-idioms').textContent); } catch (e) { /* no lists: nothing is marked */ }
      return (st.m = OWC.compile(w, i));
    }
    function hlOf(k) {
      const n = k === 'i' ? 'wt-idiom' : 'wt-old';
      if (!st.hl[n]) { st.hl[n] = new Highlight(); CSS.highlights.set(n, st.hl[n]); }
      return st.hl[n];
    }
    function clearAll() { for (const n in st.hl) st.hl[n].clear(); st.rng.clear(); }

    /* ----- the lines ----- */
    function rangeOf(sp, a, b) {
      const tw = document.createTreeWalker(sp, NodeFilter.SHOW_TEXT); let pos = 0, n, sn = null, so = 0;
      while ((n = tw.nextNode())) {
        const L = n.nodeValue.length;
        if (!sn && a < pos + L) { sn = n; so = a - pos; }
        if (sn && b <= pos + L) { const r = document.createRange(); r.setStart(sn, so); r.setEnd(n, b - pos); return r; }
        pos += L;
      }
      return null;
    }
    function paintId(id, C) {
      const old = st.rng.get(id);
      if (old) { for (const x of old) hlOf(x.hit.k).delete(x.r); st.rng.delete(id); }
      const hits = C && C.hits.get(id); if (!hits || !hits.length) return;
      const sp = S.spans && S.spans.get(id), s = S.model && S.model.sents[id];
      if (!sp || !s || !sp.isConnected || sp.textContent !== s.t) return;   // not on the page, or not the same text: leave it
      const out = [];
      for (const hit of hits) { const r = rangeOf(sp, hit.s, hit.e); if (r) { hlOf(hit.k).add(r); out.push({ r, hit }); } }
      if (out.length) st.rng.set(id, out);
    }
    const idle = f => (window.requestIdleCallback ? requestIdleCallback(f, { timeout: 600 }) : setTimeout(f, 40));

    /* ----- one chapter: match (once), then paint, in short slices ----- */
    function cacheFor(i, p) {
      const key = (S.book ? S.book.id : '') + '|' + i, c = st.cache.get(key);
      if (c && c.m === S.model) return c;
      const n = { m: S.model, ids: p.ids.slice(), hits: new Map(), seen: new Map(), done: false };
      st.cache.set(key, n);
      if (st.cache.size > 8) st.cache.delete(st.cache.keys().next().value);
      return n;
    }
    function run(i) {
      st.tok++; clearTimeout(st.tm); closeCard(); clearAll(); st.C = null;
      if (!enabled() || !S.model || !S.plan) return;
      const p = S.plan[i]; if (!p || !p.ids || !p.ids.length) return;
      const C = cacheFor(i, p), tok = st.tok, M = C.done ? null : matcher();
      st.C = C; let pos = 0;
      const slice = () => {
        if (tok !== st.tok) return;
        const t0 = performance.now();
        while (pos < C.ids.length && performance.now() - t0 < 6) {
          const id = C.ids[pos++], s = S.model.sents[id];
          if (!C.done && s && !s.h) {
            const hits = OWC.match(M, s.t);
            if (hits.length) {
              C.hits.set(id, hits);
              for (const x of hits) { const o = C.seen.get(x.key); if (o) o.n++; else C.seen.set(x.key, { rec: x.rec, k: x.k, n: 1, id, s: x.s, e: x.e }); }
            }
          }
          paintId(id, C);
        }
        if (pos < C.ids.length) idle(slice); else C.done = true;
      };
      idle(slice);
    }
    function repaint(id) { if (st.C && st.C.done && enabled()) paintId(id, st.C); }

    /* ----- the tap ----- */
    function hitAt(x, y, list) {   // the marked words of the tapped sentence only
      let best = null, bd = 1e9;
      for (const it of list || []) {
        for (const q of it.r.getClientRects()) {
          if (x < q.left - 4 || x > q.right + 4 || y < q.top - 6 || y > q.bottom + 6) continue;
          const d = Math.abs(x - (q.left + q.right) / 2) + Math.abs(y - (q.top + q.bottom) / 2);
          if (d < bd) { bd = d; best = it; }
        }
      }
      return best;
    }
    function onTap(e) {
      const sp = e.target && e.target.closest && e.target.closest('.s');
      if (!sp) return;
      const open = st.card && !st.card.hidden;
      if (!st.rng.size && !open) return;
      const sel = window.getSelection && window.getSelection(); if (sel && !sel.isCollapsed) return;
      const it = hitAt(e.clientX, e.clientY, st.rng.get(+sp.getAttribute('data-i')));
      if (!it && !open) return;
      e.preventDefault(); e.stopImmediatePropagation();   // a tap on a marked word is for the card; a tap away from an open card only closes it
      if (it) showCard({ k: it.hit.k, rec: it.hit.rec, id: +sp.getAttribute('data-i'), s: it.hit.s, e: it.hit.e }, true); else closeCard();
    }

    /* ----- the card ----- */
    const sentOf = id => (S.model && S.model.sents[id] ? S.model.sents[id].t : '');
    const cap = t => { t = String(t || '').trim(); return t ? t[0].toUpperCase() + t.slice(1) : t; };
    function setSaveBtn() {
      const b = $('#ow-save'), c = st.cur; if (!b || !c) return;
      const on = !!WS.get(RVC.clean(c.text, false));
      b.setAttribute('aria-pressed', String(on)); b.textContent = '';
      b.append(h('span', { 'aria-hidden': 'true' }, '★'), h('span', {}, on ? 'Saved' : 'Save phrase'));
    }
    function chips(c) {
      const box = $('#ow-chips'), wrap = $('#ow-more'); box.textContent = '';
      const list = st.C ? [...st.C.seen.values()].filter(x => x.k === 'w' && !(c.k === 'w' && x.rec.id === c.rec.id)).sort((a, b) => b.n - a.n || a.id - b.id).slice(0, 6) : [];
      for (const x of list) {
        const b = h('button', { class: 'wl-pill wl-pill--tap ow-chip', type: 'button' }, x.rec.id + ' = ' + x.rec.m);
        b.addEventListener('click', () => showCard({ k: 'w', rec: x.rec, id: x.id, s: x.s, e: x.e }));
        box.append(b);
      }
      wrap.hidden = !list.length;
    }
    /* The card must not hide the word that was tapped: same keep-in-view rule as the Quick controls sheet (qsKeepLine, 246). */
    function keepInView(c) {
      try {
        const sp = S.spans && S.spans.get(c.id), r = sp && rangeOf(sp, c.s, c.e); if (!r) return;
        requestAnimationFrame(() => {
          const limit = Math.min(st.card.getBoundingClientRect().top, el.reader.getBoundingClientRect().bottom) - 16, bottom = r.getBoundingClientRect().bottom;
          if (bottom > limit) scrollGlide(el.reader.scrollTop + (bottom - limit), false);
        });
      } catch (e) { /* the reader is not ready: the card just opens */ }
    }
    function showCard(c, tapped) {
      const card = st.card; if (!card) return;
      if (typeof kuClose === 'function') kuClose();   // only one card at a time (161e)
      const sent = sentOf(c.id), text = sent.slice(c.s, c.e), lang = trLang(), n = ++st.seq;
      st.cur = { text, sent, id: c.id, rec: c.rec, k: c.k, tr: '' };
      const tags = $('#ow-tags'); tags.textContent = '';
      if (c.k === 'i') tags.append(h('span', { class: 'ow-tag ow-tag--idiom' }, 'Idiom'));
      if (c.rec.old) tags.append(h('span', { class: 'ow-tag ow-tag--old' }, 'Old use'));
      $('#ow-title').textContent = text;
      $('#ow-mean').textContent = c.k === 'i' ? cap(c.rec.m) : c.rec.m;
      const note = $('#ow-note'); note.textContent = c.rec.n || ''; note.hidden = !c.rec.n;
      const trb = $('#ow-tr'); trb.hidden = true; TP.drop('ow');
      if (lang && lang !== 'en' && c.rec.m) {
        TP.get(c.rec.m, lang, { prio: 0, owner: 'ow' }).then(t => {
          t = String(t || '').trim(); if (n !== st.seq || !t) return;
          st.cur.tr = t; $('#ow-trtext').textContent = t; $('#ow-trtext').setAttribute('lang', lang.split('-')[0]); trb.hidden = false;
        }, () => { /* offline or limit: the card stays in English */ });
      }
      chips(c); setSaveBtn();
      card.hidden = false; card.classList.add('is-open');
      if (tapped) keepInView(c);
      const t = $('#ow-title'); try { t.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
    }
    function closeCard() {
      const card = st.card; if (!card || card.hidden) return;
      st.seq++; TP.drop('ow'); card.classList.remove('is-open'); card.hidden = true; st.cur = null;
    }
    function onSave() {
      const c = st.cur; if (!c) return;
      const m = S.model && S.model.sents[c.id], lang = trLang();
      const r = RVC.toggle({ phrase: c.text, whole: false, sent: c.sent, bid: S.book ? String(S.book.id) : '', bt: S.book ? S.book.title : '', ch: m && typeof m.ch === 'number' ? m.ch + 1 : null }, lang, c.tr);
      if (r.state === 'full') toast(RVC.MSG.full, 6000);
      else if (r.state === 'saved') toast('Saved to My words.', 1600);
      else if (r.state === 'removed') toast('Removed from My words.', 1400);
      try { vocCount(); } catch (e) { /* the word list screen is not there yet */ }
      setSaveBtn();
    }

    /* ----- wiring (taps only; nothing per audio tick) ----- */
    st.card = $('#ow-card');
    if (st.card) {
      $('#ow-save').addEventListener('click', onSave);
      $('#ow-grip').addEventListener('click', closeCard);
      document.addEventListener('keydown', e => { if (e.key === 'Escape' && st.card && !st.card.hidden) closeCard(); });
    }
    el.page.addEventListener('click', onTap, true);
    const sw = $('#in-oldwords');
    if (sw) {
      sw.checked = P.oldWords !== false;
      sw.addEventListener('change', e => {
        P.oldWords = e.target.checked; savePrefs();
        if (!P.oldWords) { st.tok++; clearTimeout(st.tm); closeCard(); clearAll(); } else if (S.model && !S.rb && S.sec != null) run(S.sec);
      });
    }
    guideDoc('reading', 'Old words and idioms', 'Old-fashioned words get a purple line and idioms a blue line. Tap one to see what it means today, then Save phrase adds it to My words. You can turn the lines off in Settings > Reading.');
    return { run, repaint, showCard, closeCard, rangeOf, hitAt };   // rangeOf, hitAt: also used by 161e (new words)
  })();
  function owChapter(i) { OW.run(i); }
  function owRepaint(id) { OW.repaint(id); }
