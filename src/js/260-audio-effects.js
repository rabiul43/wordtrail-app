  /* ---------- Finer speed, silence skipping, voice boost ---------- */
  const SPD_PRE = [0.75, 1, 1.25, 1.5, 2, 2.5, 3];
  const spdFmt = v => +v.toFixed(2) + 'x';
  const spdClamp = v => Math.round(Math.min(3, Math.max(0.5, +v || 1)) * 20) / 20;
  function spdPaint() {
    $('#sp-val').textContent = spdFmt(P.speed); $('#sp-range').value = P.speed;
    $$('#sp-presets .chip').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.v === P.speed)));
    $('#sp-lev').checked = !!P.level; $('#sp-sil').checked = !!P.silence; $('#sp-voice').checked = P.enh === 'voice';
  }
  let silT = 0, silQuiet = 0, silOn = false, silBuf = null;
  function silTick() {
    if (!vgraph || audio.paused || (!P.silence && P.enh !== 'voice')) { if (silOn) { silOn = false; audio.playbackRate = P.speed; } silQuiet = 0; return; }
    if (!silBuf) silBuf = new Uint8Array(vgraph.fftSize);
    vgraph.getByteTimeDomainData(silBuf);
    let m = 0; for (let i = 0; i < silBuf.length; i++) { const d = Math.abs(silBuf[i] - 128); if (d > m) m = d; }
    const quiet = m < 6;
    if (P.silence) {
      if (quiet) { silQuiet += 70; if (silQuiet >= 220 && !silOn) { silOn = true; audio.playbackRate = Math.min(16, Math.max(P.speed * 2.5, 2.5)); } }
      else { silQuiet = 0; if (silOn) { silOn = false; audio.playbackRate = P.speed; } }
    } else if (silOn) { silOn = false; audio.playbackRate = P.speed; }
    if (enh && P.enh === 'voice' && !quiet) {          // active leveling: lift soft passages, ease loud ones
      const lvl = m / 128, g = Math.min(2.4, Math.max(0.9, 0.42 / Math.max(lvl, 0.05)));
      enh.gain.gain.setTargetAtTime(g, vctx.currentTime, 0.25);
    }
  }
  function silSync() { // the 70 ms timer only runs while the audio is playing: when paused there is nothing to measure
    const need = (!!P.silence || P.enh === 'voice') && !audio.paused;
    if (need && !silT) silT = setInterval(silTick, 70);
    if (!need && silT) { clearInterval(silT); silT = 0; silQuiet = 0; if (silOn) { silOn = false; audio.playbackRate = P.speed; } }
  }
  function silSet(on) {
    P.silence = !!on; savePrefs(); silSync(); spdPaint();
    if (!on) return;
    vizPrime();
    if (S.book && !vgraph && !S.vizFail && audio.crossOrigin !== 'anonymous') vizReload();
    else if (!audio.paused) vizTryBuild();
  }
  guideDoc('audio', 'Even out volume', "Matches the loudness of every track, for books where the narrator's level changes.");
  /* ---------- Loudness evener ----------
     Measures how loud the narrator is (the 80th percentile of short-frame levels over the last 5 s, so pauses do
     not pull it down) and trims a gain stage in front of the enhancer so every track lands near the same level.
     The level learned for each track is saved per book, so a track starts at the right volume next time.
     Gain is limited to -9 dB .. +6 dB. */
  const LEV = { target: -24, min: -9, max: 6, ring: 50, need: 20 };
  let levT = 0, levRing = [], levSec = -1, levLv = null, levMs = 0, levSaved = 0, levMem = null, levBook = null, levData = null;
  function levMemory() {
    const id = S.book && S.book.id;
    if (id == null) return null;
    if (levBook !== id) { levBook = id; levMem = store.get('wt:lev:' + id, {}) || {}; }
    return levMem;
  }
  function levGain(db, quick) {
    if (!enh || !enh.lev || !vctx) return;
    const g = Math.pow(10, Math.min(LEV.max, Math.max(LEV.min, db)) / 20), t = vctx.currentTime, p = enh.lev.gain;
    if (quick) { p.cancelScheduledValues(t); p.setValueAtTime(g, t); } else p.setTargetAtTime(g, t, 0.6);
  }
  function levFrameDb() {
    const n = vgraph.fftSize; let sum = 0;
    if (vgraph.getFloatTimeDomainData) {
      if (!levData || levData.length !== n) levData = new Float32Array(n);
      vgraph.getFloatTimeDomainData(levData);
      for (let i = 0; i < n; i++) sum += levData[i] * levData[i];
    } else {
      if (!silBuf || silBuf.length !== n) silBuf = new Uint8Array(n);
      vgraph.getByteTimeDomainData(silBuf);
      for (let i = 0; i < n; i++) { const v = (silBuf[i] - 128) / 128; sum += v * v; }
    }
    return 20 * Math.log10(Math.sqrt(sum / n) + 1e-9);
  }
  function levTick() {
    if (!P.level || !enh || !enh.lev || !vgraph || !S.book) return;
    if (audio.paused || audio.seeking || S.loadingAudio) return;
    const mem = levMemory();
    if (levSec !== S.sec) {                                  // a new track: start from what was learned last time
      levSec = S.sec; levRing = []; levMs = 0;
      levLv = mem && typeof mem[S.sec] === 'number' ? mem[S.sec] : null;
      levGain(levLv == null ? 0 : LEV.target - levLv, true);
    }
    levRing.push(levFrameDb()); if (levRing.length > LEV.ring) levRing.shift();
    levMs += 100;
    if (levRing.length < LEV.need) return;
    const L = levRing.slice().sort((a, b) => a - b)[Math.floor(levRing.length * 0.8)];
    if (L < -60) return;                                     // silence: nothing to measure
    levLv = levLv == null ? L : levLv + (L - levLv) * (levMs < 15000 ? 0.1 : 0.01);
    levGain(LEV.target - levLv, false);
    if (mem && levMs >= 20000 && Date.now() - levSaved > 15000) { mem[S.sec] = Math.round(levLv * 10) / 10; store.set('wt:lev:' + S.book.id, mem); levSaved = Date.now(); }
  }
  function levSync() { // the 100 ms timer only runs while playing; a pause stops the timer but keeps what was learned
    if (P.level && !audio.paused && !levT) levT = setInterval(levTick, 100);
    if (P.level && audio.paused && levT) { clearInterval(levT); levT = 0; }
    if (!P.level && levT) { clearInterval(levT); levT = 0; levSec = -1; levLv = null; levGain(0, false); }
  }
  function levSet(on) {
    P.level = !!on; savePrefs(); levSync(); enhApply(); spdPaint();
    if (!on) return;
    vizPrime();
    if (S.book && !vgraph && !S.vizFail && audio.crossOrigin !== 'anonymous') vizReload();
    else if (!audio.paused) vizTryBuild();
  }
  guideDoc('audio', 'Mono and balance', "Play the same sound in both ears, or move the sound to the ear you hear with.");
  /* ---------- Mono and left/right balance ----------
     Mono mixes both channels into one. Balance moves the sound between the ears; at full left or right everything
     plays on that side (a stereo pair is summed first, so nothing is lost for someone who hears with one ear). */
  function balText(b) { const v = Math.round(Math.abs(b) * 100); return !v ? 'Centre' : (b < 0 ? 'Left ' : 'Right ') + v + '%'; }
  function chPaint() {
    const b = Math.max(-1, Math.min(1, +P.balance || 0));
    $('#sp-mono').checked = !!P.mono; $('#sp-bal').value = Math.round(b * 100); $('#sp-bal-v').textContent = balText(b);
    $$('#sp-bal-pre .chip').forEach(x => x.setAttribute('aria-pressed', String(+x.dataset.b === b)));
  }
  function chApply() {
    savePrefs(); enhApply(); chPaint();
    if (!(P.mono || +P.balance)) return;
    vizPrime();
    if (S.book && !vgraph && !S.vizFail && audio.crossOrigin !== 'anonymous') vizReload();
    else if (!audio.paused) vizTryBuild();
  }
  function chInit() {
    $('#sp-mono').addEventListener('change', e => { P.mono = !!e.target.checked; chApply(); });
    $('#sp-bal').addEventListener('input', e => { P.balance = Math.round(+e.target.value) / 100; chApply(); });
    $$('#sp-bal-pre .chip').forEach(x => x.addEventListener('click', () => { P.balance = +x.dataset.b; chApply(); }));
    chPaint();
  }
  function speedInit() {
    const pre = $('#sp-presets');
    SPD_PRE.forEach(v => pre.append(h('button', { class: 'chip', type: 'button', 'data-v': String(v), 'aria-pressed': 'false', onclick: () => { setSpeed(v); spdPaint(); } }, spdFmt(v))));
    $('#sp-range').addEventListener('input', e => { setSpeed(+e.target.value); spdPaint(); });
    $('#sp-minus').addEventListener('click', () => { setSpeed(P.speed - 0.05); spdPaint(); });
    $('#sp-plus').addEventListener('click', () => { setSpeed(P.speed + 0.05); spdPaint(); });
    $('#sp-sil').addEventListener('change', e => silSet(e.target.checked));
    $('#sp-lev').addEventListener('change', e => levSet(e.target.checked));
    $('#sp-voice').addEventListener('change', e => { enhSet(e.target.checked ? 'voice' : 'off'); silSync(); spdPaint(); });
    $$('#seg-enh button').forEach(b => b.addEventListener('click', () => { silSync(); spdPaint(); }));
    el.speed.addEventListener('click', () => { buzz('tick'); spdPaint(); openSheet('sheet-speed'); });
    $('#b-hl').addEventListener('click', () => { closeSheets(); hlOpen(); });
    $('#qk-set').addEventListener('click', () => openSettingsHome());
    $('#qk-t-speed').addEventListener('click', () => { buzz('tick'); qkOpt('speed'); });
    $('#qk-t-sleep').addEventListener('click', () => { buzz('tick'); qkOpt('sleep'); });
    /* Turning the sound on also lets the app read the scene from where the reader is now, so no scene has to be picked by hand */
    const qkAmbSet = on => { if (on && !sndOn()) { P.sndOn = true; sndApplyAll(); } P.ambOn = on; const c = $('#in-ambon'); if (c) c.checked = on; if (on && P.ambAuto !== false) { AMB.auto = null; AMB.autoId = null; } savePrefs(); ambSync(); if (on && P.ambAuto !== false) { try { ambAutoStep(); } catch (e) { /* optional */ } ambApply(1.5); } qkPaint(); };
    $('#qk-t-amb').addEventListener('click', () => { buzz('tick'); if ($('#qk-o-amb').hidden && P.ambOn !== true) qkAmbSet(true); qkOpt('amb'); });   // first tap on Sound turns it on and opens its panel
    $('#qk-amb-vol').addEventListener('input', e => { P.ambVol = +e.target.value; const v = $('#amb-vol'); if (v) v.value = e.target.value; savePrefs(); ambMaster(); qkPaint(); });
    $('#qk-amb-mix').addEventListener('click', () => { closeSheets(); ambOpen(); });
    /* ---- speed quick-control rich card ---- */
    const spdIn = $('#qk-range');
    /* 51 steps: index 0 = 0.5x … index 50 = 3x, linear 0.05 per step */
    const SPD_IDX_MAX = 50;
    const spdIdxToVal = i => Math.round((0.5 + i * 0.05) * 20) / 20;
    const spdValToIdx = v => Math.round((spdClamp(v) - 0.5) / 0.05);
    const spdMood = v => v < 0.8 ? 'Taking it slow' : v < 0.95 ? 'Slightly slower' : v === 1 ? 'Normal speed' : v <= 1.3 ? 'Slightly faster' : v <= 1.6 ? 'Crisp pace' : v <= 2 ? 'Quick listen' : 'Full speed ahead';
    let spdLast = -1;
    const spdCardPaint = () => {
      const i = Math.max(0, Math.min(SPD_IDX_MAX, +spdIn.value || 0)), v = spdIdxToVal(i);
      const fmt = spdFmt(v);
      $('#spd-big').textContent = fmt;
      $('#spd-mood').textContent = spdMood(v);
      spdIn.style.setProperty('--fill', (i / SPD_IDX_MAX * 100) + '%');
      spdIn.setAttribute('aria-valuetext', fmt);
      $('#qk-speed-go').textContent = v === P.speed ? 'No change' : v < P.speed ? 'Slow down' : 'Speed up';
      if (i !== spdLast) { if (spdLast >= 0) buzz('tick'); spdLast = i; }
      return v;
    };
    const spdCardSync = () => { spdIn.value = String(spdValToIdx(P.speed)); spdLast = -1; spdCardPaintFull(); };
    const spdNudge = d => { spdIn.value = String(Math.max(0, Math.min(SPD_IDX_MAX, (+spdIn.value || 0) + d))); spdCardPaintFull(); };
    const spdMarkActive = () => {
      const i = +spdIn.value || 0;
      $$('#qk-speed-c .slp-ends span').forEach(s => s.setAttribute('aria-pressed', String(+s.dataset.idx === i)));
    };
    const spdCardPaintFull = () => { spdCardPaint(); spdMarkActive(); };
    spdIn.addEventListener('input', spdCardPaintFull);
    $('#qk-speed-c .slp-ends').addEventListener('click', e => {
      const t = e.target.closest('[data-idx]'); if (!t) return;
      spdIn.value = t.dataset.idx; spdCardPaintFull(); buzz('tick');
    });
    $('#qk-speed-c .slp-ends').addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); const t = e.target.closest('[data-idx]'); if (t) { spdIn.value = t.dataset.idx; spdCardPaintFull(); buzz('tick'); } }
    });
    $('#spd-dec').addEventListener('click', () => spdNudge(-1));
    $('#spd-inc').addEventListener('click', () => spdNudge(1));
    $('#qk-speed-go').addEventListener('click', () => {
      const v = spdCardPaint(); setSpeed(v); closeSheets();
      toast('Speed: ' + spdFmt(v), 1800);
    });
    $('#qk-t-speed').addEventListener('click', () => { if (!$('#qk-o-speed').hidden) spdCardSync(); });
    /* One slider holds every sleep choice: Off, then 5 minutes up to 4 hours (fine steps for short times, wider ones further out), then "End of track" */
    const slIn = $('#qk-sleep-min');
    const SL_MIN = (() => { const a = []; for (let m = 5; m <= 60; m += 5) a.push(m); for (let m = 70; m <= 120; m += 10) a.push(m); for (let m = 135; m <= 240; m += 15) a.push(m); return a; })();
    const SL_VALS = [0].concat(SL_MIN, ['chapter']);
    const slFmt = m => m < 60 ? m + ' min' : Math.floor(m / 60) + ' h' + (m % 60 ? ' ' + (m % 60) + ' min' : '');
    const slBig = v => v === 0 ? 'Off' : v === 'chapter' ? 'End of track' : slFmt(v);
    const slMood = v => v === 0 ? 'No sleep timer' : v === 'chapter' ? 'Until this track ends' : v <= 20 ? 'A quick nap' : v <= 45 ? 'A short wind-down' : v <= 90 ? 'Drift off gently' : v <= 150 ? 'A chapter or two' : 'A long night';
    const slEnd = v => {
      if (v === 0) return 'The book keeps playing.';
      if (v === 'chapter') { const d = audio.duration, left = isFinite(d) && d > 0 ? Math.max(0, d - audio.currentTime) / (P.speed || 1) : 0; return left > 0 ? 'Stops in about ' + slFmt(Math.max(1, Math.round(left / 60))) : 'Stops when this track finishes.'; }
      return 'Stops at ' + new Date(Date.now() + v * 60000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    };
    let slLast = -1;
    const slPaint = () => {
      const i = Math.max(0, Math.min(SL_VALS.length - 1, +slIn.value || 0)), v = SL_VALS[i];
      $('#slp-big').textContent = slBig(v); $('#slp-mood').textContent = slMood(v); $('#slp-end').textContent = slEnd(v);
      slIn.style.setProperty('--fill', (i / (SL_VALS.length - 1) * 100) + '%'); slIn.setAttribute('aria-valuetext', slBig(v));
      $('#qk-sleep-go').textContent = v === 0 ? (S.sleep ? 'Turn timer off' : 'No timer') : v === 'chapter' ? 'Stop at end of track' : 'Start timer';
      if (i !== slLast) { if (slLast >= 0) buzz('tick'); slLast = i; }
      return v;
    };
    const slSync = () => {   // show the timer that is running now (or Off)
      const cur = S.sleep; let bi = 0;
      if (cur === 'chapter') bi = SL_VALS.length - 1;
      else if (typeof cur === 'number' && cur > 0) { bi = 1; SL_MIN.forEach((m, k) => { if (Math.abs(m - cur) < Math.abs(SL_MIN[bi - 1] - cur)) bi = k + 1; }); }
      slIn.value = String(bi); slLast = -1; slPaint();
    };
    const slNudge = d => { slIn.value = String(Math.max(0, Math.min(SL_VALS.length - 1, (+slIn.value || 0) + d))); slPaint(); };
    slIn.addEventListener('input', slPaint);
    const slMarkActive = () => {
      const i = +slIn.value || 0;
      $$('#qk-sleep-c .slp-ends span').forEach(s => s.setAttribute('aria-pressed', String(+s.dataset.idx === i)));
    };
    const slPaintFull = () => { slPaint(); slMarkActive(); };
    slIn.removeEventListener('input', slPaint);
    slIn.addEventListener('input', slPaintFull);
    $('#qk-sleep-c .slp-ends').addEventListener('click', e => {
      const t = e.target.closest('[data-idx]'); if (!t) return;
      slIn.value = t.dataset.idx; slPaintFull(); buzz('tick');
    });
    $('#qk-sleep-c .slp-ends').addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); const t = e.target.closest('[data-idx]'); if (t) { slIn.value = t.dataset.idx; slPaintFull(); buzz('tick'); } }
    });
    $('#slp-dec').addEventListener('click', () => slNudge(-1));
    $('#slp-inc').addEventListener('click', () => slNudge(1));
    $('#qk-sleep-go').addEventListener('click', () => {
      const v = slPaint(); setSleep(v); closeSheets(); if (P.shakeSleep === true && typeof v === 'number' && v > 0) shakeArm(true);
      toast(v === 0 ? 'Sleep timer off' : v === 'chapter' ? 'Sleep at the end of this track' : 'Sleep in ' + slFmt(v), 2200);
    });
    $('#qk-t-sleep').addEventListener('click', () => { if (!$('#qk-o-sleep').hidden) slSync(); });   // after qkOpt has opened the panel
    (() => {
      const sh = $('#sheet-quick'), hd = sh.querySelector('header'); let y0 = 0, dy = 0, on = false;
      hd.addEventListener('touchstart', e => { if (e.target.closest('button')) return; y0 = e.touches[0].clientY; dy = 0; on = true; sh.style.transition = 'none'; }, { passive: true });
      hd.addEventListener('touchmove', e => { if (!on) return; dy = Math.max(0, e.touches[0].clientY - y0); sh.style.transform = 'translate(-50%, ' + dy + 'px)'; }, { passive: true });
      const end = () => { if (!on) return; on = false; sh.style.transition = 'transform .18s ease-out'; if (dy > 70) closeSheets(); sh.style.transform = ''; dy = 0; };
      hd.addEventListener('touchend', end); hd.addEventListener('touchcancel', end);
    })();
    $('#qk-fine').addEventListener('click', () => { spdPaint(); openSheet('sheet-speed'); });
    $('#qk-read').addEventListener('click', () => { closeSheets(); $('#b-read').click(); });
    try { new MutationObserver(qkPaint).observe($('#b-more'), { attributes: true, attributeFilter: ['class'] }); } catch (e) { /* no observer */ }
    qkPaint();
    $$('#card-styles .chip').forEach(b => b.addEventListener('click', () => { CARD.style = b.dataset.s; $$('#card-styles .chip').forEach(x => x.setAttribute('aria-pressed', String(x === b))); cardDraw(); }));
    $('#card-share').addEventListener('click', cardShare); $('#card-save').addEventListener('click', cardSave);
    audio.addEventListener('play', () => { silSync(); levSync(); }); audio.addEventListener('pause', () => { silSync(); levSync(); });
    silSync(); levSync(); chInit(); hlCount();
  }
  function setSpeed(v) {
    v = spdClamp(v); silOn = false; P.speed = v; audio.defaultPlaybackRate = v; audio.playbackRate = v;
    el.speed.querySelector('.ub-sp').textContent = nrSpd(v) + '×'; el.speed.dataset.on = String(v !== 1);
    el.speed.setAttribute('aria-label', 'Playback speed: ' + spdFmt(v) + '. Open playback settings'); savePrefs();
    nrSpeedUI();
    qkPaint();
  }
  /* ---------- lock screen / notification artwork ----------
     Android draws the media card itself and tints it from the artwork image, so the artwork is the one place we
     control the look. We build a square image: the book cover, centred with a soft shadow, on a gradient in the
     cover's own dominant colour (the same colour the app accent uses). If the cover can't be read, a designed
     placeholder (gradient + initial) is drawn instead. Built once per book and remembered. */
  const MSART = new Map();   // book id -> object URL ('' = could not build)
  function msRound(cx, x, y, w, h, r) {
    cx.beginPath(); cx.moveTo(x + r, y); cx.arcTo(x + w, y, x + w, y + h, r); cx.arcTo(x + w, y + h, x, y + h, r);
    cx.arcTo(x, y + h, x, y, r); cx.arcTo(x, y, x + w, y, r); cx.closePath();
  }
  async function msArt(b) {
    const key = String(b.id);
    if (MSART.has(key)) return MSART.get(key);
    let url = '';
    try {
      const col = await coverColor(b), hue = col.h, sat = Math.max(40, Math.min(75, col.s || 50));
      let bmp = null;
      const src = coverSources(b)[0];
      if (src) {
        try {
          const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 6000);
          const r = await fetch(src, { signal: ctl.signal }); clearTimeout(to);
          if (r.ok) bmp = await createImageBitmap(await r.blob());
        } catch (e) { bmp = null; }
      }
      const N = 512, cv = document.createElement('canvas'); cv.width = cv.height = N;
      const cx = cv.getContext('2d');
      const bgG = cx.createLinearGradient(0, 0, N, N);
      bgG.addColorStop(0, 'hsl(' + hue + ' ' + sat + '% 36%)');
      bgG.addColorStop(1, 'hsl(' + ((hue + 24) % 360) + ' ' + Math.round(sat * .8) + '% 12%)');
      cx.fillStyle = bgG; cx.fillRect(0, 0, N, N);
      const glow = cx.createRadialGradient(N * .3, N * .22, 0, N * .3, N * .22, N * .75);
      glow.addColorStop(0, 'rgba(255,255,255,.20)'); glow.addColorStop(1, 'rgba(255,255,255,0)');
      cx.fillStyle = glow; cx.fillRect(0, 0, N, N);
      if (bmp && bmp.width > 1 && bmp.height > 1) {
        const k = Math.min(N * .76 / bmp.width, N * .76 / bmp.height), w = bmp.width * k, h2 = bmp.height * k, x = (N - w) / 2, y = (N - h2) / 2;
        cx.save(); cx.shadowColor = 'rgba(0,0,0,.55)'; cx.shadowBlur = 36; cx.shadowOffsetY = 12;
        cx.fillStyle = '#000'; msRound(cx, x, y, w, h2, 14); cx.fill(); cx.restore();
        cx.save(); msRound(cx, x, y, w, h2, 14); cx.clip(); cx.drawImage(bmp, x, y, w, h2); cx.restore();
      } else {
        cx.fillStyle = 'rgba(255,255,255,.88)'; cx.font = '700 240px Georgia, serif'; cx.textAlign = 'center'; cx.textBaseline = 'middle';
        cx.fillText((String(b.title || '?').trim().charAt(0) || '?').toUpperCase(), N / 2, N / 2 + 10);
      }
      const blob = await new Promise(res => cv.toBlob(res, 'image/jpeg', .9));
      if (blob) url = URL.createObjectURL(blob);
    } catch (e) { url = ''; }
    if (MSART.size >= 4) { const old = MSART.keys().next().value; const u = MSART.get(old); if (u) URL.revokeObjectURL(u); MSART.delete(old); }
    MSART.set(key, url);
    return url;
  }
  function setMediaSession() {
    if (!('mediaSession' in navigator) || !S.book) return;
    const b = S.book, id = b.id, sec = S.sec;
    const author = String(b.authors || '').replace(/\s*\([^)]*\)/g, '').trim();
    const apply = art => {
      try {
        if (!S.book || S.book.id !== id || S.sec !== sec) return;   // moved on while the art was being made
        navigator.mediaSession.metadata = new MediaMetadata({
          title: (S.secs[sec] && S.secs[sec].title) || b.title || '', artist: [b.title, author].filter(Boolean).join(' \u00B7 '), album: b.title, artwork: art
        });
      } catch (e) { /* unsupported */ }
    };
    /* The system picks the size that fits its card (96 = small notification, 192 = lock screen, 512 = large / Android tint),
       so every image is listed at all three sizes; the built image is 512x512 and is scaled down by the system. */
    const SZ = ['96x96', '192x192', '512x512'];
    const mk = u => SZ.map(sizes => ({ src: u, sizes, type: 'image/jpeg' }));
    const have = MSART.get(String(id));
    apply(have ? mk(have) : (b.cover ? SZ.map(sizes => ({ src: b.cover, sizes })) : []));
    if (have === undefined) msArt(b).then(u => { if (u) apply(mk(u)); });
  }
  /* ---------- "Skip intro" button: for tracks that have no automatic skip time (see cuts.json) ----------
     Shows for the first 30 seconds of a track and jumps to where the text starts (the app's own estimate), or about 15 s in
     when there is no text. Settings > Audio can turn it off. */
  function introTarget() {
    const p = S.plan && S.plan[S.sec];
    let t = p && p.ids && p.ids.length ? p.cLo : 0;
    if (!(t > 3 && t < 75)) t = 15;
    return Math.max(0, t - 0.4);
  }
  function paintSkipIntro() {
    const b = document.getElementById('b-skipintro'); if (!b) return;
    let show = false;
    if (S.book && P.skipBtn !== false && !el.player.hidden && S.secs && S.secs[S.sec]) {
      const c = cutFor(S.sec), t = audio.currentTime || 0;
      show = !(c && c[0] > 0) && t < 30 && introTarget() > t + 1.5;
    }
    if (b.hidden === show) b.hidden = !show;
  }
  function initSkipIntro() {
    const b = document.getElementById('b-skipintro'); if (!b) return;
    b.addEventListener('click', () => { buzz('light'); seekAudio(introTarget()); b.hidden = true; });
    ['timeupdate', 'loadedmetadata', 'seeked', 'emptied', 'play'].forEach(ev => audio.addEventListener(ev, paintSkipIntro));
    paintSkipIntro();
  }

  /* Lock-screen / notification buttons. Default: skip back and forward (15 s), which suits audiobooks better than
     previous/next track. Settings > Audio can switch back to track buttons. Called again when that setting changes. */
  function initMediaSession() {
    if (!('mediaSession' in navigator)) return;
    const set = (a, f) => { try { navigator.mediaSession.setActionHandler(a, f); } catch (e) { /* unsupported action */ } };
    const skip = P.lockSeek !== false;
    set('play', () => audio.play().catch(onPlayFail)); set('pause', () => audio.pause());
    set('stop', () => audio.pause());
    set('seekto', d => { if (d && d.seekTime != null) seekAudio(d.seekTime); });
    if (skip) {
      set('seekbackward', d => seekAudio(nowT() - ((d && d.seekOffset) || 15)));
      set('seekforward', d => seekAudio(nowT() + ((d && d.seekOffset) || 15)));
      set('previoustrack', null); set('nexttrack', null);
    } else {
      set('previoustrack', () => stepTrack(-1)); set('nexttrack', () => stepTrack(1));
      set('seekbackward', null); set('seekforward', null);
    }
  }

