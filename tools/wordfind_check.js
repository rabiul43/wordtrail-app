#!/usr/bin/env node
/* Automatic checks for My Words search, filters and collections (166) and the word-store rename it uses (147), plus the sync and backup
   entries for wt:wcols (295, 290). No browser, no npm install.
     node tools/wordfind_check.js
   Loads the REAL files from src/js/, so it tests what ships. Exit code 1 if a check fails, 2 if a file cannot be loaded. */
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, 'src/js', f), 'utf8');
const plain = x => JSON.parse(JSON.stringify(x));
function grab(src, name) {
  const m = new RegExp('(?:async\\s+)?function\\s+' + name + '\\s*\\(|const\\s+' + name + '\\s*=').exec(src);
  if (!m) throw new Error('not found: ' + name);
  if (src[m.index] === 'c') return src.slice(m.index, src.indexOf('\n', m.index));
  let i = src.indexOf('{', m.index), d = 0;
  for (; i < src.length; i++) { if (src[i] === '{') d++; else if (src[i] === '}' && --d === 0) return src.slice(m.index, i + 1); }
  throw new Error('unbalanced: ' + name);
}
const disk = {}, log = [];
const store = { get(k, d) { try { const v = disk[k]; return v ? JSON.parse(v) : d; } catch (e) { return d; } }, set(k, v) { disk[k] = JSON.stringify(v); log.push(k); } };
let T;
try {
  const l160 = read('160-learning-tools.js'), l295 = read('295-account-sync.js');
  const code = read('146-word-model.js') + '\n' + read('147-word-store.js') + '\n' + read('148-scheduler.js') + '\n' + grab(l160, 'myWords') + '\n' + grab(l160, 'srsDue') + '\n' +
    read('165-word-cards.js') + '\n' + read('166-word-find.js') + '\n' + ['acKeyOf', 'acWords', 'acUnion', 'acIsObj', 'acResolve'].map(n => grab(l295, n)).join('\n') +
    '\nthis.T = { WM, WS, SRS, WC, WF, srsDue, acUnion, acResolve };';
  const ctx = vm.createContext({ store, S: { book: null }, VOC: { tab: 'mine' }, toast: () => {}, vlist: () => {}, h: () => ({}), WM: undefined });
  delete ctx.WM; vm.runInContext(code, ctx); T = ctx.T;
} catch (e) { console.error('wordfind_check: cannot load the code: ' + e.message); process.exit(2); }
const { WS, WF } = T;
let pass = 0, fail = 0;
function t(name, fn) { try { fn(); pass++; console.log('ok    ' + name); } catch (e) { fail++; console.log('FAIL  ' + name + '\n        ' + String(e.message).split('\n').slice(0, 6).join('\n        ')); } }
const reset = list => { Object.keys(disk).forEach(k => delete disk[k]); log.length = 0; if (list) disk['wt:words'] = JSON.stringify(list); };
const saved = () => JSON.parse(disk['wt:words'] || '[]');
const names = x => plain(x.map(e => e.w));
const DAY = 86400000;
const SAMPLE = () => [
  { ts: 6, w: 'forlorn', lv: 'C1', ex: 'She sat looking forlorn and tired.', bid: '345', bt: 'Dracula', due: Date.now() - 1000, hard: true, note: 'sad and alone', cols: ['Gothic'] },
  { ts: 5, w: 'tremble', ex: 'He began to tremble.', bid: '345', bt: 'Dracula', due: Date.now() + 5 * DAY },
  { ts: 4, w: 'solitude', ex: 'A life of solitude.', bid: '158', bt: 'Emma' },
  { ts: 3, w: 'ample', ex: 'Ample room for all.', bid: '158', bt: 'Emma', due: Date.now() - 5 }
];

