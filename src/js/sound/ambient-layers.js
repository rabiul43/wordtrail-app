  /* ---------- ambient-layers.js ----------
     Ambient: how each sound layer is made (AMB_LAYER) and switched on and off. */
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
