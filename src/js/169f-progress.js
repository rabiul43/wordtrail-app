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
     Four more charts (read-only, same data, no new key), under the growth chart:
       level       words by CEFR level A1..C2 (the saved word's lv; no or unknown level = "Unknown"), bar chart
       part        words by part of speech: noun, verb, adjective, adverb, other, Unknown. A saved word has no part of speech of its own, so it is
                   read from the dictionary copy the word panel already keeps in IndexedDB ('dict:<word>', never fetched from the network here);
                   a word with several parts of speech counts under its first. Words with no saved copy count as Unknown. Looked up once per
                   page open in the background (kept in memory only) and the chart is drawn again when it is done
       learned     words learned per day, last 30 days: the same rule as Reading analytics in 090 (acq, else the save time of a word with iv >= 14)
       skills      radar of practice sessions this calendar month, from wt:ielts (IE, 169o): Listening, Reading, Writing, Speaking
     Calm mode (P.calm) hides the streak, the accuracy, the milestones, the learned-per-day chart and the skill radar (daily and monthly\n       counts can feel like a target); the other tiles, the growth chart, the level and part-of-speech charts and the books stay.
     Cached: the result is kept in memory and only worked out again when wt:words, wt:learnlog, the listening days, the day or Calm mode changed.
     API (later tasks call these):
       PG.show()   fill #pg (called by acctView in 090 when Your activity opens)
       PG.model()  the numbers (cached)
       PG.calc(inp, now)   pure: inp = { words, log, days, calm, booktime, lp, titles, finished, pos, ielts }; tools/progress_check.js
       PG.posOf(list)  PG.cefrOf(lv)   pure helpers for the part-of-speech and level charts
     Styles 94l-progress.css. Remove this file, that file, their build.py lines, the #pg section in 10-body-views.html and the PG call in acctView (090) to go back. */
  const PG = (() => {
    const WEEKS = 8, DAYS = 30, C = { sig: '', model: null };
    const CEFR = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'], POS = ['noun', 'verb', 'adjective', 'adverb', 'other', 'unknown'], SKILLS = ['l', 'r', 'w', 's'];
    const POSC = { map: {}, tried: {}, busy: false, ver: 0 };   // part of speech found so far, in memory only (never stored)
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
    function cefrOf(lv) {   // 'A1'..'C2', or '' when there is no (known) level
      const m = /\b([ABC][12])\b/.exec(String(lv == null ? '' : lv).toUpperCase());
      return m ? m[1] : '';
    }
    function posOf(list) {   // the first part of speech of a dictionary entry: noun, verb, adjective, adverb, other, or unknown
      const a = Array.isArray(list) ? list : typeof list === 'string' ? [list] : [];
      const p = String(a.find(x => typeof x === 'string' && x.trim()) || '').trim().toLowerCase();
      return !p ? 'unknown' : (p === 'noun' || p === 'verb' || p === 'adjective' || p === 'adverb') ? p : 'other';
    }
    const learnedAt = e => num(e.acq) || (num(e.iv) >= 14 ? num(e.ts) : 0);   // same rule as Reading analytics (090)
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
      // level, part of speech: every word is counted once; no level / no part of speech = Unknown (the last slot)
      const posMap = isObj(inp.pos) ? inp.pos : {}, cefr = [0, 0, 0, 0, 0, 0, 0], pos = [0, 0, 0, 0, 0, 0];
      words.forEach(e => {
        const c = CEFR.indexOf(cefrOf(e.lv)); cefr[c < 0 ? 6 : c]++;
        const q = POS.indexOf(posMap[String(e.w).trim().toLowerCase()]); pos[q < 0 ? 5 : q]++;
      });
      // learned per day, last 30 days (oldest first, the last one is today)
      const dayStarts = [], learned = []; for (let i = 0; i < DAYS; i++) { dayStarts.push(new Date(t0.getFullYear(), t0.getMonth(), t0.getDate() - (DAYS - 1 - i)).getTime()); learned.push(0); }
      const lastEnd = endOf(t0);
      words.forEach(e => { const at = learnedAt(e); if (at >= dayStarts[0] && at <= lastEnd) { for (let i = DAYS - 1; i >= 0; i--) { if (at >= dayStarts[i]) { learned[i]++; break; } } } });
      // practice sessions this calendar month (wt:ielts: { day: { l, r, w, s } })
      const ie = isObj(inp.ielts) ? inp.ielts : {}, mon = key(t0).slice(0, 7), skills = { l: 0, r: 0, w: 0, s: 0 };
      Object.keys(ie).forEach(k => { if (/^\d{4}-\d{2}-\d{2}$/.test(k) && k.indexOf(mon + '-') === 0 && isObj(ie[k])) SKILLS.forEach(f => { skills[f] += num(ie[k][f]); }); });
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
        accuracy: r > 0 ? Math.round(100 * c / r) : null, ends, cs, ms, calm: inp.calm === true, books, milestones: mil,
        cefr, pos, learned, dayStarts, skills, month: mon };
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
    function loadPos() {   // part of speech per saved word from the dictionary copy kept by 149 (read only; no network); then draw again
      if (POSC.busy || typeof idb === 'undefined' || typeof DICT === 'undefined') return;
      let names = []; try { names = WS.all().map(e => String(e.w).trim().toLowerCase()); } catch (e) { return; }
      const now = Date.now(), todo = names.filter(w => w && !(w in POSC.map) && !(now - (POSC.tried[w] || 0) < 120000));
      if (!todo.length) return;
      POSC.busy = true;
      (async () => {
        try {
          for (let i = 0; i < todo.length; i += 40) {
            await Promise.all(todo.slice(i, i + 40).map(async w => {
              let c = null; try { c = await idb.get(DICT.key(w)); } catch (e) { /* no saved copy */ }
              POSC.tried[w] = Date.now();
              const p = c && c.v === 1 && c.none !== true ? posOf(c.pos) : 'unknown'; if (p !== 'unknown') POSC.map[w] = p;
            }));
          }
        } catch (e) { /* best effort */ }
        POSC.busy = false; POSC.ver++;
        try { const b = document.getElementById('pg'); if (b && !b.hidden) show(); } catch (e) { /* page gone */ }
      })();
    }
    function model() {
      const calm = (() => { try { return P.calm === true; } catch (e) { return false; } })(), l = listen(), now = new Date(), L = lpAll();
      let finished = 0; try { finished = stSummary().done.length; } catch (e) { try { finished = (ST.done || []).length; } catch (x) { /* none */ } }
      let booktime = {}; try { booktime = BT.get(); } catch (e) { /* book time not ready */ }
      const titles = titlesOf();
      let ielts = {}; try { ielts = store.get('wt:ielts', {}) || {}; } catch (e) { /* none */ }
      const fp = [hash(raw('wt:words')), hash(raw('wt:learnlog')), l.n, l.s, key(now), calm, hash(L.txt), hash(JSON.stringify(booktime)), hash(JSON.stringify(titles)), finished, hash(raw('wt:ielts')), POSC.ver, POSC.busy].join('|');
      if (C.model && C.sig === fp) return C.model;
      let words = [], log = {}, days = {};
      try { words = WS.all(); } catch (e) { /* word store not ready */ }
      try { log = LL.all(); } catch (e) { /* learning log not ready */ }
      try { days = ST.days || {}; } catch (e) { /* stats not ready */ }
      C.model = calc({ words, log, days, calm, booktime, lp: L.lp, titles, finished, pos: POSC.map, ielts }, now.getTime()); C.model.posLoading = POSC.busy; C.sig = fp;
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
    /* ----- four more charts: plain SVG, each with a hidden table for screen readers ----- */
    const fmtDay = t => new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
    const srTable = (cap, head, rows) => h('table', { class: 'pg-sr' }, h('caption', {}, cap), h('thead', {}, h('tr', {}, head.map(x => h('th', {}, x)))), h('tbody', {}, rows.map(r => h('tr', {}, r.map((c, i) => h(i ? 'td' : 'th', i ? {} : { scope: 'row' }, String(c)))))));
    const svgBox = (s) => { const b = h('div', { class: 'pg-svg' }); b.innerHTML = s; return b; };
    function vbars(vals, labels, aria, o) {   // vertical bars; o.dim(i) = grey bar, o.num = write the number above each bar, o.ends = first and last date under the axis
      const W = 320, H = 150, L = 30, R = 6, T = 16, B = 24, n = vals.length, top = Math.max(4, ...vals), slot = (W - L - R) / n, bw = Math.min(28, slot * 0.64);
      const X = i => L + slot * i + (slot - bw) / 2, Y = v => T + (H - T - B) * (1 - v / top);
      let s = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(aria) + '">';
      [0, 1].forEach(g => { const y = (T + (H - T - B) * g).toFixed(1); s += '<line class="pg-grid" x1="' + L + '" x2="' + (W - R) + '" y1="' + y + '" y2="' + y + '"/>'; });
      s += '<text class="pg-tick" x="' + (L - 6) + '" y="' + (T + 4) + '" text-anchor="end">' + top + '</text><text class="pg-tick" x="' + (L - 6) + '" y="' + (H - B + 4) + '" text-anchor="end">0</text>';
      vals.forEach((v, i) => {
        const y = Y(v), hh = v ? Math.max(2, H - B - y) : 0, u = o.dim && o.dim(i);
        s += '<rect class="pg-bar' + (u ? ' pg-bar--u' : '') + '" x="' + X(i).toFixed(1) + '" y="' + (H - B - hh).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + hh.toFixed(1) + '" rx="3"><title>' + esc(labels[i]) + ': ' + v + '</title></rect>';
        if (o.num && v) s += '<text class="pg-end" x="' + (X(i) + bw / 2).toFixed(1) + '" y="' + (H - B - hh - 4).toFixed(1) + '" text-anchor="middle">' + v + '</text>';
        if (o.all) s += '<text class="pg-tick' + (u ? ' pg-tick--s' : '') + '" x="' + (X(i) + bw / 2).toFixed(1) + '" y="' + (H - 6) + '" text-anchor="middle">' + esc(labels[i]) + '</text>';
      });
      if (o.ends) s += '<text class="pg-tick" x="' + L + '" y="' + (H - 6) + '">' + esc(labels[0]) + '</text><text class="pg-tick" x="' + (W - R) + '" y="' + (H - 6) + '" text-anchor="end">' + esc(labels[n - 1]) + '</text>';
      return svgBox(s + '</svg>');
    }
    function hbars(rows, total, aria) {   // horizontal bars: [label, count, grey?]
      const W = 320, RH = 28, L = 84, R = 70, H = rows.length * RH + 4, top = Math.max(1, ...rows.map(r => r[1]));
      let s = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(aria) + '">';
      rows.forEach((r, i) => {
        const y = 2 + i * RH, w = r[1] ? Math.max(3, (W - L - R) * r[1] / top) : 0, pc = total ? Math.round(100 * r[1] / total) : 0;
        s += '<text class="pg-tick pg-lab" x="' + (L - 8) + '" y="' + (y + 17) + '" text-anchor="end">' + esc(r[0]) + '</text>';
        if (w) s += '<rect class="pg-bar' + (r[2] ? ' pg-bar--u' : '') + '" x="' + L + '" y="' + (y + 4) + '" width="' + w.toFixed(1) + '" height="' + (RH - 10) + '" rx="3"><title>' + esc(r[0]) + ': ' + r[1] + '</title></rect>';
        s += '<text class="pg-end" x="' + (L + w + 6).toFixed(1) + '" y="' + (y + 18) + '">' + r[1] + ' · ' + pc + '%</text>';
      });
      return svgBox(s + '</svg>');
    }
    function radar(sk, names, aria) {   // 4 axes: Listening (top), Reading (right), Writing (bottom), Speaking (left)
      const W = 320, H = 220, cx = 160, cy = 108, R = 70, vals = SKILLS.map(f => sk[f]), top = Math.max(4, ...vals);
      const ang = [-90, 0, 90, 180].map(d => d * Math.PI / 180), P = (i, r) => [cx + r * Math.cos(ang[i]), cy + r * Math.sin(ang[i])];
      const poly = r => ang.map((a, i) => P(i, r).map(v => v.toFixed(1)).join(',')).join(' ');
      let s = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(aria) + '">';
      [1 / 3, 2 / 3, 1].forEach(g => { s += '<polygon class="pg-ring" points="' + poly(R * g) + '"/>'; });
      ang.forEach((a, i) => { const q = P(i, R); s += '<line class="pg-grid" x1="' + cx + '" y1="' + cy + '" x2="' + q[0].toFixed(1) + '" y2="' + q[1].toFixed(1) + '"/>'; });
      s += '<polygon class="pg-area" points="' + vals.map((v, i) => P(i, R * v / top).map(x => x.toFixed(1)).join(',')).join(' ') + '"/>';
      vals.forEach((v, i) => { const q = P(i, R * v / top); s += '<circle class="pg-dot pg-dot--c" cx="' + q[0].toFixed(1) + '" cy="' + q[1].toFixed(1) + '" r="4"><title>' + esc(names[i]) + ': ' + v + '</title></circle>'; });
      const lab = [[cx, cy - R - 12, 'middle'], [cx + R + 10, cy + 4, 'start'], [cx, cy + R + 22, 'middle'], [cx - R - 10, cy + 4, 'end']];
      names.forEach((nm, i) => { s += '<text class="pg-lab" x="' + lab[i][0] + '" y="' + lab[i][1] + '" text-anchor="' + lab[i][2] + '">' + esc(nm) + ' <tspan class="pg-labn">' + vals[i] + '</tspan></text>'; });
      return svgBox(s + '</svg>');
    }
    const card = (title, sub, body, legend) => h('div', { class: 'pg-chart wl-card' }, h('div', { class: 'pg-chart-h' }, h('strong', {}, title), h('span', {}, sub)), body, legend || null);
    const empty = text => h('p', { class: 'pg-empty' }, text);
    function levelCard(m) {
      const names = CEFR.concat('Unknown'), known = m.cefr.slice(0, 6).reduce((a, b) => a + b, 0);
      if (!known) return card('Words by level', 'CEFR', empty('No word levels yet. Words you save from a book\u2019s word list come with a level.' + (m.cefr[6] ? ' ' + m.cefr[6] + (m.cefr[6] === 1 ? ' word has' : ' words have') + ' no level.' : '')));
      return card('Words by level', 'CEFR', [vbars(m.cefr, names, 'Words by CEFR level: ' + names.map((x, i) => x + ' ' + m.cefr[i]).join(', '), { all: true, num: true, dim: i => i === 6 }),
        srTable('Words by level', ['Level', 'Words'], names.map((x, i) => [x, m.cefr[i]]))]);
    }
    function posCard(m) {
      const names = ['Noun', 'Verb', 'Adjective', 'Adverb', 'Other', 'Unknown'], known = m.pos.slice(0, 5).reduce((a, b) => a + b, 0), total = m.pos.reduce((a, b) => a + b, 0);
      const note = m.posLoading ? h('p', { class: 'pg-empty', role: 'status' }, 'Looking up saved word data\u2026') : null;
      if (!known && !m.posLoading) return card('Words by part of speech', 'dictionary', empty('No part-of-speech data yet. It appears for words whose dictionary tab you have opened.' + (total ? ' ' + total + (total === 1 ? ' word is' : ' words are') + ' counted as Unknown.' : '')));
      const rows = names.map((x, i) => [x, m.pos[i], i === 5]).filter(r => r[1] > 0);
      return card('Words by part of speech', 'dictionary', [note, hbars(rows, total, 'Words by part of speech: ' + rows.map(r => r[0] + ' ' + r[1]).join(', ')),
        srTable('Words by part of speech', ['Part of speech', 'Words'], names.map((x, i) => [x, m.pos[i]]))]);
    }
    function learnedCard(m) {
      const sum = m.learned.reduce((a, b) => a + b, 0);
      if (!sum) return card('Words learned per day', '30 days', empty('No words learned in the last 30 days yet. A word counts as learned when you remember it after two weeks or more.'));
      const labels = m.dayStarts.map(fmtDay);
      return card('Words learned per day', '30 days', [vbars(m.learned, labels, 'Words learned per day, last 30 days: ' + sum + ' in all', { ends: true }),
        srTable('Words learned per day', ['Day', 'Words'], labels.map((x, i) => [x, m.learned[i]]))]);
    }
    function radarCard(m) {
      const names = ['Listening', 'Reading', 'Writing', 'Speaking'], mon = new Date(+m.month.slice(0, 4), +m.month.slice(5, 7) - 1, 1).toLocaleDateString(undefined, { month: 'long' });
      const sum = SKILLS.reduce((a, f) => a + m.skills[f], 0);
      if (!sum) return card('Skill balance', mon, empty('No practice logged in ' + mon + ' yet. Finishing a Listen and type set, chapter questions, a Paraphrase set or an Echo practice adds a session here.'));
      return card('Skill balance', mon, [radar(m.skills, names, 'Practice sessions in ' + mon + ': ' + names.map((x, i) => x + ' ' + m.skills[SKILLS[i]]).join(', ')),
        srTable('Practice sessions in ' + mon, ['Skill', 'Sessions'], names.map((x, i) => [x, m.skills[SKILLS[i]]]))]);
    }
    function show() {
      const box = document.getElementById('pg'); if (!box) return;
      loadPos(); const m = model();   // loadPos first, so the model knows a lookup is running
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
      if (m.collected) { kids.push(levelCard(m), posCard(m)); if (!m.calm) kids.push(learnedCard(m)); }
      if (!m.calm) kids.push(radarCard(m));
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
    return { show, model, calc, posOf, cefrOf };
  })();
