#!/usr/bin/env node
/* Automatic checks for the chapter questions (148d results store, 169g screen) and their wiring in 295 / 270 / build.py.
     node tools/question_screen_check.js
   Loads the REAL 148d-question-results.js and 169g-question-screen.js in a simulated page (a tiny fake DOM, no browser, no npm install).
   It does not test a real browser, real touch, or the real reader scroll. Exit code 1 if a check fails, 2 if a file cannot be loaded. */
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const root = path.join(__dirname, '..'), read = f => fs.readFileSync(path.join(root, f), 'utf8');
const disk = {};
const store = { get(k, d) { try { const v = disk[k]; return v ? JSON.parse(v) : d; } catch (e) { return d; } }, set(k, v) { disk[k] = JSON.stringify(v); } };
class N {   // a very small fake element
  constructor(tag, attrs, kids) { this.tag = tag; this.attrs = {}; this.kids = []; this.ls = {}; this.cls = new Set(); this.hidden = false; this.style = { setProperty() {} }; this.isConnected = true; this.focused = false;
    Object.keys(attrs || {}).forEach(k => { if (k === 'class') String(attrs[k]).split(/\s+/).forEach(c => c && this.cls.add(c)); else if (k === 'onclick') this.addEventListener('click', attrs[k]); else if (k === 'hidden') this.hidden = !!attrs[k]; else this.attrs[k] = attrs[k]; });
    this.append(...kids); }
  append(...xs) { xs.forEach(x => { if (x != null && x !== '' && x !== false) this.kids.push(typeof x === 'string' ? { text: x } : x); }); }
  addEventListener(e, f) { (this.ls[e] = this.ls[e] || []).push(f); }
  click() { if (this.attrs.disabled) return; (this.ls.click || []).forEach(f => f({})); }
  setAttribute(k, v) { this.attrs[k] = v; } removeAttribute(k) { delete this.attrs[k]; } focus() { this.focused = true; }
  get classList() { const c = this.cls; return { add: x => c.add(x), remove: x => c.delete(x), contains: x => c.has(x) }; }
  set textContent(v) { this.kids = v === '' ? [] : [{ text: String(v) }]; } get textContent() { return this.kids.map(k => k.text != null ? k.text : k.textContent).join(''); }
  get firstChild() { return this.kids[0]; }
  querySelector(sel) { return find(this, n => sel === '#' + n.attrs.id); }
  set disabled(v) { if (v) this.attrs.disabled = true; else delete this.attrs.disabled; } get disabled() { return !!this.attrs.disabled; }
}
const find = (n, f) => { if (!n || n.text != null) return null; if (f(n)) return n; for (const k of n.kids) { const r = find(k, f); if (r) return r; } return null; };
const all = (n, f, out = []) => { if (!n || n.text != null) return out; if (f(n)) out.push(n); n.kids.forEach(k => all(k, f, out)); return out; };
const h = (tag, attrs, ...kids) => new N(tag, attrs, kids);
let reg = null, toasts = [], hubRefresh = 0, forCalls = [], spy = [];
let QSv, QRv, nextQs = null;
const S = { book: { id: 7, title: 'Dracula' }, model: { sents: [] }, lp: {}, map: [], span: [], spans: new Map() };
const sandbox = { store, h, S, toast: m => toasts.push(m), histSoon() {}, setTimeout, clearTimeout, document: { body: new N('body', {}, []), activeElement: null },
  el: { player: { hidden: false } }, LearnHub: { register(t) { reg = t; }, refresh() { hubRefresh++; } }, LB: { ctx: () => null },
  QG: { furthest: () => 2, forChapter: async (b, m, c, f) => { forCalls.push([b, c, f]); return nextQs; } },
  spanById: id => S.spans.get(id), ensureVisible(sp, i) { spy.push(['vis', sp.id]); } };
