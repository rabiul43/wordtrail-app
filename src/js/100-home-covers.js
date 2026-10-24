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
  guideDoc('settings', 'Book colours', "The player can take its colour from the book's cover. Turn it off in Settings > Reading.");
  /* ---------- per-book accent colour: the player takes its colour from the cover ---------- */
  const ACC = { cur: null, seq: 0 };
  const accLum = (r, g, b) => { const f = c => { c /= 255; return c <= .03928 ? c / 12.92 : Math.pow((c + .055) / 1.055, 2.4); }; return .2126 * f(r) + .7152 * f(g) + .0722 * f(b); };
  function accRgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
    if (!d) return [0, 0, l];
    const s = d / (1 - Math.abs(2 * l - 1));
    const h = mx === r ? ((g - b) / d + (g < b ? 6 : 0)) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return [h * 60, s, l];
  }
  function accHsl(h, s, l) {
    s /= 100; l /= 100;
    const k = n => (n + h / 30) % 12, a = s * Math.min(l, 1 - l), f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return [Math.round(255 * f(0)), Math.round(255 * f(8)), Math.round(255 * f(4))];
  }
  const accCss = rgb => 'rgb(' + rgb.join(',') + ')';
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
  function paintAccent() {
    const root = document.documentElement, a = ACC.cur, ks = ['--accent', '--accent-ink', '--accent-soft'];
    if (!a || P.bookColors === false) { ks.forEach(k => root.style.removeProperty(k)); return; }
    const bg = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(getComputedStyle(root).getPropertyValue('--bg').trim());
    const dark = bg ? accLum(parseInt(bg[1], 16), parseInt(bg[2], 16), parseInt(bg[3], 16)) < .2 : false;
    const s = Math.max(45, Math.min(80, a.s));
    const acc = accHsl(a.h, s, dark ? 64 : 40), soft = accHsl(a.h, Math.min(s, dark ? 40 : 70), dark ? 19 : 90);
    const L = accLum(acc[0], acc[1], acc[2]), ink = (1.05 / (L + .05)) >= ((L + .05) / .05) ? '#FFFFFF' : '#111111';
    root.style.setProperty('--accent', accCss(acc)); root.style.setProperty('--accent-soft', accCss(soft)); root.style.setProperty('--accent-ink', ink);
  }
  async function bookAccent(b) {
    const mine = ++ACC.seq;
    if (P.bookColors === false) return;
    const c = await coverColor(b);
    if (mine !== ACC.seq || !S.book || S.book.id !== b.id) return;
    ACC.cur = c; paintAccent();
  }
  function clearAccent() { ACC.seq++; ACC.cur = null; paintAccent(); }

  guideDoc('settings', 'Cover style', "Original shows the LibriVox cover art. Modern shows a clean designed cover instead.");
  /* Cover style (Settings): auto (default) = Standard Ebooks cover, then real art if sharp and book-shaped, else designed cover; se = Standard Ebooks or designed cover; modern = designed cover only; original = real art first. */
  function coverFill(box, b) {
    const st = covStyle(), title = (b.title || '?').trim();
    box.className = box._cls + (st === 'original' ? '' : ' mc mc-' + coverVariant(title));
    box.style.setProperty('--ch', coverHue(title));
    const keep = [...box.children].filter(c => c.classList.contains('dlmark'));   // the download mark survives a redraw
    box.textContent = '';
    box.append(h('span', { class: 'gc-i' }, title.charAt(0).toUpperCase()), h('span', { class: 'gc-t' }, title));
    if (st !== 'original') {
      const first = String(b.authors || '').split(/[,;&]| and /)[0].trim();
      box.append(h('span', { class: 'gc-a' }, first && !/^unknown/i.test(first) ? first : ''));
    }
    if (keep.length) box.append(...keep);
    const large = box._cls === 'pcover-art', tok = box._tok = (box._tok || 0) + 1;
    if (large && box.parentNode && box.parentNode.style) box.parentNode.style.removeProperty('--ar');   // redrawn (style change): back to the default shape until the new image loads
    const real = st === 'se' ? [] : coverSources(b);
    const begin = (seList, gk) => {
      if (box._tok !== tok) return;                       // style changed or box redrawn meanwhile
      const srcs = seList.map(o => o.url).concat(real);
      let i = 0, tried = false;
      const img = h('img', { alt: '', decoding: 'async', loading: 'lazy', referrerpolicy: 'no-referrer' });
      const isSe = () => img.dataset.se === '1';
      const good = () => isSe() || st !== 'auto' || (img.naturalWidth >= 300 && img.naturalHeight >= img.naturalWidth * 1.25 && img.naturalHeight <= img.naturalWidth * 1.9);
      const next = () => {
        if (gk && seList.length && i === seList.length) store.set(gk, { t: Date.now() });   // every guess failed
        if (i < srcs.length) { const o = seList[i]; img.dataset.se = o ? '1' : ''; img.src = srcs[i++]; return; }
        if (st === 'se' || tried) return;
        tried = true;
        openLibraryCover(b).then(u => { if (u && !srcs.includes(u)) { img.dataset.se = ''; img.src = st === 'auto' ? u.replace('-M.jpg', '-L.jpg') : u; } });
      };
      img.addEventListener('load', () => { if (img.naturalWidth > 1 && good()) { img.classList.add('loaded'); if (large && img.naturalHeight) { const po = box.parentNode; if (po && po.classList && po.classList.contains('pcover-poster')) po.style.setProperty('--ar', String(Math.min(1.8, Math.max(.5, img.naturalWidth / img.naturalHeight)).toFixed(3))); } if (gk && isSe()) store.set(gk, { u: img.src }); } else next(); });   // the player poster takes the cover's own shape, so a wide cover is shown whole instead of cropped
      img.addEventListener('error', next);
      box.append(img);   // attached straight away: a detached lazy image may never start loading
      next();
    };
    if (st === 'modern') return;
    if (st === 'original') return begin([]);
    seLookup(b).then(id => {
      if (id) return begin(seUrls(id, large));
      const gk = 'wt:seg:' + (b.id || b.title), g = store.get(gk, null);   // a guessed Standard Ebooks cover: remember the hit or the miss
      if (g && g.u) return begin([{ url: g.u }]);
      if (g && g.t && Date.now() - g.t < 14 * 864e5) return begin([]);
      begin(seGuess(b, large), gk);
    });
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