/* ---- search and filters ---- */
t('search by word (exact, start, inside), by sentence, by note; empty search gives everything newest first', () => {
  reset(SAMPLE());
  assert.deepStrictEqual(names(WF.find('', 'all')), ['forlorn', 'tremble', 'solitude', 'ample']);
  assert.deepStrictEqual(names(WF.find('trem', 'all')), ['tremble']);
  assert.deepStrictEqual(names(WF.find('ample', 'all')), ['ample']);                // exact word
  assert.deepStrictEqual(names(WF.find('LONE', 'all')), ['forlorn']);               // only inside a note, any case
  assert.deepStrictEqual(names(WF.find('sol', 'all')), ['solitude']);               // start of a word
  assert.deepStrictEqual(names(WF.find('life of', 'all')), ['solitude']);           // sentence
  assert.deepStrictEqual(names(WF.find('sad and', 'all')), ['forlorn']);            // note
  assert.deepStrictEqual(names(WF.find('zzz', 'all')), []);
});
t('filters: Hard, Due (no due time counts as due), one book', () => {
  reset(SAMPLE());
  assert.deepStrictEqual(names(WF.find('', 'hard')), ['forlorn']);
  assert.deepStrictEqual(names(WF.find('', 'due')), ['forlorn', 'solitude', 'ample']);
  assert.deepStrictEqual(names(WF.find('', 'b:345')), ['forlorn', 'tremble']);
  assert.deepStrictEqual(names(WF.find('', 'b:158')), ['solitude', 'ample']);
});
t('search and a filter work together', () => {
  reset(SAMPLE());
  assert.deepStrictEqual(names(WF.find('a', 'due')), ['ample', 'forlorn', 'solitude']);   // word starts with a first, then note/sentence hits, newest first
  assert.deepStrictEqual(names(WF.find('room', 'b:158')), ['ample']);
  assert.deepStrictEqual(names(WF.find('room', 'b:345')), []);
  assert.deepStrictEqual(names(WF.find('tired', 'hard')), ['forlorn']);
});
t('books: one per book, most words first, name from the saved places', () => {
  reset(SAMPLE()); WS.saveWithContext('forlorn', { s: 'A forlorn house.', bid: 158, bt: 'Emma' });
  const b = plain(WF.books(WS.all()));
  assert.deepStrictEqual(b.map(x => [x.id, x.name, x.n]).sort(), [['158', 'Emma', 3], ['345', 'Dracula', 2]].sort());
  assert.strictEqual(b[0].n >= b[1].n, true);
});
t('old entries (never upgraded, no ctx) are found and filtered, and reading writes nothing', () => {
  reset([{ ts: 1, w: 'ancient', ex: 'An ancient oak.', bid: 12, bt: 'Old Book' }]); log.length = 0;
  assert.deepStrictEqual(names(WF.find('oak', 'all')), ['ancient']); assert.deepStrictEqual(names(WF.find('', 'b:12')), ['ancient']);
  assert.strictEqual(WF.books(WS.all())[0].name, 'Old Book'); assert.strictEqual(log.length, 0);
});

