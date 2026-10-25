  /* ---------- Backup and restore ----------
     One .json file holds what cannot be fetched again: favourites, saved words, listening stats and history,
     bookmarks, positions, preferences, and each book's sync state and uploaded text (IndexedDB 's:' and 'f:').
     Caches and downloaded audio are left out. Restoring writes the file's items over the
     matching ones on this device, then reloads; saving is paused meanwhile so the old in-memory state cannot
     overwrite what was just restored. */
  const BK_KEYS = ['wt:favs', 'wt:stats', 'wt:words', 'wt:listens', 'wt:prefs', 'wt:finlv', 'wt:recent-q', 'wt:myrt', 'wt:follows'];
  const BK_PREFIX = ['wt:book:', 'wt:bm:', 'wt:clips:', 'wt:lp:', 'wt:lev:'];
  const BK_IDB = /^(s|f):/;
  const bkWanted = k => BK_KEYS.indexOf(k) >= 0 || BK_PREFIX.some(p => k.indexOf(p) === 0);
  function bkIdbAll() {
    return new Promise(res => {
      try {
        const r = indexedDB.open('wordtrail', 1);
        r.onupgradeneeded = () => r.result.createObjectStore('texts');
        r.onerror = () => res({});
        r.onsuccess = () => {
          const out = {};
          try {
            const q = r.result.transaction('texts').objectStore('texts').openCursor();
            q.onsuccess = () => { const c = q.result; if (c) { if (BK_IDB.test(String(c.key))) out[c.key] = c.value; c.continue(); } else { r.result.close(); res(out); } };
            q.onerror = () => { r.result.close(); res(out); };
          } catch (e) { res(out); }
        };
      } catch (e) { res({}); }
    });
  }
  function bkIdbPut(obj) {
    const keys = Object.keys(obj).filter(k => BK_IDB.test(k));
    if (!keys.length) return Promise.resolve(true);
    return new Promise((res, rej) => {
      const r = indexedDB.open('wordtrail', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('texts');
      r.onerror = () => rej(r.error);
      r.onsuccess = () => {
        const tx = r.result.transaction('texts', 'readwrite'), os = tx.objectStore('texts');
        keys.forEach(k => os.put(obj[k], k));
        tx.oncomplete = () => { r.result.close(); res(true); };
        tx.onerror = tx.onabort = () => rej(tx.error || new Error('write failed'));
      };
    });
  }
  async function bkMake() {
    try { persist(); stSave(); } catch (e) { /* nothing open yet */ } // include the newest position and stats
    await new Promise(r => setTimeout(r, 300));
    const ls = {};
    try {
      Object.keys(localStorage).forEach(k => {
        if (!bkWanted(k)) return;
        try { const v = JSON.parse(localStorage.getItem(k)); if (v !== null) ls[k] = v; } catch (e) { /* unreadable item: skip */ }
      });
    } catch (e) { /* storage unavailable */ }
    return { app: 'wordtrail', kind: 'backup', v: 1, created: new Date().toISOString(), ls, idb: await bkIdbAll() };
  }
  async function bkDownload() {
    const btn = $('#b-bkdl'); btn.disabled = true;
    try {
      const data = await bkMake();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' }));
      a.download = 'wordtrail-backup-' + data.created.slice(0, 10) + '.json';
      document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 60000);
      toast('Backup saved (' + Object.keys(data.ls).length + ' items).', 3500);
    } catch (e) { toast('Could not make the backup.', 4000); }
    finally { btn.disabled = false; }
  }
  async function bkRestore(file) {
    let d = null;
    try { d = JSON.parse(await file.text()); } catch (e) { d = null; }
    if (!d || d.app !== 'wordtrail' || d.kind !== 'backup' || d.v !== 1 || !d.ls || typeof d.ls !== 'object') { toast('That is not a Wordtrail backup file.', 4500); return; }
    const n = Object.keys(d.ls).filter(bkWanted).length;
    if (!confirm('Restore ' + n + ' saved items from the backup of ' + (String(d.created || '').slice(0, 10) || 'unknown date') + '? Matching data on this device will be replaced.')) return;
    window.__wtRestoring = true;
    try {
      Object.keys(d.ls).forEach(k => { if (bkWanted(k)) { try { localStorage.setItem(k, JSON.stringify(d.ls[k])); } catch (e) { /* storage full: skip */ } } });
      await bkIdbPut(d.idb && typeof d.idb === 'object' ? d.idb : {});
      toast('Backup restored. Reloading…', 2500);
      setTimeout(() => location.reload(), 900);
    } catch (e) { window.__wtRestoring = false; toast('Restore failed. Nothing else was changed.', 4500); }
  }

  async function useRaw(raw, src) {
    if (src.kind === 'file') await idb.set('f:' + S.book.id, raw);
    S.anchors = {}; S.ranges = {}; S.skip = {}; S.edge = {};
    const cached = await loadParsed(parsedKey(src, raw));
    applyText(raw, src, {}, cached, cached ? null : await BG.call('parseBook', [raw]));
    closeSheets();
    toast('Text loaded.');
  }
  function renderTextSheet() {
    const body = $('#text-body');
    body.textContent = '';
    if (!S.book) return;

    const hitsBox = h('div', { class: 'hits' });
    const qInput = h('input', { type: 'search', id: 'find-q', value: (S.book.title + ' ' + S.book.authorLast).trim(), 'aria-label': 'Search Project Gutenberg' });
    const runFind = async () => {
      hitsBox.textContent = 'Searching…';
      try {
        const hits = await gutendex(qInput.value.trim());
        hitsBox.textContent = '';
        if (!hits.length) { hitsBox.textContent = 'Nothing found. Try fewer words.'; return; }
        hits.forEach(x => hitsBox.append(h('button', { class: 'hit', type: 'button', onclick: async () => {
          hitsBox.textContent = 'Loading text…';
          try { const raw = await getGutenberg(x.id); await useRaw(raw, { kind: 'gutenberg', id: String(x.id), label: x.title + (x.author ? ' - ' + x.author : '') }); }
          catch (e) { hitsBox.textContent = 'That text could not be downloaded. Try another, or use your own file.'; }
        } }, x.title, h('small', {}, x.author + (x.langs.length ? ' · ' + x.langs.join(', ') : '')))));
      } catch (e) { hitsBox.textContent = 'Could not reach Project Gutenberg.'; }
    };
    const fileInput = h('input', { type: 'file', accept: '.txt,text/plain', id: 'file-in', onchange: async ev => {
      const f = ev.target.files[0];
      if (f) useRaw(await f.text(), { kind: 'file', label: f.name });
    } });
    const paste = h('textarea', { id: 'paste-in', placeholder: 'Paste the book text here', 'aria-label': 'Paste book text' });

    body.append(
      h('div', {}, h('h3', {}, 'Current text'), h('p', {}, S.textSrc ? S.textSrc.label : 'None loaded yet')),
      h('div', {}, h('h3', {}, 'Find another text'), h('div', { class: 'row', style: 'flex-wrap:nowrap' }, qInput, h('button', { class: 'btn small', type: 'button', onclick: runFind }, 'Search')), h('div', { style: 'margin-top:.6rem' }, hitsBox)),
      h('div', {}, h('h3', {}, 'Use your own text'), h('p', { class: 'help', style: 'margin-bottom:.6rem' }, 'A plain .txt file or pasted text works, in English.'), fileInput,
        h('div', { style: 'margin-top:.6rem' }, paste), h('div', { style: 'margin-top:.5rem' }, h('button', { class: 'btn small ghost', type: 'button', onclick: () => { if (paste.value.trim().length > 200) useRaw(paste.value, { kind: 'file', label: 'Pasted text' }); else toast('Paste a longer passage first.'); } }, 'Use pasted text')))
    );

    if (S.model) {
      const radio = (v, title, desc) => h('label', {}, h('input', { type: 'radio', name: 'mode', value: v, checked: S.mode === v, onchange: () => {
        S.mode = v;
        if (v === 'chapter' && !S.map.some(x => x >= 0)) { const dm = Core.defaultMap(S.model.chapters, S.secs); S.map = dm.map; S.span = dm.span; }
        replan(true); persist(); renderTextSheet();
      } }), h('span', {}, title, h('small', {}, desc)));
      body.append(h('div', {}, h('h3', {}, 'How text lines up with audio'), h('div', { class: 'radio' },
        radio('chapter', 'Match chapters to tracks', 'Best when each track is one chapter.'),
        radio('continuous', 'Spread across the whole book', 'Best when chapters and tracks do not match. Sync points fix any drift.'))));

      if (S.mode === 'chapter') {
        const real = S.model.chapters.map((c, i) => [c, i]).filter(([c]) => !c.front);
        const grid = h('div', { class: 'mapgrid' });
        S.secs.forEach((s, i) => {
          const sel = h('select', { 'aria-label': 'Text for ' + s.title, onchange: ev => { S.map[i] = S.span[i] = +ev.target.value; replan(i === S.sec); persist(); } },
            h('option', { value: '-1', selected: S.map[i] < 0 }, 'No text'),
            real.map(([c, ci]) => h('option', { value: String(ci), selected: S.map[i] === ci }, c.title.length > 38 ? c.title.slice(0, 36) + '…' : c.title)));
          grid.append(h('label', {}, h('span', { title: s.title }, (i + 1) + '. ' + s.title), sel));
        });
        body.append(h('div', {}, h('h3', {}, 'Track to chapter'), grid));
      }
      body.append(h('div', {}, h('h3', {}, 'Sync points'),
        h('p', { class: 'help', style: 'margin-bottom:.6rem' }, countAnchors() ? countAnchors() + ' saved for this book.' : 'None yet. Double-tap the sentence you are hearing, or turn on Sync in the player and tap it.'),
        h('div', { class: 'row', style: 'margin-bottom:.6rem' }, h('button', { class: 'btn small', type: 'button', disabled: !!S.aligning, onclick: () => autoAlign(S.sec) }, S.aligning ? 'Aligning…' : 'Auto-align this track'),
          h('small', { class: 'help' }, 'Downloads this track once and matches sentences to the narrator\'s pauses.')),
        h('button', { class: 'btn small ghost', type: 'button', disabled: !countAnchors(), onclick: () => { S.anchors = {}; S.ranges = {}; S.autoSrc = {}; S.skip = {}; S.edge = {}; replan(false); persist(); renderTextSheet(); toast('Sync points cleared.'); } }, 'Clear sync points')));
    }
  }

  /* ---------- sync dashboard (health.json) and clean-up setting (maintenance.json) ---------- */
  const MAINT = () => Object.assign({ days: 40, live: false }, store.get('wt:maint', {}) || {});
  async function pushMaint() {
    const { repo, token } = ghCfg(), m = MAINT(), note = $('#maint-help');
    if (!repo || !token) { note.textContent = 'Saved on this device. Add your GitHub token under Advanced to apply it to the repository.'; return; }
    const api = 'https://api.github.com/repos/' + repo + '/contents/maintenance.json';
    const hd = { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json' };
    const put = sha => fetch(api, { method: 'PUT', headers: hd, body: JSON.stringify(Object.assign({ message: 'maintenance settings', branch: 'main', content: btoa(JSON.stringify({ days: m.days, live: m.live })) }, sha ? { sha } : {})) });
    try {
      let r = await put();
      if (r.status === 422 || r.status === 409) { const g = await fetch(api + '?ref=main', { headers: hd, cache: 'no-store' }); if (g.ok) r = await put((await g.json()).sha); }
      note.textContent = r.ok ? 'Saved. The next daily run uses ' + m.days + ' days.' : 'GitHub refused the change (code ' + r.status + '). Check that the token allows Contents.';
    } catch (e) { note.textContent = 'Could not reach GitHub. Saved on this device only.'; }
  }
  async function retrySync(id, title, btn) {
    const { repo, token } = ghCfg();
    if (!repo || !token) { toast('Add your GitHub token under Advanced first.'); return; }
    btn.disabled = true;
    try {
      const r = await fetch('https://api.github.com/repos/' + repo + '/issues', { method: 'POST', headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json' }, body: JSON.stringify({ title: 'sync ' + id, body: 'cur=0\n' + title }) });
      toast(r.ok ? 'Sync requested again.' : 'GitHub refused the request (code ' + r.status + ').');
    } catch (e) { toast('Could not reach GitHub.'); }
    btn.disabled = false;
  }
  async function loadHealth() {
    const { repo } = ghCfg(), box = $('#health-list'), sum = $('#health-sum');
    if (!repo) { sum.textContent = 'Add your sync repository under Advanced first.'; return; }
    sum.textContent = 'Loading\u2026';
    let j = null, al = null;
    try { const r = await fetch('https://raw.githubusercontent.com/' + repo + '/main/health.json?_=' + Date.now(), { cache: 'no-store' }); if (r.ok) j = await r.json(); } catch (e) { /* offline */ }
    try { const r = await fetch('https://raw.githubusercontent.com/' + repo + '/main/align.json?_=' + Date.now(), { cache: 'no-store' }); if (r.ok) al = await r.json(); } catch (e) { /* none yet */ }
    if (!j || j.v !== 1) { sum.textContent = 'No report yet. It is made once a day, or run "Wordtrail health" under Actions.'; return; }
    sum.textContent = 'Synced ' + j.n.synced + ' \u00b7 Pending ' + j.n.pending + ' \u00b7 Failed ' + j.n.failed + ' \u00b7 ' + j.mb + ' MB \u00b7 ' + new Date(j.t * 1000).toLocaleString();
    const row = (title, extra, retry) => h('li', { style: 'margin:.45rem 0' }, h('strong', { text: title }), extra ? h('div', { class: 'help', text: extra }) : null, retry);
    const sect = (name, list, mk, open) => list.length ? h('details', open ? { open: true } : {}, h('summary', { text: name + ' (' + list.length + ')' }), h('ul', { role: 'list', style: 'list-style:none;padding:0;margin:.3rem 0' }, ...list.map(mk))) : null;
    const c = j.clean;
    const AL = { poor: 'The recording does not follow the text. Try another recording.', weak: 'Weak match with the text.', broken: 'Bad timing files were found and are being re-synced.' };
    const issues = al && al.b ? Object.entries(al.b).filter(([, v]) => v.st !== 'ok').map(([id, v]) => [id, v.n || 'Book ' + id, v.s, v.st, v.rs || 0]) : [];
    box.textContent = '';
    box.append(h('div', {},
      sect('Failed', j.failed, x => row(x[1], x[2], h('button', { class: 'btn', type: 'button', text: 'Retry', onclick: e => retrySync(x[0], x[1], e.target) })), true),
      sect('Pending', j.pending, x => row(x[1], x[2] + '%'), true),
      sect('Alignment check', issues, x => row(x[1], 'Match ' + x[2] + '% \u00b7 ' + AL[x[3]] + (x[4] ? ' (re-synced ' + x[4] + '\u00d7)' : ''), x[3] === 'broken' ? h('button', { class: 'btn', type: 'button', text: 'Retry', onclick: e => retrySync(x[0], x[1], e.target) }) : null), true),
      sect('Synced', j.synced, x => row(x[1])),
      c ? h('p', { class: 'help', text: (c.live ? 'Removed ' : 'Would remove ') + c.dirs.length + ' stale folders and ' + c.runs + ' old failed runs (older than ' + c.days + ' days).' }) : null));
    box.hidden = false;
  }
  /* ---------- Settings home ----------
     One front door for settings: a search box, then Basics and Advanced. Every row opens an EXISTING sheet as a
     sub-page (Playback speed, Quick controls for the sleep timer, Cinematic sound, Pre-sync) or the tabbed Settings
     sheet (now "All settings") scrolled to the right setting; nothing was rewritten. While a sub-page was opened from
     here (SMH.from), its header gets a Back button (smBackSync, called by openSheet in 270), and Back, Escape and
     swipe-back return here (sheetBack) instead of closing everything. Search covers these rows, every label and
     heading in the tabbed Settings, and the book tools of the More menu (marked "Book tool"; they need an open book).
     Developer and Diagnostics rows appear only after Developer is unlocked (7 taps on this title, as before). */
  var SMH = { from: false, q: '', idx: null, taps: 0, t: 0 };
  const smTheme = () => ({ auto: 'Auto', light: 'Light', dark: 'Dark', sepia: 'Sepia', contrast: 'High contrast' }[P.theme] || 'Auto');
  const smNorm = s => String(s || '').replace(/\s+/g, ' ').trim();
  const smDev = () => !!(window.wtDevOn && window.wtDevOn());
  function smMark(node) {   // scroll to a setting, outline it for a moment (no animation) and focus its control
    if (!node) return;
    setTimeout(() => {
      node.scrollIntoView({ block: 'center' }); node.classList.add('sh-hit'); setTimeout(() => node.classList.remove('sh-hit'), 2400);
      const f = node.matches('label[for]') ? document.getElementById(node.getAttribute('for')) : node.querySelector('input, select, button');
      if (f && !f.closest('[hidden]')) { try { f.focus({ preventScroll: true }); } catch (e) { /* not focusable */ } }
    }, 60);
  }
  const smH3 = (tab, text) => { const h3 = $$('#sheet-settings .sp[data-sp="' + tab + '"] h3').find(x => smNorm(x.textContent).toLowerCase().startsWith(text.toLowerCase())); return h3 ? (h3.closest('.row') || h3.parentElement) : null; };
  function smOpenTab(tab, find) {
    SMH.from = true; openSheet('sheet-settings'); window.wtSettingsTab(tab);
    smMark(typeof find === 'function' ? find() : null);
  }
  /* [section, key, icon, name, description, value, search words, action, 'dev' when it needs Developer unlocked] */
  const smRows = () => [
    ['basics', 'theme', 'i-m-contrast', 'Theme', 'Auto, Light, Dark, Sepia, High contrast', smTheme(), 'dark light sepia contrast colour color night', () => smOpenTab('reading', () => smH3('reading', 'Theme'))],
    ['basics', 'text', 'i-m-texts', 'Text', 'Size, line spacing, reading font', '', 'font size line spacing dyslexia lexend atkinson opendyslexic bigger larger', () => smOpenTab('reading', () => smH3('reading', 'Text size'))],
    ['basics', 'speed', 'i-m-zap', 'Speed', 'Playback speed and finer steps', +(+P.speed).toFixed(2) + 'x', 'faster slower pace skip silence voice boost mono balance volume', () => { SMH.from = true; spdPaint(); openSheet('sheet-speed'); }],
    ['basics', 'sleep', 'i-m-clock', 'Sleep timer', 'Stop after a set time or at the end of a track', !S.sleep ? 'Off' : S.sleep === 'chapter' ? 'End of track' : S.sleep + ' min', 'bedtime timer stop night', () => {
      if (!S.book) { toast('Open a book to set a sleep timer.', 3500); return; }
      SMH.from = true; qkOpt('sleep'); qkPaint(); openSheet('sheet-quick'); }],
    ['basics', 'all', 'i-m-sliders', 'All basic settings', 'Language, Calm mode, Customise home, audio, storage', '', 'language calm home audio storage reading everything', () => smOpenTab('reading')],
    ['advanced', 'timing', 'i-m-target', 'Precise timing', 'Read-along from speech recognition', '', 'sync highlight alignment drift timing', () => smOpenTab('sync', () => smH3('sync', 'Precise read-along'))],
    ['advanced', 'presync', 'i-m-refresh', 'Pre-sync books', 'Prepare timing ahead of time', '', 'github precompute sync batch', () => { SMH.from = true; $('#btn-presync').click(); }],
    ['advanced', 'amb', 'i-m-wave', 'Sound', 'Ambient, story sounds, music, opening sound and presets', '', 'sound ambient rain fire background music opening effects scene preset master volume', () => { SMH.from = true; ambOpen(); }],
    ['advanced', 'dev', 'i-m-code', 'Developer', 'Scene tests, sync and performance, clean-up', '', 'debug developer tools', () => smOpenTab('dev'), 'dev'],
    ['advanced', 'diag', 'i-m-info', 'Diagnostics', 'Log errors and slow moments', '', 'log errors debug report', () => smOpenTab('dev', () => { const c = document.getElementById('in-diag'); return c && (c.closest('.row') || c); }), 'dev']
  ];
  const smRow = (name, desc, icon, val, pill, go) => h('button', { class: 'mrow sh-row', type: 'button', onclick: () => go() },
    h('span', { class: 'mr-i', 'aria-hidden': 'true' }, svgIcon('#' + icon)),
    h('span', { class: 'mr-main' }, h('span', { class: 'mr-t' }, name), h('span', { class: 'mr-d' }, desc)),
    val ? h('span', { class: 'sh-val' }, val) : null, pill ? h('span', { class: 'sh-pill' }, pill) : null);
  function smHomePaint() {
    const box = $('#sh-home'); box.textContent = '';
    [['basics', 'Basics'], ['advanced', 'Advanced']].forEach(([sec, title]) => {
      const rows = smRows().filter(r => r[0] === sec && (r[8] !== 'dev' || smDev()));
      box.append(h('section', { class: 'sh-sec', 'aria-label': title }, h('h3', {}, title), h('div', { class: 'more-list' }, rows.map(r => smRow(r[3], r[4], r[2], r[5], '', r[7])))));
    });
  }
  /* everything that can be found: the rows above, each label and heading in the tabbed Settings, and the book tools */
  function smIndex() {
    const out = [], seen = new Set(), dev = smDev();
    smRows().filter(r => r[8] !== 'dev' || dev).forEach(r => { seen.add(r[3].toLowerCase()); out.push({ name: r[3], desc: (r[0] === 'basics' ? 'Basics' : 'Advanced') + ' \u00b7 ' + r[4], hay: (r[3] + ' ' + r[4] + ' ' + r[6]).toLowerCase(), icon: r[2], go: r[7] }); });
    const tabs = {}; $$('#sp-tabs button').forEach(b => { tabs[b.dataset.sp] = smNorm(b.textContent); });
    $$('#sheet-settings .sp').forEach(p => {
      const tab = p.dataset.sp; if (tab === 'dev' && !dev) return;
      const items = [];
      $$('label', p).forEach(l => {
        const h3 = $('h3', l), sm = $('small', l);
        const name = h3 ? smNorm(h3.textContent) : smNorm([...l.childNodes].filter(n => !(n.nodeType === 1 && n.tagName === 'SMALL')).map(n => n.textContent).join(''));
        items.push([l, name, sm ? smNorm(sm.textContent) : '']);
      });
      $$('h3', p).forEach(x => { if (!x.closest('label')) items.push([x, smNorm(x.textContent), '']); });
      items.forEach(([n, name, d]) => {
        name = name.slice(0, 90); const key = name.toLowerCase(); if (!name || seen.has(key)) return; seen.add(key);
        const blk = n.closest('.row') || n.parentElement;
        out.push({ name, desc: 'All settings \u203a ' + tabs[tab] + (d ? ' \u00b7 ' + d.slice(0, 80) : ''), hay: (name + ' ' + d + ' ' + tabs[tab]).toLowerCase(), icon: 'i-m-sliders', go: () => smOpenTab(tab, () => blk) });
      });
    });
    const more = { 'b-hl': 'quote card share picture', 'b-next': 'next up more like this recommend', 'b-chars': 'characters people names', 'b-clips': 'audio clips record' };
    const tool = (name, desc, hay, icon, go) => { if (seen.has(name.toLowerCase())) return; seen.add(name.toLowerCase()); out.push({ name, desc: 'Book tool \u00b7 ' + (S.book ? desc : 'open a book to use it'), hay: (name + ' ' + desc + ' ' + hay).toLowerCase(), icon, pill: 'Book tool', go }); };
    tool('Controls', 'Speed, sleep timer, sound, text, tracks and more for this book', 'speed sleep sound player quick controls more menu', 'i-m-sliders', () => { if (!S.book) { toast('Open a book first.', 3000); return; } qkOpt(''); qkPaint(); openSheet('sheet-quick'); });
    $$('#sheet-quick .qk-tile[data-n]').forEach(b => {   // the tiles of the Controls sheet
      if (b.hidden) return;
      tool(smNorm(b.dataset.n), smNorm(b.dataset.d), more[b.id] || '', 'i-m-layers', () => { if (!S.book) { toast('Open a book first.', 3000); return; } closeSheets(); b.click(); });
    });
    $$('#sheet-quick .mrow').forEach(b => {
      const t = $('.mr-t', b), d = $('.mr-d', b); if (!t || b.hidden || b.id === 'btn-howto') return;
      tool(smNorm(t.textContent), smNorm(d && d.textContent) || 'in the Controls sheet', more[b.id] || '', 'i-m-layers', () => { if (!S.book) { toast('Open a book first.', 3000); return; } closeSheets(); b.click(); });
    });
    return out;
  }
  function smSearch(q) {
    const res = $('#sh-res'), home = $('#sh-home'), cnt = $('#sh-count'); q = smNorm(q).toLowerCase();
    $('#sh-clear').hidden = !q;
    if (!q) { res.hidden = true; res.textContent = ''; home.hidden = false; cnt.hidden = true; return; }
    if (!SMH.idx) SMH.idx = smIndex();
    const toks = q.split(' '), hits = SMH.idx.filter(x => toks.every(t => x.hay.includes(t)))
      .map(x => [x.name.toLowerCase().includes(toks[0]) ? 0 : 1, x]).sort((a, b) => a[0] - b[0]).slice(0, 30).map(x => x[1]);
    home.hidden = true; res.hidden = false; res.textContent = '';
    hits.forEach(x => res.append(smRow(x.name, x.desc, x.icon, '', x.pill, x.go)));
    cnt.hidden = false; cnt.textContent = hits.length ? hits.length + (hits.length === 1 ? ' result' : ' results') : 'No settings match \u201c' + q + '\u201d. Clear the search to see everything.';
  }
  function smHomeOpen() {   // called by openSheet('sheet-sethome')
    SMH.idx = null; $('#sh-q').value = SMH.q; smHomePaint(); smSearch(SMH.q);
  }
  function openSettingsHome() { SMH.from = false; SMH.q = ''; openSheet('sheet-sethome'); }
  function smBack() {
    if (AMB.preview) { AMB.preview = false; ambSync(); }
    SMH.from = false; openSheet('sheet-sethome');
  }
  const sheetBack = () => { if (SMH.from) smBack(); else closeSheets(); };
  /* a Back button in the header of a sub-page that was opened from Settings home */
  function smBackSync(id) {
    $$('.sh-back').forEach(b => b.remove());
    if (!SMH.from || id === 'sheet-sethome') return;
    const hd = $('#' + id + ' header'); if (!hd) return;
    hd.prepend(h('button', { class: 'ib sh-back', type: 'button', 'aria-label': 'Back to Settings', onclick: smBack }, svgIcon('#i-back')));
  }
  function smWire() {
    const q = $('#sh-q'), clr = $('#sh-clear');
    q.addEventListener('input', () => { SMH.q = q.value; smSearch(q.value); });
    q.addEventListener('keydown', e => { if (e.key === 'Escape' && q.value) { e.preventDefault(); e.stopPropagation(); q.value = ''; SMH.q = ''; smSearch(''); } });
    clr.addEventListener('click', () => { q.value = ''; SMH.q = ''; smSearch(''); q.focus(); });
    $('#h-sethome').addEventListener('click', () => {   // 7 quick taps unlock Developer, like the "All settings" title
      const now = Date.now(); SMH.taps = now - SMH.t > 2000 ? 1 : SMH.taps + 1; SMH.t = now;
      if (SMH.taps >= 7) { SMH.taps = 0; window.wtSettingsTab('dev', true); SMH.idx = null; smHomePaint(); smSearch(SMH.q); toast('Developer settings unlocked.', 2500); }
    });
  }
  guideDoc('account', 'Settings home', "Account > Settings opens one page with a search box and two sections. Basics: theme, text, speed and the sleep timer. Advanced: precise timing, pre-sync, cinematic sound, and Developer and Diagnostics once Developer is unlocked. Each row opens the full panel, with a Back button to return. Search finds any setting, and the book tools in the More menu.", '2026-10-19');
  function fillSettings() {
    covSegSync();
    homeCustPaint();
    dmRender();
    devStartup();
    $('#in-mdays').value = MAINT().days; $('#in-mlive').checked = !!MAINT().live;
    $('#in-lockseek').checked = P.lockSeek !== false;
    $('#in-ambon').checked = P.ambOn === true;
    $('#in-scenelabel').checked = P.sceneLabel === true;
    $('#in-autonext').value = String(P.autoNext == null ? '2' : P.autoNext); $('#in-autodel').checked = P.autoDel === true; offSyncSwitches();
    $('#in-smartrw').checked = P.smartRewind !== false;
    $('#in-skipbtn').checked = P.skipBtn !== false;
    $('#in-sharestats').checked = P.shareStats !== false; $('#row-sharestats').style.display = STATS_API ? '' : 'none';
    $('#in-langs').checked = !!P.otherLangs; $('#in-resume').value = String(Math.max(1, Math.min(5, parseInt(P.resumeCount, 10) || 3))); $('#in-skipcuts').checked = P.skipCuts !== false; $('#in-nn').checked = P.foldSkipped === true; $('#in-bcol').checked = P.bookColors !== false; $('#in-drift').checked = P.driftFix !== false; $('#in-hlp').checked = P.hlpOff !== true; $('#in-worker').checked = P.bgWorker !== false; $('#in-layout').checked = P.layoutBatch !== false; $('#in-idle').checked = P.idleWork !== false; $('#in-net').checked = P.fastNet !== false; $('#in-lowpower').checked = P.lowPower !== false; $('#in-haptics').checked = P.haptics !== false; $('#in-shake').checked = P.shakeSleep === true; $('#in-shakemin').value = String(P.shakeMin || 10); $('#row-shakemin').hidden = P.shakeSleep !== true; $('#in-calm').checked = P.calm === true; $('#in-diag').checked = P.diag !== false; if (window.__wtDiag) window.__wtDiag.set(P.diag !== false); $('#in-lite').checked = P.liteGfx !== false; $('#in-liteforce').checked = P.liteForce === true; applyLite(); $('#in-tidy').checked = P.tidyPlayer !== false; applyTidy(); $('#in-load').checked = P.fastLoad !== false; $('#in-awake').checked = P.keepAwake !== false; $('#in-auto').checked = P.autoStart !== false; $('#in-fast').checked = P.fastCheck !== false; $('#in-smart').checked = P.smartSync !== false; $('#in-recap').checked = P.recap !== false; $('#in-bg').value = P.bgAlign || 'wifi'; $('#in-lead').value = S.lead == null ? '' : S.lead; $('#in-outro').value = S.outro; $('#in-nudge').value = P.nudge;
    applyTheme();
  }

