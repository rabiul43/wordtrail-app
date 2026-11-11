  /* ---------- Listen and type: hear one sentence, type it (LNC, LN) ----------
     Task 45. The narrator plays ONE sentence of the open track (its own start and end from the sentence timing), the learner types it in an ordinary
     text box (the phone's own keyboard) and taps Check. The answer is compared WORD BY WORD, not letter by letter: capitals, punctuation and
     apostrophes are ignored, one missing or extra word does not spoil the rest, a word with one letter wrong (5+ letters) is "close" (a spelling slip).
     A session is up to 10 sentences, taken from the sentence being heard onwards (then from the start of the track), skipping hidden / not narrated
     sentences, headings, and sentences under 3 or over 20 words. Buttons: speaker (play), turtle (play slowly, 0.7x), Hint (how many words, then how
     many letters in each), Show first letters (the first letter of each word). Help costs nothing: it is only noted in the result.
     No lives, no timer, no score to beat. A wrong answer shows the right sentence with the words to fix marked; Continue goes on.
     It reuses what the app has: shPlan / shClip (140: the sentence timing), Core.locate, seekAudio, the one <audio> element, openSheet. Echo (169h) is not
     touched. When closed in ANY way the audio goes back to the same track and second and plays again if it was playing (same rule as Echo).
     Runs only while the screen is open: a 40 ms check while a clip plays. Nothing at start-up. Playback never depends on this file.
     Storage: none (results live in memory until the next session: LN.last()). Setting: none. Words are in src/i18n/*.json.
     Registered in the Learn hub (169b) as the tile "Listen and type"; the same tile is in the player's "Study this chapter" sheet (169e).
       LNC.check(typed, target)   pure: { words: [{ w, v: ok|close|no|miss, t }], tw: [{ w, v: ok|close|no|extra }], extra: [typed words], ok, close, wrong, miss, nExtra, total, v: ok|near|no }
       LNC.pickSet(texts, hidden, k, size)   pure: up to `size` indexes   LNC.pattern(target, hint, first)   LNC.spans(text)   LNC.words(text)   LNC.fold(word)
       LN.start()   opens a session at the current sentence; false (with a message) when no book text is lined up with the audio
       LN.close()   LN.on   LN.results()   [{ k, id, text, typed, v, ok, close, wrong, miss, extra, plays, hint, first }] of the session on screen
       LN.last()    { bookId, title, sec, ts, res } of the last session that was finished or closed with at least one answer, or null
     Remove this file, 94s-listen-type.css, 28d-sheet-listen-type.html and their build.py lines to go back. */
  const LNC = (() => {
    /*LNC-START*/
    const SIZE = 10, SLOW = 0.7, MIN_W = 3, MAX_W = 20;
    const WORD = /[\p{L}\p{N}]+(?:['‘’ʼ`][\p{L}\p{N}]+)*/gu;
    const str = x => (x == null ? '' : String(x)).normalize('NFC');
    const fold = w => str(w).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/['‘’ʼ`]/g, '');
    const words = s => str(s).match(WORD) || [];
    /* the text cut into word pieces and the pieces between them: [{ t, w }], w = index of the word, -1 for punctuation and spaces */
    function spans(s) {
      s = str(s); const out = []; let at = 0, n = 0, m; WORD.lastIndex = 0;
      while ((m = WORD.exec(s))) { if (m.index > at) out.push({ t: s.slice(at, m.index), w: -1 }); out.push({ t: m[0], w: n++ }); at = m.index + m[0].length; }
      if (at < s.length) out.push({ t: s.slice(at), w: -1 });
      return out;
    }
    function dist(a, b) {   // letters changed, added or removed; two letters swapped count 1
      const n = a.length, m = b.length; if (!n) return m; if (!m) return n;
      const d = []; for (let i = 0; i <= n; i++) { d[i] = [i]; } for (let j = 1; j <= m; j++) d[0][j] = j;
      for (let i = 1; i <= n; i++) for (let j = 1; j <= m; j++) {
        d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
      return d[n][m];
    }
    const rel = (t, u) => (t === u ? 'ok' : (t.length >= 5 && dist(t, u) <= 1 ? 'close' : 'no'));
    /* compare what was typed with the sentence, word by word (the cheapest way to line the two lists up) */
    function check(typed, target) {
      const T = words(target), U = words(typed), n = T.length, m = U.length, tf = T.map(fold), uf = U.map(fold);
      const C = [], B = [];
      for (let i = 0; i <= n; i++) { C[i] = []; B[i] = []; }
      C[0][0] = 0;
      for (let i = 1; i <= n; i++) { C[i][0] = i; B[i][0] = 't'; }
      for (let j = 1; j <= m; j++) { C[0][j] = j; B[0][j] = 'u'; }
      for (let i = 1; i <= n; i++) for (let j = 1; j <= m; j++) {
        const r = rel(tf[i - 1], uf[j - 1]);
        let best = C[i - 1][j - 1] + (r === 'ok' ? 0 : r === 'close' ? 0.4 : 1), b = 'd';
        if (C[i - 1][j] + 1 < best - 1e-9) { best = C[i - 1][j] + 1; b = 't'; }
        if (C[i][j - 1] + 1 < best - 1e-9) { best = C[i][j - 1] + 1; b = 'u'; }
        C[i][j] = best; B[i][j] = b;
      }
      const ws = new Array(n), tw = new Array(m), extra = [];
      let i = n, j = m;
      while (i > 0 || j > 0) {
        const b = B[i][j];
        if (b === 'd') { const r = rel(tf[i - 1], uf[j - 1]); ws[i - 1] = { w: T[i - 1], v: r, t: U[j - 1] }; tw[j - 1] = { w: U[j - 1], v: r }; i--; j--; }
        else if (b === 't') { ws[i - 1] = { w: T[i - 1], v: 'miss', t: '' }; i--; }
        else { tw[j - 1] = { w: U[j - 1], v: 'extra' }; extra.unshift(U[j - 1]); j--; }
      }
      const cnt = v => ws.filter(x => x.v === v).length;
      const ok = cnt('ok'), close = cnt('close'), wrong = cnt('no'), miss = cnt('miss'), nExtra = extra.length;
      const errors = wrong + miss + nExtra;
      return { words: ws, tw, extra, ok, close, wrong, miss, nExtra, total: n, v: n > 0 && errors === 0 ? (close === 0 ? 'ok' : 'near') : 'no' };
    }
    /* up to `size` sentence numbers for one session: from k to the end of the track, then from its start; texts[i] is the sentence, hidden(i) true when it is not narrated */
    function pickSet(texts, hidden, k, size) {
      const n = Array.isArray(texts) ? texts.length : 0, want = size > 0 ? size : SIZE, out = [], seen = new Set();
      const take = i => {
        if (out.length >= want || hidden(i)) return;
        const t = str(texts[i]); if (!/\p{Ll}/u.test(t)) return;   // a heading in capitals, or no letters
        const c = words(t).length, key = t.trim().toLowerCase();
        if (c < MIN_W || c > MAX_W || seen.has(key)) return;
        seen.add(key); out.push(i);
      };
      const s = Math.max(0, Math.min(k | 0, n - 1));
      for (let i = s; i < n; i++) take(i);
      for (let i = 0; i < s; i++) take(i);
      return out;
    }
    /* the hint line, one piece per word: "___" (letters), "s__" (letters and first letter) or "s…" (first letter only); [] when no hint is on */
    function pattern(target, hint, first) {
      if (!hint && !first) return [];
      return words(target).map(w => { const f = fold(w), head = first ? f.charAt(0) : '_'; return hint ? head + '_'.repeat(Math.max(0, f.length - 1)) : head + '…'; });
    }
    /*LNC-END*/
    return { SIZE, SLOW, MIN_W, MAX_W, fold, words, spans, check, pickSet, pattern };
  })();

  const LN = (() => {
    const st = { on: false, p: null, set: [], i: 0, step: '', plays: 0, hint: false, first: false, snap: null, tok: 0, watch: 0, playing: false, fail: false, res: [], chk: null };
    let last = null;
    const q = id => document.getElementById(id);
    const hid = k => { const s = S.model && st.p && S.model.sents[st.p.ids[k]]; return !s || !!s.h; };
    const kNow = () => st.set[st.i];
    const textNow = () => { const s = S.model.sents[st.p.ids[kNow()]]; return s ? s.t : ''; };
    function quiet(f) { S.quietJump = true; try { f(); } finally { S.quietJump = false; } }   // these moves are not "jumps" for the jump history (060)
    function stopAudio() { try { if (!audio.paused) audio.pause(); } catch (e) { /* nothing to stop */ } try { audio.playbackRate = P.speed; } catch (e) { /* ignore */ } }
    function halt() { clearInterval(st.watch); st.watch = 0; st.tok++; }
    function chapterOf(id) {
      try { const c = S.model.chapters && S.model.chapters.find(x => id >= x.start && id < x.end); return [S.book.title, c && c.title].filter(Boolean).join(' · '); } catch (e) { return S.book ? S.book.title : ''; }
    }
    const perfect = () => st.res.filter(r => r && r.v === 'ok').length;

    /* ----- the sentence, marked ----- */
    function marked(text, ws, typedLine) {
      const f = document.createDocumentFragment();
      LNC.spans(text).forEach(sp => {
        if (sp.w < 0) { f.append(sp.t); return; }
        const v = ws[sp.w] ? ws[sp.w].v : 'ok';
        f.append(h('span', { class: 'lt-w' + (v === 'close' ? ' is-close' : (v === 'ok' ? '' : ' is-bad' + (typedLine ? ' is-strike' : ''))) }, sp.t));
      });
      return f;
    }
    const fixList = c => { const l = c.words.filter(x => x.v !== 'ok').map(x => x.w); return l.length ? 'Words to fix: ' + l.slice(0, 6).join(', ') + (l.length > 6 ? '…' : '') : ''; };

    /* ----- the screen ----- */
    function paintPlay() {
      q('lt-play').classList.toggle('is-playing', st.playing);
      q('lt-plays').textContent = st.plays ? 'Played ' + st.plays + (st.plays === 1 ? ' time' : ' times') + ' · tap 🐢 for slow' : '';
      q('lt-status').textContent = st.fail ? 'The audio did not start. Tap the speaker to try again.' : '';
    }
    function paint() {
      const end = st.step === 'end', done = st.step === 'checked', n = st.set.length;
      q('lt-title').textContent = end ? 'Well done' : 'Type what you hear';
      q('lt-main').hidden = end; q('lt-end').hidden = !end;
      q('lt-pos').textContent = end ? '' : 'Sentence ' + (st.i + 1) + ' of ' + n; q('lt-sep').hidden = end;
      q('lt-ch').textContent = chapterOf(st.p.ids[st.set[Math.min(st.i, n - 1)]]);
      const pr = q('lt-prog'), pct = Math.round(100 * (end ? n : st.i + (done ? 1 : 0)) / n);
      pr.setAttribute('aria-valuenow', String(pct)); pr.style.setProperty('--wl-p', pct + '%');
      const fl = perfect(); q('lt-flame-n').textContent = String(fl); q('lt-flame').setAttribute('aria-label', fl + ' perfect so far');
      if (!end) {
        const T = textNow(), nw = LNC.words(T).length, pat = LNC.pattern(T, st.hint, st.first), pe = q('lt-pat');
        q('lt-hint-l').textContent = 'Hint: ' + nw + (nw === 1 ? ' word' : ' words');
        q('lt-hint').setAttribute('aria-pressed', String(st.hint)); q('lt-first').setAttribute('aria-pressed', String(st.first));
        q('lt-hint').disabled = q('lt-first').disabled = done;
        pe.hidden = !pat.length; pe.textContent = pat.join('   ');
        pe.setAttribute('aria-label', pat.length ? (st.first ? 'First letters: ' : 'Letters per word: ') + LNC.words(T).map((w, x) => (st.first ? LNC.fold(w).charAt(0) : String(LNC.fold(w).length))).join(', ') : '');
        q('lt-in').readOnly = done;
        q('lt-check').hidden = done; q('lt-next').hidden = !done;
        q('lt-check').disabled = !LNC.words(q('lt-in').value).length;
        q('lt-next').textContent = 'Continue';
      } else { q('lt-check').hidden = true; q('lt-next').hidden = false; q('lt-next').textContent = 'Back to listening'; }
      paintPlay();
    }
    function paintFeedback(c, text) {
      const f = q('lt-fb'), foot = q('lt-foot');
      foot.classList.remove('is-ok', 'is-near', 'is-no'); foot.classList.add('is-' + c.v);
      q('lt-fb-t').textContent = c.v === 'ok' ? 'Perfect. Every word is right.' : c.v === 'near' ? 'Almost. Check the spelling of the marked words.' : 'Not quite. Here is the sentence.';
      const a = q('lt-fb-a'); a.textContent = ''; a.append(marked(text, c.words, false));
      const fx = fixList(c), s = q('lt-fb-s'); s.textContent = fx; s.hidden = !fx;
      const y = q('lt-fb-y'), yl = q('lt-fb-yl'); y.textContent = ''; y.hidden = yl.hidden = c.v === 'ok';
      if (c.v !== 'ok') y.append(marked(q('lt-in').value, c.tw, true));
      f.hidden = false;
    }
    function hideFeedback() { q('lt-fb').hidden = true; q('lt-foot').classList.remove('is-ok', 'is-near', 'is-no'); }
    function paintEnd() {
      const r = st.res, ok = r.filter(x => x.v === 'ok').length, near = r.filter(x => x.v === 'near').length, no = r.length - ok - near;
      const sum = q('lt-sum'); sum.textContent = '';
      [['is-ok', ok + ' perfect'], ['is-near', near + ' almost'], ['is-no', no + ' to practise']].forEach(x => sum.append(h('li', { class: 'wl-pill lt-sumi ' + x[0] }, x[1])));
      const bad = r.filter(x => x.v !== 'ok'), list = q('lt-prac'); list.textContent = '';
      q('lt-all').hidden = bad.length > 0; q('lt-prac-h').hidden = list.hidden = !bad.length;
      bad.forEach(x => { const li = h('li', { class: 'wl-card lt-pi' }, h('span', { class: 'lt-pi-t' }, marked(x.text, x.chk.words, false))); const fx = fixList(x.chk); if (fx) li.append(h('span', { class: 'lt-pi-f' }, fx)); list.append(li); });
    }

    /* ----- one clip: the narrator says the sentence once, from its start to the start of the next one ----- */
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
      const t = q('lt-in'); t.value = ''; hideFeedback();
      paint(); play(false);
    }
    function check() {
      if (!st.on || st.step !== 'type') return;
      const typed = q('lt-in').value; if (!LNC.words(typed).length) return;
      endClip();
      const T = textNow(), c = LNC.check(typed, T), k = kNow();
      st.chk = c; st.step = 'checked';
      st.res[st.i] = { k, id: st.p.ids[k], text: T, typed, v: c.v, ok: c.ok, close: c.close, wrong: c.wrong, miss: c.miss, extra: c.nExtra, plays: st.plays, hint: st.hint, first: st.first, chk: c };
      try { q('lt-in').blur(); } catch (e) { /* ignore */ }   // the keyboard goes away, so the answer panel has room
      paint(); paintFeedback(c, T);
      try { q('lt-next').focus({ preventScroll: true }); } catch (e) { /* ignore */ }
    }
    function next() {
      if (!st.on) return;
      if (st.step === 'end') { close(); return; }
      if (st.step !== 'checked') return;
      endClip();
      if (st.i + 1 >= st.set.length) { st.step = 'end'; hideFeedback(); paint(); paintEnd(); try { q('lt-title').focus({ preventScroll: true }); } catch (e) { /* ignore */ } return; }
      st.i++; newSentence();
      try { q('lt-in').focus({ preventScroll: true }); } catch (e) { /* ignore */ }
    }

    /* ----- open and close; the audio goes back to where it was ----- */
    function vv() {   // a phone keyboard opens: the screen follows the part that is still visible, so Check stays in reach
      const v = window.visualViewport, sh = q('sheet-lt'); if (!v || !st.on) return;
      sh.style.height = Math.round(v.height) + 'px'; sh.style.top = Math.round(v.offsetTop) + 'px';
    }
    function start() {
      if (st.on) return true;
      const p = typeof shPlan === 'function' ? shPlan() : null;
      if (!S.book || !S.model || !p) { toast('Open a book that has its text lined up with the audio first.', 4000); return false; }
      st.p = p;
      const texts = p.ids.map(id => { const s = S.model.sents[id]; return s ? s.t : ''; });
      const set = LNC.pickSet(texts, hid, Core.locate(p.starts, nowT() + P.nudge), LNC.SIZE);
      if (!set.length) { toast('This track has no sentences to type. Try another track.', 4000); return false; }
      st.snap = { bookId: String(S.book.id), sec: S.sec, time: nowT(), playing: !audio.paused && !audio.ended };
      st.on = true; st.set = set; st.i = 0; st.res = []; st.playing = false;
      stopAudio();
      openSheet('sheet-lt');
      if (window.visualViewport) { window.visualViewport.addEventListener('resize', vv); window.visualViewport.addEventListener('scroll', vv); vv(); }
      newSentence();
      try { q('lt-in').focus({ preventScroll: true }); } catch (e) { /* ignore */ }
      return true;
    }
    function finish() {   // however the screen was closed
      if (!st.on) return; st.on = false;
      halt(); stopAudio();
      if (window.visualViewport) { window.visualViewport.removeEventListener('resize', vv); window.visualViewport.removeEventListener('scroll', vv); }
      const sh = q('sheet-lt'); sh.style.height = ''; sh.style.top = '';
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
    q('lt-x').addEventListener('click', close);
    q('lt-play').addEventListener('click', () => play(false));
    q('lt-slow').addEventListener('click', () => play(true));
    q('lt-check').addEventListener('click', check);
    q('lt-next').addEventListener('click', next);
    q('lt-hint').addEventListener('click', () => { if (st.on && st.step === 'type') { st.hint = !st.hint; paint(); } });
    q('lt-first').addEventListener('click', () => { if (st.on && st.step === 'type') { st.first = !st.first; paint(); } });
    q('lt-in').addEventListener('input', () => { if (st.on && st.step === 'type') q('lt-check').disabled = !LNC.words(q('lt-in').value).length; });
    q('lt-in').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); check(); } });
    new MutationObserver(() => { if (q('sheet-lt').hidden) finish(); }).observe(q('sheet-lt'), { attributes: true, attributeFilter: ['hidden'] });
    guideDoc('reading', 'Listen and type', 'Study this chapter > Listen and type: the narrator plays one sentence, you type what you hear and tap Check. The answer is compared word by word. Use the turtle to hear it slowly, Hint for the number of words and letters, and Show first letters if you are stuck. A session is 10 sentences. When you close it, the audio goes back to where you were.');
    return { start, close, results: () => st.res.filter(Boolean).map(r => Object.assign({}, r)), last: () => last, get on() { return st.on; } };
  })();

  LearnHub.register({
    id: 'listentype', order: 50, icon: '✍', title: 'Listen and type', subtitle: 'Type what you hear',
    playerSubtitle: ctx => (ctx && ctx.time ? 'Starts at ' + fmt(ctx.time) : 'Type what you hear'),
    open: () => { LN.start(); }
  });
