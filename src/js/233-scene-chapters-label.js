  /* Chapter titles, the whole chapter, and a look ahead. The text model holds the whole book, headings included, so:
     (1) a chapter's title counts extra for its first few paragraphs ("The Saloon" sets the scene before the prose does);
     (2) each chapter is scored a few paragraphs at a time in the background, so a chapter whose first paragraphs name no
         place opens in the place the chapter is mostly set in;
     (3) on the last sentence of a paragraph, a place named in the next paragraph (or in the next chapter's title) starts
         to count, so the crossfade begins a moment before the story gets there. */
  function ambChapIdx(ix) {   // per chapter: its heading paragraph (hp), first (a) and last (b) paragraph
    if (ix.cx) return ix.cx;
    const cx = {};
    ix.pa.forEach((e, j) => { const st = ix.sents[e.a]; if (!st) return; const c = cx[st.ch] || (cx[st.ch] = { hp: null, a: j, b: j }); c.b = j; if (st.h && c.hp == null) c.hp = j; });
    return (ix.cx = cx);
  }
  function ambChapScan(ix, ch) {   // score a chapter's paragraphs a dozen at a time (they are kept, so reading them later costs nothing), then the next chapter
    const c = ambChapIdx(ix)[ch]; if (!c || c.done || c.busy) return;
    c.busy = true; c.sum = {}; let j = c.a; const end = Math.min(c.b, c.a + 400);
    const run = () => {
      try { for (let n = 0; n < 12 && j <= end; n++, j++) { const sc = ambSceneScore(ix, j); for (const k in sc.p) c.sum[k] = (c.sum[k] || 0) + Math.min(sc.p[k], 4); } } catch (e) { j = end + 1; }
      if (j <= end) { setTimeout(run, 40); return; }
      c.busy = false; c.done = true;
      let top = '', ts = 0, sec = 0; for (const k in c.sum) { const v = c.sum[k]; if (v > ts) { sec = ts; ts = v; top = k; } else if (v > sec) sec = v; }
      c.top = top && ts >= 6 && ts >= sec * 1.5 ? top : '';   // one place has to clearly lead, or the chapter has no single place
      try {
        const A = AMB.auto, id = S.curId, cur = A && A.model && A.model._scn === ix && id != null && ix.sents[id] ? ix.sents[id].ch : null;
        if (cur === ch && c.top && !A.place && !A.hold) { A.refix = true; A.sig = ''; ambAutoStep(); }   // the chapter just opened with no place yet: the scan has one
        if (cur === ch) ambChapScan(ix, ch + 1);
      } catch (e) { /* the scan is only a help */ }
    };
    setTimeout(run, 0);
  }
  function ambChapBoost(ix, id, pi, R, look) {   // adds to the place scores; true when this paragraph is a chapter heading
    const st = ix.sents[id], c = st && ambChapIdx(ix)[st.ch]; if (!c) return false;
    const d = c.hp == null ? 99 : pi - c.hp;
    if (d >= 0 && d <= 4) { const hs = ambSceneScore(ix, c.hp).p, w = [1.6, 1.3, 1, 0.7, 0.4][d]; for (const k in hs) R.p[k] = (R.p[k] || 0) + hs[k] * w; }
    if (c.done && c.top && pi - (c.hp == null ? c.a - 1 : c.hp) <= 2) {   // the first paragraphs often name no place: open in the chapter's own
      let best = 0; for (const k in R.p) if (R.p[k] > best) best = R.p[k];
      if (best < 3) R.p[c.top] = Math.max(R.p[c.top] || 0, 3.2);
    }
    if (look && ix.pa[pi + 1]) {
      const nx = ambSceneScore(ix, pi + 1), nw = ix.sents[ix.pa[pi + 1].a].h ? 1.2 : 0.6;
      for (const k in nx.p) R.p[k] = (R.p[k] || 0) + nx.p[k] * nw;
      if (nx.go) R.p[nx.go] = (R.p[nx.go] || 0) + 2;
    }
    return d === 0;
  }
  function ambAutoStep() {   // called when the reader moves to a new sentence; does the work only when the paragraph changes
    AMB.autoId = S.curId; AMB.autoSec = S.sec;
    try {
      const m = S.model, id = S.curId; if (!m || !m.sents || id == null || id < 0 || !m.sents[id]) return;
      const ix = ambSceneIdx(m), pi = ix.pi[id];
      const A = AMB.auto || (AMB.auto = { place: '', wx: '', time: '', mood: '', L: null, hold: false, holdSig: '', pi: -9, model: null, memo: {}, sig: '' });
      if (pi != null && ix.sents[id].ch != null) ambChapScan(ix, ix.sents[id].ch);   // (does nothing once the chapter has been scanned)
      const look = pi != null && A.model === m && A.pi === pi && !A.refix && A.look !== pi && P.ambLook !== false && ix.pa[pi].b === id && !!ix.pa[pi + 1];   // the last sentence of a paragraph: look at the next one
      if (pi == null || (A.model === m && A.pi === pi && !A.refix && !look)) return;
      A.refix = false; if (look) A.look = pi;
      let jump = A.model !== m || Math.abs(pi - A.pi) > 1; const skipped = jump; A.model = m; A.pi = pi;   // skipped: the reader jumped (seek, new book), so no transition sound
      const R = ambGenreApply(ambSceneRead(ix, pi), S.book); if (ambChapBoost(ix, id, pi, R, look)) jump = true;   // a new chapter may start in a new place
      const mm = A.memo, n = R.t.night || 0, d = R.t.day || 0, t0 = A.time;
      const place0 = A.place;
      A.place = ambPlacePick(ix, pi, R, A.place, jump, mm.p || (mm.p = {}));
      if (!look) {   // (the look ahead is for places only: weather, time and mood wait for their own paragraph)
        A.wx = ambPick(R.w, A.wx, 3, 1.5, jump, mm.w || (mm.w = {}));
        A.wi = (A.wx && R.wi && R.wi[A.wx]) || 1;   // how strong the weather is said to be
        A.mood = ambPick(R.m, A.mood, 4.5, 2.2, jump, mm.m || (mm.m = {}));
        A.time = ambPick({ night: Math.max(0, n - d * 0.7), day: Math.max(0, d - n * 0.7) }, A.time, 2.5, 1.2, jump, mm.t || (mm.t = {}));
      }
      if (A.hold && A.place + '|' + A.wx !== A.holdSig) A.hold = false;   // the story has moved on: the scene takes over again
      const flip = A.time !== t0; if (flip) ambTod(true, true);   // day <-> night in the story: the night softening eases in or out over several seconds
      const fx0 = ambFixNear(m, pi), fsc = fx0 && fx0.k !== '-' ? AMB_SCENES.find(x => x.k === fx0.k) : null, fx = fx0 && (fx0.k === '-' || fsc) ? fx0 : null;   // a correction from the reader: a strong prior that rules this paragraph and its neighbours
      A.fix = fx ? { k: fx.k, n: fsc ? fsc.n : '' } : null;
      const sig = [A.place, A.wx, A.time, A.mood, fx ? fx.k : '', A.wi || 1].join('|'); if (sig === A.sig) return;
      A.sig = sig;
      if (place0 && A.place && A.place !== place0) ambTrans(place0, A.place, look ? id + 1 : id, look, skipped);   // the story moved to a new place: a door, gate or footsteps
      const top = Math.max(R.p[A.place] || 0, R.w[A.wx] || 0, (R.m[A.mood] || 0) * 0.8), conf = Math.max(0.6, Math.min(1, 0.6 + 0.4 * top / 9));   // a faint scene is a quieter one
      A.ms = A.mood ? Math.max(0.5, Math.min(1, 0.5 + 0.5 * (R.m[A.mood] || 0) / 9)) : 0;   // a mood the text only hints at shapes the mix less
      A.L = fx ? (fsc ? ambFull(fsc.L) : null) : (A.place || A.wx || A.mood) ? ambSceneMix(A, conf) : null;
      ambAutoPaint();
      if (AMB.built && AMB.on) ambApply(flip ? 4 : jump ? 1.2 : 2.4);   // a slow crossfade: the old bed fades out as the new one fades in
      if (MUS.on) musicMoodChange(A.mood || '');   // the music follows the story's mood
    } catch (e) { console.warn('scene detection', e); }   // never let it break reading
  }
  function ambAutoHold() {   // the reader moved a slider or picked a scene: their mix plays until the story changes place
    const A = AMB.auto; if (P.ambAuto === false || !A || !A.L || A.hold) return;
    A.hold = true; A.holdSig = A.place + '|' + A.wx; ambAutoPaint();
  }
  function ambAutoPaint() {
    const el = $('#amb-auto-st'); if (!el) return;
    ambFixPaint();
    const A = AMB.auto;
    if (P.ambAuto === false) { el.textContent = 'Off. The sounds stay as you set them.'; miniScenePaint(null); return; }
    if (A && A.hold) { el.textContent = 'Your own mix is playing until the story moves to a new place.'; miniScenePaint(null); return; }
    if (A && A.fix) { el.textContent = A.fix.k === '-' ? 'Corrected: no scene here. Your own mix plays.' : 'Corrected: ' + A.fix.n + '.'; miniScenePaint(A.fix.k !== '-' ? A.fix.n : null); return; }
    if (A && A.L) {
      const bits = [A.place ? SC_PLACES[A.place].n : (A.wx ? SC_WX[A.wx].n.charAt(0).toUpperCase() + SC_WX[A.wx].n.slice(1) : 'Atmosphere')];
      if (A.place && A.wx) bits.push(SC_WX[A.wx].n);
      if (A.time === 'night') bits.push('night');
      if (A.mood) bits.push(SC_MOOD[A.mood].n);
      const label = 'Now: ' + bits.join(' \u00b7 ');
      el.textContent = label; miniScenePaint(label); return;
    }
    el.textContent = 'Listening for the next scene. Between scenes your own mix plays.';
    miniScenePaint(null);
  }

  /* Scene label on the mini-player: shown only when P.sceneLabel is true and a scene is active. */
  function miniScenePaint(label) {
    AMB.lbl = label ? String(label).replace(/^Now: /, '') : ''; sndNowPaint();
    const btn = $('#mini-scene'); if (!btn) return;
    const show = P.sceneLabel === true && !!label && P.ambOn === true && AMB.on;
    btn.hidden = !show;
    if (show) btn.textContent = label;
  }
