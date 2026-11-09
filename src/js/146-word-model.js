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

    return { V, MAX_CTX, STAGES, KEYS, stage, migrate, migrateList, addCtx };
  })();
