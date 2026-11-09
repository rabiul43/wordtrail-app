/* 90-micro-abstract.js — P-I Micro effects (micro.*, spots) & Abstract textures (abs.*, beds).
   Micro: ONE interpreter (microPlay) reads a data recipe p.seq; each catalog item = a variant whose params are that recipe.
   Every item also gets generated "(distant)" and "(soft)" presets (k / lp / wet params only). Abstract: 3 parameterised bed builders. */
SL.pack('P-I', { title: 'Micro effects & abstract textures', version: 1 });
(function () {
  const R = (a, b) => a + Math.random() * (b - a), pk = a => a[Math.floor(Math.random() * a.length)];
  /* private helper 1 (beds): filter + gain + noise + ONE slow movement (gust or lfo). 9 nodes */
  function band(H, out, o) {
    const f = H.filt(o.t || 'bandpass', o.f, o.q || .8), g = H.ctx.createGain(); g.gain.value = o.g;
    f.connect(g); g.connect(out); H.src(o.n || H.pink, f);
    if (o.gust) H.gust(o.gust, o.g * (o.gd == null ? .9 : o.gd), g.gain); else if (o.lr) H.lfo(o.lr, o.ld == null ? o.g * .5 : o.ld, g.gain);
    if (o.gf) H.gust(o.gust || 1, o.gf, f.frequency);
    return g;
  }
  /* private helper 2 (spots): recipe interpreter. entry = [op, dt, ...args]; {r:[a,b]} = random value; ['R',n,t0,t1,[op,...args]] = n scattered copies */
  const rr = (a, b) => ({ r: [a, b] });
  const rs = v => Array.isArray(v) ? v.map(rs) : v && typeof v === 'object' ? (v.r ? R(v.r[0], v.r[1]) : Object.fromEntries(Object.entries(v).map(([k, x]) => [k, rs(x)]))) : v;
  const scr = (H, d, t, dur, o) => { for (let k = 0; k < 4; k++) { try { return H.scrape(d, t, dur + k * .0137, o); } catch (e) { } } };   // lab scrape can emit NaN for some durations: retry
  const OPS = {
    i: (H, d, t, [x]) => H.impact(d, t, x), s: (H, d, t, [dur, x]) => scr(H, d, t, dur, x),
    n: (H, d, t, [nz, ft, f, q, v, a, dc]) => H.nz(d, t, nz, ft, f, q, v, a, dc),
    N: (H, d, t, [nz, ft, f0, f1, q, v, a, dc]) => { const fl = H.nz(d, t, nz, ft, f0, q, v, a, dc); fl.frequency.setValueAtTime(f0 * H.rig.pj, t); fl.frequency.exponentialRampToValueAtTime(f1 * H.rig.pj, t + a + dc); },
    t: (H, d, t, [f0, f1, dur, v, ty, a]) => H.tone(d, t, f0, f1, dur, v, ty || 'sine', a || .003),
    d: (H, d, t, [x]) => H.drip(d, t, x), p: (H, d, t, [x]) => H.splash(d, t, x), b: (H, d, t, [n, x]) => H.bubbles(d, t, n, x),
    f: (H, d, t, [sf, x]) => H.step(d, t, sf, x), B: (H, d, t, [x]) => H.bell(d, t, x), k: (H, d, t, [x]) => H.clockTick(d, t, x), w: (H, d, t, [x]) => H.whoosh(d, t, x)
  };
  const exec = (H, d, t, e) => { const [op, dt, ...a] = e; OPS[op](H, d, t + dt, rs(a)); };
  function microPlay(H, t, p) {
    const j = p.jit == null ? .04 : p.jit; H.rig.pj = (p.pit || 1) * R(1 - j, 1 + j);
    const g = H.ctx.createGain(), r = p.ramp; g.gain.setValueAtTime(r ? r[0] : p.k == null ? 1 : p.k, t); if (r) g.gain.linearRampToValueAtTime(r[1], t + (p.rd || 4));
    let head = g, tail = H.panTo(H.dest, R(-(p.pan == null ? .3 : p.pan), p.pan == null ? .3 : p.pan));
    if (p.lp) { const f = H.filt('lowpass', p.lp, .6); g.connect(f); f.connect(tail); } else g.connect(tail);
    if (p.wet > 0) g.connect(H.reverbSend(p.rv || 'small room', p.wet));
    (p.seq || []).forEach(e => { if (e[0] === 'R') for (let n = 0; n < e[1]; n++) exec(H, head, t, [e[4][0], R(e[2], e[3])].concat(e[4].slice(1))); else exec(H, head, t, e); });
  }
  /* recipe shorthands */
  const I = (dt, x) => ['i', dt, x], S = (dt, dur, x) => ['s', dt, dur, x], N = (dt, nz, ft, f, q, v, a, dc) => ['n', dt, nz, ft, f, q, v, a, dc], NS = (dt, nz, ft, f0, f1, q, v, a, dc) => ['N', dt, nz, ft, f0, f1, q, v, a, dc];
  const T = (dt, f0, f1, d, v, ty, a) => ['t', dt, f0, f1, d, v, ty, a], X = (n, t0, t1, e) => ['R', n, t0, t1, e], rv = (a, b) => rr(a, b);
  const click = (dt, v) => I(dt, { mass: .04, hard: 1, ring: .4, bright: .8, vol: v || .16 });
  const stroke = (f, q, v) => ['n', 'white', 'bandpass', rr(f * .85, f * 1.15), q, rr(v * .6, v), .015, rr(.05, .14)];
  const pop = (v) => ['n', 'white', 'highpass', rr(2500, 6000), .8, rr(v * .35, v), .0005, rr(.01, .03)];
  const tag = (mood, place) => ({ mood, place, weather: [], tod: [], season: [], era: [] });
  /* family: items -> variants (+ generated distant / soft presets) */
  function fam(id, name, sub, fid, vol, tags, items, def) {
    const V = {};
    Object.keys(items).forEach(n => { const it = items[n], b = Array.isArray(it) ? { seq: it } : it; V[n] = b; });
    Object.keys(items).forEach(n => { const b = V[n], k = b.k == null ? 1 : b.k; V[n + ' (distant)'] = Object.assign({}, b, { k: k * .6, lp: 2500, wet: .45, rv: 'hall' }); V[n + ' (soft)'] = Object.assign({}, b, { k: k * .45, lp: 5000 }); });
    SL.add({ id, name, cat: '18 Micro effects', sub, kind: 'spot', src: 'synth', fidelity: fid, vol, tags, params: Object.assign({ k: 1, wet: .15, rv: 'small room', lp: 0, pan: .3, jit: .04, pit: 1 }, V[Object.keys(items)[0]], def || {}), play: microPlay, every: [6000, 18000], variants: V });
  }
  /* ================= 18 MICRO EFFECTS ================= */
  fam('micro.door', 'Doors and windows', 'Doors and windows', 3, .6, tag(['domestic'], ['house']), {
    'Door opening': [click(0, .14), S(.08, 1.1, { f: 520, rough: .25 }), I(1.25, { kind: 'knock', mass: .4, hard: .3, ring: .04, vol: .14 })],
    'Door closing': [S(0, .8, { f: 600, rough: .2 }), I(.85, { kind: 'door slam', vol: .3 }), click(.95, .14)],
    'Door creaking': [S(0, 1.6, { f: 430, rough: .15 }), S(1.7, .9, { f: 520, rough: .2 })],
    'Door latch': [click(0, .2), click(.08, .14)],
    'Door lock turning': [S(0, .45, { f: 2200, rough: .9, vol: 1.4 }), I(.5, { mass: .06, hard: 1, ring: .5, bright: .8, vol: .22 }), I(.85, { mass: .05, hard: 1, ring: .4, bright: .8, vol: .16 })],
    'Heavy door slam': { seq: [I(0, { kind: 'door slam', vol: .7 }), N(0, 'brown', 'lowpass', 120, .7, .5, .005, .8)], wet: .3, rv: 'hall' },
    'Wooden door movement': [S(0, .9, { f: 380, rough: .4 }), I(.3, { kind: 'knock', vol: .1 }), I(.75, { kind: 'knock', mass: .5, vol: .08 })],
    'Metal gate opening': [S(0, 1.8, { f: 1100, rough: .5 }), I(.1, { kind: 'metal clang', vol: .15 }), I(1.9, { mass: .4, hard: .9, ring: .8, bright: .7, vol: .25 })],
    'Metal gate closing': [S(0, 1, { f: 1200, rough: .5 }), I(1.05, { kind: 'metal clang', vol: .4 }), click(1.2, .15)],
    'Window opening': [S(0, .9, { f: 1400, rough: .4 }), I(1, { mass: .2, hard: .5, ring: .1, vol: .1 })],
    'Window closing': [S(0, .7, { f: 1000, rough: .4 }), I(.75, { mass: .2, hard: .6, ring: .3, bright: .5, vol: .28 }), click(.85, .12)],
    'Shutters rattling': [X(6, 0, 1.5, ['i', { kind: 'wood hit', mass: .3, vol: rr(.07, .2) }]), N(0, 'pink', 'bandpass', 900, 1, .1, .5, 1)],
    'Glass rattling': [X(6, 0, 1, ['i', { kind: 'glass', mass: .2, ring: .3, vol: rr(.04, .1) }])],
    'Window rain droplets': [X(8, 0, 3, ['d', { pitch: rr(.6, .95), size: .05, echo: 0 }]), X(4, 0, 3, ['i', { kind: 'glass', mass: .05, ring: .15, vol: .04 }])]
  });
  fam('micro.wood', 'Wood and building', 'Wood and building', 3, .55, tag(['quiet'], ['house']), {
    'Floorboard creak': [S(0, .6, { f: 250, rough: .25 }), I(0, { kind: 'knock', mass: .6, vol: .08 })],
    'Stair creak': [['f', 0, 'stairs', { weight: .5, speed: .4 }], S(.4, .5, { f: 300, rough: .3 })],
    'Timber settling': { seq: [S(0, 1.6, { f: 180, rough: .35, vol: 2 }), I(.7, { kind: 'knock', mass: .7, ring: .05, vol: .2 })], wet: .3, rv: 'hall' },
    'Roof creak': { seq: [S(0, 2.5, { f: 220, rough: .2 }), S(2.6, 1.2, { f: 260, rough: .3 })], wet: .3 },
    'Furniture creak': [S(0, .7, { f: 340, rough: .3 })],
    'Chair movement': [S(0, .6, 'drag'), I(.62, { kind: 'wood hit', mass: .4, vol: .15 })],
    'Table movement': [S(0, .9, { f: 300, rough: .9 }), I(.95, { kind: 'thud', mass: .6, vol: .2 })],
    'Wooden object falling': [I(0, { kind: 'dropped object', vol: .4, ring: .12 })],
    'Wall or pipe creak': [S(0, 1.2, { f: 700, rough: .3 }), T(0, 160, 150, 1.2, .05), I(.8, { kind: 'metal clang', mass: .7, ring: .5, vol: .1 })],
    'Distant building groan': { seq: [S(0, 3, { f: 140, rough: .2, vol: 3 })], wet: .5, rv: 'hall', lp: 1400, k: .6 }
  });
  fam('micro.paper', 'Paper and books', 'Paper and books', 3, .5, tag(['quiet'], ['study']), {
    'Page turning': [['w', 0, { dur: .25, f0: 1500, f1: 5000, vol: .4 }], N(.18, 'white', 'bandpass', 4000, 1, .08, .002, .05)],
    'Pages fluttering': [X(12, 0, 1.2, stroke(4000, 1, .12))],
    'Book opening': [S(0, .5, { f: 900, rough: .4, vol: 1.2 }), I(.5, { kind: 'thud', mass: .3, vol: .15 }), X(5, .45, .8, stroke(4000, 1, .08))],
    'Book closing': [I(0, { kind: 'thud', mass: .45, hard: .2, ring: .02, vol: .35 }), N(0, 'white', 'bandpass', 2500, .8, .15, .003, .08)],
    'Paper rustling': [X(10, 0, 1.6, stroke(4000, 1.5, .12))],
    'Paper crumpling': [X(18, 0, 1.4, pop(.16))],
    'Letter unfolding': [S(0, .7, { f: 3000, rough: .6, vol: 1.2 }), X(4, 0, .7, stroke(4200, 1, .08))],
    'Pen writing': [X(8, 0, 1.6, stroke(4500, 3, .13))],
    'Pencil writing': [X(9, 0, 1.6, ['n', 'pink', 'bandpass', rr(2600, 3800), 1.5, rr(.09, .2), .015, rr(.05, .12)])],
    'Quill scratching': [X(7, 0, 1.6, ['n', 'white', 'bandpass', rr(2400, 3200), 5, rr(.04, .08), .01, rr(.04, .1)]), X(3, 0, 1.6, ['i', { mass: .02, hard: 1, ring: .1, vol: .04 }])],
    'Paper being placed on desk': [N(0, 'pink', 'bandpass', 1200, .8, .15, .01, .1), I(.12, { kind: 'knock', mass: .5, hard: .2, ring: .02, vol: .1 })]
  });
  fam('micro.metal', 'Metal and objects', 'Metal and objects', 4, .5, tag(['domestic'], ['house']), {
    'Keys jingling': [X(14, 0, 1, ['t', rr(3000, 6000), 0, rr(.1, .2), rr(.04, .08), 'sine', .001]), X(5, 0, 1, ['n', 'white', 'highpass', 5000, 1, .06, .001, .02])],
    'Chain rattling': [S(0, 1.5, 'chain'), S(.7, 1, 'chain')],
    'Lock clicking': [click(0, .22), click(.22, .2)],
    'Metal latch': [I(0, { kind: 'metal clang', mass: .1, ring: .4, vol: .18 }), S(0, .2, { f: 2000, rough: .9 })],
    'Metal object dropped': [I(0, { kind: 'metal clang', mass: .4, vol: .4, bounce: 3 })],
    'Glass clinking': [I(0, { kind: 'glass', mass: .1, ring: .7, vol: .25 }), I(.04, { kind: 'glass', mass: .08, vol: .2 })],
    'Bottle placed on table': [I(0, { kind: 'glass', mass: .35, hard: .4, ring: .3, bright: .4, vol: .25 }), I(0, { kind: 'knock', mass: .4, vol: .08 })],
    'Cup placed on saucer': [I(0, { mass: .08, hard: .9, ring: .55, bright: .7, vol: .25 }), I(.03, { mass: .1, hard: .8, ring: .4, vol: .15 })],
    'Dishes clattering': [X(6, 0, 1.4, ['i', { mass: rr(.05, .2), hard: .9, ring: .5, bright: .8, vol: rr(.08, .2) }])],
    'Cutlery movement': [X(5, 0, 1.2, ['i', { mass: .03, hard: 1, ring: .7, bright: .9, vol: rr(.05, .1) }]), S(.2, .5, { f: 2600, rough: .8, vol: 1 })],
    'Coins dropping': [I(0, 'coin')],
    'Small object rolling': [NS(0, 'pink', 'bandpass', 500, 900, 2, .15, .3, 1.2), I(1.5, { mass: .05, hard: 1, ring: .4, vol: .12 })]
  });
  fam('micro.liquid', 'Water and liquids', 'Water and liquids', 3, .5, tag(['calm'], ['house']), {
    'Single water drip': { seq: [['d', 0, { pitch: .55, size: .4, echo: .3 }]], wet: .3 },
    'Repeated water drip': { seq: [X(4, 0, 5, ['d', { pitch: rr(.45, .6), size: .4, echo: .4 }])], wet: .3 },
    'Tap turning on': [I(0, { mass: .1, hard: .8, ring: .3, vol: .12 }), S(.05, .3, { f: 2400, rough: .3 }), N(.35, 'white', 'bandpass', 3000, .5, .2, .15, 1.5), N(.35, 'pink', 'lowpass', 900, .7, .25, .15, 1.5)],
    'Tap turning off': [S(0, .3, { f: 2400, rough: .3 }), N(0, 'white', 'bandpass', 3000, .5, .2, .001, .5), ['d', .8, { pitch: .6, size: .2, echo: .2 }], ['d', 1.9, { pitch: .6, size: .2, echo: .2 }]],
    'Water pouring': [NS(0, 'white', 'bandpass', 1800, 3200, .7, .25, .2, 2.3), N(0, 'pink', 'lowpass', 700, .8, .3, .2, 2.3), ['b', .2, 8, { size: .4, vol: .1 }]],
    'Liquid bubbling': [X(10, 0, 3, ['b', 3, { size: rr(.3, .7), vol: .15 }]), N(0, 'pink', 'lowpass', 500, .8, .15, .3, 2.7)],
    'Kettle boiling': [NS(0, 'white', 'bandpass', 2000, 4500, 1.2, .18, 2.5, 1.5), X(8, 1, 4, ['b', 2, { size: .4, vol: .1 }]), N(0, 'pink', 'lowpass', 600, .8, .12, 1, 3)],
    'Water splashing': [['p', 0, { size: .6 }], ['p', .25, { size: .4 }], ['p', .5, { size: .3 }]],
    'Footstep in puddle': [['f', 0, 'mud', { weight: .5, speed: .6 }], ['p', .03, { size: .25 }]],
    'Water running through drain': [N(0, 'pink', 'bandpass', 350, 1.2, .3, .3, 3.5), X(8, 0, 3.5, ['b', 2, { size: .7, vol: .1 }])]
  });
  fam('micro.fire', 'Fire details', 'Fire details', 3, .5, tag(['warm'], ['hearth']), {
    'Fire pop': [I(0, { mass: .05, hard: .9, ring: .15, bright: .5, vol: .3 }), N(0, 'white', 'highpass', 1800, .8, .15, .001, .04)],
    'Ember crackle': [X(10, 0, 1.2, pop(.12))],
    'Spark': [X(3, 0, .15, ['n', 'white', 'highpass', 6000, 1, .4, .0005, .01])],
    'Wood shifting': [S(0, .6, { f: 300, rough: .5 }), I(.5, { kind: 'wood hit', mass: .6, ring: .05, vol: .2 }), X(5, .4, 1.2, pop(.1))],
    'Flame flare': [NS(0, 'pink', 'bandpass', 400, 1200, .8, .35, .5, 1.4), X(4, .2, 1.2, pop(.1))],
    'Small ignition': [['w', 0, { dur: .3, f0: 300, f1: 1600, vol: 1 }], N(0, 'brown', 'lowpass', 200, .7, .5, .02, .4), X(4, .1, .8, pop(.1))],
    'Match strike': [S(0, .18, { f: 3500, rough: .9, vol: 2 }), N(.2, 'white', 'bandpass', 2500, .7, .25, .05, .6), N(.2, 'pink', 'lowpass', 500, .7, .2, .05, .5), X(5, .22, .7, pop(.08))],
    'Candle blowout': [N(0, 'pink', 'bandpass', 1800, .8, .35, .04, .35), X(3, .3, .7, ['n', 'white', 'highpass', 5000, 1, .03, .002, .08])]
  });
  fam('micro.time', 'Clocks and bells', 'Other details', 4, .5, tag(['quiet'], ['house']), {
    'Clock tick': [['k', 0, { size: .5 }], ['k', .5, { size: .5, tock: 1 }], ['k', 1, { size: .5 }], ['k', 1.5, { size: .5, tock: 1 }]],
    'Clock chime': { seq: [['B', 0, { f: 659, decay: 2.5, inharm: .4, vol: .3 }], ['B', .9, { f: 523, decay: 2.5, inharm: .4, vol: .3 }], ['B', 1.8, { f: 587, decay: 2.5, inharm: .4, vol: .3 }], ['B', 2.7, { f: 392, decay: 3.2, inharm: .4, vol: .3 }]], wet: .2 },
    'Bell strike': { seq: [['B', 0, { f: 260, decay: 5, inharm: .9, vol: .4 }]], wet: .3, rv: 'hall' }
  });
  fam('micro.knock', 'Knocks', 'Other details', 4, .55, tag(['tense'], ['house']), {
    'Distant knock': { seq: [I(0, 'knock'), I(.28, 'knock'), I(.52, 'knock')], wet: .5, rv: 'hall', lp: 1500, k: .5 },
    'Close knock': { seq: [I(0, { kind: 'wood hit', mass: .3, vol: .5 }), I(.26, { kind: 'wood hit', mass: .3, vol: .45 }), I(.5, { kind: 'wood hit', mass: .3, vol: .5 })], wet: .1 }
  });
  fam('micro.step', 'Footsteps', 'Other details', 3, .5, tag(['tense'], ['corridor']), {
    'Footstep approaching': { seq: [0, 1, 2, 3, 4].map(i => ['f', i * .75, 'concrete', { weight: .5, speed: .5 }]), ramp: [.12, 1], rd: 3.6, wet: .25, rv: 'stone corridor' },
    'Footstep receding': { seq: [0, 1, 2, 3, 4].map(i => ['f', i * .75, 'concrete', { weight: .5, speed: .5 }]), ramp: [1, .1], rd: 3.6, wet: .25, rv: 'stone corridor' }
  });
  fam('micro.cloth', 'Fabric, rope and gear', 'Other details', 2, .45, tag(['quiet'], ['room']), {
    'Fabric movement': [X(5, 0, 1, ['n', 'pink', 'bandpass', rr(800, 2500), .8, rr(.04, .1), .05, .15])],
    'Curtain movement': [NS(0, 'pink', 'bandpass', 600, 1800, .6, .12, .3, .6), X(6, .1, .6, ['t', rr(2500, 4000), 0, .05, .03, 'sine', .001])],
    'Rope creak': [S(0, 1, 'rope'), S(1.1, .7, 'rope')],
    'Flag flapping': [X(9, 0, 1.5, ['n', 'white', 'bandpass', rr(600, 1400), 1, rr(.1, .25), .003, .06]), N(0, 'pink', 'bandpass', 500, .7, .12, .2, 1.4)],
    'Leather movement': [S(0, .5, { f: 1300, rough: .35, vol: 1.2 }), N(0, 'pink', 'bandpass', 1000, 1, .07, .04, .2)],
    'Armor movement': [X(5, 0, .9, ['i', { mass: .1, hard: 1, ring: .6, bright: .7, vol: rr(.04, .1) }]), S(0, .8, 'chain')],
    'Saddle creak': [S(0, .7, { f: 600, rough: .3 }), N(0, 'pink', 'bandpass', 1000, 1, .06, .05, .3)]
  });
  fam('micro.signal', 'Distant horn and whistle', 'Other details', 2, .45, tag(['distant'], ['outdoors']), {
    'Distant horn': { seq: [T(0, 196, 190, 2.4, .12, 'sawtooth', .5), T(0, 294, 290, 2.4, .06, 'sawtooth', .5)], wet: .5, rv: 'open outdoor', lp: 1100 },
    'Distant whistle': { seq: [T(0, 1800, 2100, .9, .1, 'sine', .06), N(0, 'white', 'bandpass', 2000, 3, .05, .06, .8)], wet: .4, rv: 'open outdoor', lp: 3500 }
  });
  /* ================= 19 ABSTRACT TEXTURES (beds) ================= */
  const A = '19 Abstract textures', at = (mood) => ({ mood, place: [], weather: [], tod: [], season: [], era: [] });
  /* --- noise and room textures: noise -> hp / bp / lp -> gain (+ optional hum, rumble band, static crackle) --- */
  function noiseBed(H, p) {
    const out = H.mk('abs'), ch = [];
    if (p.hp) ch.push(H.filt('highpass', p.hp, .7)); if (p.bp) ch.push(H.filt('bandpass', p.bp, p.bq || .7)); if (p.lp) ch.push(H.filt('lowpass', p.lp, .7));
    const g = H.ctx.createGain(); g.gain.value = p.g || 0; g.connect(out); ch.forEach((f, i) => f.connect(ch[i + 1] || g));
    if (p.g > 0) { H.src(p.n || 'pink', ch[0] || g); if (p.lr) H.lfo(p.lr, p.g * (p.ld == null ? .3 : p.ld), g.gain); }
    if (p.hum > 0) { const hg = H.ctx.createGain(); hg.gain.value = p.hg || .5; hg.connect(out); H.hum(p.hum, { n: p.hn || 4, lp: p.hlp || 1500, buzz: p.hb || 0 }, hg); }
    if (p.rum > 0) band(H, out, { f: 180, q: .8, g: p.rum, lr: .09 });
    if (p.crk > 0) H.crackle(out, { density: p.crk, hardness: p.ch || .5 }).gain.value = p.cg || .3;
    return out;
  }
  SL.add({ id: 'abs.noise', name: 'Noise and room textures', cat: A, sub: 'Noise and room textures', kind: 'bed', src: 'synth', fidelity: 5, vol: .4, tags: at(['neutral']), params: { n: 'pink', g: .45, hp: 30, lp: 9500 }, build: noiseBed, variants: {
    'White noise': { n: 'white', g: .2, lp: 9000, hp: 30 },
    'Pink noise': { n: 'pink', g: .45, hp: 30, lp: 9500 },
    'Brown noise': { n: 'brown', g: .3, hp: 25 },
    'Soft static': { n: 'white', g: .1, hp: 2500, lp: 9000, crk: .25, ch: .7, cg: .25 },
    'Filtered noise': { n: 'pink', g: .5, bp: 900, bq: 1.2, lr: .07, ld: .3 },
    'Air noise': { n: 'pink', g: .4, hp: 1500, bp: 3500, bq: .4, lr: .1 },
    'Low-frequency rumble': { n: 'brown', g: .8, lp: 90, hp: 20, rum: .12 },
    'Electrical hum': { g: 0, hum: 50, hn: 5, hb: .3, hg: .25 },
    'Ventilation hum': { n: 'pink', g: .3, hp: 60, lp: 700, lr: .15, hum: 90, hn: 2, hg: .5 },
    'Transformer hum': { n: 'pink', g: .08, lp: 400, hum: 100, hn: 5, hb: .5, hg: .25 },
    'Soft broadband ambience': { n: 'pink', g: .3, hp: 80, lp: 6000, lr: .06, rum: .08 }
  } });
  /* --- drones: H.drone preset + optional air band + reverb --- */
  function droneBed(H, p) {
    const out = H.mk('abs'), bus = H.ctx.createGain(); bus.gain.value = p.g == null ? 1 : p.g; bus.connect(out);
    if (p.wet > 0) bus.connect(H.reverbSend(p.rv || 'hall', p.wet, out));
    H.drone(p.kind, p.f0, bus); if (p.air > 0) band(H, bus, { t: 'lowpass', f: p.af || 500, q: .6, g: p.air, lr: .08, n: H.pink });
    return out;
  }
  SL.add({ id: 'abs.drone', name: 'Drones', cat: A, sub: 'Drones', kind: 'bed', src: 'synth', fidelity: 4, vol: .4, tags: at(['dark']), params: { kind: 'dark', f0: 55, g: .5 }, build: droneBed, variants: {
    'Low atmospheric drone': { kind: 'dark', f0: 41, air: .1, af: 500, wet: .3 },
    'Dark drone': { kind: 'dark', f0: 55 },
    'Warm drone': { kind: 'warm', f0: 110 },
    'Cold drone': { kind: 'cold', f0: 110 },
    'Dissonant drone': { kind: 'dissonant', f0: 82 },
    'Pulsing drone': { kind: 'pulsing', f0: 73 },
    'Evolving drone': { kind: 'evolving', f0: 65 },
    'Hollow drone': { kind: 'hollow', f0: 98 },
    'Sub-bass drone': { kind: 'sub-bass', f0: 55 },
    'Ethereal drone': { kind: 'ethereal', f0: 110, wet: .35 },
    'Mechanical drone': { kind: 'mechanical', f0: 60 }
  } });
  /* --- textural effects: one scene builder, each effect = a few levels --- */
  const PENT = [1, 1.125, 1.25, 1.5, 1.667, 2];
  function texBed(H, p) {
    const out = H.mk('abs'); let bus = out; if (p.lp) { bus = H.filt('lowpass', p.lp, .7); bus.connect(out); }
    const d = H.ctx.createGain(); d.gain.value = p.g == null ? 1 : p.g; d.connect(bus); if (p.wet > 0) d.connect(H.reverbSend(p.rv || 'hall', p.wet, bus));
    const B = o => band(H, d, o);
    if (p.air > 0) B({ f: p.af || 3500, q: .5, g: p.air * .35, lr: .1 });
    if (p.shim > 0) { const s = p.sf || 4200; B({ f: s, q: 12, g: p.shim * .5, n: H.white, lr: 5.3 }); if (!p.one) B({ f: s * 1.5, q: 14, g: p.shim * .4, n: H.white, lr: 7.1 }); }
    if (p.met > 0) { const mg = H.ctx.createGain(); mg.gain.value = p.met * 6; mg.connect(d); [1, 2.76, 5.4].forEach(k => { const f = H.filt('bandpass', (p.mf || 440) * k, 60); f.connect(mg); H.src(H.pink, f); }); H.lfo(.13, p.met * 2.2, mg.gain); }
    if (p.hw > 0) B({ f: p.hf || 500, q: 6, g: p.hw * .4, gust: .8, gd: .8, gf: (p.hf || 500) * .4 });
    if (p.wash > 0) B({ t: 'lowpass', f: p.wf || 1200, q: .6, g: p.wash * .5, lr: .07 });
    if (p.uw > 0) { const f = H.filt('lowpass', p.uf || 380, 2.5), g = H.ctx.createGain(); g.gain.value = p.uw * .5; f.connect(g); g.connect(d); H.src(H.pink, f); H.lfo(.18, (p.uf || 380) * .5, f.frequency); H.lfo(.11, p.uw * .15, g.gain); }
    if (p.sw > 0) { const f = H.filt('bandpass', p.sf0 || 1100, 3), g = H.ctx.createGain(); g.gain.value = p.sw * .35; f.connect(g); g.connect(d); H.src(H.pink, f); H.lfo(p.sr || .045, p.sa || 800, f.frequency); }
    if (p.pul > 0) { B({ f: p.pf || 320, q: 1.5, g: p.pul * .5, lr: p.pr || 1.6, ld: p.pul * .45 }); const tg = H.ctx.createGain(); tg.gain.value = p.pul; tg.connect(d); H.tonalBed([{ f: (p.pf || 320) * .6, g: .2, am: [p.pr || 1.6, .15] }], {}, tg); }
    if (p.pad > 0) { const r0 = p.r0 || 110, dt = p.det || 3, pg = H.ctx.createGain(); pg.gain.value = p.pad; pg.connect(d); H.tonalBed([{ f: r0, g: .25, det: -dt, am: [.05, .08] }, { f: r0 * 1.5, g: .2, det: dt, am: [.07, .07] }, { f: r0 * 2, type: 'triangle', g: .1, det: dt * 1.7, am: [.04, .05] }], { lp: p.plp || 1400 }, pg); }
    if (p.crk > 0) H.crackle(d, { density: p.crk, hardness: .9 }).gain.value = .35;
    if (p.hum > 0) { const hg = H.ctx.createGain(); hg.gain.value = p.hg || .3; hg.connect(d); H.hum(p.hum, { n: 3, lp: 1200, buzz: .6 }, hg); }
    if (p.hiss > 0) B({ t: 'highpass', f: 6500, q: .5, g: p.hiss * .05, n: H.white });
    const S = (fns, a, b) => H.scheduler(fns, a, b, 50);
    if (p.gran > 0) S([t => H.nz(d, t, 'white', 'bandpass', (p.grf || 2600) * R(.3, 2.2), 8, 1.3, .002, R(.015, .05))], p.grA || 60, p.grB || 200);
    if (p.rev > 0) S([t => { const f = R(300, 900), at = R(2, 3.2); const fl = H.nz(d, t, 'pink', 'bandpass', f, 3, .5, at, .06); fl.frequency.setValueAtTime(f, t); fl.frequency.exponentialRampToValueAtTime(f * 3, t + at); const m = R(180, 520); H.tone(d, t, m, m, at + .06, .1, 'sine', at); H.tone(d, t, m * 2.76, m * 2.76, at + .06, .04, 'sine', at); }], p.rvA || 3000, p.rvB || 7000);
    if (p.ping > 0) S([t => { const f = 440 * pk(PENT) * pk([1, .5]); [[0, 1], [.45, .45], [.9, .2]].forEach(([dt, k]) => H.tone(d, t + dt, f, f, 2, .09 * k, 'sine', .05)); }], p.pgA || 2500, p.pgB || 7000);
    if (p.gl > 0) S([t => { let tt = t; const f = R(200, 3000), ty = pk(['square', 'sawtooth']); for (let k = 0, n = Math.round(R(3, 8)); k < n; k++) { H.tone(d, tt, f * (k % 2 ? 1 : 1.5), 0, R(.012, .03), .12, ty, .001); tt += R(.02, .05); } H.nz(d, t, 'white', 'bandpass', 3000, 1, .1, .001, .01); }], p.glA || 700, p.glB || 2800);
    if (p.zap > 0) S([t => { H.nz(d, t, 'white', 'highpass', 3000, .8, .2, .001, .08); H.tone(d, t, 4000, 500, .08, .05, 'sawtooth', .001); }], p.zpA || 3000, p.zpB || 9000);
    return out;
  }
  SL.add({ id: 'abs.texture', name: 'Textural effects', cat: A, sub: 'Textural effects', kind: 'bed', src: 'synth', fidelity: 4, vol: .4, tags: at(['dreamy']), params: { g: 1, air: .9, af: 3500 }, build: texBed, noSeam: true, variants: {
    'Airy texture': { air: .9, af: 3500 },
    'Shimmering texture': { shim: .9, sf: 4400, air: .2, af: 6000, wet: .25 },
    'Metallic resonance': { met: .8, mf: 330, air: .05, wet: .2 },
    'Hollow wind texture': { hw: .8, hf: 520, wet: .15 },
    'Distant echo': { ping: 1, pgA: 2500, pgB: 7000, wet: .6, lp: 3500, air: .05 },
    'Reverberant atmosphere': { wash: .7, wf: 900, wet: .8, rv: 'cathedral' },
    'Muffled underwater texture': { uw: .8, uf: 380, wet: .2 },
    'Granular texture': { gran: 1, grA: 25, grB: 90, grf: 2600, air: .05 },
    'Reversed texture': { rev: 1, rvA: 3000, rvB: 7000, wet: .4, air: .05 },
    'Slow filtered sweep': { sw: .8, sr: .045, sa: 800, sf0: 1100 },
    'Pulsating texture': { pul: .8, pr: 1.6, pf: 320 },
    'Soft tonal atmosphere': { pad: .5, r0: 110, det: 3, g: .6, wet: .3 },
    'Dreamlike texture': { pad: .5, r0: 146.8, det: 9, plp: 2200, g: .6, wet: .55 },
    'Digital glitch texture': { gl: 1, glA: 700, glB: 2800, hiss: .25 },
    'Crackling electrical texture': { crk: .7, hum: 50, hg: .15, zap: 1, zpA: 3000, zpB: 9000 }
  } });
})();
