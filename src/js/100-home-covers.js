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

