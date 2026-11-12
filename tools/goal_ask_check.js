#!/usr/bin/env node
/* Check for the goal ask (GA in 169n-goal-ask.js) and for switching goals both ways: pure rules first, then real Chromium (Playwright) on the BUILT page.
     python build.py --no-min && node tools/goal_ask_check.js
   Exit code 1 if a check fails, 2 if the browser or the built page is missing. */
const fs = require('fs'), path = require('path'), vm = require('vm'), root = path.join(__dirname, '..');
let bad = 0; const ok = (c, m) => { console.log((c ? 'ok    ' : 'FAIL  ') + m); if (!c) bad++; };
const src = f => fs.readFileSync(path.join(root, f), 'utf8');
const J = x => JSON.parse(JSON.stringify(x));
// ---- pure rules (GLC from 169l, no browser)
const s169 = src('src/js/169l-goal.js'), a = s169.indexOf('/* GLC-START */'), b = s169.indexOf('/* GLC-END */');
const ctx = vm.createContext({}); vm.runInContext(s169.slice(a, b) + '\nthis.G = GLC;', ctx); const G = ctx.G, now = new Date(2026, 10, 12, 12);
ok(G.askOn(undefined) && G.askOn({ offered: true }), 'the question is due when nothing was answered (also with only the "offered" flag)');
ok(!G.askOn({ ask: 'done' }) && !G.askOn(G.fromChoice('learn', now, null)), 'not due after Not now, or after a choice');
ok(G.mode({ ask: 'done' }) === 'unset', 'Not now leaves the mode as it was (unset = the app exactly as before)');
let g = G.withLearn({ ask: 'done' }, true, now); ok(G.mode(g) === 'learn' && g.ask === 'done', 'Learn mode on after Not now works');
g = G.fromChoice('ielts', now, null); g.exam.date = '2026-12-20'; g.exam.target = 7;
for (const c of ['learn', 'stories', 'ielts', 'stories', 'learn', 'ielts']) g = G.fromChoice(c, now, g);
ok(G.mode(g) === 'exam' && g.exam.date === '2026-12-20' && g.exam.target === 7, 'six switches in any order keep the exam date and target');
// ---- wiring (static)
const bld = src('build.py'), li = bld.indexOf('169l-goal.js'), ln = bld.indexOf('169n-goal-ask.js');
ok(li > 0 && ln > li, 'build.py loads 169n after 169l');
ok(/id="gl-ask"/.test(src('src/html/10-body-views.html')) && /shelfHooks\.ask\(/.test(src('src/js/080-ui-shell-favourites.js')), 'markup and the My Library hook are in place');
ok(/ask: 'done'/.test(src('src/js/300-wiring.js')), '"Skip for now" in onboarding records "not asked again"');
// ---- real Chromium
let chromium; try { ({ chromium } = require('playwright')); } catch (e) { console.error('goal_ask_check: playwright is not installed'); process.exit(2); }
const built = path.join(root, 'dist', 'index.html'); if (!fs.existsSync(built)) { console.error('goal_ask_check: run python build.py first'); process.exit(2); }
const WORDS = [{ ts: 1700000000000, w: 'forlorn', lv: 'C1', ex: 'She sat alone in the garden, looking forlorn and tired.', bid: '345', bt: 'Dracula' }, { ts: 1700000001000, w: 'tremble', lv: 'B2', ex: '', bid: '', bt: '' }];
(async () => {
  let br; try { br = await chromium.launch(); } catch (e) { console.error('goal_ask_check: no browser: ' + e.message); process.exit(2); }
  const errs = [];
  async function open(seed, vp) {
    const pg = await (await br.newContext({ viewport: vp || { width: 390, height: 844 }, serviceWorkers: 'block' })).newPage();
    pg.on('pageerror', e => errs.push(String(e.message || e)));
    await pg.addInitScript(s => { if (localStorage.getItem('__seed')) return; localStorage.setItem('__seed', '1'); for (const k in s) localStorage.setItem(k, s[k]); }, seed);
    await pg.route(/^https?:/, r => r.abort());
    await pg.goto('file://' + built); await pg.waitForTimeout(2500); return pg;
  }
  const lib = async pg => { await pg.evaluate(() => document.querySelector('#tabbar .tab[data-tab="shelf"]').click()); await pg.waitForTimeout(500); };
  const card = pg => pg.evaluate(() => { const e = document.getElementById('gl-ask'); return !!e && !e.hidden && getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().height > 0; });
  const goal = pg => pg.evaluate(() => JSON.parse(localStorage.getItem('wt:prefs') || '{}').goal);
  const learnAttr = pg => pg.evaluate(() => document.documentElement.hasAttribute('data-learn'));
  const learnTab = pg => pg.evaluate(() => !document.querySelector('#tabbar .tab[data-tab="learn"]').hidden);
  const words = pg => pg.evaluate(() => JSON.parse(localStorage.getItem('wt:words') || '[]'));
  const keeps = (before, now) => before.every(o => { const n = now.find(x => x.w === o.w); return n && Object.keys(o).every(k => JSON.stringify(n[k]) === JSON.stringify(o[k])); });
  const flip = (pg, id, v) => pg.evaluate(([i, val]) => { const c = document.getElementById(i); c.checked = val; c.dispatchEvent(new Event('change', { bubbles: true })); }, [id, v]);
  const setv = (pg, id, v) => pg.evaluate(([i, val]) => { const c = document.getElementById(i); c.value = val; c.dispatchEvent(new Event('change', { bubbles: true })); }, [id, v]);

  // 1. existing user with saved words: the card, a choice, then switching both ways
  let pg = await open({ 'wt:onboarded': '1', 'wt:words': JSON.stringify(WORDS) });
  ok(!(await learnAttr(pg)) && !(await learnTab(pg)), 'existing user: Standard, no Learn tab (nothing changed for them)');
  await lib(pg);
  ok(await card(pg), 'existing user: My Library shows the goal card');
  ok(await pg.evaluate(() => { const e = document.getElementById('gl-ask'); return e.querySelectorAll('.gl-ask-opt').length === 3 && !!e.querySelector('.gl-ask-no') && [...e.querySelectorAll('button')].every(b => b.getBoundingClientRect().height >= 44); }), 'card: three goals + Not now, every button at least 44px high');
  const before = await words(pg);
  await pg.evaluate(() => document.querySelector('#gl-ask [data-goal="learn"]').click()); await pg.waitForTimeout(400);
  let g1 = await goal(pg);
  ok(g1 && g1.v === 1 && g1.learn === true && g1.ask === 'done', 'choosing Learn English is saved (learn on, question done)');
  ok(!(await card(pg)) && (await learnAttr(pg)) && (await learnTab(pg)), 'card gone, Learn mode on, Learn tab shows');
  await flip(pg, 'in-examon', true); await setv(pg, 'in-examdate', '2026-12-20'); await setv(pg, 'in-examtarget', '7.0'); await pg.waitForTimeout(200);
  g1 = await goal(pg); ok(g1.exam && g1.exam.on && g1.exam.date === '2026-12-20' && g1.exam.target === 7, 'IELTS on with date 20 Dec and target 7.0');
  await flip(pg, 'in-learnmode', false); await pg.waitForTimeout(300);
  g1 = await goal(pg); ok(g1.learn === false && g1.exam.on === false && g1.exam.date === '2026-12-20', 'back to Enjoy stories: learning off, exam off, date kept');
  ok(!(await learnAttr(pg)) && !(await learnTab(pg)), 'Enjoy stories: Learn tab and learning tools hidden again');
  ok(keeps(before, await words(pg)), 'saved words are intact after switching to Enjoy stories (' + before.length + ' words, every field)');
  await flip(pg, 'in-learnmode', true); await flip(pg, 'in-examon', true); await pg.waitForTimeout(300);
  g1 = await goal(pg); ok(g1.learn && g1.exam.on && g1.exam.date === '2026-12-20' && g1.exam.target === 7, 'and forward again: IELTS comes back with the same date and target');
  ok(keeps(before, await words(pg)), 'saved words are intact after the round trip');
  await lib(pg); ok(!(await card(pg)), 'the card does not come back after a choice');

  // 2. Not now: stays Standard, never asked again, Settings still works.
  //    The test browser sometimes wipes ALL of localStorage on a reload (seen with the original app too, and the app makes no clear/remove call);
  //    a marker written before the reload shows it, and then this part is simply run again (up to 4 times).
  for (let attempt = 1, buf; attempt <= 4; attempt++) {
    buf = []; const rep = (c, m) => buf.push([c, m]);
    pg = await open({ 'wt:onboarded': '1', 'wt:words': JSON.stringify(WORDS) });
    await lib(pg); rep(await card(pg), 'second existing user: card shows');
    await pg.evaluate(() => document.querySelector('#gl-ask .gl-ask-no').click()); await pg.waitForTimeout(400);
    g1 = await goal(pg); rep(g1 && g1.ask === 'done' && g1.v === undefined, 'Not now saves only "question done" (no mode chosen)');
    rep(!(await card(pg)) && !(await learnAttr(pg)) && !(await learnTab(pg)), 'Not now: card gone, still Standard');
    await pg.evaluate(() => localStorage.setItem('__marker', '1')); await pg.waitForTimeout(1500);
    await pg.reload(); await pg.waitForTimeout(2500);
    if (!(await pg.evaluate(() => localStorage.getItem('__marker') === '1')) && attempt < 4) { console.log('note  the test browser wiped its storage on reload; running this part again (' + attempt + ')'); continue; }
    await lib(pg); rep(!(await card(pg)), 'after a reload the card is not shown again');
    await flip(pg, 'in-learnmode', true); await pg.waitForTimeout(300);
    rep((await learnAttr(pg)) && (await learnTab(pg)), 'Settings > Learn mode still turns learning on later');
    rep(keeps(WORDS, await words(pg)), 'saved words are intact');
    buf.forEach(x => ok(x[0], x[1])); break;
  }

  // 3. no card where it should not be: a chosen goal, a user without onboarding
  pg = await open({ 'wt:onboarded': '1', 'wt:prefs': JSON.stringify({ goal: { v: 1, learn: false, exam: null, ask: 'done', offered: false } }) });
  await lib(pg); ok(!(await card(pg)), 'a person who already chose a goal gets no card');

  // 4. desktop: the card shows on the Saved page too
  pg = await open({ 'wt:onboarded': '1' }, { width: 1280, height: 800 });
  await lib(pg); ok(await card(pg), 'desktop: the card shows on My Library');

  // 5. first run: Skip for now leaves Standard and does not ask again; a choice before Skip is kept
  pg = await open({});
  ok(await pg.evaluate(() => { const o = document.getElementById('ob-overlay'); return !!o && !o.hidden; }), 'new user: onboarding shows, goal card first');
  await pg.evaluate(() => document.getElementById('ob-skip-now').click()); await pg.waitForTimeout(600);
  g1 = await goal(pg); ok(g1 && g1.ask === 'done' && g1.v === undefined, 'first run, Skip for now: no goal chosen, question marked done');
  ok(await pg.evaluate(() => localStorage.getItem('wt:onboarded') === '1'), 'onboarding is marked done');
  await lib(pg); ok(!(await card(pg)) && !(await learnAttr(pg)), 'after skipping: no card in My Library, Standard');
  pg = await open({});
  await pg.evaluate(() => { document.getElementById('ob-goal-learn').click(); document.getElementById('ob-next-g').click(); }); await pg.waitForTimeout(300);
  await pg.evaluate(() => document.getElementById('ob-skip-now').click()); await pg.waitForTimeout(600);
  g1 = await goal(pg); ok(g1 && g1.learn === true && (await learnTab(pg)), 'first run: Learn English, then Skip: the choice is kept');

  ok(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs[0] : ''));
  await br.close(); console.log(bad ? '\n' + bad + ' failed' : '\nall passed'); process.exit(bad ? 1 : 0);
})();
