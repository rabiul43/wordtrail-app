  /* ---------- sound-core.js ----------
     Sound screen: the master switch and master volume (sndOn, sndMul, sndPaint, sndApplyAll). */
  /* ---------- the Sound screen: master switch, master volume and the glue between its controls ---------- */
  /* ---------- idle timers ----------
     The smart mix (250 ms), the sound balance (500 ms) and the scene label (1 s) used to tick all day, even with nothing playing.
     idleTimer() registers one; it runs only while audio plays and the page is visible, or while its own "also" check says someone
     is looking at what it feeds (the Sound sheet is open). Every change that matters calls idleTimersSync(): play, pause, seek,
     show/hide, the Sound sheet opening, the settings switches. Each timer runs once more when it stops, so what it paints is final.
     With "Save battery while playing and in the background" off (Settings > Advanced) they run all the time, as before. */
  const IDLE_T = [];
  function idleTimer(fn, ms, also) { const T = { fn, ms, also, id: 0 }; IDLE_T.push(T); return T; }
  function idleTimersSync(kick) {
    IDLE_T.forEach(T => {
      const want = P.idleWork === false || (!document.hidden && (!audio.paused || (T.also ? !!T.also() : false)));
      if (want && !T.id) { T.id = setInterval(T.fn, T.ms); try { T.fn(); } catch (e) { /* a help, never a reason to stop */ } }
      else if (!want && T.id) { clearInterval(T.id); T.id = 0; try { T.fn(); } catch (e) { /* as above */ } }
      else if (kick && want) { try { T.fn(); } catch (e) { /* as above */ } }
    });
  }
  ['play', 'pause', 'seeked', 'loadedmetadata'].forEach(ev => audio.addEventListener(ev, () => idleTimersSync(ev === 'seeked' || ev === 'loadedmetadata')));
  document.addEventListener('visibilitychange', () => idleTimersSync());
  { const sh = $('#sheet-amb'); if (sh) new MutationObserver(() => idleTimersSync(true)).observe(sh, { attributes: true, attributeFilter: ['hidden'] }); }
  function sndOn() { return P.sndOn !== false; }
  function sndMul() { return sndOn() ? (P.sndVol == null ? 100 : Math.max(0, Math.min(100, P.sndVol))) / 100 : 0; }
  function sndVolPaint() {   // master volume: filled track, % readout and a speaker icon that shows mute at 0
    const r = $('#snd-vol'); if (!r) return;
    const v = Math.max(0, Math.min(100, +r.value || 0));
    r.style.setProperty('--fill', v + '%');
    const o = $('#snd-vpct'); if (o) o.textContent = v + '%';
    const i = $('#snd-vic'); if (i) i.classList.toggle('mute', v === 0);
  }
  function musVolPaint() {   // music volume: same look as the master volume (filled track, % readout, mute icon)
    const r = $('#mus-vol'); if (!r) return;
    const v = Math.max(0, Math.min(100, +r.value || 0));
    r.style.setProperty('--fill', v + '%');
    const o = $('#mus-vpct'); if (o) o.textContent = v + '%';
    const i = $('#mus-vic'); if (i) i.classList.toggle('mute', v === 0);
  }
  /* ---------- Balance music and sounds ----------
     While Music and Background sounds are both on (and P.sndBalance is not off), the music bus sits at x0.6 (about -4.4 dB) and the
     ambient master at x0.85 (about -1.4 dB): the music gives way a lot, the room sounds a little, because ambient noise is what hides
     consonants. It is a multiplier inside musBusLevel() and ambGain(), which feed MUS.master and AMB.master. The narrator dip lives on
     other nodes (MUS.duck, AMB.duck and the carve filters), so the two never fight. The saved sliders are never changed. It follows the
     switches, not the playback state, so a pause and play does not make the music swell. The state is AMB.bal; it ramps slowly (tc 1.5 s). */
  const SND_BAL_MUS = 0.6, SND_BAL_AMB = 0.85;
  function sndBalMus() { return AMB.bal ? SND_BAL_MUS : (smxLive() ? SMX.lin.mus : 1); }   // functions, so they exist whenever the bus code asks. The fixed balance and the smart mix (smart-mix.js) never work together
  function sndBalAmb() { return AMB.bal ? SND_BAL_AMB : (smxLive() ? SMX.lin.amb : 1); }
  function sndBalWant() {
    if (smxLive()) return false;   // the smart mix measures and balances by itself
    if (P.sndBalance === false || !sndOn() || P.musOn !== true || P.ambOn !== true || musVol() <= 0 || ambVol() <= 0) return false;
    if (P.ambAuto !== false) return true;   // following the story: the scene sounds are expected
    const L = ambLive(); return AMB_SOUNDS.some(([k]) => L[k] > 0);
  }
  function sndBalSync(now) {   // called by a light timer and by the Sound screen's controls; does work only when the state flips
    const on = sndBalWant(); if (on === !!AMB.bal) return;
    AMB.bal = on;
    const tc = now === true ? 0.02 : 1.5; musBusApply(tc); ambMaster(tc);
    const n = $('#mus-bal-note'); if (n) n.hidden = !on;   // the line under the music slider says why it sits lower
  }
  function sndPaint() {   // show the saved settings in the controls that live on the Sound screen
    const set = (id, fn) => { const e = $(id); if (e) fn(e); };
    set('#snd-on', e => { e.checked = sndOn(); }); set('#snd-vol', e => { e.value = String(P.sndVol == null ? 100 : P.sndVol); sndVolPaint(); });
    set('#in-ambon', e => { e.checked = P.ambOn === true; });
    set('#in-muson', e => { e.checked = P.musOn === true; });
    $$('#seg-musdip button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === (MUS_DIP[P.musDip] ? P.musDip : 'normal'))));
    set('#mus-vol', e => { e.value = String(P.musVol == null ? 40 : P.musVol); musVolPaint(); }); set('#in-musduck', e => { e.checked = P.musDuck !== false; });
    set('#amb-duck', e => { e.checked = P.ambDuck !== false; }); set('#snd-duck', e => { e.checked = P.ambDuck !== false || P.musDuck !== false; });
    set('#snd-duckkids', e => { const on = P.ambDuck !== false || P.musDuck !== false; e.toggleAttribute('data-off', !on); e.querySelectorAll('input,button').forEach(x => { x.disabled = !on && x.id !== 'amb-duck' && x.id !== 'in-musduck' ? true : false; }); });
    set('#in-scenelabel', e => { e.checked = P.sceneLabel === true; });
    set('#snd-balance', e => { e.checked = P.sndBalance !== false; });
    try { smxPaint(); } catch (e) { /* optional */ }
    set('#amb-open', e => { e.checked = P.openOn !== false; }); set('#amb-open-vol', e => { e.value = String(P.openVol == null ? 60 : P.openVol); });
    set('#amb-dev', e => { e.hidden = P.sndDev !== true; });
    sndNowPaint(); sndTabsPaint(); musOffPaint();
    try { sndBalSync(); } catch (e) { /* the balance is a help */ }
  }
  function sndApplyAll() {   // after the master switch, the master volume or a preset: make every layer follow the saved settings
    ambMaster(); ambSync(); musBusApply(0.2);
    if (sndOn() && P.musOn === true) { musicAttach(); musicPlay(); } else musicPause();
    if (!sndOn()) { OSND.armed = ''; osStop(0.3); }
    sndPaint(); try { qkPaint(); } catch (e) { /* the player tile is optional */ } miniScenePaint(AMB.lbl ? 'Now: ' + AMB.lbl : null);
  }
