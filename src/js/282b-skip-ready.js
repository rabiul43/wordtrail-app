  /* ---------- Skip ready books: a page in My Library (next to Synced books) ----------
     Lists the books whose spoken LibriVox notice is ready to be skipped: more than half of their chapters have a notice cut in the skip list.
     The list is extras/index.json on Hugging Face (SKX in 070 downloads it once, keeps a saved copy and refreshes it after a day; the notebook, cell 7c,
     decides which books are in it). A row shows the book as the app already knows it (saved books, recent books, the catalogue) and opens it as
     usual. This page only lists books: it does not change how skipping works. State: shelfMode 'sk' (080). Styles: 99r-skip-ready.css. */
  let skOrder = 'best';   // 'best' = largest share of chapters first, 'az' = by title
  let skToken = 0;
  const SK_ORDERS = [['best', 'Cleanest first', 'The books with the most chapters that skip the notice, first'], ['az', 'A–Z', 'By title']];
  const skHint = (a, b) => b === 1 ? '1 of 1 chapter skips the notice' : a + ' of ' + b + ' chapters skip the notice';
  let skCatFor = null, skCatMap = null;
  function skMeta(id) {   // title, authors and cover from what the app already has: saved books, recent books, then the catalogue
    const sid = String(id);
    let b = getFavs().find(f => String(f.id) === sid) || (P.recents || []).find(r => String(r.id) === sid) || null;
    if (!b && CAT.books) {
      if (skCatFor !== CAT.books) { skCatFor = CAT.books; skCatMap = new Map(CAT.books.map(x => [String(x.id), x])); }
      b = skCatMap.get(sid) || null;
    }
    return b ? { book: b, title: b.title || '', authors: b.authors || '', cover: b.cover || '' } : { book: null, title: '', authors: '', cover: '' };
  }
  function skOpen(id, m) {
    pendingBack = { tab: 'shelf', see: false }; showTab('library');   // the back button of the player returns to this page (shelfMode stays 'sk')
    resumeRecent(m.book || { id: String(id), title: m.title || 'Book ' + id, authors: m.authors || '', cover: m.cover || '' });
  }
  function skRow(id, m, v) {
    const cover = m.cover
      ? h('img', { class: 'synced-row-cover', src: m.cover, alt: '', loading: 'lazy', decoding: 'async', width: '48', height: '64', referrerpolicy: 'no-referrer' })
      : h('span', { class: 'synced-row-cover', 'aria-hidden': 'true' });
    const go = () => skOpen(id, m);
    return h('div', { class: 'synced-row', role: 'button', tabindex: '0', onclick: go, onkeydown: e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } } },
      cover,
      h('div', { class: 'synced-row-info' },
        h('div', { class: 'synced-row-title' }, m.title || 'Book ' + id),
        h('div', { class: 'synced-row-sub' }, m.authors || 'ID ' + id),
        h('div', { class: 'synced-row-sub2 sk-hint' }, skHint(v[0], v[1]))));
  }
  function skMessage(icon, title, text, retry) {
    return h('div', { class: 'synced-empty' }, h('div', { class: 'synced-empty-ic' }, lhSvg(LH_ICONS[icon])),
      h('h2', {}, title), text ? h('p', {}, text) : null,
      retry ? h('button', { class: 'sk-retry', type: 'button', onclick: () => { SKX.failedAt = 0; renderSkip(); } }, 'Try again') : null);
  }
  function skShowing() { return curTab === 'shelf' && shelfMode === 'sk' && !$('#shelf-sk').hidden; }
  function renderSkip() {
    const list = $('#skip-list'), countEl = $('#skip-count'), bar = $('#skip-filters');
    if (!list) return;
    const token = ++skToken;
    countEl.textContent = ''; bar.textContent = '';
    const again = () => { if (token === skToken && skShowing()) draw(); };
    function draw() {
      list.textContent = '';
      if (!SKX.ready) {   // no saved copy and no download: calm message, nothing guessed
        countEl.textContent = ''; bar.textContent = '';
        list.append(skMessage('sk', 'Not available yet', 'The list of books that skip the notice could not be loaded. It may not be published yet, or you may be offline. Please check again later.' + (SKX.err ? ' (' + SKX.err + ')' : ''), true));
        return;
      }
      const items = [...SKX.map].map(([id, v]) => ({ id, v, m: skMeta(id) }));
      if (!items.length) {
        countEl.textContent = ''; bar.textContent = '';
        list.append(skMessage('sk', 'No books are ready yet', 'Books will appear here when most of their chapters can skip the notice.', false));
        return;
      }
      const key = x => (x.m.title || 'Book ' + x.id).toLowerCase();
      const az = (a, b) => key(a).localeCompare(key(b));
      items.sort(skOrder === 'az' ? az : (a, b) => (b.v[0] / b.v[1]) - (a.v[0] / a.v[1]) || b.v[1] - a.v[1] || az(a, b));
      countEl.textContent = plural(items.length, 'book');
      bar.textContent = '';
      SK_ORDERS.forEach(([k, label, tip]) => bar.append(h('button', { class: 'chip', type: 'button', title: tip, 'aria-pressed': String(skOrder === k), onclick: () => { skOrder = k; draw(); } }, label)));
      const host = h('div', { class: 'synced-list' });
      list.append(host);
      vlist(host, items, x => skRow(x.id, x.m, x.v), { min: 60, est: 88 });
      if (!CAT.books) Promise.resolve(CAT.p || catLoad()).then(() => { if (CAT.books) again(); }).catch(() => {});   // book info arrives later: draw again then
    }
    if (SKX.ready) draw();   // a saved copy shows at once
    else list.append(h('div', { class: 'synced-empty' }, h('div', { class: 'synced-empty-ic' }, lhSvg(LH_ICONS.sk)), h('p', {}, 'Loading…')));
    Promise.resolve(SKX.load(again)).catch(() => {}).then(() => { if (token === skToken && skShowing() && (!SKX.ready || !list.querySelector('.synced-row'))) draw(); });
  }
