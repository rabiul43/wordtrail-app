/* Wordtrail service worker. It does two small things and nothing else:
 *
 *  1. The app page (one file) is fetched from the network first (up to 3 s) so a new version shows up at once. If the
 *     network is slow or offline, the saved copy opens instead and the newest page is saved in the background; the open
 *     page then gets a 'wt-update' message and offers "Reload". The very first visit (nothing saved yet) uses the network.
 *  2. Big language files (i18n-bn.json) are kept, so that language works offline.
 *  3. The font files are kept, so text keeps its look offline: our own fonts/*.woff2 (cache first: their names carry a hash,
 *     so a file never changes) and, for the few fonts still loaded from elsewhere, the Google Fonts files.
 *  4. The catalogue (catalog.json) is kept: network first, the saved copy only when the network fails or is slow.
 *  5. Book covers are kept (cache first, at most COVER_MAX of them, renewed in the background after COVER_FRESH), so Home
 *     paints its covers at once and still looks complete offline. Covers are saved only when the host allows a normal
 *     (CORS) request: an opaque answer would count about 7 MB of storage each, so those are never saved.
 *
 * It does NOT touch audio, book texts, LibriVox / Archive.org requests, sign-in, or sync: those requests are left
 * alone and go straight to the network, as they did before there was a service worker. Offline audio stays in
 * IndexedDB, and the ambient-sound cache 'wt-amb-rec' is never read or deleted here.
 */
'use strict';

const SHELL = 'wt-shell-v1', FONTS = 'wt-fonts-v1', LANG = 'wt-lang-v1', CATALOG = 'wt-catalog-v1', COVERS = 'wt-covers-v1', NET_WAIT = 3000;
const CAT_WAIT = 6000;                 // catalogue: after this long the saved copy is used (the app itself gives up at 8 s)
const COVER_MAX = 600, COVER_FRESH = 14 * 864e5, COVER_BIG = 1.5e6; // covers kept, age before a quiet refresh, largest file kept
let coverPuts = 0;
const noCors = new Set();              // cover hosts that answered a plain request but refused a CORS one: not tried again this run
const ROOT = new URL('./', self.registration.scope).href; // the page, whatever it is called (query strings are ignored)
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', event => {
  // Save the page now if we can, so the very first offline open already works. Failing here is fine.
  event.waitUntil(caches.open(SHELL).then(c => fetch(ROOT, { cache: 'no-cache' }).then(r => { if (r.ok) return c.put(ROOT, plain(r)); })).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    // Remove only our own older caches. Anything else (for example 'wt-amb-rec') is left exactly as it is.
    const keep = [SHELL, FONTS, LANG, CATALOG, COVERS];
    for (const k of await caches.keys()) if (/^wt-(shell|fonts|lang|catalog|covers)-/.test(k) && !keep.includes(k)) await caches.delete(k);
    await self.clients.claim();
  })());
});

// A page answer that came through a redirect is refused by browsers, so rebuild it as a plain response.
const plain = r => (r.redirected ? new Response(r.body, { status: r.status, statusText: r.statusText, headers: r.headers }) : r);

// Same bytes? (length first, then a SHA-1 of both: cheap even for a 1.5 MB page)
async function sameBody(a, b) {
  if (a.byteLength !== b.byteLength) return false;
  const [x, y] = await Promise.all([crypto.subtle.digest('SHA-1', a), crypto.subtle.digest('SHA-1', b)]);
  const u = new Uint8Array(x), v = new Uint8Array(y);
  for (let i = 0; i < u.length; i++) if (u[i] !== v[i]) return false;
  return true;
}

async function tellPages() {
  try { for (const c of await self.clients.matchAll({ type: 'window' })) c.postMessage({ type: 'wt-update' }); } catch (e) { /* none open */ }
}

async function shell(event) {
  const cache = await caches.open(SHELL), cached = await cache.match(ROOT);
  let usedCached = false;                                   // true once the saved (maybe older) page was handed to the app
  const net = fetch(ROOT, { cache: 'no-cache' }).then(async r => {
    if (!r || !r.ok) throw new Error('bad response');       // an error page never replaces the saved copy
    const ok = plain(r);
    let changed = false;
    try {                                                    // compare with what is saved (a fresh read, the one served is already in use)
      const old = await cache.match(ROOT);
      if (old) changed = !(await sameBody(await old.arrayBuffer(), await ok.clone().arrayBuffer()));
    } catch (e) { changed = false; }
    await cache.put(ROOT, ok.clone());
    if (changed && usedCached) tellPages();                  // the app is showing the older page: offer the reload
    return ok;
  });
  if (!cached) return net.catch(() => fetch(event.request)); // first visit: just the network
  event.waitUntil(net.catch(() => {}));
  /* Network first: the newest page opens whenever the network answers within NET_WAIT. If it is slow or offline, the saved
     page opens at once and the newest one keeps downloading (then the app offers "Reload"). */
  const slow = new Promise(res => setTimeout(() => { usedCached = true; res(cached); }, NET_WAIT));
  const fast = net.catch(() => { usedCached = true; return cached; });
  return Promise.race([fast, slow]);
}

// Our own fonts (fonts/<name>-<hash>.woff2): a saved file is final, so it is served without asking the network again.
async function ownFont(event) {
  const cache = await caches.open(FONTS), cached = await cache.match(event.request);
  if (cached) return cached;
  const r = await fetch(event.request);
  if (r && r.ok) event.waitUntil(cache.put(event.request, r.clone()));
  return r;
}

