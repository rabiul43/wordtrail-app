  /* ---------- background sound mixer ----------
     Rain, café, wind, waves and more are made on the device with the Web Audio API (no files to download, works offline).
     They follow the book: on while it plays, faded out when it pauses (so the sleep timer ends them too). While the
     mixer is open they play so you can hear your mix. Settings > Audio switches the feature on or off. */
  const AMB = { ctx: null, master: null, g: {}, built: false, on: false, preview: false, timer: 0, clinkIv: 0, evIv: 0, live: {}, nx: {}, tickAt: 0, beatAt: 0, tickAlt: 0, duckIv: 0, duck: null, duckT: 1, slow: false, rec: {}, recBusy: {}, recFail: {}, recMap: {}, bookId: '', nextThunder: 0, white: null, brown: null, scene: '' };
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
    list.forEach(sc => box.append(h('button', { class: 'chip', type: 'button', 'data-k': sc.k, 'aria-pressed': 'false' }, (sug && sc === sug ? '\u2605 ' : '') + sc.n)));
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
  function ambNoise(ctx, kind) {   // 10 seconds with two unrelated channels: it sounds wide, and the loop is far too long to notice
    const sr = ctx.sampleRate, len = Math.floor(sr * 10), n = Math.floor(sr * 0.4), buf = ctx.createBuffer(2, len, sr);
    for (let c = 0; c < 2; c++) {
      const d = new Float32Array(len + n);   // a little extra at the end: it is folded into the start, so the end runs straight into the beginning
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
      for (let i = 0; i < len + n; i++) {
        const w = Math.random() * 2 - 1;
        if (kind === 'white') d[i] = w * 0.5;
        else if (kind === 'pink') { b0 = .99886 * b0 + w * .0555179; b1 = .99332 * b1 + w * .0750759; b2 = .969 * b2 + w * .153852; b3 = .8665 * b3 + w * .3104856; b4 = .55 * b4 + w * .5329522; b5 = -.7616 * b5 - w * .016898; d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * .5362) * 0.11; b6 = w * .115926; }
        else { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
      }
      const o = buf.getChannelData(c);
      for (let i = 0; i < len; i++) o[i] = d[i];
      for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI / 2; o[i] = d[i] * Math.sin(a) + d[len + i] * Math.cos(a); }   // equal-power fold: no click and no dip at the loop point
    }
    return buf;
  }
  function ambIR(ctx, sec) {   // a made-up room: noise that fades out and gets darker as it goes
    const sr = ctx.sampleRate, len = Math.floor(sr * sec), pre = Math.floor(sr * 0.012), ramp = sr * 0.03, b = ctx.createBuffer(2, len, sr);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c); let y = 0;
      for (let i = pre; i < len; i++) { const x = (i - pre) / (len - pre); y += (0.55 - 0.42 * x) * ((Math.random() * 2 - 1) - y); d[i] = y * Math.pow(10, -3 * x) * (i - pre < ramp ? (i - pre) / ramp : 1); }
    }
    return b;
  }
  function ambPanTo(dest, p) {   // a sound placed left or right of centre (p from -1 to 1); returns the node to play into
    const ctx = AMB.ctx; if (!ctx.createStereoPanner) return dest;
    const n = ctx.createStereoPanner(); n.pan.value = Math.max(-1, Math.min(1, p)); n.connect(dest); return n;
  }
  function ambMakeDrops(ctx) {   // a dozen different raindrops, made once: sharp ticks of different brightness, and a few small plinks
    const sr = ctx.sampleRate, out = [];
    for (let k = 0; k < 12; k++) {
      const len = Math.floor(sr * (0.03 + Math.random() * 0.04)), b = ctx.createBuffer(1, len, sr), d = b.getChannelData(0), peak = 0.12 + Math.pow(Math.random(), 2) * 0.55;
      if (k % 4 === 3) {
        const f = 1400 + Math.random() * 1800, dec = 60 + Math.random() * 50;
        for (let i = 0; i < len; i++) { const t = i / sr; d[i] = Math.sin(2 * Math.PI * (f * t + f * 5 * t * t)) * Math.exp(-t * dec) * peak; }
      } else {
        const tau = 0.003 + Math.random() * 0.01, hp = 0.5 + Math.random() * 0.5; let prev = 0;
        for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; d[i] = (w - prev * hp) * Math.exp(-(i / sr) / tau) * peak; prev = w; }
      }
      out.push(b);
    }
    return out;
  }
  function ambRain(L, ctx, now) {   // single drops on top of the steady rain: more of them as the rain level rises, each at its own spot and pitch
    const g = AMB.g.rain; if (!(L.rain > 5) || !g || !AMB.drops || (AMB.live.rain && AMB.live.rain.rec)) return;
    if (AMB.dropG !== g) { AMB.dropG = g; AMB.dropP = ctx.createStereoPanner ? [-0.85, -0.45, 0, 0.45, 0.85].map(p => { const n = ctx.createStereoPanner(); n.pan.value = p; n.connect(g); return n; }) : [g]; }
    const n = Math.round((3 + 22 * L.rain / 100) * 0.45 * (0.7 + Math.random() * 0.6));
    for (let i = 0; i < n; i++) {
      const s = ctx.createBufferSource(); s.buffer = AMB.drops[Math.floor(Math.random() * AMB.drops.length)]; s.playbackRate.value = 0.85 + Math.random() * 0.5;
      s.connect(AMB.dropP[Math.floor(Math.random() * AMB.dropP.length)]); s.start(now + 0.02 + Math.random() * 0.43);
    }
  }
  function ambRoll(dest, t, strength, crack, fast) {   // rolling thunder: a first rumble, then two or three softer ones that overlap it, each a little to one side
    if (crack) { const pc = ambPanTo(dest, Math.random() * 0.8 - 0.4); cueNz(pc, t, 'white', 'highpass', 1200, 0.7, (fast ? 0.75 : 0.55) * strength, 0.004, 0.3); cueNz(pc, t, 'pink', 'bandpass', 700, 0.6, (fast ? 0.8 : 0.6) * strength, 0.006, 0.5); }   // a sharp crack with some body
    const n = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      const at = t + (i ? 0.5 + Math.random() * 3.5 : 0.05), dur = 3.5 + Math.random() * 4, v = strength * (i ? 0.3 + Math.random() * 0.45 : 1);
      const lp = cueNz(ambPanTo(dest, Math.random() * 1.4 - 0.7), at, 'brown', 'lowpass', 450, 0.7, v, fast && !i ? 0.08 : 0.35 + Math.random(), dur);   // fast: a story cue's first rumble is there at the word
      lp.frequency.setValueAtTime(380 + Math.random() * 220, at); lp.frequency.exponentialRampToValueAtTime(60, at + dur + 1);
      // phone speakers give almost nothing below about 200 Hz, so the rumble also gets a growl in the 150 to 900 Hz range that they can play
      const bp = cueNz(ambPanTo(dest, Math.random() * 1.4 - 0.7), at, 'pink', 'bandpass', 700, 0.5, v * 0.8, fast && !i ? 0.05 : 0.15 + Math.random() * 0.4, dur * 0.8);
      bp.frequency.setValueAtTime(700 + Math.random() * 300, at); bp.frequency.exponentialRampToValueAtTime(160, at + dur);
    }
  }
  function ambRoomMix(L) {   // how much small-room and how much wide reverb: indoor sounds get the room, outdoor and mood sounds the wide one
    let I = 0, O = 0;
    AMB_SOUNDS.forEach(([k, , g]) => { const v = L[k] || 0; if (g === 'indoors') I += v; else O += v; });
    const tot = I + O; return tot ? [0.32 * I / tot, 0.3 * O / tot] : [0, 0];
  }
  /* Space detection: scan the current sentence for indoor / outdoor / occluded cues.
     Returns 'indoor', 'outdoor', 'occluded', or '' (let the sound mix decide). */
  function ambSpaceDetect(text) {
    if (!text) return '';
    // "behind the wall / door / curtain / glass", "outside the window / room", muffled source
    if (/\b(behind\s+(?:the\s+)?(?:wall|door|doors|curtain|curtains|screen|panel|panels|partition|glass|window|windows|hedge|fence|shutters?)|outside\s+(?:the\s+)?(?:door|room|rooms|house|building|wall|window|windows)|through\s+(?:the\s+)?(?:wall|door|ceiling|floor|window|glass|keyhole)|muffled|muffling|from\s+(?:the\s+)?(?:next\s+room|other\s+side|other\s+room|adjoining|hall|hallway|passage))\b/i.test(text)) return 'occluded';
    // outdoor: explicit outdoor setting words
    if (/\b(outside|outdoors?|open\s+air|open\s+field|open\s+road|open\s+sea|open\s+moor|in\s+(?:the\s+)?(?:street|streets|courtyard|garden|gardens|field|fields|meadow|meadows|forest|woods|yard|park|square|road|lane|path|hillside|valley|beach|shore|cliff|cliffs|moor|moors|countryside|fog|rain|storm|wind|snow|dark|night)|stepped\s+(?:out(?:side)?|into\s+the\s+(?:street|night|cold|rain|wind|garden|yard|road|open))|went\s+(?:out(?:side)?|into\s+the\s+(?:street|garden|yard|open|road|rain|night)))\b/i.test(text)) return 'outdoor';
    // indoor: strong interior cues
    if (/\b(inside|indoors?|in\s+(?:the\s+)?(?:room|rooms|hall|hallway|corridor|passage|parlour|parlor|kitchen|cellar|dungeon|attic|loft|chamber|chambers|study|library|drawing\s*room|dining\s*room|bedroom|sitting\s*room|inn|tavern|church|chapel|cathedral|castle|mansion|cabin|cottage|tent|cave|vault|crypt)|came\s+(?:in(?:side)?|into\s+the\s+(?:room|house|hall|corridor|parlour|kitchen|inn|study|library|chamber)))\b/i.test(text)) return 'indoor';
    return '';
  }
  /* Apply the detected space: shift reverb mix and wall filter without fighting the mix-based ambApply.
     tc controls the crossfade speed — slow for scene changes, fast for obvious switches. */
  function ambSpaceApply(space, tc) {
    if (!AMB.built || !AMB.wf) return;
    const ctx = AMB.ctx, t = ctx.currentTime, L = ambLive();
    /* Wall-filter cutoff: transparent (20k) indoors and for undetected; very muffled outdoors-to-indoor leakage (400 Hz) */
    const wfFreq = space === 'occluded' ? 400 : 20000;
    AMB.wf.frequency.setTargetAtTime(wfFreq, t, tc || 1.2);
    if (!AMB.sR) return;
    /* Reverb sends: indoor = more small room; outdoor = more hall; occluded = heavy hall only (the source is far) */
    const base = ambRoomMix(L);
    let sr, sh;
    if (space === 'indoor')   { sr = Math.max(base[0], 0.32); sh = Math.min(base[1], 0.08); }
    else if (space === 'outdoor')  { sr = Math.min(base[0], 0.06); sh = Math.max(base[1], 0.30); }
    else if (space === 'occluded') { sr = 0.04; sh = 0.38; }
    else                           { sr = base[0]; sh = base[1]; }
    AMB.sR.gain.setTargetAtTime(sr, t, tc || 1.2);
    AMB.sH.gain.setTargetAtTime(sh, t, tc || 1.2);
    AMB.spaceApplied = space;
  }
  function audioCtx() {   // the ONE AudioContext of the app, shared by ambient, music and the opening sound; created on first use, so music works with ambient off
    if (AMB.ctx) return AMB.ctx;
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
    try { AMB.ctx = new AC(); } catch (e) { return null; }
    return AMB.ctx;
  }
  function audioSuspendSoon(ms, key) {   // stop the engine to save battery, but only when ambient is silent AND music is not playing; ambient and music each keep their own timer
    clearTimeout(AMB[key]);
    AMB[key] = setTimeout(() => { if (AMB.ctx && !AMB.on && !musicActive()) AMB.ctx.suspend().catch(() => {}); }, ms);
  }
  function ambBuild() {   // the ambient engine; each sound's layer is built only while its level is above zero (ambLayerOn)
    if (AMB.built) return true;
    const ctx = audioCtx(); if (!ctx) return false;
    const master = ctx.createGain(); master.gain.value = 0; master.connect(ctx.destination); AMB.master = master;
    const warm = ctx.createBiquadFilter(); warm.type = 'highshelf'; warm.frequency.value = 3500; warm.gain.value = 0; warm.connect(master); AMB.warm = warm;   // softens the high end at night
    const duck = ctx.createGain(); duck.gain.value = 1; AMB.duck = duck;
    const ca = ctx.createBiquadFilter(), cb = ctx.createBiquadFilter();   // the speech-band carve: flat until the narrator speaks
    ca.type = 'peaking'; ca.frequency.value = 3000; ca.Q.value = 0.7; ca.gain.value = 0; cb.type = 'peaking'; cb.frequency.value = 800; cb.Q.value = 0.9; cb.gain.value = 0;
    duck.connect(ca); ca.connect(cb); AMB.ca = ca; AMB.cb = cb;
    /* wall filter: transparent by default (20 kHz); set to ~400 Hz when the text says the scene is outside a room or behind a wall */
    const wf = ctx.createBiquadFilter(); wf.type = 'lowpass'; wf.frequency.value = 20000; wf.Q.value = 0.5; cb.connect(wf); AMB.wf = wf;
    const mhp = ctx.createBiquadFilter(), mlp = ctx.createBiquadFilter(), mg = ctx.createGain();   // the mood stage: neutral (20 Hz, 20 kHz, gain 1) until the story has a mood
    mhp.type = 'highpass'; mhp.frequency.value = 20; mhp.Q.value = 0.6; mlp.type = 'lowpass'; mlp.frequency.value = 20000; mlp.Q.value = 0.6; mg.gain.value = 1;
    wf.connect(mhp); mhp.connect(mlp); mlp.connect(mg); mg.connect(warm); AMB.mhp = mhp; AMB.mlp = mlp; AMB.mg = mg;
    const cue = ctx.createGain(); cue.gain.value = 1; cue.connect(warm); AMB.cue = cue;
    try {   // light reverb: a small room for indoor sounds, a wide one for the rest; ambApply sets how much of each from the mix
      const rRoom = ctx.createConvolver(), rHall = ctx.createConvolver(), sR = ctx.createGain(), sH = ctx.createGain(), cs = ctx.createGain();
      rRoom.buffer = ambIR(ctx, 0.7); rHall.buffer = ambIR(ctx, 2.2); sR.gain.value = 0; sH.gain.value = 0; cs.gain.value = 0.22;
      cb.connect(sR); sR.connect(rRoom); rRoom.connect(wf); cb.connect(sH); sH.connect(rHall); rHall.connect(wf); cue.connect(cs); cs.connect(rHall); AMB.sR = sR; AMB.sH = sH;
    } catch (e) { /* no reverb here: the sounds simply stay dry */ }   // story sounds skip the voice dip: they land on a spoken word
    AMB.pink = ambNoise(ctx, 'pink'); AMB.brown = ambNoise(ctx, 'brown'); AMB.white = ambNoise(ctx, 'white'); AMB.drops = ambMakeDrops(ctx);
    ['thunder', 'birds', 'creaks', 'bell', 'clock', 'heartbeat', 'drips', 'steps', 'hooves', 'clang', 'cannon'].forEach(n => { const g = ctx.createGain(); g.gain.value = 0; g.connect(duck); AMB.g[n] = g; });   // one-off event sounds: no running source, so no cost
    AMB.built = true; return true;
  }
  const AMB_LAYER = {
    rain: ({ ctx, src, mk, filt, lfo, go, pan, pink, brown, white }) => {   // four layers that drift apart: a low wash, the steady rain, a bright hiss and a fine patter (level matched to the old single layer)
      const g = mk('rain'), bus = ctx.createGain(); bus.gain.value = 1.22; bus.connect(g);
      const wp = filt('bandpass', 900, 0.9), wg = ctx.createGain(); wg.gain.value = 0.5; wp.connect(wg); wg.connect(pan(0.043, 0.35, bus)); src(pink, wp); lfo(0.05, 0.14, wg.gain);
      const hp = filt('highpass', 500), lp = filt('lowpass', 9000), sg = ctx.createGain(); sg.gain.value = 0.7; hp.connect(lp); lp.connect(sg); sg.connect(bus); src(pink, hp); lfo(0.083, 0.1, sg.gain);
      const hp2 = filt('highpass', 4500), g2 = ctx.createGain(); g2.gain.value = 0.2; hp2.connect(g2); g2.connect(pan(0.057, 0.5, bus)); src(white, hp2); lfo(0.17, 0.06, g2.gain);
      const pb = filt('bandpass', 2600, 1.2), pg = ctx.createGain(); pg.gain.value = 0.18; pb.connect(pg); pg.connect(pan(0.071, 0.6, bus)); src(white, pb); lfo(7.3, 0.08, pg.gain); lfo(11.9, 0.06, pg.gain);
    },
    cafe: ({ ctx, src, mk, filt, lfo, go, pink, brown, white }) => {
      const g = mk('cafe');
      const bp1 = filt('bandpass', 380, 0.7), m1 = ctx.createGain(); m1.gain.value = 0.9; bp1.connect(m1); m1.connect(g); src(brown, bp1); lfo(0.23, 0.35, m1.gain);
      const bp2 = filt('bandpass', 1100, 0.9), m2 = ctx.createGain(); m2.gain.value = 0.5; bp2.connect(m2); m2.connect(g); src(pink, bp2); lfo(0.31, 0.3, m2.gain);
    },
    wind: ({ ctx, src, mk, filt, lfo, go, pan, pink, brown, white }) => {   // a steady bed, slow gusts, a thin whistle and a high rustle, each drifting at its own speed
      const g = mk('wind'), bus = ctx.createGain(); bus.gain.value = 0.95; bus.connect(g);
      const bp = filt('bandpass', 500, 1.1), w = ctx.createGain(); w.gain.value = 0.5; bp.connect(w); w.connect(pan(0.06, 0.55, bus)); src(pink, bp); lfo(0.07, 300, bp.frequency); lfo(0.09, 0.2, w.gain);
      const gb = filt('bandpass', 600, 0.8), gg = ctx.createGain(); gg.gain.value = 0.35; gb.connect(gg); gg.connect(pan(0.031, 0.7, bus)); src(pink, gb); lfo(0.037, 0.3, gg.gain); lfo(0.045, 250, gb.frequency);
      const wb = filt('bandpass', 1500, 4), wh = ctx.createGain(); wh.gain.value = 0.07; wb.connect(wh); wh.connect(pan(0.047, 0.8, bus)); src(pink, wb); lfo(0.061, 0.06, wh.gain); lfo(0.04, 500, wb.frequency);
      const rh = filt('highpass', 3200), rg = ctx.createGain(); rg.gain.value = 0.05; rh.connect(rg); rg.connect(bus); src(white, rh); lfo(0.11, 0.04, rg.gain);
    },
    waves: ({ ctx, src, mk, filt, lfo, go, pan, pink, brown, white }) => {   // the swell, a mid body, a backwash and bright foam, none of them in step
      const g = mk('waves'), bus = ctx.createGain(); bus.gain.value = 1.01; bus.connect(g);
      const lp = filt('lowpass', 900), w = ctx.createGain(); w.gain.value = 0.45; lp.connect(w); w.connect(pan(0.09, 0.5, bus)); src(brown, lp); lfo(0.11, 0.35, w.gain);
      const fh = filt('highpass', 2500), fg = ctx.createGain(); fg.gain.value = 0.12; fh.connect(fg); fg.connect(pan(0.083, 0.6, bus)); src(pink, fh); lfo(0.13, 0.1, fg.gain);
      const bb = filt('bandpass', 450, 0.9), bg = ctx.createGain(); bg.gain.value = 0.3; bb.connect(bg); bg.connect(pan(0.052, 0.4, bus)); src(pink, bb); lfo(0.07, 0.25, bg.gain);
      const rb = filt('bandpass', 1200, 0.5), rg = ctx.createGain(); rg.gain.value = 0.1; rb.connect(rg); rg.connect(bus); src(pink, rb); lfo(0.17, 0.08, rg.gain);
    },
    fire: ({ ctx, src, mk, filt, lfo, go, pink, brown, white }) => {   // a low glow, a mid roar and a faint hiss
      const g = mk('fire'), bus = ctx.createGain(); bus.gain.value = 1.01; bus.connect(g);
      const lp = filt('lowpass', 450), f = ctx.createGain(); f.gain.value = 0.4; lp.connect(f); f.connect(bus); src(brown, lp); lfo(0.4, 0.12, f.gain);
      const rb = filt('bandpass', 420, 0.8), rg = ctx.createGain(); rg.gain.value = 0.25; rb.connect(rg); rg.connect(bus); src(pink, rb); lfo(0.23, 0.12, rg.gain);
      const hb = filt('bandpass', 3500, 0.6), hg = ctx.createGain(); hg.gain.value = 0.05; hb.connect(hg); hg.connect(bus); src(white, hb); lfo(0.9, 0.03, hg.gain);
    },
    river: ({ ctx, src, mk, filt, lfo, go, pink, brown, white }) => {
      const g = mk('river'), bp = filt('bandpass', 1400, 0.5), a = ctx.createGain(); a.gain.value = 0.6; bp.connect(a); a.connect(g); src(pink, bp); lfo(0.8, 0.15, a.gain);
      const hp = filt('highpass', 3200), b = ctx.createGain(); b.gain.value = 0.14; hp.connect(b); b.connect(g); src(white, hp); lfo(1.7, 0.08, b.gain);
      const bp2 = filt('bandpass', 600, 0.8), c = ctx.createGain(); c.gain.value = 0.35; bp2.connect(c); c.connect(g); src(brown, bp2); lfo(0.45, 0.2, c.gain);
    },
    brown: ({ ctx, src, mk, filt, lfo, go, pink, brown, white }) => {
      const g = mk('brown'), lp = filt('lowpass', 700), b = ctx.createGain(); b.gain.value = 0.8; lp.connect(b); b.connect(g); src(brown, lp);
    },
    engine: ({ ctx, src, mk, filt, lfo, go, pink, brown, white }) => {
      const g = mk('engine'), lp = filt('lowpass', 150), e = ctx.createGain(); e.gain.value = 0.9; lp.connect(e); e.connect(g); src(brown, lp); lfo(0.6, 0.15, e.gain);
      [[38, 0.22], [76, 0.08]].forEach(([fr, v]) => { const o = ctx.createOscillator(), og = ctx.createGain(); o.frequency.value = fr; og.gain.value = v; o.connect(og); og.connect(g); go(o); });
      const lp2 = filt('lowpass', 500), h = ctx.createGain(); h.gain.value = 0.12; lp2.connect(h); h.connect(g); src(pink, lp2);
    },
    night: ({ ctx, src, mk, filt, lfo, go, pink, brown, white }) => {
      const g = mk('night');
      for (let i = 0; i < 3; i++) {
        const car = ctx.createOscillator(), am = ctx.createGain(), gate = ctx.createGain(), out = ctx.createGain();
        car.type = 'sine'; car.frequency.value = 4200 + i * 190; am.gain.value = 0.5; gate.gain.value = 0.5; out.gain.value = 0.1;
        car.connect(am); am.connect(gate); gate.connect(out); out.connect(g); go(car);
        lfo(26 + i * 3.5, 0.5, am.gain); lfo(0.33 + i * 0.13, 0.5, gate.gain);
      }
    },
    crowd: ({ ctx, src, mk, filt, lfo, go, pan, pink, brown, white }) => {   // many voices at once: speech-band layers that rise and fall at syllable speed, each drifting on its own, over a low murmur
      const g = mk('crowd'), bus = ctx.createGain(); bus.gain.value = 0.95; bus.connect(g);
      [[420, 0.9, 3.7, 0.5], [900, 1.1, 4.6, 0.6], [1700, 1.2, 5.4, 0.45], [2900, 1.4, 6.3, 0.2]].forEach(([f, q, r, v], i) => {
        const bp = filt('bandpass', f, q), gn = ctx.createGain(); gn.gain.value = v * 0.6; bp.connect(gn); gn.connect(pan(0.03 + i * 0.013, 0.6, bus)); src(pink, bp); lfo(r, v * 0.35, gn.gain); lfo(0.11 + i * 0.07, v * 0.25, gn.gain);
      });
      const lp = filt('lowpass', 260), lg = ctx.createGain(); lg.gain.value = 0.35; lp.connect(lg); lg.connect(bus); src(brown, lp); lfo(0.15, 0.12, lg.gain);
    },
    train: ({ ctx, src, mk, filt, lfo, go, pan, pink, brown, white }) => {   // a deep rumble, the clickety-clack of the rails and a slow chug; the speed drifts a little, as a real train's does
      const g = mk('train'), bus = ctx.createGain(); bus.gain.value = 0.95; bus.connect(g);
      const lp = filt('lowpass', 140), rg = ctx.createGain(); rg.gain.value = 0.7; lp.connect(rg); rg.connect(bus); src(brown, lp); lfo(0.3, 0.1, rg.gain);
      const cb = filt('bandpass', 1900, 1.4), cg = ctx.createGain(); cg.gain.value = 0.13; cb.connect(cg); cg.connect(bus); src(white, cb); lfo(5.6, 0.13, cg.gain);
      const c2 = filt('bandpass', 700, 1.1), c2g = ctx.createGain(); c2g.gain.value = 0.15; c2.connect(c2g); c2g.connect(bus); src(pink, c2); lfo(5.6, 0.15, c2g.gain);
      const ch = filt('lowpass', 420), chg = ctx.createGain(); chg.gain.value = 0.18; ch.connect(chg); chg.connect(pan(0.05, 0.3, bus)); src(pink, ch); lfo(1.9, 0.16, chg.gain);
    },
    drone: ({ ctx, src, mk, filt, lfo, go, pink, brown, white }) => {
      const g = mk('drone'), lp = filt('lowpass', 240), p = ctx.createGain(); p.gain.value = 0.3; lp.connect(p); p.connect(g);
      [[55, 'sawtooth', 0.5], [55.35, 'sawtooth', 0.5], [82.4, 'sine', 0.5], [77.8, 'sine', 0.18]].forEach(([fr, ty, v]) => { const o = ctx.createOscillator(), og = ctx.createGain(); o.type = ty; o.frequency.value = fr; og.gain.value = v; o.connect(og); og.connect(lp); go(o); });
      lfo(0.05, 0.12, p.gain); lfo(0.03, 40, lp.frequency);
    }
  };
  function ambLayerOn(k) {
    const rb = ambRecBuf(k);
    if (rb) { ambRecLayer(k, rb); return; }   // a real recording plays this sound
    if (P.ambSrc === 'rec' && AMB_REC_KEYS.has(k)) { AMB.live[k] = { nodes: [], lfos: [], off: 0 }; return; }   // recordings only: stay quiet until the recording is ready
    const ctx = AMB.ctx, nodes = [], lfos = [];
    const H = {
      ctx, pink: AMB.pink, brown: AMB.brown, white: AMB.white,
      src: (buf, out) => {   // two copies of the noise loop, a hair apart in speed: they only line up again after about an hour, so the loop is never heard
        const m = ctx.createGain(); m.gain.value = 0.7071; m.connect(out);
        [1, 1.0037].forEach(rt => { const n = ctx.createBufferSource(); n.buffer = buf; n.loop = true; n.playbackRate.value = rt; n.connect(m); n.start(0, Math.random() * Math.max(1, buf.duration - 1)); nodes.push(n); });
      },
      mk: name => { const g = ctx.createGain(); g.gain.value = 0; g.connect(AMB.duck); AMB.g[name] = g; return g; },
      filt: (type, f, q) => { const n = ctx.createBiquadFilter(); n.type = type; n.frequency.value = f; if (q) n.Q.value = q; return n; },
      lfo: (rate, depth, target) => {   // a slow movement made of two unrelated speeds; ambWander keeps changing them, so it never repeats
        const slow = rate <= 5, o = ctx.createOscillator(), d = ctx.createGain(); o.frequency.value = rate; d.gain.value = depth * (slow ? 0.75 : 1); o.connect(d); d.connect(target); o.start(); nodes.push(o); lfos.push({ o, r: rate });
        if (slow) { const o2 = ctx.createOscillator(), d2 = ctx.createGain(); o2.frequency.value = rate * 1.618; d2.gain.value = depth * 0.3; o2.connect(d2); d2.connect(target); o2.start(); nodes.push(o2); lfos.push({ o: o2, r: rate * 1.618 }); }
      },
      pan: (rate, depth, out) => { if (!ctx.createStereoPanner) return out; const p = ctx.createStereoPanner(); p.connect(out); H.lfo(rate, depth, p.pan); return p; },   // a slow left-right drift
      go: o => { o.start(); nodes.push(o); }
    };
    AMB.live[k] = { nodes, lfos, off: 0 };
    AMB_LAYER[k](H);
  }
  function ambLayerOff(k) {   // stop a sound that has been at zero, so it uses no CPU
    const l = AMB.live[k]; if (!l) return;
    l.nodes.forEach(n => { try { n.stop(); } catch (e) {} try { n.disconnect(); } catch (e) {} });
    if (AMB.g[k]) { try { AMB.g[k].disconnect(); } catch (e) {} delete AMB.g[k]; }
    delete AMB.live[k];
  }
  /* ---------- real recordings ----------
     Sound source (Settings > Audio): Generated = only the sounds made on the device; Hybrid = a real recording where one
     exists, the generated sound for the rest; Recordings = real recordings only. Recordings are listed in recordings.json
     in the repo (a sound name, a file, who made it and its licence), downloaded once and kept in the browser cache so they
     work offline. For trying one out, a file or a link can be set for a single sound. Only the steady sounds can be
     recordings; one-off sounds (thunder, bell, birds, creaks, drips, clock, heartbeat) are always generated. */
  const AMB_REC_KEYS = new Set(['rain', 'wind', 'waves', 'river', 'night', 'fire', 'cafe', 'drone', 'engine', 'brown', 'crowd', 'train']);
  const AMB_REC_NAMES = { rain: 'Rain', wind: 'Wind', waves: 'Waves', river: 'River', night: 'Night', fire: 'Fire', cafe: 'Café', drone: 'Drone', engine: 'Engine room', brown: 'Brown noise', crowd: 'Crowd', train: 'Train' };
  const ambRecBuf = k => (P.ambSrc === 'gen' || !AMB_REC_KEYS.has(k)) ? null : (AMB.rec[k] || null);
  function ambRecSrc(k) {   // where this sound's recording comes from: the reader's own test file or link first, then the repo list
    const u = (P.ambRecUser || {})[k];
    if (u && u.kind === 'file') return { key: 'https://wt-rec.invalid/user/' + k, url: '', name: u.name, own: true };
    if (u && u.kind === 'url' && u.url) return { key: u.url, url: u.url, name: u.url, own: true };
    const m = AMB.recMap[k]; return m ? { key: m.url, url: m.url, name: m.by ? m.by + ' (' + (m.license || 'CC0') + ')' : (m.license || ''), own: false } : null;
  }
  function ambRecPrep(buf) {   // level it to a steady loudness, and blend the end into the start so the loop has no seam
    const sr = buf.sampleRate, len = buf.length, ch = buf.numberOfChannels;
    let sum = 0, n = 0; const d0 = buf.getChannelData(0); for (let i = 0; i < len; i += 7) { sum += d0[i] * d0[i]; n++; }
    const rms = Math.sqrt(sum / Math.max(1, n)) || 0.1, gain = Math.max(0.15, Math.min(5, 0.12 / rms));
    const fade = buf.duration > 6 ? Math.floor(Math.min(1.5, buf.duration * 0.2) * sr) : 0, nl = len - fade;
    const out = AMB.ctx.createBuffer(ch, Math.max(1, nl), sr);
    for (let c = 0; c < ch; c++) {
      const a = buf.getChannelData(c), o = out.getChannelData(c);
      for (let i = 0; i < nl; i++) o[i] = a[i] * gain;
      for (let i = 0; i < fade; i++) { const t = i / fade, wi = Math.sin(t * Math.PI / 2), wo = Math.cos(t * Math.PI / 2); o[i] = (a[i] * wi + a[nl + i] * wo) * gain; }
    }
    return out;
  }
  function ambRecLayer(k, buf) {
    const ctx = AMB.ctx, g = ctx.createGain(); g.gain.value = 0; g.connect(AMB.duck); AMB.g[k] = g;
    const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.connect(g); s.start(0, Math.random() * Math.max(0.1, buf.duration - 0.5));
    AMB.live[k] = { nodes: [s], lfos: [], off: 0, rec: true };
  }
  async function ambRecLoad(k) {
    if (!AMB.ctx || AMB.rec[k] || AMB.recBusy[k] || Date.now() - (AMB.recFail[k] || 0) < 60000) return;
    const u = ambRecSrc(k); if (!u) return;
    AMB.recBusy[k] = true; ambRecPaint();
    try {
      let resp = null, cache = null;
      try { cache = await caches.open('wt-amb-rec'); resp = await cache.match(u.key); } catch (e) { /* no cache here: download each time */ }
      if (!resp) {
        if (!u.url) throw new Error('missing');
        const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 30000);
        const r = await fetch(u.url, { signal: ctl.signal }); clearTimeout(to);
        if (!r.ok) throw new Error('http ' + r.status);
        if (cache) { try { await cache.put(u.key, r.clone()); } catch (e) { /* too big or blocked: still play it */ } }
        resp = r;
      }
      const buf = await AMB.ctx.decodeAudioData(await resp.arrayBuffer());
      AMB.rec[k] = ambRecPrep(buf); delete AMB.recFail[k];
    } catch (e) { AMB.recFail[k] = Date.now(); }
    AMB.recBusy[k] = false; ambRecPaint(); ambSrcRefresh(k);
  }
  function ambSrcRefresh(k) {   // the source or a recording changed: rebuild the steady sounds so they use the right one
    if (!AMB.built) return;
    Object.keys(AMB.live).forEach(x => { if (AMB_REC_KEYS.has(x) && (!k || x === k)) ambLayerOff(x); });
    ambApply(0.6);
  }
  async function ambRecManifest() {
    const set = (d, base) => { if (!d || typeof d !== 'object') return; AMB.recMap = {}; Object.keys(d).forEach(k => { const m = d[k]; if (AMB_REC_KEYS.has(k) && m && m.file) { try { AMB.recMap[k] = { url: new URL(m.file, base).href, by: m.by || '', license: m.license || '' }; } catch (e) { /* bad address */ } } }); };
    try {
      const c = store.get('wt:ambrec', null);
      if (c && c.d) set(c.d, c.base);
      if (c && Date.now() - c.t < 24 * 3600e3) return;
      const base = 'https://raw.githubusercontent.com/' + ghCfg().repo + '/main/';
      const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 8000);
      const r = await fetch(base + 'recordings.json', { signal: ctl.signal }); clearTimeout(to);
      if (!r.ok) return;
      const d = await r.json(); set(d, base); store.set('wt:ambrec', { t: Date.now(), d, base }); ambRecPaint();
    } catch (e) { /* offline, or no recordings.json in the repo yet */ }
  }
  function ambRecPaint() {
    $$('#seg-ambsrc button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === (P.ambSrc || 'hybrid'))));
    const sel = $('#amb-rec-k'), st = $('#amb-rec-st'); if (!sel || !st) return;
    const k = sel.value, u = ambRecSrc(k), nm = AMB_REC_NAMES[k] || k;
    st.textContent = AMB.recBusy[k] ? nm + ': getting the recording...' : AMB.rec[k] ? nm + ': ' + (u && u.own ? 'your test recording' : 'real recording') + (u && u.name ? ' (' + u.name + ')' : '') + '.' : u ? (AMB.recFail[k] ? nm + ': the recording could not be loaded, so ' + (P.ambSrc === 'rec' ? 'it is silent.' : 'the generated sound plays.') : nm + ': a recording is set; it loads when the sound plays.') : nm + ': no recording yet, so the generated sound plays.';
    const any = Object.keys(P.ambRecUser || {}).length > 0; const rs = $('#amb-rec-reset'); if (rs) rs.disabled = !(P.ambRecUser || {})[k];
    const note = $('#amb-src-note'); if (note) note.textContent = (P.ambSrc || 'hybrid') === 'gen' ? 'Only sounds made on this device.' : (P.ambSrc === 'rec' ? 'Real recordings only. Sounds with no recording are silent, except one-off sounds like thunder.' : 'Real recordings where there is one, generated sound for the rest.');
  }
  async function ambRecPick(file) {
    const k = $('#amb-rec-k').value; if (!file) return;
    try {
      if (!ambBuild()) throw new Error('no audio');
      const ab = await file.arrayBuffer();
      const buf = await AMB.ctx.decodeAudioData(ab.slice(0));
      try { const c = await caches.open('wt-amb-rec'); await c.put('https://wt-rec.invalid/user/' + k, new Response(ab, { headers: { 'content-type': file.type || 'audio/mpeg' } })); } catch (e) { /* works for this session only */ }
      AMB.rec[k] = ambRecPrep(buf); delete AMB.recFail[k];
      P.ambRecUser = Object.assign({}, P.ambRecUser, { [k]: { kind: 'file', name: file.name } }); ambRecUse(k);
    } catch (e) { toast('That file could not be read as audio.', 3500); }
  }
  function ambRecUse(k) {   // after a test recording is set: make sure it is heard, then open the mixer so it can be played
    if (P.ambSrc === 'gen') P.ambSrc = 'hybrid';
    const L = Object.assign({}, ambLevels()); if (!(L[k] > 0)) { P.amb = Object.assign({}, P.amb, { [k]: 60 }); }
    savePrefs(); ambRecPaint(); ambSrcRefresh(k);
    toast('Test recording ready. Opening the mixer so you can hear it.', 3000);
    closeSheets(); ambOpen(); setTimeout(() => ambAudition(k), 500);
  }
  function ambRecInit() {
    const sel = $('#amb-rec-k'); if (!sel) return;
    AMB_REC_KEYS.forEach(k => { const o = document.createElement('option'); o.value = k; o.textContent = AMB_REC_NAMES[k] || k; sel.append(o); });
    sel.addEventListener('change', ambRecPaint);
    $$('#seg-ambsrc button').forEach(b => b.addEventListener('click', () => { P.ambSrc = b.dataset.v; savePrefs(); ambRecPaint(); ambSrcRefresh(); if (P.ambSrc !== 'gen') ambRecManifest(); }));
    const f = $('#amb-rec-file');
    $('#amb-rec-pick').addEventListener('click', () => { f.value = ''; f.click(); });
    f.addEventListener('change', () => ambRecPick(f.files && f.files[0]));
    $('#amb-rec-url').addEventListener('click', async () => {
      const k = sel.value, u = (prompt('Link to an audio file (https, MP3, M4A, WAV or OGG). The site must allow other sites to use it.') || '').trim();
      if (!u) return;
      if (!/^https:\/\//i.test(u)) { toast('The link must start with https://', 3000); return; }
      try { if (!ambBuild()) throw 0; const r = await fetch(u); if (!r.ok) throw 0; const ab = await r.arrayBuffer(); const buf = await AMB.ctx.decodeAudioData(ab.slice(0));
        try { const c = await caches.open('wt-amb-rec'); await c.put(u, new Response(ab, { headers: { 'content-type': r.headers.get('content-type') || 'audio/mpeg' } })); } catch (e) { /* session only */ }
        AMB.rec[k] = ambRecPrep(buf); delete AMB.recFail[k]; P.ambRecUser = Object.assign({}, P.ambRecUser, { [k]: { kind: 'url', url: u, name: u.replace(/^https:\/\//i, '').slice(0, 40) } }); ambRecUse(k);
      } catch (e) { toast('That link could not be loaded as audio.', 3500); }
    });
    $('#amb-rec-reset').addEventListener('click', () => { const k = sel.value, o = Object.assign({}, P.ambRecUser); delete o[k]; P.ambRecUser = o; delete AMB.rec[k]; try { caches.open('wt-amb-rec').then(c => c.delete('https://wt-rec.invalid/user/' + k)); } catch (e) { /* nothing cached */ } savePrefs(); ambRecPaint(); ambSrcRefresh(k); if (P.ambSrc !== 'gen') ambRecLoad(k); });
    ambRecPaint();
  }
  function ambApply(tc) {   // tc = fade time constant; scene and book changes pass a slow one so the sounds crossfade
    if (!AMB.built) return;
    const L = ambLive(), t = AMB.ctx.currentTime;
    const recOk = !!(AMB.preview || AMB.aud || ambPlaying());   // recordings are fetched only once the book is really playing, so they never compete with the book's own audio while it loads
    AMB_SOUNDS.forEach(([k]) => {
      const lv = L[k] || 0, live = AMB.live[k];
      if (recOk && lv > 0 && P.ambSrc !== 'gen' && AMB_REC_KEYS.has(k) && !AMB.rec[k]) ambRecLoad(k);
      if (lv > 0 && AMB_LAYER[k] && !live) ambLayerOn(k);
      const l = AMB.live[k], g = AMB.g[k]; if (!g) return;
      g.gain.setTargetAtTime(Math.pow(lv / 100, 1.6) * 0.9, t, tc || 0.15);
      if (l) {
        if (lv > 0 && l.off) { clearTimeout(l.off); l.off = 0; }
        else if (lv === 0 && !l.off) l.off = setTimeout(() => { if (!(ambLive()[k] > 0)) ambLayerOff(k); }, Math.max(5000, (tc || 0.15) * 7000));
      }
    });
    if (AMB.sR && !AMB.spaceApplied) { const m = ambRoomMix(L); AMB.sR.gain.setTargetAtTime(m[0], t, 1.2); AMB.sH.gain.setTargetAtTime(m[1], t, 1.2); }   // spatial scene overrides the mix-based send while text context is active
    ambMoodApply(tc);
  }
  const ambVol = () => (P.ambVol == null ? 70 : P.ambVol) / 100;
  function ambMaster() { if (AMB.built && AMB.on) AMB.master.gain.setTargetAtTime(ambVol(), AMB.ctx.currentTime, 0.1); }
  /* Remember the mix per book, and per kind of book (the last mix used on a gothic book starts the next gothic book). */
  function ambSaveMix() {
    if (!S.book) return;
    const full = ambFull(ambLevels()), id = String(S.book.id), sug = ambSuggest(S.book);
    P.ambBook = P.ambBook || {}; delete P.ambBook[id]; P.ambBook[id] = full;
    const ks = Object.keys(P.ambBook); if (ks.length > 60) delete P.ambBook[ks[0]];
    if (sug) { P.ambG = P.ambG || {}; P.ambG[sug.k] = full; }
    savePrefs();
  }
  function ambSpaceReset() {   // called on pause/end/book change: fall back to mix-driven room routing
    if (!AMB.spaceApplied) return;
    AMB.spaceApplied = '';
    if (AMB.built && AMB.sR) { const L = ambLive(), m = ambRoomMix(L), t = AMB.ctx.currentTime; AMB.sR.gain.setTargetAtTime(m[0], t, 1.8); AMB.sH.gain.setTargetAtTime(m[1], t, 1.8); }
    if (AMB.wf) AMB.wf.frequency.setTargetAtTime(20000, AMB.ctx.currentTime, 1.8);
  }
  function ambBookCheck() {   // when the book changes, switch to its saved mix (or the last one used for its kind)
    if (!S.book || AMB.bookId === String(S.book.id)) return;
    AMB.bookId = String(S.book.id); ambSpaceReset(); AMB.auto = null; AMB.autoId = null;
    const sug = ambSuggest(S.book), m = (P.ambBook || {})[AMB.bookId] || (sug && (P.ambG || {})[sug.k]);
    if (m) { P.amb = Object.assign(ambLevels(), m); savePrefs(); ambApply(0.9); }
    else if (sug && AMB.preset !== 'sleep') { P.amb = ambFull(sug.L); savePrefs(); ambApply(0.9); }   // a book with no saved mix starts on the scene that suits it (not saved as the reader's own choice, so it follows the genre rules)
  }
  /* Dip under the voice. Two things happen while the narrator speaks: the sounds get a little quieter, and the
     speech band (the consonants, around 0.8 to 3 kHz) is carved out of them, so the words stay clear without
     the room tone vanishing. The exact sentence and word times say when speech starts, so the dip begins a
     moment before the first word and the sounds open up again in the pauses between sentences. If there are no
     exact times, the voice level from the audio analyser is used when it is running (visualizer or enhancer
     on); with neither, the sounds sit a little lower and carved while the book plays. */
  function ambVoiceSoon() {   // true or false from the exact times; null when there are none
    const sec = S.sec, p = S.plan && S.plan[sec];
    if (!p || !p.ids.length || S.loadingAudio || S.pendingSeek > 0 || audio.seeking || !trackDone(sec)) return null;
    const rate = audio.playbackRate || 1, t = nowT() + P.nudge, wt = S.wordT[sec] || {};
    const k = Core.locate(p.starts, t), w = wt[p.ids[k]];
    if (!w || !w.length) return null;
    if (t >= w[0] - 0.2 * rate && t <= w[w.length - 1] + 0.45 * rate) return true;   // inside the sentence (the dip starts just before its first word)
    const nw = wt[p.ids[k + 1]];
    return !!(nw && nw.length && t + 0.2 * rate >= nw[0]);   // the next sentence is about to start
  }
  function ambDuckScene() {   // what is being read decides how deep the dip is: dialogue dips more, description less; also drives spatial reverb
    const sc = AMB.scene = { dens: 0.5, hold: false };
    try {
      const sents = S.model && S.model.sents, id = S.curId;
      AMB.sceneId = id;
      if (AMB.lastSec !== S.sec) { AMB.swellUntil = performance.now() + 5000; AMB.lastSec = S.sec; }   // a new chapter or track: the scene opens up for a few seconds
      if (!sents || id == null || id < 0 || !sents[id]) return;
      if (id > 0 && sents[id - 1] && sents[id - 1].h && AMB.headId !== id) { AMB.headId = id; AMB.swellUntil = performance.now() + 5000; }   // the line after a heading
      let q = 0, n = 0;
      for (let i = Math.max(0, id - 2); i <= id; i++) { const t = sents[i] && sents[i].t; if (t == null) continue; n++; if (/["\u201c\u201d]/.test(t)) q++; }
      sc.dens = n ? q / n : 0.5;   // share of the last three sentences that are quoted speech
      const nx = sents[id + 1];   // a paragraph that ends on a question, a shout, a dash or a trailing-off: a held breath before the next one
      sc.hold = (!nx || nx.p !== sents[id].p) && /(?:[?!\u2026\u2014]|\.\.\.)["\u201d\u2019')\]]*$/.test(sents[id].t);
      /* Spatial: build a context window of recent sentences to stabilise the reading (current wins if explicit; else recent majority) */
      if (P.ambSmart !== false && AMB.on) {
        const window = 3, votes = { indoor: 0, outdoor: 0, occluded: 0, '': 0 };
        for (let i = Math.max(0, id - window + 1); i <= id; i++) {
          const st = sents[i] && sents[i].t, sp = ambSpaceDetect(st || ''), w = i === id ? 2 : 1;   // current sentence counts double
          votes[sp] = (votes[sp] || 0) + w;
        }
        const space = Object.keys(votes).reduce((a, b) => votes[b] > votes[a] ? b : a, '');
        if (space !== AMB.spaceApplied) ambSpaceApply(space, space === 'occluded' ? 0.5 : 1.5);
      }
    } catch (e) {}
  }
  function ambDuckVec(st) {   // [voice-band gain, cut at 3 kHz, cut at 800 Hz] for a state, and how fast to move there
    const v = { s: [0.68, -10, -4], p: [1, 0, 0], u: [0.8, -5, -2], o: [1, 0, 0] }[st] || [1, 0, 0];
    let tc = st === 's' ? 0.08 : (st === 'p' ? 0.35 : 0.4);
    if (P.ambSmart === false || (st !== 's' && st !== 'p')) return { v, tc };
    const sc = AMB.scene || { dens: 0.5, hold: false }, now = performance.now();
    if (st === 's') {
      const open = now < (AMB.swellUntil || 0) ? 1 : 0;
      v[0] = 0.78 - 0.2 * sc.dens + 0.1 * open; v[1] = -8.5 - 3 * sc.dens + 2.5 * open; v[2] = -3.25 - 1.5 * sc.dens + open;   // 0.5 of dialogue gives the old dip
    } else {
      const ps = now - (AMB.pauseSince || now);
      v[0] = sc.hold ? (ps < 2500 ? 0.88 : 1) : (ps > 800 ? 1.06 : 1);   // a long quiet lets the scene breathe up; after a cliffhanger it holds back, then lets go
      tc = sc.hold ? 0.5 : 0.9;
    }
    return { v, tc };
  }
  function ambDuckSet(st, slow) {   // s speaking, p pause, u unknown, o off. Dip fast, let go slowly.
    const ctx = AMB.ctx, t = ctx.currentTime, r = ambDuckVec(st), v = r.v, tc = slow ? Math.max(r.tc, 1.2) : r.tc;
    AMB.duckV = v.join();
    AMB.duck.gain.setTargetAtTime(v[0], t, tc);
    if (AMB.ca) { AMB.ca.gain.setTargetAtTime(v[1], t, tc); AMB.cb.gain.setTargetAtTime(v[2], t, tc); }
  }
  function ambDuckTick() {
    if (!AMB.on || !AMB.duck) return;
    let st = 'o';
    if (P.ambDuck !== false && ambPlaying()) {
      const soon = ambVoiceSoon();
      let heard = null, an = null; try { an = vgraph; } catch (e) {}
      if (an && an.getByteTimeDomainData) {
        const buf = AMB.dbuf || (AMB.dbuf = new Uint8Array(an.fftSize)); an.getByteTimeDomainData(buf);
        let sum = 0; for (let i = 0; i < buf.length; i++) { const v = (buf[i] - 128) / 128; sum += v * v; }
        if (Math.sqrt(sum / buf.length) > 0.02) AMB.lastVoice = performance.now();
        heard = performance.now() - (AMB.lastVoice || 0) < 400;
      }
      if (soon === null && heard === null) st = 'u';
      else st = (soon === true || heard === true) ? 's' : 'p';
    }
    if (P.ambSmart !== false && (S.curId !== AMB.sceneId || S.sec !== AMB.lastSec)) ambDuckScene();
    if (P.ambAuto !== false && (S.curId !== AMB.autoId || S.sec !== AMB.autoSec)) ambAutoStep();
    if (st !== AMB.duckS) { AMB.duckS = st; if (st === 'p') AMB.pauseSince = performance.now(); ambDuckSet(st); }
    else if ((st === 's' || st === 'p') && ambDuckVec(st).v.join() !== AMB.duckV) ambDuckSet(st, st === 's');   // the scene changed under a steady state: move there smoothly
  }
  function ambWander() {   // every few seconds one slow movement in each running sound drifts to a new speed
    const ctx = AMB.ctx; if (!ctx) return; const now = ctx.currentTime;
    for (const k in AMB.live) {
      const l = AMB.live[k]; if (!l || !l.lfos || !l.lfos.length) continue;
      const e = l.lfos[Math.floor(Math.random() * l.lfos.length)], span = e.r > 5 ? 0.08 : 0.4;
      try { e.o.frequency.setTargetAtTime(e.r * (1 - span + Math.random() * 2 * span), now, e.r > 5 ? 1 : 3); } catch (x) {}
    }
  }
  function ambClink() {
    if (AMB.on) { ambTod(); ambWander(); }
    const L = ambLive(); if (!AMB.on || !(L.cafe > 8) || (AMB.live.cafe && AMB.live.cafe.rec) || Math.random() < 0.4) return;
    const ctx = AMB.ctx, t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.value = 2200 + Math.random() * 2400;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.05 * (L.cafe / 100), t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
    o.connect(g); g.connect(AMB.duck || AMB.master); o.start(t); o.stop(t + 0.3);
  }
  function ambTone(dest, t, f0, f1, dur, vol, type, atk) {   // one short pitched note, used by the event sounds
    const ctx = AMB.ctx, o = ctx.createOscillator(), g = ctx.createGain(), pj = AMB.pj || 1;   // pj: this story sound's own slight pitch shift
    f0 *= pj; if (f1) f1 *= pj;
    o.type = type || 'sine'; o.frequency.setValueAtTime(f0, t); if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + (atk || 0.01)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + 0.05);
  }
  function ambMoreEvents(L, ctx, now) {   // birds, owl, creaks, bell, drips, clock, heartbeat
    const due = (k, a, b, lv) => { if (Date.now() < (AMB.nx[k] || 0)) return false; AMB.nx[k] = Date.now() + (a + Math.random() * (b - a)) * (1.7 - lv / 100); return true; };
    const G = AMB.g, t = now + 0.05;
    if (L.birds > 5 && due('birds', 1200, 6000, L.birds)) {
      const n = 2 + Math.floor(Math.random() * 4), f = 2200 + Math.random() * 2200, up = Math.random() < 0.6;
      const pb = ambPanTo(G.birds, Math.random() * 1.6 - 0.8);
      for (let i = 0; i < n; i++) ambTone(pb, t + i * (0.09 + Math.random() * 0.05), f * (1 + i * 0.03), f * (up ? 1.35 : 0.8), 0.08, 0.22, 'sine', 0.008);
    }
    if (L.night > 5 && G.night && due('owl', 25000, 70000, L.night)) {
      const po = ambPanTo(G.night, Math.random() * 1.6 - 0.8);
      const ow = 0.94 + Math.random() * 0.12, oa = 0.85 + Math.random() * 0.3;   // a different owl each time
      ambTone(po, t, 430 * ow, 370 * ow, 0.45, 0.5 * oa, 'sine', 0.09); ambTone(po, t + 0.6 + Math.random() * 0.15, 400 * ow, 330 * ow, 0.6, 0.45 * oa, 'sine', 0.09);
      if (Math.random() < 0.4) ambTone(po, t + 1.4 + Math.random() * 0.2, 390 * ow, 320 * ow, 0.7, 0.35 * oa, 'sine', 0.1);
    }
    if (L.creaks > 5 && due('creak', 12000, 40000, L.creaks)) {
      const dur = 0.5 + Math.random() * 0.9, o = ctx.createOscillator(), j = ctx.createOscillator(), jg = ctx.createGain(), bp = ctx.createBiquadFilter(), g = ctx.createGain(), f = 70 + Math.random() * 60;
      o.type = 'sawtooth'; o.frequency.setValueAtTime(f, t); o.frequency.linearRampToValueAtTime(f * (Math.random() < 0.5 ? 1.35 : 0.7), t + dur);
      j.frequency.value = 18 + Math.random() * 10; jg.gain.value = 9; j.connect(jg); jg.connect(o.frequency);
      bp.type = 'bandpass'; bp.frequency.value = 280 + Math.random() * 320; bp.Q.value = 6;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.28, t + 0.06); g.gain.setValueAtTime(0.28, t + dur * 0.6); g.gain.linearRampToValueAtTime(0, t + dur);
      o.connect(bp); bp.connect(g); g.connect(ambPanTo(G.creaks, Math.random() * 1.6 - 0.8)); o.start(t); j.start(t); o.stop(t + dur + 0.05); j.stop(t + dur + 0.05);
    }
    if (L.bell > 5 && due('bell', 35000, 90000, L.bell)) {
      const f0 = 180 + Math.random() * 120, pbl = ambPanTo(G.bell, Math.random() * 1.2 - 0.6);   // a distant bell: a few inharmonic partials that ring and die away
      [[1, 0.5, 6], [2, 0.25, 4], [2.4, 0.2, 3.5], [3, 0.12, 2.5], [4.2, 0.08, 1.8]].forEach(([m, v, d]) => ambTone(pbl, t, f0 * m, 0, d, v, 'sine', 0.005));
    }
    if (L.drips > 5 && due('drip', 1500, 6000, L.drips)) {
      const f = 1500 + Math.random() * 900, pd = ambPanTo(G.drips, Math.random() * 1.6 - 0.8); ambTone(pd, t, f, f * 0.45, 0.09, 0.4, 'sine', 0.003); ambTone(pd, t + 0.14, f * 0.9, f * 0.4, 0.08, 0.16, 'sine', 0.003);
    }
    if (L.clock > 5) {   // ticks are scheduled slightly ahead so they stay evenly spaced
      if (AMB.tickAt < now) AMB.tickAt = now + 0.05;
      while (AMB.tickAt < now + 0.7) {
        const tt = AMB.tickAt, hi = (AMB.tickAlt ^= 1), s = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), g = ctx.createGain();
        s.buffer = AMB.white; bp.type = 'bandpass'; bp.frequency.value = (hi ? 2300 : 1700) * (0.96 + Math.random() * 0.08); bp.Q.value = 3;
        g.gain.setValueAtTime(0, tt); g.gain.linearRampToValueAtTime(0.45 * (0.85 + Math.random() * 0.3), tt + 0.002); g.gain.exponentialRampToValueAtTime(0.0001, tt + 0.045);
        s.connect(bp); bp.connect(g); g.connect(G.clock); s.start(tt, Math.random() * 3); s.stop(tt + 0.06);
        ambTone(G.clock, tt, hi ? 900 : 700, 400, 0.04, 0.2, 'sine', 0.002);
        AMB.tickAt += 1;
      }
    }
    const burst = (dest, tt, type, f, q, vol, dur) => {   // a short burst of noise: the click of a hoof, the scuff of a shoe, the crack of a gun
      const s = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), g = ctx.createGain();
      s.buffer = AMB.white; bp.type = type; bp.frequency.value = f; bp.Q.value = q;
      g.gain.setValueAtTime(0, tt); g.gain.linearRampToValueAtTime(vol, tt + 0.003); g.gain.exponentialRampToValueAtTime(0.0001, tt + dur);
      s.connect(bp); bp.connect(g); g.connect(dest); s.start(tt, Math.random() * 3); s.stop(tt + dur + 0.03);
    };
    if (L.hooves > 5 && G.hooves && due('hooves', 14000, 42000, L.hooves)) {   // a horse passing: a trot or a canter that comes and goes from one side to the other
      const trot = Math.random() < 0.7, n = 8 + Math.floor(Math.random() * 8), gap = trot ? 0.32 : 0.17, side = Math.random() < 0.5 ? -1 : 1, base = 700 + Math.random() * 250;
      for (let i = 0; i < n; i++) {
        const tt = t + i * gap * (0.97 + Math.random() * 0.06), env = Math.sin(Math.PI * (i + 0.5) / n), hi = i & 1, pd = ambPanTo(G.hooves, side * (-0.8 + 1.6 * i / Math.max(1, n - 1)));
        burst(pd, tt, 'bandpass', (hi ? base : base * 0.8) * (0.95 + Math.random() * 0.1), 2.2, 0.5 * env + 0.05, 0.09);
        ambTone(pd, tt, hi ? 240 : 200, 110, 0.07, 0.35 * env + 0.03, 'sine', 0.002);
      }
    }
    if (L.steps > 5 && G.steps && due('steps', 9000, 28000, L.steps)) {   // someone walking: a few steady steps, left and right, loud then fading as they pass
      const n = 4 + Math.floor(Math.random() * 6), gap = 0.5 + Math.random() * 0.12, p0 = Math.random() * 1.2 - 0.6, f = 150 + Math.random() * 60;
      for (let i = 0; i < n; i++) {
        const tt = t + i * gap * (0.95 + Math.random() * 0.1), hi = i & 1, env = 0.6 + 0.4 * Math.sin(Math.PI * (i + 0.5) / n), pd = ambPanTo(G.steps, p0 + (hi ? 0.05 : -0.05));
        ambTone(pd, tt, f * (hi ? 1.1 : 1), f * 0.5, 0.09, 0.45 * env, 'sine', 0.003);
        burst(pd, tt, 'lowpass', 1400, 0.7, 0.18 * env, 0.07);
      }
    }
    if (L.cannon > 5 && G.cannon && due('cannon', 9000, 32000, L.cannon)) {   // guns far away: a deep boom with a rumbling tail, sometimes two or three in a row
      const k = 1 + (Math.random() < 0.35 ? 1 + Math.floor(Math.random() * 2) : 0), pc = ambPanTo(G.cannon, Math.random() * 1.6 - 0.8);
      for (let i = 0; i < k; i++) {
        const tt = t + i * (0.4 + Math.random() * 0.9), dur = 1.4 + Math.random() * 0.8, s = ctx.createBufferSource(), lp = ctx.createBiquadFilter(), g = ctx.createGain();
        s.buffer = AMB.brown; lp.type = 'lowpass'; lp.frequency.setValueAtTime(420, tt); lp.frequency.exponentialRampToValueAtTime(70, tt + dur);
        g.gain.setValueAtTime(0, tt); g.gain.linearRampToValueAtTime(1.6, tt + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, tt + dur);
        s.connect(lp); lp.connect(g); g.connect(pc); s.start(tt, Math.random() * 3); s.stop(tt + dur + 0.1);
        ambTone(pc, tt, 70, 32, 0.5, 0.7, 'sine', 0.006); ambTone(pc, tt, 130, 60, 0.25, 0.3, 'sine', 0.004);   // (the second tone is for phone speakers, which give nothing below about 200 Hz)
        burst(pc, tt, 'bandpass', 1200, 0.8, 0.22, 0.07);
      }
    }
    if (L.clang > 5 && G.clang && due('clang', 6000, 20000, L.clang)) {   // swords or a blacksmith's hammer: a ring of metal partials that die away
      const hits = 1 + Math.floor(Math.random() * 3), smith = Math.random() < 0.4, f0 = 520 + Math.random() * 420, pc = ambPanTo(G.clang, Math.random() * 1.4 - 0.7);
      for (let i = 0; i < hits; i++) {
        const tt = t + i * (smith ? 0.55 : 0.22 + Math.random() * 0.18), f = f0 * (0.9 + Math.random() * 0.25), dec = smith ? 0.9 : 0.5;
        [[1, 0.5, 1], [2.76, 0.32, 0.7], [5.4, 0.2, 0.45], [8.93, 0.1, 0.3]].forEach(([m, v, d]) => ambTone(pc, tt, f * m, 0, dec * d, v * 0.5, 'sine', 0.001));
        burst(pc, tt, 'highpass', 3000, 0.7, 0.3, 0.03);
      }
    }
    if (L.heartbeat > 5) {
      if (AMB.beatAt < now) AMB.beatAt = now + 0.05;
      while (AMB.beatAt < now + 0.7) {
        const tt = AMB.beatAt, hv = 0.9 + Math.random() * 0.2; ambTone(G.heartbeat, tt, 62, 40, 0.18, 0.9 * hv, 'sine', 0.012); ambTone(G.heartbeat, tt + 0.25 + Math.random() * 0.04, 56, 38, 0.16, 0.6 * hv, 'sine', 0.012);
        AMB.beatAt += 1.05 * (0.97 + Math.random() * 0.06);   // a living pulse is never exactly even
      }
    }
  }
  function ambEvents() {   // random crackles and thunder, scaled by their levels
    if (!AMB.on) return;
    const L = ambLive(), ctx = AMB.ctx, now = ctx.currentTime;
    ambMoreEvents(L, ctx, now); ambRain(L, ctx, now);
    if (L.fire > 5 && AMB.g.fire && !(AMB.live.fire && AMB.live.fire.rec) && Math.random() < 0.45) {
      const n = 1 + Math.floor(Math.random() * 3);
      for (let i = 0; i < n; i++) {
        const t = now + i * (0.03 + Math.random() * 0.07), s = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), g = ctx.createGain();
        s.buffer = AMB.white; bp.type = 'bandpass'; bp.frequency.value = 1200 + Math.random() * 3500; bp.Q.value = 1.2;
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.25 + Math.random() * 0.3, t + 0.003); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.02 + Math.random() * 0.05);
        s.connect(bp); bp.connect(g); g.connect(ambPanTo(AMB.g.fire, Math.random() * 1.4 - 0.7)); s.start(t, Math.random() * 3); s.stop(t + 0.1);
      }
    }
    if (L.thunder > 5 && Date.now() >= AMB.nextThunder) {
      AMB.nextThunder = Date.now() + (20000 + Math.random() * 45000) * (1.7 - L.thunder / 100);
      ambRoll(AMB.g.thunder, now + 0.05, 0.9, false);
    }
  }
