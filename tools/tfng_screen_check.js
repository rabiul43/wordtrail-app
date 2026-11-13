#!/usr/bin/env node
/* Checks for True / False / Not Given: the pack loader (167h), the screen (169u) and the Learn hub hook (169b), Task 61.
   Part 1 (always): the pure functions of 167h (TFC) on the real sample pack. Part 2 (real Chromium via Playwright, a stand-in page with the REAL css, the REAL
   160c, 167h, 169u and the real LearnHub code of 169b; the data host is faked, so nothing leaves the machine): tile hidden without a pack and shown with one,
   sample pack refused without the developer switch, intro on first use, a full set by tapping, the panel, Show in text, contrast of the lit line in four
   themes, spoiler rule, Back/Escape. It cannot test the real reader, the real Learn hub page or real touch.
     node tools/tfng_screen_check.js [--shot dir]      Exit code 1 if a check fails; without a browser part 1 still runs and the browser checks are reported as NOT RUN. */
const fs = require('fs'), path = require('path'), zlib = require('zlib'), assert = require('assert');
const root = path.join(__dirname, '..'), read = f => fs.readFileSync(path.join(root, f), 'utf8');
const shotDir = process.argv.includes('--shot') ? process.argv[process.argv.indexOf('--shot') + 1] : '';
let pass = 0, fail = 0, skipped = 0;
const t = async (name, fn) => { try { await fn(); pass++; console.log('ok    ' + name); } catch (e) { fail++; console.log('FAIL  ' + name + '\n        ' + String(e && e.stack || e).split('\n').slice(0, 5).join('\n        ')); } };
const fnv = s => { let x = 0x811c9dc5; for (let i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 0x01000193); } return (x >>> 0).toString(36) + '.' + s.length.toString(36); };

const sampleGz = fs.readFileSync(path.join(root, 'packs', 'sample.p1.tfng.json.gz')), sampleIdx = fs.readFileSync(path.join(root, 'packs', 'sample.tfng-index.json'));
const sample = JSON.parse(zlib.gunzipSync(sampleGz).toString('utf8'));
const src167 = read('src/js/167h-tfng-pack.js');
const TFC = new Function(src167.slice(src167.indexOf('/*TFC-START*/'), src167.indexOf('/*TFC-END*/')) + '\nreturn { parse, parseIndex, where, nearest, mixed, judge };')();
const clone = o => JSON.parse(JSON.stringify(o));
// a "published" pack for a stand-in book 7: the sample's lines are made sentences of chapter 2 of that book
const real = clone(sample); delete real.sample; real.book = '7'; real.passage = 'c2'; real.reviewed = { by: 'Test Person', on: '2026-11-14' };
const SENTS = [{ t: 'Filler before.', h: false, ch: 0 }, { t: 'A heading', h: true, ch: 1 }, ...real.lines.map(l => ({ t: l[1], h: false, ch: 2 })), { t: 'Filler after.', h: false, ch: 3 }];
const realIdx = { format: 'wordtrail-tfng-index', v: 1, book: '7', passages: [{ id: 'c2', n: 9 }] };

