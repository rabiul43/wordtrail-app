  /* ---------- Notice engine: finds the spoken LibriVox intro and outro by LISTENING to the words ----------
     cuts.json only knows books somebody listed, and the old guess ("the text should start about N seconds in") is wrong
     whenever a reader's notice is longer or shorter than the average. This engine reads the words instead:

       1. Words with times for the first ~2.5 minutes and the last ~2 minutes of a track come from
          (a) the track's timing file, if the book has one (exact words from the offline pipeline), else
          (b) a small speech model (Whisper tiny, ~40 MB, downloaded once and cached) run on just those two windows.
       2. INTRO: the notice script ("This is a LibriVox recording. All LibriVox recordings are in the public domain. For more
          information or to volunteer, please visit librivox.org") is matched word by word, and the book's own first words are
          matched too. The cut is where the story text really starts, so any "Recording by ..." line goes as well.
       3. OUTRO: "End of chapter ..." (or "End of <title>") is found; the cut is just before it.
       4. A cut is trusted (c = 'h') only when it is backed by the notice or by the book text. Weaker finds (c = 'm') only
          move the Skip intro button to the exact time. Nothing found is remembered too (c = 'n'), so it is not tried again.
     Results are cached per book in localStorage ('wt:ne:<id>') and read by cutFor() (140-open-book.js), so the existing
     skip, plan and progress code needs no change. Settings > Audio > "Smart intro and outro detection" turns it off. */
  const NE_V = 1;
  const NE_END_KEY = new Set(['chapter', 'section', 'book', 'part', 'volume', 'story', 'poem', 'act', 'scene', 'canto', 'preface', 'introduction', 'epilogue', 'prologue', 'appendix']);
  const NE_CREDIT = new Set(['recording', 'recorded', 'read', 'reading', 'red', 'narrated', 'proofread', 'edited']);
