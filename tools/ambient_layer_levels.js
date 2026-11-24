#!/usr/bin/env node
/* How loud is each GENERATED ambient sound in the speech band (300-4000 Hz)? No browser needed.
     node tools/ambient_layer_levels.js                       the table
     node tools/ambient_layer_levels.js recordings.json       also the measured level of each recording and the gain between them
     node tools/ambient_layer_levels.js --sr 48000 --json     other sample rate / numbers only
   Why: a real recording and the generated sound of the same name share one gain stage (ambApply), so for "hybrid" mode to keep the
   same loudness when a sound switches between them, the recording must be levelled to the generated sound's speech-band level.
   How: it takes the REAL AMB_LAYER code out of src/js/sound/ambient-layers.js and runs it against a stand-in audio context that only
   writes down the graph (noise sources, filters, gains, slow movements). The graph is then followed on paper: noise power per Hz, times each
   filter's response, times each gain (a slow movement adds its mean square), summed, and passed through the same 300 Hz / 4 kHz band
   that tools/ambient_prep.py uses. The noise loops are made exactly as ambNoise() makes them (white, pink, brown formulas copied below).
   The figure is in dB of mean power, the same unit as `sb` in recordings.json, so the two can be compared directly.
   Known simplifications (shown in the NOTES column): a slow movement of a filter frequency or of the pan is ignored (the centre value is used);
   all parts of a layer are treated as unrelated to each other. Expect about +/- 1 dB, not better. Exit 2 if the layer code cannot be read. */
const fs = require('fs'), path = require('path'), vm = require('vm');
const args = process.argv.slice(2);
const flag = n => { const i = args.indexOf(n); if (i < 0) return null; const v = args[i + 1]; args.splice(i, 2); return v; };
const SR = Number(flag('--sr')) || 44100;
const asJson = (() => { const i = args.indexOf('--json'); if (i < 0) return false; args.splice(i, 1); return true; })();
const recFile = args[0] || null;
const root = path.join(__dirname, '..');

/* 1. the real layer code */
let LAYER;
try {
  const src = fs.readFileSync(path.join(root, 'src/js/sound/ambient-layers.js'), 'utf8');
  const a = src.indexOf('const AMB_LAYER = {'), b = src.indexOf('\n  };\n  function ambLayerOn');
  if (a < 0 || b < a) throw new Error('AMB_LAYER not found');
  LAYER = vm.runInNewContext('(' + src.slice(a + 'const AMB_LAYER = '.length, b + 4) + ')');
} catch (e) { console.error('ambient_layer_levels: cannot read the layer code: ' + e.message); process.exit(2); }

/* 2. a stand-in audio context that records the graph */
function makeGraph() {
  const nodes = [], root = { kind: 'root', out: [] }, notes = new Set();
  const param = v => ({ value: v, mods: [] });
  const node = (kind, extra) => { const n = Object.assign({ kind, out: [], connect(d) { if (d && d.kind) n.out.push(d); else notes.add('connect to a parameter ignored'); return d; } }, extra); nodes.push(n); return n; };
  const ctx = {
    createGain: () => node('gain', { gain: param(1) }),
    createOscillator: () => node('osc', { type: 'sine', frequency: param(440), isSource: true }),
    createBiquadFilter: () => node('biquad', { type: 'lowpass', frequency: param(350), Q: param(1) }),
    createStereoPanner: () => node('pan', { pan: param(0) }),
  };
  const H = {
    ctx, pink: 'pink', brown: 'brown', white: 'white',
    src: (kind, out) => { const n = node('noise', { noise: kind, isSource: true }); n.connect(out); },   // two unrelated copies at 0.7071 each = one unit-power copy
    mk: () => { const g = ctx.createGain(); g.gain.value = 1; g.connect(root); return g; },
    filt: (type, f, q) => { const n = ctx.createBiquadFilter(); n.type = type; n.frequency.value = f; if (q) n.Q.value = q; return n; },
    lfo: (rate, depth, target) => {   // as ambLayerOn: a slow one (<= 5 Hz) is 0.75 of the depth plus a second part at 0.3 (golden-ratio speed)
      const slow = rate <= 5; target.mods.push(depth * (slow ? 0.75 : 1)); if (slow) target.mods.push(depth * 0.3);
    },
    pan: (rate, depth, out) => { const p = ctx.createStereoPanner(); p.connect(out); return p; },
    go: () => {},
  };
  return { H, ctx, nodes, root, notes };
}

/* 3. responses (WebAudio biquad formulas; lowpass/highpass Q is in dB, bandpass Q is plain) */
const W = 2 * Math.PI / SR;
function biquadPow(type, f0, Q, linearQ) {   // |H|^2 on the grid
  const w0 = W * f0, c = Math.cos(w0), s = Math.sin(w0);
  const q = linearQ ? Q : Math.pow(10, Q / 20), al = type === 'bandpass' ? s / (2 * Q) : s / (2 * q);
  let b0, b1, b2, a0 = 1 + al, a1 = -2 * c, a2 = 1 - al;
  if (type === 'lowpass') { b0 = (1 - c) / 2; b1 = 1 - c; b2 = b0; }
  else if (type === 'highpass') { b0 = (1 + c) / 2; b1 = -(1 + c); b2 = b0; }
  else if (type === 'bandpass') { b0 = al; b1 = 0; b2 = -al; }
  else return f => 1;                      // peaking/shelf nodes are not in the layers
  return f => {
    const w = W * f, cw = Math.cos(w), sw = Math.sin(w), c2 = Math.cos(2 * w), s2 = Math.sin(2 * w);
    const nr = b0 + b1 * cw + b2 * c2, ni = -(b1 * sw + b2 * s2), dr = a0 + a1 * cw + a2 * c2, di = -(a1 * sw + a2 * s2);
    return (nr * nr + ni * ni) / (dr * dr + di * di);
  };
}
const bandHP = biquadPow('highpass', 300, 0.7071, true), bandLP = biquadPow('lowpass', 4000, 0.7071, true);

