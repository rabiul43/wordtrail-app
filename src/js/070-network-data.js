  /* ---------- network ---------- */
  const PROXIES = [u => u, u => 'https://corsproxy.io/?' + encodeURIComponent(u), u => 'https://api.allorigins.win/raw?url=' + encodeURIComponent(u)];
  async function timedFetch(url, ms = 20000, ext) {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), ms);
    if (ext) { if (ext.aborted) c.abort(); else ext.addEventListener('abort', () => c.abort(), { once: true }); }
    try { return await fetch(url, { signal: c.signal }); } finally { clearTimeout(t); }
  }
  async function fetchVia(url, parse, ms = 20000, ext) {
    if (P.fastNet !== false && typeof hedge === 'function' && typeof AbortController !== 'undefined') {
      /* Race the routes: direct now, the proxies after a short delay (or at once if an earlier one fails). */
      if (ext && ext.aborted) throw new Error('aborted');
      const outer = new AbortController();
      let final404 = null;
      if (ext) ext.addEventListener('abort', () => outer.abort(), { once: true });
      const route = i => async sig => {
        const c = new AbortController(), ab = () => c.abort();
        sig.addEventListener('abort', ab, { once: true });
        const r = await timedFetch(PROXIES[i](url), ms, c.signal);
        if (r.status === 404 && i === 0) { const e = new Error('HTTP 404'); e.final = true; final404 = e; outer.abort(); throw e; }
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return await parse(r);
      };
      try { return (await hedge(PROXIES.map((_, i) => route(i)), [0, 1800, 3600], outer.signal)).v; }
      catch (e) { if (final404) throw final404; throw e; }
    }
    let err;
    for (let i = 0; i < PROXIES.length; i++) {
      if (ext && ext.aborted) throw new Error('aborted');
      try {
        const r = await timedFetch(PROXIES[i](url), ms, ext);
        if (r.status === 404 && i === 0) { const e = new Error('HTTP 404'); e.final = true; throw e; }
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return await parse(r);
      } catch (e) { if (e.final) throw e; err = e; }
    }
    throw err || new Error('Network error');
  }
  function jsonp(url, ext) {
    return new Promise((res, rej) => {
      const cb = '__wt' + Math.random().toString(36).slice(2);
      const s = document.createElement('script');
      // A script that is still downloading when we give up must find something to call.
      const clean = late => { clearTimeout(t); if (late) window[cb] = () => { delete window[cb]; }; else delete window[cb]; s.remove(); };
      const t = setTimeout(() => { clean(true); rej(new Error('timeout')); }, 15000);
      window[cb] = d => { clean(false); res(d); };
      s.onerror = () => { clean(false); rej(new Error('script error')); };
      if (ext) ext.addEventListener('abort', () => { clean(true); rej(new Error('aborted')); }, { once: true });
      s.src = px(url + '&format=jsonp&callback=' + cb);
      document.head.append(s);
    });
  }

  /* Hedged request: start the first route now and the others after a short delay (or at once
     if an earlier one fails). The first route to succeed wins and the rest are cancelled. */
  function hedge(fns, delays, signal, onStart) {
    return new Promise((resolve, reject) => {
      const ctls = fns.map(() => new AbortController());
      const started = fns.map(() => false), timers = [];
      let done = false, fails = 0, lastErr;
      const finish = () => { done = true; timers.forEach(clearTimeout); };
      if (signal) {
        if (signal.aborted) { reject(new Error('aborted')); return; }
        signal.addEventListener('abort', () => { if (done) return; finish(); ctls.forEach(c => c.abort()); reject(new Error('aborted')); }, { once: true });
      }
      const run = i => {
        if (done || started[i]) return;
        started[i] = true;
        if (onStart) onStart(i);
        fns[i](ctls[i].signal).then(v => {
          if (done) return;
          finish(); ctls.forEach((c, k) => { if (k !== i) c.abort(); }); resolve({ v, i });
        }, e => {
          lastErr = e; fails++;
          if (done) return;
          if (fails === fns.length) { finish(); reject(lastErr); return; }
          fns.forEach((_, k) => run(k));
        });
      };
      delays.forEach((d, i) => timers.push(setTimeout(() => run(i), d)));
    });
  }

  const LV = 'https://librivox.org/api/feed/audiobooks';
  /* ---------- local catalog: catalog.json (built by build_catalog.py) answers every list and search instantly ---------- */
  const CAT = { books: null, p: null };
  const catUrl = () => 'https://raw.githubusercontent.com/' + ghCfg().repo + '/main/catalog.json';
  function catInflate(d) {
    return (d.b || []).map(r => ({
      id: String(r[0]), title: r[1], authors: r[2] || 'Unknown author', authorLast: r[3] || '', lang: r[4] || '', gid: r[5] || '',
      total: +r[6] || 0, n: +r[7] || 0, ia: r[8] || '', genres: r[9] || '', textUrl: r[10] || '',
      cover: r[8] ? 'https://archive.org/services/img/' + r[8] : '', secs: [], reader: '',
      _t: String(r[1]).toLowerCase(), _a: String(r[2] || '').toLowerCase(), _l: String(r[3] || '').toLowerCase(), _g: String(r[9] || '').toLowerCase()
    }));
  }
  function catLoad() {
    if (CAT.p) return CAT.p;
    CAT.p = (async () => {
      const cached = await idb.get('catalog');
      let fresh = false;
      if (cached && cached.b) { CAT.books = catInflate(cached); fresh = Date.now() - (cached.fetched || 0) < 3 * 24 * 3600e3; }
      if (fresh) return;
      const refresh = async () => { try {
        const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), CAT.books ? 8000 : 25000);
        const r = await fetch(catUrl(), P.fastNet !== false ? { signal: ctl.signal, cache: 'no-cache' } : { signal: ctl.signal }); clearTimeout(to);   // no-cache = the browser sends If-None-Match itself; an unchanged file comes back as 304 (not downloaded again)
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const d = await r.json();
        if (d && Array.isArray(d.b) && d.b.length) { d.fetched = r.headers.get('x-wt-stale') ? 0 : Date.now(); idb.set('catalog', d); CAT.books = catInflate(d); }
      } catch (e) { /* keep older catalog if any; otherwise lvGet falls back to the live API */ } };
      if (CAT.books) { refresh(); return; }   // an older saved catalog shows books at once; the new one is fetched quietly
      await refresh();
    })().then(() => { try { splashRemember(); } catch (e) { /* splash list is optional */ } });
    return CAT.p;
  }
  /* Answers the same kinds of query lvGet sends to LibriVox. Returns null when it cannot (then the live API is used). */
  function catQuery(q) {
    const all = CAT.books; if (!all || !all.length) return null;
    const lim = +q.limit || 30, clean = v => String(v || '').replace(/^\^/, '').toLowerCase().trim();
    if (q.id) { const b = all.find(x => x.id === String(q.id)); return b ? [b] : []; }
    const eng = P.otherLangs ? all : all.filter(b => !b.lang || /^english$/i.test(b.lang));
    let out;
    if (q.genre) {
      const w = clean(String(q.genre).replace(/\+/g, ' ')).split(/\s+/);
      out = eng.filter(b => w.every(x => b._g.includes(x)));
    } else if (q.since) out = eng;
    else if (q.title) { const t = clean(q.title); out = eng.filter(b => b._t.startsWith(t)); }
    else if (q.author) { const a = clean(q.author); out = eng.filter(b => b._l.startsWith(a) || b._a.includes(' ' + a)); }
    else return null;
    if (q.since || q.genre) out = out.slice().sort((a, b) => b.id - a.id);
    return out.slice(0, lim).map(({ _t, _a, _l, _g, ...b }) => b);
  }
  function catPurge() {
    try { Object.keys(localStorage).filter(k => /^wt:(genre:|home:|q:|seeall:)/.test(k)).forEach(k => localStorage.removeItem(k)); } catch (e) {}
  }
  setTimeout(catLoad, 0); // start downloading the catalog straight away

  /* SX-BEGIN ---------- smart search: word index with prefix, trigram and edit-distance matching ---------- */
  const SX = { ready: false, promise: null, byId: null, fixed: null, local: false, t: [], a: [], pop: [], ids: [], words: [], wIdx: new Map(), post: [], tri: new Map() };
  const SX_STOP = new Set(['the', 'a', 'an', 'of', 'and', 'to', 'in', 'on']);
  const sxNorm = s => String(s || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/&/g, ' and ').replace(/['\u2019`]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  const sxTri = w => { const p = ' ' + w + ' ', o = []; for (let i = 0; i + 3 <= p.length; i++) o.push(p.substr(i, 3)); return o; };
  /* Damerau-Levenshtein (adjacent swaps count as one edit); gives up early once past k edits */
  function sxDist(a, b, k) {
    const la = a.length, lb = b.length; if (Math.abs(la - lb) > k) return k + 1;
    let p2 = null, p1 = []; for (let j = 0; j <= lb; j++) p1.push(j);
    for (let i = 1; i <= la; i++) {
      const cur = [i]; let min = i;
      for (let j = 1; j <= lb; j++) {
        const c = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
        let v = Math.min(p1[j] + 1, cur[j - 1] + 1, p1[j - 1] + c);
        if (p2 && i > 1 && j > 1 && a.charCodeAt(i - 1) === b.charCodeAt(j - 2) && a.charCodeAt(i - 2) === b.charCodeAt(j - 1)) v = Math.min(v, p2[j - 2] + 1);
        cur[j] = v; if (v < min) min = v;
      }
      if (min > k) return k + 1;
      p2 = p1; p1 = cur;
    }
    return p1[lb];
  }
  /* rows: [{ id, t (normalised title), a (normalised authors), p (0-9 popularity) }] */
  function sxBuild(rows) {
    const words = new Map();
    SX.ids = []; SX.t = []; SX.a = []; SX.pop = [];
    rows.forEach((r, bi) => {
      SX.ids.push(String(r.id)); SX.t.push(r.t || ''); SX.a.push(r.a || ''); SX.pop.push(+r.p || 0);
      [[r.t, 0], [r.a, 1]].forEach(([txt, f]) => {
        for (const w of String(txt || '').split(' ')) {
          if (!w) continue;
          let l = words.get(w); if (!l) words.set(w, l = []);
          const code = bi * 2 + f; if (l[l.length - 1] !== code) l.push(code);
        }
      });
    });
    SX.words = Array.from(words.keys()).sort();
    SX.post = SX.words.map(w => words.get(w));
    SX.wIdx = new Map(SX.words.map((w, i) => [w, i]));
    SX.tri = new Map();
    SX.words.forEach((w, i) => { for (const g of new Set(sxTri(w))) { let l = SX.tri.get(g); if (!l) SX.tri.set(g, l = []); l.push(i); } });
  }
  function sxLower(prefix) { let lo = 0, hi = SX.words.length; while (lo < hi) { const m = (lo + hi) >> 1; if (SX.words[m] < prefix) lo = m + 1; else hi = m; } return lo; }
  /* Returns { ids: [book ids, best first], fixed: corrected query or null } */
  function sxSearch(q, limit) {
    if (!SX.ready) return null;
    const nq = sxNorm(q);
    let toks = nq.split(' ').filter(Boolean);
    const real = toks.filter(t => !SX_STOP.has(t)); if (real.length) toks = real;
    if (!toks.length) return { ids: [], fixed: null };
    const acc = new Map(), corr = new Map();
    toks.forEach((tk, ti) => {
      const hit = new Map(), ex = SX.wIdx.get(tk);
      if (ex !== undefined) hit.set(ex, 1);
      const isLast = ti === toks.length - 1;
      if (tk.length >= (isLast ? 2 : 3)) {                        // prefix match (the word being typed, or a shortened word)
        for (let i = sxLower(tk), n = 0; i < SX.words.length && SX.words[i].startsWith(tk) && n < 80; i++, n++)
          if (!hit.has(i)) hit.set(i, Math.max(0.5, (isLast ? 0.85 : 0.7) - (SX.words[i].length - tk.length) * 0.02));
      }
      if (!hit.size && tk.length >= 4) {                          // nothing matched: try typos
        const grams = sxTri(tk), cnt = new Map(), k = tk.length >= 8 ? 2 : 1;
        for (const g of grams) { const l = SX.tri.get(g); if (l) for (const wi of l) cnt.set(wi, (cnt.get(wi) || 0) + 1); }
        const need = Math.max(2, Math.ceil(grams.length * 0.3));
        let best = null, bestD = 9, bestN = -1;
        for (const [wi, c] of cnt) {
          if (c < need) continue;
          const w = SX.words[wi], d = sxDist(tk, w, k);
          if (d > k) continue;
          hit.set(wi, d === 1 ? 0.7 : 0.5);
          if (d < bestD || (d === bestD && SX.post[wi].length > bestN)) { best = w; bestD = d; bestN = SX.post[wi].length; }
        }
        if (best) corr.set(tk, best);
      }
      const tokBest = new Map();
      for (const [wi, w] of hit) for (const code of SX.post[wi]) {
        const bi = code >> 1, v = (code & 1) ? w * 0.92 : w;
        if (v > (tokBest.get(bi) || 0)) tokBest.set(bi, v);
      }
      for (const [bi, v] of tokBest) { const r = acc.get(bi); if (r) { r.s += v; r.n++; } else acc.set(bi, { s: v, n: 1 }); }
    });
    const need = toks.length, out = [];
    let full = 0; for (const r of acc.values()) if (r.n === need) full++;
    const minN = (need > 1 && full < 3) ? need - 1 : need;
    for (const [bi, r] of acc) {
      if (r.n < minN) continue;
      let s = r.s * (r.n === need ? 1 : 0.5);
      const t = SX.t[bi];
      if (t === nq) s += 3; else if (t.startsWith(nq)) s += 1.5; else if ((' ' + t + ' ').includes(' ' + nq + ' ')) s += 0.8;
      if (SX.a[bi].includes(nq)) s += 1.2;
      s += SX.pop[bi] * 0.05;
      out.push([bi, s]);
    }
    out.sort((x, y) => y[1] - x[1] || +SX.ids[y[0]] - +SX.ids[x[0]]);
    return { ids: out.slice(0, limit || 40).map(x => SX.ids[x[0]]), fixed: corr.size ? nq.split(' ').map(t => corr.get(t) || t).join(' ') : null };
  }
  /* SX-END */

  SX.load = () => SX.promise || (SX.promise = (async () => {
    await catLoad();
    if (!CAT.books || !CAT.books.length) return;
    SX.byId = new Map(CAT.books.map(b => [b.id, b]));
    const derive = b => ({ id: b.id, t: sxNorm(b.title), a: sxNorm(b.authors), p: b.ia ? 1 : 0 });
    let rows = null;
    try {
      let d = await idb.get('search');
      if (!(d && d.ids && Date.now() - (d.fetched || 0) < 3 * 24 * 3600e3)) {
        try {
          const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 12000);
          const r = await fetch('https://raw.githubusercontent.com/' + ghCfg().repo + '/main/search.json', { signal: ctl.signal }); clearTimeout(to);
          if (r.ok) { const j = await r.json(); if (j && j.v === 1 && Array.isArray(j.ids) && j.ids.length) { j.fetched = Date.now(); idb.set('search', j); d = j; } }
        } catch (e) { /* use the saved copy, or build from the catalog below */ }
      }
      if (d && d.ids && d.t && d.A && d.ai) rows = d.ids.map((id, i) => ({ id: String(id), t: d.t[i], a: d.A[d.ai[i]] || '', p: +d.p[i] || 0 }));
    } catch (e) { rows = null; }
    if (!rows) rows = CAT.books.map(derive);
    else { const have = new Set(rows.map(r => r.id)); CAT.books.forEach(b => { if (!have.has(b.id)) rows.push(derive(b)); }); }
    sxBuild(rows); SX.ready = true;
  })());
  /* Answers a search from the local index; null when it cannot (the live LibriVox API is used then). */
  async function smartSearch(q) {
    if (!SX.ready) await Promise.race([SX.load(), new Promise(r => setTimeout(r, 2500))]);
    if (!SX.ready) return null;
    const r = sxSearch(q, 40); if (!r) return null;
    const okLang = b => P.otherLangs || !b.lang || /^english$/i.test(b.lang);
    const books = r.ids.map(i => SX.byId.get(i)).filter(b => b && okLang(b)).map(({ _t, _a, _l, _g, ...b }) => b);
    SX.fixed = r.fixed;
    return books.length ? verSort(books) : null;
  }
  setTimeout(() => SX.load().catch(() => {}), 1200); // build the search index in the background

  /* ---------- text-analysis data (levels, moods, similar, vocab): Hugging Face first, GitHub as a fallback ---------- */
  const TEXT_REPO = 'rabiul43/wordtrail-text';
  async function fetchText(name, signal) {
    const urls = ['https://huggingface.co/datasets/' + TEXT_REPO + '/resolve/main/data/' + name,
                  'https://raw.githubusercontent.com/' + ghCfg().repo + '/main/' + name];
    for (const u of urls) {
      try { const r = await fetch(u, { signal }); if (r.ok) return r; } catch (e) { if (signal && signal.aborted) return null; }
    }
    return null;
  }

  /* ---------- reading level: levels.json (built by build_levels.py) gives each book Easy / Medium / Hard plus CEFR and age ---------- */
  const LVL = { map: new Map(), cefr: [], tiers: ['Easy', 'Medium', 'Hard'], ready: false, promise: null };
  LVL.load = () => LVL.promise || (LVL.promise = (async () => {
    let d = null;
    try { d = await idb.get('levels'); } catch (e) { /* no saved copy */ }
    if (!(d && d.b && Date.now() - (d.fetched || 0) < 3 * 24 * 3600e3)) {
      try {
        const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 15000);
        const r = await fetchText('levels.json', ctl.signal); clearTimeout(to);
        if (r && r.ok) { const j = await r.json(); if (j && j.v === 1 && j.b) { j.fetched = Date.now(); idb.set('levels', j); d = j; } }
      } catch (e) { /* use the saved copy if any */ }
    }
    if (d && d.b) {
      LVL.cefr = d.cefr || []; LVL.tiers = d.tiers || LVL.tiers;
      for (const id in d.b) LVL.map.set(id, d.b[id]);
      LVL.ready = LVL.map.size > 0;
    }
    if (!LVL.ready) LVL.promise = null; // try again next time
  })());
  /* "B2 · ages 14-16" for a book, or '' while levels are missing */
  function lvlText(id) {
    const v = LVL.map.get(String(id)); if (!v) return '';
    const c = LVL.cefr[v[1]]; return c ? c[0] + ' · ' + c[1] : '';
  }
  setTimeout(() => LVL.load().then(() => paintCards()).catch(() => {}), 1500);

  /* ---------- which books are pre-synced: wt_packs/index.json (written by wt_batch.py after every book) ---------- */
  const PKI = { map: new Map(), ready: false, promise: null };
  PKI.load = () => PKI.promise || (PKI.promise = (async () => {
    let d = store.get('wt:packidx', null);
    if (!(d && d.d && Date.now() - d.t < 30 * 60e3)) {
      try {
        const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 12000);
        const r = await fetch('https://huggingface.co/datasets/rabiul43/wordtrail-packs/resolve/main/wt_packs_v2/index.json', { signal: ctl.signal }); clearTimeout(to);
        if (r.ok) { const j = await r.json(); if (j && j.v === 1 && j.b) { d = { t: Date.now(), d: j }; store.set('wt:packidx', d); } }
      } catch (e) { /* use the saved copy if any */ }
    }
    if (d && d.d && d.d.b) { Object.keys(d.d.b).forEach(k => PKI.map.set(k, d.d.b[k])); PKI.ready = true; }
    if (!PKI.ready) PKI.promise = null;
  })());
  setTimeout(() => PKI.load().then(() => paintCards()).catch(() => {}), 1200);

  /* ---------- moods.json and similar.json (built by build_moods.py from the full book texts) ---------- */
  function jsonLoader(name, idbKey, ok) {
    const o = { data: null, ready: false, promise: null };
    o.load = () => o.promise || (o.promise = (async () => {
      let d = null;
      try { d = await idb.get(idbKey); } catch (e) { /* no saved copy */ }
      if (!(d && ok(d) && Date.now() - (d.fetched || 0) < 3 * 24 * 3600e3)) {
        try {
          const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 15000);
          const r = await fetchText(name, ctl.signal); clearTimeout(to);
          if (r && r.ok) { const j = await r.json(); if (j && j.v === 1 && ok(j)) { j.fetched = Date.now(); idb.set(idbKey, j); d = j; } }
        } catch (e) { /* use the saved copy if any */ }
      }
      if (d && ok(d)) { o.data = d; o.ready = true; }
      if (!o.ready) o.promise = null; // try again next time
    })());
    return o;
  }
  const MOODS = jsonLoader('moods.json', 'moods', d => d.b && d.moods);
  const SIM = jsonLoader('similar.json', 'similar', d => d.s);
  setTimeout(() => { MOODS.load().catch(() => {}); SIM.load().catch(() => {}); }, 2500);

  /* ---------- best version: versions.json (built by build_versions.py) ranks duplicate recordings ---------- */
  const VER = { map: new Map(), ready: false, promise: null, groups: [], info: new Map(), carry: null };
  VER.load = () => VER.promise || (VER.promise = (async () => {
    let d = store.get('wt:versions', null);
    if (!(d && d.d && Date.now() - d.t < 6 * 3600e3)) {
      try {
        const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 10000);
        const r = await fetch('https://raw.githubusercontent.com/' + ghCfg().repo + '/main/versions.json', { signal: ctl.signal }); clearTimeout(to);
        if (r.ok) { const j = await r.json(); if (j && j.v === 1 && Array.isArray(j.g)) { d = { t: Date.now(), d: j }; store.set('wt:versions', d); } }
      } catch (e) { /* use the saved copy if any */ }
    }
    if (!(d && d.d)) return;
    VER.groups = d.d.g;
    d.d.g.forEach((g, gi) => g.i.forEach((id, k) => VER.map.set(String(id), { g: gi, k, n: g.i.length, why: g.w || '', tm: !!(g.s && g.s[k] >= 40), sc: g.s && typeof g.s[k] === 'number' ? g.s[k] : null })));
    VER.ready = true;
  })());
  /* Within each group of duplicates, put the best recording first (at the spot of the group's first hit). */
  function verSort(list) {
    if (!VER.ready) return list;
    const seen = new Set(), out = [];
    for (const b of list) {
      const v = VER.map.get(String(b.id));
      if (!v) { out.push(b); continue; }
      if (seen.has(v.g)) continue;
      seen.add(v.g);
      out.push(...list.filter(x => { const y = VER.map.get(String(x.id)); return y && y.g === v.g; }).sort((a, c) => VER.map.get(String(a.id)).k - VER.map.get(String(c.id)).k));
    }
    return out;
  }
  function verNote(b) {
    const v = VER.ready && VER.map.get(String(b.id));
    if (!v) return null;
    return v.k === 0
      ? h('div', { class: 'vbadge best', title: (v.why || 'Best audio version') + (v.n > 1 ? ' (' + v.n + ' recordings available)' : '') }, '\u2605 ' + 'Best match' + (v.n > 1 ? ' \u00b7 ' + v.n + ' readers' : ''))
      : h('div', { class: 'vbadge' }, 'Reader ' + (v.k + 1) + ' of ' + v.n + (v.sc != null ? ' \u00b7 ' + Math.round(v.sc) + '% match' : ''));
  }
  setTimeout(() => VER.load().then(() => verChip()).catch(() => {}), 900);

  /* LibriVox's API is often slow or drops requests. Try up to 3 rounds with a short pause,
     so one bad moment does not become an error screen. */
  async function lvGet(params, o = {}) {
    if (o.light) { await catLoad(); const local = catQuery(params); if (local) return local; }
    let err;
    for (let attempt = 0; attempt < (o.tries || 3); attempt++) {
      if (o.signal && o.signal.aborted) throw new Error('aborted');
      try { return await lvGetOnce(params, o); }
      catch (e) {
        err = e;
        if (e && e.message === 'aborted') throw e;
        await new Promise(r => setTimeout(r, 1000 + attempt * 1500));
      }
    }
    throw err;
  }
  async function lvGetOnce(params, o = {}) {
    const base = LV + '?' + new URLSearchParams(Object.assign(o.light ? { coverart: 1 } : { extended: 1, coverart: 1 }, params)).toString();
    /* One book that cannot be read is skipped; the other books in the answer still show. */
    const norm = d => (d && Array.isArray(d.books)) ? d.books.map(b => { try { return normBook(b); } catch (e) { return null; } }).filter(Boolean) : [];
    const routes = {
      direct: async sig => { const r = await timedFetch(base + '&format=json', 15000, sig); if (r.status === 404) return []; if (!r.ok) throw new Error('HTTP ' + r.status); return norm(await r.json()); },
      jsonp: async sig => norm(await jsonp(base, sig)),
      proxy: async sig => norm(await fetchVia(base + '&format=json', r => r.json(), 15000, sig))
    };
    if (o.nonEmpty) for (const k of Object.keys(routes)) { const f = routes[k]; routes[k] = async sig => { const v = await f(sig); if (!v.length) throw new Error('empty'); return v; }; }
    const names = Object.keys(routes);
    const fav = store.get('wt:route', null);
    const order = fav && routes[fav] ? [fav].concat(names.filter(n => n !== fav)) : names;
    try {
      const { v, i } = await hedge(order.map(n => routes[n]), [0, 600, 1500], o.signal, o.onStage ? k => o.onStage(k, order[k]) : null);
      if (fav !== order[i]) store.set('wt:route', order[i]); // try the route that worked first next time
      return v;
    } catch (e) {
      if (e && e.message === 'aborted') throw e;
      if (o.nonEmpty && e && e.message === 'empty') return [];
      throw new Error('LibriVox unreachable');
    }
  }
  /* A broken entry inside a book (an empty author or track in the list) is left out; the rest of the book is kept. */
  function normBook(b) {
    b = b || {};
    const as = (Array.isArray(b.authors) ? b.authors : []).filter(a => a && typeof a === 'object');
    const authors = as.map(a => [a.first_name, a.last_name].filter(Boolean).join(' ')).filter(Boolean).join(', ') || 'Unknown author';
    const ia = String(b.url_iarchive || '').match(/details\/([^/?#]+)/);
    const cover = String(b.coverart_thumbnail || b.coverart_jpg || b.coverart_jpeg || (ia ? 'https://archive.org/services/img/' + ia[1] : '')).replace(/^http:/, 'https:');
    const secs = (Array.isArray(b.sections) ? b.sections : []).filter(x => x && typeof x === 'object')
      .sort((x, y) => (+x.section_number || 0) - (+y.section_number || 0))
      .map(s => ({ id: s.id, title: decode(s.title) || 'Track ' + s.section_number, url: String(s.listen_url || '').replace(/^http:/, 'https:'), dur: +s.playtime || 0, reader: decode(((s.readers || [])[0] || {}).display_name) }))
      .filter(s => s.url);
    return {
      id: String(b.id), title: decode(b.title).trim(), authors, authorLast: (as[0] && as[0].last_name) || '',
      ia: ia ? ia[1] : '', lang: b.language || '', reader: (secs[0] && secs[0].reader) || '', total: +b.totaltimesecs || secs.reduce((a, s) => a + s.dur, 0),
      n: secs.length || +b.num_sections || 0, textUrl: b.url_text_source || '', cover, secs,
      year: +b.copyright_year || 0, desc: b.description || '',
      authorInfo: as.map(a => ({ n: [a.first_name, a.last_name].filter(Boolean).join(' '), y1: +a.dob || 0, y2: +a.dod || 0 }))
    };
  }
  /* Search sends three light requests at once (no track lists, those load when a book opens)
     and reports each as it lands, so the first results show before the slowest one is back. */
  async function searchBooks(q, o = {}) {
    SX.fixed = null; SX.local = false;
    try {
      const local = await smartSearch(q);
      if (local) { SX.local = true; if (o.onUpdate && !(o.signal && o.signal.aborted)) o.onUpdate(local, 1, 1); return local; }
    } catch (e) { /* fall back to the live API */ }
    const words = q.trim().split(/\s+/);
    const last = words[words.length - 1];
    const specs = [{ title: '^' + q, limit: 30 }];
    if (!/^(the|a|an)$/i.test(words[0])) specs.push({ title: '^the ' + q, limit: 10 });
    specs.push({ author: '^' + last, limit: 30 });
    const results = specs.map(() => null);
    let settled = 0, fails = 0;
    const merge = () => {
      const seen = new Set(), out = [];
      for (const list of results) for (const b of list || []) if (!seen.has(b.id)) { seen.add(b.id); out.push(b); }
      return out.slice(0, 40);
    };
    const opts = { light: true, signal: o.signal, onStage: o.onStage };
    await Promise.all(specs.map((sp, i) => lvGet(sp, opts).then(l => { results[i] = l; }, () => { results[i] = []; fails++; })
      .then(() => { settled++; if (o.onUpdate && !(o.signal && o.signal.aborted)) o.onUpdate(merge(), settled, specs.length); })));
    if (fails === specs.length) throw new Error('LibriVox unreachable');
    return merge();
  }

  const gutUrls = id => [
    `https://www.gutenberg.org/cache/epub/${id}/pg${id}.txt`,
    `https://www.gutenberg.org/ebooks/${id}.txt.utf-8`,
    `https://www.gutenberg.org/files/${id}/${id}-0.txt`
  ];
  // Project Gutenberg does not reliably allow direct browser requests, so the same file can be asked for through several routes.
  // The route that worked last time goes first and is asked alone; the next route is added only if it fails, or if nothing has
  // answered within TEXT_STAGGER ms. This keeps a normal download to one source and still covers a blocked route.
  const TEXT_ROUTES = [
    { name: 'direct', f: u => u },
    { name: 'allorigins', f: u => 'https://api.allorigins.win/raw?url=' + encodeURIComponent(u) },
    { name: 'codetabs', f: u => 'https://api.codetabs.com/v1/proxy/?quest=' + encodeURIComponent(u) },
    { name: 'jina', f: u => 'https://r.jina.ai/' + u, jina: true },
    { name: 'corsproxy', f: u => 'https://corsproxy.io/?' + encodeURIComponent(u) }
  ];
  const TEXT_ROUTE_KEY = 'wt:textRoute', TEXT_STAGGER = 1500;
  function textRouteOrder() {   // the remembered route first, the others in their usual order (kept on this device only: it depends on the network)
    let best = ''; try { best = localStorage.getItem(TEXT_ROUTE_KEY) || ''; } catch (e) { /* storage unavailable */ }
    const hit = TEXT_ROUTES.find(r => r.name === best);
    return hit ? [hit].concat(TEXT_ROUTES.filter(r => r !== hit)) : TEXT_ROUTES.slice();
  }
  async function readBody(resp, onBytes) {
    if (!onBytes || !resp.body || !resp.body.getReader) return resp.text();
    const total = +resp.headers.get('content-length') || 0;
    const rd = resp.body.getReader(), dec = new TextDecoder('utf-8');
    let out = '', n = 0;
    for (;;) {
      const { done, value } = await rd.read();
      if (done) break;
      n += value.length; out += dec.decode(value, { stream: true }); onBytes(n, total);
    }
    return out + dec.decode();
  }
  /* A text that came through a middleman must look like a Project Gutenberg book (its header or licence mentions the name) before it is kept.
     Only the first and last 20,000 characters are searched, so this costs almost nothing. */
  const looksGutenberg = t => /project gutenberg/i.test(t.slice(0, 20000)) || /project gutenberg/i.test(t.slice(-20000));
  /* Where each downloaded book text came from, counted on this device only (never sent, never synced): Settings > Developer. */
  const TEXT_SRC_KEY = 'wt:textSrc';
  const textUnverified = new Set();   // Gutenberg ids whose text this session came from a middleman and did not look like a Gutenberg book: never saved, not even as a parsed copy
  function textSrcCount(kind) {
    try { const o = JSON.parse(localStorage.getItem(TEXT_SRC_KEY) || '{}') || {}; o[kind] = (o[kind] | 0) + 1; localStorage.setItem(TEXT_SRC_KEY, JSON.stringify(o)); } catch (e) { /* counting is optional */ }
  }
  function textSrcReport() {
    let o = {}; try { o = JSON.parse(localStorage.getItem(TEXT_SRC_KEY) || '{}') || {}; } catch (e) { o = {}; }
    const n = k => o[k] | 0, tot = n('bundle') + n('own') + n('direct') + n('proxy');
    if (!tot) return 'No book text has been downloaded on this device yet (texts already saved on the phone are not counted).';
    return 'Your own copy (Hugging Face): ' + n('own') + '\nYour worker bundle: ' + n('bundle') + '\nDirect from gutenberg.org: ' + n('direct') + '\nFree middlemen: ' + n('proxy') + ' (' + n('unverified') + ' of them did not look like a Gutenberg book and were not saved)\nTotal downloads counted: ' + tot;
  }
  function fetchTextRace(url, ms = 30000, cb, meta) {
    const order = textRouteOrder();
    let unv = null;   // the first middleman text that did not look like a Gutenberg book: used only if every route fails
    let best = 0, bestTotal = 0, alive = false;
    const onBytes = cb ? (n, total) => { if (total) bestTotal = Math.max(bestTotal, total); if (n > best) { best = n; cb({ type: 'bytes', n: best, total: bestTotal }); } } : null;
    const ctrls = order.map(() => new AbortController());
    const attempt = async (r, i) => {
      const to = setTimeout(() => ctrls[i].abort(), ms);
      try {
        const resp = await fetch(r.f(url), { signal: ctrls[i].signal });
        if (!resp.ok) throw new Error(r.name + ' HTTP ' + resp.status);
        alive = true;                                    // this route answered: no more routes are added just because it is slow
        let t = await readBody(resp, onBytes);
        if (r.jina && typeof t === 'string') t = t.replace(/^[\s\S]{0,2000}?Markdown Content:\n/, '');
        if (typeof t !== 'string' || t.length < 4000 || /^\s*<(!doctype|html)/i.test(t)) throw new Error(r.name + ' returned no text');
        if (r.name !== 'direct' && !looksGutenberg(t)) { if (!unv) unv = { t, name: r.name }; throw new Error(r.name + ' returned text that is not a Gutenberg book'); }
        return t;
      } catch (e) {
        throw new Error(e.name === 'AbortError' ? r.name + ' timed out' : (e.message === 'Failed to fetch' ? r.name + ' blocked' : e.message));
      } finally { clearTimeout(to); }
    };
    return new Promise((resolve, reject) => {
      const errs = []; let started = 0, failed = 0, done = false, timer = 0;
      const launch = () => {
        clearTimeout(timer);
        if (done || started >= order.length) return;
        const i = started++;
        timer = setTimeout(() => { if (!alive) launch(); }, TEXT_STAGGER);
        attempt(order[i], i).then(t => {
          if (done) return;
          done = true; clearTimeout(timer); ctrls.forEach(c => c.abort());
          try { if (localStorage.getItem(TEXT_ROUTE_KEY) !== order[i].name) localStorage.setItem(TEXT_ROUTE_KEY, order[i].name); } catch (e) { /* storage unavailable */ }
          if (meta) meta.route = order[i].name;
          resolve(t);
        }, e => {
          if (done) return;
          errs.push(e.message); failed++;
          if (failed < started) return;                  // another route is still working
          if (started < order.length) launch();          // every route so far failed: add the next one at once
          else if (unv) { done = true; clearTimeout(timer); if (meta) { meta.unverified = true; meta.route = unv.name; } resolve(unv.t); }   // nothing better answered: use it for now, but do not keep it
          else { done = true; clearTimeout(timer); const err = new Error('Download failed (' + errs.join(', ') + ')'); err.download = true; reject(err); }
        });
      };
      launch();
    });
  }
  const gutInflight = new Map();
  function getGutenberg(id, cb) {
    let f = gutInflight.get(String(id));
    if (!f) {
      f = { cbs: [], p: null };
      f.p = getGutenberg0(id, ev => f.cbs.forEach(c => c(ev)));
      gutInflight.set(String(id), f);
      const done = () => gutInflight.delete(String(id));
      f.p.then(done, done);
    }
    if (cb) f.cbs.push(cb);
    return f.p;
  }
  /* Our own copy of the Gutenberg texts (filled by wordtrail_book_text_kaggle.ipynb): texts/<id / 1000>/<id>.txt.gz, the bytes exactly as
     Gutenberg serves them, gzip-compressed. Asked through the existing Hugging Face Worker (see the fetch wrapper in 030). A book that is
     not there (404), a slow answer or anything odd returns null, and the usual routes run as before. */
  const BOOK_TEXT_REPO = 'rabiul43/Book_Text';
  async function getHfText(id) {
    const n = parseInt(id, 10);
    if (!(n > 0)) return null;
    const c = new AbortController(), to = setTimeout(() => c.abort(), 15000);
    try {
      const r = await fetch('https://huggingface.co/datasets/' + BOOK_TEXT_REPO + '/resolve/main/texts/' + Math.floor(n / 1000) + '/' + n + '.txt.gz', { signal: c.signal });
      if (!r.ok) return null;
      const buf = new Uint8Array(await r.arrayBuffer());
      let t;
      if (buf[0] === 0x1f && buf[1] === 0x8b) {          // still gzip: unpack it here
        if (typeof DecompressionStream === 'undefined') return null;
        t = await new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
      } else t = new TextDecoder('utf-8').decode(buf);   // the host already unpacked it
      return t.length >= 4000 && !/^\s*<(!doctype|html)/i.test(t) ? t : null;
    } catch (e) { return null; }
    finally { clearTimeout(to); }
  }
  async function getGutenberg0(id, cb) {
    const key = 'g:' + id;
    const cached = await idb.get(key);
    if (cached) { if (cb) cb({ type: 'cached' }); return cached; }
    const bt = bundleText.get(String(id));
    if (bt) { if (cb) cb({ type: 'try', i: 0, N: 1 }); const t = await bt; if (t) { textSrcCount('bundle'); return t; } } // null: the combined request failed, use the usual routes
    if (cb) cb({ type: 'try', i: 0, N: 1 });
    const own = await getHfText(id);
    if (own) { idb.set(key, own); textSrcCount('own'); return own; }
    let last;
    const urls = gutUrls(id);
    for (let i = 0; i < urls.length; i++) {
      if (cb) cb({ type: 'try', i, N: urls.length });
      try {
        const meta = {}, t = await fetchTextRace(urls[i], 20000, cb, meta);
        if (!meta.unverified) { idb.set(key, t); textUnverified.delete(String(id)); }   // a text that did not look like a Gutenberg book is shown this time but not kept
        else { textUnverified.add(String(id)); textSrcCount('unverified'); }
        textSrcCount(meta.route === 'direct' ? 'direct' : 'proxy'); return t;
      } catch (e) { last = e; }
    }
    throw last || new Error('Text not found');
  }
  async function gutendex(q) {
    const url = 'https://gutendex.com/books/?search=' + encodeURIComponent(q);
    let d;
    try { const r = await timedFetch(url, 15000); if (!r.ok) throw new Error('HTTP ' + r.status); d = await r.json(); }
    catch (e) { d = await fetchVia(url, r => r.json(), 15000); }
    return (d.results || []).slice(0, 8).map(x => ({ id: x.id, title: x.title, author: ((x.authors || [])[0] || {}).name || '', langs: x.languages || [] }));
  }
  async function findGutenbergFor(book) {
    const be = bundles.get(String(book.id)); // the combined /book request may already know it
    if (be) { const g = await be.gut; if (g) return g; }
    const m = (book.textUrl || '').match(/gutenberg\.org\/(?:ebooks|etext|files|cache\/(?:epub|etext))\/(\d+)/i);
    if (m) return { id: m[1], label: 'Project Gutenberg #' + m[1] };
    const hits = await gutendex((book.title + ' ' + book.authorLast).trim());
    const pick = hits.find(x => x.langs.includes('en')) || hits[0];
    if (!pick) throw new Error('No matching text');
    return { id: String(pick.id), label: pick.title + (pick.author ? ' - ' + pick.author : '') };
  }

