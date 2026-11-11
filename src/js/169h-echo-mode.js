  /* ---------- Echo mode: hear one sentence, say it out loud (ECC, EM) ----------
     Task 42. The narrator plays ONE sentence, then the screen waits while you say it out loud (you can record yourself: 169i-echo-recording.js), then the next
     sentence starts. Three steps: 1 Listen, 2 Repeat (a countdown ring sized to the sentence), 3 Next. Buttons: Hear again, Slow 0.8x
     (hears this and the next sentences at 0.8x until you tap it again; the saved speed P.speed is never changed), I'm done, next (skips the rest of the countdown).
     It reuses what the app has: the sentence timing (S.plan[track].starts, sentTime and shClip from Shadow reading in 140), Core.locate for the
     current sentence, seekAudio and the one <audio> element. Narrator plays at 1x unless Slow is on.
     Starts at the sentence you are listening to (hidden / not narrated sentences are skipped) and, when closed in ANY way (X, backdrop, Back,
     the "Back to mm:ss" chip of the Study sheet), puts the audio back at the same track and second, and plays again if it was playing.
     Only while the screen is open: a 40 ms check while the clip plays and a 100 ms countdown. Nothing runs at start-up or while it is closed.
     Moves made by Echo are not written to the jump history (S.quietJump, one hook in 060 trJump).
     Storage: none here (recordings are kept by 169i). Setting: none. Registered in the Learn hub (169b) as the tile "Echo"; the same tile is in the player's "Study this chapter" sheet (169e).
       ECC.secs(dur, rate) / pick(hidden, n, k, d) / first(hidden, n, k) / SLOW   pure, tested by tools/echo_check.js
       EM.use(h) hold() resume() again() ring() ctx() step   small hooks for 169i (recording); h = { paint(step), close() }
       EM.narr(done) narrStop() jump(sentenceId)   (Task 44, used by 169j) play the narrator clip once in place; listen to another sentence of this track
       EM.start()   opens Echo at the current sentence; false (with a message) when no book text is lined up with the audio
       EM.close()   EM.on   EM.k (index of the sentence in the track)
     Remove this file, 94p-echo.css, 28c-sheet-echo.html, their build.py lines and the S.quietJump line in 060 to go back. */
  const ECC = (() => {
    /*ECC-START*/
    const SLOW = 0.8, MIN_S = 3, MAX_S = 25;
    /* seconds to say a sentence of dur seconds (at the narrator's rate): the clip plus a quarter, plus one second; between 3 and 25 */
    function secs(dur, rate) {
      const d = (dur > 0 ? dur : 2) / (rate > 0 ? rate : 1);
      return Math.max(MIN_S, Math.min(MAX_S, Math.ceil(d * 1.25 + 1)));
    }
    /* first index from k, stepping d (1 or -1), that is not hidden; -1 when there is none */
    function pick(hidden, n, k, d) {
      for (let i = k; i >= 0 && i < n; i += d) if (!hidden(i)) return i;
      return -1;
    }
    /* where to start: k itself, else the next sentence that is narrated, else the one before */
    function first(hidden, n, k) {
      if (!(n > 0)) return -1;
      k = Math.max(0, Math.min(k | 0, n - 1));
      const i = pick(hidden, n, k, 1);
      return i >= 0 ? i : pick(hidden, n, k, -1);
    }
    /*ECC-END*/
    return { SLOW, MIN_S, MAX_S, secs, pick, first };
  })();

  const EM = (() => {
    const st = { on: false, k: 0, step: '', slow: false, snap: null, tok: 0, watch: 0, tick: 0, after: 0, nw: 0, nf: null, p: null, a: 0, b: 0, total: 0, t0: 0, fail: false, n: '', u: '' };
    const q = id => document.getElementById(id);
    const rate = () => (st.slow ? ECC.SLOW : 1);
    const hid = k => { const s = S.model && st.p && S.model.sents[st.p.ids[k]]; return !s || !!s.h; };
    function quiet(f) { S.quietJump = true; try { f(); } finally { S.quietJump = false; } }   // Echo moves are not "jumps" for the jump history (060)
    function stopAudio() { try { if (!audio.paused) audio.pause(); } catch (e) { /* nothing to stop */ } try { audio.playbackRate = P.speed; } catch (e) { /* ignore */ } }
    const hk = [];   // hooks from other files (169i recording); a hook that throws never breaks Echo
    function hook(n, a) { hk.forEach(h => { try { if (h[n]) h[n](a); } catch (e) { /* ignore */ } }); }
    function halt() { narrStop(); clearInterval(st.watch); clearInterval(st.tick); clearTimeout(st.after); st.watch = st.tick = st.after = 0; st.tok++; }

    /* ----- the screen ----- */
    const TITLE = { listen: 'Listen to the narrator', repeat: 'Your turn. Say it out loud', next: 'Next sentence', end: 'Well done' };
    function chapterOf(id) {
      try { const c = S.model.chapters && S.model.chapters.find(x => id >= x.start && id < x.end); return [S.book.title, c && c.title].filter(Boolean).join(', '); } catch (e) { return S.book ? S.book.title : ''; }
    }
    function setRing(pct, n, u) {
      const r = q('ec-ring'); r.style.setProperty('--wl-p', Math.max(0, Math.min(100, pct)).toFixed(1) + '%');
      if (n !== st.n) { q('ec-n').textContent = n; st.n = n; }
      if (u !== st.u) { q('ec-u').textContent = u; st.u = u; }
    }
    function paint() {
      const p = st.p, n = p.ids.length, id = p.ids[st.k], s = S.model.sents[id], step = st.step, ring = q('ec-ring');
      q('ec-sent').textContent = s ? s.t : '';
      q('ec-pos').textContent = 'Sentence ' + (st.k + 1) + ' of ' + n;
      q('ec-ch').textContent = chapterOf(id);
      const pr = q('ec-prog'), pct = Math.round(100 * (st.k + 1) / n);
      pr.setAttribute('aria-valuenow', String(pct)); pr.style.setProperty('--wl-p', pct + '%');
      q('ec-title').textContent = TITLE[step] || '';
      const order = ['listen', 'repeat', 'next'], at = step === 'end' ? 3 : order.indexOf(step);
      order.forEach((x, i) => {
        const li = document.querySelector('.ec-step[data-step="' + x + '"]');
        li.classList.toggle('is-ok', i < at); li.classList.toggle('is-now', i === at);
        if (i === at) li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current');
      });
      ring.classList.toggle('is-wait', step === 'listen');
      if (step === 'listen') { setRing(100, st.fail ? '!' : '\uD83D\uDD0A', st.fail ? '' : 'Listening\u2026'); ring.setAttribute('aria-label', 'Listening to the narrator'); }
      else if (step === 'next' || step === 'end') { setRing(100, '\u2713', ''); ring.setAttribute('aria-label', step === 'end' ? 'Finished' : 'Next sentence'); }
      q('ec-status').textContent = st.fail ? 'The audio did not start. Tap Hear again.' : (step === 'end' ? 'That was the last sentence in this track.' : '');
      q('ec-slow').setAttribute('aria-pressed', String(st.slow));
      q('ec-again').disabled = step === 'end';
      q('ec-done').textContent = step === 'end' ? 'Back to listening' : "I'm done, next";
      hook('paint', step);
    }
    function count(left) {
      const s = Math.max(1, Math.ceil(left));
      setRing(100 * left / st.total, String(s), s === 1 ? 'second' : 'seconds');
    }

    /* ----- the three steps ----- */
    function listen() {
      halt(); const tok = st.tok;
      st.step = 'listen'; st.fail = false;
      const [a, b] = shClip(st.p, st.k); st.a = a; st.b = b;
      paint();
      audio.playbackRate = rate();
      quiet(() => seekAudio(a));
      const t0 = Date.now(); let seen = false;
      try {
        const r = audio.play();
        if (r && r.catch) r.catch(e => { if (tok !== st.tok) return; try { onPlayFail(e); } catch (x) { /* ignore */ } failed(); });
      } catch (e) { failed(); return; }
      st.watch = setInterval(() => {
        if (tok !== st.tok) return;
        if (!audio.paused) seen = true;
        if (seen && nowT() >= b - 0.03) { stopAudio(); repeat(); }
        else if (seen && audio.paused && Date.now() - t0 > 400) repeat();   // paused by hand (headphone button): the turn is yours
        else if (!seen && Date.now() - t0 > 5000) failed();
      }, 40);
    }
    function failed() { halt(); stopAudio(); st.fail = true; paint(); }
    function repeat() {
      halt(); const tok = st.tok;
      st.step = 'repeat'; st.fail = false;
      st.total = ECC.secs(st.b - st.a, rate()); st.t0 = performance.now();
      paint(); count(st.total);
      q('ec-ring').setAttribute('aria-label', 'Your turn. ' + st.total + ' seconds to say it.');
      st.tick = setInterval(() => {
        if (tok !== st.tok) return;
        const left = st.total - (performance.now() - st.t0) / 1000;
        if (left <= 0) { halt(); st.step = 'next'; paint(); st.after = setTimeout(() => go(1), 600); }
        else count(left);
      }, 100);
    }
    function go(d) {
      halt(); stopAudio();
      const i = ECC.pick(hid, st.p.ids.length, st.k + d, d);
      if (i < 0) { st.step = 'end'; st.fail = false; paint(); return; }
      st.k = i; listen();
    }

    /* ----- Task 44 (169j compare): play the narrator clip once without leaving the step; jump to a sentence ----- */
    function narrStop() {
      if (!st.nw) return;
      clearInterval(st.nw); st.nw = 0; const f = st.nf; st.nf = null;
      try { if (!audio.paused) audio.pause(); audio.playbackRate = P.speed; } catch (e) { /* ignore */ }
      if (f) { try { f(); } catch (e) { /* ignore */ } }
    }
    function narr(done) {   // false when it cannot play; done() is called when the clip ends or is stopped
      if (!st.on || !st.p || st.step === 'end' || !hold()) return false;
      const [a, b] = shClip(st.p, st.k), t0 = Date.now(); let seen = false;
      st.nf = done || null;
      st.nw = setInterval(() => {
        if (!audio.paused) seen = true;
        if ((seen && nowT() >= b - 0.03) || (seen && audio.paused && Date.now() - t0 > 400) || (!seen && Date.now() - t0 > 5000)) narrStop();
      }, 40);
      try {
        audio.playbackRate = rate(); quiet(() => seekAudio(a));
        const r = audio.play(); if (r && r.catch) r.catch(() => narrStop());
      } catch (e) { narrStop(); return false; }
      return true;
    }
    function jump(id) {   // listen to the sentence with this id if it is in the open track and narrated
      if (!st.on || !st.p) return false;
      const i = st.p.ids.indexOf(id); if (i < 0 || hid(i)) return false;
      st.k = i; listen(); return true;
    }

    /* ----- small hooks for 169i (recording): wait, carry on, say where we are ----- */
    function hold() { if (!st.on || st.step === 'end') return false; halt(); stopAudio(); return true; }   // stops the countdown or the clip and keeps the screen as it is
    function resume() { if (st.on && st.step === 'repeat') repeat(); }   // a fresh countdown for the same sentence
    function again() { if (st.on && st.step !== 'end') listen(); }       // hear the sentence once more
    function ctx() { return st.on && st.p ? { book: String(S.book.id), title: S.book.title || '', sec: S.sec, k: st.k, id: st.p.ids[st.k], text: (S.model.sents[st.p.ids[st.k]] || {}).t || '', dur: Math.max(0, st.b - st.a) } : null; }

    /* ----- open and close; the audio goes back to where it was ----- */
    function start() {
      if (st.on) return true;
      const p = typeof shPlan === 'function' ? shPlan() : null;
      if (!S.book || !S.model || !p) { toast('Open a book that has its text lined up with the audio first.', 4000); return false; }
      st.p = p; const n = p.ids.length;
      const k = ECC.first(hid, n, Core.locate(p.starts, nowT() + P.nudge));
      if (k < 0) { toast('Open a book that has its text lined up with the audio first.', 4000); return false; }
      st.snap = { bookId: String(S.book.id), sec: S.sec, time: nowT(), playing: !audio.paused && !audio.ended };
      st.on = true; st.k = k; st.slow = false; st.fail = false; st.n = st.u = '';
      stopAudio();
      openSheet('sheet-echo');
      listen();
      try { q('ec-title').focus({ preventScroll: true }); } catch (e) { /* ignore */ }
      return true;
    }
    function finish() {   // however the screen was closed
      if (!st.on) return; st.on = false;
      halt(); stopAudio(); hook('close');
      const snap = st.snap; st.snap = null;
      if (!snap || !S.book || String(S.book.id) !== snap.bookId) return;
      try {
        if (S.sec !== snap.sec) { goTrack(snap.sec, snap.time, snap.playing, false); return; }
        quiet(() => seekAudio(snap.time));
        if (snap.playing) { const r = audio.play(); if (r && r.catch) r.catch(() => {}); }
      } catch (e) { /* the play button still works */ }
    }
    function close() { if (st.on) closeSheets(); finish(); }

    /* ----- wiring (taps only) ----- */
    q('ec-x').addEventListener('click', close);
    q('ec-done').addEventListener('click', () => { if (!st.on) return; if (st.step === 'end') close(); else go(1); });
    q('ec-again').addEventListener('click', () => { if (st.on && st.step !== 'end') listen(); });
    q('ec-slow').addEventListener('click', () => { if (!st.on) return; st.slow = !st.slow; if (st.step !== 'end') listen(); else paint(); });
    new MutationObserver(() => { if (q('sheet-echo').hidden) finish(); }).observe(q('sheet-echo'), { attributes: true, attributeFilter: ['hidden'] });
    guideDoc('reading', 'Echo mode', 'Study this chapter > Echo: the narrator reads one sentence, then you say it out loud. You can record yourself and play it back; recordings stay on this device and nothing is uploaded. When you close it, the audio goes back to where you were.');
    return { start, close, use: h => { hk.push(h); }, hold, resume, again, ctx, narr, narrStop, jump, ring: setRing, get step() { return st.step; }, get on() { return st.on; }, get k() { return st.k; } };
  })();

  LearnHub.register({
    id: 'echo', order: 40, icon: '\uD83D\uDDE3', title: 'Echo', subtitle: 'Hear it, say it back',
    playerSubtitle: ctx => (ctx && ctx.time ? 'Starts at ' + fmt(ctx.time) : 'Hear it, say it back'),
    open: () => { EM.start(); }
  });
