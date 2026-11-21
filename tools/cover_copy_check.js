/* Checks the own-copy cover logic of src/js/100-home-covers.js with fake data (no network, no browser).
   Run: node tools/cover_copy_check.js   (last line must say "0 failed") */
const fs = require('fs'), vm = require('vm'), path = require('path');
let src = fs.readFileSync(path.join(__dirname, '..', 'src/js/100-home-covers.js'), 'utf8');
src = src.replace('const COV_WAIT = 5000;', 'const COV_WAIT = 60;').replace('COV_START_WAIT = 2500', 'COV_START_WAIT = 300').replace('__WT_HOST_ADMIN__', 'https://admin.example');
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : (fail++, console.log('FAIL ' + m)); if (c) console.log('ok    ' + m); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

function world(opts) {
  const mem = {}, idbm = opts.idb || {};
  class Img { constructor() { this.l = {}; this.classList = { s: new Set(), add: x => this.classList.s.add(x), contains: x => this.classList.s.has(x) }; this.reqs = []; }
    addEventListener(e, f) { this.l[e] = f; } remove() { this.removed = true; }
    set src(v) { this._s = v; this.reqs.push(v); } get src() { return this._s; } }
  const box = { style: { setProperty() {} }, classList: { remove() {}, add() {} }, textContent: '', append() {}, _b: null };
  const h = (t, a) => (t === 'img' ? new Img() : {});
  const fetched = [];
  const ctx = vm.createContext({
    h, console, setTimeout, clearTimeout, AbortController, Date, Math, JSON, String, Array, Set, Map, Promise, Number, document: { querySelectorAll: () => [] }, $$: () => [],
    P: {}, HF_PROXY: opts.proxy === undefined ? 'https://hf.example' : opts.proxy,
    store: { get: (k, d) => (k in mem ? mem[k] : d), set: (k, v) => { mem[k] = v; } },
    idb: { get: async k => idbm[k], set: async (k, v) => { idbm[k] = v; } },
    fetch: async u => { fetched.push(u); const f = opts.files && opts.files[u.split('/').pop()]; if (!f) return { ok: false }; return { ok: true, json: async () => f }; },
    openLibraryCover: undefined
  });
  vm.runInContext('(function(){' + (opts.noAdmin ? src.replace("const COV_ADMIN = 'https://admin.example'", "const COV_ADMIN = ''") : src).replace(/^[\s\S]*?\/\* Curated/, '/* Curated') + '\n this.api = { coverFill, covOwn, COV, covLoad }; }).call(this)', ctx);
  return { api: ctx.api, box, fetched, idbm, ctx };
}
const IDX = { v: 1, b: { '345': 'ol,lv', '1342': 'se,pg,lv', '7': 'lv' } };

