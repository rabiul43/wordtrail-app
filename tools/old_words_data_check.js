#!/usr/bin/env node
/* Checks the two data files for the old-words and idioms highlight: src/data/old-words.json and src/data/idioms.json.
   They must load, have the right shape, have no duplicates, and every entry must still be marked r=1 (needs review).
   No browser, no npm install:   node tools/old_words_data_check.js
   It also runs the same rules on deliberately broken copies, to prove that a mistake is caught.
   Exit code 1 if a check fails, 2 if a file cannot be loaded. */
const fs = require('fs'), path = require('path');
const dir = path.join(__dirname, '..', 'src', 'data');

const WORD = /^'?[a-z]+(?:['-][a-z]+)*$/;          // hath, ne'er, 'tis, to-day
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const PHRASE = /^[a-z'-]+(?: [a-z'-]+)+$/;          // two or more words (after {p} is replaced by a word)
const KINDS = {
  'old-words': { list: 'w', max: 60, ok: ['id', 'm', 'f', 'n', 'amb', 'r'], flag: 'amb' },
  'idioms': { list: 'i', max: 120, ok: ['id', 'p', 'm', 'f', 'old', 'r'], flag: 'old' }
};
const expand = p => p.replace(/\{p\}/g, 'her');       // for the shape tests only: any possessive will do
const fixed = (s, max) => typeof s === 'string' && s.length > 0 && s.length <= max && s === s.trim() && !/[{}\n]/.test(s);

/* Returns a list of problems (empty = valid). `d` is the parsed file. */
function validate(d, kind) {
  const K = KINDS[kind], bad = [];
  if (!d || typeof d !== 'object') return ['not an object'];
  if (d.v !== 1) bad.push('v must be 1');
  if (d.kind !== kind) bad.push('kind must be "' + kind + '"');
  if (d.lang !== 'en') bad.push('lang must be "en"');
  const rows = d[K.list];
  if (!Array.isArray(rows) || !rows.length) return bad.concat('list "' + K.list + '" is missing or empty');
  const ids = new Set(), keys = new Map();   // keys: every string the reader will look for -> the entry that owns it
  rows.forEach((e, n) => {
    const at = 'entry ' + (n + 1) + (e && e.id ? ' (' + e.id + ')' : '');
    if (!e || typeof e !== 'object' || Array.isArray(e)) return bad.push(at + ': not an object');
    for (const k of Object.keys(e)) if (!K.ok.includes(k)) bad.push(at + ': unknown field "' + k + '" (typo?)');
    if (e.r !== 0 && e.r !== 1) bad.push(at + ': r must be 0 or 1 (1 = needs review)');
    if (e[K.flag] !== undefined && e[K.flag] !== 1) bad.push(at + ': ' + K.flag + ' must be 1 when present');
    if (typeof e.id !== 'string' || !(kind === 'old-words' ? WORD : SLUG).test(e.id)) bad.push(at + ': id is missing or has a character that is not allowed');
    else if (ids.has(e.id)) bad.push(at + ': id used twice');
    else ids.add(e.id);
    if (!fixed(e.m, K.max)) bad.push(at + ': m (meaning) must be 1 to ' + K.max + ' characters, trimmed');
    if (e.n !== undefined && !fixed(e.n, 120)) bad.push(at + ': n (note) must be 1 to 120 characters, trimmed');
    const forms = [];
    if (kind === 'old-words') { if (typeof e.id === 'string') forms.push(e.id); }
    else if (typeof e.p !== 'string' || !PHRASE.test(expand(e.p)) || e.p !== e.p.toLowerCase()) bad.push(at + ': p (phrase) must be two or more lower case words');
    else forms.push(e.p);
    if (typeof e.m === 'string' && typeof e.id === 'string' && e.m.toLowerCase() === (e.p || e.id)) bad.push(at + ': the meaning repeats the entry');
    if (e.f !== undefined) {
      if (!Array.isArray(e.f) || !e.f.length) bad.push(at + ': f must be a non-empty list (leave it out if there are no other forms)');
      else for (const f of e.f) {
        if (typeof f !== 'string' || !(kind === 'old-words' ? WORD.test(f) : PHRASE.test(expand(f)) && f === f.toLowerCase())) bad.push(at + ': form "' + f + '" is not allowed');
        else forms.push(f);
      }
    }
    for (const f of forms) {
      const k = f.toLowerCase();
      if (keys.has(k) && keys.get(k) !== e.id) bad.push(at + ': "' + f + '" is also in entry ' + keys.get(k));
      else if (keys.get(k) === e.id && f !== e.id && f !== e.p) bad.push(at + ': form "' + f + '" listed twice');
      keys.set(k, e.id);
    }
  });
  return bad;
}

