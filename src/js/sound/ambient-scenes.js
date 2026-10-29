  /* ---------- ambient-scenes.js ----------
     Rain, café, wind, waves and more are made on the device with the Web Audio API (no files to download, works offline).
     They follow the book: on while it plays, faded out when it pauses (so the sleep timer ends them too). While the
     mixer is open they play so you can hear your mix. Settings > Audio switches the feature on or off. */
  const AMB = { ctx: null, master: null, g: {}, built: false, on: false, preview: false, timer: 0, clinkIv: 0, evIv: 0, live: {}, nx: {}, tickAt: 0, beatAt: 0, tickAlt: 0, duckIv: 0, duck: null, duckT: 1, slow: false, rec: {}, recBusy: {}, recFail: {}, recMap: {}, bookId: '', nextThunder: 0, white: null, brown: null, scene: '', narr: null };
  const AMB_SOUNDS = [
    ['rain', 'Rain', 'nature'], ['wind', 'Wind', 'nature'], ['waves', 'Waves', 'nature'], ['river', 'River', 'nature'], ['birds', 'Birds', 'nature'], ['night', 'Night', 'nature'], ['thunder', 'Thunder', 'nature'],
    ['fire', 'Fire', 'indoors'], ['cafe', 'Café', 'indoors'], ['clock', 'Clock', 'indoors'], ['creaks', 'Creaks', 'indoors'], ['drips', 'Drips', 'indoors'],
    ['drone', 'Drone', 'mood'], ['engine', 'Engine room', 'mood'], ['heartbeat', 'Heartbeat', 'mood'], ['bell', 'Bell', 'mood'], ['brown', 'Brown noise', 'mood'],
    ['crowd', 'Crowd', 'people'], ['steps', 'Footsteps', 'people'], ['hooves', 'Hooves', 'people'], ['train', 'Train', 'people'], ['clang', 'Metal clang', 'people'], ['cannon', 'Distant guns', 'people']
  ];
  const AMB_GROUPS = { nature: 'Nature', indoors: 'Indoors', mood: 'Atmosphere', people: 'People and places' };
  const ambLevels = () => Object.assign(Object.fromEntries(AMB_SOUNDS.map(([k]) => [k, 0])), { rain: 50 }, P.amb || {});
  /* Scenes: ready-made mixes. The book's genres (and title) pick a suggested one. First matching rule wins. */
  let AMB_SCENES = [], AMB_RULES = [];
  /* Scenes and the genre rules that pick one live in the JSON block #amb-map (and an optional ambient.json in the
     repo, checked daily), so genres and scenes can be added without touching this code. */
  function ambSetMap(d) {
    if (!d || d.v !== 1 || !Array.isArray(d.scenes) || !Array.isArray(d.rules)) return false;
    const known = new Set(AMB_SOUNDS.map(x => x[0])), scenes = [], rules = [];
    d.scenes.forEach(sc => {
      if (!sc || typeof sc.k !== 'string' || typeof sc.n !== 'string' || !sc.L || typeof sc.L !== 'object') return;
      const L = {}; Object.keys(sc.L).forEach(k => { if (known.has(k) && isFinite(sc.L[k])) L[k] = Math.max(0, Math.min(100, Math.round(+sc.L[k]))); });
      if (Object.keys(L).length) scenes.push({ k: sc.k.slice(0, 24), n: sc.n.slice(0, 40), L });
    });
    d.rules.forEach(r => {
      if (!Array.isArray(r) || typeof r[0] !== 'string' || typeof r[1] !== 'string' || r[1].length > 400 || !scenes.some(x => x.k === r[0])) return;
      try { rules.push([r[0], new RegExp(r[1])]); } catch (e) { /* skip a bad pattern */ }
    });
    if (!scenes.length) return false;
    AMB_SCENES = scenes; AMB_RULES = rules; return true;
  }
  async function ambLoadRemote() {
    try {
      const c = store.get('wt:ambmap', null);
      if (c && c.d) ambSetMap(c.d);
      if (c && Date.now() - c.t < 24 * 3600e3) return;
      const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 8000);
      const r = await fetch('https://raw.githubusercontent.com/' + ghCfg().repo + '/main/ambient.json', { signal: ctl.signal }); clearTimeout(to);
      if (!r.ok) return;
      const d = await r.json();
      if (ambSetMap(d)) { store.set('wt:ambmap', { t: Date.now(), d }); if (!$('#sheet-amb').hidden) { ambPaintScenes(); ambMatchScene(); } }
    } catch (e) { /* offline, or no ambient.json in the repo: keep the built-in list */ }
  }
  try { ambSetMap(JSON.parse(document.getElementById('amb-map').textContent)); } catch (e) { /* built-in list unreadable */ }
  function ambSuggest(b) {
    if (!b) return null;
    const row = b.genres || ((CAT.books || []).find(x => x.id === String(b.id)) || {}).genres || '';
    const text = (String(row) + ' ' + (b.title || '')).toLowerCase();
    for (const [k, re] of AMB_RULES) if (re.test(text)) return AMB_SCENES.find(s => s.k === k) || null;
    return null;
  }
  const ambFull = L => { const o = {}; AMB_SOUNDS.forEach(([k]) => { o[k] = L[k] || 0; }); return o; };
  function ambMatchScene() {
    const L = ambLevels(); AMB.scene = '';
    for (const sc of AMB_SCENES) { const f = ambFull(sc.L); if (AMB_SOUNDS.every(([k]) => (L[k] || 0) === f[k])) { AMB.scene = sc.k; break; } }
    const sug = ambSuggest(S.book);
    $$('#amb-scenes .chip').forEach(c => c.setAttribute('aria-pressed', c.dataset.k === AMB.scene ? 'true' : 'false'));
    ambGroups();
    return sug;
  }
  function ambPaintScenes() {
    const box = $('#amb-scenes'), sug0 = ambSuggest(S.book), sug = sug0 || ambTonight();
    box.textContent = '';
    const list = AMB_SCENES.slice(); if (sug) { list.splice(list.indexOf(sug), 1); list.unshift(sug); }
    list.forEach(sc => box.append(h('button', { class: 'chip', type: 'button', 'data-k': sc.k, 'aria-pressed': 'false' }, sc.n, sug && sc === sug ? h('small', { class: 'amb-tag' }, 'Suggested') : null)));
    const card = $('#amb-sug');
    if (sug) { $('#amb-sug-n').textContent = sug.n; $('#amb-sug-for').textContent = sug0 ? 'Suggested for \u201c' + (S.book.title || 'this book') + '\u201d' : 'Suggested for tonight: quieter and softer'; }
    card.hidden = !sug; card.dataset.k = sug ? sug.k : '';
  }
  function ambUseScene(k) {
    const sc = AMB_SCENES.find(x => x.k === k); if (!sc) return;
    ambBookCheck(); ambAutoHold(); P.amb = ambFull(sc.L); P.ambOn = true;
    const c = $('#in-ambon'); if (c) c.checked = true;
    savePrefs(); AMB_SOUNDS.forEach(([n]) => { $('#amb-' + n).value = String(P.amb[n] || 0); });
    ambSaveMix(); ambApply(0.9); ambSync(); ambMatchScene();
  }
