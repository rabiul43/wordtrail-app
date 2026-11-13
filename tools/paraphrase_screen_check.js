#!/usr/bin/env node
/* Automatic checks for the paraphrase screen (169p, PP) and its wiring (Learn hub, IELTS hub, Back, build.py, Bengali strings).
     node tools/paraphrase_screen_check.js
   Loads the REAL 169p-paraphrase-screen.js in a simulated page (a tiny fake DOM, no browser, no npm install). The 5 questions are made by the REAL
   generator (167f, with 167c and the real Core) from a small book and fake word data. It does not test a real browser, real touch or real colours.
   Exit code 1 if a check fails, 2 if a file cannot be loaded. */
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const root = path.join(__dirname, '..'), read = f => fs.readFileSync(path.join(root, f), 'utf8');
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
  querySelector(sel) { return find(this, n => sel === '#' + n.attrs.id); }
  set disabled(v) { if (v) this.attrs.disabled = true; else delete this.attrs.disabled; } get disabled() { return !!this.attrs.disabled; }
}
const find = (n, f) => { if (!n || n.text != null) return null; if (f(n)) return n; for (const k of n.kids) { const r = find(k, f); if (r) return r; } return null; };
const all = (n, f, out = []) => { if (!n || n.text != null) return out; if (f(n)) out.push(n); n.kids.forEach(k => all(k, f, out)); return out; };
const has = (n, c) => n.cls.has(c), byCls = (n, c) => all(n, x => has(x, c)), btn = (n, re) => all(n, x => x.tag === 'button' && re.test(x.textContent))[0];
const h = (tag, attrs, ...kids) => new N(tag, attrs, kids);

/* ----- real generator, real core, a small book, fake word data ----- */
let Core, PQ;
{
  const cctx = vm.createContext({}); vm.runInContext(read('src/js/010-core.js') + '\nthis.Core = Core;', cctx); Core = cctx.Core;
  const g = vm.createContext({ setTimeout, clearTimeout }); vm.runInContext(read('src/js/167c-question-gen.js') + '\n' + read('src/js/167f-paraphrase-gen.js') + '\nthis.PQ = PQ;', g); PQ = g.PQ;
}
const ADJ = ['wretched', 'peculiar', 'luminous', 'tremendous', 'melancholy', 'splendid', 'dreadful', 'graceful', 'solitary', 'ancient', 'crumbling', 'radiant', 'fragrant', 'restless', 'invisible',
  'towering', 'sheltered', 'weathered', 'shimmering', 'venerable', 'forgotten', 'resplendent', 'mysterious', 'desolate', 'enormous', 'tranquil', 'vigilant', 'whispering', 'thunderous', 'benevolent'];
let raw = 'CHAPTER I.\n\n';
for (let k = 0; k < 14; k++) raw += 'The old alabaster stood quietly beside the ' + ADJ[(2 * k) % 30] + ' garden while the ' + ADJ[(2 * k + 1) % 30] + ' travellers rested nearby ' + (k % 2 ? 'at dusk' : 'by noon') + '.' + (k % 4 === 3 ? '\n\n' : ' ');
const model = Core.parseBook(raw);
const DATA = {}; ADJ.forEach(w => { DATA[w] = { w, meanings: [{ pos: 'adjective', defs: [], syn: ['alt' + w, 'kin' + w], ant: ['opp' + w] }] }; });
const SET = PQ.build('7', model, 0, 0, { data: DATA, max: 5 });
if (SET.length !== 5) { console.log('cannot make a 5-question set for the test: ' + SET.length); process.exit(2); }

/* ----- the page around the screen ----- */
let reg = null, toasts = [], hubRefresh = 0, forCalls = [], logs = [], next = null, streak = 0, calm = false;
const S = { book: { id: 7, title: 'Dracula' }, model: { sents: [] }, lp: {}, map: [], span: [] };
const sandbox = { h, S, P: { get calm() { return calm; } }, toast: m => toasts.push(m), histSoon() {}, setTimeout, clearTimeout, document: { body: new N('body', {}, []), activeElement: null },
  LearnHub: { register(t) { reg = t; }, refresh() { hubRefresh++; } }, LB: { ctx: () => null }, IE: { log: s => logs.push(s) }, PG: { model: () => ({ streak }) },
  QG: { furthest: () => 2 }, PQ: { forChapter: async (b, m, c, f, o) => { forCalls.push([b, c, f, o && o.max]); return next; } } };
