  /* ---------- download a book for offline listening ----------
     "Download book" fetches every track that is not saved yet (two at a time), keeps each as a Blob (see adb above),
     and shows progress per track. Saved tracks are played from a blob: URL, and are also read from there by the
     sync analysis, so nothing is fetched twice. Cancelling keeps what is already saved; pressing the button again
     fetches only what is missing. */
  const DL = { id: null, book: null, ctl: null, running: false, cancelling: false, quota: false, st: {} }; // st[i] = { state: wait|busy|done|fail, got, total, size }
  const fmtMB = n => n >= 1e9 ? (n / 1e9).toFixed(2) + ' GB' : (n / 1e6).toFixed(n >= 1e8 ? 0 : 1) + ' MB';
  /* Estimate total download size from audio duration at ~128 kbps (LibriVox typical). Returns '' if no duration. */
  const dlEstSize = b => { const secs = b && b.total; return (secs > 0) ? '~' + dmMB(secs * 16000) : ''; };
  const isQuota = e => !!e && (e.name === 'QuotaExceededError' || /quota/i.test(String(e.message || '')));
  const nap = (ms, sig) => new Promise(res => { const t = setTimeout(res, ms); sig.addEventListener('abort', () => { clearTimeout(t); res(); }, { once: true }); });
  function dlProgress() {
    let sum = 0, done = 0, bytes = 0;
    const keys = Object.keys(DL.st);
    for (const k of keys) {
      const t = DL.st[k], sec = DL.book.secs[k];
      if (t.state === 'done') { sum += 1; done++; bytes += t.size || 0; }
      else if (t.state === 'busy') { sum += t.total ? t.got / t.total : Math.min(0.98, t.got / ((sec.dur || 1) * 16000)); bytes += t.got; }
    }
    return { frac: keys.length ? sum / keys.length : 0, done, total: keys.length, bytes };
  }
  function dlNote() {
    const b = S.book;
    if (!b || !S.secs[S.sec]) return '';
    if (DL.running && DL.id === String(b.id)) { const p = dlProgress(); return ' · downloading ' + p.done + '/' + p.total; }
    return isLocal(b.id, S.sec, S.secs[S.sec].url) ? ' · downloaded' : '';
  }
  let dlTimer = 0;
  function dlTick() {
    if (dlTimer) return;
    dlTimer = setTimeout(() => { dlTimer = 0; for (const i in DL.st) if (DL.st[i].state === 'busy') paintTrack(+i); paintDl(); }, 200);
  }
  /* One track file as a Blob, with progress in `t`. */
  /* With `id` and `i` given, the bytes received are checkpointed to the device (every ~5 MB, and when the connection
     drops or the download is cancelled). The next try asks the server for the rest with "Range: bytes=N-" and
     continues from there. A server that ignores Range sends 200 and the file simply starts over. */
  async function dlFetch(sec, t, signal, id, i) {
    const canPart = id != null && i != null;
    let part = null, start = 0;
    if (canPart) {
      try { part = await adb.getPart(id, i); } catch (e) { part = null; }
      if (part && part.url === sec.url && part.blob.size > 0) start = part.blob.size; else part = null;
    }
    const init = { mode: 'cors', signal };
    if (start) init.headers = { Range: 'bytes=' + start + '-' };
    const res = await fetch(sec.url, init);
    if (start && res.status === 416) { try { await adb.dropPart(id, i); } catch (e) { /* ignore */ } throw new Error('Saved part no longer matches; starting again'); }
    if (!res.ok) throw new Error('HTTP ' + res.status);
    let resumed = false, total = 0;
    const len = +res.headers.get('content-length') || 0, ct = res.headers.get('content-type') || '';
    if (start && res.status === 206) {
      const m = /^bytes\s+(\d+)-\d*\/(\d+|\*)/i.exec(res.headers.get('content-range') || '');
      if (m && +m[1] === start) { resumed = true; total = m[2] !== '*' ? +m[2] : (len ? start + len : 0); }
      else { try { await adb.dropPart(id, i); } catch (e) { /* ignore */ } throw new Error('Unexpected range; starting again'); }
    } else total = len;
    if (!resumed) start = 0;
    const type = /^audio\//i.test(ct) ? ct : (part && part.blob.type) || 'audio/mpeg';
    t.total = total; t.got = start;
    if (!res.body || !res.body.getReader) { const buf = await res.arrayBuffer(); t.got = t.total = start + buf.byteLength; return new Blob(resumed ? [part.blob, buf] : [buf], { type }); }
    const rd = res.body.getReader(), chunks = resumed ? [part.blob] : [];
    let got = start, saved = start;
    const keep = async () => {
      if (!canPart || got <= saved || got < 262144) return;
      saved = got;
      try { await adb.putPart(id, i, { blob: new Blob(chunks, { type }), url: sec.url, ts: Date.now() }); } catch (e) { /* best effort */ }
    };
    try {
      for (;;) {
        const { done, value } = await rd.read();
        if (done) break;
        chunks.push(value); got += value.length; t.got = got; dlTick();
        if (got - saved >= 5242880) await keep();
      }
    } catch (e) { await keep(); throw e; }
    if (total && got < total) { await keep(); throw new Error('The connection dropped'); }
    if (!got) throw new Error('Empty file');
    return new Blob(chunks, { type });
  }
  async function dlTrack(b, i, signal) {
    const t = DL.st[i], sec = b.secs[i];
    t.state = 'busy'; t.got = 0; t.total = 0;
    paintTrack(i); dlTick();
    let blob = null;
    for (let attempt = 0; attempt < 3 && !blob && !signal.aborted; attempt++) {
      try { blob = await dlFetch(sec, t, signal, b.id, i); }
      catch (e) { if (signal.aborted) break; if (attempt < 2) await nap(1500 * (attempt + 1), signal); }
    }
    if (!blob) { t.state = signal.aborted ? 'wait' : 'fail'; t.got = 0; paintTrack(i); return; }
    try {
      dlMeta.set(String(b.id), await adb.saveTrack(b, i, blob, sec.url));
      t.state = 'done'; t.size = blob.size; t.got = blob.size;
    } catch (e) {
      t.state = 'fail'; t.got = 0;
      if (isQuota(e)) { DL.quota = true; DL.ctl.abort(); }
    }
    paintTrack(i); paintDl(); paintCards();
    if (S.book && String(S.book.id) === String(b.id)) { updateHeader(); if (t.state === 'done' && i === S.sec + 1) dlWarmAround(S.sec); }
  }
  /* The wish to download a book is remembered ('wt:dlq') until the book is finished, cancelled or removed, so a
     download cut short by closing the page or losing the connection can carry on by itself (dlResumePending). */
  const DQ_KEY = 'wt:dlq';
  const dqSet = b => { try { store.set(DQ_KEY, { id: String(b.id), title: b.title || '', ts: Date.now() }); } catch (e) { /* ignore */ } };
  const dqClear = () => { try { localStorage.removeItem(DQ_KEY); } catch (e) { /* ignore */ } };
  const dqGet = () => { try { const v = store.get(DQ_KEY, null); return v && v.id ? v : null; } catch (e) { return null; } };
  async function dlStart(book, only) {   // only: a list of track numbers to save instead of the whole book
    const b = book || S.book;
    if (!b || DL.running) return;
    if (!dlOk) { toast('This browser cannot save audio on the device.', 4500); return; }
    const todo = (only || b.secs.map((_, i) => i)).filter(i => !isLocal(b.id, i, b.secs[i].url));
    if (!todo.length) { if (!only) dqClear(); return; }
    if (!only) dqSet(b);
    dlPersist();   // after the user's tap: ask the browser to keep the saved audio; the answer is shown in Settings > Storage
    dmUsedPct().then(pct => { if (pct != null && pct > 90 && !DL.warned) { DL.warned = true; toast('Storage is almost full (' + Math.round(pct) + '% used). The download may not fit.', 6000); } });
    const ctl = new AbortController(), q = todo.slice();
    Object.assign(DL, { id: String(b.id), book: b, ctl, running: true, cancelling: false, quota: false, st: {} });
    todo.forEach(i => { DL.st[i] = { state: 'wait', got: 0, total: 0, size: 0 }; });
    renderTracks(); paintCards(); updateHeader();
    const worker = async () => { while (q.length && !ctl.signal.aborted) await dlTrack(b, q.shift(), ctl.signal); };
    await Promise.all([worker(), worker()]);
    const cancelled = DL.cancelling && !DL.quota;
    DL.running = false; DL.ctl = null; DL.cancelling = false;
    let failed = 0;
    for (const i of Object.keys(DL.st)) { if (DL.st[i].state === 'fail') failed++; else delete DL.st[i]; }
    const left = b.secs.filter((s, i) => !isLocal(b.id, i, s.url)).length;
    if (only) toast(only.every(i => isLocal(b.id, i, b.secs[i].url)) ? 'Track saved on this device.' : DL.quota ? 'Not enough free space on this device.' : cancelled ? 'Download cancelled.' : 'This track could not be downloaded. Tap its button to try again.', 4500);
    else if (!left) { dqClear(); toast('Downloaded. This book now plays from your device.', 4500); }
    else if (DL.quota) { dqClear(); toast('Not enough free space on this device. The tracks saved so far are kept.', 6000); }
    else if (cancelled) { dqClear(); toast('Download cancelled. The tracks already saved are kept.', 4000); }
    else toast(failed + (failed === 1 ? ' track' : ' tracks') + ' could not be downloaded. It continues where it stopped when the connection is back, or tap Retry.', 6000);
    paintDl(); paintCards(); if (S.book) updateHeader();
    $$('#track-list .track').forEach((_, i) => paintTrack(i));
  }
  /* Picks up a whole-book download that was interrupted (page closed, connection lost). Runs at start-up and when the
     connection returns. On Wi-Fi it starts by itself; otherwise it asks first, so mobile data is never used unasked. */
  let dqBusy = false;
  async function dlResumePending(force) {
    const q = dqGet();
    if (!q || DL.running || dqBusy || !dlOk || navigator.onLine === false) return;
    dqBusy = true;
    try {
      await dlReady;
      let b = null;
      try { b = await idb.get('b:' + q.id); } catch (e) { b = null; }
      if (!b || !b.secs || !b.secs.length) { try { b = await fetchFull({ id: q.id, title: q.title }); } catch (e) { b = null; } }
      if (!b || !b.secs || !b.secs.length) return;   // keep the wish; try again next time
      if (!b.secs.some((s, i) => !isLocal(b.id, i, s.url))) { dqClear(); return; }
      if (DL.running) return;
      const name = b.title || q.title || 'your book';
      if (force || apNetOk()) { toast('Continuing the download of "' + name + '"…', 4000); await dlStart(b); }
      else toast('The download of "' + name + '" was interrupted.', 12000, ['Resume', () => { dlResumePending(true); }]);
    } finally { dqBusy = false; }
  }
  function dlCancel() { if (!DL.running || !DL.ctl) return; DL.cancelling = true; DL.ctl.abort(); paintDl(); }
  /* ---------- auto-download the next tracks (Settings > Audio > Download ahead) ----------
     While a track plays, the next 2 or 3 tracks are saved to the device in the background, on Wi-Fi only, so a weak
     connection never makes the book stop. It uses the same storage as "Download book", so tracks can be removed in
     Settings > Storage. It never runs on mobile data or with Data Saver on, and pauses its retries after a failure. */
  const AP = { busy: false, key: '', bad: {}, until: 0 };
  function apNetOk() {
    const c = navigator.connection;
    if (c && c.saveData) return false;
    if (c && c.type) return c.type === 'wifi' || c.type === 'ethernet';
    return !/Mobi|Android/i.test(navigator.userAgent || '');   // cannot tell: allow on desktop only
  }
  async function autoPrefetch(force) {
    const n = parseInt(P.autoNext == null ? '2' : P.autoNext, 10) || 0;
    const b = S.book;
    if (!(n > 0) || !b || !dlOk || DL.running || AP.busy || audio.paused || Date.now() < AP.until) return;
    const key = b.id + ':' + S.sec + ':' + n;
    if (!force && AP.key === key) return;
    if (!apNetOk()) return;
    const todo = [];
    for (let j = S.sec + 1; j <= S.sec + n; j++) if (b.secs[j] && !isLocal(b.id, j, b.secs[j].url) && !(AP.bad[b.id + ':' + j] > Date.now())) todo.push(j);
    AP.key = key;
    if (!todo.length) return;
    AP.busy = true;
    try {
      dlPersist();
      for (const j of todo) {
        if (!S.book || String(S.book.id) !== String(b.id) || S.sec + n < j || !apNetOk() || DL.running) break;   // moved on, or left Wi-Fi
        const sec = b.secs[j], t = { got: 0, total: 0 };
        try {
          const blob = await dlFetch(sec, t, new AbortController().signal, b.id, j);
          dlMeta.set(String(b.id), await adb.saveTrack(b, j, blob, sec.url));
          try { paintCards(); paintDl(); } catch (e) { /* screens not open */ }
          if (S.book && String(S.book.id) === String(b.id)) { try { updateHeader(); if (j === S.sec + 1) dlWarmAround(S.sec); } catch (e) { /* ignore */ } }
        } catch (e) {
          AP.bad[b.id + ':' + j] = Date.now() + 10 * 60000;   // try this one again in 10 minutes
          if (isQuota(e)) { AP.until = Date.now() + 3600000; break; }   // device is full: stop for an hour
        }
      }
    } finally { AP.busy = false; }
  }
  /* ---------- offline mode: banner, downloaded books first, the rest dimmed ----------
     Runs while navigator.onLine is false. #offbar says how many books are on this device (OFF/offHave/offBooks, 030). Every tile and
     card is dimmed and blocked when its book is not saved (offDim in 030; the capture-phase click below). In every row and list of
     Library and My books the saved books move first; each keeps its first-seen place (_wtOi) so going online puts the order back. */
  let offMo = null, offTimer = 0;
  function offOrder(force) {
    if (!OFF.on && !force) return;
    const items = $$('#home .tile, #home .card-wrap, #home .card, #shelf .card-wrap, #shelf .card').filter(n => n._wtId && !(n.classList.contains('card') && n.parentElement && n.parentElement.classList.contains('card-wrap')));
    const groups = new Map();
    for (const n of items) { const p = n.parentElement; if (!p) continue; if (!groups.has(p)) groups.set(p, []); groups.get(p).push(n); }
    groups.forEach((list, parent) => {
      if (list.length < 2) return;
      for (const n of list) if (n._wtOi == null) n._wtOi = (parent._wtOiN = (parent._wtOiN || 0) + 1);
      const rank = n => (OFF.on && !offHave(n._wtId) ? 1 : 0);
      const sorted = list.slice().sort((a, b) => rank(a) - rank(b) || a._wtOi - b._wtOi);
      if (sorted.every((n, i) => n === list[i])) return;
      const kids = [...parent.children]; let k = 0;
      parent.append(...kids.map(c => (list.includes(c) ? sorted[k++] : c)));   // books change places, anything else (the Show more tile) stays where it was
    });
  }
  function offRefresh() {
    const bar = $('#offbar'); if (!bar) return;
    bar.hidden = !OFF.on;
    if (OFF.on) { const t = OFF.ready ? "You're offline \u2014 " + plural(offBooks(), 'book') + ' available' : "You're offline"; if (bar.textContent !== t) bar.textContent = t; }
    document.documentElement.style.setProperty('--offbar-h', OFF.on ? bar.offsetHeight + 'px' : '0px');
    offOrder();
  }
  /* navigator.onLine is often wrong (some Android/VPN/Wi-Fi setups report false while the internet works), so "offline" is only
     believed after a real request fails. Any answer at all (even an opaque one) means the internet is there. */
  let offSeq = 0;
  function offProbe() {
    const one = u => { const c = new AbortController(), t = setTimeout(() => c.abort(), 6000); return fetch(u, { mode: 'no-cors', cache: 'no-store', signal: c.signal }).then(() => { clearTimeout(t); return true; }); };
    const ts = Date.now();
    return Promise.any([one(PROXY + '/?probe=' + ts), one('https://www.gstatic.com/generate_204?t=' + ts)]).then(() => true, () => false);
  }
  function offSet() {
    if (navigator.onLine !== false) { offApply(false); return; }
    const my = ++offSeq;
    offProbe().then(alive => { if (my === offSeq) offApply(!alive); });
  }
  function offApply(on) {
    if (on === OFF.on) { offRefresh(); return; }
    OFF.on = on;
    document.documentElement.toggleAttribute('data-off', on);
    paintCards();   // dims or restores every tile and card, then offRefresh (banner, order)
    if (!on) offOrder(true);   // back online: the original order returns
    if (!window.MutationObserver) return;
    if (!offMo) offMo = new MutationObserver(() => { clearTimeout(offTimer); offTimer = setTimeout(offOrder, 150); });   // rows and lists drawn while offline get ordered too
    offMo.disconnect();
    if (on) ['#home', '#shelf'].forEach(s => { const n = $(s); if (n) offMo.observe(n, { childList: true, subtree: true }); });
  }
  function offInit() {
    window.addEventListener('offline', offSet); window.addEventListener('online', offSet);
    document.addEventListener('click', e => {   // capture phase: runs before the tile's own handler
      if (!OFF.on || !e.target.closest) return;
      const n = e.target.closest('.tile.off-dim, .card.off-dim'); if (!n) return;
      e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
      toast("You're offline and this book is not downloaded.", 3500);
    }, true);
    Promise.resolve(dlReady).then(() => { OFF.ready = true; offRefresh(); });
    offSet();   // the page may open while offline
  }
  function initAutoPrefetch() {
    offInit();
    audio.addEventListener('playing', () => autoPrefetch(false));
    window.addEventListener('online', () => { autoPrefetch(true); setTimeout(() => dlResumePending(false), 1500); });
    setTimeout(() => dlResumePending(false), 2500);   // a download cut short last time carries on
    try { if (navigator.connection) navigator.connection.addEventListener('change', () => autoPrefetch(true)); } catch (e) { /* not supported */ }
  }
  async function dlRemove() {
    const b = S.book;
    if (!b || DL.running || !dlSaved(b.id)) return;
    if (!confirm('Remove the downloaded audio of "' + b.title + '" from this device?')) return;
    try { await adb.dropBook(b.id); } catch (e) { toast('Could not remove the download.', 4000); return; }
    dlMeta.delete(String(b.id));
    { const q = dqGet(); if (q && q.id === String(b.id)) dqClear(); }
    if (DL.id === String(b.id)) DL.st = {};
    const fromBlob = /^blob:/.test(audio.currentSrc || audio.src), t = audio.currentTime, was = !audio.paused;
    if (fromBlob) { dlClearUrls(); loadAudio(S.sec, t, was); } else dlClearUrls(); // keep playing from the network at the same spot
    renderTracks(); paintCards(); updateHeader();
    toast('Download removed.');
  }
  /* A saved copy that the audio element cannot play is dropped, and the track carries on from the network. */
  function dlBroken(i) {
    const b = S.book;
    if (!b) return;
    const t = audio.currentTime || S.pendingSeek || 0, was = !audio.paused;
    dlDropTrack(b.id, i);
    toast('The saved copy of this track could not be read. Playing it online instead.', 4500);
    if (S.book === b && S.sec === i) loadAudio(i, t, was);
  }

  let trackRows = [];
  function trackState(i) {
    const b = S.book;
    const t = DL.id === String(b.id) ? DL.st[i] : null;
    if (t && t.state === 'busy') return t;
    if (isLocal(b.id, i, b.secs[i].url)) return { state: 'done' };
    if (t && t.state === 'wait' && DL.running) return t;
    if (t && t.state === 'fail') return t;
    return { state: 'idle' };
  }
  function paintTrack(i) {
    const r = trackRows[i];
    if (!r || !S.book) return;
    const t = trackState(i), sec = S.secs[i];
    let txt = '', cls = 'ds', pct = 0, icon = false, lab = '';
    if (t.state === 'busy') {
      pct = t.total ? t.got / t.total : Math.min(0.98, t.got / ((sec.dur || 1) * 16000));
      txt = t.total ? Math.floor(pct * 100) + '%' : fmtMB(t.got);
    } else if (t.state === 'wait') txt = 'Waiting';
    else if (t.state === 'done') { icon = true; cls += ' btn-ic ok'; lab = 'Saved on this device. Tap to remove the download'; }
    else if (t.state === 'fail') { txt = 'Failed'; cls += ' bad'; lab = 'Download failed. Tap to try again'; }
    else if (dlOk) { icon = true; cls += ' btn-ic off'; lab = 'Not saved. Tap to download this track'; }
    r.tp.hidden = t.state !== 'busy';
    r.bar.style.width = Math.round(pct * 100) + '%';
    r.stat.className = cls;
    if (icon) {
      const kind = t.state === 'done' ? 'ok' : 'dl';
      if (r.stat.dataset.ic !== kind) { r.stat.dataset.ic = kind; r.stat.innerHTML = kind === 'ok' ? '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.7 2.7L16 9.5"/></svg>' : '<svg class="ic" aria-hidden="true"><use href="#i-m-download"/></svg>'; }
    } else { delete r.stat.dataset.ic; r.stat.textContent = txt; }
    if (lab) { r.stat.setAttribute('role', 'button'); r.stat.tabIndex = 0; r.stat.setAttribute('aria-label', lab); r.stat.title = lab; }
    else { r.stat.removeAttribute('role'); r.stat.removeAttribute('tabindex'); r.stat.removeAttribute('aria-label'); r.stat.removeAttribute('title'); }
  }
  function paintDl() {
    const b = S.book, T = $('#dl-t'), Sx = $('#dl-s'), go = $('#dl-go'), rm = $('#dl-rm'), m = $('#dl-m');
    if (!b || !T) return;
    const n = b.secs.length, have = b.secs.filter((s, i) => isLocal(b.id, i, s.url)).length;
    const mine = DL.id === String(b.id), other = DL.running && !mine;
    const bytes = Object.values((dlMeta.get(String(b.id)) || { tracks: {} }).tracks).reduce((a, x) => a + (x.s || 0), 0);
    const failed = mine ? Object.values(DL.st).filter(x => x.state === 'fail').length : 0;
    m.hidden = true; rm.hidden = true; go.hidden = false; go.disabled = false; go.className = 'btn small';
    if (!dlOk) {
      T.textContent = 'Listen offline'; Sx.textContent = 'This browser cannot save audio on the device.'; go.disabled = true; go.textContent = 'Download book';
    } else if (DL.running && mine) {
      const p = dlProgress();
      T.textContent = DL.cancelling ? 'Cancelling…' : 'Downloading…';
      Sx.textContent = p.done + ' of ' + p.total + (p.total === 1 ? ' track' : ' tracks') + ' · ' + fmtMB(p.bytes + bytes - Object.values(DL.st).reduce((a, x) => a + (x.state === 'done' ? x.size : 0), 0));
      m.hidden = false; m.setAttribute('aria-valuenow', String(Math.round(p.frac * 100))); m.firstElementChild.style.width = Math.round(p.frac * 100) + '%';
      go.textContent = 'Cancel'; go.className = 'btn small ghost'; go.disabled = DL.cancelling;
    } else if (have >= n) {
      T.textContent = '✓ Downloaded';
      Sx.textContent = 'All ' + n + (n === 1 ? ' track is' : ' tracks are') + ' saved on this device (' + fmtMB(bytes) + '). They play without a connection.';
      go.hidden = true; rm.hidden = false;
    } else {
      T.textContent = have ? have + ' of ' + n + ' tracks downloaded' : 'Listen offline';
      const est = dlEstSize(b);
      if (other) {
        Sx.textContent = 'Another download is running: "' + DL.book.title + '".';
      } else if (failed) {
        Sx.textContent = failed + (failed === 1 ? ' track' : ' tracks') + ' could not be downloaded. Retry continues where it stopped.';
      } else if (have) {
        Sx.textContent = fmtMB(bytes) + ' saved' + (est ? ' · ' + est + ' total' : '') + '. Plays offline for saved tracks.';
      } else {
        Sx.textContent = 'Save the audio on this device. It then plays without a connection and without using data.' + (est ? ' Download size: ' + est + '.' : '');
      }
      go.textContent = failed ? 'Retry' : have ? 'Download remaining (' + (n - have) + ')' : 'Download book';
      go.disabled = other; rm.hidden = !have;
    }
  }
  /* ---------- chapter progress: ticks for finished chapters, a bar for ones in progress ----------
     S.lp[i] is the furthest point reached in track i (0..1, 1 = finished). It only grows from normal
     playback, so scrubbing to the end of a track does not count as listening to it. */
  guideDoc('player', 'Tracks and progress', "Controls > Tracks lists every track with a tick for finished chapters and a bar for ones in progress. The small text under the controls shows how far you are through the whole book and how long is left.");
  /* ---------- whole-book progress: percent and time left across every track ----------
     Position based: finished tracks before this one plus the point reached in this one. Time left is
     shown at the current playback speed. */
  function bookProg() {
    if (!S.book || !S.secs.length) return null;
    const cd = (isFinite(audio.duration) && audio.duration > 0) ? audio.duration : 0;
    let total = 0, before = 0;
    S.secs.forEach((s, i) => { const d = (i === S.sec && cd) ? cd : (+S.durs[i] || 0); total += d; if (i < S.sec) before += d; });
    if (!(total > 0)) return null;
    const cur = Math.min((i => (i === S.sec && cd) ? cd : (+S.durs[S.sec] || 0))(S.sec), Math.max(0, audio.currentTime || 0));
    const done = Math.min(total, before + cur), left = Math.max(0, total - done) / (P.speed || 1);
    let fin = 0; S.secs.forEach((s, i) => { if (lpFrac(i) >= 1) fin++; });
    return { pct: Math.min(100, Math.floor(done / total * 100)), left, fin, n: S.secs.length };
  }
  const bpLeftText = sec => sec < 60 ? 'under 1 min left' : fmtLong(sec) + ' left';
  function paintBookProg() {
    const b = bookProg(), dock = $('#book-prog'), nr = $('#nr-bp'), sum = $('#trk-sum');
    if (dock) dock.hidden = !b;
    if (nr) nr.hidden = !b;
    if (sum) sum.hidden = !b;
    if (!b) return;
    const txt0 = b.pct + '% \u00b7 ' + bpLeftText(b.left), txt = txt0;
    const dtxt = P.tidyPlayer !== false ? b.pct + '% of book \u00b7 ' + bpLeftText(b.left) : txt;
    [dock, nr].forEach(x => {
      if (!x) return;
      const txt = x === dock ? dtxt : txt0;
      const t = x.querySelector('.bp-t');
      if (t.textContent !== txt) { t.textContent = txt; x.querySelector('.bp-bar > i').style.width = b.pct + '%'; }
    });
    if (dock) dock.setAttribute('aria-valuenow', String(b.pct));
    if (sum && !sum.closest('[hidden]')) {
      sum.querySelector('.ts-pct').textContent = b.pct + '% of the book';
      sum.querySelector('.ts-left').textContent = bpLeftText(b.left);
      sum.querySelector('.ts-bar > i').style.width = b.pct + '%';
      sum.querySelector('.ts-fin').textContent = 'Track ' + (S.sec + 1) + ' of ' + b.n + ' \u00b7 ' + b.fin + ' finished';
    }
  }
  const LP_DONE_SECS = 3;
  function lpFrac(i) { return Math.min(1, Math.max(0, +(S.lp && S.lp[i]) || 0)); }
  /* A title like "Chapter 01" or "Track 3" that already carries the row's own number: the number column would say it twice, so it stays empty (it still shows the playing bars or the finished tick). */
  function trackNumDup(i) {
    const t = S.secs && S.secs[i] && S.secs[i].title, m = /^\s*(?:chapter|track|section|part|book)?\s*0*(\d+)\s*[.:)]?\s*$/i.exec(t || '');
    return !!m && +m[1] === i + 1;
  }
  function lpPaint(i) {
    const r = trackRows[i];
    if (!r || !r.lp) return;
    const f = lpFrac(i), done = f >= 1;
    if (i === S.sec) {   // the loaded track shows the playing bars, not its number or tick
      if (!r.n.classList.contains('eq')) { r.n.textContent = ''; r.n.classList.remove('fin'); r.n.classList.add('eq'); r.n.title = ''; r.n.append(h('i'), h('i'), h('i')); }
    } else {
      r.n.classList.remove('eq');
      r.n.textContent = done ? '\u2713' : trackNumDup(i) ? '' : String(i + 1);
      r.n.classList.toggle('fin', done);
      r.n.title = done ? 'Finished' : '';
    }
    r.lp.hidden = !(f > 0 && !done);
    r.lbar.style.width = Math.round(f * 100) + '%';
    paintBookProg();
  }
  function lpSave() { if (S.book && S.lp) { store.set('wt:lp:' + S.book.id, S.lp); S.lpSaved = Date.now(); } }
  function lpDone(i) { if (!S.lp || lpFrac(i) >= 1) return; S.lp[i] = 1; lpPaint(i); lpSave(); }
  function lpNote() {
    if (!S.book || !S.lp || audio.paused || S.loadingAudio || audio.seeking) return;
    const d = audio.duration, t = audio.currentTime;
    if (!(d > 0)) return;
    const last = S.lpLast, steady = last && last.sec === S.sec && t >= last.t && t - last.t < 8;
    S.lpLast = { sec: S.sec, t };
    if (!steady) return;
    const c = cutFor(S.sec), end = c && c[1] != null ? c[1] : d;
    const f = d - t < LP_DONE_SECS || end - t < LP_DONE_SECS ? 1 : Math.min(0.99, t / d);
    if (f > lpFrac(S.sec)) {
      S.lp[S.sec] = f; lpPaint(S.sec);
      if (f >= 1 || Date.now() - S.lpSaved > 10000) lpSave();
    }
  }
  function renderTracks() {
    const list = $('#track-list');
    list.textContent = '';
    list.classList.toggle('is-playing', !audio.paused);
    trackRows = [];
    const rdName = x => String((x && x.reader) || '').replace(/\s*\([^()]*\d{4}[^()]*\)/g, '').replace(/\s+/g, ' ').trim();   // "Name (1969-2023)" -> "Name"
    const showReader = new Set(S.secs.map(rdName).filter(Boolean)).size > 1;   // one reader for the whole book: no need to repeat the name on every row
    S.secs.forEach((s, i) => {
      const bar = h('i'), tp = h('span', { class: 'tp', hidden: true }, bar), stat = h('span', { class: 'ds' });
      const lbar = h('i'), lp = h('span', { class: 'lp', hidden: true }, lbar), nEl = h('span', { class: 'n' }, String(i + 1));
      list.append(h('button', { class: 'track', type: 'button', 'aria-current': i === S.sec ? 'true' : false, onclick: () => { closeSheets(); goTrack(i, 0, true); } },
        nEl,
        h('span', { class: 'tt' }, s.title, showReader && rdName(s) ? h('small', {}, rdName(s)) : null, lp, tp),
        h('span', { class: 'dcol' }, h('span', { class: 'd' }, fmt(S.durs[i])), stat)));
      const go = e => { e.stopPropagation(); e.preventDefault(); trackDlToggle(i); };
      stat.addEventListener('click', go);
      stat.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') go(e); });
      trackRows[i] = { bar, tp, stat, lbar, lp, n: nEl };
      paintTrack(i); lpPaint(i);
    });
    paintDl();
    trackJumpInit(list);
  }
  function trackJumpInit(list) {   // the floating "Current track" button
    const body = $('#sheet-tracks .body'); if (!body) return;
    const btn = h('button', { class: 'trk-jump', type: 'button', hidden: true }), wrap = h('div', { class: 'trk-jump-wrap' }, btn);
    list.append(wrap);
    const cur = () => list.querySelectorAll('.track')[S.sec];
    const check = () => {
      const row = cur(), bb = body.getBoundingClientRect(); if (!row || !bb.height) { btn.hidden = true; return; }   // (a closed sheet has no size)
      const rb = row.getBoundingClientRect();
      const above = rb.bottom < bb.top + 8, below = rb.top > bb.bottom - 8;
      btn.hidden = !(above || below);
      if (!btn.hidden) btn.textContent = (above ? '\u2191 ' : '\u2193 ') + 'Current track';
    };
    btn.addEventListener('click', () => { const row = cur(); if (row) row.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); });
    if (!body._trkJump) { let q = 0; body.addEventListener('scroll', () => { if (q) return; q = requestAnimationFrame(() => { q = 0; if (body._trkJump) body._trkJump(); }); }, { passive: true }); }
    body._trkJump = check;
    requestAnimationFrame(check);
  }
  async function trackDlToggle(i) {   // the button on a track row: save just this track, retry it, or remove its saved copy
    const b = S.book; if (!b || !b.secs[i]) return;
    const t = trackState(i);
    if (t.state === 'busy' || t.state === 'wait') return;
    if (t.state === 'done') {
      if (!confirm('Remove the downloaded audio of \"' + (b.secs[i].title || 'this track') + '\" from this device?')) return;
      dlDropTrack(b.id, i); paintTrack(i); toast('Download removed.'); return;
    }
    if (DL.running) { toast('Another download is running. Please wait until it finishes.', 3500); return; }
    dlStart(b, [i]);
  }
  function markTracks() { const sheet = $('#sheet-tracks'); if (!sheet.hidden) renderTracks(); }

  guideDoc('settings', 'Backup', "Download a backup of favourites, saved words, bookmarks, history and positions, or restore from one. Downloaded audio is not included.");
