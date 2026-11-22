#!/usr/bin/env node
/* Check for Timed reading questions (TQ, TQC in 169t-timed-questions.js, Task 59): pure rules (the real generator helpers QG from 167c), wiring,
   then real Chromium (Playwright) in a stand-in page (the real styles, 010-core, 167c, 169q and 169t; not the whole app).
     node tools/timed_questions_check.js [--shot dir]      Exit code 1 if a check fails, 2 if there is no browser.
   It cannot test the real Learn hub, real touch, the real phone keyboard, or real books (the stand-in book is made of made-up words). */
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const root = path.join(__dirname, '..'), read = f => fs.readFileSync(path.join(root, f), 'utf8');
const shotDir = process.argv.includes('--shot') ? process.argv[process.argv.indexOf('--shot') + 1] : '';
let bad = 0; const ok = (c, m) => { console.log((c ? 'ok    ' : 'FAIL  ') + m); if (!c) bad++; };
// ---- pure rules
const js = read('src/js/169t-timed-questions.js');
const ctx = vm.createContext({});
vm.runInContext(read('src/js/167c-question-gen.js') + '\nthis.QG = QG;\n' + js.slice(js.indexOf('/* TQC-START */'), js.indexOf('/* TQC-END */')) + '\nthis.C = TQC;', ctx);
const C = ctx.C, J = x => JSON.parse(JSON.stringify(x));
const PARAS = [
  ['A', 'Bees communicate through movement. Researchers observed that a returning forager performs a short dance that shows other bees the direction and distance of food. The angle of the dance, measured against the vertical, matches the angle between the sun and the food source. Scientists later confirmed this pattern with careful experiments in open fields. Other workers follow the dancer closely and then fly out toward the indicated place.'],
  ['B', 'The hive keeps a steady temperature all year. During winter the workers cluster tightly around the queen and shiver their flight muscles. This shivering produces enough warmth to keep the centre of the cluster comfortable. Bees on the outer edge slowly rotate inward so that none of them becomes too cold. Honey stored earlier in the season provides the fuel for this constant effort.'],
  ['C', 'Pollination depends on many kinds of insects. Honeybees visit thousands of flowers every day while collecting nectar for the colony. Fine hairs on their bodies carry pollen from one blossom to the next. Farmers therefore rent hives during the flowering period of fruit orchards. Wild species such as bumblebees also contribute a great deal to this process.'],
  ['D', 'A healthy colony needs good forage. Meadows with a variety of flowering plants support stronger hives than fields of a single crop. Beekeepers sometimes plant extra flowers near the hives to fill the gaps between seasons. Clean water nearby allows the workers to cool the nest during hot afternoons. Pesticides sprayed on blossoms can weaken the colony and shorten the lives of its workers.'],
  ['E', 'Winter losses are a growing worry. Mites that feed on young bees spread several harmful viruses among the workers. Researchers are testing gentle treatments that protect the brood without poisoning the honey. Careful monitoring in autumn helps beekeepers decide when to act. Strong colonies with young queens usually survive the cold months much better.']
].map(([L, t]) => ({ L, t }));
const textOf = L => PARAS.find(p => p.L === L).t, normWs = s => s.replace(/\s+/g, ' ');
{
  const ss = C.sents('Dr. Smith kept bees. He sold honey at the market! Did it sell? Yes, J. Brown said so.');
  ok(ss.length === 4 && ss[0] === 'Dr. Smith kept bees.' && ss[3] === 'Yes, J. Brown said so.', 'sents: a full stop after Dr or an initial does not end a sentence (' + ss.length + ' found)');
  const p = PARAS[0].t; ok(C.sents(p).join(' ') === p && C.sents(p).every(s => p.indexOf(s) >= 0), 'sents: every sentence is an exact piece of the text and nothing is lost');
  ok(C.headOf('Bees communicate through movement.') === 'Bees communicate through movement', 'headOf: a short first sentence is the heading, without the full stop');
  ok(C.headOf('However, the dance is short.') === 'The dance is short', 'headOf: a leading link word is dropped and the first letter is a capital');
  ok(C.headOf('The angle of the dance, measured against the vertical, matches the angle between the sun and the food source.') === 'The angle of the dance', 'headOf: a long sentence is cut at its first comma');
  ok(C.headOf('A very long sentence without any comma or dash that just keeps on going and going for many many words.') === '' && C.headOf('In 1990 bees were counted.') === '' && C.headOf('Two words.') === '', 'headOf: nothing for a long sentence with no cut point, a digit, or fewer than 3 words');
  ok(J(C.pairsOf('The workers store golden honey in sturdy chambers before winter.')).indexOf('sturdy chambers') >= 0 && C.pairsOf('The workers store golden honey in sturdy chambers before winter.').every(x => x.split(' ').length === 2), 'pairsOf: two words in a row that can be taken out');
}
const SET = C.build(PARAS, { seed: 'x' });
ok(SET && SET.groups.map(g => g.k).join() === 'sc,sum,mh', 'build: sentence completion, then summary, then headings (got ' + (SET && SET.groups.map(g => g.k).join()) + ')');
const all = C.list(SET).map(x => x.q);
ok(SET.n === all.length && all.map(q => q.n).join() === all.map((q, i) => i + 1).join() && new Set(all.map(q => q.id)).size === all.length, 'build: numbers run 1..n across the kinds, ids are unique');
ok(JSON.stringify(C.build(PARAS, { seed: 'x' })) === JSON.stringify(SET), 'build: the same passage and seed always give the same questions');
ok(C.build(PARAS.slice(0, 1), { seed: 'x' }) === null && C.build([], {}) === null && C.build(null, {}) === null, 'build: a passage that is too short gives no set (the screen then keeps the Speed saved panel)');
ok(C.build([{ L: 'A', t: 'Page 12 [Illustration] here. See the 3 footnotes below. Another 4 lines with 5 digits. One more 6 numbers sentence. And 7 again here. Last 8 one.' }], {}) === null, 'build: sentences with digits or debris are never used');
{
  const sc = SET.groups[0], firsts = PARAS.map(p => C.sents(p.t)[0]);
  ok(sc.items.length >= 2 && sc.items.length <= 4, 'sc: 2 to 4 questions (got ' + sc.items.length + ')');
  ok(sc.items.every(q => q.pre + q.ans[0] + q.post === q.line && textOf(q.L).indexOf(q.line) >= 0), 'sc: the gap sentence is exactly the passage sentence with the answer taken out, and it is in the paragraph it says');
  ok(sc.items.every(q => q.ans[0].split(' ').length <= 2 && /^[a-z]+( [a-z]+)?$/.test(q.ans[0])), 'sc: every answer is one or two plain words');
  ok(sc.items.every(q => firsts.indexOf(q.line) < 0) && new Set(sc.items.map(q => q.L)).size === sc.items.length, 'sc: never a first sentence of a paragraph, one question per paragraph');
  ok(sc.items.every(q => C.judge(q, q.ans[0]) && C.judge(q, '  ' + q.ans[0].toUpperCase() + '. ') && !C.judge(q, 'banana') && !C.judge(q, '') && !C.judge(q, q.ans[0] + ' extra words here')), 'sc judge: exact words right (case, spaces and a full stop ignored); a wrong word, nothing, or more than two words is wrong');
  ok(C.judge({ k: 'sc', ans: ['solar energy'] }, 'Solar  energy') && !C.judge({ k: 'sc', ans: ['solar energy'] }, 'energy') && !C.judge({ k: 'sc', ans: ['solar energy'] }, 'the solar energy'), 'sc judge: a two-word answer needs both words, in order, and no extra word');
  const sm = SET.groups[1], lines = sm.items.map(q => q.line), flatT = PARAS.map(p => C.sents(p.t)).reduce((a, b) => a.concat(b), []);
  const at = flatT.indexOf(lines[0]);
  ok(sm.items.length === 3 && at >= 0 && flatT[at + 1] === lines[1] && flatT[at + 2] === lines[2], 'sum: three sentences that follow each other in the passage');
  ok(sm.items.every(q => q.pre + q.ans + q.post === q.line) && sm.items.every(q => sc.items.every(s => s.line !== q.line)) && lines.every(l => firsts.indexOf(l) < 0), 'sum: gap sentences are exact, no sentence is used twice, no first sentence');
  const ans = sm.items.map(q => q.ans), inRun = new Set(lines.join(' ').toLowerCase().match(/[a-z']+/g));
  ok(sm.box.length >= 5 && sm.box.length <= 6 && new Set(sm.box).size === sm.box.length && ans.every(a => sm.box.indexOf(a) >= 0) && sm.box.filter(w => ans.indexOf(w) < 0).every(w => !inRun.has(w)), 'sum: the box holds the 3 answers once each and 2 or 3 other words that are not in the summary');
  ok(sm.items.every(q => C.judge(q, q.ans) && C.judge(q, q.ans.toUpperCase()) && !C.judge(q, sm.box.filter(w => w !== q.ans)[0])), 'sum judge: the removed word is right, any other word of the box is wrong');
  const mh = SET.groups[2];
  ok(mh.items.length >= 2 && mh.items.length <= 4 && mh.heads.length >= mh.items.length + 1 && mh.heads.length <= mh.items.length + 2 && mh.heads.map(x => x.id).join() === C.ROMAN.slice(0, mh.heads.length).join(), 'mh: 2 to 4 paragraphs, 1 or 2 extra headings, numbered i, ii, iii ...');
  ok(mh.items.every(q => { const first = C.sents(textOf(q.L))[0]; return q.line === first && mh.heads.filter(x => x.id === q.ans)[0].t === C.headOf(first); }), 'mh: the right heading of a paragraph is the one made from its own first sentence');
  const askedHeads = new Set(mh.items.map(q => mh.heads.filter(x => x.id === q.ans)[0].t)), extra = mh.heads.filter(x => !askedHeads.has(x.t));
  ok(askedHeads.size === mh.items.length && extra.length >= 1 && new Set(mh.heads.map(x => x.t.toLowerCase())).size === mh.heads.length && extra.every(x => mh.items.every(q => C.headOf(C.sents(textOf(q.L))[0]) !== x.t)), 'mh: every asked paragraph has its own heading, the extras belong to no asked paragraph, no heading twice');
  ok(mh.items.every(q => C.judge(q, q.ans) && mh.heads.filter(x => x.id !== q.ans).every(x => !C.judge(q, x.id)) && !C.judge(q, '')), 'mh judge: only the right number is right');
  const joinedPassage = normWs(PARAS.map(p => p.t).join(' ')); ok(all.every(q => joinedPassage.indexOf(q.line) >= 0), 'everything the questions show comes from the passage');
}
{
  const typed = q => q.k === 'sc' ? q.ans[0] : q.ans, full = {}; all.forEach(q => { full[q.id] = typed(q); });
  const s1 = C.score(SET, full); ok(s1.n === all.length && s1.right === all.length && s1.answered === all.length && s1.rows.every(r => r.st === 'right'), 'score: everything right = n of n');
  const s0 = C.score(SET, {}); ok(s0.right === 0 && s0.answered === 0 && s0.rows.every(r => r.st === 'none') && C.score(SET, null).n === all.length, 'score: no answers = 0 right, 0 answered, all "none"');
  const mix = Object.assign({}, full); mix[all[0].id] = 'banana'; delete mix[all[1].id]; mix[all[2].id] = '   '; mix.nonsense = 'x';
  const s2 = C.score(SET, mix); ok(s2.right === all.length - 3 && s2.answered === all.length - 2 && s2.rows[0].st === 'wrong' && s2.rows[1].st === 'none' && s2.rows[2].st === 'none', 'score: wrong, missing and blank answers are counted apart; unknown ids are ignored (right ' + s2.right + ', answered ' + s2.answered + ')');
  ok(JSON.stringify(C.score(SET, full)) === JSON.stringify(C.score(J(SET), J(full))), 'score: works the same on a set read back from storage');
}
// ---- wiring (static)
const b = read('build.py'); ok(b.indexOf('169q-timed-reading.js') < b.indexOf('169t-timed-questions.js') && b.indexOf('169t-timed-questions.js') < b.indexOf('170-sync-points-drift.js') && b.indexOf('169o-ielts-hub.js') < b.indexOf('169t-timed-questions.js') && b.indexOf('94x-timed-reading.css') < b.indexOf('94za-timed-questions.css'), 'build.py loads 169t after 169q and 169o, before 170, and its css after 94x');
const code = js.replace(/\/\*[\s\S]*?\*\//g, '');
ok(!/localStorage|store\.(get|set)|wt:[a-z]+/.test(code), 'no new storage key: 169t never touches localStorage or store (the set and answers live in the run of 169q)');
const sy = read('src/js/295-account-sync.js'); ok(!/readrun|\.qs\b|timed-q/.test(sy), 'sync: nothing new to sync (the run in progress stays on this device)');
const q9 = read('src/js/169q-timed-reading.js'); ok(/use: x => \{ QX = /.test(q9) && /QX\.show\(qui\(\)\)/.test(q9) && /QX\.timesUp\(\)/.test(q9) && /QX\.off\(\)/.test(q9), '169q has the four hooks (use, show, timesUp, off)');
ok(/IE\.log\('r'\)/.test(code) && (code.match(/IE\.log/g) || []).length === 1, 'the practice log is one call, IE.log("r"), in one place');
const bn = JSON.parse(read('src/i18n/bn.json'));
{
  const need = ['Complete the sentences. Choose NO MORE THAN TWO WORDS.', 'Complete the summary. Choose words from the box.', 'Choose the best heading for each paragraph.', 'Next question', 'Next part', 'Finish', 'Questions', 'Words to choose from', 'List of headings',
    'Your answers', 'Time is up. Here are your answers.', 'All right this time. Well done.', 'Look at the lines in the passage whenever you like.', 'Correct', 'Not quite', 'No answer', 'Your answer', 'Correct answer', 'Use no more than two words.', 'Show in text', 'Done'];
  const miss = need.filter(k => !bn.dict[k]); ok(miss.length === 0, 'bn.json covers every fixed string of the question panel' + (miss.length ? ' (missing: ' + miss.join(' | ') + ')' : ''));
  const inCode = need.filter(k => k !== 'Done' && code.indexOf(k) < 0); ok(inCode.length === 0, 'the strings checked in bn.json are really the strings used in the code' + (inCode.length ? ' (not found: ' + inCode.join(' | ') + ')' : ''));
  const dyn = ['Questions 1–5', 'Question 3', '2 of 5', 'Question 3 answer', 'Gap 2', 'Gap 2: direction', 'Heading iv', 'Paragraph B'];
  const nomatch = dyn.filter(s => !bn.rx.some(r => new RegExp(r[0]).test(s))); ok(nomatch.length === 0, 'bn.json has a pattern for every number string' + (nomatch.length ? ' (missing: ' + nomatch.join(' | ') + ')' : ''));
  ok(bn.dict['Time ran out before the questions were finished. Your speed was saved.'] && q9.indexOf('Time ran out before the questions were finished. Your speed was saved.') > 0, 'bn.json has the new message of 169q');
}
// ---- real Chromium
let chromium; try { ({ chromium } = require('playwright')); } catch (e) { console.error('timed_questions_check: playwright is not installed'); process.exit(2); }
const css = ['src/css/10-base-layout.css', 'src/css/94-learn-ui.css', 'src/css/94f-review-lesson.css', 'src/css/94m-questions.css', 'src/css/94x-timed-reading.css', 'src/css/94za-timed-questions.css'].map(read).join('\n');
const SY = ['ta', 'lo', 'mer', 'vi', 'dan', 'ko', 'rel', 'zu', 'pan', 'sel', 'bor', 'nim', 'qua', 'fen', 'gor', 'hal'], pw = k => SY[k % 16] + SY[(k >> 4) % 16] + SY[(k >> 8) % 16];
let raw = 'CHAPTER I.\n\n', kk = 0;
for (let p = 0; p < 22; p++) {
  raw += 'Colonies ' + pw(kk++) + ' each year.';
  for (let s = 0; s < 4; s++) { const w = []; for (let i = 0; i < 8; i++) w.push(pw(kk++)); raw += ' The ' + w[0] + ' ' + w[1] + ' near the ' + w[2] + ' and ' + w[3] + ' with the ' + w[4] + ' during the ' + w[5] + ' season of ' + w[6] + ' ' + w[7] + '.'; }
  raw += '\n\n';
}
const page = `<!doctype html><html data-theme="dark"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style></head><body>
<script>
(() => { const real = Date.now.bind(Date); Date.now = () => real() + (Number(localStorage.getItem('test:off')) || 0); })();
const h = (tag, attrs, ...kids) => { const e = document.createElement(tag); Object.keys(attrs || {}).forEach(k => { const v = attrs[k]; if (v == null || v === false) return; if (k === 'class') e.className = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v === true ? '' : v); }); kids.flat(9).forEach(c => { if (c == null || c === false) return; e.append(c.nodeType ? c : document.createTextNode(String(c))); }); return e; };
window.__toasts = []; window.__ie = [];
const toast = m => window.__toasts.push(m), histSoon = () => {}, LB = { ctx: () => null }, P = {}, IE = { log: s => window.__ie.push(s) };
const store = { get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }, set(k, v) { localStorage.setItem(k, JSON.stringify(v)); } };
const LearnHub = { register(t) { window.__tile = t; }, refresh() {} };
</script>
<script>${read('src/js/010-core.js')}</script>
<script>
const S = { book: { id: 7, title: 'The Hidden Life of Bees', genres: 'Non-fiction, Science' }, model: Core.parseBook(${JSON.stringify(raw)}), lp: { 0: 0.5 }, map: [0], span: [0] };
${read('src/js/167c-question-gen.js')}
${read('src/js/169q-timed-reading.js')}
${read('src/js/169t-timed-questions.js')}
window.TMR = TMR; window.TRC = TRC; window.TQC = TQC;
</script></body></html>`;
let pass = 0, fail = 0;
const t = async (name, fn) => { try { await fn(); pass++; console.log('ok    ' + name); } catch (e) { fail++; console.log('FAIL  ' + name + '\n        ' + String(e && e.message).split('\n').slice(0, 6).join('\n        ')); } };
(async () => {
  let br; try { br = await chromium.launch(); } catch (e) { console.error('timed_questions_check: no browser: ' + e.message); process.exit(2); }
  const bc = await br.newContext({ viewport: { width: 390, height: 844 } }), pg = await bc.newPage(), errs = [];
  await pg.route('https://wt.test/**', r => r.fulfill({ contentType: 'text/html', body: page }));
  pg.on('pageerror', e => errs.push(String(e))); pg.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  const load = async () => { await pg.goto('https://wt.test/'); await pg.waitForFunction('window.TMR'); };
  const shot = async n => { if (shotDir) { fs.mkdirSync(shotDir, { recursive: true }); await pg.screenshot({ path: path.join(shotDir, n + '.png') }); } };
  const clock = ms => pg.evaluate(v => { localStorage.setItem('test:off', String((Number(localStorage.getItem('test:off')) || 0) + v)); }, ms);
  const run = () => pg.evaluate(() => JSON.parse(localStorage.getItem('wt:readrun')));
  const ie = () => pg.evaluate(() => window.__ie.slice());
  const startRead = async () => { await pg.evaluate(() => window.TMR.start({ bookId: '7', chapter: 0 })); await pg.getByRole('button', { name: 'Start' }).click(); await pg.waitForSelector('.tr-passage'); };
  const finishRead = async () => { await clock(70000); await pg.getByRole('button', { name: /finished reading/ }).click(); await pg.waitForSelector('.tq'); };
  const active = async () => (await pg.locator('.tq-dot[aria-current="step"]').innerText()).trim();
  const next = () => pg.locator('.tq__next').click();
  const secs = s => { const [m, x] = s.split(':').map(Number); return m * 60 + x; };
  await load(); await pg.evaluate(() => localStorage.clear());
  let SETB, PLAN = {};
  await t('after "I\'ve finished reading": speed saved, the question panel under the passage as in the mock-up, the passage still there, timer still running', async () => {
    await startRead(); await finishRead();
    const r = await run(); SETB = r.qs; assert.ok(r.rd > 0 && r.wpm > 0 && r.qs && r.qs.groups.length === 3, 'run has speed and a set with 3 kinds: ' + JSON.stringify(r.qs && r.qs.groups.map(g => g.k)));
    const hist = await pg.evaluate(() => JSON.parse(localStorage.getItem('wt:readspeed'))); assert.ok(hist.runs.length === 1 && hist.runs[0].wpm === r.wpm, 'the speed is saved once');
    assert.strictEqual((await pg.locator('.tq__title').innerText()).trim(), 'Questions 1–' + SETB.groups[0].items.length);
    assert.strictEqual((await pg.locator('.tq__of').innerText()).trim(), '1 of ' + SETB.groups[0].items.length);
    assert.ok((await pg.locator('.tq__rule').innerText()).includes('NO MORE THAN TWO WORDS'));
    assert.strictEqual((await pg.locator('.tr-chip--ok').innerText()), r.wpm + ' words/min', 'green speed chip');
    const pb = await pg.locator('.tr-passage').boundingBox(), sb = await pg.locator('.tq').boundingBox(), nb = await pg.locator('.tq__next').boundingBox();
    assert.ok(pb && pb.height > 100 && pb.y < sb.y, 'the passage is above the panel'); assert.ok(sb.y + sb.height <= 844.5 && nb.y + nb.height <= 844.5, 'panel and Next button on screen'); assert.ok(sb.height < 560, 'the panel does not cover the passage (' + Math.round(sb.height) + 'px)');
    await pg.waitForTimeout(800); assert.ok(secs(await pg.locator('.tr-time').innerText()) < 1200 && secs(await pg.locator('.tr-time').innerText()) > 1000, 'timer runs on');
    assert.strictEqual(await pg.locator('.tq-card.is-active').count(), 1); assert.strictEqual((await pg.locator('.tq__next').textContent()).trim(), 'Next question'); await shot('1-questions');
  });
  await t('answering: typed words, a word from the box, a heading number; dots turn green when answered; Next moves on; Next part / Finish labels', async () => {
    const items = SETB.groups.reduce((a, g) => a.concat(g.items), []), n = items.length, labels = [];
    // plan: sc 0 right (UPPER + full stop), sc 1 wrong, sc 2 right, rest of sc blank; sum gap 1 right, gap 2 wrong, gap 3 blank; mh 1 right, 2 wrong, rest blank
    const grp = k => SETB.groups.find(g => g.k === k);
    for (let s = 0; s < n; s++) {
      const q = items[s]; assert.strictEqual(await active(), String(q.n), 'active question is ' + q.n);
      labels.push((await pg.locator('.tq__next').textContent()).trim());
      if (q.k === 'sc') { const i = grp('sc').items.indexOf(q); const v = i === 0 ? q.ans[0].toUpperCase() + '.' : i === 1 ? 'banana' : i === 2 ? q.ans[0] : ''; if (v) await pg.locator('.tq-card.is-active input').fill(v); PLAN[q.id] = i === 0 || i === 2 ? 'right' : i === 1 ? 'wrong' : 'none'; }
      else if (q.k === 'sum') { const g = grp('sum'), i = g.items.indexOf(q); const w = i === 0 ? q.ans : i === 1 ? g.box.filter(x => x !== q.ans)[0] : ''; if (w) await pg.locator('.tq-word', { hasText: new RegExp('^' + w + '$', 'i') }).click(); PLAN[q.id] = i === 0 ? 'right' : i === 1 ? 'wrong' : 'none'; }
      else { const g = grp('mh'), i = g.items.indexOf(q); const id = i === 0 ? q.ans : i === 1 ? g.heads.filter(x => x.id !== q.ans)[0].id : ''; if (id) await pg.locator('.tq-card.is-active .tq-pick', { hasText: new RegExp('^' + id + '$') }).click(); PLAN[q.id] = i === 0 ? 'right' : i === 1 ? 'wrong' : 'none'; }
      if (s === 0) { assert.ok((await pg.locator('.tq-dot.is-done').count()) === 1, 'one dot is green after the first answer'); await shot('2-answered-one'); }
      if (s === grp('sc').items.length) await shot('3-summary');
      if (s < n - 1) await next();
    }
    assert.strictEqual(labels[0], 'Next question'); assert.strictEqual(labels[grp('sc').items.length - 1], 'Next part'); assert.strictEqual(labels[grp('sc').items.length + 2], 'Next part'); assert.strictEqual(labels[n - 1], 'Finish', labels.join(' | '));
    const r = await run(); assert.ok(r.an && Object.keys(r.an).length > 0, 'answers are kept in the run');
    assert.strictEqual(r.an[grp('sc').items[0].id], grp('sc').items[0].ans[0].toUpperCase() + '.', 'typed text kept as typed');
  });
  await t('Finish: the review shows the right count, each question in words (right / not quite / no answer), the right answer, the line; the practice is logged once', async () => {
    assert.deepStrictEqual(await ie(), [], 'nothing logged before Finish'); await next(); await pg.waitForSelector('.tq--review');
    const exp = { right: Object.values(PLAN).filter(x => x === 'right').length, wrong: Object.values(PLAN).filter(x => x === 'wrong').length, none: Object.values(PLAN).filter(x => x === 'none').length }, n = Object.keys(PLAN).length;
    assert.strictEqual((await pg.locator('.tq__title').innerText()).trim(), 'Your answers'); assert.strictEqual((await pg.locator('.tq__of').innerText()).trim(), exp.right + ' of ' + n + ' right');
    assert.strictEqual(await pg.locator('.tq-row--right').count(), exp.right); assert.strictEqual(await pg.locator('.tq-row--wrong').count(), exp.wrong); assert.strictEqual(await pg.locator('.tq-row--none').count(), exp.none);
    const marks = await pg.locator('.tq-mark').allInnerTexts(); assert.ok(marks.every(m => /Correct|Not quite|No answer/.test(m)), 'every mark has words: ' + marks.join('|'));
    const items = SETB.groups.reduce((a, g) => a.concat(g.items), []);
    for (let k = 0; k < n; k++) { const row = pg.locator('.tq-row').nth(k), st = PLAN[items[k].id], txt = await row.innerText();
      assert.ok(txt.includes(items[k].line.slice(0, 20)) || items[k].k !== 'mh', 'row ' + (k + 1) + ' shows the line');
      if (st !== 'right') assert.ok(/Correct answer/i.test(txt), 'row ' + (k + 1) + ' shows the right answer'); else assert.ok(!/Correct answer/i.test(txt), 'a right answer is not repeated');
      if (st === 'none') assert.ok(!/Your answer/i.test(txt)); }
    assert.deepStrictEqual(await ie(), ['r'], 'IE.log("r") exactly once'); assert.strictEqual((await run()).qd, 1);
    assert.strictEqual(await pg.locator('.tr-passage').count(), 1, 'the passage is still there'); await shot('4-review');
  });
  await t('Show in text: marks exactly the line in its paragraph of the passage and scrolls it into view; one mark at a time', async () => {
    const q = SETB.groups[0].items[0];
    await pg.locator('.tq-row').nth(0).getByRole('button', { name: 'Show in text' }).click();
    assert.strictEqual(await pg.locator('mark.tq-line').count(), 1); assert.strictEqual((await pg.locator('mark.tq-line').innerText()).trim(), q.line);
    assert.strictEqual(await pg.locator('mark.tq-line').evaluate(m => m.closest('.tr-para').getAttribute('data-p')), q.L, 'in the paragraph ' + q.L);
    const mb = await pg.locator('mark.tq-line').boundingBox(), sb = await pg.locator('.tq').boundingBox(); assert.ok(mb && mb.y >= 0 && mb.y + 4 <= sb.y, 'the line is on screen above the panel: ' + JSON.stringify(mb));
    const hq = SETB.groups[2].items[0], k = SETB.groups.slice(0, 2).reduce((a, g) => a + g.items.length, 0);
    await pg.locator('.tq-row').nth(k).getByRole('button', { name: 'Show in text' }).click(); assert.strictEqual(await pg.locator('mark.tq-line').count(), 1);
    assert.strictEqual((await pg.locator('mark.tq-line').innerText()).trim(), hq.line);
    const paraText = await pg.locator('.tr-para').allInnerTexts(); assert.ok(paraText.join(' ').replace(/\s+/g, ' ').includes(SETB.groups[0].items[1].line.slice(0, 30)), 'passage text is whole'); await shot('5-show-in-text');
  });
  await t('Done closes everything; the run is dropped, the saved speed stays', async () => {
    await pg.getByRole('button', { name: 'Done' }).click(); assert.strictEqual(await pg.evaluate(() => localStorage.getItem('wt:readrun')), null); assert.strictEqual(await pg.evaluate(() => window.TMR.stats().n), 1); assert.strictEqual(await pg.locator('.rl.tr:not([hidden])').count(), 0);
  });
  await t('the page is reloaded in the middle of the questions: the same set, the answers and the time are kept and the first open question is active', async () => {
    await pg.evaluate(() => { window.__ie.length = 0; }); await startRead(); await finishRead();
    const r0 = await run(), q0 = r0.qs.groups[0].items[0], q1 = r0.qs.groups[0].items[1];
    await pg.locator('.tq-card.is-active input').fill(q0.ans[0]); await next();
    await pg.waitForTimeout(800); const before = secs(await pg.locator('.tr-time').innerText()); await clock(2 * 60000); await load();
    assert.strictEqual(await pg.evaluate(() => window.TMR.on), false); assert.strictEqual(await pg.evaluate(() => window.TMR.start()), true);
    await pg.waitForSelector('.tq'); const after = secs(await pg.locator('.tr-time').innerText()); assert.ok(before - after >= 119 && before - after <= 124, 'time: ' + before + ' -> ' + after);
    assert.strictEqual((await run()).qs.groups[0].items[0].line, q0.line, 'same set'); assert.strictEqual(await pg.locator('.tq-card input').first().inputValue(), q0.ans[0], 'typed answer kept');
    assert.strictEqual(await active(), String(q1.n), 'the first open question is active'); assert.strictEqual(await pg.locator('.tq-dot.is-done').count(), 1);
    assert.strictEqual(await pg.locator('.tr-chip--ok').count(), 1, 'speed chip is back');
    assert.strictEqual(await pg.evaluate(() => window.TMR.stats().n), 2, 'speed not saved twice');
  });
  await t('time is up while questions are open: the review of what was answered, a calm note, the practice logged once', async () => {
    await pg.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
    await clock(25 * 60000); await pg.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange')); });
    await pg.waitForSelector('.tq--review'); assert.ok((await pg.locator('.tq__rule').innerText()).includes('Time is up. Here are your answers.')); assert.strictEqual(await pg.locator('.tq-row--right').count(), 1); assert.strictEqual(await pg.locator('.tq-row--none').count() + 1, await pg.locator('.tq-row').count());
    assert.deepStrictEqual(await ie(), ['r']); assert.strictEqual((await pg.locator('.tq__of').innerText()).trim().startsWith('1 of '), true); await shot('6-time-up');
    await pg.getByRole('button', { name: 'Done' }).click();
  });
  await t('time is up with NO answer: the review shows all as "no answer" and nothing is logged; closing half way logs nothing', async () => {
    await pg.evaluate(() => { window.__ie.length = 0; }); await startRead(); await finishRead(); await clock(25 * 60000); await pg.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await pg.waitForSelector('.tq--review', { timeout: 3000 }); assert.strictEqual(await pg.locator('.tq-row--none').count(), await pg.locator('.tq-row').count()); assert.deepStrictEqual(await ie(), []);
    await pg.getByRole('button', { name: 'Done' }).click();
    await startRead(); await finishRead(); await pg.locator('.tq-card.is-active input').fill('x'); await pg.getByRole('button', { name: 'Close timed reading' }).click();
    assert.deepStrictEqual(await ie(), [], 'closing half way logs nothing'); assert.strictEqual(await pg.evaluate(() => localStorage.getItem('wt:readrun')), null);
  });
  await t('questions again from the same passage are the same questions (seeded); Enter in a box goes to the next question; a phone turned sideways keeps the Next button on screen', async () => {
    await startRead(); await clock(70000); const w = await pg.evaluate(() => window.TMR.current().paras.map(p => p.t)); await pg.getByRole('button', { name: /finished reading/ }).click(); await pg.waitForSelector('.tq');
    const r = await run(); const again = await pg.evaluate(p => window.TQC.build(p.map((t, i) => ({ L: 'ABCDEFG'[i], t })), { seed: '7|0|' + p.length }), w); assert.strictEqual(JSON.stringify(again), JSON.stringify(r.qs), 'same passage, same questions');
    await pg.locator('.tq-card.is-active input').fill('abc'); await pg.keyboard.press('Enter'); assert.strictEqual(await active(), '2');
    await pg.setViewportSize({ width: 844, height: 390 }); await pg.waitForTimeout(500); const nb = await pg.locator('.tq__next').boundingBox(), tb = await pg.locator('.tr-timer').boundingBox(); await shot('7-landscape');
    assert.ok(nb && nb.y >= 0 && nb.y + nb.height <= 391 && tb && tb.y >= 0, 'Next button and timer on screen sideways'); assert.strictEqual(await active(), '2', 'same question after turning');
    await pg.setViewportSize({ width: 390, height: 844 }); await pg.getByRole('button', { name: 'Close timed reading' }).click();
  });
  await t('no page errors during the whole run', async () => { assert.deepStrictEqual(errs, []); });
  await br.close(); console.log('\nbrowser: ' + pass + ' passed, ' + fail + ' failed'); process.exit(bad || fail ? 1 : 0);
})();
