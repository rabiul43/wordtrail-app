  /* ---------- Review lesson: a full-screen session, one question at a time (My words > "Practise N due words") ----------
     Three question types (logic in 167b, RT): MEANING MATCH, FILL THE BLANK WITH A WORD BANK and TYPED RECALL. RT.pick chooses one for each word from
     how well you know it (new word: meaning match; right 1-2 times: fill; right 3+ times or familiar: typed), and the next type is used when the
     first cannot be made. FILL THE BLANK WITH A WORD BANK: the sentence is one you met the word in (a saved place, or the old example
     sentence), with the word cut out; the bank holds the word and up to 3 other saved words. Pick one, tap Check, read the panel at the bottom,
     tap Continue. A session is the 10 most overdue words that can be asked. No lives, no timer, no penalty: a wrong answer just brings the
     word back soon.
     Grades go to the scheduler (148) the moment you tap Check, so closing the lesson half way keeps what you did:
       right  -> SRS.GOOD, kind 'rcl' (fill in the blank counts as recall)      wrong -> SRS.AGAIN (back in 10 minutes)
     Words only change through WS.update (147). Nothing runs at start-up: the screen is built the first time the lesson opens, and playback
     is never touched. The old Review tab stays; RL.start() gives false when no word can be asked, and the caller then opens that tab.
       RL.split(sentence, w)         { pre, hit, post } or null: the word as a whole word in the sentence
       RL.question(e, pool, rnd)     one question for saved word e (pool = saved words that may fill the bank), or null: no sentence with
                                     the word in it, or no other word for the bank. rnd is Math.random unless a test passes its own
                                     { w, pre, post, bank, answer (index in bank), hint (your note), bt, ch }
       RL.plan(all, now, max, rnd)   { qs, skipped, due }: due words, most overdue first, at most max questions
       RL.build(e, pool, rnd)        like question(), but the type that fits the word's level; { k: 'mm' | 'fill' | 'type', w, ... } or null.
                                     A meaning-match question gets its bank later, in prep (the meaning may come from the dictionary)
       RL.prep(q, rnd)               Promise: a ready question, or the fill/typed question to ask instead, or null when the word cannot be asked now
       RL.plan(all, now, max, rnd, mix)   mix true: build() for each word (the lesson does this); mix false or left out: fill questions only, as before
       RL.grade(w, ok, now, kind, verdict)   sends the grade; kind 'fill' (default) | 'mm' | 'type'; verdict 'ok' | 'close' | 'no' (default from ok).
                                     Returns the new entry or null. Typed 'close' (one letter off) is Hard, 'no' is Again
       RL.start()                    opens the lesson; false when there is nothing to ask      RL.close()   RL.on   true while open */
  const RL = (() => {
    const SIZE = 10, { str, key, rxWord, shuffle } = RT;   // the shared helpers live in 167b

    /* ----- data (no screen code) ----- */
    function split(s, w) {
      s = str(s).replace(/\s+/g, ' ').trim(); w = str(w).trim(); if (!s || !w) return null;
      const m = rxWord(w).exec(s); if (!m) return null;
      const a = m.index + m[1].length;
      return { pre: s.slice(0, a), hit: m[2], post: s.slice(a + m[2].length) };
    }
    const maskWord = RT.mask;

    function sent(e) {   // the place to ask about: a saved sentence that really holds the word; next time the word comes, another place
      const w = key(e.w), opts = WC.places(e).map(c => ({ c, sp: split(c.s, w) })).filter(x => x.sp);
      if (!opts.length) return null;
      const reps = (typeof e.reps === 'number' && e.reps > 0) ? Math.floor(e.reps) : 0, pick = opts[reps % opts.length];
      return { c: pick.c, sp: pick.sp, full: pick.sp.pre + pick.sp.hit + pick.sp.post };
    }
    const chap = c => (c && typeof c.ch === 'number' && isFinite(c.ch)) ? c.ch : null;
    function question(e, pool, rnd) {
      rnd = rnd || Math.random;
      if (!e || typeof e.w !== 'string' || !key(e.w)) return null;
      const w = key(e.w), S = sent(e); if (!S) return null;
      const b = RT.bank(w, e.lv, pool, S.full, rnd); if (!b) return null;
      return { k: 'fill', w, pre: S.sp.pre, post: S.sp.post, bank: b.bank, answer: b.answer, hint: str(e.note).trim(),
        bt: str(S.c.bt) || str(e.bt), ch: chap(S.c) };
    }
    function build(e, pool, rnd) {
      rnd = rnd || Math.random;
      if (!e || typeof e.w !== 'string' || !key(e.w)) return null;
      const w = key(e.w), note = str(e.note).trim(), S = sent(e);
      const others = (pool || []).some(x => { const k = key(x && x.w); return !!k && k !== w; });
      const fill = S && others ? question(e, pool, rnd) : null;
      const k = RT.pick(e, { fill: !!fill, mm: others && !!(note || S), type: !!(S || note) });
      if (!k) return null;
      if (k === 'fill') return fill;
      const meta = { w, bt: str(S && S.c.bt) || str(e.bt), ch: S ? chap(S.c) : null };
      const typed = () => Object.assign({ k: 'type', pre: S ? S.sp.pre : null, post: S ? S.sp.post : null, hint: note }, meta);
      if (k === 'type') return typed();
      return Object.assign({ k: 'mm', e, pool, def: note ? maskWord(note, w) : '', full: S ? S.full : '', ready: false, fb: fill || (S ? typed() : null) }, meta);
    }
    async function prep(q, rnd) {   // a meaning-match question needs a meaning: your note, else the dictionary (cached, optional); no meaning: ask another way
      if (!q || q.k !== 'mm' || q.ready) return q || null;
      let def = q.def;
      if (!def) {   // wait at most 2.5 s for the dictionary
        let tm; try { def = await Promise.race([vocDefine(q.w), new Promise(r => { tm = setTimeout(() => r(''), 2500); })]); } catch (err) { def = ''; }
        clearTimeout(tm); def = def ? maskWord(def, q.w) : '';
      }
      const b = def ? RT.bank(q.w, q.e.lv, q.pool, def, rnd) : null;
      if (!b) return q.fb || null;
      return Object.assign(q, { def, bank: b.bank, answer: b.answer, ready: true });
    }
    function plan(all, now, max, rnd, mix) {
      const words = (all || []).filter(e => e && typeof e.w === 'string' && key(e.w));
      const due = words.filter(e => SRS.isDue(e, now)).sort((a, b) => (a.due || 0) - (b.due || 0));
      const qs = []; let skipped = 0;
      for (const e of due) { if (qs.length >= (max || SIZE)) break; const q = mix ? build(e, words, rnd) : question(e, words, rnd); if (q) qs.push(q); else skipped++; }
      return { qs, skipped, due: due.length };
    }
    function grade(w, ok, now, kind, verdict) {
      const gr = RT.grading(kind || 'fill', verdict || (ok ? 'ok' : 'no'));
      try { LL.review((verdict || (ok ? 'ok' : 'no')) !== 'no'); } catch (e) { /* learning log (148b) not loaded */ }
      return WS.update(w, t => SRS.review(t, gr.g, now, { kind: gr.kind, tz: -new Date().getTimezoneOffset() }));
    }

    /* ----- screen ----- */
    const L = { on: false, root: null, qs: [], i: 0, right: 0, missed: [], n: 0, finished: false, seq: 0, tok: 0, res: [], opener: null, fill: null, bar: null };
    const setBar = n => {
      const pct = L.qs.length ? Math.round(100 * n / L.qs.length) : 0;
      if (L.fill) L.fill.style.setProperty('--wl-p', pct + '%'); if (L.bar) L.bar.setAttribute('aria-valuenow', String(n));
    };
    function frame() {   // the top bar (Close and progress) stays for the whole lesson; the rest is redrawn per question
      L.root.textContent = '';
      L.fill = h('span', { class: 'wl-progress__fill' });
      L.bar = h('div', { class: 'wl-progress rl__bar', role: 'progressbar', 'aria-label': 'Progress', 'aria-valuemin': '0', 'aria-valuemax': String(L.qs.length) }, L.fill);
      L.root.append(h('header', { class: 'rl__top' }, h('button', { class: 'rl__x', type: 'button', 'aria-label': 'Close lesson', onclick: close }, '✕'), L.bar));
      L.scroll = h('div', { class: 'rl__scroll' }); L.foot = h('footer', { class: 'rl__foot' });
      L.root.append(L.scroll, L.foot);
    }
    const paintB = (blank, text) => { blank.textContent = text || ''; if (text) { blank.removeAttribute('role'); blank.removeAttribute('aria-label'); } else { blank.setAttribute('role', 'img'); blank.setAttribute('aria-label', 'blank'); } };
    const title = (id, text) => h('h1', { class: 'rl__title', id, tabindex: '-1' }, text);

    function drawQ() {
      const q = L.qs[L.i], seq = ++L.seq; let sel = -1, checked = false;
      frame(); setBar(L.i);
      const blank = h('span', { class: 'rl__blank', role: 'img', 'aria-label': 'blank' });
      const paintBlank = text => paintB(blank, text);
      const src = q.bt ? h('p', { class: 'rl__src' }, 'From ' + q.bt + (q.ch ? ' · Chapter ' + q.ch : '')) : null;
      const hintSlot = h('div', { class: 'rl__hintslot' });
      const hint = t => { if (t) hintSlot.append(h('div', { class: 'wl-card rl__hint' }, h('span', { 'aria-hidden': 'true' }, '\u{1F4A1}'), h('span', {}, t))); };
      const check = h('button', { class: 'wl-btn wl-btn--primary wl-btn--block', type: 'button', disabled: true }, 'Check');
      const opts = q.bank.map((word, i) => h('button', { class: 'wl-card wl-card--tap rl__opt', type: 'button', 'aria-pressed': 'false' }, word));
      opts.forEach((b, i) => b.addEventListener('click', () => {
        if (checked) return;
        sel = i; opts.forEach((o, j) => o.setAttribute('aria-pressed', String(j === i))); paintBlank(q.bank[i]); check.disabled = false;
      }));
      L.scroll.append(h('div', { class: 'rl__main' }, title('rl-title', 'Fill in the missing word'), src,
        h('div', { class: 'wl-card rl__sent' }, h('p', { class: 'rl__s' }, q.pre, blank, q.post)), hintSlot,
        h('p', { class: 'rl__lab', id: 'rl-lab' }, 'Pick the word'), h('div', { class: 'rl__bank', role: 'group', 'aria-labelledby': 'rl-lab' }, ...opts)));
      L.foot.append(check);

      if (q.hint) hint(maskWord(q.hint, q.w));   // your own note first; otherwise the dictionary meaning if it can be had (cached, optional)
      else vocDefine(q.w).then(t => { if (seq === L.seq && t) hint(maskWord(t, q.w)); }).catch(() => { /* offline: no hint */ });

      check.addEventListener('click', () => {
        if (checked || sel < 0) return; checked = true;
        const ok = sel === q.answer; let e = null;
        try { e = grade(q.w, ok, Date.now(), 'fill'); } catch (err) { /* the answer still counts on screen */ }
        opts.forEach((o, i) => { o.setAttribute('aria-disabled', 'true'); if (i === q.answer) o.classList.add('is-correct'); else if (i === sel) o.classList.add('is-wrong'); });
        paintBlank(q.bank[q.answer]); blank.classList.add('is-ok'); feedback(q, ok ? 'ok' : 'no', e);
      });
      L.root.querySelector('#rl-title').focus({ preventScroll: true });
    }

    /* The panel at the bottom after Check, the same for every type. verdict: 'ok' | 'close' (typed, one letter off: counts as right) | 'no'. */
    function feedback(q, verdict, e) {
      const ok = verdict !== 'no';
      L.n++; if (ok) L.right++; else L.missed.push(q.w);
      L.res.push({ w: q.w, v: verdict, k: q.k || 'fill' }); setBar(L.i + 1);
      const last = L.i + 1 >= L.qs.length, iv = e && typeof e.iv === 'number' ? e.iv : 0, bare = q.k === 'mm' || q.pre == null;   // bare: no sentence on screen
      const go = h('button', { class: 'wl-btn wl-btn--block ' + (ok ? 'wl-btn--ok' : 'wl-btn--primary'), type: 'button', onclick: () => { L.i++; draw(); } }, last ? 'Finish' : 'Continue');
      const text = verdict === 'ok' ? (iv >= 1 ? 'Next review in ' + iv + (iv === 1 ? ' day.' : ' days.') : 'Well done.')
        : verdict === 'close' ? 'Nearly. The spelling is “' + q.w + '”.'
        : (bare ? 'The word is “' : 'The missing word is “') + q.w + '”.';
      L.foot.textContent = '';
      L.foot.append(h('div', { class: 'wl-panel wl-panel--dock rl__panel' + (ok ? '' : ' wl-panel--bad'), role: 'status' },
        h('div', { class: 'wl-panel__head' }, h('span', { class: 'wl-panel__icon', 'aria-hidden': 'true' }, ok ? '✓' : '•'),
          h('h2', { class: 'wl-panel__title' }, verdict === 'ok' ? 'Correct!' : verdict === 'close' ? 'Almost!' : 'Not quite.')),
        h('p', { class: 'wl-panel__text' }, text),
        q.k === 'mm' && q.full ? h('p', { class: 'wl-panel__text' }, 'In your book: “' + q.full + '”') : null,
        !ok ? h('p', { class: 'wl-panel__text' }, 'No problem. It will come back soon.') : null, go));
      go.focus();
    }

    function drawMM() {   // MEANING MATCH: a meaning on the card, pick the word
      const q = L.qs[L.i]; let sel = -1, checked = false;
      frame(); setBar(L.i);
      const check = h('button', { class: 'wl-btn wl-btn--primary wl-btn--block', type: 'button', disabled: true }, 'Check');
      const opts = q.bank.map(word => h('button', { class: 'wl-card wl-card--tap rl__opt', type: 'button', 'aria-pressed': 'false' }, word));
      opts.forEach((b, i) => b.addEventListener('click', () => {
        if (checked) return;
        sel = i; opts.forEach((o, j) => o.setAttribute('aria-pressed', String(j === i))); check.disabled = false;
      }));
      L.scroll.append(h('div', { class: 'rl__main' }, title('rl-title', 'Which word matches this meaning?'),
        h('div', { class: 'wl-card rl__sent' }, h('p', { class: 'rl__s rl__s--def' }, q.def)),
        h('p', { class: 'rl__lab', id: 'rl-lab' }, 'Pick the word'), h('div', { class: 'rl__bank', role: 'group', 'aria-labelledby': 'rl-lab' }, ...opts)));
      L.foot.append(check);
      check.addEventListener('click', () => {
        if (checked || sel < 0) return; checked = true;
        const ok = sel === q.answer; let e = null;
        try { e = grade(q.w, ok, Date.now(), 'mm'); } catch (err) { /* the answer still counts on screen */ }
        opts.forEach((o, i) => { o.setAttribute('aria-disabled', 'true'); if (i === q.answer) o.classList.add('is-correct'); else if (i === sel) o.classList.add('is-wrong'); });
        feedback(q, ok ? 'ok' : 'no', e);
      });
      L.root.querySelector('#rl-title').focus({ preventScroll: true });
    }

    function drawType() {   // TYPED RECALL: the sentence with a gap (or just the meaning), type the word
      const q = L.qs[L.i], seq = ++L.seq; let checked = false;
      const withS = q.pre != null;
      frame(); setBar(L.i);
      const blank = withS ? h('span', { class: 'rl__blank', role: 'img', 'aria-label': 'blank' }) : null;
      const src = withS && q.bt ? h('p', { class: 'rl__src' }, 'From ' + q.bt + (q.ch ? ' · Chapter ' + q.ch : '')) : null;
      const hintSlot = h('div', { class: 'rl__hintslot' });
      const hint = t => { if (t) hintSlot.append(h('div', { class: 'wl-card rl__hint' }, h('span', { 'aria-hidden': 'true' }, '\u{1F4A1}'), h('span', {}, t))); };
      const input = h('input', { class: 'rl__input', id: 'rl-in', type: 'text', lang: 'en', dir: 'ltr', autocomplete: 'off', autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false', enterkeyhint: 'done', 'aria-labelledby': 'rl-lab' });
      const check = h('button', { class: 'wl-btn wl-btn--primary wl-btn--block', type: 'button', disabled: true }, 'Check');
      input.addEventListener('input', () => { if (!checked) check.disabled = !input.value.trim(); });
      input.addEventListener('keydown', ev => { if (ev.key === 'Enter' && !checked && input.value.trim()) { ev.preventDefault(); check.click(); } });
      L.scroll.append(h('div', { class: 'rl__main' }, title('rl-title', withS ? 'Type the missing word' : 'Type the word for this meaning'), src,
        withS ? h('div', { class: 'wl-card rl__sent' }, h('p', { class: 'rl__s' }, q.pre, blank, q.post))
              : h('div', { class: 'wl-card rl__sent' }, h('p', { class: 'rl__s rl__s--def' }, maskWord(q.hint, q.w))),
        withS ? hintSlot : null, h('p', { class: 'rl__lab', id: 'rl-lab' }, 'Your answer'), input));
      L.foot.append(check);
      if (withS) { if (q.hint) hint(maskWord(q.hint, q.w)); else vocDefine(q.w).then(t => { if (seq === L.seq && t) hint(maskWord(t, q.w)); }).catch(() => { /* offline: no hint */ }); }
      check.addEventListener('click', () => {
        if (checked || !input.value.trim()) return; checked = true;
        const v = RT.judge(input.value, q.w); let e = null;
        try { e = grade(q.w, v !== 'no', Date.now(), 'type', v); } catch (err) { /* the answer still counts on screen */ }
        input.readOnly = true; input.blur(); input.classList.add(v === 'no' ? 'is-wrong' : 'is-correct');
        if (blank) { paintB(blank, q.w); blank.classList.add('is-ok'); }
        feedback(q, v, e);
      });
      L.root.querySelector('#rl-title').focus({ preventScroll: true });
    }

    function drawDone() {   // the summary: words reviewed, how many right, the words to try again. No score to beat.
      L.finished = true; frame(); setBar(L.qs.length);
      const s = RT.summary(L.res, L.qs.length), pills = list => h('div', { class: 'rl__bank' }, ...list.map(w => h('span', { class: 'wl-pill' }, w)));
      L.scroll.append(h('div', { class: 'rl__main' }, title('rl-title', 'Session complete'),
        h('p', { class: 'rl__score' }, s.right + ' of ' + s.reviewed + ' right'),
        h('p', { class: 'rl__src' }, s.reviewed === 1 ? '1 word reviewed' : s.reviewed + ' words reviewed'),
        s.again.length ? h('p', { class: 'rl__lab' }, 'Words to try again') : h('p', { class: 'rl__src' }, 'All right this time. Well done.'),
        s.again.length ? pills(s.again) : null,
        s.spell.length ? h('p', { class: 'rl__lab' }, 'Check the spelling') : null, s.spell.length ? pills(s.spell) : null));
      L.foot.append(h('button', { class: 'wl-btn wl-btn--primary wl-btn--block', type: 'button', onclick: close }, 'Done'));
      L.root.querySelector('#rl-title').focus({ preventScroll: true });
    }
    function draw() {
      if (L.i >= L.qs.length) { drawDone(); return; }
      const tok = ++L.tok, q = L.qs[L.i], nx = L.qs[L.i + 1];
      if (q.k === 'mm' && !q.ready && !q.def) { frame(); setBar(L.i); L.scroll.append(h('p', { class: 'rl__src rl__wait', role: 'status' }, 'Getting the meaning…')); }
      if (nx && nx.k === 'mm' && !nx.def) vocDefine(nx.w).catch(() => { /* offline: the question is asked another way */ });   // warm the next meaning
      prep(q).then(r => {
        if (tok !== L.tok || !L.on) return;
        if (!r) { L.qs.splice(L.i, 1); draw(); return; }   // cannot be asked now: skipped, nothing graded
        L.qs[L.i] = r; if (r.k === 'mm') drawMM(); else if (r.k === 'type') drawType(); else drawQ();
      });
    }

    function start() {
      const p = plan(WS.all(), Date.now(), SIZE, undefined, true);
      if (!p.qs.length) return false;   // nothing can be asked: the caller opens the old Review tab
      if (!L.root) {
        L.root = h('div', { class: 'rl', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'rl-title', hidden: true });
        L.root.addEventListener('keydown', ev => { if (ev.key === 'Escape') { ev.stopPropagation(); close(); } });
        document.body.append(L.root);
      }
      Object.assign(L, { on: true, qs: p.qs, i: 0, right: 0, missed: [], res: [], n: 0, finished: false, opener: document.activeElement });
      L.root.hidden = false; draw(); histSoon(); return true;
    }
    function close() {
      if (!L.on) return;
      L.on = false; L.seq++; L.tok++; L.root.hidden = true;
      if ($('#sheet-words') && !$('#sheet-words').hidden) vocRender();   // the due counts changed
      if (L.n && !L.finished) toast('Progress saved.', 1600);
      try { LearnHub.refresh(); } catch (e) { /* hub not ready */ }   // counts on the Learn hub changed
      try { TD.refresh(); } catch (e) { /* Today not ready */ }   // the Today page shows the new numbers
      histSoon(); if (L.opener && L.opener.isConnected) L.opener.focus();
    }

    return { split, question, build, prep, plan, grade, start, close, get on() { return L.on; } };
  })();
