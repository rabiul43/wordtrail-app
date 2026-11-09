#!/usr/bin/env node
/* Automatic checks for the learning stats log (148b) and its sync rule in 295.
     node tools/learnlog_check.js
   Loads the REAL src/js/148b-learn-log.js once per simulated device (own storage each), and cuts the REAL category list, AC_MERGE and
   acResolve out of 295-account-sync.js. No browser, no npm install. Exit code 1 if a check fails, 2 if a file cannot be loaded. */
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const read = f => fs.readFileSync(path.join(__dirname, '..', 'src/js', f), 'utf8');
let pass = 0, fail = 0;
const norm = x => JSON.parse(JSON.stringify(x));   // objects made inside the simulated device have another prototype: compare by value
const eq = (a, b) => assert.deepStrictEqual(norm(a), norm(b));
const t = (name, fn) => { try { fn(); pass++; console.log('ok    ' + name); } catch (e) { fail++; console.log('FAIL  ' + name + '\n      ' + (e && e.message)); } };

function device(day) {   // one simulated device: its own storage and clock day
  const disk = {}, listeners = {};
  const store = { get(k, d) { try { const v = disk[k]; return v ? JSON.parse(v) : d; } catch (e) { return d; } }, set(k, v) { disk[k] = JSON.stringify(v); } };
  const RealDate = Date;
  const sandbox = { store, console, document: { hidden: false, addEventListener(e, f) { listeners[e] = f; } }, window: { addEventListener(e, f) { listeners[e] = f; } },
    Date: class extends RealDate { constructor(...a) { if (a.length) super(...a); else super(day + 'T12:00:00'); } static now() { return new RealDate(day + 'T12:00:00').getTime(); } } };
  vm.createContext(sandbox);
  try { vm.runInContext(read('148b-learn-log.js') + '\n;this.LL = LL;', sandbox); } catch (e) { console.log('cannot load 148b: ' + e.message); process.exit(2); }
  return { LL: sandbox.LL, disk, listeners };
}

// ---- the real sync rule from 295 ----
const s295 = read('295-account-sync.js').replace(/\r\n/g, '\n');
const cut = (from, to) => { const i = s295.indexOf(from); const j = s295.indexOf(to, i); if (i < 0 || j < 0) { console.log('cannot find ' + from + ' in 295'); process.exit(2); } return s295.slice(i, j); };
const catsSrc = cut('const AC_CATS = [', '];') + '];';
const mergeSrc = cut('const AC_MERGE =', '\n') ;
const resolveSrc = cut('function acResolve(', '\n  }\n') + '\n  }';
const A = device('2026-11-09');
const ctx = { LL: A.LL, JSON, Math, Object, Array, acIsObj: x => !!x && typeof x === 'object' && !Array.isArray(x), acKeyOf: x => String(x), acUnion: () => null, acWords: () => [] };
vm.createContext(ctx);
vm.runInContext(catsSrc + '\n' + mergeSrc + '\n' + resolveSrc + '\n;this.AC_CATS = AC_CATS; this.AC_MERGE = AC_MERGE; this.acResolve = acResolve;', ctx);

t('295: wt:learnlog has its own sync category', () => { const c = ctx.AC_CATS.filter(x => x[2]('wt:learnlog')); assert.strictEqual(c.length, 1); assert.strictEqual(c[0][0], 'learning'); });
t('295: no other category takes wt:learnlog, and wt:learnlog does not steal other keys', () => { assert.ok(!ctx.AC_CATS.some(x => x[0] !== 'learning' && x[2]('wt:learnlog'))); assert.ok(ctx.AC_CATS.find(x => x[0] === 'library')[2]('wt:words')); assert.ok(!ctx.AC_CATS.find(x => x[0] === 'learning')[2]('wt:words')); });
t('295: wt:learnlog is a merge key', () => { assert.ok(ctx.AC_MERGE('wt:learnlog')); assert.ok(ctx.AC_MERGE('wt:words')); assert.ok(!ctx.AC_MERGE('wt:favs')); });

