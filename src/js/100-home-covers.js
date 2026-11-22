  /* ---------- home: homepage rows (featured, recently added, genre) ---------- */

  /* Curated featured book IDs — stable LibriVox IDs for perennial favourites */
  const FEATURED_IDS = ['127', '98', '11', '174', '345', '1260', '103', '205'];

  /* Genre definitions: label, emoji, LibriVox genre string, search fallback */
  const GENRES = [
    { label: 'Fiction',   icon: '📖', lv: 'general+fiction',  q: 'fiction' },
    { label: 'Mystery',   icon: '🔍', lv: 'mystery+fiction',  q: 'mystery' },
    { label: 'Sci-fi',    icon: '🚀', lv: 'science+fiction',  q: 'science fiction' },
    { label: 'Fantasy',   icon: '🐉', lv: 'fantasy+fiction',  q: 'fantasy' },
    { label: 'History',   icon: '🏛️',  lv: 'history',          q: 'history' },
    { label: 'Biography', icon: '👤', lv: 'biography',         q: 'biography' },
    { label: 'Children',  icon: '🌟', lv: 'children',          q: 'children' },
    { label: 'Poetry',    icon: '✍️',  lv: 'poetry',            q: 'poetry' },
    { label: 'Drama',     icon: '🎭', lv: 'plays',             q: 'drama' },
    { label: 'Adventure', icon: '⛵', lv: 'adventure',         q: 'adventure' },
  ];

  /* Cache TTLs */
  const TTL_FEATURED = 72 * 3600e3;   // 72 h — curated, rarely changes
  const TTL_RECENT   =  6 * 3600e3;   // 6 h  — new additions
  const TTL_GENRE    = 24 * 3600e3;   // 24 h — per genre

  /* ------ cover art with fade-in and colour placeholder ------ */
  /* Derive a soft background tint from the first letter's char code so each
     tile has a distinct placeholder colour before the image loads. */
  const COVER_HUES = [210, 160, 280, 35, 190, 320, 60, 240, 140, 300];
  const covStyle = () => P.coverStyle === 'modern' ? 'modern' : 'original';   // Original is the default; older saved choices (auto, Standard Ebooks) now mean Original
  const covHash = t => { let x = 5381; const q = String(t || '').trim().toLowerCase(); for (let i = 0; i < q.length; i++) x = ((x * 33) ^ q.charCodeAt(i)) >>> 0; return x; };
  function coverHue(title) {
    if (covStyle() !== 'original') return covHash(title) % 360;
    const c = (title || '').trim().toUpperCase().charCodeAt(0) || 65;
    return COVER_HUES[(c - 65) % COVER_HUES.length];
  }
  const coverVariant = title => (covHash(title) >>> 9) % 4;

  /* ------ our own copy of every cover (Hugging Face dataset, made by the Kaggle covers notebook) ------
     covers/index.json      {"v":1,"b":{"<LibriVox id>":["ol","se,ol",1342]}}  = [the program's best pick, the pictures that exist, Gutenberg id]. (The older plain form "se,ol,lv", first = best, is still read.)
     overrides (admin Worker, /public/cover-overrides.json)  {"version":1,"books":{"<id>":{"best":"ol","removed":["lv"]}}}  my choices from the dashboard: "best" goes first, "removed" is never shown. (The older form {"v":1,"b":{"<id>":{"best":..,"off":[..]}}} is still read.)
     covers/<floor(id/1000)>/<id>/<source>.webp   source = se (Standard Ebooks), ol (Open Library), pg (Gutenberg), lv (LibriVox)
     To use another dataset, change COV_REPO (and, if overrides.json lives somewhere else, COV_OVR_URL). */
  const COV_REPO = 'rabiul43/Book_Covers';
  const COV_ROOT = (HF_PROXY || 'https://huggingface.co') + '/datasets/' + COV_REPO + '/resolve/main/covers/';   // the Worker go-between when it is set (same as fetch does for other Hugging Face files)
  const COV_IDX_URL = 'https://huggingface.co/datasets/' + COV_REPO + '/resolve/main/covers/index.json';          // fetch() sends this through the Worker by itself
  /* My dashboard choices (Covers tab) are saved by the admin Worker and read back from its public address (set as "admin" in hosts.json; empty = no choices are read). */
  const COV_ADMIN = '__WT_HOST_ADMIN__';
  const COV_OVR_URL = COV_ADMIN ? COV_ADMIN + '/public/cover-overrides.json' : '';
  const COV_ORDER = ['se', 'ol', 'pg', 'lv'];
  const COV_WAIT = 5000;                  // a picture of our copy that has not loaded after this long is given up on: the next one is tried
  const COV_IDX_TTL = 12 * 3600e3, COV_OVR_TTL = 20 * 60e3, COV_START_WAIT = 2500;
  const COV = { idx: null, ovr: null, promise: null };
  /* The dashboard writes {"version":1,"books":{id:{best,removed}}}; the app works with {"v":1,"b":{id:{best,off}}}. */
  function covNormOvr(j) {
    if (!j || typeof j !== 'object') return null;
    if (j.v === 1 && j.b && typeof j.b === 'object') return j;
    if (j.books && typeof j.books === 'object') {
      const b = {};
      for (const id in j.books) { const o = j.books[id] || {}; b[id] = { best: o.best, off: Array.isArray(o.removed) ? o.removed : (Array.isArray(o.off) ? o.off : []) }; }
      return { v: 1, b };
    }
    return null;
  }
  async function covFetchJson(url, key, ttl, norm) {
    if (!url) return null;                  // no address set: this list is simply not used
    let d; try { d = await idb.get(key); } catch (e) { d = undefined; }
    if (d && d.j && Date.now() - (d.fetched || 0) < ttl) return d.j;
    try {
      const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 8000);
      const r = await fetch(url, { signal: ctl.signal, cache: 'no-cache' }); clearTimeout(to);
      if (r.ok) { let j = await r.json(); if (norm) j = norm(j); if (j && j.v === 1 && j.b && typeof j.b === 'object') { idb.set(key, { j, fetched: Date.now() }); return j; } }
    } catch (e) { /* offline or not made yet: the saved copy below */ }
    return d && d.j ? d.j : null;           // a saved copy of any age is better than none
  }
  /* Loads both files once (saved copies are used at once; old ones are renewed). Never rejects; no files = our copy is simply not used. */
  function covLoad() {
    return COV.promise || (COV.promise = Promise.all([covFetchJson(COV_IDX_URL, 'covidx', COV_IDX_TTL), covFetchJson(COV_OVR_URL, 'covovr', COV_OVR_TTL, covNormOvr)])
      .then(([i, o]) => { COV.idx = i && i.b; COV.ovr = o && o.b; COV.ready = true; }, () => { COV.ready = true; }));
  }
  setTimeout(() => covLoad(), 300);         // start early, so the first covers do not wait
  /* The pictures of our copy for one book, best first: my override, else the program's pick, then the others in the order se, ol, pg, lv. */
  function covOwn(b) {
    const id = String(b && b.id != null ? b.id : '');
    if (!/^\d{1,9}$/.test(id) || !COV.idx) return [];
    const e = COV.idx[id], o = COV.ovr && COV.ovr[id];
    const list = typeof e === 'string' ? e : (Array.isArray(e) ? String(e[1] || '') : null);   // "se,ol": plain form, or [best, "se,ol", gutenbergId]
    if (list === null && !(o && o.best)) return [];
    const have = list ? list.split(',').map(x => x.trim()).filter(x => COV_ORDER.includes(x)) : [];
    const pick = Array.isArray(e) && have.includes(e[0]) ? e[0] : null;                          // the program's own best pick (list form)
    const off = o && Array.isArray(o.off) ? o.off : [];
    let best = o && COV_ORDER.includes(o.best) && !off.includes(o.best) ? o.best : (pick && !off.includes(pick) ? pick : have.find(x => !off.includes(x)));
    const rest = COV_ORDER.filter(x => x !== best && have.includes(x) && !off.includes(x));
    const dir = COV_ROOT + Math.floor(+id / 1000) + '/' + id + '/';
    return (best ? [best].concat(rest) : rest).map(x => dir + x + '.webp');
  }

  /* One cover builder for every card, tile, resume card and the mini-player.
     Order: LibriVox art, then the Internet Archive image, then Open Library (looked up by title and author),
     and a generated cover (tinted, with the title) is always underneath, so no book is ever blank. */
  function coverSources(b) {
    const out = [];
    const add = u => { u = String(u || '').replace(/^http:/, 'https:'); if (u && !out.includes(u)) out.push(u); };
    add(b.cover);
    if (b.ia) add('https://archive.org/services/img/' + b.ia);
    return out;
  }
  /* Standard Ebooks: the Internet Archive mirrors every Standard Ebooks book (collection "standardebooks") and the item
     name is the same as the GitHub project name (author_title). We search the Archive for the exact book, then load its
     cover (images/cover.jpg from GitHub via jsDelivr, resized by weserv; the Archive thumbnail is the backup).
     The answer is remembered per book. */
  const seSlug = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/['\u2019`]/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  /* One topic per genre name. Different sources word the same genre differently ("Mystery & Detection", "Detective Fiction",
     "Crime & mysteries"), so every name is reduced to a topic key and the app shows one shelf or chip per topic. */
  const GENRE_TOPICS = [
    ['historicalfiction', /historical (fiction|novel)/], ['scifi', /science[- ]?fiction|sci-?fi/], ['horror', /horror|supernatural|ghost|gothic/],
    ['mystery', /detect|myster|crime|whodunit/], ['romance', /romanc|love stor/], ['children', /child|juvenile|kids/], ['fantasy', /fantas/],
    ['poetry', /poet|poem|verse/], ['drama', /\bplays?\b|drama|theat/], ['shortstories', /short (stor|fiction)/], ['humor', /humou?r|comed|satir/],
    ['adventure', /adventure|sea stor/], ['biography', /biograph|memoir/], ['history', /history/], ['philosophy', /philosoph/], ['religion', /religio|spiritual|theolog/],
    ['essays', /essay/], ['travel', /travel/], ['war', /\bwar\b|military/], ['nonfiction', /non[- ]?fiction/], ['fiction', /^(general |literary )?(fiction|stories|literature)$/]
  ];
  const genreTopic = t => {
    const x = String(t || '').toLowerCase().replace(/&/g, ' and ');
    for (const [k, re] of GENRE_TOPICS) if (re.test(x)) return k;
    return x.replace(/[^a-z0-9 ]+/g, ' ').replace(/\b(and|fiction|stories|story|literature|general)\b/g, ' ').replace(/\s+/g, ' ').trim() || x.trim();
  };
  const genreDedupe = list => { const seen = new Set(); return list.filter(g => { const k = genreTopic(g); if (seen.has(k)) return false; seen.add(k); return true; }); };
  function seUrls(id, large) {
    const direct = 'https://cdn.jsdelivr.net/gh/standardebooks/' + id + '@master/images/cover.jpg';
    const small = 'https://images.weserv.nl/?url=' + encodeURIComponent(direct.replace('https://', '')) + '&w=' + (large ? 900 : 360) + '&output=jpg&q=85';
    const pr = id.split('_'), site = pr.length >= 2 ? seSite(pr[0], pr[1], large) : null;
    return [site && { url: site, repo: id }, { url: small, repo: id }, { url: 'https://archive.org/services/img/' + id, repo: id }].filter(Boolean);
  }
  /* The cover Standard Ebooks itself serves for every book (also what its OPDS feed points to). */
  const seSite = (au, t, large) => 'https://standardebooks.org/ebooks/' + au + '/' + t + '/downloads/' + (large ? 'cover.jpg' : 'cover-thumbnail.jpg');
  const seTitleSlugs = tv => [...new Set(tv.flatMap(t => { const x = seSlug(t), y = x.replace(/^(the|a|an)-/, ''); return [x, y, 'the-' + y]; }).filter(Boolean))];
  /* If the Internet Archive cannot be reached, guess the Standard Ebooks project name (author_title) and try its cover directly. */
  function seGuess(b, large) {
    const first = String(b.authors || '').split(/[,;&]| and /)[0].trim(), au = seSlug(first);
    const t0 = String(b.title || '').replace(/\s*[\(\[].*?[\)\]]\s*/g, ' ').replace(/["]/g, '').trim();
    if (!au || /^unknown/i.test(first) || !t0) return [];
    const tv = [...new Set([t0, t0.split(/\s*[:;]\s*|\s+or,?\s+/i)[0].trim()].filter(Boolean))];
    const ts = seTitleSlugs(tv).slice(0, 3);
    return ts.map(t => ({ url: seSite(au, t, large) })).concat(ts.map(t => seUrls(au + '_' + t, large).find(o => /weserv/.test(o.url))).filter(Boolean));
  }
  const seKey = b => 'wt:se4:' + (b.id || b.title);
  function seCached(b) {                      // -> null (unknown) | '' (known miss) | identifier
    const c = store.get(seKey(b), null);
    if (!c) return null;
    if (c.r) return c.r;
    return (Date.now() - (c.t || 0) < 14 * 864e5) ? '' : null;
  }
  const sePending = new Map();
  function seLookup(b) {
    const hit = seCached(b);
    if (hit !== null) return Promise.resolve(hit);
    const key = seKey(b);
    if (sePending.has(key)) return sePending.get(key);
    const first = String(b.authors || '').split(/[,;&]| and /)[0].trim();
    const au = seSlug(first);
    const t0 = String(b.title || '').replace(/\s*[\(\[].*?[\)\]]\s*/g, ' ').replace(/["]/g, '').trim();
    const tv = [...new Set([t0, t0.split(/\s*[:;]\s*|\s+or,?\s+/i)[0].trim()].filter(Boolean))];
    const last = String(b.authorLast || first.split(/\s+/).pop() || '').replace(/["]/g, '');
    if (!au || /^unknown/i.test(first) || !tv.length || !last) return Promise.resolve('');
    const pr = olRun(async () => {
      const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 8000);
      try {
        const q = 'collection:standardebooks AND title:("' + tv[tv.length - 1] + '") AND creator:("' + last + '")';
        const r = await fetch('https://archive.org/advancedsearch.php?q=' + encodeURIComponent(q) + '&fl%5B%5D=identifier&rows=15&output=json', { signal: ctl.signal });
        if (!r.ok) return null;                            // network trouble: do not remember a miss
        const d = await r.json(), docs = (d && d.response && d.response.docs) || [];
        const slugs = seTitleSlugs(tv), lastS = seSlug(last);
        let found = '';
        for (const doc of docs) {
          const id = String(doc.identifier || ''), parts = id.split('_');
          // Standard Ebooks ids look like author_title or author_title_translator. LibriVox titles often leave out
          // (or add) a leading The / A / An, so the title is compared with and without it, and the author by full name or surname.
          const authOk = parts[0] === au || parts[0].split('-').includes(lastS);
          if (authOk && parts.slice(1).some(seg => slugs.includes(seg))) { found = id; break; }
        }
        store.set(key, found ? { r: found } : { r: '', t: Date.now() });
        return found;
      } catch (e) { return null; } finally { clearTimeout(to); }
    }).finally(() => sePending.delete(key));
    sePending.set(key, pr);
    return pr;
  }
  const olPending = new Map();
  let olActive = 0; const olQueue = [];
  function olRun(fn) { return new Promise(res => { olQueue.push(() => fn().then(res, () => res(''))); olPump(); }); }
  function olPump() {
    while (olActive < 2 && olQueue.length) { const job = olQueue.shift(); olActive++; job().then(() => { olActive--; olPump(); }); }
  }
  function openLibraryCover(b) {
    const key = 'wt:cov:' + (b.id || b.title);
    const c = store.get(key, null);
    if (c && typeof c.u === 'string') return Promise.resolve(c.u);
    if (olPending.has(key)) return olPending.get(key);
    const firstAuthor = String(b.authors || '').split(',')[0].trim();
    const last = b.authorLast || firstAuthor.split(/\s+/).pop() || '';
    const title = String(b.title || '').replace(/\s*[\(\[].*?[\)\]]\s*/g, ' ').trim().slice(0, 80);
    if (!title || !last || last === 'Unknown') return Promise.resolve('');
    const pr = olRun(async () => {
      const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 7000);
      try {
        const r = await fetch('https://openlibrary.org/search.json?limit=1&fields=cover_i&title=' + encodeURIComponent(title) + '&author=' + encodeURIComponent(last), { signal: ctl.signal });
        if (!r.ok) return '';
        const d = await r.json();
        const id = d && d.docs && d.docs[0] && d.docs[0].cover_i;
        const u = id ? 'https://covers.openlibrary.org/b/id/' + id + '-M.jpg' : '';
        store.set(key, { u });
        return u;
      } finally { clearTimeout(t); }
    }).finally(() => olPending.delete(key));
    olPending.set(key, pr);
    return pr;
  }
  function accRgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
    if (!d) return [0, 0, l];
    const s = d / (1 - Math.abs(2 * l - 1));
    const h = mx === r ? ((g - b) / d + (g < b ? 6 : 0)) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return [h * 60, s, l];
  }
  /* Dominant colourful hue of the cover; falls back to the same hue the placeholder cover uses. */
  async function coverColor(b) {
    if (covStyle() === 'modern' || covStyle() === 'se') return { h: coverHue(b.title), s: 52 };
    const key = 'wt:acc:' + b.id, c = store.get(key, null);
    if (c && typeof c.h === 'number') return c;
    try {
      const src = coverSources(b)[0];
      if (src) {
        const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 6000);
        const r = await fetch(src, { signal: ctl.signal }); clearTimeout(to);
        if (r.ok) {
          const bmp = await createImageBitmap(await r.blob());
          const cv = document.createElement('canvas'); cv.width = cv.height = 32;
          const cx = cv.getContext('2d', { willReadFrequently: true }); cx.drawImage(bmp, 0, 0, 32, 32);
          const d = cx.getImageData(0, 0, 32, 32).data, W = new Float32Array(24), HS = new Float32Array(24), SS = new Float32Array(24);
          for (let i = 0; i < d.length; i += 4) {
            if (d[i + 3] < 200) continue;
            const [h, s, l] = accRgbToHsl(d[i], d[i + 1], d[i + 2]);
            if (s < .28 || l < .16 || l > .88) continue;
            const w = s * (1 - Math.abs(l - .5)), k = Math.floor(h / 15) % 24;
            W[k] += w; HS[k] += h * w; SS[k] += s * w;
          }
          let best = 0; for (let k = 1; k < 24; k++) if (W[k] > W[best]) best = k;
          if (W[best] > 4) { const res = { h: Math.round(HS[best] / W[best]), s: Math.round(100 * SS[best] / W[best]) }; store.set(key, res); return res; }
        }
      }
    } catch (e) { /* no pixel access: use the placeholder hue below */ }
    return { h: coverHue(b.title), s: 52 };
  }
  /* Draws a cover into its box (and redraws it when the style changes): the tinted placeholder first (first letter .gc-i, title .gc-t,
     author .gc-a; the Modern style adds .mc and a pattern), then the real picture on top once it has loaded. A picture that fails
     tries the next source, then Open Library. The download mark (dlMarkPaint in 120) is kept. */
  let covHi = 4;   // how many of the first tile covers get high priority
  /* The player's blurred backdrop: a CSS blur of a screen-sized picture is costly to paint on weak phones. Instead the picture is drawn once
     into a tiny canvas (small size and the smoothing of the scaled-up canvas give the same soft look) and the picture itself is hidden.
     If drawing is not possible, the picture stays and the old CSS blur (50-new-reader-tabbar-settings.css) is used. */
  function softBackdrop(box, img) {
    try {
      const w = 24, hh = 36, c = document.createElement('canvas'); c.width = w; c.height = hh; c.className = 'bg-soft';
      const x = c.getContext('2d'); if (!x) return;
      try { x.filter = 'saturate(1.25) blur(1px)'; } catch (e) { /* older browser: no filter, the small size alone is soft enough */ }
      const iw = img.naturalWidth, ih = img.naturalHeight; if (!iw || !ih) return;
      const sc = Math.max(w / iw, hh / ih), dw = iw * sc, dh = ih * sc;   // cover, like object-fit: cover
      x.drawImage(img, (w - dw) / 2, (hh - dh) / 2, dw, dh);
      box.querySelectorAll('canvas.bg-soft').forEach(n => n.remove());
      box.classList.add('bg-soft-on'); box.insertBefore(c, img);
      requestAnimationFrame(() => c.classList.add('loaded'));
    } catch (e) { /* keep the picture and its CSS blur */ }
  }
  function coverFill(box, b) {
    const tok = box._cvT = (box._cvT || 0) + 1, mark = box._wtMk;
    box.textContent = '';
    box.style.setProperty('--ch', String(coverHue(b.title)));
    box.classList.remove('mc', 'mc-0', 'mc-1', 'mc-2', 'mc-3', 'bg-soft-on');
    if (covStyle() === 'modern') box.classList.add('mc', 'mc-' + coverVariant(b.title));
    const title = String(b.title || '').trim(), au = String(b.authors || '').split(',')[0].trim();
    const ini = (title.replace(/^(the|a|an)\s+/i, '').charAt(0) || '?').toUpperCase();
    box.append(h('span', { class: 'gc-i' }, ini), h('span', { class: 'gc-t' }, title), h('span', { class: 'gc-a' }, au));
    /* Order: my override, the program's pick and the other pictures of our copy (each given COV_WAIT to load), then the old
       sources (LibriVox art, Internet Archive, then Open Library), and the tinted box above stays if all fail. */
    let own = [], old = coverSources(b), i = 0, j = 0, olTried = false, tm = 0, started = false;
    const img = h('img', { alt: '', loading: 'lazy', decoding: 'async' });
    if (box._cls === 'tile-cover' && covHi > 0) { covHi--; img.loading = 'eager'; img.setAttribute('fetchpriority', 'high'); }   // the first few covers on Home load first
    const arm = ms => { clearTimeout(tm); tm = ms ? setTimeout(() => { if (tok === box._cvT && !img.classList.contains('loaded')) next(); }, ms) : 0; };
    const next = () => {
      if (tok !== box._cvT) { clearTimeout(tm); return; }
      if (i < own.length) { arm(COV_WAIT); img.src = own[i++]; return; }
      arm(0);
      if (j < old.length) { img.src = old[j++]; return; }
      if (olTried) { img.remove(); return; }
      olTried = true;
      let pr; try { pr = openLibraryCover(b); } catch (e) { pr = null; }
      if (!pr || !pr.then) { img.remove(); return; }
      pr.then(u => { if (tok !== box._cvT) return; if (u) img.src = u; else img.remove(); }, () => img.remove());
    };
    const start = () => { if (started || tok !== box._cvT) return; started = true; try { own = covOwn(b); } catch (e) { own = []; } next(); };
    img.addEventListener('load', () => { clearTimeout(tm); if (tok === box._cvT) { img.classList.add('loaded'); if (box._cls === 'pcover-bg') softBackdrop(box, img); } });
    img.addEventListener('error', next);
    box.append(img);
    if (mark) box.append(mark);
    if (COV.ready) start();
    else { covLoad().then(start); setTimeout(start, COV_START_WAIT); }   // the lists are normally ready at once; after 2.5 s the old sources start anyway
  }
  function coverBox(b, cls) {
    const box = h('div', { class: cls, 'aria-hidden': 'true', 'data-cv': '' });
    box._cls = cls; box._b = b;
    coverFill(box, b);
    return box;
  }
  /* Re-draw every cover already on screen after the style changes. */
  function coverRefresh() { document.querySelectorAll('[data-cv]').forEach(n => { if (n._b) coverFill(n, n._b); }); }
  function covSegSync() { const v = covStyle(); $$('#seg-cover button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === v))); }
  function tileCoverNode(b) { return coverBox(b, 'tile-cover'); }