vm.createContext(sandbox);
try { vm.runInContext(read('src/js/169p-paraphrase-screen.js') + '\nthis.PP = PP;', sandbox); } catch (e) { console.log('cannot load: ' + e.message); process.exit(2); }
const PP = sandbox.PP;
let pass = 0, fail = 0; const queue = [];
const t = (name, fn) => queue.push([name, fn]);
const reset = () => { try { PP.close(); } catch (e) { /* not loaded */ } toasts = []; forCalls = []; logs = []; hubRefresh = 0; streak = 0; calm = false; };
const root_ = () => sandbox.document.body.kids[0];
const J = x => JSON.parse(JSON.stringify(x));
const opts = () => byCls(root_(), 'qs__opt');
const foot = () => find(root_(), n => n.tag === 'footer');
const openSet = async () => { reset(); next = { ok: true, qs: SET }; assert.strictEqual(await PP.start({ bookId: '7', chapter: 0 }), true); };
const wrongIdx = q => [0, 1, 2, 3].find(i => i !== q.answer);

t('pure: judge is true only for the right choice index', () => {
  assert.strictEqual(PP.judge({ answer: 2 }, 2), true); assert.strictEqual(PP.judge({ answer: 2 }, 1), false);
  assert.strictEqual(PP.judge({ answer: 0 }, '0'), false); assert.strictEqual(PP.judge(null, 0), false); assert.strictEqual(PP.SIZE, 5);
});
t('start asks for 5 questions of the chosen chapter, with the spoiler limit from QG.furthest', async () => {
  await openSet(); assert.deepStrictEqual(J(forCalls), [['7', 0, 2, 5]]); assert.strictEqual(PP.on, true);
});
t('the question screen: title, Original card with the underlined word, 4 numbered choices, Check off until a pick, no ideas yet', async () => {
  await openSet(); const q = SET[0], r = root_();
  assert.ok(r.textContent.includes('Choose the best paraphrase')); assert.ok(r.textContent.includes('Original'));
  const hit = byCls(r, 'pp-hit'); assert.strictEqual(hit.length, 1); assert.strictEqual(hit[0].textContent, q.word);
  assert.strictEqual(opts().length, 4); assert.deepStrictEqual(opts().map(o => byCls(o, 'qs__txt')[0].textContent), J(q.choices));
  const check = btn(foot(), /^Check$/); assert.ok(check && check.disabled); assert.strictEqual(byCls(r, 'pp-chip').length, 0);
  opts()[1].click(); assert.ok(!check.disabled); assert.strictEqual(opts()[1].attrs['aria-pressed'], 'true'); assert.strictEqual(opts()[0].attrs['aria-pressed'], 'false');
});
t('right answer: Correct panel at the bottom, Swap ideas chips appear, choices are marked, swapped words are bold', async () => {
  await openSet(); const q = SET[0], r = root_();
  opts()[q.answer].click(); btn(foot(), /^Check$/).click();
  assert.ok(foot().textContent.includes('Correct!')); assert.ok(foot().textContent.includes(q.choices[q.answer]));
  assert.ok(has(opts()[q.answer], 'is-correct')); assert.strictEqual(opts().filter(o => has(o, 'is-wrong')).length, 0);
  assert.ok(r.textContent.includes('Swap ideas'));
  const chips = byCls(r, 'pp-chip').map(c => c.textContent); assert.deepStrictEqual(chips, J(q.ideas).map(x => x[0] + ' \u2192 ' + x[1])); assert.ok(chips.length >= 1);
  opts().forEach((o, i) => { const b = byCls(o, 'qs__hit'); assert.strictEqual(b.length, 1); assert.strictEqual(b[0].textContent, i === q.answer ? q.syn : q.bad[i < q.answer ? i : i - 1]); });
  assert.ok(btn(foot(), /^Continue$/));
});
t('wrong answer: calm panel, the right one is shown, the wrong one is marked, chips still show', async () => {
  await openSet(); const q = SET[0], w = wrongIdx(q);
  opts()[w].click(); btn(foot(), /^Check$/).click();
  assert.ok(foot().textContent.includes('Not quite.')); assert.ok(foot().textContent.includes(q.choices[q.answer]));
  assert.ok(has(opts()[w], 'is-wrong')); assert.ok(has(opts()[q.answer], 'is-correct')); assert.ok(byCls(root_(), 'pp-chip').length >= 1);
  assert.ok(!/lives|score to beat|timer/i.test(root_().textContent));
});
t('after Check a second tap on a choice changes nothing', async () => {
  await openSet(); const q = SET[0]; opts()[q.answer].click(); btn(foot(), /^Check$/).click(); opts()[wrongIdx(q)].click();
  assert.ok(has(opts()[q.answer], 'is-correct')); assert.strictEqual(opts().filter(o => has(o, 'is-wrong')).length, 0);
});
t('a full 5-question set: 5 screens, then Set complete with the real count, Done closes, one Reading and one Writing session logged', async () => {
  await openSet(); let right = 0;
  for (let i = 0; i < 5; i++) {
    const q = SET[i]; assert.ok(root_().textContent.includes(q.pre.trim() ? q.pre : q.post), 'question ' + (i + 1));
    const pick = i % 2 === 0 ? q.answer : wrongIdx(q); if (pick === q.answer) right++;
    opts()[pick].click(); btn(foot(), /^Check$/).click();
    assert.strictEqual(logs.length, 0, 'nothing is logged before the set is finished');
    btn(foot(), i === 4 ? /^Finish$/ : /^Continue$/).click();
  }
  assert.ok(root_().textContent.includes('Set complete')); assert.ok(root_().textContent.includes(right + ' of 5 right'));
  assert.deepStrictEqual(J(logs), ['r', 'w']); assert.ok(hubRefresh >= 1);
  btn(foot(), /^Done$/).click(); assert.strictEqual(PP.on, false); assert.strictEqual(root_().hidden, true);
});
t('a perfect set says well done', async () => {
  await openSet(); for (let i = 0; i < 5; i++) { opts()[SET[i].answer].click(); btn(foot(), /^Check$/).click(); btn(foot(), i === 4 ? /^Finish$/ : /^Continue$/).click(); }
  assert.ok(root_().textContent.includes('5 of 5 right')); assert.ok(root_().textContent.includes('Well done'));
});
t('closing half way logs nothing', async () => {
  await openSet(); opts()[SET[0].answer].click(); btn(foot(), /^Check$/).click(); btn(foot(), /^Continue$/).click();
  PP.close(); assert.strictEqual(PP.on, false); assert.deepStrictEqual(J(logs), []);
});
t('a shorter set (the chapter gave fewer paraphrases) still works and ends normally', async () => {
  reset(); next = { ok: true, qs: SET.slice(0, 2) }; assert.strictEqual(await PP.start({ bookId: '7', chapter: 0 }), true);
  for (let i = 0; i < 2; i++) { opts()[SET[i].answer].click(); btn(foot(), /^Check$/).click(); btn(foot(), i === 1 ? /^Finish$/ : /^Continue$/).click(); }
  assert.ok(root_().textContent.includes('2 of 2 right')); assert.deepStrictEqual(J(logs), ['r', 'w']);
});
t('the top chip shows the streak when there is one and Calm is off, else the chapter', async () => {
  await openSet(); assert.ok(root_().textContent.includes('Ch. 1')); PP.close();
  reset(); streak = 5; next = { ok: true, qs: SET }; await PP.start({ bookId: '7', chapter: 0 }); assert.ok(root_().textContent.includes('\u{1F525}')); assert.ok(root_().textContent.includes('5')); PP.close();
  reset(); streak = 5; calm = true; next = { ok: true, qs: SET }; await PP.start({ bookId: '7', chapter: 0 }); assert.ok(!root_().textContent.includes('\u{1F525}')); assert.ok(root_().textContent.includes('Ch. 1'));
});
t('no paraphrases: a message, nothing opens, nothing logged', async () => {
  reset(); next = { ok: false, reason: 'none' }; assert.strictEqual(await PP.start({ bookId: '7', chapter: 0 }), false);
  assert.strictEqual(PP.on, false); assert.ok(toasts.some(m => /No paraphrase questions/.test(m))); assert.deepStrictEqual(J(logs), []);
  reset(); next = { ok: false, reason: 'locked' }; assert.strictEqual(await PP.start({ bookId: '7', chapter: 0 }), false); assert.ok(toasts.some(m => /reached/.test(m)));
});
t('no open book, another book, or nothing reached yet: a message and the generator is not asked', async () => {
  reset(); assert.strictEqual(await PP.start({ bookId: '99', chapter: 0 }), false); assert.ok(toasts.some(m => /Open a book/.test(m)));
  reset(); const far = sandbox.QG.furthest; sandbox.QG.furthest = () => -1; assert.strictEqual(await PP.start({ bookId: '7', chapter: 0 }), false); assert.ok(toasts.some(m => /Listen a little/.test(m)));
  sandbox.QG.furthest = far; assert.strictEqual(forCalls.length, 0);
});
t('closing while the paraphrases are being made: nothing opens afterwards', async () => {
  reset(); let go; const keep = sandbox.PQ.forChapter; sandbox.PQ.forChapter = () => new Promise(r => { go = () => r({ ok: true, qs: SET }); });
  const p = PP.start({ bookId: '7', chapter: 0 }); PP.close(); go(); assert.strictEqual(await p, false); assert.strictEqual(PP.on, false); sandbox.PQ.forChapter = keep;
});
t('the Learn hub tile is registered with its texts (also used by the Study this chapter sheet)', () => {
  assert.strictEqual(reg.id, 'paraphrase'); assert.strictEqual(reg.order, 35); assert.strictEqual(reg.title, 'Paraphrase'); assert.strictEqual(typeof reg.open, 'function');
  assert.strictEqual(reg.subtitle, 'Say it in other words'); assert.strictEqual(reg.playerSubtitle, '5 paraphrases on this chapter');
});