t('merge: per day, larger value of each field', () => {
  const a = { '2026-11-08': { m: 10, r: 4, c: 3, n: 1, q: 0 }, '2026-11-09': { m: 2, r: 9 } };
  const b = { '2026-11-08': { m: 7, r: 6, c: 2, n: 2, q: 5 }, '2026-11-07': { m: 30 } };
  const out = A.LL.merge(a, b);
  eq(out, { '2026-11-07': { m: 30 }, '2026-11-08': { m: 10, r: 6, c: 3, n: 2, q: 5 }, '2026-11-09': { m: 2, r: 9 } });
  assert.strictEqual(a['2026-11-08'].m, 10); assert.strictEqual(b['2026-11-08'].m, 7);   // inputs untouched
});
t('merge: same both ways, repeatable, and with itself', () => {
  const a = { '2026-11-08': { m: 10, r: 4 } }, b = { '2026-11-08': { m: 7, r: 6 }, '2026-11-09': { n: 1 } };
  const ab = A.LL.merge(a, b), ba = A.LL.merge(b, a);
  eq(ab, ba); eq(A.LL.merge(ab, b), ab); eq(A.LL.merge(ab, ab), ab);
});
t('merge: bad data is ignored, never thrown', () => {
  const out = A.LL.merge({ 'not-a-day': { m: 5 }, '2026-11-08': { m: -3, r: 'x', c: 2.9, zz: 7 } }, { '2026-11-08': null });
  eq(out, { '2026-11-08': { c: 2 } });
  assert.strictEqual(A.LL.mergeJson('nope', '{}'), null); assert.strictEqual(A.LL.mergeJson('[]', '{}'), null); assert.strictEqual(A.LL.mergeJson('{}', 'null'), null);
});
t('merge: keeps only the last 400 days', () => {
  const big = {}; for (let i = 0; i < 450; i++) big[new Date(Date.UTC(2025, 0, 1 + i)).toISOString().slice(0, 10)] = { m: 1 };
  const out = A.LL.merge(big, {}); const k = Object.keys(out);
  assert.strictEqual(k.length, 400); assert.strictEqual(k[k.length - 1], Object.keys(big).sort().pop());
});
t('295 acResolve: gives the merged text for wt:learnlog (either side newer)', () => {
  const a = JSON.stringify({ '2026-11-09': { m: 5, r: 1 } }), b = JSON.stringify({ '2026-11-09': { m: 3, r: 4 } });
  const want = { '2026-11-09': { m: 5, r: 4 } };
  eq(JSON.parse(ctx.acResolve('wt:learnlog', a, b, true)), want);
  eq(JSON.parse(ctx.acResolve('wt:learnlog', a, b, false)), want);
  assert.strictEqual(ctx.acResolve('wt:learnlog', 'x', b, true), null);   // unreadable copy: the newer copy wins as before
});

// ---- the logger ----
t('logger: review, new word, question add to today only', () => {
  const d = device('2026-11-09'); const L = d.LL;
  L.review(true); L.review(false); L.review(true); L.newWord(); L.question(); L.question(3);
  eq(L.today(), { r: 3, c: 2, n: 1, q: 4 });
  eq(Object.keys(L.all()), ['2026-11-09']);
});
t('logger: reading time is kept in memory and written once a minute', () => {
  const d = device('2026-11-09'); const L = d.LL;
  for (let i = 0; i < 50; i++) L.time(1);   // 50 s: nothing written
  assert.strictEqual(d.disk['wt:learnlog'], undefined);
  for (let i = 0; i < 70; i++) L.time(1);   // 120 s in all: 2 minutes, written twice at most
  assert.strictEqual(L.today().m, 2);
  L.time(-5); L.time(NaN); L.time(100000); assert.strictEqual(L.today().m, 2);   // nonsense ignored
});
t('logger: leftover seconds count when the page is hidden (30 s or more), not below', () => {
  const d = device('2026-11-09'); d.LL.time(40); d.listeners.pagehide(); assert.strictEqual(d.LL.today().m, 1);
  const e = device('2026-11-09'); e.LL.time(20); e.listeners.pagehide(); assert.strictEqual(e.LL.today().m, undefined);
});
t('logger: a damaged stored value does not break logging', () => {
  const d = device('2026-11-09'); d.disk['wt:learnlog'] = '[1,2,3]'; d.LL.review(true); eq(d.LL.today(), { r: 1, c: 1 });
  const e = device('2026-11-09'); e.disk['wt:learnlog'] = '{oops'; e.LL.newWord(); eq(e.LL.today(), { n: 1 });
});

// ---- two devices ----
t('two devices: phone and laptop log, sync both ways, end up the same', () => {
  const phone = device('2026-11-09'), laptop = device('2026-11-09');
  phone.LL.review(true); phone.LL.review(true); phone.LL.review(false); phone.LL.newWord(); for (let i = 0; i < 125; i++) phone.LL.time(1);   // r3 c2 n1 m2
  laptop.LL.review(true); laptop.LL.newWord(); laptop.LL.newWord(); laptop.LL.question(5); for (let i = 0; i < 400; i++) laptop.LL.time(1);   // r1 c1 n2 q5 m6
  const sync = (x, y) => { const m = ctx.acResolve('wt:learnlog', x.disk['wt:learnlog'], y.disk['wt:learnlog'], true); x.disk['wt:learnlog'] = m; y.disk['wt:learnlog'] = m; };
  sync(phone, laptop);
  const want = { m: 6, r: 3, c: 2, n: 2, q: 5 };
  eq(phone.LL.today(), want); eq(laptop.LL.today(), want);
  phone.LL.review(true);   // phone goes on, then syncs again
  sync(laptop, phone);
  eq(laptop.LL.today(), { m: 6, r: 4, c: 3, n: 2, q: 5 });
  assert.strictEqual(phone.disk['wt:learnlog'], laptop.disk['wt:learnlog']);
});
t('two devices: different days both survive', () => {
  const a = device('2026-11-08'), b = device('2026-11-09');
  a.LL.review(true); b.LL.newWord();
  const m = JSON.parse(ctx.acResolve('wt:learnlog', a.disk['wt:learnlog'], b.disk['wt:learnlog'], false));
  eq(m, { '2026-11-08': { r: 1, c: 1 }, '2026-11-09': { n: 1 } });
});

console.log('\n' + (fail ? fail + ' FAILED, ' + pass + ' passed' : 'all ' + pass + ' passed'));
process.exit(fail ? 1 : 0);
