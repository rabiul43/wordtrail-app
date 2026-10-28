  /* ---------- sound-screen.js ----------
     Sound screen: reset, the mixer rows, My own words, ambSync and ambInit. */
  const SND_RESET_KEYS = ['ambOn', 'amb', 'ambVol', 'ambInt', 'ambDuck', 'ambSmart', 'ambCues', 'ambTrans', 'ambAuto', 'ambTod', 'ambLook', 'ambAi', 'ambCueShift', 'ambCats', 'ambCueCustom', 'ambSrc', 'musOn', 'musVol', 'musDuck', 'musDip', 'openOn', 'openVol', 'sndOn', 'sndVol', 'sceneLabel', 'sndBalance', 'ambBook', 'ambG', 'musSeen', 'sndDev'];
  async function sndResetAll() {
    if (!await askConfirm({ title: 'Reset sound settings?', text: 'Everything goes back to normal. Your saved mixes for each book are cleared too.', ok: 'Reset', tone: 'calm' })) return;
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
    const want = sndOn() && (any || AMB.aud || P.ambAuto !== false || (P.ambCues !== false && P.calm !== true)) && (AMB.preview || AMB.aud || (P.ambOn === true && ambPlaying()));   // opening the screen plays nothing: sound comes only from a tap on a scene or a sound name (preview / audition), or from the book itself
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
    $('#amb-auto').checked = P.ambAuto !== false; $('#amb-ai').checked = P.ambAi === true; ambAutoPaint(); AMB.preset = ''; AMB.undo = null; ambPresetPaint();
    ambPaintScenes(); ambMatchScene(); sndPaint();
    AMB.preview = false; openSheet('sheet-amb'); ambSync();   // silent on open: a preview starts only when a scene or a sound name is tapped
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
    const cueCol = new Intl.Collator();   // one collator is much faster than localeCompare on every pair, same order
    Object.keys(CUE_SOUND).sort((x, y) => cueCol.compare(CUE_NAMES[x] || x, CUE_NAMES[y] || y)).forEach(k => { const o = document.createElement('option'); o.value = k; o.textContent = CUE_NAMES[k] || k; sel.append(o); });
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
    audio.addEventListener('play',  () => { musicAttach(); musicPlay(); });   // musicPlay waits (musNarrating) until the recording is really playing
    ['playing', 'canplay', 'seeked', 'waiting', 'stalled', 'loadstart', 'emptied', 'abort', 'error'].forEach(ev => audio.addEventListener(ev, () => {   // music follows what is heard: it starts when the voice does and stops while a recording loads or stalls
      if (musNarrating()) { musicAttach(); musicPlay(); } else if (MUS.live || MUS.playing) musicPause();
    }));
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
    $('#amb-fix-export').addEventListener('click', ambFixExport);
    $('#amb-smart').addEventListener('change', e => { P.ambSmart = e.target.checked; savePrefs(); AMB.duckS = ''; });   // re-apply the dip at once
    $('#amb-cues').addEventListener('change', e => { P.ambCues = e.target.checked; savePrefs(); ambSync(); });
    $('#amb-trans').addEventListener('change', e => { P.ambTrans = e.target.checked; savePrefs(); });
    $('#amb-ai').addEventListener('change', e => { P.ambAi = e.target.checked; savePrefs(); });
    $('#amb-int').addEventListener('input', e => { P.ambInt = +e.target.value; savePrefs(); ambApply(0.4); ambSync(); });
    $('#amb-tod').addEventListener('change', e => { P.ambTod = e.target.checked; savePrefs(); ambTod(); ambPaintScenes(); });
    $('#amb-scenes').addEventListener('click', e => { const c = e.target.closest('.chip'); if (c) ambScenePreview(c.dataset.k); });   // tap = hear it for 5 s, then "Use this" keeps it
    $('#amb-prev-use').addEventListener('click', ambSceneKeep);
    new MutationObserver(() => { if ($('#sheet-amb').hidden) ambSceneRevert(); }).observe($('#sheet-amb'), { attributes: true, attributeFilter: ['hidden'] });
    $('#amb-sug-go').addEventListener('click', () => { ambSceneEnd(); ambUseScene($('#amb-sug').dataset.k); toast('Scene set. It plays with the book.'); });
    $('#snd-now-pp').addEventListener('click', () => { togglePlay(); setTimeout(sndNowPaint, 120); });   // the pinned strip's play/pause drives the narrator
    $('#snd-offbar-on').addEventListener('click', () => { const c = $('#snd-on'); if (c && !c.checked) { c.checked = true; c.dispatchEvent(new Event('change', { bubbles: true })); } });   // the banner's one-tap fix
    $('#snd-body').addEventListener('click', e => {   // a tap on the locked panel does nothing, so point at the banner instead
      const body = $('#snd-body'); if (!body.hasAttribute('data-off')) return;
      const r = $('#snd-panels').getBoundingClientRect(); if (e.clientY < r.top || e.clientY > r.bottom) return;
      const b = $('#snd-offbar'); b.classList.remove('nudge'); void b.offsetWidth; b.classList.add('nudge');
    });
    $('#snd-on').addEventListener('change', e => { P.sndOn = e.target.checked; savePrefs(); AMB.preset = e.target.checked ? '' : AMB.preset; sndApplyAll(); ambPresetPaint(); });
    $('#snd-vol').addEventListener('input', e => { P.sndVol = +e.target.value; sndVolPaint(); savePrefs(); ambMaster(); musBusApply(0.1); });
    $('#snd-duck').addEventListener('change', e => { P.ambDuck = e.target.checked; P.musDuck = e.target.checked; savePrefs(); AMB.duckS = ''; MUS.duckS = ''; sndPaint(); });   // one switch for both; the two separate ones are under Advanced
    ['#amb-duck'].forEach(id => $(id).addEventListener('change', sndPaint));
    let devTaps = [];   // five quick taps on the "Advanced" title reveal the Developer block
    $('#amb-fine > summary').addEventListener('click', () => {
      const t = Date.now(); devTaps = devTaps.filter(x => t - x < 3000); devTaps.push(t);
      if (devTaps.length >= 5 && P.sndDev !== true) { P.sndDev = true; savePrefs(); sndPaint(); toast('Developer options are on.'); }
    });
    $('#snd-book-reset').addEventListener('click', sndBookReset); $('#snd-reset-all').addEventListener('click', sndResetAll);
    $('#snd-cache-clear').addEventListener('click', sndCacheClear); setTimeout(() => sndCachePrune(true), 20000);   // trim an oversized cache shortly after start
    $('#b-amb-set').addEventListener('click', () => { closeSheets(); ambOpen(); });
    $('#in-ambon').addEventListener('change', e => { P.ambOn = e.target.checked; savePrefs(); ambSync(); ambAutoPaint(); });   // the scene stays on show; only its "Turn on sounds" button comes and goes
    /* "Turn on sounds" (the Sound strip and the Background sounds tab): the same as the switch in that tab, plus the scene already read applies at once */
    const scenesOn = () => {
      if (!sndOn()) return;
      P.ambOn = true; const c = $('#in-ambon'); if (c) c.checked = true;
      savePrefs(); ambSync();
      if (P.ambAuto !== false) { try { ambAutoStep(); } catch (e) { /* optional */ } ambApply(1.5); }
      ambAutoPaint(); sndPaint(); try { qkPaint(); } catch (e) { /* the player tile is optional */ }
    };
    $('#snd-now-amb').addEventListener('click', scenesOn); $('#amb-scene-off-go').addEventListener('click', scenesOn);
    /* The scene is read while neither Music nor Background sounds is on only when someone can see it (the Sound sheet is open or
       the mini-player label is on). One check a second; ambAutoStep itself does work only when the paragraph changes. */
    setInterval(() => {
      if (document.hidden || !S.book || !sndOn() || AMB.on || MUS.on || P.ambAuto === false) return;
      if (P.sceneLabel !== true && $('#sheet-amb').hidden) return;
      if (S.curId === AMB.autoId && S.sec === AMB.autoSec) return;   // same sentence as last time
      try { ambAutoStep(); } catch (e) { /* the label is a help, never a reason to stop anything */ }
    }, 1000);
    $('#snd-balance').addEventListener('change', e => { P.sndBalance = e.target.checked; savePrefs(); sndBalSync(); });   // on (the default) or off: the music and sounds glide to their new levels
    setInterval(sndBalSync, 500); sndBalSync(true);   // follows the Music, Background sounds, volume and Sound switches wherever they are changed; cheap checks, work only when the state flips
    $('#in-muson').addEventListener('change', e => { P.musOn = e.target.checked; savePrefs(); if (e.target.checked) { musicAttach(); musicPlay(); } else musicPause(); try { qkPaint(); } catch (err) { /* the tile is optional */ } });
    $('#mus-vol').addEventListener('input', e => { musicVolChange(+e.target.value); musVolPaint(); });
    $('#in-musduck').addEventListener('change', e => { P.musDuck = e.target.checked; savePrefs(); MUS.duckS = ''; sndPaint(); });   // re-apply the dip at once
    sndPaint(); ambPresetPaint();
    try { sndTabsInit(); } catch (e) { console.warn('sound tabs', e); }
    musicInit();
    $('#in-scenelabel').addEventListener('change', e => { P.sceneLabel = e.target.checked; savePrefs(); ambAutoPaint(); });
    $('#mini-scene').addEventListener('click', e => { e.stopPropagation(); ambOpen(); });
  }
