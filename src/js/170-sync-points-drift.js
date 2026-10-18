  /* ---------- sync points (tier 2) ---------- */
  /* A tap pins its sentence and also re-times the stretch around it. Sentences within REACH
     seconds of speech move by the same error, then ease back to their old times at the edges
     (two soft "shoulder" points, flagged s:1). Soft points and automatic alignment points
     inside that stretch are replaced; points the reader tapped earlier are never touched. */
  const SYNC_REACH = 45;
  function setAnchor(id, o) {
    o = o || {};
    if (S.sentSec[id] !== S.sec) return;
    const sec = S.sec, p = S.plan[sec], k = S.sentPos[id];
    const t = Math.max(0, +(o.at != null ? o.at : audio.currentTime + P.nudge - TAP_DELAY).toFixed(2));
    if (!o.keepUndo) S.undo = { sec, list: JSON.parse(JSON.stringify(S.anchors[sec] || [])), auto: S.autoSrc[sec] };
    const wasAuto = !!S.autoSrc[sec];
    const isSoft = a => wasAuto || !!a.s;
    const delta = p && p.starts[k] != null ? t - p.starts[k] : 0;
    const c0 = p ? p.cost[k] : 0;
    /* `extras` are sentence times read from the audio itself; the stretch widens to hold them. */
    let ex = (o.extras || []).filter(e => e.id !== id && S.sentSec[e.id] === sec);
    let reach = Math.max(SYNC_REACH, Math.abs(delta) * 3);
    if (ex.length) reach = Math.max(reach, Math.max.apply(null, ex.map(e => Math.abs(p.cost[S.sentPos[e.id]] - c0))) + 12);
    let hb = -Infinity, ha = Infinity;
    const list = [];
    for (const a of (S.anchors[sec] || [])) {
      if (a.id === id) continue;
      const j = S.sentSec[a.id] === sec ? S.sentPos[a.id] : -1;
      if (j >= 0) {
        const d = p.cost[j] - c0;
        if (isSoft(a)) { if (Math.abs(d) < reach) continue; }
        else if (Math.abs(d) < reach) { if (d < 0) hb = Math.max(hb, d); else ha = Math.min(ha, d); }
      }
      if (a.id < id ? a.t > t : a.t < t) continue;
      list.push(isSoft(a) && !a.s ? Object.assign({}, a, { s: 1, a: 1 }) : a);
    }
    const hardBefore = hb > -Infinity, hardAfter = ha < Infinity;
    ex = ex.filter(e => { const d = p.cost[S.sentPos[e.id]] - c0; return d > hb && d < ha; }).sort((x, y) => x.id - y.id);
    list.push(o.fromAudio ? { id, t, s: 1, a: 1 } : { id, t });
    ex.forEach(e => list.push({ id: e.id, t: +Math.max(0, e.t).toFixed(2), s: 1, a: 1 }));
    if (p && k >= 0) {
      const has = x => list.some(a => a.id === x);
      const lowE = ex.length && ex[0].id < id ? ex[0] : null, highE = ex.length && ex[ex.length - 1].id > id ? ex[ex.length - 1] : null;
      if (!hardBefore) {
        const refC = lowE ? p.cost[S.sentPos[lowE.id]] : c0, refT = lowE ? lowE.t : t;
        let j = k - 1;
        while (j >= 0 && c0 - p.cost[j] < reach) j--;
        if (j >= 0 && !has(p.ids[j])) list.push({ id: p.ids[j], t: +Math.max(0, Math.min(p.starts[j], refT - 0.5 * (refC - p.cost[j]))).toFixed(2), s: 1 });
      }
      if (!hardAfter) {
        const refC = highE ? p.cost[S.sentPos[highE.id]] : c0, refT = highE ? highE.t : t;
        let j = k + 1;
        while (j < p.ids.length && p.cost[j] - c0 < reach) j++;
        if (j < p.ids.length && !has(p.ids[j])) list.push({ id: p.ids[j], t: +Math.max(p.starts[j], refT + 0.5 * (p.cost[j] - refC)).toFixed(2), s: 1 });
      }
    }
    list.sort((a, b) => a.id - b.id);
    delete S.autoSrc[sec];
    S.anchors[sec] = list;
    S.curId = -1; replan(false); persist();
    if (o.quiet) return;
    if (o.undo) toast(o.msg, 6000, ['Undo', undoAnchor]); else toast(o.msg || 'Synced. The sentences around it moved too.');
  }
  function undoAnchor() {
    const u = S.undo;
    if (!u || u.sec !== S.sec) return;
    S.anchors[u.sec] = u.list;
    if (u.auto) S.autoSrc[u.sec] = u.auto; else delete S.autoSrc[u.sec];
    S.undo = null; S.curId = -1; replan(false); persist();
    toast('Undone.');
  }

  /* ---------- pause map: what the audio itself says about where sentences can break ---------- */
  /* Per track: the speech runs found so far ({ s, e } in track seconds) and which stretches of
     the track they cover. Filled by the full and opening analyses, and by small slices of audio
     read on demand. Kept on the device so a stretch is only ever analysed once. */
  const segKey = sec => 'seg:' + S.book.id + ':' + sec;
  async function loadSegs(sec) {
    if (S.seg[sec]) return S.seg[sec];
    const book = S.book;
    let d = null;
    try { d = await idb.get(segKey(sec)); } catch (e) { /* none saved */ }
    if (S.book !== book) return { cov: [], segs: [] };
    return (S.seg[sec] = (d && Array.isArray(d.cov) && Array.isArray(d.segs)) ? d : { cov: [], segs: [] });
  }
  function mergeSegs(sec, list, lo, hi, edge) {
    const m = S.seg[sec] || (S.seg[sec] = { cov: [], segs: [] });
    const a = lo + edge, z = hi - edge;
    const fresh = list.filter(g => g.s >= a && g.e <= z).map(g => ({ s: +g.s.toFixed(3), e: +g.e.toFixed(3) }));
    m.segs = m.segs.filter(g => g.s < a || g.s > z).concat(fresh).sort((x, y) => x.s - y.s);
    m.cov.push([a, z]); m.cov.sort((x, y) => x[0] - y[0]);
    const out = [];
    for (const c of m.cov) { const l = out[out.length - 1]; if (l && c[0] <= l[1] + 0.5) l[1] = Math.max(l[1], c[1]); else out.push(c.slice()); }
    m.cov = out;
    idb.set(segKey(sec), m);
  }
  const STREAM_CAP = 24e6;
  /* Bytes a..b of a file. Uses an HTTP range request; if the server ignores it, reads through
     the file up to byte b (only for the first ~24 MB). */
  async function rangeFetch(url, a, b) {
    const lb = await dlBlob(url); // saved on this device: read it from there
    if (lb) return { bytes: new Uint8Array(await lb.slice(a, b + 1).arrayBuffer()), start: a, total: lb.size };
    let res;
    try { res = await fetch(url, { mode: 'cors', headers: { Range: 'bytes=' + a + '-' + b } }); } catch (e) { throw new Error('blocked'); }
    if (res.status === 206) {
      const m = (res.headers.get('content-range') || '').match(/\/(\d+)\s*$/);
      return { bytes: new Uint8Array(await res.arrayBuffer()), start: a, total: m ? +m[1] : 0 };
    }
    if (!res.ok || !res.body) throw new Error('blocked');
    if (b > STREAM_CAP) { try { res.body.cancel(); } catch (e) { /* closed */ } throw new Error('range'); }
    const total = +res.headers.get('content-length') || 0;
    const rd = res.body.getReader(), chunks = [];
    let got = 0;
    while (got <= b) { const { done, value } = await rd.read(); if (done) break; chunks.push(value); got += value.length; }
    try { rd.cancel(); } catch (e) { /* closed */ }
    const all = new Uint8Array(got);
    let o = 0; for (const c of chunks) { all.set(c, o); o += c.length; }
    return { bytes: all.slice(a, b + 1), start: a, total };
  }
  /* Where the audio starts in the file and how many bytes a second takes (constant-bitrate MP3 only). */
  async function audioInfo(sec) {
    if (S.ainfo[sec]) return S.ainfo[sec];
    const url = S.secs[sec].url;
    const head = await rangeFetch(url, 0, 16383);
    let u = head.bytes, base = 0, total = head.total;
    const tag = Core.id3End(u);
    if (tag + 4096 > u.length) { const r2 = await rangeFetch(url, tag, tag + 8191); u = r2.bytes; base = tag; total = total || r2.total; }
    const at = Core.findMp3Sync(u, tag - base);
    if (at < 0) throw new Error('format');
    const w = Core.walkFrames(u, at);
    if (!w.first || w.vbr || w.frames < 5) throw new Error('vbr');
    const info = { dataStart: base + at, bps: w.first.br * 125 };
    const dur = (sec === S.sec && isFinite(audio.duration)) ? audio.duration : (S.durs[sec] || 0);
    if (total && dur && Math.abs((total - info.dataStart) / info.bps - dur) / dur > 0.04) throw new Error('vbr');
    return (S.ainfo[sec] = info);
  }
  /* Reads only the bytes for [lo, hi] seconds, decodes them and finds the speech runs. */
  async function fetchWindow(sec, lo, hi) {
    const info = await audioInfo(sec);
    const dur = (sec === S.sec && isFinite(audio.duration)) ? audio.duration : (S.durs[sec] || 1e9);
    lo = Math.max(0, lo); hi = Math.min(dur, hi);
    if (hi - lo < 3) throw new Error('window');
    const a = Math.max(info.dataStart, info.dataStart + Math.floor(lo * info.bps) - 2048), b = info.dataStart + Math.ceil(hi * info.bps) + 2048;
    const r = await rangeFetch(S.secs[sec].url, a, b);
    const at = Core.findMp3Sync(r.bytes, 0);
    if (at < 0) throw new Error('format');
    const w = Core.walkFrames(r.bytes, at);
    if (w.frames < 20) throw new Error('window');
    const decoded = await decodeWhole(r.bytes.slice(at, w.end).buffer);
    const t0 = (r.start + at - info.dataStart) / info.bps, hop = 0.02;
    const segs = (await BG.seg(decoded.getChannelData(0), decoded.sampleRate, hop)).map(g => ({ s: g.s + t0, e: g.e + t0 }));
    return { segs, lo: t0, hi: t0 + decoded.duration };
  }
  async function ensureSegs(sec, lo, hi) {
    const book = S.book, m = await loadSegs(sec);
    if (m.cov.some(c => c[0] <= lo && c[1] >= hi)) return m;
    const w = await fetchWindow(sec, lo, hi);
    if (S.book !== book) throw new Error('stale');
    mergeSegs(sec, w.segs, w.lo, w.hi, 1);
    return S.seg[sec];
  }

  /* Sync tap: the tap time is used at once, then snapped to the real pause nearby. */
  function syncTap(id) {
    const sec = S.sec, cur = audio.currentTime;
    setAnchor(id, { at: cur + P.nudge - TAP_DELAY });
    snapTap(sec, id, cur);
  }
  async function snapTap(sec, id, cur) {
    try {
      const m = await ensureSegs(sec, cur - 8, cur + 1);
      if (S.sec !== sec) return;
      const b = Core.snapBoundary(m.segs, cur - 1.6, cur - 0.15, cur - TAP_DELAY);
      const now = (S.anchors[sec] || []).find(a => a.id === id);
      if (b == null || !now) return;
      const t = b + P.nudge;
      if (Math.abs(now.t - t) < 0.05) return;
      setAnchor(id, { at: t, quiet: true, keepUndo: true });
      toast('Snapped to the narrator\'s pause.');
    } catch (e) { /* the audio cannot be read here: the tap time stands */ }
  }

  /* Double-tap a sentence while it is playing: "this is what I hear now". The app reads the
     audio around this moment, lines the nearby sentences up with its real pauses, and re-times
     them all. If the audio cannot be read, the start is estimated instead: half a sentence
     (plus the reaction delay) before the current moment. */
  const MAX_RESYNC = 90;
  function resyncTime(starts, k, nowT, endT) {
    const a = starts[k], b = k + 1 < starts.length ? starts[k + 1] : endT;
    const len = Math.min(18, Math.max(1.5, b - a));
    if (nowT >= a && nowT < b) return { t: a, confirm: true, off: 0 };
    const t = Math.max(0, nowT - TAP_DELAY - len / 2);
    return { t, confirm: false, off: t - a };
  }
  /* Returns { t, extras, n, drift, count } (times in highlight units) or null when the audio does not fit the text.
     `drift` is the median of (time found in the audio) - (time the plan expected) over the sentences in the window.
     opts: back/fwd = seconds of audio read before/after `cur`; slack = how far (seconds) the sentence heard now
     may be from where the plan thinks it is, which is what lets a drift be seen instead of assumed away. */
  async function refineWindow(sec, id, cur, opts) {
    const o = opts || {}, back = o.back || 50, fwd = o.fwd || 45, slack = o.slack || 0;
    const p = S.plan[sec], k = S.sentPos[id], n = p.ids.length;
    const dur = isFinite(audio.duration) ? audio.duration : (S.durs[sec] || 1e9);
    const lo = Math.max(0, cur - back), hi = Math.min(dur, cur + fwd);
    /* Pick sentences by where the plan puts them, kept well inside the slice of audio. */
    let kLo = k, kHi = k;
    while (kLo > 0 && p.starts[kLo - 1] - P.nudge > lo + 8) kLo--;
    while (kHi < n - 1 && p.starts[kHi + 1] - P.nudge < hi - 10) kHi++;
    if (kHi - kLo + 1 < 6) return null;
    const m = await ensureSegs(sec, lo, hi);
    const segs = m.segs.filter(g => g.s >= lo && g.e <= hi);
    const costs = p.ids.slice(kLo, kHi + 1).map(i => S.model.sents[i].cost);
    const dc = p.cost[kHi] - p.cost[kLo], ds = p.starts[kHi] - p.starts[kLo];
    const r0 = dc > 0 && ds > 0 ? Math.min(2.5, Math.max(0.4, ds / dc)) : 1;
    const book0 = S.book;
    const out = await BG.call('alignWindow', [segs, costs, r0, { k: k - kLo, from: cur - 1.6 - slack, to: cur - 0.1 + slack }]);
    if (S.book !== book0) return null;
    if (!out || out.score > (o.maxScore || 1.2)) return null;
    const extras = [], diffs = [];
    let mine = null;
    for (let i = 1; i < costs.length - 1; i++) {
      const st = out.starts[i];
      if (st < lo + 3 || out.starts[i + 1] > hi - 3) continue;
      const sid = p.ids[kLo + i], t = st + P.nudge, diff = t - p.starts[kLo + i];
      if (Math.abs(diff) > MAX_RESYNC) return null;
      diffs.push(diff);
      if (sid === id) mine = t; else extras.push({ id: sid, t });
    }
    if (mine == null) return null;
    diffs.sort((x, y) => x - y);
    const drift = diffs.length % 2 ? diffs[(diffs.length - 1) / 2] : (diffs[diffs.length / 2 - 1] + diffs[diffs.length / 2]) / 2;
    return { t: mine, extras, n: extras.length + 1, drift, count: diffs.length };
  }

  /* ---------- drift auto-correct ----------
     While playing, a sentence time that was only estimated (or set from a few points) slowly slides away
     from the narrator. Every minute or so, a small slice of audio around the playing sentence is read, its
     sentences are lined up with the narrator's real pauses, and the result is compared with what the
     plan expected. If they differ by more than DRIFT_MIN seconds twice in a row (two different slices
     agreeing), the nearby sentences are quietly re-timed. Stretches already confirmed by the audio or by
     the reader are never touched, and the toast offers Undo. */
  const DRIFT_MIN = 1.0;
  const drift = { sec: -1, pos: 0, last: 0, hold: 0, busy: false, pend: null, off: new Set(), fail: new Set() };
  function driftReset() { drift.sec = -1; drift.pos = 0; drift.last = 0; drift.hold = 0; drift.busy = false; drift.pend = null; drift.off = new Set(); drift.fail = new Set(); }
  function driftHold() { drift.hold = Date.now() + 8000; } // let a seek or a new track settle first
  function driftTick() {
    if (drift.busy || P.driftFix === false || !S.book || !S.model || audio.paused || audio.seeking || S.loadingAudio) return;
    if (S.refining || S.aligning || S.calibrate || job.running) return;
    const sec = S.sec, p = S.plan[sec], now = Date.now();
    if (!p || p.ids.length < 8 || drift.off.has(sec) || drift.fail.has(sec) || S.bgTrack === sec) return;
    if (!bgAllowed() || navigator.onLine === false || now < drift.hold || now - drift.last < 20000) return;
    const cur = audio.currentTime;
    if (drift.sec === sec && Math.abs(cur - drift.pos) < (drift.pend ? 20 : 55)) return;
    if (S.curId < 0 || S.sentSec[S.curId] !== sec) return;
    const info = syncInfo(sec, S.curId);
    if (!info || info.sure) return; // already confirmed by the audio or by the reader: nothing to correct
    driftCheck(sec, S.curId, cur);
  }
  async function driftCheck(sec, id, cur) {
    const p0 = S.plan[sec], before = sig(p0);
    drift.busy = true; drift.sec = sec; drift.pos = cur; drift.last = Date.now();
    let res = null;
    try { res = await refineWindow(sec, id, cur, { back: 35, fwd: 35, slack: 8, maxScore: 0.9 }); }
    catch (e) {
      if (e && e.message !== 'stale' && e.message !== 'window') drift.fail.add(sec); // cannot read this audio here: stop trying for this track
    } finally { drift.busy = false; }
    if (!res || S.sec !== sec || sig(S.plan[sec]) !== before) return;
    if (res.count < 4 || Math.abs(res.drift) < DRIFT_MIN) { drift.pend = null; return; }
    const pend = drift.pend;
    if (!(pend && pend.sec === sec && pend.sig === before && Math.abs(pend.d - res.drift) < 0.7 && Math.abs(cur - pend.pos) < 180)) {
      drift.pend = { sec, sig: before, d: res.drift, pos: cur }; // first opinion: wait for a second slice to agree
      return;
    }
    drift.pend = null;
    const info = S.curId >= 0 ? syncInfo(sec, S.curId) : null;
    if (audio.paused || S.refining || S.aligning || S.calibrate || job.running || (info && info.sure) || S.sentSec[id] !== sec) return;
    setAnchor(id, { at: res.t, extras: res.extras, fromAudio: true, quiet: true });
    const d = res.drift;
    toast('Highlight moved ' + Math.abs(d).toFixed(1) + ' s ' + (d > 0 ? 'later' : 'earlier') + ' to match the narrator.', 6000, ['Undo', () => { undoAnchor(); drift.off.add(sec); }]);
  }
  async function resyncSentence(id) {
    const sec = S.sec, p = S.plan[sec];
    if (!p || S.sentSec[id] !== sec) return;
    if (audio.paused) { toast('Play the audio, then double-tap the sentence you hear.'); return; }
    if (S.refining) return;
    const cur = audio.currentTime, before = sig(p), k = S.sentPos[id];
    const r = resyncTime(p.starts, k, cur + P.nudge, isFinite(audio.duration) ? audio.duration : (S.durs[sec] || 1e9));
    if (Math.abs(r.off) > MAX_RESYNC) { toast('That sentence is far from where the audio is. Use Sync to set it.', 4500); return; }
    const estimate = why => setAnchor(id, { at: r.t, undo: true, msg: (r.confirm ? 'Confirmed. The highlight is right here.' : 'Resynced. The highlight now follows this sentence.') + (why ? ' ' + why : '') });
    S.refining = true;
    toast('Listening to the audio around here…', 20000);
    let res = null, why = '';
    try { res = await refineWindow(sec, id, cur); if (!res) why = 'The audio did not match the text well enough to be exact.'; }
    catch (e) { why = e && e.message === 'stale' ? '' : 'The audio could not be read here, so this is an estimate.'; }
    finally { S.refining = false; }
    if (S.sec !== sec || sig(S.plan[sec]) !== before) { toast('Resync cancelled because the track changed.'); return; }
    if (res) setAnchor(id, { at: res.t, extras: res.extras, undo: true, msg: 'Resynced to the audio. ' + res.n + ' sentence' + (res.n === 1 ? '' : 's') + ' re-timed.' });
    else estimate(why);
  }
  /* Runs by itself when a track is opened: downloads only the first ~2.5 MB, finds where the
     book text starts after the LibriVox notice, and pins the first sentences there. */
  async function autoStart(i, pre) {
    const book0 = S.book;
    const p = S.plan[i], sec = S.secs[i];
    const ids = p.ids;
    let K = 0, acc = 0;
    while (K < ids.length && (acc < 60 || K < 6) && K < 40) { acc += S.model.sents[ids[K]].cost; K++; }
    const costs = ids.slice(0, K).map(id => S.model.sents[id].cost);
    let all, got = 0;
    const lb = pre ? null : await dlBlob(sec.url);
    if (pre) { all = pre; got = pre.length; } // first bytes of the single shared download
    else if (lb) { all = new Uint8Array(await lb.slice(0, 2.6e6).arrayBuffer()); got = all.length; } // saved on this device
    else {
      const res = await fetch(sec.url, { mode: 'cors' });
      if (!res.ok || !res.body) throw new Error('blocked');
      const reader = res.body.getReader();
      const chunks = [];
      while (got < 2.6e6) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value); got += value.length;
      }
      try { reader.cancel(); } catch (e) { /* already closed */ }
      all = new Uint8Array(got);
      let o = 0; for (const c of chunks) { all.set(c, o); o += c.length; }
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    let decoded = null;
    for (const trim of [0, 4096, 16384]) {
      for (const rate of [8000, 16000, 0]) {
        let ctx = null;
        try { ctx = rate ? new AC({ sampleRate: rate }) : new AC(); decoded = await ctx.decodeAudioData(all.buffer.slice(0, got - trim)); }
        catch (e) { decoded = null; }
        try { if (ctx) ctx.close(); } catch (e) { /* ignore */ }
        if (decoded) break;
      }
      if (decoded) break;
    }
    if (!decoded) throw new Error('decode');
    const hop = 0.02;
    const segs = await BG.seg(decoded.getChannelData(0), decoded.sampleRate, hop);
    if (S.book === book0) mergeSegs(i, segs, 0, decoded.duration - 2, 0);
    const dur = S.durs[i] || 0;
    const rate0 = dur > 60 && p.cHi > 0 ? Math.min(2, Math.max(0.5, (dur - 20) / p.cHi)) : 1;
    const out = await BG.call('alignStart', [segs, costs, Core.introCost(book0.title, book0.authors, sec.title), rate0]);
    if (!out || out.score > 1.2) throw new Error('nofit');
    return ids.slice(0, K).map((id, k) => ({ id, t: +out.starts[k].toFixed(2) }));
  }
