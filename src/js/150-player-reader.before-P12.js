  /* ---------- Finish-and-Continue card ----------
     Shown when a book is done: at the end of the text in the reader, and on Home under a finished book.
     One lead pick (the author's next title from catalog.json, else the closest match), then more by the
     same author and similar books. Recordings of the same book (versions.json) are never offered. */
  function finishData(book) {
    const sb = CAT.books && CAT.books.find(x => x.id === String(book.id));
    if (!sb) return null;
    const hist = new Set(listenedList().map(r => r.id)); hist.add(sb.id);
    const gOf = id => { const v = VER.ready && VER.map.get(String(id)); return v ? v.g : null; };
    const mine = gOf(sb.id), okL = x => P.otherLangs ? x.lang === sb.lang : (!x.lang || /^english$/i.test(x.lang));
    const seenG = new Set(), ok = x => { if (hist.has(x.id)) return false; const g = gOf(x.id); if (g != null && (g === mine || seenG.has(g))) return false; if (g != null) seenG.add(g); return true; };
    const author = sb._a ? CAT.books.filter(x => x.id !== sb.id && okL(x) && x._a === sb._a && x.total > 0)
      .sort((x, y) => (y.ia ? 1 : 0) - (x.ia ? 1 : 0) || (+x.id) - (+y.id)).filter(ok).slice(0, 8).map(nxPub) : [];
    const skip = new Set(hist); author.forEach(x => skip.add(x.id));
    const similar = recoFor(sb, skip, 24).map(nxPub).filter(ok).slice(0, 10);
    return { author, similar };
  }
  function finishCard(book, o = {}) {
    const root = h('section', { class: 'fin-card' + (o.compact ? ' compact' : ''), 'aria-label': 'Finished: ' + book.title, hidden: true });
    if (!o.compact) root.append(h('div', {}, h('div', { class: 'fin-k' }, '\u2713 Finished'), h('div', { class: 'fin-t' }, book.title), h('div', { class: 'fin-a' }, book.authors || '')));
    const rate = ratePrompt(book, () => { root.hidden = false; });   // signed-in readers who have not rated this book (135-ratings.js)
    if (rate) root.append(rate);
    const body = h('div', { class: 'fin-body' }); root.append(body);
    (async () => {
      try { await Promise.all([catLoad(), SIM.load().catch(() => {}), VER.load().catch(() => {})]); } catch (e) { /* use what loaded */ }
      const d = finishData(book);
      if (!d || !(d.author.length || d.similar.length)) return;
      const go = b => () => { closeSheets(); openBook(b); };
      const lead = d.author[0] || d.similar[0], first = String(book.authors || 'this author').split(',')[0];
      body.append(h('div', { class: 'nx-pick' },
        h('div', { class: 'nx-tag' }, h('b', {}, '\u2605 Continue with'), d.author[0] ? 'Next by ' + first : 'A close match'),
        bookCard(lead, go(lead))));
      const rest = d.author.filter(x => x.id !== lead.id);
      if (rest.length) { const row = h('div', { class: 'hrow', 'aria-label': 'More by ' + first }); fillRow(row, rest, null, 8); row.addEventListener('click', () => closeSheets()); body.append(h('div', {}, h('h3', {}, 'More by ' + first), row)); }
      const sim = d.similar.filter(x => x.id !== lead.id);
      if (sim.length) { const row = h('div', { class: 'hrow', 'aria-label': 'Similar books' }); fillRow(row, sim, null, 10); row.addEventListener('click', () => closeSheets()); body.append(h('div', {}, h('h3', {}, 'Similar to this'), row)); }
      root.hidden = false;
    })().catch(() => {});
    return root;
  }
  /* A passage the narrator did not read: shown as one quiet line, with the text a tap away. */
  function nnBlock(host, words) {
    const label = 'Not narrated \u00b7 ' + words + ' words \u00b7 tap to show';
    const body = h('div', { class: 'nn-body' }); body.hidden = true;
    const bar = h('button', { class: 'nn-bar', type: 'button', 'aria-expanded': 'false' }, label);
    bar.addEventListener('click', () => {
      const open = body.hidden; body.hidden = !open;
      bar.setAttribute('aria-expanded', open ? 'true' : 'false');
      bar.textContent = open ? 'Not narrated \u00b7 tap to hide' : label;
    });
    host.append(h('div', { class: 'nn' }, bar, body));
    return body;
  }
  /* ---------- building a chapter in steps ---------- */
  const RB_FIRST = 60;   // sentences built before the first paint of a long chapter
  /* Builds sentences of R.p from R.pos on: up to `stop` (an index into p.ids), and then, if `budget` (ms) is given,
     on until the time is used. Appends them to the page and carries open paragraphs over to the next call. */
  function buildSents(R, stop, budget) {
    const p = R.p, ids = p.ids, t0 = performance.now(), frag = document.createDocumentFragment(), touched = new Set(), first = R.pos === 0;
    while (R.pos < ids.length) {
      const id = ids[R.pos], s = S.model.sents[id];
      const skipIt = R.nn.has(id) && !s.h;
      if (skipIt && !R.nnBody) { R.nnBody = nnBlock(frag, R.nnWords.get(id) || 0); R.curP = -2; R.pEl = null; }
      else if (!skipIt && R.nnBody) { R.nnBody = null; R.curP = -2; R.pEl = null; }
      if (!s.h) { if (s.p !== R.qp) { R.qp = s.p; R.qst = 0; } const qr = quoteRanges(s.t, R.qst); R.qst = qr.st; s.q = qr.r.length ? qr.r : null; }
      const sp = h('span', { class: 's', 'data-i': String(id), text: s.t });
      if (s.q) fillSentence(sp, s);
      S.spans.set(id, sp);
      if (S.chMark && S.chMark.m === S.model && S.chMark.ids.has(id)) sp.classList.add('chm');
      if (s.h) { frag.append(h('h2', { class: 'chap' }, sp)); const sm = chapSummary(s.ch); if (sm) frag.append(sm); R.curP = -2; R.pEl = null; }
      else {
        if (s.p !== R.curP) { R.pEl = h('p'); (R.nnBody || frag).append(R.pEl); R.curP = s.p; R.pCur = { e: R.pEl, n: 0 }; } else R.pEl.append(' ');
        R.pCur.n += s.t.length + 1; touched.add(R.pCur);
        R.pEl.append(sp);
      }
      if (!s.h && !skipIt && S.model.chapters[s.ch] && S.model.chapters[s.ch].end === id + 1) { const qc = quizCard(s.ch); if (qc) { (R.nnBody || frag).append(qc); R.curP = -2; R.pEl = null; } }
      R.pos++;
      if (R.pos >= stop && (budget == null || performance.now() - t0 >= budget)) break;
    }
    const done = R.pos >= ids.length;
    if (done && R.i === S.secs.length - 1 && S.book) frag.append(finishCard(S.book));
    if (R.useCv) for (const q of touched) q.e.style.setProperty('--pn', String(Math.max(1, Math.ceil(q.n / R.cpl))));
    el.page.append(frag);
    if (done) { clearTimeout(R.tid); if (S.rb === R) S.rb = null; }
    if (!first && typeof hlPaint === 'function') hlPaint();   // highlights and notes on the sentences just added
  }
  function rbNext(R) {
    R.tid = setTimeout(() => {
      if (S.rb !== R) return;
      buildSents(R, 0, 8);
      if (S.rb === R) rbNext(R);
    }, 0);
  }
  /* The span of a sentence; if its chapter is still being built, builds up to it first. */
  function spanById(id) {
    let sp = S.spans.get(id);
    const R = S.rb;
    if (!sp && R && S.sentSec && S.sentSec[id] === R.i && S.sentPos[id] >= R.pos) { buildSents(R, S.sentPos[id] + 20, null); sp = S.spans.get(id); }
    return sp;
  }
  function renderSection(i) {
    if (S.rb) { clearTimeout(S.rb.tid); S.rb = null; }
    el.page.textContent = ''; el.page.classList.remove('cv'); S.spans.clear(); S.curId = -1;
    S.wSp = null; S.wEls = null; S.wTimes = null; S.wId = -1; S.wIdx = -1;
    setTimeout(() => enqueueAlign(S.sec, true), 0);
    setTimeout(() => backfillSkip(i), 0);
    if (!S.model) { el.page.append(S.note || loadingNote()); return; }
    const p = S.plan[i];
    if ((!p || !p.ids.length) && !(S.durs[i] > 0)) {
      /* Track length not known yet (it arrives with the audio): the plan is empty only for the moment, so do not claim there is no text. */
      el.page.append(h('div', { class: 'note', role: 'status' }, h('strong', {}, 'Loading the track\u2026')));
      updateHeader(); return;
    }
    if (!p || !p.ids.length) {
      if (trkLoading(i)) {
        el.page.append(tmWaitNode(i));
        updateHeader(); return;
      }
      if (TM.fail) { el.page.append(noteNode("Couldn't reach timing. Try again", [['Try again', retryTiming], ['Choose text', () => openSheet('sheet-text')]], 'The shared timing could not be loaded. Check your connection.')); updateHeader(); return; }
      el.page.append(noteNode('No text is lined up with this track.', [['Choose text', () => openSheet('sheet-text')]]));
      updateHeader(); return;
    }
    const useCv = p.ids.length > 150 && typeof CSS !== 'undefined' && CSS.supports && CSS.supports('content-visibility', 'auto');
    const nn = P.foldSkipped === true && S.nn ? S.nn : new Set(), nnWords = new Map();   // off by default: the text stays in the reader
    { let st = -1, w = 0; for (const id of p.ids) { const x = S.model.sents[id]; if (nn.has(id) && !x.h) { if (st < 0) { st = id; w = 0; } w += (x.t.match(/\S+/g) || []).length; nnWords.set(st, w); } else st = -1; } }
    /* R remembers where the building of this chapter has got to, so it can go on in small steps. */
    const R = { i, p, pos: 0, curP: -2, pEl: null, qp: -2, qst: 0, pCur: null, nnBody: null, nn, nnWords, useCv, cpl: 24, tid: 0 };
    if (useCv) { // guess each paragraph's height from its length, so the scroll bar is about right before it is drawn
      const fs = parseFloat(getComputedStyle(el.page).fontSize) || 17;
      R.cpl = Math.max(24, Math.min(90, Math.floor(((el.page.clientWidth || 360) - 40) / (fs * 0.5))));
      el.page.classList.add('cv');
    }
    /* A long chapter is built in steps: the first screens at once, the rest a few milliseconds at a time, so the
       page never freezes. A sentence that is asked for before its turn (a saved place, a seek, a tap in a list)
       is built on the spot by spanById(). A short chapter is still built in one go. */
    S.rb = R;
    buildSents(R, p.ids.length > 150 ? RB_FIRST : p.ids.length, null);
    if (S.rb === R) rbNext(R);
    scrollStop(); el.reader.scrollTop = 0;
    S.follow = true; el.follow.hidden = true;
    updateHeader();
    S.jump = true; try { tick(true); } finally { S.jump = false; }
  }
  guideDoc('reading', 'Follow the highlight', "The current sentence is highlighted and the page scrolls with it. After you scroll away, tap Back to narrator to return.");
  guideDoc('reading', 'Tap a sentence', "Tap jumps the audio to that sentence. Double-tap the sentence you hear right now and the app lines the highlight up again if it has drifted.");
  /* ---------- following the highlight ----------
     The reader keeps what is being read inside a comfort zone: a band of the visible page from ZONE.top to
     ZONE.bottom (fractions of its height). While the highlight stays in the band nothing moves. When it
     leaves (it runs past the bottom, or a seek puts it above the top), the page glides until the line sits
     at ZONE.anchor, which leaves room to read on before the next move. The glide is one spring that keeps its
     speed when a new target arrives, so moves never restart or stutter. A glide that is already on its way
     to a place that holds the highlight is left alone. Long jumps, new tracks and reduced-motion settings
     move at once. */
  const ZONE = { top: 0.15, bottom: 0.65, anchor: 0.30 };
  const SCR = { raf: 0, pos: 0, vel: 0, target: 0, last: 0 };
  function scrollStop() { if (SCR.raf) cancelAnimationFrame(SCR.raf); SCR.raf = 0; SCR.vel = 0; }
  function scrollGlide(to, instant) {
    const r = el.reader, max = Math.max(0, r.scrollHeight - r.clientHeight);
    to = Math.min(max, Math.max(0, to));
    if (instant || reduceMotion || Math.abs(to - r.scrollTop) > r.clientHeight * 1.2) { scrollStop(); r.scrollTop = to; return; }
    if (!SCR.raf && Math.abs(to - r.scrollTop) < 1) return;
    SCR.target = to;
    if (SCR.raf) return;
    SCR.pos = r.scrollTop; SCR.vel = 0; SCR.last = performance.now();
    const step = now => {
      const dt = Math.min(0.05, Math.max(0.001, (now - SCR.last) / 1000)); SCR.last = now;
      // critically damped spring toward the target (settles in about 0.4 s)
      const om = 2 / 0.16, x = om * dt, ex = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
      const ch = SCR.pos - SCR.target, tmp = (SCR.vel + om * ch) * dt;
      SCR.vel = (SCR.vel - om * tmp) * ex;
      SCR.pos = SCR.target + (ch + tmp) * ex;
      if (Math.abs(SCR.pos - SCR.target) < 1.2 && Math.abs(SCR.vel) < 40) { r.scrollTop = SCR.target; SCR.raf = 0; SCR.vel = 0; return; }
      r.scrollTop = SCR.pos;
      SCR.raf = requestAnimationFrame(step);
    };
    SCR.raf = requestAnimationFrame(step);
  }
  /* What the zone is measured against: the word being read when there is one, else the sentence. */
  function focusOf(sp) { return sp === S.wSp && S.wEls && S.wIdx >= 0 && S.wEls[S.wIdx] ? S.wEls[S.wIdx] : sp; }
  /* Measuring the page right after changing it makes the browser lay it out on the spot, and a new sentence
     asks twice (once for the sentence, once for its first word). So the request is only noted here, and the
     measuring happens once, a moment later, when everything else done in the same turn has been changed.
     Nothing waits a frame, so a jump to a saved place still lands before the first paint. The last request
     wins. Switched off in Settings > Advanced, it measures at once, as before. */
  const EV = { el: null, instant: false, queued: false };
  const later = window.queueMicrotask ? window.queueMicrotask.bind(window) : f => Promise.resolve().then(f);
  function ensureVisible(sp, instant) {
    if (P.layoutBatch === false) { ensureVisibleNow(sp, instant); return; }
    EV.el = sp; EV.instant = EV.instant || !!instant || !!S.jump;
    if (EV.queued) return;
    EV.queued = true;
    later(() => {
      let e = EV.el; const ins = EV.instant;
      EV.el = null; EV.instant = false; EV.queued = false;
      if (!e || !e.isConnected) e = S.spans.get(S.curId); // the word span was swapped out meanwhile
      if (e && e.isConnected) ensureVisibleNow(e, ins);
    });
  }
  function ensureVisibleNow(sp, instant) {
    if (sp && sp.closest && sp.closest('.nn-body[hidden]')) return;
    const r = el.reader, rr = r.getBoundingClientRect(), sr = focusOf(sp).getBoundingClientRect();
    const H = rr.height, base = SCR.raf ? SCR.target : r.scrollTop;
    const shift = base - r.scrollTop; // how far a glide in flight will still move the page
    const top = sr.top - rr.top - shift, bottom = sr.bottom - rr.top - shift;
    const zt = H * ZONE.top, zb = H * ZONE.bottom;
    // Something taller than the zone cannot fit it, so it only has to start inside it.
    const fits = top >= zt && (bottom - top > zb - zt ? top < zb : bottom <= zb);
    if (fits) return;
    scrollGlide(base + top - H * ZONE.anchor, instant || S.jump);
  }
  guideDoc('reading', 'Word highlight', "Settings > Reading can highlight each word as it is read. Word timing + and - corrects a small gap. Books without exact word timing use estimates unless you turn that off.");
  /* ---------- word-level highlight ----------
     Exact word times only exist for tracks whose sentence times came from a timing file (S.tdone
     holds that exact anchor list). If the reader later taps a sync point, the anchors change, the
     check fails, and the highlight falls back to whole sentences. Only the sentence being read is
     split into word spans, and it is put back to plain text when the reading moves on. */
  function wordTimesFor(id) {
    const sec = S.sentSec ? S.sentSec[id] : -1;
    if (sec == null || sec < 0) return null;
    const tm = S.tdone.get(sec);
    if (!tm || tm !== S.anchors[sec]) return null;
    const w = S.wordT[sec];
    return (w && w[id]) || null;
  }
  /* Estimated word times, for sentences without exact ones. The sentence's own start and end on the track
     (from the sentence timing, which may itself be an estimate) are shared out between its words by their
     length in syllables, with a short pause after commas and a longer one after stops inside the sentence.
     The result has one start time per word, in the same form as the exact ones. */
  const WORD_RE = /[a-z0-9]+(?:['\u2019][a-z]+)?/gi;
  const westCache = new Map();
  function wordTimesEst(id) {
    const sec = S.sentSec ? S.sentSec[id] : -1;
    if (sec == null || sec < 0 || !S.model || !S.model.sents[id]) return null;
    const p = S.plan[sec], k = S.sentPos[id];
    if (!p || k == null || k < 0 || p.starts[k] == null) return null;
    const a = p.starts[k], text = S.model.sents[id].t;
    const dur = S.durs[sec] || 0;
    const tail = Math.min(14, Math.max(1.5, text.length / 14)); // last sentence of a track: about 14 characters a second
    const b = k + 1 < p.starts.length ? p.starts[k + 1] : (dur > a ? Math.min(dur, a + tail) : a + tail);
    if (!(b > a + 0.3)) return null;
    const key = S.book.id + ':' + sec + ':' + id + ':' + a.toFixed(2) + ':' + b.toFixed(2);
    const hit = westCache.get(key);
    if (hit) return hit;
    const parts = []; let m; WORD_RE.lastIndex = 0;
    while ((m = WORD_RE.exec(text))) parts.push([m.index, m[0]]);
    if (!parts.length) return null;
    /* Same pace model as the sentence timing (Core.spokenCost): 0.21 s a syllable, small pauses at commas,
       colons and dashes, then a pause at the end of the sentence (longer at the end of a paragraph). Only the
       speaking part of the sentence is shared out between the words; the closing pause is left at the end. */
    const sents = S.model.sents, here = sents[id], nextS = sents[id + 1];
    const paraEnd = !nextS || nextS.p !== here.p;
    const total = Core.spokenCost(text, { paraEnd });
    const closing = (/[.!?]["\u201d\u2019')\]]*$/.test(text) ? 0.45 : 0) + (paraEnd ? 0.45 : 0) + 0.08;
    const w = []; let sum = 0;
    parts.forEach(([at, word], i) => {
      const nx = text.slice(at + word.length, at + word.length + 3);
      let wt = Math.max(1, Core.syllables(word)) * 0.21;
      if (i < parts.length - 1 || !closing) {
        if (/^["\u201d\u2019')]*,/.test(nx)) wt += 0.17;
        else if (/^["\u201d\u2019')]*[;:]/.test(nx)) wt += 0.3;
        else if (/^\s*(\u2014|\u2013|--)/.test(nx) || /^(\u2014|\u2013|--)/.test(nx)) wt += 0.2;
        else if (/^["\u201d\u2019')]*[.!?\u2026]/.test(nx)) wt += 0.45;
      }
      w.push(wt); sum += wt;
    });
    const speechFrac = Math.max(0.55, Math.min(0.97, (total - closing) / total));
    const span = (b - a) * speechFrac;
    let acc = 0;
    const times = w.map(x => { const t = +(a + span * acc / sum).toFixed(2); acc += x; return t; });
    if (westCache.size > 400) westCache.clear();
    westCache.set(key, times);
    return times;
  }
  /* what the reader follows: exact word times if the book has them, else estimates (unless that is turned off) */
  function wordTimesAny(id) { return wordTimesFor(id) || (P.wordEst === false ? null : wordTimesEst(id)); }
  guideDoc('reading', 'Dialogue', "Quoted speech can be tinted, italic or left plain (Settings > Reading).");
  /* ---------- Dialogue marking: which parts of a sentence are quoted speech ---------- */
  /* st carries an open quote from the sentence before it in the same paragraph: 0 none, 1 double, 2 single.
     Returns the quoted [from, to) ranges of the text and the state at its end. */
  function quoteRanges(t, st) {
    const r = []; let a = st ? 0 : -1;
    const letter = ch => /[\p{L}\p{N}]/u.test(ch || ' ');
    for (let i = 0; i < t.length; i++) {
      const c = t[i];
      if (c === '\u201c') { if (!st) { st = 1; a = i; } }
      else if (c === '\u201d') { if (st === 1) { r.push([a, i + 1]); st = 0; a = -1; } }
      else if (c === '"') { if (!st) { st = 1; a = i; } else if (st === 1) { r.push([a, i + 1]); st = 0; a = -1; } }
      else if (c === '\u2018') { if (!st && !letter(t[i - 1])) { st = 2; a = i; } }
      else if (c === '\u2019') { if (st === 2 && !letter(t[i + 1])) { r.push([a, i + 1]); st = 0; a = -1; } }
    }
    if (st) r.push([a, t.length]);
    return { r, st };
  }
  function qIn(qr, pos) { return !!qr && qr.some(x => pos >= x[0] && pos < x[1]); }
  /* text[from, to) as plain strings and <span class="q"> pieces for the quoted parts */
  function plainNodes(t, qr, from, to) {
    if (!qr) return [t.slice(from, to)];
    const cuts = new Set([from, to]);
    for (const [a, b] of qr) { if (a > from && a < to) cuts.add(a); if (b > from && b < to) cuts.add(b); }
    const xs = [...cuts].sort((x, y) => x - y), out = [];
    for (let i = 0; i + 1 < xs.length; i++) {
      const seg = t.slice(xs[i], xs[i + 1]);
      out.push(qIn(qr, xs[i]) ? h('span', { class: 'q' }, seg) : seg);
    }
    return out;
  }
  function fillSentence(sp, s) { sp.textContent = ''; sp.append(...plainNodes(s.t, s.q, 0, s.t.length)); }
  function dlgApply() { document.documentElement.dataset.dlg = P.dlg; }
  function dlgButtons() { $$('#seg-dlg button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === P.dlg))); }
  function dlgInit() {
    dlgApply(); dlgButtons();
    $$('#seg-dlg button').forEach(b => b.addEventListener('click', () => { P.dlg = b.dataset.v; savePrefs(); dlgApply(); dlgButtons(); }));
  }

  function unwrapWords() {
    const sp = S.wSp;
    if (sp && S.model && S.model.sents[S.wId]) { fillSentence(sp, S.model.sents[S.wId]); sp.classList.remove('hw'); }
    S.wSp = null; S.wEls = null; S.wTimes = null; S.wId = -1; S.wIdx = -1;
  }
  function wrapWords(sp, id) {
    if (P.wordHl === false) return; // word-by-word tracking is switched off in Settings
    const times = wordTimesAny(id);
    if (!times) return;
    const text = S.model.sents[id].t, re = /[a-z0-9]+(?:['’][a-z]+)?/gi, parts = [];
    let m;
    while ((m = re.exec(text))) parts.push([m.index, m.index + m[0].length]);
    if (parts.length !== times.length) return; // text and timing disagree: stay on sentence level
    const qr = S.model.sents[id].q, frag = document.createDocumentFragment(), els = [];
    let last = 0;
    for (const [a, b] of parts) {
      if (a > last) frag.append(...plainNodes(text, qr, last, a));
      const w = h('span', { class: qIn(qr, a) ? 'w q' : 'w' }, text.slice(a, b));
      frag.append(w); els.push(w); last = b;
    }
    if (last < text.length) frag.append(...plainNodes(text, qr, last, text.length));
    sp.textContent = ''; sp.append(frag); sp.classList.add('hw');
    S.wSp = sp; S.wEls = els; S.wTimes = times; S.wId = id; S.wIdx = -1;
    { const q = S.plan[S.sentSec[id]]; S.wEstA = wordTimesFor(id) || !q ? null : q.starts[S.sentPos[id]]; } // set when these are estimates
  }
  function paintWord(k) {
    const els = S.wEls;
    if (!els || k === S.wIdx) return;
    const prev = S.wIdx;
    if (prev >= 0 && els[prev]) els[prev].classList.remove('on');
    if (k >= 0 && els[k]) {
      els[k].classList.add('on');
      if (prev >= 0 && S.follow) ensureVisible(els[k]); // long sentences can wrap past the visible band
    }
    S.wIdx = k;
  }
  function setCurrent(id, scroll) {
    $$('.s.now', el.page).forEach(n => n.classList.remove('now', 'est'));
    if (S.wSp && (S.wId !== id || !wordTimesAny(id))) unwrapWords();
    rcWatch(S.curId, id);
    S.curId = id;
    ambStory(id);
    updateSyncUI();
    if (P.liveTr) ltUpdate();
    const sp = spanById(id);
    if (!sp) return;
    sp.classList.add('now');
    if (!S.wSp) wrapWords(sp, id);
    if (scroll && S.follow) ensureVisible(sp);
  }
  /* The position the reader should show. While a track is still loading (or a resume position is
     waiting to be applied) audio.currentTime reads 0, so the saved position is used instead. */
  function nowT() { return (S.loadingAudio || S.pendingSeek > 0) ? S.pendingSeek : audio.currentTime; }
  function tick(force) {
    if (S.sleep === 'chapter' && S.book && !audio.paused && !audio.seeking) {
      const c = cutFor(S.sec), end = c && c[1] != null ? c[1] : audio.duration, rem = end - audio.currentTime;
      if (isFinite(rem) && rem >= 0 && rem < FADE_SECS) { S.tailFade = true; setVol(fadeCurve(rem / FADE_SECS)); }
      else if (S.tailFade) { S.tailFade = false; setVol(1); }
    }
    if (!S.outroHit && S.book && !audio.paused && !S.loadingAudio && !audio.seeking) {
      const c = cutFor(S.sec);
      if (c && c[1] != null && audio.currentTime >= c[1]) {
        S.outroHit = true; // once per track load
        lpDone(S.sec);
        if (S.sleep === 'chapter') { AMB.slow = MUS.slow = true; audio.pause(); setSleep(0); toast('Sleep timer: stopped at the end of the track.'); persist(); return; }
        if (S.sec < S.secs.length - 1) { goTrack(S.sec + 1, 0, true, true); return; }
      }
    }
    if (S.model && !audio.paused && S.sec < S.secs.length - 1 && isFinite(audio.duration) && audio.duration - audio.currentTime < 90) enqueueAlign(S.sec + 1);
    else if (S.model && P.smartSync !== false && P.fastCheck !== false && !audio.paused && !job.running && !S.aligning && audio.currentTime > 30 && (S.autoSrc[S.sec] === 'full' || S.autoTried.has(S.sec)) && bgAllowed()) {
      // check ahead: one track at a time, the next two, only when the connection setting allows
      for (let n = S.sec + 1; n <= S.sec + 2 && n < S.secs.length; n++) if (!S.autoTried.has(n)) { enqueueAlign(n); break; }
    }
    const p = S.plan[S.sec];
    if (!p || !p.ids.length) return;
    const k = Core.locate(p.starts, nowT() + P.nudge);
    const id = p.ids[k];
    if (id !== S.curId || force) setCurrent(id, true);
    if (S.wEls) {
      if (S.wEstA != null) { // the sentence timing moved (a resync, a new sync file): re-estimate the words
        const q = S.plan[S.sentSec[S.wId]], a2 = q ? q.starts[S.sentPos[S.wId]] : null;
        if (a2 != null && a2 !== S.wEstA) { const nt = wordTimesEst(S.wId); if (nt && nt.length === S.wEls.length) S.wTimes = nt; S.wEstA = a2; }
      }
      const t = nowT() + P.nudge + (P.wordShift || 0);
      paintWord(t < S.wTimes[0] - 0.35 ? -1 : Core.locate(S.wTimes, t));
    }
  }
  function checkFollowPill() {
    const sp = S.spans.get(S.curId);
    if (!sp || S.follow) { el.follow.hidden = true; return; }
    const rr = el.reader.getBoundingClientRect(), sr = sp.getBoundingClientRect();
    el.follow.hidden = sr.bottom > rr.top && sr.top < rr.bottom;
  }

  guideDoc('player', 'Play, pause and skip', "The big round button plays and pauses (Space on a computer). Back or forward 15 seconds, or previous and next sentence. Previous and next track change track. Drag the line to move within the track.");
  /* ---------- audio ---------- */
  function loadAudio(i, time, autoplay) {
    S.sec = i; S.outroHit = false;
    if (!time) { const c = cutFor(i); if (c && c[0] > 0) time = c[0]; } // fresh start: skip the spoken intro
    S.pendingSeek = time || 0;
    S.loadingAudio = true; S.resnap = true; driftHold();
    audio.defaultPlaybackRate = P.speed;
    if (wantGraph()) audio.crossOrigin = 'anonymous'; else if (!vgraph) audio.removeAttribute('crossorigin');
    S.vizSrc = audio.crossOrigin === 'anonymous';
    const my = ++srcSeq, id = S.book.id, url = S.secs[i].url;
    const local = isLocal(id, i, url), cached = local ? dlUrls.get(dlKey(id, i)) : '';
    if (cached) audio.src = cached;
    else if (!local) audio.src = px(url);
    else { audio.removeAttribute('src'); audio.load(); } // saved copy: its blob URL is made first
    audio.playbackRate = P.speed;
    try { audio.preservesPitch = true; } catch (e) { /* older browsers */ }
    el.seek.max = S.durs[i] || 100;
    updateSeekUI(time || 0);
    renderSection(i); updateHeader(); markTracks(); setMediaSession(); paintSkipIntro(); neKick(i);
    if (cached || !local) { if (autoplay) audio.play().catch(onPlayFail); }
    else warmUrl(id, i).then(u => {
      if (my !== srcSeq) return; // another track was chosen meanwhile
      if (!u) { dlDropTrack(id, i); u = px(url); } // the saved copy cannot be read: use the network
      audio.src = u; audio.playbackRate = P.speed;
      if (autoplay) audio.play().catch(onPlayFail);
    });
    dlWarmAround(i);
    posPlayback(); posState();
  }
  function onPlayFail(e) { if (e && e.name === 'NotAllowedError') toast('Tap play to start.'); else toast('This track could not be played. Check your connection.'); }
  function goTrack(i, time, autoplay, auto) {
    if (i < 0 || i >= S.secs.length) return;
    if (!auto && !audio.ended) trJump(i, time || 0);
    loadAudio(i, time || 0, autoplay == null ? !audio.paused : autoplay);
    persist();
  }
  function updateSeekUI(t) {
    const d = (isFinite(audio.duration) && audio.duration > 0) ? audio.duration : (S.durs[S.sec] || 0);
    el.cur.textContent = fmt(t);
    el.left.textContent = '-' + fmt(Math.max(0, d - t));
    if (!S.seeking) el.seek.value = t;
    el.seek.style.setProperty('--fill', (d ? Math.min(100, t / d * 100) : 0) + '%');
    nrSeekUI(t, d);
    try { dtSeekSync(t, d); } catch (e) { /* desktop bar not ready */ }
    lpNote();
    paintBookProg();
  }
  let raf = 0, rafT = 0, lastSeekTick = -1;
  function stopLoop() { cancelAnimationFrame(raf); clearTimeout(rafT); rafT = 0; }
  function loop() {
    rafT = 0;
    tick(false); if (!el.player.hidden) vizFrame();
    const q = Math.floor(audio.currentTime * 4);
    if (q !== lastSeekTick && !S.seeking) { lastSeekTick = q; updateSeekUI(audio.currentTime); if (el.player.hidden) miniProgress(); }
    if (audio.currentTime > (audio.duration || 1e9) - 25) preloadNext();
    /* Lower power: when the sound wave is not being drawn, check the highlight about 20 times a second instead of 60 (the screen never needs more). Hidden page: unchanged (frames pause). */
    if (P.lowPower !== false && !document.hidden && !(vgraph && vizOn() && !el.player.hidden)) rafT = setTimeout(loop, 50);
    else raf = requestAnimationFrame(loop);
  }
  let preloaded = '';
  const pre = new Audio();
  function preloadNext() {
    const n = S.secs[S.sec + 1];
    if (!n) return;
    if (isLocal(S.book.id, S.sec + 1, n.url)) { if (!dlUrls.has(dlKey(S.book.id, S.sec + 1))) warmUrl(S.book.id, S.sec + 1); return; } // saved: nothing to buffer
    if (preloaded !== n.url) { preloaded = n.url; pre.preload = 'auto'; pre.src = px(n.url); }
  }
  guideDoc('audio', 'Sound wave', "A live bar or wave display above the controls. Switch it between Bars, Wave and Off in Settings > Audio.");
  /* ---------- Sound-wave visualizer ----------
     Taps the audio element with a Web Audio analyser. That needs CORS-clean audio (crossorigin), so
     if the first load fails with it, we retry once without and switch the visualizer off. The graph is
     only built once playback is already running and the AudioContext is running, so it cannot silence
     the narrator. "Off" never touches Web Audio. */
  let vctx = null, vgraph = null, vdata = null, vlast = 0, vcol = '#17665F', vcolAt = 0;
  const vz = el.viz, v2d = vz.getContext('2d');
  const vizOn = () => P.viz !== 'off' && !S.vizFail;
  function vizLayout() { vz.hidden = !vizOn(); }
  function vizButtons() { $$('#seg-viz button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === P.viz))); }
  function vizSize() {
    const r = vz.getBoundingClientRect(), d = Math.min(window.devicePixelRatio || 1, 2);
    vz.width = Math.max(1, Math.round(r.width * d)); vz.height = Math.max(1, Math.round(r.height * d));
  }
  function vizPrime() {            // call from a user gesture so the context can start
    if (vctx) { if (vctx.state !== 'running') vctx.resume().catch(() => {}); return; }
    if (!wantGraph()) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { S.vizFail = true; vizLayout(); return; }
    try { vctx = new AC(); vctx.resume().catch(() => {}); } catch (e) { S.vizFail = true; vizLayout(); }
  }
  function vizTryBuild() {
    if (vgraph || !wantGraph() || !vctx || !S.vizSrc || audio.crossOrigin !== 'anonymous') return;
    vctx.resume().then(() => {
      if (vgraph || vctx.state !== 'running') return;
      try {
        const src = vctx.createMediaElementSource(audio), an = vctx.createAnalyser();
        an.fftSize = 1024; an.smoothingTimeConstant = 0.72;
        src.connect(an); enhBuild(src);
        vgraph = an; vdata = new Uint8Array(1024);
        vctx.onstatechange = () => { if (vctx.state !== 'running' && !audio.paused) vctx.resume().catch(() => {}); };
      } catch (e) { /* leave normal playback untouched */ }
    }).catch(() => {});
  }
  guideDoc('audio', 'Audio enhancer', "Clear voice, Night, Voice boost, Old recording or Low quality presets (Settings > Audio). Low quality adds a mid-scoop to clear boxy room resonance and a heavier hiss cut for the noisiest recordings.");
  /* ---------- Audio enhancer ---------- */
  const wantGraph = () => (P.viz !== 'off' || P.enh !== 'off' || P.silence || P.level || P.mono || +P.balance) && !S.vizFail;
  let enh = null;
  const ENH = {
    /* mid: peaking cut at ~500 Hz (boxy/room resonance). 0 = bypassed. */
    off:     { hp: 10,  pres: 0,   lo: 0,  mid: 0,    thr: 0,   ratio: 1, gain: 1,    lim: 0,  lp: 20000, hs: 0 },
    clear:   { hp: 90,  pres: 3.5, lo: -2, mid: 0,    thr: -26, ratio: 3, gain: 1.25, lim: -2, lp: 20000, hs: 0 },
    night:   { hp: 110, pres: 2.5, lo: -4, mid: 0,    thr: -34, ratio: 6, gain: 1.9,  lim: -2, lp: 20000, hs: 0 },
    voice:   { hp: 120, pres: 6,   lo: -4, mid: 0,    thr: -32, ratio: 4, gain: 1.4,  lim: -2, lp: 20000, hs: 0 },
    /* Old recordings: rumble cut (hp 110 Hz + low shelf), hiss cut (lp 6.5 kHz + high shelf),
       presence lift so the voice stays clear, light levelling. */
    restore: { hp: 110, pres: 3,   lo: -5, mid: -2,   thr: -30, ratio: 3, gain: 1.35, lim: -2, lp: 6500,  hs: -5 },
    /* Low-quality recordings: heavy rumble cut, aggressive hiss cut, a mid-scoop to clear boxy room resonance,
       strong presence lift to recover voice intelligibility, high compression to even out level swings. */
    lowq:    { hp: 130, pres: 5,   lo: -7, mid: -4.5, thr: -28, ratio: 5, gain: 1.5,  lim: -2, lp: 5500,  hs: -8 }
  };
  function enhBuild(src) {
    const c = vctx;
    const lev = c.createGain();
    const hp = c.createBiquadFilter(); hp.type = 'highpass';
    const lo = c.createBiquadFilter(); lo.type = 'lowshelf'; lo.frequency.value = 200;
    const mid = c.createBiquadFilter(); mid.type = 'peaking'; mid.frequency.value = 500; mid.Q.value = 1.2; // boxy/room resonance cut
    const pres = c.createBiquadFilter(); pres.type = 'peaking'; pres.frequency.value = 3000; pres.Q.value = 0.9;
    const hs = c.createBiquadFilter(); hs.type = 'highshelf'; hs.frequency.value = 5000;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 0.5; lp.frequency.value = 20000;
    const comp = c.createDynamicsCompressor(); comp.knee.value = 20; comp.attack.value = 0.01; comp.release.value = 0.25;
    const gain = c.createGain();
    const lim = c.createDynamicsCompressor(); lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.003; lim.release.value = 0.1;
    src.connect(lev); lev.connect(hp); hp.connect(lo); lo.connect(mid); mid.connect(pres); pres.connect(hs); hs.connect(lp); lp.connect(comp); comp.connect(gain); gain.connect(lim);
    const mix = c.createGain(); mix.channelCountMode = 'explicit'; mix.channelInterpretation = 'speakers'; mix.channelCount = 2;
    const pan = c.createStereoPanner ? c.createStereoPanner() : null;  // older browsers: no balance, mono still works
    lim.connect(mix); if (pan) { mix.connect(pan); pan.connect(c.destination); } else mix.connect(c.destination);
    enh = { mix, pan, lev, hp, lo, mid, pres, hs, lp, comp, gain, lim };
    enhApply();
  }
  function enhApply() {
    if (!enh) return;
    const p = ENH[P.enh] || ENH.off;
    enh.hp.frequency.value = p.hp; enh.lo.gain.value = p.lo; enh.mid.gain.value = p.mid || 0;
    enh.pres.gain.value = p.pres; enh.hs.gain.value = p.hs;
    enh.lp.frequency.value = p.lp;
    enh.comp.threshold.value = p.thr; enh.comp.ratio.value = p.ratio;
    enh.gain.gain.setTargetAtTime(p.gain, vctx.currentTime, 0.05);
    enh.mix.channelCount = P.mono ? 1 : 2;           // 1 = both channels mixed into one
    if (enh.pan) enh.pan.pan.value = Math.max(-1, Math.min(1, +P.balance || 0));
    enh.lim.threshold.value = P.level ? Math.min(p.lim, -2) : p.lim; // headroom for the evener's boost
  }
  function enhButtons() { $$('#seg-enh button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === P.enh))); }
  function enhSet(v) {
    P.enh = v; savePrefs(); enhButtons();
    if (v === 'off' || vgraph) { enhApply(); return; }
    vizPrime();
    if (S.book && !S.vizFail && audio.crossOrigin !== 'anonymous') vizReload();
    else if (!audio.paused) vizTryBuild();
  }
  function vizCorsRetry() {
    if (vgraph || audio.crossOrigin !== 'anonymous' || S.vizFail || !S.book) return false;
    S.vizFail = true; vizLayout();
    const t = audio.currentTime || S.pendingSeek || 0, was = !audio.paused;
    audio.removeAttribute('crossorigin'); S.vizSrc = false; S.pendingSeek = t;
    audio.src = curSrc();
    if (was) audio.play().catch(onPlayFail);
    const what = (P.enh !== 'off' || P.level || P.mono || +P.balance) ? (P.viz !== 'off' ? 'Audio enhancer and sound wave are' : 'Audio enhancer is') : 'Sound wave is';
    toast(what + ' not available for this audio source.');
    return true;
  }
  function vizReload() {           // switch an already-loaded track to CORS mode
    const t = audio.currentTime || 0, was = !audio.paused;
    audio.crossOrigin = 'anonymous'; S.vizSrc = true; S.pendingSeek = t;
    audio.src = curSrc();
    if (was) audio.play().catch(onPlayFail);
  }
  function vizSet(v) {
    P.viz = v; savePrefs(); vizLayout(); vizButtons();
    if (v === 'off') return;
    vizPrime();
    if (S.book && !vgraph && !S.vizFail && audio.crossOrigin !== 'anonymous') vizReload();
    else if (!audio.paused) vizTryBuild();
    vizIdle();
  }
  function vizDraw(live) {
    const W = vz.width, H = vz.height;
    if (W < 4 || H < 4) return;
    const now = performance.now();
    if (now - vcolAt > 1000) { vcol = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || vcol; vcolAt = now; }
    v2d.clearRect(0, 0, W, H);
    v2d.strokeStyle = vcol; v2d.lineCap = 'round'; v2d.lineJoin = 'round';
    const cy = H / 2, d = H / 32;
    if (P.viz === 'wave') {
      v2d.lineWidth = 2 * d; v2d.globalAlpha = live ? 1 : 0.35;
      v2d.beginPath();
      if (live) {
        vgraph.getByteTimeDomainData(vdata);
        for (let i = 0; i < 1024; i += 4) {
          const a = Math.max(-1, Math.min(1, (vdata[i] - 128) / 128 * 3));
          const x = i / 1023 * W, y = cy + a * (cy - 2 * d);
          if (i) v2d.lineTo(x, y); else v2d.moveTo(x, y);
        }
      } else { v2d.moveTo(0, cy); v2d.lineTo(W, cy); }
      v2d.stroke();
    } else {
      const N = 40, gap = W / N, bw = gap * 0.5;
      v2d.lineWidth = bw;
      if (live) vgraph.getByteFrequencyData(vdata);
      for (let i = 0; i < N; i++) {
        let v = 0;
        if (live) {
          const a = Math.round(2 * Math.pow(95, i / N)), b = Math.max(a + 1, Math.round(2 * Math.pow(95, (i + 1) / N)));
          for (let k = a; k < b; k++) if (vdata[k] > v) v = vdata[k];
          v = Math.pow(v / 255, 1.4);
        }
        const h = Math.max(bw, v * (H - 2 * d)), x = gap * (i + 0.5);
        v2d.globalAlpha = live ? 0.35 + 0.65 * v : 0.35;
        v2d.beginPath(); v2d.moveTo(x, cy - h / 2 + bw / 2); v2d.lineTo(x, cy + h / 2 - bw / 2 + 0.01); v2d.stroke();
      }
    }
    v2d.globalAlpha = 1;
  }
  function vizFrame() {
    if (!vgraph || !vizOn() || audio.paused) return;
    const t = performance.now();
    if (t - vlast < (P.lowPower !== false ? 50 : 32)) return;
    vlast = t; vizDraw(true);
  }
  function vizIdle() { if (vizOn()) vizDraw(false); }
  function vizInit() {
    vizLayout(); vizButtons();
    enhButtons(); $$('#seg-enh button').forEach(b => b.addEventListener('click', () => enhSet(b.dataset.v)));
    $$('#seg-viz button').forEach(b => b.addEventListener('click', () => vizSet(b.dataset.v)));
    ['pointerup', 'click', 'touchend', 'keydown'].forEach(t => document.addEventListener(t, () => {
      if (el.player.hidden || !(vctx || wantGraph())) return;
      vizPrime(); if (!audio.paused) vizTryBuild();
    }, true));
    document.addEventListener('visibilitychange', () => { if (!document.hidden && vgraph && vctx.state !== 'running') vctx.resume().catch(() => {}); });
    if (window.ResizeObserver) new ResizeObserver(() => { vizSize(); if (audio.paused) vizIdle(); }).observe(vz);
    (window.requestIdleCallback || setTimeout)(vizIdle);   // first idle drawing waits until the browser is free, so it does not slow the start
  }

  function setPlayIcon(playing) {
    $('use', el.play).setAttribute('href', playing ? '#i-pause' : '#i-play');
    el.play.setAttribute('aria-label', playing ? 'Pause' : 'Play');
    nrPlay(playing);
    miniPlayIcon(playing);
    const tl = $('#track-list'); if (tl) tl.classList.toggle('is-playing', !!playing);
  }
  guideDoc('player', 'Smart skip-back', "After a pause, playing again rewinds a few seconds (up to 10 after a long break) so you hear the sentence you were in. Turn it off in Settings > Audio.");
  /* Smart skip-back: after a real pause, resuming rewinds a few seconds (more for a longer pause) so the
     sentence you were in is heard again. Ignored for track loads, seeks and the end of a track. */
  /* seconds to rewind: nothing for a blink, 2 s for a short pause, then 4 / 6 / 8 / 10 s as the pause gets longer (3 min, 15 min, 1 h) */
  function skipBackFor(ms) { return ms < 3000 ? 0 : ms < 60000 ? 2 : ms < 180000 ? 4 : ms < 900000 ? 6 : ms < 3600000 ? 8 : 10; }
  /* After closing or refreshing the app, opening the same book again rewinds from the moment it was paused or closed. */
  function resumeBack(b, t) {
    if (!(t > 0) || !b) return t;
    let r = null; try { r = store.get('wt:pauseT', null); } catch (e) { r = null; }
    if (!r || !r.t || String(r.id) !== String(b.id)) return t;
    try { store.set('wt:pauseT', { id: r.id, t: 0 }); } catch (e) { /* storage unavailable */ }   // used once, so a second refresh does not rewind again
    if (P.smartRewind === false) return t;
    const back = skipBackFor(Date.now() - r.t);
    const c = cutFor(S.sec), floor = c && c[0] > 0 ? c[0] : 0;
    return back && t > floor ? Math.max(floor, t - back) : t;
  }
  function smartSkipBack() {
    const at = S.pausedAt; S.pausedAt = 0;
    if (P.smartRewind === false || !at || !S.book || S.loadingAudio || S.pendingSeek > 0 || audio.seeking) return;
    const back = skipBackFor(Date.now() - at);
    if (!back) return;
    const c = cutFor(S.sec), floor = c && c[0] > 0 ? c[0] : 0;
    const t = audio.currentTime - back;
    if (audio.currentTime > floor && t >= 0) audio.currentTime = Math.max(floor, t);
  }
  audio.addEventListener('play', () => { hbSync(); setPlayIcon(true); smartSkipBack(); stopLoop(); loop(); if (vctx && vctx.state !== 'running') vctx.resume().catch(() => {}); });
  window.addEventListener('pagehide', () => { if (S.book && !audio.paused && !audio.ended) store.set('wt:pauseT', { id: S.book.id, t: Date.now() }); });
  audio.addEventListener('playing', () => { vizTryBuild(); if (S.resnap && !S.loadingAudio && !audio.seeking) { S.resnap = false; resnap(); } });
  audio.addEventListener('pause', () => { setPlayIcon(false); hbSync(); S.pausedAt = (S.book && !S.loadingAudio && !audio.ended && !audio.seeking && audio.currentTime > 0) ? Date.now() : 0; if (S.pausedAt) store.set('wt:pauseT', { id: S.book.id, t: S.pausedAt }); stopLoop(); updateSeekUI(audio.currentTime); persist(); vizIdle(); });
  /* Re-snap the highlight to the audio's real position. A seek is only really done once the browser
     has the data, so besides 'seeked' this also runs on 'canplay', 'playing' and the first
     'timeupdate' after a seek or track change (all gated by S.resnap, which those events clear). */
  function resnap() { tick(true); updateSeekUI(nowT()); }
  audio.addEventListener('timeupdate', () => {
    if (S.resnap && !audio.seeking && !S.loadingAudio) { S.resnap = false; resnap(); }
    else tick(false);
    if (audio.paused || document.hidden) updateSeekUI(nowT());
  });
  audio.addEventListener('seeked', () => { resnap(); });
  audio.addEventListener('canplay', () => { if (S.resnap && !S.loadingAudio) resnap(); });
  audio.addEventListener('loadedmetadata', () => {
    const d = audio.duration;
    if (isFinite(d) && d > 0) {
      el.seek.max = d;
      if (Math.abs(d - S.durs[S.sec]) > 0.4) { S.durs[S.sec] = d; if (S.model) replan(false); }
    }
    if (S.pendingSeek) { audio.currentTime = Math.min(S.pendingSeek, (isFinite(d) ? d : 1e9) - 0.1); S.pendingSeek = 0; }
    S.loadingAudio = false; S.resnap = true;
    updateSeekUI(audio.currentTime); tick(true);
  });
  audio.addEventListener('ended', () => {
    lpDone(S.sec);
    if (S.sleep === 'chapter') { AMB.slow = MUS.slow = true; setSleep(0); toast('Sleep timer: stopped at the end of the track.'); persist(); return; }
    if (S.sec < S.secs.length - 1) goTrack(S.sec + 1, 0, true, true);
    else { toast('You have finished this book.'); stFinish(); try { if (S.book) statSend(S.book.id, 'finish'); } catch (e) { /* stats are optional */ } persist(); setTimeout(() => { if (S.book && audio.ended && !sheetOpen() && P.calm !== true) nextOpen(true); }, 1200); }
  });
  /* Stats: count a listen after one minute of real playback (not seeking, not paused). */
  const STAT_T = { id: '', last: -1, sec: 0, done: '' };
  audio.addEventListener('timeupdate', () => {
    if (!S.book || audio.paused || audio.seeking) { STAT_T.last = -1; return; }
    const id = String(S.book.id);
    if (STAT_T.id !== id) { STAT_T.id = id; STAT_T.sec = 0; STAT_T.last = -1; }
    if (STAT_T.done === id) return;
    const t = audio.currentTime, d = t - STAT_T.last; STAT_T.last = t;
    if (d > 0 && d < 1.5) { STAT_T.sec += d; if (STAT_T.sec >= 60) { STAT_T.done = id; statSend(id, 'start'); } }
  });
  audio.addEventListener('error', () => { if (S.book && /^blob:/.test(audio.currentSrc || audio.src)) { dlBroken(S.sec); return; } if (vizCorsRetry()) return; S.loadingAudio = false; if (S.book) toast('This track could not be loaded. The file may be unavailable right now.', 4500); });

  function sentTime(p, k) { return Math.max(0, p.starts[k] - P.nudge + 0.02); }
  function seekAudio(t) {
    const d = isFinite(audio.duration) ? audio.duration : (S.durs[S.sec] || 1e9);
    const to = Math.max(0, Math.min(t, d - 0.05));
    trJump(S.sec, to);
    if (S.loadingAudio || S.pendingSeek) S.pendingSeek = to; // not loaded yet: the new position replaces the resume position
    audio.currentTime = to; posState();
    S.resnap = true; driftHold();
    S.follow = true; el.follow.hidden = true;
    tick(true); updateSeekUI(nowT());
  }
  function stepSentence(dir) {
    hlpSeek();
    const p = S.plan[S.sec];
    if (!p || !p.ids.length) { seekAudio(nowT() + dir * 15); return; }
    const k = Core.locate(p.starts, nowT() + P.nudge);
    const t = nowT() + P.nudge;
    if (dir < 0) {
      if (t - p.starts[k] > 2 || (k === 0 && S.sec === 0)) seekAudio(sentTime(p, k));
      else if (k > 0) seekAudio(sentTime(p, k - 1));
      else goTrack(S.sec - 1, 0);
    } else if (k < p.ids.length - 1) seekAudio(sentTime(p, k + 1));
    else goTrack(S.sec + 1, 0);
  }
  function stepTrack(dir) {
    if (dir < 0 && nowT() > 4) seekAudio(0);
    else goTrack(S.sec + dir, 0);
  }
  guideDoc('reading', 'Translate a sentence', "Press and hold a sentence to translate it into your language. On a word, the same card shows its meaning and lets you save it.");