(async () => {
  // ---------- part 1: pure ----------
  await t('the sample pack parses only with the sample switch', () => {
    assert.strictEqual(TFC.parse(sample, 'sample', 'p1').why, 'sample pack');
    const r = TFC.parse(sample, 'sample', 'p1', { sample: true });
    assert.ok(r.ok && r.items.length === 9 && r.lines.length === 10 && r.meta.sample === true);
  });
  await t('a published pack needs a named reviewer; another version, key, book or passage is refused', () => {
    assert.ok(TFC.parse(real, '7', 'c2').ok);
    const bad = (mut, why) => { const j = clone(real); mut(j); assert.strictEqual(TFC.parse(j, '7', 'c2').why, why); };
    bad(j => { delete j.reviewed; }, 'not reviewed'); bad(j => { j.reviewed = { by: 'none' }; }, 'not reviewed');
    bad(j => { j.v = 2; }, 'version'); bad(j => { j.key = 'x'; }, 'key'); bad(j => { j.book = '8'; }, 'book or passage'); bad(j => { j.format = 'x'; }, 'not a pack');
    assert.strictEqual(TFC.parse(real, '7', 'c3').why, 'book or passage');
  });
  await t('only approved, valid items are used (r 0, bad sup, NG with a line, repeats are left out)', () => {
    const j = clone(real); j.items[0].r = 0; j.items[1].sup = [11]; j.items[8].sup = [2]; j.items.push(clone(j.items[2]));
    const r = TFC.parse(j, '7', 'c2'); assert.ok(r.ok); assert.strictEqual(r.items.length, 6);
    const j2 = clone(real); j2.items.forEach((x, i) => { if (i > 1) x.r = 0; }); assert.strictEqual(TFC.parse(j2, '7', 'c2').why, 'few items');
  });
  await t('index: ids are checked, bad ones left out', () => {
    assert.deepStrictEqual(TFC.parseIndex(JSON.parse(sampleIdx), 'sample'), ['p1']);
    assert.strictEqual(TFC.parseIndex(JSON.parse(sampleIdx), 'other'), null);
    assert.deepStrictEqual(TFC.parseIndex({ format: 'wordtrail-tfng-index', v: 1, book: '7', passages: [{ id: '../x' }, { id: 'a1' }, { id: 'a1' }] }, '7'), ['a1']);
    assert.strictEqual(TFC.parseIndex({ format: 'wordtrail-tfng-index', v: 2, book: '7', passages: [{ id: 'a' }] }, '7'), null);
  });
  await t('where: finds the passage in the book, gives its last chapter, refuses another edition', () => {
    const w = TFC.where(real.lines, SENTS, fnv); assert.deepStrictEqual([w.n, w.ch, w.ok], [10, 2, true]);
    const half = TFC.where(real.lines, SENTS.slice(0, 7), fnv); assert.strictEqual(half.n, 5); assert.ok(half.ok);
    assert.ok(!TFC.where(real.lines, [{ t: 'Something else entirely.', h: false, ch: 0 }], fnv).ok);
    assert.ok(!TFC.where(real.lines, null, fnv).ok);
  });
  await t('nearest: the closest line for a Not Given statement (water / ponds and streams -> line 5)', () => {
    assert.strictEqual(TFC.nearest('Bees prefer to collect water from clean streams rather than from ponds.', real.lines), 4);
    assert.strictEqual(TFC.nearest('Zebras gallop quickly.', real.lines), -1);
  });
  await t('mixed: up to 8, a mix of T, F and NG, no repeats, never more than there are', () => {
    const items = TFC.parse(real, '7', 'c2').items;
    let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const m = TFC.mixed(items, 8, rnd); assert.strictEqual(m.length, 8); assert.strictEqual(new Set(m.map(x => x.id)).size, 8);
    ['T', 'F', 'NG'].forEach(a => assert.ok(m.filter(x => x.a === a).length >= 2, 'at least 2 of ' + a));
    assert.strictEqual(TFC.mixed(items, 20, rnd).length, 9);
  });
  await t('judge', () => { assert.ok(TFC.judge({ a: 'NG' }, 'NG')); assert.ok(!TFC.judge({ a: 'NG' }, 'T')); assert.ok(!TFC.judge({ a: 'T' }, 'x')); });
  await t('no live AI in the app files: no api key, no anthropic or openai host, no fetch other than fetchText', () => {
    for (const f of ['src/js/167h-tfng-pack.js', 'src/js/169u-tfng-screen.js']) { const s = read(f); assert.ok(!/api[_-]?key|anthropic|openai|generativelanguage|huggingface\.co\/api|XMLHttpRequest|\bfetch\(/i.test(s), f); }
  });

  // ---------- part 2: Chromium ----------
  let chromium, br;
  try { ({ chromium } = require('playwright')); br = await chromium.launch(); } catch (e) { console.log('NOT RUN: the browser checks (' + String(e.message).split('\n')[0] + ')'); skipped = 1; }
  if (br) {
    const srOnly = read('src/css/20-home-library.css').split('\n').find(l => l.startsWith('.sr-only ')) || '';   // the app's own .sr-only rule
    const css = srOnly + '\n' + ['src/css/10-base-layout.css', 'src/css/94-learn-ui.css', 'src/css/94f-review-lesson.css', 'src/css/94m-questions.css', 'src/css/94zb-tfng.css'].map(read).join('\n');
    const hub = read('src/js/169b-learn-hub.js'); const hubCode = hub.slice(hub.indexOf('const LearnHub = (() => {'), hub.indexOf('LSW.render = LearnHub.draw;') + 'LSW.render = LearnHub.draw;'.length);
    const page = (o) => `<!doctype html><html data-theme="dark"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style></head><body><div id="shelf-learn" hidden></div>
<script>
const h = (tag, attrs, ...kids) => { const e = document.createElement(tag); Object.keys(attrs || {}).forEach(k => { if (k === 'class') e.className = attrs[k]; else if (k.startsWith('on')) e.addEventListener(k.slice(2), attrs[k]); else if (k === 'hidden') e.hidden = !!attrs[k]; else e.setAttribute(k, attrs[k]); }); kids.forEach(x => { if (x != null && x !== '' && x !== false) e.append(x); }); return e; };
window.__logs = []; window.__toasts = []; window.__refresh = 0; window.__asked = [];
const P = { calm: false }, toast = m => window.__toasts.push(m), histSoon = () => {}, PG = { model: () => ({ streak: 5 }) }, IE = { log: s => window.__logs.push(s) };
const $ = () => ({ hidden: false }), applyShelfMode = () => { window.__refresh++; }, LSW = { render() {} };
const S = { book: ${o.book ? "{ id: 7, title: 'Test book' }" : 'null'}, model: { sents: ${JSON.stringify(SENTS)} }, lp: {}, map: [], span: [], curId: 0 };
const QG = { furthest: () => window.__far };
window.__far = ${o.far == null ? 2 : o.far};
const TP = { fnv: ${fnv.toString()}, register() {} };
const files = ${JSON.stringify(Object.fromEntries(Object.entries(o.files || {}).map(([k, v]) => [k, Buffer.from(v).toString('base64')])))};
const idbm = new Map(), idb = { get: async k => idbm.get(k), set: async (k, v) => { idbm.set(k, v); } };
const fetchText = async name => { window.__asked.push(name); const b = files[name]; if (!b) return null; const u8 = Uint8Array.from(atob(b), c => c.charCodeAt(0)); return { ok: true, arrayBuffer: async () => u8.buffer }; };
${hubCode}
${read('src/js/160c-translate-pack.js')}
${src167}
${read('src/js/169u-tfng-screen.js')}
window.TFS = TFS; window.TFK = TFK; window.LearnHub = LearnHub; window.__idb = idbm; window.__ready = 1;
</script></body></html>`;
    const open = async (o, url) => {
      const ctx = await br.newContext({ viewport: { width: 390, height: 844 } }), pg = await ctx.newPage(), errs = []; pg.__errs = errs;
      pg.on('pageerror', e => errs.push(String(e))); pg.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
      await pg.route('http://tfng.test/**', r => r.fulfill({ contentType: 'text/html', body: page(o) }));
      await pg.goto('http://tfng.test/' + (url || '')); await pg.waitForFunction('window.__ready'); return pg;
    };
    const shot = async (pg, n) => { if (shotDir) { fs.mkdirSync(shotDir, { recursive: true }); await pg.screenshot({ path: path.join(shotDir, n + '.png') }); } };
    const settle = pg => pg.waitForTimeout(250);
    const answers = new Map(sample.items.map(i => [i.st, i])), lab = { T: 'True', F: 'False', NG: 'Not Given' };

    // --- no pack: hidden ---
    let pg = await open({ book: true, files: {} });
    await t('no pack: the tile is hidden, nothing is shown to the person, and the lookup is made once', async () => {
      assert.strictEqual(await pg.evaluate(() => LearnHub.list().some(x => x.id === 'tfng')), true, 'registered');
      assert.strictEqual(await pg.evaluate(() => LearnHub.shown().some(x => x.id === 'tfng')), false); await settle(pg);
      assert.strictEqual(await pg.evaluate(() => LearnHub.shown().some(x => x.id === 'tfng')), false);
      assert.strictEqual(await pg.evaluate(() => window.__refresh), 0, 'no redraw when there is no pack');
      assert.deepStrictEqual(await pg.evaluate(() => window.__asked), ['packs/7.tfng-index.json'], 'one request for the index, none for passages');
    });
    await t('no pack: starting it says so and opens nothing', async () => {
      assert.strictEqual(await pg.evaluate(() => window.TFS.start({})), false);
      assert.ok((await pg.evaluate(() => window.__toasts)).some(m => /No True \/ False \/ Not Given practice/.test(m)));
      assert.strictEqual(await pg.locator('.rl.tf:not([hidden])').count(), 0); assert.strictEqual(await pg.evaluate(() => window.TFS.on), false);
    });
    await t('no book open: the tile is hidden and start asks to open a book', async () => {
      const p2 = await open({ book: false, files: {} });
      assert.strictEqual(await p2.evaluate(() => LearnHub.shown().some(x => x.id === 'tfng')), false);
      assert.strictEqual(await p2.evaluate(() => window.TFS.start({})), false); assert.ok((await p2.evaluate(() => window.__toasts))[0].includes('Open a book')); await p2.context().close();
    });
    await pg.context().close();

    // --- a sample pack without the switch is refused ---
    pg = await open({ book: true, files: { 'packs/7.tfng-index.json': JSON.stringify({ format: 'wordtrail-tfng-index', v: 1, book: '7', passages: [{ id: 'p1' }] }), 'packs/7.p1.tfng.json.gz': zlib.gzipSync(JSON.stringify(Object.assign(clone(sample), { book: '7' }))) } });
    await t('a pack marked sample is never used without the developer switch', async () => {
      await pg.evaluate(() => LearnHub.shown()); await settle(pg);
      assert.strictEqual(await pg.evaluate(() => window.TFS.start({})), false); assert.strictEqual(await pg.evaluate(() => window.TFS.on), false);
      assert.strictEqual(await pg.evaluate(async () => (await TFK.passages('7', { sents: S.model.sents, far: 2 })).length), 0);
    });
    await pg.context().close();

    // --- a real (reviewed) pack for the book: shown, spoiler rule, mismatch ---
    const realFiles = { 'packs/7.tfng-index.json': JSON.stringify(realIdx), 'packs/7.c2.tfng.json.gz': zlib.gzipSync(JSON.stringify(real)) };
    pg = await open({ book: true, files: realFiles, far: 1 });
    await t('spoiler rule: a passage of chapter 2 is not offered to someone who reached chapter 1; offered after chapter 2', async () => {
      await pg.evaluate(() => LearnHub.shown()); await settle(pg);
      assert.strictEqual(await pg.evaluate(() => LearnHub.shown().some(x => x.id === 'tfng')), true, 'tile is shown once the book has a pack');
      assert.strictEqual(await pg.evaluate(() => window.TFS.start({})), false);
      assert.ok((await pg.evaluate(() => window.__toasts)).some(m => /chapters you have reached/.test(m)));
      await pg.evaluate(() => { window.__far = 2; });
      assert.strictEqual(await pg.evaluate(() => window.TFS.start({})), true); await pg.waitForSelector('.rl.tf:not([hidden])');
      assert.ok(await pg.locator('#tf-title').count() > 0); await pg.evaluate(() => window.TFS.close());
    });
    await t('the hub is told when the pack is found (redraw), so the tile appears without reopening', async () => { assert.ok(await pg.evaluate(() => window.__refresh) >= 1); });
    await t('saved copies are kept for offline use (index and passage)', async () => {
      const k = await pg.evaluate(() => [...window.__idb.keys()]); assert.ok(k.includes('tfng:7') && k.includes('tfngp:7|c2'), k.join());
      const o = await pg.evaluate(async () => { window.__files_off = 1; return (await TFK.passages('7', { sents: S.model.sents, far: 2 })).length; }); assert.strictEqual(o, 1);
    });
    await pg.context().close();
    pg = await open({ book: true, files: realFiles, far: 3 });
    await t('a pack that does not match the book text (another edition) is not used', async () => {
      await pg.evaluate(() => { S.model.sents.splice(2, 10); });
      assert.strictEqual(await pg.evaluate(() => window.TFS.start({})), false);
      assert.ok(!(await pg.evaluate(() => window.TFS.on)));
    });
    await pg.context().close();

    // --- the sample pack with the developer switch: the whole screen ---
    pg = await open({ book: true, files: { 'packs/sample.tfng-index.json': sampleIdx, 'packs/sample.p1.tfng.json.gz': sampleGz } }, '?tfngsample=1');
    await t('sample pack: the tile appears (the lookup is made once) and opens a set', async () => {
      assert.strictEqual(await pg.evaluate(() => LearnHub.shown().some(x => x.id === 'tfng')), false); await settle(pg);
      assert.strictEqual(await pg.evaluate(() => LearnHub.shown().some(x => x.id === 'tfng')), true);
      assert.deepStrictEqual(await pg.evaluate(() => window.__asked), ['packs/sample.tfng-index.json']);
      assert.strictEqual(await pg.evaluate(() => window.TFS.start({})), true); await pg.waitForSelector('.rl.tf:not([hidden])');
    });
    await t('first use: a plain-words card explains True, False and Not Given with an example, before any statement', async () => {
      const txt = await pg.locator('.rl.tf').innerText();
      for (const s of ['Before you start', 'NOT GIVEN', "doesn't say it, either way", 'Maria walked to school with her brother', 'never mentions a brother']) assert.ok(txt.includes(s), 'missing: ' + s);
      assert.strictEqual(await pg.locator('.tf-opt').count(), 0, 'no statement yet'); await shot(pg, '0-intro');
      await pg.locator('.rl__foot button', { hasText: 'Got it' }).click();
      assert.strictEqual(await pg.evaluate(() => localStorage.getItem('wt:tfngintro')), '1');
    });
    await t('question: numbered passage, statement, three big answers, thick bar, streak chip; no Check button', async () => {
      assert.strictEqual(await pg.locator('.tf-line').count(), 10); assert.strictEqual(await pg.locator('.tf-n').first().innerText(), '1');
      assert.deepStrictEqual(await pg.locator('.tf-opt').allInnerTexts(), ['TRUE', 'FALSE', 'NOT GIVEN']);
      assert.ok(answers.has(await pg.locator('.tf-st').innerText())); assert.strictEqual(await pg.locator('.rl__foot button').count(), 0);
      assert.ok((await pg.locator('.qs__chip').first().innerText()).includes('5')); assert.strictEqual(await pg.locator('.tf-line.is-hit, .tf-line.is-near').count(), 0);
      assert.strictEqual(await pg.locator('.wl-progress').getAttribute('aria-valuenow'), '0'); await shot(pg, '1-question');
    });
    const cur = async () => answers.get(await pg.locator('.tf-st').innerText());
    const tap = async a => pg.locator('.tf-opt[data-a="' + a + '"]').click();
    let sawNG = false, sawTF = false, doneCount = 0;
    await t('a right answer: green with a tick, "Correct: ...", the pack\'s reason, the one-line rule; T and F light the supporting line(s) at once', async () => {
      for (let guard = 0; guard < 12 && !(sawNG && sawTF); guard++) {
        const it = await cur(); await tap(it.a);
        assert.strictEqual(await pg.locator('.tf-opt.is-correct').count(), 1); assert.ok((await pg.locator('.tf-opt.is-correct').innerText()).includes('\u2714'));
        assert.strictEqual(await pg.locator('.tf-opt.is-wrong').count(), 0);
        const title = await pg.locator('.wl-panel__title').innerText(); assert.strictEqual(title, 'Correct: ' + lab[it.a]);
        const body = await pg.locator('.wl-panel').innerText(); assert.ok(body.includes(it.why), 'reason shown'); 
        assert.ok(body.includes({ T: 'The text says the same thing.', F: 'The text says the opposite.', NG: "If the text doesn't say it, the answer is Not Given." }[it.a]));
        const pb = await pg.locator('.wl-panel').boundingBox(), sb = await pg.locator('.tf-st').boundingBox(); assert.ok(sb.y >= 0 && sb.y + sb.height <= pb.y + 1, 'the whole statement stays above the panel (' + it.a + ')');
        if (it.a === 'NG') {
          sawNG = true; assert.strictEqual(await pg.locator('.tf-line.is-hit').count(), 0, 'nothing says it, so nothing is lit');
          await pg.locator('.tf-show').click(); assert.strictEqual(await pg.locator('.tf-line.is-near').count(), 1);
          assert.ok(await pg.locator('.tf-more').isVisible()); assert.ok((await pg.locator('.tf-more').innerText()).includes('does not say this'));
          await shot(pg, '3-notgiven');
          assert.ok(await pg.locator('.tf-line.is-near .sr-only').innerText() === 'Closest line'); await shot(pg, '3-notgiven');
        } else {
          sawTF = true; assert.strictEqual(await pg.locator('.tf-line.is-hit').count(), it.sup.length);
          const nums = await pg.locator('.tf-line.is-hit .tf-n').allInnerTexts(); assert.deepStrictEqual(nums.map(Number), it.sup);
          assert.ok(await pg.locator('.tf-show').isVisible()); await pg.locator('.tf-show').click(); assert.strictEqual(await pg.locator('.tf-show').getAttribute('aria-pressed'), 'true'); await shot(pg, '2-correct');
        }
        const b = await pg.locator('.rl__foot button', { hasText: /Continue|Finish/ }).boundingBox(); assert.ok(b && b.y >= 0 && b.y + b.height <= 844, 'Continue is on the screen');
        doneCount++; await pg.locator('.rl__foot button', { hasText: /Continue|Finish/ }).click();
      }
      assert.ok(sawNG && sawTF);
    });
    await t('a wrong answer: calm "Not quite. The answer is ...", only the wrong pick is red, the right one is marked, still the reason', async () => {
      const it = await cur(), wrong = ['T', 'F', 'NG'].find(a => a !== it.a); await tap(wrong); doneCount++;
      assert.strictEqual(await pg.locator('.tf-opt.is-wrong').count(), 1); assert.strictEqual(await pg.locator('.tf-opt.is-correct').count(), 1);
      assert.strictEqual(await pg.locator('.wl-panel__title').innerText(), 'Not quite. The answer is ' + lab[it.a] + '.'); assert.ok((await pg.locator('.wl-panel').innerText()).includes(it.why));
      assert.ok(await pg.locator('.wl-panel--bad').count() === 1); assert.ok(!/lives|score|leader/i.test(await pg.locator('.rl.tf').innerText()));
      await tap(it.a).catch(() => {});   // a second tap does nothing
      assert.strictEqual(await pg.locator('.wl-panel__title').count(), 1); await shot(pg, '4-wrong');
      await pg.locator('.rl__foot button', { hasText: /Continue|Finish/ }).click();
    });
    await t('the lit line has enough contrast in dark, light, sepia and contrast themes (4.5:1 for its text)', async () => {
      const it = await cur(); await tap(it.a);
      await pg.evaluate(() => { const l = document.querySelectorAll('.tf-line'); l.forEach(x => x.classList.remove('is-hit', 'is-near')); l[0].classList.add('is-hit'); l[1].classList.add('is-near'); });   // both kinds of lit line, whatever the statement was
      for (const [th, kind] of ['dark', 'light', 'sepia', 'contrast'].flatMap(x => [[x, 'is-hit'], [x, 'is-near']])) {
        const r = await pg.evaluate(([th, kind]) => {
          document.documentElement.setAttribute('data-theme', th);
          const el = document.querySelector('.tf-line.' + kind); if (!el) return null;
          const rgba = c => { const m = c.match(/[\d.]+/g).map(Number); return { r: m[0], g: m[1], b: m[2], a: m.length > 3 ? m[3] : 1 }; };
          let bg = { r: 255, g: 255, b: 255, a: 1 }; const chain = []; for (let n = el; n; n = n.parentElement) chain.push(rgba(getComputedStyle(n).backgroundColor));
          for (const c of chain.reverse()) if (c.a > 0) bg = { r: c.r * c.a + bg.r * (1 - c.a), g: c.g * c.a + bg.g * (1 - c.a), b: c.b * c.a + bg.b * (1 - c.a), a: 1 };
          const fg = rgba(getComputedStyle(el.querySelector('.tf-t')).color), lum = c => { const f = v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }; return .2126 * f(c.r) + .7152 * f(c.g) + .0722 * f(c.b); };
          const a = lum(fg), b = lum(bg); return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
        }, [th, kind]);
        assert.ok(r !== null && r >= 4.5, th + ' ' + kind + ' contrast ' + (r && r.toFixed(2)));
      }
      await pg.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
      await pg.locator('.rl__foot button', { hasText: /Continue|Finish/ }).click(); doneCount++;
    });
    await t('the rest of the set: it ends after 8, says "N of 8 right", logs one Reading session, Done closes', async () => {
      for (let g = 0; g < 10 && (await pg.locator('.tf-opt').count()) > 0; g++) { const it = await cur(); await tap(it.a); doneCount++; await pg.locator('.rl__foot button', { hasText: /Continue|Finish/ }).click(); }
      assert.strictEqual(doneCount, 8, 'answered ' + doneCount); assert.ok((await pg.locator('.rl__score').innerText()).endsWith(' of 8 right'));
      assert.strictEqual(await pg.locator('.wl-progress').getAttribute('aria-valuenow'), '8'); assert.deepStrictEqual(await pg.evaluate(() => window.__logs), ['r']); await shot(pg, '5-done');
      await pg.locator('.rl__foot button', { hasText: 'Done' }).click(); assert.strictEqual(await pg.evaluate(() => window.TFS.on), false); assert.strictEqual(await pg.locator('.rl.tf:not([hidden])').count(), 0);
    });
    await t('second run: no intro card; Escape closes half way and logs nothing more', async () => {
      assert.strictEqual(await pg.evaluate(() => window.TFS.start({})), true); await pg.waitForSelector('.tf-opt');
      assert.strictEqual(await pg.locator('#tf-title').innerText(), 'True, False or Not Given?'); assert.strictEqual(await pg.locator('.rl__foot button', { hasText: 'Got it' }).count(), 0);
      await pg.keyboard.press('Escape'); assert.strictEqual(await pg.evaluate(() => window.TFS.on), false); assert.deepStrictEqual(await pg.evaluate(() => window.__logs), ['r']);
    });
    await t('no page errors', async () => assert.deepStrictEqual(pg.__errs, []));
    await pg.context().close();

    // --- LearnHub hook (the real 169b code) ---
    pg = await open({ book: true, files: {} });
    await t('LearnHub: show false hides, show true shows, a throwing show hides; list() still has all; onChange runs on refresh', async () => {
      const r = await pg.evaluate(() => {
        let n = 0; LearnHub.onChange(() => n++); LearnHub.onChange(() => { throw new Error('x'); });
        LearnHub.register({ id: 'a', title: 'A', open() {}, show: () => true }); LearnHub.register({ id: 'b', title: 'B', open() {}, show: () => false });
        LearnHub.register({ id: 'c', title: 'C', open() {}, show() { throw new Error('x'); } }); LearnHub.register({ id: 'd', title: 'D', open() {} });
        LearnHub.refresh();
        return { shown: LearnHub.shown().map(x => x.id).filter(x => 'abcd'.includes(x)), all: LearnHub.list().map(x => x.id).filter(x => 'abcd'.includes(x)), n, ctx: (LearnHub.register({ id: 'e', title: 'E', open() {}, show: c => !!c && c.bookId === 7 }), [LearnHub.shown({ bookId: 7 }).some(x => x.id === 'e'), LearnHub.shown({ bookId: 8 }).some(x => x.id === 'e')]) };
      });
      assert.deepStrictEqual(r.shown, ['a', 'd']); assert.deepStrictEqual(r.all, ['a', 'b', 'c', 'd']); assert.strictEqual(r.n, 1); assert.deepStrictEqual(r.ctx, [true, false]);
    });
    await pg.context().close();
    await br.close();
  }
  console.log('\n' + pass + ' passed, ' + fail + ' failed' + (skipped ? ', browser checks NOT RUN' : ''));
  process.exit(fail ? 1 : 0);
})();
