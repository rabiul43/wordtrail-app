  /* ---------- Dictionary data: the full dictionaryapi.dev answer, cleaned and cached (DICT) ----------
     No screen here. Nothing runs at start-up and nothing touches playback: the word panel and Review call it when a word is opened.
     One request to the free api.dictionaryapi.dev service (no key). The answer is cleaned into one small object and kept per word in the
     existing IndexedDB cache (idb, 030) under the key 'dict:<lower-case word>'. Offline, or when the service fails, the saved copy is used.

       DICT.get(w, opts)   -> Promise, never rejects. opts = { refresh: true } skips a fresh copy and asks the service again.
           found:      { ok: true,  from: 'net' | 'cache' | 'old-cache', data }
           no entry:   { ok: false, reason: 'none' }       (the service has no entry for this word; remembered for 7 days)
           no answer:  { ok: false, reason: 'offline' }    (no network or service error, and nothing saved for this word)
         'cache' is a copy under 30 days old; 'old-cache' is an older copy used only because the service could not be reached.
       DICT.clean(json, w) -> the data object from a raw answer (the list the service sends), or null. Pure; used by get().
       DICT.key(w)         -> the cache key.

     data (v 1), every list may be empty, every text is plain text:
       { v: 1, w, ipa, audio, origin, pos: ['adjective', ...],
         meanings: [ { pos, defs: [ { d: definition, ex: example or '', syn: [], ant: [] } ], syn: [], ant: [] } ],   // all parts of speech, all definitions
         syn: [], ant: [],     // every synonym / antonym of the word, no repeats, at most 12 each
         ex: [],               // every example sentence, no repeats, at most 8
         fetched: ms }
     Size limits keep one word small (a few KB). The cache entry is { v: 1, none: true, fetched } for a word with no entry. */
  const DICT = (() => {
    const API = 'https://api.dictionaryapi.dev/api/v2/entries/en/', PREFIX = 'dict:';
    const FRESH = 30 * 864e5, FRESH_NONE = 7 * 864e5, TIMEOUT = 9000;
    const MAX_DEF = 320, MAX_EX = 240, MAX_DEFS = 12, MAX_MEAN = 10, MAX_LIST = 12, MAX_EXS = 8, MAX_ORIGIN = 400;
    const live = new Map();   // word -> the request in progress, so two screens asking at once make one request
    const norm = w => String(w == null ? '' : w).trim().toLowerCase();
    const text = (x, n) => { x = typeof x === 'string' ? x.replace(/\s+/g, ' ').trim() : ''; return x.length > n ? x.slice(0, n - 1).trimEnd() + '…' : x; };
    const list = (a, w, max, into) => {
      const out = into || [], seen = new Set(out.map(s => s.toLowerCase()));
      (Array.isArray(a) ? a : []).forEach(x => {
        const s = text(x, 60), k = s.toLowerCase();
        if (s && k !== w && !seen.has(k) && out.length < max) { seen.add(k); out.push(s); }
      });
      return out;
    };

    function clean(json, word) {
      const w = norm(word);
      if (!Array.isArray(json) || !json.length || !w) return null;
      const data = { v: 1, w, ipa: '', audio: '', origin: '', pos: [], meanings: [], syn: [], ant: [], ex: [], fetched: 0 };
      json.forEach(en => {
        if (!en || typeof en !== 'object') return;
        const ph = Array.isArray(en.phonetics) ? en.phonetics : [];
        if (!data.ipa) data.ipa = text(en.phonetic, 60) || text((ph.find(p => p && text(p.text, 60)) || {}).text, 60);
        if (!data.audio) { const a = ph.map(p => p && typeof p.audio === 'string' ? p.audio.trim() : '').find(u => /^https:\/\//i.test(u)); if (a) data.audio = a.slice(0, 300); }
        if (!data.origin) data.origin = text(en.origin, MAX_ORIGIN);
        (Array.isArray(en.meanings) ? en.meanings : []).forEach(m => {
          if (!m || typeof m !== 'object' || data.meanings.length >= MAX_MEAN) return;
          const defs = [], msyn = list(m.synonyms, w, MAX_LIST), mant = list(m.antonyms, w, MAX_LIST);
          (Array.isArray(m.definitions) ? m.definitions : []).forEach(d => {
            const t = d && text(d.definition, MAX_DEF); if (!t || defs.length >= MAX_DEFS) return;
            const ex = text(d.example, MAX_EX), syn = list(d.synonyms, w, MAX_LIST), ant = list(d.antonyms, w, MAX_LIST);
            defs.push({ d: t, ex, syn, ant });
            if (ex && data.ex.length < MAX_EXS && data.ex.indexOf(ex) < 0) data.ex.push(ex);
            list(syn, w, MAX_LIST, data.syn); list(ant, w, MAX_LIST, data.ant);
          });
          if (!defs.length) return;
          const pos = text(m.partOfSpeech, 30).toLowerCase();
          if (pos && data.pos.indexOf(pos) < 0) data.pos.push(pos);
          list(msyn, w, MAX_LIST, data.syn); list(mant, w, MAX_LIST, data.ant);
          data.meanings.push({ pos, defs, syn: msyn, ant: mant });
        });
      });
      return data.meanings.length ? data : null;
    }

    const key = w => PREFIX + norm(w);
    const valid = c => !!c && typeof c === 'object' && c.v === 1 && (c.none === true || (Array.isArray(c.meanings) && c.meanings.length > 0));
    const age = c => Date.now() - (typeof c.fetched === 'number' ? c.fetched : 0);

    async function fetchRaw(w) {
      const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), TIMEOUT);
      try {
        const r = await fetch(API + encodeURIComponent(w), { signal: ctl.signal });
        if (r.status === 404) return { none: true };
        if (!r.ok) throw new Error('http ' + r.status);
        return { json: await r.json() };
      } finally { clearTimeout(to); }
    }

    async function load(w, o) {
      let c = null;
      try { c = await idb.get(key(w)); } catch (e) { /* no saved copy */ }
      if (!valid(c)) c = null;
      if (c && !(o && o.refresh) && age(c) < (c.none ? FRESH_NONE : FRESH)) return c.none ? { ok: false, reason: 'none' } : { ok: true, from: 'cache', data: c };
      if (typeof navigator === 'undefined' || navigator.onLine !== false) {
        try {
          const r = await fetchRaw(w);
          if (r.none) { idb.set(key(w), { v: 1, none: true, fetched: Date.now() }); return { ok: false, reason: 'none' }; }
          const d = clean(r.json, w);
          if (!d) { idb.set(key(w), { v: 1, none: true, fetched: Date.now() }); return { ok: false, reason: 'none' }; }
          d.fetched = Date.now(); idb.set(key(w), d);
          return { ok: true, from: 'net', data: d };
        } catch (e) { /* offline, slow or a service error: use the saved copy below */ }
      }
      if (c) return c.none ? { ok: false, reason: 'none' } : { ok: true, from: 'old-cache', data: c };
      return { ok: false, reason: 'offline' };
    }

    function get(w, o) {
      const k = norm(w); if (!k) return Promise.resolve({ ok: false, reason: 'none' });
      if (live.has(k) && !(o && o.refresh)) return live.get(k);
      const p = load(k, o).catch(() => ({ ok: false, reason: 'offline' })).then(r => { live.delete(k); return r; });
      live.set(k, p); return p;
    }

    return { get, clean, key };
  })();
