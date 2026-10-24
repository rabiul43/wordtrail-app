  /* ---------- background worker ----------
     The heavy audio maths (finding pauses, lining sentences up with them) can run in a Web Worker so the screen
     and the highlight stay smooth while a track is being synced. It is the same Core code and gives the same
     answers. If the setting is off, or a worker cannot start or fails, the work runs here as before. */
  const BG = (() => {
    let w = null, url = null, dead = false, seq = 0, idle = 0;
    const pend = new Map();
    const usable = () => !dead && typeof Worker === 'function' && typeof Blob === 'function' && !!(window.URL && URL.createObjectURL);
    const on = () => P.bgWorker !== false && usable();
    const stop = () => {
      clearTimeout(idle);
      try { if (w) w.terminate(); } catch (e) { /* already gone */ }
      w = null;
      if (url) { try { URL.revokeObjectURL(url); } catch (e) { /* ignore */ } url = null; }
    };
    const fail = () => { dead = true; stop(); pend.forEach(q => q.rej(new Error('worker'))); pend.clear(); };
    function start() {
      if (w) return w;
      const src = "'use strict';const Core=(" + makeCore.toString() + ")();" +
        "onmessage=function(e){var m=e.data;try{postMessage({id:m.id,ok:1,r:Core[m.fn].apply(null,m.args)});}" +
        "catch(x){postMessage({id:m.id,ok:0,e:String(x&&x.message||x)});}};";
      url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
      w = new Worker(url);
      w.onmessage = e => {
        const m = e.data, q = pend.get(m.id);
        if (!q) return;
        pend.delete(m.id);
        if (m.ok) q.res(m.r); else q.rej(new Error(m.e));
        if (!pend.size) { clearTimeout(idle); idle = setTimeout(stop, 60000); } // frees its memory when nothing is queued
      };
      w.onerror = () => fail();
      return w;
    }
    /* Runs Core[fn](...args) in the worker; any trouble falls back to running it here. */
    function call(fn, args, local) {
      const here = local || (() => Core[fn](...args));
      if (!on()) return Promise.resolve().then(here);
      return new Promise((res, rej) => {
        let wk;
        try { wk = start(); } catch (e) { fail(); rej(e); return; }
        clearTimeout(idle);
        const id = ++seq;
        pend.set(id, { res, rej });
        try { wk.postMessage({ id, fn, args }); } catch (e) { pend.delete(id); rej(e); }
      }).catch(() => here());
    }
    /* Same numbers as Core.envelope, but cut into slices with a pause between them, so a long track never
       freezes the screen. This part stays here because sending the raw audio to a worker would copy it. */
    async function envelope(data, sr, hop) {
      const step = Math.max(1, Math.round(sr * hop)), n = Math.floor(data.length / step), env = new Float32Array(n), per = 1500;
      let t0 = performance.now();
      for (let f = 0; f < n; f += per) {
        const e = Math.min(n, f + per);
        env.set(Core.envelope(data.subarray(f * step, e * step), sr, hop), f);
        if (performance.now() - t0 > 12) { await new Promise(r => setTimeout(r, 0)); t0 = performance.now(); }
      }
      return env;
    }
    async function seg(data, sr, hop) {
      const env = await envelope(data, sr, hop);
      return call('speechSegments', [env, hop]);
    }
    return { call, seg, reset() { dead = false; if (!on()) stop(); } };
  })();
  if (!P.enh) P.enh = 'off';
  if (!P.dlg) P.dlg = 'color';

  const el = {
    home: $('#home'), player: $('#player'), q: $('#q'), status: $('#status'), prog: $('#prog'), progT: $('#prog-t'),
    recents: $('#recents'), recentList: $('#recent-list'), results: $('#results'), resultList: $('#result-list'),
    reader: $('#reader'), page: $('#page'), calbar: $('#calbar'), follow: $('#follow'), syncbar: $('#syncbar'), sstate: $('#sstate-t'), fix: $('#b-fix'),
    title: $('#p-title'), sub: $('#p-sub'), seek: $('#seek'), cur: $('#t-cur'), left: $('#t-left'),
    play: $('#b-play'), speed: $('#b-speed'), sleep: $('#b-sleep'), cal: $('#b-cal'),
    backdrop: $('#backdrop'), toast: $('#toast'), audio: $('#au'), dock: $('#dock'), viz: $('#viz')
  };
  const audio = el.audio;

  guideDoc('reading', 'Focus page', "Controls > Focus page gives a calm full-screen page that follows the narrator, with a bookmark.");
  /* ---------- new reader ----------
     Opened from the book icon in the player. The text container and the "Back to narrator" button are moved
     into it while it is open and put back when it closes, so the highlight, scrolling and tapping work as before. */
  const NR = { on: false, seeking: false, segKey: '', segN: 0, fills: [], fillEls: [], max: 10000, pos: 0 };
  const nrEl = { root: $('#nr'), slot: $('#nr-slot'), title: $('#nr-title'), bm: $('#nr-bm'), wave: $('#nr-wave'), segs: $('#nr-segs'), dot: $('#nr-dot'), spd: $('#nr-speed'), next: $('#nr-next'), seek: $('#nr-seek'), cur: $('#nr-cur'), tot: $('#nr-tot'), play: $('#nr-play'), sleep: $('#nr-sleep'), card: $('#nr-card'), dock: $('#nr-dock') };
  const hms = s => { s = Math.max(0, Math.floor(isFinite(s) ? s : 0)); return [Math.floor(s / 3600), Math.floor(s % 3600 / 60), s % 60].map(n => String(n).padStart(2, '0')).join(':'); };
  const nrDur = () => (isFinite(audio.duration) && audio.duration > 0) ? audio.duration : ((S.durs && S.durs[S.sec]) || 0);
  /* The bar under the controls is the whole book: one segment per track (equal widths), the dot is where you are.
     Position is kept as "track number + fraction of that track" (0..N), so the bar never needs track lengths. */
  function nrSegs() {
    const N = S.secs ? S.secs.length : 0, key = (S.book ? S.book.id : '') + ':' + N;
    if (key === NR.segKey) return;
    NR.segKey = key; NR.segN = N; NR.fills = new Array(N).fill(''); NR.fillEls = [];
    nrEl.segs.textContent = '';
    const fr = document.createDocumentFragment();
    for (let k = 0; k < N; k++) { const i = document.createElement('i'), b = document.createElement('b'); i.append(b); fr.append(i); NR.fillEls.push(b); }
    nrEl.segs.append(fr); nrEl.segs.classList.toggle('dense', N > 40);
  }
  function nrPaint(pos) {
    const N = NR.segN; if (!N) return;
    nrEl.dot.style.left = (Math.min(N, Math.max(0, pos)) / N * 100) + '%';
    for (let k = 0; k < N; k++) {
      const w = (Math.round(Math.min(1, Math.max(0, pos - k)) * 1000) / 10) + '%';
      if (NR.fills[k] !== w) { NR.fills[k] = w; NR.fillEls[k].style.width = w; }
    }
  }
  /* slider value (0..max) -> which track, how far into it, and that track's length */
  function nrPosOf(v) {
    const N = Math.max(1, S.secs.length), pos = Math.min(N, Math.max(0, v / NR.max * N)), i = Math.min(N - 1, Math.floor(pos));
    const d = i === S.sec ? nrDur() : (+S.durs[i] || 0);
    let t = (pos - i) * d; if (i !== S.sec && t < 2) t = 0;   // a tap at the very start of another track: start it cleanly (skips the spoken intro)
    return { pos, i, t, d };
  }
  const nrSpd = v => { let s = String(+(+v).toFixed(2)); if (s.indexOf('.') < 0) s += '.0'; return s; };
  function nrSpeedUI() {
    nrEl.spd.querySelector('.ub-sp').textContent = nrSpd(P.speed) + '×';
    nrEl.spd.dataset.on = String(P.speed !== 1);
    nrEl.spd.setAttribute('aria-label', 'Playback speed: ' + spdFmt(P.speed) + '. Open playback settings');
  }
  /* Next track is disabled on the last track, in both players. */
  function nextTrkSync() { const n = $('#b-nexttrack'), N = S.secs ? S.secs.length : 0; if (n) n.disabled = !N || S.sec >= N - 1; }
  function nrSeekUI(t, d) {
    nextTrkSync();
    if (!NR.on) return;
    nrSegs();
    const N = NR.segN || 1;
    NR.pos = S.sec + (d ? Math.min(1, Math.max(0, t / d)) : 0);
    if (NR.seeking) return;   // the finger is on the bar: it shows the finger, not the audio
    nrEl.seek.value = Math.round(NR.pos / N * NR.max);
    nrEl.seek.setAttribute('aria-valuetext', 'Track ' + (S.sec + 1) + ' of ' + N + ', ' + hms(t));
    nrPaint(NR.pos);
    nrEl.cur.textContent = hms(t); nrEl.tot.textContent = hms(d);
    nrEl.next.disabled = S.sec >= N - 1;
  }
  function nrPlay(playing) {
    nrEl.play.firstElementChild.firstElementChild.setAttribute('href', playing ? '#n-pause' : '#n-play');
    nrEl.play.setAttribute('aria-label', playing ? 'Pause' : 'Play');
  }
  const sleepShort = v => v === 0 ? 'Sleep' : v === 'chapter' ? 'Track end' : v + ' min';
  function nrSleep(v) { nrEl.sleep.classList.toggle('on', v !== 0); nrEl.sleep.dataset.on = String(v !== 0); nrEl.sleep.querySelector('.ub-l').textContent = sleepShort(v); nrEl.sleep.setAttribute('aria-label', sleepLabel(v)); }
  const sleepLabel = v => v === 0 ? 'Sleep timer off' : v === 'chapter' ? 'Sleep timer: end of track' : 'Sleep timer: ' + v + ' min';
  const bmKey = () => 'wt:bm:' + (S.book ? S.book.id : '');
  function nrBmUI() {
    const b = S.book ? store.get(bmKey(), null) : null;
    [nrEl.bm, $('#b-bm-dock')].forEach(x => { if (!x) return; x.setAttribute('aria-pressed', String(!!b)); x.setAttribute('aria-label', b ? 'Bookmarked' : 'Bookmark'); });
  }
  function nrHead() {
    if (!S.book) return;
    nrEl.title.textContent = S.book.title;
    nrSegs(); nrBmUI();
  }