/* ---- collections ---- */
t('create: trimmed, shortened to 40, an empty one is kept in wt:wcols, the same name in any case is not made twice', () => {
  reset(SAMPLE());
  assert.deepStrictEqual(plain(WF.create('  IELTS  ')), { ok: true, name: 'IELTS' });
  assert.deepStrictEqual(plain(WF.create('ielts')), { ok: true, name: 'IELTS', existed: true });
  assert.deepStrictEqual(plain(WF.create('   ')), { ok: false, why: 'empty' });
  assert.strictEqual(WF.create('x'.repeat(60)).name.length, 40);
  assert.deepStrictEqual(JSON.parse(disk['wt:wcols']), ['IELTS', 'x'.repeat(40)]);
  assert.strictEqual(WF.create('gothic').existed, true);                              // a name that only lives on a word counts too
});
t('create: at most 40 collections', () => {
  reset(SAMPLE()); for (let i = 0; i < 39; i++) WF.create('c' + i);                    // 39 + Gothic (on a word) = 40
  assert.deepStrictEqual(plain(WF.create('one more')), { ok: false, why: 'limit' });
});
t('collections(): names from wt:wcols and from words, counts, A to Z, no repeats in any case', () => {
  reset(SAMPLE()); WF.create('Trip'); WS.addToCollection('ample', 'trip'); WS.addToCollection('tremble', 'Gothic'); WS.addToCollection('tremble', 'gothic');
  assert.deepStrictEqual(plain(WF.collections(WS.all())), [{ name: 'Gothic', n: 2 }, { name: 'Trip', n: 1 }]);
});
t('add and remove words (the store), then the collection filter and its search', () => {
  reset(SAMPLE()); WF.create('IELTS'); WS.addToCollection('ample', 'IELTS'); WS.addToCollection('solitude', 'ielts');
  assert.deepStrictEqual(names(WF.find('', 'c:IELTS')), ['solitude', 'ample']);
  assert.deepStrictEqual(names(WF.find('room', 'c:ielts')), ['ample']);
  WS.addToCollection('ample', 'IELTS', false); assert.deepStrictEqual(names(WF.find('', 'c:IELTS')), ['solitude']);
  assert.deepStrictEqual(names(WF.find('', 'c:Empty')), []);
});
t('collections persist: a fresh read of the stored text still has them', () => {
  reset(SAMPLE()); WF.create('Later'); WS.addToCollection('ample', 'IELTS');
  const copy = { 'wt:words': disk['wt:words'], 'wt:wcols': disk['wt:wcols'] }; reset(); Object.assign(disk, copy);
  assert.deepStrictEqual(plain(WF.collections(WS.all())).map(c => c.name), ['Gothic', 'IELTS', 'Later']);
});
t('rename: every word changes in ONE write, other fields and other collections stay, wt:wcols follows', () => {
  reset(SAMPLE()); WF.create('Old'); WS.addToCollection('ample', 'Old'); WS.addToCollection('ample', 'Keep'); WS.addToCollection('tremble', 'old'); log.length = 0;
  const r = plain(WF.rename('OLD', 'New')); assert.deepStrictEqual(r, { ok: true, n: 2, name: 'New' });
  assert.strictEqual(log.filter(k => k === 'wt:words').length, 1);
  const l = saved(), a = l.find(e => e.w === 'ample'); assert.deepStrictEqual(a.cols, ['New', 'Keep']); assert.strictEqual(a.ex, 'Ample room for all.'); assert.strictEqual(l.find(e => e.w === 'forlorn').note, 'sad and alone');
  assert.deepStrictEqual(JSON.parse(disk['wt:wcols']), ['New']); assert.deepStrictEqual(plain(WF.collections(WS.all())).map(c => c.name), ['Keep', 'Gothic', 'New'].sort());
});
t('rename: a name that already exists, an empty name and an unknown collection are refused and nothing is written', () => {
  reset(SAMPLE()); WS.addToCollection('ample', 'A'); WS.addToCollection('ample', 'B'); log.length = 0;
  assert.deepStrictEqual(plain(WF.rename('A', 'b')), { ok: false, why: 'exists' }); assert.deepStrictEqual(plain(WF.rename('A', ' ')), { ok: false, why: 'empty' });
  assert.deepStrictEqual(plain(WF.rename('Zed', 'Q')), { ok: false, why: 'missing' }); assert.strictEqual(log.length, 0);
  assert.strictEqual(WF.rename('A', 'a').ok, true); assert.deepStrictEqual(saved().find(e => e.w === 'ample').cols, ['a', 'B']);   // only the case changes
});
t('WS.renameCollection: a word that already has the new name just loses the old one; unknown name changes nothing', () => {
  reset(SAMPLE()); WS.addToCollection('ample', 'A'); WS.addToCollection('ample', 'B');
  assert.strictEqual(WS.renameCollection('A', 'b'), 1); assert.deepStrictEqual(saved().find(e => e.w === 'ample').cols, ['B']);
  log.length = 0; assert.strictEqual(WS.renameCollection('nope', 'x'), 0); assert.strictEqual(WS.renameCollection('B', ''), 0); assert.strictEqual(log.length, 0);
});

