/* Wordtrail service worker. It does two small things and nothing else:
 *
 *  1. The app page (one file) is kept for offline use. Online, the page always comes from the network, so a new
 *     version shows up on the next open. Offline, or if the network does not answer within SHELL_WAIT ms, the saved
 *     copy is used, so the app still opens on a plane or on a weak connection.
 *  2. The Google Fonts files are kept, so text keeps its look offline.
 *
 * It does NOT touch audio, book texts, LibriVox / Archive.org requests, sign-in, or sync: those requests are left
 * alone and go straight to the network, as they did before there was a service worker. Offline audio stays in
 * IndexedDB, and the ambient-sound cache 'wt-amb-rec' is never read or deleted here.
 */
'use strict';

const SHELL = 'wt-shell-v1', FONTS = 'wt-fonts-v1';
const SHELL_WAIT = 4000;                                  // ms to wait for the network before using the saved page
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

async function shell(event) {
  const cache = await caches.open(SHELL), cached = await cache.match(ROOT);
  const net = fetch(ROOT, { cache: 'no-cache' }).then(r => {
    if (!r || !r.ok) throw new Error('bad response');       // an error page never replaces the saved copy
    const ok = plain(r);
    cache.put(ROOT, ok.clone());
    return ok;
  });
  if (!cached) return net.catch(() => fetch(event.request));   // first visit: just the network
  event.waitUntil(net.catch(() => {}));                         // keep updating the saved copy even if we answered from it
  const slow = new Promise(res => setTimeout(() => res(cached), SHELL_WAIT));
  return Promise.race([net.catch(() => cached), slow]);
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
