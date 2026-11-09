  /* ---------- Story timeline (book page) ----------
     The numbered list of major events of a story, in order. Built offline by kaggle_make_timelines.py from the
     Wikipedia plot of the book and saved in the Hugging Face dataset rabiul43/Story_Timeline (timelines.json).
     Only entries with status "OK" are shown (REVIEW ones wait for a human look). The file is read once, kept in
     IndexedDB for three days, and a book without an entry simply has no section. Wikipedia text is CC BY-SA. */
  const TL = { map: null, p: null, base: 'https://huggingface.co/datasets/rabiul43/Story_Timeline/resolve/main/', key: 'timelines:v2', show: 4 };
  /* timelines.json (from the Wikipedia plot, status OK) and timelines_ai.json (written by AI from the book text, status AI).
     A Wikipedia timeline wins when a book has both. REVIEW and AI_REVIEW entries are never shown. */
  function tlInflate(wiki, ai) {   // -> Map(id -> { e: [[title, text]], u: wiki url, ai: true for AI-written })
    const m = new Map();
    const add = (j, okStatus, isAi) => Object.keys(j || {}).forEach(id => {
      const r = j[id];
      if (!r || r.status !== okStatus || !Array.isArray(r.events) || m.has(String(id))) return;
      const e = r.events.filter(x => x && x.title && x.description).map(x => [String(x.title), String(x.description)]);
      if (e.length >= 3) m.set(String(id), { e, u: r.wiki_url || '', ai: isAi });
    });
    add(wiki, 'OK', false); add(ai, 'AI', true);
    return m;
  }
  async function tlGetJson(name) {   // null when the file does not exist yet or the network fails
    const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 20000);
    try { const r = await fetch(TL.base + name, { signal: ctl.signal }); if (!r.ok) return null; const j = await r.json(); return j && typeof j === 'object' ? j : null; }
    catch (e) { return null; } finally { clearTimeout(to); }
  }
  function tlLoad() {
    if (TL.p) return TL.p;
    TL.p = (async () => {
      let d = null;
      try { d = await idb.get(TL.key); } catch (e) { /* no saved copy */ }
      if (d && d.w) TL.map = tlInflate(d.w, d.a);
      if (d && d.w && Date.now() - (d.fetched || 0) < 3 * 24 * 3600e3) return TL.map;
      const [w, a] = await Promise.all([tlGetJson('timelines.json'), tlGetJson('timelines_ai.json')]);   // offline or slow: the saved copy (if any) is used
      if (w || a) { const nd = { w: w || (d && d.w) || {}, a: a || (d && d.a) || {}, fetched: Date.now() }; idb.set(TL.key, nd); TL.map = tlInflate(nd.w, nd.a); }
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
      rec.ai ? h('p', { class: 'wp-src' }, 'Written by AI from the book\u2019s text. It may contain mistakes.')
        : h('p', { class: 'wp-src' }, 'Based on the plot on ', rec.u ? h('a', { href: rec.u, target: '_blank', rel: 'noopener noreferrer' }, 'Wikipedia') : 'Wikipedia', ' \u00b7 CC BY-SA'));
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
