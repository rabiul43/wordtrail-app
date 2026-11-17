#!/usr/bin/env node
/* Checks for the live Listening rows on Learn (Task 5): node tools/learn_rows_check.js
   Part 1  LRW (src/js/169y-learn-rows.js, pure): the line under Listen and type and under Echo, singular and plural, Calm mode, no data, bad data, the ring.
   Part 2  No emoji left in the Listening screens (28c Echo sheet, 28d Listen and type sheet, their JS and the two tiles); every icon they use exists in the SVG sprite.
   Part 3  The real Learn hub (169b) and the real 169y in Chromium, with the rest stubbed: sprite icons drawn as <svg><use>, text icons still work, the ring and its
           screen-reader line, the "Today" pill, Calm mode hides rings and pills and shows the usual lines, a broken ring / plan / store never breaks the hub.
           (Skipped, with a message, when Playwright is not installed.)
   Exit code 1 if a check fails, 2 if a file cannot be loaded. */
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const root = path.join(__dirname, '..'), rd = f => fs.readFileSync(path.join(root, f), 'utf8');
const J = x => JSON.parse(JSON.stringify(x));
let pass = 0, fail = 0;
async function t(name, fn) { try { await fn(); pass++; console.log('ok    ' + name); } catch (e) { fail++; console.log('FAIL  ' + name + '\n        ' + String(e && e.message).split('\n').slice(0, 6).join('\n        ')); } }

let LRW, SRC169y;
try {
  SRC169y = rd('src/js/169y-learn-rows.js');
  const a = SRC169y.indexOf('/*LRW-START*/'), b = SRC169y.indexOf('/*LRW-END*/'); if (a < 0 || b < a) throw new Error('LRW markers missing');
  LRW = vm.runInContext(SRC169y.slice(a, b) + '\n({ GEN: LINES, FULL, listen, echo });', vm.createContext({}));
} catch (e) { console.error('learn_rows_check: cannot load: ' + e.message); process.exit(2); }

