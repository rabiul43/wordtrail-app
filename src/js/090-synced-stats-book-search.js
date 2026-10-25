  /* ---------- Synced tab ---------- */
  /* Lists files directly from the Hugging Face dataset repo using the public HF tree API.
     No GitHub required. Returns book IDs whose .json.gz pack exists in wt_packs_v2/ or wt_packs/. */
  const HF_REPO = 'rabiul43/wordtrail-packs';
  const SYNCED_CACHE = { ids: null, dates: {}, t: 0 };
  let syncedFilter = 'recent';

  async function loadHFSyncedIds() {
    if (SYNCED_CACHE.ids && Date.now() - SYNCED_CACHE.t < 10 * 60e3) return SYNCED_CACHE.ids;
    // HuggingFace public tree API — lists files in a folder, no token needed for public datasets
    const base = 'https://huggingface.co/api/datasets/' + HF_REPO + '/tree/main/';
    async function treeAll(url) {
      const out = []; let next = url, guard = 0;
      while (next && guard++ < 30) {
        try {
          const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 12000);
          const r = await fetch(next, { signal: ctl.signal }); clearTimeout(to);
          if (!r.ok) { if (!out.length) return null; break; }
          const j = await r.json(); if (!Array.isArray(j)) break;
          out.push(...j);
          let lk = ''; try { lk = r.headers.get('Link') || ''; } catch (e) { /* header not readable */ }
          const m = lk.match(/<([^>]+)>;\s*rel="next"/);
          next = m ? m[1] : null;
        } catch (e) { if (!out.length) return null; break; }
      }
      return out;
    }
    /* Try the richest query first; if the host rejects it, fall back to simpler ones so the list never comes back empty. */
    async function treeTry(url) {
      for (const q of ['?expand=true&limit=1000', '?expand=true', '']) {
        const f = await treeAll(url + q);
        if (f && f.length) return f;
      }
      return null;
    }
    const qs = ''; // adds lastCommit.date so we can sort by recently synced
    const dates = {};
    const ids = new Set();
    try {
      // Try wt_packs_v2 first (precise aligned packs)
      const files = await treeTry(base + 'wt_packs_v2'); // [{path, type, size, oid, lastCommit}, ...]
      if (files) {
        files.forEach(f => {
          const m = f.path && f.path.match(/wt_packs_v2\/(.+?)\.json(?:\.gz)?$/);
          if (m) { const k = decodeURIComponent(m[1]); ids.add(k); const d = f.lastCommit && Date.parse(f.lastCommit.date); if (d) dates[k] = d; }
        });
      }
    } catch (e) { /* offline or folder missing */ }
    if (!ids.size) {
      // Fallback: list wt_packs/
      try {
        const files2 = await treeTry(base + 'wt_packs');
        if (files2) {
          files2.forEach(f => {
            const m = f.path && f.path.match(/wt_packs\/(.+?)\.json(?:\.gz)?$/);
            if (m) { const k = decodeURIComponent(m[1]); ids.add(k); const d = f.lastCommit && Date.parse(f.lastCommit.date); if (d) dates[k] = d; }
          });
        }
      } catch (e) { /* offline */ }
    }
    if (ids.size) { SYNCED_CACHE.ids = ids; SYNCED_CACHE.dates = dates; SYNCED_CACHE.t = Date.now(); }
    return ids;
  }

  async function renderSynced() {
    const list = $('#synced-list'), countEl = $('#synced-count');
    list.textContent = '';
    if (countEl) countEl.textContent = '';

    list.append(h('div', { class: 'synced-empty' },
      h('div', { class: 'synced-empty-ic' }, '⏳'),
      h('p', {}, 'Loading from Hugging Face…')));

    const ids = await loadHFSyncedIds();
    try { await PKI.load(); } catch (e) { /* no index: badges stay '✓ Ready' */ }
    list.textContent = '';

    if (!ids || !ids.size) {
      list.append(h('div', { class: 'synced-empty' },
        h('div', { class: 'synced-empty-ic' }, '📡'),
        h('h2', {}, 'Nothing published yet'),
        h('p', {}, 'The Kaggle job hasn\'t uploaded any books to Hugging Face yet. Check back after the next run.')));
      if (countEl) countEl.textContent = '';
      return;
    }

    if (countEl) countEl.textContent = 'Total: ' + ids.size + ' book' + (ids.size === 1 ? '' : 's') + ' added';

    // Look up title, authors, cover from local caches (favourites, recents, catalog)
    function metaFor(id) {
      const sid = String(id);
      const fav = getFavs().find(f => f.id === sid);
      if (fav) return { title: fav.title, authors: fav.authors, cover: fav.cover };
      const rec = (P.recents || []).find(r => String(r.id) === sid);
      if (rec) return { title: rec.title, authors: rec.authors, cover: rec.cover };
      if (CAT.books) {
        const cb = CAT.books.find(b => String(b.id) === sid);
        if (cb) return { title: cb.title, authors: cb.authors, cover: cb.cover || '' };
      }
      return { title: null, authors: '', cover: '' };
    }

    function syncRow(id) {
      const meta = metaFor(id);
      const coverEl = meta.cover
        ? h('img', { class: 'synced-row-cover', src: meta.cover, alt: '', loading: 'lazy', decoding: 'async', width: '48', height: '64', referrerpolicy: 'no-referrer' })
        : h('span', { class: 'synced-row-cover', 'aria-hidden': 'true' });
      return h('div', { class: 'synced-row', role: 'button', tabindex: '0',
        onclick: () => {
          const b = getFavs().find(f => f.id === String(id))
            || (P.recents || []).find(r => String(r.id) === String(id))
            || (CAT.books && CAT.books.find(b => String(b.id) === String(id)));
          /* Not in favourites, recents or the catalog? resumeRecent only needs the id: it loads the track list itself. */
          pendingBack = { tab: 'synced', see: false }; showTab('library');
          resumeRecent(b || { id: String(id), title: meta.title || 'Book ' + id, authors: meta.authors || '', cover: meta.cover || '' });
        }},
        coverEl,
        h('div', { class: 'synced-row-info' },
          h('div', { class: 'synced-row-title' }, meta.title || 'Book ' + id),
          h('div', { class: 'synced-row-sub' }, meta.authors || 'ID ' + id)),
        h('span', { class: 'synced-row-badge' }, '✓ Ready'));
    }

    const dates = SYNCED_CACHE.dates || {};
    const recents = P.recents || [];
    const recentTs = id => { const r = recents.find(x => String(x.id) === String(id)); return r ? (r.ts || 0) : 0; };
    const currentId = recents.length ? String(recents[0].id) : null;
    function ago(ms) {
      const m = Math.max(0, Math.round((Date.now() - ms) / 60000));
      if (m < 1) return 'just now';
      if (m < 60) return m + ' min ago';
      const hr = Math.round(m / 60); if (hr < 24) return hr + ' h ago';
      const d = Math.round(hr / 24); if (d < 30) return d + ' day' + (d === 1 ? '' : 's') + ' ago';
      return new Date(ms).toLocaleDateString();
    }
    const titleOf = id => (metaFor(id).title || 'Book ' + id).toLowerCase();
    const FILTERS = [
      ['recent',  'Recently synced', 'Newest sync first'],
      ['current', 'Current book',    'Books you have opened, latest first'],
      ['incomplete', 'Incomplete',   'Books with tracks still waiting for timing'],
      ['saved',   'Saved',           'Books on your shelf'],
      ['az',      'A–Z',             'By title']
    ];
    function sortedIds() {
      let arr = [...ids];
      if (syncedFilter === 'recent') arr.sort((a, b) => (dates[b] || 0) - (dates[a] || 0) || titleOf(a).localeCompare(titleOf(b)));
      else if (syncedFilter === 'current') arr = arr.filter(id => recentTs(id)).sort((a, b) => recentTs(b) - recentTs(a));
      else if (syncedFilter === 'incomplete') arr = arr.filter(id => { const pk = PKI.map.get(String(id)); return pk && pk[0] < pk[1]; }).sort((a, b) => titleOf(a).localeCompare(titleOf(b)));
      else if (syncedFilter === 'saved') { const fv = new Set(getFavs().map(f => String(f.id))); arr = arr.filter(id => fv.has(String(id))).sort((a, b) => titleOf(a).localeCompare(titleOf(b))); }
      else arr.sort((a, b) => titleOf(a).localeCompare(titleOf(b)));
      return arr;
    }
    function draw() {
      const bar = $('#synced-filters');
      if (bar) {
        bar.textContent = '';
        FILTERS.forEach(([k, label, tip]) => bar.append(h('button', { class: 'chip', type: 'button', title: tip,
          'aria-pressed': String(syncedFilter === k), onclick: () => { syncedFilter = k; draw(); } }, label)));
      }
      list.textContent = '';
      const arr = sortedIds();
      const f = FILTERS.find(x => x[0] === syncedFilter);
      if (!arr.length) {
        list.append(h('div', { class: 'synced-empty' }, h('div', { class: 'synced-empty-ic' }, '📚'),
          h('h2', {}, 'Nothing here yet'),
          h('p', {}, syncedFilter === 'current' ? 'Open a synced book and it will show up here.' : 'No synced books match this filter.')));
        return;
      }
      list.append(h('p', { class: 'synced-section-label' }, f[1] + ' (' + arr.length + ')'));
      const rowsHost = h('div', { class: 'synced-list' });
      list.append(rowsHost);
      vlist(rowsHost, arr, id => {
        const row = syncRow(id);
        const info = row.querySelector('.synced-row-info');
        if (dates[id] && info) info.append(h('div', { class: 'synced-row-sub2' }, 'Synced ' + ago(dates[id])));
        const pk = PKI.map.get(String(id)), bd0 = row.querySelector('.synced-row-badge');
        if (pk && pk[0] < pk[1] && bd0) { bd0.textContent = pk[0] + '/' + pk[1] + ' tracks'; bd0.classList.add('synced-row-badge-pending'); }
        if (String(id) === currentId) {
          const bd = row.querySelector('.synced-row-badge');
          if (bd) { bd.textContent = '▶ Current'; bd.classList.add('synced-row-badge-now'); }
        }
        return row;
      }, { min: 60, est: 76 });
    }
    draw();
  }

  guideDoc('account', 'Settings', "Theme, text size, audio and timing. See the Settings section of this guide.");
  guideDoc('account', 'How to use and keyboard shortcuts', "Short cards for the gestures and keys. Press ? anywhere on a computer.");
  guideDoc('account', 'Feature guide', "This page. It is built from the app itself, so it lists what the app can do today, and new features carry a New badge for 30 days.", '2026-10-10');
  guideDoc('keys', 'Keys', "Space plays or pauses. Left and Right arrows change sentence. Shift + arrows go back or forward 15 seconds. N and P change track. Esc closes a panel. ? shows the list.");
  /* Lazy: the Account markup lives in <template id="tpl-account"> and is built on first visit. */
  let acctReady = false;
  function ensureAccount() {
    if (acctReady) return;
    const t = document.getElementById('tpl-account'), m = $('#account');
    if (!t || !m) return;
    m.append(t.content.cloneNode(true)); t.remove(); acctReady = true;
    $('#acct-settings').addEventListener('click', () => openSettingsHome());
    $('#acct-guide').addEventListener('click', () => { initGuide(); openSheet('sheet-guide'); });
    $('#acct-howto').addEventListener('click', () => openSheet('sheet-howto'));
    $('#acct-keys').addEventListener('click', () => openSheet('sheet-keys'));
  }
  function renderAccount() {
    ensureAccount();
    renderAcctSync();
    guideBadge();
    $('#acct-favs').textContent = String(getFavs().length);
    $('#acct-recents').textContent = String(P.recents.length);
    renderStats();
    try { renderFollowing(); } catch (e) { /* authors list not ready */ }
    try { renderMyRatings(); } catch (e) { /* ratings not ready */ }
    const hist = $('#acct-history'), list = $('#acct-history-list');
    list.textContent = '';
    hist.hidden = !P.recents.length;
    const cards = P.recents.map(r => {
      const bar = h('div', { class: 'bar-progress' }, h('i', { style: 'width:' + Math.round((r.pct || 0) * 100) + '%' }));
      return bookCard({ id: r.id, title: r.title, authors: r.authors, cover: r.cover, ia: r.ia, n: 0, total: 0, lang: '' },
        () => { pendingBack = { tab: 'account', see: false }; showTab('library'); resumeRecent(r); }, bar);
    });
    list.append(...cards);
  }

  guideDoc('reading', 'Calm mode', "Settings > Reading > Calm mode removes streaks, daily goals, milestones, quiz scores, motion, vibration and the automatic next-book prompt, so listening stays pressure-free. Good for children.", '2026-10-10');
  guideDoc('account', 'Your listening', "Minutes listened, words heard, books finished, a streak and a daily goal, counted on this device only. A streak day is one minute or more.");
  /* ---------- Listening dashboard: minutes, words and finished books, kept on this device only ----------
     wt:stats = { v, days: { 'YYYY-MM-DD': { s: seconds listened, w: words heard } }, done: [finished books],
     goal: daily minutes, cleared: time of the last reset }. Seconds are real listening time (a seek or a
     stall does not count, and 1.5x speed counts the time you spent, not the audio covered). Words use the
     book's own words-per-second from its text when it is loaded, else 150 words a minute. */
  const ST_KEY = 'wt:stats', ST_ACTIVE = 60, ST_GOALS = [5, 10, 20, 30, 60];
  const stLoad = () => { const v = store.get(ST_KEY, null); return v && typeof v === 'object' && v.days ? Object.assign({ done: [], goal: 10, cleared: 0 }, v) : { v: 1, days: {}, done: [], goal: 10, cleared: 0 }; };
  let ST = stLoad(), stDirty = false, stLast = null, stLastSave = 0, stRate = { m: null, id: null, r: 2.5 };
  const dayKey = d => { d = d || new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  function stSave() {
    stLastSave = Date.now();
    if (!stDirty) return;
    stDirty = false;
    Object.keys(ST.days).forEach(k => { ST.days[k].s = Math.round(ST.days[k].s * 10) / 10; ST.days[k].w = Math.round(ST.days[k].w); });
    // keep about two years of days
    const keys = Object.keys(ST.days).sort(); if (keys.length > 800) keys.slice(0, keys.length - 800).forEach(k => delete ST.days[k]);
    store.set(ST_KEY, ST);
    const acc = $('#account'); if (acc && !acc.hidden && curTab === 'account') renderStats();
  }
  function stWps() { // words the narrator speaks per second in this book
    const m = S.model;
    if (!m || !S.book) return 2.5;
    if (stRate.m !== m || stRate.id !== S.book.id) {
      let w = 0; for (const x of m.sents) if (!x.h) w += (x.t.match(/\S+/g) || []).length;
      const d = S.durs.reduce((a, b) => a + (b || 0), 0);
      stRate = { m, id: S.book.id, r: d > 600 && w > 500 ? Math.min(4, Math.max(1.5, w / d)) : 2.5 };
    }
    return stRate.r;
  }
  function stSample() {
    const now = Date.now();
    if (!(S.book && !audio.paused && !audio.seeking && !S.loadingAudio && !audio.ended && audio.readyState > 2)) { stLast = null; return; }
    if (stLast && now - stLast.at < 1000) return;
    const last = stLast, cur = { t: audio.currentTime, at: now, sec: S.sec };
    stLast = cur;
    if (!last || last.sec !== cur.sec) return;
    const dt = (now - last.at) / 1000, ds = cur.t - last.t, rate = audio.playbackRate || 1;
    if (ds <= 0 || ds > dt * rate * 1.3 + 1) return; // a seek or a jump, not listening
    const k = dayKey(), d = ST.days[k] || (ST.days[k] = { s: 0, w: 0 });
    const before = d.s;
    d.s += ds / rate; d.w += ds * stWps();
    if (P.calm !== true && ST.goal > 0 && before < ST.goal * 60 && d.s >= ST.goal * 60) { buzz('goal'); toast('Daily goal reached. Nice work!', 4000); }
    stDirty = true;
    if (now - stLastSave > 15000) stSave();
  }
  function stFinish() {
    if (!S.book) return;
    stSample();
    const b = S.book, id = String(b.id);
    ST.done = [{ id, title: b.title, authors: b.authors || '', cover: b.cover || '', ts: Date.now() }, ...(ST.done || []).filter(x => x.id !== id)].slice(0, 500);
    stDirty = true; stSave();
    if (P.autoDel === true) setTimeout(() => autoDelFinished(id), 4000);
  }
  /* Settings > Audio > Auto-delete finished downloads: the saved audio of a book you just finished is removed. */
  async function autoDelFinished(id) {
    try {
      if (P.autoDel !== true) return;
      await dlReady;
      const m = dlMeta.get(String(id)); if (!m) return;
      if (DL.running && DL.id === String(id)) return;
      const size = dmSize(m);
      if (await dmDrop(id)) { paintCards(); paintDl(); }
    } catch (e) { /* keep the download */ }
  }
  audio.addEventListener('timeupdate', stSample);
  ['pause', 'seeking', 'waiting', 'emptied'].forEach(t => audio.addEventListener(t, () => { stLast = null; stSave(); }));
  document.addEventListener('visibilitychange', () => { if (document.hidden) stSave(); });
  window.addEventListener('pagehide', stSave);

  function stSummary() {
    const days = ST.days, act = k => !!(days[k] && days[k].s >= ST_ACTIVE);
    let secs = 0, words = 0;
    Object.keys(days).forEach(k => { secs += days[k].s; words += days[k].w; });
    let cur = 0; const d = new Date();
    if (!act(dayKey(d))) d.setDate(d.getDate() - 1); // today may still be ahead of you
    while (act(dayKey(d))) { cur++; d.setDate(d.getDate() - 1); }
    let best = 0, run = 0, prev = null;
    Object.keys(days).filter(act).sort().forEach(k => {
      const [y, m, dd] = k.split('-').map(Number), t = Date.UTC(y, m - 1, dd) / 864e5;
      run = prev !== null && t - prev === 1 ? run + 1 : 1; prev = t; if (run > best) best = run;
    });
    const week = [];
    for (let i = 6; i >= 0; i--) { const x = new Date(); x.setDate(x.getDate() - i); const k = dayKey(x); week.push({ k, s: days[k] ? days[k].s : 0, label: x.toLocaleDateString(undefined, { weekday: 'narrow' }), long: x.toLocaleDateString(undefined, { weekday: 'long' }), today: i === 0 }); }
    const fin = new Map((ST.done || []).map(x => [x.id, x]));
    [...P.recents, ...(store.get('wt:listens', []) || [])].forEach(r => { // books finished before the dashboard existed
      if ((r.pct || 0) >= 0.995 && (r.ts || 0) > (ST.cleared || 0) && !fin.has(String(r.id))) fin.set(String(r.id), { id: String(r.id), title: r.title, authors: r.authors || '', cover: r.cover || '', ts: r.ts || 0 });
    });
    const done = [...fin.values()].sort((a, b) => (b.ts || 0) - (a.ts || 0));
    const today = days[dayKey()] ? days[dayKey()].s : 0;
    return { secs, words, cur, best, week, done, today, todayActive: act(dayKey()) };
  }
  const stNum = n => n >= 10000 ? new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(n) : Math.round(n).toLocaleString();
  const FLAME = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.43-2.29 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>';
  guideDoc('account', 'Reading analytics', "Words per minute, words saved and learned each week, and an estimated CEFR level over time. The level is a rough guide, not a test result.", '2026-10-03');
  /* ---------- Reading analytics: words per minute, words acquired each week, estimated CEFR timeline ---------- */
  const AN_DAY = 864e5;
  function anWpm() {
    const days = ST.days, per = ks => { let sec = 0, wd = 0; ks.forEach(k => { sec += days[k].s; wd += days[k].w; }); return sec >= 120 ? Math.round(wd / (sec / 60)) : null; };
    const trend = [], wk = [];
    for (let i = 13; i >= 0; i--) { const x = new Date(); x.setDate(x.getDate() - i); const k = dayKey(x); trend.push(days[k] ? per([k]) : null); if (i < 7 && days[k]) wk.push(k); }
    return { today: days[dayKey()] ? per([dayKey()]) : null, week: per(wk), all: per(Object.keys(days)), trend };
  }
  function anWeeks() {
    const ws = myWords(), end = Date.now(), out = [];
    const accAt = w => w.acq || (w.iv >= 14 ? (w.ts || 0) : 0);
    for (let i = 7; i >= 0; i--) {
      const to = end - i * 7 * AN_DAY, from = to - 7 * AN_DAY;
      out.push({ from, saved: ws.filter(w => w.ts >= from && w.ts < to).length, learned: ws.filter(w => { const t = accAt(w); return t >= from && t < to; }).length });
    }
    return { weeks: out, total: ws.filter(w => accAt(w)).length, saved: ws.length };
  }
  function anCefr() {
    if (!LVL.ready) return null;
    const fin = stSummary().done.filter(b => b.ts).sort((a, b) => a.ts - b.ts).map(b => ({ ts: b.ts, sc: nxScore(b.id), t: b.title })).filter(x => x.sc != null);
    return fin.map((x, i) => { const top = fin.slice(Math.max(0, i - 4), i + 1).map(y => y.sc).sort((a, b) => b - a).slice(0, 2); return { ts: x.ts, t: x.t, v: top.reduce((a, b) => a + b, 0) / top.length }; });
  }
  let anTried = false;
  function anBoxes() {
    const box = (title, note, ...kids) => h('div', { class: 'ls-box' }, h('h3', {}, title), ...kids, note ? h('p', { class: 'an-note' }, note) : null);
    const tile = (v, l) => h('div', { class: 'ls-tile' }, h('strong', {}, v == null ? '\u2013' : String(v)), h('span', {}, l));
    // words per minute
    const wp = anWpm(), nums = wp.trend.filter(x => x != null);
    const sp = h('div', { class: 'an-sp', role: 'img', 'aria-label': 'Words per minute, last 14 days' });
    if (nums.length > 1) {
      const lo = Math.min(...nums), hi = Math.max(...nums), rng = Math.max(10, hi - lo);
      const pts = wp.trend.map((v, i) => v == null ? null : [(i / 13 * 296 + 2).toFixed(1), (52 - (v - lo) / rng * 44 + 2).toFixed(1)]).filter(Boolean);
      sp.innerHTML = '<svg viewBox="0 0 300 56" preserveAspectRatio="none" aria-hidden="true"><polyline fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" points="' + pts.map(p => p.join(',')).join(' ') + '"/>' + pts.map(p => '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="3" fill="var(--accent)"/>').join('') + '</svg>';
    } else sp.append(h('small', {}, 'Listen for two minutes on a few days to see your trend.'));
    const wpmBox = box('Words per minute', 'Words heard for each minute you listened. Faster playback raises it. Days under 2 minutes are skipped.',
      h('div', { class: 'ls-tiles' }, tile(wp.today, 'today'), tile(wp.week, 'last 7 days'), tile(wp.all, 'all time')), sp);
    // acquired words
    const aw = anWeeks(), mx = Math.max(3, ...aw.weeks.map(x => Math.max(x.saved, x.learned)));
    const cols = aw.weeks.map((x, i) => h('div', { class: 'an-col', title: x.learned + ' learned, ' + x.saved + ' saved' },
      h('div', { class: 'an-pair' }, h('i', { class: 'sv', style: 'height:' + Math.max(3, x.saved / mx * 100) + '%' }), h('i', { class: 'lr', style: 'height:' + Math.max(3, x.learned / mx * 100) + '%' })),
      h('small', {}, i === 7 ? 'now' : new Date(x.from).toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' }))));
    const cur = aw.weeks[7];
    const wordsBox = box('Words acquired each week', 'Saved = added to My words. Learned = you remembered it after a gap of two weeks or more in review.',
      h('div', { class: 'ls-tiles' }, tile(cur.learned, 'learned this week'), tile(cur.saved, 'saved this week'), tile(aw.total, 'learned in all')),
      h('div', { class: 'an-bars', role: 'img', 'aria-label': 'Words saved and learned, last 8 weeks' }, cols),
      h('div', { class: 'an-key' }, h('span', {}, h('i', { class: 'sv' }), 'Saved'), h('span', {}, h('i', { class: 'lr' }), 'Learned')));
    // CEFR timeline
    if (!LVL.ready && !anTried) { anTried = true; LVL.load().then(() => { if (curTab === 'account') renderStats(); }).catch(() => {}); }
    const pts = anCefr(), cefrKids = [];
    if (!pts) cefrKids.push(h('p', { class: 'an-note' }, 'Loading book levels\u2026'));
    else if (!pts.length) cefrKids.push(h('p', { class: 'an-note' }, 'Finish a book that has a level and your estimate will start here.'));
    else {
      const n = LVL.cefr.length, last = pts[pts.length - 1], code = i => (LVL.cefr[Math.max(0, Math.min(n - 1, Math.round(i)))] || [''])[0];
      const t0 = pts[0].ts, t1 = Math.max(last.ts, t0 + 1), W = 300, H = 110;
      const X = (p, i) => pts.length === 1 ? W / 2 : (t1 - t0 > 3 * AN_DAY ? (p.ts - t0) / (t1 - t0) : i / (pts.length - 1)) * (W - 50) + 38;
      const Y = v => H - 16 - v / Math.max(1, n - 1) * (H - 32);
      const line = pts.map((p, i) => X(p, i).toFixed(1) + ',' + Y(p.v).toFixed(1)).join(' ');
      const svg = h('div', { class: 'an-cefr', role: 'img', 'aria-label': 'Estimated CEFR level over time, now about ' + code(last.v) });
      svg.innerHTML = '<svg viewBox="0 0 ' + W + ' ' + H + '" aria-hidden="true">' +
        '<text x="0" y="' + (Y(n - 1) + 4) + '" class="an-ax">' + code(n - 1) + '</text><text x="0" y="' + (Y(0) + 4) + '" class="an-ax">' + code(0) + '</text>' +
        '<line x1="32" x2="' + W + '" y1="' + Y(n - 1) + '" y2="' + Y(n - 1) + '" class="an-gl"/><line x1="32" x2="' + W + '" y1="' + Y(0) + '" y2="' + Y(0) + '" class="an-gl"/>' +
        (pts.length > 1 ? '<polyline fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linejoin="round" points="' + line + '"/>' : '') +
        pts.map((p, i) => '<circle cx="' + X(p, i).toFixed(1) + '" cy="' + Y(p.v).toFixed(1) + '" r="' + (i === pts.length - 1 ? 5 : 3.2) + '" fill="var(--accent)"/>').join('') + '</svg>';
      const d0 = new Date(t0).toLocaleDateString(undefined, { month: 'short', year: '2-digit' }), d1 = new Date(last.ts).toLocaleDateString(undefined, { month: 'short', year: '2-digit' });
      cefrKids.push(h('div', { class: 'an-now' }, h('strong', {}, 'About ' + code(last.v)), h('span', {}, pts.length + (pts.length === 1 ? ' book' : ' books') + ' finished')), svg, h('div', { class: 'an-dates' }, h('small', {}, d0), h('small', {}, d1)));
    }
    const cefrBox = box('Estimated CEFR level', 'A rough guide: the average of the two hardest of your last five finished books. It is not a test result.', ...cefrKids);
    return [wpmBox, wordsBox, cefrBox];
  }
  function renderStats() {
    const box = $('#ls'); if (!box) return;
    if (stDirty) stSave(); else ST = stLoad();
    const m = stSummary(), goalS = ST.goal * 60, pct = Math.min(1, m.today / goalS), R = 42, C = 2 * Math.PI * R;
    const ring = h('div', { class: 'ls-ring', role: 'img', 'aria-label': Math.floor(m.today / 60) + ' of ' + ST.goal + ' minutes today' });
    ring.innerHTML = '<svg viewBox="0 0 100 100" aria-hidden="true"><circle class="bg" cx="50" cy="50" r="' + R + '"/><circle class="fg" cx="50" cy="50" r="' + R + '" stroke-dasharray="' + C.toFixed(1) + '" stroke-dashoffset="' + (C * (1 - pct)).toFixed(1) + '"/></svg>';
    ring.append(h('div', { class: 'ls-ring-t' }, h('strong', {}, String(Math.floor(m.today / 60))), h('small', {}, 'of ' + ST.goal + ' min')));
    const streakNote = m.cur === 0 ? 'Listen for a minute to start one.' : m.todayActive ? (m.today >= goalS ? 'Goal reached today. Nice.' : 'Today is counted. ' + Math.max(1, Math.ceil((goalS - m.today) / 60)) + ' min to your goal.') : 'Listen today to keep it going.';
    const streak = h('div', { class: 'ls-streak' + (m.cur ? ' on' : '') }, h('div', { class: 'ls-streak-n' }, h('span', { 'aria-hidden': 'true', class: 'ls-flame' }), m.cur + '-day streak'), h('p', {}, streakNote), h('p', {}, 'Best: ' + plural(m.best, 'day')));
    streak.querySelector('.ls-flame').innerHTML = FLAME;
    const hrs = m.secs >= 3600;
    const tile = (v, l) => h('div', { class: 'ls-tile' }, h('strong', {}, v), h('span', {}, l));
    const tiles = h('div', { class: 'ls-tiles' },
      tile(hrs ? (m.secs / 3600).toFixed(m.secs >= 36000 ? 0 : 1) : String(Math.floor(m.secs / 60)), hrs ? 'hours listened' : 'minutes listened'),
      tile(stNum(m.words), 'words heard'),
      tile(String(m.done.length), m.done.length === 1 ? 'book finished' : 'books finished'));
    const max = Math.max(goalS, ...m.week.map(x => x.s)), wk = m.week.reduce((a, x) => a + x.s, 0);
    const bars = h('div', { class: 'ls-bars', role: 'img', 'aria-label': 'Minutes listened, last 7 days: ' + m.week.map(x => x.long + ' ' + Math.round(x.s / 60)).join(', ') },
      m.week.map(x => h('div', { class: 'ls-col' + (x.s >= ST_ACTIVE ? ' some' : '') + (x.s >= goalS ? ' hit' : '') + (x.today ? ' today' : ''), title: x.long + ': ' + Math.round(x.s / 60) + ' min' },
        h('div', { class: 'ls-wrap' }, h('div', { class: 'ls-bar', style: 'height:' + (x.s > 0 ? Math.max(4, Math.round(x.s / max * 100)) : 4) + '%' })), h('small', {}, x.label))));
    const week = h('div', { class: 'ls-week' }, h('div', { class: 'ls-week-h' }, h('span', {}, 'Last 7 days'), h('strong', {}, fmtLong(wk))), bars);
    const badges = [[m.best >= 3, '3-day streak'], [m.best >= 7, '7-day streak'], [m.best >= 30, '30-day streak'], [m.words >= 10000, '10k words'], [m.words >= 100000, '100k words'], [m.words >= 1000000, '1M words'], [m.done.length >= 1, 'First book'], [m.done.length >= 5, '5 books'], [m.done.length >= 10, '10 books']];
    const goals = h('div', { class: 'ls-box' }, h('h3', {}, 'Daily goal'), h('div', { class: 'ls-chips' }, ST_GOALS.map(g => h('button', { class: 'ls-chip', type: 'button', 'aria-pressed': String(g === ST.goal), onclick: () => { ST.goal = g; stDirty = true; stSave(); renderStats(); } }, g + ' min'))));
    const marks = h('div', { class: 'ls-box' }, h('h3', {}, 'Milestones'), h('div', { class: 'ls-chips' }, badges.map(b => h('span', { class: 'ls-chip' + (b[0] ? ' on' : '') }, (b[0] ? '\u2713 ' : '') + b[1]))));
    if (P.calm === true) {
      const ck = [h('h2', { id: 'ls-h' }, 'Your listening'), h('p', { class: 'ls-sub' }, 'Just for you. No goals, no streaks. Counted on this device only.'), tiles, wrBox()];
      if (m.done.length) ck.push(h('div', { class: 'ls-box' }, h('h3', {}, 'Books you finished'), h('div', { class: 'ls-done' }, m.done.slice(0, 5).map(b => h('div', {}, h('b', {}, b.title || 'Untitled'), h('span', {}, b.ts ? new Date(b.ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : ''))))));
      ck.push(h('div', { class: 'ls-foot' }, h('span', {}, ''), h('button', { type: 'button', onclick: () => { if (confirm('Clear your listening stats on this device? Your books and positions are kept.')) { ST = { v: 1, days: {}, done: [], goal: ST.goal, cleared: Date.now() }; stDirty = true; stSave(); renderStats(); } } }, 'Clear stats')));
      box.textContent = ''; box.append(...ck); return;
    }
    const kids = [h('h2', { id: 'ls-h' }, 'Your listening'), h('p', { class: 'ls-sub' }, 'Counted on this device only.'), h('div', { class: 'ls-hero' }, ring, streak), tiles, week, wrBox(), ...anBoxes(), goals, marks];
    if (m.done.length) kids.push(h('div', { class: 'ls-box' }, h('h3', {}, 'Recently finished'), h('div', { class: 'ls-done' }, m.done.slice(0, 5).map(b => h('div', {}, h('b', {}, b.title || 'Untitled'), h('span', {}, b.ts ? new Date(b.ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : ''))))));
    kids.push(h('div', { class: 'ls-foot' }, h('span', {}, 'A streak day is 1 minute or more.'), h('button', { type: 'button', onclick: () => { if (confirm('Clear your listening stats on this device? Your books and positions are kept.')) { ST = { v: 1, days: {}, done: [], goal: ST.goal, cleared: Date.now() }; stDirty = true; stSave(); renderStats(); } } }, 'Clear stats')));
    box.textContent = ''; box.append(...kids);
  }

  guideDoc('home', 'Search inside books', "In the Filters panel, Search inside books finds a word or an exact quote in the text of books saved on this device, and works offline. Tap a result to listen from that sentence.");
  /* ---------- Offline search inside books ----------
     Searches the sentences of every book whose text is saved on this device (the parsed copies in IndexedDB,
     p:<version>:g:<gutenberg id>), so it works with no network and no server. Nothing is uploaded.
     Plain words must all appear in the same sentence; "quoted words" must appear together in that order; the last
     plain word also matches as a start (so results appear while typing). Accents and capitals are ignored.
     Tapping a result opens the book and jumps the audio to that sentence, using the sentence timing the app
     already has for the book (precise word-pack sync when it was loaded, the estimate otherwise). */
  const FD = { books: new Map(), building: null, seq: 0, shown: new Map(), timer: 0 };
  const fdNorm = Core.fdNorm, fdParse = Core.fdParse;   // the matching itself lives in Core (010) so the background worker can run it

  async function fdCollect() { // every book with a saved text, newest listening first
    const meta = new Map();
    const put = r => { if (r && r.id != null && r.title) { const k = String(r.id), o = meta.get(k) || {}; meta.set(k, { id: k, title: o.title || r.title, authors: o.authors || r.authors || '', cover: o.cover || r.cover || '', ia: o.ia || r.ia || '', ts: Math.max(o.ts || 0, r.ts || 0) }); } };
    P.recents.forEach(put); (store.get('wt:listens', []) || []).forEach(put); getFavs().forEach(put); (ST.done || []).forEach(put); if (S.book) put(S.book);
    const ids = [];
    try { Object.keys(localStorage).forEach(k => { if (k.indexOf('wt:book:') === 0) ids.push(k.slice(8)); }); } catch (e) { /* storage unavailable */ }
    const out = [];
    for (const id of ids) {
      const st = (store.get('wt:book:' + id, null) || {}).text;
      if (!st) continue;
      let key = null;
      if (st.kind === 'gutenberg' && st.id) key = parsedKey(st);
      else if (st.kind === 'file') { const raw = await idb.get('f:' + id); key = raw ? parsedKey(st, raw) : null; }
      if (!key) continue;
      let m = meta.get(id);
      if (!m || !m.authors) { const b = await idb.get('b:' + id); if (b && b.title) { put(b); m = meta.get(id); } }
      if (!m) continue;
      out.push({ key, m });
    }
    out.sort((a, b) => (b.m.ts || 0) - (a.m.ts || 0));
    return out;
  }
  async function fdBuild(onStep) {
    if (FD.building) return FD.building;
    FD.building = (async () => {
      let list = []; try { list = await fdCollect(); } catch (e) { /* saved books cannot be listed here: the open book is still searched below */ }
      const seen = new Set(), keep = new Map();
      for (const { key, m } of list) {
        if (seen.has(key)) continue; // two recordings of one text: search it once
        seen.add(key);
        let bk = FD.books.get(key);
        if (!bk) {
          const c = await readParsed(key);
          if (!c) continue;
          const T = new Array(c.sents.length), CH = new Int32Array(c.sents.length), HD = new Uint8Array(c.sents.length);
          for (let i = 0; i < c.sents.length; i++) { const x = c.sents[i]; T[i] = x.t; CH[i] = x.ch; HD[i] = x.h ? 1 : 0; }
          bk = { key, T, CH, HD, chapters: c.chapters.map(x => x.title || '') };
          await BG.call('fdLoad', [key, T, HD]);   // the normalised copy is made and kept in the worker
          if (onStep) onStep(keep.size + 1);
          await new Promise(r => setTimeout(r, 0));
        }
        bk.m = m; keep.set(key, bk);
      }
      if (S.book && S.model && S.model.sents && S.model.sents.length && ![...keep.values()].some(b => String(b.m.id) === String(S.book.id))) {
        // The open book is searched straight from memory, so search works even when its text was never saved
        // to this device (or the page cannot use browser storage, for example when opened from a file).
        const key = 'open:' + S.book.id;
        let bk = FD.books.get(key);
        if (!bk || bk.src !== S.model) {
          const sn = S.model.sents, n = sn.length, T = new Array(n), CH = new Int32Array(n), HD = new Uint8Array(n);
          for (let i = 0; i < n; i++) { const x = sn[i]; T[i] = x.t; CH[i] = x.ch || 0; HD[i] = x.h ? 1 : 0; }
          bk = { key, src: S.model, T, CH, HD, chapters: (S.model.chapters || []).map(x => x.title || '') };
          await BG.call('fdLoad', [key, T, HD]);
        }
        bk.m = { id: String(S.book.id), title: S.book.title || 'Open book', authors: S.book.authors || '', cover: S.book.cover || '', ia: S.book.ia || '' };
        keep.set(key, bk);
      }
      FD.books = keep;
      BG.call('fdKeep', [[...keep.keys()]]).catch(() => {});   // the worker forgets books that are no longer searched
    })();
    try { await FD.building; } finally { FD.building = null; }
  }
  function fdMarks(parts, n) {
    const r = [];
    parts.forEach(p => { p.rx.lastIndex = 0; let m; while ((m = p.rx.exec(n))) { const a = m.index + m[1].length; r.push([a, a + m[2].length]); if (m.index === p.rx.lastIndex) p.rx.lastIndex++; } });
    r.sort((a, b) => a[0] - b[0]);
    const out = [];
    for (const x of r) { const l = out[out.length - 1]; if (l && x[0] <= l[1]) l[1] = Math.max(l[1], x[1]); else out.push(x.slice()); }
    return out;
  }
  function fdSnippet(text, marks) {
    let from = 0, to = text.length, pre = '', post = '';
    if (text.length > 260 && marks.length) {
      from = Math.max(0, marks[0][0] - 90); to = Math.min(text.length, from + 260);
      const sp = text.indexOf(' ', from); if (from > 0 && sp > -1 && sp < marks[0][0]) from = sp + 1;
      if (from > 0) pre = '\u2026'; if (to < text.length) post = '\u2026';
    }
    const kids = [pre]; let at = from;
    for (const [a, z] of marks) { if (z <= from || a >= to) continue; const x = Math.max(a, from), y = Math.min(z, to); if (x > at) kids.push(text.slice(at, x)); kids.push(h('mark', {}, text.slice(x, y))); at = y; }
    if (at < to) kids.push(text.slice(at, to));
    kids.push(post);
    return kids;
  }
  function fdAuthors() {
    const m = new Map();
    FD.books.forEach(b => { const a = (b.m.authors || 'Unknown author').trim() || 'Unknown author'; m.set(a, (m.get(a) || 0) + 1); });
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }
  function fdFillAuthors() {
    const sel = $('#fd-author'), cur = sel.value;
    sel.textContent = '';
    sel.append(h('option', { value: '' }, 'All authors (' + plural(FD.books.size, 'book') + ')'));
    fdAuthors().forEach(([a, n]) => sel.append(h('option', { value: a }, a + ' (' + n + ')')));
    if (S.book && FD.books.size) sel.append(h('option', { value: '\u0001cur' }, 'Only the book that is open'));
    if ([...sel.options].some(o => o.value === cur)) sel.value = cur;
  }
  async function fdRun() {
    const q = $('#fd-q').value.trim(), out = $('#fd-out'), note = $('#fd-note'), my = ++FD.seq;
    $('#fd-clear').hidden = !q;
    out.textContent = '';
    if (!FD.books.size) { note.textContent = ''; out.append(h('p', { class: 'fd-empty' }, 'Nothing to search yet. Open a book once with its text and it is saved here for offline search.')); return; }
    const parts = fdParse(q);
    if (!parts.length || fdNorm(q).replace(/\s/g, '').length < 2) { note.textContent = 'Searches the text of ' + plural(FD.books.size, 'book') + ' saved on this device. Nothing leaves your phone.'; return; }
    const au = $('#fd-author').value, curKey = S.book ? String(S.book.id) : '';
    const books = [...FD.books.values()].filter(b => !au || (au === '\u0001cur' ? String(b.m.id) === curKey : ((b.m.authors || 'Unknown author').trim() || 'Unknown author') === au));
    const keys = books.map(b => b.key);
    let res = await BG.call('fdFind', [keys, q, 400]);   // the matching runs in the background worker; the screen stays free
    if (my !== FD.seq) return; // a newer search replaced this one
    if (res.miss.length) {   // the worker was restarted since the books were loaded: send them again, then ask once more
      for (const k of res.miss) { const b = FD.books.get(k); if (b) await BG.call('fdLoad', [k, b.T, b.HD]); if (my !== FD.seq) return; }
      res = await BG.call('fdFind', [keys, q, 400]);
      if (my !== FD.seq) return;
    }
    const byKey = new Map(res.found), groups = []; let total = 0;
    for (const b of books) { const hits = byKey.get(b.key); if (hits) { groups.push({ b, hits }); total += hits.length; } }
    if (!groups.length) { note.textContent = ''; out.append(h('p', { class: 'fd-empty' }, 'No sentence has all of that in ' + plural(books.length, 'book') + '. Try fewer words, or put exact wording in quotes.')); return; }
    groups.sort((a, b) => b.hits.length - a.hits.length);
    note.textContent = plural(total, 'sentence') + (total >= 400 ? '+' : '') + ' in ' + plural(groups.length, 'book') + '. Tap one to listen from there.';
    groups.slice(0, 40).forEach(g => out.append(fdGroup(g, parts)));
    if (groups.length > 40) out.append(h('p', { class: 'fd-note' }, 'Showing the 40 books with the most matches. Pick an author to narrow it.'));
  }
  function fdGroup(g, parts) {
    const b = g.b, box = h('div', { class: 'fd-group' }), list = h('div', {});
    box.append(h('div', { class: 'fd-head' }, h('strong', {}, b.m.title), h('small', {}, plural(g.hits.length, 'match') .replace('matchs', 'matches'))));
    if (b.m.authors) box.append(h('p', { class: 'fd-by' }, b.m.authors));
    const one = i => {
      const marks = fdMarks(parts, fdNorm(b.T[i]));
      const ch = b.chapters[b.CH[i]];
      return h('button', { class: 'fd-hit', type: 'button', onclick: () => fdOpen(b, i) }, h('span', {}, fdSnippet(b.T[i], marks)), ch && !/^front matter$/i.test(ch) ? h('small', {}, ch) : null);
    };
    const first = g.hits.slice(0, 3);
    first.forEach(i => list.append(one(i)));
    box.append(list);
    if (g.hits.length > 3) {
      const more = h('button', { class: 'fd-more', type: 'button' }, 'Show ' + (Math.min(g.hits.length, 60) - 3) + ' more');
      more.addEventListener('click', () => { g.hits.slice(3, 60).forEach(i => list.append(one(i))); more.remove(); });
      box.append(more);
    }
    return box;
  }
  /* Open the book and, once its sentences are placed on the tracks, jump the audio to the matched sentence. */
  let fdJump = null;
  function fdFinishJump(job) {
    const sec = S.sentSec[job.sid], q = S.plan[sec];
    if (sec < 0 || !q) { toast('Opened the book. That passage is not placed on a track yet.', 4500); return; }
    const t = sentTime(q, S.sentPos[job.sid]);
    if (sec === S.sec) seekAudio(t); else goTrack(sec, t, false);
    setCurrent(job.sid, true);
    toast('Jumped to your match. Tap play to listen.', 3500);
  }
  function fdOpen(b, sid) {
    closeSheets();
    const job = fdJump = { id: String(b.m.id), sid, t0: Date.now() };
    const ready = () => S.book && String(S.book.id) === job.id && S.model && S.sentSec && S.sentSec.length > job.sid && !S.loadingAudio;
    if (!ready()) resumeRecent({ id: b.m.id, title: b.m.title, authors: b.m.authors, cover: b.m.cover, ia: b.m.ia });
    else showView('player');
    const poll = () => {
      if (fdJump !== job) return;
      if (ready() && el.player && !el.player.hidden) { fdJump = null; fdFinishJump(job); return; }
      if (Date.now() - job.t0 > 45000) { fdJump = null; return; }
      setTimeout(poll, 300);
    };
    poll();
  }
  async function fdOpenSheet(onlyCur) {   // onlyCur === true: opened from the player, so it starts on the open book
    const q0 = onlyCur !== true && el.q && el.q.value ? el.q.value.trim() : '';
    openSheet('sheet-find');
    const inp = $('#fd-q'), note = $('#fd-note');
    if (q0 && !inp.value) inp.value = q0;
    note.textContent = FD.books.size ? '' : 'Getting your saved books ready\u2026';
    await fdBuild(n => { note.textContent = 'Getting your saved books ready\u2026 ' + n; });
    if ($('#sheet-find').hidden) return;
    fdFillAuthors();
    if (onlyCur === true) { const sel = $('#fd-author'); if ([...sel.options].some(o => o.value === '\u0001cur')) sel.value = '\u0001cur'; }
    fdRun();
    inp.focus();
  }
  function fdInit() {
    const f = $('#f-find'); if (!f) return;
    f.addEventListener('click', fdOpenSheet);
    $('#fd-q').addEventListener('input', () => { clearTimeout(FD.timer); FD.timer = setTimeout(fdRun, 220); });
    $('#fd-q').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); clearTimeout(FD.timer); fdRun(); } });
    $('#fd-author').addEventListener('change', fdRun);
    $('#fd-clear').addEventListener('click', () => { $('#fd-q').value = ''; $('#fd-q').focus(); fdRun(); });
  }
  guideDoc('reading', 'Line focus', "Dims everything except the sentence or paragraph being read (Settings > Reading).");
  guideDoc('settings', 'Reading', "Theme (Auto, Light, Dark, Sepia, High contrast), text size, line spacing, reading font (including Lexend, Atkinson and OpenDyslexic), highlight style and colour, dialogue style and cover style.");
  /* Reading fonts: loaded only when picked, so they cost nothing for everyone else. */
  const READ_FONTS = {
    lexend: { stack: "'Lexend', 'Noto Sans Bengali', 'Segoe UI', system-ui, sans-serif", css: 'https://fonts.googleapis.com/css2?family=Lexend:wght@400;500;600&display=swap' },
    atkinson: { stack: "'Atkinson Hyperlegible', 'Noto Sans Bengali', 'Segoe UI', system-ui, sans-serif", css: 'https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:ital,wght@0,400;0,700;1,400&display=swap' },
    opendyslexic: { stack: "'OpenDyslexic', 'Noto Sans Bengali', 'Comic Sans MS', 'Segoe UI', system-ui, sans-serif", css: 'https://cdn.jsdelivr.net/npm/@fontsource/opendyslexic@5/400.css' }
  };
  const HL_COLORS = { yellow: '#FFD84D', green: '#5FCB8B', blue: '#5DB3FF', pink: '#FF8DB5', orange: '#FFA040' };
  const fontLoaded = new Set();
  function loadReadFont(k) {
    const f = READ_FONTS[k];
    if (!f || fontLoaded.has(k)) return;
    fontLoaded.add(k);
    document.head.append(h('link', { rel: 'stylesheet', href: f.css }));
  }
  guideDoc('settings', 'Lighter graphics', "On an older phone, or when reduced motion is on, blur and soft shadows are removed so scrolling stays smooth.");
  function liteWeak() {
    const n = navigator;
    return !!(reduceMotion || (n.deviceMemory && n.deviceMemory <= 2) || (n.hardwareConcurrency && n.hardwareConcurrency <= 4));
  }
  function applyLite() {
    const on = P.liteForce === true || (P.liteGfx !== false && liteWeak());
    document.documentElement.toggleAttribute('data-lite', on);
  }
  function applyQuick() {   // the Controls sheet is the only player menu, so the old bottom chips (Text only, More) stay hidden
    document.documentElement.setAttribute('data-quick', '');
  }
  function applyTidy() { document.documentElement.toggleAttribute('data-tidy', P.tidyPlayer !== false); }
  function applyTheme() {
    const r = document.documentElement;
    if (P.theme === 'auto') r.removeAttribute('data-theme'); else r.setAttribute('data-theme', P.theme);
    r.toggleAttribute('data-calm', P.calm === true);
    r.style.setProperty('--read-size', P.size.toFixed(2) + 'rem');
    if (P.lh) r.style.setProperty('--read-lh', String(P.lh)); else r.style.removeProperty('--read-lh');
    const rf = READ_FONTS[P.rfont];
    if (rf) { loadReadFont(P.rfont); r.style.setProperty('--font-text', rf.stack); } else r.style.removeProperty('--font-text');
    const fs = $('#in-font'); if (fs) fs.value = rf ? P.rfont : '';
    const hc = HL_COLORS[P.hlColor];
    if (hc) { r.setAttribute('data-hlc', P.hlColor); r.style.setProperty('--hl-solid', hc); r.style.setProperty('--hl-soft', 'color-mix(in srgb, ' + hc + ' 40%, transparent)'); r.style.setProperty('--hl-line', hc); }
    else { r.removeAttribute('data-hlc'); ['--hl-solid', '--hl-soft', '--hl-line'].forEach(k => r.style.removeProperty(k)); }
    if (P.hlStyle === 'underline') r.setAttribute('data-hl', 'underline'); else r.removeAttribute('data-hl');
    { const on = P.lineFocus === true, sc = P.lfScope === 'paragraph' ? 'paragraph' : 'sentence';
      if (on) r.setAttribute('data-lf', sc); else r.removeAttribute('data-lf');
      const c = $('#in-lf'); if (c) c.checked = on;
      const g = $('#lf-scope'); if (g) g.hidden = !on;
      $$('#seg-lf button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === sc))); }
    $$('#seg-hl button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === (P.hlStyle === 'underline' ? 'underline' : 'fill'))));
    $$('#hl-colors button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.c === (hc ? P.hlColor : ''))));
    const wh = $('#in-wordhl'); if (wh) wh.checked = P.wordHl !== false;
    { const cp = $('#in-clpro'); if (cp) cp.checked = P.clPro === true; const ch = $('#clpro-help'); if (ch) ch.textContent = P.clPro === true ? 'On: whole-track strip, tap to place a playhead, Start here / End here, and zoom.' : 'Off: simple trim handles only.'; }
    { const v = $('#ws-val'); if (v) { const x = P.wordShift || 0; v.textContent = (x > 0 ? '+' : x < 0 ? '\u2212' : '') + Math.abs(x).toFixed(1) + ' s'; } const r = $('#row-wordshift'); if (r) r.style.opacity = P.wordHl === false ? '.5' : ''; }
    const we = $('#in-wordest'); if (we) { we.checked = P.wordEst !== false; we.disabled = P.wordHl === false; }
    const wr = $('#row-wordest'); if (wr) wr.style.opacity = P.wordHl === false ? '.5' : '';
    const wp = $('#wordhl-help'); if (wp) wp.textContent = P.wordHl === false ? 'Off: only the whole sentence is highlighted.' : 'On: the word being spoken is highlighted.';
    if (ACC.cur) paintAccent(); // the theme changed: recompute the book colour for it
    $$('#seg-theme button, #aa-themes button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === P.theme)));
  }

