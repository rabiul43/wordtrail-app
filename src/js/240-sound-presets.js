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
    ['subtle', 'Quiet', 'Quiet scenes and soft music that follow the story. No story sounds and no opening sound.', { ambInt: 35, ambVol: 50, ambCues: false, ambTrans: false, ambAuto: true, ambDuck: true, ambSmart: true, musOn: true, musVol: 20, musDuck: true, openOn: false, openVol: 40 }],
    ['cinematic', 'Cinematic', 'Full scenes that follow the story, with story sounds, music and an opening sound.', { ambInt: 100, ambVol: 80, ambCues: true, ambTrans: true, ambAuto: true, ambDuck: true, ambSmart: true, musOn: true, musVol: 35, musDuck: true, openOn: true, openVol: 60 }],
    ['sleep', 'Sleep', 'Soft steady rain and brown noise. Scenes, story sounds, music and the opening sound are off, so nothing surprises you.', { ambInt: 30, ambVol: 40, ambCues: false, ambTrans: false, ambAuto: false, ambDuck: true, ambTod: true, musOn: false, openOn: false, scene: 'sleep' }]
  ];
  /* The preset row is Off, the three above, and Custom. Off is the master switch (settings are kept); Custom is what shows once
     anything has been moved by hand. */
  const AMB_OFF_PRESET = ['off', 'Off', 'Everything is silent. Your settings are kept; turn Sound back on to hear them again.'];
  const AMB_PRESET_KEYS = ['ambInt', 'ambVol', 'ambCues', 'ambTrans', 'ambAuto', 'ambDuck', 'ambSmart', 'ambTod', 'musOn', 'musVol', 'musDuck', 'openOn', 'openVol'];
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
  /* ---------- the Sound screen: master switch, master volume and the glue between its controls ---------- */
  function sndOn() { return P.sndOn !== false; }
  function sndMul() { return sndOn() ? (P.sndVol == null ? 100 : Math.max(0, Math.min(100, P.sndVol))) / 100 : 0; }
  function sndPaint() {   // show the saved settings in the controls that live on the Sound screen
    const set = (id, fn) => { const e = $(id); if (e) fn(e); };
    set('#snd-on', e => { e.checked = sndOn(); }); set('#snd-vol', e => { e.value = String(P.sndVol == null ? 100 : P.sndVol); });
    set('#in-ambon', e => { e.checked = P.ambOn === true; });
    set('#in-muson', e => { e.checked = P.musOn === true; });
    set('#row-musvol', e => { e.hidden = P.musOn !== true; }); set('#row-musduck', e => { e.hidden = P.musOn !== true; });
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
  /* ---------- Sound cache: size cap and clear ----------
     Downloaded music and opening clips live in the Cache API ('wt-music', 'wt-amb-rec'). Keep them under about 150 MB:
     when over, the least recently used are removed first. A recording the reader added themselves (wt-rec.invalid/user/)
     cannot be downloaded again, so it is never removed here. Everything is best effort and must never break playback. */
  const SND_CACHES = ['wt-music', 'wt-amb-rec'], SND_CACHE_CAP = 150 * 1048576, SND_USER_KEY = 'https://wt-rec.invalid/user/';
  const SND_KEEP_KEY = 'wt-music-keep', SND_KEEP_CAP = 100 * 1048576;   // music the reader chose to save for offline: the prune skips it; at most 100 MB of it
  function sndKeepSet() { try { return new Set(JSON.parse(localStorage.getItem(SND_KEEP_KEY) || '[]') || []); } catch (e) { return new Set(); } }
  function sndKeepSave(set) { try { localStorage.setItem(SND_KEEP_KEY, JSON.stringify([...set])); } catch (e) { /* no storage: the clips may be pruned later */ } }
  let sndPruneBusy = false, sndPruneAt = 0;
  function sndUsedMap() { try { return JSON.parse(localStorage.getItem('wt-snd-used') || '{}') || {}; } catch (e) { return {}; } }
  function sndTouch(url) {   // remember when a cached clip was last used or added
    try { const m = sndUsedMap(), k = new Request(url).url; m[k] = Date.now(); localStorage.setItem('wt-snd-used', JSON.stringify(m)); } catch (e) { /* no storage: oldest-first falls back to cache order */ }
  }
  async function sndCacheList() {
    const out = [];
    if (!self.caches) return out;
    for (const name of SND_CACHES) {
      let c, keys; try { c = await caches.open(name); keys = await c.keys(); } catch (e) { continue; }
      for (const req of keys) {
        if (req.url.indexOf(SND_USER_KEY) === 0) continue;
        let size = 0;
        try { const r = await c.match(req); size = +r.headers.get('content-length') || 0; if (!size) size = (await r.clone().blob()).size; } catch (e) { /* size unknown: counts as 0 */ }
        out.push({ cache: name, url: req.url, size });
      }
    }
    return out;
  }
  async function sndCachePrune(force) {
    if (sndPruneBusy || (!force && Date.now() - sndPruneAt < 60000)) return;
    sndPruneBusy = true; sndPruneAt = Date.now();
    try {
      const list = await sndCacheList(), used = sndUsedMap(), keep = sndKeepSet();
      let total = list.reduce((a, x) => a + x.size, 0);
      if (total > SND_CACHE_CAP) {
        list.sort((a, b) => (used[a.url] || 0) - (used[b.url] || 0));   // never-seen entries count as oldest
        for (const x of list) {
          if (total <= SND_CACHE_CAP) break;
          if (keep.has(x.url)) continue;   // saved for offline on purpose
          try { const c = await caches.open(x.cache); if (await c.delete(x.url)) { total -= x.size; delete used[x.url]; } } catch (e) { /* skip this one */ }
        }
        try { localStorage.setItem('wt-snd-used', JSON.stringify(used)); } catch (e) { /* ignore */ }
      }
    } catch (e) { /* best effort */ }
    sndPruneBusy = false; sndCacheSizePaint();
  }
  async function sndCacheSizePaint() {
    const el = $('#snd-cache-size'); if (!el) return;
    try { const n = (await sndCacheList()).reduce((a, x) => a + x.size, 0); el.textContent = n < 1048576 ? '0 MB' : Math.round(n / 1048576) + ' MB'; } catch (e) { el.textContent = ''; }
  }
  async function sndCacheClear() {
    if (!confirm('Remove the music and sound files saved on this device? They download again when needed. Your own recordings are kept.')) return;
    try {
      for (const x of await sndCacheList()) { try { await (await caches.open(x.cache)).delete(x.url); } catch (e) { /* skip */ } }
      try { localStorage.removeItem('wt-snd-used'); localStorage.removeItem(SND_KEEP_KEY); } catch (e) { /* ignore */ }
    } catch (e) { /* ignore */ }
    sndCacheSizePaint(); musOffPaint(); toast('Saved sound files removed.');
  }
  const SND_RESET_KEYS = ['ambOn', 'amb', 'ambVol', 'ambInt', 'ambDuck', 'ambSmart', 'ambCues', 'ambTrans', 'ambAuto', 'ambTod', 'ambLook', 'ambCueShift', 'ambCats', 'ambCueCustom', 'ambSrc', 'musOn', 'musVol', 'musDuck', 'openOn', 'openVol', 'sndOn', 'sndVol', 'sceneLabel', 'ambBook', 'ambG', 'musSeen'];
  function sndResetAll() {
    if (!confirm('Put all sound settings back to normal? Your saved mixes for each book are cleared too.')) return;
    SND_RESET_KEYS.forEach(x => { delete P[x]; });
    AMB.preset = ''; AMB.undo = null; AMB.auto = null; AMB.autoId = null; AMB.bookId = '';
    savePrefs(); ambBookCheck(); ambRefresh(); ambApply(0.9); sndApplyAll(); ambPaintScenes(); ambMatchScene(); ambCustomPaint(); ambShiftLabel(); ambPresetPaint();
    toast('All sound settings are back to normal.');
  }
  function sndBookReset() {
    if (!S.book) { toast('Open a book first.'); return; }
    const id = String(S.book.id);
    if (P.ambBook) delete P.ambBook[id];
    if (P.ambFix) delete P.ambFix[id];
    AMB.bookId = ''; AMB.auto = null; AMB.autoId = null; AMB.preset = '';
    savePrefs(); ambBookCheck(); ambRefresh(); ambApply(0.9); ambSync(); ambMatchScene(); ambPresetPaint();
    toast('Sound for this book is back to its starting mix.');
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
    const want = sndOn() && (any || P.ambAuto !== false || (P.ambCues !== false && P.calm !== true)) && (AMB.preview || (P.ambOn === true && ambPlaying()));
    clearTimeout(AMB.timer);
    if (want) {
      if (!ambBuild()) return;
      AMB.ctx.resume().catch(() => {}); ambTod(true); ambApply();
      AMB.slow = false; AMB.master.gain.setTargetAtTime(ambGain(), AMB.ctx.currentTime, 0.8);
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
    ambPaintScenes(); ambMatchScene(); sndPaint();
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
    $('#snd-on').addEventListener('change', e => { P.sndOn = e.target.checked; savePrefs(); AMB.preset = e.target.checked ? '' : AMB.preset; sndApplyAll(); ambPresetPaint(); });
    $('#snd-vol').addEventListener('input', e => { P.sndVol = +e.target.value; savePrefs(); ambMaster(); musBusApply(0.1); });
    $('#snd-duck').addEventListener('change', e => { P.ambDuck = e.target.checked; P.musDuck = e.target.checked; savePrefs(); AMB.duckS = ''; MUS.duckS = ''; sndPaint(); });   // one switch for both; the two separate ones are under Advanced
    ['#amb-duck', '#in-musduck'].forEach(id => $(id).addEventListener('change', sndPaint));
    $('#snd-book-reset').addEventListener('click', sndBookReset); $('#snd-reset-all').addEventListener('click', sndResetAll);
    $('#snd-cache-clear').addEventListener('click', sndCacheClear); setTimeout(() => sndCachePrune(true), 20000);   // trim an oversized cache shortly after start
    $('#b-amb-set').addEventListener('click', () => { closeSheets(); ambOpen(); });
    $('#in-ambon').addEventListener('change', e => { P.ambOn = e.target.checked; savePrefs(); ambSync(); miniScenePaint(null); });
    $('#in-muson').addEventListener('change', e => { P.musOn = e.target.checked; savePrefs(); $('#row-musvol').hidden = !e.target.checked; $('#row-musduck').hidden = !e.target.checked; if (e.target.checked) { musicAttach(); musicPlay(); } else musicPause(); });
    $('#mus-vol').addEventListener('input', e => musicVolChange(+e.target.value));
    $('#in-musduck').addEventListener('change', e => { P.musDuck = e.target.checked; savePrefs(); MUS.duckS = ''; });   // re-apply the dip at once
    sndPaint(); ambPresetPaint();
    try { sndTabsInit(); } catch (e) { console.warn('sound tabs', e); }
    musicInit();
    $('#in-scenelabel').addEventListener('change', e => { P.sceneLabel = e.target.checked; savePrefs(); ambAutoPaint(); });
    $('#mini-scene').addEventListener('click', e => { e.stopPropagation(); ambOpen(); });
  }
