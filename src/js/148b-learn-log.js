  /* ---------- Learning stats log (LL) ----------
     wt:learnlog = { 'YYYY-MM-DD': { m: minutes, r: reviews, c: correct reviews, n: new words saved, q: questions answered } }
     One record per day (this device's local date, same day rule as wt:stats). Every field is a whole number; a missing field is 0.
     Synced (category 'Learning stats' in 295). Two devices are merged per day by taking the LARGER value of each field (LL.merge),
     so a merge can never lose a day and can be repeated safely. It does not add the two devices together: two devices that log
     the same day keep the bigger of the two numbers. Only the last 400 days are kept.
     Cheap by design: reading time is only added to a number in memory (LL.time) and written to storage once a minute and when the page is
     hidden; a review, a new word or a question is one small write. Nothing here is needed for playback: every call site is wrapped in try/catch.
     API (later tasks call these):
       LL.time(seconds)        reading or listening time; written as whole minutes (a remainder under 30 s is dropped when the page is hidden)
       LL.review(correct)      one review answer: r + 1, and c + 1 when correct
       LL.newWord()            one new word saved: n + 1
       LL.question(count)      chapter questions answered (default 1): q + count
       LL.get(day) / LL.today() / LL.all()   read records (copies)
       LL.merge(A, B) / LL.mergeJson(a, b)   the per-day merge (a, b = JSON text; returns JSON text, or null when either is not a log) */
  const LL = (() => {
    const KEY = 'wt:learnlog', FIELDS = ['m', 'r', 'c', 'n', 'q'], KEEP = 400, DAY = /^\d{4}-\d{2}-\d{2}$/;
    const num = v => (typeof v === 'number' && isFinite(v) && v > 0) ? Math.floor(v) : 0;
    const isObj = x => !!x && typeof x === 'object' && !Array.isArray(x);
    const dayOf = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
    const read = () => { let v = null; try { v = store.get(KEY, null); } catch (e) { /* storage unavailable */ } return isObj(v) ? v : {}; };
    function prune(log) { Object.keys(log).sort().slice(0, Math.max(0, Object.keys(log).length - KEEP)).forEach(k => { delete log[k]; }); }
    function bump(add) {   // add = { m, r, c, n, q }: numbers to add to today's record. One storage write.
      const log = read(), k = dayOf(), d = isObj(log[k]) ? log[k] : (log[k] = {});
      let any = false;
      FIELDS.forEach(f => { const n = num(add && add[f]); if (n) { d[f] = num(d[f]) + n; any = true; } });
      if (!any) return false;
      prune(log);
      try { store.set(KEY, log); } catch (e) { return false; }
      return true;
    }
    let pend = 0;   // seconds not yet written, in memory only
    function time(sec) {
      if (!(sec > 0) || sec > 600) return;   // ignore nonsense and jumps
      pend += sec;
      if (pend >= 60) { const m = Math.floor(pend / 60); pend -= m * 60; bump({ m }); }
    }
    function flush() { if (pend >= 30) { pend = 0; bump({ m: 1 }); } else if (pend >= 60) time(0); }
    function clean(d) { const o = {}; if (!isObj(d)) return o; FIELDS.forEach(f => { const n = num(d[f]); if (n) o[f] = n; }); return o; }
    function merge(A, B) {   // per day, the larger value of each field. Neither input is changed.
      const out = {}, days = {};
      [A, B].forEach(L => { if (isObj(L)) Object.keys(L).forEach(k => { if (DAY.test(k)) days[k] = 1; }); });
      Object.keys(days).sort().forEach(k => {
        const x = clean(isObj(A) ? A[k] : null), y = clean(isObj(B) ? B[k] : null), o = {};
        FIELDS.forEach(f => { const n = Math.max(x[f] || 0, y[f] || 0); if (n) o[f] = n; });
        if (Object.keys(o).length) out[k] = o;
      });
      prune(out);
      return out;
    }
    function mergeJson(a, b) {
      let A, B; try { A = JSON.parse(a); B = JSON.parse(b); } catch (e) { return null; }
      if (!isObj(A) || !isObj(B)) return null;
      return JSON.stringify(merge(A, B));
    }
    const get = day => Object.assign({}, clean(read()[day]));
    try {
      document.addEventListener('visibilitychange', () => { if (document.hidden) flush(); });
      window.addEventListener('pagehide', flush);
    } catch (e) { /* no page events (tests) */ }
    return { KEY, FIELDS, time, review: ok => bump({ r: 1, c: ok ? 1 : 0 }), newWord: () => bump({ n: 1 }), question: n => bump({ q: n == null ? 1 : n }), bump, flush, get, today: () => get(dayOf()), all: () => { const l = read(), o = {}; Object.keys(l).sort().forEach(k => { o[k] = clean(l[k]); }); return o; }, merge, mergeJson };
  })();
