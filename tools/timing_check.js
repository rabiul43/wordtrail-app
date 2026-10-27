#!/usr/bin/env node
/* Runs the notice engine on a real timing file (the *.json.gz the app downloads for a book) and prints, per track,
   the intro cut and outro cut it found with the words around each, so you can judge them by eye.
     node tools/timing_check.js path/to/10054.json.gz
   No book text is used here (only the words the narrator said), so intro cuts come from the notice alone. */
const fs = require('fs'), path = require('path'), vm = require('vm'), zlib = require('zlib');
const src = fs.readFileSync(path.join(__dirname, '..', 'src/js/265-notice-engine.js'), 'utf8');
const C = vm.createContext({}); vm.runInContext(src.slice(src.indexOf('const NE_V'), src.indexOf('/* ---------- words with times')) + '\n;this.neFindIntro=neFindIntro;this.neFindOutro=neFindOutro;', C);
const toks = s => (String(s).toLowerCase().match(/[a-z0-9]+(?:['\u2019][a-z]+)?/g) || []).map(w => w.replace(/['\u2019]/g, ''));
const f = process.argv[2]; if (!f) { console.error('usage: node tools/timing_check.js file.json.gz'); process.exit(2); }
const raw = fs.readFileSync(f), d = JSON.parse((f.endsWith('.gz') ? zlib.gunzipSync(raw) : raw).toString());
console.log(d.title || d.bid, '- tracks with words:', Object.keys(d.tracks).length);
const show = (W, a, b) => W.filter(x => x.s >= a && x.s <= b).map(x => x.w).join(' ');
for (const k of Object.keys(d.tracks).sort((x, y) => x - y)) {
  const tr = d.tracks[k], w = String(tr.w).split(' '), T = tr.t, W = [];
  w.forEach((x, j) => { for (const z of toks(x)) W.push({ w: z, s: +T[j], e: +T[j] + Math.min(0.9, 0.12 + 0.055 * z.length) }); });
  for (let q = 0; q + 1 < W.length; q++) if (W[q].e > W[q + 1].s) W[q].e = Math.max(W[q].s + 0.05, W[q + 1].s);
  const dur = W[W.length - 1].e + 1.5;
  const i = C.neFindIntro(W, null), o = C.neFindOutro(W, dur);
  console.log('\n#' + k + '  intro ' + i.c + ' a=' + i.a + '   outro ' + o.c + ' o=' + o.o + '  (speech ends ' + W[W.length - 1].s.toFixed(1) + ')');
  console.log('   before cut: ...' + show(W, Math.max(0, i.a - 4), i.a - 0.01).split(' ').slice(-8).join(' '));
  console.log('   after  cut: ' + show(W, i.a, i.a + 4).split(' ').slice(0, 8).join(' ') + '...');
  if (o.o != null) console.log('   outro starts: ' + show(W, o.o, o.o + 6));
  else console.log('   last words:  ' + W.slice(-8).map(x => x.w).join(' '));
}