vm.createContext(sandbox);
try { vm.runInContext(read('src/js/148d-question-results.js') + '\n' + read('src/js/169g-question-screen.js') + '\nthis.QR=QR;this.QS=QS;', sandbox); }
catch (e) { console.log('cannot load: ' + e.message); process.exit(2); }
QRv = sandbox.QR; QSv = sandbox.QS;
let pass = 0, fail = 0; const queue = [];
const t = (name, fn) => queue.push([name, fn]);
const reset = () => { try { QSv.close(); } catch (e) { /* not loaded yet */ } Object.keys(disk).forEach(k => delete disk[k]); toasts = []; forCalls = []; spy = []; };
const J = x => JSON.parse(JSON.stringify(x));

/* ----- results store ----- */
t('save keeps n, r, best, tries and time; get reads it back', () => {
  reset(); const e = QRv.save(7, 2, 5, 4, 1000); assert.deepStrictEqual(J(e), { n: 5, r: 4, b: 80, t: 1, ts: 1000 });
  assert.deepStrictEqual(J(QRv.get('7', 2)), J(e)); assert.strictEqual(QRv.count(), 1);
});
t('a second set raises tries, keeps the best, and the last set replaces n, r, ts', () => {
  reset(); QRv.save(7, 2, 5, 4, 1000); const e = QRv.save(7, 2, 5, 2, 2000);
  assert.deepStrictEqual(J(e), { n: 5, r: 2, b: 80, t: 2, ts: 2000 });
});
t('nonsense is refused and nothing is written', () => {
  reset(); [[7, -1, 5, 1], [7, 1.5, 5, 1], [7, 1, 0, 0], [7, 1, 5, 6], [7, 1, 5, -1], ['', 1, 5, 1], [null, 1, 5, 1], [7, 1, 'x', 1]].forEach(a => assert.strictEqual(QRv.save(...a), null));
  assert.strictEqual(disk['wt:qres'], undefined);
});
t('forBook lists one book in chapter order and leaves other books out', () => {
  reset(); QRv.save(7, 3, 5, 5, 1); QRv.save(7, 1, 5, 3, 1); QRv.save(8, 0, 5, 1, 1);
  assert.deepStrictEqual(J(QRv.forBook(7).map(x => x.ch)), [1, 3]);
});
t('broken stored data does not throw and reads as empty', () => {
  reset(); disk['wt:qres'] = '[1,2]'; assert.strictEqual(QRv.count(), 0); disk['wt:qres'] = '{"7:1":{"n":"x"}}'; assert.strictEqual(QRv.get(7, 1), null);
  assert.ok(QRv.save(7, 1, 5, 5, 1));
});
t('only 600 chapters are kept, the oldest go first', () => {
  reset(); for (let i = 0; i < 605; i++) QRv.save('b', i, 5, 5, 1000 + i);
  assert.strictEqual(QRv.count(), 600); assert.strictEqual(QRv.get('b', 0), null); assert.ok(QRv.get('b', 604));
});
t('merge: larger tries and best, newer set for n, r, ts; repeatable; keeps chapters only one side has', () => {
  const A = { '7:1': { n: 5, r: 5, b: 100, t: 3, ts: 100 }, '7:2': { n: 5, r: 1, b: 20, t: 1, ts: 50 } };
  const B = { '7:1': { n: 5, r: 2, b: 40, t: 2, ts: 900 }, '7:9': { n: 4, r: 4, b: 100, t: 1, ts: 5 } };
  const m = QRv.merge(A, B);
  assert.deepStrictEqual(J(m['7:1']), { n: 5, r: 2, b: 100, t: 3, ts: 900 }); assert.ok(m['7:2'] && m['7:9']);
  assert.deepStrictEqual(J(QRv.merge(m, B)), J(m)); assert.deepStrictEqual(J(QRv.merge(A, B)), J(QRv.merge(B, A)));
});
t('mergeJson gives JSON text, and null for text that is not an object', () => {
  assert.strictEqual(QRv.mergeJson('[]', '{}'), null); assert.strictEqual(QRv.mergeJson('nope', '{}'), null);
  assert.ok(JSON.parse(QRv.mergeJson('{"1:1":{"n":5,"r":5,"ts":1}}', '{}'))['1:1']);
});
t('an entry without the b or t fields (older shape) still reads', () => {
  reset(); disk['wt:qres'] = JSON.stringify({ '7:1': { n: 5, r: 4, ts: 3 } }); assert.deepStrictEqual(J(QRv.get(7, 1)), { n: 5, r: 4, b: 80, t: 1, ts: 3 });
});

