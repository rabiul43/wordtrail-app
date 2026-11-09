#!/usr/bin/env node
/* Automatic checks for My Words notes, hard flag and exports (167): note and hard through the real store (147), the spreadsheet file
   (BOM, quoting, formula guard, old entries) and the Anki file (headers, tabs, HTML, tags). No browser, no npm install.
     node tools/wordnotes_check.js
   Loads the REAL files from src/js/. Exit code 1 if a check fails, 2 if a file cannot be loaded. */
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const read = f => fs.readFileSync(path.join(__dirname, '..', 'src/js', f), 'utf8');
const disk = {};
const store = { get(k, d) { try { const v = disk[k]; return v ? JSON.parse(v) : d; } catch (e) { return d; } }, set(k, v) { disk[k] = JSON.stringify(v); } };
const sent = [], toasts = [];
let T;
try {
  const code = read('146-word-model.js') + '\n' + read('147-word-store.js') + '\n' + read('148-scheduler.js') + '\n' +
    'const WC = { places(e) { let c = Array.isArray(e.ctx) ? e.ctx.filter(x => x && typeof x === "object") : []; if (!c.length && (e.ex || e.bt)) c = [{ s: e.ex || "", bid: e.bid || "", bt: e.bt || "" }]; return c; } };\n' +
    read('167-word-notes-export.js') + '\nthis.T = { WM, WS, WN };';
  const ctx = vm.createContext({ store, h: () => ({}), toast: m => toasts.push(m), download: (n, t, ty) => sent.push({ n, t, ty }) });
  vm.runInContext(code, ctx); T = ctx.T;
} catch (e) { console.error('wordnotes_check: cannot load the code: ' + e.message); process.exit(2); }
const { WS, WN } = T;
let pass = 0, fail = 0;
function t(name, fn) { try { fn(); pass++; console.log('ok    ' + name); } catch (e) { fail++; console.log('FAIL  ' + name + '\n        ' + String(e.message).split('\n').slice(0, 6).join('\n        ')); } }
const reset = list => { Object.keys(disk).forEach(k => delete disk[k]); sent.length = 0; toasts.length = 0; if (list) disk['wt:words'] = JSON.stringify(list); };
const OLD = () => [{ ts: Date.UTC(2026, 0, 5, 12), w: 'forlorn', lv: 'C1', ex: 'She sat looking forlorn and tired.', bid: '345', bt: 'Dracula' }];
const parse = text => {   // a small CSV reader that follows the rules (quotes, doubled quotes, line breaks inside quotes)
  const rows = []; let r = [], c = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { c += '"'; i++; } else q = false; } else c += ch; }
    else if (ch === '"') q = true; else if (ch === ',') { r.push(c); c = ''; } else if (ch === '\r') { } else if (ch === '\n') { r.push(c); rows.push(r); r = []; c = ''; } else c += ch;
  }
  return rows;
};

