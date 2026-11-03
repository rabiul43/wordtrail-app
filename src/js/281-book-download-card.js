  /* ---------- Download card on the book page ----------
     "Listen offline" card under the Listen button: Download / Continue, progress + Cancel, Downloaded + Remove. It uses the same
     downloader as the player (dlStart in 280), so both places always agree. The track list is only loaded when the button is tapped
     (a book opened before comes from the device). Off Wi-Fi a big download first asks once, in a small bottom sheet.
     ddPaint is called by paintCards (120) and paintDl (280) whenever a download changes.
     The box "Also save background music" (music-offline.js: musBookPlan / musBookRun) saves the music clips for the moods the book is likely to use, after the audio. */
  const DD = { b: null, node: null, busy: false };   // busy: the track list is being loaded, the download has not started yet
  const DD_IC = { dl: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11M7 11l5 5 5-5M5 20h14"/></svg>', ok: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7"/></svg>' };
  function ddAsk(b) {   // the mobile-data sheet; resolves true for "Download now"
    return new Promise(resolve => {
      const prev = document.activeElement;
      const no = h('button', { type: 'button', class: 'dd-sb' }, 'Wait for Wi-Fi'), yes = h('button', { type: 'button', class: 'dd-sb p' }, 'Download now');
      const sheet = h('div', { class: 'dd-sheet', role: 'alertdialog', 'aria-modal': 'true', 'aria-labelledby': 'dd-st' },
        h('div', { class: 'dd-grab', 'aria-hidden': 'true' }), h('h3', { id: 'dd-st' }, 'Download on mobile data?'),
        h('p', {}, 'This book is about ' + (dlEstSize(b).replace('~', '') || 'large') + ' and you’re not on Wi-Fi. Pause or cancel any time — what’s saved is kept.'),
        h('div', { class: 'dd-sr' }, no, yes));
      const back = h('div', { class: 'dd-back' }, sheet);
      let done = false;
      const end = v => {
        if (done) return; done = true;
        document.removeEventListener('keydown', onKey, true);
        back.classList.remove('on'); setTimeout(() => back.remove(), 200);
        try { if (prev && prev.focus) prev.focus({ preventScroll: true }); } catch (e) { /* element gone */ }
        resolve(v);
      };
      const onKey = e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); end(false); } };
      no.onclick = () => end(false); yes.onclick = () => end(true);
      back.addEventListener('click', e => { if (e.target === back) end(false); });
      document.addEventListener('keydown', onKey, true);
      document.body.append(back);
      requestAnimationFrame(() => { back.classList.add('on'); try { yes.focus({ preventScroll: true }); } catch (e) { /* no focus */ } });
    });
  }
  async function ddLoad(b) {   // the book with its tracks: from the device if it was opened before, else from the network
    let f = null;
    try { f = await idb.get('b:' + b.id); } catch (e) { f = null; }
    if (!f || !f.secs || !f.secs.length) f = await fetchFull(b);
    return f && f.secs && f.secs.length ? f : null;
  }
  async function ddTap(b) {
    const id = String(b.id);
    if (DD.busy) return;
    if (MUS.dl && MUS.dl.book === id) { MUS.dl.ctl.abort(); return; }   // the music save of this book: Cancel
    if (DL.running && DL.id === id) { dlCancel(); return; }
    if (DL.running) { toast('Another download is running. Please wait until it finishes.', 3500); return; }
    if (!dlOk) { toast('This browser cannot save audio on the device.', 4500); return; }
    if (OFF.on || navigator.onLine === false) { toast('You’re offline. Connect to download this book.', 3500); return; }
    const est = b.total > 0 ? b.total * 16000 : 0;
    if (!apNetOk() && (!est || est > 5e7) && !await ddAsk(b)) return;
    DD.busy = true; ddPaint();
    let full = null;
    try { full = await ddLoad(b); } catch (e) { full = null; }
    DD.busy = false;
    if (!full) { ddPaint(); toast('Could not load this book right now. Try again.', 4000); return; }
    await dlStart(full);
    if (P.dlMusic === true && dlState(id).k === 'full') await ddMusic(b);   // only when the whole book was saved: not after Cancel or a full disk
    ddPaint();
  }
  async function ddRemove(b) {
    if (DL.running && DL.id === String(b.id)) return;
    const m = dlMeta.get(String(b.id));
    if (!await askConfirm({ title: 'Remove this download?', item: b.title, meta: m ? dmMB(dmSize(m)) : '', text: 'The audio is removed from this device. You can download it again any time.', ok: 'Remove' })) return;
    if (!await dmDrop(b.id)) toast('Could not remove it right now.', 4000); else toast('Download removed.');
    paintCards();
  }
  async function ddMusic(b) {   // save the background music this book is likely to use
    if (MUS.dl) { toast('Another download is running. Please wait until it finishes.', 3500); ddPaint(); return; }
    if (OFF.on || navigator.onLine === false) { toast('You are offline. Connect to the internet to download music.', 3500); ddPaint(); return; }
    const r = await musBookRun(b, ddPaint);
    ddPaint();
    if (r.busy || r.unsupported || (!r.total && !r.failed && !r.cancelled)) return;
    toast(r.cancelled ? 'Download cancelled. Music already saved stays on this device.'
      : r.full ? 'Not enough space on this device. Remove some files and try again.'
      : r.failed ? 'Some music could not be downloaded. Check your connection and try again.'
      : 'Music saved. It now plays without a connection.', 4000);
  }
  async function ddMusLoad() {   // the music list and the book's mood tags, once per page; the box is repainted when they are in
    DD.mf = 'busy';
    try { await musFetchManifest(); } catch (e) { /* offline: the saved list is used if there is one */ }
    try { await MOODS.load(); } catch (e) { /* the genre is used */ }
    DD.mf = MUS.manifest ? 'ok' : 'fail';
    ddPaint();
  }
  function ddPlan(b) {   // the music plan for this book; worked out again only when something it depends on changes
    if (!MUS.manifest || DD.mf === 'busy' || !DD.mf) return null;
    const sig = [b.id, MUS.mfT, MOODS.ready ? 1 : 0, sndKeepSet().size].join(':');
    if (DD.plan && DD.plan.sig === sig) return DD.plan;
    try { DD.plan = Object.assign({ sig }, musBookPlan(b)); } catch (e) { DD.plan = null; }
    return DD.plan;
  }
  function ddOptPaint(b, full, musRun) {   // the "Also save background music" row
    const q = DD.node._p;
    q.opt.hidden = !dlOk || MUS_LOCAL || !self.caches;
    if (q.opt.hidden) return;
    if (!DD.mf) ddMusLoad();
    const plan = ddPlan(b);
    let title = 'Also save background music', checked = P.dlMusic === true, off = false, note = '', moods = [], size = '', warn = '';
    if (!plan) { checked = false; off = true; note = DD.mf === 'fail' ? 'The music list could not load. Connect to the internet and try again.' : 'Loading the music list…'; }
    else {
      moods = plan.moods;
      if (!plan.todo.length) {
        off = true;
        if (plan.have) { title = 'Background music saved'; checked = true; }
        else { checked = false; moods = []; note = plan.free ? 'No music to save for this book.' : 'Saved music is full (100 MB). Clear it in Sound settings first.'; }
      } else {
        size = '~' + Math.max(1, musMB(plan.need)) + ' MB';
        if (full) checked = false;   // a saved book: ticking saves the music at once
        if (P.musOn !== true) warn = 'Music is off in Sound settings';
      }
      if (musRun) { checked = true; off = true; }
    }
    q.opt.classList.toggle('dis', off);
    q.ck.checked = checked; q.ck.disabled = off;
    if (q.ot.textContent !== title) q.ot.textContent = title;
    const sig = [note, moods.join(','), size, warn].join('|');
    if (q.os.dataset.sig !== sig) {
      q.os.dataset.sig = sig; q.os.textContent = '';
      if (note) q.os.append(h('span', {}, note));
      if (size) q.os.append(h('span', { class: 'dd-sz' }, '+' + size));
      moods.forEach(k => q.os.append(h('span', { class: 'dd-mood' }, MUS_MOOD_NAME[k] || k)));
      if (warn) q.os.append(h('span', { class: 'dd-warn' }, warn));
    }
    DD.mus = size && !full && checked && !off ? size + ' music' : '';   // shown in the card's size line: the music adds to the download
  }
  function ddMake(b) {
    const ic = h('div', { class: 'dd-ic', 'aria-hidden': 'true' }), tt = h('b'), sub = h('span'), btn = h('button', { class: 'dd-btn', type: 'button' }), bar = h('i'), pb = h('div', { class: 'dd-pb', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-label': 'Download progress', hidden: true }, bar);
    const ck = h('input', { type: 'checkbox' }), ot = h('b'), os = h('small');
    const opt = h('label', { class: 'dd-opt', hidden: true }, ck, h('span', { class: 'dd-ot' }, ot, os));
    const node = h('div', { class: 'dd-card' }, ic, h('div', { class: 'dd-t' }, tt, sub), btn, opt, pb);
    node._p = { ic, tt, sub, btn, bar, pb, opt, ck, ot, os };
    btn.addEventListener('click', () => { if (node.dataset.s === 'full') ddRemove(b); else ddTap(b); });
    ck.addEventListener('change', () => {
      if (node.dataset.s === 'full') { if (ck.checked) ddMusic(b); else ddPaint(); return; }   // the audio is saved: the music goes now
      P.dlMusic = ck.checked; savePrefs(); ddPaint();   // otherwise it is saved after the audio, and the choice is remembered
    });
    DD.b = b; DD.node = node; DD.busy = false; DD.mf = ''; DD.plan = null; DD.mus = '';
    Promise.resolve(dlReady).then(ddPaint, ddPaint);   // after the page is drawn (the node is not on screen yet), and again once the saved books are known
    return node;
  }
  function ddPaint() {
    const n = DD.node, b = DD.b;
    if (!n || !n.isConnected || !b || DET.book !== b) return;
    const id = String(b.id), s = dlState(id), m = dlMeta.get(id), bytes = m ? dmSize(m) : 0, est = dlEstSize(b), q = n._p;
    const mine = DL.running && DL.id === id, musRun = !!(MUS.dl && MUS.dl.book === id);
    ddOptPaint(b, s.k === 'full', musRun);   // first: it works out DD.mus, the music size added to the line below
    let k = 'idle', title = 'Listen offline', sub = (est ? est + (DD.mus ? ' + ' + DD.mus : '') + ' · ' : DD.mus ? DD.mus + ' · ' : '') + 'plays without internet', label = 'Download', ghost = false, off = false, frac = -1, ic = 'dl';
    if (!dlOk) { sub = 'This browser cannot save audio on the device.'; off = true; }
    else if (DD.busy) { k = 'run'; title = 'Preparing…'; sub = 'Getting the track list'; label = 'Cancel'; ghost = true; off = true; }
    else if (mine) {
      const p = dlProgress();
      k = 'run'; title = DL.cancelling ? 'Cancelling…' : 'Downloading…'; label = 'Cancel'; ghost = true; off = DL.cancelling; frac = s.f;
      sub = s.have + ' of ' + (s.n || p.total) + (p.total === 1 ? ' track' : ' tracks') + ' · ' + fmtMB(p.bytes + bytes - Object.values(DL.st).reduce((a, x) => a + (x.state === 'done' ? x.size : 0), 0));
    } else if (musRun) {
      const mu = MUS.dl;
      k = 'run'; title = 'Saving music…'; label = 'Cancel'; ghost = true;
      sub = mu.total ? mu.n + ' of ' + mu.total + ' clips' : 'Checking the music list…'; frac = mu.total ? mu.n / mu.total : 0;
    } else if (s.k === 'full') { k = 'full'; title = 'Downloaded'; sub = fmtMB(bytes) + ' · saved on this device'; label = 'Remove'; ghost = true; ic = 'ok'; }
    else if (DL.running) { sub = 'Another download is running: "' + (DL.book ? DL.book.title : 'a book') + '".'; off = true; }
    else if (OFF.on) { sub = 'You’re offline. Connect to download this book.'; off = true; }
    else if (s.k === 'part') { title = s.have + ' of ' + s.n + ' tracks saved'; sub = fmtMB(bytes) + (est ? ' of ' + est : ''); label = 'Continue'; }
    n.dataset.s = k; n.classList.toggle('ok', k === 'full'); n.classList.toggle('run', k === 'run');
    if (q.ic.dataset.k !== ic) { q.ic.dataset.k = ic; q.ic.innerHTML = DD_IC[ic]; }
    q.ic.classList.toggle('ok', ic === 'ok');
    if (q.tt.textContent !== title) q.tt.textContent = title;
    if (q.sub.textContent !== sub) q.sub.textContent = sub;
    if (q.btn.textContent !== label) q.btn.textContent = label;
    q.btn.classList.toggle('ghost', ghost); q.btn.disabled = off;
    q.pb.hidden = frac < 0;
    if (frac >= 0) { const w = Math.round(frac * 100); q.bar.style.width = w + '%'; q.pb.setAttribute('aria-valuenow', String(w)); }
  }