/* ----- pure screen helpers ----- */
const mk = (type, i, extra) => Object.assign({ type, id: type + i, bid: '7', ch: 1, sid: i, full: 'Sentence ' + type + i + '.', choices: ['a', 'b', 'c', 'd'], answer: 1, pre: 'pre ', post: ' post', word: 'w' }, extra || {});
t('pick mixes the kinds, never gives more than 5, and gives fewer when fewer exist', () => {
  const qs = [mk('fill', 1), mk('fill', 2), mk('fill', 3), mk('vocab', 4), mk('tf', 5, { choices: ['true', 'false'] }), mk('order', 6, { choices: ['x', 'y', 'z'], answer: [1, 0, 2] }), mk('fill', 7)];
  const p = QSv.pick(qs, 5); assert.strictEqual(p.length, 5); assert.deepStrictEqual(J(p.map(q => q.type)), ['fill', 'vocab', 'tf', 'order', 'fill']);
  assert.strictEqual(QSv.pick([mk('fill', 1)], 5).length, 1); assert.strictEqual(QSv.pick(null, 5).length, 0); assert.strictEqual(QSv.pick([{ type: 'bogus' }], 5).length, 0);
});
t('judge: one choice, and story order needs the whole order right', () => {
  assert.ok(QSv.judge(mk('fill', 1), 1)); assert.ok(!QSv.judge(mk('fill', 1), 0));
  const o = mk('order', 1, { choices: ['x', 'y', 'z'], answer: [1, 0, 2] });
  assert.ok(QSv.judge(o, [1, 0, 2])); assert.ok(!QSv.judge(o, [0, 1, 2])); assert.ok(!QSv.judge(o, [1, 0])); assert.ok(!QSv.judge(o, 1));
});

