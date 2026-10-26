// Replaces every request the app makes to the outside world with a small, fixed answer, so the tests never touch
// the real internet. Requests to the local test server (127.0.0.1) are left alone. Anything not listed here is
// refused (like being offline) and remembered in `unmocked`, so a test can see what it missed.
const fs = require('fs'), path = require('path');
const { BOOKS, catalog, levels, librivoxBook, bookText } = require('../fixtures/books');

const TONE = fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'test-tone.wav'));
// 1x1 transparent PNG (book covers)
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

const PROXY_HOSTS = ['corsproxy.io', 'api.allorigins.win', 'api.codetabs.com', 'r.jina.ai'];

const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
const text = (route, body, type = 'text/plain; charset=utf-8', status = 200) => route.fulfill({ status, contentType: type, headers: { 'access-control-allow-origin': '*' }, body });

// Serve the tone with Range support (browsers ask for byte ranges when they play and seek).
function audio(route, request) {
  const range = /bytes=(\d*)-(\d*)/.exec(request.headers()['range'] || '');
  const headers = { 'access-control-allow-origin': '*', 'accept-ranges': 'bytes', 'content-type': 'audio/wav' };
  if (!range) return route.fulfill({ status: 200, headers, body: TONE });
  const start = range[1] ? +range[1] : 0, end = Math.min(range[2] ? +range[2] : TONE.length - 1, TONE.length - 1);
  return route.fulfill({ status: 206, headers: Object.assign(headers, { 'content-range': `bytes ${start}-${end}/${TONE.length}` }), body: TONE.subarray(start, end + 1) });
}

// "https://corsproxy.io/?<url>" and friends: find the real address inside.
function unwrap(url) {
  const u = new URL(url);
  if (PROXY_HOSTS.includes(u.hostname) || u.hostname.endsWith('.workers.dev')) {
    const inner = u.searchParams.get('url') || u.searchParams.get('quest') || decodeURIComponent(u.search.slice(1));
    if (/^https?:\/\//.test(inner)) return inner;
  }
  return url;
}

function answer(route, request, mocks, log) {
  const raw = request.url();
  const u = new URL(raw);
  if (u.hostname === '127.0.0.1' || u.hostname === 'localhost') return route.fallback();
  log.requests.push(request.method() + ' ' + raw.slice(0, 140));
  if (mocks.offline) return route.abort('internetdisconnected');

  const target = new URL(unwrap(raw));
  const host = target.hostname, p = target.pathname;
  const params = target.searchParams;

  if (p.endsWith('/levels.json')) return json(route, levels());

  // The worker that bundles a book: one JSON line per piece (tracks, Gutenberg id, text)
  if (u.hostname.endsWith('.workers.dev') && u.pathname === '/book') {
    const b = BOOKS.find(x => x.id === u.searchParams.get('id'));
    if (!b) return json(route, { error: 'no tracks' });
    const lines = [{ lv: librivoxBook(b) }, { gut: { id: b.gid, label: 'Project Gutenberg #' + b.gid } }];
    if (u.searchParams.get('text') !== '0') lines.push({ text: bookText(b) });
    return text(route, lines.map(l => JSON.stringify(l)).join('\n') + '\n', 'application/x-ndjson');
  }

  if (host === 'raw.githubusercontent.com' && p.endsWith('/catalog.json')) return json(route, catalog());
  if (host === 'librivox.org' && p.startsWith('/api/feed/audiobooks')) {
    // Behaves like the real API: filter by id, or by title / author prefix ("^lant"); no match = 404
    const clean = v => String(v || '').replace(/^\^/, '').toLowerCase();
    let found = BOOKS;
    if (params.get('id')) found = BOOKS.filter(b => b.id === params.get('id'));
    else if (params.get('title')) found = BOOKS.filter(b => b.title.toLowerCase().startsWith(clean(params.get('title'))));
    else if (params.get('author')) found = BOOKS.filter(b => b.last.toLowerCase().startsWith(clean(params.get('author'))));
    const cb = params.get('callback');
    if (!found.length) return cb ? text(route, cb + '({"books":[]});', 'text/javascript') : json(route, { error: 'Audiobooks could not be found' }, 404);
    const body = { books: found.map(librivoxBook) };
    return cb ? text(route, cb + '(' + JSON.stringify(body) + ');', 'text/javascript') : json(route, body);
  }
  if (host.endsWith('gutenberg.org')) { const b = BOOKS.find(x => p.includes(x.gid)); return b ? text(route, bookText(b)) : route.fulfill({ status: 404 }); }
  if (/\.wav$/.test(p) || host === 'archive.org' && p.startsWith('/download/')) return audio(route, request);
  if (host === 'archive.org' || host === 'images.weserv.nl' || request.resourceType() === 'image') return route.fulfill({ status: 200, contentType: 'image/png', body: PNG });
  if (host.endsWith('wikipedia.org')) return route.fulfill({ status: 404, body: 'not found' });     // author / book blurbs
  if (host === 'openlibrary.org') return json(route, { docs: [] });                       // cover lookups
  if (host === 'firestore.googleapis.com') return json(route, [{ readTime: new Date().toISOString() }]); // public ratings queries: no ratings
  if (host === 'fonts.googleapis.com') return text(route, '/* fonts are not needed in tests */', 'text/css');
  if (host === 'fonts.gstatic.com') return route.abort();
  // data files that are optional: the app copes with "not found"
  if (host === 'raw.githubusercontent.com' || host.endsWith('huggingface.co') || host.endsWith('.workers.dev')) return route.fulfill({ status: 404, body: 'not found' });

  // music.json lives on Cloudflare Pages (hosts.json). The app asks for it at every start-up and copes with "not published".
  if (host.endsWith('.pages.dev')) return route.fulfill({ status: 404, body: 'not found' });

  log.unmocked.push(request.method() + ' ' + raw.slice(0, 140));
  return route.abort();
}

// Call once per browser context. Returns { log, mocks }.
async function mockNetwork(context) {
  const mocks = { offline: false };   // set mocks.offline = true to make every outside request fail
  const log = { requests: [], unmocked: [] };
  await context.route(() => true, (route, request) => answer(route, request, mocks, log));
  return { log, mocks };
}

module.exports = { mockNetwork };
