#!/usr/bin/env node
/* Checks for the Listen-only screen (src/js/155-listen-only.js). No browser, no npm install:   node tools/listen_only_check.js
   Loads the pure part (LOC, between the LOC-START/END markers): when a track counts as "no text", the progress percent,
   the track strip. Then checks the wiring in the other files by reading them (the hooks are there, the old note is still the fallback).
   The ring, the disc and the look need a real phone. Exit code 1 if a check fails, 2 if a file cannot be loaded. */
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const root = path.join(__dirname, '..'), read = f => fs.readFileSync(path.join(root, f), 'utf8');
let ran = 0, bad = 0;
const t = (name, fn) => { ran++; try { fn(); console.log('ok   ' + name); } catch (e) { bad++; console.log('FAIL ' + name + ': ' + e.message); } };
const same = (a, b, m) => assert.strictEqual(JSON.stringify(a), JSON.stringify(b), m);
let LOC, SRC;
try {
  SRC = read('src/js/155-listen-only.js');
  const a = SRC.indexOf('/*LOC-START*/'), b = SRC.indexOf('/*LOC-END*/');
  if (a < 0 || b < a) throw new Error('LOC markers missing');
  const ctx = {}; vm.createContext(ctx);
  LOC = vm.runInContext(SRC.slice(a, b) + '\nLOC;', ctx);
} catch (e) { console.error('listen_only_check: cannot load: ' + e.message); process.exit(2); }

const base = { model: true, p: { ids: [] }, dur: 600, loading: false, fail: '' };
t('no text: book has text, track has none, length known', () => assert.strictEqual(LOC.noText(base), true));
t('no plan for the track also counts', () => assert.strictEqual(LOC.noText({ ...base, p: undefined }), true));
t('the track has text: not listen-only', () => assert.strictEqual(LOC.noText({ ...base, p: { ids: [1, 2] } }), false));
t('length not known yet: not listen-only (still loading)', () => assert.strictEqual(LOC.noText({ ...base, dur: 0 }), false));
t('timing loading: not listen-only', () => assert.strictEqual(LOC.noText({ ...base, loading: true }), false));
t('timing failed (Try again note): not listen-only', () => assert.strictEqual(LOC.noText({ ...base, fail: 'net' }), false));
t('book has no text at all (no model): keeps its own card', () => assert.strictEqual(LOC.noText({ ...base, model: false }), false));
t('pct: normal, clamped, bad input', () => { assert.strictEqual(LOC.pct(30, 120), 25); assert.strictEqual(LOC.pct(500, 120), 100); assert.strictEqual(LOC.pct(5, 0), 0); assert.strictEqual(LOC.pct(NaN, 10), 0); assert.strictEqual(LOC.pct(5, Infinity), 0); });
t('strip: one segment per track, the open one is cur', () => { const s = LOC.strip(32, 0); assert.strictEqual(s.length, 32); assert.strictEqual(s[0], 'cur'); assert.strictEqual(s.filter(x => x === 'cur').length, 1); assert.ok(s.slice(1).every(x => x === 'off')); });
t('strip: done before, off after', () => same(LOC.strip(5, 2), ['done', 'done', 'cur', 'off', 'off']));
t('strip: long books are grouped to 48 and still show exactly one cur', () => { for (const cur of [0, 57, 130, 199]) { const s = LOC.strip(200, cur); assert.strictEqual(s.length, 48); assert.strictEqual(s.filter(x => x === 'cur').length, 1); } });
t('wiring: renderSection and updateHeader call the new file; old note stays as the fallback', () => {
  const r = read('src/js/150-player-reader.js'), o = read('src/js/140-open-book.js');
  assert.ok(/loActive\(i\) \? loNode\(\) : noteNode\('No text is lined up with this track\.'/.test(r), 'fallback note');
  assert.ok(/loSync\(i\);/.test(r) && /loSync\(\);/.test(o), 'hooks');
  assert.ok(/loActive\(\) \? ' · audio only' : ' · no text'/.test(o), 'header words');
});
t('wiring: the file never runs per frame and has the switch', () => {
  assert.ok(!/requestAnimationFrame|setInterval/.test(SRC), 'no frame loop or interval');
  assert.ok(/P\.listenOnly !== false/.test(SRC) && /#in-listenonly/.test(SRC), 'default on, switch');
  assert.ok(fs.existsSync(path.join(root, 'src/css/99t-listen-only.css')) && /155-listen-only\.js/.test(read('build.py')) && /99t-listen-only\.css/.test(read('build.py')), 'build list');
});
console.log(ran - bad + '/' + ran + ' passed'); process.exit(bad ? 1 : 0);
