#!/usr/bin/env node
/* Check for the Writing Task 2 self-check (SCC, SCW in 169v-writing-selfcheck.js, Task 64): the pure rules, the wiring, the Bengali strings, and the
   checklist drawn in real Chromium (Playwright) with the real helper h from 030 and the real styles (a stand-in page, not the whole app).
     node tools/writing_selfcheck_check.js      Exit code 1 if a check fails, 2 if there is no browser.
   It does NOT run the whole writing screen (typing, finishing, closing the app): test that by hand. */
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.join(__dirname, '..'), read = f => fs.readFileSync(path.join(root, f), 'utf8');
let bad = 0; const ok = (c, m) => { console.log((c ? 'ok    ' : 'FAIL  ') + m); if (!c) bad++; };
const js = read('src/js/169v-writing-selfcheck.js');
try { new vm.Script('(function(){' + js + '\n})'); ok(true, 'syntax: the file compiles'); } catch (e) { ok(false, 'syntax: ' + e.message); }
const ctx = vm.createContext({}); vm.runInContext(js.slice(js.indexOf('/* SCC-START */'), js.indexOf('/* SCC-END */')) + '\nthis.C = SCC;', ctx);
const C = ctx.C;
ok(C.AREAS.map(a => a.name).join() === 'Task response,Organisation,Vocabulary,Grammar', 'areas: task response, organisation, vocabulary, grammar');
ok(C.AREAS.every(a => a.q && a.items.length === 3 && a.items.every(i => i.t && i.tip)), 'areas: a question and three boxes, each with a tip');
ok(new Set(C.ids()).size === 12, 'ids: twelve different box ids');
ok(!/band\s*[0-9]|\b[0-9](\.5)?\s*\/\s*9\b/i.test(js.replace(/Task 2/g, '')), 'no score: the file holds no band number or x/9');
ok(C.clean(null).length === 0 && C.clean('x').length === 0 && C.clean(['zz', 5, 'gr1', 'gr1', 'tr1']).join() === 'tr1,gr1', 'clean: unknown, wrong and repeated ids are dropped; order is the checklist order');
ok(C.tips([]).length === 4 && C.tips(C.ids()).length === 0, 'tips: one tip for every area with an empty box, none when all are ticked');
ok(C.tips(['tr1', 'tr2', 'tr3']).map(t => t.area).join() === 'Organisation,Vocabulary,Grammar', 'tips: an area with every box ticked gives no tip');
ok(C.tips(['tr1']).find(t => t.area === 'Task response').tip === C.AREAS[0].items[1].tip, 'tips: the tip is for the first empty box of the area');
const build = read('build.py');
ok(build.indexOf('169s-writing-task2.js') < build.indexOf('169v-writing-selfcheck.js') && build.indexOf('169v-writing-selfcheck.js') < build.indexOf('170-sync-points-drift.js') && build.indexOf('94z-writing-task2.css') < build.indexOf('94zc-writing-selfcheck.css'), 'build.py: 169v after 169s and before 170; its CSS after 94z');
const w = read('src/js/169s-writing-task2.js');
ok(/SCW\.card\(\)/.test(w) && /SCW\.draw\(L\.scroll, L\.d, saveDraft\)/.test(w) && /sc: Array\.isArray\(d\.sc\)/.test(w), '169s: preview card, checklist after Finish, and the sc field are wired');
ok(!/fetch\(|XMLHttpRequest|sendBeacon|localStorage/.test(js), 'privacy: no network call and no storage of its own');
const bn = JSON.parse(read('src/i18n/bn.json'));
const eng = [];
C.AREAS.forEach(a => { eng.push(a.name, a.q); a.items.forEach(i => eng.push(i.t, i.tip)); });
eng.push('Finish and self-check', 'Self-check', 'Self-check · 4 questions', 'Not a score', 'Next time, look at', 'Every box is ticked. Nice and thorough.');
const miss = eng.filter(s => !bn.dict[s]); ok(miss.length === 0, 'bn.json: every checklist string has a Bengali line' + (miss.length ? ' (missing: ' + miss.join(' | ') + ')' : ''));
// ---- real browser
const hSrc = read('src/js/030-helpers-offline-audio.js'); const hStart = hSrc.indexOf('  const h = (tag'), hEnd = hSrc.indexOf('  const decode');
let chromium; try { ({ chromium } = require('playwright')); } catch (e) { console.error('writing_selfcheck_check: playwright is not installed'); process.exit(2); }
(async () => {
  let br; try { br = await chromium.launch(); } catch (e) { console.error('writing_selfcheck_check: no browser: ' + e.message); process.exit(2); }
  const pg = await br.newPage({ viewport: { width: 390, height: 844 } }); const errs = []; pg.on('pageerror', e => errs.push(e.message));
  const css = ['94-learn-ui.css', '94x-timed-reading.css', '94zc-writing-selfcheck.css'].map(f => { try { return read('src/css/' + f); } catch (e) { return ''; } }).join('\n');
  await pg.setContent('<style>:root{--accent:#E3B15C;--ink:#eee;--muted:#aaa;--surface:#161a2b;--line:#334;--s-2:.5rem;--s-3:.75rem;--s-4:1rem;--font-ui:sans-serif}body{background:#0d1020;color:#eee}' + css + '</style><div id="host"></div>');
  await pg.evaluate(hSrc.slice(hStart, hEnd) + '\n' + js.slice(js.indexOf('/* SCC-START */'), js.indexOf('/* SCC-END */')) + js.slice(js.indexOf('  const SCW')) + '\nwindow.SCC = SCC; window.SCW = SCW; window.h = h;');
  await pg.evaluate(() => { window.D = { sc: ['tr1', 'bogus'] }; window.N = 0; document.getElementById('host').append(SCW.card()); SCW.draw(document.getElementById('host'), D, () => { N++; }); });
  const t = async s => pg.evaluate(x => document.querySelector(x) ? document.querySelector(x).innerText : '', s);
  ok(await pg.locator('.sc-box').count() === 12 && await pg.locator('fieldset.sc-area').count() === 4, 'screen: four areas and twelve tick boxes');
  ok((await t('.sc-card')).includes('Self-check · 4 questions') && (await t('.sc-card')).includes('Not a score'), 'screen: the preview card says "4 questions" and "Not a score"');
  ok(await pg.locator('#sc-tr1').isChecked() && !(await pg.locator('#sc-tr2').isChecked()), 'screen: a saved tick is shown, an unknown id is ignored');
  const body = await t('body'); ok(!/\b\d+\s*(\/|of)\s*\d+\b|band|score:|points/i.test(body.replace(/not a score or a band|band descriptors|Not a score/gi, '')), 'screen: no number of ticks, no score, no band');
  ok((await t('.sc-tips')).includes('Next time, look at') && (await pg.locator('.sc-tip').count()) === 4, 'tips: four tips at first (one for each area with an empty box)');
  await pg.locator('label[for="sc-tr2"]').click(); await pg.locator('label[for="sc-tr3"]').click();
  ok(await pg.evaluate(() => JSON.stringify(D.sc)) === JSON.stringify(['tr1', 'tr2', 'tr3']) && await pg.evaluate(() => N) === 2, 'tick: the clicked boxes go into d.sc in checklist order and onChange is called each time');
  ok(await pg.locator('.sc-tip').count() === 3, 'tips: the Task response tip is gone when its three boxes are ticked');
  await pg.locator('label[for="sc-tr3"]').click(); ok(!(await pg.locator('#sc-tr3').isChecked()) && await pg.evaluate(() => JSON.stringify(D.sc)) === JSON.stringify(['tr1', 'tr2']), 'untick: the box is cleared from d.sc');
  for (const id of ['tr3', 'or1', 'or2', 'or3', 'vo1', 'vo2', 'vo3', 'gr1', 'gr2', 'gr3']) await pg.locator('label[for="sc-' + id + '"]').click();
  ok((await t('.sc-tips')).includes('Every box is ticked') && await pg.locator('.sc-tip').count() === 0, 'tips: all ticked gives the kind message');
  await pg.evaluate(() => SCW.draw(document.getElementById('host'), D, null));
  ok(await pg.locator('.sc-wrap').count() === 1 && await pg.locator('.sc-box:checked').count() === 12, 'draw again: replaces the old checklist (no duplicate) and keeps the ticks');
  const box = await pg.locator('.sc-item').first().boundingBox(); ok(box.height >= 44, 'touch: a row is at least 44 px tall (' + Math.round(box.height) + ')');
  const ov = await pg.evaluate(() => document.documentElement.scrollWidth > innerWidth); ok(!ov, 'layout: nothing sticks out sideways on a 390 px phone');
  ok(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs[0] : ''));
  await br.close(); console.log(bad ? '\n' + bad + ' check(s) failed' : '\nAll checks passed'); process.exit(bad ? 1 : 0);
})();
