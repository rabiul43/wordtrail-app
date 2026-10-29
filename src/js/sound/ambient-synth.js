  /* ---------- ambient-synth.js ----------
     Ambient: sounds made on the device: noise, room reverb, raindrops, rain, rolling thunder, room mix. */
  function ambNoise(ctx, kind) {   // 10 seconds with two unrelated channels: it sounds wide, and the loop is far too long to notice
    const sr = ctx.sampleRate, len = Math.floor(sr * 10), n = Math.floor(sr * 0.4), buf = ctx.createBuffer(2, len, sr), tail = new Float32Array(n), tot = len + n;
    let s = (Math.random() * 4294967296) | 1;   // xorshift32 instead of Math.random() per sample: about 3x faster for the million samples a loop needs, and the first start runs on the main thread
    for (let c = 0; c < 2; c++) {
      const o = buf.getChannelData(c);   // written straight into the buffer; only the extra end piece is kept aside: it is folded into the start, so the end runs straight into the beginning
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
      for (let i = 0; i < tot; i++) {
        s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
        const w = s * (1 / 2147483648); let v;   // s is a signed 32-bit number, so w runs from -1 to 1
        if (kind === 'white') v = w * 0.5;
        else if (kind === 'pink') { b0 = .99886 * b0 + w * .0555179; b1 = .99332 * b1 + w * .0750759; b2 = .969 * b2 + w * .153852; b3 = .8665 * b3 + w * .3104856; b4 = .55 * b4 + w * .5329522; b5 = -.7616 * b5 - w * .016898; v = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * .5362) * 0.11; b6 = w * .115926; }
        else { last = (last + 0.02 * w) / 1.02; v = last * 3.5; }
        if (i < len) o[i] = v; else tail[i - len] = v;
      }
      for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI / 2; o[i] = o[i] * Math.sin(a) + tail[i] * Math.cos(a); }   // equal-power fold: no click and no dip at the loop point
    }
    return buf;
  }
  function ambIR(ctx, sec) {   // a made-up room: noise that fades out and gets darker as it goes
    const sr = ctx.sampleRate, len = Math.floor(sr * sec), pre = Math.floor(sr * 0.012), ramp = sr * 0.03, b = ctx.createBuffer(2, len, sr), k = Math.pow(10, -3 / (len - pre));   // k: the fade of one sample, so the fade is a running product instead of a Math.pow per sample
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c); let y = 0, env = 1;
      for (let i = pre; i < len; i++) { const x = (i - pre) / (len - pre); y += (0.55 - 0.42 * x) * ((Math.random() * 2 - 1) - y); d[i] = y * env * (i - pre < ramp ? (i - pre) / ramp : 1); env *= k; }
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