/* ----- wiring in the other files (text checks) ----- */
t('IELTS hub: Paraphrase is a practice tool for Reading and Writing, and the old tools stay', () => {
  const s = read('src/js/169o-ielts-hub.js'); const m = /const TOOL = (\{[^\n]*?\});/.exec(s); assert.ok(m);
  const TOOL = vm.runInNewContext('(' + m[1] + ')');
  assert.deepStrictEqual(J(TOOL), { l: ['listentype'], r: ['questions', 'paraphrase'], w: ['paraphrase'], s: ['echo'] });
});
t('Back: the paraphrase screen is a layer and Back closes it', () => {
  const b = read('src/js/270-sheets-nextup-back.js'); assert.ok(b.indexOf('(PP.on ? 1 : 0)') > 0); assert.ok(b.indexOf('else if (PP.on) PP.close()') > 0);
});
t('build.py: generator, then hubs, then the screen, and its css after the Learn styles', () => {
  const p = read('build.py'), at = f => p.indexOf(f);
  assert.ok(at('167f-paraphrase-gen.js') > at('167c-question-gen.js') && at('167c-question-gen.js') > 0);
  assert.ok(at('169p-paraphrase-screen.js') > at('169b-learn-hub.js') && at('169p-paraphrase-screen.js') > at('169o-ielts-hub.js') && at('169p-paraphrase-screen.js') > at('167f-paraphrase-gen.js'));
  assert.ok(at('94w-paraphrase.css') > at('94m-questions.css')); assert.ok(fs.existsSync(path.join(root, 'src/css/94w-paraphrase.css')));
});
t('Bengali: every new text of the screen has a translation', () => {
  const d = JSON.parse(read('src/i18n/bn.json')).dict;
  ['Choose the best paraphrase', 'Original', 'Pick the sentence with the same meaning', 'Swap ideas', 'Same meaning:', 'The other sentences change the meaning. No problem, try the next one.', 'Paraphrase', 'Say it in other words',
    '5 paraphrases on this chapter', 'No paraphrase questions for this chapter yet.', 'Close paraphrase practice', 'Check', 'Continue', 'Finish', 'Done', 'Correct!', 'Not quite.', 'Set complete', 'Getting your questions\u2026'
  ].forEach(k => assert.ok(d[k], 'missing: ' + k));
  assert.ok(d['A finished paraphrase set counts as one session. For writing on paper or elsewhere, add sessions yourself.']);
});
t('no storage of its own: the screen never touches localStorage or store', () => {
  const s = read('src/js/169p-paraphrase-screen.js').replace(/\/\*[\s\S]*?\*\//, ''); assert.ok(!/localStorage|store\.|wt:/.test(s));
});

(async () => {
  for (const [name, fn] of queue) { try { await fn(); pass++; console.log('ok    ' + name); } catch (e) { fail++; console.log('FAIL  ' + name + '\n        ' + String(e && e.message).split('\n').slice(0, 5).join('\n        ')); } }
  console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
})();
