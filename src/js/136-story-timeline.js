  /* ---------- Story timeline (book page) ----------
     The numbered list of major events of a story, in order. Built offline by kaggle_make_timelines.py from the
     Wikipedia plot of the book and saved in the Hugging Face dataset rabiul43/Story_Timeline (timelines.json).
     Only entries with status "OK" are shown (REVIEW ones wait for a human look). The file is read once, kept in
     IndexedDB for three days, and a book without an entry simply has no section. Wikipedia text is CC BY-SA. */
  const TL = { map: null, p: null, url: 'https://huggingface.co/datasets/rabiul43/Story_Timeline/resolve/main/timelines.json', key: 'timelines:v1', show: 4 };
  function tlInflate(j) {   // { id: { status, events: [{title, description}], wiki_url } } -> Map(id -> { e: [[title, text]], u })
    const m = new Map();
    Object.keys(j || {}).forEach(id => {
      const r = j[id];
      if (!r || r.status !== 'OK' || !Array.isArray(r.events) || r.events.length < 3) return;
      const e = r.events.filter(x => x && x.title && x.description).map(x => [String(x.title), String(x.description)]);
      if (e.length >= 3) m.set(String(id), { e, u: r.wiki_url || '' });
    });
    return m;
  }
  function tlLoad() {
    if (TL.p) return TL.p;
    TL.p = (async () => {
      let d = null;
      try { d = await idb.get(TL.key); } catch (e) { /* no saved copy */ }
      if (d && d.j) TL.map = tlInflate(d.j);
      if (d && d.j && Date.now() - (d.fetched || 0) < 3 * 24 * 3600e3) return TL.map;
      try {
        const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 20000);
        const r = await fetch(TL.url, { signal: ctl.signal }); clearTimeout(to);
        if (r.ok) { const j = await r.json(); if (j && typeof j === 'object') { idb.set(TL.key, { j, fetched: Date.now() }); TL.map = tlInflate(j); } }
      } catch (e) { /* offline or slow: the saved copy (if any) is used */ }
      if (!TL.map) TL.p = null;   // nothing at all yet: try again on the next book page
      return TL.map;
    })();
    return TL.p;
  }
  function tlShow(sec, rec) {
    const list = h('ol', { class: 'tl-list' });
    rec.e.forEach(([t, x], i) => list.append(h('li', { class: 'tl-item' + (i >= TL.show ? ' tl-extra' : '') + (i === 0 ? ' tl-first' : '') },
      h('span', { class: 'tl-n', 'aria-hidden': 'true' }, String(i + 1)), h('div', { class: 'tl-body' }, h('b', {}, t), h('p', {}, x)))));
    const extra = rec.e.length - TL.show;
    let open = false;
    const more = h('button', { class: 'sec-more', type: 'button', 'aria-expanded': 'false', onclick: () => {
      open = !open; list.classList.toggle('tl-open', open); more.setAttribute('aria-expanded', String(open));
      more.textContent = open ? 'Show less' : 'Show all ' + rec.e.length + ' events';
    } }, 'Show all ' + rec.e.length + ' events');
    sec.textContent = '';
    sec.append(h('div', { class: 'home-section-head' }, h('h2', {}, 'Story timeline')),
      h('p', { class: 'tl-warn' }, 'Contains spoilers'), list, ...(extra > 0 ? [more] : []),
      h('p', { class: 'wp-src' }, 'Based on the plot on ', rec.u ? h('a', { href: rec.u, target: '_blank', rel: 'noopener noreferrer' }, 'Wikipedia') : 'Wikipedia', ' \u00b7 CC BY-SA'));
    sec.hidden = false;
  }
  function tlSection(b) {   // returns the (still hidden) section; it fills itself in when the timeline is known
    const sec = h('section', { class: 'home-section tl-sec', hidden: true, 'aria-label': 'Story timeline' });
    if (b && b.id) tlLoad().then(map => {
      const rec = map && map.get(String(b.id));
      if (rec && DET.book === b) tlShow(sec, rec);
    }).catch(() => { /* no timeline section */ });
    return sec;
  }