async function font(event) {
  const cache = await caches.open(FONTS), cached = await cache.match(event.request);
  const net = fetch(event.request).then(r => { if (r && (r.ok || r.type === 'opaque')) cache.put(event.request, r.clone()); return r; });
  if (cached) { event.waitUntil(net.catch(() => {})); return cached; } // saved copy now, refreshed in the background
  return net;
}

// A big language file (i18n-bn.json): the saved copy opens at once and is refreshed in the background, so the language also works offline.
async function lang(event) {
  const cache = await caches.open(LANG), cached = await cache.match(event.request, { ignoreSearch: true });
  const net = fetch(event.request).then(r => { if (r && r.ok) cache.put(event.request, r.clone()); return r; });
  if (cached) { event.waitUntil(net.catch(() => {})); return cached; }
  return net;
}

// The catalogue: network first (the app asks with cache:'no-cache', so an unchanged file is a cheap 304). When the network fails or
// is slow, the saved copy is served with 'x-wt-stale: 1', so the app does not treat it as freshly downloaded.
const isCatalog = u => u.hostname === 'raw.githubusercontent.com' && /\/catalog\.json$/.test(u.pathname);
async function catalog(event) {
  const cache = await caches.open(CATALOG), key = event.request.url;
  const stale = async () => {
    const c = await cache.match(key); if (!c) return null;
    const hd = new Headers(c.headers); hd.set('x-wt-stale', '1');
    return new Response(await c.blob(), { status: 200, headers: hd });
  };
  const net = fetch(event.request).then(r => {
    if (!r || !r.ok) throw new Error('bad response');        // an error page never replaces the saved catalogue
    event.waitUntil(cache.put(key, r.clone()));
    return r;
  });
  const saved = await cache.match(key);
  if (!saved) return net;                                     // nothing saved yet: just the network
  event.waitUntil(net.catch(() => {}));
  const slow = new Promise(res => setTimeout(() => res(stale()), CAT_WAIT));
  return Promise.race([net.catch(() => stale()), slow]);
}

// Covers: the image hosts the app draws covers from. Only covers, never audio or text.
function isCover(u) {
  const h = u.hostname, p = u.pathname;
  if (h === 'covers.openlibrary.org' || h === 'images.weserv.nl') return true;
  if (h === 'archive.org' || h === 'www.archive.org') return p.startsWith('/services/img/') || /\.(jpe?g|png|webp)$/i.test(p);
  if (h === 'cdn.jsdelivr.net') return p.startsWith('/gh/standardebooks/');
  if (h === 'standardebooks.org') return /\/cover(-thumbnail)?\.jpg$/.test(p);
  return false;
}

// Save one cover (stamped with the time, so it can be renewed later) and, now and then, drop the oldest ones beyond COVER_MAX.
async function keepCover(cache, url, r) {
  try {
    if (!/^image\//i.test(r.headers.get('content-type') || '')) return;   // a redirect page or an error text is not a cover
    const blob = await r.blob();
    if (blob.size > COVER_BIG || !blob.size) return;
    const hd = new Headers(r.headers); hd.set('x-wt-t', String(Date.now()));
    await cache.put(url, new Response(blob, { status: 200, headers: hd }));
    if (++coverPuts % 25 === 0) {
      const keys = await cache.keys();
      for (let i = 0; i < keys.length - COVER_MAX; i++) await cache.delete(keys[i]);   // keys come oldest first
    }
  } catch (e) { /* storage full or similar: the cover still shows, it is just not kept */ }
}

async function cover(event) {
  const req = event.request, url = req.url, host = new URL(url).hostname;
  const cache = await caches.open(COVERS), hit = await cache.match(url);
  const refresh = () => fetch(url, { mode: 'cors', credentials: 'omit' }).then(r => { if (r.ok) return keepCover(cache, url, r); }).catch(() => {});
  if (hit) {
    if (Date.now() - (+hit.headers.get('x-wt-t') || 0) > COVER_FRESH) event.waitUntil(refresh());   // old: shown now, renewed quietly
    return hit;
  }
  if (!noCors.has(host)) {
    const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 8000);   // a stalled host must not hold the cover (or double the wait with the second try below)
    try {
      const r = await fetch(url, { mode: 'cors', credentials: 'omit', signal: ctl.signal });
      clearTimeout(to);
      if (r.ok) { event.waitUntil(keepCover(cache, url, r.clone())); return r; }
      return r;                                               // a real answer (404 ...): shown as it is, not kept
    } catch (e) { clearTimeout(to); if (ctl.signal.aborted) return Response.error(); /* offline, or the host refuses CORS: try the plain request below */ }
  }
  const r = await fetch(req);                                 // the original request, as before there was a service worker
  if (r && r.type === 'opaque') noCors.add(host);             // it works only without CORS: remember, and do not keep it
  return r;
}

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;                          // sign-in posts, uploads: not ours
  const url = new URL(req.url);
  if (req.mode === 'navigate' && url.origin === self.location.origin && url.href.startsWith(ROOT)) { event.respondWith(shell(event)); return; }
  if (url.origin === self.location.origin && /\/i18n-[a-z-]+\.json$/.test(url.pathname)) { event.respondWith(lang(event)); return; }
  if (url.origin === self.location.origin && url.href.startsWith(ROOT + 'fonts/') && url.pathname.endsWith('.woff2')) { event.respondWith(ownFont(event)); return; }
  if (FONT_HOSTS.includes(url.hostname)) { event.respondWith(font(event)); return; }
  if (isCatalog(url)) { event.respondWith(catalog(event)); return; }
  if (isCover(url) && (req.destination === 'image' || req.destination === '')) { event.respondWith(cover(event)); return; }
  // everything else: not handled, the browser does what it always did
});
