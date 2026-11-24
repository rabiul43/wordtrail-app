  /* ---------- Error finder (error-tracking task 4) ----------
     A Settings page (the sheet #sheet-errfinder, 28k-sheet-errors.html, styles 99u-error-finder.css) that shows what the error log (00a/00b/00c in
     the page head, window.__wtDiag) has recorded since the app opened: each problem once, with how many times, in plain words, what it usually means,
     where the user was, and the last 10 actions before it. Nothing here records or sends anything; it only reads __wtDiag.
       EF.open()   opens the sheet (Settings > Advanced > Error finder, also found by the Settings search)
     Built the first time it opens, nothing runs at start-up. The list is read again on Refresh and each time the sheet opens. */
  const EF = (() => {
    const LABEL = { error: 'App error', promise: 'Background task failed', storage: 'Storage full', sw: 'Offline mode could not start', network: 'Connection failed',
      http: 'Server returned an error', audio: 'Audio problem', resource: 'Image or file did not load', missing: 'File not found', longtask: 'App froze for a moment', 'slow-tap': 'Slow tap' };
    const HINT = {
      error: 'Something in the app broke. If you can repeat it, write down the steps under "Before it happened" and send them to the developer.',
      promise: 'A background step failed and nothing handled it. Often caused by a connection problem.',
      storage: 'The phone has no more room for the saved data of the app. Remove downloaded books in the Library, or free some space on the phone.',
      sw: 'The offline helper could not start. The app still works online; reading without internet may not.',
      network: 'A request got no answer. Usually weak or no internet, or a website that is blocked on this network.',
      http: 'A website answered with an error. If it keeps happening for the same address, that service may be down.',
      audio: 'The audio could not play or kept stalling. Often a weak connection or a damaged audio file.',
      resource: 'A picture or file did not load. The app usually shows a placeholder instead.',
      missing: 'The file does not exist (404). Often normal: the app looks for optional files.',
      longtask: 'The screen froze for a moment. Common on slow phones while a big book loads.',
      'slow-tap': 'A tap took a long time to react.' };
    const RANK = { error: 0, warn: 1, info: 2, perf: 3 };
    const FILTERS = [['all', 'All', () => true], ['error', 'Errors', p => p.sev === 'error'], ['warn', 'Warnings', p => p.sev === 'warn'], ['other', 'Other', p => p.sev === 'info' || p.sev === 'perf']];
    let filter = 'all', wired = false;
    const openIds = new Set();
    const diag = () => window.__wtDiag || null;
    const hhmmss = t => new Date(t).toTimeString().slice(0, 8);
    function ago(t) {
      const s = Math.max(0, Math.round((Date.now() - t) / 1000));
      return s < 60 ? 'just now' : s < 3600 ? Math.round(s / 60) + ' min ago' : s < 86400 ? Math.round(s / 3600) + ' h ago' : Math.round(s / 86400) + ' d ago';
    }
    function problemText(p) {
      const L = [`[${p.sev}] ${LABEL[p.type] || p.type} x${p.n}  (${p.id})`, p.msg + (p.where ? '  @' + p.where : '')];
      if (p.at) L.push(`where: ${p.at.screen}${p.at.book ? ', book ' + p.at.book : ''}, ${p.at.online ? 'online' : 'offline'}`);
      L.push(`first ${hhmmss(p.first)}, last ${hhmmss(p.last)}`);
      if (p.crumbs && p.crumbs.length) { L.push('before it:'); p.crumbs.forEach(c => L.push(`  ${hhmmss(c.t)} ${c.k} ${c.d}${c.n > 1 ? ' (x' + c.n + ')' : ''}`)); }
      if (p.stack) L.push(p.stack);
      return L.join('\n');
    }
    async function copy(text) {
      try { await navigator.clipboard.writeText(text); toast('Copied.'); return; } catch (e) { /* fall through */ }
      try { const ta = document.createElement('textarea'); ta.value = text; ta.style.cssText = 'position:fixed;opacity:0'; document.body.append(ta); ta.select(); const ok = document.execCommand('copy'); ta.remove(); toast(ok ? 'Copied.' : 'Could not copy.'); }
      catch (e) { toast('Could not copy.'); }
    }
    function card(p) {
      const d = h('details', { class: 'ef__card ef--' + p.sev, 'data-id': p.id });
      d.open = openIds.has(p.id);
      d.addEventListener('toggle', () => { if (d.open) openIds.add(p.id); else openIds.delete(p.id); });
      d.append(h('summary', {},
        h('div', { class: 'ef__top' }, h('span', { text: LABEL[p.type] || p.type }), h('span', { class: 'ef__n', text: '×' + p.n })),
        h('div', { class: 'ef__msg', text: p.msg + (p.where ? '  @' + p.where : '') }),
        h('div', { class: 'ef__when', text: 'Last seen ' + ago(p.last) })));
      const more = h('div', { class: 'ef__more' });
      more.append(h('p', { class: 'help', text: HINT[p.type] || '' }));
      if (p.at) more.append(h('h4', { text: 'Where you were' }), h('div', { text: `${p.at.screen}${p.at.book ? ' · book ' + p.at.book : ''} · ${p.at.online ? 'online' : 'offline'}` }));
      more.append(h('h4', { text: 'When' }), h('div', { text: `First ${hhmmss(p.first)} · last ${hhmmss(p.last)}` }));
      if (p.crumbs && p.crumbs.length) {
        more.append(h('h4', { text: 'Before it happened' }));
        const ol = h('ol', { class: 'ef__trail' });
        p.crumbs.forEach(c => ol.append(h('li', { text: `${hhmmss(c.t)}  ${c.k}  ${c.d}${c.n > 1 ? '  (x' + c.n + ')' : ''}` })));
        more.append(ol);
      }
      if (p.stack) more.append(h('h4', { text: 'Technical detail' }), h('pre', { text: p.stack }));
      more.append(h('div', { class: 'ef__bar' }, h('button', { class: 'chip', type: 'button', text: 'Copy this problem', onclick: () => copy(problemText(p)) })));
      d.append(more);
      return d;
    }
    function render() {
      const D = diag(), list = $('#ef-list'); if (!list) return;
      list.textContent = '';
      if (!D || !D.problems) { $('#ef-sum').textContent = 'The error log is not available in this version.'; $('#ef-chips').textContent = ''; $('#ef-ctx').textContent = ''; return; }
      const all = D.problems().slice().sort((a, b) => (RANK[a.sev] - RANK[b.sev]) || (b.last - a.last));
      const cnt = k => all.filter(FILTERS.find(f => f[0] === k)[2]).length;
      const e = cnt('error'), w = cnt('warn'), o = cnt('other');
      $('#ef-sum').textContent = all.length ? `${e} error${e === 1 ? '' : 's'}, ${w} warning${w === 1 ? '' : 's'}, ${o} other since the app opened. The same problem is listed once, with how many times it happened.`
        : 'Nothing has gone wrong since the app opened. This list starts empty each time the app opens.';
      $('#ef-off').hidden = !!D.on;
      const chips = $('#ef-chips'); chips.textContent = '';
      FILTERS.forEach(f => chips.append(h('button', { class: 'chip', type: 'button', 'aria-pressed': String(filter === f[0]), text: f[1] + ' ' + cnt(f[0]), onclick: () => { filter = f[0]; render(); } })));
      const shown = all.filter(FILTERS.find(f => f[0] === filter)[2]);
      if (!shown.length) list.append(h('div', { class: 'ef__empty', text: all.length ? 'Nothing in this group.' : 'No problems recorded.' }));
      shown.forEach(p => list.append(card(p)));
      const c = D.context ? D.context() : null;
      const ss = D.sendStatus ? D.sendStatus() : null;
      $('#ef-send').textContent = !ss || !ss.configured ? 'Sending reports: not set up in this version.' : !D.canSend() ? 'Sending reports: off (see the switch in Settings).'
        : 'Sending reports: on' + (ss.queued ? ', ' + ss.queued + ' waiting' : '') + (ss.lastOk ? ', last sent ' + ago(ss.lastOk) : '') + (ss.fail ? ', will try again' : '') + '.';
      $('#ef-ctx').textContent = c ? `App ${c.build} · ${c.br}, ${c.os} · ${c.online ? (c.net || 'online') : 'offline'} · ${c.mem ? c.mem + ' GB' : '? GB'} memory` : '';
    }
    function wire() {
      if (wired) return; wired = true;
      $('#ef-refresh').addEventListener('click', () => { render(); toast('Updated.', 1200); });
      $('#ef-copy').addEventListener('click', () => { const D = diag(); if (D) copy(D.text()); });
      $('#ef-clear').addEventListener('click', () => { const D = diag(); if (D) D.clear(); openIds.clear(); render(); toast('Cleared.', 1500); });
      $('#ef-on').addEventListener('click', () => { P.diag = true; savePrefs(); const D = diag(); if (D) D.set(true); render(); });
    }
    function open() { wire(); render(); openSheet('sheet-errfinder'); }
    return { open, render };
  })();
