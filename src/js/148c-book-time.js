  /* ---------- Time per book (BT) ----------
     wt:booktime = { '<book id>': seconds listened to that book (whole numbers) }
     The same listening clock as wt:stats and the learning log (090 calls BT.add next to LL.time), so the per-book numbers in Progress add up to the same time.
     Synced (category 'Progress and listening stats' in 295). Two devices are merged per book by taking the LARGER value (BT.merge), so a merge can never lose
     time and can be repeated safely. It does not add the two devices together. At most 400 books are kept (the ones with the least time go first).
     Cheap by design, like 148b: time is only added to a number in memory (BT.add) and written to storage about once a minute and when the page is hidden.
     Nothing here is needed for playback: every call site is wrapped in try/catch.
     API (later tasks call these):
       BT.add(bookId, seconds)   listening time for a book (ignores nonsense and jumps over 10 minutes)
       BT.get()                  { id: seconds } (a copy; includes time not written yet)
       BT.flush()                write what is waiting now
       BT.merge(A, B) / BT.mergeJson(a, b)   the per-book merge (a, b = JSON text; returns JSON text, or null when either is not an object) */
  const BT = (() => {
    const KEY = 'wt:booktime', KEEP = 400;
    const num = v => (typeof v === 'number' && isFinite(v) && v > 0) ? Math.floor(v) : 0;
    const isObj = x => !!x && typeof x === 'object' && !Array.isArray(x);
    const read = () => { let v = null; try { v = store.get(KEY, null); } catch (e) { /* storage unavailable */ } return isObj(v) ? v : {}; };
    const pend = {};   // seconds not yet written, in memory only (may hold a fraction)
    let waiting = 0;
    function prune(o) { const ids = Object.keys(o); if (ids.length > KEEP) ids.sort((a, b) => o[a] - o[b]).slice(0, ids.length - KEEP).forEach(k => { delete o[k]; }); }
    function write(all) {   // all: write every whole second now; else only when a minute is waiting
      if (!all && waiting < 60) return;
      const log = read(); let any = false;
      Object.keys(pend).forEach(id => { const n = Math.floor(pend[id]); if (n > 0) { log[id] = num(log[id]) + n; pend[id] -= n; waiting -= n; any = true; } });
      if (waiting < 0 || !isFinite(waiting)) waiting = 0;
      if (!any) return;
      prune(log);
      try { store.set(KEY, log); } catch (e) { /* storage full */ }
    }
    function add(id, sec) {
      if (id == null || id === '' || !(sec > 0) || sec > 600) return;
      const k = String(id); pend[k] = (pend[k] || 0) + sec; waiting += sec; write(false);
    }
    function get() {
      const o = {}, log = read();
      Object.keys(log).forEach(k => { const n = num(log[k]); if (n) o[k] = n; });
      Object.keys(pend).forEach(k => { const n = Math.floor(pend[k]); if (n > 0) o[k] = (o[k] || 0) + n; });
      return o;
    }
    function merge(A, B) {
      const out = {};
      [A, B].forEach(L => { if (isObj(L)) Object.keys(L).forEach(k => { const n = num(L[k]); if (n > (out[k] || 0)) out[k] = n; }); });
      prune(out); return out;
    }
    function mergeJson(a, b) {
      let A, B; try { A = JSON.parse(a); B = JSON.parse(b); } catch (e) { return null; }
      if (!isObj(A) || !isObj(B)) return null;
      return JSON.stringify(merge(A, B));
    }
    try {
      document.addEventListener('visibilitychange', () => { if (document.hidden) write(true); });
      window.addEventListener('pagehide', () => write(true));
    } catch (e) { /* no page events (tests) */ }
    return { KEY, add, get, flush: () => write(true), merge, mergeJson };
  })();
