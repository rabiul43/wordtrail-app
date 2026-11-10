  /* ---------- Question results per chapter (QR) ----------
     wt:qres = { '<book id>:<chapter index>': { n, r, b, t, ts } }
       n   questions in the last finished set      r   right answers in that set (0..n)
       b   best result so far, in percent (0..100) t   how many sets were finished (counts up only)
       ts  when the last set was finished (ms)
     Only a FINISHED set is saved (all its questions answered). Closing half way saves nothing here; the words in My Words are not touched.
     Synced (category 'Library' in 295). Two devices are merged per chapter (QR.merge): t and b take the larger value, and n, r and ts come from
     the newer set, so a merge never loses a try and can be repeated safely. At most 600 chapters are kept (the oldest go first).
     Nothing here is needed for playback; every call site is wrapped in try/catch.
     API (later tasks call these):
       QR.save(bookId, ch, n, r, now)   save a finished set; returns the new entry, or null for nonsense
       QR.get(bookId, ch)               the entry or null            QR.all()   a copy of everything      QR.count()   chapters with a result
       QR.forBook(bookId)               [{ ch, n, r, b, t, ts }] sorted by chapter
       QR.merge(A, B) / QR.mergeJson(a, b)   the merge (a, b = JSON text; returns JSON text, or null when either is not an object) */
  const QR = (() => {
    const KEY = 'wt:qres', KEEP = 600;
    const isObj = x => !!x && typeof x === 'object' && !Array.isArray(x);
    const int = (v, lo, hi) => (typeof v === 'number' && isFinite(v) && Math.floor(v) === v && v >= lo && v <= hi) ? v : null;
    const id = (b, ch) => String(b) + ':' + ch;
    const read = () => { let v = null; try { v = store.get(KEY, null); } catch (e) { /* storage unavailable */ } return isObj(v) ? v : {}; };
    const clean = e => {   // one entry, or null when it is not usable
      if (!isObj(e)) return null;
      const n = int(e.n, 1, 50), r = int(e.r, 0, 50), ts = (typeof e.ts === 'number' && isFinite(e.ts) && e.ts >= 0) ? Math.floor(e.ts) : 0;
      if (n === null || r === null || r > n) return null;
      const b = int(e.b, 0, 100), t = int(e.t, 1, 100000);
      return { n, r, b: b === null ? Math.round(100 * r / n) : b, t: t === null ? 1 : t, ts };
    };
    function prune(o) { const ks = Object.keys(o); if (ks.length > KEEP) ks.sort((a, b) => (o[a].ts || 0) - (o[b].ts || 0)).slice(0, ks.length - KEEP).forEach(k => { delete o[k]; }); }
    function merge(A, B) {
      if (!isObj(A) || !isObj(B)) return null;
      const out = {};
      Object.keys(Object.assign({}, A, B)).forEach(k => {
        const x = clean(A[k]), y = clean(B[k]);
        if (!x || !y) { if (x || y) out[k] = x || y; return; }
        const nw = x.ts >= y.ts ? x : y;   // the newer set gives n, r and ts
        out[k] = { n: nw.n, r: nw.r, b: Math.max(x.b, y.b), t: Math.max(x.t, y.t), ts: nw.ts };
      });
      prune(out); return out;
    }
    function save(bookId, ch, n, r, now) {
      try {
        if (bookId == null || bookId === '' || int(ch, 0, 100000) === null) return null;
        const e0 = clean({ n, r, ts: typeof now === 'number' ? now : Date.now() }); if (!e0) return null;
        const all = read(), old = clean(all[id(bookId, ch)]);
        const e = { n: e0.n, r: e0.r, b: Math.max(e0.b, old ? old.b : 0), t: (old ? old.t : 0) + 1, ts: e0.ts };
        all[id(bookId, ch)] = e; prune(all); store.set(KEY, all);
        return e;
      } catch (err) { return null; }
    }
    const get = (bookId, ch) => clean(read()[id(bookId, ch)]);
    const all = () => { const o = read(), out = {}; Object.keys(o).forEach(k => { const e = clean(o[k]); if (e) out[k] = e; }); return out; };
    const count = () => Object.keys(all()).length;
    function forBook(bookId) {
      const o = all(), p = String(bookId) + ':';
      return Object.keys(o).filter(k => k.indexOf(p) === 0).map(k => Object.assign({ ch: Number(k.slice(p.length)) }, o[k])).filter(x => isFinite(x.ch)).sort((a, b) => a.ch - b.ch);
    }
    function mergeJson(a, b) { let A, B; try { A = JSON.parse(a); B = JSON.parse(b); } catch (e) { return null; } const m = merge(A, B); return m ? JSON.stringify(m) : null; }
    return { KEY, save, get, all, count, forBook, merge, mergeJson };
  })();
