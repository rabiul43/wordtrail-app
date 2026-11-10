#!/usr/bin/env node
/* Splits a book text into the SAME sentences the app shows, using the app's own Core (src/js/010-core.js).
   Used by tools/make_translation_pack.py; you can also run it by hand:
     node tools/pack_sentences.js book.txt > sentences.json
   Output: { "v": 1, "sents": [ { "t": "sentence text", "ch": chapter index }, ... ] }   (headings are left out: the app never translates them)
   No network, no npm install. Exit code 2 if the file cannot be read. */
const fs = require('fs'), path = require('path'), vm = require('vm');
const file = process.argv[2];
if (!file) { console.error('usage: node tools/pack_sentences.js book.txt > sentences.json'); process.exit(2); }
let raw;
try { raw = fs.readFileSync(file, 'utf8'); } catch (e) { console.error('cannot read ' + file + ': ' + e.message); process.exit(2); }
const ctx = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'src/js/010-core.js'), 'utf8') + '\nthis.Core = Core;', ctx);
const book = ctx.Core.parseBook(raw);
const sents = book.sents.filter(s => !s.h && typeof s.t === 'string' && s.t.trim()).map(s => ({ t: s.t.trim(), ch: s.ch }));
process.stdout.write(JSON.stringify({ v: 1, sents }) + '\n');
