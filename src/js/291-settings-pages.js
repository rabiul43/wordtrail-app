  /* ---------- New Settings layout (Settings > Appearance > "New Settings layout", P.setNew, default on) ----------
     Settings home lists pages (Appearance, Reading, Listening, Learning, Downloads and storage, Privacy and data,
     Advanced, Language and home). Nothing was rewritten: the old tabbed sheet ("All settings") stays in the HTML and
     every top-level block in it carries data-np="<page>". A page shows only its blocks (the rest get .np-off), so
     search, saved settings and every control id work as before. Off = the old four tabs, unchanged.
     The old tab names map to pages in 005-settings-tabs.js (wtSettingsTab); smOpenTab (290) calls npReveal so a
     search result opens the page that holds the setting. */
  const NP_PAGES = [
    { k: 'appearance', t: 'Appearance', i: 'i-m-contrast', d: 'Theme, app design, covers, player look, Calm mode' },
    { k: 'reading', t: 'Reading', i: 'i-m-texts', d: 'Text size, spacing, font, highlight, line focus' },
    { k: 'listening', t: 'Listening', i: 'i-m-headphones', d: 'Speed, sleep timer, rewind, sound, haptics' },
    { k: 'learning', t: 'Learning', i: 'i-m-bulb', d: 'Learn mode and the learning tools' },
    { k: 'storage', t: 'Downloads and storage', i: 'i-m-download', d: 'Download ahead, auto-delete, offline space' },
    { k: 'privacy', t: 'Privacy and data', i: 'i-m-archive', d: 'Listen counts, backup and restore' },
    { k: 'advanced', t: 'Advanced', i: 'i-m-target', d: 'Precise timing, pre-sync, Developer' },
    { k: 'general', t: 'Language and home', i: 'i-m-globe', d: 'Language, Customise home, other languages, shortcuts' }
  ];
  let npCur = 'appearance';
  const npOn = () => P.setNew !== false;
  const npTitle = k => (NP_PAGES.find(p => p.k === k) || {}).t || '';
  function npName(el) {   // the page that holds this element ('' when the old tabs are on)
    const b = npOn() && el && el.closest ? el.closest('[data-np]') : null; return b ? npTitle(b.dataset.np) : '';
  }
  function npQuick() {   // Playback speed and Sleep timer open their own sheets, so they are rows at the top of Listening
    const box = $('#np-quick'); if (!box) return; box.textContent = '';
    smRows().filter(r => r[1] === 'speed' || r[1] === 'sleep').forEach(r => box.append(smRow(r[3], r[4], r[2], r[5], '', r[7])));
  }
  function npShow(k) {
    const sh = $('#sheet-settings'); if (!sh) return;
    if (!NP_PAGES.some(p => p.k === k)) k = 'appearance';
    npCur = k;
    $$('.sp', sh).forEach(p => { p.hidden = p.dataset.sp === 'dev' ? !(k === 'advanced' && smDev()) : !p.querySelector(':scope > [data-np="' + k + '"]'); });   // a panel with nothing for this page is hidden, so its spacing does not leave a gap
    $$('[data-np]', sh).forEach(b => b.classList.toggle('np-off', b.dataset.np !== k));
    $('#h-settings').textContent = npTitle(k);
    if (k === 'listening') npQuick();
    const body = $('.body', sh); if (body) body.scrollTop = 0;
  }
  function npOpen(k) { SMH.from = true; openSheet('sheet-settings'); npShow(k); }
  function npReveal(el) {   // show the page that holds this element
    if (!npOn() || !el) return;
    const b = el.closest('[data-np]');
    if (b) npShow(b.dataset.np); else if (el.closest('.sp[data-sp="dev"]')) npShow('advanced');
  }
  function npHomePaint() {
    const box = $('#sh-home'); box.textContent = '';
    const lang = $('#in-uilang'), langName = lang && lang.selectedOptions[0] ? smNorm(lang.selectedOptions[0].textContent) : '';
    const val = { appearance: smTheme(), listening: +(+P.speed).toFixed(2) + 'x', general: langName };
    const grp = (title, rows) => h('section', { class: 'sh-sec', 'aria-label': title || 'Settings pages' }, title ? h('h3', {}, title) : null, h('div', { class: 'more-list' }, rows));
    const page = p => smRow(p.t, p.d, p.i, val[p.k] || '', '', () => npOpen(p.k));
    box.append(grp('', NP_PAGES.filter(p => p.k !== 'general').map(page)));
    const keep = ['install', 'guide', 'howto', 'keys'];
    const more = smRows().filter(r => keep.includes(r[1]) && smShow(r)).sort((a, b) => keep.indexOf(a[1]) - keep.indexOf(b[1]))
      .map(r => smRow(r[3], r[4], r[2], '', r[1] === 'guide' && guideUnseen() ? 'New' : '', r[7]));
    box.append(grp('General', [page(NP_PAGES.find(p => p.k === 'general')), ...more]));
  }
  function npApply() {
    document.documentElement.toggleAttribute('data-setnew', npOn());
    const sh = $('#sheet-settings'); if (!sh) return;
    if (npOn()) npShow(npCur);
    else { $$('[data-np]', sh).forEach(b => b.classList.remove('np-off')); $('#h-settings').textContent = 'All settings'; window.wtSettingsTab('reading'); }
    SMH.idx = null;
  }
  window.wtNpOn = npOn; window.wtNpGo = npShow;
