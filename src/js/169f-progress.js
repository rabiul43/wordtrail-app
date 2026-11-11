  /* ---------- Progress: tiles and growth chart in Account > Your activity (PG) ----------
     No second dashboard: one section (#pg, in the Your activity page above "Your listening") that is filled when that page opens.
     No new storage key. It only READS data the app already keeps:
       streak      any activity counts, the same rule as Today (169c): a day in wt:learnlog (minutes, reviews, new words or questions) or 1 minute of
                   listening in wt:stats. Counted back from today, or from yesterday while today is still empty. Longest = the longest run of such days.
       time        per day the larger of listening seconds (wt:stats s) and learning minutes (wt:learnlog m), added up; both come from the same clock
       collected   saved words (wt:words), dated by their ts
       mastered    words that show "Mastered" on the word cards (e.st, else WM.stage). Dated by mt (the time it became mastered; written by
                   SRS.review in 148 from now on), else the last review, else ts. Never earlier than ts. Old words have no mt, so their date is the
                   last review: a rough guide, and the last point of the chart is always the real count
       accuracy    correct reviews / all reviews in wt:learnlog (all days kept, 400 at most); empty until the first review
       chart       8 points: totals at the end of each of the last 8 weeks (rolling 7-day steps, the last point is today), so the last point equals the tiles
     Books (Task 25): one row per book that has time, found words or finished chapters:
       time        seconds listened to that book, wt:booktime (148c, same clock as the other time numbers)
       found       saved words whose first book (bid) or any remembered place (ctx, at most 5 per word) is that book
       mastered    those of them that are mastered (same rule as above)
       chapters    tracks of that book finished: values of 1 in wt:lp:<book id> (280)
     Milestones (quiet list, no pop-ups, nothing is stored): 100 words collected, 7-day streak (the longest run), first book finished (the books-finished
       count of Your listening, stSummary in 090), 500 mastered. Each shows have / target until it is reached.
     Calm mode (P.calm) hides the streak, the accuracy and the milestones; the other tiles, the chart and the books stay.
     Cached: the result is kept in memory and only worked out again when wt:words, wt:learnlog, the listening days, the day or Calm mode changed.
     API (later tasks call these):
       PG.show()   fill #pg (called by acctView in 090 when Your activity opens)
       PG.model()  the numbers (cached)
       PG.calc(inp, now)   pure: inp = { words, log, days, calm, booktime, lp, titles, finished }; tools/progress_check.js
     Styles 94l-progress.css. Remove this file, that file, their build.py lines, the #pg section in 10-body-views.html and the PG call in acctView (090) to go back. */
  const PG = (() => {
    const WEEKS = 8, C = { sig: '', model: null };
    const num = v => (typeof v === 'number' && isFinite(v) && v > 0) ? Math.floor(v) : 0;
    const isObj = x => !!x && typeof x === 'object' && !Array.isArray(x);
    const key = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    const endOf = d => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999).getTime();
    const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

    /* ----- pure ----- */
    function isMastered(e) {
      let st = e && e.st;
      try { if (WM.STAGES.indexOf(st) < 0) st = WM.stage(e); } catch (x) { /* no word model */ }
      return st === 'mastered';
    }
    function masteredAt(e) {
      const ts = num(e.ts); let t = num(e.mt);
      if (!t) { try { t = num(SRS.lastReview(e)); } catch (x) { /* no scheduler */ } }
      if (!t) t = num(e.acq) || ts;
      return Math.max(t, ts);
    }
    function calc(inp, now) {
      const words = Array.isArray(inp.words) ? inp.words.filter(e => isObj(e) && typeof e.w === 'string') : [];
      const log = isObj(inp.log) ? inp.log : {}, days = isObj(inp.days) ? inp.days : {};
      const active = k => { const l = log[k]; return !!(isObj(l) && Object.keys(l).length) || num((days[k] || {}).s) >= 60; };
      // streak: now and longest
      let cur = 0; const d = new Date(now);
      if (!active(key(d))) d.setDate(d.getDate() - 1);
      while (active(key(d)) && cur < 1000) { cur++; d.setDate(d.getDate() - 1); }
      let best = 0, run = 0, prev = null;
      const all = {}; Object.keys(log).concat(Object.keys(days)).forEach(k => { if (/^\d{4}-\d{2}-\d{2}$/.test(k)) all[k] = 1; });
      Object.keys(all).filter(active).sort().forEach(k => {
        const p = k.split('-').map(Number), t = Date.UTC(p[0], p[1] - 1, p[2]) / 864e5;
        run = prev !== null && t - prev === 1 ? run + 1 : 1; prev = t; if (run > best) best = run;
      });
      // time, reviews
      let secs = 0, r = 0, c = 0;
      Object.keys(all).forEach(k => { const l = isObj(log[k]) ? log[k] : {}; secs += Math.max(num((days[k] || {}).s), num(l.m) * 60); });
      Object.keys(log).forEach(k => { if (isObj(log[k])) { r += num(log[k].r); c += num(log[k].c); } });
      // words
      const col = words.map(e => num(e.ts)), mas = words.filter(isMastered).map(masteredAt);
      const ends = [], cs = [], ms = [], t0 = new Date(now);
      for (let i = 0; i < WEEKS; i++) {
        const day = new Date(t0.getFullYear(), t0.getMonth(), t0.getDate() - 7 * (WEEKS - 1 - i)), e = endOf(day);
        ends.push(day.getTime()); cs.push(col.filter(t => t <= e).length); ms.push(mas.filter(t => t <= e).length);
      }
      cs[WEEKS - 1] = words.length; ms[WEEKS - 1] = mas.length;   // the last point is always the real count
      // books
      const bt = isObj(inp.booktime) ? inp.booktime : {}, lp = isObj(inp.lp) ? inp.lp : {}, titles = isObj(inp.titles) ? inp.titles : {}, B = {};
      const bk = id => B[id] || (B[id] = { id, title: '', secs: 0, words: 0, mastered: 0, chapters: 0 });
      Object.keys(bt).forEach(id => { const n = num(bt[id]); if (n) bk(id).secs = n; });
      Object.keys(lp).forEach(id => { const o = lp[id]; if (isObj(o)) { const n = Object.keys(o).filter(i => +o[i] >= 1).length; if (n) bk(id).chapters = n; } });
      words.forEach(e => {
        const m = isMastered(e), at = {};
        if (e.bid != null && e.bid !== '') at[String(e.bid)] = e.bt;
        (Array.isArray(e.ctx) ? e.ctx : []).forEach(x => { if (isObj(x) && x.bid != null && x.bid !== '') { const id = String(x.bid); if (!(id in at)) at[id] = x.bt; } });
        Object.keys(at).forEach(id => { const b = bk(id); b.words++; if (m) b.mastered++; if (!b.title && at[id]) b.title = String(at[id]); });
      });
      const books = Object.keys(B).map(id => B[id]).filter(b => b.secs || b.words || b.chapters);
      books.forEach(b => { if (titles[b.id]) b.title = String(titles[b.id]); b.minutes = Math.floor(b.secs / 60); });
      books.sort((x, y) => y.secs - x.secs || y.words - x.words || y.chapters - x.chapters || (x.title < y.title ? -1 : x.title > y.title ? 1 : 0));
      const fin = num(inp.finished);
      const mil = [['words100', words.length, 100], ['streak7', best, 7], ['book1', fin, 1], ['mastered500', mas.length, 500]]
        .map(a => ({ id: a[0], have: Math.min(a[1], a[2]), target: a[2], done: a[1] >= a[2] }));
      return { streak: cur, best, minutes: Math.floor(secs / 60), collected: words.length, mastered: mas.length, reviews: r, correct: c,
        accuracy: r > 0 ? Math.round(100 * c / r) : null, ends, cs, ms, calm: inp.calm === true, books, milestones: mil };
    }

    /* ----- data and cache ----- */
    function hash(s) { let x = 2166136261; for (let i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 16777619); } return (x >>> 0).toString(36) + ':' + s.length; }
    const raw = k => { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } };
    function listen() { let n = 0, s = 0; try { Object.keys(ST.days).forEach(k => { n++; s += num(ST.days[k].s); }); } catch (e) { /* stats not ready */ } return { n, s }; }
    function lpAll() {   // { book id: { track: 0..1 } } and the raw text of all of them (for the cache check)
      const lp = {}; let txt = '';
      try { Object.keys(localStorage).forEach(k => { if (k.indexOf('wt:lp:') === 0) { const t = localStorage.getItem(k) || ''; txt += k + t; try { lp[k.slice(6)] = JSON.parse(t); } catch (e) { /* skip */ } } }); } catch (e) { /* storage unavailable */ }
      return { lp, txt };
    }
    function titlesOf() {   // book id -> title, from what the app already keeps
      const o = {}, put = r => { if (r && r.id != null && r.title && !o[String(r.id)]) o[String(r.id)] = r.title; };
      try { P.recents.forEach(put); } catch (e) { /* none */ }
      try { (store.get('wt:listens', []) || []).forEach(put); } catch (e) { /* none */ }
      try { (ST.done || []).forEach(put); } catch (e) { /* none */ }
      try { getFavs().forEach(put); } catch (e) { /* none */ }
      return o;
    }
    function model() {
      const calm = (() => { try { return P.calm === true; } catch (e) { return false; } })(), l = listen(), now = new Date(), L = lpAll();
      let finished = 0; try { finished = stSummary().done.length; } catch (e) { try { finished = (ST.done || []).length; } catch (x) { /* none */ } }
      let booktime = {}; try { booktime = BT.get(); } catch (e) { /* book time not ready */ }
      const titles = titlesOf();
      const fp = [hash(raw('wt:words')), hash(raw('wt:learnlog')), l.n, l.s, key(now), calm, hash(L.txt), hash(JSON.stringify(booktime)), hash(JSON.stringify(titles)), finished].join('|');
      if (C.model && C.sig === fp) return C.model;
      let words = [], log = {}, days = {};
      try { words = WS.all(); } catch (e) { /* word store not ready */ }
      try { log = LL.all(); } catch (e) { /* learning log not ready */ }
      try { days = ST.days || {}; } catch (e) { /* stats not ready */ }
      C.model = calc({ words, log, days, calm, booktime, lp: L.lp, titles, finished }, now.getTime()); C.sig = fp;
      return C.model;
    }

    /* ----- screen ----- */
    function fmtTime(min) { const hh = Math.floor(min / 60), mm = min % 60; return hh ? hh + ' h ' + mm + ' m' : mm + ' m'; }
    function chart(m) {
      const W = 320, H = 150, L = 30, R = 46, T = 14, B = 24, n = WEEKS, top = Math.max(4, m.cs[n - 1], ...m.cs);
      const X = i => L + i * (W - L - R) / (n - 1), Y = v => T + (H - T - B) * (1 - v / top);
      const pts = a => a.map((v, i) => X(i).toFixed(1) + ',' + Y(v).toFixed(1)).join(' ');
      const dt = t => new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
      const yc = Y(m.cs[n - 1]); let ym = Y(m.ms[n - 1]); if (Math.abs(ym - yc) < 14) ym = yc + 14;
      let s = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Vocabulary growth, last 8 weeks">';
      [0, 1].forEach(g => { const y = (T + (H - T - B) * g).toFixed(1); s += '<line class="pg-grid" x1="' + L + '" x2="' + (W - R) + '" y1="' + y + '" y2="' + y + '"/>'; });
      s += '<text class="pg-tick" x="' + (L - 6) + '" y="' + (T + 4) + '" text-anchor="end">' + top + '</text><text class="pg-tick" x="' + (L - 6) + '" y="' + (H - B + 4) + '" text-anchor="end">0</text>';
      s += '<text class="pg-tick" x="' + L + '" y="' + (H - 6) + '">' + esc(dt(m.ends[0])) + '</text><text class="pg-tick" x="' + (W - R) + '" y="' + (H - 6) + '" text-anchor="end">' + esc(dt(m.ends[n - 1])) + '</text>';
      s += '<polyline class="pg-line pg-line--c" points="' + pts(m.cs) + '"/><polyline class="pg-line pg-line--m" points="' + pts(m.ms) + '"/>';
      m.cs.forEach((v, i) => { s += '<circle class="pg-dot pg-dot--c" cx="' + X(i).toFixed(1) + '" cy="' + Y(v).toFixed(1) + '" r="' + (i === n - 1 ? 5 : 3.5) + '"><title>' + esc(dt(m.ends[i])) + ': ' + v + '</title></circle>'; });
      m.ms.forEach((v, i) => { const x = X(i), y = Y(v), r = i === n - 1 ? 4.5 : 3; s += '<rect class="pg-dot pg-dot--m" x="' + (x - r).toFixed(1) + '" y="' + (y - r).toFixed(1) + '" width="' + 2 * r + '" height="' + 2 * r + '"><title>' + esc(dt(m.ends[i])) + ': ' + v + '</title></rect>'; });
      s += '<text class="pg-end" x="' + (X(n - 1) + 10).toFixed(1) + '" y="' + (yc + 4).toFixed(1) + '">' + m.cs[n - 1] + '</text><text class="pg-end" x="' + (X(n - 1) + 10).toFixed(1) + '" y="' + (ym + 4).toFixed(1) + '">' + m.ms[n - 1] + '</text></svg>';
      const box = h('div', { class: 'pg-svg' }); box.innerHTML = s;
      const rows = m.ends.map((t, i) => h('tr', {}, h('th', { scope: 'row' }, dt(t)), h('td', {}, String(m.cs[i])), h('td', {}, String(m.ms[i]))));
      const table = h('table', { class: 'pg-sr' }, h('caption', {}, 'Vocabulary growth'), h('thead', {}, h('tr', {}, h('th', {}, 'Week'), h('th', {}, 'Collected'), h('th', {}, 'Mastered'))), h('tbody', {}, rows));
      return [box, table];
    }
    function show() {
      const box = document.getElementById('pg'); if (!box) return;
      const m = model();
      if (!learnOn() || (!m.collected && !m.minutes && !m.reviews && !m.books.length)) { box.hidden = true; box.textContent = ''; return; }
      const kids = [h('h2', { id: 'pg-h' }, 'Progress')];
      if (!m.calm) {
        kids.push(h('div', { class: 'pg-streak wl-card' + (m.streak ? ' on' : '') },
          h('span', { class: 'pg-flame', 'aria-hidden': 'true' }, '🔥'),
          m.streak
            ? h('div', {}, h('div', { class: 'pg-streak-n' }, h('strong', {}, String(m.streak)), ' ', h('span', {}, 'day streak')), h('p', {}, h('span', {}, 'Longest'), ': ' + m.best + (m.best === 1 ? ' day' : ' days')))
            : h('div', {}, h('div', { class: 'pg-streak-n' }, h('span', {}, 'No streak yet')), h('p', {}, 'Read, listen or review today to start one.'))));
      }
      const tile = (ic, v, l, ok) => h('div', { class: 'wl-stat pg-tile' }, h('span', { class: 'pg-ic', 'aria-hidden': 'true' }, ic), h('strong', { class: 'wl-stat__value' + (ok ? ' pg-ok' : '') }, v), h('span', { class: 'wl-stat__label' }, l));
      const tiles = [tile('★', String(m.collected), 'Words collected'), tile('🏅', String(m.mastered), 'Mastered', true)];
      if (!m.calm) tiles.push(tile('🎯', m.accuracy == null ? '–' : m.accuracy + '%', 'Review accuracy'));
      tiles.push(tile('⏱', fmtTime(m.minutes), 'Read and listened'));
      kids.push(h('div', { class: 'pg-tiles' }, tiles));
      if (m.collected) {
        kids.push(h('div', { class: 'pg-chart wl-card' },
          h('div', { class: 'pg-chart-h' }, h('strong', {}, 'Vocabulary growth'), h('span', {}, '8 weeks')),
          chart(m),
          h('div', { class: 'pg-legend' }, h('span', {}, h('i', { class: 'pg-sw pg-sw--c', 'aria-hidden': 'true' }), 'Collected'), h('span', {}, h('i', { class: 'pg-sw pg-sw--m', 'aria-hidden': 'true' }), 'Mastered'))));
      }
      if (m.books.length) kids.push(booksBox(m.books));
      if (!m.calm) kids.push(milestonesBox(m.milestones));
      box.textContent = ''; box.append(...kids); box.hidden = false;
    }
    const MS_LABEL = { words100: '100 words', streak7: '7-day streak', book1: 'First book finished', mastered500: '500 mastered' };
    function milestonesBox(list) {   // a quiet list: nothing pops up, nothing is stored
      return h('div', { class: 'pg-box' }, h('h3', {}, 'Milestones'),
        h('ul', { class: 'pg-ms' }, list.map(x => h('li', { class: x.done ? 'is-done' : '' },
          h('span', { class: 'pg-ms-mark', 'aria-hidden': 'true' }, x.done ? '\u2713' : ''),
          h('span', { class: 'pg-ms-t' }, MS_LABEL[x.id]),
          h('span', { class: 'pg-ms-n' }, x.done ? 'Done' : x.have + ' / ' + x.target)))));
    }
    function booksBox(books) {
      const box = h('div', { class: 'pg-box' }), list = h('div', { class: 'pg-books' });
      let all = false;
      const draw = () => {
        list.textContent = '';
        books.slice(0, all ? books.length : 5).forEach(b => {
          const st = (v, l) => h('div', {}, h('strong', {}, v), h('span', {}, l));
          list.append(h('div', { class: 'pg-book wl-card' }, h('div', { class: 'pg-book-t' }, b.title || 'Untitled'),
            h('div', { class: 'pg-book-s' }, st(fmtTime(b.minutes), 'Time'), st(String(b.words), 'Words found'), st(String(b.mastered), 'Mastered'), st(String(b.chapters), 'Chapters done'))));
        });
        more.hidden = books.length <= 5; more.textContent = all ? 'Show fewer' : 'Show all';
      };
      const more = h('button', { class: 'pg-more', type: 'button', onclick: () => { all = !all; draw(); } });
      box.append(h('h3', {}, 'Your books'), list, more); draw();
      return box;
    }
    return { show, model, calc };
  })();
