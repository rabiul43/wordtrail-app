  /* ---------- Known words (KW, Task 40) ----------
     The words the reader says they know, kept as ONE short text so it is cheap to store and to sync.
       wt:known = "abandon dread forlorn ominous ..."     one string: lower-case words, A to Z, one space between words
     A word is lower case letters, with an inner ' or - allowed (don't, well-known), 1 to 40 characters. Anything else is ignored, never stored.
     Size: about 8 bytes a word on average, so even 5,000 words are about 40 KB. The most the string may hold is 20,000 words or 200,000
       characters (add() says no past that), far below the 900 KB limit for one synced item (AC_MAX in 295).
     Synced (category "Favourites, saved words, searches" in 295). Two devices are merged by UNION (KW.mergeJson, called by acResolve in 295):
       every word known on either device is known after the merge, so a merge never loses a word and can be repeated safely (same result every time).
       Because it is a union, a word removed on one device comes back if another device still has it.
     Cheap by design: nothing runs at start-up and nothing is read until the first call. The words are then kept in one Set in memory
       (read once; read again only when another tab changes the key). Playback never needs this file; every caller wraps it in try/catch.
     API (later tasks call these):
       KW.isKnown(word)        true or false (any case; spaces around the word are ignored)
       KW.add(word | [words])  returns how many NEW words were stored (0 when already known, invalid, or the store is full)
       KW.remove(word | [words])   returns how many words were removed
       KW.count()              how many words are known
       KW.merge(A, B) / KW.mergeJson(a, b)   the union (A, B = the strings; a, b = the stored JSON text; mergeJson gives JSON text, or null when either is not a string)
     Test: node tools/known_words_check.js. Remove this file, its build.py line and the three wt:known mentions in 295 to go back. */
  const KWC = (() => {
    /*KWC-START*/
    const MAX_WORDS = 20000, MAX_CHARS = 200000, MERGE_WORDS = 40000;   // MERGE_WORDS: a merge of two full devices still stays under 400,000 characters
    const WORD = /^[a-z](?:[a-z'-]{0,38}[a-z])?$|^[a-z]$/;
    /* one word, cleaned: lower case, curly apostrophe made straight; '' when it is not a word */
    function norm(w) { w = typeof w === 'string' ? w.trim().toLowerCase().replace(/’/g, "'") : ''; return WORD.test(w) ? w : ''; }
    /* the stored text -> a Set; a stored value that is not text gives an empty Set (and is repaired the next time something is added) */
    const parse = s => { const set = new Set(); if (typeof s === 'string') s.split(' ').forEach(x => { const w = norm(x); if (w) set.add(w); }); return set; };
    const join = set => [...set].sort().join(' ');
    /* the union of two stored texts; sorted, so the same two inputs always give the same text, in either order */
    function merge(A, B) {
      if (typeof A !== 'string' || typeof B !== 'string') return null;
      const set = parse(A); parse(B).forEach(w => set.add(w));
      let list = [...set].sort(); if (list.length > MERGE_WORDS) list = list.slice(0, MERGE_WORDS);
      return list.join(' ');
    }
    /*KWC-END*/
    return { MAX_WORDS, MAX_CHARS, norm, parse, join, merge };
  })();

  const KW = (() => {
    const KEY = 'wt:known';
    let set = null, listening = false;
    function load() {
      if (set) return set;   // read once; dropped again when another tab changes the key
      let v = null; try { v = store.get(KEY, null); } catch (e) { /* storage unavailable */ }
      set = KWC.parse(v);
      if (!listening) { listening = true; try { window.addEventListener('storage', ev => { if (ev.key === KEY || ev.key === null) set = null; }); } catch (e) { /* no storage events */ } }
      return set;
    }
    function save(s) {
      const text = KWC.join(s);
      if (s.size > KWC.MAX_WORDS || text.length > KWC.MAX_CHARS) return false;
      try { store.set(KEY, text); } catch (e) { return false; }
      set = s; return true;
    }
    const many = x => Array.isArray(x) ? x : [x];
    const isKnown = w => { const k = KWC.norm(w); return !!k && load().has(k); };
    function add(words) {
      const s = new Set(load()), before = s.size;
      many(words).forEach(w => { const k = KWC.norm(w); if (k) s.add(k); });
      const n = s.size - before; if (n <= 0) return 0;
      return save(s) ? n : 0;
    }
    function remove(words) {
      const s = new Set(load()), before = s.size;
      many(words).forEach(w => { const k = KWC.norm(w); if (k) s.delete(k); });
      const n = before - s.size; if (n <= 0) return 0;
      return save(s) ? n : 0;
    }
    const count = () => load().size;
    function mergeJson(a, b) {
      let A, B; try { A = JSON.parse(a); B = JSON.parse(b); } catch (e) { return null; }
      const m = KWC.merge(A, B); return m === null ? null : JSON.stringify(m);
    }
    return { isKnown, add, remove, count, merge: KWC.merge, mergeJson };
  })();
