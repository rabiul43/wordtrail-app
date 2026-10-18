  /* ---------- background alignment ---------- */
  const job = { running: false, q: [] };
  const planSig = p => p.ids.length + ':' + p.ids[0] + ':' + p.ids[p.ids.length - 1];
  function bgAllowed() {
    const m = P.bgAlign || 'wifi';
    if (m === 'off') return false;
    if (m === 'always') return true;
    const c = navigator.connection;
    if (!c) return true; // this browser cannot tell, so do not block
    if (c.saveData) return false;
    if (c.type) return c.type === 'wifi' || c.type === 'ethernet';
    return true;
  }
  async function decodeWhole(buf) {
    const AC = window.AudioContext || window.webkitAudioContext;
    for (const rate of [8000, 11025, 16000, 0]) {
      let ctx = null, d = null;
      try { ctx = rate ? new AC({ sampleRate: rate }) : new AC(); d = await ctx.decodeAudioData(buf.slice(0)); } catch (e) { d = null; }
      try { if (ctx) ctx.close(); } catch (e) { /* ignore */ }
      if (d) return d;
    }
    throw new Error('decode');
  }
  /* Download a whole track, find its pauses, and return an anchor for every sentence. */
  /* Item 6: cut the MP3 at frame boundaries (about 3 MB each) and decode and analyse one piece at a
     time, so a whole decoded track never sits in memory. Pieces can be fed while the file is still
     downloading. Constant-bitrate MP3 only; anything else returns null and the caller decodes whole. */
  function chunkSegger() {
    const STEP = 3e6;
    let pend = [], pendN = 0, carry = new Uint8Array(0), first = true, bps = 0, t = 0, bad = false, segs = [], chain = Promise.resolve();
    const cat = (parts, n) => { const o = new Uint8Array(n); let k = 0; for (const c of parts) { o.set(c, k); k += c.length; } return o; };
    async function work(piece, last) {
      if (bad) return;
      try {
        const u = carry.length ? cat([carry, piece], carry.length + piece.length) : piece;
        let at = 0;
        if (first) { at = Core.findMp3Sync(u, Core.id3End(u)); if (at < 0) { bad = true; return; } }
        const w = Core.walkFrames(u, at);
        if (!w.first || w.frames < 5) { if (first || !last) { if (first) bad = true; else carry = u; } return; }
        if (first) bps = w.first.br * 125;
        if (w.vbr || w.first.br * 125 !== bps) { bad = true; return; }
        const d = await decodeWhole(u.slice(at, w.end).buffer);
        const sg = await BG.seg(d.getChannelData(0), d.sampleRate, 0.02);
        for (const g of sg) {
          const L = segs[segs.length - 1], gs = g.s + t, ge = g.e + t;
          if (L && gs - L.e < 0.05) L.e = ge; else segs.push({ s: gs, e: ge });
        }
        t += (w.end - at) / bps;
        carry = u.slice(w.end); first = false;
      } catch (e) { bad = true; }
    }
    const flush = last => { const piece = cat(pend, pendN); pend = []; pendN = 0; chain = chain.then(() => work(piece, last)); };
    return {
      push(v) { pend.push(v); pendN += v.length; if (pendN >= STEP) flush(false); },
      async finish() { if (pendN) flush(true); await chain; return bad || t < 30 ? null : { segs, dur: t }; }
    };
  }
  async function segsChunked(buf) {
    const u = buf instanceof Uint8Array ? buf : new Uint8Array(buf), g = chunkSegger();
    for (let o = 0; o < u.length; o += 3e6) { g.push(u.subarray(o, Math.min(u.length, o + 3e6))); await new Promise(r => setTimeout(r, 0)); }
    return g.finish();
  }
  async function computeFull(i, stage, pre) {
    const book0 = S.book;
    const p = S.plan[i], sec = S.secs[i];
    if (P.fastCheck !== false) { // the saved pause map already covers the whole track: no download, no decode
      if (S.book === book0 && await mapCovers(i)) {
        const m = await loadSegs(i);
        const costs0 = p.ids.map(id => S.model.sents[id].cost);
        const out0 = await BG.call('alignSentences', [m.segs, m.cov[0][1], costs0, Core.introCost(book0.title, book0.authors, sec.title)]);
        if (out0 && out0.score <= 1.2) return p.ids.map((id, k) => ({ id, t: +out0.starts[k].toFixed(2) }));
      }
    }
    const smart = P.smartSync !== false;
    let buf = null, chunked = null;
    if (pre) { // the shared download (and, when on, its piece-by-piece analysis)
      if (pre.seg) chunked = await pre.seg;
      if (!chunked) buf = pre.buf.buffer.slice(pre.buf.byteOffset, pre.buf.byteOffset + pre.buf.byteLength);
    } else {
      const lb = await dlBlob(sec.url);
      if (lb) { if (stage) stage('Reading the saved audio…'); buf = await lb.arrayBuffer(); } // saved on this device
      else {
        let res;
        if (stage) stage('Downloading the audio…');
        try { res = await fetch(sec.url, { mode: 'cors' }); } catch (e) { throw new Error('blocked'); }
        if (!res.ok) throw new Error('blocked');
        buf = await res.arrayBuffer();
      }
    }
    if (stage) stage('Listening for pauses…');
    let segs, dur;
    if (!chunked && smart && buf) chunked = await segsChunked(new Uint8Array(buf));
    if (chunked) { segs = chunked.segs; dur = chunked.dur; }
    else {
      const decoded = await decodeWhole(buf);
      segs = await BG.seg(decoded.getChannelData(0), decoded.sampleRate, 0.02);
      dur = decoded.duration;
    }
    const costs = p.ids.map(id => S.model.sents[id].cost);
    if (S.book === book0) mergeSegs(i, segs, 0, dur, 0);
    await new Promise(r => setTimeout(r, 30));
    const out = await BG.call('alignSentences', [segs, dur, costs, Core.introCost(book0.title, book0.authors, sec.title)]);
    if (!out || out.score > 1.2) throw new Error('nofit');
    return p.ids.map((id, k) => ({ id, t: +out.starts[k].toFixed(2) }));
  }
  /* One download for both checks: the start check runs when the first ~2.5 MB has arrived, the
     full check gets the finished file. */
  function streamOnce(url, headN, onHead, chunk) {
    const join = (chunks, n) => { const o = new Uint8Array(n); let k = 0; for (const c of chunks) { if (k >= n) break; const t = c.subarray(0, n - k); o.set(t, k); k += t.length; } return o; };
    return (async () => {
      let res;
      try { res = await fetch(url, { mode: 'cors' }); } catch (e) { throw new Error('blocked'); }
      if (!res.ok || !res.body) throw new Error('blocked');
      const rd = res.body.getReader(), chunks = [], sg = chunk ? chunkSegger() : null;
      let got = 0, sent = false;
      for (;;) {
        const { done, value } = await rd.read();
        if (done) break;
        chunks.push(value); got += value.length;
        if (sg) sg.push(value);
        if (!sent && got >= headN) { sent = true; onHead(join(chunks, headN)); }
      }
      if (!sent) onHead(join(chunks, got));
      return { buf: join(chunks, got), seg: sg ? sg.finish() : null };
    })();
  }
  /* Step 1 pins the opening sentences (about 2.5 MB). Step 2 aligns the whole track when the
     connection allows. Tracks the reader synced by hand are left alone. */
  async function prepareTrack(i) {
    const book = S.book, model = S.model, p = S.plan[i];
    if (!p || p.ids.length < 3) return;
    const isManual = () => !!(S.anchors[i] && S.anchors[i].length && !S.autoSrc[i]);
    if (isManual() || S.autoSrc[i] === 'full') return;
    if (S.tdone.get(i) && S.tdone.get(i) === S.anchors[i]) return;
    const sig = planSig(p);
    const alive = () => S.book === book && S.model === model && S.plan[i] && S.plan[i].ids.length && planSig(S.plan[i]) === sig && !isManual() && !(S.tdone.get(i) && S.tdone.get(i) === S.anchors[i]);
    S.bgTrack = i; updateHeader();
    const fast = P.fastCheck !== false; // hoisted so the finally block can reference it
    try {
      let fullBuf = null;
      if (fast && !S.autoSrc[i] && P.autoStart !== false && bgAllowed() && !(await dlBlob(S.secs[i].url)) && !(await mapCovers(i))) {
        // one shared download feeds both checks
        let headRes; const headP = new Promise(r => { headRes = r; });
        const fullP = streamOnce(S.secs[i].url, 2.6e6, headRes, P.smartSync !== false);
        fullP.catch(() => headRes(null));
        try {
          const head = await headP;
          if (!head) throw new Error('blocked');
          const list = await autoStart(i, head);
          if (alive()) { S.anchors[i] = list; S.autoSrc[i] = 'start'; replan(false); persist(); }
        } catch (e) { console.warn('Wordtrail: could not find the start of track ' + (i + 1), e); }
        try { fullBuf = await fullP; } catch (e) { fullBuf = null; }
      } else if (!S.autoSrc[i] && P.autoStart !== false) {
        try {
          const list = await autoStart(i);
          if (alive()) { S.anchors[i] = list; S.autoSrc[i] = 'start'; replan(false); persist(); }
        } catch (e) { console.warn('Wordtrail: could not find the start of track ' + (i + 1), e); }
      }
      if (P.smartSync !== false && alive() && i === S.sec) await playheadAlign(i, alive);
      if (alive() && !S.aligning && bgAllowed() && S.autoSrc[i] !== 'full') {
        try {
          const list = await computeFull(i, null, fullBuf);
          if (alive()) { S.anchors[i] = list; S.autoSrc[i] = 'full'; replan(false); persist(); }
        } catch (e) { console.warn('Wordtrail: background alignment failed for track ' + (i + 1), e); }
      }
      fullBuf = null;
    } finally {
      if (S.bgTrack === i) S.bgTrack = null;
      updateHeader();
      if (fast) dlHint(i); // offer download only after sync settles, not while "Preparing…" is showing
    }
  }
  /* Item 5: if you are already well into the track, sync the minute or two around the playhead
     first (small range requests) so what you hear is accurate before the whole track is done. */
  async function playheadAlign(i, alive) {
    try {
      const cur = audio.currentTime;
      if (audio.paused || cur < 45 || S.curId < 0 || S.sentSec[S.curId] !== i || S.refining || S.aligning) return;
      const id = S.curId, prev = S.autoSrc[i] || 'start';
      const res = await refineWindow(i, id, cur, { back: 60, fwd: 60, slack: 30, maxScore: 0.9 });
      if (!res || !alive() || S.sec !== i || S.sentSec[id] !== i) return;
      setAnchor(id, { at: res.t, extras: res.extras, fromAudio: true, quiet: true });
      if (!S.autoSrc[i]) S.autoSrc[i] = prev; // keep it an automatic sync so the whole-track check still runs
      replan(false); persist();
    } catch (e) { /* not readable here: the whole-track check carries on */ }
  }
  async function mapCovers(i) {
    const m = await loadSegs(i), dur = S.durs[i] || 0;
    return m.cov.length === 1 && m.cov[0][0] <= 1 && dur > 60 && m.cov[0][1] >= dur - 3 && m.segs.length > 20;
  }
  /* Once per book, on Wi-Fi: show a quiet "⬇ Download" pill in the syncbar instead of
     an intrusive toast. Called from the finally block of prepareTrack (after S.bgTrack is
     cleared), so "Timing: Preparing…" is already gone before this can appear. */
  function dlHint(i) {
    const b = S.book;
    if (!b || !dlOk || dlSaved(b.id) || isLocal(b.id, i, S.secs[i].url) || DL.running) return;
    if (S.aligning) return;
    const c = navigator.connection;
    if (!c || c.saveData || !(c.type === 'wifi' || c.type === 'ethernet')) return;
    const seen = store.get('wt:dlhint', {});
    if (seen[b.id]) return;
    seen[b.id] = 1; store.set('wt:dlhint', seen);
    const btn = $('#b-dl-hint');
    if (btn) btn.hidden = false;
  }
  /* Hide the download pill whenever the book changes or a download starts */
  function hideDlHint() { const btn = $('#b-dl-hint'); if (btn) btn.hidden = true; }
  async function runQueue() {
    if (job.running) return;
    job.running = true;
    try { while (job.q.length) await prepareTrack(job.q.shift()); } finally { job.running = false; }
  }
  function enqueueAlign(i, front) {
    if (!S.model || !S.book || i < 0 || i >= S.secs.length || S.autoTried.has(i) || job.q.includes(i)) return;
    if (P.autoStart === false && !bgAllowed()) return;
    S.autoTried.add(i);
    if (front) job.q.unshift(i); else job.q.push(i);
    runQueue();
  }

  /* Manual: align this track now and say what is happening. */
  guideDoc('timing', 'Check timing for this book', "Settings > Timing checks for precise, ready-made timing and shows how well each track matched the text. Tap a square to redo just that track.");
  guideDoc('timing', 'Timing status', "While a track's text is being found, the reader says what is happening (checking the shared timing, fitting it to the text, aligning the audio) and for how long. If the timing cannot be reached it says so and offers Try again.", '2026-10-10');
  /* ---------- Precise timing from speech recognition ----------
     A timing file (made by wordtrail_colab.py) holds every word the narrator said, with its
     time. Each sentence is matched to those words, so each start is measured, not estimated. */
  /* Default sync repository (name/repo). The repository name can be overridden through wt:gh. No token is stored in the app. */
  const DEFAULT_REPO = 'rabiul43/wordtrail-data';
  /* An earlier version let a GitHub token be saved in wt:gh. It is not used any more, so any saved token is deleted from this device. */
  try { const o = JSON.parse(localStorage.getItem('wt:gh') || 'null'); if (o && typeof o === 'object' && 'token' in o) { delete o.token; localStorage.setItem('wt:gh', JSON.stringify(o)); } } catch (e) { /* storage unavailable */ }
  const ghCfg = () => { const c = store.get('wt:gh', {}) || {}; return { repo: c.repo || DEFAULT_REPO, token: '' }; };   /* GitHub sync was removed: timing now comes only from Hugging Face */
  const toks = s => (String(s).toLowerCase().match(/[a-z0-9]+(?:['\u2019][a-z]+)?/g) || []).map(w => w.replace(/['\u2019]/g, ''));
  /* Word-by-word alignment of book words B against spoken words A. The search runs inside a band. Without
     anchors the band follows the straight line between the two starts and ends. With anchors (pairs
     [book index, spoken index] from the phrase chain) it follows the real path, and it widens where the book
     has a long passage the narrator did not read, so a skipped table or almanac cannot throw the rest off. */
  function alignTokens(B, A, anch) {
    const n = B.length, m = A.length, map = new Int32Array(n).fill(-1);
    if (!n || !m) return map;
    const W = Math.min(m, Math.max(300, Math.round(m * 0.12))), INF = 1e9;
    const rLo = new Int32Array(n + 1), rHi = new Int32Array(n + 1), off = new Float64Array(n + 2);
    const useA = anch && anch.length >= 2;
    let sg = 0;
    for (let i = 1; i <= n; i++) {
      let c, w = W;
      if (!useA) c = Math.round(i * m / n);
      else {
        const bk = i - 1;
        if (bk <= anch[0][0]) c = anch[0][1] + (bk - anch[0][0]) + 1;
        else if (bk >= anch[anch.length - 1][0]) c = anch[anch.length - 1][1] + (bk - anch[anch.length - 1][0]) + 1;
        else {
          while (sg < anch.length - 2 && anch[sg + 1][0] < bk) sg++;
          const p0 = anch[sg], p1 = anch[sg + 1], db = p1[0] - p0[0], da = p1[1] - p0[1];
          c = Math.round(p0[1] + (bk - p0[0]) * (db > 0 ? da / db : 0)) + 1;
          if (Math.abs(db - da) > 60) w = W + Math.min(3000, Math.abs(db - da));
        }
      }
      c = Math.max(0, Math.min(m, c)); w = Math.min(m, w);
      rLo[i] = Math.max(0, c - w); rHi[i] = Math.min(m, c + w);
      off[i + 1] = off[i] + (rHi[i] - rLo[i] + 1);
    }
    const tb = new Int8Array(off[n + 1] + 1);
    let prev = new Float32Array(m + 1).fill(INF), cur = new Float32Array(m + 1);
    for (let j = 0; j <= Math.min(m, Math.max(W, rHi[1])); j++) prev[j] = 0;   // the track may start with words the book does not have
    for (let i = 1; i <= n; i++) {
      const lo = rLo[i], hi = rHi[i], b = B[i - 1], o = off[i] - lo;
      cur.fill(INF);
      for (let j = lo; j <= hi; j++) {
        let best = INF, d = 0;
        if (j > 0 && prev[j - 1] < INF) {
          const a = A[j - 1];
          best = prev[j - 1] + (a === b ? 0 : (a.length > 3 && b.length > 3 && a.slice(0, 3) === b.slice(0, 3) ? 0.4 : 1)); d = 1;
        }
        if (prev[j] + 1 < best) { best = prev[j] + 1; d = 2; }
        if (j > lo && cur[j - 1] + 1 < best) { best = cur[j - 1] + 1; d = 3; }
        cur[j] = best; tb[o + j] = d;
      }
      const t = prev; prev = cur; cur = t;
    }
    let j = 0;
    for (let k = 1; k <= m; k++) if (prev[k] < prev[j]) j = k;
    for (let i = n; i > 0;) {
      if (j < rLo[i] || j > rHi[i]) break;
      const d = tb[off[i] - rLo[i] + j];
      if (d === 1) { map[i - 1] = j - 1; i--; j--; } else if (d === 2) i--; else if (d === 3 && j > 0) j--; else break;
    }
    return map;
  }
  /* ---------- Whole-book alignment ----------
     The timing file of a track is matched against the WHOLE book, not a guessed slice: short word
     groups that appear (almost) once in the book find where the track really sits, a chain of them
     keeps the order, and the word-by-word alignment then runs only on that region. */
  function bookIndex() {
    const m = S.model;
    if (m._bt) return m._bt;
    const B = [], sent = [], first = [];
    m.sents.forEach((s, id) => { first.push(B.length); for (const w of toks(s.t)) { B.push(w); sent.push(id); } });
    first.push(B.length);
    const idx = new Map();
    for (let p = 0; p + 2 < B.length; p++) {
      const key = B[p] + ' ' + B[p + 1] + ' ' + B[p + 2], l = idx.get(key);
      if (l) { if (l.length < 6) l.push(p); } else idx.set(key, [p]);
    }
    return (m._bt = { B, sent, first, idx });
  }
  function alignTrackToBook(tr) {
    alignTrackToBook.fit = 0;
    const raw = String(tr.w || '').split(' '), RT = tr.t || [];
    if (raw.length < 5 || raw.length !== RT.length) return null;
    const A = [], T = [], Q = [], qs = String(tr.q || ''), hasQ = qs.length === raw.length;   // qs: per-word match quality from wt_batch.py
    raw.forEach((w, j) => { for (const x of toks(w)) { A.push(x); T.push(RT[j]); Q.push(hasQ ? +qs[j] : -1); } });
    if (A.length < 12) return null;
    const { B, sent, first, idx } = bookIndex();
    const seeds = [], tails = [], tailSeed = [], prev = [];
    for (let i = 0; i + 2 < A.length; i++) {
      const l = idx.get(A[i] + ' ' + A[i + 1] + ' ' + A[i + 2]);
      if (!l || l.length > 4) continue;
      for (let q = l.length - 1; q >= 0; q--) {
        const p = l[q], id = seeds.push({ i, p }) - 1;
        let lo = 0, hi = tails.length;
        while (lo < hi) { const mid = (lo + hi) >> 1; if (tails[mid] < p) lo = mid + 1; else hi = mid; }
        prev[id] = lo > 0 ? tailSeed[lo - 1] : -1; tails[lo] = p; tailSeed[lo] = id;
      }
    }
    if (!tails.length) return null;
    let chain = [];
    for (let c = tailSeed[tails.length - 1]; c >= 0; c = prev[c]) chain.push(seeds[c]);
    chain.reverse();
    const dg = chain.map(s => s.p - s.i);
    chain = chain.filter((s, c) => (c > 0 && Math.abs(dg[c] - dg[c - 1]) <= 40) || (c + 1 < chain.length && Math.abs(dg[c] - dg[c + 1]) <= 40));
    if (chain.length < 8) return null;
    /* Drop stray clusters: a few seeds from the contents list, title page or a repeated heading sit far from the
       real place of the track and would stretch the book region (and break the alignment band). Keep only clusters
       on the same diagonal that are not tiny next to the biggest one. */
    {
      const cl = []; let cu = [chain[0]];
      for (let c = 1; c < chain.length; c++) {
        if (Math.abs((chain[c].p - chain[c].i) - (chain[c - 1].p - chain[c - 1].i)) <= 400) cu.push(chain[c]); else { cl.push(cu); cu = [chain[c]]; }
      }
      cl.push(cu);
      const big = Math.max(...cl.map(x => x.length));
      chain = [].concat(...cl.filter(x => x.length >= Math.max(8, big * 0.1)));
      if (chain.length < 8) return null;
    }
    const f = chain[0], l = chain[chain.length - 1];
    const pStart = Math.max(0, f.p - f.i - 80), pEnd = Math.min(B.length, l.p + (A.length - l.i) + 80);
    const Br = B.slice(pStart, pEnd), map = alignTokens(Br, A, chain.map(x => [x.p - pStart, x.i]));
    let good = 0, k0 = -1, k1 = -1;
    const ex = new Uint8Array(Br.length), P = new Int32Array(Br.length + 1);
    for (let k = 0; k < Br.length; k++) { const a = map[k]; if (a >= 0 && A[a] === Br[k]) { ex[k] = 1; good++; } P[k + 1] = P[k] + ex[k]; }
    /* Where the track really starts and ends in the book: the first and last place with a solid run of matching
       words. One stray "the" or "of" matched by chance near the edge (the LibriVox intro, the text before it) must not
       pull the start back into text another track reads. */
    const WIN = 12, NEED = 8, nB = Br.length;
    for (let k = 0; k < nB; k++) if (P[Math.min(nB, k + WIN)] - P[k] >= NEED) { k0 = k; while (!ex[k0]) k0++; break; }
    for (let k = nB - 1; k >= 0; k--) if (P[k + 1] - P[Math.max(0, k - WIN + 1)] >= NEED) { k1 = k; while (!ex[k1]) k1--; break; }
    if (k0 < 0 || k1 < k0) { k0 = k1 = -1; for (let k = 0; k < nB; k++) if (ex[k]) { if (k0 < 0) k0 = k; k1 = k; } }
    alignTrackToBook.fit = good / A.length;
    if (k0 < 0 || good / A.length < 0.5) return null;
    const a = sent[pStart + k0], b = sent[pStart + k1] + 1, list = [];
    /* Confidence per sentence (0 to 1): the share of its words that really matched what was spoken. A close
       match (spelling or edition variant) counts almost fully; a sentence the reader skipped or changed scores
       low. Low-confidence sentences get no measured time here, so the app estimates just those. */
    const CONF_MIN = 0.4, conf = {};
    const aw = Math.min(a, sent[pStart]), bw = Math.max(b, sent[Math.max(pStart, pEnd - 1)] + 1);   // a little text either side of the track too
    for (let id = aw; id < bw; id++) {
      const n = first[id + 1] - first[id];
      if (n < 1) continue;
      let cr = 0;
      for (let p = first[id]; p < first[id + 1]; p++) {
        const k = p - pStart;
        if (k < 0 || k >= Br.length || map[k] < 0) continue;
        const x = map[k];
        cr += A[x] === Br[k] ? 1 : (Q[x] > 0 ? 0.8 : (Q[x] < 0 && A[x].length > 3 && Br[k].length > 3 && A[x].slice(0, 3) === Br[k].slice(0, 3) ? 0.5 : 0));
      }
      conf[id] = cr / n;
    }
    let last = -1;
    for (let id = a; id < b; id++) {
      if (conf[id] != null && conf[id] < CONF_MIN) continue;
      let kk = -1, kf = -1;
      for (let p = first[id]; p < first[id + 1]; p++) {
        const k = p - pStart;
        if (k < 0 || k >= Br.length || map[k] < 0) continue;
        if (A[map[k]] === Br[k]) { kk = k; break; }
        if (kf < 0) kf = k;
      }
      if (kk < 0) kk = kf;
      if (kk < 0) continue;
      const t = Math.max(0, T[map[kk]] - 0.25 * (kk - (first[id] - pStart)));
      if (t > last) { list.push({ id, t: +t.toFixed(2) }); last = t; }
    }
    if (list.length < 3) return null;
    /* Passages the narrator did not read (a table, an almanac, an index, notes): several sentences in a row with
       almost nothing heard, between sentences that matched well. Only trusted when the track as a whole fits. */
    const skip = [], edge = { l: null, e: null };
    if (alignTrackToBook.fit >= 0.7 && S.model) {
      const ss = S.model.sents, ids = [];
      for (let id = a; id < b; id++) if (conf[id] != null) ids.push(id);
      let gLo = -1, gHi = -1;
      ids.forEach((id, q) => { if (conf[id] >= CONF_MIN) { if (gLo < 0) gLo = q; gHi = q; } });
      let q = Math.max(gLo, 0);
      while (gLo >= 0 && q < gHi) {
        if (conf[ids[q]] < 0.2 && !(ss[ids[q]] && ss[ids[q]].h)) {
          let e = q, words = 0;
          while (e < gHi && conf[ids[e]] < 0.2 && !(ss[ids[e]] && ss[ids[e]].h)) { words += first[ids[e] + 1] - first[ids[e]]; e++; }
          if (e - q >= 3 && words >= 40) skip.push([ids[q], ids[e - 1] + 1]);
          q = e;
        } else q++;
      }
      let tot = 0; for (const r of skip) tot += r[1] - r[0];
      if (tot > 0.5 * (b - a)) skip.length = 0;   // most of the track "skipped" means a bad match, not a skipped passage
      /* Text just before the first and just after the last matched sentence that this track did not read. On its own
         that proves nothing (the next or the previous track may read it); it counts only where two neighbouring
         tracks both leave the same text unread, for example a translator's note between two tracks. */
      if (gLo >= 0) {
        const g0 = ids[gLo], g1 = ids[gHi], EDGE = 0.15;
        let lo = g0, hi = g1 + 1;
        for (let id = g0 - 1; id >= aw; id--) { if (ss[id].h) continue; if (conf[id] != null && conf[id] >= EDGE) break; lo = id; }
        for (let id = g1 + 1; id < bw; id++) { if (ss[id].h) continue; if (conf[id] != null && conf[id] >= EDGE) break; hi = id + 1; }
        if (lo < g0) edge.l = [lo, g0];
        if (hi > g1 + 1) edge.e = [g1 + 1, hi];
      }
    }
    /* Exact time of every word, per sentence, for the word-level highlight. A sentence where fewer
       than half the words were heard keeps sentence-level highlighting only. */
    const words = {};
    for (let id = a; id < b; id++) {
      const n = first[id + 1] - first[id];
      if (n < 1) continue;
      const arr = new Array(n).fill(null);
      let hit = 0;
      for (let q = 0; q < n; q++) {
        const k = first[id] + q - pStart;
        if (k < 0 || k >= Br.length || map[k] < 0) continue;
        arr[q] = T[map[k]]; hit++;
      }
      if (hit < Math.max(1, n * 0.5) || (conf[id] != null && conf[id] < CONF_MIN)) continue;
      const filled = Core.fillWordTimes(arr, 0.28);
      if (filled) words[id] = filled;
    }
    return { list, range: [a, b], words, conf, skip, edge };
  }
  /* Anchors [{ id, t }] for the sentences of one track, or null if the words do not fit. */
  function anchorsFromWords(ids, tr) {
    const A = String(tr.w || '').split(' '), T = tr.t || [];
    if (A.length < 5 || A.length !== T.length) return null;
    const B = [], first = [];
    ids.forEach(id => { first.push(B.length); B.push(...toks(S.model.sents[id].t)); });
    if (B.length < 5) return null;
    const map = alignTokens(B, A);
    let good = 0;
    map.forEach((a, k) => { if (a >= 0 && A[a] === B[k]) good++; });
    anchorsFromWords.fit = good / B.length;
    if (good / B.length < 0.6) return null;
    const out = [];
    let last = -1;
    ids.forEach((id, s) => {
      const end = s + 1 < ids.length ? first[s + 1] : B.length;
      for (let k = first[s]; k < end; k++) {
        if (map[k] < 0) continue;
        const t = Math.max(0, T[map[k]] - 0.25 * (k - first[s]));
        if (t > last) { out.push({ id, t: +t.toFixed(2) }); last = t; }
        break;
      }
    });
    return out.length > 3 ? out : null;
  }
