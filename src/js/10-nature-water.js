/* 10-nature-water.js — P-A Nature & Water. One shared parameterised scene builder; every catalog variation = a params preset. */
SL.pack('P-A', { title: 'Nature & Water', version: 1 });
(function () {
  const R = (a, b) => a + Math.random() * (b - a), pk = a => a[Math.floor(Math.random() * a.length)], L = s => String(s || '').split(',').filter(Boolean);
  /* private helper 1: band = filter + gain + noise + ONE slow movement (gust on gain, or lfo). 9 nodes (gf adds a gust on frequency: +4) */
  function band(H, out, o) {
    const f = H.filt(o.t || 'bandpass', o.f, o.q || .8), g = H.ctx.createGain(); g.gain.value = o.g;
    f.connect(g); g.connect(out); H.src(o.n || H.pink, f);
    if (o.gust) H.gust(o.gust, o.g * (o.gd == null ? .9 : o.gd), g.gain); else if (o.lr) H.lfo(o.lr, o.ld == null ? o.g * .5 : o.ld, g.gain);
    if (o.gf) H.gust(o.gust || 1, o.gf, f.frequency);
    return g;
  }
  /* private helper 1b: cheap cicada (noise band + 95 Hz buzz + slow swell). 11 nodes. scr: scrape that retries (lab scrape can emit NaN for some durations) */
  function cicada(H, out, g, fm) { const b = band(H, out, { t: 'bandpass', f: 5000 * fm, q: 6, n: H.white, g: g * .6, lr: 95, ld: g * .5 }); H.lfo(.11, g * .25, b.gain); }
  function scr(H, d, t, dur, o) { for (let k = 0; k < 4; k++) { try { return H.scrape(d, t, dur + k * .0137, o); } catch (e) { } } }
  /* private helper 2: one-off events (spots) written to dest d at time t. p = scene params */
  const EV = {
    bird: (H, d, t, p) => H.birdChirp(d, t, { species: pk(L(p.sp || 'sparrow,robin,tit,dove')), vol: p.bv || .8 }),
    owl: (H, d, t, p) => H.birdChirp(d, t, { species: 'owl', vol: p.bv || .8 }),
    woodpecker: (H, d, t, p) => H.birdChirp(d, t, { species: 'woodpecker', vol: p.bv || .8 }),
    gull: (H, d, t, p) => H.birdChirp(d, t, { species: 'seagull', vol: p.bv || .8 }),
    crow: (H, d, t, p) => H.animalCall(d, t, 'crow', { pitch: 1, vol: p.bv || .8 }),
    raven: (H, d, t, p) => H.animalCall(d, t, 'crow', { pitch: .65, vol: p.bv || .8 }),
    animal: (H, d, t, p) => H.animalCall(d, t, pk(L(p.an || 'wolf,dog,owl,cow')), { pitch: R(.8, 1.2), vol: p.bv || .7 }),
    flock: (H, d, t) => { for (let k = 0; k < 3; k++) H.whoosh(d, t + R(0, .5), { dur: R(.4, .8), f0: 800, f1: 2600, vol: .35 }); for (let k = 0; k < 8; k++) H.nz(d, t + R(0, 1), 'white', 'bandpass', R(1800, 3500), 1, .12, .005, .04); H.birdChirp(d, t + .1, { species: 'random', vol: .5 }); },
    twig: (H, d, t) => H.impact(d, t, { mass: .08, hard: .95, ring: .12, bright: .6, vol: .35 }),
    scurry: (H, d, t) => { let tt = t; for (let k = 0, n = Math.round(R(3, 7)); k < n; k++) { H.step(d, tt, 'leaves', { weight: .05, speed: 1 }); tt += R(.05, .22); } },
    leafstep: (H, d, t) => { H.step(d, t, 'leaves', { weight: .5, speed: .4 }); H.step(d, t + R(.55, .8), 'leaves', { weight: .5, speed: .4 }); },
    leaffall: (H, d, t) => H.nz(d, t, 'white', 'bandpass', R(3500, 6500), .8, .06, .01, .08),
    creak: (H, d, t, p) => scr(H, d, t, R(.7, 2), { f: (p.cf || 450) * R(.7, 1.3), rough: .2 }),
    groan: (H, d, t, p) => scr(H, d, t, R(1.5, 3.5), { f: (p.cf || 200) * R(.7, 1.3), rough: .3, vol: 3 }),
    rope: (H, d, t) => scr(H, d, t, R(.5, 1.1), 'rope'),
    buoy: (H, d, t) => { H.bell(d, t, { f: R(420, 520), decay: 2.2, inharm: .9, vol: .12 }); H.impact(d, t, { mass: .5, hard: .6, ring: .8, bright: .5, vol: .12 }); },
    clank: (H, d, t) => H.impact(d, t, { mass: .3, hard: .6, ring: .8, bright: .5, vol: .2 }),
    drip: (H, d, t, p) => H.drip(d, t, { pitch: p.dp == null ? .5 : p.dp, size: p.dz == null ? .4 : p.dz, echo: p.de == null ? .3 : p.de }),
    drops: (H, d, t, p) => { let tt = t; for (let k = 0; k < 3; k++) { H.drip(d, tt, { pitch: R(.3, .8), size: .5, echo: .85 }); tt += R(.5, 1.2); } },
    splash: (H, d, t) => H.splash(d, t, { size: .3 }),
    plop: (H, d, t) => H.splash(d, t, { size: .08 }),
    ripple: (H, d, t) => { for (let k = 0; k < 3; k++) H.drip(d, t + k * R(.08, .2), { pitch: R(.7, .95), size: .05, echo: 0 }); },
    lap: (H, d, t) => { H.nz(d, t, 'pink', 'bandpass', R(500, 1100), 1.4, .25, .06, .3); H.bubbles(d, t + .1, 2, { size: .2, vol: .1 }); },
    bubbles: (H, d, t, p) => H.bubbles(d, t, 4 + Math.round(R(0, 6)), { size: p.bz == null ? .4 : p.bz }),
    rockfall: (H, d, t) => { let tt = t, g = .12; for (let k = 0; k < 8; k++) { H.impact(d, tt, { mass: R(.05, .3), hard: .9, ring: .2, vol: .22 * (1 - k * .08) }); tt += g * R(.5, 1.4); g *= 1.12; } },
    stone: (H, d, t) => { H.impact(d, t, { mass: .5, hard: .5, ring: .1, vol: .2 }); scr(H, d, t, .5, { f: 300, rough: .9, vol: 1.2 }); },
    rumble: (H, d, t) => { H.nz(d, t, 'brown', 'lowpass', 90, .7, .6, 1.2, 2.2); H.tone(d, t, 42, 32, 3, .15, 'sine', 1); },
    horn: (H, d, t) => { H.tone(d, t, 98, 96, 2.2, .07, 'sawtooth', .5); H.tone(d, t, 147, 145, 2.2, .04, 'triangle', .5); },
    quack: (H, d, t) => { for (let k = 0, n = Math.round(R(2, 4)); k < n; k++) { const tt = t + k * .24; H.tone(d, tt, R(480, 560), R(300, 360), .16, .1, 'square', .01); H.nz(d, tt, 'white', 'bandpass', 1300, 3, .1, .01, .12); } },
    diver: (H, d, t) => { H.nz(d, t, 'pink', 'bandpass', 1500, 1.1, .35, .8, .45); H.nz(d, t + 1.4, 'pink', 'bandpass', 900, 1, .3, .4, 1.1); H.bubbles(d, t + 1.5, 7, { size: .35, vol: .2 }); },
    whale: (H, d, t) => H.animalCall(d, t, 'whale', { pitch: R(.55, .9), vol: .9 }),
    dolphin: (H, d, t) => { H.tone(d, t, R(2600, 3400), R(6500, 8500), .5, .06, 'sine', .05); for (let k = 0; k < 8; k++) H.nz(d, t + .6 + k * R(.03, .07), 'white', 'highpass', 5000, 1, .1, .001, .01); },
    sonar: (H, d, t) => { [1, .35, .12].forEach((k, i) => H.tone(d, t + i * .9, 1200, 1200, .45, .3 * k, 'sine', .006)); },
    metal: (H, d, t) => { H.impact(d, t, { mass: .3, hard: .5, ring: .85, bright: .4, vol: .18 }); scr(H, d, t + .05, R(.5, 1.2), 'chain'); },
    wave: (H, d, t, p) => {   // swell -> crash -> backwash; wv size 0-1, wvF brightness Hz, wvD length scale
      const s = p.wv == null ? .5 : p.wv, f = p.wvF || 1100, D = p.wvD || 1, a = (1 + 2.2 * s) * D;
      H.nz(d, t, 'pink', 'bandpass', f * .7, .6, .5 + .5 * s, a, (1.5 + 3 * s) * D); H.nz(d, t + a * .9, 'white', 'bandpass', f * 1.6, .5, .12 + .22 * s * (p.crash || 1), .15 * D, (1.2 + 2 * s) * D);
      H.nz(d, t + a * .7, 'brown', 'lowpass', 160, .7, .3 * s, a * .5, 2.5 * D);
      if (p.hit) { H.impact(d, t + a, { mass: .85, hard: .3, ring: .1, vol: p.hit * .5, boom: 1 }); H.splash(d, t + a + .02, { size: .8 }); }
    }
  };
  /* ---- the one scene builder (all params optional, 0/absent = layer off) ---- */
  function scene(H, p) {
    const out = H.mk('scn'); let bus = out;
    if (p.lp) { bus = H.filt('lowpass', p.lp, .7); bus.connect(out); if (p.wob) H.lfo(.07, p.lp * p.wob * .35, bus.frequency); }
    const mid = H.ctx.createGain(); mid.gain.value = p.g == null ? 1 : p.g; mid.connect(bus);
    if (p.wet > 0) mid.connect(H.reverbSend(p.rv || 'open outdoor', p.wet, bus));
    const d = mid, K = p.flow || 1, B = (o) => band(H, d, o);
    if (p.wind > 0) { B({ f: p.wf || 420, q: .6, g: p.wind * .5, gust: .8 * K, gd: p.gust == null ? .8 : p.gust });
      if (p.whs > 0) B({ f: p.whf || 1700, q: 7, g: p.whs * .1, gust: .7 * K, gd: 0, gf: (p.whf || 1700) * .35 }); }
    if (p.leaf > 0) B({ f: p.lf || 3800, q: .6, g: p.leaf * .22, gust: .9 * K, gd: p.lg == null ? .9 : p.lg });
    if (p.ldry > 0) H.crackle(d, { density: .5 + p.ldry * .4, hardness: .25 }).gain.value = p.ldry * .5;
    if (p.rain > 0) { B({ f: 5200, q: .4, g: p.rain * .22, n: H.white, lr: .2 }); H.crackle(d, { density: .7, hardness: .3 }).gain.value = p.rain * .6; }
    if (p.water > 0) { const w = p.wf2 || 900, f = p.foam == null ? .5 : p.foam, bb = p.babble || 0;
      B({ t: 'lowpass', f: w, q: .6, g: p.water * .45, lr: .15 * K });
      if (f > 0 || bb > 0) B({ f: w * (2.2 + bb), q: .5 + bb * 2, g: p.water * (.28 * f + .1 * bb), n: bb > .3 ? H.pink : H.white, lr: (.5 + 5 * bb) * K }); }
    if (p.surf > 0) B({ f: p.sf || 700, q: .5, g: p.surf * .4, lr: .13, ld: p.surf * .22 });
    if (p.low > 0) B({ t: 'lowpass', f: p.lowf || 80, q: .7, g: p.low * .6, n: H.brown, lr: .1 });
    if (p.hum > 0) { const hg = H.ctx.createGain(); hg.gain.value = p.hum; hg.connect(d); H.tonalBed([{ f: p.hz || 55, g: .3, am: [.3, .06] }, { f: (p.hz || 55) * 2, g: .12, type: 'triangle' }], { lp: 400 }, hg); }
    if (p.ins > 0) { if (p.inT === 'cicada') cicada(H, d, p.ins, p.inF || 1); else H.insectBed({ type: p.inT || 'cricket', n: 1, f: p.inF || 1, g: p.ins }, d); }
    if (p.in2 > 0) { if (p.in2T === 'cicada') cicada(H, d, p.in2, p.inF || 1); else H.insectBed({ type: p.in2T || 'cricket', n: 1, f: (p.inF || 1) * 1.07, g: p.in2 }, d); }
    if (p.frog > 0) H.frogChorus({ n: 1, f: p.frF || 520, rate: .7, g: p.frog }, d);
    [['ev', 'evA', 'evB'], ['ev2', 'ev2A', 'ev2B']].forEach(([e, a, b]) => { const ev = L(p[e]); if (!ev.length) return;
      H.scheduler(ev.map(n => (t) => EV[n](H, d, t, p)), p[a] || 4000, p[b] || 14000, 50); });
    return out;
  }
  const T = (mood, place, weather, tod, season) => ({ mood, place, weather, tod, season, era: [] });
  const add = (id, name, cat, sub, fid, vol, tags, params, variants, extra) => SL.add(Object.assign({ id, name, cat, sub, kind: 'bed', src: 'synth', fidelity: fid, vol, tags, params, build: scene, variants, noSeam: true }, extra || {}));
  const F = '01 Nature', WA = '02 Water';
  /* ================= 01 NATURE ================= */
  add('nat.forest', 'Forest ambience', F, 'Forests and woodlands', 4, .55, T(['calm'], ['forest'], [], ['day'], []),
    { wind: .3, wf: 380, gust: .6, leaf: .35, ev: 'bird', sp: 'sparrow,robin,tit,dove', evA: 3000, evB: 12000, wet: .12, rv: 'open outdoor', bv: .6 },
    {
      'quiet forest': { wind: .15, leaf: .18, evA: 6000, evB: 20000, bv: .4 },
      'dense forest': { wind: .22, leaf: .5, lf: 3000, wet: .3, evA: 3500, evB: 9000, ev2: 'twig,leaffall', ev2A: 9000, ev2B: 25000, lp: 7000 },
      'open woodland': { wind: .4, wf: 450, leaf: .3, wet: .05, evA: 2500, evB: 8000, bv: .8 },
      'tropical forest': { wind: 0, leaf: .3, ins: .2, inT: 'cicada', frog: 0, sp: 'dove,cuckoo,tit', evA: 2500, evB: 8000, wet: .22 },
      'temperate forest': { wind: .3, leaf: .35, sp: 'robin,tit,sparrow,cuckoo' },
      'pine forest': { wind: .45, wf: 520, whs: .5, whf: 1500, leaf: .12, lf: 2400, gust: .9, sp: 'tit,dove', evA: 5000, evB: 18000 },
      'autumn forest': { wind: .35, leaf: .15, ldry: .35, ev: 'bird,leaffall', sp: 'crow,tit', evA: 3500, evB: 11000 },
      'winter forest': { wind: .35, wf: 330, leaf: 0, whs: .15, ev: 'twig,crow', evA: 9000, evB: 30000, lp: 5500, wet: .2, bv: .4 },
      'dawn forest': { wind: .1, leaf: .2, ev: 'bird', sp: 'robin,tit,sparrow,nightingale,dove', evA: 700, evB: 2500, bv: .85, wet: .18 },
      'daytime forest': { evA: 4000, evB: 12000 },
      'dusk forest': { wind: .15, leaf: .2, ev: 'bird', sp: 'dove,robin', ins: .1, evA: 8000, evB: 22000, bv: .4 },
      'nighttime forest': { wind: .18, leaf: .2, ev: 'owl', ins: .22, evA: 9000, evB: 24000, ev2: 'twig', ev2A: 12000, ev2B: 35000, lp: 6500, wet: .2 }
    });
  add('nat.foliage', 'Trees and foliage', F, 'Forests and woodlands', 4, .5, T(['calm'], ['forest'], ['windy'], [], []),
    { wind: .2, leaf: .35, wf: 350, gust: .8 },
    {
      'gentle leaves rustling': { leaf: .25, wind: .12 },
      'strong leaves rustling': { leaf: .75, wind: .45, gust: 1, lf: 3200 },
      'branches swaying': { leaf: .3, wind: .4, wf: 280, ev: 'creak', cf: 350, evA: 3500, evB: 9000, wet: .08 },
      'branches creaking': { leaf: .15, wind: .25, ev: 'creak,groan', cf: 300, evA: 1800, evB: 6000, wet: .12 },
      'leaves falling': { leaf: .08, wind: .1, ev: 'leaffall', evA: 400, evB: 1800 },
      'dry leaves underfoot': { leaf: 0, wind: .05, ldry: .6, ev: 'leafstep', evA: 1500, evB: 2200 },
      'palm leaves moving': { leaf: .5, lf: 2600, wind: .3, lg: 1, ev: 'leaffall', evA: 2500, evB: 8000 },
      'bamboo rustling': { leaf: .35, lf: 2200, wind: .3, ev: 'creak,twig', cf: 700, evA: 2500, evB: 7000, wet: .1 },
      'wind through pine needles': { leaf: .15, lf: 2000, wind: .45, wf: 520, whs: .7, whf: 1600, gust: 1 }
    });
  add('nat.floor', 'Forest floor', F, 'Forests and woodlands', 3, .4, T(['calm'], ['forest'], [], [], []),
    { wind: .08, ins: .15, ev: 'scurry,twig', evA: 4000, evB: 12000 },
    {
      'insects in undergrowth': { ins: .3, in2: .12, inT: 'cricket', in2T: 'cicada', ev: '', wind: 0 },
      'small animals moving in leaves': { ins: 0, ldry: .15, ev: 'scurry', evA: 1800, evB: 6000 },
      'twigs snapping': { ins: 0, ev: 'twig', evA: 2500, evB: 8000, wet: .15 },
      'damp woodland atmosphere': { wind: .08, leaf: 0, low: .1, ins: 0, ev: 'drip', dp: .6, dz: .2, de: .2, evA: 2000, evB: 7000, wet: .2, lp: 6000 }
    });
  add('nat.jungle', 'Jungle and rainforest', F, 'Forests and woodlands', 3, .5, T(['humid'], ['jungle'], ['humid'], [], []),
    { leaf: .25, ins: .22, inT: 'cicada', frog: .12, sp: 'cuckoo,dove,tit,sparrow', ev: 'bird', evA: 2000, evB: 7000, wet: .2, bv: .55 },
    {
      'tropical rainforest': {},
      'dense jungle': { leaf: .4, ins: .3, frog: 0, wet: .25, evA: 1800, evB: 5000, ev2: 'animal', an: 'dog,owl', ev2A: 12000, ev2B: 30000 },
      'canopy rain': { rain: .55, leaf: .15, ins: 0, frog: 0, wet: .1, lp: 7500, ev: 'drip', dp: .65, dz: .3, evA: 700, evB: 3000 },
      'jungle at dawn': { ins: .12, frog: 0, ev: 'bird', sp: 'cuckoo,nightingale,robin,tit', evA: 900, evB: 3000, bv: .75 },
      'jungle at night': { ins: .25, inT: 'cricket', frog: .3, leaf: 0, wet: .1, ev: 'owl', evA: 8000, evB: 20000, ev2: 'animal', an: 'wolf,owl', ev2A: 14000, ev2B: 35000 },
      'distant tropical birds': { leaf: .15, ins: 0, frog: 0, evA: 1800, evB: 5000, lp: 4500, wet: .4, bv: .5 },
      'frogs and insects': { leaf: 0, ins: .3, frog: .35, ev: '', wet: 0 },
      'humid forest atmosphere': { leaf: .15, ins: .15, frog: 0, low: .08, ev: 'drip', dp: .6, evA: 2500, evB: 8000, lp: 6000, wet: .22 }
    });
  add('nat.wildlife', 'Woodland wildlife', F, 'Forests and woodlands', 2, .5, T(['calm'], ['forest'], [], [], []),
    { sp: 'sparrow,robin,tit,dove', bv: .8, wet: .1 },
    {
      'distant birds': { sp: 'dove,robin,cuckoo', bv: .5, wet: .4, lp: 4000 },
      'close birds': { sp: 'sparrow,robin,tit,nightingale', bv: 1, wet: .05 },
      'scattered bird calls': { sp: 'sparrow,robin,tit,dove,cuckoo,random', bv: .7 },
      'owl calls': { sp: 'owl', bv: .9, wet: .25 },
      'woodpecker tapping': { sp: 'woodpecker', bv: .9, wet: .15 },
      'crows calling': { sp: 'crow', bv: .9, wet: .15 },
      'ravens calling': { sp: 'raven', bv: .9, wet: .25 },
      'flock taking flight': { sp: 'flock', wet: .1 },
      'distant animal calls': { sp: 'animal', bv: .5, wet: .5, lp: 3500 }
    }, {
      kind: 'spot', src: 'hybrid-hint', build: undefined, every: [4000, 14000], noSeam: false,
      play: (H, t, p) => { const s = p.sp, d = H.ctx.createGain(); d.gain.value = 1; d.connect(H.dest); if (p.wet > 0) d.connect(H.reverbSend(p.rv || 'open outdoor', p.wet));
        let tgt = d; if (p.lp) { tgt = H.filt('lowpass', p.lp, .7); tgt.connect(d); }
        const one = { flock: EV.flock, animal: EV.animal, owl: EV.owl, woodpecker: EV.woodpecker, crow: EV.crow, raven: EV.raven }[s];
        if (one) one(H, tgt, t, p); else { const n = 1 + Math.round(R(0, 2)); for (let k = 0; k < n; k++) EV.bird(H, tgt, t + k * R(.3, 1.6), p); } }
    });
  add('nat.meadow', 'Meadow ambience', F, 'Grasslands and open country', 4, .5, T(['calm'], ['meadow'], [], ['day'], []),
    { wind: .22, wf: 450, ins: .1, inT: 'cricket', inF: .8, ev: 'bird', sp: 'sparrow,robin,dove,tit', evA: 3500, evB: 11000, bv: .55 },
    {
      'quiet meadow': { wind: .12, ins: .06, evA: 7000, evB: 20000, bv: .4 },
      'breezy meadow': { wind: .4, gust: 1, leaf: .2, ins: 0, evA: 5000, evB: 14000 },
      'summer meadow': { ins: .15, in2: .1, in2T: 'cicada', inF: 1.05, evA: 4000, evB: 10000 },
      'spring meadow': { ins: 0, ev: 'bird', sp: 'robin,tit,sparrow,nightingale,cuckoo', evA: 1500, evB: 5000, bv: .7 },
      'insects in grass': { wind: .1, ins: .25, inT: 'cricket', in2: .12, in2T: 'cicada', ev: '' },
      'birds in grassland': { wind: .2, ins: 0, ev: 'bird', sp: 'sparrow,robin,dove,cuckoo', evA: 1500, evB: 5000, bv: .75 }
    });
  add('nat.prairie', 'Prairie and steppe', F, 'Grasslands and open country', 3, .5, T(['lonely'], ['prairie'], ['windy'], [], []),
    { wind: .35, wf: 420, gust: 1, ldry: .2, leaf: .1, lf: 2500 },
    {
      'gentle prairie wind': { wind: .22, gust: .6, ldry: .15 },
      'strong open-country wind': { wind: .75, wf: 520, gust: 1, whs: .25, ldry: .3, leaf: 0 },
      'dry grass rustling': { wind: .15, ldry: .55, leaf: .12 },
      'distant wildlife': { wind: .18, ldry: .1, ev: 'animal,crow', an: 'wolf,dog,cow', bv: .45, evA: 6000, evB: 20000, wet: .4, lp: 5000 }
    });
  add('nat.countryside', 'Countryside ambience', F, 'Grasslands and open country', 3, .5, T(['peaceful'], ['countryside'], [], [], []),
    { wind: .2, leaf: .12, ins: 0, ev: 'bird', sp: 'sparrow,robin,dove,tit', evA: 3000, evB: 9000, bv: .55, ev2: 'animal', an: 'cow,sheep,dog', ev2A: 15000, ev2B: 40000, wet: .1 },
    {
      'peaceful countryside': { wind: .15, evA: 4000, evB: 12000 },
      'rural morning': { ev: 'bird', sp: 'robin,tit,sparrow,nightingale,cuckoo', evA: 1000, evB: 3500, bv: .75, ev2: 'animal', an: 'cow,dog', ev2A: 12000, ev2B: 30000 },
      'rural afternoon': { wind: .25, ins: .15, in2: 0, leaf: 0, evA: 5000, evB: 14000 },
      'countryside at dusk': { wind: .12, ins: .15, ev: 'bird', sp: 'dove,robin', evA: 6000, evB: 18000, bv: .4, ev2: 'animal', an: 'sheep,dog', ev2A: 18000, ev2B: 45000 },
      'countryside at night': { wind: .1, leaf: .08, ins: .28, ev: 'owl', ev2: 'animal', an: 'dog', evA: 9000, evB: 25000, ev2A: 25000, ev2B: 60000, bv: .5, lp: 6500 }
    });
  add('nat.mountain', 'Mountain ambience', F, 'Mountains, valleys and cliffs', 4, .5, T(['vast'], ['mountain'], ['windy'], [], []),
    { wind: .45, wf: 360, gust: 1, whs: .25, whf: 1400, lowf: 70, low: .1, wet: .15, rv: 'open outdoor' },
    {
      'alpine breeze': { wind: .28, wf: 420, whs: .1, gust: .7, ev: 'bird', sp: 'tit,robin', evA: 6000, evB: 20000, bv: .35 },
      'strong mountain wind': { wind: .8, wf: 460, whs: .5, whf: 1600, gust: 1, low: .15 },
      'high-altitude wind': { wind: .55, wf: 600, whs: .6, whf: 2100, gust: 1, low: .05, lp: 6500 },
      'snowy mountain': { wind: .35, wf: 300, whs: .15, low: .08, lp: 4500, wet: .2 },
      'mountain pass': { wind: .6, wf: 380, whs: .45, whf: 1200, gust: 1, wet: .3, rv: 'stone corridor' },
      'rocky mountain ambience': { wind: .35, whs: .2, ev: 'stone,rockfall,crow', evA: 6000, evB: 20000, wet: .3, bv: .5 }
    });
  add('nat.valley', 'Valley ambience', F, 'Mountains, valleys and cliffs', 3, .5, T(['peaceful'], ['valley'], [], [], []),
    { wind: .18, wf: 400, ev: 'bird', sp: 'dove,robin,cuckoo', evA: 4000, evB: 12000, bv: .5, wet: .35, rv: 'hall' },
    {
      'quiet valley': { wind: .1, evA: 7000, evB: 22000 },
      'wind through valley': { wind: .5, wf: 340, gust: 1, whs: .2, ev: '', wet: .3 },
      'distant echoes': { wind: .1, sp: 'cuckoo,crow,dove', wet: .6, bv: .6, evA: 5000, evB: 14000, lp: 5500 },
      'distant river in valley': { wind: 0, leaf: 0, water: .22, wf2: 700, foam: .4, lp: 5500, ev: '', wet: .2 }
    });
  add('nat.cliff', 'Cliff and rocky landscape', F, 'Mountains, valleys and cliffs', 3, .5, T(['bleak'], ['cliff'], ['windy'], [], []),
    { wind: .45, wf: 400, gust: 1, whs: .2, wet: .2 },
    {
      'wind over rocks': { wind: .55, wf: 450, whs: .35, whf: 1500, gust: 1 },
      'loose stones falling': { wind: .2, ev: 'rockfall,stone', evA: 4000, evB: 13000, wet: .35 },
      'distant seabirds': { wind: .3, surf: .12, sf: 600, ev: 'gull', evA: 3000, evB: 9000, bv: .5, lp: 6000, wet: .3 },
      'echoing ravine': { wind: .2, whs: .1, ev: 'drip,stone', dp: .4, de: .8, evA: 4000, evB: 12000, wet: .6, rv: 'cave', lp: 5000 }
    });
  add('nat.cave', 'Cave ambience', F, 'Caves and underground natural spaces', 4, .45, T(['eerie'], ['cave'], [], [], []),
    { low: .25, lowf: 60, wind: .06, wf: 250, ev: 'drip', dp: .5, dz: .4, de: .6, evA: 3000, evB: 12000, wet: .5, rv: 'cave', lp: 4500 },
    {
      'small cave': { rv: 'small room', wet: .45, evA: 2500, evB: 9000 },
      'large cavern': { rv: 'cathedral', wet: .55, low: .3, de: .8, evA: 4000, evB: 14000 },
      'deep cave': { low: .4, lowf: 45, wind: .03, wet: .5, lp: 2800, evA: 6000, evB: 20000 },
      'narrow tunnel': { rv: 'stone corridor', wind: .15, wf: 300, whs: .08, wet: .45, evA: 5000, evB: 15000 },
      'echoing chamber': { wet: .75, rv: 'cathedral', de: .9, evA: 3500, evB: 11000 },
      'underground lake cave': { water: .1, wf2: 500, foam: 0, ev: 'drip,lap', evA: 2500, evB: 8000, wet: .55 }
    });
  add('nat.cavedetail', 'Cave details', F, 'Caves and underground natural spaces', 3, .45, T(['eerie'], ['cave'], [], [], []),
    { low: .12, wet: .5, rv: 'cave', lp: 4500, ev: 'drip', dp: .5, evA: 3000, evB: 10000 },
    {
      'slow water drips': { ev: 'drip', evA: 3500, evB: 8000 },
      'rapid dripping': { ev: 'drip', dp: .6, dz: .25, evA: 350, evB: 1200 },
      'underground stream': { water: .25, wf2: 600, foam: .3, babble: .6, ev: '', lp: 4000 },
      'hollow wind': { wind: .3, wf: 280, whs: .25, whf: 700, gust: 1, ev: '' },
      'distant rumble': { low: .25, lowf: 50, ev: 'rumble', evA: 9000, evB: 24000, lp: 2500 },
      'stone shifting': { ev: 'stone,rockfall', evA: 5000, evB: 16000 },
      'echoing drops': { ev: 'drops', evA: 3500, evB: 10000, wet: .75 }
    });
  /* ================= 02 WATER ================= */
  add('wat.stream', 'Flowing water', WA, 'Rivers and streams', 4, .5, T(['calm'], ['stream'], [], [], []),
    { water: .5, wf2: 900, foam: .5, babble: .5, flow: 1 },
    {
      'gentle stream': { water: .35, wf2: 700, foam: .3, babble: .4, flow: .8 },
      'bubbling brook': { water: .4, wf2: 1100, foam: .45, babble: 1, flow: 1.2 },
      'fast stream': { water: .65, wf2: 1100, foam: .8, babble: .7, flow: 1.6 },
      'shallow creek': { water: .3, wf2: 1300, foam: .4, babble: .8, flow: 1 },
      'rocky stream': { water: .55, wf2: 1000, foam: .7, babble: 1, flow: 1.3, ev: 'plop', evA: 2000, evB: 6000 },
      'forest stream': { water: .4, wf2: 800, foam: .4, babble: .6, leaf: .15, ev: 'bird', sp: 'robin,tit', evA: 4000, evB: 12000, bv: .5, wet: .12 },
      'mountain stream': { water: .6, wf2: 1200, foam: .9, babble: .8, flow: 1.5, wind: .12, lp: 8000 }
    });
  add('wat.river', 'River ambience', WA, 'Rivers and streams', 4, .5, T(['calm'], ['river'], [], [], []),
    { water: .4, wf2: 500, foam: .25, babble: .15, flow: .5, low: .1, lowf: 70 },
    {
      'calm river': { water: .3, wf2: 420, foam: .12, babble: .1, flow: .4 },
      'broad river': { water: .45, wf2: 380, foam: .2, low: .2, lowf: 60, flow: .4 },
      'rushing river': { water: .7, wf2: 650, foam: .7, babble: .3, flow: 1.3, low: .2 },
      'muddy river': { water: .45, wf2: 330, foam: .08, babble: .05, low: .25, lowf: 55, flow: .5, lp: 3500 },
      'riverbank': { water: .3, wf2: 600, foam: .3, babble: .3, ev: 'lap,plop', evA: 2000, evB: 7000, low: 0 },
      'river at night': { water: .35, wf2: 450, foam: .2, ins: .12, frog: 0, low: 0, ev: '', lp: 6500 },
      'river under a bridge': { water: .45, wf2: 550, foam: .3, babble: .2, wet: .45, rv: 'stone corridor', ev: 'drip', evA: 3500, evB: 10000, low: .15 }
    });
  add('wat.detail', 'Water details', WA, 'Rivers and streams', 4, .45, T(['calm'], ['stream'], [], [], []),
    { ev: 'lap', evA: 1500, evB: 4500, wet: .1 },
    {
      'water lapping at bank': { ev: 'lap', evA: 1500, evB: 4000, water: .06, wf2: 500, foam: 0 },
      'ripples': { ev: 'ripple', evA: 1200, evB: 4500 },
      'small splashes': { ev: 'splash,plop', evA: 1500, evB: 6000 },
      'water bubbling': { water: .2, wf2: 1200, foam: 0, babble: 1, flow: 1.4, ev: 'bubbles', bz: .3, evA: 800, evB: 3000 },
      'current rushing': { water: .5, wf2: 700, foam: .6, babble: .3, flow: 1.4 },
      'water flowing over stones': { water: .35, wf2: 1200, foam: .5, babble: 1, flow: 1.2, ev: 'plop', evA: 2500, evB: 8000 }
    });
  add('wat.lake', 'Lake ambience', WA, 'Lakes and ponds', 4, .45, T(['calm'], ['lake'], [], [], []),
    { water: .08, wf2: 500, foam: 0, ev: 'lap', evA: 2500, evB: 7000, wind: .08, wet: .15 },
    {
      'still lake': { water: .03, ev: 'ripple', evA: 6000, evB: 18000, wind: .05 },
      'gentle lakeside ripples': { water: .1, ev: 'lap,ripple', evA: 1800, evB: 5000 },
      'windy lake': { water: .15, wind: .45, gust: 1, ev: 'lap', evA: 900, evB: 2800, leaf: .1 },
      'lakeside birds': { ev: 'lap', evA: 3000, evB: 8000, ev2: 'bird,duck', sp: 'sparrow,robin,dove,seagull', ev2A: 2500, ev2B: 8000, bv: .6 },
      'lake at dawn': { water: .05, wind: .05, ev2: 'bird', sp: 'robin,tit,nightingale,dove', ev2A: 1200, ev2B: 4000, bv: .6, lp: 9000 },
      'lake at night': { water: .05, wind: 0, ins: .15, frog: 0, ev: 'lap,plop', evA: 3500, evB: 9000, lp: 6500 }
    });
  /* 'duck' event alias */ EV.duck = EV.quack;
  add('wat.pond', 'Pond ambience', WA, 'Lakes and ponds', 3, .4, T(['calm'], ['pond'], [], [], []),
    { frog: .18, ins: .1, ev: 'plop', evA: 3000, evB: 9000, wet: 0 },
    {
      'frogs and insects': { frog: .35, ins: .15, in2: 0, ev: 'plop', evA: 4000, evB: 12000, wet: 0 },
      'gentle water movement': { frog: 0, ins: .04, water: .05, wf2: 500, foam: 0, ev: 'lap,ripple', evA: 1500, evB: 5000 },
      'ducks on pond': { frog: .05, ins: .05, ev: 'quack,lap', evA: 2500, evB: 9000 },
      'reeds rustling': { frog: 0, ins: 0, leaf: .28, lf: 2800, wind: .2, ev: 'plop', evA: 5000, evB: 14000, wet: 0 },
      'pond at night': { frog: .4, ins: .25, inT: 'cricket', ev: 'plop', evA: 5000, evB: 14000, lp: 6500 }
    });
  add('wat.waterfall', 'Waterfall ambience', WA, 'Waterfalls', 4, .5, T(['powerful'], ['waterfall'], [], [], []),
    { water: .7, wf2: 1400, foam: .9, babble: .2, low: .3, lowf: 70, flow: 1.3, wet: .1 },
    {
      'small waterfall': { water: .45, wf2: 1500, foam: .8, low: .12, babble: .5, ev: 'plop', evA: 3000, evB: 9000 },
      'large waterfall': { water: .85, wf2: 1100, low: .45, lowf: 55 },
      'distant waterfall': { water: .4, wf2: 800, foam: .5, low: .25, lowf: 60, lp: 3000, wet: .3 },
      'powerful waterfall': { water: 1, wf2: 1000, foam: 1, low: .6, lowf: 50, lp: 9000 },
      'forest waterfall': { water: .6, wf2: 1300, leaf: .12, wind: 0, low: .2, wet: 0, ev: 'bird', sp: 'robin,tit', evA: 5000, evB: 15000, bv: .35 },
      'waterfall in a gorge': { water: .7, wf2: 1000, low: .4, wet: .5, rv: 'stone corridor', lp: 7000 }
    });
  add('wat.falldetail', 'Waterfall details', WA, 'Waterfalls', 3, .45, T(['powerful'], ['waterfall'], [], [], []),
    { water: .4, wf2: 1500, foam: 1, wet: .2 },
    {
      'splashing water': { water: .35, wf2: 1700, foam: 1, babble: .6, ev: 'splash,plop', evA: 800, evB: 3000 },
      'misty spray': { water: .3, wf2: 2200, foam: 1, babble: 0, low: .05, lp: 9000 },
      'water echoing in cavern': { water: .4, wf2: 1000, foam: .6, low: .25, wet: .7, rv: 'cave', ev: 'drops', evA: 3000, evB: 9000, lp: 5000 }
    });
  add('wat.ocean', 'Ocean ambience', WA, 'Ocean and sea', 4, .5, T(['vast'], ['ocean'], [], [], []),
    { surf: .5, sf: 600, low: .15, lowf: 60, wind: .12, ev: 'wave', wv: .5, wvF: 1000, evA: 6000, evB: 11000, wet: .1 },
    {
      'calm ocean': { surf: .3, wv: .25, wvF: 900, evA: 7000, evB: 13000, wind: .06 },
      'open sea': { surf: .35, wind: .4, gust: 1, wv: .4, evA: 5000, evB: 9000, low: .1 },
      'deep ocean shore': { surf: .55, sf: 450, low: .3, lowf: 50, wv: .7, wvF: 700, evA: 7000, evB: 12000, wvD: 1.2 },
      'distant surf': { surf: .4, sf: 450, wv: .35, wvF: 600, evA: 6000, evB: 10000, lp: 3000, wet: .2 },
      'stormy sea': { surf: .8, wind: .7, whs: 0, gust: 1, wv: .9, crash: 1.5, evA: 3500, evB: 6000, low: .3, wet: 0 },
      'rough sea': { surf: .65, wind: .5, gust: 1, wv: .75, evA: 4000, evB: 7500, low: .2 },
      'nighttime ocean': { surf: .4, wv: .45, wvF: 800, evA: 6500, evB: 11000, wind: .08, lp: 5500 }
    });
  add('wat.waves', 'Waves', WA, 'Ocean and sea', 4, .5, T(['calm'], ['shore'], [], [], []),
    { surf: .25, wv: .5, wvF: 1100, ev: 'wave', evA: 6000, evB: 10000 },
    {
      'gentle waves': { wv: .2, wvF: 900, evA: 7000, evB: 11000, surf: .15 },
      'rolling waves': { wv: .55, wvF: 800, evA: 7000, evB: 10000, wvD: 1.3, low: .1 },
      'crashing waves': { wv: .85, wvF: 1400, crash: 1.6, evA: 5000, evB: 8000, surf: .35, low: .15 },
      'large surf': { wv: 1, wvF: 700, wvD: 1.4, crash: 1.4, evA: 8000, evB: 12000, surf: .45, low: .35, lowf: 50 },
      'small shore break': { wv: .1, wvF: 1500, wvD: .6, evA: 3000, evB: 5000, surf: .12 },
      'rhythmic waves': { wv: .45, evA: 7500, evB: 7500, surf: .2 },
      'waves against rocks': { wv: .6, wvF: 1200, hit: .8, evA: 5000, evB: 9000, surf: .25, wet: .2 },
      'waves against seawall': { wv: .5, wvF: 1000, hit: 1, evA: 5000, evB: 8000, surf: .2, wet: .3, rv: 'stone corridor' }
    });
  add('wat.beach', 'Beach', WA, 'Ocean and sea', 4, .5, T(['relaxed'], ['beach'], [], [], []),
    { surf: .3, wv: .3, wvF: 900, ev: 'wave', evA: 6000, evB: 10000, wind: .12, ev2: 'gull', ev2A: 12000, ev2B: 30000, bv: .45 },
    {
      'quiet sandy beach': { surf: .22, wv: .22, evA: 7000, evB: 12000, wind: .08, ev2: 'gull', ev2A: 25000, ev2B: 60000 },
      'pebbled beach': { surf: .3, wv: .35, ldry: .3, evA: 5000, evB: 9000, wvF: 1800 },
      'tropical beach': { surf: .25, wv: .25, wind: .15, leaf: .22, lf: 2600, ev2: 'bird', sp: 'dove,cuckoo', ev2A: 8000, ev2B: 20000, bv: .4 },
      'windy beach': { surf: .35, wind: .55, gust: 1, wv: .4, whs: .12, ev2: 'gull', ev2A: 15000, ev2B: 40000 },
      'beach at sunset': { surf: .25, wv: .25, evA: 7000, evB: 12000, wind: .06, ev2: 'gull', ev2A: 18000, ev2B: 45000, lp: 8000 },
      'beach at night': { surf: .3, wv: .3, evA: 7000, evB: 11000, wind: .05, ev2: '', ins: .1, lp: 5500 }
    });
  add('wat.coast', 'Coastal details', WA, 'Ocean and sea', 3, .45, T(['salty'], ['coast'], [], [], []),
    { surf: .15, wind: .2, ev: 'gull', evA: 4000, evB: 12000, bv: .55, wet: .1 },
    {
      'seagulls': { ev: 'gull', evA: 2000, evB: 7000, bv: .7 },
      'coastal wind': { wind: .55, wf: 480, gust: 1, whs: .2, ev: '', surf: .1 },
      'ropes and buoys': { ev: 'buoy,rope', evA: 2500, evB: 8000, surf: .1, wind: .12 },
      'distant boats': { low: 0, hum: .35, hz: 70, ev: 'horn', evA: 14000, evB: 40000, lp: 2200, surf: .1, wet: .3 },
      'waves in caves': { surf: .2, sf: 400, wet: .7, rv: 'cave', ev: 'wave,drops', wv: .35, wvF: 700, evA: 5000, evB: 9000, lp: 4000, low: .15 },
      'tide pools': { surf: .06, ev: 'drip,plop,lap', dp: .7, dz: .15, evA: 1500, evB: 5000 }
    });
  add('wat.harbor', 'Harbor and fishing coast', WA, 'Ocean and sea', 3, .5, T(['busy'], ['harbor'], [], [], []),
    { surf: .12, water: .1, wf2: 500, foam: 0, ev: 'gull,buoy,rope', evA: 2500, evB: 8000, ev2: 'lap', ev2A: 1500, ev2B: 5000, bv: .55 },
    {
      'quiet fishing harbor': { evA: 4000, evB: 12000, ev2A: 2000, ev2B: 6000, wind: .06 },
      'busy harbor': { evA: 1500, evB: 5000, ev: 'gull,buoy,rope,clank,horn', hum: .25, hz: 80, low: 0, lp: 8000, wet: .05 },
      'fishing boats': { low: .12, hum: .25, hz: 65, ev: 'buoy,rope,horn,splash', evA: 2500, evB: 8000 },
      'dockside water': { water: .12, ev: 'lap,rope,clank', evA: 1500, evB: 5000, ev2: 'plop', ev2A: 3000, ev2B: 8000 },
      'gulls and ropes': { ev: 'gull,rope,buoy', evA: 1500, evB: 5000, bv: .7 }
    });
  add('wat.underwater', 'Underwater ambience', WA, 'Underwater', 3, .45, T(['mysterious'], ['underwater'], [], [], []),
    { lp: 900, wob: .35, low: .45, lowf: 70, water: .25, wf2: 300, foam: 0, ev: 'bubbles', bz: .3, evA: 3000, evB: 9000, wet: .25, rv: 'hall' },
    {
      'shallow underwater': { lp: 1500, water: .3, wf2: 450, ev: 'bubbles', evA: 2000, evB: 6000, low: .3 },
      'deep ocean': { lp: 600, low: .6, lowf: 45, water: .12, ev: 'bubbles', evA: 7000, evB: 20000, wet: .4, wob: .45 },
      'underwater cave': { lp: 800, rv: 'cave', wet: .55, ev: 'drops', de: .8, evA: 3000, evB: 9000, low: .4 },
      'coral reef': { lp: 1800, water: .32, wf2: 600, ev: 'bubbles,splash,lap', evA: 1500, evB: 5000, low: .25 },
      'open-water ambience': { lp: 1000, water: .2, wf2: 350, low: .45, ev: '', wet: .35 },
      'muffled underwater environment': { lp: 450, wob: .5, low: .5, water: .15, ev: '', wet: .2 }
    });
  add('wat.uwdetail', 'Underwater details', WA, 'Underwater', 2, .45, T(['mysterious'], ['underwater'], [], [], []),
    { lp: 1200, wob: .3, low: .3, wet: .3, rv: 'hall', ev: 'bubbles', evA: 2500, evB: 8000 },
    {
      'bubbles': { ev: 'bubbles', bz: .35, evA: 800, evB: 3000 },
      'diver breathing': { ev: 'diver', evA: 4000, evB: 4400, lp: 1800, low: .2 },
      'distant whale song': { ev: 'whale', evA: 14000, evB: 30000, lp: 700, low: .35, wet: .55 },
      'dolphin calls': { ev: 'dolphin', evA: 4000, evB: 11000, lp: 9000, low: .15 },
      'water movement': { ev: 'lap', evA: 1500, evB: 5000, water: .2, wf2: 400, foam: 0, lp: 1400, low: .3 },
      'sonar pings': { ev: 'sonar', evA: 5000, evB: 6000, lp: 3500, low: .3, wet: .5, rv: 'cave' },
      'submarine machinery': { hum: .6, hz: 50, low: .35, lowf: 80, ev: 'clank,sonar', evA: 6000, evB: 14000, lp: 1800, wet: .2, rv: 'small room' },
      'underwater rumble': { low: .75, lowf: 40, lp: 500, ev: 'rumble', evA: 10000, evB: 25000, wet: .3 }
    });
  add('wat.wreck', 'Shipwreck', WA, 'Underwater', 3, .45, T(['eerie'], ['underwater'], [], [], []),
    { lp: 900, wob: .3, low: .45, lowf: 60, ev: 'groan', cf: 180, evA: 5000, evB: 14000, wet: .45, rv: 'cave' },
    {
      'creaking wreck': { ev: 'groan,creak', cf: 200, evA: 2500, evB: 8000 },
      'loose metal movement': { ev: 'metal,clank', evA: 2500, evB: 8000, lp: 1600 },
      'deep-water ambience': { lp: 550, low: .6, lowf: 45, ev: 'groan', evA: 12000, evB: 30000 },
      'bubbles around wreck': { ev: 'bubbles', bz: .3, ev2: 'groan', cf: 220, evA: 1200, evB: 4000, ev2A: 8000, ev2B: 20000 }
    });
})();
