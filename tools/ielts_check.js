#!/usr/bin/env node
/* Check for the IELTS hub (IE, IEC in 169o-ielts-hub.js): pure rules first, then real Chromium (Playwright) on the BUILT page with a seeded practice log.
     python build.py --no-min && node tools/ielts_check.js
   The browser part reaches the closure through a TEMP copy of dist/index.html (one line added: window.__IE); the real file is not touched.
   Exit code 1 if a check fails, 2 if the browser or the built page is missing. */
const fs = require('fs'), path = require('path'), vm = require('vm'), os = require('os'), root = path.join(__dirname, '..');
let bad = 0; const ok = (c, m) => { console.log((c ? 'ok    ' : 'FAIL  ') + m); if (!c) bad++; };
const src = f => fs.readFileSync(path.join(root, f), 'utf8');
// ---- pure rules
const g169 = src('src/js/169l-goal.js'), s169 = src('src/js/169o-ielts-hub.js');
const ctx = vm.createContext({}); vm.runInContext(g169.slice(g169.indexOf('/* GLC-START */'), g169.indexOf('/* GLC-END */')) + '\n' + s169.slice(s169.indexOf('/* IEC-START */'), s169.indexOf('/* IEC-END */')) + '\nthis.C = IEC; this.G = GLC;', ctx);
const C = ctx.C, G = ctx.G, J = x => JSON.parse(JSON.stringify(x)), now = new Date(2026, 10, 12, 12);
const log = { '2026-11-03': { l: 2, r: 1 }, '2026-11-12': { l: 1, w: 3, s: 'x', z: 9 }, '2026-10-30': { l: 50, w: 50 }, 'junk': { l: 5 }, '2026-11-20': { s: -4 } };
const m = J(C.month(log, now)); ok(m.l === 3 && m.r === 1 && m.w === 3 && m.s === 0, 'month counts only this calendar month, whole numbers, skips bad fields and bad day keys');
ok(JSON.stringify(C.focus(m)) === '["s"]', 'Focus = the least-practised skill (Speaking at 0)');
ok(C.focus({ l: 2, r: 2, w: 2, s: 2 }).length === 0 && C.focus({}).length === 0, 'no Focus when all four are equal (a new month)');
ok(JSON.stringify(C.focus({ l: 4, r: 1, w: 1, s: 3 })) === '["r","w"]', 'tied lowest skills share the tag');
ok(C.ring(0) === 0 && C.ring(6) === 0.5 && C.ring(30) === 1, 'ring = sessions / 12, never over 1');
const A = { '2026-11-12': { l: 2, w: 1 }, '2026-11-11': { r: 1 } }, B = { '2026-11-12': { l: 1, w: 4 }, '2026-11-10': { s: 2 } }, before = JSON.stringify([A, B]);
const M = J(C.merge(A, B)); ok(M['2026-11-12'].l === 2 && M['2026-11-12'].w === 4 && M['2026-11-11'].r === 1 && M['2026-11-10'].s === 2, 'merge keeps every day, larger value per skill');
ok(JSON.stringify([A, B]) === before && JSON.stringify(C.merge(M, B)) === JSON.stringify(M) && JSON.stringify(J(C.merge(B, A))) === JSON.stringify(M), 'merge changes neither input, is repeatable, and order does not matter');
ok(C.mergeJson('[]', '{}') === null && C.mergeJson('x', '{}') === null, 'merge of something that is not a log returns null (the newer copy wins)');
const g = G.fromChoice('ielts', new Date(2026, 10, 2), null); g.exam.date = '2026-12-24';
const w = J(C.weeks(g, now)); ok(w && w.of === 8 && w.w === 2, 'week of the countdown: 2 Nov to 24 Dec = 8 weeks, on 12 Nov it is week 2');
ok(C.weeks(G.fromChoice('learn', now, null), now) === null && C.weeks(G.fromChoice('ielts', now, null), now) === null, 'no week without an exam or without a date');
// ---- wiring (static)
const b = src('build.py'); ok(b.indexOf('169m-class-worksheet.js') < b.indexOf('169o-ielts-hub.js') && /94v-ielts-hub\.css/.test(b) && /28f-sheet-ielts\.html/.test(b), 'build.py loads the new js, css and sheet');
ok(/IE\.log\('r'\)/.test(src('src/js/169g-question-screen.js')) && /IE\.log\('l'\)/.test(src('src/js/169k-listen-type.js')) && /IE\.log\('s'\)/.test(src('src/js/169h-echo-mode.js')), 'questions, Listen and type and Echo log their sessions');
const sy = src('src/js/295-account-sync.js'); ok(/k === 'wt:learnlog' \|\| k === 'wt:ielts'(?: \|\| k === 'wt:readspeed')?\]/.test(sy) && /k === 'wt:ielts'\) return IE\.mergeJson/.test(sy) && /BK_KEYS = \[[^\]]*'wt:ielts'/.test(src('src/js/290-backup-maintenance.js')), 'wt:ielts is in the sync category, has a merge rule, and is in backups');
// ---- real Chromium
let chromium; try { ({ chromium } = require('playwright')); } catch (e) { console.error('ielts_check: playwright is not installed'); process.exit(2); }
const built = path.join(root, 'dist', 'index.html'); if (!fs.existsSync(built)) { console.error('ielts_check: run python build.py first'); process.exit(2); }
let html = fs.readFileSync(built, 'utf8'); const hook = 'LearnHub.head(section);'; if (html.indexOf(hook) < 0) { console.error('ielts_check: build with --no-min'); process.exit(2); }
html = html.replace(hook, hook + ' window.__IE = { log, undo, month };'); const tmp = path.join(os.tmpdir(), 'wt-ielts-check.html'); fs.writeFileSync(tmp, html);
const pad = n => String(n).padStart(2, '0'), ymd = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()), add = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
(async () => {
  let br; try { br = await chromium.launch(); } catch (e) { console.error('ielts_check: no browser: ' + e.message); process.exit(2); }
  const errs = [], T = new Date(), from = ymd(add(T, -14)), exam = ymd(add(T, 42)), lastMonth = ymd(new Date(T.getFullYear(), T.getMonth(), 0));
  const goal = (over) => JSON.stringify({ goal: Object.assign({ v: 1, learn: true, exam: { on: true, kind: 'ielts', date: exam, target: 7, from }, ask: 'done', offered: false }, over || {}) });
  const WORDS = [{ ts: 1700000000000, w: 'forlorn', lv: 'C1', ex: 'x', bid: '345', bt: 'Dracula' }];
  async function open(seed) {
    const pg = await (await br.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' })).newPage();
    pg.on('pageerror', e => errs.push(String(e.message || e)));
    await pg.addInitScript(s => { if (localStorage.getItem('__seed')) return; localStorage.setItem('__seed', '1'); for (const k in s) localStorage.setItem(k, s[k]); }, seed);
    await pg.route(/^https?:/, r => r.abort()); await pg.goto('file://' + tmp); await pg.waitForTimeout(2500); return pg;
  }
  const learn = async pg => { await pg.evaluate(() => document.querySelector('#tabbar .tab[data-tab="learn"]').click()); await pg.waitForTimeout(600); };
  const txt = (pg, sel) => pg.evaluate(s => { const e = document.querySelector(s); return e ? e.textContent.replace(/\s+/g, ' ').trim() : null; }, sel);
  const ielts = pg => pg.evaluate(() => JSON.parse(localStorage.getItem('wt:ielts') || '{}'));
  const prefsGoal = pg => pg.evaluate(() => JSON.parse(localStorage.getItem('wt:prefs') || '{}').goal);
  const click = (pg, sel) => pg.evaluate(s => document.querySelector(s).click(), sel);
  const seed = { 'wt:onboarded': '1', 'wt:words': JSON.stringify(WORDS), 'wt:prefs': goal(), 'wt:ielts': JSON.stringify({ [ymd(T)]: { l: 4, r: 3, s: 2 }, [lastMonth]: { l: 9, w: 9 } }) };
  const pg = await open(seed); await learn(pg);
  ok(await pg.evaluate(() => !!document.querySelector('.ie-hub')), 'IELTS goal: the Learn hub starts with the IELTS section');
  ok(await pg.evaluate(() => document.querySelectorAll('.ie-skill').length === 4 && !!document.querySelector('.lhub-tile[data-tile="words"]') && !!document.querySelector('.lhub-tile[data-tile="review"]')), 'four skill cards, and the usual tiles (My Words, Review) are still below');
  ok(/42 days/.test(await txt(pg, '.ie-exam')) && /target 7\.0/.test(await txt(pg, '.ie-exam')) && /Week 3 of 8/.test(await txt(pg, '.ie-exam')), 'exam card: 42 days, date and target 7.0, Week 3 of 8 (from the seeded dates)');
  ok(/4 sessions/.test(await txt(pg, '.ie-l')) && /3 sessions/.test(await txt(pg, '.ie-r')) && /0 sessions/.test(await txt(pg, '.ie-w')) && /2 sessions/.test(await txt(pg, '.ie-s')), 'real counts from wt:ielts: Listening 4, Reading 3, Writing 0, Speaking 2 (last month\'s 9 + 9 not counted)');
  ok(await pg.evaluate(() => { const f = [...document.querySelectorAll('.ie-focus')]; return f.length === 1 && !!f[0].closest('.ie-w'); }), 'one Focus tag, on Writing (the least practised)');
  ok(/Write one Task 2 essay/i.test(await txt(pg, '.ie-today')), 'Today button names the Focus skill');
  ok(await pg.evaluate(() => [...document.querySelectorAll('.ie-skill, .ie-today, .ie-edit')].every(b => b.getBoundingClientRect().height >= 44)), 'cards and buttons are at least 44px high');
  // the skill sheet: add by hand, undo
  await click(pg, '.ie-w'); await pg.waitForTimeout(300);
  ok(await pg.evaluate(() => !document.getElementById('sheet-ielts').hidden) && /0 sessions this month/.test(await txt(pg, '#ie-sk-body')), 'tapping Writing opens its sheet with this month\'s count');
  await pg.evaluate(() => [...document.querySelectorAll('#ie-sk-body button')].find(b => /add one/.test(b.textContent)).click()); await pg.waitForTimeout(200);
  ok(/1 session this month/.test(await txt(pg, '#ie-sk-body')) && (await ielts(pg))[ymd(T)].w === 1, 'I did a session: 1 session, saved in wt:ielts under today');
  await pg.evaluate(() => [...document.querySelectorAll('#ie-sk-body button')].find(b => /Undo/.test(b.textContent)).click()); await pg.waitForTimeout(200);
  ok(/0 sessions this month/.test(await txt(pg, '#ie-sk-body')) && (await ielts(pg))[ymd(T)].w === undefined && (await ielts(pg))[ymd(T)].l === 4, 'Undo takes it back and touches nothing else');
  await pg.evaluate(() => [...document.querySelectorAll('#ie-sk-body button')].find(b => /add one/.test(b.textContent)).click());
  await pg.evaluate(() => window.__IE.log('w', 3)); await pg.evaluate(() => document.querySelector('#sheet-ielts [data-close]').click()); await pg.waitForTimeout(400);
  ok(/4 sessions/.test(await txt(pg, '.ie-w')) && await pg.evaluate(() => !!document.querySelector('.ie-s .ie-focus') && document.querySelectorAll('.ie-focus').length === 1), 'after closing: Writing shows 4, and Focus moved to Speaking (2)');
  // edit date and target at the hub
  await click(pg, '.ie-edit'); await pg.waitForTimeout(200);
  await pg.evaluate(() => { const t = document.getElementById('ie-target'); t.value = '7.5'; }); await pg.evaluate(() => [...document.querySelectorAll('.ie-edit-row button')].find(b => /Save/.test(b.textContent)).click()); await pg.waitForTimeout(300);
  let gg = await prefsGoal(pg); ok(gg.exam.target === 7.5 && gg.exam.date === exam && gg.exam.from === from, 'Edit > target 7.5 saved in the goal; the exam date and the countdown start were not touched');
  await click(pg, '.ie-edit'); await pg.waitForTimeout(200);
  const newDate = ymd(add(T, 50)); await pg.evaluate(d => { document.getElementById('ie-date').value = d; }, newDate); await pg.evaluate(() => [...document.querySelectorAll('.ie-edit-row button')].find(b => /Save/.test(b.textContent)).click()); await pg.waitForTimeout(300);
  gg = await prefsGoal(pg); ok(gg.exam.date === newDate && /50 days/.test(await txt(pg, '.ie-exam')), 'Edit > new date: the card says 50 days');
  // switching goals both ways: the log is never touched
  const logBefore = JSON.stringify(await ielts(pg));
  await pg.evaluate(() => { const c = document.getElementById('in-examon'); c.checked = false; c.dispatchEvent(new Event('change', { bubbles: true })); }); await pg.waitForTimeout(400); await learn(pg);
  ok(await pg.evaluate(() => !document.querySelector('.ie-hub')) && await pg.evaluate(() => !!document.querySelector('.lhub-tile[data-tile="words"]')), 'exam off (Learn mode stays): no IELTS section, the tiles are there');
  await pg.evaluate(() => { const c = document.getElementById('in-learnmode'); c.checked = false; c.dispatchEvent(new Event('change', { bubbles: true })); }); await pg.waitForTimeout(300);
  await pg.evaluate(() => { const c = document.getElementById('in-learnmode'); c.checked = true; c.dispatchEvent(new Event('change', { bubbles: true })); const e = document.getElementById('in-examon'); e.checked = true; e.dispatchEvent(new Event('change', { bubbles: true })); }); await pg.waitForTimeout(400); await learn(pg);
  ok(JSON.stringify(await ielts(pg)) === logBefore, 'switching Learn off/on and IELTS off/on leaves wt:ielts byte for byte the same');
  ok(await pg.evaluate(() => !!document.querySelector('.ie-hub')) && /4 sessions/.test(await txt(pg, '.ie-l')) && /50 days/.test(await txt(pg, '.ie-exam')), 'IELTS on again: the same counts, the same date');
  ok(JSON.parse(await pg.evaluate(() => localStorage.getItem('wt:words'))).length === 1, 'saved words untouched');
  // learn mode without an exam: no section
  const p2 = await open({ 'wt:onboarded': '1', 'wt:prefs': goal({ exam: null }) }); await learn(p2);
  ok(await p2.evaluate(() => !document.querySelector('.ie-hub') && !!document.querySelector('.lhub-grid')), 'Learn English (no exam): no IELTS section, tiles as before');
  // exam on, no date, empty log: calm start
  const p3 = await open({ 'wt:onboarded': '1', 'wt:prefs': goal({ exam: { on: true, kind: 'ielts', date: '', target: null, from } }) }); await learn(p3);
  ok(/When is your exam/.test(await txt(p3, '.ie-exam')) && await p3.evaluate(() => document.querySelectorAll('.ie-skill').length === 4 && document.querySelectorAll('.ie-focus').length === 0) && /Today.s plan/i.test(await txt(p3, '.ie-today')), 'no date and no practice yet: "When is your exam?", four cards at 0, no Focus tag, Today opens the plan');
  ok(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs[0] : ''));
  await br.close(); console.log(bad ? '\n' + bad + ' failed' : '\nall passed'); process.exit(bad ? 1 : 0);
})();