/* ----- the screen, end to end on the fake page ----- */
const root_ = () => sandbox.document.body.kids[0];
const btn = (txt) => find(root_(), n => n.tag === 'button' && n.textContent.trim().indexOf(txt) >= 0 && !n.hidden);
const opts = () => all(root_(), n => n.cls.has('qs__opt'));
const SET = [mk('fill', 1), mk('vocab', 2), mk('tf', 3, { choices: ['true', 'false'], answer: 0, text: 'A sentence.', changed: false }), mk('order', 4, { choices: ['x', 'y', 'z'], answer: [1, 0, 2], sids: [4, 5, 6] }), mk('fill', 5)];
t('5-question set end to end: answers, panel, Continue, result saved once, hub refreshed', async () => {
  reset(); S.spans.set(3, { id: 'sp3', classList: { add() {}, remove() {} } }); nextQs = { ok: true, qs: SET, from: 'new' };
  const ok = await QSv.start({ bookId: '7', chapter: 1 }); assert.strictEqual(ok, true); assert.strictEqual(QSv.on, true);
  assert.deepStrictEqual(J(forCalls), [['7', 1, 2]]);
  // 1 fill: right
  opts()[1].click(); btn('Check').click(); assert.ok(opts()[1].cls.has('is-correct')); assert.ok(find(root_(), n => n.cls.has('wl-panel')));
  assert.ok(btn('Show in book')); assert.ok(btn('Correct!') || find(root_(), n => n.cls.has('wl-panel__title') && n.textContent === 'Correct!')); btn('Continue').click();
  // 2 vocab: wrong
  opts()[0].click(); btn('Check').click(); assert.ok(opts()[0].cls.has('is-wrong')); assert.ok(opts()[1].cls.has('is-correct')); assert.ok(find(root_(), n => n.cls.has('wl-panel--bad'))); btn('Continue').click();
  // 3 tf: right (True)
  opts()[0].click(); btn('Check').click(); btn('Continue').click();
  // 4 order: tap 1,0,2 -> right; Check stays off until all are tapped
  assert.ok(btn('Check').disabled); opts()[1].click(); opts()[0].click(); assert.ok(btn('Check').disabled); opts()[2].click(); assert.ok(!btn('Check').disabled);
  btn('Check').click(); assert.ok(find(root_(), n => n.cls.has('wl-panel__title') && n.textContent === 'Correct!')); btn('Continue').click();
  // 5 fill: right, then Finish
  assert.strictEqual(QRv.get('7', 1), null); opts()[1].click(); btn('Check').click(); btn('Finish').click();
  assert.deepStrictEqual(J(QRv.get('7', 1)), J({ n: 5, r: 4, b: 80, t: 1, ts: QRv.get('7', 1).ts })); assert.ok(root_().textContent.indexOf('4 of 5 right') >= 0);
  btn('Done').click(); assert.strictEqual(QSv.on, false); assert.ok(hubRefresh > 0); assert.strictEqual(QRv.count(), 1);
});
t('Show in book closes the screen and scrolls the reader to the sentence; nothing is saved', async () => {
  reset(); S.spans.set(1, { id: 'sp1', classList: { add() {}, remove() {} } }); nextQs = { ok: true, qs: SET, from: 'cache' }; await QSv.start({ bookId: '7', chapter: 1 });
  opts()[1].click(); btn('Check').click(); btn('Show in book').click();
  assert.strictEqual(QSv.on, false); assert.deepStrictEqual(J(spy), [['vis', 'sp1']]); assert.strictEqual(QRv.count(), 0);
});
t('Show in book on a sentence that is not drawn says so instead of failing', async () => {
  reset(); S.spans.clear(); nextQs = { ok: true, qs: SET, from: 'cache' }; await QSv.start({ bookId: '7', chapter: 1 });
  opts()[1].click(); btn('Check').click(); btn('Show in book').click(); assert.ok(toasts.some(m => /another track/.test(m)));
});
t('closing half way saves no result', async () => {
  reset(); nextQs = { ok: true, qs: SET, from: 'cache' }; await QSv.start({ bookId: '7', chapter: 1 });
  opts()[1].click(); btn('Check').click(); QSv.close(); assert.strictEqual(QSv.on, false); assert.strictEqual(QRv.count(), 0);
});
t('Show in book is hidden when the reader is not on screen', async () => {
  reset(); sandbox.el.player.hidden = true; nextQs = { ok: true, qs: SET, from: 'cache' }; await QSv.start({ bookId: '7', chapter: 1 });
  opts()[1].click(); btn('Check').click(); const has = !!btn('Show in book'); sandbox.el.player.hidden = false; QSv.close(); assert.strictEqual(has, false);
});
t('spoiler guard: never asks for a chapter past the furthest one', async () => {
  reset(); nextQs = { ok: false, reason: 'locked' }; const ok = await QSv.start({ bookId: '7', chapter: 9 });
  assert.strictEqual(ok, false); assert.strictEqual(QSv.on, false); assert.ok(toasts.some(m => /reached/.test(m)));
  // the generator itself is the guard (167c); here we check the screen passes the furthest chapter it got
  assert.deepStrictEqual(J(forCalls), [['7', 9, 2]]);
});
t('nothing reached yet, no chapters, another book or no book: a message, the generator is not called', async () => {
  reset(); const far = sandbox.QG.furthest; sandbox.QG.furthest = () => -1;
  assert.strictEqual(await QSv.start({ bookId: '7', chapter: 0 }), false); sandbox.QG.furthest = far;
  assert.strictEqual(await QSv.start({ bookId: '99', chapter: 0 }), false); const m = S.model; S.model = null;
  assert.strictEqual(await QSv.start({ bookId: '7', chapter: 0 }), false); S.model = m;
  assert.strictEqual(await QSv.start(null), false); assert.strictEqual(forCalls.length, 0); assert.strictEqual(toasts.length, 4);
});
t('the chapter you are listening in counts as reached even when its track is not finished (recap button, reader sheet)', async () => {
  reset(); const far = sandbox.QG.furthest; sandbox.QG.furthest = () => -1; const m = S.model;
  S.model = { sents: [{ ch: 0 }, { ch: 3 }, { ch: 4, h: true }] }; nextQs = { ok: true, qs: SET, from: 'cache' };
  S.curId = 1; assert.strictEqual(await QSv.start({ bookId: '7', chapter: 2 }), true); assert.deepStrictEqual(J(forCalls), [['7', 2, 3]]); QSv.close();
  reset(); S.curId = 2; assert.strictEqual(await QSv.start({ bookId: '7', chapter: 2 }), false); assert.strictEqual(forCalls.length, 0);   // a heading sentence does not count
  S.curId = undefined; S.model = m; sandbox.QG.furthest = far;
});
t('a chapter with no questions closes with a message', async () => {
  reset(); nextQs = { ok: false, reason: 'none' }; assert.strictEqual(await QSv.start({ bookId: '7', chapter: 1 }), false);
  assert.strictEqual(QSv.on, false); assert.ok(toasts.some(m => /No questions/.test(m)));
});
t('closing while the questions are being made: nothing opens afterwards', async () => {
  reset(); let go; nextQs = null; sandbox.QG.forChapter = (b, m, c, f) => new Promise(r => { go = () => r({ ok: true, qs: SET, from: 'new' }); });
  const p = QSv.start({ bookId: '7', chapter: 1 }); QSv.close(); go(); assert.strictEqual(await p, false); assert.strictEqual(QSv.on, false);
  sandbox.QG.forChapter = async (b, m, c, f) => { forCalls.push([b, c, f]); return nextQs; };
});
t('the Learn hub tile is registered once and its texts follow the results', () => {
  reset(); assert.strictEqual(reg.id, 'questions'); assert.strictEqual(reg.subtitle(), 'Test what you read');
  QRv.save(7, 1, 5, 4, 1); assert.strictEqual(reg.subtitle(), '1 chapter done'); QRv.save(7, 2, 5, 4, 1); assert.strictEqual(reg.subtitle(), '2 chapters done');
  assert.strictEqual(reg.playerSubtitle({ bookId: '7', chapter: 1 }), 'Last time: 4 of 5 right'); assert.strictEqual(reg.playerSubtitle({ bookId: '7', chapter: 5 }), '5 questions on this chapter');
  assert.strictEqual(reg.playerSubtitle({ bookId: '7', chapter: -1 }), '5 questions on this chapter');
});