/* ----- load the real files ----- */
const data = {}, size = {};
for (const [kind, file] of [['old-words', 'old-words.json'], ['idioms', 'idioms.json']]) {
  try { const raw = fs.readFileSync(path.join(dir, file), 'utf8'); size[kind] = raw.length; data[kind] = JSON.parse(raw); }
  catch (e) { console.error('old_words_data_check: cannot load src/data/' + file + ': ' + e.message); process.exit(2); }
}

const results = [];
const t = (name, fn) => { try { const r = fn(); results.push(r === true || r === undefined ? [name, true] : [name, false, String(r)]); } catch (e) { results.push([name, false, e.message]); } };

for (const kind of Object.keys(KINDS)) {
  t(kind + ': loads and every rule holds', () => { const b = validate(data[kind], kind); return b.length ? b.slice(0, 8).join('\n      ') + (b.length > 8 ? '\n      ... and ' + (b.length - 8) + ' more' : '') : true; });
  t(kind + ': every entry is marked as needing review (r=1)', () => { const rows = data[kind][KINDS[kind].list], n = rows.filter(e => e.r === 1).length; return n === rows.length ? true : (rows.length - n) + ' of ' + rows.length + ' entries are not r=1'; });
}

/* The sample text of the mock-up must be found by these two files (same text as the picture: hath, whilst, two idioms; "ere" is in its list). */
t('mock-up sample: hath, whilst and ere are old words; "at the end of her tether" and "hold my tongue" are idioms', () => {
  const text = '\u201cHe hath no wish to trouble you,\u201d she said, at the end of her tether. \u201cWhilst you speak so, I cannot hold my tongue.\u201d';
  const norm = text.toLowerCase().replace(/[\u2019\u2018]/g, "'").replace(/[^a-z'-]+/g, ' ');
  const words = new Set(norm.split(' ').filter(Boolean)), have = new Set(data['old-words'].w.flatMap(e => [e.id].concat(e.f || [])));
  const got = ['hath', 'whilst'].filter(w => words.has(w) && have.has(w));
  if (got.length !== 2) return 'old words not found in the sample text';
  if (!have.has('ere')) return 'ere is missing';
  const POSS = '(?:my|your|his|her|its|our|their)';
  const hit = p => new RegExp('(?:^| )' + p.replace(/[.*+?^$()|[\]\\]/g, '\\$&').replace(/\\?\{p\\?\}/g, POSS).replace(/ /g, ' ') + '(?: |$)').test(norm);
  for (const ph of ['at the end of {p} tether', 'hold {p} tongue']) {
    const e = data['idioms'].i.find(x => x.p === ph);
    if (!e) return 'idiom missing: ' + ph;
    if (!hit(e.p)) return 'idiom not found in the sample text: ' + ph;
  }
  return true;
});

/* The checker must catch mistakes: every broken copy below has to produce at least one problem. */
const clone = x => JSON.parse(JSON.stringify(x));
const breakers = [
  ['a second entry with the same id', 'old-words', d => d.w.push(clone(d.w[0]))],
  ['an entry without r', 'old-words', d => { delete d.w[3].r; }],
  ['r set to 2', 'idioms', d => { d.i[3].r = 2; }],
  ['a misspelt field name', 'old-words', d => { d.w[2].meaning = 'x'; }],
  ['an empty meaning', 'idioms', d => { d.i[2].m = ''; }],
  ['a meaning that is too long', 'old-words', d => { d.w[4].m = 'x'.repeat(61); }],
  ['a capital letter in an old word', 'old-words', d => { d.w[5].id = 'Hath2'; }],
  ['the same form in two entries', 'old-words', d => { d.w[6].f = [d.w[7].id]; }],
  ['a one-word idiom', 'idioms', d => { d.i[1].p = 'tongue'; }],
  ['a wrong placeholder', 'idioms', d => { d.i[0].p = 'at the end of {x} tether'; }],
  ['a wrong version', 'idioms', d => { d.v = 2; }],
  ['an empty list', 'old-words', d => { d.w = []; }]
];
for (const [name, kind, f] of breakers) t('the checker catches: ' + name, () => { const d = clone(data[kind]); f(d); return validate(d, kind).length ? true : 'NOT caught'; });
t('the checker accepts the real files untouched (so the broken copies above fail only because of the break)', () => Object.keys(KINDS).every(k => validate(clone(data[k]), k).length === 0) || 'real files not valid');

let failed = 0;
for (const r of results) { console.log((r[1] ? 'PASS  ' : 'FAIL  ') + r[0] + (r[1] ? '' : '\n      ' + r[2])); if (!r[1]) failed++; }
const cnt = k => { const rows = data[k][KINDS[k].list]; return rows.length + ' entries, ' + rows.filter(e => e.r === 1).length + ' with r=1'; };
console.log('\nold-words.json: ' + cnt('old-words') + ', ' + size['old-words'] + ' bytes.  idioms.json: ' + cnt('idioms') + ', ' + size['idioms'] + ' bytes.');
console.log((results.length - failed) + ' of ' + results.length + ' checks passed');
process.exit(failed ? 1 : 0);
