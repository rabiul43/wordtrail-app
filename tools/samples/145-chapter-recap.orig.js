  /* ---------- Chapter recaps (no AI, made on the phone by summarize() in 140) ----------
     1. When a chapter ends while you listen with the screen on, a sheet shows the "story so far": 3 sentences from that chapter.
     2. When you open a book after RC_DAYS or more away, a "Previously..." sheet shows the last finished chapter's 3 sentences.
     Both can be switched off in Settings (P.recap). Chapters too short for a summary show nothing. */
  const RC = { prev: 0, bk: null, shown: new Set(), backAt: 0, ci: -1, next: -1, mode: '' };
  const RC_DAYS = 3;
  guideDoc('reading', 'Chapter recaps', "When a chapter ends, a short sheet shows the story so far in 3 sentences, and playback waits for you. After 3 or more days away, \"Previously\u2026\" shows the last chapter before you continue. Both are made on your phone from the chapter's own sentences and can be turned off in Settings.");
  function rcList(ci) {
    const m = S.model, c = m && m.chapters[ci];
    if (!c || c.front) return [];
    const cache = m.sumL || (m.sumL = {});
    if (!(ci in cache)) {
      const list = m.sents.slice(c.start, c.end).filter(s => !s.h).map(s => s.t);
      cache[ci] = list.length >= SUM_N + 3 && list.join(' ').split(/\s+/).length >= 200 ? sumPick(list, SUM_N) : [];
    }
    return cache[ci];
  }
  const rcPlay = () => { try { const r = audio.play(); if (r && r.catch) r.catch(() => {}); } catch (e) { /* the browser may refuse; the play button still works */ } };
  function rcStart(ci) {
    const m = S.model, c = m && m.chapters[ci]; if (!c) return;
    for (let id = c.start; id < c.end; id++) {
      if (m.sents[id].h) continue;
      const sec = S.sentSec ? S.sentSec[id] : -1, p = S.plan[sec];
      if (sec < 0 || !p) return;
      const t = sentTime(p, S.sentPos[id]);
      if (sec === S.sec) seekAudio(t); else goTrack(sec, t, true);
      rcPlay(); return;
    }
  }
  function rcOpen(mode, ci, next) {
    const sents = rcList(ci); if (!sents.length) return false;
    const c = S.model.chapters[ci], body = $('#rc-body'); if (!body) return false;
    RC.mode = mode; RC.ci = ci; RC.next = next;
    $('#h-recap').textContent = mode === 'back' ? 'Previously\u2026' : 'Chapter complete';
    const box = h('div', { class: 'rc' });
    if (mode === 'back') {
      const d = Math.max(1, Math.round((Date.now() - RC.prev) / 864e5));
      box.append(h('div', { class: 'rc-meta' }, h('b', { text: S.book.title }), h('span', { text: 'Last listened ' + d + ' days ago' })));
      box.append(h('div', { class: 'rc-k', text: 'From ' + c.title }));
    } else box.append(h('div', { class: 'rc-title', text: c.title }), h('div', { class: 'rc-k', text: 'The story so far' }));
    box.append(h('ol', { class: 'rc-list' }, ...sents.map(t => h('li', { text: t }))));
    box.append(h('p', { class: 'rc-note', text: 'Made on your phone from the chapter\u2019s own sentences.' }));
    const go = h('button', { type: 'button', class: 'rc-go', onclick: () => { closeSheets(); rcPlay(); } }, mode === 'back' ? 'Continue listening' : next >= 0 ? 'Continue to the next chapter' : 'Continue');
    const row = h('div', { class: 'rc-row' });
    if (mode === 'back') row.append(h('button', { type: 'button', class: 'rc-alt', onclick: closeSheets }, 'Skip recap'));
    else row.append(h('button', { type: 'button', class: 'rc-alt', onclick: () => { closeSheets(); rcStart(ci); } }, 'Replay chapter'), h('button', { type: 'button', class: 'rc-alt', onclick: closeSheets }, 'Close'));
    body.textContent = ''; body.append(box, go, row);
    openSheet('sheet-recap');
    return true;
  }
  /* called by setCurrent with the sentence that was current and the one that is now */
  function rcWatch(prev, id) {
    try {
      if (RC.bk !== S.book) { RC.bk = S.book; RC.shown.clear(); return; }
      if (P.recap === false || !S.model || prev == null || prev < 0 || id <= prev || id - prev > 3) return;
      const a = S.model.sents[prev], b = S.model.sents[id];
      if (!a || !b || a.h || a.ch == null || b.ch <= a.ch || RC.shown.has(a.ch)) return;
      if (audio.paused || audio.seeking || S.loadingAudio || S.sleep || document.visibilityState !== 'visible' || !el.backdrop.hidden) return;
      RC.shown.add(a.ch);
      if (rcOpen('end', a.ch, b.ch)) audio.pause();
    } catch (e) { /* a recap is a nicety; never break playback */ }
  }
  /* called once a book is open and its place is restored */
  function rcReturn() {
    try {
      if (P.recap === false || !S.model || !RC.prev || Date.now() - RC.prev < RC_DAYS * 864e5 || !el.backdrop.hidden) return;
      const p = S.plan[S.sec]; if (!p || !p.ids.length) return;
      const id = p.ids[Core.locate(p.starts, nowT() + P.nudge)], cur = id >= 0 ? S.model.sents[id].ch : -1;
      for (let ci = cur - 1; ci >= 0 && ci >= cur - 3; ci--) {
        if (rcList(ci).length) { RC.backAt = Date.now(); RC.prev = 0; if (rcOpen('back', ci, cur)) audio.pause(); return; }
      }
    } catch (e) { /* skip the recap */ }
  }
