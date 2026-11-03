  /* ---------- Download card on the book page ----------
     "Listen offline" card under the Listen button: Download / Continue, progress + Cancel, Downloaded + Remove. It uses the same
     downloader as the player (dlStart in 280), so both places always agree. The track list is only loaded when the button is tapped
     (a book opened before comes from the device). Off Wi-Fi a big download first asks once, in a small bottom sheet.
     ddPaint is called by paintCards (120) and paintDl (280) whenever a download changes. */
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
    ddPaint();
  }
  async function ddRemove(b) {
    if (DL.running && DL.id === String(b.id)) return;
    const m = dlMeta.get(String(b.id));
    if (!await askConfirm({ title: 'Remove this download?', item: b.title, meta: m ? dmMB(dmSize(m)) : '', text: 'The audio is removed from this device. You can download it again any time.', ok: 'Remove' })) return;
    if (!await dmDrop(b.id)) toast('Could not remove it right now.', 4000); else toast('Download removed.');
    paintCards();
  }
  function ddMake(b) {
    const ic = h('div', { class: 'dd-ic', 'aria-hidden': 'true' }), tt = h('b'), sub = h('span'), btn = h('button', { class: 'dd-btn', type: 'button' }), bar = h('i'), pb = h('div', { class: 'dd-pb', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-label': 'Download progress', hidden: true }, bar);
    const node = h('div', { class: 'dd-card' }, ic, h('div', { class: 'dd-t' }, tt, sub), btn, pb);
    node._p = { ic, tt, sub, btn, bar, pb };
    btn.addEventListener('click', () => { if (node.dataset.s === 'full') ddRemove(b); else ddTap(b); });
    DD.b = b; DD.node = node; DD.busy = false;
    Promise.resolve(dlReady).then(ddPaint, ddPaint);   // after the page is drawn (the node is not on screen yet), and again once the saved books are known
    return node;
  }
  function ddPaint() {
    const n = DD.node, b = DD.b;
    if (!n || !n.isConnected || !b || DET.book !== b) return;
    const id = String(b.id), s = dlState(id), m = dlMeta.get(id), bytes = m ? dmSize(m) : 0, est = dlEstSize(b), q = n._p;
    const mine = DL.running && DL.id === id;
    let k = 'idle', title = 'Listen offline', sub = (est ? est + ' · ' : '') + 'plays without internet', label = 'Download', ghost = false, off = false, frac = -1, ic = 'dl';
    if (!dlOk) { sub = 'This browser cannot save audio on the device.'; off = true; }
    else if (DD.busy) { k = 'run'; title = 'Preparing…'; sub = 'Getting the track list'; label = 'Cancel'; ghost = true; off = true; }
    else if (mine) {
      const p = dlProgress();
      k = 'run'; title = DL.cancelling ? 'Cancelling…' : 'Downloading…'; label = 'Cancel'; ghost = true; off = DL.cancelling; frac = s.f;
      sub = s.have + ' of ' + (s.n || p.total) + (p.total === 1 ? ' track' : ' tracks') + ' · ' + fmtMB(p.bytes + bytes - Object.values(DL.st).reduce((a, x) => a + (x.state === 'done' ? x.size : 0), 0));
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
