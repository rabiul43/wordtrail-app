  /* ---------- True / False / Not Given packs: the app reads them (Task 61) ----------
     A pack = the statements of ONE passage of ONE book, made offline and approved by a person (format: TFNG-PACKS.md, tools/make_tfng_pack.py).
     No live AI call anywhere: rules cannot make reliable Not Given statements, so the app only shows what a person approved (items with r: 1).
     Where the files come from: the same data host and fetchText (070) as the translation packs (160c), as
       packs/<book id>.tfng-index.json        the list of passages of the book: { format: 'wordtrail-tfng-index', v: 1, book, passages: [ { id } ] }
       packs/<book id>.<passage id>.tfng.json.gz   one passage (gzip, or plain JSON when the host already unpacked it: TPK.readJson reads both)
     The index is made by `python tools/make_tfng_pack.py --index packs --book <id>`. No index = no trainer: the Learn tile is hidden.
     Nothing is fetched until the Learn hub or the "Study this chapter" sheet is drawn for the open book (TFK.visible, once per book), and nothing runs
     during playback. Saved copies in the text store (idb 'texts'): 'tfng:<book id>' = { v:1, ids, fetched } and 'tfngp:<book id>|<passage id>' = { v:1, lines,
     items, meta, fetched }; used offline, refreshed after 14 days. No localStorage key, nothing to sync.
     A passage is used only when at least half of its lines are sentences of the open book (same hash as TP.fnv), and only when the chapter of its last
     matched line has been reached (the spoiler rule of QG, 167c). Sample packs (sample: true) are refused, except with the developer switch ?tfngsample=1 in
     the page address: then the book id is 'sample', any book (or none) works, and the book match and the spoiler rule are skipped.
       TFK.visible()  -> true when the open book has a pack (starts the one lookup the first time; the hub redraws when it is known)
       TFK.passages(book, { sents, far, sample }) -> Promise<[ { id, lines, items, meta, ch } ]>   (checked, spoiler-safe)
       TFK.bookId()  TFK.sampleOn()  TFK.name(book)  TFK.pname(book, id)
       TFC (pure, between TFC-START/END; tools/tfng_screen_check.js): parse, parseIndex, where, nearest, mixed, judge */
  const TFK = (() => {
    /*TFC-START*/
    const FORMAT = 'wordtrail-tfng-pack', INDEX = 'wordtrail-tfng-index', KEYF = 'fnv1a-utf16-base36', ANS = ['T', 'F', 'NG'], ID = /^[A-Za-z0-9]{1,40}$/;
    const int = x => typeof x === 'number' && Number.isInteger(x);
    /* A parsed pack -> { ok: true, lines: [[key, text]], items: [{ id, st, a, why, sup }] (approved and valid only), meta } or { ok: false, why }. */
    function parse(j, book, pid, opt) {
      if (!j || typeof j !== 'object' || j.format !== FORMAT) return { ok: false, why: 'not a pack' };
      if (j.v !== 1) return { ok: false, why: 'version' };
      if (j.key !== KEYF) return { ok: false, why: 'key' };
      if (String(j.book) !== String(book) || String(j.passage) !== String(pid)) return { ok: false, why: 'book or passage' };
      const sample = j.sample === true;
      if (sample && !(opt && opt.sample)) return { ok: false, why: 'sample pack' };
      if (!sample && !(j.reviewed && typeof j.reviewed.by === 'string' && j.reviewed.by.trim() && j.reviewed.by !== 'none')) return { ok: false, why: 'not reviewed' };
      if (!Array.isArray(j.lines) || j.lines.length < 3 || j.lines.length > 40) return { ok: false, why: 'lines' };
      const lines = [];
      for (const r of j.lines) { if (!(Array.isArray(r) && typeof r[0] === 'string' && typeof r[1] === 'string' && r[1].trim())) return { ok: false, why: 'lines' }; lines.push([r[0], r[1]]); }
      const items = [], seen = new Set();
      for (const it of Array.isArray(j.items) ? j.items : []) {   // a damaged or unapproved item is left out, not the whole pack
        if (!it || it.r !== 1 || ANS.indexOf(it.a) < 0 || typeof it.st !== 'string' || !it.st.trim() || typeof it.why !== 'string' || !it.why.trim()) continue;
        const sup = Array.isArray(it.sup) ? it.sup : null;
        if (!sup || !sup.every(x => int(x) && x >= 1 && x <= lines.length) || new Set(sup).size !== sup.length) continue;
        if (it.a === 'NG' ? sup.length !== 0 : (sup.length < 1 || sup.length > 3)) continue;
        const id = typeof it.id === 'string' && it.id ? it.id : it.st;
        if (seen.has(id)) continue; seen.add(id);
        items.push({ id, st: it.st.trim(), a: it.a, why: it.why.trim(), sup: sup.slice().sort((a, b) => a - b) });
      }
      if (items.length < 3) return { ok: false, why: 'few items' };
      return { ok: true, lines, items, meta: { engine: String(j.engine || ''), model: String(j.model || ''), license: String(j.license || ''), made: String(j.made || ''), by: j.reviewed ? String(j.reviewed.by || '') : '', sample } };
    }
    /* The index of a book -> list of passage ids, or null. */
    function parseIndex(j, book) {
      if (!j || typeof j !== 'object' || j.format !== INDEX || j.v !== 1 || String(j.book) !== String(book) || !Array.isArray(j.passages)) return null;
      const ids = [];
      for (const p of j.passages) if (p && typeof p.id === 'string' && ID.test(p.id) && ids.indexOf(p.id) < 0) ids.push(p.id);
      return ids.length ? ids.slice(0, 20) : null;
    }
    /* Where the passage sits in the open book. sents = S.model.sents ({ t, h, ch }), fnv = the app's hash (TP.fnv).
       -> { n: lines found in the book, ch: the highest chapter among them (-1 when none), ok: at least half of the lines were found } */
    function where(lines, sents, fnv) {
      const at = new Map();
      for (const s of Array.isArray(sents) ? sents : []) { const t = s && !s.h && typeof s.t === 'string' ? s.t.trim() : ''; if (t) at.set(fnv(t), Number.isInteger(s.ch) ? s.ch : -1); }
      let n = 0, ch = -1;
      for (const l of lines) if (at.has(l[0])) { n++; ch = Math.max(ch, at.get(l[0])); }
      return { n, ch, ok: n > 0 && n * 2 >= lines.length };
    }
    const toks = s => String(s).toLowerCase().match(/[a-z0-9]+/g) || [];
    const STOP = new Set('the a an and or of to in on at is are was were be been it its this that for with as by from but not no'.split(' '));
    /* The line that shares most words with a statement (for a Not Given answer: "the closest line, it does not answer the statement"). -1 when none share a word. */
    function nearest(st, lines) {
      const w = new Set(toks(st).filter(x => x.length > 2 && !STOP.has(x)));
      let best = -1, bs = 0;
      lines.forEach((l, i) => { const t = new Set(toks(l[1])); let c = 0; w.forEach(x => { if (t.has(x)) c++; }); const s = c / (1 + Math.sqrt(t.size)); if (c > 0 && s > bs) { bs = s; best = i; } });
      return best;
    }
    /* Up to n items, shuffled, taken from T, F and Not Given in turn so a set is mixed. rnd = Math.random (a test gives its own). */
    function mixed(items, n, rnd) {
      const r = rnd || Math.random, pool = { T: [], F: [], NG: [] };
      items.forEach(x => { if (pool[x.a]) pool[x.a].push(x); });
      for (const k in pool) { const a = pool[k]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } }
      const order = ANS.slice().sort(() => r() - .5), out = [];
      while (out.length < n && (pool.T.length || pool.F.length || pool.NG.length)) for (const k of order) if (pool[k].length && out.length < n) out.push(pool[k].pop());
      for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
      return out;
    }
    const judge = (item, a) => !!item && ANS.indexOf(a) >= 0 && item.a === a;
    /*TFC-END*/

    const CFG = { fetch: 10000, fresh: 14 * 24 * 3600e3, miss: 10 * 60e3 };
    const st = { busy: new Map(), miss: new Map(), known: new Map(), mem: new Map() };   // known: book -> 'loading' | 'yes' | 'no'
    const sampleOn = () => { try { return /[?&]tfngsample=1(&|$)/.test(location.search); } catch (e) { return false; } };
    const bookId = () => sampleOn() ? 'sample' : (typeof S !== 'undefined' && S.book && S.book.id != null ? String(S.book.id) : '');
    const enc = encodeURIComponent;
    const name = book => 'packs/' + enc(book) + '.tfng-index.json';
    const pname = (book, id) => 'packs/' + enc(book) + '.' + enc(id) + '.tfng.json.gz';
    async function remote(file, parse) {   // saved copy first (fresh), else the host; an old copy stays as the fallback
      const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), CFG.fetch);
      try { const r = await fetchText(file, ctl.signal); clearTimeout(to); return r && r.ok ? parse(await TPK.readJson(r)) : null; } catch (e) { clearTimeout(to); return null; }
    }
    function once(key, work) {   // one request at a time per file, and a miss is not asked again for 10 minutes
      if (st.busy.has(key)) return st.busy.get(key);
      const m = st.miss.get(key);
      if (m && Date.now() - m < CFG.miss) return Promise.resolve(null);
      const p = work().then(v => { if (!v) st.miss.set(key, Date.now()); return v; }, () => { st.miss.set(key, Date.now()); return null; });
      st.busy.set(key, p); p.then(() => st.busy.delete(key));
      return p;
    }
    const index = book => once('i|' + book, async () => {
      let d = null; try { d = await idb.get('tfng:' + book); } catch (e) { d = null; }
      if (!(d && d.v === 1 && Array.isArray(d.ids) && Date.now() - (d.fetched || 0) < CFG.fresh)) {
        const ids = await remote(name(book), j => parseIndex(j, book));
        if (ids) { d = { v: 1, ids, fetched: Date.now() }; try { idb.set('tfng:' + book, d); } catch (e) { /* not saved */ } }
      }
      return d && d.v === 1 && Array.isArray(d.ids) && d.ids.length ? d.ids : null;
    });
    const passage = (book, id, opt) => once('p|' + book + '|' + id, async () => {
      const key = 'tfngp:' + book + '|' + id;
      let d = null; try { d = await idb.get(key); } catch (e) { d = null; }
      if (!(d && d.v === 1 && Array.isArray(d.lines) && Array.isArray(d.items) && Date.now() - (d.fetched || 0) < CFG.fresh)) {
        const p = await remote(pname(book, id), j => { const r = parse(j, book, id, opt); return r.ok ? r : null; });
        if (p) { d = { v: 1, lines: p.lines, items: p.items, meta: p.meta, fetched: Date.now() }; try { idb.set(key, d); } catch (e) { /* not saved */ } }
      }
      if (!(d && d.v === 1 && Array.isArray(d.lines) && d.items.length >= 3)) return null;
      if (d.meta && d.meta.sample && !(opt && opt.sample)) return null;   // a saved sample copy is never used without the switch
      return { id, lines: d.lines, items: d.items, meta: d.meta || {} };
    });
    /* Every usable passage of the book. far = the furthest chapter reached (-1 = none); sents = S.model.sents. */
    async function passages(book, o) {
      o = o || {};
      const ids = await index(book);
      if (!ids) return [];
      const list = (await Promise.all(ids.map(id => passage(book, id, { sample: !!o.sample })))).filter(Boolean), out = [];
      for (const p of list) {
        if (o.sample) { out.push(Object.assign({ ch: -1 }, p)); continue; }
        const w = where(p.lines, o.sents, TP.fnv);
        if (!w.ok) { try { console.warn('TFNG pack ' + book + '/' + p.id + ' does not match this book: ' + w.n + ' of ' + p.lines.length + ' lines found (not used)'); } catch (e) { /* no console */ } continue; }
        if (!(o.far >= 0 && w.ch <= o.far)) continue;   // spoiler rule: only passages of chapters the reader has reached
        out.push(Object.assign({ ch: w.ch }, p));
      }
      return out;
    }
    /* Does the open book have a pack? Asks once per book; the answer redraws the Learn hub (LearnHub.refresh), so the tile appears when the pack is known. */
    function visible() {
      const b = bookId(); if (!b) return false;
      const k = st.known.get(b);
      if (k === 'yes') return true;
      if (k === undefined) {
        st.known.set(b, 'loading');
        index(b).then(ids => { st.known.set(b, ids ? 'yes' : 'no'); if (ids) { try { LearnHub.refresh(); } catch (e) { /* hub not ready */ } } }, () => st.known.set(b, 'no'));
      }
      return false;
    }
    return { visible, passages, bookId, sampleOn, name, pname, parse, parseIndex, where, nearest, mixed, judge, _t: { st, CFG } };   // _t: for tools/tfng_screen_check.js
  })();
