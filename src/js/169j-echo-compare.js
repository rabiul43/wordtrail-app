  /* ---------- Echo compare and history: you and the narrator, side by side (ECM, ECX) ----------
     Task 44. Builds on the take card of Echo recording (169i). Nothing here runs unless Echo is open, and nothing runs while the book plays.
     1. Compare. After a take: how long you spoke and how long the narrator took (bars of the same scale), a plain-words pace line
        (close to / a little slower / a little faster than the narrator, with the ratio), and a Narrator button next to Play mine. Your time includes
        any pause before and after you speak, and the page says so. Pace is a comparison of two clock times, never a grade.
     2. What we heard (optional, only when the browser has speech recognition). OFF until the learner turns it on (setting wt:echoheard = "1", this device only).
        The switch comes with the note that the browser maker's service may process the audio. The words are shown as "heard", green when
        the word was found in what the browser returned, orange with "?" when it was not. Orange is "hard to recognise", not "wrong". It says
        "a guide, not a pronunciation grade". Without speech recognition (or with it off) none of this appears and everything else works. Audio and text
        are never sent by this file; the browser does it (the Web Speech API), and only while a take is being recorded.
     3. History and practice list. Key wt:echo (this device only, not synced, not in the backup), lazily read:
          { v: 1, n (takes), sd (s you spoke, all takes), sn (s the narrator took, same takes), days: { "YYYY-MM-DD": takes },
            w: { word: [checked, missed, lastMs] }  (only when "what we heard" was on),
            pl: [ { k: "book|sentence id", book, title, sec, sid, text, t } ]  (practice list, up to 30) }
        Caps: 90 days, 150 words, 30 practice sentences. Unknown fields are kept. Practise opens that sentence when it is in the track Echo is on.
       ECM (pure, between ECM-START/END): pace, tokens, compare, empty, clean, day, addTake, addHeard, problems, weekCount, plHas, plToggle, plRemove
       ECX.history() -> a copy of the stored history       Tested by tools/echo_compare_check.js
     Remove this file, 94r-echo-compare.css, the "ec-cmp"/"ec-sr"/"ec-hist" markup in 28c-sheet-echo.html and the build.py lines to go back (the hooks left in
     169h and 169i do nothing without it). */
  const ECM = (() => {
    /*ECM-START*/
    const LIM = { days: 90, words: 150, pl: 30, heard: 80 };
    const SKIP = new Set(['the', 'and', 'was', 'for', 'that', 'with', 'his', 'her', 'she', 'you', 'but', 'are', 'not', 'had', 'has', 'have', 'this', 'from', 'they', 'were', 'been', 'its', 'who', 'all', 'one', 'out', 'him']);
    /* you / narrator: below 0.8 faster, above 1.4 slower (the take includes the pause before and after speaking, so "close" is wide), otherwise close */
    function pace(dur, nd) {
      if (!(dur > 0) || !(nd > 0)) return { kind: 'none', ratio: 0 };
      const ratio = dur / nd;
      return { kind: ratio < 0.8 ? 'faster' : ratio > 1.4 ? 'slower' : 'close', ratio: Math.round(ratio * 10) / 10 };
    }
    function norm(w) { return String(w).toLowerCase().replace(/[’‘]/g, "'").replace(/^'+|'+$/g, ''); }
    /* words of a text: [ { w (as written, no punctuation), n (lower case) } ] */
    function tokens(text) {
      const m = String(text || '').replace(/[’‘]/g, "'").match(/[\p{L}\p{N}']+/gu) || [];
      return m.map(w => ({ w: w.replace(/^'+|'+$/g, ''), n: norm(w) })).filter(t => t.n);
    }
    /* the same word, allowing a plural or a short ending (horse / horses, walk / walked) */
    function same(a, b) { return a === b || (a.length > 3 && b.length > 3 && Math.abs(a.length - b.length) <= 2 && (a.startsWith(b) || b.startsWith(a))); }
    /* line the heard words up with the sentence (longest common run of words, in order): { items: [ { w, n, ok } ], heard: n of words we heard } or null */
    function compare(expected, heard) {
      const E = tokens(expected).slice(0, LIM.heard), H = tokens(heard).map(t => t.n).slice(0, LIM.heard * 2);
      if (!E.length) return null;
      const n = E.length, m = H.length, L = [];
      for (let i = 0; i <= n; i++) L.push(new Array(m + 1).fill(0));
      for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = same(E[i].n, H[j]) ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
      const ok = new Array(n).fill(false);
      let i = 0, j = 0;
      while (i < n && j < m) { if (same(E[i].n, H[j])) { ok[i] = true; i++; j++; } else if (L[i + 1][j] >= L[i][j + 1]) i++; else j++; }
      return { items: E.map((e, k) => ({ w: e.w, n: e.n, ok: ok[k] })), heard: m };
    }

    function empty() { return { v: 1, n: 0, sd: 0, sn: 0, days: {}, w: {}, pl: [] }; }
    const num = x => (typeof x === 'number' && isFinite(x) && x >= 0 ? x : 0);
    /* anything that was stored (or nothing) -> a safe history; fields it does not know are kept */
    function clean(r) {
      const h = Object.assign({}, r && typeof r === 'object' && !Array.isArray(r) ? r : {});
      h.v = 1; h.n = Math.floor(num(h.n)); h.sd = num(h.sd); h.sn = num(h.sn);
      const d = {}; if (h.days && typeof h.days === 'object') Object.keys(h.days).forEach(k => { if (/^\d{4}-\d\d-\d\d$/.test(k) && num(h.days[k]) > 0) d[k] = Math.floor(num(h.days[k])); }); h.days = d;
      const w = {}; if (h.w && typeof h.w === 'object') Object.keys(h.w).forEach(k => { const a = h.w[k]; if (k && Array.isArray(a) && num(a[0]) >= 0) w[k] = [Math.floor(num(a[0])), Math.floor(num(a[1])), num(a[2])]; }); h.w = w;
      h.pl = (Array.isArray(h.pl) ? h.pl : []).filter(x => x && typeof x.k === 'string' && typeof x.text === 'string').slice(0, LIM.pl);
      return h;
    }
    function day(ms) { const d = new Date(ms), p = x => (x < 10 ? '0' : '') + x; return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); }
    function trimDays(h) { const k = Object.keys(h.days).sort(); k.slice(0, Math.max(0, k.length - LIM.days)).forEach(x => { delete h.days[x]; }); }
    /* one take: counts and times (the pace average uses only takes that have both times) */
    function addTake(h, e, now) {
      h.n++; if (e.dur > 0 && e.nd > 0) { h.sd += e.dur; h.sn += e.nd; }
      const k = day(now); h.days[k] = (h.days[k] || 0) + 1; trimDays(h); return h;
    }
    /* one checked take: items from compare(); short and very common words are not counted (speech recognition often drops them) */
    function addHeard(h, items, now) {
      const seen = new Set();
      (items || []).forEach(it => {
        if (it.n.length < 3 || SKIP.has(it.n) || seen.has(it.n)) return; seen.add(it.n);
        const a = h.w[it.n] || [0, 0, 0]; a[0]++; if (!it.ok) a[1]++; a[2] = now; h.w[it.n] = a;
      });
      const k = Object.keys(h.w);
      if (k.length > LIM.words) k.sort((x, y) => h.w[x][2] - h.w[y][2]).slice(0, k.length - LIM.words).forEach(x => { delete h.w[x]; });
      return h;
    }
    /* words that were hard to recognise at least `min` times and in at least half of the takes where they came up */
    function problems(h, min) {
      min = min > 0 ? min : 2;
      return Object.keys(h.w).filter(k => h.w[k][1] >= min && h.w[k][1] * 2 >= h.w[k][0])
        .sort((a, b) => (h.w[b][1] - h.w[a][1]) || (h.w[b][2] - h.w[a][2]) || (a < b ? -1 : 1)).slice(0, 12).map(k => ({ w: k, m: h.w[k][1], n: h.w[k][0] }));
    }
    function weekCount(h, now) { let s = 0; for (let i = 0; i < 7; i++) s += h.days[day(now - i * 864e5)] || 0; return s; }
    function plHas(h, k) { return h.pl.some(x => x.k === k); }
    /* add or remove; true = now on the list. The 31st sentence pushes out the oldest. */
    function plToggle(h, item, now) {
      if (plHas(h, item.k)) { plRemove(h, item.k); return false; }
      h.pl.unshift(Object.assign({}, item, { t: now })); if (h.pl.length > LIM.pl) h.pl.length = LIM.pl; return true;
    }
    function plRemove(h, k) { h.pl = h.pl.filter(x => x.k !== k); return h; }
    /*ECM-END*/
    return { LIM, pace, tokens, compare, empty, clean, day, addTake, addHeard, problems, weekCount, plHas, plToggle, plRemove };
  })();

  const ECX = (() => {
    const KEY = 'wt:echo', PREF = 'wt:echoheard';
    const q = id => document.getElementById(id);
    const st = { h: null, take: null, sr: null, text: '', err: '', exp: '', srUsed: false, fin: false, res: null, force: 0, gen: 0, narr: false, hist: false, clr: 0 };
    const SRC = () => window.SpeechRecognition || window.webkitSpeechRecognition;
    const MSG = {
      pace: { close: "Close to the narrator's pace.", slower: 'A little slower than the narrator.', faster: 'A little faster than the narrator.' },
      pause: 'Your time includes any pause before and after you speak.',
      wait: 'Working out the words…',
      all: 'We heard every word. This is a guide, not a pronunciation grade.',
      some: 'Orange words were hard to recognise. Try them again slowly. This is a guide, not a pronunciation grade.',
      none: 'We did not hear any words. Try again, a little closer to the microphone.',
      denied: 'The browser did not allow speech recognition. Your recording is not affected.',
      off: 'Speech recognition could not run now. Your recording is saved as usual.',
      noPlay: 'The audio did not start.',
      clr: 'History cleared.', tap: 'Tap again to clear'
    };
    /* ----- storage (this device only) ----- */
    function load() {
      let r = null;   // read fresh each time (a small value, only on a take or when the panel is open), so another tab's changes are not overwritten for long
      try { r = JSON.parse(localStorage.getItem(KEY)); } catch (e) { /* none or damaged: start empty */ }
      return (st.h = ECM.clean(r));
    }
    function save() { try { localStorage.setItem(KEY, JSON.stringify(st.h)); } catch (e) { /* full or blocked: it still works this session */ } }
    const pref = () => { try { return localStorage.getItem(PREF) === '1'; } catch (e) { return false; } };
    function setPref(on) { try { if (on) localStorage.setItem(PREF, '1'); else localStorage.removeItem(PREF); } catch (e) { /* ignore */ } }
    const pkey = c => c.book + '|' + c.id;

    /* ----- the optional switch ----- */
    function paintSw() {
      const box = q('ec-sr'); box.hidden = !SRC();
      const on = pref();
      q('ec-sr-t').setAttribute('aria-pressed', String(on));
      q('ec-sr-l').textContent = on ? 'Show what we heard: on' : 'Show what we heard: off';
    }

    /* ----- speech recognition during a take (the browser does the work; nothing is sent by this file) ----- */
    function reset() {
      clearTimeout(st.force); st.force = 0; st.gen++;
      const s = st.sr; st.sr = null;
      if (s) { s.onresult = s.onerror = s.onend = null; try { s.abort(); } catch (e) { /* gone */ } }
      st.text = ''; st.err = ''; st.exp = ''; st.srUsed = false; st.fin = false;
    }
    function begin(c) {
      if (!pref() || !SRC()) return;
      const gen = st.gen; st.exp = c.text || ''; st.srUsed = true;
      let sr; try { sr = new (SRC())(); } catch (e) { st.err = 'other'; st.fin = true; return; }
      sr.lang = 'en-US'; sr.continuous = true; sr.interimResults = false; sr.maxAlternatives = 1;
      sr.onresult = e => { try { st.text = Array.from(e.results).map(r => (r[0] && r[0].transcript) || '').join(' '); } catch (x) { /* ignore */ } };
      sr.onerror = e => { st.err = (e && e.error) || 'other'; };
      sr.onend = () => { if (st.sr === sr && gen === st.gen) finish(gen); };
      st.sr = sr;
      try { sr.start(); } catch (e) { st.sr = null; st.err = 'other'; st.fin = true; }
    }
    function end(drop) {
      if (drop) { reset(); return; }
      const s = st.sr, gen = st.gen; if (!s) return;
      try { s.stop(); } catch (e) { finish(gen); return; }
      st.force = setTimeout(() => finish(gen), 2500);   // if the browser never says it has finished
    }
    function finish(gen) {
      if (gen !== st.gen || st.fin) return;
      clearTimeout(st.force); st.force = 0;
      const s = st.sr; st.sr = null; if (s) { s.onresult = s.onerror = s.onend = null; try { s.abort(); } catch (e) { /* gone */ } }
      st.fin = true;
      const r = st.text.trim() ? ECM.compare(st.exp, st.text) : null;
      st.res = r;
      if (r && r.items.length) { ECM.addHeard(load(), r.items, Date.now()); save(); }
      paintHeard();
    }
    function paintHeard() {
      const box = q('ec-heard'); if (!st.take || !st.srUsed) { box.hidden = true; return; }
      const ul = q('ec-heard-l'), nt = q('ec-heard-n'); ul.textContent = ''; box.hidden = false;
      if (!st.fin) { nt.textContent = MSG.wait; return; }
      const r = st.res;
      if (!r) {
        const e = st.err;
        nt.textContent = e === 'not-allowed' || e === 'service-not-allowed' ? MSG.denied : (!e || e === 'no-speech') ? MSG.none : MSG.off;
        return;
      }
      let miss = 0;
      r.items.forEach(it => {
        const li = document.createElement('li'); li.className = 'wl-pill ec-hw ' + (it.ok ? 'is-ok' : 'ec-hw--q');
        li.textContent = it.ok ? it.w : it.w + '?'; if (!it.ok) { miss++; li.setAttribute('aria-label', it.w + ', hard to recognise'); }
        ul.appendChild(li);
      });
      nt.textContent = miss ? MSG.some : MSG.all;
    }

    /* ----- compare card ----- */
    function paintTake() {
      const t = st.take, c = t && t.c; if (!t) return;
      const mx = Math.max(t.dur, t.nd, 0.1);
      q('ec-bar-y').style.width = Math.max(4, Math.round(100 * t.dur / mx)) + '%';
      q('ec-bar-n').style.width = Math.max(4, Math.round(100 * t.nd / mx)) + '%';
      const p = ECM.pace(t.dur, t.nd);
      q('ec-pace-w').textContent = p.kind === 'none' ? '' : MSG.pace[p.kind];
      q('ec-pace-x').textContent = p.kind === 'none' ? '' : '×' + p.ratio.toFixed(1);
      q('ec-pace-n').textContent = MSG.pause;
      paintPrac(); paintNarr(); paintHeard();
    }
    function paintPrac() {
      const t = st.take, on = !!(t && t.c && ECM.plHas(load(), pkey(t.c)));
      const b = q('ec-prac'); b.setAttribute('aria-pressed', String(on)); q('ec-prac-l').textContent = on ? 'On practice list' : 'Add to practice list';
    }
    function paintNarr() { q('ec-narr-l').textContent = st.narr ? 'Stop' : 'Narrator'; }
    function stopNarr() { if (st.narr) EM.narrStop(); }
    function onTake(t) {
      st.take = t; t.c = t.c || EM.ctx();
      if (!t.logged) { t.logged = true; ECM.addTake(load(), { dur: t.dur, nd: t.nd }, Date.now()); save(); }
      paintTake();
    }
    function onClear() { stopNarr(); st.narr = false; st.take = null; reset(); q('ec-heard').hidden = true; q('ec-heard-l').textContent = ''; }

    /* ----- History panel (inside the Echo screen) ----- */
    function stat(n, l) {
      const s = document.createElement('span'); s.className = 'ec-stat';
      const b = document.createElement('b'); b.textContent = String(n); const t = document.createElement('span'); t.textContent = l; s.appendChild(b); s.appendChild(t); return s;
    }
    function drawHist() {
      const h = load(), now = Date.now();
      const bx = q('ec-hist-s'); bx.textContent = '';
      bx.appendChild(stat(h.n, 'Takes')); bx.appendChild(stat(h.days[ECM.day(now)] || 0, 'Today')); bx.appendChild(stat(ECM.weekCount(h, now), 'This week'));
      const pp = ECM.pace(h.sd, h.sn), pe = q('ec-hist-p');
      pe.hidden = pp.kind === 'none';
      q('ec-hist-pw').textContent = pp.kind === 'none' ? '' : MSG.pace[pp.kind]; q('ec-hist-px').textContent = pp.kind === 'none' ? '' : '×' + pp.ratio.toFixed(1);
      const pr = ECM.problems(h), ul = q('ec-hist-w'); ul.textContent = '';
      pr.forEach(p => { const li = document.createElement('li'); li.className = 'wl-pill ec-hw ec-hw--q'; li.textContent = p.w + ' ×' + p.m; ul.appendChild(li); });
      q('ec-hist-we').hidden = pr.length > 0;
      q('ec-hist-we').textContent = pref() && SRC() ? 'No problem words yet.' : 'Problem words appear when "Show what we heard" is on.';
      const pl = q('ec-hist-l'); pl.textContent = ''; q('ec-hist-le').hidden = h.pl.length > 0;
      const c = EM.ctx(), here = c && c.book;
      h.pl.forEach(x => pl.appendChild(plRow(x, here)));
    }
    function plRow(x, here) {
      const li = document.createElement('li'); li.className = 'wl-card ec-row';
      const m = document.createElement('div'); m.className = 'ec-row-m';
      const s = document.createElement('p'); s.className = 'ec-row-s'; s.textContent = x.text;
      const i = document.createElement('p'); i.className = 'ec-row-i'; i.textContent = x.title || '';
      m.appendChild(s); m.appendChild(i);
      const bx = document.createElement('div'); bx.className = 'ec-row-b';
      const go = document.createElement('button'); go.type = 'button'; go.className = 'wl-btn wl-btn--secondary wl-btn--small'; go.textContent = 'Practise';
      go.addEventListener('click', () => {
        if (EM.jump(x.sid)) closeHist(false);
        else { q('ec-hist-m').textContent = 'Open this chapter to practise this sentence.'; }
      });
      if (String(x.book) !== String(here)) { go.disabled = true; go.title = 'Open this book to practise this sentence.'; }
      const rm = document.createElement('button'); rm.type = 'button'; rm.className = 'wl-btn wl-btn--secondary wl-btn--small'; rm.textContent = 'Remove';
      rm.addEventListener('click', () => { ECM.plRemove(load(), x.k); save(); drawHist(); paintPrac(); try { q('ec-hist-t').focus({ preventScroll: true }); } catch (e) { /* ignore */ } });
      bx.appendChild(go); bx.appendChild(rm); li.appendChild(m); li.appendChild(bx); return li;
    }
    function openHist() {
      if (!EM.on || ER.recording || st.hist) return;
      EM.hold(); stopNarr(); ER.stopMine(); st.hist = true; q('ec-hist').hidden = false; q('ec-hist-m').textContent = ''; drawHist();
      try { q('ec-hist-t').focus({ preventScroll: true }); } catch (e) { /* ignore */ }
    }
    function closeHist(again) {
      if (!st.hist) return;
      st.hist = false; q('ec-hist').hidden = true; clearTimeout(st.clr); st.clr = 0; q('ec-hist-c').textContent = 'Clear history';
      if (again && EM.on) EM.again();
      try { q('ec-hist-b').focus({ preventScroll: true }); } catch (e) { /* ignore */ }
    }
    function clearAll() {
      if (!st.clr) { q('ec-hist-c').textContent = MSG.tap; st.clr = setTimeout(() => { st.clr = 0; q('ec-hist-c').textContent = 'Clear history'; }, 4000); return; }
      clearTimeout(st.clr); st.clr = 0; q('ec-hist-c').textContent = 'Clear history';
      st.h = ECM.empty(); try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ }
      drawHist(); paintPrac(); q('ec-hist-m').textContent = MSG.clr;
    }

    /* ----- wiring (taps only) ----- */
    q('ec-sr-t').addEventListener('click', () => { setPref(!pref()); paintSw(); });
    q('ec-narr').addEventListener('click', () => {
      if (st.narr) { EM.narrStop(); return; }
      ER.stopMine(); st.narr = true; paintNarr();
      const ok = EM.narr(() => { st.narr = false; paintNarr(); });
      if (!ok) { st.narr = false; paintNarr(); q('ec-take-n').textContent = MSG.noPlay; }
    });
    q('ec-play').addEventListener('click', stopNarr);
    q('ec-prac').addEventListener('click', () => {
      const t = st.take; if (!t || !t.c) return;
      const c = t.c; ECM.plToggle(load(), { k: pkey(c), book: c.book, title: c.title, sec: c.sec, sid: c.id, text: String(c.text || '').slice(0, 240) }, Date.now()); save(); paintPrac();
    });
    q('ec-hist-b').addEventListener('click', openHist);
    q('ec-hist-x').addEventListener('click', () => closeHist(true));
    q('ec-hist-c').addEventListener('click', clearAll);
    ER.use({ begin, end, take: onTake, clear: onClear });
    EM.use({ paint: () => { paintSw(); }, close: () => { closeHist(false); } });
    paintSw();
    return { history: () => JSON.parse(JSON.stringify(load())) };
  })();
