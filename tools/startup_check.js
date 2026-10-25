#!/usr/bin/env node
/* "Does the app still start?" check. No browser needed.
     python build.py --no-min && node tools/startup_check.js
   It runs the built page's scripts in Node with stand-in browser objects, and fails if the start-up code
   stops early. This is what catches the mistakes that come from the file ORDER:
     - a name used at load time before the file that declares it ("Cannot access 'x' before initialization")
     - a name that no longer exists anywhere (moved, renamed or deleted) ("x is not defined")
   It does NOT check that anything works after start-up (taps, sync, audio): that is for unit_check.js and the browser tests.
   Exit code: 0 ok, 1 start-up failed, 2 setup problem (no dist/index.html). */
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.join(__dirname, '..');
const file = path.join(root, process.argv[2] || 'dist/index.html');
if (!fs.existsSync(file)) { console.error('Missing ' + file + '. Run: python build.py --no-min'); process.exit(2); }
const html = fs.readFileSync(file, 'utf8');

/* The plain <script> blocks, in page order (the JSON and text/plain blocks are data, not code). */
const scripts = []; const re = /<script([^>]*)>([\s\S]*?)<\/script>/g; let m;
while ((m = re.exec(html))) if (!/\btype\s*=/.test(m[1])) scripts.push(m[2]);
if (!scripts.length) { console.error('No scripts found in ' + file); process.exit(2); }
const main = scripts.length - 1;                              // the big one: Core + the whole closure
const end = scripts[main].lastIndexOf('})();');
if (end < 0) { console.error('Cannot find the end of the app closure'); process.exit(2); }
scripts[main] = scripts[main].slice(0, end) + ';__wtReachedEnd();\n' + scripts[main].slice(end);

/* A stand-in for anything the browser provides: any property is another stand-in, calling it gives one, awaiting it ends at once. */
/* methods that loops call until they get nothing back */
const ENDS = new Set(['nextNode', 'exec', 'shift', 'pop']);
const make = () => {
  const f = function () {};
  const p = new Proxy(f, {
    get: (t, k) => (k === Symbol.toPrimitive ? h => (h === 'number' ? 0 : '') : k === 'then' ? undefined : ENDS.has(k) ? () => null : k === Symbol.iterator ? function* () {} : k === 'length' ? 0 : p),
    apply: () => p, construct: () => p, set: () => true, has: () => false, deleteProperty: () => true,
    getPrototypeOf: () => Object.prototype
  });
  return p;
};
/* Names the app may use from the browser. Anything else that is not declared in the app is a mistake. */
const BROWSER = new Set(('window self document navigator location history screen localStorage sessionStorage indexedDB caches crypto performance ' +
  'fetch Request Response Headers FormData Blob File FileReader URL URLSearchParams AbortController AbortSignal TextEncoder TextDecoder ' +
  'Audio AudioContext webkitAudioContext OfflineAudioContext AudioBuffer MediaMetadata MediaSource Image Worker SharedWorker WebSocket XMLHttpRequest ' +
  'DOMParser XMLSerializer Notification IntersectionObserver ResizeObserver MutationObserver PerformanceObserver BroadcastChannel MessageChannel ' +
  'CustomEvent Event KeyboardEvent MouseEvent PointerEvent TouchEvent Node Element HTMLElement DocumentFragment CSS DecompressionStream CompressionStream ' +
  'matchMedia getComputedStyle requestAnimationFrame cancelAnimationFrame requestIdleCallback cancelIdleCallback addEventListener removeEventListener ' +
  'NodeFilter Option alert confirm prompt open close scrollTo scrollBy innerWidth innerHeight devicePixelRatio visualViewport speechSynthesis SpeechSynthesisUtterance ' +
  'structuredClone atob btoa createImageBitmap OffscreenCanvas ReadableStream WritableStream TransformStream').split(/\s+/));
const real = new Set(Object.getOwnPropertyNames(globalThis).filter(k => !BROWSER.has(k) && !['fetch', 'performance', 'navigator', 'crypto', 'location'].includes(k)));
const timers = [];
const fake = {
  setTimeout: (fn, ms) => { timers.push(fn); return timers.length; }, setInterval: () => 0, clearTimeout() {}, clearInterval() {},
  queueMicrotask: () => {}, requestAnimationFrame: () => 0, requestIdleCallback: () => 0, console: { log() {}, warn() {}, error() {}, info() {}, debug() {} },
  __wtReachedEnd: () => { reached = true; },
  localStorage: (() => { const d = new Map(); return { getItem: k => d.has(k) ? d.get(k) : null, setItem: (k, v) => { d.set(k, String(v)); }, removeItem: k => { d.delete(k); }, clear: () => d.clear(), key: i => [...d.keys()][i] || null, get length() { return d.size; } }; })()
};
let reached = false;
const stubs = new Map();
const G = new Proxy({}, {
  has: () => true,
  get: (t, k) => (k === Symbol.unscopables ? undefined : lookup(k, true)),
  set: (t, k, v) => { fake[k] = v; return true; }
});

/* `window.Name` and `typeof Name` are feature checks: a missing one is normal there, so it just answers undefined. */
const optional = new Set(); { const r2 = /typeof\s+([A-Za-z_$][\w$]*)/g; let t; while ((t = r2.exec(scripts.join('\n')))) optional.add(t[1]); }
const lookup = (k, strict) => {
  if (typeof k === 'symbol') return undefined;
  if (k === 'window' || k === 'self' || k === 'globalThis') return W;
  if (k in fake) return fake[k];
  if (real.has(k)) return globalThis[k];
  if (BROWSER.has(k)) { if (!stubs.has(k)) stubs.set(k, make()); return stubs.get(k); }
  if (strict && !optional.has(k)) { if (process.env.WT_DISCOVER) { seenUnknown.add(k); if (!stubs.has(k)) stubs.set(k, make()); return stubs.get(k); } throw new ReferenceError(k + ' is not defined'); }
  return undefined;
};
const W = new Proxy({}, { has: () => true, get: (t, k) => lookup(k, false), set: (t, k, v) => { fake[k] = v; return true; } });
const seenUnknown = new Set();
const unhandled = [];
process.on('unhandledRejection', e => unhandled.push(e));
let failure = null;
for (let i = 0; i < scripts.length && !failure; i++) {
  try { globalThis.__WT_G = G; vm.runInThisContext('(function (G) { with (G) {\n' + scripts[i] + '\n} })(__WT_G)', { filename: 'script-' + (i + 1), timeout: 30000 }); }
  catch (e) { failure = { i, e }; }
}
setImmediate(() => {
  if (process.env.WT_DISCOVER) console.log('names not in the browser list: ' + [...seenUnknown].join(' '));
  if (failure) {
    const where = (String(failure.e.stack || '').match(/script-\d+:(\d+)/) || [])[1];
    console.log('FAIL  start-up stopped in script ' + (failure.i + 1) + (where ? ' at line ' + where : '') + ':\n      ' + (failure.e && failure.e.message));
    if (where) { const L = scripts[failure.i].split('\n'); console.log('      > ' + (L[where - 2] || '').trim().slice(0, 160)); }
    process.exit(1);
  }
  if (!reached) { console.log('FAIL  start-up code ran without an error but never reached the end of the app'); process.exit(1); }
  const why = unhandled.find(e => e instanceof ReferenceError || (e && /before initialization|is not defined/.test(String(e.message))));
  if (why) { console.log('FAIL  a name was missing while the app was starting (inside an async step): ' + why.message); process.exit(1); }
  console.log('ok    the app starts: ' + scripts.length + ' scripts ran, the whole app closure reached its end');
  process.exit(0);
});
