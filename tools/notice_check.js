#!/usr/bin/env node
/* Checks the LibriVox notice matcher (src/js/265-notice-engine.js) on made-up transcripts. No browser needed.
     node tools/notice_check.js
   Add a case here whenever a real recording is cut in the wrong place. */
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const src = fs.readFileSync(path.join(__dirname, '..', 'src/js/265-notice-engine.js'), 'utf8');
const pure = src.slice(src.indexOf('const NE_V'), src.indexOf('/* ---------- words with times'));
if (!pure.includes('function neFindIntro')) { console.error('265-notice-engine.js changed shape'); process.exit(2); }
const C = vm.createContext({}); vm.runInContext(pure + '\n;this.neFindIntro=neFindIntro;this.neFindOutro=neFindOutro;this.neEq=neEq;', C);
const { neFindIntro, neFindOutro } = C;
const toks = s => (s.toLowerCase().match(/[a-z0-9]+/g) || []);
/* words at 0.35 s each starting at t0; a pause of `gap` seconds after every word listed in `pauses` */
function say(text, t0, pauses = {}) { const out = []; let t = t0; for (const w of toks(text)) { out.push({ w, s: t, e: t + 0.3 }); t += 0.35 + (pauses[w] || 0); } return { out, end: t }; }
const join = (...parts) => parts.flat();
let fails = 0; const t = (name, f) => { try { f(); console.log('ok   ' + name); } catch (e) { fails++; console.log('FAIL ' + name + '\n     ' + e.message); } };
const NOTICE = 'This is a LibriVox recording. All LibriVox recordings are in the public domain. For more information or to volunteer, please visit librivox.org.';
const BOOK = toks('It was a dark and stormy night and the rain fell in torrents except at occasional intervals');
const story = (t0) => say('It was a dark and stormy night and the rain fell in torrents except at occasional intervals when it was checked', t0);

t('full notice then story: cut at the story start', () => {
  const a = say('Chapter one of Moby by Herman. ' + NOTICE, 0), b = story(a.end + 0.6);
  const r = neFindIntro(join(a.out, b.out), BOOK);
  assert.strictEqual(r.c, 'h'); assert.ok(Math.abs(r.a - (a.end + 0.6 - 0.25)) < 0.01, 'a=' + r.a);
});
t('"Recording by" line after the notice is skipped too', () => {
  const a = say(NOTICE + ' Recording by Jane Smith.', 0), b = story(a.end + 0.5);
  const r = neFindIntro(join(a.out, b.out), BOOK);
  assert.strictEqual(r.c, 'h'); assert.ok(r.a > a.end - 0.3 && r.a < a.end + 0.5, 'a=' + r.a);
});
t('speech-recognition slips in the notice still match', () => {
  const a = say('this is a libra vox recording all libravox recordings are in the public domain for more information or to volunteer please visit libravox dot org', 0), b = story(a.end + 0.5);
  const r = neFindIntro(join(a.out, b.out), BOOK); assert.strictEqual(r.c, 'h'); assert.ok(Math.abs(r.a - (a.end + 0.25)) < 0.01, 'a=' + r.a);
});
t('notice only (no book text): trusted end of the notice, never inside the story', () => {
  const a = say(NOTICE, 0), b = story(a.end + 0.5);
  const r = neFindIntro(join(a.out, b.out), null); assert.strictEqual(r.c, 'h'); assert.ok(r.a >= a.end - 0.2 && r.a < a.end + 0.6, 'a=' + r.a);
});
t('short notice ("This is a LibriVox recording") is only a weak find', () => {
  const a = say('Chapter two of Moby by Herman. This is a LibriVox recording.', 0), b = story(a.end + 0.5);
  const r = neFindIntro(join(a.out, b.out), null); assert.strictEqual(r.c, 'm');
});
t('later chapter with no notice: nothing to skip', () => {
  const b = story(0.4); const r = neFindIntro(b.out, BOOK); assert.deepStrictEqual({ a: r.a, c: r.c }, { a: 0, c: 'n' });
});
t('a story that starts with common words does not trigger on the notice', () => {
  const B2 = toks('the public of the recording and the domain in a'); const a = say(NOTICE, 0), b = say('Once upon a time there lived a king who had three sons', a.end + 0.5);
  const r = neFindIntro(join(a.out, b.out), B2); assert.ok(r.a === 0 || r.c !== 'h' || r.a > a.end - 0.5, JSON.stringify(r));
});
t('outro: "End of chapter 3" is found and cut just before it', () => {
  const s = say('and so they went home to bed', 1000), e = say('End of chapter three. Recording by Jane Smith.', s.end + 0.4);
  const r = neFindOutro(join(s.out, e.out), 1010); assert.strictEqual(r.c, 'h'); assert.ok(Math.abs(r.o - (s.end + 0.4 - 0.3)) < 0.01, 'o=' + r.o);
});
t('outro: "the end of the world" inside the story is not a cut', () => {
  const s = say('he said it was the end of the world and walked away slowly into the evening', 1000);
  assert.strictEqual(neFindOutro(s.out, 1030).o, null);
});
t('outro: "End of <title>" with LibriVox mentioned', () => {
  const s = say('the last words fell silent', 500), e = say('End of Moby Dick. This is a LibriVox recording.', s.end + 0.3);
  const r = neFindOutro(join(s.out, e.out), 520); assert.strictEqual(r.c, 'h');
});
/* Real narrator output: every track of every timing file in tools/samples/. Many real tracks have NO notice or NO outro, so
   the expected answer comes from the words themselves (independent of the engine): a notice is expected when "public ... domain"
   (or its garbled forms) is spoken near the start, an outro when "end of" (or "of chapter N ... read by") is spoken at the very end.
   Where the engine cuts, the words just before the cut must be the notice/credit and the words after must not be. */