/* ----- wiring in the other files (text checks) ----- */
t('sync: wt:qres is in a category and has a merge rule in both merge paths', () => {
  const s = read('src/js/295-account-sync.js');
  assert.ok(/\['library'[^\n]*k === 'wt:qres'/.test(s)); assert.ok(/AC_MERGE = [^\n]*k === 'wt:qres'/.test(s));
  assert.strictEqual((s.match(/k === 'wt:qres'\) return QR\.mergeJson\(a, b\)/g) || []).length, 2);
});
t('Back: the questions screen is a layer and Back closes it; build.py lists the three new files after what they need', () => {
  const b = read('src/js/270-sheets-nextup-back.js'); assert.ok(b.indexOf('(QS.on ? 1 : 0)') > 0); assert.ok(b.indexOf('else if (QS.on) QS.close()') > 0);
  const p = read('build.py'), at = f => p.indexOf(f); assert.ok(at('148d-question-results.js') > at('148c-book-time.js') && at('148d-question-results.js') > 0);
  assert.ok(at('169g-question-screen.js') > at('169b-learn-hub.js') && at('169g-question-screen.js') > at('167c-question-gen.js')); assert.ok(at('94m-questions.css') > at('94l-progress.css'));
});

(async () => {
  for (const [name, fn] of queue) { try { await fn(); pass++; console.log('ok    ' + name); } catch (e) { fail++; console.log('FAIL  ' + name + '\n        ' + String(e && e.message).split('\n').slice(0, 5).join('\n        ')); } }
  console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
})();
