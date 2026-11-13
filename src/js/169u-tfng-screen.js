  /* ---------- True / False / Not Given trainer: the screen (TFS, Task 61) ----------
     A full-screen set of up to 8 statements about ONE passage of the open book. The passage (numbered lines) stays on top, the statement under it, and three
     big answers: True, False, Not Given. A tap is the answer (no Check button). Then a panel at the bottom says Correct or Not quite, gives the reason
     written by the pack with a one-line rule after it, and "Show in text": the supporting line(s) are lit in the passage (for True and False they are lit at once; for
     Not Given the button shows the closest line, and says that it does not answer the statement). Calm: no lives, no timer, no score to beat, nothing saved
     about wrong answers. Same frame, progress bar and panel as the paraphrase trainer (169p): .rl*, .qs*, .wl-* are reused; 94zb-tfng.css adds the passage card.
     First use: one card before the first statement says in plain words what True, False and Not Given mean (Not Given with an example). Seen =
     localStorage 'wt:tfngintro' = '1', this device only, not synced, not in the backup.
     Data: packs only (167h, TFK): approved statements made offline. No live AI, no key, nothing is generated here. No pack for the open book = the Learn tile
     is hidden (LearnHub show, 169b). Spoiler rule: only passages of chapters the reader has reached (TFK.passages). Finished set = IE.log('r') (169o), the
     same as the other Reading sets; closing half way logs nothing. Registered as Learn hub tile 'tfng' (order 39; also in "Study this chapter").
     Nothing runs at start-up; packs are only asked for when the hub or the Study sheet is drawn, and playback is never touched.
       TFS.start(ctx)  Promise -> true when a set opened      TFS.close()   TFS.on      TFS.SIZE  8
       TFS.judge(item, a)   pure      TFS.label(a)   'True' | 'False' | 'Not Given'
     Remove this file, 167h, their build.py lines, 94zb-tfng.css, the tile's show/onChange hooks (169b, 169e) and the TFS lines in 270 to go back. */
  const TFS = (() => {
    const SIZE = 8, KEY = 'wt:tfngintro';
    const LAB = { T: 'True', F: 'False', NG: 'Not Given' };
    const OK = { T: 'Correct: True', F: 'Correct: False', NG: 'Correct: Not Given' };
    const BAD = { T: 'Not quite. The answer is True.', F: 'Not quite. The answer is False.', NG: 'Not quite. The answer is Not Given.' };
    const RULE = { T: 'The text says the same thing.', F: 'The text says the opposite.', NG: "If the text doesn't say it, the answer is Not Given." };
    const L = { on: false, root: null, p: null, qs: [], i: 0, right: 0, tok: 0, opener: null, fill: null, bar: null, scroll: null, foot: null, lines: [] };
    const seen = () => { try { return localStorage.getItem(KEY) === '1'; } catch (e) { return false; } };
    const setSeen = () => { try { localStorage.setItem(KEY, '1'); } catch (e) { /* not saved: the card shows again next time */ } };
    const setBar = n => {
      const pct = L.qs.length ? Math.round(100 * n / L.qs.length) : 0;
      if (L.fill) L.fill.style.setProperty('--wl-p', pct + '%'); if (L.bar) L.bar.setAttribute('aria-valuenow', String(n));
    };
    function chip() {   // the streak when there is one (hidden in Calm mode), else nothing
      let st = 0; try { if (!P.calm) st = (PG.model() || {}).streak || 0; } catch (e) { /* progress not ready */ }
      return st > 0 ? h('span', { class: 'qs__chip', 'aria-label': st + ' day streak' }, h('span', { 'aria-hidden': 'true' }, '\u{1F525}'), h('span', {}, String(st))) : h('span', { class: 'qs__chip tf-nochip', 'aria-hidden': 'true' });
    }
    function frame() {
      L.root.textContent = '';
      L.fill = h('span', { class: 'wl-progress__fill' });
      L.bar = h('div', { class: 'wl-progress rl__bar', role: 'progressbar', 'aria-label': 'Progress', 'aria-valuemin': '0', 'aria-valuemax': String(L.qs.length || 1) }, L.fill);
      L.root.append(h('header', { class: 'rl__top' }, h('button', { class: 'rl__x', type: 'button', 'aria-label': 'Close True, False, Not Given practice', onclick: close }, '\u2715'), L.bar, chip()));
      L.scroll = h('div', { class: 'rl__scroll' }); L.foot = h('footer', { class: 'rl__foot' });
      L.root.append(L.scroll, L.foot);
    }
    const focusTitle = () => { const t = L.root.querySelector('#tf-title'); if (t) t.focus({ preventScroll: true }); };
    const title = () => h('h1', { class: 'sr-only', id: 'tf-title', tabindex: '-1' }, 'True, False or Not Given?');

    function passageCard() {
      L.lines = L.p.lines.map((l, i) => h('p', { class: 'tf-line' }, h('span', { class: 'tf-n' }, String(i + 1)), h('span', { class: 'tf-t' }, l[1])));
      return h('section', { class: 'wl-card tf-pass', 'aria-labelledby': 'tf-pass-lab' }, h('p', { class: 'tf-lab', id: 'tf-pass-lab' }, 'Passage'),
        h('div', { class: 'tf-lines', tabindex: '0', role: 'region', 'aria-labelledby': 'tf-pass-lab' }, ...L.lines));
    }
    function light(nums, kind) {   // nums = line indexes (0-based); kind 'is-hit' (supporting) or 'is-near' (closest, does not answer it)
      L.lines.forEach(p => { p.classList.remove('is-hit', 'is-near'); const o = p.querySelector('.sr-only'); if (o) o.remove(); });
      nums.forEach(n => { const p = L.lines[n]; if (!p) return; p.classList.add(kind); p.prepend(h('span', { class: 'sr-only' }, kind === 'is-hit' ? 'Supporting line' : 'Closest line')); });
      const f = L.lines[nums[0]], box = f && f.parentElement;   // only the passage box scrolls (the statement and the answers stay where they are)
      try { if (box) { const r = f.getBoundingClientRect(), b = box.getBoundingClientRect(); box.scrollTop += (r.top - b.top) - (b.height - r.height) / 2; } } catch (e) { /* the passage stays where it is */ }
    }

    function panel(q, a, ok) {
      L.right += ok ? 1 : 0; setBar(L.i + 1);
      const last = L.i + 1 >= L.qs.length, near = q.a === 'NG' ? TFK.nearest(q.st, L.p.lines) : -1;
      const go = h('button', { class: 'wl-btn wl-btn--block ' + (ok ? 'wl-btn--ok' : 'wl-btn--primary'), type: 'button', onclick: () => { L.i++; draw(); } }, last ? 'Finish' : 'Continue');
      const note = h('span', { class: 'tf-more', hidden: true }, 'The marked line is the closest one. It does not say this.');
      let show = null;
      if (q.a !== 'NG' || near >= 0) {
        show = h('button', { class: 'tf-show', type: 'button', 'aria-pressed': 'false' }, h('span', { 'aria-hidden': 'true' }, '\u{1F4D6}'), h('span', {}, q.a === 'NG' ? 'Show closest line' : 'Show in text'));
        show.addEventListener('click', () => {
          if (q.a === 'NG') { light([near], 'is-near'); note.hidden = false; } else light(q.sup.map(n => n - 1), 'is-hit');
          show.setAttribute('aria-pressed', 'true');
        });
      }
      L.foot.textContent = '';
      L.foot.append(h('div', { class: 'wl-panel wl-panel--dock rl__panel' + (ok ? '' : ' wl-panel--bad'), role: 'status' },
        h('div', { class: 'wl-panel__head' }, h('span', { class: 'wl-panel__icon', 'aria-hidden': 'true' }, ok ? '\u2705' : '\u{1F4A1}'), h('h2', { class: 'wl-panel__title' }, ok ? OK[q.a] : BAD[q.a])),
        h('p', { class: 'wl-panel__text' }, q.why, ' ', h('span', { class: 'tf-rule' }, RULE[q.a]), note), show, go));
      if (q.a !== 'NG') light(q.sup.map(n => n - 1), 'is-hit');   // True and False: the line that proves it is lit at once
      try { const st = L.scroll.querySelector('.tf-st'); if (st && typeof st.scrollIntoView === 'function') st.scrollIntoView({ block: 'nearest' }); } catch (e) { /* the page stays where it is */ }   // the statement stays readable above the panel
      go.focus({ preventScroll: true });
    }

    function drawQ(q) {
      let done = false;
      const btns = ['T', 'F', 'NG'].map(a => h('button', { class: 'wl-card wl-card--tap qs__opt tf-opt', type: 'button', 'aria-pressed': 'false', 'data-a': a }, h('span', {}, LAB[a])));
      btns.forEach(b => b.addEventListener('click', () => {
        if (done) return; done = true;
        const a = b.getAttribute('data-a'), ok = TFK.judge(q, a);
        b.setAttribute('aria-pressed', 'true');
        btns.forEach(o => {
          o.setAttribute('aria-disabled', 'true'); const x = o.getAttribute('data-a');
          if (x === q.a) { o.classList.add('is-correct'); o.append(h('span', { class: 'tf-tick', 'aria-hidden': 'true' }, ' \u2714')); } else if (o === b) o.classList.add('is-wrong');
        });
        panel(q, a, ok);
      }));
      L.scroll.append(h('div', { class: 'rl__main' }, title(), passageCard(),
        h('p', { class: 'rl__lab', id: 'tf-st-lab' }, 'Statement'), h('p', { class: 'tf-st' }, q.st),
        h('div', { class: 'tf-opts', role: 'group', 'aria-labelledby': 'tf-st-lab' }, ...btns)));
    }

    function drawIntro() {   // first use: True, False and Not Given in plain words
      frame(); setBar(0);
      const row = (a, t) => h('li', { class: 'tf-row' }, h('strong', { class: 'tf-rl' }, LAB[a]), h('span', {}, t));
      L.scroll.append(h('div', { class: 'rl__main' }, h('h1', { class: 'rl__title', id: 'tf-title', tabindex: '-1' }, 'Before you start'),
        h('p', { class: 'rl__src' }, 'You read a short passage, then decide about a statement. Use only what the passage says.'),
        h('ul', { class: 'tf-rules' }, row('T', 'The passage says the same thing.'), row('F', 'The passage says the opposite.'),
          row('NG', "The passage doesn't say it, either way. It may be true in real life, but the passage does not tell you.")),
        h('div', { class: 'wl-card tf-ex' }, h('p', { class: 'tf-lab' }, 'Example'),
          h('p', { class: 'tf-exp' }, 'Passage: \u201cMaria walked to school.\u201d'), h('p', { class: 'tf-exp' }, 'Statement: \u201cMaria walked to school with her brother.\u201d'),
          h('p', { class: 'tf-exp' }, h('strong', {}, 'Not Given.'), ' ', 'The passage never mentions a brother.'))));
      L.foot.append(h('button', { class: 'wl-btn wl-btn--primary wl-btn--block', type: 'button', onclick: () => { setSeen(); draw(); } }, 'Got it'));
      focusTitle();
    }
    function drawDone() {
      frame(); setBar(L.qs.length);
      const n = L.qs.length;
      try { IE.log('r'); } catch (e) { /* IELTS practice log (169o) not loaded */ }
      try { LearnHub.refresh(); } catch (e) { /* hub not ready */ }
      L.scroll.append(h('div', { class: 'rl__main' }, h('h1', { class: 'rl__title', id: 'tf-title', tabindex: '-1' }, 'Set complete'),
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
      const sample = TFK.sampleOn(), bid = TFK.bookId();
      if (!bid || (!sample && (!S.book || !S.model))) { toast('Open a book to practise its passages.', 2200); return false; }
      let far = -1;
      if (!sample) {
        try { far = QG.furthest(S.lp, S.map, S.span); } catch (e) { far = -1; }
        try { const k = S.model.sents[S.curId]; if (k && !k.h && Number.isInteger(k.ch)) far = Math.max(far, k.ch); } catch (e) { /* no position yet */ }
        if (far < 0) { toast('Listen a little first. Questions use chapters you have reached.', 2600); return false; }
      }
      if (!L.root) {
        L.root = h('div', { class: 'rl qs tf', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'tf-title', hidden: true });
        L.root.addEventListener('keydown', ev => { if (ev.key === 'Escape') { ev.stopPropagation(); close(); } });
        document.body.append(L.root);
      }
      const tok = ++L.tok;
      Object.assign(L, { on: true, qs: [], i: 0, right: 0, p: null, opener: document.activeElement });
      L.root.hidden = false; wait(); histSoon();
      let ps = [];
      try { ps = await TFK.passages(bid, { sents: sample ? null : S.model.sents, far, sample }); } catch (e) { ps = []; }
      if (tok !== L.tok || !L.on) return false;   // closed while waiting
      if (!ps.length) { close(); toast('No True / False / Not Given practice for the chapters you have reached yet.', 2800); return false; }
      L.p = ps[Math.floor(Math.random() * ps.length)];
      L.qs = TFK.mixed(L.p.items, SIZE);
      if (seen()) draw(); else drawIntro();
      return true;
    }
    function close() {
      if (!L.on) return;
      L.on = false; L.tok++; L.root.hidden = true;
      try { LearnHub.refresh(); } catch (e) { /* hub not ready */ }
      histSoon(); if (L.opener && L.opener.isConnected) L.opener.focus();
    }
    return { start, close, judge: (q, a) => TFK.judge(q, a), label: a => LAB[a] || '', SIZE, get on() { return L.on; } };
  })();

  LearnHub.register({
    id: 'tfng', order: 39, icon: '\u2714', title: 'True / False / Not Given',
    subtitle: 'Find the line that proves it',
    playerSubtitle: 'Statements on this book',
    show: () => TFK.visible(),
    open: c => { TFS.start(c); }
  });
