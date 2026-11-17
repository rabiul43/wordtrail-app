  /* ---------- Speed ladder: the same sentence, one step faster each time it goes well (SLC, SL) ----------
     Task 8. A Listening mode of its own. The narrator plays ONE sentence of the open track (its own start and end from the sentence timing) at one of four speeds:
     Very slow 0.7x, Slow 0.85x, Normal 1x, Fast 1.2x. The learner types what they hear and taps Check (the same grading as Listen and type: `LNC.check`, UK and US
     spellings both accepted). The speed of the NEXT sentence depends on the result: perfect = one step faster (but if the learner had to tap Slower first, the next sentence
     stays at the speed where they got it right), almost = the same speed, wrong = one step slower. The learner can also tap Slower or Faster before Check: the
     fastest speed they can follow is the point of the screen. The first sentence starts at the speed of the last session of this device (or Slow when there is none).
     The saved playback speed (`P.speed`) is NEVER changed: only the one <audio> element's rate is set while a clip plays and put back to `P.speed` when it stops.
     No hints here (they would blur what the speed shows), no lives, no timer, no score to beat. The end screen names the fastest comfortable speed (right more often than wrong at that speed), in words
     ("Fast (1.2x)"), and lists each sentence with its speed. No number of points, so Calm mode needs nothing hidden.
     Sentences: picked like in Listen and type (`LNC.pickSet`) around the Listen-and-type level MINUS 10 points: here the speed is the challenge, so the words are a little
     easier. No level yet = the first 10 as before. This mode does not write to the level (`wt:lvl`): speed would blur what the level means.
     Counts as a Listening session in the IELTS hub (IE.log('l') when the 10th sentence is finished), like Listen and type.
     Storage: `wt:ladder` = { "YYYY-MM-DD": rate } the fastest comfortable speed of that day, at most 60 days, this device only (not synced, not in the backup), read fresh
     when needed. Task 12 (the trend) reads it with SL.days().
     Runs only while the screen is open (a 40 ms check while a clip plays); nothing at start-up. When closed in ANY way the audio goes back to the same track and second
     and plays again if it was playing (same rule as Echo and Listen and type). The clip player here is a copy of the one in 169k (that file is not touched).
       SLC.RATES  SLC.NAMES  SLC.FIRST   SLC.rate(step)  SLC.word(step)  SLC.label(step)   pure: 0.7 .. 1.2, "Slow", "Slow (0.85x)"
       SLC.up(step)  SLC.down(step)   SLC.after(step, v, from)  pure: the speed of the next sentence    SLC.note(step, next)  pure: the line under the answer
       SLC.best(res)  pure: the fastest step where the learner was right more often than wrong, or -1     SLC.say(best)  pure: the sentence under the speed word on the end screen
       SLC.clean(raw)  SLC.put(map, day, step)  SLC.startStep(map)  SLC.target(level)  pure: storage, first speed, sentence level
       SL.start()   SL.close()   SL.on   SL.results()   SL.last()  { bookId, title, sec, ts, best, res } of the last session finished or closed with an answer, or null
       SL.days()  { "YYYY-MM-DD": rate }     SL.today()  the fastest comfortable step today, or -1
     Registered in the Learn hub (169b) as the tile "Speed ladder" (and so in the player's "Study this chapter" sheet, 169e) and in the Listening group (169w).
     Remove this file, 94ze-speed-ladder.css, 28h-sheet-speed-ladder.html and their build.py lines to go back (the extra id in 169w stays unused). Test: node tools/speed_ladder_check.js */
  const SLC = (() => {
    /*SLC-START*/
    const RATES = [0.7, 0.85, 1, 1.2], NAMES = ['Very slow', 'Slow', 'Normal', 'Fast'], TOP = RATES.length - 1, FIRST = 1, KEEP = 60;
    const DAY = /^\d{4}-\d{2}-\d{2}$/;
    const isNum = n => typeof n === 'number' && isFinite(n);
    const clamp = s => (isNum(s) ? Math.max(0, Math.min(TOP, Math.round(s))) : FIRST);
    const rate = s => RATES[clamp(s)], word = s => NAMES[clamp(s)], label = s => word(s) + ' (' + rate(s) + 'x)';
    const up = s => Math.min(TOP, clamp(s) + 1), down = s => Math.max(0, clamp(s) - 1);
    function stepOf(r) { const v = typeof r === 'string' ? parseFloat(r) : r; if (!isNum(v)) return -1; for (let i = 0; i <= TOP; i++) if (Math.abs(RATES[i] - v) < 0.011) return i; return -1; }
    /* the speed of the next sentence. step = speed of the sentence just answered, from = the speed it started at (lower than `from` = the learner tapped Slower) */
    function after(step, v, from) {
      const s = clamp(step), f = isNum(from) ? clamp(from) : s;
      if (v === 'ok') return s < f ? s : up(s);
      if (v === 'near') return s;
      return down(s);
    }
    const note = (step, next) => { const a = clamp(step), b = clamp(next); return b > a ? 'Next sentence: one step faster.' : b < a ? 'Next sentence: one step slower.' : 'Next sentence: the same speed.'; };
    /* the fastest COMFORTABLE speed of a session: the fastest step where the learner was right (perfect) more often than wrong. One lucky guess at a speed that
       otherwise went badly does not count. -1 when there is no such step */
    function best(res) {
      const ok = [0, 0, 0, 0], no = [0, 0, 0, 0];
      (Array.isArray(res) ? res : []).forEach(r => {
        if (!r || !isNum(r.step)) return;
        const s = clamp(r.step); if (r.v === 'ok') ok[s]++; else if (r.v !== 'near') no[s]++;
      });
      let b = -1; for (let s = 0; s <= TOP; s++) if (ok[s] > no[s]) b = s;
      return b;
    }
    const say = b => (!isNum(b) || b < 0 ? 'No sentence was fully right this time. Slow speeds are a good place to practise.' : b >= TOP ? 'You followed the fastest step. Great listening!' : 'The fastest speed you followed.');
    /* storage: { "YYYY-MM-DD": rate }, newest 60 days, only the four rates; anything else is dropped */
    function clean(raw) {
      let o = raw;
      if (typeof raw === 'string') { try { o = JSON.parse(raw); } catch (e) { o = null; } }
      const out = {};
      if (!o || typeof o !== 'object' || Array.isArray(o)) return out;
      Object.keys(o).filter(k => DAY.test(k)).sort().slice(-KEEP).forEach(k => { const s = stepOf(o[k]); if (s >= 0) out[k] = RATES[s]; });
      return out;
    }
    function put(map, day, step) {   // keeps the fastest of the day; a new map, capped
      const out = clean(map);
      if (!DAY.test(String(day)) || !isNum(step)) return out;
      const s = clamp(step);
      if (stepOf(out[day]) < s) out[day] = RATES[s];
      return clean(out);
    }
    function startStep(map) { const m = clean(map), ks = Object.keys(m).sort(); return ks.length ? stepOf(m[ks[ks.length - 1]]) : FIRST; }
    /* sentences a little easier than the Listen-and-type level (the speed is the challenge); null stays null (no level yet) */
    const target = lv => (isNum(lv) ? Math.max(0, Math.min(100, lv - 10)) : null);
    /*SLC-END*/
    return { RATES, NAMES, FIRST, KEEP, rate, word, label, up, down, after, note, best, say, clean, put, startStep, target };
  })();

  const SL = (() => {
    const KEY = 'wt:ladder';
    const st = { on: false, p: null, set: [], i: 0, stage: '', sp: SLC.FIRST, from: SLC.FIRST, nxt: SLC.FIRST, plays: 0, snap: null, tok: 0, watch: 0, playing: false, fail: false, res: [], chk: null };
    let last = null, VM = null;
    const q = id => document.getElementById(id);
    const hid = k => { const s = S.model && st.p && S.model.sents[st.p.ids[k]]; return !s || !!s.h; };
    const kNow = () => st.set[st.i];
    const textNow = () => { const s = S.model.sents[st.p.ids[kNow()]]; return s ? s.t : ''; };
    function quiet(f) { S.quietJump = true; try { f(); } finally { S.quietJump = false; } }   // these moves are not "jumps" for the jump history (060)
    function stopAudio() { try { if (!audio.paused) audio.pause(); } catch (e) { /* nothing to stop */ } try { audio.playbackRate = P.speed; } catch (e) { /* ignore */ } }   // the saved speed is only read here, never written
    function halt() { clearInterval(st.watch); st.watch = 0; st.tok++; }
    function chapterOf(id) {
      try { const c = S.model.chapters && S.model.chapters.find(x => id >= x.start && id < x.end); return [S.book.title, c && c.title].filter(Boolean).join(' · '); } catch (e) { return S.book ? S.book.title : ''; }
    }
    const vmap = () => {   // UK / US pairs from the page (#lt-variants, the same list as Listen and type), read once on first use
      if (!VM) { let l = []; try { l = (JSON.parse(q('lt-variants').textContent) || {}).pairs || []; } catch (e) { l = []; } VM = LNC.variants(l); }
      return VM;
    };
    const dkey = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
    function load() { let r = null; try { r = localStorage.getItem(KEY); } catch (e) { r = null; } return SLC.clean(r); }
    function save(m) { try { localStorage.setItem(KEY, JSON.stringify(m)); } catch (e) { /* full or blocked: it still works this session */ } }
    function todayStep() { const m = load(), r = m[dkey()]; if (r == null) return -1; const i = SLC.RATES.indexOf(r); return i; }
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
      q('sl-play').classList.toggle('is-playing', st.playing);
      q('sl-plays').textContent = st.plays ? 'Played ' + st.plays + (st.plays === 1 ? ' time' : ' times') : '';
      q('sl-status').textContent = st.fail ? 'The audio did not start. Tap the speaker to try again.' : '';
    }
    function paintSpeed() {
      const typing = st.on && st.stage === 'type';
      q('sl-rate').textContent = SLC.label(st.sp);
      q('sl-down').disabled = !typing || st.sp <= 0; q('sl-up').disabled = !typing || st.sp >= SLC.RATES.length - 1;
    }
    function paint() {
      const end = st.stage === 'end', done = st.stage === 'checked', n = st.set.length;
      q('sl-title').textContent = end ? 'Your answers' : 'Speed ladder';
      q('sl-main').hidden = end; q('sl-end').hidden = !end;
      q('sl-pos').textContent = end ? '' : 'Sentence ' + (st.i + 1) + ' of ' + n; q('sl-sep').hidden = end;
      q('sl-ch').textContent = chapterOf(st.p.ids[st.set[Math.min(st.i, n - 1)]]);
      const pr = q('sl-prog'), pct = Math.round(100 * (end ? n : st.i + (done ? 1 : 0)) / n);
      pr.setAttribute('aria-valuenow', String(pct)); pr.style.setProperty('--wl-p', pct + '%');
      if (!end) {
        q('sl-in').readOnly = done;
        q('sl-check').hidden = done; q('sl-next').hidden = !done;
        q('sl-check').disabled = !LNC.words(q('sl-in').value).length;
      } else { q('sl-check').hidden = true; q('sl-next').hidden = false; }
      q('sl-next').textContent = 'Continue';
      q('sl-foot').classList.toggle('is-end', end);
      paintSpeed(); paintPlay();
    }
    function paintFeedback(c, text) {
      const f = q('sl-fb'), foot = q('sl-foot');
      foot.classList.remove('is-ok', 'is-near', 'is-no'); foot.classList.add('is-' + c.v);
      q('sl-fb-t').textContent = c.v === 'ok' ? 'Perfect. Every word is right.' : c.v === 'near' ? 'Almost. Check the spelling of the marked words.' : 'Not quite. Here is the sentence.';
      const a = q('sl-fb-a'); a.textContent = ''; a.append(marked(text, c.words, false));
      const fx = c.v === 'ok' ? '' : fixList(c); q('sl-fb-s').textContent = fx; q('sl-fb-s').hidden = !fx;
      const last1 = st.i + 1 >= st.set.length;
      q('sl-fb-n').textContent = last1 ? '' : SLC.note(st.sp, st.nxt); q('sl-fb-n').hidden = last1;
      const y = q('sl-fb-y'), yl = q('sl-fb-yl'); y.textContent = ''; y.hidden = yl.hidden = c.v === 'ok';
      if (c.v !== 'ok') y.append(marked(q('sl-in').value, c.tw, true));
      f.hidden = false;
    }
    function hideFeedback() { q('sl-fb').hidden = true; q('sl-foot').classList.remove('is-ok', 'is-near', 'is-no'); }
    function paintEnd() {
      const r = st.res.filter(Boolean), b = SLC.best(r);
      q('sl-sc-h').textContent = b >= 0 ? SLC.label(b) : 'Keep practising'; q('sl-sc-s').textContent = SLC.say(b);
      const ol = q('sl-steps'); ol.textContent = '';
      r.forEach(x => ol.append(h('li', { class: 'wl-pill lt-sumi sl-step ' + (x.v === 'ok' ? 'is-ok' : x.v === 'near' ? 'is-near' : 'is-no') },
        h('span', { class: 'sl-step-s' }, SLC.word(x.step)), ' · ', h('span', null, x.v === 'ok' ? 'Perfect' : x.v === 'near' ? 'Almost' : 'To fix'))));
      const bad = r.filter(x => x.v !== 'ok'), list = q('sl-prac'); list.textContent = '';
      q('sl-all').hidden = bad.length > 0; q('sl-prac-h').hidden = list.hidden = !bad.length;
      bad.forEach(x => { const li = h('li', { class: 'wl-card lt-pi' }, h('span', { class: 'lt-pi-t' }, marked(x.text, x.chk.words, false))); const fx = fixList(x.chk); if (fx) li.append(h('span', { class: 'lt-pi-f' }, fx)); list.append(li); });
    }

    /* ----- one clip: the narrator says the sentence once, from its start to the start of the next one, at the speed of the current step ----- */
    function endClip() { halt(); stopAudio(); st.playing = false; paintPlay(); }
    function failed() { halt(); stopAudio(); st.playing = false; st.fail = true; paintPlay(); }
    function play() {
      if (!st.on || st.stage === 'end') return;
      halt(); const tok = st.tok, [a, b] = shClip(st.p, kNow());
      st.plays++; st.fail = false; st.playing = true; paintPlay();
      try {
        audio.playbackRate = SLC.rate(st.sp); quiet(() => seekAudio(a));
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
    function step(to) { if (!st.on || st.stage !== 'type') return; const n = to < 0 ? SLC.down(st.sp) : SLC.up(st.sp); if (n === st.sp) return; st.sp = n; paintSpeed(); play(); }

    /* ----- the steps: type, check, continue ----- */
    function newSentence() {
      st.stage = 'type'; st.plays = 0; st.fail = false; st.chk = null; st.from = st.sp;
      q('sl-in').value = ''; hideFeedback();
      paint(); play();
    }
    function check() {
      if (!st.on || st.stage !== 'type') return;
      const typed = q('sl-in').value; if (!LNC.words(typed).length) return;
      endClip();
      const T = textNow(), c = LNC.check(typed, T, vmap()), k = kNow();
      st.chk = c; st.stage = 'checked'; st.nxt = SLC.after(st.sp, c.v, st.from);
      st.res[st.i] = { k, id: st.p.ids[k], text: T, typed, v: c.v, ok: c.ok, close: c.close, wrong: c.wrong, miss: c.miss, step: st.sp, from: st.from, plays: st.plays, chk: c };
      try { q('sl-in').blur(); } catch (e) { /* ignore */ }   // the keyboard goes away, so the answer panel has room
      paint(); paintFeedback(c, T);
      try { q('sl-next').focus({ preventScroll: true }); } catch (e) { /* ignore */ }
    }
    function next() {
      if (!st.on) return;
      if (st.stage === 'end') { close(); return; }
      if (st.stage !== 'checked') return;
      endClip();
      if (st.i + 1 >= st.set.length) { st.stage = 'end'; try { IE.log('l'); } catch (e) { /* IELTS practice log (169o) not loaded */ } hideFeedback(); paint(); paintEnd(); try { q('sl-title').focus({ preventScroll: true }); } catch (e) { /* ignore */ } return; }
      st.i++; st.sp = st.nxt; newSentence();
      try { q('sl-in').focus({ preventScroll: true }); } catch (e) { /* ignore */ }
    }

    /* ----- open and close; the audio goes back to where it was ----- */
    function vv() {   // a phone keyboard opens: the screen follows the part that is still visible, so Check stays in reach
      const v = window.visualViewport, sh = q('sheet-sl'); if (!v || !st.on) return;
      sh.style.height = Math.round(v.height) + 'px'; sh.style.top = Math.round(v.offsetTop) + 'px';
    }
    function start() {
      if (st.on) return true;
      const p = typeof shPlan === 'function' ? shPlan() : null;
      if (!S.book || !S.model || !p) { toast('Open a book that has its text lined up with the audio first.', 4000); return false; }
      st.p = p;
      const texts = p.ids.map(id => { const s = S.model.sents[id]; return s ? s.t : ''; });
      const dur = i => (i + 1 < p.starts.length && p.starts[i + 1] > p.starts[i] ? p.starts[i + 1] - p.starts[i] : null), dif = i => LVX.d(texts[i], dur(i));
      let target = null; try { target = SLC.target(LVX.target('type')); } catch (e) { target = null; }
      const set = LNC.pickSet(texts, hid, Core.locate(p.starts, nowT() + P.nudge), LNC.SIZE, target == null ? null : { target, d: dif });
      if (!set.length) { toast('This track has no sentences to type. Try another track.', 4000); return false; }
      st.snap = { bookId: String(S.book.id), sec: S.sec, time: nowT(), playing: !audio.paused && !audio.ended };
      st.on = true; st.set = set; st.i = 0; st.res = []; st.playing = false;
      st.sp = st.from = st.nxt = SLC.startStep(load());
      stopAudio();
      openSheet('sheet-sl');
      if (window.visualViewport) { window.visualViewport.addEventListener('resize', vv); window.visualViewport.addEventListener('scroll', vv); vv(); }
      newSentence();
      try { q('sl-in').focus({ preventScroll: true }); } catch (e) { /* ignore */ }
      return true;
    }
    function finish() {   // however the screen was closed
      if (!st.on) return; st.on = false;
      halt(); stopAudio();
      if (window.visualViewport) { window.visualViewport.removeEventListener('resize', vv); window.visualViewport.removeEventListener('scroll', vv); }
      const sh = q('sheet-sl'); sh.style.height = ''; sh.style.top = '';
      const res = st.res.filter(Boolean), b = SLC.best(res);
      if (b >= 0) save(SLC.put(load(), dkey(), b));   // the fastest speed typed right today
      if (res.length) last = { bookId: String(S.book ? S.book.id : ''), title: S.book ? S.book.title || '' : '', sec: S.sec, ts: Date.now(), best: b, res: res.map(r => Object.assign({}, r)) };
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
    q('sl-x').addEventListener('click', close);
    q('sl-play').addEventListener('click', play);
    q('sl-down').addEventListener('click', () => step(-1));
    q('sl-up').addEventListener('click', () => step(1));
    q('sl-check').addEventListener('click', check);
    q('sl-next').addEventListener('click', next);
    q('sl-in').addEventListener('input', () => { if (st.on && st.stage === 'type') q('sl-check').disabled = !LNC.words(q('sl-in').value).length; });
    q('sl-in').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); check(); } });
    new MutationObserver(() => { if (q('sheet-sl').hidden) finish(); }).observe(q('sheet-sl'), { attributes: true, attributeFilter: ['hidden'] });
    guideDoc('reading', 'Speed ladder', 'Study this chapter > Speed ladder: the narrator plays one sentence at a set speed and you type what you hear. When you get it right, the next sentence is one step faster. When you miss it, the next is one step slower. Use Slower and Faster to find the quickest speed you can follow. Your saved listening speed is not changed.');
    return { start, close, results: () => st.res.filter(Boolean).map(r => Object.assign({}, r)), last: () => last, days: load, today: todayStep, get on() { return st.on; } };
  })();

  LearnHub.register({
    id: 'speedladder', order: 52, icon: '#i-m-zap', title: 'Speed ladder',
    subtitle: () => {
      let t = -1, calm = false; try { calm = P.calm === true; t = calm ? -1 : SL.today(); } catch (e) { t = -1; }
      return t >= 0 ? 'Fastest today: ' + SLC.word(t) : 'Hear it faster, step by step';
    },
    playerSubtitle: ctx => (ctx && ctx.time ? 'Starts at ' + fmt(ctx.time) : 'Hear it faster, step by step'),
    open: () => { SL.start(); }
  });
