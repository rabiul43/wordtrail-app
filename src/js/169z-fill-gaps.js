  /* ---------- Fill the gaps: hear one sentence, type only the missing words (FGC, FG) ----------
     Task 7. The narrator plays ONE sentence of the open track (its own start and end from the sentence timing). The sentence is written on the screen with 2 to 4
     words missing, each a small box in the line; the learner types only those words and taps Check. Easier than Listen and type (169k), so it is the step before it.
     Which words are blanked (`FGC.pickGaps`): content words first (not "the", "and", "of"...), longer words before shorter, words saved in My Words first (it is
     review practice), never a name in the middle of a sentence, never a number, never two blanks side by side when it can be avoided, never the same word twice,
     never more than 40% of the sentence. If a sentence has too few content words, short function words fill the rest. How many (`FGC.count`): the learner's level
     for this mode decides: no level yet 3, under 30 -> 2, under 60 -> 3, 60 and over -> 4 (the level engine of 169x, skill key "gap", its own level apart from Listen
     and type). The sentences are picked around that level like in Listen and type (`LNC.pickSet`).
     Grading is the SAME rule as Listen and type, word by word through `LNC.check`: capitals, punctuation and apostrophes are ignored, UK and US spellings are both
     accepted (#lt-variants), a word one letter off (5+ letters) is "close", exact wrong letters through `LNC.diff` (`LNC.rows` builds the rows). A box holds ONE word:
     two words in one box is wrong. An empty box is a missed word. Help (Hint: letters per blank; Show first letters) costs nothing and is only noted in the result.
     No lives, no timer, no score to beat. A session is up to 10 sentences from the one being heard (then from the start of the track). The end screen is the same
     "Your answers" screen: score ring (sentences with every blank right), the rows worth a look, Save N words (wrong words -> My Words), Continue.
     My Words: a blanked word that is already saved gets its review updated through WS.update (SRS.review, kind 'rcl': right = Good, one letter off = Hard, wrong or
     missed = Again; with first letters shown a right word counts as Hard), once per word per session. Only the blanks are graded, so only they count.
     Counts as a Listening session in the IELTS hub (IE.log('l') when the 10th sentence is finished), like Listen and type.
     Storage: no key of its own (results live in memory until the next session: FG.last()); the level of this mode is in `wt:lvl` under "gap" (169x, this device only).
     Runs only while the screen is open (a 40 ms check while a clip plays); nothing at start-up. When closed in ANY way the audio goes back to the same track and second
     and plays again if it was playing (same rule as Echo and Listen and type). The clip player here is a copy of the one in 169k (that file is not touched): if one
     is ever changed, change the other.
       FGC.pickGaps(text, n, { saved, rare })  pure: word numbers to blank, ascending       FGC.count(level, words)  pure: how many blanks (1..4)
       FGC.parts(text, gaps)  pure: [{ t, g (gap number or -1), w (word number) }]          FGC.hints(text, gaps, hint, first)  pure: one placeholder per blank
       FGC.check(typed[], text, gaps, V)  pure: { words: [{ w, v: ok|close|no|miss, t, alt? }] (one per blank, the shape LNC.rows takes), marks, ok, close, wrong, miss, total, nVar, v }
       FGC.plan(texts, hidden, k, size, { target, d, saved, rare })  pure: [{ i, gaps }]     FGC.result(chk, plays, hint, first)  pure: the record LVE.outcome takes
       FG.start()   FG.close()   FG.on   FG.results()   FG.last()  { bookId, title, sec, ts, res } of the last session finished or closed with at least one answer, or null
     Registered in the Learn hub (169b) as the tile "Fill the gaps" (and so in the player's "Study this chapter" sheet, 169e).
     Remove this file, 94z-fill-gaps.css, 28g-sheet-fill-gaps.html and their build.py lines to go back (the "i-m-blank" icon and LVX.rare can stay). Test: node tools/fill_gaps_check.js */
  const FGC = (() => {
    /*FGC-START*/
    const MAX_GAPS = 4;
    const STOP = new Set(('a an the and or but if of to in on at by for with from as is are was were be been being am do does did have has had i you he she it we they me him her us them my your his its our their ' +
      'this that these those there here not no so than then too very can could will would shall should may might must what which who whom whose when where why how all any some one up out into over about off down ' +
      'just also only again after before while because though although until upon more most much many such own same other another each every both few either neither nor yet still even ever never once ago away back ' +
      'around through under between against during without within along across behind beyond near among').split(' '));
    const maxFor = w => Math.max(1, Math.min(MAX_GAPS, Math.floor(w * 0.4)));
    const fin = x => typeof x === 'number' && isFinite(x);
    /* how many blanks for a learner at `level` (null = no level yet) in a sentence of `w` words */
    function count(level, w) {
      const n = !fin(level) ? 3 : level < 30 ? 2 : level < 60 ? 3 : 4;
      return Math.max(1, Math.min(n, maxFor(fin(w) && w > 0 ? w : 1)));
    }
    /* the word numbers to blank, ascending. opt.saved(folded word) -> true for a word in My Words; opt.rare(folded word) -> 0..1 */
    function pickGaps(text, n, opt) {
      opt = opt || {}; const ws = LNC.words(text), W = ws.length; if (!W) return [];
      const want = Math.max(0, Math.min(fin(n) ? Math.floor(n) : 0, maxFor(W))); if (!want) return [];
      const cand = ws.map((w, i) => {
        const f = LNC.fold(w), len = Array.from(f).length, name = i > 0 && /^\p{Lu}/u.test(w), num = /\p{N}/u.test(w), apos = /['‘’ʼ`]/.test(w);
        const content = !STOP.has(f) && len >= 3 && !num && !apos && !name;
        let s = Math.min(len, 9) * 3 + (content ? 60 : 0);
        try { if (typeof opt.saved === 'function' && opt.saved(f)) s += 40; } catch (e) { /* ignore */ }
        try { const r = typeof opt.rare === 'function' ? +opt.rare(f) : 0; if (fin(r)) s += Math.max(0, Math.min(1, r)) * 20; } catch (e) { /* ignore */ }
        return { i, f, len, content, fair: !num && !name && len >= 2, s };
      });
      const order = cand.slice().sort((a, b) => b.s - a.s || a.i - b.i), out = [], seen = new Set();
      const near = i => out.some(j => Math.abs(j - i) < 2);
      const pass = (ok, spaced) => { for (const c of order) { if (out.length >= want) return; if (!ok(c) || seen.has(c.f) || out.includes(c.i) || (spaced && near(c.i))) continue; out.push(c.i); seen.add(c.f); } };
      pass(c => c.content, true); pass(c => c.content, false); pass(c => c.fair && c.len >= 3, true); pass(c => c.fair, false);
      return out.sort((a, b) => a - b);
    }
    /* the sentence as pieces: [{ t, g (the blank's number, or -1), w (word number, -1 for punctuation and spaces) }] */
    function parts(text, gaps) {
      const m = new Map((Array.isArray(gaps) ? gaps : []).map((wi, k) => [wi, k]));
      return LNC.spans(text).map(sp => ({ t: sp.t, g: sp.w >= 0 && m.has(sp.w) ? m.get(sp.w) : -1, w: sp.w }));
    }
    /* what each empty box shows: letters per blank, or the first letter and the rest as dashes; '' when no help is on */
    function hints(text, gaps, hint, first) {
      const ws = LNC.words(text);
      return (Array.isArray(gaps) ? gaps : []).map(wi => { if (!hint && !first) return ''; const f = LNC.fold(ws[wi] || ''), n = Array.from(f).length; return (first ? Array.from(f)[0] || '' : '_') + '_'.repeat(Math.max(0, n - 1)); });
    }
    /* grade the typed words, one per blank, with the same rule as Listen and type (LNC.check on one word). A box holds ONE word: more than one is wrong. */
    function check(typed, text, gaps, V) {
      const ws = LNC.words(text), words = [], marks = new Array(ws.length);
      (Array.isArray(gaps) ? gaps : []).forEach((wi, k) => {
        const target = ws[wi], t = typed && typed[k] != null ? String(typed[k]).trim() : '';
        if (target == null) return;
        const c = LNC.check(t, target, V), x = c.words[0] || { w: target, v: 'miss', t: '' };
        const v = c.nExtra > 0 ? 'no' : c.v === 'ok' ? 'ok' : c.v === 'near' ? 'close' : x.v === 'miss' ? 'miss' : 'no';
        const r = { w: target, v, t: v === 'miss' ? '' : t }; if (x.alt && v === 'ok') r.alt = x.alt;
        words.push(r); marks[wi] = { w: target, v, t: r.t };
      });
      const cnt = v => words.filter(x => x.v === v).length, ok = cnt('ok'), close = cnt('close'), wrong = cnt('no'), miss = cnt('miss');
      return { words, marks, ok, close, wrong, miss, nExtra: 0, total: words.length, nVar: words.filter(x => x.alt).length, v: words.length && wrong + miss === 0 ? (close === 0 ? 'ok' : 'near') : 'no' };
    }
    /* the record LVE.outcome (169x) takes, for one checked sentence */
    const result = (chk, plays, hint, first) => ({ ok: chk.ok, close: chk.close, wrong: chk.wrong, miss: chk.miss, extra: 0, plays: plays || 1, hint: !!hint, first: !!first, v: chk.v });
    /* one session: [{ i, gaps }] in the order they are heard. opt = { target (level), d (difficulty of sentence i), saved, rare } */
    function plan(texts, hidden, k, size, opt) {
      opt = opt || {}; const lv = fin(opt.target) ? opt.target : null;
      const set = LNC.pickSet(texts, hidden, k, size, lv != null && typeof opt.d === 'function' ? { target: lv, d: opt.d } : null);
      return set.map(i => ({ i, gaps: pickGaps(texts[i], count(lv, LNC.words(texts[i]).length), opt) })).filter(x => x.gaps.length);
    }
    /*FGC-END*/
    return { MAX_GAPS, STOP, count, pickGaps, parts, hints, check, result, plan };
  })();

  const FG = (() => {
    const st = { on: false, p: null, plan: [], i: 0, step: '', plays: 0, hint: false, first: false, snap: null, tok: 0, watch: 0, playing: false, fail: false, res: [], chk: null, graded: new Set(), dif: {}, word: '' };
    let last = null, VM = null;
    const q = id => document.getElementById(id);
    const hid = k => { const s = S.model && st.p && S.model.sents[st.p.ids[k]]; return !s || !!s.h; };
    const cur = () => st.plan[Math.min(st.i, st.plan.length - 1)];
    const kNow = () => cur().i;
    const textNow = () => { const s = S.model.sents[st.p.ids[kNow()]]; return s ? s.t : ''; };
    const inputs = () => Array.from(q('fg-sent').querySelectorAll('input.fg-gap'));
    function quiet(f) { S.quietJump = true; try { f(); } finally { S.quietJump = false; } }   // these moves are not "jumps" for the jump history (060)
    function stopAudio() { try { if (!audio.paused) audio.pause(); } catch (e) { /* nothing to stop */ } try { audio.playbackRate = P.speed; } catch (e) { /* ignore */ } }
    function halt() { clearInterval(st.watch); st.watch = 0; st.tok++; }
    function chapterOf(id) {
      try { const c = S.model.chapters && S.model.chapters.find(x => id >= x.start && id < x.end); return [S.book.title, c && c.title].filter(Boolean).join(' · '); } catch (e) { return S.book ? S.book.title : ''; }
    }
    const perfect = () => st.res.filter(r => r && r.v === 'ok').length;
    const vmap = () => { if (!VM) { let l = []; try { l = (JSON.parse(q('lt-variants').textContent) || {}).pairs || []; } catch (e) { l = []; } VM = LNC.variants(l); } return VM; };
    const svMap = r => { const m = {}; ((r && r.saved) || []).forEach(x => { m[x.w] = 1; }); return m; };
    const isSaved = f => { try { if (typeof WS === 'undefined') return false; const e = WS.get(f); return !!e && !e.ph; } catch (e) { return false; } };

    /* ----- exact letters (the same lines as Listen and type) ----- */
    const letters = a => h('b', { class: 'lt-r-c' }, ...a.map(x => (x.bad ? h('mark', { class: 'lt-l' }, x.c) : x.c)));
    function detail(r) {
      if (r.v === 'ok') return r.note ? h('p', { class: 'lt-r-d' }, h('span', { class: 'lt-r-note' }, r.note)) : null;
      if (r.v === 'miss') return h('p', { class: 'lt-r-d' }, h('span', { class: 'lt-r-lab' }, 'Missing word:'), ' ', h('b', { class: 'lt-r-c' }, r.w));
      const p = h('p', { class: 'lt-r-d' }, h('span', { class: 'lt-r-lab' }, 'Correct:'), ' ', letters(r.diff ? r.diff.tgt : Array.from(r.w).map(c => ({ c, bad: false }))));
      if (r.diff && r.diff.why) p.append(h('span', { class: 'lt-r-sep', 'aria-hidden': 'true' }, ' · '), h('span', { class: 'lt-r-why' }, r.diff.why));
      return p;
    }
    function paintFixes(c) {
      const ul = q('fg-fb-d'); ul.textContent = '';
      LNC.rows([{ chk: c, saved: {} }], 4).forEach(r => {
        const li = h('li', { class: 'lt-d ' + (r.v === 'ok' ? 'is-ok' : 'is-bad') });
        if (r.v === 'ok') li.append(h('b', { class: 'lt-r-w' }, r.typed || r.w)); else if (r.typed) li.append(h('s', { class: 'lt-r-w' }, r.typed));
        const d = detail(r); if (d) li.append(d);
        ul.append(li);
      });
      ul.hidden = !ul.children.length;
    }

    /* ----- My Words: a saved word that was blanked gets its review updated (right = Good, one letter off = Hard, wrong or missed = Again) ----- */
    function applySaved(c) {
      const out = [];
      if (typeof WS === 'undefined' || typeof SRS === 'undefined') return out;
      const now = Date.now(), tz = -new Date().getTimezoneOffset();
      c.words.forEach(x => {
        const k = String(x.w).toLowerCase(); if (st.graded.has(k)) return;
        let e = null; try { e = WS.get(k); } catch (err) { e = null; }
        if (!e || e.ph) return;
        st.graded.add(k);
        let g = x.v === 'ok' ? SRS.GOOD : x.v === 'close' ? SRS.HARD : SRS.AGAIN;
        if (g === SRS.GOOD && st.first) g = SRS.HARD;
        try { WS.update(k, t => SRS.review(t, g, now, { kind: 'rcl', tz })); try { LL.review(g !== SRS.AGAIN); } catch (err) { /* learning log (148b) not loaded */ } out.push({ w: k, v: x.v, g }); } catch (err) { /* the word stays as it was */ }
      });
      return out;
    }
    function savable() {
      const seen = new Set(), out = [];
      if (typeof WS === 'undefined') return out;
      st.res.filter(Boolean).forEach(r => r.chk.words.forEach(x => {
        if (x.v === 'ok') return;
        const w = String(x.w).toLowerCase(); if (seen.has(w) || Array.from(w).length < 4) return; seen.add(w);
        let e = null; try { e = WS.get(w); } catch (err) { e = null; } if (e) return;
        out.push({ w, s: r.text });
      }));
      return out.slice(0, 10);
    }
    function saveWords() {
      const l = savable(); if (!l.length) return;
      try { if (WS.all().length + l.length > 2000) { toast('My Words is full. Remove a word first.', 4000); return; } } catch (e) { /* count unknown: try anyway */ }
      l.forEach(x => { try { WS.saveWithContext(x.w, { s: x.s, bid: S.book ? String(S.book.id) : '', bt: S.book ? S.book.title || '' : '' }, { ex: x.s }); } catch (e) { /* skip this word */ } });
      toast('Saved ' + l.length + (l.length === 1 ? ' word' : ' words') + ' to My Words.', 3500);
      q('fg-save').hidden = true;
    }

    /* ----- the sentence with its boxes ----- */
    function buildSentence() {
      const box = q('fg-sent'), c = cur(), n = c.gaps.length; box.textContent = '';
      FGC.parts(textNow(), c.gaps).forEach(pc => {
        if (pc.g < 0) { box.append(pc.t); return; }
        const inp = h('input', { class: 'fg-gap', type: 'text', maxlength: '40', lang: 'en', dir: 'ltr', autocomplete: 'off', autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false',
          enterkeyhint: pc.g + 1 < n ? 'next' : 'done', 'aria-label': 'Blank ' + (pc.g + 1) + ' of ' + n, 'data-g': String(pc.g) });
        inp.addEventListener('input', () => { if (st.on && st.step === 'type') paintCheck(); });
        inp.addEventListener('keydown', e => {
          if (e.key !== 'Enter' || e.shiftKey || e.isComposing) return; e.preventDefault();
          const all = inputs(), at = all.indexOf(inp);
          if (at >= 0 && at + 1 < all.length) { try { all[at + 1].focus({ preventScroll: true }); } catch (x) { /* ignore */ } } else check();
        });
        box.append(inp);
      });
    }
    function paintHints() {
      const ph = FGC.hints(textNow(), cur().gaps, st.hint, st.first);
      inputs().forEach((inp, k) => { inp.placeholder = ph[k] || ''; });
    }
    const paintCheck = () => { q('fg-check').disabled = !inputs().some(i => LNC.words(i.value).length); };
    function paintPlay() {
      q('fg-play').classList.toggle('is-playing', st.playing);
      q('fg-plays').textContent = st.plays ? 'Played ' + st.plays + (st.plays === 1 ? ' time' : ' times') + ' · tap the turtle for slow' : '';
      q('fg-status').textContent = st.fail ? 'The audio did not start. Tap the speaker to try again.' : '';
    }
    function paint() {
      const end = st.step === 'end', done = st.step === 'checked', n = st.plan.length;
      q('fg-title').textContent = end ? 'Your answers' : 'Fill the gaps';
      q('fg-main').hidden = end; q('fg-end').hidden = !end;
      q('fg-pos').textContent = end ? '' : 'Sentence ' + (st.i + 1) + ' of ' + n; q('fg-sep').hidden = end;
      q('fg-ch').textContent = chapterOf(st.p.ids[kNow()]);
      q('fg-lv').textContent = end ? '' : st.word; q('fg-lv-w').hidden = end || !st.word;   // level: one word, never a number
      const pr = q('fg-prog'), pct = Math.round(100 * (end ? n : st.i + (done ? 1 : 0)) / n);
      pr.setAttribute('aria-valuenow', String(pct)); pr.style.setProperty('--wl-p', pct + '%');
      const fl = perfect(); q('fg-flame-n').textContent = String(fl); q('fg-flame').setAttribute('aria-label', fl + ' perfect so far');
      if (!end) {
        q('fg-hint').setAttribute('aria-pressed', String(st.hint)); q('fg-first').setAttribute('aria-pressed', String(st.first)); q('fg-hint').disabled = q('fg-first').disabled = done;
        inputs().forEach(i => { i.readOnly = done; });
        q('fg-check').hidden = done; q('fg-next').hidden = !done; paintCheck(); q('fg-next').textContent = 'Continue';
      } else { q('fg-check').hidden = true; q('fg-next').hidden = false; q('fg-next').textContent = 'Continue'; }
      q('fg-foot').classList.toggle('is-end', end); if (!end) q('fg-save').hidden = true;
      paintPlay();
    }
    function marked(text, gaps, marks) {   // the whole sentence; the blanked words are marked right / close / wrong
      const f = document.createDocumentFragment(), set = new Set(gaps);
      LNC.spans(text).forEach(sp => {
        if (sp.w < 0 || !set.has(sp.w)) { f.append(sp.t); return; }
        const v = marks[sp.w] ? marks[sp.w].v : 'ok';
        f.append(h('span', { class: 'lt-w' + (v === 'ok' ? '' : v === 'close' ? ' is-close' : ' is-bad') }, sp.t));
      });
      return f;
    }
    function paintFeedback(c, text) {
      const f = q('fg-fb'), foot = q('fg-foot'), fv = c.v === 'near' ? 'near' : c.v;
      foot.classList.remove('is-ok', 'is-near', 'is-no'); foot.classList.add('is-' + fv);
      q('fg-fb-t').textContent = c.v === 'ok' ? 'Perfect. Every blank is right.' : c.v === 'near' ? 'Almost. Check the spelling of the marked words.' : 'Not quite. Here is the sentence.';
      const a = q('fg-fb-a'); a.textContent = ''; a.append(marked(text, cur().gaps, c.marks));
      paintFixes(c); f.hidden = false;
    }
    function markBoxes(c) {
      inputs().forEach((inp, k) => { const v = c.words[k] ? c.words[k].v : 'ok'; inp.classList.remove('is-ok', 'is-close', 'is-bad'); inp.classList.add(v === 'ok' ? 'is-ok' : v === 'close' ? 'is-close' : 'is-bad'); });
    }
    function hideFeedback() { q('fg-fb').hidden = true; q('fg-foot').classList.remove('is-ok', 'is-near', 'is-no'); }
    function rowEl(r, n) {
      const good = r.v === 'ok';
      const li = h('li', { class: 'wl-card lt-r ' + (good ? 'is-ok' : 'is-bad') },
        h('p', { class: 'lt-r-h' }, h('span', { class: 'lt-r-n' }, String(n)),
          !good && r.typed ? h('s', { class: 'lt-r-w' }, r.typed) : h('span', { class: 'lt-r-w' }, good ? (r.typed || r.w) : r.w),
          h('span', { class: 'lt-r-i', role: 'img', 'aria-label': good ? 'Right' : 'To fix' }, good ? '✓' : '✗')));
      const d = detail(r); if (d) li.append(d);
      if (r.saved) li.append(h('p', { class: 'lt-r-sv' }, good ? 'In My Words · spelled right' : 'In My Words · it comes back in your review soon'));
      return li;
    }
    function paintEnd() {
      const r = st.res.filter(Boolean), n = r.length, ok = r.filter(x => x.v === 'ok').length, pct = n ? Math.round(100 * ok / n) : 0;
      const items = r.map(x => ({ chk: x.chk, saved: svMap(x) })), slips = LNC.rows(items).filter(x => x.spell).length;
      q('fg-ring').style.setProperty('--p', pct + '%'); q('fg-ring-t').textContent = ok + '/' + n;
      q('fg-sc-h').textContent = pct >= 90 ? 'Great listening!' : pct >= 60 ? 'Nice work' : 'Good effort';
      q('fg-sc-s').textContent = slips ? slips + (slips === 1 ? ' spelling mistake cost you a mark' : ' spelling mistakes cost you marks') : (ok === n ? 'Every word was right.' : 'Some words were missed or different.');
      const ol = q('fg-rows'), rs = LNC.rows(items, 12); ol.textContent = ''; ol.hidden = !rs.length;
      rs.forEach((x, i) => ol.append(rowEl(x, i + 1)));
      if (rs.more) ol.append(h('li', { class: 'lt-r-more' }, '+' + rs.more + ' more'));
      const sv = savable().length, b = q('fg-save'); b.hidden = !sv; b.textContent = '★ Save ' + sv + (sv === 1 ? ' word' : ' words');
    }

    /* ----- one clip: the narrator says the sentence once, from its start to the start of the next one (a copy of the player in 169k) ----- */
    function endClip() { halt(); stopAudio(); st.playing = false; paintPlay(); }
    function failed() { halt(); stopAudio(); st.playing = false; st.fail = true; paintPlay(); }
    function play(slow) {
      if (!st.on || st.step === 'end') return;
      halt(); const tok = st.tok, [a, b] = shClip(st.p, kNow());
      st.plays++; st.fail = false; st.playing = true; paintPlay();
      try {
        audio.playbackRate = slow ? LNC.SLOW : 1; quiet(() => seekAudio(a));
        const r = audio.play();
        if (r && r.catch) r.catch(e => { if (tok !== st.tok) return; try { onPlayFail(e); } catch (x) { /* ignore */ } failed(); });
      } catch (e) { failed(); return; }
      const t0 = Date.now(); let seen = false;
      st.watch = setInterval(() => {
        if (tok !== st.tok) return;
        if (!audio.paused) seen = true;
        if (seen && nowT() >= b - 0.03) endClip();
        else if (seen && audio.paused && Date.now() - t0 > 400) endClip();   // paused by hand (headphone button)
        else if (!seen && Date.now() - t0 > 5000) failed();
      }, 40);
    }

    /* ----- the steps: type, check, continue ----- */
    function newSentence() {
      st.step = 'type'; st.plays = 0; st.hint = st.first = false; st.fail = false; st.chk = null;
      hideFeedback(); buildSentence(); paintHints(); paint(); play(false);
    }
    function check() {
      if (!st.on || st.step !== 'type') return;
      const typed = inputs().map(i => i.value); if (!typed.some(v => LNC.words(v).length)) return;
      endClip();
      const T = textNow(), c = FGC.check(typed, T, cur().gaps, vmap()), k = kNow();
      st.chk = c; st.step = 'checked';
      st.res[st.i] = Object.assign({ k, id: st.p.ids[k], text: T, typed: typed.join(' | '), n: c.total, chk: c, saved: applySaved(c) }, FGC.result(c, st.plays, st.hint, st.first));
      try { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); } catch (e) { /* ignore */ }   // the keyboard goes away, so the answer panel has room
      markBoxes(c); paint(); paintFeedback(c, T);
      try { q('fg-next').focus({ preventScroll: true }); } catch (e) { /* ignore */ }
    }
    function next() {
      if (!st.on) return;
      if (st.step === 'end') { close(); return; }
      if (st.step !== 'checked') return;
      endClip();
      if (st.i + 1 >= st.plan.length) { st.step = 'end'; try { IE.log('l'); } catch (e) { /* IELTS practice log (169o) not loaded */ } hideFeedback(); paint(); paintEnd(); try { q('fg-title').focus({ preventScroll: true }); } catch (e) { /* ignore */ } return; }
      st.i++; newSentence();
      try { const f = inputs()[0]; if (f) f.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
    }

    /* ----- open and close; the audio goes back to where it was ----- */
    function vv() {   // a phone keyboard opens: the screen follows the part that is still visible, so Check stays in reach
      const v = window.visualViewport, sh = q('sheet-fg'); if (!v || !st.on) return;
      sh.style.height = Math.round(v.height) + 'px'; sh.style.top = Math.round(v.offsetTop) + 'px';
    }
    function start() {
      if (st.on) return true;
      const p = typeof shPlan === 'function' ? shPlan() : null;
      if (!S.book || !S.model || !p) { toast('Open a book that has its text lined up with the audio first.', 4000); return false; }
      st.p = p;
      const texts = p.ids.map(id => { const s = S.model.sents[id]; return s ? s.t : ''; });
      /* level (169x, skill "gap"): aim the sentences at the learner's level and let it decide how many blanks; no level yet (under 5 answers) = 3 blanks, the first sentences */
      const dur = i => (i + 1 < p.starts.length && p.starts[i + 1] > p.starts[i] ? p.starts[i + 1] - p.starts[i] : null), dif = i => LVX.d(texts[i], dur(i));
      let target = null; try { target = LVX.target('gap'); } catch (e) { target = null; }
      const plan = FGC.plan(texts, hid, Core.locate(p.starts, nowT() + P.nudge), LNC.SIZE, { target, d: dif, saved: isSaved, rare: (() => { try { return LVX.rare; } catch (e) { return null; } })() });
      if (!plan.length) { toast('This track has no sentences to use. Try another track.', 4000); return false; }
      st.snap = { bookId: String(S.book.id), sec: S.sec, time: nowT(), playing: !audio.paused && !audio.ended };
      st.on = true; st.plan = plan; st.i = 0; st.res = []; st.playing = false; st.graded = new Set(); st.dif = {}; st.word = '';
      try { plan.forEach(x => { st.dif[x.i] = dif(x.i); }); if (target != null) st.word = LVX.word('gap', plan.map(x => st.dif[x.i])); } catch (e) { st.dif = {}; st.word = ''; }   // level: never stops a session
      try { sndFocusOn(); } catch (e) { /* sound is a bonus */ }
      stopAudio();
      openSheet('sheet-fg');
      if (window.visualViewport) { window.visualViewport.addEventListener('resize', vv); window.visualViewport.addEventListener('scroll', vv); vv(); }
      newSentence();
      try { const f = inputs()[0]; if (f) f.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
      return true;
    }
    function finish() {   // however the screen was closed
      if (!st.on) return; st.on = false;
      try { sndFocusOff(); } catch (e) { /* sound is a bonus */ }
      halt(); stopAudio();
      if (window.visualViewport) { window.visualViewport.removeEventListener('resize', vv); window.visualViewport.removeEventListener('scroll', vv); }
      const sh = q('sheet-fg'); sh.style.height = ''; sh.style.top = '';
      try { LVX.record('gap', st.res.filter(r => r && st.dif[r.k] != null).map(r => ({ d: st.dif[r.k], o: LVE.outcome(r) }))); } catch (e) { /* the level is only a helper */ }
      if (st.res.some(Boolean)) last = { bookId: String(S.book ? S.book.id : ''), title: S.book ? S.book.title || '' : '', sec: S.sec, ts: Date.now(), res: st.res.filter(Boolean).map(r => Object.assign({}, r)) };
      const snap = st.snap; st.snap = null;
      if (!snap || !S.book || String(S.book.id) !== snap.bookId) return;
      try {
        if (S.sec !== snap.sec) { goTrack(snap.sec, snap.time, snap.playing, false); return; }
        quiet(() => seekAudio(snap.time));
        if (snap.playing) { const r = audio.play(); if (r && r.catch) r.catch(() => {}); }
      } catch (e) { /* the play button still works */ }
    }
    function close() { if (st.on) closeSheets(); finish(); }

    /* ----- wiring (taps and typing only) ----- */
    q('fg-x').addEventListener('click', close);
    q('fg-play').addEventListener('click', () => play(false));
    q('fg-slow').addEventListener('click', () => play(true));
    q('fg-check').addEventListener('click', check);
    q('fg-next').addEventListener('click', next);
    q('fg-save').addEventListener('click', saveWords);
    q('fg-hint').addEventListener('click', () => { if (st.on && st.step === 'type') { st.hint = !st.hint; paintHints(); paint(); } });
    q('fg-first').addEventListener('click', () => { if (st.on && st.step === 'type') { st.first = !st.first; paintHints(); paint(); } });
    new MutationObserver(() => { if (q('sheet-fg').hidden) finish(); }).observe(q('sheet-fg'), { attributes: true, attributeFilter: ['hidden'] });
    guideDoc('reading', 'Fill the gaps', 'Study this chapter > Fill the gaps: the narrator plays one sentence and a few words are missing from it. Type only the missing words, then tap Check. Use the turtle to hear it slowly, Hint for the number of letters, and Show first letters if you are stuck. A session is 10 sentences. When you close it, the audio goes back to where you were.');
    return { start, close, results: () => st.res.filter(Boolean).map(r => Object.assign({}, r)), last: () => last, get on() { return st.on; } };
  })();

  LearnHub.register({
    id: 'fillgaps', order: 51, icon: '#i-m-blank', title: 'Fill the gaps',
    subtitle: () => {
      let l = null, calm = false; try { l = FG.last(); calm = P.calm === true; } catch (e) { l = null; }
      const r = l && Array.isArray(l.res) ? l.res : [];
      return !calm && r.length ? 'Last set: ' + r.filter(x => x && x.v === 'ok').length + ' of ' + r.length + ' right' : 'Fill in the missing words';
    },
    playerSubtitle: ctx => (ctx && ctx.time ? 'Starts at ' + fmt(ctx.time) : 'Fill in the missing words'),
    open: () => { FG.start(); }
  });