const sampleDir = path.join(__dirname, 'samples');
let nTracks = 0, nIntro = 0, nOutro = 0;
for (const f of fs.existsSync(sampleDir) ? fs.readdirSync(sampleDir).filter(x => /\.json(\.gz)?$/.test(x)) : []) {
  const raw = fs.readFileSync(path.join(sampleDir, f)), d = JSON.parse((f.endsWith('.gz') ? require('zlib').gunzipSync(raw) : raw).toString());
  for (const k of Object.keys(d.tracks).sort((x, y) => x - y)) t(f.replace('.json.gz', '') + ' #' + k, () => {
    const tr = d.tracks[k], w = String(tr.w).split(' '), T = tr.t, W = [];
    w.forEach((x, j) => { for (const z of toks(x)) W.push({ w: z, s: +T[j], e: +T[j] + Math.min(0.9, 0.12 + 0.055 * z.length) }); });
    for (let q = 0; q + 1 < W.length; q++) if (W[q].e > W[q + 1].s) W[q].e = Math.max(W[q].s + 0.05, W[q + 1].s);
    const dur = W[W.length - 1].e + 1.5, i = neFindIntro(W, null), o = neFindOutro(W, dur); nTracks++;
    const head = W.filter(x => x.s < 40).map(x => x.w).join(' '), tailW = W.slice(-26).map(x => x.w).join(' ');
    const wantIntro = /public (do|dom)/.test(head) || /public \w+ main/.test(head) || /volunteer/.test(head);
    const wantOutro = /\bend of\b/.test(tailW) || /\bof (chapter|section|part|book|canto|poem) [^ ]+( part [^ ]+)? (read|red|recorded) by\b/.test(tailW);
    if (wantIntro) { assert.strictEqual(i.c, 'h', 'notice spoken but not found'); nIntro++; } else assert.notStrictEqual(i.c, 'h', 'cut made although no notice is spoken');
    if (i.c === 'h') {
      const before = W.filter(x => x.s < i.a).map(x => x.w), after = W.filter(x => x.s >= i.a).slice(0, 5).map(x => x.w).join(' ');
      assert.ok(/public|volunteer/.test(before.slice(-45).join(' ')), 'cut is not after the notice');
      assert.ok(!/^(this|libra|libre|read by|reading by|recording by|red by|today)/.test(after) && !/ (read|reading|red|recording|recorded) by /.test(' ' + after + ' '), 'notice or credit left after the cut: "' + after + '"');
    }
    if (wantOutro) { assert.strictEqual(o.c, 'h', 'outro spoken but not found'); nOutro++; } else assert.strictEqual(o.c, 'n', 'outro cut made although none is spoken');
    if (o.c === 'h') {
      const at = W.filter(x => x.s >= o.o).slice(0, 2).map(x => x.w).join(' ');
      assert.ok(at === 'end of' || /end of/.test(W.filter(x => x.s >= o.o).slice(0, 5).map(x => x.w).join(' ')) || /^of (chapter|section|part|book|canto|poem)/.test(at) || /^\w+ of$/.test(at), 'outro cut not at "end of": "' + at + '"');
    }
  });
}
if (nTracks) console.log('\nreal tracks checked: ' + nTracks + ' (' + nIntro + ' with a spoken notice, ' + nOutro + ' with a spoken outro)');
console.log(fails ? '\n' + fails + ' check(s) failed' : '\nall notice checks passed'); process.exit(fails ? 1 : 0);