/* the noise loops, as ambNoise() makes them: w is uniform -1..1 (variance 1/3) */
const VAR_W = 1 / 3;
function noisePsd(kind, f) {   // power per Hz over 0..SR/2
  const w = W * f, cr = Math.cos(w), ci = -Math.sin(w), per = 2 / SR;
  if (kind === 'white') return 0.25 * VAR_W * per;
  if (kind === 'brown') { const a = 1 / 1.02, b = 0.02 / 1.02, dr = 1 - a * cr, di = -a * ci; return 12.25 * VAR_W * (b * b) / (dr * dr + di * di) * per; }
  // pink: v = 0.11 * (sum of six one-pole parts + 0.5362 w + 0.115926 w delayed one sample)
  const poles = [[.99886, .0555179], [.99332, .0750759], [.969, .153852], [.8665, .3104856], [.55, .5329522], [-.7616, -.016898]];
  let re = .5362 + .115926 * cr, im = .115926 * ci;
  poles.forEach(([a, c]) => { const dr = 1 - a * cr, di = -a * ci, d2 = dr * dr + di * di; re += c * dr / d2; im += c * (-di) / d2; });
  return 0.0121 * (re * re + im * im) * VAR_W * per;
}

/* 4. follow the graph */
const F = []; for (let f = 1; f < SR / 2; f += 1) F.push(f);
function levelOf(key) {
  const g = makeGraph(); LAYER[key](g.H);
  const psd = new Float64Array(F.length), tones = [], notes = new Set(g.notes);
  const sources = g.nodes.filter(n => n.isSource);
  const factor = n => {   // what this node does to power at f
    if (n.kind === 'gain') { const m = n.gain.mods.reduce((s, d) => s + d * d / 2, 0); const k = n.gain.value * n.gain.value + m; return () => k; }
    if (n.kind === 'biquad') { if (n.frequency.mods.length) notes.add('filter sweep ignored'); const h = biquadPow(n.type, n.frequency.value, n.Q.value, n.type === 'bandpass'); return h; }
    return () => 1;
  };
  const walk = (n, chain, out) => { if (n.kind === 'root') { out(chain); return; } n.out.forEach(d => walk(d, chain.concat(factor(d)), out)); };
  sources.forEach(sn => {
    const paths = []; walk(sn, [], c => paths.push(c));
    if (paths.length !== 1) notes.add(paths.length ? 'a source with several paths (treated as unrelated)' : 'a source with no path');
    paths.forEach(chain => {
      if (sn.kind === 'noise') for (let i = 0; i < F.length; i++) { let p = noisePsd(sn.noise, F[i]); for (const fn of chain) p *= fn(F[i]); psd[i] += p; }
      else {   // a steady tone: sine = one line of power 1/2; sawtooth = harmonics of amplitude (2/pi)/n
        const f0 = sn.frequency.value, hs = sn.type === 'sawtooth' ? Array.from({ length: Math.floor(SR / 2 / f0) }, (_, i) => [f0 * (i + 1), Math.pow(2 / Math.PI / (i + 1), 2) / 2]) : [[f0, 0.5]];
        hs.forEach(([f, p]) => { if (f < SR / 2) { for (const fn of chain) p *= fn(f); tones.push([f, p]); } });
      }
    });
  });
  let tot = 0, band = 0;
  for (let i = 0; i < F.length; i++) { tot += psd[i]; band += psd[i] * bandHP(F[i]) * bandLP(F[i]); }
  tones.forEach(([f, p]) => { tot += p; band += p * bandHP(f) * bandLP(f); });
  const dB = p => p > 1e-12 ? 10 * Math.log10(p) : -120;
  return { key, sb: dB(band), total: dB(tot), share: tot > 0 ? band / tot : 0, notes: [...notes] };
}

const keys = Object.keys(LAYER), rows = keys.map(levelOf);
let rec = {};
if (recFile) { try { rec = JSON.parse(fs.readFileSync(recFile, 'utf8')); } catch (e) { console.error('cannot read ' + recFile + ': ' + e.message); process.exit(2); } }
if (asJson) { console.log(JSON.stringify(rows.map(r => ({ key: r.key, sb: +r.sb.toFixed(1), total: +r.total.toFixed(1), share: +r.share.toFixed(2) })))); process.exit(0); }
const pad = (s, n) => String(s).padStart(n);
console.log(`Generated layers at ${SR} Hz (dB of mean power, 0 = full scale)`);
console.log('  sound    speech-band   whole   share' + (recFile ? '   recording   gain to match' : '') + '   notes');
rows.forEach(r => {
  const m = rec[r.key], has = m && typeof m.sb === 'number';
  console.log('  ' + r.key.padEnd(8) + pad(r.sb.toFixed(1), 11) + pad(r.total.toFixed(1), 8) + pad(r.share.toFixed(2), 8) +
    (recFile ? pad(has ? m.sb.toFixed(1) : '-', 11) + pad(has ? (r.sb - m.sb > 0 ? '+' : '') + (r.sb - m.sb).toFixed(1) + ' dB' : '-', 16) : '') + '   ' + r.notes.join('; '));
});
