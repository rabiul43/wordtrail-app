  /* ---------- Timed reading: passage, timer and reading speed (TMR, TRC; Task 58) ----------
     A full-screen reading practice, like an exam page: one passage of 600 to 900 words from a NON-FICTION chapter of the open book, cut into
     lettered paragraphs (A, B, C ...), a countdown timer (20 minutes, 5 to 60 in steps of 5) and the reader's speed in words per minute.
     Calm: no lives, no score, no leaderboard. A speed is only a number to watch over weeks. The exam-style questions are in 169t (Task 59,
     they register through TMR.use); nothing here depends on them, and without 169t the screen ends with the Speed saved panel.
     Screens: 1 Get ready (book and chapter, size of the passage, minutes with - and +, Start)  2 Reading (passage card, timer chip at the top,
     speed chip, "I've finished reading")  3 Speed saved (feedback panel at the bottom)  or  Time is up (nothing saved, no blame).
     THE TIMER SURVIVES TURNING THE PHONE AND SWITCHING APPS. It is never counted second by second: the run keeps its own start and end as clock
     times (wt:readrun) and the screen only DRAWS the time left from them. Turning the phone only resizes the screen (the page is not redrawn, so the
     reading place stays); coming back from another app (visibilitychange, pageshow, focus) draws the right time at once; if the browser threw the
     page away meanwhile, the Timed reading tile in the Learn hub says "Continue" and opens the same passage with the time that is left (the passage is
     kept in the run). The one-second tick runs only while the screen is open and visible. Nothing runs at start-up; playback is never touched.
     Closing (X, Escape, Back) ends the practice. Finished means: reading done (speed saved) and the run is dropped when the screen is closed.
     Passage rules (TRC.pick): the first run of whole sentences of one chapter that starts at a book paragraph, begins with a capital and ends with a
     full stop, has no footnote or page debris and holds 600 to 900 words (closest to 750; a window that ends at a book paragraph is preferred). The chapter
     is limited to chapters the reader has reached (QG.furthest, 167c), the same rule as the question screens. A chapter that is too short or too broken is
     skipped for another reached chapter. If the book's genres are known and are not non-fiction the screen says so (TRC.isNonFiction; unknown = allowed).
     Speed: words of the passage / minutes from Start to the tap on "I've finished reading" (clock time, so it counts the time the app was in the
     background). Under 20 seconds or over 1000 words per minute is not a real read: it is not saved ("Take your time").
     Storage (two keys; both through `store`):
       wt:readspeed = { v: 1, runs: [ { id, ts, bid, ch, w, s, wpm } ] }   SYNCED (category Learning stats in 295; in backups, 290). One run per finished
                      reading: id (the run), ts (ms), bid (book id), ch (chapter), w (words), s (seconds), wpm. Newest 200 kept. Merge across devices:
                      runs joined by id, sorted by ts (TMR.mergeJson, repeatable, never loses a run). For the Progress area: TMR.history(), TMR.stats().
       wt:readrun   = { v: 1, id, bid, ch, bt, ct, mins, start, end, words, paras: [ { L, t } ], rd, wpm }   THIS DEVICE ONLY (not synced, not in
                      backups): the run in progress. rd = seconds read once the reader tapped finished (0 before). Removed when the screen is closed or time ran out.
       wt:readmin   = minutes chosen for the next run (5..60), this device only.
     API (later tasks call these):
       TMR.start(ctx)    ctx = { bookId, chapter } like PP.start. Promise -> true when the screen opened (also resumes a run in progress, with no book open)
       TMR.close()       TMR.on  true while open
       TMR.current()     a copy of the run in progress, or null  { id, bid, ch, mins, start, end, words, paras, rd, wpm }  (task 59 builds on this)
       TMR.saved()       the run in progress that still has time left and is not finished reading, or null
       TMR.history()     the saved runs, oldest first      TMR.stats()  { n, last, best, avg, avg5 }      TMR.KEY  TMR.mergeJson(a, b)
       Pure rules (TRC, between TRC-START/END): isNonFiction, wc, pick, find, split, wpm, minutes, left, fmt, cleanRun, merge, mergeJson, stats, series.
     Tests: node tools/timed_reading_check.js   (pure rules, wiring, then real Chromium: rotate the phone, switch apps, reload, resume)
     Registered in the Learn hub (169b) as the tile "Timed reading" (order 36; the subtitle says Continue when a run is waiting). Styles 94x-timed-reading.css
     (the frame, progress parts and feedback panel reuse .rl*, .wl*). To go back: remove this file, 94x-timed-reading.css, their build.py lines, the TMR lines
     in 270 (histLayers, histBack), the wt:readspeed lines in 295 and 290 and the strings marked "timed reading" in src/i18n/bn.json. */
  /* TRC-START */
  const TRC = (() => {
    const LET = 'ABCDEFG', MIN_W = 600, MAX_W = 900, TARGET = 750, KEEP = 200, DEF_MIN = 20, LO = 5, HI = 60, MIN_S = 20, MAX_WPM = 1000;
    const NF = /non-?fiction|\b(?:history|science|biograph\w*|autobiograph\w*|memoirs?|essays?|philosoph\w*|nature|psycholog\w*|economic\w*|politic\w*|travel\w*|religio\w*|education\w*|self-?help|reference|mathematic\w*|geograph\w*|sociolog\w*|anthropolog\w*|technolog\w*|health|medic\w*|business|law|art|music|language\w*)\b/i;
    const DEBRIS = /[\[\]{}]|footnote|illustration|https?:|www\.|\bpage \d+\b/i;
    const isObj = x => !!x && typeof x === 'object' && !Array.isArray(x);
    const int = v => (typeof v === 'number' && isFinite(v) && v > 0) ? Math.floor(v) : 0;
    const wc = t => (String(t == null ? '' : t).match(/\S+/g) || []).length;
    const isNonFiction = g => { const s = String(g == null ? '' : g).trim(); return s ? NF.test(s) : null; };   // true / false, or null when the genres are not known
    function sentOk(t) {   // a sentence that may be inside a passage (no debris, not a heading)
      if (typeof t !== 'string' || DEBRIS.test(t)) return false;
      const letters = t.replace(/[^A-Za-z]/g, '');
      return letters.length > 0 && letters.replace(/[^A-Z]/g, '').length / letters.length < 0.6;
    }
    const startOk = t => /^[\s"'“‘(]*[A-Z]/.test(t), endOk = t => /[.!?]["'”’)]*$/.test(t);
    /* The sentences of one chapter in order: [ { t, p } ] (p = book paragraph id). Headings are left out. */
    function chapterSents(model, ch) {
      if (!model || !Array.isArray(model.sents) || !Array.isArray(model.chapters)) return [];
      const c = model.chapters[ch]; if (!c || c.front) return [];
      const out = [], a = Math.max(0, c.start | 0), b = Math.min(model.sents.length, c.end | 0);
      for (let k = a; k < b; k++) { const s = model.sents[k]; if (s && s.ch === ch && !s.h && typeof s.t === 'string') out.push({ t: s.t.replace(/\s+/g, ' ').trim(), p: s.p }); }
      return out;
    }
    /* Cut sentences i..j into 4 to 7 lettered paragraphs of about equal size. A cut at the end of a book paragraph is preferred (45 words of leeway). */
    function split(ss, i, j) {
      const n = j - i + 1, cum = []; let W = 0;
      for (let k = i; k <= j; k++) { W += wc(ss[k].t); cum.push(W); }
      const K = Math.max(1, Math.min(n, LET.length, Math.max(4, Math.min(7, Math.round(W / 150))))), cuts = []; let prev = -1;
      for (let c = 1; c < K; c++) {
        const ideal = c * W / K; let best = -1, bs = Infinity;
        for (let b = prev + 1; b <= n - 1 - (K - c); b++) {
          const s = Math.abs(cum[b] - ideal) + (ss[i + b + 1].p !== ss[i + b].p ? 0 : 45);
          if (s < bs) { bs = s; best = b; }
        }
        cuts.push(best); prev = best;
      }
      const paras = []; let a = 0;
      cuts.concat([n - 1]).forEach((b, x) => { const txt = []; for (let k = a; k <= b; k++) txt.push(ss[i + k].t); paras.push({ L: LET[x], t: txt.join(' ') }); a = b + 1; });
      return paras;
    }
    /* The first good passage of a chapter's sentences: { from, to, words, paras } or null. o = { min, max, target, from } */
    function pick(ss, o) {
      o = o || {}; const min = o.min || MIN_W, max = o.max || MAX_W, tgt = o.target || TARGET;
      if (!Array.isArray(ss)) return null;
      for (let i = Math.max(0, o.from | 0); i < ss.length; i++) {
        if (i > 0 && ss[i].p === ss[i - 1].p) continue;   // start where a book paragraph starts
        if (!sentOk(ss[i].t) || !startOk(ss[i].t)) continue;
        let w = 0, bj = -1, bw = 0, bs = Infinity;
        for (let j = i; j < ss.length; j++) {
          if (!sentOk(ss[j].t)) break;
          w += wc(ss[j].t); if (w > max) break;
          if (w >= min && endOk(ss[j].t)) {
            const s = Math.abs(w - tgt) + (j + 1 >= ss.length || ss[j + 1].p !== ss[j].p ? 0 : 60);
            if (s < bs) { bs = s; bj = j; bw = w; }
          }
        }
        if (bj >= 0) return { from: i, to: bj, words: bw, paras: split(ss, i, bj) };
      }
      return null;
    }
    /* A passage for chapter ch, or from another REACHED chapter when that one is too short (ch, ch-1 ... 0, then ch+1 ... furthest). The spoiler rule:
       nothing past `far`. Returns { ch, ct, from, to, words, paras } or null. */
    function find(model, ch, far, o) {
      if (!Number.isInteger(ch) || !Number.isInteger(far) || far < 0 || ch < 0 || ch > far) return null;
      const order = []; for (let c = ch; c >= 0; c--) order.push(c); for (let c = ch + 1; c <= far; c++) order.push(c);
      for (let k = 0; k < order.length; k++) {
        const r = pick(chapterSents(model, order[k]), o);
        if (r) return Object.assign({ ch: order[k], ct: String((model.chapters[order[k]] || {}).title || '') }, r);
      }
      return null;
    }
    /* words per minute, or 0 when it is not a real read (under 20 seconds, or over 1000 words per minute) */
    function wpm(words, secs) {
      const w = int(words), s = typeof secs === 'number' && isFinite(secs) ? secs : 0;
      if (!w || s < MIN_S) return 0;
      const v = Math.round(w * 60 / s); return v >= 1 && v <= MAX_WPM ? v : 0;
    }
    const minutes = v => { const n = Math.round(Number(v)); return isFinite(n) && n > 0 ? Math.max(LO, Math.min(HI, Math.round(n / 5) * 5)) : DEF_MIN; };
    const left = (end, now, mins) => { const e = Number(end), n = Number(now); if (!isFinite(e) || !isFinite(n)) return 0; return Math.max(0, Math.min(minutes(mins) * 60, Math.ceil((e - n) / 1000))); };
    const fmt = sec => { const s = int(sec); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
    /* one saved speed, or null when it is not valid */
    function cleanRun(r) {
      if (!isObj(r) || typeof r.id !== 'string' || !r.id || r.id.length > 40) return null;
      const ts = int(r.ts), w = int(r.w), s = int(r.s), v = int(r.wpm);
      if (!ts || !w || !s || !v || v > 1500) return null;
      return { id: r.id, ts, bid: String(r.bid == null ? '' : r.bid).slice(0, 40), ch: int(r.ch), w, s, wpm: v };
    }
    function merge(A, B) {   // runs joined by id, oldest first, newest KEEP kept; neither input is changed
      const m = new Map();
      [A, B].forEach(L => { if (Array.isArray(L)) L.forEach(x => { const c = cleanRun(x); if (c) m.set(c.id, c); }); });
      const out = [...m.values()].sort((a, b) => a.ts - b.ts || (a.id < b.id ? -1 : 1));
      return out.slice(Math.max(0, out.length - KEEP));
    }
    function mergeJson(a, b) {
      let A, B; try { A = JSON.parse(a); B = JSON.parse(b); } catch (e) { return null; }
      return isObj(A) && isObj(B) ? JSON.stringify({ v: 1, runs: merge(A.runs, B.runs) }) : null;
    }
    function stats(runs) {   // { n, last, best, avg (all), avg5 (last 5) }, all 0 for no runs
      const r = merge(runs, []), o = { n: r.length, last: 0, best: 0, avg: 0, avg5: 0 };
      if (!r.length) return o;
      const mean = a => Math.round(a.reduce((t, x) => t + x.wpm, 0) / a.length);
      o.last = r[r.length - 1].wpm; o.best = Math.max.apply(null, r.map(x => x.wpm)); o.avg = mean(r); o.avg5 = mean(r.slice(-5)); return o;
    }
    const series = (runs, n) => merge(runs, []).slice(-Math.max(1, n | 0 || 12)).map(x => ({ ts: x.ts, wpm: x.wpm }));
    return { LET, MIN_W, MAX_W, TARGET, KEEP, DEF_MIN, LO, HI, isNonFiction, wc, chapterSents, split, pick, find, wpm, minutes, left, fmt, cleanRun, merge, mergeJson, stats, series };
  })();
  /* TRC-END */

  const TMR = (() => {
    const RUN = 'wt:readrun', SPD = 'wt:readspeed', MINK = 'wt:readmin';
    const L = { on: false, root: null, mode: '', run: null, pend: null, mins: TRC.DEF_MIN, timer: 0, opener: null, tEl: null, live: null, said: -1, scroll: null, foot: null, chips: null, hd: null };
    const now = () => Date.now();
    function loadRun() {   // the saved run, only when it has the right shape
      let r = null; try { r = store.get(RUN, null); } catch (e) { r = null; }
      if (!r || typeof r !== 'object' || typeof r.id !== 'string' || !Array.isArray(r.paras) || !r.paras.length || !isFinite(r.end) || !isFinite(r.start)) return null;
      if (!r.paras.every(p => p && typeof p.L === 'string' && typeof p.t === 'string')) return null;
      r.mins = TRC.minutes(r.mins); r.rd = r.rd > 0 ? r.rd : 0; r.wpm = r.wpm > 0 ? r.wpm : 0; r.words = r.words > 0 ? r.words : 0; return r;
    }
    const saveRun = r => { try { store.set(RUN, r); } catch (e) { /* storage unavailable: the timer still runs on this screen */ } };
    const clearRun = () => { try { localStorage.removeItem(RUN); } catch (e) { /* nothing to remove */ } };
    const history = () => { let v = null; try { v = store.get(SPD, null); } catch (e) { v = null; } return TRC.merge(v && Array.isArray(v.runs) ? v.runs : [], []); };
    const addHist = e => { try { store.set(SPD, { v: 1, runs: TRC.merge(history(), [e]) }); } catch (x) { /* storage full: the speed is shown but not kept */ } };
    const savedMins = () => { let v = null; try { v = store.get(MINK, null); } catch (e) { v = null; } return TRC.minutes(v == null ? TRC.DEF_MIN : v); };
    const saved = () => { const r = loadRun(); return r && !r.rd && TRC.left(r.end, now(), r.mins) > 0 ? r : null; };
    let QX = null;   // the question part (169t) registers here with TMR.use; while it is null nothing below changes
    const qui = () => ({ run: L.run, foot: L.foot, scroll: L.scroll, save: () => saveRun(L.run), close });   // what 169t may use

    /* ----- the clock: always worked out from the run's own start and end, never counted ----- */
    function paintTime(sec) { const t = TRC.fmt(sec); if (L.tEl && L.tEl.textContent !== t) L.tEl.textContent = t; }
    function say(sec) {   // a short spoken note at 5 minutes, 1 minute and the end (not every second)
      const th = sec <= 0 ? 0 : sec <= 60 ? 60 : sec <= 300 ? 300 : -1;
      if (th === L.said) return; L.said = th;
      if (L.live && th >= 0 && L.mode === 'read') L.live.textContent = th === 0 ? 'Time is up' : th === 60 ? '1 minute left' : 'About 5 minutes left';
    }
    function sync() {
      if (!L.on || !L.run) return;
      const left = TRC.left(L.run.end, now(), L.run.mins);
      paintTime(left); say(left);
      if (left <= 0 && L.mode === 'read') timeUp();
      else if (left <= 0 && L.mode === 'done' && QX) { try { QX.timesUp(); } catch (e) { /* questions not ready */ } }   // time ran out while questions were open (169t)
    }
    function stopTick() { if (L.timer) { clearInterval(L.timer); L.timer = 0; } }
    function startTick() { stopTick(); if (L.on && L.run && !document.hidden) L.timer = setInterval(sync, 500); }
    function onVis() { if (!L.on) return; if (document.hidden) stopTick(); else { startTick(); sync(); } }
    const onWake = () => { if (L.on) sync(); };   // pageshow, focus, resize, orientationchange: only the time is drawn again, never the page
    function listen(on) {
      const f = on ? 'addEventListener' : 'removeEventListener';
      document[f]('visibilitychange', onVis); window[f]('pageshow', onWake); window[f]('focus', onWake); window[f]('resize', onWake); window[f]('orientationchange', onWake);
    }

    /* ----- screen parts ----- */
    function frame(secs) {
      L.root.textContent = ''; L.tEl = h('span', { class: 'tr-time' }, TRC.fmt(secs));
      L.live = h('p', { class: 'tr-live', role: 'status' });
      L.hd = h('h1', { class: 'tr-h', id: 'tr-title', tabindex: '-1' }, 'Passage 1');
      L.root.append(h('header', { class: 'rl__top' },
        h('button', { class: 'rl__x', type: 'button', 'aria-label': 'Close timed reading', onclick: close }, '✕'), L.hd,
        h('span', { class: 'tr-timer', role: 'timer', 'aria-label': 'Time left' }, h('span', { 'aria-hidden': 'true' }, '⏱'), L.tEl)), L.live);
      L.scroll = h('div', { class: 'rl__scroll' }); L.foot = h('footer', { class: 'rl__foot' }); L.root.append(L.scroll, L.foot);
    }
    const chip = (txt, ok) => h('span', { class: 'tr-chip' + (ok ? ' tr-chip--ok' : '') }, txt);
    const range = paras => paras.length > 1 ? 'Paragraphs ' + paras[0].L + '–' + paras[paras.length - 1].L : 'Paragraph ' + paras[0].L;
    function paintChips(r) {
      L.chips.textContent = '';
      L.chips.append(r.wpm ? chip(r.wpm + ' words/min', true) : chip('About ' + r.words + ' words'), chip(range(r.paras)));
    }
    function panel(ok, title, lines, btn) {
      L.foot.textContent = '';
      L.foot.append(h('div', { class: 'wl-panel wl-panel--dock rl__panel' + (ok ? '' : ' tr-panel--calm'), role: 'status' },
        h('div', { class: 'wl-panel__head' }, h('span', { class: 'wl-panel__icon', 'aria-hidden': 'true' }, ok ? '\u{1F389}' : '⏳'), h('h2', { class: 'wl-panel__title' }, title)),
        ...lines.map(t => h('p', { class: 'wl-panel__text' }, t)), btn));
      btn.focus();
    }
    const doneBtn = () => h('button', { class: 'wl-btn wl-btn--block wl-btn--primary', type: 'button', onclick: close }, 'Done');

    /* ----- screen 1: get ready ----- */
    function drawStart() {
      const p = L.pend; L.mode = 'start'; L.run = null; stopTick(); frame(L.mins * 60);
      const out = h('output', { class: 'tr-mins', 'aria-live': 'polite' }, L.mins + ' minutes');
      const less = h('button', { class: 'wl-btn wl-btn--secondary tr-stepbtn', type: 'button', 'aria-label': 'Fewer minutes' }, '−');
      const more = h('button', { class: 'wl-btn wl-btn--secondary tr-stepbtn', type: 'button', 'aria-label': 'More minutes' }, '+');
      const set = d => {
        L.mins = Math.max(TRC.LO, Math.min(TRC.HI, L.mins + d)); out.textContent = L.mins + ' minutes'; paintTime(L.mins * 60);
        less.disabled = L.mins <= TRC.LO; more.disabled = L.mins >= TRC.HI; try { store.set(MINK, L.mins); } catch (e) { /* kept for this screen only */ }
      };
      less.addEventListener('click', () => set(-5)); more.addEventListener('click', () => set(5)); less.disabled = L.mins <= TRC.LO; more.disabled = L.mins >= TRC.HI;
      L.scroll.append(h('div', { class: 'rl__main' },
        h('h2', { class: 'rl__title' }, 'Get ready'),
        h('p', { class: 'rl__src' }, 'Read the passage, then tap I’ve finished reading. We save how many words per minute you read.'),
        h('div', { class: 'wl-card tr-info' }, h('p', { class: 'tr-lab' }, 'Passage'), h('p', { class: 'tr-src', lang: 'en', translate: 'no' }, [p.bt, p.ct].filter(Boolean).join(' · ') || '—'),
          h('div', { class: 'tr-chips' }, chip('About ' + p.words + ' words'), chip(range(p.paras)))),
        h('p', { class: 'rl__lab', id: 'tr-time-lab' }, 'Time'),
        h('div', { class: 'tr-step', role: 'group', 'aria-labelledby': 'tr-time-lab' }, less, out, more),
        h('p', { class: 'tr-note' }, 'The timer keeps going if you switch apps or turn your phone.')));
      L.foot.append(h('button', { class: 'wl-btn wl-btn--block wl-btn--primary', type: 'button', onclick: begin }, 'Start'));
      L.hd.focus({ preventScroll: true });
    }
    function begin() {
      const p = L.pend; if (!p || L.mode !== 'start') return;
      const t = now(), r = { v: 1, id: 'r' + t.toString(36) + Math.floor(Math.random() * 1296).toString(36), bid: p.bid, ch: p.ch, bt: p.bt, ct: p.ct, mins: L.mins, start: t, end: t + L.mins * 60000, words: p.words, paras: p.paras, rd: 0, wpm: 0 };
      saveRun(r); L.run = r; drawRead();
    }

    /* ----- screen 2: reading ----- */
    function drawRead() {
      const r = L.run; L.mode = r.rd ? 'done' : 'read'; L.said = -1;
      frame(TRC.left(r.end, now(), r.mins)); L.chips = h('div', { class: 'tr-chips' });
      L.scroll.append(h('div', { class: 'rl__main' },
        h('article', { class: 'wl-card tr-passage', lang: 'en', translate: 'no', 'aria-labelledby': 'tr-ptitle' },
          h('h2', { class: 'tr-ptitle', id: 'tr-ptitle' }, r.ct || r.bt || 'Passage'),
          ...r.paras.map(p => h('p', { class: 'tr-para', 'data-p': p.L }, h('strong', { class: 'tr-let' }, p.L), ' ' + p.t))), L.chips));
      paintChips(r);
      if (r.rd) { finishedPanel(); } else { L.foot.append(h('button', { class: 'wl-btn wl-btn--block wl-btn--primary', type: 'button', onclick: finish }, 'I’ve finished reading')); }
      startTick(); sync(); L.hd.focus({ preventScroll: true });
    }
    function finish() {
      const r = L.run; if (!r || L.mode !== 'read') return;
      if (TRC.left(r.end, now(), r.mins) <= 0) { timeUp(); return; }
      const secs = (now() - r.start) / 1000, v = TRC.wpm(r.words, secs);
      if (!v) { toast('Take your time. Tap again when you have read the whole passage.', 2800); return; }
      r.rd = Math.round(secs); r.wpm = v; saveRun(r);
      addHist({ id: r.id, ts: now(), bid: r.bid, ch: r.ch, w: r.words, s: r.rd, wpm: v });
      L.mode = 'done'; paintChips(r); finishedPanel();
      try { LearnHub.refresh(); } catch (e) { /* hub not ready */ }
    }
    function finishedPanel() {
      if (QX) { let used = false; try { used = QX.show(qui()); } catch (e) { used = false; } if (used) return; }   // the questions (169t) take the panel when they have some
      const r = L.run, st = TRC.stats(history()), n = Math.min(st.n, 5);
      panel(true, 'Speed saved', [r.wpm + ' words per minute', st.n > 1 ? 'Average of your last ' + n + ': ' + st.avg5 + '.' : 'This is your first one. Come back to see how your speed grows.'], doneBtn());
    }
    function timeUp() {   // time ran out before "finished": nothing is saved, nobody is blamed
      if (L.mode !== 'read') return;
      L.mode = 'up'; clearRun(); stopTick();
      panel(false, 'Time is up', ['That is fine. Your speed was not saved this time. Try again whenever you like.'], doneBtn());
    }

    /* ----- open and close ----- */
    function open() {
      if (!L.root) {
        L.root = h('div', { class: 'rl qs tr', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'tr-title', hidden: true });
        L.root.addEventListener('keydown', ev => { if (ev.key === 'Escape') { ev.stopPropagation(); close(); } });
        document.body.append(L.root);
      }
      Object.assign(L, { on: true, opener: document.activeElement, said: -1 }); L.root.hidden = false; listen(true); histSoon();
    }
    async function start(ctx) {
      if (L.on) return true;
      const sv = loadRun();
      if (sv) {   // a run is waiting (this page may be a fresh load after the phone switched apps): carry on with the time that is left
        const more = !!(QX && sv.rd && sv.qs && !sv.qd);   // finished reading, questions still open
        if ((!sv.rd || more) && TRC.left(sv.end, now(), sv.mins) > 0) { open(); L.run = sv; drawRead(); return true; }
        clearRun(); if (!sv.rd) toast('Your last timed reading ran out of time. Start a new one when you like.', 3000);
        else if (more) toast('Time ran out before the questions were finished. Your speed was saved.', 3200);
      }
      let c = ctx; try { if (!c || c.bookId == null) c = LB.ctx(); } catch (e) { c = null; }
      if (!c || !S.book || !S.model || String(S.book.id) !== String(c.bookId)) { toast('Open a book to practise its chapters.', 2200); return false; }
      if (TRC.isNonFiction(S.book.genres) === false) { toast('Timed reading uses non-fiction books. Open a non-fiction book to try it.', 3200); return false; }
      let far = -1; try { far = QG.furthest(S.lp, S.map, S.span); } catch (e) { far = -1; }
      try { const k = S.model.sents[S.curId]; if (k && !k.h && Number.isInteger(k.ch)) far = Math.max(far, k.ch); } catch (e) { /* no position yet */ }
      if (far < 0) { toast('Listen a little first. Questions use chapters you have reached.', 2600); return false; }
      const ch = (typeof c.chapter === 'number' && c.chapter >= 0 && c.chapter <= far) ? c.chapter : far;
      const f = TRC.find(S.model, ch, far);
      if (!f) { toast('No passage of 600 words or more in the chapters you have reached yet.', 3000); return false; }
      L.pend = { bid: String(S.book.id), bt: S.book.title || '', ch: f.ch, ct: f.ct, words: f.words, paras: f.paras }; L.mins = savedMins();
      open(); drawStart(); return true;
    }
    function close() {
      if (!L.on) return;
      try { if (QX) QX.off(); } catch (e) { /* nothing to reset */ }
      L.on = false; stopTick(); listen(false); L.root.hidden = true; L.run = null; L.pend = null; L.mode = '';
      clearRun();   // closing ends the practice; a speed that was finished is already in wt:readspeed
      try { LearnHub.refresh(); } catch (e) { /* hub not ready */ }
      histSoon(); if (L.opener && L.opener.isConnected) L.opener.focus();
    }
    const current = () => L.run ? JSON.parse(JSON.stringify(L.run)) : null;
    return { start, close, current, use: x => { QX = x && typeof x.show === 'function' ? x : null; }, saved, history, stats: () => TRC.stats(history()), KEY: SPD, mergeJson: TRC.mergeJson, get on() { return L.on; } };
  })();

  LearnHub.register({
    id: 'timedreading', order: 36, icon: '⏱', title: 'Timed reading',
    subtitle: () => {
      const r = TMR.saved(); if (r) return 'Continue: ' + TRC.fmt(TRC.left(r.end, Date.now(), r.mins)) + ' left';
      const s = TMR.stats(); return s.n ? 'Last: ' + s.last + ' words/min' : 'A passage, a timer, your speed';
    },
    playerSubtitle: 'Read a passage against the clock',
    open: c => { TMR.start(c); }
  });