/* ---- speed ---- */
t('speed: search + filter over 2000 saved words', () => {
  const big = []; for (let i = 0; i < 2000; i++) big.push({ ts: 5000 - i, w: 'word' + i, ex: 'Sentence number ' + i + ' with some more words in it for the book.', bid: String(i % 12), bt: 'Book ' + (i % 12), note: i % 7 ? '' : 'a note ' + i, cols: i % 5 ? [] : ['Fives'] });
  reset(big); WF.find('word1', 'all');
  const N = 30, t0 = process.hrtime.bigint();
  for (let i = 0; i < N; i++) { WF.find('number 19', 'all'); WF.find('wor', 'b:3'); WF.find('', 'c:Fives'); }
  const ms = Number(process.hrtime.bigint() - t0) / 1e6 / (N * 3);
  console.log('      2000 words: ' + ms.toFixed(1) + ' ms per search (the screen waits 100 ms after the last key before searching)');
  assert.ok(ms < 60, ms + ' ms per search is too slow');
  const t1 = process.hrtime.bigint(); WF.collections(WS.all()); WF.books(WS.all()); const m2 = Number(process.hrtime.bigint() - t1) / 1e6;
  console.log('      pills (collections + books) for 2000 words: ' + m2.toFixed(1) + ' ms'); assert.ok(m2 < 100);
});

/* ---- sync and backup ---- */
t('sync: wt:wcols is in the library category, merged (not overwritten) on conflict, capped at 40, one name per spelling', () => {
  const s = read('295-account-sync.js'); assert.ok(/k === 'wt:wcols'/.test(s.split('AC_CATS')[1].split('];')[0]));
  const u = JSON.parse(T.acUnion('wt:wcols', JSON.stringify(['IELTS', 'Trip']), JSON.stringify(['ielts', 'Emma'])));
  assert.deepStrictEqual(u.map(x => x.toLowerCase()).sort(), ['emma', 'ielts', 'trip']);
  const r = JSON.parse(T.acResolve('wt:wcols', JSON.stringify(['a']), JSON.stringify(['b']), true)); assert.deepStrictEqual(r.sort(), ['a', 'b']);
  const many = JSON.parse(T.acUnion('wt:wcols', JSON.stringify(Array.from({ length: 30 }, (_, i) => 'a' + i)), JSON.stringify(Array.from({ length: 30 }, (_, i) => 'b' + i)))); assert.strictEqual(many.length, 40);
  assert.ok(/AC_MERGE = k => [^\n]*'wt:wcols'/.test(s));
});
t('backup: wt:wcols is saved and restored as a list', () => {
  const s = read('290-backup-maintenance.js'); assert.ok(/BK_KEYS = \[[^\]]*'wt:wcols'/.test(s)); assert.ok(/BK_LISTS = \[[^\]]*'wt:wcols'/.test(s));
});
t('wiring: the new files are in build.py, and 160 calls WF only for My words', () => {
  const b = fs.readFileSync(path.join(root, 'build.py'), 'utf8'); assert.ok(b.includes('src/js/166-word-find.js') && b.includes('src/css/94d-word-find.css'));
  assert.ok(b.indexOf('165-word-cards.js') < b.indexOf('166-word-find.js'));
  const l = read('160-learning-tools.js'); assert.ok(l.includes('WF.show(VOC.tab === \'mine\')') && l.includes('WF.render(list, help, mine)'));
});

console.log('\n' + (fail ? fail + ' FAILED, ' + pass + ' passed' : 'all ' + pass + ' passed'));
process.exit(fail ? 1 : 0);
