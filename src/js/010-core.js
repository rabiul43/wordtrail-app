'use strict';
/* Wordtrail core: text cleaning, chapter detection, sentence splitting, timing plan.
   Pure functions, no DOM, so it can be tested in Node. */
const makeCore = () => {
  const ABBR = new Set(['mr', 'mrs', 'ms', 'dr', 'mt', 'prof', 'capt', 'col', 'gen', 'lt', 'sr', 'jr', 'vs', 'rev', 'hon', 'sgt', 'maj', 'messrs', 'mme', 'mlle', 'esq', 'gov', 'sen', 'st']);

  const WORD_NUM = {
    one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
    eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17,
    eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60,
    seventy: 70, eighty: 80, ninety: 90, hundred: 100,
    first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10
  };
  const NUMW = '(?:' + Object.keys(WORD_NUM).join('|') + ')';
  const KW = 'chapter|chap|book|part|letter|stave|section|canto|act|scene|story|tale|fable|lesson|epistle|sermon|track';
  const NAMED = 'preface|introduction|prologue|epilogue|foreword|conclusion|afterword|appendix|dedication';

  const HEAD_RE = new RegExp('^(?:' + KW + ')\\.?\\s+(?:[ivxlcdm]+|\\d+|' + NUMW + '(?:[- ]' + NUMW + ')?)\\b[\\s\\S]{0,70}$', 'i');
  const NAMED_RE = new RegExp('^(?:the\\s+)?(?:author\\W?s\\s+|translator\\W?s\\s+)?(?:' + NAMED + ')\\.?$', 'i');
  const ROMAN_ONLY = /^[IVXLC]{1,7}\.?$/;
  const NUM_ONLY = /^\d{1,3}\.?$/;

  function roman(s) {
    s = s.toUpperCase();
    if (!/^[IVXLCDM]+$/.test(s)) return null;
    const v = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
    let t = 0;
    for (let i = 0; i < s.length; i++) {
      const a = v[s[i]], b = v[s[i + 1]] || 0;
      t += a < b ? -a : a;
    }
    return t;
  }

  function wordNum(tok) {
    let total = 0, any = false;
    for (const w of tok.toLowerCase().split(/[-\s]+/)) {
      if (!(w in WORD_NUM)) return null;
      any = true;
      if (w === 'hundred') total = (total || 1) * 100; else total += WORD_NUM[w];
    }
    return any ? total : null;
  }

  function tokenNum(tok) {
    if (/^\d/.test(tok)) return +tok;
    const w = wordNum(tok);
    if (w != null) return w;
    return roman(tok);
  }

  function parseNum(s) {
    s = String(s || '');
    const re = new RegExp('\\b(?:' + KW + ')\\.?\\s*(?:no\\.?\\s*)?([ivxlcdm]+|\\d{1,3}|' + NUMW + '(?:[- ]' + NUMW + ')?)\\b', 'i');
    let m = s.match(re);
    if (m) { const n = tokenNum(m[1]); if (n != null) return n; }
    m = s.match(/^\s*(\d{1,3})\b/);
    if (m) return +m[1];
    m = s.match(/^\s*([IVXLC]+)\.?\s*$/);
    if (m) return roman(m[1]);
    return null;
  }

  /* "Chapter 4", "Chapters 1-3", "Chapters 4 to 6", "Chapters 7 and 8" -> { a, b } (b >= a) */
  function parseRange(s) {
    s = String(s || '');
    const TOK = '[ivxlcdm]+|\\d{1,3}|' + NUMW + '(?:[- ]' + NUMW + ')?';
    const re = new RegExp('\\b(?:' + KW + ')s?\\.?\\s*(?:no\\.?\\s*)?(' + TOK + ')\\b(?:(?:\\s+(?:to|through|thru|and)\\s+|\\s*[-\u2013\u2014&,]\\s*)(?:(?:' + KW + ')s?\\.?\\s*)?(' + TOK + ')\\b)?', 'i');
    const m = s.match(re);
    if (m) {
      const a = tokenNum(m[1]);
      if (a != null) {
        const b = m[2] ? tokenNum(m[2]) : null;
        return { a, b: b != null && b > a && b - a <= 40 ? b : a };
      }
    }
    const n = parseNum(s);
    return n != null ? { a: n, b: n } : null;
  }

  function namedKey(s) {
    const m = String(s || '').toLowerCase().match(new RegExp('\\b(' + NAMED + ')\\b'));
    return m ? m[1] : null;
  }

  /* ---------- Gutenberg cleaning ---------- */
  function stripGutenberg(raw) {
    let t = String(raw).replace(/\r\n?/g, '\n').replace(/^﻿/, '');
    const s = t.search(/\*\*\*\s*START OF (?:THE|THIS) PROJECT GUTENBERG[^\n]*\n/i);
    if (s >= 0) {
      const m = t.slice(s).match(/^[^\n]*\n/);
      t = t.slice(s + m[0].length);
    }
    else { const o = t.search(/^\s*\*END\*\s*THE SMALL PRINT[^\n]*\n/im); if (o >= 0) t = t.slice(o + t.slice(o).match(/^[^\n]*\n[^\n]*\n?/)[0].length - 0); }
    const e = t.search(/\*\*\*\s*END OF (?:THE|THIS) PROJECT GUTENBERG|^\s*End of (?:the )?Project Gutenberg/im);
    if (e >= 0) t = t.slice(0, e);
    return t;
  }

  /* Page numbers on their own line: only removed when they cut a sentence in half (so chapter numbers stay). */
  function dropPageLines(t) {
    let prev = '';
    return t.split('\n').filter(ln => {
      const s = ln.trim();
      if (s && /^(?:\[\s*\d{1,4}\s*\]|[-\u2013\u2014\s]*(?:page\s+)?\d{1,4}[-\u2013\u2014\s]*|[-\u2013\u2014]\s*[ivxlc]{1,6}\s*[-\u2013\u2014])$/i.test(s) && (/^\[/.test(s) || (prev && !/[.!?"\u201d\u2019')]$/.test(prev)))) return false;
      if (s) prev = s;
      return true;
    }).join('\n');
  }

  function toParagraphs(text) {
    let t = text
      .replace(/\[\s*Footnote\s*[^:\]\n]{0,12}:[\s\S]{0,3000}?\]/gi, '')
      .replace(/\[\s*(?:Transcriber|Editor|Translator)['\u2019]?s?\s*Notes?:[\s\S]{0,3000}?\]/gi, '')
      .replace(/\[(?:Illustration|Decoration|Frontispiece|Map|Image)[\s\S]*?\]/gi, '\n\n')
      .replace(/\[\s*(?:Pg|Page|p\.?|pp\.?)\s*[\divxlc]+\s*\]/gi, '')
      .replace(/\{\s*\d+\s*\}/g, '')
      .replace(/(\w)\[(?:\d{1,3}|\*+|[a-z])\]/gi, '$1')
      .replace(/_/g, '');
    t = dropPageLines(t);
    const paras = t.split(/\n\s*\n/)
      .map(p => p.split('\n').map(x => x.trim()).join(' ').replace(/\s+/g, ' ').trim())
      .filter(p => p && !/^[\s*\-_=~.•·]+$/.test(p));
    // Drop transcriber boilerplate near the top
    const boiler = /^(produced by|e-?text prepared by|transcriber|this e-?book|updated editions|online distributed|illustrated by|\[transcriber)/i;
    for (let i = Math.min(paras.length, 12) - 1; i >= 0; i--) {
      if (boiler.test(paras[i])) paras.splice(i, 1);
    }
    return paras;
  }

  function isHeading(p) {
    if (p.length > 90) return false;
    return HEAD_RE.test(p) || NAMED_RE.test(p) || ROMAN_ONLY.test(p) || NUM_ONLY.test(p);
  }

  /* ---------- Sentences ---------- */
  function shouldMerge(prev, next) {
    const stripped = next.replace(/^["“‘'(\[]+/, '');
    if (/^[a-z]/.test(stripped)) return true;
    const startsUpper = /^["“‘'(\[]*[A-Z]/.test(next);
    const m = prev.match(/([A-Za-z]+)\.["”’')\]]*$/);
    if (m && ABBR.has(m[1].toLowerCase()) && startsUpper) return true;
    if (startsUpper && /(^|[\s"“‘(])[B-HJ-Z]\.$/.test(prev)) return true;
    return false;
  }

  function chunkLong(s) {
    const words = s.split(/\s+/).length;
    if (words <= 50) return [s];
    const parts = s.split(/(?<=[;:])\s+/);
    if (parts.length < 2) return [s];
    const out = [];
    let cur = '';
    for (const p of parts) {
      cur = cur ? cur + ' ' + p : p;
      if (cur.split(/\s+/).length >= 14) { out.push(cur); cur = ''; }
    }
    if (cur) {
      if (out.length && cur.split(/\s+/).length < 6) out[out.length - 1] += ' ' + cur; else out.push(cur);
    }
    return out;
  }

  let segmenter = null;
  function splitSentences(text) {
    let segs;
    if (typeof Intl !== 'undefined' && Intl.Segmenter) {
      segmenter = segmenter || new Intl.Segmenter('en', { granularity: 'sentence' });
      segs = Array.from(segmenter.segment(text), x => x.segment.trim()).filter(Boolean);
    } else {
      segs = text.split(/(?<=[.!?]["”’')\]]*)\s+(?=["“‘'(\[]*[A-Z0-9])/).map(s => s.trim()).filter(Boolean);
    }
    const out = [];
    for (const s of segs) {
      const prev = out[out.length - 1];
      if (prev && shouldMerge(prev, s)) out[out.length - 1] = prev + ' ' + s; else out.push(s);
    }
    return out.flatMap(chunkLong);
  }

  /* ---------- Spoken-length estimate ---------- */
  function syllables(word) {
    let w = word.toLowerCase().replace(/[^a-z0-9']/g, '');
    if (!w) return 0;
    if (/\d/.test(w)) return Math.max(1, Math.round(w.length / 1.6));
    w = w.replace(/'/g, '');
    if (w.length <= 3) return 1;
    w = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, '');
    const m = w.match(/[aeiouy]{1,2}/g);
    return Math.max(1, m ? m.length : 1);
  }

  function spokenCost(text, opts = {}) {
    let syl = 0;
    for (const w of text.split(/\s+/)) syl += syllables(w);
    let c = syl * 0.21;
    c += (text.match(/,/g) || []).length * 0.17;
    c += (text.match(/[;:]/g) || []).length * 0.3;
    c += (text.match(/[—–]|--/g) || []).length * 0.2;
    if (/[.!?]["”’')\]]*$/.test(text)) c += 0.45;
    if (opts.paraEnd) c += 0.45;
    if (opts.heading) c += 1.2;
    return c + 0.08;
  }

  /* Spoken length of the standard LibriVox opening notice, so the text can start after it.
     The notice is read at the same pace as the book, so its share of the track is
     intro / (intro + text) rather than a fixed number of seconds. */
  function introCost(title, author, secTitle) {
    const n = parseNum(secTitle);
    const lines = [];
    if (n != null && title) lines.push('Chapter ' + n + ' of ' + title + '.');
    lines.push('This is a LibriVox recording.', 'All LibriVox recordings are in the public domain.',
      'For more information, or to volunteer, please visit librivox.org.');
    if (title) lines.push(title + (author ? ' by ' + author : '') + '.');
    return lines.reduce((a, l) => a + spokenCost(l), 0);
  }

  /* ---------- Audio alignment from pauses ---------- */
  /* RMS loudness per frame (hop seconds) from decoded mono samples. */
  function envelope(data, sr, hop) {
    const step = Math.max(1, Math.round(sr * hop));
    const n = Math.floor(data.length / step);
    const env = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      let a = 0;
      const o = i * step;
      for (let k = 0; k < step; k++) { const v = data[o + k]; a += v * v; }
      env[i] = Math.sqrt(a / step);
    }
    return env;
  }

  /* Speech runs separated by pauses of at least 0.28 s -> [{ s, e }] in seconds. */
  function speechSegments(env, hop) {
    const n = env.length;
    if (!n) return [];
    const sorted = Float32Array.from(env).sort();
    const q = f => sorted[Math.min(n - 1, Math.floor(f * n))];
    const lo = q(0.1), hi = q(0.9);
    const thr = lo + (hi - lo) * 0.15;
    const minPause = Math.max(1, Math.round(0.28 / hop)), minSeg = Math.max(1, Math.round(0.15 / hop));
    const segs = [];
    let s = -1, silent = 0, lastLoud = -1;
    for (let i = 0; i < n; i++) {
      if (env[i] > thr) { if (s < 0) s = i; lastLoud = i; silent = 0; }
      else if (s >= 0 && ++silent >= minPause) {
        if (lastLoud - s + 1 >= minSeg) segs.push({ s: s * hop, e: (lastLoud + 1) * hop });
        s = -1;
      }
    }
    if (s >= 0 && lastLoud - s + 1 >= minSeg) segs.push({ s: s * hop, e: (lastLoud + 1) * hop });
    return segs;
  }

  /* A sentence boundary should follow a real pause: a short gap before a segment makes it a
     less likely place for a new sentence to begin (0 for gaps of 0.6 s or more). */
  function gapPenalty(segs) {
    const g = new Float64Array(segs.length + 1);
    for (let j = 0; j < segs.length; j++) {
      const gap = j === 0 ? 1 : segs[j].s - segs[j - 1].e;
      g[j] = 0.6 * Math.max(0, Math.min(1, (0.6 - gap) / 0.3));
    }
    return g;
  }

  /* Forced-alignment by dynamic programming. Every sentence must begin where speech resumes
     after a pause (a segment start). The first sentence may start anywhere in the first
     couple of minutes, which skips the LibriVox notice by itself; a closing "End of chapter"
     notice is modelled after the last sentence. Returns { starts, score } or null. */
  function alignSentences(segs, dur, costs, introCost) {
    const N = costs.length, M = segs.length;
    if (N < 1 || M < N + 1) return null;
    const b = new Float64Array(M + 1);
    segs.forEach((g, i) => { b[i] = g.s; });
    b[M] = dur;
    const OUTRO = 12, K = 14;
    const all = costs.concat([OUTRO]);
    const C = costs.reduce((x, y) => x + y, 0);
    const W = M + 1;
    const gp = gapPenalty(segs);
    let Lest = introCost > 0 ? introCost : 12;
    const Lest0 = Lest;
    let r = Math.max(0.3, (dur - Lest) / (C + OUTRO));
    let best = null;
    for (let pass = 0; pass < 2; pass++) {
      const f = new Float64Array((N + 2) * W).fill(Infinity);
      const back = new Int32Array((N + 2) * W).fill(-1);
      const win = Math.min(150, 0.3 * dur);
      let any = false;
      for (let j = 0; j < M; j++) if (b[j] <= win) { f[j] = 0.002 * Math.abs(b[j] - Lest) + gp[j] + (b[j] < 0.6 * Lest0 ? 3 : 0); any = true; }
      if (!any) f[0] = 0;
      for (let k = 0; k <= N; k++) {
        const e = Math.max(0.3, all[k] * r), base = k * W, nb = (k + 1) * W;
        for (let j = 0; j < M; j++) {
          const v = f[base + j];
          if (v === Infinity) continue;
          if (k === N) {
            const d = Math.max(0.15, b[M] - b[j]), lr = Math.log(d / e), c = v + lr * lr;
            if (c < f[nb + M]) { f[nb + M] = c; back[nb + M] = j; }
            continue;
          }
          const top = Math.min(M - 1, j + K);
          for (let j2 = j + 1; j2 <= top; j2++) {
            const d = Math.max(0.15, b[j2] - b[j]), lr = Math.log(d / e), c = v + lr * lr + gp[j2];
            if (c < f[nb + j2]) { f[nb + j2] = c; back[nb + j2] = j; }
          }
        }
      }
      const total = f[(N + 1) * W + M];
      if (total === Infinity) return best;
      const idx = new Int32Array(N + 1);
      let j = M;
      for (let k = N + 1; k >= 1; k--) { j = back[k * W + j]; idx[k - 1] = j; }
      const starts = new Float64Array(N);
      for (let k = 0; k < N; k++) starts[k] = b[idx[k]];
      best = { starts, score: total / (N + 1), rate: r };
      Lest = b[idx[0]];
      r = Math.max(0.3, (b[idx[N]] - b[idx[0]]) / C);
    }
    return best;
  }

  /* Align only the first few sentences of a track, from audio that is just the opening
     minutes. Finds where the book text really starts after the spoken LibriVox notice. */
  function alignStart(segs, costs, introCost, rate0) {
    const K = costs.length, M = segs.length, KMAX = 14;
    if (K < 3 || M < K + 1) return null;
    const b = new Float64Array(M);
    segs.forEach((g, i) => { b[i] = g.s; });
    const C = costs.reduce((x, y) => x + y, 0);
    const gp = gapPenalty(segs);
    let Lest = introCost > 0 ? introCost : 12;
    const Lest0 = Lest;
    let r = rate0 > 0 ? rate0 : 1;
    let best = null;
    for (let pass = 0; pass < 2; pass++) {
      const f = new Float64Array((K + 1) * M).fill(Infinity);
      const back = new Int32Array((K + 1) * M).fill(-1);
      let any = false;
      for (let j = 0; j < M; j++) if (b[j] <= 150) { f[j] = 0.002 * Math.abs(b[j] - Lest) + gp[j] + (b[j] < 0.6 * Lest0 ? 3 : 0); any = true; }
      if (!any) f[0] = 0;
      for (let k = 0; k < K; k++) {
        const e = Math.max(0.3, costs[k] * r), base = k * M, nb = (k + 1) * M;
        for (let j = 0; j < M; j++) {
          const v = f[base + j];
          if (v === Infinity) continue;
          const top = Math.min(M - 1, j + KMAX);
          for (let j2 = j + 1; j2 <= top; j2++) {
            const d = Math.max(0.15, b[j2] - b[j]), lr = Math.log(d / e), c = v + lr * lr + gp[j2];
            if (c < f[nb + j2]) { f[nb + j2] = c; back[nb + j2] = j; }
          }
        }
      }
      let end = -1, bv = Infinity;
      for (let j = 0; j < M; j++) if (f[K * M + j] < bv) { bv = f[K * M + j]; end = j; }
      if (end < 0) return best;
      const idx = new Int32Array(K + 1);
      let j = end;
      for (let k = K; k >= 1; k--) { idx[k] = j; j = back[k * M + j]; }
      idx[0] = j;
      const starts = new Float64Array(K);
      for (let k = 0; k < K; k++) starts[k] = b[idx[k]];
      best = { starts, score: bv / K, rate: r };
      Lest = b[idx[0]];
      r = Math.max(0.3, (b[idx[K]] - b[idx[0]]) / C);
    }
    return best;
  }

  /* Align a short run of sentences to the pauses of a short stretch of audio. Every sentence
     starts where speech resumes after a pause. `hit` ({ k, from, to }) says sentence k was heard
     playing somewhere between those two times, which fixes which sentence is which. Returns
     { starts, score, rate } (starts in the audio's own seconds) or null. */
  function alignWindow(segs, costs, r0, hit) {
    const K = costs.length, M = segs.length, KMAX = 14, W = 30;
    if (K < 6 || M < K + 1) return null;
    const b = new Float64Array(M);
    segs.forEach((g, i) => { b[i] = g.s; });
    const gp = gapPenalty(segs);
    let r = r0 > 0 ? r0 : 1, best = null;
    for (let pass = 0; pass < 2; pass++) {
      const f = new Float64Array((K + 1) * M).fill(Infinity);
      const back = new Int32Array((K + 1) * M).fill(-1);
      for (let j = 0; j < M; j++) f[j] = gp[j];
      for (let k = 0; k < K; k++) {
        const e = Math.max(0.3, costs[k] * r), base = k * M, nb = (k + 1) * M;
        for (let j = 0; j < M; j++) {
          const v = f[base + j];
          if (v === Infinity) continue;
          const top = Math.min(M - 1, j + KMAX);
          for (let j2 = j + 1; j2 <= top; j2++) {
            const d = Math.max(0.15, b[j2] - b[j]), lr = Math.log(d / e);
            let c = v + lr * lr + gp[j2];
            if (hit && k === hit.k) { const x = Math.max(0, b[j] - hit.to), y = Math.max(0, hit.from - b[j2]); c += W * (x * x + y * y); }
            if (c < f[nb + j2]) { f[nb + j2] = c; back[nb + j2] = j; }
          }
        }
      }
      let end = -1, bv = Infinity;
      for (let j = 0; j < M; j++) if (f[K * M + j] < bv) { bv = f[K * M + j]; end = j; }
      if (end < 0) return best;
      const idx = new Int32Array(K + 1);
      let j = end;
      for (let k = K; k >= 1; k--) { idx[k] = j; j = back[k * M + j]; }
      idx[0] = j;
      const starts = new Float64Array(K);
      for (let k = 0; k < K; k++) starts[k] = b[idx[k]];
      best = { starts, end: b[idx[K]], score: bv / K, rate: r };
      let C = 0;
      for (let k = 1; k < K - 2; k++) C += costs[k];
      if (C > 0 && starts[K - 2] > starts[1]) r = Math.max(0.3, (starts[K - 2] - starts[1]) / C);
    }
    return best;
  }

  /* The pause-break nearest `center` inside [from, to]; breaks that follow a long pause win
     over ones that follow a short pause (a comma). Returns a time or null. segs is sorted. */
  function snapBoundary(segs, from, to, center) {
    let best = null, bs = Infinity;
    for (let j = 0; j < segs.length; j++) {
      const s = segs[j].s;
      if (s < from) continue;
      if (s > to) break;
      const gap = j === 0 ? 1 : s - segs[j - 1].e;
      const g = Math.max(0, Math.min(1, (0.6 - gap) / 0.3));
      const sc = Math.abs(s - center) / 0.6 + 2 * g;
      if (sc < bs) { bs = sc; best = s; }
    }
    return best;
  }

  /* ---------- MP3 helpers (reading a slice from the middle of a track) ---------- */
  const MP3_BR1 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
  const MP3_BR2 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];
  const MP3_SR = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] };
  function mp3Header(u, i) {
    if (i < 0 || i + 4 > u.length || u[i] !== 0xFF || (u[i + 1] & 0xE0) !== 0xE0) return null;
    const ver = (u[i + 1] >> 3) & 3, layer = (u[i + 1] >> 1) & 3;
    if (ver === 1 || layer !== 1) return null;
    const bi = u[i + 2] >> 4, si = (u[i + 2] >> 2) & 3, pad = (u[i + 2] >> 1) & 1;
    if (bi === 0 || bi === 15 || si === 3) return null;
    const br = (ver === 3 ? MP3_BR1 : MP3_BR2)[bi], sr = MP3_SR[ver][si];
    return { br, sr, spf: ver === 3 ? 1152 : 576, len: Math.floor((ver === 3 ? 144 : 72) * br * 1000 / sr) + pad };
  }
  function id3End(u) {
    if (u.length >= 10 && u[0] === 0x49 && u[1] === 0x44 && u[2] === 0x33) {
      return 10 + (((u[6] & 0x7F) << 21) | ((u[7] & 0x7F) << 14) | ((u[8] & 0x7F) << 7) | (u[9] & 0x7F)) + ((u[5] & 0x10) ? 10 : 0);
    }
    return 0;
  }
  /* First offset >= from that starts a run of valid, consecutive MP3 frames, or -1. */
  function findMp3Sync(u, from) {
    for (let i = Math.max(0, from); i + 4 <= u.length; i++) {
      const h = mp3Header(u, i);
      if (!h) continue;
      let n = i, ok = 0;
      for (; ok < 3; ok++) {
        if (n + 4 > u.length) break;
        const q = mp3Header(u, n);
        if (!q || q.sr !== h.sr) { ok = -1; break; }
        n += q.len;
      }
      if (ok >= 1) return i;
    }
    return -1;
  }
  /* Walks whole frames from `start`: { end, frames, vbr, first }. `end` is after the last complete frame. */
  function walkFrames(u, start) {
    const first = mp3Header(u, start);
    let n = start, frames = 0, vbr = false;
    while (first) {
      const h = mp3Header(u, n);
      if (!h || n + h.len > u.length) break;
      if (h.br !== first.br) vbr = true;
      n += h.len; frames++;
    }
    return { end: n, frames, vbr, first };
  }

  /* ---------- Book model ---------- */
  function parseBook(raw) {
    const paras = toParagraphs(stripGutenberg(raw));
    let cur = { title: 'Front matter', front: true, paras: [] };
    const chapters = [cur];
    for (const p of paras) {
      if (isHeading(p)) {
        cur = { title: p, front: false, paras: [] };
        chapters.push(cur);
      } else cur.paras.push(p);
    }
    let kept = chapters.filter((c, i) => i === 0 ? c.paras.length > 0 : c.paras.join(' ').length >= 60);
    if (!kept.some(c => !c.front)) {
      kept = [{ title: 'Full text', front: false, paras: paras.slice() }];
    }
    const sents = [];
    const chs = [];
    let pid = 0;
    kept.forEach((c, ci) => {
      const start = sents.length;
      if (!c.front && c.title) {
        sents.push({ t: c.title, ch: ci, p: -1, h: true, cost: spokenCost(c.title, { heading: true }) });
      }
      for (const p of c.paras) {
        pid++;
        const ss = splitSentences(p);
        ss.forEach((t, k) => sents.push({ t, ch: ci, p: pid, h: false, cost: spokenCost(t, { paraEnd: k === ss.length - 1 }) }));
      }
      let cost = 0;
      for (let k = start; k < sents.length; k++) cost += sents[k].cost;
      chs.push({ title: c.title, front: c.front, start, end: sents.length, cost });
    });
    return { sents, chapters: chs };
  }

  /* ---------- Section <-> chapter mapping ---------- */
  /* Maps each track to a run of chapters: map[i] is the first chapter, span[i] the last
     (both indexes into `chapters`, -1 when a track has no text). Tracks whose titles name
     chapters ("Chapter 4", "Chapters 1-3") are pinned to those chapters. Tracks in between
     (and books whose titles name nothing) share the remaining chapters by duration, with
     every boundary snapped to a real chapter start. Text before the first pinned chapter,
     such as a long preface, is left out. */
  function defaultMap(chapters, secs) {
    const real = [];
    chapters.forEach((c, i) => { if (!c.front) real.push(i); });
    const n = secs.length;
    const lo = new Array(n).fill(-1), hi = new Array(n).fill(-1); // positions in `real`, hi exclusive
    let from = 0, pinned = 0;
    secs.forEach((sec, i) => {
      const title = sec.title || '';
      const r = parseRange(title), key = namedKey(title);
      if (!r && !key) return;
      let j0 = -1;
      for (let j = from; j < real.length; j++) {
        const ct = chapters[real[j]].title;
        if ((r && parseNum(ct) === r.a) || (key && namedKey(ct) === key)) { j0 = j; break; }
      }
      if (j0 < 0) return;
      let j1 = j0;
      if (r && r.b > r.a && !key) {
        for (let j = j0 + 1; j < real.length; j++) if (parseNum(chapters[real[j]].title) === r.b) { j1 = j; break; }
      }
      lo[i] = j0; hi[i] = j1 + 1; from = j1 + 1; pinned++;
    });
    if (!pinned && real.length === n) {
      const map = secs.map((_, i) => real[i]);
      return { mode: 'chapter', map, span: map.slice(), matched: n, approx: false };
    }
    // Chapters skipped between two neighbouring pinned tracks belong to the earlier one.
    for (let i = 0; i + 1 < n; i++) if (lo[i] >= 0 && lo[i + 1] >= 0 && lo[i + 1] > hi[i]) hi[i] = lo[i + 1];
    // Share the remaining chapters among runs of unpinned tracks.
    for (let s0 = 0; s0 < n;) {
      if (lo[s0] >= 0) { s0++; continue; }
      let e0 = s0;
      while (e0 + 1 < n && lo[e0 + 1] < 0) e0++;
      let A = s0 > 0 ? hi[s0 - 1] : 0;
      const B = e0 < n - 1 ? lo[e0 + 1] : real.length;
      if (s0 === 0) while (A < B && namedKey(chapters[real[A]].title)) A++;
      const m = B - A;
      if (m > 0) {
        const cc = [0];
        for (let j = A; j < B; j++) cc.push(cc[cc.length - 1] + (chapters[real[j]].cost || 1));
        const W = cc[m];
        const k = e0 - s0 + 1;
        const dur = secs.slice(s0, e0 + 1).map(x => Math.max(1, x.dur || 1));
        const D = dur.reduce((x, y) => x + y, 0);
        const cut = [0];
        let acc = 0;
        for (let t = 1; t < k; t++) {
          acc += dur[t - 1];
          const target = W * acc / D;
          let best = cut[t - 1];
          for (let q = best; q <= m; q++) if (Math.abs(cc[q] - target) < Math.abs(cc[best] - target)) best = q;
          cut.push(best);
        }
        cut.push(m);
        for (let t = 0; t < k; t++) if (cut[t + 1] > cut[t]) { lo[s0 + t] = A + cut[t]; hi[s0 + t] = A + cut[t + 1]; }
      }
      s0 = e0 + 1;
    }
    const map = lo.map(j => (j >= 0 ? real[j] : -1));
    const span = hi.map((h, i) => (lo[i] >= 0 ? real[h - 1] : -1));
    /* Nothing matched by name and some tracks got no chapter: share all the text across tracks by length,
       so every track shows something close at once (exact timing tightens it later). */
    if (pinned === 0 && map.some(x => x < 0)) return { mode: 'continuous', map, span, matched: pinned, approx: true };
    return { mode: 'chapter', map, span, matched: pinned, approx: pinned === 0 };
  }

  /* ---------- Timing plan ---------- */
  function sectionTimes(p, dur, lead, outro, anchors, intro) {
    const O = dur > 40 ? outro : outro * dur / 40;
    const C = p.cHi - p.cLo;
    let L;
    if (lead == null) {
      L = intro > 0 && C > 0 ? Math.min(dur * 0.5, intro * 2.5, Math.max(0, dur - O) * intro / (intro + C)) : (dur > 40 ? 12 : 12 * dur / 40);
    } else L = dur > 40 ? lead : lead * dur / 40;
    const n = p.ids.length;
    p.starts = new Array(n);
    if (!n) return;
    const costAt = id => {
      let lo = 0, hi = n - 1;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (p.ids[mid] === id) return p.cost[mid];
        if (p.ids[mid] < id) lo = mid + 1; else hi = mid - 1;
      }
      return null;
    };
    let pts = [];
    (anchors || []).forEach(a => {
      const c = costAt(a.id);
      if (c != null) pts.push([c, a.t]);
    });
    pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const mono = [];
    for (const q of pts) {
      const last = mono[mono.length - 1];
      if (last && (q[0] === last[0] || q[1] < last[1])) continue;
      mono.push(q);
    }
    pts = mono;
    const endT = dur - O;
    if (!pts.length || pts[0][0] > p.cLo) {
      const t = pts.length ? Math.max(0, Math.min(L, pts[0][1] - 0.5)) : L;
      pts.unshift([p.cLo, t]);
    }
    if (pts[pts.length - 1][0] < p.cHi) {
      const t = Math.min(dur, Math.max(endT, pts[pts.length - 1][1] + 0.5));
      pts.push([p.cHi, t]);
    }
    let j = 0;
    for (let k = 0; k < n; k++) {
      const c = p.cost[k];
      while (j < pts.length - 2 && c >= pts[j + 1][0]) j++;
      const a = pts[j], b = pts[Math.min(j + 1, pts.length - 1)];
      let t;
      if (b[0] === a[0]) t = a[1];
      else t = a[1] + (c - a[0]) * (b[1] - a[1]) / (b[0] - a[0]);
      p.starts[k] = Math.max(0, Math.min(t, dur));
    }
  }

  function buildPlan(model, durs, mode, map, anchors, lead, outro, span, intros, ranges, cuts) {
    const leadN = lead == null ? 12 : lead;
    const { sents, chapters } = model;
    const n = durs.length;
    const plan = Array.from({ length: n }, () => ({ ids: [], cost: [], cLo: 0, cHi: 0, starts: [] }));
    if (mode === 'chapter') {
      for (let i = 0; i < n; i++) {
        const c = map[i];
        if (c == null || c < 0 || !chapters[c]) continue;
        const e = span && span[i] > c && chapters[span[i]] ? span[i] : c;
        const first = chapters[c].start, last = chapters[e].end, p = plan[i];
        let acc = 0;
        for (let k = first; k < last; k++) { p.ids.push(k); p.cost.push(acc); acc += sents[k].cost; }
        p.cHi = acc;
      }
    } else {
      const ids = [], cum = [];
      let W = 0;
      chapters.forEach(ch => {
        if (ch.front) return;
        for (let k = ch.start; k < ch.end; k++) { ids.push(k); cum.push(W); W += sents[k].cost; }
      });
      const eff = durs.map(d => Math.max(1, d - leadN - outro));
      const E = eff.reduce((a, b) => a + b, 0) || 1;
      let acc = 0, ptr = 0;
      for (let i = 0; i < n; i++) {
        const lo = W * acc / E;
        acc += eff[i];
        const hi = i === n - 1 ? W + 1e-9 : W * acc / E;
        const p = plan[i];
        p.cLo = lo; p.cHi = Math.min(hi, W);
        while (ptr < ids.length && cum[ptr] < hi) {
          p.ids.push(ids[ptr]); p.cost.push(cum[ptr]); ptr++;
        }
      }
    }
    if (ranges) for (let i = 0; i < n; i++) {
      const r = ranges[i];
      if (!r || !(r[1] > r[0]) || r[1] > sents.length) continue;
      const p = plan[i];
      p.ids = []; p.cost = []; p.cLo = 0;
      let acc = 0;
      for (let k = r[0]; k < r[1]; k++) { p.ids.push(k); p.cost.push(acc); acc += sents[k].cost; }
      p.cHi = acc;
    }
    for (let i = 0; i < n; i++) {
      const c = cuts && cuts[i];
      sectionTimes(plan[i], durs[i], c ? c[0] : lead, c && c[1] != null ? Math.max(0, durs[i] - c[1]) : outro, anchors && anchors[i], intros && intros[i]);
    }
    return plan;
  }

  function locate(starts, t) {
    let lo = 0, hi = starts.length - 1, ans = 0;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (starts[mid] <= t) { ans = mid; lo = mid + 1; } else hi = mid - 1;
    }
    return ans;
  }

  function formatTime(s) {
    if (!isFinite(s) || s < 0) s = 0;
    s = Math.floor(s);
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
    return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0');
  }

  /* Fills the gaps in a sentence's word times (null = word the recogniser missed) by interpolating
     between neighbours, extends the ends at a steady pace, and keeps the times non-decreasing. */
  function fillWordTimes(arr, pace) {
    const n = arr.length, step = pace > 0 ? pace : 0.28;
    let f = -1, l = -1;
    for (let i = 0; i < n; i++) if (arr[i] != null) { if (f < 0) f = i; l = i; }
    if (f < 0) return null;
    const out = new Array(n);
    for (let i = 0; i < n; i++) {
      if (arr[i] != null) { out[i] = arr[i]; continue; }
      if (i < f) { out[i] = Math.max(0, arr[f] - step * (f - i)); continue; }
      if (i > l) { out[i] = arr[l] + step * (i - l); continue; }
      let a = i - 1; while (arr[a] == null) a--;
      let b = i + 1; while (arr[b] == null) b++;
      out[i] = arr[a] + (arr[b] - arr[a]) * (i - a) / (b - a);
    }
    for (let i = 1; i < n; i++) if (out[i] < out[i - 1]) out[i] = out[i - 1];
    return out.map(x => +x.toFixed(2));
  }

  return { fillWordTimes, stripGutenberg, toParagraphs, isHeading, splitSentences, syllables, spokenCost, parseBook, defaultMap, buildPlan, introCost, envelope, speechSegments, alignSentences, alignStart, alignWindow, snapBoundary, mp3Header, id3End, findMp3Sync, walkFrames, sectionTimes, locate, parseNum, parseRange, namedKey, formatTime };
};
const Core = makeCore();

