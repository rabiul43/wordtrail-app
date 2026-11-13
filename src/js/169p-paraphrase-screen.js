  /* ---------- Paraphrase trainer: the screen (PP, Task 56) ----------
     A full-screen set of up to 5 questions about ONE chapter the reader has reached, made by the paraphrase generator (167f, PQ) from the
     book's own sentences. One question: the book sentence is shown (the word that gets swapped is underlined), pick the sentence that means
     the same thing in other words. Pick an answer, tap Check; the right and wrong choices are marked and the swapped word is shown in bold in
     each choice, a \"Swap ideas\" row shows word -> word swaps that fit the sentence, and a panel at the bottom says what happened; tap Continue.
     Calm: no lives, no timer, no score to beat. A wrong answer only shows the better sentence. Same frame, progress bar and panel as the chapter
     questions (169g): the .rl* and .wl-* styles are reused; 94w-paraphrase.css adds the Original card, the underline and the chips.
     Spoiler guard: the chapter is limited by QG.furthest (167c) and PQ.forChapter checks it again. Words are looked up for that chapter only.
     When the set is finished (all questions answered) one Reading session and one Writing session are added to the IELTS hub log: IE.log('r') and
     IE.log('w') (169o). Closing half way logs nothing. No storage key of its own and no saved results (the chapter questions' results, wt:qres, are not touched).
     Registered in the Learn hub (169b) as the tile \"Paraphrase\" (order 35); it is also in the player's \"Study this chapter\" sheet (169e) and is the
     Writing (and a second Reading) practice button in the IELTS skill sheet (169o, TOOL).
     Nothing runs at start-up and playback is never touched; the generator is only called when the tile is tapped. Without word data (offline, nothing
     saved yet) a short message says there are no paraphrases for the chapter yet.
       PP.start(ctx)   ctx = { bookId, chapter } like QS.start. Promise -> true when a set opened
       PP.close()      PP.on   true while open
       PP.judge(q, sel)  pure: true when sel (choice index) is the right one
       PP.SIZE         5
     Remove this file, its build.py lines, 94w-paraphrase.css and the TOOL entries in 169o to go back. */
  const PP = (() => {
    const SIZE = 5;
    const judge = (q, sel) => !!q && Number.isInteger(sel) && sel === q.answer;
    const L = { on: false, root: null, qs: [], i: 0, right: 0, tok: 0, opener: null, fill: null, bar: null, bt: '', ch: 0, bid: '' };
    const setBar = n => {
      const pct = L.qs.length ? Math.round(100 * n / L.qs.length) : 0;
      if (L.fill) L.fill.style.setProperty('--wl-p', pct + '%'); if (L.bar) L.bar.setAttribute('aria-valuenow', String(n));
    };
    function chip() {   // the streak when there is one (hidden in Calm mode), else the chapter in use
      let st = 0; try { if (!P.calm) st = (PG.model() || {}).streak || 0; } catch (e) { /* progress not ready */ }
      return st > 0 ? h('span', { class: 'qs__chip', 'aria-label': st + ' day streak' }, h('span', { 'aria-hidden': 'true' }, '\u{1F525}'), h('span', {}, String(st)))
        : h('span', { class: 'qs__chip' }, h('span', { 'aria-hidden': 'true' }, '\u{1F6E1}'), h('span', {}, 'Ch. ' + (L.ch + 1)));
    }
    function frame() {
      L.root.textContent = '';
      L.fill = h('span', { class: 'wl-progress__fill' });
      L.bar = h('div', { class: 'wl-progress rl__bar', role: 'progressbar', 'aria-label': 'Progress', 'aria-valuemin': '0', 'aria-valuemax': String(L.qs.length || 1) }, L.fill);
      L.root.append(h('header', { class: 'rl__top' }, h('button', { class: 'rl__x', type: 'button', 'aria-label': 'Close paraphrase practice', onclick: close }, '\u2715'), L.bar, chip()));
      L.scroll = h('div', { class: 'rl__scroll' }); L.foot = h('footer', { class: 'rl__foot' });
      L.root.append(L.scroll, L.foot);
    }
    const focusTitle = () => { const t = L.root.querySelector('#ps-title'); if (t) t.focus({ preventScroll: true }); };
    const num = i => h('span', { class: 'qs__num', 'aria-hidden': 'true' }, String(i));
    // the words of a choice that were swapped, picked out of the sentence with the question's own start and end
    const swapOf = (q, c) => c.length >= q.pre.length + q.post.length && c.startsWith(q.pre) && c.endsWith(q.post) ? c.slice(q.pre.length, c.length - q.post.length) : '';
    const sentNode = (q, c) => { const w = swapOf(q, c); return w ? [q.pre, h('strong', { class: 'qs__hit' }, w), q.post] : [c]; };

    function panel(q, ok) {
      L.right += ok ? 1 : 0; setBar(L.i + 1);
      const last = L.i + 1 >= L.qs.length, good = q.choices[q.answer];
      const go = h('button', { class: 'wl-btn wl-btn--block ' + (ok ? 'wl-btn--ok' : 'wl-btn--primary'), type: 'button', onclick: () => { L.i++; draw(); } }, last ? 'Finish' : 'Continue');
      L.foot.textContent = '';
      L.foot.append(h('div', { class: 'wl-panel wl-panel--dock rl__panel' + (ok ? '' : ' wl-panel--bad'), role: 'status' },
        h('div', { class: 'wl-panel__head' }, h('span', { class: 'wl-panel__icon', 'aria-hidden': 'true' }, ok ? '\u{1F389}' : '\u{1F4A1}'), h('h2', { class: 'wl-panel__title' }, ok ? 'Correct!' : 'Not quite.')),
        h('p', { class: 'wl-panel__text' }, h('span', {}, 'Same meaning:'), ' \u201c' + good + '\u201d'),
        !ok ? h('p', { class: 'wl-panel__text' }, 'The other sentences change the meaning. No problem, try the next one.') : null, go));
      go.focus();
    }
    function ideas(q) {   // "Swap ideas": word -> word chips that fit this sentence
      const list = (Array.isArray(q.ideas) && q.ideas.length ? q.ideas : [[q.word, q.syn]]).filter(x => Array.isArray(x) && x[0] && x[1]);
      return h('div', { class: 'pp-ideas' }, h('p', { class: 'rl__lab', id: 'pp-ideas-lab' }, 'Swap ideas'),
        h('ul', { class: 'pp-chips', 'aria-labelledby': 'pp-ideas-lab' }, ...list.map(x => h('li', { class: 'pp-chip' }, x[0] + ' \u2192 ' + x[1]))));
    }

    function drawQ(q) {
      let sel = -1, checked = false;
      const check = h('button', { class: 'wl-btn wl-btn--primary wl-btn--block', type: 'button', disabled: true }, 'Check');
      const txts = q.choices.map(c => h('span', { class: 'qs__txt' }, c));
      const opts = q.choices.map((c, i) => h('button', { class: 'wl-card wl-card--tap qs__opt', type: 'button', 'aria-pressed': 'false' }, num(i + 1), txts[i]));
      opts.forEach((b, i) => b.addEventListener('click', () => {
        if (checked) return;
        sel = i; opts.forEach((o, j) => o.setAttribute('aria-pressed', String(j === i))); check.disabled = false;
      }));
      const main = h('div', { class: 'rl__main' },
        h('h1', { class: 'rl__title', id: 'ps-title', tabindex: '-1' }, 'Choose the best paraphrase'),
        h('div', { class: 'wl-card rl__sent pp-orig' }, h('p', { class: 'pp-lab' }, 'Original'), h('p', { class: 'rl__s' }, q.pre, h('span', { class: 'pp-hit' }, q.word), q.post)),
        h('p', { class: 'rl__lab', id: 'ps-lab' }, 'Pick the sentence with the same meaning'),
        h('div', { class: 'qs__list', role: 'group', 'aria-labelledby': 'ps-lab' }, ...opts));
      L.scroll.append(main); L.foot.append(check);
      check.addEventListener('click', () => {
        if (checked || sel < 0) return; checked = true;
        const ok = judge(q, sel);
        opts.forEach((o, i) => {
          o.setAttribute('aria-disabled', 'true');
          if (i === q.answer) o.classList.add('is-correct'); else if (i === sel) o.classList.add('is-wrong');
          txts[i].textContent = ''; txts[i].append(...sentNode(q, q.choices[i]));   // show the swapped word in bold
        });
        const sw = ideas(q); main.append(sw);
        panel(q, ok);
        try { if (typeof sw.scrollIntoView === 'function') sw.scrollIntoView({ block: 'nearest' }); } catch (e) { /* the chips stay where they are */ }   // the chips come into view above the panel
      });
    }

    function drawDone() {
      frame(); setBar(L.qs.length);
      const n = L.qs.length;
      try { IE.log('r'); } catch (e) { /* IELTS practice log (169o) not loaded */ }
      try { IE.log('w'); } catch (e) { /* IELTS practice log (169o) not loaded */ }
      try { LearnHub.refresh(); } catch (e) { /* hub not ready */ }
      L.scroll.append(h('div', { class: 'rl__main' }, h('h1', { class: 'rl__title', id: 'ps-title', tabindex: '-1' }, 'Set complete'),
        h('p', { class: 'rl__score' }, L.right + ' of ' + n + ' right'),
        L.right < n ? h('p', { class: 'rl__src' }, 'Have another look at the chapter whenever you like.') : h('p', { class: 'rl__src' }, 'All right this time. Well done.')));
      L.foot.append(h('button', { class: 'wl-btn wl-btn--primary wl-btn--block', type: 'button', onclick: close }, 'Done'));
      focusTitle();
    }
    function draw() {
      if (L.i >= L.qs.length) { drawDone(); return; }
      frame(); setBar(L.i); drawQ(L.qs[L.i]); focusTitle();
    }
    function wait() { frame(); setBar(0); L.scroll.append(h('p', { class: 'rl__src rl__wait', role: 'status' }, 'Getting your questions\u2026')); }

    async function start(ctx) {
      if (L.on) return true;
      let c = ctx; try { if (!c || c.bookId == null) c = LB.ctx(); } catch (e) { c = null; }
      if (!c || !S.book || !S.model || String(S.book.id) !== String(c.bookId)) { toast('Open a book to practise its chapters.', 2200); return false; }
      let far = -1; try { far = QG.furthest(S.lp, S.map, S.span); } catch (e) { far = -1; }
      try { const k = S.model.sents[S.curId]; if (k && !k.h && Number.isInteger(k.ch)) far = Math.max(far, k.ch); } catch (e) { /* no position yet */ }
      if (far < 0) { toast('Listen a little first. Questions use chapters you have reached.', 2600); return false; }
      const ch = (typeof c.chapter === 'number' && c.chapter >= 0) ? c.chapter : far;
      if (!L.root) {
        L.root = h('div', { class: 'rl qs pp', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'ps-title', hidden: true });
        L.root.addEventListener('keydown', ev => { if (ev.key === 'Escape') { ev.stopPropagation(); close(); } });
        document.body.append(L.root);
      }
      const tok = ++L.tok, model = S.model, bid = String(S.book.id);
      Object.assign(L, { on: true, qs: [], i: 0, right: 0, opener: document.activeElement, bt: S.book.title || '', ch, bid });
      L.root.hidden = false; wait(); histSoon();
      const r = await PQ.forChapter(bid, model, ch, far, { max: SIZE });
      if (tok !== L.tok || !L.on) return false;   // closed while waiting
      const qs = r && r.ok ? r.qs.slice(0, SIZE) : [];
      if (!qs.length) { close(); toast(r && r.reason === 'locked' ? 'Questions use chapters you have reached.' : 'No paraphrase questions for this chapter yet.', 2600); return false; }
      L.qs = qs; draw(); return true;
    }
    function close() {
      if (!L.on) return;
      L.on = false; L.tok++; L.root.hidden = true;
      try { LearnHub.refresh(); } catch (e) { /* hub not ready */ }
      histSoon(); if (L.opener && L.opener.isConnected) L.opener.focus();
    }
    return { start, close, judge, SIZE, get on() { return L.on; } };
  })();

  LearnHub.register({
    id: 'paraphrase', order: 35, icon: '\u2248', title: 'Paraphrase',
    subtitle: 'Say it in other words',
    playerSubtitle: '5 paraphrases on this chapter',
    open: c => { PP.start(c); }
  });
