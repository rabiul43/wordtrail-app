#!/usr/bin/env node
/* Check for the Standard | Learn gate (GL in 169l-goal.js, learnOn() in 030, 99e3-learn-gate.css) in real Chromium (Playwright), on the BUILT page.
     python build.py --no-min && node tools/learn_gate_check.js
   Standard (the default): every element marked data-lrn is hidden. Learn mode on: they are available. Tap-a-word, translate and Live translate are never marked.
   Exit code 1 if a check fails, 2 if the browser or the built page is missing. */
const fs = require('fs'), path = require('path'), root = path.join(__dirname, '..');
let chromium; try { ({ chromium } = require('playwright')); } catch (e) { console.error('learn_gate_check: playwright is not installed'); process.exit(2); }
const page_ = path.join(root, 'dist', 'index.html'); if (!fs.existsSync(page_)) { console.error('learn_gate_check: run python build.py first'); process.exit(2); }
let bad = 0; const ok = (c, m) => { console.log((c ? 'ok    ' : 'FAIL  ') + m); if (!c) bad++; };
const src = f => fs.readFileSync(path.join(root, f), 'utf8');
// What must never be hidden in Standard (static: the markup and the code that makes it)
const NOT = [['src/html/30-sheets-settings.html', /id="btn-live"[^>]*data-lrn|id="dm-live"[^>]*data-lrn/], ['src/js/160-learning-tools.js', /data-lrn/], ['src/js/161b-reading-modes.js', /data-lrn/]];
NOT.forEach(([f, re]) => ok(!re.test(src(f)), 'not marked: ' + f));
ok(/data-lrn/.test(src('src/js/163-word-panel.js')) && src('src/js/163-word-panel.js').split('data-lrn').length === 2, 'word panel: only Save word is marked (one mark)');
(async () => {
  let br; try { br = await chromium.launch(); } catch (e) { console.error('learn_gate_check: no browser: ' + e.message); process.exit(2); }
  const pg = await (await br.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' })).newPage();
  const errs = []; pg.on('pageerror', e => errs.push(String(e.message || e)));
  await pg.route(/^https?:/, r => r.abort());   // offline: only the built page itself
  await pg.goto('file://' + page_); await pg.waitForTimeout(2500);
  const shown = () => pg.evaluate(() => [...document.querySelectorAll('[data-lrn]')].filter(e => !e.hasAttribute('hidden') && getComputedStyle(e).display !== 'none').map(e => e.id || e.className || e.tagName));
  const count = await pg.evaluate(() => document.querySelectorAll('[data-lrn]').length);
  ok(count >= 6, 'marked elements found in the built page: ' + count);
  ok(!(await pg.evaluate(() => document.documentElement.hasAttribute('data-learn'))), 'Standard is the default (no data-learn)');
  let s = await shown(); ok(s.length === 0, 'Standard: nothing marked is visible' + (s.length ? ' (' + s.join(', ') + ')' : ''));
  ok(await pg.evaluate(() => !!document.querySelector('#btn-live') && !document.querySelector('#btn-live').closest('[data-lrn]')), 'Live translate is not inside a hidden group');
  // flip the real switch in Settings
  await pg.evaluate(() => { const c = document.getElementById('in-learnmode'); c.checked = true; c.dispatchEvent(new Event('change', { bubbles: true })); });
  await pg.waitForTimeout(300);
  ok(await pg.evaluate(() => document.documentElement.hasAttribute('data-learn')), 'Learn mode on: data-learn is set');
  ok(await pg.evaluate(() => !document.querySelector('#tabbar .tab[data-tab="learn"]').hidden), 'Learn mode on: the Learn tab shows');
  s = await shown(); ok(s.length >= 3, 'Learn mode on: marked elements are available (' + s.length + ')');
  await pg.evaluate(() => { const c = document.getElementById('in-learnmode'); c.checked = false; c.dispatchEvent(new Event('change', { bubbles: true })); });
  await pg.waitForTimeout(300);
  s = await shown(); ok(s.length === 0 && !(await pg.evaluate(() => document.documentElement.hasAttribute('data-learn'))), 'switched back to Standard: hidden again, live');
  ok(await pg.evaluate(() => JSON.parse(localStorage.getItem('wt:prefs') || '{}').goal.learn === false), 'the choice is saved (Learn off), nothing deleted');
  ok(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs[0] : ''));
  await br.close(); console.log(bad ? '\n' + bad + ' failed' : '\nall passed'); process.exit(bad ? 1 : 0);
})();
