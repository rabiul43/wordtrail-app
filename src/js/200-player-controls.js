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
    { const td = $('#b-timing'); if (td) { td.dataset.state = el.syncbar.dataset.state; td.setAttribute('aria-label', el.sstate.textContent); td.title = el.sstate.textContent; } }
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
  }

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
  }
  function setSleep(v) {
    if (v !== 0 && S.book) trAdd({ sec: S.sec, time: nowT(), why: 'sleep' });
    clearTimeout(S.sleepTimer); cancelFade(); S.sleep = v;
    el.sleep.textContent = v === 0 ? 'Sleep' : v === 'chapter' ? 'Track end' : v + ' min';
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
  const I18N_LANGS = [['en', 'English', 'ltr'], ['ar', 'العربية', 'rtl'], ['ur', 'اردو', 'rtl'], ['es', 'Español', 'ltr'], ['fr', 'Français', 'ltr']];
  const I18N = {"ar": {"Library": "المكتبة", "Collections": "المجموعات", "Shelf": "الرف", "Account": "الحساب", "More": "المزيد", "Settings": "الإعدادات", "Tracks": "المقاطع", "Next up": "التالي", "Text and timing": "النص والتوقيت", "Words": "الكلمات", "Cinematic sound": "صوت سينمائي", "Characters": "الشخصيات", "Highlights and notes": "التمييزات والملاحظات", "Shadow reading": "القراءة بالمحاكاة", "Quick quiz": "اختبار سريع", "Focus page": "وضع التركيز", "How to use": "طريقة الاستخدام", "Playback": "التشغيل", "Reading": "القراءة", "Audio": "الصوت", "Timing": "التوقيت", "Storage": "التخزين", "Theme": "المظهر", "Text size": "حجم النص", "Line spacing": "تباعد الأسطر", "Reading font": "خط القراءة", "Line focus": "تركيز السطر", "Auto": "تلقائي", "Light": "فاتح", "Dark": "داكن", "Sepia": "سيبيا", "Language": "اللغة", "Skip intro": "تخطي المقدمة", "Offline storage": "التخزين دون اتصال", "Smart rewind": "إرجاع ذكي", "Download ahead": "التنزيل المسبق"}, "ur": {"Library": "لائبریری", "Collections": "مجموعے", "Shelf": "شیلف", "Account": "اکاؤنٹ", "More": "مزید", "Settings": "ترتیبات", "Tracks": "ٹریکس", "Next up": "اگلا", "Text and timing": "متن اور وقت", "Words": "الفاظ", "Cinematic sound": "سنیمائی آواز", "Characters": "کردار", "Highlights and notes": "نمایاں حصے اور نوٹس", "Shadow reading": "شیڈو ریڈنگ", "Quick quiz": "فوری کوئز", "Focus page": "فوکس صفحہ", "How to use": "استعمال کا طریقہ", "Playback": "پلے بیک", "Reading": "مطالعہ", "Audio": "آڈیو", "Timing": "وقت بندی", "Storage": "اسٹوریج", "Theme": "تھیم", "Text size": "متن کا سائز", "Line spacing": "سطروں کا فاصلہ", "Reading font": "مطالعے کا فونٹ", "Line focus": "سطر پر توجہ", "Auto": "خودکار", "Light": "روشن", "Dark": "گہرا", "Sepia": "سیپیا", "Language": "زبان", "Skip intro": "تعارف چھوڑیں", "Offline storage": "آف لائن اسٹوریج", "Smart rewind": "سمارٹ ریوائنڈ", "Download ahead": "پیشگی ڈاؤن لوڈ"}, "es": {"Library": "Biblioteca", "Collections": "Colecciones", "Shelf": "Estantería", "Account": "Cuenta", "More": "Más", "Settings": "Ajustes", "Tracks": "Pistas", "Next up": "A continuación", "Text and timing": "Texto y sincronía", "Words": "Palabras", "Cinematic sound": "Sonido cinematográfico", "Characters": "Personajes", "Highlights and notes": "Subrayados y notas", "Shadow reading": "Lectura en sombra", "Quick quiz": "Cuestionario rápido", "Focus page": "Página de enfoque", "How to use": "Cómo usar", "Playback": "Reproducción", "Reading": "Lectura", "Audio": "Audio", "Timing": "Sincronía", "Storage": "Almacenamiento", "Theme": "Tema", "Text size": "Tamaño del texto", "Line spacing": "Interlineado", "Reading font": "Fuente de lectura", "Line focus": "Enfoque de línea", "Auto": "Auto", "Light": "Claro", "Dark": "Oscuro", "Sepia": "Sepia", "Language": "Idioma", "Skip intro": "Saltar introducción", "Offline storage": "Almacenamiento sin conexión", "Smart rewind": "Retroceso inteligente", "Download ahead": "Descarga anticipada"}, "fr": {"Library": "Bibliothèque", "Collections": "Collections", "Shelf": "Étagère", "Account": "Compte", "More": "Plus", "Settings": "Réglages", "Tracks": "Pistes", "Next up": "À suivre", "Text and timing": "Texte et synchro", "Words": "Mots", "Cinematic sound": "Ambiance cinéma", "Characters": "Personnages", "Highlights and notes": "Surlignages et notes", "Shadow reading": "Lecture en écho", "Quick quiz": "Quiz rapide", "Focus page": "Page de concentration", "How to use": "Mode d'emploi", "Playback": "Lecture audio", "Reading": "Lecture", "Audio": "Audio", "Timing": "Synchro", "Storage": "Stockage", "Theme": "Thème", "Text size": "Taille du texte", "Line spacing": "Interligne", "Reading font": "Police de lecture", "Line focus": "Focus de ligne", "Auto": "Auto", "Light": "Clair", "Dark": "Sombre", "Sepia": "Sépia", "Language": "Langue", "Skip intro": "Passer l'intro", "Offline storage": "Stockage hors ligne", "Smart rewind": "Retour intelligent", "Download ahead": "Téléchargement anticipé"}};
  Object.assign(I18N, {"tr": {"Library": "Kütüphane", "Collections": "Koleksiyonlar", "Shelf": "Raf", "Account": "Hesap", "More": "Daha fazla", "Settings": "Ayarlar", "Tracks": "Parçalar", "Next up": "Sıradaki", "Text and timing": "Metin ve zamanlama", "Words": "Kelimeler", "Cinematic sound": "Sinematik ses", "Characters": "Karakterler", "Highlights and notes": "Vurgular ve notlar", "Shadow reading": "Gölge okuma", "Quick quiz": "Hızlı sınav", "Focus page": "Odak sayfası", "How to use": "Nasıl kullanılır", "Playback": "Oynatma", "Reading": "Okuma", "Audio": "Ses", "Timing": "Zamanlama", "Storage": "Depolama", "Theme": "Tema", "Text size": "Metin boyutu", "Line spacing": "Satır aralığı", "Reading font": "Okuma yazı tipi", "Line focus": "Satır odağı", "Auto": "Otomatik", "Light": "Açık", "Dark": "Koyu", "Sepia": "Sepya", "Language": "Dil", "Skip intro": "Girişi atla", "Offline storage": "Çevrimdışı depolama", "Smart rewind": "Akıllı geri sarma", "Download ahead": "Önceden indirme"}, "bn": {"Library": "লাইব্রেরি", "Collections": "সংগ্রহ", "Shelf": "তাক", "Account": "অ্যাকাউন্ট", "More": "আরও", "Settings": "সেটিংস", "Tracks": "ট্র্যাক", "Next up": "এরপর", "Text and timing": "লেখা ও সময়", "Words": "শব্দ", "Cinematic sound": "সিনেমাটিক শব্দ", "Characters": "চরিত্র", "Highlights and notes": "হাইলাইট ও নোট", "Shadow reading": "শ্যাডো রিডিং", "Quick quiz": "দ্রুত কুইজ", "Focus page": "ফোকাস পাতা", "How to use": "কীভাবে ব্যবহার করবেন", "Playback": "প্লেব্যাক", "Reading": "পড়া", "Audio": "অডিও", "Timing": "সময় নির্ধারণ", "Storage": "স্টোরেজ", "Theme": "থিম", "Text size": "লেখার আকার", "Line spacing": "লাইনের ব্যবধান", "Reading font": "পড়ার ফন্ট", "Line focus": "লাইন ফোকাস", "Auto": "স্বয়ংক্রিয়", "Light": "হালকা", "Dark": "গাঢ়", "Sepia": "সেপিয়া", "Language": "ভাষা", "Skip intro": "ভূমিকা এড়িয়ে যান", "Offline storage": "অফলাইন স্টোরেজ", "Smart rewind": "স্মার্ট রিওয়াইন্ড", "Download ahead": "আগাম ডাউনলোড"}, "de": {"Library": "Bibliothek", "Collections": "Sammlungen", "Shelf": "Regal", "Account": "Konto", "More": "Mehr", "Settings": "Einstellungen", "Tracks": "Titel", "Next up": "Als Nächstes", "Text and timing": "Text und Timing", "Words": "Wörter", "Cinematic sound": "Kino-Sound", "Characters": "Figuren", "Highlights and notes": "Markierungen und Notizen", "Shadow reading": "Shadow-Reading", "Quick quiz": "Kurzquiz", "Focus page": "Fokusseite", "How to use": "Anleitung", "Playback": "Wiedergabe", "Reading": "Lesen", "Audio": "Audio", "Timing": "Timing", "Storage": "Speicher", "Theme": "Design", "Text size": "Textgröße", "Line spacing": "Zeilenabstand", "Reading font": "Leseschrift", "Line focus": "Zeilenfokus", "Auto": "Auto", "Light": "Hell", "Dark": "Dunkel", "Sepia": "Sepia", "Language": "Sprache", "Skip intro": "Intro überspringen", "Offline storage": "Offline-Speicher", "Smart rewind": "Intelligentes Zurückspulen", "Download ahead": "Vorab laden"}, "th": {"Library": "ห้องสมุด", "Collections": "คอลเลกชัน", "Shelf": "ชั้นหนังสือ", "Account": "บัญชี", "More": "เพิ่มเติม", "Settings": "การตั้งค่า", "Tracks": "แทร็ก", "Next up": "ถัดไป", "Text and timing": "ข้อความและเวลา", "Words": "คำศัพท์", "Cinematic sound": "เสียงแบบภาพยนตร์", "Characters": "ตัวละคร", "Highlights and notes": "ไฮไลต์และบันทึก", "Shadow reading": "การอ่านตามเสียง", "Quick quiz": "แบบทดสอบด่วน", "Focus page": "หน้าโฟกัส", "How to use": "วิธีใช้", "Playback": "การเล่น", "Reading": "การอ่าน", "Audio": "เสียง", "Timing": "จังหวะเวลา", "Storage": "พื้นที่จัดเก็บ", "Theme": "ธีม", "Text size": "ขนาดตัวอักษร", "Line spacing": "ระยะห่างบรรทัด", "Reading font": "ฟอนต์สำหรับอ่าน", "Line focus": "โฟกัสบรรทัด", "Auto": "อัตโนมัติ", "Light": "สว่าง", "Dark": "มืด", "Sepia": "ซีเปีย", "Language": "ภาษา", "Skip intro": "ข้ามช่วงเปิด", "Offline storage": "พื้นที่จัดเก็บออฟไลน์", "Smart rewind": "ย้อนกลับอัจฉริยะ", "Download ahead": "ดาวน์โหลดล่วงหน้า"}, "zh": {"Library": "图书馆", "Collections": "合集", "Shelf": "书架", "Account": "账户", "More": "更多", "Settings": "设置", "Tracks": "音轨", "Next up": "接下来", "Text and timing": "文本与同步", "Words": "单词", "Cinematic sound": "电影感音效", "Characters": "人物", "Highlights and notes": "标注与笔记", "Shadow reading": "跟读", "Quick quiz": "快速测验", "Focus page": "专注页面", "How to use": "使用方法", "Playback": "播放", "Reading": "阅读", "Audio": "音频", "Timing": "同步", "Storage": "存储", "Theme": "主题", "Text size": "文字大小", "Line spacing": "行距", "Reading font": "阅读字体", "Line focus": "行聚焦", "Auto": "自动", "Light": "浅色", "Dark": "深色", "Sepia": "护眼棕", "Language": "语言", "Skip intro": "跳过片头", "Offline storage": "离线存储", "Smart rewind": "智能回退", "Download ahead": "提前下载"}});
  I18N_LANGS.push(['tr', 'Türkçe', 'ltr'], ['bn', 'বাংলা', 'ltr'], ['de', 'Deutsch', 'ltr'], ['th', 'ไทย', 'ltr'], ['zh', '中文', 'ltr']);
  const I18N_SKIP = '#reader, #page, #hl-list, #ch-list, .hl-list, .results, #results';
  const I18N_REC = new WeakMap();   // text node -> { o: original text, tr: text we put there }
  let i18nObs = null;
  function i18nNode(n, dict) {
    if (!n.parentElement || n.parentElement.closest(I18N_SKIP)) return;
    const rec = I18N_REC.get(n);
    const src = rec && n.nodeValue === rec.tr ? rec.o : n.nodeValue;   // still our text: go back to the original. Changed by the app: it is new
    const key = src.trim();
    if (!key) return;
    const out = dict && dict[key] ? src.replace(key, dict[key]) : src;
    if (n.nodeValue !== out) n.nodeValue = out;
    if (out !== src) I18N_REC.set(n, { o: src, tr: out }); else I18N_REC.delete(n);
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
    i18nWalk(document.body, dict);
    if (i18nObs) { i18nObs.disconnect(); i18nObs = null; }
    if (dict) {
      i18nObs = new MutationObserver(ms => {
        for (const m of ms) {
          if (m.type === 'characterData') i18nWalk(m.target, dict);
          else m.addedNodes.forEach(n => { if (n.nodeType === 3 || n.nodeType === 1) i18nWalk(n, dict); });
        }
      });
      i18nObs.observe(document.body, { childList: true, subtree: true, characterData: true });
    }
  }
  function i18nInit() {
    const sel = $('#in-uilang'); if (!sel) return;
    sel.textContent = ''; I18N_LANGS.forEach(l => sel.append(h('option', { value: l[0] }, l[1])));
    sel.value = P.uiLang || 'en';
    sel.addEventListener('change', e => { P.uiLang = e.target.value; savePrefs(); i18nApply(); });
    i18nApply();
  }
