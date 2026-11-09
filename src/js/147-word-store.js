  /* ---------- Word data: store API (wt:words) ----------
     The one place that reads and writes the saved-word list. Every change to a saved word goes through here.
     Nothing runs at start-up and nothing here touches playback; the learning code calls it when you act on a word.
     One entry per word, found by its lower-case text. Entries are made and upgraded by WM (146-word-model.js).
     Old entries are upgraded lazily: reading gives you an upgraded copy, and only the entry you change is written back
     upgraded. No field is ever removed. Every write goes through store.set, so account sync (295) still sees it.
       WS.get(w)                          the entry, or null
       WS.all()                           every entry, newest saved first
       WS.saveWithContext(w, ctx, meta)   save the word, or add a place to an already saved word. ctx = { s, bid, bt, ch, t }
                                          (sentence, book id, book title, chapter, time); meta = { lv, ex } only used for a new word.
                                          The same sentence in the same book is kept once. Returns the entry.
       WS.remove(w)                       true if a word was removed
       WS.setNote(w, text)                saved word only; returns the entry, or null if the word is not saved
       WS.toggleHard(w)                   saved word only; returns the new true/false, or null if the word is not saved
       WS.addToCollection(w, name, on)    saved word only; on === false takes it out of the collection. Returns the entry or null
       WS.renameCollection(from, to)      renames a collection on every word in ONE write; returns how many words changed
       WS.search(q, opts)                 opts = { hard, col, limit }. Looks in the word, note, sentences and collections
       WS.update(w, fn)                   the Review uses this: fn changes a copy of the entry, the stage is worked out again */
  const WS = (() => {
    const KEY = 'wt:words', MAX = 2000, MAX_NOTE = 1000, MAX_COL = 40, MAX_COLS = 20;
    const key = w => String(w == null ? '' : w).trim().toLowerCase();
    const isW = e => !!e && typeof e === 'object' && typeof e.w === 'string';
    const raw = () => { const l = store.get(KEY, []); return Array.isArray(l) ? l : []; };
    const idx = (list, k) => list.findIndex(e => isW(e) && key(e.w) === k);
    const save = list => store.set(KEY, list);

    /* Change one saved entry. fn gets a copy and either changes it or returns a new entry. null when the word is not saved. */
    function change(w, fn) {
      const k = key(w); if (!k) return null;
      const list = raw().slice(), i = idx(list, k); if (i < 0) return null;
      const c = Object.assign({}, WM.migrate(list[i])), r = fn(c), n = r || c;
      list[i] = n; save(list); return n;
    }
    function get(w) { const k = key(w), list = raw(), i = k ? idx(list, k) : -1; return i < 0 ? null : WM.migrate(list[i]); }
    const all = () => WM.migrateList(raw()).list;

    function saveWithContext(w, ctx, meta) {
      const k = key(w); if (!k) return null;
      const c = Object.assign({ t: Date.now() }, ctx || {}), m = meta || {};
      const list = raw().slice(), i = idx(list, k);
      if (i >= 0) { const n = WM.addCtx(list[i], c); list[i] = n; save(list); return n; }
      const base = { ts: Date.now(), w: k, lv: m.lv || '', ex: m.ex != null ? m.ex : (c.s || ''), bid: c.bid == null ? '' : String(c.bid), bt: c.bt || '' };
      const n = WM.addCtx(WM.migrate(base), c);
      list.unshift(n); save(list.slice(0, MAX)); try { LL.newWord(); } catch (e) { /* learning log (148b) not loaded */ } return n;
    }
    function remove(w) {
      const k = key(w), list = raw(); if (!k || idx(list, k) < 0) return false;
      save(list.filter(e => !(isW(e) && key(e.w) === k))); return true;
    }
    const setNote = (w, text) => change(w, e => { e.note = String(text == null ? '' : text).trim().slice(0, MAX_NOTE); });
    function toggleHard(w) { const n = change(w, e => { e.hard = !e.hard; }); return n ? n.hard : null; }
    function addToCollection(w, name, on) {
      const nm = String(name == null ? '' : name).trim().slice(0, MAX_COL), nk = nm.toLowerCase(); if (!nm) return null;
      return change(w, e => {
        const cols = Array.isArray(e.cols) ? e.cols : [], has = cols.some(c => String(c).toLowerCase() === nk);
        if (on === false) e.cols = cols.filter(c => String(c).toLowerCase() !== nk);
        else if (!has) e.cols = cols.concat(nm).slice(-MAX_COLS);   // already in it: nothing changes
      });
    }
    function renameCollection(from, to) {
      const fk = key(from), nm = String(to == null ? '' : to).trim().slice(0, MAX_COL), nk = nm.toLowerCase(); if (!fk || !nm) return 0;
      const list = raw().slice(); let n = 0;
      list.forEach((e, i) => {
        if (!isW(e) || !Array.isArray(e.cols) || !e.cols.some(c => key(c) === fk)) return;
        const m = WM.migrate(e), has = new Set(m.cols.filter(c => key(c) !== fk).map(key)), cols = [];
        m.cols.forEach(c => { if (key(c) !== fk) cols.push(c); else if (!has.has(nk)) { has.add(nk); cols.push(nm); } });   // an existing spelling of the new name wins
        list[i] = Object.assign({}, m, { cols }); n++;
      });
      if (n) save(list); return n;
    }
    /* A word on the scheduler (sch 1) gets its stage from SRS.stage (148); an old word keeps the old rule. The result is copied, never the shared entry. */
    const update = (w, fn) => change(w, e => { const r = Object.assign({}, fn(e) || e); r.st = r.sch === 1 ? SRS.stage(r) : WM.stage(r); return r; });

    function search(q, opts) {
      const o = opts || {}, t = key(q), col = o.col ? key(o.col) : '', hits = [];
      all().forEach(e => {
        if (!isW(e) || (o.hard && !e.hard)) return;
        const cols = Array.isArray(e.cols) ? e.cols : [], ctx = Array.isArray(e.ctx) ? e.ctx : [];
        if (col && !cols.some(c => key(c) === col)) return;
        let r = 0;
        if (!t) r = 1;
        else {
          const w = key(e.w);
          if (w === t) r = 4; else if (w.startsWith(t)) r = 3; else if (w.includes(t)) r = 2;
          else if (key(e.note).includes(t) || cols.some(c => key(c).includes(t)) || ctx.some(c => c && key(c.s).includes(t))) r = 1;
        }
        if (r) hits.push({ e, r });
      });
      hits.sort((a, b) => b.r - a.r);   // stable: same rank keeps newest first
      const out = hits.map(x => x.e);
      return o.limit > 0 ? out.slice(0, o.limit) : out;
    }

    return { get, all, saveWithContext, remove, setNote, toggleHard, addToCollection, renameCollection, search, update };
  })();
