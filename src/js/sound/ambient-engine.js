  /* ---------- ambient-engine.js ----------
     Ambient: indoor / outdoor detection, the ONE shared AudioContext (audioCtx), and ambBuild, the audio graph. */
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
    const nz = {};   // each noise loop (about 4 MB) is made the first time a sound asks for it, so a sound that never uses brown noise never pays for it
    ['pink', 'brown', 'white'].forEach(k => Object.defineProperty(AMB, k, { configurable: true, enumerable: true, get() { return nz[k] || (nz[k] = ambNoise(ctx, k)); } }));
    AMB.drops = ambMakeDrops(ctx);
    ['thunder', 'birds', 'creaks', 'bell', 'clock', 'heartbeat', 'drips', 'steps', 'hooves', 'clang', 'cannon'].forEach(n => { const g = ctx.createGain(); g.gain.value = 0; g.connect(duck); AMB.g[n] = g; });   // one-off event sounds: no running source, so no cost
    AMB.built = true; return true;
  }
