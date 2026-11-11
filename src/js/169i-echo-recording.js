  /* ---------- Echo recording: say the sentence, record it, play it back (ERC, ER) ----------
     Task 43. Adds one thing to Echo mode (169h): a Record button in the "Your turn" step. Nothing here runs unless Echo is open.
     The microphone is asked for ONLY when the learner taps Record (never when Echo opens). While recording, the Echo countdown is held
     (EM.hold) so the next sentence does not start by itself; the ring then shows the seconds left before recording stops by itself
     (ERC.limit: 10 to 30 s). Stop, or leaving the step (Next, Hear again), keeps the take; closing Echo while recording throws it away.
     Nothing is uploaded: this file has no network code and no account code. Recordings stay in this browser's IndexedDB.
     Storage: IndexedDB "wordtrail-rec" v1, store "rec", keyPath "id". One record per take:
       { id, t (ms), dur (s you spoke), nd (s the narrator clip lasts), type (mime), blob, book (book id), title, sec (track), sid (sentence id), text }
     At most 20 (ERC.MAX): when a 21st is saved the oldest is removed and the learner is told. Delete: on the take card and in the list.
     No wt:* key, so nothing is synced or backed up. Denied microphone, no microphone, busy microphone, an old browser and a browser that
     will not keep data all end in a plain message; Echo itself keeps working in every case.
       ERC (pure, between ERC-START/END): pickType, limit, over, supported, errKind, fmtS, newId, ok       tested by tools/echo_check.js
       ER.list() -> Promise of records, newest first    ER.saveBlob(blob, meta) -> Promise of { rec, dropped } or null
       ER.remove(id) -> Promise of true/false           ER.MAX    ER.recording
       ER.use(h) (Task 44, 169j): h = { begin(ctx), end(drop), take(take), clear() }    ER.stopMine()
     Remove this file, 94q-echo-recording.css, the "ec-rec" markup in 28c-sheet-echo.html and their build.py lines to go back (Echo then has no recording). */
  const ERC = (() => {
    /*ERC-START*/
    const MAX = 20, MAX_S = 30, MIN_S = 0.3;
    const TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'];
    /* first mime type the browser can record; '' lets the browser choose */
    function pickType(can) { for (const t of TYPES) { try { if (can(t)) return t; } catch (e) { /* try the next one */ } } return ''; }
    /* seconds before recording stops by itself, from the narrator clip: twice the clip plus 4, between 10 and 30 */
    function limit(nd) { const d = nd > 0 ? nd : 3; return Math.round(Math.max(10, Math.min(MAX_S, d * 2 + 4))); }
    /* ids to delete so that only the newest `max` records stay (list items: { id, t }) */
    function over(list, max) {
      return list.slice().sort((a, b) => (b.t - a.t) || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0)).slice(Math.max(0, max)).map(r => r.id);
    }
    function supported(nav, win) {
      return !!(nav && nav.mediaDevices && typeof nav.mediaDevices.getUserMedia === 'function' && win && typeof win.MediaRecorder === 'function');
    }
    /* getUserMedia error name -> denied / none / busy / other */
    function errKind(name) {
      if (name === 'NotAllowedError' || name === 'SecurityError' || name === 'PermissionDeniedError') return 'denied';
      if (name === 'NotFoundError' || name === 'DevicesNotFoundError' || name === 'OverconstrainedError') return 'none';
      if (name === 'NotReadableError' || name === 'TrackStartError' || name === 'AbortError') return 'busy';
      return 'other';
    }
    function fmtS(s) { return (s > 0 ? Math.round(s * 10) / 10 : 0).toFixed(1) + ' s'; }
    function newId(t, r) { return t.toString(36) + '-' + Math.floor(r * 1e9).toString(36); }
    /* a stored record that can be played */
    function ok(r) { return !!(r && typeof r.id === 'string' && r.t > 0 && r.blob && r.blob.size > 0); }
    /*ERC-END*/
    return { MAX, MAX_S, MIN_S, pickType, limit, over, supported, errKind, fmtS, newId, ok };
  })();

  const ER = (() => {
    const DBN = 'wordtrail-rec', STORE = 'rec';
    const q = id => document.getElementById(id);
    const st = { rec: false, mr: null, stream: null, chunks: [], mime: '', t0: 0, t1: 0, lim: 0, tick: 0, force: 0, drop: false, gen: 0, busy: false, ctx: null, take: null, mine: null, lib: false, db: null };
    const MSG = {
      unsupported: 'Recording is not supported in this browser.',
      denied: 'The microphone is blocked. Allow it in your browser settings, then try again.',
      none: 'No microphone was found on this device.',
      busy: 'The microphone is busy in another app. Close that app and try again.',
      other: 'Could not start recording. Try again.',
      empty: 'Nothing was recorded. Try again.',
      saved: 'Saved on this device only. Nothing is uploaded.',
      savedDrop: 'Saved on this device only. Your oldest recording was removed (up to 20 are kept).',
      nosave: 'Could not save this recording on this device. You can still play it now.',
      play: 'Could not play the recording.',
      nolib: 'Saved recordings cannot be opened in this browser.'
    };
    const TTL = { turn: 'Your turn. Say it out loud', rec: 'Recording', take: 'Your recording' };
    const say = m => { q('ec-status').textContent = m || ''; };
    const hk = [];   // hooks from 169j (compare, what we heard, history); a hook that throws never breaks recording
    function hook(n, a) { hk.forEach(h => { try { if (h[n]) h[n](a); } catch (e) { /* ignore */ } }); }

    /* ----- the store (IndexedDB, opened the first time it is needed) ----- */
    function db() {
      if (st.db) return st.db;
      st.db = new Promise((res, rej) => {
        try {
          if (typeof indexedDB === 'undefined') throw new Error('no IndexedDB');
          const r = indexedDB.open(DBN, 1);
          r.onupgradeneeded = () => { r.result.createObjectStore(STORE, { keyPath: 'id' }); };
          r.onsuccess = () => { const d = r.result; d.onversionchange = () => { try { d.close(); } catch (e) { /* ignore */ } st.db = null; }; res(d); };
          r.onerror = () => rej(r.error || new Error('open failed'));
          r.onblocked = () => rej(new Error('blocked'));
        } catch (e) { rej(e); }
      });
      st.db.catch(() => { st.db = null; });   // a failed open is tried again next time
      return st.db;
    }
    function run(mode, f) {
      return db().then(d => new Promise((res, rej) => {
        let out; const t = d.transaction(STORE, mode);
        try { out = f(t.objectStore(STORE)); } catch (e) { rej(e); return; }
        t.oncomplete = () => res(out && 'result' in out ? out.result : undefined);
        t.onerror = () => rej(t.error || new Error('transaction failed')); t.onabort = () => rej(t.error || new Error('aborted'));
      }));
    }
    function list() { return run('readonly', s => s.getAll()).then(a => (a || []).filter(ERC.ok).sort((x, y) => y.t - x.t)); }
    function remove(id) { return run('readwrite', s => s.delete(id)).then(() => true, () => false); }
    /* save one take; trims to the newest MAX; null when the browser would not keep it */
    function saveBlob(blob, meta) {
      if (!blob || !(blob.size > 0)) return Promise.resolve(null);
      const now = Date.now(), rec = Object.assign({}, meta || {}, { id: ERC.newId(now, Math.random()), t: now, type: blob.type || '', blob });
      return run('readwrite', s => s.put(rec)).then(() => list()).then(all => {
        const drop = ERC.over(all, ERC.MAX);
        return Promise.all(drop.map(remove)).then(() => ({ rec, dropped: drop.length }));
      }).catch(() => null);
    }

    /* ----- playing a take (its own small player; the book audio is never touched) ----- */
    function stopMine() {
      const m = st.mine; if (!m) return; st.mine = null;
      try { m.a.pause(); } catch (e) { /* gone */ }
      try { URL.revokeObjectURL(m.url); } catch (e) { /* ignore */ }
      paintPlay();
    }
    function playMine(blob, key) {
      if (st.mine && st.mine.key === key) { stopMine(); return; }
      stopMine();
      let url = '', a;
      try { url = URL.createObjectURL(blob); a = new Audio(url); } catch (e) { say(MSG.play); return; }
      st.mine = { a, url, key }; paintPlay();
      a.onended = () => { if (st.mine && st.mine.a === a) stopMine(); };
      a.onerror = () => { if (st.mine && st.mine.a === a) { stopMine(); say(MSG.play); } };
      try { const r = a.play(); if (r && r.catch) r.catch(() => { if (st.mine && st.mine.a === a) { stopMine(); say(MSG.play); } }); } catch (e) { stopMine(); say(MSG.play); }
    }
    function paintPlay() {
      const k = st.mine && st.mine.key;
      q('ec-play-l').textContent = k === 'take' ? 'Stop' : 'Play mine';
      document.querySelectorAll('#ec-lib-l [data-play]').forEach(b => { b.lastElementChild.textContent = k === b.getAttribute('data-play') ? 'Stop' : 'Play mine'; });
    }

    /* ----- the screen ----- */
    function ring(left) { const s = Math.max(1, Math.ceil(left)); EM.ring(100 * left / st.lim, String(s), s === 1 ? 'second' : 'seconds'); }
    function paintRec() {
      const b = q('ec-rec');
      q('ec-rec-l').textContent = st.rec ? 'Stop' : (st.take ? 'Record again' : 'Record');
      b.setAttribute('aria-pressed', String(st.rec));
      q('ec-mine').disabled = st.rec;
    }
    function hideTake() { hook('clear'); st.take = null; q('ec-take').hidden = true; q('ec-take-n').textContent = ''; paintRec(); }
    function showTake(t) {
      st.take = t;
      q('ec-take-d').textContent = ERC.fmtS(t.dur); q('ec-take-nd').textContent = ERC.fmtS(t.nd);
      q('ec-take-n').textContent = '';
      q('ec-take').hidden = false;
      q('ec-title').textContent = TTL.take; q('ec-ring').setAttribute('aria-label', TTL.take);
      EM.ring(100, '\u2713', ''); paintRec();
    }
    function releaseStream() {
      const s = st.stream; st.stream = null;
      if (s) { try { s.getTracks().forEach(t => t.stop()); } catch (e) { /* ignore */ } }
    }

    async function start() {
      if (st.rec || st.busy || !EM.on || EM.step !== 'repeat') return;
      if (!ERC.supported(navigator, window)) { say(MSG.unsupported); return; }
      const c = EM.ctx(); if (!c || !EM.hold()) return;   // the countdown waits while the browser asks and while you speak
      const gen = ++st.gen; st.busy = true; stopMine(); hideTake(); say('');
      let stream;
      try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); }
      catch (e) {
        st.busy = false;
        if (gen === st.gen && EM.on) { EM.resume(); say(MSG[ERC.errKind(e && e.name)]); }
        return;
      }
      st.busy = false;
      if (gen !== st.gen || !EM.on) { try { stream.getTracks().forEach(t => t.stop()); } catch (e) { /* ignore */ } return; }   // moved on while the browser asked
      const mime = ERC.pickType(t => typeof MediaRecorder.isTypeSupported === 'function' && MediaRecorder.isTypeSupported(t));
      let mr;
      try { mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined); }
      catch (e) { try { stream.getTracks().forEach(t => t.stop()); } catch (x) { /* ignore */ } EM.resume(); say(MSG.other); return; }
      st.stream = stream; st.mr = mr; st.mime = mime; st.chunks = []; st.drop = false; st.ctx = c; st.lim = ERC.limit(c.dur);
      mr.ondataavailable = e => { if (e.data && e.data.size) st.chunks.push(e.data); };
      mr.onstop = () => done(mr, gen);
      try { mr.start(); } catch (e) { releaseStream(); st.mr = null; EM.resume(); say(MSG.other); return; }
      st.rec = true; st.t0 = performance.now(); hook('begin', c);
      stream.getTracks().forEach(t => { t.onended = () => { if (st.rec && st.stream === stream) stop(false); }; });   // microphone unplugged
      q('ec-title').textContent = TTL.rec; q('ec-ring').setAttribute('aria-label', TTL.rec);
      paintRec(); ring(st.lim);
      st.tick = setInterval(() => {
        const left = st.lim - (performance.now() - st.t0) / 1000;
        if (left <= 0) stop(false); else ring(left);
      }, 200);
    }
    /* drop = true throws the take away (Echo closed) */
    function stop(drop) {
      if (!st.rec || !st.mr) return;
      st.drop = !!drop; st.t1 = performance.now(); st.rec = false; hook('end', !!drop);
      clearInterval(st.tick); st.tick = 0;
      const mr = st.mr;
      try { if (mr.state !== 'inactive') mr.stop(); else done(mr, st.gen); } catch (e) { done(mr, st.gen); }
      clearTimeout(st.force); st.force = setTimeout(() => { if (st.mr === mr) done(mr, st.gen); }, 1500);   // if the browser never says "stopped"
    }
    function done(mr, gen) {
      if (st.mr !== mr) return;   // once only
      clearTimeout(st.force); clearInterval(st.tick);
      st.mr = null; st.rec = false; releaseStream();
      const chunks = st.chunks, c = st.ctx, drop = st.drop, dur = ((st.t1 || performance.now()) - st.t0) / 1000;
      st.chunks = []; st.t1 = 0; paintRec();
      const live = gen === st.gen && EM.on && !drop;   // still on this sentence, in the "Your turn" step
      if (drop) return;
      if (!chunks.length || dur < ERC.MIN_S) { if (live) { EM.resume(); say(MSG.empty); } return; }
      const blob = new Blob(chunks, { type: mr.mimeType || st.mime || 'audio/webm' });
      const take = { blob, dur, nd: c.dur, id: '', gone: false, c };
      take.p = saveBlob(blob, { dur, nd: c.dur, book: c.book, title: c.title, sec: c.sec, sid: c.id, text: String(c.text || '').slice(0, 240) });
      take.p.then(r => {
        if (r) take.id = r.rec.id;
        if (take.gone) { if (r) remove(r.rec.id); return; }   // deleted while it was saving
        if (st.take === take) q('ec-take-n').textContent = r ? (r.dropped ? MSG.savedDrop : MSG.saved) : MSG.nosave;
        if (st.lib) drawLib();
      });
      if (live) { showTake(take); hook('take', take); }
    }
    function leave() { st.gen++; stopMine(); if (st.rec) stop(false); hideTake(); }

    function delTake() {
      const t = st.take; if (!t) return;
      stopMine(); t.gone = true; hideTake();
      if (t.id) remove(t.id).then(() => { if (st.lib) drawLib(); });
      q('ec-title').textContent = TTL.turn; q('ec-ring').setAttribute('aria-label', TTL.turn);
      say('Deleted.');
    }

    /* ----- My recordings (a panel inside the Echo screen) ----- */
    function row(r) {
      const li = document.createElement('li'); li.className = 'wl-card ec-row';
      const m = document.createElement('div'); m.className = 'ec-row-m';
      const s = document.createElement('p'); s.className = 'ec-row-s'; s.textContent = r.text || '';
      const i = document.createElement('p'); i.className = 'ec-row-i';
      let when = ''; try { when = new Date(r.t).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }); } catch (e) { /* ignore */ }
      [r.title || '', when, ERC.fmtS(r.dur)].filter(Boolean).forEach((x, n) => { const sp = document.createElement('span'); sp.textContent = x; if (n) i.appendChild(document.createTextNode(' \u00B7 ')); i.appendChild(sp); });
      m.appendChild(s); m.appendChild(i);
      const bx = document.createElement('div'); bx.className = 'ec-row-b';
      const p = document.createElement('button'); p.type = 'button'; p.className = 'wl-btn wl-btn--secondary wl-btn--small'; p.setAttribute('data-play', r.id);
      const pi = document.createElement('span'); pi.setAttribute('aria-hidden', 'true'); pi.textContent = '\u25B6 '; const pl = document.createElement('span'); pl.textContent = 'Play mine'; p.appendChild(pi); p.appendChild(pl);
      p.addEventListener('click', () => playMine(r.blob, r.id));
      const d = document.createElement('button'); d.type = 'button'; d.className = 'wl-btn wl-btn--secondary wl-btn--small'; d.textContent = 'Delete';
      d.addEventListener('click', async () => {
        if (st.mine && st.mine.key === r.id) stopMine();
        await remove(r.id);
        if (st.take && st.take.id === r.id) hideTake();
        await drawLib();
        try { q('ec-lib-t').focus({ preventScroll: true }); } catch (e) { /* ignore */ }
      });
      bx.appendChild(p); bx.appendChild(d); li.appendChild(m); li.appendChild(bx);
      return li;
    }
    async function drawLib() {
      let a = [], ok = true;
      try { a = await list(); } catch (e) { ok = false; }
      if (!st.lib) return;
      const ul = q('ec-lib-l'); ul.textContent = '';
      q('ec-lib-n').textContent = ok ? a.length + ' / ' + ERC.MAX : '';
      const e = q('ec-lib-e'); e.hidden = ok && a.length > 0; e.textContent = ok ? 'No recordings yet.' : MSG.nolib;
      a.forEach(r => ul.appendChild(row(r)));
      paintPlay();
    }
    function openLib() {
      if (!EM.on || st.rec || st.busy) return;
      EM.hold(); stopMine(); st.lib = true; q('ec-lib').hidden = false; drawLib();
      try { q('ec-lib-t').focus({ preventScroll: true }); } catch (e) { /* ignore */ }
    }
    function closeLib(again) {
      if (!st.lib) return;
      st.lib = false; stopMine(); q('ec-lib').hidden = true;
      if (again && EM.on) EM.again();   // the sentence is heard once more, then it is your turn again
      try { q('ec-mine').focus({ preventScroll: true }); } catch (e) { /* ignore */ }
    }

    /* ----- called by Echo (EM.use) ----- */
    function paint(step) {
      if (step !== 'repeat') leave();
      q('ec-rec').disabled = step !== 'repeat'; paintRec();
    }
    function close() {   // Echo closed in any way
      st.gen++; stopMine();
      if (st.rec) stop(true);
      hideTake(); closeLib(false); say('');
    }

    /* ----- wiring (taps only) ----- */
    q('ec-rec').addEventListener('click', () => { if (st.rec) stop(false); else start(); });
    q('ec-play').addEventListener('click', () => { if (st.take) playMine(st.take.blob, 'take'); });
    q('ec-del').addEventListener('click', delTake);
    q('ec-mine').addEventListener('click', openLib);
    q('ec-lib-x').addEventListener('click', () => closeLib(true));
    EM.use({ paint, close });
    return { MAX: ERC.MAX, list, saveBlob, remove, use: h => { hk.push(h); }, stopMine, get recording() { return st.rec; } };
  })();
