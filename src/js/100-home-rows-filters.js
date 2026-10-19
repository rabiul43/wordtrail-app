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
    box.textContent = '';
    box.append(h('span', { class: 'gc-i' }, title.charAt(0).toUpperCase()), h('span', { class: 'gc-t' }, title));
    if (st !== 'original') {
      const first = String(b.authors || '').split(/[,;&]| and /)[0].trim();
      box.append(h('span', { class: 'gc-a' }, first && !/^unknown/i.test(first) ? first : ''));
    }
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

  /* ------ tile: vertical card used inside .hrow ------ */
  function tileNode(b, onOpen) {
    const dlBadge = h('span', { class: 'tile-badge dl', hidden: true }), lvBadge = h('span', { class: 'lvl tile-lvl', hidden: true }), cov = tileCoverNode(b);
    const rateBadge = h('span', { class: 'tile-rate', hidden: true });
    cov.append(lvBadge, rateBadge);
    rtSumLoad();
    const tile = h('button', {
      class: 'tile', type: 'button',
      'aria-label': b.title + (b.authors ? ', ' + b.authors : ''),
      onclick: onOpen
    },
      cov,
      h('span', { class: 'tile-t' }, b.title),
      h('span', { class: 'tile-a' }, b.authors || ''),
      b.total ? h('span', { class: 'tile-dur' }, fmtShort(b.total)) : null,
      dlBadge
    );
    tile._wtId = b.id;
    tile._wtTileDl = dlBadge; tile._wtTileLvl = lvBadge; tile._wtRate = rateBadge; tile._wtLabel = b.title + (b.authors ? ', ' + b.authors : '');
    if (b.id) paintTileBadge(tile);
    return tile;
  }

  /* Tiles stay quiet: the only badge that earns a place is "Available offline". */
  function paintTileBadge(tile) {
    if (!tile._wtTileDl) return;
    offDim(tile);
    const d = dlBadgeText(tile._wtId);
    tile._wtTileDl.textContent = d; tile._wtTileDl.classList.toggle('full', /^✓/.test(d));
    tile._wtTileDl.hidden = !d;
    if (tile._wtRate) { const rt = rtChipText(tile._wtId); tile._wtRate.textContent = rt; tile._wtRate.hidden = !rt; }
    const lb = tile._wtTileLvl; if (!lb) return;
    const v = LVL.map.get(String(tile._wtId)), t = v ? (LVL.tiers[v[0]] || '') : '', c = v && LVL.cefr[v[1]];
    lb.textContent = t ? t + (c ? ' \u00b7 ' + c[0] : '') : ''; lb.hidden = !t; lb.dataset.t = t ? v[0] : '';
    tile.setAttribute('aria-label', tile._wtLabel + (t ? '. Reading level: ' + t + (c ? ', CEFR ' + c[0] : '') : '') + (rtSpeak(tile._wtId) ? '. ' + rtSpeak(tile._wtId) : ''));
  }
  function paintTiles() {
    $$('.tile').forEach(t => { if (t._wtId && t._wtTileDl) paintTileBadge(t); });
  }

  /* ------ "Show more →" tile at end of a row ------ */
  function showMoreTile(onMore) {
    return h('button', {
      class: 'tile-more', type: 'button',
      'aria-label': 'See all',
      onclick: onMore
    },
      (() => {
        const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        s.setAttribute('viewBox', '0 0 24 24');
        s.setAttribute('aria-hidden', 'true');
        const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        p.setAttribute('d', 'M9 18l6-6-6-6');
        s.append(p);
        return s;
      })(),
      'See all'
    );
  }

  /* ------ skeleton tiles for a row while loading ------ */
  function rowSkeletons(container, count) {
    container.textContent = '';
    for (let i = 0; i < count; i++) {
      container.append(h('div', { class: 'tile sk', 'aria-hidden': 'true' },
        h('div', { class: 'tile-cover' }),
        h('div', { class: 'sk-l sk-k' }),
        h('div', { class: 'sk-l w90' }),
        h('div', { class: 'sk-l w60' }),
        h('div', { class: 'sk-l w40' })
      ));
    }
  }

  guideDoc('home', 'Refresh Home', "Pull down at the top of the Library tab to refresh the shelves.");
  /* ------ pull to refresh (Library tab, at the top of the page) ------ */
  const PTR_TRIGGER = 70;
  let ptrBusy = false;
  function markStale(key) { const c = store.get(key, null); if (c && Array.isArray(c.books)) store.set(key, Object.assign({}, c, { t: 0 })); }
  async function refreshHome() {
    if (ptrBusy) return;
    ptrBusy = true;
    markStale('wt:home:featured'); markStale('wt:home:recent');
    { const c = store.get('wt:daily', null); if (c) store.set('wt:daily', Object.assign({}, c, { t: 0 })); }
    const jobs = [loadFeatured(), loadRecentlyAdded(), loadDaily(), loadPicks()];
    const gi = GENRES.findIndex(g => g.lv === activeGenre);
    if (gi >= 0) {
      markStale('wt:genre:' + activeGenre);
      jobs.push(openGenre(GENRES[gi], $('#genre-chips').children[gi]));
    }
    await Promise.all([Promise.allSettled(jobs), new Promise(r => setTimeout(r, 700))]);
    ptrBusy = false;
  }
  function initPullToRefresh() {
    const ind = h('div', { id: 'ptr', class: 'ptr', 'aria-hidden': 'true' }, h('span', { class: 'ptr-dot' }));
    document.body.append(ind);
    let y0 = null, dy = 0;
    const active = () => curTab === 'library' && !seeOpen && !el.home.hidden && !sheetOpen() && window.scrollY <= 0 && !ptrBusy;
    const paint = (d, spin) => {
      ind.style.setProperty('--ptr', Math.min(d, 110) + 'px');
      ind.classList.toggle('show', d > 0 || spin);
      ind.classList.toggle('ready', d >= PTR_TRIGGER);
      ind.classList.toggle('spin', !!spin);
    };
    document.addEventListener('touchstart', e => {
      y0 = active() && e.touches.length === 1 ? e.touches[0].clientY : null; dy = 0;
    }, { passive: true });
    document.addEventListener('touchmove', e => {
      if (y0 == null) return;
      dy = Math.max(0, (e.touches[0].clientY - y0) * 0.5);
      if (window.scrollY > 0) { y0 = null; paint(0); return; }
      paint(dy);
    }, { passive: true });
    document.addEventListener('touchend', async () => {
      if (y0 == null) return;
      const go = dy >= PTR_TRIGGER; y0 = null;
      if (!go) { paint(0); return; }
      paint(PTR_TRIGGER, true);
      await refreshHome();
      paint(0);
    }, { passive: true });
    document.addEventListener('touchcancel', () => { y0 = null; paint(0); }, { passive: true });
  }

  /* ------ fill a row with tiles + a "see all" tile at the end ------ */
  function fillRow(container, books, onMore, limit) {
    container.textContent = '';
    if (!books.length) return;
    const shown = limit ? books.slice(0, limit) : books;
    shown.forEach(b => container.append(tileNode(b, () => openDetail(b))));
    if (onMore) container.append(showMoreTile(onMore));
  }

  /* ------ stale-while-revalidate helper ------ */
  /* Shows cached data immediately, fires a background refresh, and swaps in
     fresh data silently once it arrives — no spinner, no flash. */
  async function swr(cacheKey, ttl, fetcher, onData, onError) {
    const cached = store.get(cacheKey, null);
    const fresh = cached && Array.isArray(cached.books) && cached.books.length;
    const stale = fresh && (Date.now() - cached.t > ttl);

    if (fresh) onData(cached.books, /* fromCache */ true);

    if (!fresh || stale) {
      try {
        const books = await fetcher();
        if (!books || !books.length) throw new Error('empty');
        store.set(cacheKey, { t: Date.now(), books });
        onData(books, /* fromCache */ false);
      } catch (e) {
        if (!fresh) onError(e);
        // If we had stale data, keep showing it — don't flash an error
      }
    }
  }

  /* ------ one book, one row per screen ------
     Rows on the same screen are filled by separate loaders that finish in any order, so each screen keeps the FULL list
     every loader received (RW) and repaints its rows top to bottom, skipping any book a higher row already shows.
     Painting is repeatable: when a higher row arrives late, the lower rows simply paint again without it.
     Collections > #col-extra: Trending, then Featured, then Recently added.
     Library: Picked for you (whatever chip is chosen) above New this week. */
  const RW = { trending: null, featured: null, recent: null, nw: null };
  const bookKey = b => String(b && b.id);
  function colExtraPaint() {
    const seen = new Set();
    [['trending', '#trending-row', '#sec-trending', 20, 3, null],
     ['featured', '#featured-row', '#sec-featured', HOME_LIMIT, 1, () => openSeeAll(SEE_FEATURED)],
     ['recent', '#recent-row', '#sec-recent', HOME_LIMIT, 1, () => openSeeAll(SEE_RECENT)]].forEach(([k, rowSel, secSel, limit, min, more]) => {
      if (!RW[k]) return;   // not loaded yet (or it failed and shows its own error card): leave the row alone
      const row = $(rowSel), sec = $(secSel);
      const books = RW[k].filter(b => !seen.has(bookKey(b))).slice(0, limit);
      if (books.length < min) { row.textContent = ''; sec.hidden = true; return; }   // nothing new left for this row: hide it rather than show a repeat
      books.forEach(b => seen.add(bookKey(b)));
      fillRow(row, books, more, limit);
      sec.hidden = false;
    });
  }
  /* New this week, minus the books "Picked for you" (and a visible Book of the day) already show on Library */
  function newWeekPaint() {
    if (!RW.nw) return;
    const nrow = $('#newweek-row'), nsec = $('#sec-newweek');
    const seen = new Set($$('.tile', $('#sec-picks')).map(t => t._wtId).filter(Boolean).map(String));
    const bo = $('#sec-botd .botd-hero'); if (bo && !$('#sec-botd').hidden && RW.botd) seen.add(String(RW.botd));
    const books = RW.nw.filter(b => !seen.has(bookKey(b))).slice(0, 20);
    if (books.length >= 3) { fillRow(nrow, books, null, 20); nsec.hidden = false; } else { nrow.textContent = ''; nsec.hidden = true; }
  }

  /* ------ Featured section ------ */
  async function loadFeatured() {
    const row = $('#featured-row'), sec = $('#sec-featured'), errEl = $('#featured-err');
    errEl.hidden = true;

    // Show skeletons only on a cold load (no cache at all)
    const cached = store.get('wt:home:featured', null);
    if (!cached || !cached.books || !cached.books.length) {
      rowSkeletons(row, 6);
      sec.hidden = false;
    }

    await swr(
      'wt:home:featured',
      TTL_FEATURED,
      async () => {
        const results = await Promise.allSettled(
          FEATURED_IDS.map(id => lvGet({ id }, { light: true }))
        );
        return results
          .filter(r => r.status === 'fulfilled' && r.value.length)
          .map(r => r.value[0]);
      },
      (books) => {
        RW.featured = books;
        colExtraPaint();   // skips books Trending already shows
      },
      () => {
        row.textContent = '';
        row.append(stateNode('error', "Couldn't load featured books", 'LibriVox did not answer.', 'Try again', () => loadFeatured()));
        sec.hidden = false;
      }
    );
  }

  /* ------ Recently Added section ------ */
  async function loadRecentlyAdded() {
    const row = $('#recent-row'), sec = $('#sec-recent');

    const cached = store.get('wt:home:recent', null);
    if (!cached || !cached.books || !cached.books.length) {
      rowSkeletons(row, 6);
      sec.hidden = false;
    }

    // LibriVox uses `since` as a Unix timestamp, not a date string
    const sinceTs = Math.floor((Date.now() - 90 * 24 * 3600e3) / 1000);

    await swr(
      'wt:home:recent',
      TTL_RECENT,
      () => lvGet({ since: sinceTs, limit: 20 }, { light: true }),
      (books) => {
        RW.recent = books;
        colExtraPaint();   // skips books Trending and Featured already show
      },
      () => {
        row.textContent = '';
        row.append(stateNode('error', "Couldn't load new books", 'LibriVox did not answer.', 'Try again', () => loadRecentlyAdded()));
        sec.hidden = false;
      }
    );
  }

  /* ------ Genre chips + results ------ */
  const GENRE_KEY = 'wt:active-genre';
  let activeGenre = null;

  const plural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');

  function genreEls() {
    return { wrap: $('#genre-results'), count: $('#genre-count'), note: $('#genre-note'), list: $('#genre-list'), more: $('#genre-more') };
  }

  function genreSkeletons(list, n) {
    list.textContent = '';
    for (let i = 0; i < n; i++) {
      list.append(h('div', { class: 'card sk', 'aria-hidden': 'true' },
        h('div', { class: 'cover' }),
        h('div', {}, h('div', { class: 'sk-l w60' }), h('div', { class: 'sk-l w40' })),
        h('span')));
    }
  }

  /* Collapse the genre panel and forget the selection (used by chip re-tap and by any search). */
  function clearGenre() {
    activeGenre = null;
    document.body.classList.remove('genre-on');
    store.set(GENRE_KEY, null);
    const chips = $('#genre-chips');
    if (chips) $$('.genre-chip', chips).forEach(c => c.setAttribute('aria-pressed', 'false'));
    const e = genreEls();
    if (!e.wrap) return;
    e.wrap.hidden = true;
    e.list.textContent = '';
    e.count.hidden = true;
    e.note.hidden = true;
    e.more.hidden = true;
  }

  function renderGenre(g, books) {
    const e = genreEls();
    const viaSearch = books.some(b => b.viaSearch);
    e.count.textContent = plural(books.length, 'recording') + ' in ' + g.label;
    e.count.hidden = false;
    e.note.textContent = viaSearch ? "Showing search results for '" + g.label + "'" : '';
    e.note.hidden = !viaSearch;
    e.list.textContent = '';
    const cards = books.map(b => bookCard(b, () => openDetail(b)));
    e.list.append(...cards);
    checkReady(cards);
    e.more.hidden = false;
  }

  let retryGenreLater = null;
  window.addEventListener('online', () => { const f = retryGenreLater; retryGenreLater = null; if (f) f(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && retryGenreLater) { const f = retryGenreLater; retryGenreLater = null; f(); } });
  /* Warm the genre caches quietly, one at a time, so tapping a genre is instant. */
  async function prefetchGenres() {
    for (const g of GENRES) {
      const key = 'wt:genre:' + g.lv, c = store.get(key, null);
      if (c && c.books && c.books.length && Date.now() - c.t < TTL_GENRE) continue;
      try { const b = await lvGet({ genre: g.lv, limit: 20 }, { light: true }); if (b.length) store.set(key, { t: Date.now(), books: b }); } catch (e) {}
      await new Promise(r => setTimeout(r, 1500));
    }
  }

  async function openGenre(g, chip) {
    retryGenreLater = null;
    const chips = $('#genre-chips');
    $$('.genre-chip', chips).forEach(c => c.setAttribute('aria-pressed', 'false'));
    activeGenre = g.lv;
    document.body.classList.add('genre-on');
    store.set(GENRE_KEY, g.lv);
    chip.setAttribute('aria-pressed', 'true');

    const e = genreEls();
    e.wrap.hidden = false;
    e.count.hidden = true;
    e.note.hidden = true;
    e.more.hidden = true;

    const cacheKey = 'wt:genre:' + g.lv;
    const cached = store.get(cacheKey, null);
    if (!cached || !cached.books || !cached.books.length) genreSkeletons(e.list, 4);

    await swr(
      cacheKey,
      TTL_GENRE,
      async () => {
        const books = await lvGet({ genre: g.lv, limit: 20 }, { light: true });
        if (books.length) return books;
        // LibriVox's genre taxonomy is inconsistent: fall back to a normal search for the label
        const found = await searchBooks(g.q);
        return found.slice(0, 20).map(b => Object.assign({}, b, { viaSearch: true }));
      },
      (books) => {
        if (activeGenre !== g.lv) return; // user switched genre mid-load
        renderGenre(g, books);
      },
      (err) => {
        if (activeGenre !== g.lv) return;
        e.count.hidden = true;
        e.note.hidden = true;
        e.list.textContent = '';
        if (err && err.message === 'empty') {
          e.list.append(stateNode('empty', 'Nothing in ' + g.label + ' yet', 'Try a search instead.', 'Search ' + g.label, () => { el.q.value = g.q; doSearch(g.q); window.scrollTo({ top: 0, behavior: motionOk() }); }));
          e.more.hidden = false;
        } else {
          e.list.append(stateNode('error', "Couldn't load " + g.label, 'LibriVox is slow right now. Retrying when you are back online or in a moment.', 'Try again', () => openGenre(g, chip)));
          retryGenreLater = () => openGenre(g, chip);
          e.more.hidden = true;
        }
      }
    );
  }

  function toggleGenre(g, chip) {
    if (activeGenre === g.lv) clearGenre(); else openGenre(g, chip);
    if (fltActiveCount()) applyFilters();
  }

  guideDoc('home', 'Genres and filters', "Tap the Filters button next to the search bar to sort (newest, top rated, shortest) and to narrow by genre, level (CEFR and age guides), length, mood, minimum rating, language and narrator. Books with fewer than 5 ratings are left out of Top rated and the rating filter. Active filters show as chips under the bar. Clear all resets them.");
  /* ---------- browse filters: length, mood, language, narrator ----------
     Everything runs on the local catalog. Mood is a best guess from each book's genres and title words
     (the catalog has no mood field). The catalog has no narrator field either, so the narrator list is
     made of the narrators of books you have opened. An active genre chip narrows the filtered list too. */
  const FLT_LEN = [['short', 'Under 2 h', 0, 2 * 3600], ['medium', '2 to 6 h', 2 * 3600, 6 * 3600], ['long', '6 to 12 h', 6 * 3600, 12 * 3600], ['epic', 'Over 12 h', 12 * 3600, 1e9]];
  const FLT_MOODS = [
    { k: 'cozy', label: 'Cozy', g: ['children', 'humor', 'romance', 'domestic', 'nature', 'family', 'essay'], t: /\b(tea|garden|home|cottage|village|christmas|family|little|fairy|house|kitchen|winter|spring|farm)\b/i },
    { k: 'spooky', label: 'Spooky', g: ['horror', 'gothic', 'ghost', 'supernatural'], t: /\b(ghosts?|haunt\w*|vampires?|dracula|frankenstein|witch\w*|demons?|terror|monsters?|grave|dead|death|dark|curse\w*|shadows?|horror|weird|macabre)\b/i },
    { k: 'adventurous', label: 'Adventurous', g: ['adventure', 'western', 'sea', 'pirate', 'war', 'exploration', 'travel'], t: /\b(island|treasure|voyage|journey|adventures?|quest|expedition|pirates?|explorers?|captain|ship|jungle)\b/i },
    { k: 'romantic', label: 'Romantic', g: ['romance', 'love'], t: /\b(love|heart|bride|marriage|lover|romance|courtship|wedding)\b/i },
    { k: 'mysterious', label: 'Mysterious', g: ['mystery', 'detective', 'crime', 'thriller'], t: /\b(murder|detective|mystery|case|crime|secret|clue|thief|poison|holmes)\b/i },
    { k: 'funny', label: 'Funny', g: ['humor', 'satire', 'comedy', 'comic'], t: /\b(funny|humou?r\w*|jest\w*|comedy|laugh\w*|nonsense|wit)\b/i },
    { k: 'thoughtful', label: 'Thoughtful', g: ['philosoph', 'essay', 'religion', 'psycholog', 'ethic', 'self-help'], t: /\b(thoughts|meditations?|wisdom|philosophy|reflections|essays?|mind|soul)\b/i }
  ];
  const FLT_LVL = [['easy', 'Easy \u00b7 A2\u2013B1', 0], ['medium', 'Medium \u00b7 B2', 1], ['hard', 'Hard \u00b7 C1\u2013C2', 2]];
  /* Level and read-along filters are shared by the search chips and the Library filters, and combine:
     any chosen level (Easy, Medium and Hard can be mixed) AND read-along ready, when it is on. */
  const LF = { lvl: new Set(), ready: false };
  function lfReadAlong(b) {
    const id = String(b.id), v = VER.ready && VER.map.get(id);
    if (v && v.tm) return true;
    if (store.get('wt:rdy:' + id, null) === 1) return true;
    const l = store.get('wt:sync:' + id, null); return !!(l && l.done > 0);
  }
  function lfMatch(b) {
    if (LF.lvl.size) { const v = LVL.map.get(String(b.id)); if (!v || !LF.lvl.has(v[0])) return false; }
    return !LF.ready || lfReadAlong(b);
  }
  const lfActive = () => LF.lvl.size > 0 || LF.ready;
  function lfPaint() {
    $$('#sfilt .fchip[data-lvl]').forEach(b => b.setAttribute('aria-pressed', String(LF.lvl.has(+b.dataset.lvl))));
    $$('#flt-lvl button').forEach(b => b.setAttribute('aria-pressed', String(LF.lvl.has(+b.dataset.v))));
    { const r = $('#flt-ready'); if (r) r.setAttribute('aria-checked', String(LF.ready)); }
  }
  async function lfToggle(kind, v, from) {
    if (kind === 'lvl') { if (LF.lvl.has(v)) LF.lvl.delete(v); else LF.lvl.add(v); } else LF.ready = !LF.ready;
    lfPaint();
    try { if (LF.lvl.size && !LVL.ready) await LVL.load(); if (LF.ready && !VER.ready) await VER.load(); } catch (e) { /* use what loaded */ }
    if (from === 'search') { if (el.q.value.trim() && !el.results.hidden) showBooks(RS.all); } else applyFilters();
  }
  const FLT = { len: '', mood: '', lang: '', nar: '', rate: '', sort: '', shown: 0 };
  /* Sort by (Newest is the default, so '' means Newest) and Minimum rating. Both need the ratings summary (135-ratings.js),
     which only has books with at least 5 ratings, so a rating filter or Top rated leaves unrated books out. Calm mode
     hides the rating controls and ignores them. */
  const FLT_SORTS = [['new', 'Newest'], ['rated', 'Top rated'], ['short', 'Shortest']];
  const FLT_RATES = [['', 'Any'], ['3', '3\u2605 +'], ['4', '4\u2605 +'], ['4.5', '4.5\u2605 +']];
  const fltRate = () => rtCalm() ? '' : FLT.rate, fltSort = () => FLT.sort === 'rated' && rtCalm() ? '' : FLT.sort;
  function fltSegPaint() {
    [['#flt-sort', 'sort', 'new'], ['#flt-rate', 'rate', '']].forEach(([q, k, d]) => $$(q + ' button').forEach(x => x.setAttribute('aria-pressed', String((FLT[k] || d) === x.dataset.v))));
  }
  function fltSeg(host, items, key, dflt) {
    host.textContent = '';
    items.forEach(([v, label]) => { const b = h('button', { type: 'button', 'aria-pressed': 'false', onclick: () => { FLT[key] = v === dflt ? '' : v; fltSegPaint(); applyFilters(); } }, label); b.dataset.v = v; host.append(b); });
    fltSegPaint();
  }
  const FLT_PAGE = 30;
  function fltNarrators() {
    const m = new Map();
    try { Object.keys(localStorage).forEach(k => { if (k.indexOf('wt:rdr:') === 0) { const n = store.get(k, ''); if (n && typeof n === 'string') { if (!m.has(n)) m.set(n, new Set()); m.get(n).add(k.slice(7)); } } }); } catch (e) { /* storage unavailable */ }
    return m;
  }
  function fltMatch(b, nar, genreWords) {
    if (!lfMatch(b)) return false;
    if (FLT.len) { const L = FLT_LEN.find(x => x[0] === FLT.len); if (!(b.total > 0) || b.total < L[2] || b.total >= L[3]) return false; }
    if (FLT.mood) {
      const M = FLT_MOODS.find(x => x.k === FLT.mood), tags = MOODS.ready ? MOODS.data.b[String(b.id)] : null;
      if (tags) { const mi = MOODS.data.moods.findIndex(m => m[0] === FLT.mood); if (!tags.includes(mi)) return false; }
      else if (!(M.g.some(w => b._g.includes(w)) || M.t.test(b.title))) return false; // book not tagged yet: keyword guess
    }
    if (FLT.lang) { if ((b.lang || 'English').toLowerCase() !== FLT.lang.toLowerCase()) return false; }
    else if (!P.otherLangs && b.lang && !/^english$/i.test(b.lang)) return false;
    if (nar && !nar.has(b.id)) return false;
    const rate = fltRate();
    if (rate || fltSort() === 'rated') { const i = rtInfo(b.id); if (!i || (rate && i.avg < +rate)) return false; }
    if (genreWords && !genreWords.every(w => b._g.includes(w))) return false;
    return true;
  }
  function fltActiveCount() { return (FLT.len ? 1 : 0) + (LF.lvl.size ? 1 : 0) + (LF.ready ? 1 : 0) + (FLT.mood ? 1 : 0) + (FLT.lang ? 1 : 0) + (FLT.nar ? 1 : 0) + (fltRate() ? 1 : 0) + (fltSort() ? 1 : 0); }
  async function applyFilters(more) {
    const n = fltActiveCount(), res = $('#filter-results'), g = genreEls();
    { const dn = $('#fp-done'); if (dn && !n) dn.textContent = 'Done'; }
    if (!n) { res.hidden = true; $('#filter-list').textContent = ''; if (g.wrap && activeGenre) g.wrap.hidden = false; return; }
    if (g.wrap) g.wrap.hidden = true; // the filtered list stands in for the genre list while filters are on
    res.hidden = false;
    await catLoad();
    const list = $('#filter-list'), count = $('#filter-count'), moreBtn = $('#filter-more');
    if (!CAT.books || !CAT.books.length) { list.textContent = ''; count.textContent = 'Filters need the book catalog, which has not loaded yet. Check your connection and try again.'; moreBtn.hidden = true; return; }
    if (LF.ready) { try { await VER.load(); } catch (e) { /* use what loaded */ } }
    if (LF.lvl.size) {
      await LVL.load();
      if (!LVL.ready) { list.textContent = ''; count.textContent = 'Reading levels have not loaded yet. Check your connection and try again.'; moreBtn.hidden = true; return; }
    }
    if (FLT.mood) await MOODS.load(); // if it cannot load, the keyword guess is used
    const nar = FLT.nar ? (fltNarrators().get(FLT.nar) || new Set()) : null;
    const gdef = activeGenre ? GENRES.find(x => x.lv === activeGenre) : null;
    const gw = gdef ? String(gdef.lv).replace(/\+/g, ' ').toLowerCase().split(/\s+/) : null;
    if (fltRate() || fltSort() === 'rated') {
      await rtSumLoad();
      if (!RTSUM.ready) { list.textContent = ''; count.textContent = 'Ratings have not loaded yet. Check your connection and try again.'; moreBtn.hidden = true; return; }
    }
    const so = fltSort(), byNew = (a, b) => (+b.id) - (+a.id);
    const cmp = so === 'rated' ? (a, b) => rtCmp(a, b) || byNew(a, b) : so === 'short' ? (a, b) => (a.total || 1e12) - (b.total || 1e12) || byNew(a, b) : byNew;
    const all = CAT.books.filter(b => fltMatch(b, nar, gw)).sort(cmp);
    FLT.matches = all;
    FLT.shown = more ? Math.min(all.length, FLT.shown + FLT_PAGE) : Math.min(all.length, FLT_PAGE);
    count.textContent = all.length ? plural(all.length, 'audiobook') + (gdef ? ' in ' + gdef.label : '') : 'No audiobooks match these filters.';
    { const dn = $('#fp-done'); if (dn) dn.textContent = all.length ? 'Show ' + plural(all.length, 'book') : 'Done'; }
    if (!more) list.textContent = '';
    const from = more ? list.children.length : 0;
    const cards = all.slice(from, FLT.shown).map(({ _t, _a, _l, _g, ...b }) => bookCard(b, () => openDetail(b)));
    list.append(...cards);
    checkReady(cards);
    moreBtn.hidden = FLT.shown >= all.length;
  }
  function fltChips(host, items, key) {
    host.textContent = '';
    items.forEach(([v, label]) => {
      const b = h('button', { type: 'button', 'aria-pressed': 'false', onclick: () => { FLT[key] = FLT[key] === v ? '' : v; $$('button', host).forEach(x => x.setAttribute('aria-pressed', String(x.dataset.v === FLT[key]))); applyFilters(); } }, label);
      b.dataset.v = v; host.append(b);
    });
  }
  async function fltFillSelects() {
    await catLoad();
    const ls = $('#flt-lang'), ns = $('#flt-nar');
    if (CAT.books && CAT.books.length) {
      const cnt = new Map(); CAT.books.forEach(b => { const l = b.lang || 'English'; cnt.set(l, (cnt.get(l) || 0) + 1); });
      const langs = [...cnt.entries()].sort((a, b) => b[1] - a[1]);
      ls.textContent = '';
      ls.append(h('option', { value: '' }, P.otherLangs ? 'Any language' : 'English (change in Settings)'));
      langs.forEach(([l, c]) => ls.append(h('option', { value: l }, l + ' (' + c + ')')));
      ls.value = FLT.lang;
    }
    const nm = fltNarrators(), names = [...nm.keys()].sort();
    ns.textContent = '';
    ns.append(h('option', { value: '' }, 'Any narrator'));
    names.forEach(n => ns.append(h('option', { value: n }, n + ' (' + nm.get(n).size + ')')));
    ns.value = FLT.nar;
    $('#flt-nar-help').textContent = names.length ? 'Narrators of the books you have opened.' : 'Narrators appear here once you have opened a few books. The catalog does not list narrators.';
  }
  /* ---------- Filters: one bottom sheet (#fpanel) ----------
     Sort, Minimum rating, Level, Length, Mood, Genre, Language, Narrator and Read-along ready live here. The scope chips under the
     search bar (All, Title, Author, Genre) only choose what the search looks in. The sheet is a normal .sheet, so the backdrop,
     Back button and Close work like every other sheet. "Show N books" is updated by applyFilters as filters change. */
  function fpanelSet(open) {
    const p = $('#fpanel'), b = $('#btn-fpanel');
    if (!p || !b) return;
    if (open) { fltFillSelects(); applyFilters(); openSheet('fpanel'); }
    else if (!p.hidden) { p.hidden = true; if (!$$('.sheet').some(x => !x.hidden)) el.backdrop.hidden = true; histSoon(); }
  }
  function fltClearAll() {
    if (activeGenre) clearGenre();
    FLT.len = FLT.mood = FLT.lang = FLT.nar = FLT.rate = FLT.sort = ''; LF.lvl.clear(); LF.ready = false; lfPaint(); fltSegPaint();
    $$('#flt-len button, #flt-mood button').forEach(x => x.setAttribute('aria-pressed', 'false'));
    $('#flt-lang').value = ''; $('#flt-nar').value = ''; applyFilters();
  }
  function fpanelChips() {
    const host = $('#fchips'); if (!host) return;
    const items = [];
    const g = activeGenre ? GENRES.find(x => x.lv === activeGenre) : null;
    if (g) items.push([g.label, () => clearGenre()]);
    FLT_LVL.forEach(([k, label, tier]) => { if (LF.lvl.has(tier)) items.push([label.split(' \u00b7 ')[0], () => lfToggle('lvl', tier, 'lib')]); });
    if (LF.ready) items.push(['Read-along ready', () => lfToggle('ready', 0, 'lib')]);
    if (FLT.len) { const x = FLT_LEN.find(y => y[0] === FLT.len); if (x) items.push([x[1], () => { FLT.len = ''; $$('#flt-len button').forEach(b => b.setAttribute('aria-pressed', 'false')); applyFilters(); }]); }
    if (FLT.mood) { const x = FLT_MOODS.find(y => y.k === FLT.mood); if (x) items.push([x.label, () => { FLT.mood = ''; $$('#flt-mood button').forEach(b => b.setAttribute('aria-pressed', 'false')); applyFilters(); }]); }
    if (fltSort()) { const x = FLT_SORTS.find(y => y[0] === fltSort()); if (x) items.push(['Sort: ' + x[1], () => { FLT.sort = ''; fltSegPaint(); applyFilters(); }]); }
    if (fltRate()) { const x = FLT_RATES.find(y => y[0] === fltRate()); if (x) items.push([x[1].replace(' +', '+') + ' rated', () => { FLT.rate = ''; fltSegPaint(); applyFilters(); }]); }
    if (FLT.lang) items.push([FLT.lang, () => { FLT.lang = ''; $('#flt-lang').value = ''; applyFilters(); }]);
    if (FLT.nar) items.push(['Narrator: ' + FLT.nar, () => { FLT.nar = ''; $('#flt-nar').value = ''; applyFilters(); }]);
    const sig = items.map(i => i[0]).join('|');
    if (host._sig === sig) return;
    host._sig = sig; host.textContent = '';
    items.forEach(([label, off]) => host.append(h('button', { type: 'button', 'aria-label': 'Remove filter ' + label, onclick: () => { off(); setTimeout(fpanelBadge, 0); setTimeout(fpanelBadge, 350); } }, label, h('span', { class: 'x', 'aria-hidden': 'true' }, '\u2715'))));
    if (items.length > 1) host.append(h('button', { type: 'button', class: 'clear', onclick: () => { fltClearAll(); setTimeout(fpanelBadge, 0); setTimeout(fpanelBadge, 350); } }, 'Clear all'));
    host.hidden = !items.length;
  }
  function fpanelBadge() {
    const n = fltActiveCount() + (activeGenre ? 1 : 0), bd = $('#fpanel-n'), b = $('#btn-fpanel');
    if (!bd || !b) return;
    bd.hidden = !n; bd.textContent = String(n);
    b.setAttribute('aria-label', n ? 'Filters, ' + n + ' active' : 'Filters');
    fpanelChips();
  }
  function initFpanel() {
    const p = $('#fpanel'), b = $('#btn-fpanel');
    if (!p || !b || b._wt) return;
    b._wt = true;
    b.addEventListener('click', () => fpanelSet(p.hidden));
    $('#fp-done').addEventListener('click', () => fpanelSet(false));
    { const ff = $('#f-find'); if (ff) ff.addEventListener('click', () => fpanelSet(false)); }
    $('#fp-clear').addEventListener('click', () => { fltClearAll(); setTimeout(fpanelBadge, 0); });
    $('#genre-chips').addEventListener('click', () => { setTimeout(fpanelBadge, 350); }); 
    p.addEventListener('change', () => setTimeout(fpanelBadge, 0));
    new MutationObserver(fpanelBadge).observe(p, { attributes: true, attributeFilter: ['aria-pressed', 'aria-checked'], subtree: true });
    /* keep the Filters button in step with the sheet however it was closed (Close, backdrop, Back, Done) and hand focus back to it */
    new MutationObserver(() => { const o = !p.hidden; b.setAttribute('aria-expanded', String(o)); if (!o && b._open && !$$('.sheet').some(x => !x.hidden)) { try { b.focus({ preventScroll: true }); } catch (e) { /* ignore */ } } b._open = o; }).observe(p, { attributes: true, attributeFilter: ['hidden'] });
    el.q.addEventListener('input', () => { if (el.q.value && !p.hidden) fpanelSet(false); });
    fpanelBadge();
  }

  function initFilters() {
    { const host = $('#flt-lvl'); host.textContent = '';
      FLT_LVL.forEach(([k, label, tier]) => { const b = h('button', { type: 'button', 'aria-pressed': 'false', onclick: () => lfToggle('lvl', tier, 'lib') }, label); b.dataset.v = tier; b.dataset.t = tier; host.append(b); });
      $('#flt-ready').addEventListener('click', () => lfToggle('ready', 0, 'lib')); lfPaint(); }
    fltSeg($('#flt-sort'), FLT_SORTS, 'sort', 'new');
    fltSeg($('#flt-rate'), FLT_RATES, 'rate', '');
    fltChips($('#flt-len'), FLT_LEN.map(x => [x[0], x[1]]), 'len');
    fltChips($('#flt-mood'), FLT_MOODS.map(x => [x.k, x.label]), 'mood');
    $('#flt-lang').addEventListener('change', e => { FLT.lang = e.target.value; applyFilters(); });
    $('#flt-nar').addEventListener('change', e => { FLT.nar = e.target.value; applyFilters(); });
    $('#filter-more').addEventListener('click', () => applyFilters(true));
  }
  function buildGenreChips() {
    const container = $('#genre-chips');
    const sec = $('#sec-genre');
    container.textContent = '';

    GENRES.forEach(g => {
      const chip = h('button', {
        class: 'genre-chip', type: 'button', 'aria-pressed': 'false',
        onclick: () => toggleGenre(g, chip)
      },
        h('span', { class: 'gic', 'aria-hidden': 'true' }, g.icon),
        g.label
      );
      container.append(chip);
    });

    $('#genre-more').addEventListener('click', () => {
      const g = GENRES.find(x => x.lv === activeGenre);
      if (!g) return;
      el.q.value = g.q;
      const cb = $('#btn-clear-q'); if (cb) cb.hidden = false;
      doSearch(g.q);
      window.scrollTo({ top: 0, behavior: motionOk() });
    });

    sec.hidden = false;

    // Re-expand the last selected genre (page reload or returning from a book)
    const saved = store.get(GENRE_KEY, null);
    const idx = GENRES.findIndex(g => g.lv === saved);
    if (idx >= 0) {
      const chip = container.children[idx];
      openGenre(GENRES[idx], chip);
      // centre the chip horizontally inside the row without scrolling the page
      const cr = container.getBoundingClientRect(), r = chip.getBoundingClientRect();
      container.scrollLeft += (r.left - cr.left) - (cr.width - r.width) / 2;
    }
  }

  /* ------ "See all" button builder for section headers ------ */
  function seeAllBtn(cfg) {
    return h('button', { class: 'sec-more', type: 'button', onclick: () => openSeeAll(cfg) }, 'See all →');
  }

  /* ------ "See all" page: the full list for one home section, as a 3-column grid ------ */
  const HOME_LIMIT = 10;
  const SEE_FEATURED = { title: 'Featured', sub: 'Hand-picked classics', key: 'wt:home:featured', ttl: TTL_FEATURED,
    fetch: () => Promise.allSettled(FEATURED_IDS.map(id => lvGet({ id }, { light: true })))
      .then(rs => rs.filter(r => r.status === 'fulfilled' && r.value.length).map(r => r.value[0])) };
  const SEE_RECENT = { title: 'Recently added', sub: 'New in the last 90 days', key: 'wt:seeall:recent', ttl: TTL_RECENT,
    fetch: () => lvGet({ since: Math.floor((Date.now() - 90 * 24 * 3600e3) / 1000), limit: 60 }, { light: true }) };
  let seeSeq = 0;

  function openSeeAll(cfg) {
    const mine = ++seeSeq, grid = $('#seeall-grid'), err = $('#seeall-err');
    seeOpen = true;
    $('#seeall-title').textContent = cfg.title;
    $('#seeall-sub').textContent = cfg.sub || '';
    err.hidden = true;
    const cached = store.get(cfg.key, null);
    if (!cached || !cached.books || !cached.books.length) rowSkeletons(grid, 9);
    showView('home');
    swr(cfg.key, cfg.ttl, cfg.fetch,
      (books) => {
        if (mine !== seeSeq) return;
        grid.textContent = '';
        books.forEach(b => grid.append(tileNode(b, () => openDetail(b))));
        $('#seeall-sub').textContent = plural(books.length, 'recording') + (cfg.sub ? ' · ' + cfg.sub : '');
      },
      () => {
        if (mine !== seeSeq) return;
        grid.textContent = '';
        grid.append(stateNode('error', "Couldn't load this list", 'LibriVox did not answer.', 'Try again', () => openSeeAll(cfg)));
      });
  }
  function closeSeeAll() { seeOpen = false; seeSeq++; showView('home'); }

  /* ------ friendly empty / error states ------ */
  const STATE_ICONS = {
    error: 'M12 8v5M12 16.5v.01M10.3 4.2L2.9 17a2 2 0 0 0 1.7 3h14.8a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0z',
    offline: 'M3 9a14 14 0 0 1 18 0M6 12.5a9 9 0 0 1 12 0M9 16a4 4 0 0 1 6 0M12 19.5v.01M4 4l16 16',
    empty: 'M5 4.5h9a3 3 0 0 1 3 3V20H8a3 3 0 0 1-3-3V4.5zM17 8h2v12M8.5 9h5'
  };
  function stateNode(kind, title, text, actionLabel, onAction) {
    if (kind === 'error' && navigator.onLine === false) { kind = 'offline'; title = "You're offline"; text = 'Check your connection and try again.'; }
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', STATE_ICONS[kind] || STATE_ICONS.empty);
    svg.append(path);
    return h('div', { class: 'state ' + kind, role: kind === 'empty' ? null : 'alert' },
      h('span', { class: 'state-ic' }, svg),
      h('strong', {}, title),
      text ? h('p', {}, text) : null,
      actionLabel ? h('button', { class: 'state-btn', type: 'button', onclick: onAction }, actionLabel) : null);
  }

  /* ------ recent searches ------ */
  const POP = { list: [] };
  const RQ_KEY = 'wt:recent-q';
  const getRQ = () => { const r = store.get(RQ_KEY, []); return Array.isArray(r) ? r : []; };
  function rememberQuery(q) {
    q = (q || '').trim();
    if (q.length < 3) return;
    const list = [q, ...getRQ().filter(x => x.toLowerCase() !== q.toLowerCase())].slice(0, 8);
    store.set(RQ_KEY, list);
  }
  /* ------ live suggestions while typing: matching books with covers, matched letters highlighted ------ */
  function sugHL(text, q) {
    const toks = q.split(/\s+/).map(t => t.replace(/[^\p{L}\p{N}']/gu, '')).filter(Boolean).sort((x, y) => y.length - x.length);
    if (!toks.length) return [text];
    const re = new RegExp('(' + toks.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')', 'ig');
    return String(text).split(re).map((part, i) => i % 2 ? h('mark', { class: 'sug-m' }, part) : part);
  }
  function sugShow() {
    const box = $('#rq'), q = el.q.value.trim();
    if (!box) return;
    if (q.length < 2 || !SX.ready || !SX.byId) { box.hidden = true; return; }
    const r = sxSearch(q, 14);
    const okLang = b => P.otherLangs || !b.lang || /^english$/i.test(b.lang);
    const books = r ? r.ids.map(i => SX.byId.get(i)).filter(b => b && okLang(b)).slice(0, 5) : [];
    if (!books.length) { box.hidden = true; return; }
    box.classList.add('sug');
    box.textContent = '';
    const pick = fn => { rememberQuery(q); hideRQ(); el.q.blur(); fn(); };
    if (r.fixed && r.fixed !== q.toLowerCase()) box.append(h('button', { type: 'button', class: 'sug-fix', onclick: () => { el.q.value = r.fixed; pick(() => doSearch(r.fixed)); } }, 'Did you mean ', h('strong', {}, r.fixed), '?'));
    books.forEach(b => box.append(h('button', { type: 'button', class: 'sug-row', onclick: () => pick(() => openDetail(b)) },
      coverNode(b),
      h('span', { class: 'sug-txt' }, h('span', { class: 'sug-t' }, ...sugHL(b.title || '', q)), h('span', { class: 'sug-a' }, ...sugHL(b.authors || '', q))),
      h('span', { class: 'sug-go', 'aria-hidden': 'true' }))));
    box.append(h('button', { type: 'button', class: 'sug-all', onclick: () => pick(() => doSearch(q)) }, 'See all results for \u201c' + q + '\u201d'));
    box.hidden = false;
  }
  function hideRQ() { const r = $('#rq'); if (r) r.hidden = true; }
  function showRQ() {
    const box = $('#rq'), list = getRQ();
    if (!box) return;
    if (el.q.value.trim()) { sugShow(); return; }
    box.classList.remove('sug');
    box.textContent = '';
    const clockPath = 'M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z';
    const mk = d => { const sv = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); sv.setAttribute('viewBox', '0 0 24 24'); sv.setAttribute('aria-hidden', 'true'); const pt = document.createElementNS('http://www.w3.org/2000/svg', 'path'); pt.setAttribute('d', d); sv.append(pt); return sv; };
    const go = (q, open) => { el.q.value = q; const cb = $('#btn-clear-q'); if (cb) cb.hidden = false; hideRQ(); el.q.blur(); rememberQuery(q); if (open) open(); else doSearch(q); };
    if (list.length) {
      box.append(h('div', { class: 'rq-head' }, h('span', {}, 'Recent searches'),
        h('button', { type: 'button', class: 'rq-clear', onclick: () => { store.set(RQ_KEY, []); showRQ(); } }, 'Clear all')));
      box.append(h('div', { class: 'rq-chips' }, ...list.slice(0, 6).map(q => h('span', { class: 'rchip' },
        h('button', { type: 'button', class: 'rchip-go', onclick: () => go(q) }, mk(clockPath), h('span', {}, q)),
        h('button', { type: 'button', class: 'rchip-x', 'aria-label': 'Remove ' + q + ' from recent searches', onclick: () => { store.set(RQ_KEY, getRQ().filter(x => x !== q)); showRQ(); } }, mk('M6 6l12 12M18 6L6 18'))))));
    }
    const pop = POP.list.length >= 3 ? POP.list.slice(0, 6) : null;
    box.append(h('div', { class: 'rq-head' }, h('span', {}, pop ? 'Popular right now' : 'Try one')));
    if (pop) box.append(h('div', { class: 'rq-pop' }, ...pop.map((b, n) => h('button', { type: 'button', class: 'pop-row', onclick: () => { hideRQ(); el.q.blur(); openDetail(b); } },
      h('span', { class: 'pop-n' }, String(n + 1)), coverNode(b), h('span', { class: 'pop-txt' }, h('span', { class: 'pop-t' }, b.title), h('span', { class: 'pop-a' }, b.authors || ''))))));
    else box.append(h('div', { class: 'rq-ideas' }, ...IDEAS.slice(0, 6).map(t => h('button', { type: 'button', class: 'chip', onclick: () => go(t) }, t))));
    box.hidden = false;
  }
  function initRecentSearches() {
    const box = $('#rq');
    box.addEventListener('pointerdown', e => e.preventDefault()); // keep focus so taps register
    el.q.addEventListener('focus', showRQ);
    el.q.addEventListener('input', () => { if (el.q.value.trim()) sugShow(); else showRQ(); });
    el.q.addEventListener('blur', () => {
      setTimeout(hideRQ, 120);
      if (el.q.value.trim().length >= 3 && !el.results.hidden && el.resultList.querySelector('.card:not(.sk)')) rememberQuery(el.q.value);
    });
    $('#search-form').addEventListener('submit', () => { rememberQuery(el.q.value); hideRQ(); });
  }

  /* ------ Kick off all homepage sections ------ */
  /* ------ Home skeletons: placeholders until each row's data arrives. A loader marks itself done, then
     skSweep removes any placeholder it left behind (offline, empty) and hides the section. ------ */
  const HSK = { done: {} };
  function skSweep(id) {
    const s = $('#' + id);
    if (s && s.querySelector('.sk')) { s.querySelectorAll('.sk').forEach(n => n.remove()); s.hidden = true; }
  }
  function homeSkeletons() {
    const show = (key, id, build) => { const s = $('#' + id); if (!s || HSK.done[key]) return; build(s); s.hidden = false; };
    show('daily', 'sec-botd', () => { const c = $('#botd-card'); c.textContent = ''; c.append(h('div', { class: 'col-sk hero-bd sk', 'aria-hidden': 'true' })); });
    show('picks', 'sec-picks', s => {
      s.textContent = '';
      const row = h('div', { class: 'hrow sk', 'aria-hidden': 'true' }); rowSkeletons(row, 5);
      s.append(h('div', { class: 'home-section-head sk', 'aria-hidden': 'true' }, h('div', { class: 'sk-head' }, h('div', { class: 'sk-l' }), h('div', { class: 'sk-l' }))), row);
    });
    show('cur', 'sec-newweek', () => rowSkeletons($('#newweek-row'), 6));
    show('cur', 'sec-collections', s => { s.textContent = ''; s.append(h('div', { class: 'col-sk bar sk', 'aria-hidden': 'true' })); });
  }

  /* ------ Book of the day + Trending: home.json is rebuilt daily by a GitHub job (build_home.py) ------ */
  const TTL_DAILY = 3 * 3600e3;
  async function getDaily() {
    const c = store.get('wt:daily', null);
    if (c && c.d && Date.now() - c.t < TTL_DAILY) return c.d;
    try {
      const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 10000);
      const r = await fetch('https://raw.githubusercontent.com/' + ghCfg().repo + '/main/home.json', { signal: ctl.signal }); clearTimeout(to);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const d = await r.json();
      if (d && d.v === 1) { store.set('wt:daily', { t: Date.now(), d }); return d; }
    } catch (e) { /* offline or not built yet: use the saved copy if there is one */ }
    return c && c.d ? c.d : null;
  }
  async function loadDaily() {
    try {
      await catLoad();
      if (!CAT.books) return;
      const d = await getDaily(); if (!d) return;
      const map = new Map(CAT.books.map(b => [b.id, b]));
      const pub = ({ _t, _a, _l, _g, ...b }) => b;
      const okLang = b => P.otherLangs || !b.lang || /^english$/i.test(b.lang);
      const bo = d.botd && map.get(String(d.botd.id)), card = $('#botd-card'), bsec = $('#sec-botd');
      if (bo) {
        const b = pub(bo);
        card.textContent = '';
        const hue = colHue(0, (parseInt(b.id, 10) || 0) + 3), blurb = d.botd.blurb || '';
        card.append(h('button', { class: 'botd-hero', type: 'button', style: '--h:' + hue, 'aria-label': 'Book of the day: ' + b.title + (b.authors ? ', ' + b.authors : ''), onclick: () => openDetail(b) },
          h('span', { class: 'botd-cover', 'aria-hidden': 'true' }, coverNode(b)),
          h('span', { class: 'botd-body' },
            h('span', { class: 'botd-k' }, 'Book of the day'),
            h('span', { class: 'botd-t' }, b.title),
            h('span', { class: 'botd-a' }, b.authors || ''),
            blurb ? h('span', { class: 'botd-b' }, blurb) : null,
            h('span', { class: 'botd-go' }, svgIcon('#i-play'), 'Listen'))));
        bsec.hidden = false; RW.botd = b.id;
      } else { bsec.hidden = true; RW.botd = null; }
      newWeekPaint();
      const books = (d.trending || []).map(i => map.get(String(i))).filter(b => b && okLang(b)).slice(0, 20).map(pub);
      POP.list = books.slice(0, 8);
      RW.trending = books.length >= 3 ? books : [];   // fewer than three is not a row (colExtraPaint hides it)
      colExtraPaint();   // Trending is the top row, so Featured and Recently added repaint without its books
    } catch (e) { /* the rows stay hidden */ }
    finally { HSK.done.daily = true; skSweep('sec-botd'); }
  }


  /* ------ New this week + Editor's Collections: curation.json is rebuilt daily by build_curation.py ------ */
  async function getCuration() {
    const c = store.get('wt:curation', null);
    if (c && c.d && Date.now() - c.t < TTL_DAILY) return c.d;
    try {
      const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 10000);
      const r = await fetch('https://raw.githubusercontent.com/' + ghCfg().repo + '/main/curation.json', { signal: ctl.signal }); clearTimeout(to);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const d = await r.json();
      if (d && d.v === 1) { store.set('wt:curation', { t: Date.now(), d }); return d; }
    } catch (e) { /* not built yet or offline: use the saved copy */ }
    return c && c.d ? c.d : null;
  }
  /* One build of curation.json against the catalog, shared by the Home teaser and the Collections tab. */
  async function curBuild(max) {
    await catLoad();
    if (!CAT.books) return null;
    const d = (await getCuration()) || {};
    const map = new Map(CAT.books.map(b => [b.id, b]));
    const pub = ({ _t, _a, _l, _g, ...b }) => b;
    const okLang = b => P.otherLangs || !b.lang || /^english$/i.test(b.lang);
    const pick = ids => (ids || []).map(i => map.get(String(i))).filter(b => b && okLang(b)).slice(0, max).map(pub);
    const cols = (d.collections || []).map((c, i) => ({ key: String(c.id || c.slug || i), title: c.title || '', blurb: c.blurb || '', group: c.group || '', books: pick(c.ids) })).filter(c => c.title && c.books.length >= 3);
    const lowT = c => c.title.toLowerCase();
    const gs = genreShelves(max, okLang, pub, new Set(cols.map(c => genreTopic(c.title))));
    const shown = new Set(); gs.main.forEach(m => (GEN_MAIN.find(g => g.key === m.key).tp || []).forEach(t => shown.add(t)));   // topics the "Browse by genre" rows already cover
    const cols2 = cols.filter(c => { const t = genreTopic(c.title); if (shown.has(t)) return false; if (/genre/i.test(c.group) && GEN_MAIN.some(g => g.test(lowT(c)))) return false; shown.add(t); return true; });   // a curated "Mystery" shelf would repeat the Detective row; two curated shelves on one topic keep the first
    return { nw: pick(d.new), cols: cols2, gen: gs.main, all: gs.all };
  }
  /* Genre shelves, built from the catalog already on the device (each book carries its LibriVox genre names).
     "Browse by genre" are the big six, shown as rows of covers; "All genres" is every genre with enough books,
     shown as tiles at the bottom. Books with a cover and a text edition come first, shuffled a little each day. */
  const GEN_MAIN = [
    { key: 'g-scifi-horror', tp: ['scifi', 'horror'], title: 'Sci-Fi & Horror', blurb: 'Strange worlds, and things that go bump in the night.', test: g => /science fiction|sci-?fi|horror|supernatural/.test(g) },
    { key: 'g-romance', tp: ['romance'], title: 'Romance', blurb: 'Love stories, from drawing rooms to the wild.', test: g => /romance/.test(g) },
    { key: 'g-children', tp: ['children'], title: 'Children', blurb: 'Stories and tales for younger listeners.', test: g => /child/.test(g) },
    { key: 'g-detective', tp: ['mystery'], title: 'Detective Fiction & Mysteries', blurb: 'Clues, culprits and cunning detectives.', test: g => /detect|mystery|crime/.test(g) },
    { key: 'g-fiction', tp: ['fiction'], title: 'Fiction', blurb: 'Novels and stories, old and new.', test: g => /fiction/.test(g.replace(/non[- ]?fiction/g, '')) },
    { key: 'g-nonfiction', tp: ['nonfiction'], title: 'Non-fiction', blurb: 'Biography, history, essays and ideas.', test: g => /non[- ]?fiction|biograph|history|essay|philosoph|travel|religio|politic|memoir|nature|economic|psycholog/.test(g.replace(/science fiction|historical fiction/g, '')) }
  ];
  const GEN = { k: '', v: null };
  function genreShelves(max, okLang, pub, skip) {
    const day = new Date().toISOString().slice(0, 10), k = [CAT.books.length, day, max, !!P.otherLangs, [...skip].join(',')].join('|');
    if (GEN.k === k && GEN.v) return GEN.v;
    const pool = CAT.books.filter(b => b._g && okLang(b));
    const sep = /[,;|\/]+/, title = t => t.replace(/(^|[\s&(-])[a-z]/g, m => m.toUpperCase());
    const take = (test, key) => pool.filter(b => test(b._g))
      .map(b => [b, (b.ia ? 1 : 0) + (b.textUrl ? 1 : 0) + (b.total >= 1800 ? .5 : 0) + (covHash(day + key + b.id) % 1000) / 1000])
      .sort((x, y) => y[1] - x[1]).slice(0, max).map(x => pub(x[0]));
    const main = GEN_MAIN.map(g => ({ key: g.key, title: g.title, blurb: g.blurb, group: 'Browse by genre', books: take(g.test, g.key) })).filter(c => c.books.length >= 3);
    /* Every genre becomes one tile, except: topics the six rows above already cover (by name), genres whose name
       is the same as another once words like "fiction" are ignored, genres already shown as a curated shelf, and
       genres that are mostly the same books as a bigger one ("Mystery & Detection" next to "Detective Fiction"). */
    const covered = /science fiction|sci-?fi|horror|supernatural|romance|child|detect|mystery|crime|^(general |literary )?fiction$|^non[- ]?fiction$/;
    const norm = genreTopic;
    const sets = new Map();
    pool.forEach(b => new Set(b._g.split(sep).map(x => x.trim()).filter(Boolean)).forEach(t => { if (!sets.has(t)) sets.set(t, new Set()); sets.get(t).add(b.id); }));
    const seen = new Set(skip), kept = [], all = [];
    main.forEach(m => (GEN_MAIN.find(g => g.key === m.key).tp || []).forEach(t => seen.add(t)));
    [...sets].filter(([t, st]) => st.size >= 8 && t.length > 2 && t.length < 40).sort((a, b) => b[1].size - a[1].size).forEach(([t, st]) => {
      if (all.length >= 30 || covered.test(t)) return;
      const n = norm(t); if (!n || seen.has(n)) return;
      for (const o of kept) { let hit = 0; st.forEach(id => { if (o.has(id)) hit++; }); if (hit / st.size >= .85) return; }
      const books = take(g => g.split(sep).some(x => x.trim() === t), 'all' + t);
      if (books.length < 3) return;
      seen.add(n); kept.push(st);
      all.push({ key: 'g-' + seSlug(t), title: title(t), blurb: '', group: 'All genres', n: st.size, books });
    });
    GEN.k = k; GEN.v = { main, all };
    return GEN.v;
  }
  async function loadCuration() {
    try {
      const d = await curBuild(20); if (!d) return;
      RW.nw = d.nw; newWeekPaint();   // New this week skips books already in Picked for you
      // Home keeps one compact card that opens the Collections tab.
      const wrap = $('#sec-collections'); wrap.textContent = '';
      const shelves = colShelves(d);
      if (shelves.length) {
        const covers = colFan({ books: shelves.slice(0, 3).map(c => c.books[0]) });
        wrap.append(h('button', { class: 'col-card', type: 'button', style: '--h:' + colHue(shelves[0].key, 0), onclick: () => { COL.open = null; showTab('collections', true); } },
          covers,
          h('span', { class: 'cc-t' }, h('strong', {}, 'Browse collections'), h('small', {}, shelves.length + ' curated shelves \u00b7 ' + shelves.slice(0, 3).map(c => c.title).join(' \u00b7 '))),
          svgIcon('#i-go')));
      }
      wrap.hidden = !shelves.length;
    } catch (e) { /* the rows stay hidden */ }
    finally { HSK.done.cur = true; skSweep('sec-newweek'); skSweep('sec-collections'); }
  }

  /* ---------- Customise home (Settings > Reading) ----------
     Home shows Continue listening first, then ONE hero card, then at most HC_ROWS rows. The hero is the time-of-day
     card when it has something to say, otherwise Book of the day (never both). Rows are Picked for you, New this
     week and Collections, in page order. Each part has a switch in Settings; the ones switched off are kept in
     P.homeOff (a list of keys), saved with the other prefs, so a new row is on until someone turns it off.
     The loaders above and in 120 keep deciding by themselves when a section has content (they set `hidden`);
     this code only adds classes on top: .hh-off (switched off) and .hh-cap (one card / three rows already shown),
     both display:none in 70-collections-detail-motion.css. A MutationObserver re-checks whenever a section's
     `hidden` changes, so the order in which the loaders finish does not matter. */
  const HC_ROWS = 3;
  const HC_ITEMS = [
    ['recents', 'recents', 'Continue listening', 'Your books in progress'],
    ['tod', 'sec-tod', 'Time-of-day card', 'Morning review or bedtime story'],
    ['botd', 'sec-botd', 'Book of the day', 'Shown when there is no time-of-day card'],
    ['picks', 'sec-picks', 'Picked for you', 'Suggestions from your listening'],
    ['newweek', 'sec-newweek', 'New this week', 'Fresh arrivals in the library'],
    ['collections', 'sec-collections', 'Collections', 'Curated shelves']
  ];
  const hcOff = () => new Set(Array.isArray(P.homeOff) ? P.homeOff : []);
  function homeApply() {
    const off = hcOff(), g = id => document.getElementById(id), live = id => { const e = g(id); return !!e && !e.hidden; };
    HC_ITEMS.forEach(([k, id]) => { const e = g(id); if (e) e.classList.toggle('hh-off', off.has(k)); });
    const botd = g('sec-botd'); if (botd) botd.classList.toggle('hh-cap', !off.has('tod') && live('sec-tod'));   // one hero card
    let rows = 0;
    ['sec-picks', 'sec-newweek', 'sec-collections'].forEach(id => {
      const e = g(id); if (!e) return;
      const on = live(id) && !e.classList.contains('hh-off');
      e.classList.toggle('hh-cap', on && ++rows > HC_ROWS);   // at most three rows
    });
  }
  function homeCustInit() {
    homeApply();
    try { const mo = new MutationObserver(homeApply); HC_ITEMS.forEach(([, id]) => { const e = document.getElementById(id); if (e) mo.observe(e, { attributes: true, attributeFilter: ['hidden'] }); }); } catch (e) { /* the classes still apply on every change of the switches */ }
  }
  /* the switches in Settings > Reading; called every time Settings opens (fillSettings in 290) */
  function homeCustPaint() {
    const box = $('#hc-list'); if (!box) return;
    const off = hcOff();
    box.textContent = '';
    HC_ITEMS.forEach(([k, , name, note]) => {
      const id = 'hc-' + k, cb = h('input', { id, type: 'checkbox', 'aria-describedby': id + '-d' });
      cb.checked = !off.has(k);
      cb.addEventListener('change', () => {
        const now = hcOff(); if (cb.checked) now.delete(k); else now.add(k);
        P.homeOff = [...now]; savePrefs(); homeApply();
      });
      box.append(h('div', { class: 'row hc-row' }, h('label', { for: id }, h('span', { class: 'hc-n' }, name), h('small', { id: id + '-d', class: 'hc-s' }, note)), cb));
    });
  }
  guideDoc('home', 'Customise home', "Settings > Reading > Customise home has a switch for each part of the Library tab. Continue listening always comes first, then one card (the time-of-day card when it has something for you, otherwise Book of the day), then up to three rows: Picked for you, New this week and Collections. Turn a part off and it disappears from Home; the next one moves up.", '2026-10-19');

  guideDoc('collections', 'Browse shelves', "Collections are curated shelves such as Trending and New this week, rebuilt daily. Tap See all for a whole shelf, then sort it, hide books you have heard, or tap Surprise me.");