(async () => {
  /* ---------------- Part 1 ---------------- */
  await t('Listen and type: today\'s sets first, then the last set of this visit, then the usual line; singular and plural', () => {
    assert.strictEqual(LRW.listen({ today: 1 }).sub, '1 set today'); assert.strictEqual(LRW.listen({ today: 3 }).sub, '3 sets today');
    assert.strictEqual(LRW.listen({ last: { right: 7, total: 10 } }).sub, 'Last set: 7 of 10 right');
    assert.strictEqual(LRW.listen({ today: 2, last: { right: 7, total: 10 } }).sub, '2 sets today', 'today wins');
    assert.strictEqual(LRW.listen({}).sub, 'Type what you hear'); assert.strictEqual(LRW.listen().sub, 'Type what you hear');
    assert.strictEqual(LRW.listen({ last: { right: 12, total: 10 } }).sub, 'Last set: 10 of 10 right', 'right never above total');
    assert.strictEqual(LRW.listen({ last: { right: 0, total: 4 } }).sub, 'Last set: 0 of 4 right');
  });
  await t('Echo: today\'s practices, then the practice list, then takes this week, then the usual line', () => {
    assert.strictEqual(LRW.echo({ today: 1 }).sub, '1 practice today'); assert.strictEqual(LRW.echo({ today: 2 }).sub, '2 practices today');
    assert.strictEqual(LRW.echo({ list: 4 }).sub, '4 on your practice list'); assert.strictEqual(LRW.echo({ today: 1, list: 4, week: 9 }).sub, '1 practice today');
    assert.strictEqual(LRW.echo({ list: 4, week: 9 }).sub, '4 on your practice list');
    assert.strictEqual(LRW.echo({ week: 1 }).sub, '1 take this week'); assert.strictEqual(LRW.echo({ week: 6 }).sub, '6 takes this week');
    assert.strictEqual(LRW.echo({}).sub, 'Hear it, say it back'); assert.strictEqual(LRW.echo().sub, 'Hear it, say it back');
  });
  await t('Calm mode: the usual line and no ring, whatever the data says', () => {
    const big = { calm: true, today: 5, month: 9, last: { right: 9, total: 10 }, list: 3, week: 8 };
    assert.deepStrictEqual(J(LRW.listen(big)), { sub: 'Type what you hear', ring: null }); assert.deepStrictEqual(J(LRW.echo(big)), { sub: 'Hear it, say it back', ring: null });
    assert.notStrictEqual(LRW.listen({ calm: false, today: 5 }).sub, 'Type what you hear');
  });
  await t('the ring: this month\'s sessions out of 12; nothing for 0; capped at full; the label says it in words', () => {
    assert.strictEqual(LRW.listen({ month: 0 }).ring, null); assert.deepStrictEqual(J(LRW.listen({ month: 3 }).ring), { p: 25, label: '3 of 12 this month' });
    assert.deepStrictEqual(J(LRW.echo({ month: 12 }).ring), { p: 100, label: '12 of 12 this month' }); assert.deepStrictEqual(J(LRW.echo({ month: 40 }).ring), { p: 100, label: '12 of 12 this month' });
    assert.strictEqual(LRW.FULL, 12); assert.strictEqual(LRW.listen({ month: 1 }).ring.p, 8);
  });
  await t('bad data never throws and never shows a number that is not real', () => {
    const bad = [null, undefined, NaN, -3, 'x', {}, [], 0.4, Infinity, '7'];
    bad.forEach(v => {
      [{ today: v }, { month: v }, { last: v }, { last: { right: v, total: v } }, { list: v }, { week: v }, { calm: v }].forEach(s => {
        const a = LRW.listen(s), b = LRW.echo(s); assert.ok(typeof a.sub === 'string' && typeof b.sub === 'string');
        assert.ok(!/NaN|undefined|null|-|Infinity/.test(a.sub + b.sub), JSON.stringify(s) + ' -> ' + a.sub + ' / ' + b.sub);
      });
    });
    assert.strictEqual(LRW.listen({ today: 2.9 }).sub, '2 sets today');
  });

  /* ---------------- Part 2 ---------------- */
  const decode = s => s.replace(/&#x([0-9a-f]+);/gi, (m, x) => String.fromCodePoint(parseInt(x, 16))).replace(/&#(\d+);/g, (m, d) => String.fromCodePoint(+d))
    .replace(/\\u\{([0-9a-f]+)\}/gi, (m, x) => String.fromCodePoint(parseInt(x, 16))).replace(/\\\\?u([0-9a-f]{4})\\\\?u([0-9a-f]{4})/gi, (m, a, b) => String.fromCharCode(parseInt(a, 16), parseInt(b, 16))).replace(/\\\\?u([0-9a-f]{4})/gi, (m, x) => String.fromCharCode(parseInt(x, 16)));
  const OK = new Set(['✓', '✗', '★', '·', '…', '—', '–', '→', '←', '×', '“', '”', '‘', '’', '’', '•', '≈']);   // plain text marks, not emoji
  const emojiIn = (src) => Array.from(decode(src)).filter(c => !OK.has(c) && (/\p{Extended_Pictographic}/u.test(c) || /[\u21A9-\u21AA\u2190-\u21FF\u25A0-\u25FF\u2600-\u27BF\u2B00-\u2BFF]/.test(c)));
  await t('no emoji in the Listening screens: the Echo sheet, the Listen and type sheet, their JS and their tiles', () => {
    ['src/html/28c-sheet-echo.html', 'src/html/28d-sheet-listen-type.html', 'src/js/169h-echo-mode.js', 'src/js/169i-echo-recording.js', 'src/js/169j-echo-compare.js', 'src/js/169k-listen-type.js', 'src/js/169y-learn-rows.js']
      .forEach(f => { const bad = emojiIn(rd(f)); assert.deepStrictEqual(bad, [], f + ' still has: ' + bad.join(' ')); });
  });
  const sprite = new Set((rd('src/html/10-body-views.html').match(/<symbol id="(i-[a-z0-9-]+)"/g) || []).map(x => x.slice(12, -1)));
  await t('every sprite icon the Listening screens and tiles use exists in the sprite (and the new ones are there)', () => {
    ['i-m-speaker', 'i-m-turtle', 'i-m-flame', 'i-m-bulb', 'i-m-mic', 'i-m-rec', 'i-m-pen', 'i-play', 'i-m-refresh'].forEach(i => assert.ok(sprite.has(i), 'missing symbol ' + i));
    ['src/html/28c-sheet-echo.html', 'src/html/28d-sheet-listen-type.html'].forEach(f => (rd(f).match(/href="#(i-[a-z0-9-]+)"/g) || []).forEach(m => assert.ok(sprite.has(m.slice(7, -1)), f + ' uses ' + m)));
    ['src/js/169h-echo-mode.js', 'src/js/169k-listen-type.js'].forEach(f => (rd(f).match(/'#(i-[a-z0-9-]+)'/g) || []).forEach(m => assert.ok(sprite.has(m.slice(2, -1)), f + ' uses ' + m)));
    assert.ok(/id: 'echo'[^\n]*icon: '#i-m-mic'/.test(rd('src/js/169h-echo-mode.js'))); assert.ok(/id: 'listentype'[^\n]*icon: '#i-m-pen'/.test(rd('src/js/169k-listen-type.js')));
    const dup = (rd('src/html/10-body-views.html').match(/<symbol id="i-[a-z0-9-]+"/g) || []); assert.strictEqual(new Set(dup).size, dup.length, 'a symbol id is declared twice');
  });
  await t('the file follows the project rules: no network, no timers, no storage of its own, build line before the learn screen', () => {
    assert.ok(!/fetch\(|XMLHttpRequest|sendBeacon|setInterval|setTimeout|localStorage|store\.set/.test(SRC169y), 'reads only');
    const b = rd('build.py'); assert.strictEqual(b.split('src/js/169y-learn-rows.js').length - 1, 1); assert.ok(b.indexOf('169y-learn-rows.js') > b.indexOf('169k-listen-type.js') && b.indexOf('169y-learn-rows.js') < b.indexOf('169w-learn-screen.js'));
  });

  /* ---------------- Part 3 ---------------- */
  let chromium; try { ({ chromium } = require('playwright')); } catch (e) { console.log('skip browser part: playwright is not installed'); }
  if (chromium) {
    const css = ['10-base-layout', '94-learn-ui', '20-home-library', '94h-learn-hub'].map(f => rd('src/css/' + f + '.css')).join('\n');
    const sp = rd('src/html/10-body-views.html'), sprite = sp.slice(sp.indexOf('<svg width="0"'), sp.indexOf('</svg>', sp.indexOf('<svg width="0"')) + 6);
    const iec = (s => s.slice(s.indexOf('/* IEC-START */'), s.indexOf('/* IEC-END */')))(rd('src/js/169o-ielts-hub.js'));
    const html = `<!doctype html><meta charset=utf-8><html data-theme="dark"><head><style>${css}\nbody{margin:0;background:var(--bg);color:var(--ink);font-family:var(--font-ui)}</style></head><body>${sprite}<div id="shelf-learn"></div>
<script>
window.run = new Function('h', 'LSW', 'WS', 'vocOpen', 'RL', '$', 'applyShelfMode', 'toast', 'P', 'store', 'LN', 'ECX', 'ECM', 'REG', ${JSON.stringify(rd('src/js/169b-learn-hub.js') + '\nREG(LearnHub);   // the real app registers Echo and Listen and type here, before 169y runs\n' + iec + '\n' + SRC169y + '\nreturn { LearnHub, IEC };')});
window.mk = (o) => {
  const h = (tag, props, ...kids) => { const el = document.createElement(tag); Object.entries(props || {}).forEach(([k, v]) => { if (k === 'class') el.className = v; else el.setAttribute(k, v); }); kids.flat().forEach(c => { if (c == null || c === '') return; el.append(c.nodeType ? c : document.createTextNode(String(c))); }); return el; };
  const day = (() => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); })();
  const log = o.log === undefined ? { [day]: { l: 2, s: 1 } } : o.log;
  const P = { calm: !!o.calm };
  const store = { get: (k, d) => { if (o.storeThrows) throw new Error('blocked'); return k === 'wt:ielts' ? log : d; } };
  const LN = { last: () => (o.last === undefined ? { res: [{ v: 'ok' }, { v: 'ok' }, { v: 'near' }, { v: 'no' }] } : o.last) };
  const ECX = o.noEcho ? undefined : { history: () => { if (o.echoThrows) throw new Error('x'); return o.hist || { days: {}, pl: [] }; } };
  const ECM = { weekCount: (hh) => Object.values(hh.days).reduce((a, b) => a + b, 0) };
  const LSW = { render() {}, dueN: () => 0 };
  const api = window.run(h, LSW, { all: () => [] }, () => {}, { start: () => true }, (s) => document.querySelector(s), () => {}, () => {}, P, store, LN, ECX, ECM, window.regTiles);
  return api;
};
window.reg = api => api.LearnHub;
window.regTiles = L => {
  L.register({ id: 'echo', order: 40, icon: '#i-m-mic', title: 'Echo', subtitle: 'Hear it, say it back', open() {} });
  L.register({ id: 'listentype', order: 50, icon: '#i-m-pen', title: 'Listen and type', subtitle: 'Type what you hear', open() {} });
  L.register({ id: 'txt', order: 5, icon: '★', title: 'Text icon', subtitle: 'plain', open() {} });
};
</script></body></html>`;
    let browser; try { browser = await chromium.launch({ channel: 'chrome' }).catch(() => chromium.launch()); } catch (e) { console.error('learn_rows_check: no browser: ' + e.message); process.exit(2); }
    const open = async () => {
      const pg = await browser.newPage({ viewport: { width: 390, height: 780 } }), errs = []; pg.on('pageerror', e => errs.push(e.message)); pg.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
      await pg.route('http://localhost/**', r => r.fulfill({ status: 200, contentType: 'text/html', body: html })); await pg.goto('http://localhost/'); return { pg, errs };
    };
    const draw = (pg, o, post) => pg.evaluate(([o, post]) => {
      const api = window.mk(o), L = window.reg(api); if (post) new Function('L', post)(L);
      const host = document.getElementById('shelf-learn'); host.textContent = ''; L.draw(host);
      const tile = id => { const b = host.querySelector('[data-tile="' + id + '"]'); if (!b) return null;
        const ic = b.querySelector('.lhub-ic'), use = ic && ic.querySelector('svg use'), ring = b.querySelector('.lhub-ring'), pill = b.querySelector('.lhub-today');
        return { title: b.querySelector('.lhub-title').textContent, sub: b.querySelector('.lhub-sub').textContent, icText: ic ? ic.textContent : null, href: use ? use.getAttribute('href') : null, symbol: use ? !!document.getElementById(use.getAttribute('href').slice(1)) : null,
          ring: ring ? ring.getAttribute('style') : null, ringShown: ring ? getComputedStyle(ring).display !== 'none' : null, sr: (b.querySelector('.sr-only') || {}).textContent || '', pill: pill ? pill.textContent : null, pillShown: pill ? getComputedStyle(pill).display !== 'none' : null }; };
      return { echo: tile('echo'), lt: tile('listentype'), txt: tile('txt'), n: host.querySelectorAll('[data-tile]').length };
    }, [o, post || '']);
    try {
      await t('hub: a sprite icon is drawn as <svg><use> (and the symbol exists); a text icon still works; both rows show the usual lines with no data', async () => {
        const { pg, errs } = await open();
        try {
          const r = await draw(pg, { log: {}, last: null, noEcho: true });
          assert.strictEqual(r.lt.href, '#i-m-pen'); assert.strictEqual(r.lt.symbol, true); assert.strictEqual(r.lt.icText, ''); assert.strictEqual(r.echo.href, '#i-m-mic'); assert.strictEqual(r.echo.symbol, true);
          assert.strictEqual(r.txt.icText, '★'); assert.strictEqual(r.txt.href, null);
          assert.strictEqual(r.lt.sub, 'Type what you hear'); assert.strictEqual(r.echo.sub, 'Hear it, say it back'); assert.strictEqual(r.lt.ring, null); assert.strictEqual(r.echo.ring, null);
          assert.deepStrictEqual(errs, []);
        } finally { await pg.close(); }
      });
      await t('hub: real state: sets today and a ring on Listen and type; practices today on Echo; the ring has a screen-reader line', async () => {
        const { pg, errs } = await open();
        try {
          const day = await pg.evaluate(() => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); });
          const r = await draw(pg, { log: { [day]: { l: 2, s: 1 } } });
          assert.strictEqual(r.lt.sub, '2 sets today'); assert.strictEqual(r.echo.sub, '1 practice today');
          assert.ok(/--wl-p:\s*17\.0%/.test(r.lt.ring), r.lt.ring); assert.strictEqual(r.lt.sr, '2 of 12 this month'); assert.ok(/--wl-p:\s*8\.0%/.test(r.echo.ring), r.echo.ring); assert.strictEqual(r.echo.sr, '1 of 12 this month');
          assert.strictEqual(r.lt.ringShown, true);
          const r2 = await draw(pg, { log: {}, last: { res: [{ v: 'ok' }, { v: 'ok' }, { v: 'near' }, { v: 'no' }] }, hist: { days: { x: 4, y: 2 }, pl: [] } });
          assert.strictEqual(r2.lt.sub, 'Last set: 2 of 4 right'); assert.strictEqual(r2.echo.sub, '6 takes this week'); assert.strictEqual(r2.lt.ring, null);
          const r3 = await draw(pg, { log: {}, hist: { days: { x: 4 }, pl: [{}, {}, {}] } }); assert.strictEqual(r3.echo.sub, '3 on your practice list');
          assert.deepStrictEqual(errs, []);
        } finally { await pg.close(); }
      });
      await t('hub: Calm mode shows the usual lines, no ring and no pill', async () => {
        const { pg, errs } = await open();
        try {
          const day = await pg.evaluate(() => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); });
          await pg.evaluate(() => { document.documentElement.setAttribute('data-calm', ''); });
          const r = await draw(pg, { calm: true, log: { [day]: { l: 3, s: 2 } } }, "L.today(() => ['listentype', 'echo']);");
          assert.strictEqual(r.lt.sub, 'Type what you hear'); assert.strictEqual(r.echo.sub, 'Hear it, say it back'); assert.strictEqual(r.lt.ring, null); assert.strictEqual(r.echo.ring, null);
          assert.strictEqual(r.lt.pillShown, false, 'the Today pill is hidden by Calm CSS'); assert.deepStrictEqual(errs, []);
          await pg.evaluate(() => { document.documentElement.removeAttribute('data-calm'); });
          const c = await draw(pg, { calm: false, log: { [day]: { l: 1 } } }, "L.patch('txt', { ring: () => ({ p: 50, label: '6 of 12 this month' }) }); L.today(() => ['txt']);");
          await pg.evaluate(() => { document.documentElement.setAttribute('data-calm', ''); });
          const d = await pg.evaluate(() => { const b = document.querySelector('[data-tile="txt"]'); return { ring: b.querySelector('.lhub-ring') ? getComputedStyle(b.querySelector('.lhub-ring')).display : 'none', pill: b.querySelector('.lhub-today') ? getComputedStyle(b.querySelector('.lhub-today')).display : 'none' }; });
          assert.strictEqual(c.txt.ring !== null, true, 'drawn when not calm'); assert.strictEqual(d.ring, 'none'); assert.strictEqual(d.pill, 'none');
        } finally { await pg.close(); }
      });
      await t('hub: the Today pill is only on the tiles the plan lists; LearnHub.patch changes a tile and leaves open/title alone; unknown id = false', async () => {
        const { pg, errs } = await open();
        try {
          const r = await draw(pg, { log: {} }, "L.today(() => ['echo', 'nothing-here']);");
          assert.strictEqual(r.echo.pill, 'Today'); assert.strictEqual(r.lt.pill, null); assert.strictEqual(r.txt.pill, null);
          const p = await pg.evaluate(() => { const api = window.mk({ log: {} }), L = window.reg(api); return [L.patch('txt', { subtitle: 'changed', icon: '#i-m-speaker' }), L.patch('nope', { subtitle: 'x' }), L.patch('txt', null), L.list().find(x => x.id === 'txt').title, typeof L.list().find(x => x.id === 'txt').open]; });
          assert.deepStrictEqual(p, [true, false, false, 'Text icon', 'function']); assert.deepStrictEqual(errs, []);
        } finally { await pg.close(); }
      });
      await t('hub: a broken ring, plan, store, history or LN.last never breaks the hub or the other tiles', async () => {
        const { pg, errs } = await open();
        try {
          let r = await draw(pg, { storeThrows: true, echoThrows: true, last: undefined }, "L.patch('txt', { ring: () => { throw new Error('ring'); } }); L.today(() => { throw new Error('plan'); }); L.today(() => 5);");
          assert.strictEqual(r.n, 8 > 0 ? r.n : 0); assert.ok(r.n >= 5, 'all tiles drawn: ' + r.n); assert.strictEqual(r.lt.sub.startsWith('Last set') || r.lt.sub === 'Type what you hear', true); assert.strictEqual(r.echo.sub, 'Hear it, say it back'); assert.strictEqual(r.txt.ring, null);
          r = await draw(pg, { log: 'garbage', last: { res: 'x' }, hist: { days: 5, pl: 'x' } }); assert.strictEqual(r.lt.sub, 'Type what you hear'); assert.strictEqual(r.echo.sub, 'Hear it, say it back');
          r = await draw(pg, { log: {}, last: null }, "L.patch('listentype', { ring: () => ({ p: NaN, label: 'x' }) }); L.patch('echo', { ring: () => ({ p: 400, label: 'big' }) });");
          assert.strictEqual(r.lt.ring, null, 'NaN ring not drawn'); assert.ok(/--wl-p:\s*100\.0%/.test(r.echo.ring), r.echo.ring);
          assert.deepStrictEqual(errs, []);
        } finally { await pg.close(); }
      });
    } finally { await browser.close(); }
  }

  console.log('\n' + (pass + fail) + ' checks, ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
