  /* ---------- translation packs: the app reads them (Task 34) ----------
     A pack = the translation of every sentence of ONE book in ONE language (format: TRANSLATION-PACKS.md, made by tools/make_translation_pack.py).
     It is a provider of the translation layer (TP, 160b), tried BEFORE the browser translator and the free service (order 5, not live, so no
     queue gap, no backoff, no limit). A sentence that is not in the pack, a book without a pack, a damaged pack or a pack that does not match
     the app's own sentences all say 'unavailable', so TP goes on to live translation exactly as before. Nothing here touches playback.
     Where the file comes from: the same data host and the same fetchText (070) as vocab/<book id>.json, as  packs/<book id>.<lang>.json.gz
     (Hugging Face first, GitHub as the fallback). The book id is S.book.id, the same id vocab/ uses.
     Nothing is fetched until the first translation of a sentence is asked for, and only the open book and its language are held in memory.
     Saved copy: the app's text store (idb 'texts'), key 'trpack:<book id>|<lang>' = { v:1, rows: [[key, translation]...], meta, fetched }.
     It is used offline and refreshed after 14 days. No localStorage key, so nothing to sync. Not found or no network: asked again after 10 minutes.
     Sentence ids: a row is named by TP.fnv(sentence.trim()), the sentence being S.model.sents[i].t of a non-heading sentence (the same text the
     reveal bubble and the reading modes pass to TP). `TPK.check(rows, sents)` compares the pack with the open book's own sentences; a pack is used when at least half
     of its rows name a sentence of the book (a whole book) OR at least half of the book's sentences are in the pack (the book text is only a part);
     if both are under half (another edition, another splitting) it is not used and `TPK.status()` says 'mismatch'.
       TPK.load(book, lang) -> Promise<{ ok, n, of, ratio, meta } | null>      TPK.status(book, lang) -> { state: 'none'|'loading'|'ready'|'mismatch', n, of, ratio, coverage, meta }
       TPK.name(book, lang) file name      TPK.parse(json, book, lang)      TPK.check(rows, sents)      (the last three are pure; tools/translate_pack_provider_check.js) */
  const TPK = (() => {
    /*TPK-START*/
    const FORMAT = 'wordtrail-translation-pack', KEYF = 'fnv1a-utf16-base36', MIN_MATCH = 0.5;
    const name = (book, lang) => 'packs/' + encodeURIComponent(book) + '.' + encodeURIComponent(lang) + '.json.gz';
    /* Checks a parsed pack. Returns { ok: true, rows, meta } or { ok: false, why }. Another version, a test pack, another book or language are refused. */
    function parse(j, book, lang) {
      if (!j || typeof j !== 'object' || j.format !== FORMAT) return { ok: false, why: 'not a pack' };
      if (j.v !== 1) return { ok: false, why: 'version' };
      if (j.test === true) return { ok: false, why: 'test pack' };
      if (j.key !== KEYF) return { ok: false, why: 'key' };
      if (String(j.book) !== String(book) || j.lang !== lang) return { ok: false, why: 'book or language' };
      if (!Array.isArray(j.s)) return { ok: false, why: 'rows' };
      const rows = [];
      for (const r of j.s) if (Array.isArray(r) && typeof r[0] === 'string' && typeof r[1] === 'string' && r[1].trim()) rows.push([r[0], r[1]]);
      if (!rows.length) return { ok: false, why: 'empty' };
      return { ok: true, rows, meta: { n: rows.length, of: +j.of || 0, engine: String(j.engine || ''), model: String(j.model || ''), license: String(j.license || ''), made: String(j.made || '') } };
    }
    /* Compares the pack rows with the app's own sentences (the sents of S.model: { t, h }). null when there are no sentences to compare with.
       ratio    = share of pack rows that name one of the app's sentences (a different splitting or edition lowers it)
       coverage = share of the app's sentences that the pack can translate
       unmatched = a few row keys that match nothing, for the log */
    function check(rows, sents) {
      if (!Array.isArray(sents) || !sents.length) return null;
      const have = new Set(rows.map(r => r[0])), app = new Set();
      for (const s of sents) { const t = s && !s.h && typeof s.t === 'string' ? s.t.trim() : ''; if (t) app.add(TP.fnv(t)); }
      let matched = 0; const unmatched = [];
      for (const r of rows) { if (app.has(r[0])) matched++; else if (unmatched.length < 3) unmatched.push(r[0]); }
      let covered = 0; app.forEach(k => { if (have.has(k)) covered++; });
      const ratio = rows.length ? matched / rows.length : 0;
      const coverage = app.size ? covered / app.size : 0;
      return { rows: rows.length, matched, app: app.size, covered, ratio, coverage, ok: matched > 0 && (ratio >= MIN_MATCH || coverage >= MIN_MATCH), unmatched };
    }
    /*TPK-END*/

    const CFG = { wait: 3000, fetch: 10000, fresh: 14 * 24 * 3600e3, miss: 10 * 60e3, maxBytes: 12 * 1048576 };
    const st = { cur: null, busy: new Map(), miss: new Map() };   // cur = the one pack held in memory: { id, map, rows, meta, ok, ratio, coverage, checked }
    const bookId = () => (typeof S !== 'undefined' && S.book && S.book.id != null ? String(S.book.id) : '');
    const unavailable = () => Object.assign(new Error('unavailable'), { code: 'unavailable' });
    async function readJson(r) {   // the file is gzip; a host that already unpacked it (Content-Encoding) gives plain JSON, so both are read
      const buf = new Uint8Array(await r.arrayBuffer());
      if (!buf.length || buf.length > CFG.maxBytes) return null;
      let txt;
      if (buf[0] === 0x1f && buf[1] === 0x8b) {
        if (typeof DecompressionStream === 'undefined') return null;
        txt = await new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
      } else txt = new TextDecoder().decode(buf);
      return JSON.parse(txt);
    }
    function verify(cur) {   // once per pack, as soon as the open book's sentences exist
      if (cur.checked) return;
      const sents = typeof S !== 'undefined' && S.model && S.book && String(S.book.id) === cur.book ? S.model.sents : null, c = check(cur.rows, sents);
      if (!c) return;
      cur.checked = true; cur.ratio = c.ratio; cur.coverage = c.coverage; cur.ok = c.ok;
      if (!c.ok) { try { console.warn('translation pack ' + cur.id + ' does not match this book: ' + c.matched + ' of ' + c.rows + ' rows match (not used). Unmatched keys: ' + c.unmatched.join(', ')); } catch (e) { /* no console */ } }
    }
    function load(book, lang) {
      const id = book + '|' + lang;
      if (st.cur && st.cur.id === id) { verify(st.cur); return Promise.resolve(st.cur); }
      if (st.busy.has(id)) return st.busy.get(id);
      const m = st.miss.get(id);
      if (m && Date.now() - m < CFG.miss) return Promise.resolve(null);
      const p = (async () => {
        let d = null;
        try { d = await idb.get('trpack:' + id); } catch (e) { d = null; }
        if (!(d && d.v === 1 && Array.isArray(d.rows) && Date.now() - (d.fetched || 0) < CFG.fresh)) {   // no saved copy, or an old one: ask the host (an old copy stays as the fallback)
          try {
            const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), CFG.fetch);
            const r = await fetchText(name(book, lang), ctl.signal); clearTimeout(to);
            const pp = r && r.ok ? parse(await readJson(r), book, lang) : null;
            if (pp && pp.ok) { d = { v: 1, rows: pp.rows, meta: pp.meta, fetched: Date.now() }; idb.set('trpack:' + id, d); }
          } catch (e) { /* offline, no pack or a damaged one: use the saved copy if there is one */ }
        }
        if (!(d && d.v === 1 && Array.isArray(d.rows) && d.rows.length)) { st.miss.set(id, Date.now()); return null; }
        const cur = { id, book, map: new Map(d.rows), rows: d.rows, meta: d.meta || {}, ok: true, ratio: null, coverage: null, checked: false };
        st.cur = cur; verify(cur);
        return cur;
      })().catch(() => { st.miss.set(id, Date.now()); return null; });
      st.busy.set(id, p); p.then(() => st.busy.delete(id));
      return p;
    }
    function status(book, lang) {
      const id = book + '|' + lang;
      if (st.cur && st.cur.id === id) return { state: st.cur.ok ? 'ready' : 'mismatch', n: st.cur.rows.length, of: st.cur.meta.of || 0, ratio: st.cur.ratio, coverage: st.cur.coverage, meta: st.cur.meta };
      return { state: st.busy.has(id) ? 'loading' : 'none', n: 0, of: 0, ratio: null, coverage: null, meta: null };
    }

    /* the provider: first in line, never live. It waits at most CFG.wait for a pack that is still downloading (the download goes on in the background). */
    TP.register({ id: 'pack', order: 5, live: false,
      async translate(text, lang) {
        const book = bookId();
        if (!book) throw unavailable();
        let tm;
        const cur = await Promise.race([load(book, lang), new Promise(res => { tm = setTimeout(() => res(null), CFG.wait); })]);
        clearTimeout(tm);
        if (!cur) throw unavailable();
        verify(cur);
        const t = cur.ok ? cur.map.get(TP.fnv(text)) : '';
        if (!t) throw unavailable();
        return t;
      } });
    return { load, status, name, parse, check, _t: { st, CFG } };   // _t: for tools/translate_pack_provider_check.js
  })();
