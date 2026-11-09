#!/usr/bin/env node
/* Automatic checks for the dictionary data module (149) and the vocDefine in 160 that now uses it (no browser, no network, no npm install).
     node tools/dict_check.js
   Loads the REAL src/js/149-dictionary-data.js with a fake network and a fake IndexedDB. Exit code 1 if a check fails, 2 if a file cannot be loaded. */
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, 'src/js', f), 'utf8');
const plain = x => JSON.parse(JSON.stringify(x));
function grab(src, name) {
  const m = new RegExp('(?:async\\s+)?function\\s+' + name + '\\s*\\(').exec(src);
  if (!m) throw new Error('not found: ' + name);
  let i = src.indexOf('{', m.index), d = 0;
  for (; i < src.length; i++) { if (src[i] === '{') d++; else if (src[i] === '}' && --d === 0) return src.slice(m.index, i + 1); }
  throw new Error('unbalanced: ' + name);
}

/* A raw answer shaped like api.dictionaryapi.dev (two entries for one word, as it does for some words). */
const RAW = [
  { word: 'forlorn', phonetic: "/fəˈlɔːn/", phonetics: [{ audio: '' }, { text: "/fəˈlɔːn/", audio: 'https://api.dictionaryapi.dev/media/pronunciations/en/forlorn-us.mp3' }],
    origin: 'Old English forloren, past participle of forleosan.',
    meanings: [
      { partOfSpeech: 'adjective', synonyms: ['desolate', 'Lonely'], antonyms: ['cheerful'], definitions: [
        { definition: 'Pitifully sad and lonely.', example: 'She sat alone, looking forlorn.', synonyms: ['abandoned', 'desolate', 'forlorn'], antonyms: [] },
        { definition: 'Hopeless; without any chance.', synonyms: [], antonyms: ['content'] },
        { definition: '   ', example: 'ignored: empty definition' }] },
      { partOfSpeech: 'noun', definitions: [{ definition: 'A lost cause.', example: 'She sat alone, looking forlorn.' }] }] },
  { word: 'forlorn', meanings: [{ partOfSpeech: 'adjective', definitions: [{ definition: 'Left behind.' }] }] }
];

const disk = {}; let calls = 0, mode = 'ok', now = 1.7e12;
const fakeIdb = { async get(k) { return disk[k] === undefined ? undefined : JSON.parse(disk[k]); }, async set(k, v) { disk[k] = JSON.stringify(v); return true; } };
const fakeFetch = async url => {
  calls++;
  if (mode === 'down') throw new Error('network down');
  if (mode === 'none') return { status: 404, ok: false, json: async () => ({}) };
  if (mode === '500') return { status: 500, ok: false, json: async () => ({}) };
  return { status: 200, ok: true, json: async () => plain(RAW), url };
};
const ctx = vm.createContext({ idb: fakeIdb, fetch: fakeFetch, AbortController, setTimeout, clearTimeout, navigator: { onLine: true }, Date: class extends Date { static now() { return now; } }, VOC: { defs: new Map() } });
let DICT, vocDefine;
try {
  vm.runInContext(read('149-dictionary-data.js') + '\nthis.DICT = DICT;', ctx); DICT = ctx.DICT;
  vm.runInContext(grab(read('160-learning-tools.js'), 'vocDefine') + '\nthis.vocDefine = vocDefine;', ctx); vocDefine = ctx.vocDefine;
} catch (e) { console.error('dict_check: cannot load the code: ' + e.message); process.exit(2); }

let pass = 0, fail = 0;
async function t(name, fn) { try { await fn(); pass++; console.log('ok    ' + name); } catch (e) { fail++; console.log('FAIL  ' + name + '\n        ' + String(e.message).split('\n').slice(0, 6).join('\n        ')); } }
const reset = m => { Object.keys(disk).forEach(k => delete disk[k]); calls = 0; mode = m || 'ok'; ctx.VOC.defs.clear(); };
const DAY = 864e5;

