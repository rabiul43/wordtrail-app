  /* ---------- Speaking Part 2: cue card, 1 minute to prepare, up to 2 minutes to speak, review (SPK, SPC; Task 62) ----------
     IELTS-style practice (it says so on the screen; it is not the exam and gives NO score). A full-screen practice like Timed reading (169q).
     Screens in one frame: 1 Prep (cue card made from a template and the open book, a notes box, a 60 s ring)  2 Speak (the same card and notes,
     a 120 s ring, the recording)  3 Review (feedback panel at the bottom: time, pace, long pauses; play and delete the recording; Part 3 questions).
     Calm: no lives, no score, no leaderboard, no pressure. Preparation never starts the microphone and never ends by itself: at 0:00 the screen
     says so and waits for the tap on "Start speaking now". The microphone is asked for ONLY on that tap.
     TIMERS ARE CLOCK TIMES, NEVER COUNTED. Prep has its own start/end (Date.now); the talk has its own start/end taken when the recorder really
     started (after the browser's permission box); the screen only DRAWS the time left from them every 250 ms while visible, and a setTimeout set for
     the exact end stops the talk at 2:00 (a throttled background page still stops; coming back runs sync() at once). The length of a talk is the
     clock time from recorder start to stop (never more than 120 s), not the length of the file.
     Recording: reuses 169i (ERC.supported / pickType / errKind / MIN_S / fmtS and ER.saveBlob / remove). The take goes to the same IndexedDB
     "wordtrail-rec" (device only, nothing uploaded; no network, account or sync code in this file) with { kind: 'speak2', nd: 0, title: 'Speaking Part 2 ...',
     text: the cue card heading }, so it also shows in My recordings. Up to ER.MAX (20) takes are kept for Echo and Speaking together; the oldest goes first.
     Review measures the take on the device only (OfflineAudioContext.decodeAudioData, after the talk, never during playback): SPC.analyse(samples, rate) finds the
     stretches of speech by loudness, the pauses between them (a LONG pause is 2 s or more, never counting the silence before the first word or after the
     last) and an ESTIMATE of pace: peaks of loudness are counted as syllables, 1.4 syllables = 1 word. It is a guide, not a grade. No speech
     recognition, no network. If the browser cannot decode the take, time and playback still work and the panel says pace is not available.
     Without a microphone (blocked, none, busy, old browser) the learner may "Speak without recording": same timer, no take, no pace.
     Part 3: three follow-up questions for the card's kind are listed in the Review to answer out loud (nothing is recorded for them).
     Cue cards: SPC.TPL (6 templates: character, place, moment, book, lesson, word). {book} is filled with the open book's title ("the story" if none).
     The link chip names the book and the chapter reached (QG.furthest, same spoiler rule as 169g/169q; no chapter reached yet = the book only).
     Which template: SPC.pick(n), n = number of cards shown so far (rotates, so the next card differs).
     Log: IE.log('s') (169o) once per talk that lasted 30 s or more (SPC.COUNT_S); a shorter talk is not counted and the panel says so kindly.
     Storage: ONE small key. wt:speak2 = { v: 1, n }  n = cards shown (this device only: not synced, not in backups; lazy clean, missing = 0).
       The recordings are in IndexedDB (169i), the Speaking session count is in wt:ielts (169o, already synced).
     Opening pauses the book audio (the microphone would hear it); it is not started again. Nothing runs at start-up; playback never depends on this file.
     API (later tasks call these):
       SPK.start(ctx)   ctx = { bookId, chapter } like TMR.start. Promise -> true when the screen opened     SPK.close()   SPK.on   SPK.mode()
       SPK.current()    copy of { cue, notes, mode, dur }, or null          SPK.KEY
       Pure rules (SPC, between SPC-START/END): TPL, PREP, TALK, LONG_PAUSE, COUNT_S, pick, fill, left, fmt, analyse, paceWord, clean.
     Test: node tools/speaking_part2_check.js   (pure rules, wiring, then real Chromium with a fake microphone: prep, speak, stop, review)
     Registered in the Learn hub (169b) as the tile "Speaking Part 2" (order 37). Styles 94y-speaking-part2.css (frame, panel, buttons reuse .rl*, .wl*).
     To go back: remove this file, 94y-speaking-part2.css, their build.py lines, the SPK lines in 270 (histLayers, histBack) and the strings
     marked "speaking part 2" in src/i18n/bn.json. */
  /* SPC-START */
  const SPC = (() => {
    const PREP = 60, TALK = 120, LONG_PAUSE = 2, COUNT_S = 30, MIN_EST_S = 20, SYL_WORD = 1.4, KEY_MAX = 1e6;
    const TPL = [
      { id: 'character', head: 'Describe a character from a book you enjoyed.', pts: ['who the character is', 'what happens in {book}', 'why you liked this character'], tail: 'and explain how the character changed.',
        q: ['Why do people enjoy stories about characters who change?', 'Do you think children can learn from characters in books?', 'How are characters in books different from people in real life?'] },
      { id: 'place', head: 'Describe a place from a book you have read.', pts: ['where the place is', 'what happens there in {book}', 'how the place is described'], tail: 'and explain why this place is important to the story.',
        q: ['Why do some people like to visit places they have read about?', 'How can a book make a reader feel that they are in a place?', 'Do you think films show places better than books? Why?'] },
      { id: 'moment', head: 'Describe an exciting moment in a story you know.', pts: ['what the moment is', 'where it happens in {book}', 'who is there'], tail: 'and explain how you felt when you read or heard it.',
        q: ['Why do people like stories with exciting moments?', 'Is it better to read a book or to listen to it? Why?', 'How do stories help people to understand their feelings?'] },
      { id: 'book', head: 'Describe a book you would recommend to a friend.', pts: ['what the book is, for example {book}', 'what kind of book it is', 'who would enjoy it'], tail: 'and explain why you would recommend it.',
        q: ['What kinds of books are popular in your country?', 'Do you think people read less than they did in the past? Why?', 'How can parents help children to enjoy reading?'] },
      { id: 'lesson', head: 'Describe something you learned from a book or story.', pts: ['what you learned', 'which part of {book} taught you this', 'when you first understood it'], tail: 'and explain how it has helped you.',
        q: ['Can stories teach people about life? How?', 'What can people learn from old books that they cannot learn from new ones?', 'Should schools ask students to read more books? Why?'] },
      { id: 'word', head: 'Describe a new word or phrase you learned from a book.', pts: ['what the word or phrase is', 'where you met it in {book}', 'what it means'], tail: 'and explain how you will remember it.',
        q: ['What is the best way to learn new words?', 'Does reading help people to speak better? How?', 'Why do some people find a second language hard to learn?'] }
    ];
    const int = v => (typeof v === 'number' && isFinite(v) && v > 0) ? Math.floor(v) : 0;
    const pick = n => TPL[int(n) % TPL.length];
    /* the card for a template: the {book} words filled in ("the story" when no title is known) */
    function fill(t, book) {
      const b = String(book == null ? '' : book).replace(/\s+/g, ' ').trim().slice(0, 80), sub = s => s.replace(/\{book\}/g, b || 'the story');
      return { id: t.id, head: t.head, pts: t.pts.map(sub), tail: t.tail, q: t.q.slice() };
    }
    /* whole seconds left (rounded up), never below 0, never above total */
    const left = (end, now, total) => { const e = Number(end), n = Number(now); if (!isFinite(e) || !isFinite(n)) return 0; return Math.max(0, Math.min(total, Math.ceil((e - n) / 1000))); };
    const fmt = sec => { const s = int(sec); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
    const paceWord = w => (w > 0 ? (w < 90 ? 'slow' : w <= 170 ? 'steady' : 'fast') : '');
    const clean = v => ({ v: 1, n: (v && typeof v === 'object' && int(v.n) && int(v.n) < KEY_MAX) ? int(v.n) : 0 });
    /* runs of true in a boolean array: [ [a, b) ... ] */
    function runs(v) { const o = []; let a = -1; for (let i = 0; i <= v.length; i++) { const t = i < v.length && v[i]; if (t && a < 0) a = i; else if (!t && a >= 0) { o.push([a, i]); a = -1; } } return o; }
    /* One take in (mono samples, sample rate), what we can say about it out. Loudness in 25 ms frames; a frame is speech when it is clearly above the
       room's own noise level; blips under 75 ms are dropped and gaps up to 200 ms are closed. Returns null when there is under a second of sound.
       { dur, quiet, speech (s), first, last (s), nLong, longest (s), long: [ { at, len } ], syl, words, wpm (0 when under 20 s of speech) } */
    function analyse(x, rate) {
      if (!x || !x.length || !(rate > 0)) return null;
      const F = Math.max(1, Math.round(rate * 0.025)), n = Math.floor(x.length / F), fd = F / rate, dur = x.length / rate;
      if (n < 40) return null;
      const e = new Float32Array(n);
      for (let i = 0; i < n; i++) { let s = 0; const a = i * F; for (let k = 0; k < F; k++) { const q = x[a + k]; s += q * q; } e[i] = Math.sqrt(s / F); }
      const srt = Array.prototype.slice.call(e).sort((a, b) => a - b), floor = srt[Math.floor(n * 0.1)], peak = srt[Math.floor(n * 0.95)];
      const none = { dur, quiet: true, speech: 0, first: 0, last: 0, nLong: 0, longest: 0, long: [], syl: 0, words: 0, wpm: 0 };
      if (peak < 0.003) return none;
      const thr = Math.max(floor * 2.5, peak * 0.12, 0.002);
      let v = Array.prototype.map.call(e, q => q > thr);
      runs(v).forEach(([a, b]) => { if (b - a < 3) for (let i = a; i < b; i++) v[i] = false; });   // blips
      let r = runs(v);
      for (let k = 0; k + 1 < r.length; k++) if (r[k + 1][0] - r[k][1] <= 8) for (let i = r[k][1]; i < r[k + 1][0]; i++) v[i] = true;   // short gaps
      r = runs(v);
      if (!r.length) return none;
      const first = r[0][0] * fd, last = r[r.length - 1][1] * fd; let speech = 0; r.forEach(([a, b]) => { speech += (b - a) * fd; });
      const long = []; for (let k = 0; k + 1 < r.length; k++) { const len = (r[k + 1][0] - r[k][1]) * fd; if (len >= LONG_PAUSE) long.push({ at: Math.round(r[k][1] * fd * 10) / 10, len: Math.round(len * 10) / 10 }); }
      const sm = new Float32Array(n); for (let i = 0; i < n; i++) sm[i] = ((e[i - 1] || 0) + 2 * e[i] + (e[i + 1] || 0)) / 4;
      const pk = [];   // loudness peaks inside speech: one per syllable, a shallow dip does not split a peak
      for (let i = 1; i < n - 1; i++) {
        if (!v[i] || sm[i] < thr * 1.5 || sm[i] < sm[i - 1] || sm[i] <= sm[i + 1]) continue;
        let top = true; for (let j = Math.max(0, i - 3); j <= Math.min(n - 1, i + 3); j++) if (sm[j] > sm[i]) { top = false; break; }
        if (!top) continue;
        const q = pk.length ? pk[pk.length - 1] : -1;
        if (q < 0) { pk.push(i); continue; }
        let valley = Infinity; for (let j = q; j <= i; j++) valley = Math.min(valley, sm[j]);
        if (i - q < 4 || valley > 0.8 * Math.min(sm[q], sm[i])) { if (sm[i] > sm[q]) pk[pk.length - 1] = i; } else pk.push(i);
      }
      const syl = pk.length, words = Math.round(syl / SYL_WORD), span = last - first;
      return { dur, quiet: false, speech, first, last, nLong: long.length, longest: long.reduce((m, p) => Math.max(m, p.len), 0), long, syl, words, wpm: span >= MIN_EST_S && words ? Math.round(words * 60 / span) : 0 };
    }
    return { TPL, PREP, TALK, LONG_PAUSE, COUNT_S, MIN_EST_S, pick, fill, left, fmt, analyse, paceWord, clean };
  })();
  /* SPC-END */

  const SPK = (() => {
    const KEY = 'wt:speak2', NS = 'http://www.w3.org/2000/svg', CIRC = 2 * Math.PI * 34;
    const L = { on: false, root: null, mode: '', cue: null, opener: null, gen: 0, busy: false, prepEnd: 0, talkStart: 0, talkEnd: 0, dur: 0, timer: 0, stopT: 0, force: 0, said: -1,
      stream: null, mr: null, chunks: [], mime: '', recording: false, drop: false, take: null, recId: '', play: null, logged: false, ctx: null,
      tEl: null, arc: null, live: null, msg: null, notes: null, stage: null, steps: [], row: null, extra: null, foot: null, scroll: null, hd: null, bt: '', ch: -1 };
    const now = () => Date.now();
    const load = () => { let v = null; try { v = store.get(KEY, null); } catch (e) { v = null; } return SPC.clean(v); };
    const bump = () => { const s = load(); s.n += 1; try { store.set(KEY, s); } catch (e) { /* the card is still shown */ } return s.n - 1; };
    const svg = (tag, a) => { const e = document.createElementNS(NS, tag); Object.keys(a || {}).forEach(k => e.setAttribute(k, a[k])); return e; };
    const MSG = {
      unsupported: 'Recording is not supported in this browser.',
      denied: 'The microphone is blocked. Allow it in your browser settings, then try again.',
      none: 'No microphone was found on this device.',
      busy: 'The microphone is busy in another app. Close that app and try again.',
      other: 'Could not start recording. Try again.',
      empty: 'Nothing was recorded. Try again.',
      saved: 'Saved on this device only. Nothing is uploaded.',
      savedDrop: 'Saved on this device only. Your oldest recording was removed (up to 20 are kept).',
      nosave: 'Could not save this recording on this device. You can still play it now.',
      play: 'Could not play the recording.',
      measuring: 'Looking at your recording…',
      nopace: 'Not available in this browser.',
      quiet: 'The recording was very quiet. Check the microphone.',
      short: 'Too short to estimate.',
      norec: 'You spoke without recording, so there is no pace or pause check this time.',
      prepOver: 'Preparation time is over. Start speaking when you are ready.',
      counted: 'Counted as a Speaking session.',
      notCounted: 'Under 30 seconds, so it was not counted this time. Try a little longer next time.'
    };

    /* ----- the clock: always worked out from the start and end times, never counted ----- */
    function paintTime(sec, total) {
      const t = SPC.fmt(sec); if (L.tEl && L.tEl.textContent !== t) L.tEl.textContent = t;
      if (L.arc) L.arc.setAttribute('stroke-dashoffset', String(CIRC * (1 - Math.max(0, Math.min(1, sec / total)))));
    }
    function say(sec) {   // a short spoken note at a few moments only (not every second)
      const th = L.mode === 'prep' ? (sec <= 0 ? 0 : -1) : L.mode === 'speak' ? (sec <= 0 ? 0 : sec <= 10 ? 10 : sec <= 60 ? 60 : -1) : -1;
      if (th === L.said) return; L.said = th;
      if (L.live && th >= 0) L.live.textContent = th === 0 ? (L.mode === 'prep' ? MSG.prepOver : 'Time is up') : th === 10 ? '10 seconds left' : '1 minute left';
    }
    function sync() {
      if (!L.on) return;
      if (L.mode === 'prep') { const s = SPC.left(L.prepEnd, now(), SPC.PREP); paintTime(s, SPC.PREP); say(s); if (s <= 0) readyLook(); }
      else if (L.mode === 'speak') {
        const s = SPC.left(L.talkEnd, now(), SPC.TALK); paintTime(s, SPC.TALK); say(s);
        if (now() >= L.talkEnd) endTalk();
      }
    }
    function stopTick() { if (L.timer) { clearInterval(L.timer); L.timer = 0; } }
    function startTick() { stopTick(); if (L.on && !document.hidden && (L.mode === 'prep' || L.mode === 'speak')) L.timer = setInterval(sync, 250); }
    function onVis() { if (!L.on) return; if (document.hidden) stopTick(); else { startTick(); sync(); } }
    const onWake = () => { if (L.on) sync(); };
    const onKey = ev => { if (L.on && ev.key === 'Escape') { ev.stopPropagation(); close(); } };   // Escape works wherever the focus is, also after a button was replaced
    function listen(on) {
      const f = on ? 'addEventListener' : 'removeEventListener';
      document[f]('visibilitychange', onVis); document[f]('keydown', onKey); window[f]('pageshow', onWake); window[f]('focus', onWake); window[f]('resize', onWake); window[f]('orientationchange', onWake);
    }

    /* ----- screen parts ----- */
    const STAGE = ['1 Prep', '2 Speak', '3 Review'], SHORT = { prep: 0, speak: 1, review: 2 };
    function paintStage() {
      const i = SHORT[L.mode] == null ? 0 : SHORT[L.mode];
      L.stage.textContent = STAGE[i];
      L.steps.forEach((s, k) => { s.classList.toggle('is-on', k === i); if (k === i) s.setAttribute('aria-current', 'step'); else s.removeAttribute('aria-current'); });
    }
    function build() {
      const c = L.cue; L.root.textContent = '';
      L.tEl = h('span', { class: 'sk-time' }, SPC.fmt(SPC.PREP));
      L.live = h('p', { class: 'tr-live', role: 'status' });
      L.stage = h('span', { class: 'sk-stage' }, STAGE[0]);
      L.hd = h('h1', { class: 'tr-h', id: 'sk-title', tabindex: '-1' }, 'Speaking · Part 2');
      L.root.append(h('header', { class: 'rl__top' },
        h('button', { class: 'rl__x', type: 'button', 'aria-label': 'Close Speaking Part 2', onclick: close }, '✕'), L.hd, L.stage), L.live);
      const card = h('section', { class: 'sk-card', lang: 'en', translate: 'no', 'aria-labelledby': 'sk-head' },
        h('h2', { class: 'sk-head', id: 'sk-head' }, c.head), h('p', { class: 'sk-say' }, 'You should say:'),
        h('ul', { class: 'sk-pts' }, ...c.pts.map(t => h('li', {}, t))), h('p', { class: 'sk-tail' }, c.tail));
      const link = h('p', { class: 'sk-link' }, h('span', { 'aria-hidden': 'true' }, '\u{1F4D6}'), h('span', { translate: 'yes' }, 'Linked to'),
        h('span', { translate: 'no' }, [L.bt, L.ch >= 0 ? 'Ch. ' + (L.ch + 1) : ''].filter(Boolean).join(' · ')));
      L.arc = svg('circle', { cx: 40, cy: 40, r: 34, fill: 'none', 'stroke-width': 9, 'stroke-linecap': 'round', class: 'sk-arc', 'stroke-dasharray': CIRC.toFixed(2), 'stroke-dashoffset': '0', transform: 'rotate(-90 40 40)' });
      const ring = h('div', { class: 'sk-ring', role: 'timer', 'aria-label': 'Time left' });
      const sv = svg('svg', { viewBox: '0 0 80 80', width: 104, height: 104, 'aria-hidden': 'true', focusable: 'false' });
      sv.append(svg('circle', { cx: 40, cy: 40, r: 34, fill: 'none', 'stroke-width': 9, class: 'sk-track' }), L.arc); ring.append(sv, L.tEl);
      L.notes = h('textarea', { class: 'sk-notes', rows: 4, maxlength: 600, placeholder: '• Jot down a few words', 'aria-label': 'Your notes' });
      L.row = h('div', { class: 'sk-row' }, ring, h('div', { class: 'sk-notebox' }, h('label', { class: 'sk-lab', for: 'sk-notes' }, 'Your notes'), L.notes));
      L.notes.id = 'sk-notes';
      L.steps = STAGE.map(s => h('li', { class: 'sk-step' }, s));
      L.msg = h('p', { class: 'sk-msg', role: 'status' });
      L.extra = h('div', { class: 'sk-extra' });
      L.scroll = h('div', { class: 'rl__scroll' }, h('div', { class: 'rl__main sk-main' }, card, link, L.row, h('ol', { class: 'sk-steps', 'aria-label': 'Steps' }, ...L.steps), L.msg, L.extra));
      L.foot = h('footer', { class: 'rl__foot' }); L.root.append(L.scroll, L.foot);
    }
    const setMsg = m => { if (L.msg) L.msg.textContent = m || ''; };
    function footPrep(extra) {
      L.foot.textContent = '';
      L.foot.append(h('button', { class: 'wl-btn wl-btn--block wl-btn--primary sk-go', type: 'button', onclick: startTalk }, h('span', { 'aria-hidden': 'true' }, '\u{1F3A4}'), h('span', {}, 'Start speaking now')));
      if (extra) L.foot.append(h('button', { class: 'wl-btn wl-btn--block wl-btn--secondary sk-alt', type: 'button', onclick: () => beginTalk(false) }, 'Speak without recording'));
      L.foot.append(h('p', { class: 'sk-lock' }, h('span', { 'aria-hidden': 'true' }, '\u{1F512}'), h('span', {}, 'Recording stays on this device')));
    }
    function readyLook() { if (L.foot) L.foot.classList.add('is-ready'); }   // the button gets a calm glow; nothing starts by itself
    function footSpeak(rec) {
      L.foot.textContent = '';
      L.foot.append(h('button', { class: 'wl-btn wl-btn--block wl-btn--primary sk-go', type: 'button', onclick: () => endTalk() }, 'I’m finished'));
      try { L.foot.querySelector('.sk-go').focus({ preventScroll: true }); } catch (e) { /* ignore */ }
      L.foot.append(h('p', { class: 'sk-lock' }, h('span', { 'aria-hidden': 'true' }, rec ? '\u{1F534}' : '\u{1F4AC}'), h('span', {}, rec ? 'Recording' : 'Not recording')));
    }
    function drawPrep() {   // screen 1 (also used to come back here after "nothing was recorded")
      L.mode = 'prep'; L.said = -1; L.row.hidden = false; L.extra.textContent = ''; paintStage();
      const s = SPC.left(L.prepEnd, now(), SPC.PREP); paintTime(s, SPC.PREP); if (s <= 0) readyLook(); footPrep(false); startTick();
    }

    /* ----- the talk: microphone on the tap, a recorder, the exact end ----- */
    function release() { const s = L.stream; L.stream = null; if (s) { try { s.getTracks().forEach(t => t.stop()); } catch (e) { /* ignore */ } } }
    function noMic(kind) { setMsg(MSG[kind] || MSG.other); footPrep(true); const b = L.foot.querySelector('.sk-alt'); if (b) b.focus(); }
    async function startTalk() {
      if (L.mode !== 'prep' || L.busy) return;
      L.busy = true; stopPlay(); setMsg('');
      if (!ERC.supported(navigator, window)) { L.busy = false; noMic('unsupported'); return; }
      const gen = ++L.gen; let stream;
      try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); }
      catch (e) { L.busy = false; if (gen === L.gen && L.on) noMic(ERC.errKind(e && e.name)); return; }
      L.busy = false;
      if (gen !== L.gen || !L.on || L.mode !== 'prep') { try { stream.getTracks().forEach(t => t.stop()); } catch (e) { /* ignore */ } return; }   // closed while the browser asked
      const mime = ERC.pickType(t => typeof MediaRecorder.isTypeSupported === 'function' && MediaRecorder.isTypeSupported(t));
      let mr;
      try { mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined); }
      catch (e) { try { stream.getTracks().forEach(t => t.stop()); } catch (x) { /* ignore */ } noMic('other'); return; }
      L.stream = stream; L.mr = mr; L.mime = mime; L.chunks = []; L.drop = false;
      mr.ondataavailable = ev => { if (ev.data && ev.data.size) L.chunks.push(ev.data); };
      mr.onstop = () => recDone(mr, gen);
      try { mr.start(); } catch (e) { release(); L.mr = null; noMic('other'); return; }
      L.recording = true;
      stream.getTracks().forEach(t => { t.onended = () => { if (L.recording && L.stream === stream && L.mode === 'speak') endTalk(); }; });   // microphone unplugged
      beginTalk(true);
    }
    function beginTalk(rec) {
      if (L.mode !== 'prep') return;
      L.mode = 'speak'; L.said = -1; L.talkStart = now(); L.talkEnd = L.talkStart + SPC.TALK * 1000; setMsg(''); L.foot.classList.remove('is-ready');
      paintStage(); paintTime(SPC.TALK, SPC.TALK); footSpeak(rec);
      clearTimeout(L.stopT); L.stopT = setTimeout(() => endTalk(), SPC.TALK * 1000);   // the exact end, even when the page is throttled
      startTick();
      if (L.live) L.live.textContent = rec ? 'Recording. Start speaking.' : 'Timer started. Start speaking.';
    }
    function endTalk() {   // the tap on "I'm finished", the 2:00 mark, or the microphone going away
      if (L.mode !== 'speak') return;
      const t1 = now(); L.dur = Math.min(SPC.TALK, Math.max(0, (t1 - L.talkStart) / 1000));
      clearTimeout(L.stopT); L.stopT = 0; stopTick(); L.mode = 'wrap';
      const mr = L.mr;
      if (!mr) { drawReview(null); return; }
      L.recording = false;
      try { if (mr.state !== 'inactive') mr.stop(); else recDone(mr, L.gen); } catch (e) { recDone(mr, L.gen); }
      clearTimeout(L.force); L.force = setTimeout(() => { if (L.mr === mr) recDone(mr, L.gen); }, 1500);   // if the browser never says "stopped"
    }
    function recDone(mr, gen) {
      if (L.mr !== mr) return;   // once only
      clearTimeout(L.force); L.mr = null; L.recording = false; release();
      const chunks = L.chunks, drop = L.drop; L.chunks = [];
      if (drop || !L.on || gen !== L.gen) return;
      if (!chunks.length || L.dur < ERC.MIN_S) { setMsg(MSG.empty); drawPrep(); return; }   // back to the card; the time goes on from where preparation was
      drawReview(new Blob(chunks, { type: mr.mimeType || L.mime || 'audio/webm' }));
    }

    /* ----- measuring (after the talk, on this device, never while the book plays) ----- */
    async function measure(blob) {
      const AC = window.OfflineAudioContext || window.webkitOfflineAudioContext; if (!AC || !blob) return null;   // offline: no sound device, no audio session is touched
      let ac = null;
      try {   // a browser that never answers must not leave "Looking at your recording…" on the screen: give up after 8 s
        ac = new AC(1, 1, 44100); const dec = ac.decodeAudioData(await (blob.arrayBuffer ? blob.arrayBuffer() : new Response(blob).arrayBuffer()));
        const buf = await Promise.race([dec, new Promise((_, no) => setTimeout(() => no(new Error('slow')), 8000))]);
        return SPC.analyse(buf.getChannelData(0), buf.sampleRate);
      } catch (e) { return null; }
      finally { ac = null; }
    }
    function stopPlay() {
      const p = L.play; if (!p) return; L.play = null;
      try { p.a.pause(); } catch (e) { /* gone */ }
      try { URL.revokeObjectURL(p.url); } catch (e) { /* ignore */ }
      const b = L.extra && L.extra.querySelector('.sk-play'); if (b) b.lastChild.textContent = 'Play my recording', b.firstChild.textContent = '▶ ';
    }
    function playToggle() {
      if (L.play) { stopPlay(); return; }
      if (!L.take) return;
      let url = '', a = null;
      try { url = URL.createObjectURL(L.take); a = new Audio(url); } catch (e) { setMsg(MSG.play); return; }
      L.play = { a, url }; const b = L.extra.querySelector('.sk-play'); if (b) { b.firstChild.textContent = '■ '; b.lastChild.textContent = 'Stop'; }
      a.onended = () => { if (L.play && L.play.a === a) stopPlay(); }; a.onerror = () => { stopPlay(); setMsg(MSG.play); };
      const r = a.play(); if (r && r.catch) r.catch(() => { stopPlay(); setMsg(MSG.play); });
    }
    const wordFor = k => ({ slow: 'Slow', steady: 'Steady', fast: 'Fast' })[k] || '';
    const pcs = n => { const s = Math.round(n * 10) / 10; return (s % 1 ? s.toFixed(1) : String(s)); };
    function paintMeasure(res, hadRec) {
      const pace = L.foot.querySelector('.sk-v-pace'), paus = L.foot.querySelector('.sk-v-paus'); if (!pace || !paus) return;
      if (!hadRec) { pace.textContent = '—'; paus.textContent = '—'; return; }
      if (!res) { pace.textContent = MSG.nopace; paus.textContent = MSG.nopace; return; }
      if (res.quiet) { pace.textContent = '—'; paus.textContent = MSG.quiet; return; }
      if (res.wpm) { pace.textContent = ''; pace.append('About ' + res.wpm + ' words a minute', ' · ', h('strong', {}, wordFor(SPC.paceWord(res.wpm)))); } else pace.textContent = MSG.short;
      paus.textContent = res.nLong ? res.nLong + ' over 2 seconds, longest ' + pcs(res.longest) + ' s' : 'None over 2 seconds';
    }

    /* ----- screen 3: review ----- */
    function drawReview(blob) {
      if (!L.on) return;
      L.mode = 'review'; L.said = -1; L.row.hidden = true; L.foot.classList.remove('is-ready'); setMsg(''); paintStage(); stopTick();
      const c = L.cue, counts = L.dur >= SPC.COUNT_S;
      if (counts && !L.logged) { L.logged = true; try { IE.log('s'); } catch (e) { /* the hub is not ready */ } }
      L.take = blob || null; L.recId = '';
      const vrow = (lab, cls, val) => h('div', { class: 'sk-vr' }, h('span', { class: 'sk-vl' }, lab), h('span', { class: 'sk-vv ' + cls }, val));
      L.extra.textContent = '';
      if (blob) {
        const note = h('p', { class: 'sk-msg sk-savenote', role: 'status' }, '');
        const play = h('button', { class: 'wl-btn wl-btn--secondary sk-play', type: 'button', onclick: playToggle }, h('span', { 'aria-hidden': 'true' }, '▶ '), h('span', {}, 'Play my recording'));
        const del = h('button', { class: 'wl-btn wl-btn--secondary sk-del', type: 'button' }, 'Delete');
        del.addEventListener('click', async () => {
          stopPlay(); if (L.recId) { try { await ER.remove(L.recId); } catch (e) { /* ignore */ } }
          L.take = null; L.recId = ''; card.remove(); note.textContent = 'Deleted from this device.';
        });
        const card = h('div', { class: 'wl-card sk-mine' }, h('p', { class: 'sk-lab' }, 'Your recording'), h('div', { class: 'sk-mineb' }, play, del), note);
        L.extra.append(card);
        const meta = { dur: L.dur, nd: 0, kind: 'speak2', book: L.bid, title: 'Speaking Part 2 · ' + L.bt, sec: '', sid: '', text: c.head };
        ER.saveBlob(blob, meta).then(r => { if (r) L.recId = r.rec.id; if (!L.on || !card.isConnected) { if (r && !card.isConnected) ER.remove(r.rec.id); return; } note.textContent = r ? (r.dropped ? MSG.savedDrop : MSG.saved) : MSG.nosave; });
      }
      L.extra.append(h('section', { class: 'sk-p3', 'aria-labelledby': 'sk-p3h' }, h('h2', { class: 'sk-p3h', id: 'sk-p3h' }, 'Part 3 · Follow-up questions'),
        h('p', { class: 'sk-note' }, 'Answer out loud, one at a time. Nothing is recorded for these.'),
        h('ol', { class: 'sk-qs', lang: 'en', translate: 'no' }, ...c.q.map(q => h('li', { class: 'wl-card sk-q' }, q)))));
      L.foot.textContent = '';
      L.foot.append(h('div', { class: 'wl-panel wl-panel--dock rl__panel sk-panel', role: 'status' },
        h('div', { class: 'wl-panel__head' }, h('span', { class: 'wl-panel__icon', 'aria-hidden': 'true' }, '\u{1F389}'), h('h2', { class: 'wl-panel__title' }, 'Talk finished')),
        h('div', { class: 'sk-vals' }, vrow('Time', 'sk-v-time', SPC.fmt(Math.round(L.dur)) + ' of ' + SPC.fmt(SPC.TALK)),
          vrow('Pace', 'sk-v-pace', blob ? MSG.measuring : '—'), vrow('Long pauses', 'sk-v-paus', blob ? MSG.measuring : '—')),
        h('p', { class: 'wl-panel__text' }, blob ? 'Pace is an estimate, a guide and not a grade.' : MSG.norec),
        h('p', { class: 'wl-panel__text' }, counts ? MSG.counted : MSG.notCounted),
        h('p', { class: 'wl-panel__text sk-ielts' }, 'IELTS-style practice. There is no score.'),
        h('button', { class: 'wl-btn wl-btn--block wl-btn--primary', type: 'button', onclick: close }, 'Done')));
      try { L.foot.querySelector('.wl-btn--primary').focus(); } catch (e) { /* ignore */ }
      if (blob) { const gen = L.gen; measure(blob).then(res => { if (L.on && gen === L.gen && L.mode === 'review') paintMeasure(res, true); }); } else paintMeasure(null, false);
      try { LearnHub.refresh(); } catch (e) { /* hub not ready */ }
    }

    /* ----- open and close ----- */
    function open() {
      if (!L.root) {
        L.root = h('div', { class: 'rl qs sk', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'sk-title', hidden: true });
        document.body.append(L.root);
      }
      L.on = true; L.opener = document.activeElement; L.root.hidden = false; listen(true); histSoon();
    }
    async function start(ctx) {
      if (L.on) return true;
      let c = ctx; try { if (!c || c.bookId == null) c = LB.ctx(); } catch (e) { c = null; }
      if (!c || !S.book || String(S.book.id) !== String(c.bookId)) { toast('Open a book to make a cue card from it.', 2200); return false; }
      let far = -1; try { if (S.model) far = QG.furthest(S.lp, S.map, S.span); } catch (e) { far = -1; }
      try { const k = S.model && S.model.sents[S.curId]; if (k && !k.h && Number.isInteger(k.ch)) far = Math.max(far, k.ch); } catch (e) { /* no position yet */ }
      let ch = -1; if (far >= 0) ch = (typeof c.chapter === 'number' && c.chapter >= 0 && c.chapter <= far) ? c.chapter : far;
      const bt = S.book.title || '';
      try { if (!audio.paused) audio.pause(); } catch (e) { /* nothing is playing */ }   // the microphone would hear the book
      Object.assign(L, { bid: String(S.book.id), bt, ch, cue: SPC.fill(SPC.pick(bump()), bt), gen: L.gen + 1, busy: false, dur: 0, take: null, recId: '', logged: false, said: -1, recording: false, drop: false, mr: null, chunks: [], mode: 'prep' });
      open(); build(); L.prepEnd = now() + SPC.PREP * 1000; drawPrep(); sync(); try { L.hd.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
      return true;
    }
    function close() {
      if (!L.on) return;
      L.on = false; L.gen++; stopTick(); clearTimeout(L.stopT); clearTimeout(L.force); listen(false); stopPlay();
      if (L.mr) { L.drop = true; const mr = L.mr; try { if (mr.state !== 'inactive') mr.stop(); } catch (e) { /* ignore */ } L.mr = null; }
      L.recording = false; release(); L.chunks = []; L.take = null; L.root.hidden = true; L.mode = '';
      try { LearnHub.refresh(); } catch (e) { /* hub not ready */ }
      histSoon(); if (L.opener && L.opener.isConnected) L.opener.focus();
    }
    const current = () => L.on ? { cue: JSON.parse(JSON.stringify(L.cue)), notes: L.notes ? L.notes.value : '', mode: L.mode, dur: L.dur } : null;
    return { start, close, current, KEY, mode: () => L.mode, get on() { return L.on; } };
  })();

  LearnHub.register({
    id: 'speaking2', order: 37, icon: '\u{1F3A4}', title: 'Speaking Part 2',
    subtitle: () => 'A cue card, a timer, your voice',
    playerSubtitle: 'Talk about this book for two minutes',
    open: c => { SPK.start(c); }
  });
