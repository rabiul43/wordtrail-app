  /* ---------- translation provider layer (TP) ----------
     One place that turns an English sentence into the reader's language. No language is special: the language code
     comes from the caller (trLang, 160) and is only passed on.
     Order for every sentence:  saved copy (memory, then IndexedDB)  ->  providers by `order`  ->  save the answer.
       provider = { id, order, live, translate(text, lang, signal) -> Promise<string> }
         `live` = uses a network service, so it goes through the queue gap, the backoff and the limit state.
         It throws an Error with .code: 'unavailable' (try the next provider), 'limit', 'offline', 'network', 'fail'.
       Built in: 'device' (the browser's own translator, order 10, no limit) and 'mymemory' (free service, order 20).
     Live provider rules: one request at a time, at least CFG.gap ms apart; the sentence being read (prio 0) goes before the
     one fetched ahead (prio 1); a network error pauses live requests with growing waits (1.5 s, 3 s, 6 s ... 60 s);
     a daily-limit answer (HTTP 429 or the service's warning text) switches to the 'limit' state for 30 min, 1 h, 2 h ... 6 h
     (or the time the service names) and remembers it on this device in wt:trlimit (not synced). While paused nothing is
     sent: saved sentences still resolve, others reject at once with .code and .retryAt.
     Cache: its own IndexedDB 'wordtrail-tr', store 'tr', key '<lang>|<hash>' -> { s: sentence, t: translation, p: provider, ts }.
     Newest kept: above CFG.maxEntries the oldest are deleted down to CFG.pruneTo. If IndexedDB is not there, memory only.
       TP.get(text, lang, { prio, owner }) -> Promise<string>      TP.peek(text, lang) -> saved string or ''
       TP.drop(owner)        rejects the waiting (not yet started) requests of that owner with code 'dropped'
       TP.state() -> { state: 'ok' | 'wait' | 'limit' | 'offline', until, fails }      TP.onState(fn) -> stop function
       TP.register(provider)   adds or replaces a provider (later tasks plug in here)      TP.providers() -> ids in order */
  const TP = (() => {
    const CFG = { gap: 450, timeout: 12000, backoffBase: 1500, backoffMax: 60000, limitFirst: 1800000, limitMax: 21600000, maxEntries: 20000, pruneTo: 16000, pruneEvery: 100, memMax: 300 };
    const LIM_KEY = 'wt:trlimit';   // this device only; in no sync category on purpose
    const err = (code, retryAt, wait) => { const e = new Error(code); e.code = code; if (retryAt) e.retryAt = retryAt; if (wait) e.wait = wait; return e; };
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const fnv = s => { let x = 0x811c9dc5; for (let i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 0x01000193); } return (x >>> 0).toString(36) + '.' + s.length.toString(36); };
    const ckey = (lang, text) => lang + '|' + fnv(text);
    const quotaText = t => /MYMEMORY WARNING|USED ALL AVAILABLE FREE/i.test(String(t || ''));
    const quotaWait = t => { const m = /(\d+)\s*HOURS?\s*(\d+)\s*MINUTES?/i.exec(String(t || '')); return m ? (+m[1] * 60 + +m[2]) * 60000 : 0; };

    /* ----- state: ok / wait (network trouble) / limit (daily limit) / offline ----- */
    const st = { state: 'ok', until: 0, fails: 0, hits: 0 };
    const subs = new Set();
    function setState(s, until) {
      const changed = st.state !== s;
      st.state = s; st.until = until || 0;
      if (changed) subs.forEach(f => { try { f({ state: st.state, until: st.until, fails: st.fails }); } catch (e) { /* a listener must not break translation */ } });
    }
    const expire = () => { if (st.state !== 'ok' && Date.now() >= st.until) setState('ok', 0); };
    const state = () => { expire(); return { state: st.state, until: st.until, fails: st.fails }; };
    function blocked() {
      expire();
      return st.state === 'ok' ? null : { code: st.state === 'limit' ? 'limit' : st.state === 'offline' ? 'offline' : 'wait', until: st.until };
    }
    function noteOk() {
      st.fails = 0; st.hits = 0; setState('ok', 0);
      try { localStorage.removeItem(LIM_KEY); } catch (e) { /* storage unavailable */ }
    }
    function noteFail(x) {
      const c = x && x.code, now = Date.now();
      if (c === 'limit') {
        st.hits++;
        const w = x.wait ? Math.min(864e5, Math.max(600000, x.wait)) : Math.min(CFG.limitMax, CFG.limitFirst * Math.pow(2, st.hits - 1));
        setState('limit', now + w);
        try { localStorage.setItem(LIM_KEY, JSON.stringify({ until: st.until, hits: st.hits })); } catch (e) { /* storage unavailable */ }
      } else if (c === 'offline') setState('offline', now + 4000);
      else if (c === 'network') {
        st.fails++;
        const w = Math.min(CFG.backoffMax, CFG.backoffBase * Math.pow(2, st.fails - 1)) * (0.8 + Math.random() * 0.4);
        setState('wait', now + Math.round(w));
      }
      /* 'fail' (this one sentence was refused) does not pause anything */
    }
    try {
      const j = JSON.parse(localStorage.getItem(LIM_KEY) || 'null');
      if (j) { st.hits = +j.hits || 0; if (+j.until > Date.now()) { st.state = 'limit'; st.until = Math.min(+j.until, Date.now() + 864e5); } }
    } catch (e) { /* nothing saved */ }
    try { window.addEventListener('online', () => { if (st.state === 'offline') { st.fails = 0; setState('ok', 0); } }); } catch (e) { /* no window */ }

    /* ----- cache: memory first, then IndexedDB ----- */
    const mem = new Map();
    let dbp = null, putN = 0;
    const memSet = (k, v) => { mem.delete(k); mem.set(k, v); if (mem.size > CFG.memMax) mem.delete(mem.keys().next().value); };
    const db = () => dbp || (dbp = new Promise((res, rej) => {
      try {
        if (typeof indexedDB === 'undefined') throw new Error('no IndexedDB');
        const r = indexedDB.open('wordtrail-tr', 1);
        r.onupgradeneeded = () => { const s = r.result.createObjectStore('tr'); s.createIndex('ts', 'ts'); };
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      } catch (e) { rej(e); }
    }));
    async function cacheGet(lang, text) {
      const k = ckey(lang, text), m = mem.get(k);
      if (m && m.s === text) return m;
      try {
        const d = await db();
        const rec = await new Promise(res => { const q = d.transaction('tr').objectStore('tr').get(k); q.onsuccess = () => res(q.result); q.onerror = () => res(null); });
        if (rec && rec.s === text && typeof rec.t === 'string' && rec.t) { memSet(k, rec); return rec; }   // rec.s must match: a hash clash is a miss
      } catch (e) { /* no saved copy */ }
      return null;
    }
    function prune(d) {
      try {
        const os = d.transaction('tr', 'readwrite').objectStore('tr'), q = os.count();
        q.onsuccess = () => {
          let del = q.result - CFG.pruneTo;
          if (q.result <= CFG.maxEntries || del <= 0) return;
          const c = os.index('ts').openCursor();
          c.onsuccess = () => { const cur = c.result; if (cur && del-- > 0) { cur.delete(); cur.continue(); } };
        };
      } catch (e) { /* cache unavailable */ }
    }
    async function cachePut(lang, text, t, p) {
      const k = ckey(lang, text), rec = { s: text, t, p, ts: Date.now() };
      memSet(k, rec);
      try {
        const d = await db();
        await new Promise(res => { const tx = d.transaction('tr', 'readwrite'); tx.objectStore('tr').put(rec, k); tx.oncomplete = () => res(); tx.onerror = tx.onabort = () => res(); });
        if (putN++ % CFG.pruneEvery === 0) prune(d);   // the first save and then every CFG.pruneEvery-th
      } catch (e) { /* cache unavailable */ }
    }

    /* ----- providers ----- */
    const provs = [
      { id: 'device', order: 10, live: false,
        async translate(text, lang) {
          let r = null;
          try { r = await ltOnDevice(text, lang, false); } catch (e) { r = null; }   // 161: the browser's own translator, only when its language pack is ready
          if (!r) throw err('unavailable');
          return r;
        } },
      { id: 'mymemory', order: 20, live: true,
        async translate(text, lang, signal) {
          const out = [];
          for (const chunk of trChunks(text)) {   // 160: the service takes about 500 characters per request
            let r;
            try { r = await fetch('https://api.mymemory.translated.net/get?q=' + encodeURIComponent(chunk) + '&langpair=en|' + encodeURIComponent(lang), { signal }); }
            catch (e) { throw err(typeof navigator !== 'undefined' && navigator.onLine === false ? 'offline' : 'network'); }
            if (r.status === 429) throw err('limit');
            if (!r.ok) throw err(r.status >= 500 ? 'network' : 'fail');
            let j; try { j = await r.json(); } catch (e) { throw err('network'); }
            const t = j && j.responseData && j.responseData.translatedText, rs = j && +j.responseStatus;
            if (rs === 429 || quotaText(t)) throw err('limit', 0, quotaWait(t));
            if (!t || (rs && rs !== 200)) throw err('fail');
            out.push(trDecode(t));
          }
          return out.join(' ');
        } }
    ];
    function register(p) {
      if (!p || !p.id || typeof p.translate !== 'function') return;
      const i = provs.findIndex(x => x.id === p.id);
      if (i >= 0) provs.splice(i, 1);
      provs.push(p); provs.sort((a, b) => (a.order || 50) - (b.order || 50));
    }

    /* ----- queue: one at a time ----- */
    const q = [], inflight = new Map();
    let running = false, lastLive = 0;
    function finish(e, t) { inflight.delete(e.key); e.res(t); }
    async function callProv(p, e) {
      const ctl = typeof AbortController === 'function' ? new AbortController() : null;
      const tm = setTimeout(() => { if (ctl) ctl.abort(); }, CFG.timeout);
      try { return await p.translate(e.text, e.lang, ctl && ctl.signal); }
      catch (x) { if (x && x.code) throw x; throw err(p.live ? 'network' : 'unavailable'); }
      finally { clearTimeout(tm); }
    }
    async function work(e) {
      e.started = true;
      let last = null;
      for (const p of provs.slice()) {
        if (p.live) {
          const b = blocked();
          if (b) { last = err(b.code, b.until); continue; }   // paused: send nothing
          const w = CFG.gap - (Date.now() - lastLive);
          if (w > 0) await sleep(w);
          lastLive = Date.now();
        }
        try {
          const t = String(await callProv(p, e) || '').trim();
          if (!t) throw err('fail');
          if (p.live) noteOk();
          cachePut(e.lang, e.text, t, p.id);
          return finish(e, t);
        } catch (x) {
          const c = (x && x.code) || 'fail';
          if (c === 'unavailable') continue;
          if (p.live) { noteFail(x); const b2 = blocked(); last = b2 ? err(b2.code, b2.until) : x; } else last = x;
        }
      }
      inflight.delete(e.key); e.rej(last || err('fail'));
    }
    async function pump() {
      if (running) return;
      running = true;
      try {
        while (q.length) {
          let bi = 0;
          for (let i = 1; i < q.length; i++) if (q[i].prio < q[bi].prio) bi = i;   // lowest prio number first, then oldest
          const e = q.splice(bi, 1)[0];
          try { await work(e); } catch (x) { inflight.delete(e.key); e.rej(x && x.code ? x : err('fail')); }
        }
      } finally { running = false; }
    }
    async function load(e) {
      const c = await cacheGet(e.lang, e.text);
      if (c) return finish(e, c.t);
      if (e.drop) { inflight.delete(e.key); return e.rej(err('dropped')); }
      q.push(e); pump();
    }
    function get(text, lang, o) {
      text = String(text == null ? '' : text).trim();
      if (!text) return Promise.resolve('');
      const m = mem.get(ckey(lang, text));
      if (m && m.s === text) return Promise.resolve(m.t);
      const key = lang + '|' + text, old = inflight.get(key);
      if (old) {   // the same sentence is already on its way: share it
        old.drop = false;
        if (o) { if (o.prio < old.prio) old.prio = o.prio; if (o.owner) old.owner = o.owner; }
        return old.p;
      }
      const e = { key, text, lang, prio: (o && o.prio) || 0, owner: o && o.owner, drop: false, started: false };
      e.p = new Promise((res, rej) => { e.res = res; e.rej = rej; });
      e.p.catch(() => { /* callers handle it; this only stops an "unhandled" warning for dropped ones */ });
      inflight.set(key, e);
      load(e);
      return e.p;
    }
    function drop(owner) {
      for (let i = q.length - 1; i >= 0; i--) if (q[i].owner === owner) { const e = q.splice(i, 1)[0]; inflight.delete(e.key); e.rej(err('dropped')); }
      inflight.forEach(e => { if (e.owner === owner && !e.started && !q.includes(e)) e.drop = true; });   // still reading the saved copy: reject if it is not there
    }
    return {
      get, drop, register, state, fnv,
      peek: (text, lang) => { const tx = String(text || '').trim(), m = mem.get(ckey(lang, tx)); return m && m.s === tx ? m.t : ''; },
      onState: f => { subs.add(f); return () => subs.delete(f); },
      providers: () => provs.map(p => p.id),
      _t: { CFG, ckey, st }   // for tools/translate_provider_check.js
    };
  })();
