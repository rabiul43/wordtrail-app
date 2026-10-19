  /* ---------- how sure the highlight is ---------- */
  /* Confirmed: a sentence the narrator's pauses pinned, or one you tapped, lies within
     CONFIRM_REACH seconds of speech (or the sentence sits between two such points no more than
     CONFIRM_GAP apart). Everything else is an estimate from sentence length. */
  const CONFIRM_REACH = 20, CONFIRM_GAP = 90;
  function syncInfo(sec, id) {
    const p = S.plan[sec];
    if (!S.model || !p || !p.ids.length || S.sentSec[id] !== sec) return null;
    const c = p.cost[S.sentPos[id]], auto = !!S.autoSrc[sec];
    let before = null, after = null;
    for (const a of (S.anchors[sec] || [])) {
      if (S.sentSec[a.id] !== sec) continue;
      const audioKind = auto || !!a.a;
      if (!audioKind && a.s) continue; /* edge points of a tap's stretch are estimates */
      const q = { c: p.cost[S.sentPos[a.id]], audio: audioKind };
      if (q.c <= c) { if (!before || q.c > before.c) before = q; } else if (!after || q.c < after.c) after = q;
    }
    const near = before && after ? (c - before.c <= after.c - c ? before : after) : (before || after);
    const sure = !!near && (Math.abs(near.c - c) <= CONFIRM_REACH || !!(before && after && after.c - before.c <= CONFIRM_GAP));
    return { sure, audio: sure && near.audio };
  }
  function updateSyncUI() {
    const pl = S.model && S.plan[S.sec], hasText = !!(pl && pl.ids.length);
    let info = S.curId >= 0 ? syncInfo(S.sec, S.curId) : null;
    if (!info && hasText) { const d = trackDone(S.sec); info = { sure: d, audio: d }; }   // no sentence playing yet: show the state of the track itself
    hlpWatch(info);
    el.syncbar.hidden = !info;
    { const td = $('#b-timing'); if (td) td.hidden = !info; }
    const sp = S.spans.get(S.curId);
    if (sp) sp.classList.toggle('est', !!info && !info.sure);
    if (!info) return;
    const busy = !info.sure && (S.aligning || S.bgTrack === S.sec);
    el.syncbar.classList.toggle('est', !info.sure);
    el.syncbar.classList.toggle('prep', busy);
    el.syncbar.dataset.state = info.sure ? 'precise' : busy ? 'preparing' : 'estimated';
    el.sstate.textContent = info.sure ? (info.audio ? 'Timing: Precise' : 'Timing: Precise \u00b7 set by you')
      : busy ? 'Timing: Preparing\u2026'
      : 'Timing: Estimated';
    { const td = $('#b-timing'); if (td) { td.dataset.state = el.syncbar.dataset.state; td.setAttribute('aria-label', el.sstate.textContent); td.title = el.sstate.textContent; const tl = $('#b-timing-l'); if (tl) tl.textContent = el.sstate.textContent; } }
    if (S.calibrate) el.syncbar.classList.add('pop');   // tap-sync is on: keep the Done button in reach
    el.sstate.title = info.sure ? 'The highlight follows the narrator closely.' : busy ? 'Improving the timing for this track.' : 'The highlight is a good guess. Tap Adjust timing to tighten it.';
    el.fix.textContent = S.calibrate ? 'Done' : S.aligning ? 'Working\u2026' : 'Adjust timing';
    el.fix.disabled = !!S.aligning;
  }
  /* One tap: let the audio decide when that is possible (this track, nothing tapped by hand, a
     connection the background setting allows). Otherwise, or if that fails, switch on tap-sync. */
  async function fixSync() {
    if (S.calibrate) { S.calibrate = false; syncCalUI(); return; }
    const sec = S.sec, p = S.plan[sec];
    if (!S.model || !p || !p.ids.length || S.aligning) return;
    const byHand = !!(S.anchors[sec] && S.anchors[sec].length && !S.autoSrc[sec]);
    if (!byHand && S.autoSrc[sec] !== 'full' && !S.alignFailed.has(sec) && bgAllowed()) {
      if (await autoAlign(sec) || sec !== S.sec) return;
    }
    S.calibrate = true; syncCalUI();
  }
  function syncCalUI() {
    updateSyncUI();
    el.cal.setAttribute('aria-pressed', String(S.calibrate));
    el.calbar.hidden = !S.calibrate;
    el.reader.classList.toggle('calibrating', S.calibrate);
    if (!S.calibrate && HLP.cal) { HLP.cal = false; const b = $('#hlp'); if (b) b.hidden = true; }   // tap-sync was ended (Done, or the sync button): the help prompt goes with it
  }

  /* ---------- "Highlight off?" prompt ----------
     A small card above the dock that offers the tap-sync mode (#calbar, S.calibrate). It appears when the highlight is only an
     estimate for LOW_MS of playing, or when you pause and seek HLP_SEEKS times within HLP_SEEK_WIN (and the highlight is not
     already confirmed by the audio). At most once per track (wt:hlp:seen). While it is up, tap-sync is on: one tap on the
     sentence you hear re-times the highlight and ends the mode. Dismiss ends it too; "Don't show again" sets P.hlpOff
     (Settings > Timing > Advanced timing turns it back on). */
  const HLP_LOW_MS = 30000, HLP_SEEKS = 3, HLP_SEEK_WIN = 150000, HLP_PAUSE_GAP = 20000, HLP_SEEN_MAX = 80;
  const HLP = { key: '', low: 0, seeks: [], pausedAt: 0, cal: false };
  const hlpKey = () => (S.book ? S.book.id + ':' + S.sec : '');
  const hlpSeen = () => { const a = store.get('wt:hlp:seen', []); return Array.isArray(a) ? a : []; };
  function hlpHide() {
    const b = $('#hlp'); if (b) b.hidden = true;
    const armed = HLP.cal; HLP.cal = false;
    if (armed && S.calibrate) { S.calibrate = false; syncCalUI(); }
  }
  function hlpTrackCheck() {   // a new book or track starts from zero, and the prompt does not follow you there
    const k = hlpKey(); if (k === HLP.key) return;
    HLP.key = k; HLP.low = 0; HLP.seeks = []; hlpHide();
  }
  function hlpCanShow() {
    if (P.hlpOff === true || !S.book || !S.model || el.player.hidden || document.hidden) return false;
    if (S.calibrate || S.aligning || S.refining || job.running) return false;
    const p = S.plan[S.sec], k = hlpKey(), g = $('#gesture-hint');
    if (!p || !p.ids.length || !k || hlpSeen().includes(k)) return false;
    return !(g && !g.hidden);   // one card at a time: the gesture hint goes first
  }
  function hlpShow() {
    const b = $('#hlp'); if (!b || !hlpCanShow()) return;
    store.set('wt:hlp:seen', hlpSeen().concat(hlpKey()).slice(-HLP_SEEN_MAX));   // counted when it is shown: never twice for one track
    HLP.low = 0; HLP.seeks = [];
    S.calibrate = true; HLP.cal = true; syncCalUI();
    $('#hlp-t').textContent = 'Highlight off? Tap the sentence you hear.';
    b.hidden = false;
  }
  /* Called from updateSyncUI (every sentence change): the highlight has been an estimate for a while. */
  function hlpWatch(info) {
    hlpTrackCheck();
    if (!info || audio.paused || S.curId < 0 || S.sentSec[S.curId] !== S.sec) { HLP.low = 0; return; }
    const busy = !info.sure && (S.aligning || S.bgTrack === S.sec);   // the app is already improving it
    if (info.sure || busy || S.calibrate) { HLP.low = 0; return; }
    const now = Date.now();
    if (!HLP.low) HLP.low = now; else if (now - HLP.low >= HLP_LOW_MS) hlpShow();
  }
  /* Called when you move by hand (seek bar, back/forward 15, previous/next sentence, tap a sentence, keys). */
  function hlpSeek() {
    if (!S.book || S.loadingAudio || S.pendingSeek) return;
    hlpTrackCheck();
    const now = Date.now();
    if (!audio.paused && now - HLP.pausedAt > HLP_PAUSE_GAP) return;   // only seeks made while paused, or just after a pause
    HLP.seeks = HLP.seeks.filter(t => now - t < HLP_SEEK_WIN); HLP.seeks.push(now);
    if (HLP.seeks.length < HLP_SEEKS) return;
    const info = S.curId >= 0 ? syncInfo(S.sec, S.curId) : null;
    if (info && info.sure && info.audio) { HLP.seeks = []; return; }   // the narrator's own pauses confirm it: you are just navigating
    hlpShow();
  }
  function userSeek(t) { hlpSeek(); seekAudio(t); }
  function hlpTapped() { if (HLP.cal) hlpHide(); }   // the one tap it asked for: tap-sync ends
  audio.addEventListener('pause', () => { if (!audio.ended && !audio.seeking && !S.loadingAudio) HLP.pausedAt = Date.now(); });
  document.addEventListener('click', e => {
    if (e.target.closest('#hlp-x')) hlpHide();
    else if (e.target.closest('#hlp-never')) { P.hlpOff = true; savePrefs(); hlpHide(); const c = $('#in-hlp'); if (c) c.checked = false; toast('Okay. You can turn this back on in Settings > Timing.', 4500); }
  });
  document.addEventListener('change', e => { if (e.target && e.target.id === 'in-hlp') { P.hlpOff = !e.target.checked; savePrefs(); if (P.hlpOff) hlpHide(); } });
  { const b = $('#hlp'); if (b) b.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); hlpHide(); } }); }
  guideDoc('timing', 'Highlight off? prompt', "If the highlight is only a guess for a while, or you keep pausing and jumping, a small card asks you to tap the sentence you hear. Dismiss it, or choose Don't show again (turn it back on in Settings > Advanced timing).");

  guideDoc('player', 'Speed', "Open Quick controls (the three-dot button) and choose 0.5x to 3x. Fine-tune sets exact steps.");
  guideDoc('player', 'Sleep timer', "In Quick controls pick 15, 30, 45 or 60 minutes, or End of track. The sound fades out and the audio stops by itself.");
  guideDoc('player', 'Lock screen controls', "The lock screen and notification show the track, a progress bar and play, skip and seek buttons.");
  /* ---------- sleep timer, speed, media session ---------- */
  const SLEEPS = [0, 15, 30, 45, 60, 'chapter'];
  /* Quick controls panel (the three-dot button): shows what is on, and a dot on the button when something is. */
  function qkOpt(which) {
    ['speed', 'sleep', 'amb'].forEach(k => {
      const open = k === which && $('#qk-o-' + k).hidden;
      $('#qk-o-' + k).hidden = !open; $('#qk-t-' + k).setAttribute('aria-expanded', String(open));
    });
  }
  function qkPaint() {
    $$('#qk-speed .chip').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.v === P.speed)));
    $$('#qk-sleep .chip').forEach(b => {
      if (b.dataset.s === 'custom') {   // pressed when the timer is on a number of minutes that is not one of the presets
        const own = typeof S.sleep === 'number' && S.sleep > 0 && ![15, 30, 45, 60].includes(S.sleep);
        b.setAttribute('aria-pressed', String(own)); b.textContent = own ? S.sleep + ' min' : 'Custom'; return;
      }
      b.setAttribute('aria-pressed', String((b.dataset.s === 'chapter' ? 'chapter' : +b.dataset.s) === S.sleep));
    });
    const sv = $('#qk-v-speed'), sl = $('#qk-v-sleep'), rg = $('#qk-range');
    if (sv) { sv.textContent = +(+P.speed).toFixed(2) + 'x'; $('#qk-t-speed').dataset.on = String(P.speed !== 1); }
    if (sl) { sl.textContent = !S.sleep ? 'Off' : S.sleep === 'chapter' ? 'End of track' : S.sleep + ' min'; $('#qk-t-sleep').dataset.on = String(!!S.sleep); }
    if (rg) { const ri = Math.round((spdClamp(P.speed) - 0.5) / 0.05); if (+rg.value !== ri) rg.value = String(ri); rg.style.setProperty('--fill', (ri / 50 * 100) + '%'); if ($('#spd-big')) { $('#spd-big').textContent = spdFmt(P.speed); $('#spd-mood').textContent = (P.speed < 0.8 ? 'Taking it slow' : P.speed < 0.95 ? 'Slightly slower' : P.speed === 1 ? 'Normal speed' : P.speed <= 1.3 ? 'Slightly faster' : P.speed <= 1.6 ? 'Crisp pace' : P.speed <= 2 ? 'Quick listen' : 'Full speed ahead'); $('#qk-speed-go').textContent = 'No change'; } }
    const av = $('#qk-v-amb'), on = P.ambOn === true;
    if (av) { av.textContent = on ? (P.ambVol == null ? 70 : P.ambVol) + '%' : 'Off'; $('#qk-t-amb').dataset.on = String(on); const c = $('#qk-amb-on'), r = $('#qk-amb-vol'); if (c) c.checked = on; if (r) { r.value = String(P.ambVol == null ? 70 : P.ambVol); r.style.setProperty('--fill', r.value + '%'); } }
    /* Text only is on while the player is hidden; More shows a dot when something needs a look */
    const ro = !!(el.player && el.player.classList.contains('ro')), moreBtn = $('#b-more'), rt = $('#qk-read'), mt = $('#qk-more');
    if (rt) { rt.dataset.on = String(ro); rt.setAttribute('aria-label', 'Text only, ' + (ro ? 'active' : 'not active')); }
    if (mt) mt.classList.toggle('has-dot', !!(moreBtn && moreBtn.classList.contains('has-dot')));
    [['speed', 'Speed'], ['sleep', 'Sleep timer'], ['amb', 'Sound']].forEach(([k, nm]) => {
      const t = $('#qk-t-' + k), v = $('#qk-v-' + k); if (t && v) t.setAttribute('aria-label', nm + ', ' + v.textContent + (t.dataset.on === 'true' ? ', active' : ', not active'));
    });
    const more = $('#b-more'), dot = P.speed !== 1 || !!S.sleep || !!(more && more.classList.contains('has-dot'));
    ['#btn-player-settings'].forEach(id => { const b = $(id); if (b) b.classList.toggle('has-dot', dot); });
    { const mb = $('#btn-topmore'), td = $('#b-timing'); if (mb) mb.classList.toggle('has-dot', dot || !!(td && !td.hidden && td.dataset.state && td.dataset.state !== 'precise')); }   // the \u22ef menu hides these two, so it shows their dot
  }
  function setSleep(v) {
    if (v !== 0 && S.book) trAdd({ sec: S.sec, time: nowT(), why: 'sleep' });
    clearTimeout(S.sleepTimer); cancelFade(); S.sleep = v;
    el.sleep.querySelector('.ub-l').textContent = sleepShort(v);
    el.sleep.dataset.on = String(v !== 0);
    el.sleep.setAttribute('aria-label', sleepLabel(v));
    nrSleep(v);
    qkPaint();
    S.sleepEnd = (typeof v === 'number' && v > 0) ? Date.now() + v * 60000 : 0;
    if (typeof v === 'number' && v > 0) S.sleepTimer = setTimeout(fadeAndPause, v * 60000);
  }
  /* Graceful fade: a smooth ease-out over FADE_SECS. Used when a timed sleep ends, and over the last
     seconds of a track in "end of track" mode. (iOS Safari ignores audio.volume, so there it just stops.) */
  const FADE_SECS = 12;
  const fadeCurve = x => x * x * (3 - 2 * x);
  function setVol(v) { try { audio.volume = Math.min(1, Math.max(0, v)); } catch (e) { /* volume is read-only here */ } }
  function cancelFade() { clearInterval(S.fadeIv); S.fadeIv = 0; S.tailFade = false; setVol(1); }
  function fadeAndPause() {
    cancelFade();
    const t0 = performance.now(), D = FADE_SECS * 1000;
    S.fadeIv = setInterval(() => {
      if (audio.paused) { setSleep(0); return; } // already stopped by the listener: just reset
      const x = 1 - (performance.now() - t0) / D;
      if (x <= 0) { AMB.slow = true; audio.pause(); setSleep(0); toast('Sleep timer: paused.'); }
      else setVol(fadeCurve(x));
    }, 100);
  }
  /* ---------- shake to extend the sleep timer ----------
     Off by default (Settings > Audio). While a timed sleep is running, or during its final fade, a firm shake adds
     P.shakeMin minutes (fade is cancelled and the volume comes back). Needs the motion sensor, which a phone only
     gives while the page is visible; iPhones also ask permission once, so that is requested from a tap. */
  const SHAKE = { on: false, last: 0, hits: [], lastAcc: null, cool: 0 };
  function sleepRunning() { return typeof S.sleep === 'number' && S.sleep > 0 && S.sleepEnd > 0 && !audio.paused; }
  function extendSleep() {
    if (!sleepRunning()) return false;
    const add = Math.max(1, parseInt(P.shakeMin, 10) || 10);
    const left = Math.max(0, S.sleepEnd - Date.now());
    const mins = Math.max(1, Math.ceil((left + add * 60000) / 60000));
    setSleep(mins);   // restarts the timer, cancels any fade in progress and brings the volume back
    buzz('success');
    toast('Sleep timer extended: stops in ' + mins + ' min', 2400);
    return true;
  }
  function shakeMotion(e) {
    const a = e.accelerationIncludingGravity; if (!a || a.x == null) return;
    const now = performance.now();
    if (now < SHAKE.cool) return;
    const m = Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z);
    if (SHAKE.lastAcc != null && Math.abs(m - SHAKE.lastAcc) > 14) {   // a sharp jolt
      SHAKE.hits = SHAKE.hits.filter(t => now - t < 900); SHAKE.hits.push(now);
      if (SHAKE.hits.length >= 3) {   // three jolts inside about a second = a shake
        SHAKE.hits = []; SHAKE.cool = now + 3000;
        extendSleep();
      }
    }
    SHAKE.lastAcc = m;
  }
  function shakeArm(fromTap) {
    const want = P.shakeSleep === true && typeof window.DeviceMotionEvent !== 'undefined';
    const DM = window.DeviceMotionEvent;
    const go = () => { if (!SHAKE.on) { window.addEventListener('devicemotion', shakeMotion); SHAKE.on = true; } };
    const stop = () => { if (SHAKE.on) { window.removeEventListener('devicemotion', shakeMotion); SHAKE.on = false; SHAKE.hits = []; SHAKE.lastAcc = null; } };
    if (!want) { stop(); return Promise.resolve(false); }
    if (DM && typeof DM.requestPermission === 'function') {   // iPhone / iPad
      if (!fromTap) { go(); return Promise.resolve(true); }   // may already be allowed; if not, the next tap asks
      return DM.requestPermission().then(r => { if (r === 'granted') { go(); return true; } stop(); return false; }).catch(() => { stop(); return false; });
    }
    go(); return Promise.resolve(true);
  }
  shakeArm(false);
  const SPEEDS = [0.75, 1, 1.25, 1.5, 1.75, 2];
  /* ---------- lock screen: position and progress ----------
     setPositionState tells the system where the track is, how long it is and how fast it plays, so the lock
     screen / notification shows a true progress bar that keeps moving by itself. It is sent when something
     changes (track, seek, speed, play, pause), not on every tick. Before the audio has loaded, the listed
     length and the saved resume position stand in. */
  function posState() {
    const ms = navigator.mediaSession;
    if (!ms || !ms.setPositionState) return;
    try {
      const d = (isFinite(audio.duration) && audio.duration > 0) ? audio.duration : (S.book && S.durs[S.sec]) || 0;
      if (!S.book || !(d > 0)) { ms.setPositionState(); return; } // nothing to show: clear it
      const rate = audio.playbackRate > 0 ? audio.playbackRate : (P.speed > 0 ? P.speed : 1);
      const pos = Math.min(d, Math.max(0, +nowT() || 0));
      ms.setPositionState({ duration: d, playbackRate: rate, position: pos });
    } catch (e) { /* out-of-range values or an older browser: leave the lock screen as it is */ }
  }
  function posPlayback() { try { if ('mediaSession' in navigator) navigator.mediaSession.playbackState = !S.book ? 'none' : audio.paused ? 'paused' : 'playing'; } catch (e) { /* unsupported */ } }
  ['loadedmetadata', 'durationchange', 'play', 'playing', 'pause', 'seeked', 'ratechange', 'waiting', 'ended'].forEach(t => audio.addEventListener(t, () => { posPlayback(); posState(); }));
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { posPlayback(); posState(); } });

  guideDoc('player', 'Keep the screen on', "The screen stays on while a book is open. Turn it off in Settings > Reading.");
  /* ---------- keep the screen on while a book is open ----------
     A screen wake lock is held while the reader is on screen, so the display does not dim mid-sentence. The
     browser drops it whenever the page is hidden, so it is taken again when the page comes back. */
  const WL = { sentinel: null, busy: false, failed: 0, last: Date.now() };
  const WL_PAUSE_MS = 2 * 60e3;
  const wantAwake = () => P.keepAwake !== false && !el.player.hidden && !document.hidden && !(P.lowPower !== false && audio.paused && Date.now() - WL.last > WL_PAUSE_MS);
  /* Tells the person in Settings when the screen cannot be kept on, and why. */
  function wakeNote() {
    const n = document.getElementById('awake-note'); if (!n) return;
    let msg = '';
    if (!('wakeLock' in navigator)) msg = window.isSecureContext === false
      ? 'Keeping the screen on only works on a secure (https) page. Open Wordtrail through its https address, or raise your phone\u2019s own Screen timeout.'
      : 'This browser cannot keep the screen on. Raise your phone\u2019s own Screen timeout instead (Settings > Display).';
    else if (P.keepAwake !== false && WL.failed && !WL.sentinel && wantAwake()) msg = 'The phone refused to keep the screen on. Battery saver or a low battery can block it.';
    n.textContent = msg; n.hidden = !msg;
  }
  async function wakeSync() { try { await wakeSyncRun(); } finally { wlWatchSync(); } }
  async function wakeSyncRun() {
    if (!('wakeLock' in navigator)) { wakeNote(); return; }
    if (!wantAwake()) {
      if (WL.sentinel) { const t = WL.sentinel; WL.sentinel = null; t.release().catch(() => {}); }
      wakeNote();
      return;
    }
    if (WL.sentinel || WL.busy) return;
    WL.busy = true;
    try {
      const t = await navigator.wakeLock.request('screen');
      if (!wantAwake() || WL.sentinel) t.release().catch(() => {}); // things changed while asking
      else {
        WL.sentinel = t; WL.failed = 0;
        /* the system can take the lock back while the page is still showing (battery saver, a call, the notification shade):
           ask again straight away instead of waiting for the next tap */
        t.addEventListener('release', () => { if (WL.sentinel === t) { WL.sentinel = null; if (wantAwake()) setTimeout(wakeSync, 400); } });
      }
    } catch (e) { WL.failed = Date.now(); /* refused (battery saver, page not focused): the watchdog below tries again */ }
    finally { WL.busy = false; }
    wakeNote();
    if (wantAwake() !== !!WL.sentinel && !WL.failed) wakeSync();
  }
  /* watchdog: while the screen should be on but no lock is held, try again every 8 seconds, with no tap needed */
  /* It only needs to run while the screen should be on and no lock is held, so it starts and stops from wakeSync
     (which every change that matters already calls: show/hide, play/pause, visibility, the settings switches). */
  let wlWatchT = 0;
  function wlWatchSync() {
    const run = wantAwake() && !WL.sentinel;
    if (run && !wlWatchT) wlWatchT = setInterval(() => { if (wantAwake() && !WL.sentinel && !WL.busy) { WL.failed = 0; wakeSync(); } else wlWatchSync(); }, 8000);
    else if (!run && wlWatchT) { clearInterval(wlWatchT); wlWatchT = 0; }
  }
  document.addEventListener('visibilitychange', wakeSync);
  document.addEventListener('click', () => { if (!WL.sentinel && !WL.busy && wantAwake() && Date.now() - WL.failed > 3000) wakeSync(); }, true);
  /* Lower power: nothing playing and no touch for 2 minutes = let the screen sleep. Playing audio keeps it awake as before; a touch or Play takes it again. */
  let wlT = 0;
  const wlArm = () => { clearTimeout(wlT); if (P.lowPower !== false && audio.paused) wlT = setTimeout(wakeSync, WL_PAUSE_MS + 500); };
  ['pointerdown', 'keydown'].forEach(ev => document.addEventListener(ev, () => { WL.last = Date.now(); wlArm(); if (!WL.sentinel && !WL.busy && Date.now() - WL.failed > 3000) wakeSync(); }, true));
  audio.addEventListener('pause', () => { WL.last = Date.now(); wlArm(); });
  audio.addEventListener('play', () => { clearTimeout(wlT); wakeSync(); });


  guideDoc('highlights', 'Highlight a sentence', "Press and hold a sentence, then tap Highlight. Add a note if you like.");
  guideDoc('highlights', 'See them all and share', "More > Highlights and notes lists saved sentences and your notes. A quote card turns a sentence into an image in Night, Paper or Gold style, to share or save. Export bookmarks saves your bookmarks to a file.");
  /* ---------- Highlights, notes and quote cards (saved on this device, per book) ---------- */
  let trSid = -1;
  const hlKey = () => 'wt:hl:' + (S.book ? S.book.id : '');
  const hlAll = () => { const a = S.book ? store.get(hlKey(), []) : []; return Array.isArray(a) ? a : []; };
  const hlSave = a => { store.set(hlKey(), a.slice(0, 500)); hlPaint(); hlCount(); };
  const hlFind = id => hlAll().find(x => x.id === id);
  function hlToggle(id, keep) {
    if (id < 0 || !S.model || !S.model.sents[id]) return;
    let a = hlAll();
    if (a.some(x => x.id === id)) { if (keep) return; a = a.filter(x => x.id !== id); toast('Highlight removed.', 1800); }
    else { a.push({ id, t: S.model.sents[id].t, note: '', at: Date.now(), sec: S.sec }); a.sort((p, q) => p.id - q.id); buzz('light'); toast('Highlighted.', 1800); }
    hlSave(a);
  }
  function hlPaint() {
    $$('.s.hl', el.page).forEach(n => { n.classList.remove('hl', 'has-note'); });
    for (const x of hlAll()) { const sp = S.spans.get(x.id); if (sp) { sp.classList.add('hl'); if (x.note) sp.classList.add('has-note'); } }
  }
  function hlCount() { const d = $('#b-hl-d'); if (d) { const n = hlAll().length; d.textContent = n ? plural(n, 'highlight') + ' in this book' : 'Saved sentences, your notes, quote cards'; } }
  let hlPT = 0;
  new MutationObserver(() => { cancelAnimationFrame(hlPT); hlPT = requestAnimationFrame(() => { hlPaint(); hlCount(); }); }).observe(el.page, { childList: true });
  /* ---------- app language and right-to-left layout ----------
     Settings > Reading > Language. Arabic and Urdu switch the whole page to right-to-left (the book text and the player
     controls stay left-to-right). The main screens, menus and Settings headings are translated; anything not in the
     dictionary below stays in English. To add a language or more words, add them to I18N and I18N_LANGS. */
  /* The words live in src/i18n/<code>.json (one file per language; build.py joins them into the #i18n-data block).
     Each file: { name, dir, order, dict: { "English text": "translation" }, rx: [ [regex, replacement] ], suggest: { q, yes, no, also },
     units: [ [regex, replacement] ], keep: regex, digits: { map, label, hint } }.
     `units` turns numbers with units ("5h 10m", "45 min ago", "12 books") into the language, inside any text, and is applied to every
     match of each pattern in order. Text that has no exact key and still has English words after that is left alone, so English sentences
     are never half translated. `keep` lists Latin text that may stay (MB, GB, level codes). `digits` adds a Settings switch for native digits.
     `suggest` is optional: the first-run offer ("Use the app in <language>?"), worded in that language. Without it the language is never offered by itself.
     dict keys are the exact English text. rx is for text with numbers or names built in code ($1 = first match); it is
     tried only when there is no exact key. To add a language: add src/i18n/xx.json (and `python build.py`). Missing words stay English.
     Run `python tools/i18n_check.py xx` to list what a language still lacks. */
  const I18N = {}, I18N_RX = {}, I18N_SUG = {}, I18N_UNITS = {}, I18N_KEEP = {}, I18N_DIG = {}, I18N_LANGS = [['en', 'English', 'ltr']];
  try {
    const D = JSON.parse(document.getElementById('i18n-data').textContent);
    Object.keys(D).sort((x, y) => D[x].order - D[y].order).forEach(c => {
      I18N[c] = D[c].dict || {}; I18N_RX[c] = (D[c].rx || []).map(r => [new RegExp(r[0]), r[1]]);
      I18N_LANGS.push([c, D[c].name, D[c].dir || 'ltr']);
      I18N_UNITS[c] = (D[c].units || []).map(r => [new RegExp(r[0], 'g'), r[1]]);
      I18N_KEEP[c] = new RegExp(D[c].keep || '(?!)', 'g');
      if (D[c].digits) I18N_DIG[c] = D[c].digits;   // { map: "০১২…", label, hint }
      if (D[c].suggest) I18N_SUG[c] = D[c].suggest;   // { q, yes, no, also }: the first-run offer, worded in that language
    });
  } catch (e) { /* no translations: the app stays in English */ }
  const I18N_SKIP = '#reader, #page, #hl-list, #ch-list, .hl-list, .results, #results, #ob-q-hd, #ob-q-opts';   // book text and the placement-test questions are English on purpose
  const I18N_REC = new WeakMap();   // text node -> { o: original text, tr: text we put there }
  let i18nObs = null;
  const I18N_NODIGIT = '.tile-t, .tile-a, .gc-t, .card .t, .rm-t, .mini-txt strong, .track .tt, .col-tile strong, .vp-name, h1';   // book titles keep their own digits
  const I18N_CLOCK = /^-?\d{1,2}:\d{2}(?::\d{2})?$/;   // player times (0:00) keep Western digits
  function i18nTr(src, dict, noDig) {   // src -> translated text (or src itself when there is nothing for it)
    const key = src.trim();
    if (!key || !dict) return src;
    const lang = P.uiLang || 'en', has = Object.prototype.hasOwnProperty;
    let out = has.call(dict, key) ? dict[key] : null;
    if (out === null) { const rx = I18N_RX[lang]; if (rx) for (const [re, to] of rx) if (re.test(key)) { out = key.replace(re, to); break; } }
    const un = I18N_UNITS[lang], base = out === null ? key : out;
    if (un && un.length && /\d|\bago\b|\bleft\b/.test(base)) {
      let t = base; for (const [re, to] of un) t = t.replace(re, to);
      if (t !== base && (out !== null || !/[A-Za-z]/.test(t.replace(I18N_KEEP[lang], '')))) out = t;
    }
    const dg = I18N_DIG[lang];
    if (dg && P.uiDigits && !noDig) {
      const b = out === null ? key : out;
      if (/\d/.test(b) && !I18N_CLOCK.test(b) && !/[A-Za-z]/.test(b.replace(I18N_KEEP[lang], ''))) {   // only text that is fully in the language or only numbers: English sentences and titles keep their digits
        const d = b.replace(/([A-Za-z]?)(\d+)/g, (m, pre, n) => pre ? m : n.replace(/\d/g, c => dg.map[c]));   // A2, B1 and the like keep their digits
        if (d !== b) out = d;
      }
    }
    return out === null ? src : src.replace(key, () => out);
  }
  function i18nNode(n, dict) {
    if (!n.parentElement || n.parentElement.closest(I18N_SKIP)) return;
    const rec = I18N_REC.get(n);
    const src = rec && n.nodeValue === rec.tr ? rec.o : n.nodeValue;   // still our text: go back to the original. Changed by the app: it is new
    if (!src.trim()) return;
    const out = i18nTr(src, dict, !!n.parentElement.closest(I18N_NODIGIT));
    if (n.nodeValue !== out) n.nodeValue = out;
    if (out !== src) I18N_REC.set(n, { o: src, tr: out }); else I18N_REC.delete(n);
  }
  /* placeholder, aria-label and title are attributes, not text nodes, so they get their own pass (same rules, same restore) */
  const I18N_ATTRS = ['placeholder', 'aria-label', 'title'], I18N_AREC = new WeakMap();   // element -> { attr: { o, tr } }
  function i18nAttr(e, dict) {
    if (e.closest && e.closest(I18N_SKIP)) return;
    for (const a of I18N_ATTRS) {
      if (!e.hasAttribute(a)) continue;
      const cur = e.getAttribute(a), recs = I18N_AREC.get(e) || {}, rec = recs[a];
      const src = rec && cur === rec.tr ? rec.o : cur, out = i18nTr(src, dict);
      if (cur !== out) e.setAttribute(a, out);
      if (out !== src) { recs[a] = { o: src, tr: out }; I18N_AREC.set(e, recs); } else if (rec) { delete recs[a]; }
    }
  }
  function i18nAttrWalk(root, dict) {
    if (root.nodeType !== 1) return;
    i18nAttr(root, dict);
    root.querySelectorAll('[placeholder],[aria-label],[title]').forEach(e => i18nAttr(e, dict));
  }
  /* Bengali font: loaded only the first time Bengali is chosen (the service worker then keeps it for offline use).
     The CSS that puts it in the font stack and loosens line height is at the end of 90-reader-sheet.css (:root:lang(bn)). */
  function i18nFont(lang) {
    if (lang !== 'bn' || document.getElementById('wt-bn-font')) return;
    const l = document.createElement('link');
    l.id = 'wt-bn-font'; l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?family=Noto+Sans+Bengali:wght@400;500;600;700&display=swap';
    document.head.appendChild(l);
  }
  function i18nWalk(root, dict) {
    if (root.nodeType === 3) { i18nNode(root, dict); return; }
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT), list = [];
    while (w.nextNode()) list.push(w.currentNode);
    list.forEach(n => i18nNode(n, dict));
  }
  function i18nApply() {
    const lang = P.uiLang || 'en', meta = I18N_LANGS.find(x => x[0] === lang) || I18N_LANGS[0], dict = I18N[meta[0]] || null;
    document.documentElement.lang = meta[0]; document.documentElement.dir = meta[2];
    i18nFont(meta[0]);
    i18nWalk(document.body, dict); i18nAttrWalk(document.body, dict);
    if (i18nObs) { i18nObs.disconnect(); i18nObs = null; }
    if (dict) {
      i18nObs = new MutationObserver(ms => {
        for (const m of ms) {
          if (m.type === 'characterData') i18nWalk(m.target, dict);
          else if (m.type === 'attributes') i18nAttr(m.target, dict);
          else m.addedNodes.forEach(n => { if (n.nodeType === 3 || n.nodeType === 1) { i18nWalk(n, dict); i18nAttrWalk(n, dict); } });
        }
      });
      i18nObs.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: I18N_ATTRS });
    }
  }
  /* One place to change the app language: saves it, keeps the Settings list in step, and re-translates the page. */
  function setUiLang(code) {
    P.uiLang = code; savePrefs();
    const s = $('#in-uilang'); if (s) s.value = code;
    i18nApply(); i18nDigitsRow();
  }
  /* Settings > Reading > Language: a "native digits" switch under the language list, only for a language that has `digits` (Bengali). */
  function i18nDigitsRow() {
    const sel = $('#in-uilang'); if (!sel) return;
    const lang = P.uiLang || 'en', dg = I18N_DIG[lang]; let row = $('#row-uidigits');
    if (!dg) { if (row) row.hidden = true; return; }
    if (!row) {
      row = h('div', { class: 'row', id: 'row-uidigits' },
        h('label', { for: 'in-uidigits' }, h('h3', { style: 'margin:0' }, ''), h('small', { style: 'color:var(--muted)' }, '')),
        h('input', { id: 'in-uidigits', type: 'checkbox', onchange: e => { P.uiDigits = e.target.checked; savePrefs(); i18nApply(); } }));
      const host = sel.closest('.row'); if (host) host.after(row); else return;
    }
    row.hidden = false; row.lang = lang;
    $('h3', row).textContent = dg.label; $('small', row).textContent = dg.hint; $('#in-uidigits').checked = !!P.uiDigits;
  }
  /* First run only (no app language chosen yet): a language the browser prefers that has a `suggest` entry, or null.
     Looks at the whole preference list, because many people have English first and their own language second. */
  function i18nSuggest() {
    if (P.uiLang) return null;
    const list = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || 'en'];
    for (const l of list) { const c = String(l).toLowerCase().split('-')[0]; if (I18N_SUG[c]) return c; }
    return null;
  }
  function i18nInit() {
    const sel = $('#in-uilang'); if (!sel) return;
    sel.textContent = ''; I18N_LANGS.forEach(l => sel.append(h('option', { value: l[0] }, l[1])));
    sel.value = P.uiLang || 'en';
    i18nDigitsRow();
    sel.addEventListener('change', e => setUiLang(e.target.value));
    i18nApply();
  }
