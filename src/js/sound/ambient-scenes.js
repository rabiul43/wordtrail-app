  /* ---------- ambient-scenes.js ----------
     Rain, café, wind, waves and more are made on the device with the Web Audio API (no files to download, works offline).
     They follow the book: on while it plays, faded out when it pauses (so the sleep timer ends them too). While the
     mixer is open they play so you can hear your mix. Settings > Audio switches the feature on or off. */
  const AMB = { ctx: null, master: null, g: {}, built: false, on: false, preview: false, clinkIv: 0, evIv: 0, live: {}, nx: {}, tickAt: 0, beatAt: 0, tickAlt: 0, duckIv: 0, duck: null, duckT: 1, slow: false, rec: {}, recBusy: {}, recFail: {}, recMap: {}, bookId: '', nextThunder: 0, white: null, brown: null, scene: null, narr: null, sceneK: '' };
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
  function ambGenreRule(b) {   // the book's first matching genre rule: { k: rule key (the genre), sc: its suggested scene, re, row: the genre row, lowercased }. The one place that matches rules: ambSuggest and the per-genre memory both use it
    if (!b) return null;
    const row = b.genres || ((CAT.books || []).find(x => x.id === String(b.id)) || {}).genres || '';
    const text = (String(row) + ' ' + (b.title || '')).toLowerCase();
    for (const [k, re] of AMB_RULES) if (re.test(text)) { const sc = AMB_SCENES.find(s => s.k === k); return sc ? { k, sc, re, row: String(row).toLowerCase() } : null; }
    return null;
  }
  function ambSuggest(b) { const g = ambGenreRule(b); return g ? g.sc : null; }
  /* Sound remembered per genre: P.genreSound = { <genre rule key>: { scene, intensity, musicOn, cuesOn } }. It is part of wt:prefs, so account
     sync and backups carry it like every other setting. A book's own saved mix (P.ambBook) always wins; this is used only for a book with none. */
  function gsGet(k) {
    const m = P.genreSound, r = m && typeof m === 'object' && !Array.isArray(m) && k !== '__proto__' && Object.prototype.hasOwnProperty.call(m, k) ? m[k] : null;
    return r && typeof r === 'object' && !Array.isArray(r) ? r : null;
  }
  function ambGenreLabel(g) {   // "Mystery": the whole word the rule matched in the book's genre row, else the scene's name
    const m = g.re.exec(g.row);
    if (m && m[0].trim()) {
      let s = m.index, e = m.index + m[0].length;
      while (s > 0 && /[a-z]/.test(g.row[s - 1])) s--;
      while (e < g.row.length && /[a-z]/.test(g.row[e])) e++;
      const w = g.row.slice(s, e).trim();
      if (w.length > 2) return w.charAt(0).toUpperCase() + w.slice(1);
    }
    return g.sc.n;
  }
  function ambSceneKey() {   // the scene the current levels are exactly equal to, or '' for the reader's own mix
    const L = ambLevels();
    for (const sc of AMB_SCENES) { const f = ambFull(sc.L); if (AMB_SOUNDS.every(([k]) => (L[k] || 0) === f[k])) return sc.k; }
    return '';
  }
  function gsSave() {   // the reader changed the scene, intensity, music or story sounds: remember them for this book's genre
    if (!S.book) return;
    const g = ambGenreRule(S.book); if (!g || g.k === '__proto__') return;
    if (!P.genreSound || typeof P.genreSound !== 'object' || Array.isArray(P.genreSound)) P.genreSound = {};
    P.genreSound[g.k] = { scene: ambSceneKey(), intensity: P.ambInt == null ? 100 : P.ambInt, musicOn: P.musOn === true, cuesOn: P.ambCues !== false };
    savePrefs(); gsPaint();
  }
  function gsApply(gs, g) {   // a book with no mix of its own opens on the genre's saved sound
    const sc = gs.scene ? AMB_SCENES.find(x => x.k === gs.scene) : null, last = (P.ambG || {})[g.k];
    P.amb = sc ? ambFull(sc.L) : last ? Object.assign(ambLevels(), last) : ambFull(g.sc.L);   // a saved scene; or the reader's own mix last used for this genre; or the suggested scene
    if (typeof gs.intensity === 'number' && isFinite(gs.intensity)) P.ambInt = Math.max(0, Math.min(100, Math.round(gs.intensity)));
    const mus = P.musOn === true;
    if (typeof gs.musicOn === 'boolean') P.musOn = gs.musicOn;
    if (typeof gs.cuesOn === 'boolean') P.ambCues = gs.cuesOn;
    savePrefs(); ambApply(0.9);
    try { ambRefresh(); } catch (e) { /* the Sound sheet is not built yet: it paints from P when it opens */ }
    try { if (mus !== (P.musOn === true)) { if (P.musOn === true && sndOn()) { musicAttach(); musicPlay(); } else musicPause(); qkPaint(); } } catch (e) { /* music is optional here */ }
  }
  function gsPaint() {   // the "Remembered for Mystery" line in the Sound sheet
    const box = $('#amb-gs'); if (!box) return;
    const g = S.book ? ambGenreRule(S.book) : null, on = !!(g && gsGet(g.k));
    box.hidden = !on; if (on) $('#amb-gs-t').textContent = 'Remembered for ' + ambGenreLabel(g);
  }
  function gsReset() {
    const g = S.book ? ambGenreRule(S.book) : null; if (!g || !gsGet(g.k)) { gsPaint(); return; }
    const n = ambGenreLabel(g); delete P.genreSound[g.k]; savePrefs(); gsPaint();
    toast('Sound for ' + n + ' is no longer remembered.');
  }
  const ambFull = L => { const o = {}; AMB_SOUNDS.forEach(([k]) => { o[k] = L[k] || 0; }); return o; };
  function ambMatchScene() {
    AMB.sceneK = ambSceneKey();
    const sug = ambSuggest(S.book);
    $$('#amb-scenes .chip').forEach(c => c.setAttribute('aria-pressed', c.dataset.k === AMB.sceneK ? 'true' : 'false'));
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
    gsPaint();
  }
  function ambUseScene(k) {
    const sc = AMB_SCENES.find(x => x.k === k); if (!sc) return;
    ambBookCheck(); ambAutoHold(); P.amb = ambFull(sc.L); P.ambOn = true;
    const c = $('#in-ambon'); if (c) c.checked = true;
    savePrefs(); AMB_SOUNDS.forEach(([n]) => { $('#amb-' + n).value = String(P.amb[n] || 0); });
    ambSaveMix(); ambApply(0.9); ambSync(); ambMatchScene();
    if (!AMB.prevK) gsSave();   // a scene only being previewed is not remembered until "Use this"
  }