const NE_LEAD = new Set(['this', 'is', 'the', 'that', 'thats']);
const NE_THIS = new Set(['recording', 'reading', 'book', 'chapter', 'section', 'poem', 'story', 'has', 'was']);
  function neLev(a, b, cap) {
    if (a === b) return 0;
    if (Math.abs(a.length - b.length) > cap) return cap + 1;
    let prev = Array.from({ length: b.length + 1 }, (_, k) => k);
    for (let i = 1; i <= a.length; i++) {
      const cur = [i]; let min = i;
      for (let k = 1; k <= b.length; k++) { const v = Math.min(prev[k] + 1, cur[k - 1] + 1, prev[k - 1] + (a[i - 1] === b[k - 1] ? 0 : 1)); cur[k] = v; if (v < min) min = v; }
      if (min > cap) return cap + 1;
      prev = cur;
    }
    return prev[b.length];
  }
  /* Same word, allowing for a speech-recognition slip (one letter off for words of 5+ letters, two for 8+). */
  function neEq(a, b) {
    if (a === b) return true;
    const n = Math.min(a.length, b.length);
    if (n < 5) return false;
    return neLev(a, b, n >= 8 ? 2 : 1) <= (n >= 8 ? 2 : 1);
  }
  const neLV = w => w === 'vox' || neLev(w, 'librivox', 3) <= 3;
  /* Index of the last word of the spoken notice within the first maxT seconds, or { i: -1 }. kind: 3 = full notice (reached
     "...visit librivox.org"), 2 = reached "...public domain", 1 = only "This is a LibriVox recording". The highest kind wins,
     so a later "recording by <name>" can never turn a full notice into a weak one. Speech recognition garbles "domain"
     ("doh main", "dough main"), so those are accepted too. */
  function neDomainEnd(W, k) {
    for (let j = k + 1; j <= k + 2 && j < W.length; j++) {
      const w = W[j].w, nx = W[j + 1] ? W[j + 1].w : '';
      if (neEq(w, 'domain')) return j;
      if (/^do/.test(w) && /ain$/.test(nx)) return j + 1;
      if (nx && neEq(w + nx, 'domain')) return j + 1;
    }
    return -1;
  }
  function neNoticeEnd(W, maxT) {
    let n = W.findIndex(x => x.s > maxT); if (n < 0) n = W.length;
    const end = [-1, -1, -1, -1];
    for (let i = 0; i < n; i++) {
      const w = W[i].w;
      if (w === 'org' || w === 'orc' || w === 'ork' || w === 'dotorg') {
        for (let k = Math.max(0, i - 12); k < i; k++) if (W[k].w === 'volunteer' || neEq(W[k].w, 'volunteer') || W[k].w === 'visit') { end[3] = i; break; }
      } else if (w === 'public' || neEq(w, 'public')) {
        const j = neDomainEnd(W, i); if (j >= 0) end[2] = j;
      } else if (/^recordings?$/.test(w)) {
        if ((W[i - 1] && neLV(W[i - 1].w)) || (W[i - 2] && neLV(W[i - 2].w))) end[1] = i;
      }
    }
    for (let k = 3; k >= 1; k--) if (end[k] >= 0) return { i: end[k], kind: k };
    return { i: -1, kind: 0 };
  }
  /* After the notice a reader often adds a credit: "Recording by <name>.", "Read by <name> at <place>.", "Red by ...",
     "This book has been read by <name>.", "This recording is by <name>."  Extend over that one clause only, stopping at the
     first real pause (0.5 s; 1.5 s right after "by", before the name) so story words are never swallowed. A bare "By ..." or
     "This ..." is NOT a credit (a story can start that way): the words must say read/recorded/narrated ... by. */
  function neIsCredit(W, i) {
    const nx = W[i + 1], n2 = W[i + 2];
    if (!nx) return false;
    if (NE_CREDIT.has(nx.w) && n2 && n2.w === 'by') return true;
    if (nx.w === 'today') for (let k = i + 2; k < Math.min(W.length - 1, i + 6); k++) if (NE_CREDIT.has(W[k].w) && W[k + 1].w === 'by') return true;
    if (nx.w === 'this' && n2 && NE_THIS.has(n2.w)) for (let k = i + 2; k < Math.min(W.length - 1, i + 9); k++) if ((NE_CREDIT.has(W[k].w) || W[k].w === 'is') && W[k + 1].w === 'by') return true;
    return false;
  }
  function neClauseEnd(W, i) {
    if (!neIsCredit(W, i)) return i;
    let k = i + 1;
    while (k + 1 < W.length && k - i < 18 && W[k + 1].s - W[k].e < (W[k].w === 'by' ? 1.5 : 0.5)) k++;
    return k;
  }
  /* Index in W where the book's own first words begin, or -1. B = the first words of the book text for this track. */
  function neBookStart(W, B, maxT) {
    if (!B || B.length < 6) return -1;
    let n = W.findIndex(x => x.s > maxT); if (n < 0) n = W.length;
    for (let j = 0; j + 2 < n; j++) {
      for (let m = 0; m < 6 && m + 2 < B.length; m++) {
        if (!(neEq(W[j].w, B[m]) && neEq(W[j + 1].w, B[m + 1]) && neEq(W[j + 2].w, B[m + 2]))) continue;
        /* confirm: an in-order overlap of at least 8 of the next 12 words (a lone "in the" cannot pass) */
        const a = W.slice(j, j + 12).map(x => x.w), b = B.slice(m, m + 12);
        const L = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
        for (let p = 1; p <= a.length; p++) for (let q = 1; q <= b.length; q++) L[p][q] = neEq(a[p - 1], b[q - 1]) ? L[p - 1][q - 1] + 1 : Math.max(L[p - 1][q], L[p][q - 1]);
        if (L[a.length][b.length] >= Math.min(8, Math.floor(Math.min(a.length, b.length) * 0.7))) return Math.max(0, j - m);
      }
    }
    return -1;
  }
  /* -> { a, c } : a = seconds where the story starts (0 = nothing to skip), c = 'h' trusted | 'm' weaker | 'n' nothing found */
  function neFindIntro(W, B, maxT) {
    maxT = maxT || 150;
    if (!W || W.length < 8) return { a: 0, c: 'n' };
    const ne = neNoticeEnd(W, maxT), bs = neBookStart(W, B, maxT);
    let a = 0, c = 'n';
    if (bs >= 0 && (ne.i < 0 || bs > ne.i)) {
      a = W[bs].s - 0.25;
      c = ne.i >= 0 && W[bs].s - W[ne.i].e < 45 ? 'h' : 'm';
    } else if (ne.i >= 0) {
      const k = neClauseEnd(W, ne.i);
      a = W[k].e + 0.15; if (W[k + 1]) a = Math.min(a, W[k + 1].s - 0.05); c = ne.kind >= 2 ? 'h' : 'm';
    }
    if (!(a > 2.5 && a < 90)) return { a: 0, c: 'n' };   // no notice at the start of this track (later chapters often have none)
    return { a: +a.toFixed(2), c };
  }
  /* Where to cut before the "End" of "End of chapter ...". Steps back over "This is the", and does not trust a word time that
     disagrees with the next word ("End" stamped 3 s before "of", or on top of the previous story word): then "of" decides. */
  function neOutroCut(W, i) {
    let k = i;
    while (k > 0 && i - k < 3 && NE_LEAD.has(W[k - 1].w) && W[k].s - W[k - 1].e < 0.45) k--;
    const prev = k > 0 ? W[k - 1] : null, of = W[i + 1];
    if (of.s - W[i].s > 1.5 || (prev && W[i].s - prev.s < 0.3 && k === i)) return Math.max(of.s - 0.6, prev ? prev.e + 0.05 : 0);
    return Math.min(W[k].s - 0.05, Math.max(W[k].s - 0.3, prev ? prev.e + 0.05 : 0));
  }
  /* -> { o, c } : o = seconds where the spoken outro starts, or null.
     "End of chapter/canto/poem/section/book ..." is trusted by itself. "End of <title>" (any other words) is trusted only when it
     comes after a real pause (0.7 s) and almost nothing follows it, so "the end of the world" inside a story is not a cut.
     Some tracks say two outros ("End of poem. End of <book> ... read by ..."): the cut goes before the first of them. */
  function neFindOutro(W, dur) {
    if (!W || W.length < 3 || !(dur > 20)) return { o: null, c: 'n' };
    const ok = [];
    for (let i = W.length - 2; i >= 0; i--) {
      if (W[i].s < dur - 130) break;
      if (W[i].w !== 'end' || W[i + 1].w !== 'of') continue;
      const nx = W[i + 2] ? W[i + 2].w : '', n3 = W[i + 3] ? W[i + 3].w : '', sing = x => x.replace(/s$/, '');
      let lv = false, cred = false;
      for (let k = i + 2; k < Math.min(W.length, i + 50); k++) { if (neLV(W[k].w)) lv = true; if (NE_CREDIT.has(W[k].w) && W[k + 1] && W[k + 1].w === 'by') cred = true; }
      const key = NE_END_KEY.has(sing(nx)) || (nx === 'the' && NE_END_KEY.has(sing(n3))) || lv;
      const gap = i > 0 ? W[i].s - W[i - 1].e : 9, few = W.length - i <= 14 || (cred && W.length - i <= 45);
      if (key || (gap >= 0.7 && few)) ok.push({ i, key });
    }
    if (!ok.length) {
      /* Speech recognition sometimes drops the word "End": "...of chapter 2, part 2, read by <name>." right at the end. */
      for (let i = W.length - 2; i > 0 && W.length - i <= 22; i--) {
        if (W[i].w !== 'of' || !NE_END_KEY.has(W[i + 1].w) || W[i - 1].w === 'end') continue;
        let by = false; for (let k = i + 2; k + 1 < W.length; k++) if ((W[k].w === 'read' || W[k].w === 'red' || W[k].w === 'recorded') && W[k + 1].w === 'by') { by = true; break; }
        if (!by) continue;
        const o = Math.max(W[i - 1].e + 0.05, W[i].s - 0.7);
        return o > dur * 0.75 && o < dur ? { o: +o.toFixed(2), c: 'h' } : { o: null, c: 'n' };
      }
      return { o: null, c: 'n' };
    }
    let pick = ok[0];                                      // the last one in the track ...
    for (const x of ok) if (x.key && W[pick.i].s - W[x.i].s < 10) pick = x;   // ... moved back to the first of a close group
    const o = neOutroCut(W, pick.i);
    return o > dur * 0.75 && o < dur ? { o: +o.toFixed(2), c: 'h' } : { o: null, c: 'n' };
  }

  /* ---------- words with times ---------- */
  /* From the track's timing file (words + start times). A word's end is estimated from its length. */
  function neTimingWords(i) {
    const tm = S.timings, sec = S.secs[i];
    if (!tm || !tm.tracks || !sec) return null;
    const tr = Object.values(tm.tracks).find(x => x.u && x.u === sec.url) || tm.tracks[i];
    if (!tr) return null;
    const raw = String(tr.w || '').split(' '), T = tr.t || [];
    if (raw.length < 20 || raw.length !== T.length) return null;
    const W = [];
    raw.forEach((w, j) => { for (const x of toks(w)) W.push({ w: x, s: +T[j], e: +T[j] + Math.min(0.9, 0.12 + 0.055 * x.length) }); });
    for (let k = 0; k + 1 < W.length; k++) if (W[k].e > W[k + 1].s) W[k].e = Math.max(W[k].s + 0.05, W[k + 1].s);
    return W;
  }
  /* 16 kHz mono samples for seconds lo..hi of a track (constant-bitrate MP3: byte range -> frames -> decode). */
  async function nePCM(i, lo, hi) {
    const info = await audioInfo(i);
    const dur = S.durs[i] || 0;
    lo = Math.max(0, lo); hi = dur ? Math.min(dur, hi) : hi;
    if (hi - lo < 5) throw new Error('window');
    const a = Math.max(info.dataStart, info.dataStart + Math.floor(lo * info.bps) - 2048), b = info.dataStart + Math.ceil(hi * info.bps) + 2048;
    const r = await rangeFetch(S.secs[i].url, a, b);
    const at = Core.findMp3Sync(r.bytes, 0);
    if (at < 0) throw new Error('format');
    const w = Core.walkFrames(r.bytes, at);
    if (w.frames < 20) throw new Error('window');
    const AC = window.AudioContext || window.webkitAudioContext;
    let ctx = null, d = null;
    try { ctx = new AC({ sampleRate: 16000 }); d = await ctx.decodeAudioData(r.bytes.slice(at, w.end).buffer); } finally { try { if (ctx) ctx.close(); } catch (e) { /* ignore */ } }
    let pcm = d.getChannelData(0).slice();
    if (Math.abs(d.sampleRate - 16000) > 1) {   // some browsers ignore the requested rate: resample (linear)
      const k = d.sampleRate / 16000, out = new Float32Array(Math.floor(pcm.length / k));
      for (let x = 0; x < out.length; x++) { const p = x * k, q = Math.floor(p), f = p - q; out[x] = pcm[q] * (1 - f) + (pcm[q + 1] || pcm[q]) * f; }
      pcm = out;
    }
    return { pcm, t0: (r.start + at - info.dataStart) / info.bps };
  }

  /* ---------- the speech model (Whisper tiny, in a worker, loaded only when needed) ---------- */
  const NE_MODEL = 'Xenova/whisper-tiny.en', NE_LIB = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.0.2/dist/transformers.min.js';
  const NEW = { w: null, id: 0, pend: new Map(), ready: false };
  function neWorker() {
    if (NEW.w) return NEW.w;
    const src = 'let pipe=null;\n' +
      'self.onmessage=async e=>{const m=e.data;try{\n' +
      'if(!pipe){const T=await import(m.lib);T.env.allowLocalModels=false;\n' +
      'const mk=()=>T.pipeline("automatic-speech-recognition",m.model,{dtype:"q8",device:"wasm"});\n' +
      'if(m.host){T.env.remoteHost=m.host;try{pipe=await mk();}catch(x){T.env.remoteHost="https://huggingface.co/";pipe=await mk();}}else pipe=await mk();}\n' +
      'const o=await pipe(m.pcm,{return_timestamps:"word",chunk_length_s:30,stride_length_s:5});\n' +
      'self.postMessage({id:m.id,chunks:o.chunks||[]});}catch(x){self.postMessage({id:m.id,error:String(x&&x.message||x)});}};';
    const url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
    const w = new Worker(url, { type: 'module' });
    w.onmessage = e => { const p = NEW.pend.get(e.data.id); if (!p) return; NEW.pend.delete(e.data.id); if (e.data.error) p.rej(new Error(e.data.error)); else { NEW.ready = true; p.res(e.data.chunks); } };
    w.onerror = () => { for (const p of NEW.pend.values()) p.rej(new Error('worker')); NEW.pend.clear(); try { w.terminate(); } catch (e) { /* gone */ } NEW.w = null; };
    return (NEW.w = w);
  }
  function neListen(pcm) {
    return new Promise((res, rej) => {
      const id = ++NEW.id; NEW.pend.set(id, { res, rej });
      try { neWorker().postMessage({ id, pcm, lib: NE_LIB, model: NE_MODEL, host: HF_PROXY ? HF_PROXY + '/' : '' }, [pcm.buffer]); } catch (e) { NEW.pend.delete(id); rej(e); }
    });
  }
  async function neTranscribe(i, lo, hi) {
    const { pcm, t0 } = await nePCM(i, lo, hi);
    if (!NEW.ready && !store.get('wt:ne:model', 0)) { toast('Downloading a small speech model once (about 40 MB) to find the LibriVox notice…', 6000); store.set('wt:ne:model', 1); }
    const chunks = await neListen(pcm);
    const W = [];
    for (const c of chunks) {
      const ts = c.timestamp || [], s = +ts[0], e = ts[1] == null ? s + 0.4 : +ts[1], xs = toks(c.text || '');
      if (!(s >= 0) || !xs.length) continue;
      xs.forEach((x, k) => W.push({ w: x, s: t0 + s + (e - s) * k / xs.length, e: t0 + s + (e - s) * (k + 1) / xs.length }));
    }
    return W;
  }

  /* ---------- cache, queue, hooks ---------- */
  const NEQ = { list: [], busy: false, bk: null, d: null };
  function neData() {
    if (!S.book) return {};
    if (NEQ.bk !== S.book.id) { NEQ.bk = S.book.id; NEQ.d = store.get('wt:ne:' + S.book.id, {}) || {}; }
    return NEQ.d;
  }
  function neSave() { if (S.book && NEQ.bk === S.book.id) store.set('wt:ne:' + S.book.id, NEQ.d); }
  /* Trusted cut for cutFor(): [introEnd, outroStart|null], or null. */
  function neCut(i) {
    if (P.smartCut === false || !S.book) return null;
    const e = neData()[i];
    if (!e || e.v !== NE_V) return null;
    const a = e.c === 'h' ? e.a || 0 : 0, o = e.oc === 'h' ? e.o : null;
    return a > 0 || o != null ? [a, o == null ? null : o] : null;
  }
  /* A weaker find: only moves the Skip intro button to the exact time. */
  function neHint(i) {
    if (P.smartCut === false || !S.book) return 0;
    const e = neData()[i];
    return e && e.v === NE_V && e.c === 'm' && e.a > 3 ? e.a : 0;
  }
  function neBookToks(i) {
    const p = S.plan && S.plan[i];
    if (!p || !S.model || !p.ids || !p.ids.length) return null;
    const out = [];
    for (const id of p.ids) { const s = S.model.sents[id]; if (!s || s.h) continue; out.push(...toks(s.t)); if (out.length >= 24) break; }
    return out.length >= 6 ? out.slice(0, 24) : null;
  }
  function neAllowed() { return P.smartCut !== false && bgAllowed() && 'Worker' in window; }
  async function neDetect(i) {
    const book = S.book, sec = S.secs && S.secs[i];
    if (!book || !sec || P.smartCut === false) return;
    const d = neData();
    if (d[i] && d[i].v === NE_V) return;
    const dur = S.durs[i] || 0;
    let head = null, tail = null, src = 'timing';
    const tw = neTimingWords(i);
    if (tw) { head = tw.filter(x => x.s < 160); tail = dur ? tw.filter(x => x.s > dur - 140) : []; }
    else {
      if (!neAllowed()) return;
      src = 'asr';
      try { head = await neTranscribe(i, 0, 110); tail = dur > 240 ? await neTranscribe(i, dur - 110, dur) : []; }
      catch (e) { console.warn('Wordtrail: could not listen to track ' + (i + 1), e); return; }
    }
    if (S.book !== book) return;
    const ri = neFindIntro(head, neBookToks(i)), ro = neFindOutro(tail, dur);
    d[i] = { v: NE_V, a: ri.a, c: ri.c, o: ro.o, oc: ro.c, s: src };
    neSave();
    if (S.model) replan(false);
    neApply(i);
  }
  /* Detected while the track is already playing near its start: skip now, with an Undo. */
  function neApply(i) {
    const c = neCut(i), e = neData()[i];
    if (!c || !(c[0] > 0) || i !== S.sec) return;
    const t = audio.currentTime || 0;
    if (t < c[0] - 1.5 && t < 70) {
      seekAudio(c[0]);
      toast('Skipped the LibriVox notice', 6000, ['Undo', () => { if (e) { e.c = 'm'; neSave(); if (S.model) replan(false); } seekAudio(t); }]);
    }
  }
  async function neRun() {
    if (NEQ.busy) return;
    NEQ.busy = true;
    try {
      while (NEQ.list.length) {
        const i = NEQ.list.shift();
        try { await neDetect(i); } catch (e) { console.warn('Wordtrail: intro/outro detection failed', e); }
        await new Promise(r => setTimeout(r, 400));
      }
    } finally { NEQ.busy = false; }
  }
  /* Called when a track is opened: this track first, then the next one, so its cut is ready before it starts. */
  function neKick(i) {
    if (P.smartCut === false || !S.book || !S.secs) return;
    const add = (k, front) => { if (k < 0 || k >= S.secs.length || NEQ.list.includes(k)) return; const e = neData()[k]; if (e && e.v === NE_V) return; if (front) NEQ.list.unshift(k); else NEQ.list.push(k); };
    add(i + 1, false); add(i, true);
    setTimeout(neRun, 300);
  }