(async () => {
  let w = world({ files: { 'index.json': IDX, 'cover-overrides.json': { v: 1, b: { '1342': { best: 'pg', off: ['lv'] }, '7': { off: ['lv'] } } } } });
  await w.api.covLoad();
  const own = id => w.api.covOwn({ id });
  ok(own('345').join() === 'https://hf.example/datasets/rabiul43/Book_Covers/resolve/main/covers/0/345/ol.webp,https://hf.example/datasets/rabiul43/Book_Covers/resolve/main/covers/0/345/lv.webp', 'best pick first (ol), then the rest in order');
  ok(own('1342').map(u => u.split('/').slice(-3).join('/')).join() === '1/1342/pg.webp,1/1342/se.webp', 'override: my pick first, removed (lv) never listed, folder = floor(id/1000)');
  ok(own('7').length === 0, 'every picture removed: no own copy, the old sources are used');
  ok(own('99999').length === 0 && w.api.covOwn({ id: 'abc' }).length === 0 && w.api.covOwn({}).length === 0, 'unknown or odd id: nothing, no error');
  w = world({ proxy: '', files: { 'index.json': IDX } }); await w.api.covLoad();
  ok(w.api.covOwn({ id: '345' })[0].startsWith('https://huggingface.co/datasets/'), 'no Worker set: direct Hugging Face address');

  // ---- the REAL file shapes (index.json made by the notebook; overrides written by the dashboard) ----
  const REAL = { v: 1, made: '2026-11-19T16:32:13Z', order: ['se', 'ol', 'pg', 'lv'], n: 5, total: 5,
    b: { '23075': ['ol', 'ol', 0], '23076': ['', '', 11254], '22954': ['se', 'se,ol', 47], '22764': ['ol', 'se,ol', 1342], '22911': ['se', 'se,ol', 45502] } };
  const DASH = { version: 1, updated: 'x', books: { '22954': { best: 'ol', removed: ['se'], removedAt: { se: 1 }, changed: 1 }, '23075': { removed: ['ol'], removedAt: { ol: 1 } }, '22911': { best: 'ol', changed: 1 }, '24000': { best: 'se', changed: 1 } } };
  const nm = list => list.map(u => u.split('/').pop().replace('.webp', '')).join();
  w = world({ files: { 'index.json': REAL } }); await w.api.covLoad();
  ok(nm(w.api.covOwn({ id: '23075' })) === 'ol', 'real index: [best, "ol", gid] gives that one picture');
  ok(w.api.covOwn({ id: '23076' }).length === 0, 'real index: a book with no pictures (["","",gid]) gives nothing, old sources are used');
  ok(nm(w.api.covOwn({ id: '22764' })) === 'ol,se', 'real index: the program best pick (ol) is first even though se comes first in the order');
  ok(nm(w.api.covOwn({ id: '22954' })) === 'se,ol', 'real index: best se first, then ol');
  w = world({ files: { 'index.json': REAL, 'cover-overrides.json': DASH } }); await w.api.covLoad();
  ok(w.fetched.includes('https://admin.example/public/cover-overrides.json'), 'choices are read from the admin Worker public address');
  ok(nm(w.api.covOwn({ id: '22954' })) === 'ol', 'dashboard: best ol, removed se is never listed');
  ok(w.api.covOwn({ id: '23075' }).length === 0, 'dashboard: the only picture removed gives nothing');
  ok(nm(w.api.covOwn({ id: '22911' })) === 'ol,se', 'dashboard: best ol put first, se kept after it');
  ok(nm(w.api.covOwn({ id: '24000' })) === 'se', 'dashboard: a book missing from the index but with a best choice still tries that picture (no crash)');
  w = world({ noAdmin: true, files: { 'index.json': REAL, 'cover-overrides.json': DASH } }); await w.api.covLoad();
  ok(w.fetched.every(u => !u.includes('overrides')) && nm(w.api.covOwn({ id: '22954' })) === 'se,ol', 'no admin address set: choices are not read, the program pick is used');
  w = world({ files: { 'index.json': REAL, 'cover-overrides.json': { oops: 1 } } }); await w.api.covLoad();
  ok(nm(w.api.covOwn({ id: '22954' })) === 'se,ol', 'a choices file in an unknown form is ignored, nothing breaks');

  // covers are saved: a second page start does not fetch again
  const idb = {}; w = world({ idb, files: { 'index.json': IDX, 'cover-overrides.json': { v: 1, b: {} } } }); await w.api.covLoad();
  const n1 = w.fetched.length; const w2 = world({ idb, files: {} }); await w2.api.covLoad();
  ok(n1 === 2 && w2.fetched.length === 0 && w2.api.covOwn({ id: '345' }).length === 2, 'saved lists are used without asking the network again');
  // offline with no saved copy
  const w3 = world({ files: {} }); await w3.api.covLoad();
  ok(w3.api.covOwn({ id: '345' }).length === 0, 'lists unreachable and none saved: no own copy, nothing breaks');

  // coverFill: fail -> next; stall -> next after COV_WAIT; all own fail -> old sources
  w = world({ files: { 'index.json': IDX } }); await w.api.covLoad();
  const book = { id: '345', title: 'Dracula', authors: 'Stoker, Bram', cover: 'http://old/lv.jpg', ia: 'dracula_x' };
  // the image is captured through a patched append
  const imgs = []; w.box.append = (...a) => a.forEach(x => x && x.reqs && imgs.push(x));
  w.api.coverFill(w.box, book); const im = imgs[0];
  ok(im.reqs[0].endsWith('/0/345/ol.webp'), 'first request is the best pick of our copy');
  im.l.error(); ok(im.reqs[1].endsWith('/0/345/lv.webp'), 'a failed picture: next one tried');
  await sleep(120); ok(im.reqs[2] === 'https://old/lv.jpg', 'a stalled picture is given up after the wait: old sources start (http made https)');
  im.l.error(); ok(im.reqs[3] === 'https://archive.org/services/img/dracula_x', 'then the Internet Archive picture');
  im.l.error(); await sleep(40); ok(im.removed === true, 'everything failed (Open Library gives nothing): picture removed, the tinted title box stays');
  // load stops the timer
  imgs.length = 0; w.api.coverFill(w.box, book); const im2 = imgs[0]; im2.l.load(); await sleep(120);
  ok(im2.reqs.length === 1 && im2.classList.contains('loaded'), 'a loaded picture is kept (no give-up after it loaded)');
  // redraw with a new token cancels the old one
  imgs.length = 0; w.api.coverFill(w.box, book); const a = imgs[0]; w.api.coverFill(w.box, book); await sleep(120);
  ok(a.reqs.length === 1, 'a cover that was redrawn is not touched by its old timer');
  // lists not ready yet: starts after they arrive; if they never arrive: old sources start
  const w4 = world({ files: { 'index.json': IDX } }); const imgs4 = []; w4.box.append = (...x) => x.forEach(y => y && y.reqs && imgs4.push(y));
  w4.api.coverFill(w4.box, book); await sleep(50); ok(imgs4[0].reqs[0].includes('/covers/0/345/'), 'drawn before the lists were ready: waits, then uses our copy');
  const w5 = world({ files: {} }); w5.ctx.fetch = () => new Promise(() => {}); const imgs5 = []; w5.box.append = (...x) => x.forEach(y => y && y.reqs && imgs5.push(y));
  w5.api.coverFill(w5.box, book); await sleep(450); ok(imgs5[0].reqs[0] === 'https://old/lv.jpg', 'lists never arrive: old sources start after the short wait');
  const w6 = world({ files: { 'index.json': IDX } }); await w6.api.covLoad(); const imgs6 = []; w6.box.append = (...x) => x.forEach(y => y && y.reqs && imgs6.push(y));
  w6.api.coverFill(w6.box, { id: '5555', title: 'New', authors: 'A', ia: 'zz' }); ok(imgs6[0].reqs[0] === 'https://archive.org/services/img/zz', 'book not in the list yet: old sources, as before');
  console.log('\n' + (fail ? fail + ' failed' : '0 failed') + ' (' + pass + ' passed)');
  process.exit(fail ? 1 : 0);
})();
