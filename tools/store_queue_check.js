/* Write queue of `store` (Task 8, src/js/030-helpers-offline-audio.js). Runs the REAL store code (cut out of the file) against a
   fake localStorage and a fake timer. Run: node tools/store_queue_check.js */
const fs = require('fs'), vm = require('vm'), assert = require('assert');
const src = fs.readFileSync(__dirname + '/../src/js/030-helpers-offline-audio.js', 'utf8');
const a = src.indexOf('let storeHook = null;'), b = src.indexOf('const idb = (');
assert.ok(a > 0 && b > a, 'cannot find the store code in 030');
let pass = 0, fail = 0;
const check = (name, fn) => { try { fn(); pass++; console.log('ok    ' + name); } catch (e) { fail++; console.log('FAIL  ' + name + '\n        ' + e.message); } };

function make() {
  const ls = {}, writes = [], hooks = [], timers = []; let full = null;
  const localStorage = {
    getItem: k => (k in ls ? ls[k] : null),
    setItem: (k, v) => { if (full && full.has(k)) throw new Error('quota'); ls[k] = String(v); writes.push(k); },
    removeItem: k => { delete ls[k]; }
  };
  const window = {};
  const ctx = { localStorage, window, JSON, String, Map, Object, Array,
    setTimeout: fn => { timers.push(fn); return timers.length; }, clearTimeout: id => { if (id) timers[id - 1] = null; } };
  vm.createContext(ctx);
  vm.runInContext(src.slice(a, b) + '\nthis.store = store; this.setHook = f => { storeHook = f; };', ctx);
  ctx.setHook(k => hooks.push(k));
  return { store: ctx.store, setHook: ctx.setHook, ls, writes, hooks, window, timers, fire: () => { const t = timers.slice(); timers.length = 0; t.forEach(f => f && f()); }, setFull: s => { full = s; } };
}

check('set waits: nothing is written until the timer or a flush, but get sees the newest value', () => {
  const t = make(); t.store.set('k', { n: 1 }); t.store.set('k', { n: 2 });
  assert.strictEqual(t.writes.length, 0); assert.deepStrictEqual(t.store.get('k', null), { n: 2 });
});
check('the timer writes the LATEST value once per key and calls storeHook once per key', () => {
  const t = make(); t.store.set('a', 1); t.store.set('a', 2); t.store.set('a', 3); t.store.set('b', 'x');
  t.fire(); assert.deepStrictEqual(t.writes, ['a', 'b']); assert.strictEqual(t.ls.a, '3'); assert.strictEqual(t.ls.b, '"x"');
  assert.deepStrictEqual(t.hooks, ['a', 'b']);
});
check('one timer for many sets (it is not pushed back by newer sets)', () => {
  const t = make(); for (let i = 0; i < 50; i++) t.store.set('k' + (i % 3), i); assert.strictEqual(t.timers.filter(Boolean).length, 1);
});
check('flush writes at once and cancels the timer; a second flush does nothing', () => {
  const t = make(); t.store.set('a', 1); t.store.flush(); assert.strictEqual(t.ls.a, '1'); assert.strictEqual(t.timers.filter(Boolean).length, 0);
  const n = t.writes.length; t.store.flush(); assert.strictEqual(t.writes.length, n);
});
check('get falls back to localStorage, then to the default', () => {
  const t = make(); t.ls.z = '[1,2]'; assert.deepStrictEqual(t.store.get('z', null), [1, 2]); assert.strictEqual(t.store.get('none', 'd'), 'd');
});
check('the saved copy is a snapshot: changing the object after set does not change it', () => {
  const t = make(); const o = { n: 1 }; t.store.set('o', o); o.n = 99; assert.strictEqual(t.store.get('o', null).n, 1);
  const g = t.store.get('o', null); g.n = 5; assert.strictEqual(t.store.get('o', null).n, 1);   // a caller changing what get returned changes nothing
  t.store.flush(); assert.strictEqual(JSON.parse(t.ls.o).n, 1);
});
check('now(): written at once (wt:pauseT before the page closes)', () => {
  const t = make(); t.store.now('wt:pauseT', { id: 1, t: 5 }); assert.deepStrictEqual(JSON.parse(t.ls['wt:pauseT']), { id: 1, t: 5 }); assert.deepStrictEqual(t.hooks, ['wt:pauseT']);
});
check('while a restore runs (__wtRestoring) nothing is queued; a queue made before it is flushed by the caller first', () => {
  const t = make(); t.store.set('before', 1); t.store.flush(); t.window.__wtRestoring = true;
  t.store.set('during', 2); t.store.flush(); assert.ok(!('during' in t.ls)); assert.strictEqual(t.ls.before, '1'); assert.strictEqual(t.store.get('during', 'd'), 'd');
});
check('a flush that runs while a restore is on does not put old values over the restored ones', () => {
  const t = make(); t.store.set('k', 'old'); t.window.__wtRestoring = true; t.ls.k = '"restored"'; t.fire(); t.store.flush();
  assert.strictEqual(t.ls.k, '"restored"'); t.window.__wtRestoring = false; assert.strictEqual(t.store.get('k', null), 'restored');
});
check('del removes the key and a value still waiting in the queue (it cannot come back)', () => {
  const t = make(); t.store.set('k', 1); t.store.flush(); t.store.set('k', 2); t.store.del('k'); t.fire(); t.store.flush();
  assert.ok(!('k' in t.ls)); assert.strictEqual(t.store.get('k', 'd'), 'd');
});
check('storage full for one key: that key is skipped, the others are saved, the hook is not called for the failed one', () => {
  const t = make(); t.setFull(new Set(['bad'])); t.store.set('bad', 1); t.store.set('good', 2); t.store.flush();
  assert.strictEqual(t.ls.good, '2'); assert.ok(!('bad' in t.ls)); assert.deepStrictEqual(t.hooks, ['good']);
});
check('a value that cannot be turned into JSON is ignored, as before', () => {
  const t = make(); const c = {}; c.c = c; t.store.set('c', c); t.store.flush(); assert.ok(!('c' in t.ls));
});
check('a hook that throws never stops the other keys', () => {
  const t = make(); t.setHook(() => { throw new Error('x'); }); t.store.set('a', 1); t.store.set('b', 2); t.store.flush(); assert.strictEqual(t.ls.b, '2');
});
check('wiring: the last handler is in 999 and the direct readers flush first', () => {
  const rd = f => fs.readFileSync(__dirname + '/../src/js/' + f, 'utf8');
  const end = rd('999-app-close.js'); assert.ok(/visibilitychange[\s\S]*store\.flush/.test(end) && /pagehide[\s\S]*store\.flush/.test(end));
  assert.ok(/pauseT', \{ id: S\.book\.id[^)]*\)/.test(rd('150-player-reader.js')) && rd('150-player-reader.js').includes("store.now('wt:pauseT', { id: S.book.id"));
  for (const [f, needle] of [['295-account-sync.js', 'async function acPushKeys'], ['295-account-sync.js', 'async function acSync'], ['295-account-sync.js', 'function acFlush()'], ['290-backup-maintenance.js', 'store.flush(); window.__wtRestoring'], ['295-account-sync.js', 'store.flush(); window.__wtRestoring']]) {
    const s = rd(f), i = s.indexOf(needle); assert.ok(i >= 0, f + ' ' + needle); assert.ok(s.slice(i, i + 300).includes('store.flush()'), f + ': ' + needle + ' must flush');
  }
});
console.log('\n' + (fail ? fail + ' FAILED, ' : 'all ') + pass + ' passed'); process.exit(fail ? 1 : 0);
