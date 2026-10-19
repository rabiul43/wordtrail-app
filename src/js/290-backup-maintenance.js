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
    applyText(raw, src, {}, await loadParsed(parsedKey(src, raw)));
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
  function fillSettings() {
    covSegSync();
    homeCustPaint();
    dmRender();
    devStartup();
    $('#in-mdays').value = MAINT().days; $('#in-mlive').checked = !!MAINT().live;
    $('#in-lockseek').checked = P.lockSeek !== false;
    $('#in-ambon').checked = P.ambOn === true;
    $('#in-scenelabel').checked = P.sceneLabel === true;
    $('#in-autonext').value = String(P.autoNext == null ? '2' : P.autoNext); $('#in-autodel').checked = P.autoDel === true;
    $('#in-smartrw').checked = P.smartRewind !== false;
    $('#in-skipbtn').checked = P.skipBtn !== false;
    $('#in-sharestats').checked = P.shareStats !== false; $('#row-sharestats').style.display = STATS_API ? '' : 'none';
    $('#in-langs').checked = !!P.otherLangs; $('#in-resume').value = String(Math.max(1, Math.min(5, parseInt(P.resumeCount, 10) || 3))); $('#in-skipcuts').checked = P.skipCuts !== false; $('#in-nn').checked = P.foldSkipped === true; $('#in-bcol').checked = P.bookColors !== false; $('#in-drift').checked = P.driftFix !== false; $('#in-worker').checked = P.bgWorker !== false; $('#in-layout').checked = P.layoutBatch !== false; $('#in-idle').checked = P.idleWork !== false; $('#in-net').checked = P.fastNet !== false; $('#in-lowpower').checked = P.lowPower !== false; $('#in-haptics').checked = P.haptics !== false; $('#in-shake').checked = P.shakeSleep === true; $('#in-shakemin').value = String(P.shakeMin || 10); $('#row-shakemin').hidden = P.shakeSleep !== true; $('#in-calm').checked = P.calm === true; $('#in-diag').checked = P.diag !== false; if (window.__wtDiag) window.__wtDiag.set(P.diag !== false); $('#in-lite').checked = P.liteGfx !== false; $('#in-liteforce').checked = P.liteForce === true; applyLite(); $('#in-tidy').checked = P.tidyPlayer !== false; $('#in-quick').checked = P.quickCtl !== false; applyTidy(); $('#in-load').checked = P.fastLoad !== false; $('#in-awake').checked = P.keepAwake !== false; $('#in-auto').checked = P.autoStart !== false; $('#in-fast').checked = P.fastCheck !== false; $('#in-smart').checked = P.smartSync !== false; $('#in-recap').checked = P.recap !== false; $('#in-bg').value = P.bgAlign || 'wifi'; $('#in-lead').value = S.lead == null ? '' : S.lead; $('#in-outro').value = S.outro; $('#in-nudge').value = P.nudge;
    applyTheme();
  }