(async () => {
  await t('clean: ipa, audio, origin, every part of speech, every definition, examples, synonyms, antonyms', () => {
    const d = plain(DICT.clean(RAW, 'Forlorn'));
    assert.strictEqual(d.v, 1); assert.strictEqual(d.w, 'forlorn'); assert.strictEqual(d.ipa, '/fəˈlɔːn/');
    assert.strictEqual(d.audio, 'https://api.dictionaryapi.dev/media/pronunciations/en/forlorn-us.mp3'); assert.ok(d.origin.startsWith('Old English'));
    assert.deepStrictEqual(d.pos, ['adjective', 'noun']); assert.strictEqual(d.meanings.length, 3);
    assert.deepStrictEqual(d.meanings[0].defs.map(x => x.d), ['Pitifully sad and lonely.', 'Hopeless; without any chance.']);   // empty definition dropped
    assert.deepStrictEqual(d.meanings[0].defs[0].syn, ['abandoned', 'desolate']);                                             // the word itself is not its own synonym
    assert.deepStrictEqual(d.syn, ['abandoned', 'desolate', 'Lonely']); assert.deepStrictEqual(d.ant, ['content', 'cheerful']);
    assert.deepStrictEqual(d.ex, ['She sat alone, looking forlorn.']);                                                         // the same example is kept once
  });
  await t('clean: junk gives null, never throws', () => {
    [null, undefined, {}, [], [null, 5, 'x'], [{ meanings: [] }], [{ meanings: [{ definitions: [{ definition: '' }] }] }]].forEach(j => assert.strictEqual(DICT.clean(j, 'x'), null));
    assert.strictEqual(DICT.clean(RAW, ''), null);
  });
  await t('clean: sizes are capped and an http audio link is ignored', () => {
    const many = Array.from({ length: 40 }, (_, i) => ({ definition: 'd' + i + ' ' + 'x'.repeat(500), example: 'e' + i, synonyms: ['s' + i], antonyms: ['a' + i] }));
    const d = DICT.clean([{ phonetics: [{ audio: 'http://insecure/x.mp3' }], meanings: Array.from({ length: 15 }, () => ({ partOfSpeech: 'verb', definitions: many })) }], 'run');
    assert.strictEqual(d.audio, ''); assert.strictEqual(d.meanings.length, 10); assert.strictEqual(d.meanings[0].defs.length, 12);
    assert.ok(d.meanings[0].defs[0].d.length <= 320); assert.ok(d.syn.length <= 12 && d.ant.length <= 12 && d.ex.length <= 8);
  });
  await t('online: full data comes back and is saved under dict:<word>', async () => {
    reset(); const r = await DICT.get('  Forlorn ');
    assert.strictEqual(r.ok, true); assert.strictEqual(r.from, 'net'); assert.strictEqual(r.data.meanings.length, 3); assert.strictEqual(r.data.fetched, now);
    assert.ok(disk['dict:forlorn']); assert.strictEqual(JSON.parse(disk['dict:forlorn']).ipa, '/fəˈlɔːn/'); assert.strictEqual(calls, 1);
  });
  await t('a fresh saved copy is used without asking the service again', async () => {
    now += 5 * DAY; const r = await DICT.get('forlorn'); assert.strictEqual(r.from, 'cache'); assert.strictEqual(calls, 1); assert.strictEqual(r.data.meanings.length, 3);
  });
  await t('offline: the saved copy comes back, even when it is old', async () => {
    mode = 'down'; now += 60 * DAY; const r = await DICT.get('forlorn');
    assert.strictEqual(r.ok, true); assert.strictEqual(r.from, 'old-cache'); assert.strictEqual(r.data.ipa, '/fəˈlɔːn/'); assert.strictEqual(calls, 2);
  });
  await t('a service error (500) also falls back to the saved copy', async () => {
    mode = '500'; const r = await DICT.get('forlorn'); assert.strictEqual(r.from, 'old-cache');
  });
  await t('navigator.onLine false: no request is made, the saved copy is used', async () => {
    mode = 'ok'; ctx.navigator.onLine = false; const before = calls; const r = await DICT.get('forlorn'); ctx.navigator.onLine = true;
    assert.strictEqual(r.from, 'old-cache'); assert.strictEqual(calls, before);
  });
  await t('old copy plus a working service: refreshed from the service', async () => {
    mode = 'ok'; const r = await DICT.get('forlorn'); assert.strictEqual(r.from, 'net'); assert.strictEqual(r.data.fetched, now);
  });
  await t('refresh:true asks the service even when the copy is fresh', async () => {
    const before = calls; const r = await DICT.get('forlorn', { refresh: true }); assert.strictEqual(r.from, 'net'); assert.strictEqual(calls, before + 1);
  });
  await t('offline with nothing saved: reason offline, nothing written', async () => {
    reset('down'); const r = await DICT.get('zebra'); assert.deepStrictEqual(plain(r), { ok: false, reason: 'offline' }); assert.strictEqual(Object.keys(disk).length, 0);
  });
  await t('no entry (404): reason none, remembered for a week, then asked again', async () => {
    reset('none'); assert.deepStrictEqual(plain(await DICT.get('qwertyx')), { ok: false, reason: 'none' }); assert.strictEqual(calls, 1);
    await DICT.get('qwertyx'); assert.strictEqual(calls, 1);
    now += 8 * DAY; await DICT.get('qwertyx'); assert.strictEqual(calls, 2);
  });
  await t('a broken saved copy is ignored and replaced', async () => {
    reset(); disk['dict:forlorn'] = JSON.stringify({ v: 9, junk: true }); const r = await DICT.get('forlorn'); assert.strictEqual(r.from, 'net');
  });
  await t('two askers at once make one request', async () => {
    reset(); const [a, b] = await Promise.all([DICT.get('forlorn'), DICT.get('FORLORN')]); assert.strictEqual(calls, 1); assert.strictEqual(a, b);
  });
  await t('empty word: reason none, no request', async () => { reset(); const r = await DICT.get('  '); assert.strictEqual(r.reason, 'none'); assert.strictEqual(calls, 0); });
  await t('vocDefine (the old Review/word list line) gives the same text as before and now works offline', async () => {
    reset(); const a = await vocDefine('forlorn'); assert.strictEqual(a, 'adjective: Pitifully sad and lonely.');
    ctx.VOC.defs.clear(); mode = 'down'; now += 90 * DAY; assert.strictEqual(await vocDefine('forlorn'), a);
    reset('none'); assert.strictEqual(await vocDefine('qwertyx'), '');
    reset('down'); await assert.rejects(() => vocDefine('zebra'));
  });
  console.log('\n' + (fail ? fail + ' FAILED, ' + pass + ' passed' : 'all ' + pass + ' passed')); process.exit(fail ? 1 : 0);
})();
