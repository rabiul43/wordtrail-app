  /* ---------- in-player version picker ----------
     versions.json groups duplicate recordings of one book: g.i = ids (best first), g.w = why the first one won,
     g.s = a score per recording. The sheet lists the siblings, explains the ranking, and switches in place:
     the listening position and the text source carry over so the book resumes where it was. */
  const verOf = b => (VER.ready && b ? VER.map.get(String(b.id)) : null);
  /* short narrator label for the chip: "Mark N.", "Group", or '' when unknown */
  function verWho(b) {
    if (!b) return '';
    const rs = Array.from(new Set((b.secs || []).map(t => t.reader).filter(Boolean)));
    if (rs.length > 1) return 'Group';
    const n = String(rs[0] || b.reader || store.get('wt:rdr:' + b.id, '') || '').trim();
    const p = n.split(/\s+/);
    const out = p.length > 1 ? p.slice(0, -1).join(' ') + ' ' + p[p.length - 1][0].toUpperCase() + '.' : n;
    return out.length > 16 ? out.slice(0, 15) + '\u2026' : out;
  }
  VER.dotSeen = new Set();
  function verChip() {
    const c = $('#b-ver'); if (!c) return;
    const more = $('#b-more'), v = verOf(S.book);
    c.hidden = !(v && v.n > 1);
    if (c.hidden) { if (more) { more.classList.remove('has-dot'); more.setAttribute('aria-label', 'More: next up, words'); } return; }
    verWarm();
    const who = verWho(S.book), better = v.k > 0;
    const parts = [who || 'This recording', (v.k + 1) + ' of ' + v.n, v.sc != null ? Math.round(v.sc) + '% match' : ''].filter(Boolean);
    const d = $('#b-ver-d'), bd = $('#b-ver-b');
    if (d) d.textContent = parts.join(' \u00b7 ');
    if (bd) bd.hidden = !better;
    c.setAttribute('aria-label', 'Choose a different reader. Now: ' + (who || 'reader') + ', ' + (v.k + 1) + ' of ' + v.n + (better ? '. A better match is available.' : ''));
    if (more) {
      const dot = better && !VER.dotSeen.has(String(S.book.id));
      more.classList.toggle('has-dot', dot);
      more.setAttribute('aria-label', 'More: reader' + (dot ? ' (a better match is available)' : '') + ', next up, words');
    }
  }
  /* narrator, length and reader count of a recording; fetched once per id, and kept like any opened book */
  VER.pend = new Map(); VER.warm = new Set(); VER.pre = new Map();
  function verInfo(id) {
    id = String(id);
    if (VER.info.has(id)) return Promise.resolve(VER.info.get(id));
    if (VER.pend.has(id)) return VER.pend.get(id);
    const p = verInfoGet(id).finally(() => VER.pend.delete(id));
    VER.pend.set(id, p);
    return p;
  }
  async function verInfoGet(id) {
    const mk = b => {
      const rs = Array.from(new Set((b.secs || []).map(t => t.reader).filter(Boolean)));
      return { id, title: b.title, reader: rs[0] || b.reader || store.get('wt:rdr:' + id, '') || '', readers: rs.length, total: b.total || 0, n: b.n || (b.secs || []).length, secs: (b.secs || []).map(t => t.dur), urls: (b.secs || []).map(t => t.url || '') };
    };
    let info = null;
    if (S.book && S.book.id === id) info = mk(S.book);
    if (!info) { const c = await idb.get('b:' + id); if (c && c.secs && c.secs.length) info = mk(c); }
    if (!info) {
      try {
        const [f] = await lvGet({ id, extended: 1 }, { nonEmpty: true, tries: 1 });
        if (f && f.secs && f.secs.length) { idb.set('b:' + id, f); if (f.secs[0] && f.secs[0].reader) store.set('wt:rdr:' + id, f.secs[0].reader); info = mk(f); }
      } catch (e) { /* shown without narrator details */ }
    }
    if (info) VER.info.set(id, info);
    return info;
  }
  /* Quietly fetch the other recordings' details a few seconds after a book with several readers opens,
     one at a time, so the picker already has names and lengths when it is opened. */
  function verWarm() {
    const v = verOf(S.book); if (!v || v.n < 2 || VER.warm.has(v.g)) return;
    VER.warm.add(v.g);
    const ids = VER.groups[v.g].i.map(String);
    setTimeout(async () => { for (const id of ids) { if (navigator.onLine === false) break; try { await verInfo(id); } catch (e) { /* next */ } } }, 4000);
  }
  const verReasons = w => String(w || '').split(/\s*[;|]\s*|\s+\u00b7\s+/).map(x => x.trim()).filter(Boolean);
  /* ---- 20-second sample: the same place in the book, read by another reader ----
     The other readers' files are prepared as soon as the sheet shows them (headers only, and the seek),
     so tapping play starts quickly instead of connecting, finding the spot and buffering from scratch. */
  function verStop(resume) {
    const p = VER.pv; if (!p) return; VER.pv = null;
    clearTimeout(p.timer);
    try { p.a.pause(); p.a.removeAttribute('src'); p.a.load(); } catch (e) { /* already gone */ }
    if (p.btn) { p.btn.classList.remove('on'); p.btn.textContent = '\u25b6'; p.btn.setAttribute('aria-label', 'Hear a 20-second sample'); }
    if (resume && p.resume && audio.paused) audio.play().catch(() => {});
  }
  function verPrepClear() {
    VER.pre.forEach(x => { try { x.a.pause(); x.a.removeAttribute('src'); x.a.load(); } catch (e) { /* gone */ } });
    VER.pre.clear();
  }
  /* the file and second in a recording that match where you are in the book now */
  function verSpot(info) {
    if (!info || !S.book) return null;
    const durs = S.durs, tot = durs.reduce((a, x) => a + x, 0) || 1, pre = durs.slice(0, S.sec).reduce((a, x) => a + x, 0);
    const within = S.pendingSeek || audio.currentTime || 0;
    let sec, time;
    if (info.n === S.secs.length) { sec = S.sec; time = (info.secs[sec] || 0) * (durs[S.sec] ? within / durs[S.sec] : 0); }
    else { let at = (pre + within) / tot * (info.total || 0); sec = 0; while (sec < info.secs.length - 1 && at >= info.secs[sec]) { at -= info.secs[sec]; sec++; } time = at; }
    time = Math.max(0, Math.min(time, (info.secs[sec] || time + 20) - 20));
    return (info.urls || [])[sec] ? { url: info.urls[sec], time } : null;
  }
  function verPrep(id, info) {
    if (VER.pre.has(id) || !S.book || (navigator.connection && navigator.connection.saveData)) return;
    const sp = verSpot(info); if (!sp) return;
    const a = new Audio(); a.preload = 'metadata'; a.src = sp.url;
    if (sp.time > 0) a.addEventListener('loadedmetadata', () => { try { a.currentTime = sp.time; } catch (e) { /* plays from the start */ } }, { once: true });
    VER.pre.set(id, { a, sp });
  }
  async function verSample(id, btn) {
    if (VER.pv && VER.pv.id === id) { verStop(true); return; }
    verStop(true);
    let a, sp; const ready = VER.pre.get(id);
    if (ready) { a = ready.a; sp = ready.sp; VER.pre.delete(id); }
    else {
      btn.disabled = true;
      const info = await verInfo(id);
      btn.disabled = false;
      sp = verSpot(info);
      if (!sp) { toast('No sample available for this reader', 2500); return; }
      a = new Audio(); a.src = sp.url;
      if (sp.time > 0) a.addEventListener('loadedmetadata', () => { try { a.currentTime = sp.time; } catch (e) { /* plays from the start */ } }, { once: true });
    }
    const resume = !audio.paused;
    if (resume) audio.pause();
    a.preload = 'auto';
    const pv = VER.pv = { a, id, btn, resume, timer: 0 };
    btn.classList.add('on'); btn.textContent = '\u2026'; btn.setAttribute('aria-label', 'Loading sample');
    const live = () => VER.pv === pv;
    a.addEventListener('playing', () => { if (!live()) return; clearTimeout(pv.timer); btn.textContent = '\u25a0'; btn.setAttribute('aria-label', 'Stop sample'); });
    a.addEventListener('timeupdate', () => { if (live() && a.currentTime >= sp.time + 20) verStop(true); });
    a.addEventListener('ended', () => { if (live()) verStop(true); });
    a.addEventListener('error', () => { if (live()) { verStop(true); toast('Could not load the sample', 2500); } });
    pv.timer = setTimeout(() => { if (live()) { verStop(true); toast('The sample is slow to load. Try again in a moment.', 3000); } }, 12000);
    a.play().catch(() => { if (live()) { verStop(true); toast('Could not play the sample', 2500); } });
  }
  (() => { const sh = $('#sheet-versions'); if (sh) new MutationObserver(() => { if (sh.hidden) { verStop(true); verPrepClear(); } }).observe(sh, { attributes: true, attributeFilter: ['hidden'] }); })();

  function renderVersions() {
    verStop(true); verPrepClear();
    const body = $('#ver-body'); body.textContent = '';
    const foot = $('#ver-foot'), go = $('#ver-go'), fp = $('#ver-foot-p'); foot.hidden = true;
    const cur = verOf(S.book);
    if (!cur) { body.append(h('p', { class: 'help' }, 'There is only one recording of this book.')); return; }
    const g = VER.groups[cur.g], ids = g.i.map(String), curId = String(S.book.id);
    const score = k => g.s && typeof g.s[k] === 'number' ? g.s[k] : null;
    // one status per recording: best match, else whether the text can follow the audio
    const status = k => {
      const sc = score(k);
      if (sc == null) return k === 0 ? ['best', '\u2605 Best match'] : null;
      const pc = Math.round(sc) + '%';
      return sc >= 40 ? [k === 0 ? 'best' : 'ok', (k === 0 ? '\u2605 ' : '') + pc + ' match'] : [k === 0 ? 'best' : '', pc + ' \u00b7 audio only'];
    };
    // where you would land: the same share of the book
    const dN = S.durs.reduce((a, x) => a + x, 0) || 1, frac = (S.durs.slice(0, S.sec).reduce((a, x) => a + x, 0) + (S.pendingSeek || audio.currentTime || 0)) / dN;
    const resumeTxt = frac < 0.005 ? 'Starts from the beginning.' : 'Picks up where you are, about ' + Math.round(frac * 100) + '% in.';
    const rows = new Map();
    let pick = null;
    const nm = id => { const r = rows.get(id); return r && !r.nameEl.classList.contains('vp-sk') ? r.nameEl.textContent : 'this reader'; };
    const paintFoot = () => {
      foot.hidden = !pick;
      rows.forEach((r, id) => { r.row.classList.toggle('sel', id === pick); if (r.pickEl.tagName === 'BUTTON') r.pickEl.setAttribute('aria-pressed', id === pick ? 'true' : 'false'); });
      if (pick) { go.textContent = 'Switch to ' + nm(pick); fp.textContent = resumeTxt; }
    };
    go.onclick = () => { if (pick) verSwitch(pick); };
    const mkRow = (id, k) => {
      const isNow = id === curId, st = status(k);
      const nameEl = h('div', { class: 'vp-name vp-sk' }, '\u00a0'), metaEl = h('div', { class: 'vp-meta vp-sk' }, '\u00a0');
      const deltaEl = h('div', { class: 'vp-delta', hidden: true });
      const kids = [h('span', { class: 'vp-main' }, nameEl, metaEl, deltaEl), st ? h('span', { class: 'vp-st ' + st[0] }, st[1]) : h('span')];
      const pickEl = isNow
        ? h('div', { class: 'vp-pick' }, kids)
        : h('button', { class: 'vp-pick', type: 'button', 'aria-pressed': 'false', onclick: () => { pick = pick === id ? null : id; paintFoot(); } }, kids);
      const play = isNow ? null : h('button', { class: 'vp-play', type: 'button', 'aria-label': 'Hear a 20-second sample', onclick: e => { e.stopPropagation(); verSample(id, e.currentTarget); } }, '\u25b6');
      const row = h('div', { class: 'vp-item' + (isNow ? ' now' : '') }, pickEl, play);
      rows.set(id, { nameEl, metaEl, deltaEl, k, row, pickEl, play });
      return row;
    };
    // the one-line recommendation sits right under the best recording; "Why?" opens the details
    const recName = h('strong', {}, '\u2026');
    const reasons = verReasons(g.w);
    const scoreEls = new Map();
    const panel = h('div', { class: 'vp-panel', hidden: true },
      reasons.length > 1 ? h('div', { class: 'vp-reasons' }, reasons.map(r => h('span', {}, r))) : h('p', { class: 'help' }, reasons[0] || 'It ranked highest of the ' + ids.length + ' recordings for audio quality and read-along support.'),
      score(0) != null ? h('div', { class: 'vp-panel' }, ids.map((id, k) => { const lab = h('span', {}, 'Recording ' + (k + 1)); scoreEls.set(id, lab); return h('div', { class: 'vp-sc' }, lab, h('span', {}, score(k) != null ? Math.round(score(k)) + ' / 100' : '')); })) : null,
      score(0) != null ? h('p', { class: 'help' }, 'Match is the library\u2019s ranking score out of 100, which includes how well the text lines up with the audio. From 40 up, the text can follow along.') : null);
    const whyBtn = h('button', { class: 'vp-why-btn', type: 'button', 'aria-expanded': 'false', onclick: () => { const open = panel.hidden; panel.hidden = !open; whyBtn.setAttribute('aria-expanded', open ? 'true' : 'false'); whyBtn.textContent = open ? 'Hide' : 'Why?'; } }, 'Why?');
    const rec = h('div', { class: 'vp-rec' },
      h('div', { class: 'vp-rec-row' }, ids[0] === curId ? h('p', {}, '\u2605 You are listening to the best match.') : h('p', {}, '\u2605 Best match: ', recName, '.'), whyBtn),
      panel);

    const nowSec = h('section', { class: 'vp-sec' }, h('h3', {}, 'Now playing'), mkRow(curId, ids.indexOf(curId)));
    if (ids[0] === curId) nowSec.append(rec);
    body.append(nowSec);
    const others = ids.map((id, k) => [id, k]).filter(x => x[0] !== curId);
    if (others.length) {
      const list = h('div', { class: 'vp-list' });
      others.forEach(([id, k]) => { list.append(mkRow(id, k)); if (k === 0) list.append(rec); });
      body.append(h('section', { class: 'vp-sec' }, h('h3', {}, 'Other readers'), h('p', { class: 'help' }, 'Tap a reader to choose them, or \u25b6 to hear 20 seconds from where you are. Differences are measured against the one playing now.'), list));
    }

    const nameOf = (info, k) => info ? (info.readers > 1 ? 'Group reading' : (info.reader || 'Recording ' + (k + 1))) : 'Recording ' + (k + 1);
    const setName = (id, k, txt) => { const r = rows.get(id); if (r) { r.nameEl.classList.remove('vp-sk'); r.nameEl.textContent = txt; } const e = scoreEls.get(id); if (e) e.textContent = txt; if (k === 0) recName.textContent = txt; };
    const paint = (id, info) => {
      const r = rows.get(id); if (!r) return;
      const k = r.k;
      if (!info) {
        if (r.nameEl.classList.contains('vp-sk')) setName(id, k, 'Recording ' + (k + 1));
        if (r.metaEl.classList.contains('vp-sk')) { r.metaEl.classList.remove('vp-sk'); r.metaEl.textContent = 'Details unavailable'; }
        if (r.play) r.play.hidden = true;
        return;
      }
      setName(id, k, nameOf(info, k));
      r.metaEl.classList.remove('vp-sk');
      r.metaEl.textContent = [info.readers > 1 ? info.readers + ' readers' : (info.reader ? 'Solo reader' : ''), info.total ? fmtLong(info.total) : ''].filter(Boolean).join(' \u00b7 ') || '\u00a0';
      if (r.play) r.play.hidden = !(info.urls || []).some(Boolean);
      if (id !== curId && !$('#sheet-versions').hidden) verPrep(id, info);
      const now = VER.info.get(curId);
      if (id !== curId && now) {
        const d = [], diff = info.total && now.total ? info.total - now.total : 0;
        if (Math.abs(diff) > 300) d.push((diff > 0 ? '+' : '\u2212') + fmtLong(Math.abs(diff)));
        if (now.readers <= 1 && info.readers > 1) d.push('group reading');
        else if (now.readers > 1 && info.readers <= 1) d.push('solo reader');
        if (d.length) { r.deltaEl.textContent = d.join(' \u00b7 '); r.deltaEl.hidden = false; }
      }
      if (pick) paintFoot();
    };
    // 1) show at once whatever is already on this device: saved narrator names and the catalog's length
    ids.forEach((id, k) => {
      const r = rows.get(id), cached = store.get('wt:rdr:' + id, ''), cb = typeof CAT !== 'undefined' && CAT.books && CAT.books.find(x => x.id === id);
      if (cached) setName(id, k, cached);
      if (cb && cb.total) { r.metaEl.classList.remove('vp-sk'); r.metaEl.textContent = fmtLong(cb.total); }
    });
    // 2) then fill each row the moment its own details arrive, not when the slowest one does
    ids.forEach(id => verInfo(id).then(info => {
      if ($('#sheet-versions').hidden) return;
      paint(id, info);
      if (id === curId) ids.forEach(o => { const oi = VER.info.get(o); if (o !== curId && oi) paint(o, oi); });
    }));
    // 3) still waiting after a few seconds: stop the shimmer; the real name replaces this when it arrives
    setTimeout(() => { if ($('#sheet-versions').hidden) return; ids.forEach((id, k) => { const r = rows.get(id); if (r && r.nameEl.classList.contains('vp-sk')) setName(id, k, 'Recording ' + (k + 1)); }); }, 5000);
  }
  async function verSwitch(id) {
    id = String(id);
    if (!S.book || id === String(S.book.id)) { closeSheets(); return; }
    verStop(false);
    const from = S.book, t = S.sec, within = S.pendingSeek || audio.currentTime || 0;
    const pre = S.durs.slice(0, t).reduce((a, b) => a + b, 0), total = S.durs.reduce((a, b) => a + b, 0) || 1;
    persist(); // the recording being left keeps its own place, so switching back resumes it
    VER.carry = { id, sec: t, n: S.secs.length, secFrac: S.durs[t] ? within / S.durs[t] : 0, frac: (pre + within) / total, text: S.textSrc, from: String(from.id) };
    closeSheets();
    const info = await verInfo(id);
    const c = await idb.get('b:' + id);
    let book = c && c.secs && c.secs.length ? c : null;
    if (!book) { try { const [f] = await lvGet({ id }, { light: true }); book = f; } catch (e) { /* openBook reports a failed load */ } }
    if (!book) book = Object.assign({ id, title: from.title, authors: from.authors, cover: from.cover, ia: '', secs: [], total: info ? info.total : 0, n: info ? info.n : 0, lang: from.lang });
    const v = verOf(book);
    toast('Switching to ' + (info && info.reader ? info.reader : 'recording ' + ((v ? v.k : 0) + 1)) + '\u2026', 2500);
    await openBook(book);
  }
  /* Called by openBook once the new recording's tracks are known. Maps the old position onto them:
     the same track when both recordings are split alike, else the same share of the whole book. */
  function verApply(saved, b) {
    const c = VER.carry; VER.carry = null;
    if (!c || c.id !== String(b.id)) return saved;
    const durs = b.secs.map(x => x.dur), tot = durs.reduce((a, x) => a + x, 0);
    let sec, time;
    if (b.secs.length === c.n) { sec = c.sec; time = (durs[sec] || 0) * c.secFrac; }
    else {
      let at = c.frac * tot; sec = 0;
      while (sec < durs.length - 1 && at >= durs[sec]) { at -= durs[sec]; sec++; }
      time = Math.max(0, at);
    }
    const out = Object.assign({}, saved, { sec, time: Math.floor(time) });
    if (!out.text && c.text) out.text = c.text; // the same book text works for every recording
    return out;
  }

