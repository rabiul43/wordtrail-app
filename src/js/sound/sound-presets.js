  /* ---------- sound-presets.js ----------
     Tap a sound's name in the mixer to hear it for a few seconds, even at zero (it plays alone when the book is paused,
     on top of the mix when the book is playing). Nothing in the saved mix changes. A preset sets the overall character
     (intensity, volume, scenes, story sounds) in one tap, and can be undone. */
  function ambHearPaint() { $$('#amb-rows .amb-hear').forEach(b => b.setAttribute('aria-pressed', AMB.aud && b.dataset.k === AMB.aud.k ? 'true' : 'false')); }
  function ambAudition(k) {
    if (!AMB_SOUNDS.some(x => x[0] === k)) return;
    if (AMB.aud) clearTimeout(AMB.aud.h);
    const lv = ambLevels()[k] || 0, a = AMB.aud = { k, lv: lv > 0 ? lv : 60, until: Date.now() + 4400, solo: audio.paused, h: 0 };
    AMB.nx = {}; AMB.nextThunder = 0; AMB.tickAt = 0; AMB.beatAt = 0;   // one-off sounds (thunder, a bell, an owl) are due at once
    ambHearPaint(); ambSync(); ambApply(0.25);
    a.h = setTimeout(() => { if (AMB.aud !== a) return; AMB.aud = null; ambHearPaint(); ambApply(0.5); ambSync(); }, 4500);
  }
  const AMB_PRESETS = [
    ['subtle', 'Quiet', 'Quiet scenes and soft music that follow the story. No story sounds and no opening sound.', { ambInt: 35, ambVol: 50, ambCues: false, ambTrans: false, ambAuto: true, ambDuck: true, ambSmart: true, musOn: true, musVol: 20, musDuck: true, openOn: false, openVol: 40 }],
    ['cinematic', 'Cinematic', 'Full scenes that follow the story, with story sounds, music and an opening sound.', { ambInt: 100, ambVol: 80, ambCues: true, ambTrans: true, ambAuto: true, ambDuck: true, ambSmart: true, musOn: true, musVol: 35, musDuck: true, openOn: true, openVol: 60 }],
    ['sleep', 'Sleep', 'Soft steady rain and brown noise. Scenes, story sounds, music and the opening sound are off, so nothing surprises you.', { ambInt: 30, ambVol: 40, ambCues: false, ambTrans: false, ambAuto: false, ambDuck: true, ambTod: true, musOn: false, openOn: false, scene: 'sleep' }]
  ];
  /* The preset row is Off, the three above, and Custom. Off is the master switch (settings are kept); Custom is what shows once
     anything has been moved by hand. */
  const AMB_OFF_PRESET = ['off', 'Off', 'Everything is silent. Your settings are kept; turn Sound back on to hear them again.'];
  const AMB_PRESET_KEYS = ['ambInt', 'ambVol', 'ambCues', 'ambTrans', 'ambAuto', 'ambDuck', 'ambSmart', 'ambTod', 'musOn', 'musVol', 'musDuck', 'musDip', 'openOn', 'openVol'];
  function ambBuildPresets() {
    const box = $('#amb-presets'); box.textContent = '';
    [AMB_OFF_PRESET].concat(AMB_PRESETS, [['custom', 'Custom']]).forEach(([k, n]) => box.append(h('button', { class: 'chip', type: 'button', 'data-k': k, 'aria-pressed': 'false' }, n)));
  }
  function ambPresetPaint() {
    const cur = !sndOn() ? 'off' : (AMB.preset || 'custom');   // Sound off always reads as Off; no preset reads as Custom
    $$('#amb-presets .chip').forEach(c => c.setAttribute('aria-pressed', c.dataset.k === cur ? 'true' : 'false'));
    const pr = [AMB_OFF_PRESET].concat(AMB_PRESETS).find(x => x[0] === AMB.preset), n = $('#amb-preset-note');
    n.hidden = !pr; if (pr) $('#amb-preset-txt').textContent = pr[2];
  }
  function ambPresetClear() { if (!AMB.preset) return; AMB.preset = ''; AMB.undo = null; ambPresetPaint(); }   // any change by hand ends the preset
  function ambRefresh() {   // show the saved settings in the controls
    const L = ambLevels(); AMB_SOUNDS.forEach(([k]) => { $('#amb-' + k).value = String(L[k] || 0); });
    $('#amb-vol').value = String(Math.round(ambVol() * 100)); $('#amb-int').value = String(P.ambInt == null ? 100 : P.ambInt);
    $('#amb-duck').checked = P.ambDuck !== false; $('#amb-smart').checked = P.ambSmart !== false; $('#amb-cues').checked = P.ambCues !== false; $('#amb-trans').checked = P.ambTrans !== false;
    $('#amb-auto').checked = P.ambAuto !== false; $('#amb-tod').checked = P.ambTod !== false;
    const c = $('#in-ambon'); if (c) c.checked = P.ambOn === true;
    ambGroups(); ambMaster(); ambAutoPaint(); sndPaint();
  }
  function ambPresetUse(k) {
    if (k === 'off') {   // the master switch: everything silent, nothing else changes
      AMB.undo = { v: {}, amb: P.amb, on: P.ambOn, snd: P.sndOn };
      P.sndOn = false; AMB.preset = 'off'; savePrefs(); sndApplyAll(); ambPresetPaint(); return;
    }
    const pr = AMB_PRESETS.find(x => x[0] === k); if (!pr) return;   // 'custom' only shows the state; it does nothing when tapped
    const set = pr[3], keys = Object.keys(set).filter(x => x !== 'scene');
    ambBookCheck();
    AMB.undo = { v: Object.fromEntries(keys.map(x => [x, P[x]])), amb: P.amb, on: P.ambOn, snd: P.sndOn };
    keys.forEach(x => { P[x] = set[x]; });
    if (set.scene) { const sc = AMB_SCENES.find(x => x.k === set.scene); P.amb = ambFull(sc ? sc.L : { rain: 45, brown: 25 }); }
    P.ambOn = true; P.sndOn = true; AMB.auto = null; AMB.autoId = null; AMB.preset = k;
    if (set.scene) ambSaveMix(); else savePrefs();
    ambRefresh(); ambApply(0.9); sndApplyAll(); ambMatchScene(); ambPresetPaint();
  }
  function ambPresetUndo() {
    const u = AMB.undo; if (!u) return;
    Object.keys(u.v).forEach(x => { P[x] = u.v[x]; }); P.amb = u.amb; P.ambOn = u.on; P.sndOn = u.snd;
    AMB.auto = null; AMB.autoId = null; AMB.preset = ''; AMB.undo = null;
    ambSaveMix(); ambRefresh(); ambApply(0.9); sndApplyAll(); ambMatchScene(); ambPresetPaint();
  }
