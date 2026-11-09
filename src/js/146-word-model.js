  /* ---------- Saved-word model (wt:words), version 2 ----------
     Pure functions only: no storage, no clock, no screen. Nothing here runs by itself; the learning code calls it.
     An OLD entry (made by 160-learning-tools.js) looks like:
       { ts, w, lv, ex, bid, bt }  and, after a Review, also { ease, iv, reps, due, acq }.
     A v2 entry keeps every one of those fields and adds:
       v     2
       ctx   places you met the word, newest first, at most 5: { s: sentence, bid: book id, bt: book title, ch: chapter number or null, t: time (ms) or null }
       note  your own note ('' when none)
       hard  true when you marked it hard
       cols  names of your own collections (list of text)
       st    'new' | 'learning' | 'familiar' | 'mastered'   (worked out from the Review fields when the entry is migrated)
       cnt   { rec, und, rcl, use }  how many times you got it right: recognise, understand, recall, use
     migrate() never changes its input and never removes a field. Running it twice gives the same result. An entry with v above 2
     (made by a newer app) and anything that is not a word entry is returned as it is. */
  const WM = (() => {
    const V = 2, MAX_CTX = 5, MAX_S = 240, MAX_T = 80;
    const STAGES = ['new', 'learning', 'familiar', 'mastered'], KEYS = ['rec', 'und', 'rcl', 'use'];
    const isObj = x => !!x && typeof x === 'object' && !Array.isArray(x);
    const isWord = e => isObj(e) && typeof e.w === 'string';
    const text = (x, n) => { x = x == null ? '' : String(x).trim(); return x.length > n ? x.slice(0, n - 1).trimEnd() + '\u2026' : x; };
    const whole = x => (typeof x === 'number' && isFinite(x) && x > 0) ? Math.floor(x) : 0;
    const ctxOf = (s, bid, bt, ch, t) => ({ s: text(s, MAX_S), bid: bid == null ? '' : String(bid), bt: text(bt, MAX_T), ch: (typeof ch === 'number' && isFinite(ch)) ? ch : null, t: (typeof t === 'number' && isFinite(t)) ? t : null });

    /* How strong a word is, from the Review fields (iv = days until the next review, reps = right answers in a row). */
    function stage(e) {
      const iv = whole(e && e.iv), reps = whole(e && e.reps);
      if (iv >= 30) return 'mastered';
      if (iv >= 14) return 'familiar';
      if (iv > 0 || reps > 0 || (e && (e.due || e.ease))) return 'learning';
      return 'new';
    }
    const counters = c => { const o = {}; KEYS.forEach(k => { o[k] = whole(isObj(c) ? c[k] : 0); }); return o; };
    const valid = e => e.v === V && Array.isArray(e.ctx) && e.ctx.length <= MAX_CTX && typeof e.note === 'string' && typeof e.hard === 'boolean' &&
      Array.isArray(e.cols) && STAGES.indexOf(e.st) >= 0 && isObj(e.cnt) && KEYS.every(k => Number.isInteger(e.cnt[k]) && e.cnt[k] >= 0);

    function migrate(e) {
      if (!isWord(e) || e.v > V) return e;      // not a word entry, or made by a newer app: leave it alone
      if (valid(e)) return e;                   // already v2 and complete: same object back
      const out = Object.assign({}, e);         // every old field stays
      out.v = V;
      if (Array.isArray(e.ctx)) out.ctx = e.ctx.filter(isObj).slice(0, MAX_CTX);
      else {   // the old entry becomes one context (none when it has no sentence and no book)
        const c = ctxOf(e.ex, e.bid, e.bt, null, e.ts);
        out.ctx = (c.s || c.bid || c.bt) ? [c] : [];
      }
      out.note = typeof e.note === 'string' ? e.note : '';
      out.hard = e.hard === true;
      out.cols = Array.isArray(e.cols) ? e.cols.filter(x => typeof x === 'string') : [];
      out.st = STAGES.indexOf(e.st) >= 0 ? e.st : stage(e);
      out.cnt = counters(e.cnt);
      return out;
    }

    /* A whole saved list. Returns { list, changed }; when nothing needed upgrading, list is the same array you passed in. */
    function migrateList(list) {
      if (!Array.isArray(list)) return { list: [], changed: false };
      let changed = false;
      const out = list.map(e => { const m = migrate(e); if (m !== e) changed = true; return m; });
      return changed ? { list: out, changed: true } : { list, changed: false };
    }

    /* Add a place where you met the word. c = { s, bid, bt, ch, t }. Newest first; the same sentence in the same book moves to the front
       instead of being added twice; the oldest are dropped past 5. No sentence: the entry comes back unchanged (but migrated). */
    function addCtx(e, c) {
      const m = migrate(e);
      if (!isWord(m) || m.v !== V || !isObj(c)) return m;
      const n = ctxOf(c.s, c.bid, c.bt, c.ch, c.t);
      if (!n.s) return m;
      const rest = m.ctx.filter(x => !(x && x.s === n.s && String(x.bid) === n.bid));
      return Object.assign({}, m, { ctx: [n].concat(rest).slice(0, MAX_CTX) });
    }

    /* ---- two copies of the same word (two devices, or two entries in a backup file) ----
       merge(a, b) gives one entry. It does not matter which copy is passed first: the same two copies always give the same answer,
       so two devices that merge each other's copies end up with identical data and do not keep re-uploading.
         places (ctx)  both lists joined, the same book + sentence once (the later time kept), newest first, at most 5
         schedule      ease, iv, reps, due come together from the copy reviewed most recently (worked out from due and iv; a tie goes to
                       more reps); acq is the earliest time; cnt takes the larger of each counter; st is worked out again
         note          both kept (joined with ' / ') unless one already holds the other; at most 1000 characters
         hard          true if either copy says hard
         cols          both lists joined, no repeats (any case), at most 20 names of at most 40 characters
         w             the lower-case word
         ts            the earliest save time; lv, ex, bid, bt come from the copy saved first, an empty one is filled from the other
       Every other field is kept (the copy saved first wins when both have it). Returns null when the two are not the same word or either is
       not a v2 entry (made by a newer app, or not a word): the caller then keeps the newer one as before. */
    const MAX_NOTE = 1000, MAX_COL = 40, MAX_COLS = 20, DAY = 864e5;
    const lastRev = e => { const due = whole(e && e.due); return due ? due - (whole(e.iv) ? whole(e.iv) * DAY : 600e3) : 0; };
    const wkey = e => String(e.w).trim().toLowerCase();
    const wmSig = e => JSON.stringify(e);
    function cleanCols(list) {
      const seen = new Set(), out = [];
      list.forEach(c => { c = text(c, MAX_COL); const q = c.toLowerCase(); if (c && !seen.has(q)) { seen.add(q); out.push(c); } });
      return out.slice(0, MAX_COLS);
    }
    function cleanCtx(list) {
      const map = new Map();
      list.filter(isObj).forEach(c => {
        const n = ctxOf(c.s, c.bid, c.bt, c.ch, c.t), q = n.bid + '\u0001' + n.s, o = map.get(q);
        if (!o || (n.t || 0) > (o.t || 0)) map.set(q, n);
      });
      return [...map.values()].sort((x, y) => (y.t || 0) - (x.t || 0)).slice(0, MAX_CTX);
    }
    /* One v2 entry with its size limits applied (places, note, collections). Older entries and newer-app entries come back as migrate() gives them. */
    function tidy(e) {
      const m = migrate(e);
      if (!isWord(m) || m.v !== V) return m;
      return Object.assign({}, m, { ctx: cleanCtx(m.ctx), note: m.note.slice(0, MAX_NOTE), cols: cleanCols(m.cols) });
    }
    function merge(a, b) {
      const x = migrate(a), y = migrate(b);
      if (!isWord(x) || !isWord(y) || x.v !== V || y.v !== V || wkey(x) !== wkey(y)) return null;
      const tx = whole(x.ts), ty = whole(y.ts);
      const xFirst = (tx && ty && tx !== ty) ? tx < ty : wmSig(x) <= wmSig(y);
      const p = xFirst ? x : y, q = xFirst ? y : x;           // p: saved first (or the smaller copy on a tie), q: the other
      const lp = lastRev(p), lq = lastRev(q);
      const win = (lq > lp || (lq === lp && whole(q.reps) > whole(p.reps))) ? q : p;
      const out = Object.assign({}, q, p);
      ['ease', 'iv', 'reps', 'due'].forEach(k => { if (win[k] !== undefined) out[k] = win[k]; });
      const aq = [whole(p.acq), whole(q.acq)].filter(Boolean); if (aq.length) out.acq = Math.min.apply(null, aq);
      const ts = [tx, ty].filter(Boolean); if (ts.length) out.ts = Math.min.apply(null, ts);
      ['lv', 'ex', 'bid', 'bt'].forEach(k => { if (!out[k] && q[k]) out[k] = q[k]; });
      const cnt = {}; KEYS.forEach(k => { cnt[k] = Math.max(p.cnt[k], q.cnt[k]); });
      const n1 = p.note.trim(), n2 = q.note.trim();
      out.note = (!n1 ? n2 : (!n2 || n1 === n2 || n1.indexOf(n2) >= 0) ? n1 : n2.indexOf(n1) >= 0 ? n2 : n1 + ' / ' + n2).slice(0, MAX_NOTE);
      out.v = V; out.w = wkey(x); out.cnt = cnt; out.hard = p.hard || q.hard;   // one entry per lower-case word
      out.ctx = cleanCtx(p.ctx.concat(q.ctx)); out.cols = cleanCols(p.cols.concat(q.cols));
      out.st = stage(out);
      return out;
    }
    /* A whole saved list from outside (a backup file). Returns { list, skipped }. Entries that are not words are dropped and counted.
       The same word twice (any case) is merged. Old entries are kept as they are (they upgrade later, when changed); v2 entries get their size
       limits applied. At most `max` entries (the first ones, so the newest). */
    function tidyList(list, max) {
      const at = new Map(), out = []; let skipped = 0;
      (Array.isArray(list) ? list : []).forEach(e => {
        if (!isWord(e) || !e.w.trim()) { skipped++; return; }
        const k = wkey(e), i = at.get(k);
        if (i === undefined) { at.set(k, out.length); out.push(e.v === V ? tidy(e) : e); return; }
        out[i] = merge(out[i], e) || out[i];
      });
      return { list: out.slice(0, max > 0 ? max : 2000), skipped };
    }

    return { V, MAX_CTX, STAGES, KEYS, stage, migrate, migrateList, addCtx, tidy, merge, tidyList };
  })();