t('note: save, trim, cut at 1000, clear', () => {
  reset(OLD());
  assert.strictEqual(WS.setNote('forlorn', '  sad and alone  ').note, 'sad and alone');
  assert.strictEqual(WS.get('forlorn').note, 'sad and alone');
  assert.strictEqual(WS.setNote('forlorn', 'x'.repeat(1500)).note.length, 1000);
  assert.strictEqual(WS.setNote('forlorn', '').note, '');
  assert.strictEqual(WS.setNote('notsaved', 'x'), null);
});
t('hard: toggles on and off, unknown word gives null', () => {
  reset(OLD());
  assert.strictEqual(WS.toggleHard('forlorn'), true); assert.strictEqual(WS.get('forlorn').hard, true);
  assert.strictEqual(WS.toggleHard('Forlorn'), false); assert.strictEqual(WS.toggleHard('nope'), null);
});
t('note and hard keep every old field', () => {
  reset(OLD()); WS.setNote('forlorn', 'n'); WS.toggleHard('forlorn');
  const e = JSON.parse(disk['wt:words'])[0];
  ['ts', 'w', 'lv', 'ex', 'bid', 'bt'].forEach(k => assert.deepStrictEqual(e[k], OLD()[0][k], k));
  assert.strictEqual(e.v, 2);
});
t('csv: starts with a byte order mark and uses CRLF', () => {
  reset(OLD()); const s = WN.csv(WS.all());
  assert.strictEqual(s.charCodeAt(0), 0xFEFF); assert.ok(s.includes('\r\n')); assert.ok(!/[^\r]\n/.test(s.replace(/"[^"]*"/g, '')));
});
t('csv: the old first four columns stay in the same order', () => {
  reset(OLD()); const r = parse(WN.csv(WS.all()));
  assert.deepStrictEqual(r[0].slice(0, 4).map(x => x.replace('﻿', '')), ['word', 'level', 'example', 'book']);
  assert.deepStrictEqual(r[1].slice(0, 4), ['forlorn', 'C1', 'She sat looking forlorn and tired.', 'Dracula']);
});
t('csv: an old entry (no v2 fields) exports with status new, hard no, empty note', () => {
  reset(OLD()); const r = parse(WN.csv(WS.all())), h = r[0].map(x => x.replace('﻿', '')), row = r[1], g = k => row[h.indexOf(k)];
  assert.strictEqual(g('status'), 'New'); assert.strictEqual(g('hard'), 'no'); assert.strictEqual(g('note'), ''); assert.strictEqual(g('saved'), '2026-01-05');
});
t('csv: note, hard, collections, quotes, commas and line breaks round-trip', () => {
  reset(OLD()); WS.setNote('forlorn', 'say "alone", then\nsad'); WS.toggleHard('forlorn'); WS.addToCollection('forlorn', 'Gothic', true); WS.addToCollection('forlorn', 'Exam words', true);
  const r = parse(WN.csv(WS.all())), h = r[0].map(x => x.replace('﻿', '')), row = r[1], g = k => row[h.indexOf(k)];
  assert.strictEqual(g('note'), 'say "alone", then\nsad'); assert.strictEqual(g('hard'), 'yes'); assert.strictEqual(g('collections'), 'Gothic; Exam words');
  assert.strictEqual(r.length, 2); assert.strictEqual(row.length, 10);
});
t('csv: Bengali text is kept', () => {
  reset(OLD()); WS.setNote('forlorn', 'একা ও দুঃখী');
  assert.ok(WN.csv(WS.all()).includes('একা ও দুঃখী'));
});
t('csv: a cell that starts with = + - @ cannot run as a formula', () => {
  reset(OLD()); WS.setNote('forlorn', '=HYPERLINK("http://x","y")');
  const s = WN.csv(WS.all()); assert.ok(s.includes('"\'=HYPERLINK(')); assert.ok(!s.includes(',"=HYPERLINK'));
  ['+1', '-1', '@x'].forEach(v => { reset(OLD()); WS.setNote('forlorn', v); assert.ok(WN.csv(WS.all()).includes('"\'' + v)); });
});
t('csv: empty list gives only the header; non-word items are skipped', () => {
  assert.strictEqual(parse(WN.csv([])).length, 1); assert.strictEqual(parse(WN.csv([null, 5, { x: 1 }])).length, 1);
});
t('anki: header lines, then one line per word with 3 tab-separated fields', () => {
  reset(OLD()); WS.toggleHard('forlorn'); WS.addToCollection('forlorn', 'Exam words', true);
  const lines = WN.anki(WS.all()).split('\n');
  assert.deepStrictEqual(lines.slice(0, 5), ['#separator:tab', '#html:true', '#notetype:Basic', '#deck:WordTrail', '#tags column:3']);
  const f = lines[5].split('\t'); assert.strictEqual(f.length, 3); assert.strictEqual(f[0], 'forlorn'); assert.strictEqual(f[2], 'wordtrail hard Exam_words');
  assert.strictEqual(lines[6], ''); assert.strictEqual(lines.length, 7);
});
t('anki: back has the example with the word in bold, level and book, and the note', () => {
  reset(OLD()); WS.setNote('forlorn', 'sad & alone');
  const back = WN.anki(WS.all()).split('\n')[5].split('\t')[1];
  assert.ok(back.includes('She sat looking <b>forlorn</b> and tired.')); assert.ok(back.includes('C1 · Dracula')); assert.ok(back.includes('sad &amp; alone'));
});
t('anki: no raw tab, quote or line break inside a field; HTML is escaped', () => {
  reset([{ ts: 1, w: 'odd', lv: '', ex: 'He said "<b>odd</b>"\tthing\nnext', bid: '', bt: '' }]); WS.setNote('odd', 'a\tb\nc "q"');
  const body = WN.anki(WS.all()).split('\n').slice(5, -1); assert.strictEqual(body.length, 1);
  const f = body[0].split('\t'); assert.strictEqual(f.length, 3); assert.ok(!f[1].includes('"')); assert.ok(f[1].includes('&lt;b&gt;')); assert.ok(f[1].includes('<br>'));
});
t('anki: the word is bold only as a whole word', () => {
  reset([{ ts: 1, w: 'ample', lv: '', ex: 'An example of ample room.', bid: '', bt: '' }]);
  const back = WN.anki(WS.all()).split('\n')[5].split('\t')[1];
  assert.ok(back.includes('<b>ample</b> room')); assert.ok(!back.includes('ex<b>ample</b>'));
});
t('anki: word with no sentence still gives a card; a word with a regex character is safe', () => {
  reset([{ ts: 1, w: 'a.b(', lv: '', ex: 'try a.b( now', bid: '', bt: '' }, { ts: 2, w: 'bare' }]);
  const l = WN.anki(WS.all()).split('\n').slice(5, -1); assert.strictEqual(l.length, 2); assert.ok(l[0].includes('<b>a.b(</b>'));
  assert.strictEqual(l[1].split('\t').length, 3);
});
t('exports: save the right files; nothing to export gives a message and no file', () => {
  reset(); WN.exportCsv(); WN.exportAnki(); assert.strictEqual(sent.length, 0); assert.strictEqual(toasts.length, 2);
  reset(OLD()); WN.exportCsv(); WN.exportAnki();
  assert.deepStrictEqual(sent.map(x => x.n), ['wordtrail-words.csv', 'wordtrail-anki.txt']); assert.ok(/csv/.test(sent[0].ty)); assert.ok(/text\/plain/.test(sent[1].ty));
});
t('export does not change saved words', () => {
  reset(OLD()); const before = disk['wt:words']; WN.exportCsv(); WN.exportAnki(); assert.strictEqual(disk['wt:words'], before);
});
console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
