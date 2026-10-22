  /* ---------- hear a sound; quick presets ----------
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
    ['subtle', 'Subtle', 'Quiet beds that follow the story. No story sounds, no thunder or creaks.', { ambInt: 35, ambVol: 50, ambCues: false, ambTrans: false, ambAuto: true, ambDuck: true, ambSmart: true }],
    ['cinematic', 'Cinematic', 'Full scenes that follow the story, with story sounds and all the detail.', { ambInt: 100, ambVol: 80, ambCues: true, ambTrans: true, ambAuto: true, ambDuck: true, ambSmart: true }],
    ['sleep', 'Sleep', 'Soft steady rain and brown noise. Scenes and story sounds are off, so nothing surprises you.', { ambInt: 30, ambVol: 40, ambCues: false, ambTrans: false, ambAuto: false, ambDuck: true, ambTod: true, scene: 'sleep' }]
  ];
  function ambBuildPresets() {
    const box = $('#amb-presets'); box.textContent = '';
    AMB_PRESETS.forEach(([k, n]) => box.append(h('button', { class: 'chip', type: 'button', 'data-k': k, 'aria-pressed': 'false' }, n)));
  }
  function ambPresetPaint() {
    $$('#amb-presets .chip').forEach(c => c.setAttribute('aria-pressed', c.dataset.k === AMB.preset ? 'true' : 'false'));
    const pr = AMB_PRESETS.find(x => x[0] === AMB.preset), n = $('#amb-preset-note');
    n.hidden = !pr; if (pr) $('#amb-preset-txt').textContent = pr[2];
  }
  function ambPresetClear() { if (!AMB.preset) return; AMB.preset = ''; AMB.undo = null; ambPresetPaint(); }   // any change by hand ends the preset
  function ambRefresh() {   // show the saved settings in the controls
    const L = ambLevels(); AMB_SOUNDS.forEach(([k]) => { $('#amb-' + k).value = String(L[k] || 0); });
    $('#amb-vol').value = String(Math.round(ambVol() * 100)); $('#amb-int').value = String(P.ambInt == null ? 100 : P.ambInt);
    $('#amb-duck').checked = P.ambDuck !== false; $('#amb-smart').checked = P.ambSmart !== false; $('#amb-cues').checked = P.ambCues !== false; $('#amb-trans').checked = P.ambTrans !== false;
    $('#amb-auto').checked = P.ambAuto !== false; $('#amb-tod').checked = P.ambTod !== false;
    const c = $('#in-ambon'); if (c) c.checked = P.ambOn === true;
    ambGroups(); ambMaster(); ambAutoPaint();
  }
  function ambPresetUse(k) {
    const pr = AMB_PRESETS.find(x => x[0] === k); if (!pr) return;
    const set = pr[3], keys = Object.keys(set).filter(x => x !== 'scene');
    ambBookCheck();
    AMB.undo = { v: Object.fromEntries(keys.map(x => [x, P[x]])), amb: P.amb, on: P.ambOn };
    keys.forEach(x => { P[x] = set[x]; });
    if (set.scene) { const sc = AMB_SCENES.find(x => x.k === set.scene); P.amb = ambFull(sc ? sc.L : { rain: 45, brown: 25 }); }
    P.ambOn = true; AMB.auto = null; AMB.autoId = null; AMB.preset = k;
    if (set.scene) ambSaveMix(); else savePrefs();
    ambRefresh(); ambApply(0.9); ambSync(); ambMatchScene(); ambPresetPaint();
  }
  function ambPresetUndo() {
    const u = AMB.undo; if (!u) return;
    Object.keys(u.v).forEach(x => { P[x] = u.v[x]; }); P.amb = u.amb; P.ambOn = u.on;
    AMB.auto = null; AMB.autoId = null; AMB.preset = ''; AMB.undo = null;
    ambSaveMix(); ambRefresh(); ambApply(0.9); ambSync(); ambMatchScene(); ambPresetPaint();
  }
  function ambHearIcon() {
    const ns = 'http://www.w3.org/2000/svg', s = document.createElementNS(ns, 'svg'), u = document.createElementNS(ns, 'use');
    s.setAttribute('class', 'ic'); s.setAttribute('aria-hidden', 'true'); u.setAttribute('href', '#i-play'); s.append(u); return s;
  }
  function ambPlaying() {   // the book is really being heard: not just asked to play. Loading, stalled, failed or finished audio is not playing.
    if (!S.book || audio.paused || audio.ended || audio.error) return false;
    if (audio.seeking) return AMB.on;   // a seek is a short gap: keep the sound as it is
    return !S.loadingAudio && audio.readyState > 2;
  }
  function ambSync() {
    ambBookCheck();
    const L = ambLive(), any = AMB_SOUNDS.some(([k]) => L[k] > 0);
    const want = (any || P.ambAuto !== false || (P.ambCues !== false && P.calm !== true)) && (AMB.preview || (P.ambOn === true && ambPlaying()));
    clearTimeout(AMB.timer);
    if (want) {
      if (!ambBuild()) return;
      AMB.ctx.resume().catch(() => {}); ambTod(true); ambApply();
      AMB.slow = false; AMB.master.gain.setTargetAtTime(ambVol(), AMB.ctx.currentTime, 0.8);
      AMB.on = true; if (!AMB.clinkIv) AMB.clinkIv = setInterval(ambClink, 4500);
      if (!AMB.duckIv) AMB.duckIv = setInterval(ambDuckTick, 60);
      if (!AMB.evIv) { AMB.evIv = setInterval(ambEvents, 400); AMB.nextThunder = Date.now() + 4000 + Math.random() * 8000; }
    } else if (AMB.built && AMB.on) {
      const tc = AMB.slow ? 3 : 0.6; AMB.slow = false;   // a sleep timer fades the sounds out slowly, after the voice is gone
      AMB.master.gain.setTargetAtTime(0, AMB.ctx.currentTime, tc);
      AMB.on = false; clearInterval(AMB.duckIv); AMB.duckIv = 0; AMB.duckS = ''; ambDuckSet('o'); clearInterval(AMB.clinkIv); AMB.clinkIv = 0; clearInterval(AMB.evIv); AMB.evIv = 0;
      audioSuspendSoon(tc * 3500 + 500, 'timer');   // stop the engine when silent (and no music is playing), to save battery
    }
  }
  function ambOpen() {
    ambBookCheck(); const L = ambLevels();
    AMB_SOUNDS.forEach(([k]) => { $('#amb-' + k).value = String(L[k] || 0); });
    ambGroups(); $('#amb-vol').value = String(Math.round(ambVol() * 100)); $('#amb-duck').checked = P.ambDuck !== false; $('#amb-smart').checked = P.ambSmart !== false; $('#amb-cues').checked = P.ambCues !== false; $('#amb-trans').checked = P.ambTrans !== false; Object.keys(CUE_CATS).forEach(c => { $('#amb-cat-' + c).checked = (P.ambCats || {})[c] !== false; }); ambCustomPaint(); ambShiftLabel(); $('#amb-int').value = String(P.ambInt == null ? 100 : P.ambInt); $('#amb-tod').checked = P.ambTod !== false;
    $('#amb-auto').checked = P.ambAuto !== false; ambAutoPaint(); AMB.preset = ''; AMB.undo = null; ambPresetPaint();
    ambPaintScenes(); ambMatchScene();
    AMB.preview = true; openSheet('sheet-amb'); ambSync();
  }
  function ambBuildRows() {   // the sliders are generated from AMB_SOUNDS, in collapsible groups
    const box = $('#amb-rows'); box.textContent = '';
    Object.keys(AMB_GROUPS).forEach(gk => {
      const d = h('details', { class: 'amb-grp', 'data-g': gk }, h('summary', {}, h('span', {}, AMB_GROUPS[gk]), h('small', {}, '')));
      AMB_SOUNDS.filter(x => x[2] === gk).forEach(([k, n]) => { const hb = h('button', { class: 'amb-hear', type: 'button', 'data-k': k, 'aria-pressed': 'false', 'aria-label': 'Hear ' + n + ' for a few seconds' }, ambHearIcon(), h('span', {}, n)); d.append(h('div', { class: 'amb-row' }, hb, h('input', { id: 'amb-' + k, type: 'range', min: '0', max: '100', step: '1', 'aria-label': n + ' volume' }))); });
      box.append(d);
    });
  }
  function ambGroups() {   // open a group when something in it is on; show how many are
    $$('#amb-rows .amb-grp').forEach(d => {
      const on = $$('input', d).filter(i => +i.value > 0).length;
      d.querySelector('summary small').textContent = on ? on + ' on' : '';
      if (on || d.dataset.g === 'nature') d.open = true;
    });
  }
  function ambShiftLabel() { const x = P.ambCueShift || 0; $('#amb-cshift-l').textContent = 'Sound timing: ' + (x > 0 ? '+' : x < 0 ? '\u2212' : '') + Math.abs(x).toFixed(1) + ' s'; $('#amb-cshift').value = String(Math.round(x * 10)); }
  function ambCustomPaint() {   // the "My own words" list
    const ul = $('#amb-cw-list'); if (!ul) return;
    ul.textContent = '';
    (Array.isArray(P.ambCueCustom) ? P.ambCueCustom : []).forEach((c, i) => {
      const li = document.createElement('li'), sp = document.createElement('span'), bt = document.createElement('button');
      sp.textContent = c.w + ' \u2192 ' + (CUE_NAMES[c.k] || c.k);
      bt.type = 'button'; bt.className = 'btn small ghost'; bt.textContent = 'Remove'; bt.setAttribute('aria-label', 'Remove ' + c.w);
      bt.addEventListener('click', () => { P.ambCueCustom = P.ambCueCustom.filter((x, j) => j !== i); savePrefs(); ambCustomPaint(); });
      li.append(sp, bt); ul.append(li);
    });
  }
  function ambCustomInit() {
    const sel = $('#amb-cw-k'), msg = $('#amb-cw-msg'), note = msg.textContent;
    Object.keys(CUE_SOUND).sort((x, y) => (CUE_NAMES[x] || x).localeCompare(CUE_NAMES[y] || y)).forEach(k => { const o = document.createElement('option'); o.value = k; o.textContent = CUE_NAMES[k] || k; sel.append(o); });
    const add = () => {
      const inp = $('#amb-cw-w'), w = inp.value.trim().toLowerCase().replace(/\u2019/g, "'"), k = sel.value, list = Array.isArray(P.ambCueCustom) ? P.ambCueCustom : [];
      if (!/^[a-z0-9]+(?:'[a-z]+)?$/.test(w)) { msg.textContent = 'Type one word, using the letters a to z or digits.'; return; }
      if (!CUE_SOUND[k]) return;
      if (list.some(c => c.w === w)) { msg.textContent = '"' + w + '" is already in the list.'; return; }
      if (list.length >= 30) { msg.textContent = 'The list is full (30 words). Remove one first.'; return; }
      P.ambCueCustom = list.concat([{ w, k }]); savePrefs(); inp.value = ''; msg.textContent = note; ambCustomPaint();
    };
    $('#amb-cw-add').addEventListener('click', add);
    $('#amb-cw-w').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); add(); } });
    Object.keys(CUE_CATS).forEach(c => $('#amb-cat-' + c).addEventListener('change', e => { P.ambCats = Object.assign({}, P.ambCats, { [c]: e.target.checked }); savePrefs(); }));
  }
  function ambInit() {
    ambCustomInit(); try { sctInit(); } catch (e) { console.warn('scene test', e); }
    $('#amb-cshift').addEventListener('input', e => { P.ambCueShift = +e.target.value / 10; savePrefs(); ambShiftLabel(); });   // minus: sounds earlier, plus: later
    ambBuildRows(); ambBuildPresets(); ambRecInit(); try { osInit(); } catch (e) { console.warn('opening sound', e); } setTimeout(ambLoadRemote, 5000); setTimeout(ambRecManifest, 6000);
    $('#amb-rows').addEventListener('click', e => { const b = e.target.closest('.amb-hear'); if (b) ambAudition(b.dataset.k); });
    $('#amb-presets').addEventListener('click', e => { const c = e.target.closest('.chip'); if (c) ambPresetUse(c.dataset.k); });
    $('#amb-preset-undo').addEventListener('click', ambPresetUndo);
    ['input', 'change'].forEach(ev => $('#sheet-amb').addEventListener(ev, ambPresetClear));   // a slider or switch moved by hand ends the preset
    $('#amb-scenes').addEventListener('click', ambPresetClear); $('#amb-sug-go').addEventListener('click', ambPresetClear);
    document.addEventListener('visibilitychange', () => { if (document.hidden && AMB.preview) { AMB.preview = false; ambSync(); } });   // a mixer left open with the screen off stops playing
    ['play', 'playing', 'pause', 'ended', 'waiting', 'stalled', 'error', 'emptied', 'abort', 'canplay', 'loadstart', 'loadedmetadata', 'seeked'].forEach(ev => audio.addEventListener(ev, ambSync));   // the sound follows what is really heard: it waits for the audio to start, and stops if it stalls or fails
    audio.addEventListener('play',  () => { musicAttach(); musicPlay(); });
    audio.addEventListener('pause', () => musicPause());
    audio.addEventListener('ended', () => musicPause());
    audio.addEventListener('playing', () => { if (S.curId != null && S.curId >= 0) ambStory(S.curId); });   // after a jump or search the sentence is already current, so setCurrent will not run for it
    ['pause', 'seeking', 'ended'].forEach(ev => audio.addEventListener(ev, () => { ambCueClear(); ambSpaceReset(); }));
    AMB_SOUNDS.forEach(([k]) => $('#amb-' + k).addEventListener('input', e => {
      ambBookCheck(); ambAutoHold(); P.amb = Object.assign(ambLevels(), { [k]: +e.target.value });
      if (+e.target.value > 0 && P.ambOn !== true) { P.ambOn = true; const c = $('#in-ambon'); if (c) c.checked = true; }
      savePrefs(); ambSaveMix(); ambApply(); ambSync(); ambMatchScene();
    }));
    $('#amb-vol').addEventListener('input', e => { P.ambVol = +e.target.value; savePrefs(); ambMaster(); });
    $('#amb-duck').addEventListener('change', e => { P.ambDuck = e.target.checked; savePrefs(); });
    $('#amb-auto').addEventListener('change', e => { P.ambAuto = e.target.checked; savePrefs(); AMB.auto = null; AMB.autoId = null; ambApply(1.5); ambSync(); ambAutoPaint(); });   // on: read the scene again from here; off: back to the reader's own mix
    $('#amb-wrong').addEventListener('click', () => {   // "Wrong scene?": the scene list and "No scene here" open under the button
      const pk = $('#amb-wrong-pick'), open = pk.hidden; if (open) ambFixChips(); pk.hidden = !open; $('#amb-wrong').setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    $('#amb-wrong-chips').addEventListener('click', e => { const b = e.target.closest('.chip'); if (!b) return; $('#amb-wrong-pick').hidden = true; $('#amb-wrong').setAttribute('aria-expanded', 'false'); ambFixAdd(b.dataset.k); });
    $('#amb-fix-clear').addEventListener('click', ambFixClear);
    $('#amb-smart').addEventListener('change', e => { P.ambSmart = e.target.checked; savePrefs(); AMB.duckS = ''; });   // re-apply the dip at once
    $('#amb-cues').addEventListener('change', e => { P.ambCues = e.target.checked; savePrefs(); ambSync(); });
    $('#amb-trans').addEventListener('change', e => { P.ambTrans = e.target.checked; savePrefs(); });
    $('#amb-int').addEventListener('input', e => { P.ambInt = +e.target.value; savePrefs(); ambApply(0.4); ambSync(); });
    $('#amb-tod').addEventListener('change', e => { P.ambTod = e.target.checked; savePrefs(); ambTod(); ambPaintScenes(); });
    $('#amb-scenes').addEventListener('click', e => { const c = e.target.closest('.chip'); if (c) ambUseScene(c.dataset.k); });
    $('#amb-sug-go').addEventListener('click', () => ambUseScene($('#amb-sug').dataset.k));
    $('#amb-off').addEventListener('click', () => { P.ambOn = false; const c = $('#in-ambon'); if (c) c.checked = false; savePrefs(); AMB.preview = false; ambSync(); closeSheets(); toast('Cinematic sound is off.'); });
    $('#b-amb-set').addEventListener('click', () => { closeSheets(); ambOpen(); });
    $('#in-ambon').addEventListener('change', e => { P.ambOn = e.target.checked; savePrefs(); ambSync(); miniScenePaint(null); });
    $('#in-muson').addEventListener('change', e => { P.musOn = e.target.checked; savePrefs(); $('#row-musvol').hidden = !e.target.checked; $('#row-musduck').hidden = !e.target.checked; if (e.target.checked) { musicAttach(); musicPlay(); } else musicPause(); });
    $('#mus-vol').addEventListener('input', e => musicVolChange(+e.target.value));
    $('#in-musduck').addEventListener('change', e => { P.musDuck = e.target.checked; savePrefs(); MUS.duckS = ''; });   // re-apply the dip at once
    if ($('#in-muson')) { $('#in-muson').checked = P.musOn === true; $('#row-musvol').hidden = P.musOn !== true; $('#row-musduck').hidden = P.musOn !== true; $('#in-musduck').checked = P.musDuck !== false; if ($('#mus-vol')) $('#mus-vol').value = String(P.musVol == null ? MUS_DEFAULT_VOL : P.musVol); }
    musicInit();
    $('#in-scenelabel').addEventListener('change', e => { P.sceneLabel = e.target.checked; savePrefs(); ambAutoPaint(); });
    $('#mini-scene').addEventListener('click', e => { e.stopPropagation(); ambOpen(); });
  }
