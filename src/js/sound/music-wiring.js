  /* ---------- music-wiring.js ----------
     Music: keeping the engine healthy, the Music switch, the first-time hint, quick controls and musicInit. */
  /* ---------- Screen lock, calls and other apps ----------
     When the screen locks, a call comes in or another app takes the sound, the shared AudioContext can go to 'suspended' or
     (Safari) 'interrupted' while the narrator is still wanted. musCtxHeal wakes it again, but only while music is wanted:
     music on, Sound on, the narrator really playing and a clip sounding or loading. With the narrator paused it does nothing,
     so it never starts music or keeps the engine awake for nothing. It runs on the context's own state change, when the page
     is shown again, when the narrator reports it is playing, and on play. If the browser refuses (it wants a tap first),
     ONE tap or key listener waits and tries again; it removes itself on the first use. */
  function musWanted() { return !!(P.musOn === true && sndOn() && MUS.on && MUS.ctx && S.book && musNarrating() && (MUS.live || MUS.playing)); }
  function musCtxHeal() {
    try {
      if (!musWanted()) return;
      const ctx = MUS.ctx, st = ctx.state;
      if (st === 'running' || st === 'closed') return;
      const p = ctx.resume();   // 'suspended', or Safari's 'interrupted'
      if (p && p.then) p.then(() => { if (ctx.state !== 'running' && musWanted()) musGestureArm(); }, () => { if (musWanted()) musGestureArm(); });
    } catch (e) { /* a help only: never break playback */ }
  }
  function musGestureArm() {
    if (MUS.gest) return;
    MUS.gest = true;
    const evs = ['pointerdown', 'touchend', 'keydown'];
    const go = () => { MUS.gest = false; evs.forEach(ev => document.removeEventListener(ev, go, true)); musCtxHeal(); };
    evs.forEach(ev => document.addEventListener(ev, go, true));
  }
  function musHealInit() {
    document.addEventListener('visibilitychange', () => { if (!document.hidden) musCtxHeal(); });
    window.addEventListener('pageshow', musCtxHeal);
    audio.addEventListener('playing', musCtxHeal);
  }

  /* ---------- Quick controls tile, dip choice and the one-time hint ---------- */
  function musOnSet(on) {   // the Music tile's switch: the same effect as the switch in the Music panel
    if (on && !sndOn()) { P.sndOn = true; sndApplyAll(); }
    P.musOn = on; P.musHint = true; const c = $('#in-muson'); if (c) c.checked = on;
    savePrefs(); sndPaint();
    if (on) { musicAttach(); musicPlay(); } else musicPause();
    try { qkPaint(); } catch (e) { /* the tile is optional */ }
  }
  const MUS_HINT = { t: 0 };
  function musHintMaybe() {   // once ever: a small note that music exists. Never while a book is not playing, Sound is off or another card is showing.
    clearTimeout(MUS_HINT.t);
    if (P.musHint === true || !S.book) return;
    if (P.musOn === true) { P.musHint = true; savePrefs(); return; }   // already found it
    if (!sndOn()) return;
    MUS_HINT.t = setTimeout(() => {
      try {
        const g = $('#gesture-hint');
        if (P.musHint === true || P.musOn === true || !sndOn() || !S.book || audio.paused || el.player.hidden) return;
        if ((g && !g.hidden) || !el.toast.hidden) return;   // another hint is up: try again at the next play
        P.musHint = true; savePrefs();
      } catch (e) { /* a hint is never worth an error */ }
    }, 25000);
  }
  function musQuickInit() {
    const t = $('#qk-t-mus'); if (!t) return;
    t.addEventListener('click', () => { buzz('tick'); if ($('#qk-o-mus').hidden && P.musOn !== true) musOnSet(true); qkOpt('mus'); });   // first tap turns music on and opens its panel, like Sound
    $('#qk-mus-on').addEventListener('change', e => musOnSet(e.target.checked));
    $('#qk-mus-vol').addEventListener('input', e => { musicVolChange(+e.target.value); const v = $('#mus-vol'); if (v) v.value = String(P.musVol); try { qkPaint(); } catch (err) { /* optional */ } });
    $('#qk-mus-mix').addEventListener('click', () => { closeSheets(); ambOpen(); try { sndTabSelect('mus'); } catch (e) { /* the sheet still opens */ } });
    $$('#seg-musdip button').forEach(b => b.addEventListener('click', () => {
      P.musDip = b.dataset.v; savePrefs(); MUS.duckS = '';   // re-apply the dip at once
      $$('#seg-musdip button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    }));
    audio.addEventListener('playing', musHintMaybe);
    audio.addEventListener('pause', () => clearTimeout(MUS_HINT.t));
  }

  /* Called once at startup to pre-fetch the manifest in the background. */
  async function musicInit() {
    try { musOffInit(); } catch (e) { console.warn('offline music', e); }
    try { musHealInit(); } catch (e) { console.warn('music wake-up', e); }
    try { musQuickInit(); } catch (e) { console.warn('music tile', e); }
    if (!MUS.manifest) musFetchManifest();   // fire and forget; the bus is built on the first play
  }

