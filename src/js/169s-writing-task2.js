  /* ---------- Writing Task 2: prompt, editor, 40-minute timer, word counter (WT2, WRC; Task 63) ----------
     IELTS-style practice (it says so on the screen; it is not the exam and gives NO score). A full-screen practice like Timed reading (169q).
     Screens in one frame: 1 Start (a prompt card, theme chips, Another prompt, Start writing)  2 Write (timer, prompt, editor, word counter,
     what you used)  3 Finished (feedback panel at the bottom: words, time, whether it counted). Calm: no lives, no score, no leaderboard.
     At 0:00 the screen only says so; the text stays editable and nothing is taken away.
     Prompts: WRC.PROMPTS, 16 original Task 2 questions written for Wordtrail, each linked to a common theme (WRC.THEMES). No network, no book needed.
     TIMER IS A CLOCK TIME, NEVER COUNTED: the draft stores its own start and end (Date.now); the screen only DRAWS the time left from them while
     visible, so rotating the phone, switching apps or closing and opening the app keep it (same idea as 169q/169r).
     Editor: a plain textarea over a mirror layer (same font and wrapping). The mirror draws a blue line under Academic Word List words and a gold mark
     on linking words (data and matching come from AWC in 161f; the Settings switches for the reader do not apply here, this is a practice screen).
     The mirror and the counters are redrawn 400 ms after the last key, never on every key. Nothing runs at start-up; playback is never touched.
     Used words, under the counter: academic words (distinct word families), linking words, and entries of My Words (WS, 147; exact word or a simple
     form: -s -es -ed -d -ing, y to ies/ied; saved phrases must appear as written). My Words is only read, never changed.
     Draft: autosaved 500 ms after the last key, and at once when the page is hidden or closed. Closing the screen keeps the draft.
     Storage: ONE key. wt:writing = { v: 1, n, d } n = prompts shown (for rotating), d = the draft or absent:
       d = { pid, text, start, end, mins, fin, logged, sc }   sc = ticked self-check box ids (169v; missing = none)   pid = prompt id, text = the essay (max 20,000 characters), start/end = clock ms,
       mins = 40, fin = 1 once Finish was tapped, logged = 1 once the Writing session was counted. Device only: not synced, not in backups.
       Lazy clean: anything with the wrong shape is ignored, nothing is deleted from other keys.
     Log: IE.log('w') (169o) once per essay with 100 or more words when Finish is tapped (WRC.COUNT_W); a shorter one is not counted and the panel says so.
     API (later tasks call these):
       WT2.start(ctx)    ctx is not needed (no book). Returns true when the screen opened; it resumes a draft in progress
       WT2.close()   WT2.on   WT2.current() -> copy of { pid, prompt, text, words, start, end, mins, fin } or null   WT2.saved() -> draft in progress or null
       WT2.KEY
       Pure rules (WRC, between WRC-START/END): PROMPTS, THEMES, MINS, MIN_WORDS, COUNT_W, countWords, left, fmt, pick, byTheme, forms, analyse, clean.
     Test: node tools/writing_task2_check.js   (pure rules and wiring)
     Registered in the Learn hub (169b) as the tile "Writing Task 2" (order 38) and as the main Writing button in the IELTS skill sheet (TOOL in 169o).
     Styles 94z-writing-task2.css (frame, panel, buttons reuse .rl*, .wl*, .tr-*).
     To go back: remove this file, 94z-writing-task2.css, their build.py lines, the WT2 lines in 270 (histLayers, histBack), the 'writing' entry in TOOL (169o)
     and the strings marked "writing task 2" in src/i18n/bn.json. */
  /* WRC-START */
  const WRC = (() => {
    const MINS = 40, MIN_WORDS = 250, COUNT_W = 100, MAX_TEXT = 20000;
    const THEMES = [
      { id: 'books', name: 'Books and reading' }, { id: 'education', name: 'Education' }, { id: 'technology', name: 'Technology' },
      { id: 'environment', name: 'Environment' }, { id: 'health', name: 'Health' }, { id: 'work', name: 'Work' },
      { id: 'society', name: 'Society and crime' }, { id: 'family', name: 'Family' }, { id: 'culture', name: 'Culture' },
      { id: 'travel', name: 'Travel' }, { id: 'money', name: 'Money' }
    ];
    const OP = 'Opinion', DI = 'Discussion', PS = 'Problem and solution', PN = 'Positive or negative', AD = 'Advantages and disadvantages';
    const PROMPTS = [
      { id: 'b1', theme: 'books', kind: OP, text: 'Some people think reading fiction is a waste of time. To what extent do you agree or disagree?' },
      { id: 'b2', theme: 'books', kind: PN, text: 'Many people now listen to audiobooks instead of reading printed books. Is this a positive or a negative development?' },
      { id: 'e1', theme: 'education', kind: OP, text: 'Some people believe that schools should teach practical skills rather than academic subjects. To what extent do you agree or disagree?' },
      { id: 'e2', theme: 'education', kind: AD, text: 'Some parents want their children to start learning a foreign language at primary school. What are the advantages and disadvantages of this?' },
      { id: 't1', theme: 'technology', kind: OP, text: 'Some people say that technology has made our lives more complicated. Do you agree or disagree?' },
      { id: 't2', theme: 'technology', kind: PS, text: 'Many people spend several hours a day on their phones. What problems does this cause, and what can be done about them?' },
      { id: 'v1', theme: 'environment', kind: OP, text: 'Some people think that individuals can do little to protect the environment, and that only governments and companies can make a difference. To what extent do you agree or disagree?' },
      { id: 'v2', theme: 'environment', kind: PS, text: 'Cities around the world are becoming more crowded and more polluted. What are the causes of this, and what can be done?' },
      { id: 'h1', theme: 'health', kind: DI, text: 'Some people believe that governments should spend more money on preventing illness than on treating it. Discuss both views and give your own opinion.' },
      { id: 'w1', theme: 'work', kind: AD, text: 'More and more people now work from home. Do the advantages of this outweigh the disadvantages?' },
      { id: 's1', theme: 'society', kind: DI, text: 'Some people think that longer prison sentences are the best way to reduce crime. Others believe there are better ways. Discuss both views and give your own opinion.' },
      { id: 's2', theme: 'society', kind: OP, text: 'Some people think that all young people should do unpaid work for their community. To what extent do you agree or disagree?' },
      { id: 'f1', theme: 'family', kind: PN, text: 'In many countries, young adults now live with their parents for longer than in the past. Is this a positive or a negative development?' },
      { id: 'c1', theme: 'culture', kind: PN, text: 'Some people say that traditional customs are disappearing because of globalisation. Is this a positive or a negative development?' },
      { id: 'r1', theme: 'travel', kind: AD, text: 'International tourism has brought both benefits and problems to many places. Do the benefits outweigh the problems?' },
      { id: 'm1', theme: 'money', kind: OP, text: 'Some people think that children should learn how to manage money at school. To what extent do you agree or disagree?' }
    ];
    const int = v => (typeof v === 'number' && isFinite(v) && v > 0) ? Math.floor(v) : 0;
    const byId = id => PROMPTS.find(p => p.id === id) || null;
    /* the prompts of one theme ('all' or an unknown id = every prompt) */
    const byTheme = t => { const l = PROMPTS.filter(p => p.theme === t); return l.length ? l : PROMPTS.slice(); };
    /* n = prompts shown so far; rotates inside the theme, so the next one differs */
    const pick = (theme, n) => { const l = byTheme(theme); return l[int(n) % l.length]; };
    const TOK = /[\p{L}\p{M}\p{N}]+(?:['’-][\p{L}\p{M}\p{N}]+)*/gu;   // \p{M}: vowel signs of Bengali and similar scripts are part of the word
    const countWords = t => { const m = String(t == null ? '' : t).match(TOK); return m ? m.length : 0; };
    const left = (end, now, total) => { const e = Number(end), n = Number(now); if (!isFinite(e) || !isFinite(n)) return 0; return Math.max(0, Math.min(total, Math.ceil((e - n) / 1000))); };
    const fmt = s => { s = int(s); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
    const norm = s => String(s == null ? '' : s).toLowerCase().replace(/’/g, "'").replace(/\s+/g, ' ').trim();
    /* simple forms of one saved word: the word, -s -es -ed -d -ing, y to ies/ied (a saved phrase is kept as it is) */
    function forms(w) {
      w = norm(w); if (!w) return [];
      if (/\s/.test(w)) return [w];
      const out = new Set([w, w + 's', w + 'es', w + 'ed', w + 'd', w + 'ing']);
      if (/e$/.test(w)) out.add(w.slice(0, -1) + 'ing');
      if (/[^aeiou]y$/.test(w)) { out.add(w.slice(0, -1) + 'ies'); out.add(w.slice(0, -1) + 'ied'); }
      return Array.from(out);
    }
    /* text + data -> what was used. M = AWC.compile(...) or null; saved = list of saved words (any case).
       Returns { words, acad: [ { h, n, c } ], links: [ { l, c } ], mine: [ word ], spans: [ { s, e, k } ] } (k = 'a' academic line, 'l' linking mark; sorted, never overlapping) */
    function analyse(text, M, saved) {
      text = String(text == null ? '' : text).slice(0, MAX_TEXT);
      const out = { words: countWords(text), acad: [], links: [], mine: [], spans: [] };
      if (M && text) {
        const ac = new Map(), lk = new Map(); let pos = 0;
        for (const para of text.split('\n')) {   // matched line by line, so a name rule never reaches across paragraphs
          const m = AWC.match(M, para);
          for (const a of m.acad) { out.spans.push({ s: pos + a.s, e: pos + a.e, k: 'a' }); const o = ac.get(a.h) || { h: a.h, n: a.n, c: 0 }; o.c++; ac.set(a.h, o); }
          for (const l of m.link) { out.spans.push({ s: pos + l.s, e: pos + l.e, k: 'l' }); const w = norm(para.slice(l.s, l.e)); lk.set(w, (lk.get(w) || 0) + 1); }
          pos += para.length + 1;
        }
        out.acad = Array.from(ac.values()).sort((a, b) => b.c - a.c || (a.h < b.h ? -1 : 1));
        out.links = Array.from(lk, ([l, c]) => ({ l, c })).sort((a, b) => b.c - a.c || (a.l < b.l ? -1 : 1));
        out.spans.sort((a, b) => a.s - b.s);
      }
      if (Array.isArray(saved) && saved.length && text) {
        const low = norm(text), toks = new Set((low.match(TOK) || []));
        const seen = new Set();
        for (const w of saved) {
          const base = norm(w); if (!base || seen.has(base)) continue;
          const hit = /\s/.test(base) ? new RegExp("(?<![\\p{L}\\p{N}'-])" + base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + "(?![\\p{L}\\p{N}'-])", 'u').test(low) : forms(base).some(f => toks.has(f));
          if (hit) { seen.add(base); out.mine.push(base); }
        }
        out.mine.sort();
      }
      return out;
    }
    /* a stored draft -> the same draft with safe values, or null */
    function clean(d) {
      if (!d || typeof d !== 'object' || typeof d.pid !== 'string' || !byId(d.pid) || typeof d.text !== 'string') return null;
      const start = Number(d.start), end = Number(d.end);
      if (!isFinite(start) || !isFinite(end) || end <= start) return null;
      return { pid: d.pid, text: d.text.slice(0, MAX_TEXT), start, end, mins: MINS, fin: d.fin ? 1 : 0, logged: d.logged ? 1 : 0, sc: Array.isArray(d.sc) ? d.sc.filter(x => typeof x === 'string').slice(0, 40) : [] };
    }
    return { MINS, MIN_WORDS, COUNT_W, MAX_TEXT, THEMES, PROMPTS, byId, byTheme, pick, countWords, left, fmt, forms, analyse, clean };
  })();
  /* WRC-END */

  const WT2 = (() => {
    const KEY = 'wt:writing';
    const L = { on: false, root: null, mode: '', d: null, theme: 'all', pid: '', timer: 0, opener: null, tEl: null, live: null, said: -1, scroll: null, foot: null,
                ta: null, back: null, cnt: null, acd: null, rows: null, saveT: 0, anT: 0, dirty: false, M: undefined, mine: [], note: null };
    const now = () => Date.now();
    function read() { let v = null; try { v = store.get(KEY, null); } catch (e) { v = null; } return v && typeof v === 'object' ? v : { v: 1, n: 0 }; }
    function write(patch) { try { const c = read(); store.set(KEY, Object.assign({ v: 1, n: 0 }, c, patch)); return true; } catch (e) { return false; /* storage full: the text stays on screen */ } }
    const loadDraft = () => WRC.clean(read().d);
    const saveDraft = () => { if (L.d) write({ d: L.d }); };
    const saved = () => { const d = loadDraft(); return d && !d.fin ? d : null; };
    const dropDraft = () => { try { const c = read(); delete c.d; store.set(KEY, c); } catch (e) { /* nothing to remove */ } };
    function bump() { const n = (read().n | 0) + 1; write({ n }); return n - 1; }

    /* ----- Academic Word List data: read once, the first time it is needed ----- */
    function model() {
      if (L.M === undefined) { try { L.M = AWC.compile(JSON.parse(document.getElementById('awl-data').textContent)); } catch (e) { L.M = null; /* no list: nothing is marked */ } }
      return L.M;
    }
    function loadMine() { try { L.mine = WS.all().map(x => x.w).filter(w => typeof w === 'string'); } catch (e) { L.mine = []; } }

    /* ----- the clock: always worked out from the draft's own start and end, never counted ----- */
    function paintTime(sec) { const t = WRC.fmt(sec); if (L.tEl && L.tEl.textContent !== t) L.tEl.textContent = t; }
    function say(sec) {   // a short spoken note at 5 minutes, 1 minute and the end
      const th = sec <= 0 ? 0 : sec <= 60 ? 60 : sec <= 300 ? 300 : -1;
      if (th === L.said) return; L.said = th;
      if (L.live && th >= 0 && L.mode === 'write') L.live.textContent = th === 0 ? 'Time is up. You can keep writing or finish.' : th === 60 ? '1 minute left' : 'About 5 minutes left';
    }
    function sync() {
      if (!L.on || !L.d) return;
      const left = WRC.left(L.d.end, now(), WRC.MINS * 60);
      paintTime(left); say(left);
    }
    function stopTick() { if (L.timer) { clearInterval(L.timer); L.timer = 0; } }
    function startTick() { stopTick(); if (L.on && L.d && !document.hidden) L.timer = setInterval(sync, 500); }
    function flush() { if (L.saveT) { clearTimeout(L.saveT); L.saveT = 0; } if (L.dirty && L.d && L.ta) { L.d.text = L.ta.value.slice(0, WRC.MAX_TEXT); L.dirty = false; saveDraft(); } }
    function onVis() { if (!L.on) return; if (document.hidden) { stopTick(); flush(); } else { startTick(); sync(); } }
    const onWake = () => { if (L.on) sync(); };
    const onHide = () => { if (L.on) flush(); };
    function listen(on) {
      const f = on ? 'addEventListener' : 'removeEventListener';
      document[f]('visibilitychange', onVis); window[f]('pageshow', onWake); window[f]('focus', onWake); window[f]('resize', onWake); window[f]('orientationchange', onWake); window[f]('pagehide', onHide);
    }

    /* ----- screen parts ----- */
    function frame(secs) {
      L.root.textContent = ''; L.tEl = h('span', { class: 'tr-time' }, WRC.fmt(secs));
      L.live = h('p', { class: 'tr-live', role: 'status' });
      L.hd = h('h1', { class: 'tr-h', id: 'wr-title', tabindex: '-1' }, 'Writing · Task 2');
      L.root.append(h('header', { class: 'rl__top' },
        h('button', { class: 'rl__x', type: 'button', 'aria-label': 'Close Writing Task 2', onclick: close }, '✕'), L.hd,
        h('span', { class: 'tr-timer', role: 'timer', 'aria-label': 'Time left' }, h('span', { 'aria-hidden': 'true' }, '⏱'), L.tEl)), L.live);
      L.scroll = h('div', { class: 'rl__scroll' }); L.foot = h('footer', { class: 'rl__foot' }); L.root.append(L.scroll, L.foot);
    }
    const promptCard = p => h('section', { class: 'wl-card wr-prompt', 'aria-label': 'Question' }, h('p', { class: 'tr-lab' }, p.kind), h('p', { class: 'wr-q' }, p.text));
    function panel(title, lines, btns) {
      L.foot.textContent = '';
      L.foot.append(h('div', { class: 'wl-panel wl-panel--dock rl__panel', role: 'status' },
        h('div', { class: 'wl-panel__head' }, h('span', { class: 'wl-panel__icon', 'aria-hidden': 'true' }, '✍'), h('h2', { class: 'wl-panel__title' }, title)),
        ...lines.map(t => h('p', { class: 'wl-panel__text' }, t)), ...btns));
    }
    const btn = (txt, primary, f) => h('button', { class: 'wl-btn wl-btn--block ' + (primary ? 'wl-btn--primary' : 'wl-btn--secondary'), type: 'button', onclick: f }, txt);

    /* ----- screen 1: choose the question ----- */
    function drawStart() {
      L.mode = 'start'; L.d = null; stopTick(); frame(WRC.MINS * 60);
      const p = WRC.byId(L.pid) || WRC.pick(L.theme, bump()); L.pid = p.id;
      const card = h('div'); const chips = h('div', { class: 'tr-chips wr-themes', role: 'group', 'aria-label': 'Theme' });
      const paint = () => {
        const q = WRC.byId(L.pid); card.textContent = ''; card.append(promptCard(q));
        chips.textContent = '';
        for (const t of [{ id: 'all', name: 'All themes' }].concat(WRC.THEMES)) {
          chips.append(h('button', { type: 'button', class: 'tr-chip wr-theme', 'aria-pressed': String(L.theme === t.id), onclick: () => { L.theme = t.id; L.pid = WRC.pick(t.id, bump()).id; paint(); } }, t.name));
        }
      };
      paint();
      L.scroll.append(card, h('section', { class: 'wl-card tr-info' },
        h('p', { class: 'tr-lab' }, 'Time'), h('p', { class: 'tr-src' }, WRC.MINS + ' minutes'),
        h('p', { class: 'tr-note' }, 'Aim for ' + WRC.MIN_WORDS + ' words. The timer keeps going if you switch apps or close the app. Your draft is saved on this device. IELTS-style practice, no score.')), h('p', { class: 'tr-lab' }, 'Choose a theme'), chips);
      L.foot.append(h('div', { class: 'wr-actions' },
        btn('Another question', false, () => { L.pid = WRC.pick(L.theme, bump()).id; paint(); }),
        btn('Start writing', true, () => startWriting(L.pid))));
      try { L.hd.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
    }

    /* ----- screen 2: write ----- */
    function startWriting(pid) {
      const t = now();
      L.d = { pid, text: '', start: t, end: t + WRC.MINS * 60000, mins: WRC.MINS, fin: 0, logged: 0 };
      saveDraft(); drawWrite(false);
    }
    function mirror() {   // the layer behind the textarea: same text, with the blue lines and gold marks
      const text = L.ta.value.slice(0, WRC.MAX_TEXT), a = WRC.analyse(text, model(), L.mine);
      L.back.textContent = ''; let at = 0;
      for (const s of a.spans) {
        if (s.s < at) continue;
        if (s.s > at) L.back.append(text.slice(at, s.s));
        L.back.append(h('span', { class: s.k === 'a' ? 'wr-acad' : 'wr-link' }, text.slice(s.s, s.e))); at = s.e;
      }
      L.back.append(text.slice(at) + '\n');   // the last newline keeps the layer as tall as the textarea
      paintCounts(a);
    }
    function row(label, items, none) {
      return h('p', { class: 'wr-row' }, h('span', { class: 'wr-row__lab' }, label + ' '), items.length ? h('span', { class: 'wr-row__val' }, items.join(', ')) : h('span', { class: 'wr-row__none' }, none));
    }
    function paintCounts(a) {
      const ok = a.words >= WRC.MIN_WORDS;
      L.cnt.textContent = a.words + ' / ' + WRC.MIN_WORDS + ' words'; L.cnt.className = 'tr-chip wr-count' + (ok ? ' tr-chip--ok' : ' wr-count--part');
      L.acd.textContent = a.acad.length + (a.acad.length === 1 ? ' academic word' : ' academic words');
      L.rows.textContent = '';
      L.rows.append(row('Academic words:', a.acad.map(x => x.h), 'none yet'), row('Linking words:', a.links.map(x => x.l), 'none yet'));
      if (L.mine.length) L.rows.append(row('Used from My Words:', a.mine, 'none yet'));
      else L.rows.append(h('p', { class: 'wr-row' }, h('span', { class: 'wr-row__none' }, 'Words you save in My Words show here when you use them.')));
    }
    function onInput() {
      L.dirty = true;
      if (L.saveT) clearTimeout(L.saveT); L.saveT = setTimeout(() => { L.saveT = 0; flush(); }, 500);
      if (L.anT) clearTimeout(L.anT); L.anT = setTimeout(() => { L.anT = 0; if (L.on && L.mode === 'write') mirror(); }, 400);
    }
    function drawWrite(resumed) {
      L.mode = 'write'; L.said = -1; const d = L.d, p = WRC.byId(d.pid);
      frame(WRC.left(d.end, now(), WRC.MINS * 60)); loadMine();
      L.back = h('div', { class: 'wr-back', 'aria-hidden': 'true' });
      L.ta = h('textarea', { class: 'wr-ta', id: 'wr-ta', 'aria-label': 'Your essay', 'aria-describedby': 'wr-help', spellcheck: 'false', autocomplete: 'off', autocapitalize: 'sentences', rows: 10, maxlength: String(WRC.MAX_TEXT), oninput: onInput });
      L.ta.value = d.text;
      L.ta.addEventListener('scroll', () => { L.back.scrollTop = L.ta.scrollTop; });
      L.cnt = h('span', { class: 'tr-chip wr-count', 'aria-live': 'off' }); L.acd = h('span', { class: 'tr-chip wr-acad-chip' });
      L.rows = h('div', { class: 'wr-rows' });
      L.note = h('p', { class: 'tr-lab', id: 'wr-help' }, 'Saved on this device as you type.');
      L.scroll.append(promptCard(p), h('div', { class: 'wr-editor' }, L.back, L.ta), h('div', { class: 'tr-chips wr-chips' }, L.cnt, L.acd), L.rows, L.note, SCW.card());
      L.foot.append(btn('Finish and self-check', true, finish));
      mirror(); sync();
      if (resumed) L.live.textContent = 'Your draft is back.';
      try { L.ta.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
    }

    /* ----- screen 3: finished ----- */
    function finish() {
      if (!L.d) return;
      L.d.text = L.ta ? L.ta.value.slice(0, WRC.MAX_TEXT) : L.d.text; L.dirty = false;
      const words = WRC.countWords(L.d.text), took = Math.min(WRC.MINS * 60, Math.max(0, Math.round((Math.min(now(), L.d.end) - L.d.start) / 1000)));
      let counted = !!L.d.logged;
      if (!counted && words >= WRC.COUNT_W) { try { IE.log('w'); counted = true; L.d.logged = 1; } catch (e) { /* the hub is not ready: nothing is counted */ } }
      L.d.fin = 1; saveDraft(); stopTick(); L.mode = 'done';
      if (L.ta) L.ta.readOnly = true;
      panel('Essay finished', [
        words + ' words in ' + WRC.fmt(took),
        words >= WRC.MIN_WORDS ? 'You reached ' + WRC.MIN_WORDS + ' words.' : 'Task 2 asks for at least ' + WRC.MIN_WORDS + ' words. Aim a little higher next time.',
        counted ? 'Counted as a Writing session.' : 'Under ' + WRC.COUNT_W + ' words, so it was not counted this time. Try a little longer next time.',
        'Your essay is saved on this device. There is no score.'],
        [btn('New essay', true, newEssay), btn('Keep editing', false, reopen)]);
      SCW.draw(L.scroll, L.d, saveDraft);   // the self-check checklist (169v)
    }
    function reopen() { if (!L.d) return; L.d.fin = 0; saveDraft(); drawWrite(true); startTick(); }
    function newEssay() { dropDraft(); L.d = null; L.pid = ''; drawStart(); }

    /* ----- open and close ----- */
    function open() {
      if (!L.root) {
        L.root = h('div', { class: 'rl qs tr wr', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'wr-title', hidden: true });
        L.root.addEventListener('keydown', ev => { if (ev.key === 'Escape') { ev.stopPropagation(); close(); } });
        document.body.append(L.root);
      }
      Object.assign(L, { on: true, opener: document.activeElement, said: -1 }); L.root.hidden = false; listen(true); histSoon();
    }
    function start() {
      if (L.on) return true;
      const d = loadDraft(); open();
      if (d) { L.d = d; drawWrite(!d.fin); if (d.fin) finish(); else startTick(); }
      else drawStart();
      return true;
    }
    function close() {
      if (!L.on) return;
      flush(); L.on = false; stopTick(); listen(false); L.root.hidden = true; L.mode = ''; L.ta = null; L.d = null;
      try { LearnHub.refresh(); } catch (e) { /* hub not ready */ }
      histSoon(); if (L.opener && L.opener.isConnected) L.opener.focus();
    }
    function current() {
      const d = L.d || loadDraft(); if (!d) return null;
      const text = L.on && L.ta && L.d ? L.ta.value : d.text;
      return { pid: d.pid, prompt: (WRC.byId(d.pid) || {}).text || '', text, words: WRC.countWords(text), start: d.start, end: d.end, mins: d.mins, fin: d.fin };
    }
    return { start, close, current, saved, KEY, get on() { return L.on; } };
  })();

  LearnHub.register({
    id: 'writing', order: 38, icon: '✍', title: 'Writing Task 2',
    subtitle: () => {
      const d = WT2.saved(); if (d) { const s = WRC.left(d.end, Date.now(), WRC.MINS * 60); return s > 0 ? 'Continue: ' + WRC.fmt(s) + ' left' : 'Continue your draft'; }
      return 'A question, a timer, a word counter';
    },
    playerSubtitle: 'Write an essay against the clock',
    open: () => { WT2.start(); }
  });
