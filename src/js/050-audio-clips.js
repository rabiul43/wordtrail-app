  /* ---------- audio clips ----------
     A clip is a saved stretch of one track (track, start, end, a name). It plays from the list and stops by itself at the end,
     and it can be exported as a small .wav file. Clips are kept per book ('wt:clips:<book>') and are in the backup.
     Making or changing a clip opens a full-screen trim editor: a waveform timeline with a handle at each end of the clip. */
  const CL = { play: null, iv: 0, tok: 0, tick: null, ed: null, tl: null, pk: {} };
  const clKey = () => 'wt:clips:' + (S.book ? S.book.id : '');
  const clAll = () => (S.book ? store.get(clKey(), []) : []) || [];
  const clSave = list => { store.set(clKey(), list); clPaintCount(); };
  const clShort = t => hms(t).replace(/^00:/, '');
  const clDur = t => t < 60 ? Math.round(t) + ' s' : Math.floor(t / 60) + ' min ' + String(Math.round(t % 60)).padStart(2, '0') + ' s';
  const clLenT = t => t < 60 ? t.toFixed(1) + ' s' : Math.floor(t / 60) + ' min ' + String(Math.round(t % 60)).padStart(2, '0') + ' s';
  const clT = t => { const q = Math.round(t * 10); return clShort(Math.floor(q / 10)) + '.' + (q % 10); };
  const clR1 = x => Math.round(x * 10) / 10;
  const clName = (sec, a) => 'Clip \u00b7 Track ' + (sec + 1) + ' \u00b7 ' + clShort(a);
  function clPaintCount() { const d = $('#b-clips-d'), n = clAll().length; if (d) d.textContent = n ? n + (n === 1 ? ' clip saved' : ' clips saved') + ' for this book' : 'Save short moments, replay them, export as a file'; }
  function clAdd(sec, a, b, name) {
    a = Math.max(0, clR1(a)); b = clR1(b);
    if (!(b - a >= 1)) { toast('A clip needs to be at least 1 second long.'); return null; }
    if (b - a > 120) { toast('Clips can be up to 2 minutes long.'); return null; }
    const list = clAll(), c = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5), sec, a, b, name: name || clName(sec, a), ts: Date.now() };
    list.unshift(c); clSave(list); buzz('success');
    return c;
  }
  /* ---- playing a stretch: stops by itself at the end ---- */
  function clSync() {
    const b = $('#ced-play'); if (!b) return;
    const on = CL.play === 'ed';
    b.innerHTML = on ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h4v14H7zM13 5h4v14h-4z"/></svg>' : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>';
    b.setAttribute('aria-label', on ? 'Pause' : 'Play');
    if (!on && CL.tl) CL.tl.mark(CL.ed && CL.ed.pro ? CL.ed.p : null);
  }
  function clStop() { clearInterval(CL.iv); CL.iv = 0; CL.play = null; CL.tick = null; CL.tok++; clSync(); }
  function clRun(key, sec, a, b, tickFn) {
    clStop(); CL.play = key; CL.tick = tickFn || null;
    const tok = CL.tok;
    const go = () => {
      if (tok !== CL.tok) return;   // stopped (or replaced) during the short wait
      CL.iv = setInterval(() => {   // stop right at the end; give up if the listener moved to another track
        if (S.sec !== sec) { clStop(); clRender(); return; }
        if (CL.tick) CL.tick(nowT());
        if (audio.paused) { if (nowT() >= b - 0.1) { clStop(); clRender(); } return; }
        if (audio.currentTime >= b) { audio.pause(); clStop(); clRender(); }
      }, 60);
    };
    if (sec === S.sec) { seekAudio(a); audio.play().catch(onPlayFail); }
    else goTrack(sec, a, true);
    setTimeout(go, 400);   // let the seek or the new track settle first
    clSync(); clRender();
  }
  const clPlay = c => clRun(c.id, c.sec, c.a, c.b);
  /* ---- the list ---- */
  function clRender() {
    const box = $('#cl-list'); if (!box) return;
    const list = clAll(); box.textContent = ''; $('#cl-empty').hidden = list.length > 0;
    list.forEach(c => {
      const playing = CL.play === c.id;
      const play = h('button', { class: 'btn small ghost', type: 'button', onclick: () => { if (playing) { audio.pause(); clStop(); clRender(); } else clPlay(c); } }, playing ? 'Stop' : 'Play');
      const ed = h('button', { class: 'btn small ghost', type: 'button', onclick: () => clEdOpen(c, 'list') }, 'Edit');
      const exp = h('button', { class: 'btn small ghost', type: 'button', onclick: ev => clExport(c, ev.currentTarget) }, 'Save as file');
      const del = h('button', { class: 'btn small ghost', type: 'button', onclick: () => { if (CL.play === c.id) clStop(); clSave(clAll().filter(z => z.id !== c.id)); clRender(); } }, 'Remove');
      const more = h('div', { class: 'hl-act cl-more', hidden: true }, exp, del);
      const dots = h('button', { class: 'btn small ghost', type: 'button', 'aria-label': 'More actions', 'aria-expanded': 'false', onclick: ev => { more.hidden = !more.hidden; ev.currentTarget.setAttribute('aria-expanded', String(!more.hidden)); } }, '\u22EF');
      box.append(h('div', { class: 'hl-item cl-item', 'data-on': String(playing) },
        h('div', { class: 'cl-name' }, c.name),
        h('div', { class: 'cl-meta' }, 'Track ' + (c.sec + 1) + ' \u00b7 ' + clShort(c.a) + ' \u2013 ' + clShort(c.b) + ' \u00b7 ' + clDur(c.b - c.a)),
        h('div', { class: 'hl-act' }, play, ed, dots), more));
    });
  }
  function clOpen() { if (!S.book) { toast('Open a book first.'); return; } clRender(); openSheet('sheet-clips'); }
  /* ---- waveform: loudness per quarter second, read from a small piece of the track's file (never the whole file) ---- */
  const clPkKey = sec => (S.book ? S.book.id : '') + ':' + sec;
  function clPeaksOf(sec) {
    const total = S.durs[sec] || 0; if (!(total > 0)) return null;
    const k = clPkKey(sec), N = Math.ceil(total / 0.25) + 1;
    return CL.pk[k] || (CL.pk[k] = { res: 0.25, N, v: new Float32Array(N), have: new Uint8Array(N), max: 0.05, busy: false, off: false });
  }
  async function clEnsurePeaks(sec, w0, w1) {
    const pk = clPeaksOf(sec); if (!pk || pk.off || pk.busy) return;
    const i0 = Math.floor(Math.max(0, w0) / pk.res), i1 = Math.min(pk.N - 1, Math.ceil(w1 / pk.res));
    let m0 = -1, m1 = -1;
    for (let i = i0; i <= i1; i++) if (!pk.have[i]) { if (m0 < 0) m0 = i; m1 = i; }
    if (m0 < 0) return;
    const total = S.durs[sec] || 0, a = Math.max(0, m0 * pk.res - 1), b = Math.min(total, m1 * pk.res + 1, a + 150);
    pk.busy = true;
    try {
      const { data, t0 } = await clBytes({ sec, a, b }, true);
      const Ctx = window.AudioContext || window.webkitAudioContext, ctx = new Ctx();
      const buf = await new Promise((ok, no) => { const q = ctx.decodeAudioData(data, ok, no); if (q && q.catch) q.catch(no); });
      try { ctx.close(); } catch (e) { /* ignore */ }
      const sr = buf.sampleRate, ch = buf.getChannelData(0);
      for (let i = Math.max(0, Math.ceil(a / pk.res)); i <= Math.min(pk.N - 1, Math.floor(b / pk.res)); i++) {
        const s0 = Math.floor((i * pk.res - t0) * sr), s1 = Math.min(ch.length, Math.floor(((i + 1) * pk.res - t0) * sr));
        if (s0 < 0 || s0 >= ch.length || s1 <= s0) continue;
        let m = 0; for (let k = s0; k < s1; k++) { const x = ch[k] < 0 ? -ch[k] : ch[k]; if (x > m) m = x; }
        pk.v[i] = m; pk.have[i] = 1; if (m > pk.max) pk.max = m;
      }
      if (!pk.have[m0]) pk.off = true;   // nothing came of it: stop trying for this track
    } catch (e) { pk.off = true; }   // the file does not allow partial downloads, or could not be decoded: no waveform
    pk.busy = false;
    if (CL.ed && CL.tl) { CL.tl.paint(); if (!pk.off && CL.ed.sec === sec) clEnsurePeaks(sec, CL.ed.w0, CL.ed.w1); }
  }
  function clPeak(pk, t0, t1) {
    const i0 = Math.max(0, Math.floor(t0 / pk.res)), i1 = Math.min(pk.N - 1, Math.max(i0, Math.floor(t1 / pk.res)));
    let m = -1; for (let i = i0; i <= i1; i++) if (pk.have[i] && pk.v[i] > m) m = pk.v[i];
    return m < 0 ? null : m;
  }
  function clDrawWave(cv, g) {
    const w = cv.clientWidth, hh = cv.clientHeight; if (!w || !hh) return;
    const dpr = window.devicePixelRatio || 1, W = Math.round(w * dpr), H = Math.round(hh * dpr);
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
    const x = cv.getContext('2d'); x.setTransform(dpr, 0, 0, dpr, 0, 0); x.clearRect(0, 0, w, hh); x.fillStyle = getComputedStyle(cv).color;
    const pk = CL.pk[clPkKey(g.sec)], step = 4, n = Math.floor(w / step), span = g.w1 - g.w0;
    for (let i = 0; i < n; i++) {
      const v = pk ? clPeak(pk, g.w0 + i / n * span, g.w0 + (i + 1) / n * span) : null;
      const bh = v == null ? 4 : Math.max(4, Math.min(1, v / pk.max) * hh * 0.86);
      x.globalAlpha = v == null ? 0.22 : 0.7; x.fillRect(i * step, (hh - bh) / 2, 3, bh);
    }
    x.globalAlpha = 1;
  }
  /* ---- the trim timeline: o.get() gives { sec, w0, w1, a, b } (the visible window and the two ends of the clip, in seconds);
     o.set(which, seconds) moves an end, o.pan(newW0) moves the window, o.down() runs when a touch starts, o.commit(kind) when it ends ---- */
  function clTrim(o) {
    const cv = h('canvas', { class: 'tl-wave' }), dimL = h('div', { class: 'tl-dim' }), dimR = h('div', { class: 'tl-dim r' }), sel = h('div', { class: 'tl-sel' }), head = h('div', { class: 'tl-head' });
    const mk = (w, label) => h('div', { class: 'tl-h ' + w, 'data-w': w, role: 'slider', tabindex: '0', 'aria-label': label }, h('i'));
    const ha = mk('a', 'Clip start'), hb = mk('b', 'Clip end');
    const box = h('div', { class: 'tl' }, cv, dimL, dimR, sel, head, ha, hb);
    const marks = [0, 1, 2, 3, 4].map(() => h('span')), ruler = h('div', { class: 'tl-ruler', 'aria-hidden': 'true' }, marks);
    const ovClip = h('div', { class: 'ov-clip' }), ovWin = h('div', { class: 'ov-win' }), ovHead = h('div', { class: 'ov-head' });
    const ov = h('div', { class: 'tl-ov', 'aria-hidden': 'true' }, ovClip, ovWin, ovHead);
    const ovT = h('div', { class: 'ov-t', 'aria-hidden': 'true' }, h('span', {}, '0:00'), h('span', {}, 'Whole track'), h('span'));
    const el0 = h('div', { class: 'tl-wrap' }, ov, ovT, box, ruler);
    const pct = t => { const g = o.get(); return (t - g.w0) / Math.max(1, g.w1 - g.w0) * 100; };
    const cl = v => Math.max(0, Math.min(100, v));
    const paint = () => {
      const g = o.get(); if (!g) return;
      const pa = pct(g.a), pb = pct(g.b);
      ha.style.left = pa + '%'; hb.style.left = pb + '%';
      ha.style.visibility = hb.style.visibility = 'visible';
      if (g.a < g.w0 - 2 || g.a > g.w1 + 2) ha.style.visibility = 'hidden';
      if (g.b < g.w0 - 2 || g.b > g.w1 + 2) hb.style.visibility = 'hidden';
      sel.style.left = cl(pa) + '%'; sel.style.width = Math.max(0, cl(pb) - cl(pa)) + '%';
      dimL.style.width = cl(pa) + '%'; dimR.style.width = (100 - cl(pb)) + '%';
      [[ha, g.a], [hb, g.b]].forEach(([e, v]) => { e.setAttribute('aria-valuemin', String(g.w0)); e.setAttribute('aria-valuemax', String(g.w1)); e.setAttribute('aria-valuenow', String(v)); e.setAttribute('aria-valuetext', clT(v)); });
      marks.forEach((m, i) => { m.textContent = clShort(Math.round(g.w0 + (g.w1 - g.w0) * i / 4)); });
      clDrawWave(cv, g);
      const T = g.total || 0;
      ov.style.visibility = ovT.style.visibility = T > 0 ? 'visible' : 'hidden';
      if (T > 0) {
        const f = t => Math.max(0, Math.min(100, t / T * 100));
        ovClip.style.left = f(g.a) + '%'; ovClip.style.width = Math.max(0, f(g.b) - f(g.a)) + '%';
        ovWin.style.left = f(g.w0) + '%'; ovWin.style.width = Math.max(0, f(g.w1) - f(g.w0)) + '%';
        ovT.lastChild.textContent = clShort(Math.round(T));
      }
      mark(g.pro ? g.p : null);
    };
    const mark = t => {
      const g = o.get();
      if (t == null || !g) { head.style.display = 'none'; ovHead.style.display = 'none'; return; }
      const p = pct(t);
      head.style.display = p < -1 || p > 101 ? 'none' : 'block'; head.style.left = cl(p) + '%';
      if (g.total > 0) { ovHead.style.display = 'block'; ovHead.style.left = Math.max(0, Math.min(100, t / g.total * 100)) + '%'; }
    };
    let ovDrag = false;
    const ovAt = ev => { const r = ov.getBoundingClientRect(), g = o.get(); return Math.max(0, Math.min(1, (ev.clientX - r.left) / Math.max(1, r.width))) * (g.total || 0); };
    ov.addEventListener('pointerdown', ev => { const g = o.get(); if (!g || !(g.total > 0)) return; ev.preventDefault(); o.down(); ovDrag = true; try { ov.setPointerCapture(ev.pointerId); } catch (x) { /* ignore */ } o.pan(ovAt(ev) - (g.w1 - g.w0) / 2); });
    ov.addEventListener('pointermove', ev => { if (!ovDrag) return; const g = o.get(); o.pan(ovAt(ev) - (g.w1 - g.w0) / 2); });
    const ovEnd = () => { if (!ovDrag) return; ovDrag = false; o.commit('pan'); };
    ov.addEventListener('pointerup', ovEnd); ov.addEventListener('pointercancel', ovEnd);
    const at = ev => { const r = box.getBoundingClientRect(), g = o.get(); return g.w0 + Math.max(0, Math.min(1, (ev.clientX - r.left) / Math.max(1, r.width))) * (g.w1 - g.w0); };
    let drag = null, pan = null;
    [ha, hb].forEach(e => {
      const w = e.dataset.w;
      e.addEventListener('pointerdown', ev => { ev.preventDefault(); ev.stopPropagation(); o.down(); drag = { w, off: at(ev) - o.get()[w] }; try { e.setPointerCapture(ev.pointerId); } catch (x) { /* ignore */ } e.classList.add('on'); buzz('tick'); });
      e.addEventListener('pointermove', ev => { if (drag && drag.w === w) o.set(w, at(ev) - drag.off); });
      const end = () => { if (!drag || drag.w !== w) return; drag = null; e.classList.remove('on'); o.commit('trim'); };
      e.addEventListener('pointerup', end); e.addEventListener('pointercancel', end);
      e.addEventListener('keydown', ev => {
        const k = ev.key, d = (k === 'ArrowLeft' || k === 'ArrowDown') ? -1 : (k === 'ArrowRight' || k === 'ArrowUp') ? 1 : 0; if (!d) return;
        ev.preventDefault(); o.down(); o.set(w, o.get()[w] + d * (ev.shiftKey ? 1 : 0.1));
      });
    });
    box.addEventListener('pointerdown', ev => {   // dragging the waveform moves the window along the track
      if (ev.target.closest('.tl-h')) return;
      pan = { x: ev.clientX, w0: o.get().w0, moved: false }; try { box.setPointerCapture(ev.pointerId); } catch (x) { /* ignore */ }
    });
    box.addEventListener('pointermove', ev => {
      if (!pan) return; const g = o.get(), r = box.getBoundingClientRect();
      if (!pan.moved) { if (Math.abs(ev.clientX - pan.x) < 5) return; pan.moved = true; o.down(); }
      o.pan(pan.w0 - (ev.clientX - pan.x) / Math.max(1, r.width) * (g.w1 - g.w0));
    });
    const endPan = ev => {
      if (!pan) return; const was = pan; pan = null;
      if (!was.moved) { if (ev && ev.type === 'pointerup' && o.tap) o.tap(at(ev)); return; }
      o.commit('pan');
    };
    box.addEventListener('pointerup', endPan); box.addEventListener('pointercancel', endPan);
    return { el: el0, paint, mark };
  }
  /* ---- the editor screen ---- */
  function clEdPaint() {
    const d = CL.ed; if (!d) return;
    if (CL.tl) CL.tl.paint();
    $('#ced-len').textContent = clLenT(d.b - d.a); $('#ced-range').textContent = clT(d.a) + ' \u2013 ' + clT(d.b);
  }
  function clEdSet(w, v) {
    const d = CL.ed; if (!d) return;
    if (w === 'a') { d.a = clR1(Math.min(Math.max(v, d.w0, d.b - 120), d.b - 1)); d.p = d.a; } else { d.b = clR1(Math.max(Math.min(v, d.w1, d.a + 120), d.a + 1)); d.p = Math.max(d.a, d.b - 2); }
    clEdPaint();
  }
  function clEdPan(w0) {
    const d = CL.ed; if (!d) return;
    const total = S.durs[d.sec] || 0, span = d.w1 - d.w0;
    w0 = Math.max(0, total > 0 ? Math.min(w0, total - span) : w0); d.w0 = w0; d.w1 = w0 + span; clEdPaint();
  }
  function clEdOpen(c, from) {   // c: a saved clip to change, or null for a new one (the last 20 seconds to start with)
    if (!S.book) { toast('Open a book first.'); return; }
    if (!audio.paused) audio.pause();
    clStop();
    const sec = c ? c.sec : S.sec, total = S.durs[sec] || 0;
    let a, b, w0, w1;
    if (c) { a = c.a; b = c.b; w0 = Math.max(0, a - 30); w1 = total > 0 ? Math.min(total, b + 30) : b + 30; }
    else {
      b = clR1(Math.max(1, total > 0 ? Math.min(total, nowT()) : nowT())); a = clR1(Math.max(0, b - 20));
      w1 = total > 0 ? Math.min(total, b + 15) : b + 15; w0 = Math.max(0, w1 - 90);
    }
    if (w1 - w0 < 30) w1 = w0 + 30;
    const nm = c ? c.name : clName(sec, a);
    const pro = P.clPro === true;
    CL.ed = { c, sec, a, b, w0, w1, from, total, pro, p: a, auto: c ? (c.name === clName(c.sec, c.a) ? c.name : null) : nm };
    $('#ced-name').value = nm;
    { const sh = $('#sheet-clipedit'); if (pro) sh.setAttribute('data-pro', ''); else sh.removeAttribute('data-pro');
      const ht = $('#ced-hint'); if (ht) ht.textContent = pro ? 'Drag the ends to trim. Drag the timeline to slide along the track. Tap it to place the playhead.' : 'Drag the handles to trim. Drag the waveform to move along the track.'; }
    openSheet('sheet-clipedit');
    clSync(); clEdPaint(); clEnsurePeaks(sec, w0, w1);
  }
  function clEdCleanup() { if (!CL.ed) return; if (CL.play) audio.pause(); clStop(); CL.ed = null; }
  function clEdBack() { if (CL.ed && CL.ed.from === 'list') clOpen(); else closeSheets(); }
  function clEdPlay() {
    const d = CL.ed; if (!d) return;
    if (CL.play === 'ed') { audio.pause(); clStop(); return; }
    const from = d.pro && d.p >= d.a && d.p < d.b - 0.3 ? d.p : d.a;   // play from the playhead when it is inside the clip
    clRun('ed', d.sec, from, d.b, t => {
      if (!CL.ed) return; CL.ed.p = t;
      if (CL.ed.pro && (t > CL.ed.w1 || t < CL.ed.w0)) { const span = CL.ed.w1 - CL.ed.w0; clEdPan(t - span * 0.15); if (CL.tl) CL.tl.paint(); }
      else if (CL.tl) CL.tl.mark(t);
    });
  }
  function clEdTap(t) {   // tap on the timeline: put the playhead there (and carry on playing from there)
    const d = CL.ed; if (!d || !d.pro) return;
    const was = CL.play === 'ed';
    d.p = clR1(Math.max(0, d.total > 0 ? Math.min(t, d.total) : t));
    if (was) { audio.pause(); clStop(); }
    if (CL.tl) CL.tl.mark(d.p);
    if (was) clEdPlay(); else if (!audio.paused) audio.pause();
  }
  function clEdPlace(a, b) {   // set both ends (kept between 1 s and 2 min, inside the track) and keep them in view
    const d = CL.ed; if (!d) return;
    const T = d.total > 0 ? d.total : Infinity;
    a = Math.max(0, a); b = Math.min(T, b);
    if (b - a > 120) { if (d.a !== a) b = a + 120; else a = b - 120; }
    if (b - a < 1) { if (b + 1 <= T) b = a + 1; else a = Math.max(0, b - 1); }
    d.a = clR1(a); d.b = clR1(b);
    const span = d.w1 - d.w0;
    if (d.b > d.w1 || d.a < d.w0) { clEdPan(d.a - span * 0.1); }
    clEdPaint(); clEnsurePeaks(d.sec, d.w0, d.w1);
  }
  function clEdMarkStart() { const d = CL.ed; if (!d) return; if (CL.play === 'ed') { audio.pause(); clStop(); } const p = d.p; clEdPlace(p, p > d.b - 1 ? p + 20 : d.b); }
  function clEdMarkEnd() { const d = CL.ed; if (!d) return; if (CL.play === 'ed') { audio.pause(); clStop(); } const p = d.p; clEdPlace(p < d.a + 1 ? p - 20 : d.a, p); }
  function clEdZoom(f) {
    const d = CL.ed; if (!d) return;
    const top = Math.min(300, d.total > 0 ? d.total : 300), span0 = d.w1 - d.w0, span = Math.max(Math.min(top, 10), Math.min(top, span0 * f));
    const mid = d.p >= d.w0 && d.p <= d.w1 ? d.p : (d.w0 + d.w1) / 2;
    const keep = (mid - d.w0) / Math.max(1, span0);
    d.w0 = Math.max(0, d.total > 0 ? Math.min(mid - keep * span, d.total - span) : mid - keep * span); d.w1 = d.w0 + span;
    clEdPaint(); clEnsurePeaks(d.sec, d.w0, d.w1);
  }
  function clEdSave() {
    const d = CL.ed; if (!d) return;
    let nm = $('#ced-name').value.trim(); if (!nm || nm === d.auto) nm = clName(d.sec, d.a);
    if (d.c) {
      const list = clAll(), x = list.find(z => z.id === d.c.id);
      if (!x) { closeSheets(); return; }
      x.a = d.a; x.b = d.b; x.name = nm; clSave(list); buzz('success'); toast('Clip saved', 1800);
      if (d.from === 'list') clOpen(); else closeSheets();
      return;
    }
    const c = clAdd(d.sec, d.a, d.b, nm); if (!c) return;
    const from = d.from;
    if (from === 'list') clOpen(); else closeSheets();
    toast('Clip saved \u00b7 ' + clDur(c.b - c.a), 4000, ['See clips', () => { closeSheets(); clOpen(); }]);
  }
  const wavOf = (buf, a, b) => {   // 16-bit mono .wav of buf between a and b seconds
    const sr = buf.sampleRate, i0 = Math.max(0, Math.floor(a * sr)), i1 = Math.min(buf.length, Math.ceil(b * sr)), n = Math.max(0, i1 - i0);
    const chs = []; for (let k = 0; k < buf.numberOfChannels; k++) chs.push(buf.getChannelData(k));
    const out = new DataView(new ArrayBuffer(44 + n * 2)), w = (o, t) => { for (let k = 0; k < t.length; k++) out.setUint8(o + k, t.charCodeAt(k)); };
    w(0, 'RIFF'); out.setUint32(4, 36 + n * 2, true); w(8, 'WAVEfmt '); out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, 1, true);
    out.setUint32(24, sr, true); out.setUint32(28, sr * 2, true); out.setUint16(32, 2, true); out.setUint16(34, 16, true); w(36, 'data'); out.setUint32(40, n * 2, true);
    for (let i = 0; i < n; i++) { let v = 0; for (let k = 0; k < chs.length; k++) v += chs[k][i0 + i]; v /= chs.length; v = Math.max(-1, Math.min(1, v)); out.setInt16(44 + i * 2, v < 0 ? v * 0x8000 : v * 0x7FFF, true); }
    return new Blob([out], { type: 'audio/wav' });
  };
  /* Cut a clip out of the track's mp3 by byte position (LibriVox files are constant bitrate, so time maps to bytes closely),
     decode only that piece, trim to the exact seconds. If the track is saved on the device it is read from there. */
  async function clBytes(c, noFull) {
    const sec = S.secs[c.sec], total = S.durs[c.sec] || 0;
    if (!(total > 0)) throw new Error('length');
    let blob = null;
    if (isLocal(S.book.id, c.sec, sec.url)) { const u = await warmUrl(S.book.id, c.sec); if (u) blob = await (await fetch(u)).blob(); }
    const piece = async (bytes0, bytes1, size) => blob ? blob.slice(bytes0, bytes1 + 1).arrayBuffer() : null;
    let head, size;
    if (blob) { size = blob.size; head = new Uint8Array(await blob.slice(0, 65536).arrayBuffer()); }
    else {
      const r = await fetch(sec.url, { headers: { Range: 'bytes=0-65535' } });
      if (!r.ok) throw new Error('fetch');
      const m = /\/(\d+)\s*$/.exec(r.headers.get('content-range') || '');
      if (r.status === 206 && m) { size = +m[1]; head = new Uint8Array(await r.arrayBuffer()); }
      else { if (noFull) { try { if (r.body) r.body.cancel(); } catch (x) { /* ignore */ } throw new Error('range'); }
        toast('Fetching the whole track to cut the clip…', 4000); blob = await r.blob(); size = blob.size; head = new Uint8Array(await blob.slice(0, 65536).arrayBuffer()); }
    }
    const first = Core.findMp3Sync(head, Core.id3End(head)); if (first < 0) throw new Error('format');
    const bps = (size - first) / total;
    const pad = 2, b0 = Math.max(first, first + Math.floor((c.a - pad) * bps)), b1 = Math.min(size - 1, first + Math.ceil((c.b + pad) * bps));
    let ab;
    if (blob) ab = await blob.slice(b0, b1 + 1).arrayBuffer();
    else { const r = await fetch(sec.url, { headers: { Range: 'bytes=' + b0 + '-' + b1 } }); if (!r.ok) throw new Error('fetch'); ab = await r.arrayBuffer(); }
    const u8 = new Uint8Array(ab), at = Core.findMp3Sync(u8, 0); if (at < 0) throw new Error('format');
    return { data: ab.slice(at), t0: (b0 + at - first) / bps };
  }
  async function clExport(c, btn) {
    const old = btn.textContent; btn.disabled = true; btn.textContent = 'Preparing…';
    try {
      const { data, t0 } = await clBytes(c);
      const Ctx = window.AudioContext || window.webkitAudioContext, ctx = new Ctx();
      const buf = await new Promise((ok, no) => { const p = ctx.decodeAudioData(data, ok, no); if (p && p.catch) p.catch(no); });
      try { ctx.close(); } catch (e) { /* ignore */ }
      const wav = wavOf(buf, c.a - t0, c.b - t0);
      const nm = ((S.book.title || 'clip') + ' - ' + c.name).replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 90);
      download(nm + '.wav', wav, 'audio/wav');
      toast('Clip saved as a file.', 2200);
    } catch (e) { toast('This clip could not be cut out. Saving the track on this device first can help.', 4500); }
    btn.disabled = false; btn.textContent = old;
  }
  function clWire() {
    $('#b-clips').addEventListener('click', () => { closeSheets(); clOpen(); });
    $('#cl-new').addEventListener('click', () => clEdOpen(null, 'list'));
    $('#qk-clip').addEventListener('click', () => { closeSheets(); clEdOpen(null, 'player'); });
    CL.tl = clTrim({ get: () => CL.ed, set: clEdSet, pan: clEdPan, tap: clEdTap, down: () => { if (CL.play === 'ed') { audio.pause(); clStop(); } }, commit: k => { if (k === 'pan' && CL.ed) clEnsurePeaks(CL.ed.sec, CL.ed.w0, CL.ed.w1); } });
    $('#ced-tl').append(CL.tl.el);
    $('#ced-x').addEventListener('click', clEdBack);
    $('#ced-save').addEventListener('click', clEdSave);
    $('#ced-play').addEventListener('click', clEdPlay);
    $('#ced-zi').addEventListener('click', () => clEdZoom(0.5));
    $('#ced-zo').addEventListener('click', () => clEdZoom(2));
    $('#ced-ss').addEventListener('click', clEdMarkStart);
    $('#ced-se').addEventListener('click', clEdMarkEnd);
    clSync(); clPaintCount();
  }

  guideDoc('player', 'Find my place', "More > Find my place lists earlier positions: before a big jump, when you set the sleep timer, and the last time you touched the screen before a long stretch of listening. After a big seek, a Go back button appears for a few seconds. When you come back after a long gap and the audio has stopped, the same button offers the last place you touched the screen.");
