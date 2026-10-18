  /* ---------- opening a book ---------- */
  function updateHeader() {
    if (!S.book) return;
    nrHead();
    el.title.textContent = S.book.title;
    { const pt = $('#ptitle'); if (pt) { const au = String(S.book.authors || '').trim(); pt.firstChild.textContent = S.book.title; pt.lastChild.textContent = /^unknown/i.test(au) ? '' : au; } }   // title and author under the cover
    const pc = $('#pcover');
    if (pc && pc._wtId !== S.book.id) { pc._wtId = S.book.id; pc.textContent = ''; pc.append(coverBox(S.book, 'pcover-bg'), h('div', { class: 'pcover-poster' }, coverBox(S.book, 'pcover-art'))); }
    const t = S.secs[S.sec];
    el.sub.textContent = 'Track ' + (S.sec + 1) + ' of ' + S.secs.length + (S.model && S.plan[S.sec] && !S.plan[S.sec].ids.length && !trkLoading(S.sec) ? ' · no text' : '') + (S.bgTrack === S.sec ? ' · syncing' : '') + dlNote() + (S.syncWatch === S.book.id && S.syncText ? ' · ' + S.syncText : '') + ' · ' + S.book.authors;
    updateSyncUI(); verChip(); paintBookProg();
    if (S._miniBook !== S.book.id) { S._miniBook = S.book.id; setMini(false); } // each book opens with the full controls
    { const nt = $('#b-nexttrack'); if (nt) nt.disabled = S.sec >= S.secs.length - 1; }
    document.title = t ? t.title + ' · ' + S.book.title + ' · Wordtrail' : 'Wordtrail';
  }
  function prefetchText(b) {
    const saved = store.get('wt:book:' + b.id, null) || {};
    if (saved.text && saved.text.kind === 'file') return;
    (async () => {
      try {
        const st = saved.text;
        const id = st && st.kind === 'gutenberg' ? st.id : (await findGutenbergFor(b)).id;
        await getGutenberg(id);
      } catch (e) { /* attachText will retry and report */ }
    })();
  }
  let listing = false;
  async function openBook(b, opts) {   // opts.play: start the narration as soon as the book opens (the Listen button)
    const autoplay = !!(opts && opts.play === true);
    RC.prev = ((P.recents || []).find(r => String(r.id) === String(b.id)) || {}).ts || 0;   // last listened, read before persist() stamps it
    if (listing && !b.secs.length) return;
    if (DET.book && String(DET.book.id) !== String(b.id)) { DET.book = null; DET.author = null; DET.rv = false; DET.stack = []; $('#detail').textContent = ''; }
    else if (DET.book) DET.stale = true;
    const asked = b;
    warmParsed(b.id); // start reading the saved book text now, in parallel with everything below
    let failure = null;
    if (!b.secs.length) { const c = await idb.get('b:' + b.id); if (c && c.secs && c.secs.length) b = c; }
    if (!b.secs.length) {
      // Show the player straight away; the track list and the text load behind it.
      listing = true;
      startOpen(b.title, false);
      audio.pause();
      el.title.textContent = b.title; el.sub.textContent = b.authors || '';
      el.page.textContent = ''; el.page.append(loadingNote());
      showView('player');
      const fp = fetchFull(b); // first: it registers the combined request that prefetchText then reuses
      prefetchText(b);
      try { const full = await fp; if (full) b = full; } catch (e) { failure = e; }
      listing = false;
    } else if (!OP.active) startOpen(b.title, false);
    if (!b.secs.length) {
      endOpen(); showView('home'); restoreBack();
      if (failure) {
        setStatus('Could not load the tracks for "' + asked.title + '".', 'error', ['Try again', () => openBook(asked)]);
        toast('Could not load the tracks. Check your connection and try again.', 4500);
      } else { setStatus(''); toast('LibriVox lists no playable tracks for this recording.', 4500); }
      return;
    }
    let saved = await loadSaved(b.id);
    if (VER.carry) saved = verApply(saved, b);
    await Promise.race([loadCuts(), new Promise(r => setTimeout(r, 2500))]);
    await dlReady; // which tracks are saved on this device; the first one's blob URL is made before it is needed
    const first = Math.min(Math.max(0, saved.sec || 0), b.secs.length - 1);
    if (isLocal(b.id, first, b.secs[first].url)) await warmUrl(b.id, first);
    OP.home = false; progress(false); setStatus('');
    audio.pause();
    dlClearUrls(dlKey(b.id, first));
    hideDlHint(); // new book — clear any previous download nudge
    S.book = b; S.secs = b.secs; S.durs = b.secs.map(s => s.dur); try { clStop(); CL.ed = null; clPaintCount(); } catch (e) { /* clips not ready yet */ }
    setReaderLang(b.lang);
    S.sec = Math.min(Math.max(0, saved.sec || 0), S.secs.length - 1);
    S.anchors = saved.anchors || {}; S.ranges = saved.ranges || {}; S.autoSrc = saved.auto || {};
    S.lead = typeof saved.lead === 'number' && saved.lead !== 12 ? saved.lead : null; // null = estimate from the spoken LibriVox notice
    S.outro = typeof saved.outro === 'number' ? saved.outro : 5;
    S.autoTried = new Set(); S.alignFailed = new Set(); job.q = []; S.model = null; S.plan = []; S.mode = 'chapter'; S.map = []; S.span = []; S.textSrc = null; S.note = null; S.timings = null; S.tdone = new Map(); S.tstat = {}; S.wordT = {}; S.skip = {}; S.edge = {}; S.nn = null; S.merged = null; S.mergedBad = false; S.tPending = false; TM.fail = ''; S.heavyBlob = ''; S.sharing = false; driftReset(); fetchTimings(b);
    S.seg = {}; S.ainfo = {}; S.refining = false; S.undo = null;
    S.lp = store.get('wt:lp:' + b.id, {}) || {}; S.lpLast = null; S.lpSaved = 0;
    S.calibrate = false; syncCalUI();
    showView('player');
    rememberOpen(b);
    bookAccent(b);
    loadAudio(S.sec, resumeBack(b, saved.time || 0), autoplay);
    persist();
    attachText(saved);
  }
  function noteNode(msg, actions, detail) {
    return h('div', { class: 'note' }, h('strong', {}, msg), detail ? h('small', { style: 'overflow-wrap:anywhere' }, String(detail).slice(0, 220)) : null, actions && actions.length ? h('div', { class: 'row', style: 'justify-content:center' }, actions.map(([label, fn]) => h('button', { class: 'btn small ghost', type: 'button', onclick: fn }, label))) : null);
  }
  /* ---------- parsed-book cache ----------
     Splitting a whole book into chapters and sentences takes a moment, and the result never changes for
     the same text. It is kept in IndexedDB (key: parser version + text source), so reopening a book
     skips both the parsing and, for Project Gutenberg texts, even reading the raw text back.
     Raise PARSE_V whenever Core.parseBook, splitSentences or spokenCost change, so old copies are ignored. */
  const PARSE_V = 1;
  function parsedKey(src, raw) {
    if (!src) return null;
    if (src.kind === 'gutenberg' && src.id) return 'p:' + PARSE_V + ':g:' + src.id;
    if (src.kind === 'file' && raw) { // an own text: length plus a few dozen sampled characters
      let hsh = 2166136261;
      const step = Math.max(1, Math.floor(raw.length / 64));
      for (let i = 0; i < raw.length; i += step) { hsh ^= raw.charCodeAt(i); hsh = Math.imul(hsh, 16777619) >>> 0; }
      return 'p:' + PARSE_V + ':f:' + raw.length + ':' + hsh.toString(36);
    }
    return null;
  }
  const preParse = new Map();
  function warmParsed(id) {
    try {
      preParse.clear();
      const st = (store.get('wt:book:' + id, null) || {}).text, key = st && st.kind === 'gutenberg' && st.id ? parsedKey(st) : null;
      if (key) preParse.set(key, readParsed(key));
    } catch (e) { /* nothing saved yet */ }
  }
  async function loadParsed(key) {
    if (!key) return null;
    const pre = preParse.get(key);
    if (pre) { preParse.delete(key); return pre; }
    return readParsed(key);
  }
  async function readParsed(key) {
    const c = await idb.get(key);
    const ok = c && c.v === PARSE_V && Array.isArray(c.sents) && c.sents.length && Array.isArray(c.chapters) && c.chapters.length
      && c.sents[0] && typeof c.sents[0].t === 'string' && c.chapters[c.chapters.length - 1].end === c.sents.length;
    return ok ? { sents: c.sents, chapters: c.chapters } : null;
  }
  async function attachText(saved) {
    const token = ++S.textToken;
    if (!OP.active) startOpen(S.book.title, false);
    const note = (msg, actions, detail) => { if (token !== S.textToken) return; endOpen(); S.note = noteNode(msg, actions, detail); renderSection(S.sec); };
    S.note = loadingNote(); renderSection(S.sec);
    const dl = ev => {
      if (token !== S.textToken) return;
      if (ev.type === 'cached') setOpen(0.85, 'dl', 'already on this device');
      else if (ev.type === 'try') setOpen(0.35, 'dl', ev.i > 0 ? 'trying another copy' : '', true);
      else {
        const frac = ev.total ? Math.min(1, ev.n / ev.total) : ev.n / (ev.n + 800000) * 0.95;
        setOpen(0.35 + 0.5 * frac, 'dl', mb(ev.n) + (ev.total ? ' of ' + mb(ev.total) : ''));
      }
    };
    let raw, src, parsed = null;
    try {
      const st = saved && saved.text;
      if (st && st.kind === 'gutenberg') { parsed = await loadParsed(parsedKey(st)); if (parsed) src = st; } // saved parse: no download, no raw text, no parsing
      if (!parsed && st && st.kind === 'file') { setOpen(0.35, 'dl', '', true); raw = await idb.get('f:' + S.book.id); src = st; }
      else if (!parsed && st && st.kind === 'gutenberg') { setOpen(0.35, 'dl', '', true); raw = await getGutenberg(st.id, dl); src = st; }
      if (!raw && !parsed) {
        setOpen(0.27, 'find', '', true);
        const g = await findGutenbergFor(S.book);
        src = { kind: 'gutenberg', id: g.id, label: g.label };
        parsed = await loadParsed(parsedKey(src));
        if (!parsed) { setOpen(0.35, 'dl', '', true); raw = await getGutenberg(g.id, dl); }
      }
      if (raw && !parsed) parsed = await loadParsed(parsedKey(src, raw)); // an own text, or a text first met here
    } catch (e) {
      console.error('Wordtrail: text download failed', e);
      note('The book text could not be downloaded. You can still listen.', [['Use my own text', () => openSheet('sheet-text')], ['Try again', () => attachText(saved)]], e && e.message);
      return;
    }
    if (token !== S.textToken) return;
    setOpen(0.88, 'prep', parsed ? 'from the saved copy' : '', true);
    if (!parsed) { await new Promise(r => setTimeout(r, 40)); if (token !== S.textToken) return; } // lets the progress bar paint before a long parse
    try {
      applyText(raw, src, saved || {}, parsed);
      endOpen();
    } catch (e) {
      console.error('Wordtrail: text processing failed', e);
      note('The text downloaded but could not be processed.', [['Use my own text', () => openSheet('sheet-text')]], e && e.message);
    }
  }
  function applyText(raw, src, saved, parsed) {
    S.textSrc = src;
    if (parsed) S.model = parsed;
    else {
      S.model = Core.parseBook(raw);
      const key = parsedKey(src, raw);
      if (key) idb.set(key, { v: PARSE_V, sents: S.model.sents, chapters: S.model.chapters });
    }
    driftReset(); S.note = null; S.autoTried = new Set(); S.alignFailed = new Set(); job.q = [];
    const dm = Core.defaultMap(S.model.chapters, S.secs);
    const same = saved.text && JSON.stringify(saved.text) === JSON.stringify(src);
    // Saves from before chapter numbers and ranges were read (mv < 2) that fell back to
    // 'continuous' are rebuilt; they started the text at the wrong chapter.
    const keep = same && Array.isArray(saved.map) && saved.map.length === S.secs.length && saved.mode && (saved.mv === MAP_VERSION || saved.mode === 'chapter');
    if (keep) { S.mode = saved.mode; S.map = saved.map; S.span = Array.isArray(saved.span) && saved.span.length === S.secs.length ? saved.span : saved.map.slice(); }
    else {
      S.mode = dm.mode; S.map = dm.map; S.span = dm.span; S.anchors = {}; S.ranges = {}; S.autoSrc = {}; S.skip = {}; S.edge = {};
      if (dm.approx) toast('Track titles do not name chapters, so the text is divided between tracks by length. Sync will tighten it.', 6000);
    }
    replan(true); updateHeader(); persist();
    /* The last-read page is on screen now. Fitting the saved or shared sync to it can take a moment,
       so that runs after the first paint (fetchTimings waits for it through S.tPending). */
    const bk = S.book, md = S.model;
    S.tPending = true;
    afterPaint(() => { if (S.book !== bk || S.model !== md) return; try { applyTimings(); } finally { S.tPending = false; }
      const cp = S.plan[S.sec]; if (!cp || !cp.ids.length) renderSection(S.sec); if (!bmGoPending()) rcReturn(); });
  }
  function trkLoading(i) { return !!(S.timingWait || S.tPending || S.bgTrack === i); }
  /* What the wait is for, in plain words, so a reader can tell a normal wait from a failure. */
  function tmText(i) {
    if (S.bgTrack === i) return 'Aligning the audio\u2026';
    if (S.tPending) return 'Fitting the timing to the text\u2026';
    if (S.timingWait) return 'Checking the shared timing\u2026';
    return 'Preparing the text\u2026';
  }
  function retryTiming() {
    const b = S.book; if (!b) return;
    TM.fail = ''; fetchTimings(b); renderSection(S.sec);
  }
  function tmWaitNode(i) {
    clearInterval(TM.iv);
    const t0 = Date.now();
    const head = h('strong', {}, 'Finding this track\u2019s text\u2026'), line = h('small', {}), act = h('div', { class: 'row', style: 'justify-content:center', hidden: true });
    act.append(h('button', { class: 'btn small ghost', type: 'button', onclick: retryTiming }, 'Try again'));
    const box = h('div', { class: 'note', role: 'status' }, h('div', {}, h('span', { class: 'wt-spin', 'aria-hidden': 'true' }), head), line, act);
    const paint = first => {
      if (!first && (!box.isConnected || !S.book || S.sec !== i)) { clearInterval(TM.iv); return; }
      if (!first && !trkLoading(i)) { clearInterval(TM.iv); renderSection(i); return; }
      const sec = Math.floor((Date.now() - t0) / 1000);
      const slow = S.timingWait && !S.tPending && S.bgTrack !== i && sec >= 30;
      head.textContent = slow ? 'Timing is slow to load' : 'Finding this track\u2019s text\u2026';
      line.textContent = slow ? 'Still trying to reach the timing (' + sec + 's). Try again, or keep waiting.'
        : tmText(i) + (sec >= 3 ? ' ' + sec + 's' : '') + (sec >= 12 ? ' \u00b7 slow connections can take a minute' : '');
      act.hidden = !slow;
    };
    paint(true); TM.iv = setInterval(paint, 1000);
    return box;
  }

  /* ---------- plan + reader ---------- */
  /* ---------- intro/outro cuts: cuts.json (built by wt_cuts.py) gives the exact end of the spoken intro and start of the outro ---------- */
  const CUTS = { d: null, p: null };
  function loadCuts() {
    return CUTS.p || (CUTS.p = (async () => {
      let c = store.get('wt:cuts', null);
      if (!(c && c.d && Date.now() - c.t < 6 * 3600e3)) {
        try {
          const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 8000);
          const r = await fetch('https://raw.githubusercontent.com/' + ghCfg().repo + '/main/cuts.json', { signal: ctl.signal }); clearTimeout(to);
          if (r.ok) { const j = await r.json(); if (j && j.v === 1 && j.b) { c = { t: Date.now(), d: { v: 1, b: j.b } }; store.set('wt:cuts', c); } }
        } catch (e) { /* missing or offline: use the saved copy, or behave as before */ }
      }
      CUTS.d = c && c.d ? c.d : null;
      if (CUTS.d && S.book && S.model) replan(false);
    })());
  }
  /* [introEnd, outroStart|null] for a track, or null (then the fixed lead/outro apply). */
  function cutFor(i) {
    if (P.skipCuts === false || !CUTS.d || !S.book) return null;
    const b = CUTS.d.b[S.book.id], e = b && b[i];
    if (!Array.isArray(e)) return null;
    const d = S.durs[i] || 0;
    let a = +e[0] || 0, o = e[1] == null ? null : +e[1];
    if (!(a >= 0 && a < 90)) a = 0;
    if (o != null && !(d > 0 && o > d * 0.75 && o < d)) o = null;
    return [a, o];
  }
  function rebuild() {
    if (!S.model) { S.plan = []; return; }
    /* Sentences the narrator did not read take no time in the plan, so the highlight never waits in them. */
    {
      const sents = S.model.sents, nn = new Set();
      for (const k of Object.keys(S.skip || {})) for (const r of S.skip[k] || []) for (let id = r[0]; id < r[1] && id < sents.length; id++) nn.add(id);
      const ed = S.edge || {};
      for (let i = 0; i + 1 < S.secs.length; i++) {
        const e = ed[i] && ed[i][1], l = ed[i + 1] && ed[i + 1][0];
        if (!e || !l) continue;
        const lo = Math.max(e[0], l[0]), hi = Math.min(e[1], l[1], sents.length);
        let words = 0; const ids = [];
        for (let id = lo; id < hi; id++) if (!sents[id].h) { ids.push(id); words += (sents[id].t.match(/\S+/g) || []).length; }
        if (words >= 10) for (const id of ids) nn.add(id);
      }
      for (const id of S.nn || []) if (!nn.has(id) && sents[id] && sents[id].cost0 != null) sents[id].cost = sents[id].cost0;
      for (const id of nn) { const x = sents[id]; if (x.cost0 == null) x.cost0 = x.cost; x.cost = 0; }
      S.nn = nn;
    }
    const intros = S.secs.map(sec => Core.introCost(S.book.title, S.book.authors, sec.title));
    S.plan = Core.buildPlan(S.model, S.durs, S.mode, S.map, S.anchors, S.lead, S.outro, S.span, intros, S.ranges, S.secs.map((_, i) => cutFor(i)));
    const n = S.model.sents.length;
    S.sentSec = new Int32Array(n).fill(-1); S.sentPos = new Int32Array(n).fill(-1);
    S.plan.forEach((p, i) => p.ids.forEach((id, k) => { S.sentSec[id] = i; S.sentPos[id] = k; }));
  }
  const sig = p => p ? p.ids.length + ':' + p.ids[0] + ':' + p.ids[p.ids.length - 1] : '';
  function afterPaint(fn) {
    let done = false;
    const go = () => { if (!done) { done = true; fn(); } };
    requestAnimationFrame(() => setTimeout(go, 0));
    setTimeout(go, 400); // a hidden tab does not run animation frames
  }
  function replan(forceRender) {
    const before = sig(S.plan[S.sec]);
    rebuild();
    if (forceRender || before !== sig(S.plan[S.sec])) renderSection(S.sec); else tick(true);
  }
  guideDoc('reading', 'Chapter summaries', "Long chapters start with a short Summary you can open. It is made on your phone from the chapter's own sentences.");
  /* ---------- free chapter summaries: picks the most representative sentences (no AI, runs on the phone) ---------- */
  const SUM_N = 3; // sentences per summary
  const SUM_STOP = new Set('the and but for with from that this these those they them their there then than have has had was were are been being will would could should said not you your his her its our who whom what when where which while into over under also very just upon about after before again some such only more most other any all can may might shall'.split(' '));
  function summarize(list, n) { return sumPick(list, n).join(' '); }
  function sumPick(list, n) {
    const keep = w => w.length > 2 && !SUM_STOP.has(w);
    const toks = s => (s.toLowerCase().match(/[a-z']+/g) || []).filter(keep);
    const freq = new Map(), rows = list.map(s => toks(s));
    rows.forEach(ws => ws.forEach(w => freq.set(w, (freq.get(w) || 0) + 1)));
    const scored = list.map((s, i) => {
      const ws = rows[i];
      if (ws.length < 7 || ws.length > 45) return { i, sc: -1 };
      let sc = 0; for (const w of ws) sc += freq.get(w);
      sc = sc / Math.pow(ws.length, .85);
      if (/^["\u201c\u2018]/.test(s) || /\b(said|asked|cried|replied)\b/i.test(s)) sc *= .6; // dialogue says little
      if (i === 0) sc *= 1.15;
      return { i, sc };
    }).filter(x => x.sc > 0).sort((a, b) => b.sc - a.sc).slice(0, n).sort((a, b) => a.i - b.i);
    return scored.map(x => list[x.i]);
  }
  function chapSummary(ci) {
    const m = S.model, c = m && m.chapters[ci];
    if (!c || c.front) return null;
    const cache = m.sum || (m.sum = {});
    if (!(ci in cache)) {
      const list = m.sents.slice(c.start, c.end).filter(s => !s.h).map(s => s.t);
      cache[ci] = list.length >= SUM_N + 3 && list.join(' ').split(/\s+/).length >= 200 ? summarize(list, SUM_N) : '';
    }
    return cache[ci] ? h('details', { class: 'sum' }, h('summary', { text: 'Summary' }), h('p', { text: cache[ci] })) : null;
  }

  guideDoc('words', 'Quick quiz', "More > Quick quiz tests you on the chapter you are in with fill-in-the-blank, who-said-it and sentence-order questions.");
  /* ================= Quick quiz (no AI: built from the chapter text by rules, on the device) =================
     Three kinds of question: a vocabulary word blanked out of its sentence, who said a quoted line, and
     putting consecutive sentences back in order. Best score per chapter is kept in localStorage. */
  const QZ = { qs: [], i: 0, score: 0, wrong: [], ci: -1, picks: [], done: false };
  const qzShuffle = a => { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
  const qzWords = s => s.match(/[A-Za-z][A-Za-z'’-]*/g) || [];
  const QZ_V = 'said|asked|cried|replied|answered|exclaimed|whispered|shouted|called|added|continued|observed|remarked|muttered|declared|returned|inquired|demanded|answered';
  const QZ_COMMON = /^(nothing|something|everything|anything|another|because|through|without|between|together|himself|herself|myself|itself|themselves|however|whether|always|perhaps|thought|getting|looking|nobody|everybody|started|whatever|certain)$/;
  const QZ_NOT_NAME = new Set('He She They It We You I The A An And But Then Now So Yes No Oh Well'.split(' '));
  const qzKey = ci => (S.book ? S.book.id : 'x') + ':' + ci;
  const qzBest = ci => { const o = store.get('wt:quiz', {}); return o[qzKey(ci)] || null; };
  function qzSaveBest(ci, sc, n) {
    const o = store.get('wt:quiz', {}), k = qzKey(ci), b = o[k];
    if (P.calm !== true && (!b || sc / n > b[0] / b[1])) { o[k] = [sc, n]; store.set('wt:quiz', o); }
  }
  function qzChapterSents(ci) {
    const m = S.model, c = m && m.chapters[ci];
    if (!c || c.front) return [];
    const out = [];
    for (let k = c.start; k < c.end; k++) if (!m.sents[k].h) out.push({ id: k, t: m.sents[k].t });
    return out;
  }
  function qzFill(sents, n) {
    const freq = new Map();
    sents.forEach(s => qzWords(s.t).forEach(w => { w = w.toLowerCase(); freq.set(w, (freq.get(w) || 0) + 1); }));
    const pool = [...freq.keys()].filter(w => /^[a-z]{5,12}$/.test(w) && !SUM_STOP.has(w));
    const cls = w => /ly$/.test(w) ? 'ly' : /ing$/.test(w) ? 'ing' : /ed$/.test(w) ? 'ed' : /(tion|sion)$/.test(w) ? 'tion' : /s$/.test(w) ? 's' : 'x';
    const cands = [], usedAns = new Set();
    for (const s of qzShuffle(sents)) {
      const ws = qzWords(s.t);
      if (ws.length < 8 || ws.length > 34) continue;
      const opts = ws.filter(w => /^[a-z]{7,}$/.test(w) && !SUM_STOP.has(w) && !QZ_COMMON.test(w) && freq.get(w) <= 2 && !usedAns.has(w));
      if (!opts.length) continue;
      const ans = opts[Math.floor(Math.random() * opts.length)];
      const inS = new Set(ws.map(w => w.toLowerCase()));
      const ds = pool.filter(w => w !== ans && !inS.has(w) && Math.abs(w.length - ans.length) <= 3)
        .map(w => [w, (cls(w) === cls(ans) ? 0 : 10) + Math.abs(w.length - ans.length) + Math.random() * 3]).sort((a, b) => a[1] - b[1]).slice(0, 3).map(x => x[0]);
      if (ds.length < 3) continue;
      usedAns.add(ans);
      cands.push({ kind: 'fill', id: s.id, text: s.t.replace(new RegExp('\\b' + ans + '\\b'), '_____'), full: s.t, ans, opts: qzShuffle([ans, ...ds]) });
      if (cands.length >= n) break;
    }
    return cands;
  }
  function qzSpeakers(sents, n) {
    const found = [];
    const quoteA = new RegExp('[“"]([^”"]+)[”"]\\s*,?\\s*(?:(?:' + QZ_V + ')\\s+(?:the\\s+)?([A-Z][a-z]+(?:\\s[A-Z][a-z]+)?)|([A-Z][a-z]+(?:\\s[A-Z][a-z]+)?)\\s+(?:' + QZ_V + '))\\b');
    const quoteB = new RegExp('\\b([A-Z][a-z]+(?:\\s[A-Z][a-z]+)?)\\s+(?:' + QZ_V + ')\\b[^“"]{0,24}[“"]([^”"]+)[”"]');
    for (const s of sents) {
      let m = s.t.match(quoteA), name, quote;
      if (m) { name = m[2] || m[3]; quote = m[1]; }
      else if ((m = s.t.match(quoteB))) { name = m[1]; quote = m[2]; }
      if (!name || QZ_NOT_NAME.has(name.split(' ')[0]) || qzWords(quote).length < 4) continue;
      found.push({ id: s.id, name, quote, full: s.t });
    }
    const names = [...new Set(found.map(f => f.name))];
    if (!found.length) return [];
    // filler names: capitalised words that are not at the start of a sentence
    const caps = new Map();
    sents.forEach(s => { const re = /[a-z,;]\s([A-Z][a-z]{2,})/g; let mm; while ((mm = re.exec(s.t))) { const w = mm[1]; if (!QZ_NOT_NAME.has(w)) caps.set(w, (caps.get(w) || 0) + 1); } });
    const fillers = [...caps.entries()].sort((a, b) => b[1] - a[1]).map(x => x[0]);
    const out = [], usedN = new Set();
    for (const f of qzShuffle(found)) {
      if (usedN.has(f.name) && out.length < names.length) continue;
      const others = qzShuffle(names.filter(x => x !== f.name)).concat(fillers.filter(x => x !== f.name && !names.some(n => n.split(' ').includes(x)))).slice(0, 3);
      if (others.length < 2) continue;
      usedN.add(f.name);
      out.push({ kind: 'who', id: f.id, quote: f.quote.length > 150 ? f.quote.slice(0, 147) + '…' : f.quote, full: f.full, ans: f.name, opts: qzShuffle([f.name, ...others]) });
      if (out.length >= n) break;
    }
    return out;
  }
  function qzOrder(sents, n) {
    const ok = s => { const w = qzWords(s.t).length; return w >= 4 && w <= 30; };
    const runs = [];
    for (let i = 0; i + 3 < sents.length; i++) {
      const r = sents.slice(i, i + 4);
      if (r.every(ok) && r.every((s, k) => k === 0 || s.id === r[k - 1].id + 1) && new Set(r.map(s => s.t)).size === 4) runs.push(i);
    }
    const out = [], used = [];
    for (const i of qzShuffle(runs)) {
      if (used.some(u => Math.abs(u - i) < 6)) continue;
      const r = sents.slice(i, i + 4);
      let sh = qzShuffle(r.map(s => s.t)), tries = 0;
      while (sh.every((t, k) => t === r[k].t) && tries++ < 8) sh = qzShuffle(sh);
      out.push({ kind: 'order', id: r[0].id, correct: r.map(s => s.t), items: sh });
      used.push(i);
      if (out.length >= n) break;
    }
    return out;
  }
  function qzBuild(ci) {
    const sents = qzChapterSents(ci);
    const A = qzFill(sents, 3), B = qzSpeakers(sents, 2), C = qzOrder(sents, 2), out = [];
    while (A.length || B.length || C.length) { if (A.length) out.push(A.shift()); if (B.length) out.push(B.shift()); if (C.length) out.push(C.shift()); }
    return out.slice(0, 8);
  }
  function quizCard(ci) {
    const c = S.model.chapters[ci];
    if (!c || c.front || c.end - c.start < 14) return null;
    const best = qzBest(ci);
    const calmQ = P.calm === true, go = h('button', { class: 'btn small', type: 'button', text: best && !calmQ ? 'Try again' : 'Start' });
    go.addEventListener('click', () => qzOpen(ci));
    return h('div', { class: 'qzc' }, h('div', {}, h('b', {}, 'Quick quiz'), h('span', {}, calmQ ? 'A few questions about this chapter, no score' : best ? 'Best so far: ' + best[0] + ' of ' + best[1] : 'Test yourself on this chapter')), go);
  }
  function qzOpen(ci) {
    if (!S.model) { toast('Open a book with text first.'); return; }
    if (ci == null) {
      const p = S.plan[S.sec];
      const id = S.curId >= 0 ? S.curId : (p && p.ids.length ? p.ids[0] : -1);
      ci = id >= 0 ? S.model.sents[id].ch : -1;
    }
    QZ.ci = ci; QZ.qs = ci >= 0 ? qzBuild(ci) : []; QZ.i = 0; QZ.score = 0; QZ.wrong = []; QZ.done = false;
    openSheet('sheet-quiz');
    qzRender();
  }
  function qzHear(q) {
    const sec = S.sentSec ? S.sentSec[q.id] : -1, p = S.plan[sec];
    if (sec !== S.sec || !p) return null;
    return h('button', { class: 'btn ghost small', type: 'button', text: '▶ Hear it in the audio', onclick: () => { seekAudio(sentTime(p, S.sentPos[q.id])); audio.play().catch(onPlayFail); } });
  }
  function qzRender() {
    const body = $('#qz-body'); body.textContent = '';
    const ch = QZ.ci >= 0 ? S.model.chapters[QZ.ci] : null;
    if (QZ.qs.length < 3) {
      body.append(h('p', { class: 'help', text: 'This chapter does not have enough text to build a good quiz. Try a longer chapter.' }), h('button', { class: 'btn', type: 'button', text: 'Close', onclick: closeSheets }));
      return;
    }
    if (QZ.i >= QZ.qs.length) return qzResult(body);
    const q = QZ.qs[QZ.i];
    body.append(
      h('div', { class: 'qz-top' }, h('span', { text: ch && ch.title ? ch.title : 'This chapter' }), h('span', { text: (QZ.i + 1) + ' / ' + QZ.qs.length })),
      h('div', { class: 'qz-bar' }, h('i', { style: 'width:' + (QZ.i / QZ.qs.length * 100) + '%' })));
    const fb = h('div', { class: 'qz-fb', hidden: true, role: 'status' });
    const next = h('button', { class: 'btn', type: 'button', hidden: true, text: QZ.i + 1 < QZ.qs.length ? 'Next question' : 'See my score' });
    next.addEventListener('click', () => { QZ.i++; qzRender(); });
    const finish = ok => {
      if (ok) QZ.score++; else QZ.wrong.push(q);
      fb.hidden = false; next.hidden = false; next.focus();
    };
    if (q.kind === 'fill' || q.kind === 'who') {
      body.append(h('div', { class: 'qz-kind', text: q.kind === 'fill' ? 'Vocabulary · fill in the blank' : 'Speaker · who said it?' }),
        h('div', { class: 'qz-q', text: q.kind === 'fill' ? q.text : '“' + q.quote + '”' }));
      const box = h('div', { class: 'qz-opts' });
      q.opts.forEach(o => {
        const label = q.kind === 'fill' && /^_____/.test(q.text) ? o[0].toUpperCase() + o.slice(1) : o;
        const b = h('button', { class: 'qz-opt', type: 'button', text: label });
        b.addEventListener('click', () => {
          const ok = o === q.ans;
          $$('.qz-opt', box).forEach(x => { x.disabled = true; if (x.textContent.toLowerCase() === q.ans.toLowerCase()) x.classList.add('ok'); });
          if (!ok) b.classList.add('no');
          fb.textContent = (ok ? (P.calm === true ? 'Yes. ' : 'Correct. ') : (P.calm === true ? 'Here is what the book says. ' : 'Not quite. ')) + q.full;
          finish(ok);
        });
        box.append(b);
      });
      body.append(box, fb, qzHear(q), next);
    } else {
      body.append(h('div', { class: 'qz-kind', text: 'Sentence order' }), h('div', { class: 'qz-q', text: 'Tap the sentences in the order they appear in the book.' }));
      QZ.picks = [];
      const ans = h('div', { class: 'qz-ans' }), pool = h('div', { class: 'qz-chips grid' });
      const check = h('button', { class: 'btn', type: 'button', text: 'Check order', disabled: true });
      const chips = q.items.map((t, i) => h('button', { class: 'qz-chip', type: 'button', text: t, 'data-i': String(i) }));
      const draw = () => {
        ans.textContent = '';
        if (!QZ.picks.length) ans.append(h('span', { class: 'ph', text: 'Your order appears here' }));
        QZ.picks.forEach(i => { const c = h('button', { class: 'qz-chip', type: 'button', text: (QZ.picks.indexOf(i) + 1) + '. ' + q.items[i] }); c.addEventListener('click', () => { QZ.picks = QZ.picks.filter(x => x !== i); draw(); }); ans.append(c); });
        chips.forEach((c, i) => { c.classList.toggle('used', QZ.picks.includes(i)); c.disabled = QZ.picks.includes(i); });
        check.disabled = QZ.picks.length !== q.items.length;
      };
      chips.forEach((c, i) => { c.addEventListener('click', () => { QZ.picks.push(i); draw(); }); pool.append(c); });
      check.addEventListener('click', () => {
        const mine = QZ.picks.map(i => q.items[i]), ok = mine.every((t, k) => t === q.correct[k]);
        check.hidden = true; chips.forEach(c => { c.disabled = true; }); $$('.qz-chip', ans).forEach(c => { c.disabled = true; });
        fb.textContent = ok ? (P.calm === true ? 'Yes. That is the order in the book.' : 'Correct. That is the order in the book.') : (P.calm === true ? 'Here is the order in the book: ' : 'Not quite. In the book: ') + q.correct.map((t, k) => (k + 1) + '. ' + t).join('  ');
        finish(ok);
      });
      draw();
      body.append(ans, pool, check, fb, qzHear(q), next);
    }
  }
  function qzResult(body) {
    const n = QZ.qs.length, sc = QZ.score;
    qzSaveBest(QZ.ci, sc, n);
    if (P.calm === true) {
      body.append(h('p', { class: 'help', style: 'text-align:center;font-size:1.1rem', text: 'All done. Thank you for reading closely.' }));
      if (QZ.wrong.length) {
        body.append(h('h3', { text: 'Worth another look, whenever you like' }));
        const w = h('div', { class: 'qz-wrong' });
        QZ.wrong.forEach(q => w.append(h('div', {}, q.kind === 'order' ? 'Order: ' + q.correct.join(' ') : (q.kind === 'who' ? '\u201c' + q.quote + '\u201d \u2014 ' + q.ans : q.full))));
        body.append(w);
      }
      body.append(h('div', { class: 'qz-row' }, h('button', { class: 'btn', type: 'button', text: 'Close', onclick: closeSheets })));
      return;
    }
    body.append(h('div', { class: 'qz-score', text: sc + ' / ' + n }),
      h('p', { class: 'help', style: 'text-align:center', text: sc === n ? 'Perfect. You know this chapter well.' : sc / n >= .6 ? 'Good work. A little more review and it is yours.' : 'Keep going. Listen to the chapter again, then try once more.' }));
    if (QZ.wrong.length) {
      body.append(h('h3', { text: 'Review' }));
      const w = h('div', { class: 'qz-wrong' });
      QZ.wrong.forEach(q => w.append(h('div', {}, q.kind === 'order' ? 'Order: ' + q.correct.join(' ') : (q.kind === 'who' ? '“' + q.quote + '” — ' + q.ans : q.full))));
      body.append(w);
    }
    body.append(h('div', { class: 'qz-row' },
      h('button', { class: 'btn', type: 'button', text: 'New quiz', onclick: () => qzOpen(QZ.ci) }),
      h('button', { class: 'btn ghost', type: 'button', text: 'Close', onclick: closeSheets })));
  }

  guideDoc('words', 'Shadow reading', "More > Shadow reading: hear a sentence, say it after the narrator, then compare the timing and listen to both.");
  /* ================= Shadow reading =================
     Hear one sentence from the narrator, say it yourself, then compare. The comparison shows the length of
     your sentence against the narrator's, plays them one after the other, and (where the browser has speech
     recognition) marks the words it did not hear. Recordings stay on the device, in memory, until you leave. */
  const SH = { k: 0, rec: {}, mr: null, stream: null, aud: null, watch: 0, stopT: 0, sr: null, busy: '', discard: false };
  function shPlan() { const p = S.plan[S.sec]; return p && p.ids.length ? p : null; }
  function shClip(p, k) {
    const a = sentTime(p, k), dur = S.durs[S.sec] || 0;
    const tail = Math.min(14, Math.max(1.5, S.model.sents[p.ids[k]].t.length / 14));
    let b = k + 1 < p.starts.length ? p.starts[k + 1] - P.nudge : (dur > a ? Math.min(dur, a + tail) : a + tail);
    if (!(b > a + 0.4)) b = a + tail;
    return [a, b];
  }
  function shOpen() {
    if (!S.book || !S.model || !shPlan()) { toast('Open a book that has its text lined up with the audio first.', 4000); return; }
    const p = shPlan();
    let k = Core.locate(p.starts, nowT() + P.nudge); k = Math.max(0, Math.min(k, p.ids.length - 1));
    while (k < p.ids.length - 1 && S.model.sents[p.ids[k]].h) k++;
    SH.k = k; SH.rec = {};
    openSheet('sheet-shadow'); shRender();
  }
  function shMove(d) {
    const p = shPlan(); if (!p) return;
    shHalt();
    let k = SH.k + d;
    while (k >= 0 && k < p.ids.length && S.model.sents[p.ids[k]].h) k += d;
    if (k < 0 || k >= p.ids.length) { toast(d > 0 ? 'That was the last sentence in this track.' : 'This is the first sentence.'); return; }
    SH.k = k; shRender();
  }
  function shHalt() {   // stop everything that is running: narrator clip, recording, playback
    clearInterval(SH.watch); clearTimeout(SH.stopT);
    if (!audio.paused && SH.busy === 'narrator') audio.pause();
    if (SH.aud) { try { SH.aud.pause(); } catch (e) { /* gone */ } SH.aud = null; }
    if (SH.mr && SH.mr.state !== 'inactive') { SH.discard = true; try { SH.mr.stop(); } catch (e) { /* gone */ } }
    if (SH.sr) { try { SH.sr.abort(); } catch (e) { /* gone */ } SH.sr = null; }
    if (SH.stream) { SH.stream.getTracks().forEach(t => t.stop()); SH.stream = null; }
    SH.busy = '';
  }
  function shCleanup() { shHalt(); Object.values(SH.rec).forEach(r => { try { URL.revokeObjectURL(r.url); } catch (e) { /* ignore */ } }); SH.rec = {}; }
  function shNarrator(done) {
    const p = shPlan(); if (!p) return;
    shHalt();
    const [a, b] = shClip(p, SH.k);
    SH.busy = 'narrator'; shButtons();
    seekAudio(a);
    const started = Date.now();
    audio.play().catch(e => { onPlayFail(e); SH.busy = ''; shButtons(); });
    let seen = false;
    SH.watch = setInterval(() => {
      if (!audio.paused) seen = true;
      if (audio.currentTime >= b - 0.03) { clearInterval(SH.watch); audio.pause(); SH.busy = ''; shButtons(); if (done) done(); }
      else if (seen && audio.paused && Date.now() - started > 400) { clearInterval(SH.watch); SH.busy = ''; shButtons(); }  // paused by hand
    }, 40);
  }
  async function shRecord() {
    if (!navigator.mediaDevices || !window.MediaRecorder) { toast('Recording is not supported in this browser.', 4000); return; }
    shHalt();
    try { SH.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); }
    catch (e) { toast('The microphone is blocked. Allow it in your browser settings, then try again.', 5000); return; }
    const mt = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'].find(t => MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t));
    const chunks = [], id = SH.k;
    const mr = new MediaRecorder(SH.stream, mt ? { mimeType: mt } : undefined);
    SH.mr = mr; SH.discard = false;
    mr.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
    mr.onstop = () => {
      if (SH.stream) { SH.stream.getTracks().forEach(t => t.stop()); SH.stream = null; }
      clearTimeout(SH.stopT);
      if (SH.busy === 'rec') SH.busy = '';
      if (SH.discard || !chunks.length) { shButtons(); return; }
      shSave(id, new Blob(chunks, { type: mr.mimeType || mt || 'audio/webm' }));
    };
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SR) {
      try {
        const sr = new SR(); sr.lang = 'en-US'; sr.interimResults = false; sr.maxAlternatives = 1; SH.sr = sr;
        sr.onresult = e => { const t = Array.from(e.results).map(r => r[0].transcript).join(' '); const r = SH.rec[id]; if (r) { r.heard = t; } else (SH.pendingHeard = SH.pendingHeard || {})[id] = t; shResult(); };
        sr.start();
      } catch (e) { SH.sr = null; }
    }
    mr.start(); SH.busy = 'rec'; shButtons();
    const [a, b] = shPlan() ? shClip(shPlan(), id) : [0, 4];
    SH.stopT = setTimeout(shStopRec, Math.min(40, (b - a) * 1.7 + 2.5) * 1000);   // stops by itself, in case you forget
  }
  function shStopRec() { clearTimeout(SH.stopT); if (SH.mr && SH.mr.state !== 'inactive') { try { SH.mr.stop(); } catch (e) { /* gone */ } } if (SH.sr) { try { SH.sr.stop(); } catch (e) { /* gone */ } } }
  async function shSave(id, blob) {
    const old = SH.rec[id]; if (old) { try { URL.revokeObjectURL(old.url); } catch (e) { /* ignore */ } }
    const r = { url: URL.createObjectURL(blob), env: null, speech: 0, total: 0, heard: (SH.pendingHeard && SH.pendingHeard[id]) || null };
    if (SH.pendingHeard) delete SH.pendingHeard[id];
    try {
      const AC = window.AudioContext || window.webkitAudioContext, ac = new AC();
      const buf = await ac.decodeAudioData(await blob.arrayBuffer()); ac.close && ac.close();
      const d = buf.getChannelData(0), N = Math.max(20, Math.min(160, Math.round(buf.duration * 40))), step = Math.floor(d.length / N) || 1, env = [];
      for (let i = 0; i < N; i++) { let s = 0; const lo = i * step, hi = Math.min(d.length, lo + step); for (let j = lo; j < hi; j++) s += d[j] * d[j]; env.push(Math.sqrt(s / Math.max(1, hi - lo))); }
      const mx = Math.max(...env) || 1, th = mx * 0.14;
      let f = env.findIndex(v => v > th), l = env.length - 1; while (l > 0 && env[l] <= th) l--;
      if (f < 0) f = 0;
      r.env = env.slice(f, l + 1).map(v => v / mx); r.total = buf.duration; r.speech = Math.max(0.2, (l - f + 1) / N * buf.duration);
    } catch (e) { r.speech = 0; }
    SH.rec[id] = r; shButtons(); shResult();
  }
  function shPlayYou(done) {
    const r = SH.rec[SH.k]; if (!r) return;
    shHalt(); const a = new Audio(r.url); SH.aud = a; SH.busy = 'you'; shButtons();
    a.onended = () => { SH.aud = null; SH.busy = ''; shButtons(); if (done) done(); };
    a.play().catch(() => { SH.busy = ''; shButtons(); });
  }
  function shBoth() { shNarrator(() => setTimeout(() => shPlayYou(), 250)); }
  function shLCS(a, b) {
    const m = a.length, n = b.length, d = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
    for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) d[i][j] = a[i - 1] === b[j - 1] ? d[i - 1][j - 1] + 1 : Math.max(d[i - 1][j], d[i][j - 1]);
    const hit = new Set(); let i = m, j = n;
    while (i > 0 && j > 0) { if (a[i - 1] === b[j - 1]) { hit.add(i - 1); i--; j--; } else if (d[i - 1][j] >= d[i][j - 1]) i--; else j--; }
    return hit;
  }
  function shRender() {
    const p = shPlan(), body = $('#sh-body'); body.textContent = '';
    if (!p) { body.append(h('p', { class: 'help', text: 'No text is lined up with this track.' })); return; }
    const id = p.ids[SH.k], s = S.model.sents[id];
    body.append(
      h('p', { class: 'help', text: 'Listen to the narrator, then say the sentence yourself. Compare your timing, and hear both one after the other.' }),
      h('div', { class: 'sh-meta' }, h('span', { text: 'Sentence ' + (SH.k + 1) + ' of ' + p.ids.length + ' in this track' }),
        h('span', {}, h('button', { class: 'btn ghost small', type: 'button', text: '‹ Prev', onclick: () => shMove(-1) }), ' ', h('button', { class: 'btn ghost small', type: 'button', text: 'Next ›', onclick: () => shMove(1) }))),
      h('div', { class: 'sh-sent', id: 'sh-sent', text: s.t }),
      h('button', { class: 'btn sh-main', id: 'sh-go', type: 'button' }),
      h('div', { class: 'qz-row' },
        h('button', { class: 'btn ghost small', id: 'sh-nar', type: 'button', text: '▶ Narrator' }),
        h('button', { class: 'btn ghost small', id: 'sh-rec', type: 'button' }),
        h('button', { class: 'btn ghost small', id: 'sh-you', type: 'button', text: '▶ You' }),
        h('button', { class: 'btn ghost small', id: 'sh-both', type: 'button', text: '⇄ Hear both' })),
      h('div', { id: 'sh-res' }));
    $('#sh-go').addEventListener('click', () => { if (SH.busy === 'rec') shStopRec(); else shNarrator(() => shRecord()); });
    $('#sh-nar').addEventListener('click', () => shNarrator());
    $('#sh-rec').addEventListener('click', () => { if (SH.busy === 'rec') shStopRec(); else shRecord(); });
    $('#sh-you').addEventListener('click', () => shPlayYou());
    $('#sh-both').addEventListener('click', shBoth);
    shButtons(); shResult();
  }
  function shButtons() {
    const go = $('#sh-go'); if (!go) return;
    const rec = SH.busy === 'rec', has = !!SH.rec[SH.k];
    go.className = 'btn sh-main' + (rec ? ' sh-rec' : '');
    go.textContent = ''; 
    if (rec) go.append(h('span', { class: 'sh-rec-dot' }), 'Recording… tap to stop');
    else go.append(SH.busy === 'narrator' ? 'Listening to the narrator…' : has ? 'Try again: listen, then repeat' : 'Listen, then repeat');
    $('#sh-rec').textContent = rec ? '■ Stop' : '● Record';
    $('#sh-you').disabled = !has || !!SH.busy && SH.busy !== 'you'; $('#sh-both').disabled = !has || rec;
    $('#sh-nar').disabled = rec;
  }
  function shResult() {
    const host = $('#sh-res'); if (!host) return;
    host.textContent = '';
    const r = SH.rec[SH.k], p = shPlan(); if (!r || !p) return;
    const [a, b] = shClip(p, SH.k), nd = b - a;
    const box = h('div', { class: 'sh-res' });
    if (r.speech > 0) {
      const ratio = r.speech / nd, pct = Math.round(Math.abs(ratio - 1) * 100);
      const verdict = ratio >= .85 && ratio <= 1.15 ? 'Great pace. You match the narrator.' : ratio < .85 ? 'You were ' + pct + '% faster than the narrator. Slow down a little.' : 'You were ' + pct + '% slower than the narrator. Try to keep it flowing.';
      const cv = h('canvas', { 'aria-label': 'Narrator length compared with yours' });
      box.append(h('div', { class: 'sh-verdict', text: verdict }), cv,
        h('div', { class: 'sh-legend' }, h('span', {}, h('i', { style: 'background:var(--accent)' }), 'Narrator ' + nd.toFixed(1) + ' s'), h('span', {}, h('i', { style: 'background:var(--muted)' }), 'You ' + r.speech.toFixed(1) + ' s')));
      setTimeout(() => shDraw(cv, r, nd), 0);
    } else box.append(h('div', { class: 'sh-verdict', text: 'Recorded. Tap “Hear both” to compare by ear.' }));
    if (r.heard != null) {
      const tw = qzWords(S.model.sents[p.ids[SH.k]].t), norm = w => w.toLowerCase().replace(/[^a-z']/g, '').replace(/'/g, '');
      const hit = shLCS(tw.map(norm), qzWords(r.heard).map(norm));
      box.append(h('div', { text: 'Words heard: ' + hit.size + ' of ' + tw.length }));
      const sent = $('#sh-sent');
      if (sent) { sent.textContent = ''; let i = 0; S.model.sents[p.ids[SH.k]].t.split(/(\s+)/).forEach(part => { if (/^\s+$/.test(part) || !part) { sent.append(part); return; } const w = qzWords(part).length ? i++ : -1; sent.append(w >= 0 && !hit.has(w) ? h('span', { class: 'miss', text: part }) : part); }); }
    }
    host.append(box);
  }
  function shDraw(cv, r, nd) {
    const dpr = window.devicePixelRatio || 1, W = cv.clientWidth || 300, H = 70;
    cv.width = W * dpr; cv.height = H * dpr;
    const g = cv.getContext('2d'); g.scale(dpr, dpr);
    const cs = getComputedStyle(document.documentElement), acc = cs.getPropertyValue('--accent').trim() || '#E0B15A', mu = cs.getPropertyValue('--muted').trim() || '#999';
    const T = Math.max(nd, r.speech) * 1.02, rr = (x, y, w, hh) => { g.beginPath(); g.roundRect ? g.roundRect(x, y, w, hh, 4) : g.rect(x, y, w, hh); g.fill(); };
    g.fillStyle = acc; rr(0, 4, W * nd / T, 12);
    g.fillStyle = mu;
    if (r.env && r.env.length) { const w = W * r.speech / T, n = r.env.length, bw = w / n; r.env.forEach((v, i) => { const hh = Math.max(2, v * 44); g.fillRect(i * bw, 24 + (44 - hh) / 2, Math.max(1, bw - 1), hh); }); }
    else rr(0, 30, W * r.speech / T, 12);
  }

