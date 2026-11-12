  /* ---------- Chapter questions: the screen and the saved results (QS) ----------
     A full-screen set of up to 5 questions about ONE chapter the reader has reached, made by the generator (167c, QG) from the book's own text.
     Four kinds: fill the blank, word meaning, true or false, story order. Pick an answer, tap Check, a panel at the bottom shows the sentence from
     the book and a "Show in book" link, tap Continue. No lives, no timer, no score to beat; a wrong answer only shows the book's sentence.
     Spoiler guard: the chapter is limited by QG.furthest (167c); this file never asks for a chapter past it. The chip at the top shows the chapter used.
     "Show in book" closes the screen and scrolls the reader to the sentence (it does not move playback). It shows only when the reader is on screen
     (opened from "Study this chapter" in the player); when the sentence is in another track that is not drawn, a short message says so.
     Results: when all questions of a set are answered, QR.save (148d) keeps { n, r, b, t, ts } for this book and chapter (key wt:qres, synced).
     Closing half way saves nothing and changes no word.
     Registered in the Learn hub (169b) as the tile "Questions"; the same tile is in the player's "Study this chapter" sheet (169e) and gets the chapter.
     Nothing runs at start-up and playback is never touched; the generator is only called when the tile is tapped.
       QS.start(ctx)         ctx = { bookId, chapter } (the sheet passes it; from the hub the open book and its current chapter are used). Promise -> true when a set opened
       QS.close()            QS.on   true while open
       QS.pick(qs, n)        pure: up to n questions, mixing the kinds one after another
       QS.judge(q, sel)      pure: true when the answer is right (sel = choice index, or for story order the list of choice indexes in the order tapped)
     Remove this file, 148d, their build.py lines, 94m-questions.css and the lines in 270 and 295 to go back. */
  const QS = (() => {
    const SIZE = 5, ORDER = ['fill', 'vocab', 'tf', 'order'], KIND = { fill: 'Words', vocab: 'Vocabulary', tf: 'Understanding', order: 'Story order' };

    /* ----- pure ----- */
    function pick(qs, n) {
      const by = {}; ORDER.forEach(k => { by[k] = []; });
      (Array.isArray(qs) ? qs : []).forEach(q => { if (q && by[q.type]) by[q.type].push(q); });
      const out = [];
      while (out.length < (n || SIZE) && ORDER.some(k => by[k].length)) ORDER.forEach(k => { if (by[k].length && out.length < (n || SIZE)) out.push(by[k].shift()); });
      return out;
    }
    function judge(q, sel) {
      if (!q) return false;
      if (q.type === 'order') return Array.isArray(sel) && Array.isArray(q.answer) && sel.length === q.answer.length && sel.every((v, i) => v === q.answer[i]);
      return sel === q.answer;
    }

    /* ----- screen ----- */
    const L = { on: false, root: null, qs: [], i: 0, right: 0, res: 0, ctx: null, tok: 0, canShow: false, opener: null, fill: null, bar: null, bt: '', ch: 0, bid: '' };
    const setBar = n => {
      const pct = L.qs.length ? Math.round(100 * n / L.qs.length) : 0;
      if (L.fill) L.fill.style.setProperty('--wl-p', pct + '%'); if (L.bar) L.bar.setAttribute('aria-valuenow', String(n));
    };
    function frame() {
      L.root.textContent = '';
      L.fill = h('span', { class: 'wl-progress__fill' });
      L.bar = h('div', { class: 'wl-progress rl__bar', role: 'progressbar', 'aria-label': 'Progress', 'aria-valuemin': '0', 'aria-valuemax': String(L.qs.length || 1) }, L.fill);
      L.root.append(h('header', { class: 'rl__top' }, h('button', { class: 'rl__x', type: 'button', 'aria-label': 'Close questions', onclick: close }, '✕'), L.bar,
        h('span', { class: 'qs__chip' }, h('span', { 'aria-hidden': 'true' }, '\u{1F6E1}'), h('span', {}, 'Ch. ' + (L.ch + 1)))));
      L.scroll = h('div', { class: 'rl__scroll' }); L.foot = h('footer', { class: 'rl__foot' });
      L.root.append(L.scroll, L.foot);
    }
    const title = text => h('h1', { class: 'rl__title', id: 'qs-title', tabindex: '-1' }, text);
    const where = kind => h('p', { class: 'rl__src' }, h('span', {}, KIND[kind] || ''), ' · ', h('span', {}, L.bt), ', ', h('span', {}, 'Ch. ' + (L.ch + 1)));
    const num = i => h('span', { class: 'qs__num', 'aria-hidden': 'true' }, String(i));
    const focusTitle = () => { const t = L.root.querySelector('#qs-title'); if (t) t.focus({ preventScroll: true }); };

    function showInBook(sid) {   // scroll the reader to the sentence; playback is not touched
      close();
      try {
        const sp = spanById(sid);
        if (!sp) { toast('That sentence is in another track. Open it to see the sentence.', 2600); return; }
        ensureVisible(sp, true); sp.classList.add('qs-flash'); setTimeout(() => sp.classList.remove('qs-flash'), 2400);
      } catch (e) { toast('Could not show that place.', 1800); }
    }

    function panel(q, ok, ans) {   // the feedback panel, the same for every kind
      L.res++; if (ok) L.right++; setBar(L.i + 1);
      const last = L.i + 1 >= L.qs.length;
      const go = h('button', { class: 'wl-btn wl-btn--block ' + (ok ? 'wl-btn--ok' : 'wl-btn--primary'), type: 'button', onclick: () => { L.i++; draw(); } }, last ? 'Finish' : 'Continue');
      const lead = q.type === 'tf' && q.changed ? (q.answer === 1 ? 'One word was changed. The book says' : 'The book says') : 'The book says';
      L.foot.textContent = '';
      L.foot.append(h('div', { class: 'wl-panel wl-panel--dock rl__panel' + (ok ? '' : ' wl-panel--bad'), role: 'status' },
        h('div', { class: 'wl-panel__head' }, h('span', { class: 'wl-panel__icon', 'aria-hidden': 'true' }, ok ? '\u{1F389}' : '\u{1F4A1}'), h('h2', { class: 'wl-panel__title' }, ok ? 'Correct!' : 'Not quite.')),
        h('p', { class: 'wl-panel__text' }, h('span', {}, lead), ' “' + q.full + '”'),
        !ok ? h('p', { class: 'wl-panel__text' }, 'No problem. Have another look at the book.') : null,
        L.canShow ? h('button', { class: 'wl-panel__link', type: 'button', onclick: () => showInBook(q.sid) }, '\u{1F4D6} ', h('span', {}, 'Show in book')) : null, go));
      go.focus();
    }

    function drawChoice(q) {   // fill, vocab, true/false: pick one of the choices
      let sel = -1, checked = false;
      const check = h('button', { class: 'wl-btn wl-btn--primary wl-btn--block', type: 'button', disabled: true }, 'Check');
      const label = c => q.type === 'tf' ? (c === 'true' ? 'True' : 'False') : c;
      const opts = q.choices.map((c, i) => h('button', { class: 'wl-card wl-card--tap qs__opt', type: 'button', 'aria-pressed': 'false' }, num(i + 1), h('span', { class: 'qs__txt' }, label(c))));
      opts.forEach((b, i) => b.addEventListener('click', () => {
        if (checked) return;
        sel = i; opts.forEach((o, j) => o.setAttribute('aria-pressed', String(j === i))); check.disabled = false;
      }));
      let head, body;
      if (q.type === 'fill') {
        head = 'Fill in the missing word';
        body = h('div', { class: 'wl-card rl__sent' }, h('p', { class: 'rl__s' }, q.pre, h('span', { class: 'rl__blank', role: 'img', 'aria-label': 'blank' }), q.post));
      } else if (q.type === 'vocab') {
        head = 'What does this word mean here?';
        body = h('div', { class: 'wl-card rl__sent' }, h('p', { class: 'rl__s' }, q.pre, h('strong', { class: 'qs__hit' }, q.word), q.post));
      } else {
        head = 'True or false?';
        body = h('div', { class: 'wl-card rl__sent' }, h('p', { class: 'rl__s' }, q.text));
      }
      L.scroll.append(h('div', { class: 'rl__main' }, title(head), where(q.type), body,
        h('p', { class: 'rl__lab', id: 'qs-lab' }, 'Pick the answer'), h('div', { class: 'qs__list', role: 'group', 'aria-labelledby': 'qs-lab' }, ...opts)));
      L.foot.append(check);
      check.addEventListener('click', () => {
        if (checked || sel < 0) return; checked = true;
        const ok = judge(q, sel);
        opts.forEach((o, i) => { o.setAttribute('aria-disabled', 'true'); if (i === q.answer) o.classList.add('is-correct'); else if (i === sel) o.classList.add('is-wrong'); });
        panel(q, ok);
      });
    }

    function drawOrder(q) {   // story order: tap the sentences in the order they happen; tap a numbered one to take it back
      const taps = []; let checked = false;
      const check = h('button', { class: 'wl-btn wl-btn--primary wl-btn--block', type: 'button', disabled: true }, 'Check');
      const opts = q.choices.map((c, i) => h('button', { class: 'wl-card wl-card--tap qs__opt', type: 'button', 'aria-pressed': 'false' }, h('span', { class: 'qs__num' }, ''), h('span', { class: 'qs__txt' }, c)));
      const paint = () => {
        opts.forEach((o, i) => {
          const k = taps.indexOf(i), n = o.firstChild;
          o.setAttribute('aria-pressed', String(k >= 0)); n.textContent = k >= 0 ? String(k + 1) : '';
          o.setAttribute('aria-label', (k >= 0 ? 'Step ' + (k + 1) + ': ' : '') + q.choices[i]);
        });
        check.disabled = taps.length !== q.choices.length;
      };
      opts.forEach((b, i) => b.addEventListener('click', () => {
        if (checked) return;
        const k = taps.indexOf(i); if (k >= 0) taps.splice(k, 1); else taps.push(i);
        paint();
      }));
      L.scroll.append(h('div', { class: 'rl__main' }, title('Put the story in order'), where('order'),
        h('p', { class: 'rl__lab', id: 'qs-lab' }, 'Tap the sentences in the order they happen'), h('div', { class: 'qs__list', role: 'group', 'aria-labelledby': 'qs-lab' }, ...opts)));
      L.foot.append(check);
      check.addEventListener('click', () => {
        if (checked || taps.length !== q.choices.length) return; checked = true;
        const ok = judge(q, taps);
        opts.forEach((o, i) => { o.setAttribute('aria-disabled', 'true'); o.classList.add(q.answer.indexOf(i) === taps.indexOf(i) ? 'is-correct' : 'is-wrong'); o.firstChild.textContent = String(q.answer.indexOf(i) + 1); });
        panel(q, ok);
      });
    }

    function drawDone() {
      frame(); setBar(L.qs.length);
      const n = L.qs.length, prev = QR.get(L.bid, L.ch);
      const saved = QR.save(L.bid, L.ch, n, L.right, Date.now());
      try { IE.log('r'); } catch (e) { /* IELTS practice log (169o) not loaded */ }
      try { LearnHub.refresh(); } catch (e) { /* hub not ready */ }
      L.scroll.append(h('div', { class: 'rl__main' }, title('Set complete'),
        h('p', { class: 'rl__score' }, L.right + ' of ' + n + ' right'),
        prev ? h('p', { class: 'rl__src' }, 'Last time: ' + prev.r + ' of ' + prev.n + ' right') : null,
        L.right < n ? h('p', { class: 'rl__src' }, 'Have another look at the chapter whenever you like.') : h('p', { class: 'rl__src' }, 'All right this time. Well done.')));
      L.foot.append(h('button', { class: 'wl-btn wl-btn--primary wl-btn--block', type: 'button', onclick: close }, 'Done'));
      focusTitle(); return saved;
    }
    function draw() {
      if (L.i >= L.qs.length) { drawDone(); return; }
      const q = L.qs[L.i]; frame(); setBar(L.i);
      if (q.type === 'order') drawOrder(q); else drawChoice(q);
      focusTitle();
    }

    function wait() { frame(); setBar(0); L.scroll.append(h('p', { class: 'rl__src rl__wait', role: 'status' }, 'Getting your questions…')); }
    async function start(ctx) {
      if (L.on) return true;
      let c = ctx; try { if (!c || c.bookId == null) c = LB.ctx(); } catch (e) { c = null; }
      if (!c || !S.book || !S.model || String(S.book.id) !== String(c.bookId)) { toast('Open a book to practise its chapters.', 2200); return false; }
      let far = -1; try { far = QG.furthest(S.lp, S.map, S.span); } catch (e) { far = -1; }
      try { const k = S.model.sents[S.curId]; if (k && !k.h && Number.isInteger(k.ch)) far = Math.max(far, k.ch); } catch (e) { /* no position yet */ }   // the chapter you are in now is reached, even when its track is not finished
      if (far < 0) { toast('Listen a little first. Questions use chapters you have reached.', 2600); return false; }
      const ch = (typeof c.chapter === 'number' && c.chapter >= 0) ? c.chapter : far;
      if (!L.root) {
        L.root = h('div', { class: 'rl qs', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'qs-title', hidden: true });
        L.root.addEventListener('keydown', ev => { if (ev.key === 'Escape') { ev.stopPropagation(); close(); } });
        document.body.append(L.root);
      }
      const tok = ++L.tok, model = S.model, bid = String(S.book.id);
      Object.assign(L, { on: true, qs: [], i: 0, right: 0, res: 0, ctx: c, canShow: !el.player.hidden, opener: document.activeElement, bt: S.book.title || '', ch, bid });
      L.root.hidden = false; wait(); histSoon();
      const r = await QG.forChapter(bid, model, ch, far);
      if (tok !== L.tok || !L.on) return false;   // closed while waiting
      const qs = r && r.ok ? pick(r.qs, SIZE) : [];
      if (!qs.length) { close(); toast(r && r.reason === 'locked' ? 'Questions use chapters you have reached.' : 'No questions for this chapter yet.', 2600); return false; }
      L.qs = qs; draw(); return true;
    }
    function close() {
      if (!L.on) return;
      L.on = false; L.tok++; L.root.hidden = true;
      try { LearnHub.refresh(); } catch (e) { /* hub not ready */ }
      histSoon(); if (L.opener && L.opener.isConnected) L.opener.focus();
    }
    return { start, close, pick, judge, get on() { return L.on; } };
  })();

  LearnHub.register({
    id: 'questions', order: 30, icon: '?', title: 'Questions',
    subtitle: () => { const n = QR.count(); return n ? n + (n === 1 ? ' chapter done' : ' chapters done') : 'Test what you read'; },
    playerSubtitle: c => { const r = c && c.chapter >= 0 ? QR.get(c.bookId, c.chapter) : null; return r ? 'Last time: ' + r.r + ' of ' + r.n + ' right' : '5 questions on this chapter'; },
    open: c => { QS.start(c); }
  });
