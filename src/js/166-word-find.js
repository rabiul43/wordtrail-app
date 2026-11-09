  /* ---------- My Words: search, filters, collections, "Practise N due words" (Words sheet > "My words") ----------
     Sits on top of the saved-word store (147) and the cards (165). It adds a search box, filter pills (All, Hard, Due, one per
     book), collection pills with Create / Rename / Add words, a Collections button on every card, and a sticky button that opens
     the Review. It never changes a word except through WS (147): a word's collections stay in its own `cols` list (so sync, backup
     and old data keep working). Only the NAMES of collections that have no word yet live in one new list, wt:wcols (names, text).
     Nothing runs at start-up; the screen parts are built the first time My words is drawn. Playback is never touched.
       WF.collections(words)  every collection: [{ name, n }], A to Z (names in wt:wcols plus names found on words)
       WF.books(words)        the books the words came from: [{ id, name, n }], most words first
       WF.find(q, f)          saved words for a search text q and a filter f ('all' | 'hard' | 'due' | 'b:<book id>' | 'c:<collection>')
       WF.create(name)        { ok, name, existed } or { ok:false, why:'empty'|'limit' }
       WF.rename(from, to)    { ok, n, name } or { ok:false, why:'empty'|'missing'|'exists' }
       WF.render(list, help, words)   vocRender (160) calls it for the My words tab        WF.show(on)   shows or hides the extra parts */
  const WF = (() => {
    const KEY = 'wt:wcols', MAX_NAMES = 40, MAX_LEN = 40;
    const k = x => String(x == null ? '' : x).trim().toLowerCase();
    const str = x => (typeof x === 'string' ? x : '');
    const clean = x => String(x == null ? '' : x).trim().slice(0, MAX_LEN);
    const W = { q: '', f: 'all', words: [], list: null, help: null, base: '', bar: null, dock: null, go: null, rowF: null, rowC: null, colbar: null, panel: null, panelKind: '', timer: 0 };

    /* ----- data (no screen code) ----- */
    const stored = () => { const l = store.get(KEY, []); return Array.isArray(l) ? l.filter(x => typeof x === 'string' && x.trim()) : []; };
    function collections(words) {
      const m = new Map();
      stored().forEach(nm => { if (!m.has(k(nm))) m.set(k(nm), { name: nm, n: 0 }); });
      (words || []).forEach(e => {
        const seen = new Set();
        (Array.isArray(e && e.cols) ? e.cols : []).forEach(c => {
          const q = k(c); if (!q || seen.has(q)) return; seen.add(q);
          const o = m.get(q) || { name: String(c).trim(), n: 0 }; o.n++; m.set(q, o);
        });
      });
      return [...m.values()].sort((a, b) => a.name.localeCompare(b.name));
    }
    function books(words) {
      const m = new Map();
      (words || []).forEach(e => {
        const seen = new Set();
        WC.places(e).forEach(c => {
          const id = str(c.bid).trim(); if (!id || seen.has(id)) return; seen.add(id);
          const o = m.get(id) || { id, name: str(c.bt).trim(), n: 0 }; if (!o.name) o.name = str(c.bt).trim(); o.n++; m.set(id, o);
        });
      });
      return [...m.values()].map(b => Object.assign(b, { name: b.name || 'Book ' + b.id })).sort((a, b) => b.n - a.n || a.name.localeCompare(b.name));
    }
    function find(q, f) {
      f = f || 'all';
      const o = {}; if (f === 'hard') o.hard = true; if (f.slice(0, 2) === 'c:') o.col = f.slice(2);
      let out = WS.search(q, o);
      if (f === 'due') out = out.filter(srsDue);
      else if (f.slice(0, 2) === 'b:') { const b = f.slice(2); out = out.filter(e => str(e.bid) === b || WC.places(e).some(c => str(c.bid) === b)); }
      return out;
    }
    function create(name) {
      const nm = clean(name); if (!nm) return { ok: false, why: 'empty' };
      const have = collections(WS.all()), hit = have.find(c => k(c.name) === k(nm));
      if (hit) return { ok: true, name: hit.name, existed: true };
      if (have.length >= MAX_NAMES) return { ok: false, why: 'limit' };
      store.set(KEY, stored().concat(nm)); return { ok: true, name: nm };
    }
    function rename(from, to) {
      const nm = clean(to); if (!nm) return { ok: false, why: 'empty' };
      const have = collections(WS.all()), a = have.find(c => k(c.name) === k(from)); if (!a) return { ok: false, why: 'missing' };
      if (k(nm) !== k(from) && have.some(c => k(c.name) === k(nm))) return { ok: false, why: 'exists' };
      const n = WS.renameCollection(from, nm), s = stored(), i = s.findIndex(x => k(x) === k(from));
      if (i >= 0) { s[i] = nm; store.set(KEY, s); }
      return { ok: true, n, name: nm };
    }

    /* ----- screen ----- */
    const curCol = () => (W.f.slice(0, 2) === 'c:' ? W.f.slice(2) : '');
    const wfLater = fn => { clearTimeout(W.timer); W.timer = setTimeout(fn, 100); };
    const pill = (label, n, on, fn, icon) => h('button', { class: 'wl-pill wl-pill--tap wf__pill', type: 'button', 'aria-pressed': String(on), onclick: fn },
      icon ? h('span', { 'aria-hidden': 'true' }, icon) : null, h('span', { class: 'wf__pl' }, label), n == null ? null : h('span', { class: 'wf__n' }, String(n)));
    const dueN = () => W.words.filter(srsDue).length;
    function setFilter(f) { W.f = f; closePanel(); paintBar(); drawList(); }
    function refreshWords() { W.words = WS.all(); }

    function paintBar() {
      const due = dueN(), bs = books(W.words), cs = collections(W.words);
      if (W.f.slice(0, 2) === 'b:' && !bs.some(b => 'b:' + b.id === W.f)) W.f = 'all';
      if (W.f.slice(0, 2) === 'c:' && !cs.some(c => k(c.name) === k(curCol()))) W.f = 'all';
      W.rowF.textContent = '';
      W.rowF.append(pill('All', W.words.length, W.f === 'all', () => setFilter('all')),
        pill('Hard', null, W.f === 'hard', () => setFilter('hard'), '\u2691'),
        pill('Due', due, W.f === 'due', () => setFilter('due')),
        ...bs.map(b => pill(b.name, b.n, W.f === 'b:' + b.id, () => setFilter('b:' + b.id))));
      W.rowC.textContent = '';
      W.rowC.append(h('span', { class: 'wf__lab' }, 'Collections'),
        ...cs.map(c => pill(c.name, c.n, k(curCol()) === k(c.name), () => setFilter('c:' + c.name))),
        h('button', { class: 'wl-pill wl-pill--tap wf__pill wf__new', type: 'button', onclick: () => openPanel('new') }, '+ New collection'));
      W.colbar.hidden = !curCol(); W.colbar.textContent = '';
      if (curCol()) {
        const nm = (cs.find(c => k(c.name) === k(curCol())) || { name: curCol() }).name;
        W.colbar.append(h('strong', { class: 'wf__cn' }, nm),
          h('button', { class: 'wl-btn wl-btn--secondary wl-btn--small', type: 'button', onclick: () => openPanel('rename') }, 'Rename'),
          h('button', { class: 'wl-btn wl-btn--secondary wl-btn--small', type: 'button', onclick: () => openPanel('add') }, 'Add words'));
      }
    }
    function paintGo() {
      const n = dueN(); W.go.hidden = !n; W.dock.hidden = !n;
      W.go.textContent = n === 1 ? 'Practise 1 due word' : 'Practise ' + n + ' due words';
    }
    function drawList() {
      const list = W.list; if (!list) return;
      const out = find(W.q, W.f), total = W.words.length, on = !!W.q.trim() || W.f !== 'all';
      if (list._vl) list._vl.destroy(); list.textContent = '';
      if (!out.length) {
        W.help.textContent = !total ? W.base : (curCol() && !W.q.trim()) ? 'This collection is empty. Tap Add words, or open a word and tap Collections.' : 'No words match. Try fewer letters or another filter.';
        return;
      }
      W.help.textContent = on ? out.length + ' of ' + total + ' words' : W.base;
      WC.render(list, out, deco);
    }

    /* A small form in a panel: new collection, rename, or add words to the open collection. */
    function closePanel() { W.panelKind = ''; if (W.panel) { W.panel.hidden = true; W.panel.textContent = ''; } }
    function openPanel(kind) {
      if (W.panelKind === kind) { closePanel(); return; }
      W.panelKind = kind; const p = W.panel; p.hidden = false; p.textContent = '';
      if (kind === 'add') { addPanel(p); return; }
      const rn = kind === 'rename', input = h('input', { type: 'text', class: 'wf__in', maxlength: String(MAX_LEN), autocomplete: 'off', 'aria-label': 'Collection name', placeholder: 'Collection name', value: rn ? curCol() : '' });
      const go = ev => {
        ev.preventDefault();
        const r = rn ? rename(curCol(), input.value) : create(input.value);
        if (!r.ok) { toast(r.why === 'limit' ? 'You can have up to 40 collections.' : r.why === 'exists' ? 'A collection with that name already exists.' : 'Type a name for the collection.', 2400); input.focus(); return; }
        refreshWords(); W.f = 'c:' + r.name; closePanel(); paintBar(); drawList();
        toast(rn ? 'Collection renamed.' : r.existed ? 'That collection already exists.' : 'Collection created.', 1600);
      };
      p.append(h('form', { class: 'wf__form', onsubmit: go }, input,
        h('button', { class: 'wl-btn wl-btn--primary wl-btn--small', type: 'submit' }, rn ? 'Save' : 'Create'),
        h('button', { class: 'wl-btn wl-btn--secondary wl-btn--small', type: 'button', onclick: closePanel }, 'Cancel')));
      input.focus(); if (rn) input.select();
    }
    function addPanel(p) {
      const col = curCol(), input = h('input', { type: 'search', class: 'wf__in', autocomplete: 'off', spellcheck: 'false', 'aria-label': 'Search words to add', placeholder: 'Search words to add' }), res = h('div', { class: 'wf__res' });
      const fill = () => {
        res.textContent = '';
        const hits = WS.search(input.value).filter(e => !(e.cols || []).some(c => k(c) === k(col))).slice(0, 30);
        if (!hits.length) { res.append(h('p', { class: 'help' }, W.words.length ? 'No more words to add.' : 'Save some words first.')); return; }
        hits.forEach(e => res.append(h('div', { class: 'wf__add' }, h('strong', {}, e.w),
          h('button', { class: 'wl-btn wl-btn--secondary wl-btn--small', type: 'button', onclick: ev => { WS.addToCollection(e.w, col, true); refreshWords(); paintBar(); drawList(); fill(); } }, 'Add'))));
      };
      input.addEventListener('input', () => wfLater(fill));
      p.append(input, res, h('button', { class: 'wl-btn wl-btn--primary wl-btn--small', type: 'button', onclick: closePanel }, 'Done')); fill(); input.focus();
    }

    /* The footer of every card: its collections, and a Collections button that opens a wfTick list. Clicks here do not open the card. */
    function deco(card, e) {
      const row = h('div', { class: 'wf__acts' }), tags = h('span', { class: 'wf__tags' });
      const paintTags = () => { tags.textContent = ''; ((WS.get(e.w) || {}).cols || []).forEach(c => tags.append(h('span', { class: 'wf__tag' }, c))); };
      let box = null;
      const btn = h('button', { class: 'wl-btn wl-btn--secondary wl-btn--small', type: 'button', 'aria-expanded': 'false' }, 'Collections');
      btn.addEventListener('click', () => {
        const open = btn.getAttribute('aria-expanded') !== 'true'; btn.setAttribute('aria-expanded', String(open));
        if (!box) { box = h('div', { class: 'wf__pick', role: 'group', 'aria-label': 'Collections' }); card.append(box); wfTick(box, e.w, paintTags); }
        box.hidden = !open;
      });
      row.addEventListener('click', ev => ev.stopPropagation());
      paintTags(); row.append(tags, btn); card.append(row); return card;
    }
    function wfTick(box, w, changed) {
      box.textContent = ''; box.addEventListener('click', ev => ev.stopPropagation());
      const mine = ((WS.get(w) || {}).cols || []).map(k), cs = collections(WS.all());
      if (!cs.length) box.append(h('p', { class: 'help' }, 'No collections yet. Type a name below.'));
      cs.forEach(c => box.append(h('label', { class: 'wf__chk' },
        h('input', { type: 'checkbox', checked: mine.indexOf(k(c.name)) >= 0, onchange: ev => { WS.addToCollection(w, c.name, ev.target.checked); refreshWords(); paintBar(); changed(); } }),
        h('span', {}, c.name))));
      const input = h('input', { type: 'text', class: 'wf__in', maxlength: String(MAX_LEN), autocomplete: 'off', 'aria-label': 'New collection name', placeholder: 'New collection' });
      box.append(h('form', { class: 'wf__form', onsubmit: ev => {
        ev.preventDefault(); const r = create(input.value);
        if (!r.ok) { toast(r.why === 'limit' ? 'You can have up to 40 collections.' : 'Type a name for the collection.', 2400); return; }
        WS.addToCollection(w, r.name, true); refreshWords(); paintBar(); changed(); wfTick(box, w, changed);
      } }, input, h('button', { class: 'wl-btn wl-btn--secondary wl-btn--small', type: 'submit' }, 'Add')));
    }

    function ensure(list) {
      W.list = list; if (W.bar && W.bar.isConnected) return;
      const q = h('input', { type: 'search', class: 'wf__q', id: 'wf-q', placeholder: 'Search word, sentence or note', 'aria-label': 'Search my words', autocomplete: 'off', spellcheck: 'false', enterkeyhint: 'search', value: W.q });
      q.addEventListener('input', () => { if (!q.value.trim() && !W.q.trim()) return; wfLater(() => { W.q = q.value; drawList(); }); });
      W.rowF = h('div', { class: 'wf__row', role: 'group', 'aria-label': 'Filter words' });
      W.rowC = h('div', { class: 'wf__row', role: 'group', 'aria-label': 'Collections' });
      W.colbar = h('div', { class: 'wf__colbar', hidden: true });
      W.panel = h('div', { class: 'wf__panel wl-card', hidden: true });
      W.bar = h('div', { class: 'wf', id: 'wf-bar' }, q, W.rowF, W.rowC, W.colbar, W.panel);
      list.before(W.bar);
      W.go = h('button', { class: 'wl-btn wl-btn--primary wl-btn--block wf__go', type: 'button', id: 'wf-go', onclick: () => {
        if (RL.start()) return;   // the Review lesson (168); the old Review tab below stays as the fallback
        VOC.tab = 'review'; const sc = list.closest('.body'); if (sc) sc.scrollTop = 0; vocRender();
      } });
      W.dock = h('div', { class: 'wf__dock' }, W.go); list.after(W.dock);
    }
    function render(list, help, words) {
      W.words = words; W.help = help; W.base = help.textContent; ensure(list);
      W.bar.hidden = false; paintBar(); paintGo(); drawList();
    }
    function show(on) { if (!on && W.bar) { W.bar.hidden = true; W.dock.hidden = true; closePanel(); } }

    return { collections, books, find, create, rename, render, show };
  })();
