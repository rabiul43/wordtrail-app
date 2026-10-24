  /* ---------- sound-core.js ----------
     Sound screen: the master switch and master volume (sndOn, sndMul, sndPaint, sndApplyAll). */
  /* ---------- the Sound screen: master switch, master volume and the glue between its controls ---------- */
  function sndOn() { return P.sndOn !== false; }
  function sndMul() { return sndOn() ? (P.sndVol == null ? 100 : Math.max(0, Math.min(100, P.sndVol))) / 100 : 0; }
  function sndPaint() {   // show the saved settings in the controls that live on the Sound screen
    const set = (id, fn) => { const e = $(id); if (e) fn(e); };
    set('#snd-on', e => { e.checked = sndOn(); }); set('#snd-vol', e => { e.value = String(P.sndVol == null ? 100 : P.sndVol); });
    set('#in-ambon', e => { e.checked = P.ambOn === true; });
    set('#in-muson', e => { e.checked = P.musOn === true; });
    set('#row-musvol', e => { e.hidden = P.musOn !== true; }); set('#row-musduck', e => { e.hidden = P.musOn !== true; }); set('#row-musdip', e => { e.hidden = P.musOn !== true; });
    $$('#seg-musdip button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === (MUS_DIP[P.musDip] ? P.musDip : 'normal'))));
    set('#mus-vol', e => { e.value = String(P.musVol == null ? 40 : P.musVol); }); set('#in-musduck', e => { e.checked = P.musDuck !== false; });
    set('#amb-duck', e => { e.checked = P.ambDuck !== false; }); set('#snd-duck', e => { e.checked = P.ambDuck !== false || P.musDuck !== false; });
    set('#in-scenelabel', e => { e.checked = P.sceneLabel === true; });
    set('#amb-open', e => { e.checked = P.openOn !== false; }); set('#amb-open-vol', e => { e.value = String(P.openVol == null ? 60 : P.openVol); });
    sndNowPaint(); sndTabsPaint(); musOffPaint();
  }
  function sndApplyAll() {   // after the master switch, the master volume or a preset: make every layer follow the saved settings
    ambMaster(); ambSync(); musBusApply(0.2);
    if (sndOn() && P.musOn === true) { musicAttach(); musicPlay(); } else musicPause();
    if (!sndOn()) { OSND.armed = ''; osStop(0.3); }
    sndPaint(); try { qkPaint(); } catch (e) { /* the player tile is optional */ } miniScenePaint(AMB.lbl ? 'Now: ' + AMB.lbl : null);
  }
