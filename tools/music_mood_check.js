#!/usr/bin/env node
/* Checks the fine music mood word lists against src/dev/music-mood-tests.txt.
     node tools/music_mood_check.js
   It runs the block between MOOD-WORDS-BEGIN and MOOD-WORDS-END in src/js/sound/music-moods.js, so it tests the real lists.
   Exit code 1 if a case fails. Add a case to the .txt whenever you add words or a language. */
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'src/js/sound/music-moods.js'), 'utf8');
const a = src.indexOf('/* MOOD-WORDS-BEGIN'), b = src.indexOf('/* MOOD-WORDS-END */');
if (a < 0 || b < 0) { console.error('MOOD-WORDS markers not found in sound/music-moods.js'); process.exit(2); }
const ctx = vm.createContext({});
vm.runInContext(src.slice(a, b) + '\nthis.best = musFineBest; this.rx = MUS_FINE_RX;', ctx);
const cases = []; let cur = null;
fs.readFileSync(path.join(root, 'src/dev/music-mood-tests.txt'), 'utf8').split(/\r?\n/).forEach(line => {
  if (line.startsWith('##')) return;
  if (line.startsWith('=== ')) { cur = { id: line.slice(4).trim(), meta: {}, text: '' }; cases.push(cur); return; }
  if (!cur) return;
  if (line.startsWith('# ')) { line.slice(2).trim().split(/\s+/).forEach(kv => { const i = kv.indexOf('='); if (i > 0) cur.meta[kv.slice(0, i)] = kv.slice(i + 1); }); return; }
  if (line.trim()) cur.text += (cur.text ? ' ' : '') + line.trim();
});
let bad = 0, runs = 0;
cases.forEach(c => {
  const want = c.meta.fine || 'none';
  [['', c.text], [' (letters taken apart)', c.text.normalize('NFD')]].forEach(([tag, text]) => {
    runs++;
    const got = ctx.best(text.toLowerCase(), c.meta.lang || '', c.meta.base || 'neutral') || 'none', ok = got === want;
    if (!ok) bad++;
    if (!ok || !tag) console.log((ok ? 'ok   ' : 'FAIL ') + c.id + tag + (ok ? '' : '   wanted ' + want + ', got ' + got));
  });
});
console.log('\n' + (runs - bad) + ' of ' + runs + ' runs pass (' + cases.length + ' cases, each also with the letters taken apart). Languages with word lists: ' + Object.keys(ctx.rx).join(', '));
process.exit(bad ? 1 : 0);
