  /* ---------- Offline learning pack (Task 47) ----------
     One button, "Download learning pack", on the "Listen offline" card (281). It saves, for ONE book, what the learning tools need:
       old    old words and idioms: they are inside the app page (#ow-words, #ow-idioms), so this step only checks that the page itself is
              saved by the service worker (cache 'wt-shell-v1'), which is what makes them open offline
       words  the book's word list, vocab/<id>.json (read by vocBook, 160): put in the same IndexedDB key vocBook reads ('vocab:<id>')
       mean   the meaning of each word in that list (DICT.get, 149, saved on the device by DICT itself): the question maker (167c) uses
              them for its vocabulary questions, so questions work offline
       tr     the translation pack of the book in the app's translation language, if the host has one (160c: 'trpack:<id>|<lang>')
       text   the Project Gutenberg text of the book ('g:<id>', as prefetchText in 140 does): questions are made from it on the device
     The raw word list and translation pack are also put in the cache 'wt-learn-v1' under their web address; the service worker (sw.js)
     serves them from there when the network fails. Nothing here uses the audio downloader (280), the audio, or any key. Nothing runs at
     start-up, only on the tap; the work is small (a few requests, 3 at a time, with short pauses; slower while audio is playing).
     Resume: after each step (and every 20 words of "mean") the state is saved, so Continue goes on where it stopped.
     Storage key `wt:lpk` (this device only, not synced): { v:1, b: { <book id>: { t, lang, it: { old|words|mean|tr|text:
       { ok:1, sz, na?:1 (the host has none for this book), n, of (mean only), lang (tr only) } } } } }
     Removing the pack never touches the audio, and removing the audio never touches the pack. */
  const LPKC = (() => {   /*LPKC-START*/
    const IDS = ['old', 'words', 'mean', 'tr', 'text'];
    const CAP = 300;   // most words whose meaning is saved
    const rec = r => (r && typeof r === 'object' && r.it && typeof r.it === 'object' ? r : { t: 0, lang: '', it: {} });
    function itemDone(r, id, lang) {
      const x = rec(r).it[id];
      if (!x || !x.ok) return false;
      return id === 'tr' ? x.lang === lang : true;
    }
    /* { k: 'none' | 'part' | 'full', done, total, size, frac, list: [ { id, st: 'done' | 'na' | 'part' | 'todo', sz, n, of } ] } */
    function state(r, lang) {
      r = rec(r);
      const list = IDS.map(id => {
        const x = r.it[id] || {}, d = itemDone(r, id, lang);
        const st = d ? (x.na ? 'na' : 'done') : (id === 'mean' && x.n > 0 ? 'part' : 'todo');
        return { id, st, sz: d && x.sz > 0 ? x.sz : 0, n: x.n | 0, of: x.of | 0 };
      });
      const done = list.filter(i => i.st === 'done' || i.st === 'na').length;
      const m = list.find(i => i.id === 'mean'), partial = m.st === 'part' && m.of > 0 ? Math.min(1, m.n / m.of) : 0;
      const any = done > 0 || partial > 0;
      return { k: done === IDS.length ? 'full' : any ? 'part' : 'none', done, total: IDS.length, size: list.reduce((a, i) => a + i.sz, 0), frac: (done + partial) / IDS.length, list };
    }
    /* the words to look up from a vocab file: [word, level, count, example] rows -> unique lower-case words, at most CAP */
    function wordsOf(j) {
      const out = [], seen = new Set();
      for (const row of (j && Array.isArray(j.w) ? j.w : [])) {
        const w = typeof row === 'string' ? row : Array.isArray(row) ? row[0] : '';
        if (typeof w !== 'string') continue;
        const k = w.trim().toLowerCase();
        if (!k || k.length > 40 || seen.has(k)) continue;
        seen.add(k); out.push(k);
        if (out.length >= CAP) break;
      }
      return out;
    }
    /* a saved store from this device, made safe: unknown shape -> empty; each book keeps only known items */
    function clean(s) {
      const out = { v: 1, b: {} };
      if (!s || typeof s !== 'object' || s.v !== 1 || !s.b || typeof s.b !== 'object') return out;
      for (const id of Object.keys(s.b)) {
        const r = s.b[id]; if (!r || typeof r !== 'object' || !r.it || typeof r.it !== 'object') continue;
        const it = {};
        for (const k of IDS) { const x = r.it[k]; if (x && typeof x === 'object') it[k] = x; }
        out.b[id] = { t: +r.t || 0, lang: typeof r.lang === 'string' ? r.lang : '', it };
      }
      return out;
    }
    /* meanings that may go with a pack: its words, minus words another saved pack needs and words kept in My Words (all lower case) */
    function dropWords(mine, others, kept) {
      const keep = new Set(kept || []);
      (others || []).forEach(l => (l || []).forEach(w => keep.add(w)));
      return (mine || []).filter(w => !keep.has(w));
    }
    /* "120 KB", "3.4 MB", '' for nothing */
    function fmtSize(n) { return !(n > 0) ? '' : n < 1048576 ? Math.max(1, Math.round(n / 1e3)) + ' KB' : (n / 1048576).toFixed(1) + ' MB'; }
    return { IDS, CAP, state, wordsOf, clean, itemDone, dropWords, fmtSize };
  })();   /*LPKC-END*/

  const LPK = (() => {
    const LEARN = 'wt-learn-v1', SHELL = 'wt-shell-v1', KEY = 'wt:lpk';
    const L = { ctl: null, id: '', step: '', n: 0, of: 0, err: '', node: null, q: null, b: null };
    const get = () => LPKC.clean(store.get(KEY, null));
    const rec = id => get().b[String(id)] || null;
    function put(id, fn) { const s = get(), r = s.b[String(id)] || { t: 0, lang: '', it: {} }; fn(r); r.t = Date.now(); s.b[String(id)] = r; store.set(KEY, s); }
    const lang = () => { try { return trLang(); } catch (e) { return 'bn'; } };
    const stateOf = id => LPKC.state(rec(id), lang());
    const running = id => !!L.ctl && (id == null || L.id === String(id));
    const mb = n => (n < 1048576 ? Math.max(1, Math.round(n / 1e3)) + ' KB' : (n / 1048576).toFixed(1) + ' MB');
    const NAME = { old: 'Old words and idioms', words: 'Word list', mean: 'Word meanings', tr: 'Translation', text: 'Book text' };

    /* like fetchText (070) but says why it failed: st 'ok' | 'none' (the host has no such file) | 'net' */
    async function grab(name, sig) {
      let none = false;
      for (const u of textUrls(name)) {
        try {
          const r = await fetch(u, { signal: sig });
          if (r.ok) return { st: 'ok', u, buf: await r.arrayBuffer(), type: r.headers.get('content-type') || '' };
          if (r.status === 404) none = true;
        } catch (e) { if (sig && sig.aborted) throw e; }
      }
      return { st: none ? 'none' : 'net' };
    }
    async function keep(url, g) {   // the raw file, for the service worker to serve offline; failing here is fine (the IndexedDB copy still works)
      try { if (self.caches) await (await caches.open(LEARN)).put(url, new Response(g.buf, { status: 200, headers: { 'content-type': g.type || 'application/octet-stream' } })); } catch (e) { /* storage full or no Cache API */ }
    }
    const fail = (st) => Object.assign(new Error(st), { lpk: st });

    const STEP = {
      async old(b, sig) {
        const have = ['#ow-words', '#ow-idioms'].every(q => { const n = $(q); return n && n.textContent.length > 20; });
        if (!have) throw fail('old');
        if (!('serviceWorker' in navigator) || !self.caches) return { ok: 1, sz: 0 };   // no service worker: the app does not open offline at all, nothing more to save here
        const saved = async () => { try { return !!(await (await caches.open(SHELL)).match(new URL('./', location.href).href)); } catch (e) { return false; } };
        if (await saved()) return { ok: 1, sz: 0 };
        try { await Promise.race([navigator.serviceWorker.ready, new Promise(r => setTimeout(r, 4000))]); } catch (e) { /* none */ }
        await new Promise(r => setTimeout(r, 800));
        if (await saved()) return { ok: 1, sz: 0 };
        throw fail('page');
      },
      async words(b, sig) {
        const id = String(b.id), g = await grab('vocab/' + encodeURIComponent(id) + '.json', sig);
        if (g.st === 'net') throw fail('net');
        if (g.st === 'none') return { ok: 1, na: 1, sz: 0 };
        let j = null; try { j = JSON.parse(new TextDecoder().decode(g.buf)); } catch (e) { j = null; }
        if (!(j && j.v === 1 && Array.isArray(j.w))) return { ok: 1, na: 1, sz: 0 };
        j.fetched = Date.now();
        if (!(await idb.set('vocab:' + id, j))) throw fail('space');
        try { VOC.books.set(id, j); } catch (e) { /* the screen reads it from IndexedDB */ }
        await keep(g.u, g);
        return { ok: 1, sz: g.buf.byteLength };
      },
      async mean(b, sig) {
        const id = String(b.id), words = LPKC.wordsOf(await vocBook(id));
        if (!words.length) return { ok: 1, na: 1, sz: 0 };
        const r0 = rec(id), x = (r0 && r0.it.mean) || {};
        let i = Math.min(x.n | 0, words.length), sz = x.sz | 0, bad = 0;
        const save = () => put(id, r => { r.it.mean = { n: i, of: words.length, sz }; });
        L.of = words.length;
        while (i < words.length) {
          if (sig.aborted) { save(); throw Object.assign(new Error('cancel'), { name: 'AbortError' }); }
          const chunk = words.slice(i, i + 3);
          const rs = await Promise.all(chunk.map(w => DICT.get(w).catch(() => ({ ok: false, reason: 'net' }))));
          let netFail = 0;
          rs.forEach(r => { if (r && r.ok) sz += JSON.stringify(r.data || '').length; else if (!r || r.reason !== 'none') netFail++; });
          if (netFail === chunk.length) { if (++bad >= 3) { save(); throw fail('net'); } continue; }   // the same words are tried again, up to 3 times
          bad = 0; i += chunk.length; L.n = i;
          if (i % 21 === 0 || i >= words.length) save();
          paint();
          await new Promise(r => setTimeout(r, audio && !audio.paused ? 300 : 60));   // short pause: never hurries the narrator
        }
        return { ok: 1, n: words.length, of: words.length, sz };
      },
      async tr(b, sig) {
        const id = String(b.id), lg = lang(), g = await grab(TPK.name(id, lg), sig);
        if (g.st === 'net') throw fail('net');
        if (g.st === 'none') return { ok: 1, na: 1, sz: 0, lang: lg };
        let d = null; try { d = await TPK.readJson(new Response(g.buf)); } catch (e) { d = null; }
        const pp = d ? TPK.parse(d, id, lg) : null;
        if (!(pp && pp.ok)) return { ok: 1, na: 1, sz: 0, lang: lg };   // damaged or not matching: not saved, live translation stays as it is
        if (!(await idb.set('trpack:' + id + '|' + lg, { v: 1, rows: pp.rows, meta: pp.meta, fetched: Date.now() }))) throw fail('space');
        await keep(g.u, g);
        return { ok: 1, sz: g.buf.byteLength, lang: lg, n: pp.rows.length };
      },
      async text(b, sig) {
        const saved = store.get('wt:book:' + b.id, null) || {};
        if (saved.text && saved.text.kind === 'file') return { ok: 1, sz: 0 };   // the reader's own file is already on the device
        const gid = saved.text && saved.text.kind === 'gutenberg' ? saved.text.id : (await findGutenbergFor(b)).id;
        let had = false; try { had = !!(await idb.get('g:' + gid)); } catch (e) { had = false; }   // 'own': the pack put the text there, so removing the pack takes it away again
        let t = null; try { t = await getGutenberg(gid); } catch (e) { t = null; }
        if (!t) { if (sig.aborted) throw Object.assign(new Error('cancel'), { name: 'AbortError' }); throw fail('text'); }
        return { ok: 1, gid: String(gid), own: had ? 0 : 1, sz: typeof t === 'string' ? t.length : (t.raw && t.raw.length) | 0 };
      }
    };

    async function run(b) {
      const id = String(b.id);
      if (L.ctl) { toast('The learning pack is being saved. Please wait.', 3000); return; }
      if (OFF.on || navigator.onLine === false) { toast('You are offline. Connect to save the learning pack.', 3500); return; }
      const ctl = new AbortController();
      Object.assign(L, { ctl, id, step: '', n: 0, of: 0, err: '', b });
      paint();
      let res = 'full';
      try {
        for (const sid of LPKC.IDS) {
          const cur = rec(id);
          if (LPKC.itemDone(cur, sid, lang())) continue;   // already saved: resume skips it
          L.step = sid; L.n = 0; L.of = 0; paint();
          const out = await STEP[sid](b, ctl.signal);
          put(id, r => { r.lang = lang(); r.it[sid] = out; });
          paint();
        }
      } catch (e) {
        res = ctl.signal.aborted || (e && e.name === 'AbortError') ? 'cancel' : (e && e.lpk) || 'net';
      }
      L.ctl = null; L.step = ''; L.err = res === 'full' || res === 'cancel' ? '' : res;
      paint();
      const MSG = { full: 'Learning pack saved. Words and questions now work offline.', cancel: 'Stopped. What is saved stays on this device.',
        net: 'Could not finish. Check your connection and tap Continue.', space: 'Not enough space on this device. Remove some files and try again.',
        old: 'The old words data is missing from this page. Reload the app and try again.', page: 'The app page is not saved for offline use yet. Reload once, then try again.',
        text: 'The book text could not be saved. Try again later.' };
      toast(MSG[res] || MSG.net, 4500);
      if (res === 'full') try { if (S.book && String(S.book.id) === id) LearnHub.refresh(); } catch (e) { /* hub not ready */ }
    }
    function cancel() { if (L.ctl) L.ctl.abort(); }
    const ids = () => Object.keys(get().b);
    const kill = async k => { try { await idb.del(k); } catch (e) { /* kept: harmless */ } };
    /* Removes everything the pack saved for one book, without asking: the record, the word list, the translation pack, the raw files in
       'wt-learn-v1', the meanings only this pack needs, and the book text if the pack was what saved it. false while it is being saved. */
    async function drop(id) {
      id = String(id);
      if (L.ctl && L.id === id) return false;
      const r = rec(id); if (!r) return true;
      let mine = [];
      try { mine = LPKC.wordsOf(await idb.get('vocab:' + id)); } catch (e) { mine = []; }
      const others = [];
      for (const o of ids()) if (o !== id) { try { others.push(LPKC.wordsOf(await idb.get('vocab:' + o))); } catch (e) { /* none */ } }
      let kept = []; try { kept = WS.all().map(e => String(e.w).trim().toLowerCase()); } catch (e) { kept = []; }
      for (const w of LPKC.dropWords(mine, others, kept)) await kill(DICT.key(w));
      await kill('vocab:' + id); try { VOC.books.delete(id); } catch (e) { /* not loaded */ }
      for (const l of TR_LANGS.map(x => x[0])) await kill('trpack:' + id + '|' + l);
      const tx = r.it.text; if (tx && tx.own && tx.gid) await kill('g:' + tx.gid);
      try {
        if (self.caches) { const c = await caches.open(LEARN); for (const k of await c.keys()) if (new RegExp('/(vocab/' + encodeURIComponent(id) + '\\.json|packs/' + encodeURIComponent(id) + '\\.[A-Za-z-]+\\.json\\.gz)$').test(k.url)) await c.delete(k); }
      } catch (e) { /* the saved copies expire with the browser */ }
      const s = get(); delete s.b[id]; store.set(KEY, s);
      return true;
    }
    async function remove(b) {
      const id = String(b.id);
      if (L.ctl) return;
      const st = stateOf(id);
      if (!await askConfirm({ title: 'Remove the learning pack?', item: b.title, meta: mb(st.size), text: 'The saved word list, meanings and translation of this book are removed. The audio and your saved words are kept.', ok: 'Remove' })) return;
      const ok = await drop(id);
      paint(); toast(ok ? 'Learning pack removed.' : 'Could not remove it right now.', 3500);
    }

    /* the row inside the card (281): chunky button, thick bar, a calm list of what is saved */
    function row(b) {
      const ot = h('b'), os = h('small'), list = h('div', { class: 'lpk-l', role: 'list' });
      const btn = h('button', { type: 'button', class: 'btn small' }), bar = h('i');
      const pb = h('div', { class: 'dd-pb', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-label': 'Learning pack progress', hidden: true }, bar);
      const node = h('div', { class: 'dd-opt lpk', hidden: !self.caches && !('indexedDB' in self) }, h('span', { class: 'dd-ot' }, ot, os, list), btn, pb);
      node.style.flexWrap = 'wrap';
      btn.addEventListener('click', () => { const s = stateOf(b.id); if (running(b.id)) cancel(); else if (s.k === 'full') remove(b); else run(b); });
      L.node = node; L.q = { ot, os, list, btn, bar, pb }; L.b = b;
      return node;
    }
    function paint() {
      const n = L.node, b = L.b, q = L.q;
      if (!n || !n.isConnected || !b) return;
      const id = String(b.id), s = stateOf(id), mine = running(id);
      let title = 'Learning pack', sub = 'Words, meanings, questions and translation · about 3 MB', label = 'Download learning pack', ghost = false, frac = -1;
      if (mine) { title = 'Saving learning pack…'; sub = (NAME[L.step] || 'Starting') + (L.of ? ' · ' + L.n + ' of ' + L.of : '') + ' · step ' + Math.min(s.done + 1, s.total) + ' of ' + s.total; label = 'Cancel'; ghost = true; frac = s.frac; }
      else if (s.k === 'full') { title = 'Learning pack saved'; sub = mb(s.size) + ' · words and questions work offline'; label = 'Remove'; ghost = true; }
      else if (s.k === 'part') { title = 'Learning pack: ' + s.done + ' of ' + s.total + ' saved'; sub = L.err === 'net' ? 'Stopped because the connection dropped.' : 'Continue where it stopped.'; label = 'Continue'; }
      if (q.ot.textContent !== title) q.ot.textContent = title;
      if (q.os.textContent !== sub) q.os.textContent = sub;
      const sig = s.list.map(i => i.id + i.st + i.sz + (i.st === 'part' ? i.n : '')).join(',') + (mine ? L.step : '');
      if (q.list.dataset.sig !== sig) {
        q.list.dataset.sig = sig; q.list.textContent = '';
        s.list.forEach(i => {
          const on = mine && L.step === i.id;
          const stat = i.st === 'done' ? 'Saved' : i.st === 'na' ? 'None for this book' : i.st === 'part' ? (i.of ? Math.round(i.n / i.of * 100) + '%' : 'Saving…') : on ? 'Saving…' : 'Not saved';
          const size = i.st === 'done' ? (LPKC.fmtSize(i.sz) || (i.id === 'old' ? 'In the app' : '')) : '';
          q.list.append(h('div', { class: 'lpk-r ' + (i.st === 'done' ? 'ok' : i.st === 'part' || on ? 'run' : ''), role: 'listitem' },
            h('span', { class: 'lpk-n' }, NAME[i.id]), h('span', { class: 'lpk-z' }, size), h('span', { class: 'lpk-s' }, (i.st === 'done' ? '\u2713 ' : '') + stat)));
        });
      }
      if (q.btn.textContent !== label) q.btn.textContent = label;
      q.btn.classList.toggle('ghost', ghost);
      q.btn.disabled = !mine && !!L.ctl;   // one pack at a time
      q.pb.hidden = frac < 0;
      if (frac >= 0) { const w = Math.round(frac * 100); q.bar.style.width = w + '%'; q.pb.setAttribute('aria-valuenow', String(w)); }
    }
    return { row, paint, run, cancel, remove, drop, ids, state: stateOf, size: id => stateOf(id).size, has: id => stateOf(id).k !== 'none', running, KEY };
  })();
