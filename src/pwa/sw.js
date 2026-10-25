/* Wordtrail service worker. It does two small things and nothing else:
 *
 *  1. The app page (one file) is fetched from the network first (up to 3 s) so a new version shows up at once. If the
 *     network is slow or offline, the saved copy opens instead and the newest page is saved in the background; the open
 *     page then gets a 'wt-update' message and offers "Reload". The very first visit (nothing saved yet) uses the network.
 *  2. The Google Fonts files are kept, so text keeps its look offline.
 *
 * It does NOT touch audio, book texts, LibriVox / Archive.org requests, sign-in, or sync: those requests are left
 * alone and go straight to the network, as they did before there was a service worker. Offline audio stays in
 * IndexedDB, and the ambient-sound cache 'wt-amb-rec' is never read or deleted here.
 */
'use strict';

const SHELL = 'wt-shell-v1', FONTS = 'wt-fonts-v1', NET_WAIT = 3000;
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
    const keep = [SHELL, FONTS];
    for (const k of await caches.keys()) if ((k.startsWith('wt-shell-') || k.startsWith('wt-fonts-')) && !keep.includes(k)) await caches.delete(k);
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

async function font(event) {
  const cache = await caches.open(FONTS), cached = await cache.match(event.request);
  const net = fetch(event.request).then(r => { if (r && (r.ok || r.type === 'opaque')) cache.put(event.request, r.clone()); return r; });
  if (cached) { event.waitUntil(net.catch(() => {})); return cached; } // saved copy now, refreshed in the background
  return net;
}

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;                          // sign-in posts, uploads: not ours
  const url = new URL(req.url);
  if (req.mode === 'navigate' && url.origin === self.location.origin && url.href.startsWith(ROOT)) { event.respondWith(shell(event)); return; }
  if (FONT_HOSTS.includes(url.hostname)) { event.respondWith(font(event)); return; }
  // everything else: not handled, the browser does what it always did
});
