  /* ---------- position recovery ----------
     A short trail of places worth coming back to, kept per book ('wt:trail:<book>'): where you were before a big jump (seek bar,
     search, bookmark, track pick), where you were when you set the sleep timer, and where you last touched the screen before 10
     minutes or more of listening with no touch (you may have dozed off). */
  const TR = { lt: null, ltSave: 0 };
  const trKey = () => 'wt:trail:' + (S.book ? S.book.id : '');
  const trAll = () => (S.book ? store.get(trKey(), []) : []) || [];
  const trLabel = (sec, t) => (S.secs && S.secs.length > 1 ? 'Track ' + (sec + 1) + ' \u00b7 ' : '') + clShort(t);
  const TR_WHY = { seek: 'Before you jumped', sleep: 'When you set the sleep timer', idle: 'Last time you touched the screen' };
  const trAgo = ms => { const m = Math.round(ms / 60000); return m < 1 ? 'just now' : m < 60 ? m + ' min ago' : m < 1440 ? Math.round(m / 60) + ' h ago' : Math.round(m / 1440) + ' d ago'; };
  function trAdd(e) {
    if (!S.book || !(e.time > 5 || e.sec > 0)) return;
    const t = Math.floor(e.time);
    const list = trAll().filter(x => !(x.sec === e.sec && Math.abs(x.time - t) < 10));
    list.unshift({ sec: e.sec, time: t, why: e.why, ts: e.ts || Date.now() });
    list.sort((a, b) => b.ts - a.ts);
    store.set(trKey(), list.slice(0, 12));
  }
  function trGo(e) { if (e.sec === S.sec) seekAudio(e.time); else goTrack(e.sec, e.time, !audio.paused); }
  /* called just before a jump: remembers where you were and offers a way back */
  function trJump(toSec, toTime) {
    if (!S.book || !S.secs || !S.secs.length) return;
    const from = { sec: S.sec, time: nowT() };
    if (!(from.time > 5 || from.sec > 0)) return;
    if (toSec === S.sec && Math.abs(toTime - from.time) <= 30) return;
    trAdd({ sec: from.sec, time: from.time, why: 'seek' });
    toast('Moved from ' + trLabel(from.sec, from.time), 7000, ['Go back', () => trGo(from)]);
  }
  /* every touch or key press: if the last one was 10+ minutes ago and the audio has played on since, keep that earlier place */
  function trTouch() {
    if (!S.book) return;
    const now = Date.now(), id = String(S.book.id), t = nowT();
    let reopened = false;
    if (!TR.lt) { TR.lt = store.get('wt:lt', null); reopened = true; }
    const lt = TR.lt;
    if (lt && String(lt.id) === id && now - lt.ts >= 600000 && (lt.sec !== S.sec || t - lt.time >= 300)) {
      trAdd({ sec: lt.sec, time: lt.time, why: 'idle', ts: lt.ts });
      if ((audio.paused || reopened) && (lt.time > 5 || lt.sec > 0)) trWelcome(lt);   // it stopped by itself (sleep timer, track end) or the app was reopened
    }
    TR.lt = { id, sec: S.sec, time: t, ts: now };
    if (now - TR.ltSave > 15000) { TR.ltSave = now; store.set('wt:lt', TR.lt); }
  }
  /* one tap back to the last place you touched the screen, offered on the first touch after a long gap */
  function trWelcome(lt) {
    if (Date.now() - RC.backAt < 60000) return;   // the "Previously" sheet just opened
    const at = { sec: lt.sec, time: lt.time };
    toast('Welcome back. You were at ' + trLabel(at.sec, at.time) + ' when you last touched the screen.', 12000, ['Go back', () => trGo(at)]);
  }
  function trSnip(sec, t) {
    try {
      const p = S.plan[sec]; if (!p || !p.ids.length || !S.model) return '';
      const sn = S.model.sents[p.ids[Core.locate(p.starts, t + P.nudge)]];
      return sn && sn.t ? sn.t.replace(/\s+/g, ' ').trim() : '';
    } catch (e) { return ''; }
  }
  function trRender() {
    const box = $('#tr-list'); if (!box) return;
    const list = trAll(); box.textContent = ''; $('#tr-empty').hidden = list.length > 0;
    list.forEach(e => {
      const sn = trSnip(e.sec, e.time);
      box.append(h('div', { class: 'hl-item tr-item' },
        h('div', { class: 'tr-t' }, trLabel(e.sec, e.time)),
        h('div', { class: 'cl-meta' }, (TR_WHY[e.why] || 'Saved place') + ' \u00b7 ' + trAgo(Date.now() - e.ts)),
        sn ? h('q', {}, sn) : null,
        h('div', { class: 'hl-act' }, h('button', { class: 'btn small', type: 'button', onclick: () => { closeSheets(); trGo(e); } }, 'Go there'))));
    });
  }
  function trWire() {
    $('#b-trail').addEventListener('click', () => { closeSheets(); if (!S.book) { toast('Open a book first.'); return; } trRender(); openSheet('sheet-trail'); });
    ['pointerdown', 'keydown'].forEach(ev => document.addEventListener(ev, trTouch, { capture: true, passive: true }));
  }

  /* ---- bookmark at a chosen position: pick a track and type a time (long-press the bookmark button, or "Change" in its toast) ---- */
  const BMLP = { t: 0, done: false };
  const bmParse = str => {
    const m = String(str).trim().match(/^(\d+)(?::(\d{1,2}))?(?::(\d{1,2}))?$/); if (!m) return NaN;
    const a = m[1] | 0, b = m[2] == null ? null : m[2] | 0, c = m[3] == null ? null : m[3] | 0;
    if (b == null) return a;                       // "90" = 90 seconds
    if ((b > 59) || (c != null && c > 59)) return NaN;
    return c == null ? a * 60 + b : a * 3600 + b * 60 + c;
  };
  const bmLen = i => { const d = (i === S.sec && isFinite(audio.duration) && audio.duration > 0) ? audio.duration : S.durs[i]; return d > 0 ? d : 0; };
  const bmShort = t => hms(t).replace(/^00:/, '');
  function bmErr(msg) { const e = $('#bm-err'); e.textContent = msg || ''; e.hidden = !msg; }
  function bmHelp() {
    const i = +$('#bm-track').value, d = bmLen(i);
    $('#bm-help').textContent = 'Type minutes and seconds (12:30) or hours too (1:02:30).' + (d ? ' This track is ' + bmShort(d) + ' long.' : '');
  }
  function bmOpen() {
    if (!S.book) return;
    const old = store.get(bmKey(), null), sel = $('#bm-track');
    sel.textContent = '';
    S.secs.forEach((sec, i) => sel.append(h('option', { value: String(i) }, 'Track ' + (i + 1) + (sec.title ? ' · ' + sec.title : ''))));
    const r = old || { sec: S.sec, time: Math.floor(nowT()) };
    sel.value = String(Math.min(r.sec, S.secs.length - 1)); $('#bm-time').value = bmShort(r.time);
    $('#bm-note').value = (old && old.note) || '';
    $('#bm-del').hidden = !old; bmErr(''); bmHelp();
    openSheet('sheet-bm');
    setTimeout(() => { try { $('#bm-time').focus(); $('#bm-time').select(); } catch (e) { /* ignore */ } }, 250);
  }
  function bmSave() {
    const i = +$('#bm-track').value, t = bmParse($('#bm-time').value), d = bmLen(i);
    if (!isFinite(t)) { bmErr('Please type a time like 12:30.'); return; }
    if (d && t > d) { bmErr('That is past the end of this track (' + bmShort(d) + ').'); return; }
    const r = { sec: i, time: Math.floor(t) }, note = $('#bm-note').value.trim().slice(0, 500);
    if (note) r.note = note;
    store.set(bmKey(), r); nrBmUI(); closeSheets();
    toast('Bookmark saved · Track ' + (r.sec + 1) + ' · ' + bmShort(r.time) + (r.note ? ' · with note' : ''), 3200, ['Go there', () => { if (r.sec === S.sec) seekAudio(r.time); else goTrack(r.sec, r.time, !audio.paused); }]);
  }
  function nrBookmark() {
    if (!S.book) return;
    if (BMLP.done) { BMLP.done = false; return; }   // the press already opened the position panel
    const old = store.get(bmKey(), null);
    const at = r => 'Track ' + (r.sec + 1) + ' · ' + hms(r.time).replace(/^00:/, '');
    if (!old) {
      const r = { sec: S.sec, time: Math.floor(nowT()) };
      store.set(bmKey(), r); nrBmUI(); toast('Bookmark saved · ' + at(r), 5000, ['Add note', bmOpen]);
      return;
    }
    toast('Bookmark: ' + at(old) + (old.note ? ' — “' + (old.note.length > 80 ? old.note.slice(0, 80).trim() + '…' : old.note) + '”' : ''), 6000, ['Go there', () => { if (old.sec === S.sec) seekAudio(old.time); else goTrack(old.sec, old.time, !audio.paused); }]);
    el.toast.append(h('button', { type: 'button', onclick: () => { el.toast.hidden = true; bmOpen(); } }, old.note ? 'Edit note' : 'Add note'), h('button', { type: 'button', onclick: () => { el.toast.hidden = true; if (S.book) bmRemoveAny(S.book, old, null); } }, 'Remove'));
  }
  /* ---- My books > Saved: a bookmark chip under each book that has one. Tap the time to go there, tap x to remove (with Undo). ---- */
  const BMG = { id: '', sec: 0, time: 0 };
  const bmAt = r => 'Track ' + (r.sec + 1) + ' \u00b7 ' + hms(r.time).replace(/^00:/, '');
  function bmRemoveAny(b, r, after) {
    store.set('wt:bm:' + b.id, null);
    if (S.book && String(S.book.id) === String(b.id)) nrBmUI();
    if (after) after();
    toast('Bookmark removed', 6000, ['Undo', () => { store.set('wt:bm:' + b.id, r); if (S.book && String(S.book.id) === String(b.id)) nrBmUI(); if (after) after(); }]);
  }
  function bmGoSaved(b, r) {
    pendingBack = { tab: 'shelf', see: false }; showTab('library');
    if (S.book && String(S.book.id) === String(b.id)) { trGo(r); return; }
    BMG.id = String(b.id); BMG.sec = r.sec; BMG.time = r.time;
    resumeRecent(b);
  }
  /* called from applyText once the book is open: jumps to the bookmark chosen on the Saved list (the old place stays in the trail) */
  function bmGoPending() {
    if (!BMG.id || !S.book || String(S.book.id) !== BMG.id) return false;
    const e = { sec: Math.min(BMG.sec, S.secs.length - 1), time: BMG.time }; BMG.id = '';
    trGo(e); return true;
  }
  function bmChipRow(b) {
    const row = h('div', { class: 'bm-row' });
    const paint = () => {
      const r = store.get('wt:bm:' + b.id, null); row.textContent = ''; row.hidden = !r;
      if (!r) return;
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true');
      const p = document.createElementNS('http://www.w3.org/2000/svg', 'path'); p.setAttribute('d', 'M6 3h12v18l-6-4.5L6 21z'); svg.append(p);
      row.append(h('span', { class: 'bm-chip' },
        h('button', { type: 'button', class: 'bm-go', title: r.note || '', 'aria-label': 'Go to bookmark, ' + bmAt(r), onclick: () => bmGoSaved(b, r) }, svg, bmAt(r)),
        h('button', { type: 'button', class: 'bm-x', 'aria-label': 'Remove bookmark, ' + bmAt(r), onclick: () => bmRemoveAny(b, r, paint) }, '\u2715')));
    };
    paint(); return row;
  }
  function nrOpen() {
    if (!S.book || NR.on) return;
    NR.on = true;
    nrEl.slot.append(el.reader); nrEl.card.append(el.follow);
    nrEl.root.hidden = false; el.player.inert = true;
    nrHead(); nrPlay(!audio.paused); nrSleep(S.sleep); nrSpeedUI();
    nrSeekUI(nowT(), nrDur());
    document.documentElement.style.setProperty('--dock-h', nrEl.dock.offsetHeight + 'px');
    S.follow = true; el.follow.hidden = true;
    requestAnimationFrame(() => { const sp = S.spans.get(S.curId); if (sp) ensureVisible(sp, true); });
    histSoon();
  }
  function nrClose() {
    if (!NR.on) return;
    NR.on = false;
    el.player.insertBefore(el.reader, el.dock); el.player.insertBefore(el.follow, el.dock);
    nrEl.root.hidden = true; el.player.inert = false;
    document.documentElement.style.setProperty('--dock-h', el.dock.offsetHeight + 'px');
    requestAnimationFrame(() => { const sp = S.spans.get(S.curId); if (sp) ensureVisible(sp, true); });
    histSoon();
  }
  function nrInit() {
    $('#btn-nr').addEventListener('click', nrOpen);
    $('#nr-back').addEventListener('click', nrClose);
    nrEl.bm.addEventListener('click', nrBookmark);
    clWire(); trWire();
    nrEl.bm.addEventListener('pointerdown', () => { BMLP.done = false; clearTimeout(BMLP.t); BMLP.t = setTimeout(() => { BMLP.done = true; buzz('medium'); bmOpen(); }, 550); });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => nrEl.bm.addEventListener(ev, () => clearTimeout(BMLP.t)));
    nrEl.bm.addEventListener('contextmenu', e => e.preventDefault());
    $('#b-bm').addEventListener('click', () => { closeSheets(); if (!S.book) { toast('Open a book first.'); return; } bmOpen(); });
    $('#bm-save').addEventListener('click', bmSave);
    $('#bm-time').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); bmSave(); } });
    $('#bm-time').addEventListener('input', () => bmErr(''));
    $('#bm-track').addEventListener('change', () => { bmErr(''); bmHelp(); });
    $('#bm-now').addEventListener('click', () => { $('#bm-track').value = String(S.sec); $('#bm-time').value = bmShort(nowT()); bmErr(''); bmHelp(); });
    $('#bm-del').addEventListener('click', () => { store.set(bmKey(), null); nrBmUI(); closeSheets(); toast('Bookmark removed', 1800); });
    nrEl.play.addEventListener('click', togglePlay);
    $('#nr-rew').addEventListener('click', () => seekAudio(nowT() - 15));
    $('#nr-ff').addEventListener('click', () => seekAudio(nowT() + 15));
    $('#nr-queue').addEventListener('click', () => openSheet('sheet-tracks'));
    nrEl.sleep.addEventListener('click', () => { buzz('medium'); setSleep(SLEEPS[(SLEEPS.indexOf(S.sleep) + 1) % SLEEPS.length]); toast(sleepLabel(S.sleep), 1800); });
    nrEl.spd.addEventListener('click', () => { buzz('tick'); spdPaint(); openSheet('sheet-speed'); });
    nrEl.next.addEventListener('click', () => { buzz('tick'); stepTrack(1); });
    nrEl.seek.addEventListener('input', () => {
      NR.seeking = true; nrEl.wave.classList.add('drag');
      const p = nrPosOf(+nrEl.seek.value);
      nrPaint(p.pos); nrEl.cur.textContent = hms(p.t); nrEl.tot.textContent = hms(p.d);
    });
    const nrSeekEnd = commit => {
      if (!NR.seeking) return;
      NR.seeking = false; nrEl.wave.classList.remove('drag');
      if (commit) { const p = nrPosOf(+nrEl.seek.value); if (p.i === S.sec) seekAudio(p.t); else goTrack(p.i, p.t, !audio.paused); }
      else nrSeekUI(nowT(), nrDur());
    };
    nrEl.seek.addEventListener('change', () => nrSeekEnd(true));
    nrEl.seek.addEventListener('blur', () => nrSeekEnd(false));
    nrEl.seek.addEventListener('keydown', e => {   // arrow keys: 15 seconds, like the buttons (the bar itself is far too fine for a key press)
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); seekAudio(nowT() + (e.key === 'ArrowLeft' ? -15 : 15)); }
    });
    if (window.ResizeObserver) new ResizeObserver(() => {
      nrEl.root.style.setProperty('--nr-dock-h', nrEl.dock.offsetHeight + 'px');
      if (NR.on) document.documentElement.style.setProperty('--dock-h', nrEl.dock.offsetHeight + 'px');
    }).observe(nrEl.dock);
  }

  const S = {
    book: null, secs: [], durs: [], sec: 0,
    model: null, mode: 'chapter', map: [], span: [], autoTried: new Set(), alignFailed: new Set(), autoSrc: {}, bgTrack: null, anchors: {}, ranges: {}, lead: 12, outro: 5,
    plan: [], sentSec: null, sentPos: null, textSrc: null, note: null, textToken: 0,
    seg: {}, ainfo: {}, refining: false, undo: null,
    calibrate: false, follow: true, curId: -1, spans: new Map(), seeking: false,
    pendingSeek: 0, sleep: 0, sleepTimer: 0, tdone: new Map(), tstat: {}, timings: null,
    wordT: {}, wSp: null, wEls: null, wTimes: null, wId: -1, wIdx: -1,
    loadingAudio: false, resnap: false,
    merged: null, mergedBad: false, sharing: false, shareWarned: false
  };
  const TAP_DELAY = 0.6;
  const TM = { fail: '', iv: 0 };   /* timing load: fail = 'net' when the shared timing could not be reached */
  const MAP_VERSION = 2;

