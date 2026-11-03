  /* ------ Kick off all homepage sections ------ */
  /* ------ Home skeletons: placeholders until each row's data arrives. A loader marks itself done, then
     skSweep removes any placeholder it left behind (offline, empty) and hides the section. ------ */
  const HSK = { done: {} };
  function skSweep(id) {
    const s = $('#' + id);
    if (s && s.querySelector('.sk')) { s.querySelectorAll('.sk').forEach(n => n.remove()); s.hidden = true; }
  }
  function homeSkeletons() {
    const show = (key, id, build) => { const s = $('#' + id); if (!s || HSK.done[key]) return; build(s); s.hidden = false; };
    show('daily', 'sec-botd', () => { const c = $('#botd-card'); c.textContent = ''; c.append(h('div', { class: 'col-sk hero-bd sk', 'aria-hidden': 'true' })); });
    show('picks', 'sec-picks', s => {
      s.textContent = '';
      const row = h('div', { class: 'hrow sk', 'aria-hidden': 'true' }); rowSkeletons(row, 5);
      s.append(h('div', { class: 'home-section-head sk', 'aria-hidden': 'true' }, h('div', { class: 'sk-head' }, h('div', { class: 'sk-l' }), h('div', { class: 'sk-l' }))), row);
    });
    show('cur', 'sec-newweek', () => rowSkeletons($('#newweek-row'), 6));
    show('cur', 'sec-collections', s => { s.textContent = ''; s.append(h('div', { class: 'col-sk bar sk', 'aria-hidden': 'true' })); });
  }

  /* ------ Book of the day + Trending: home.json is rebuilt daily by a GitHub job (build_home.py) ------ */
  const TTL_DAILY = 3 * 3600e3;
  async function getDaily() {
    const c = store.get('wt:daily', null);
    if (c && c.d && Date.now() - c.t < TTL_DAILY) return c.d;
    try {
      const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 10000);
      const r = await fetch('https://raw.githubusercontent.com/' + ghCfg().repo + '/main/home.json', { signal: ctl.signal }); clearTimeout(to);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const d = await r.json();
      if (d && d.v === 1) { store.set('wt:daily', { t: Date.now(), d }); return d; }
    } catch (e) { /* offline or not built yet: use the saved copy if there is one */ }
    return c && c.d ? c.d : null;
  }
  async function loadDaily() {
    try {
      await catLoad();
      if (!CAT.books) return;
      const d = await getDaily(); if (!d) return;
      const map = new Map(CAT.books.map(b => [b.id, b]));
      const pub = ({ _t, _a, _l, _g, ...b }) => b;
      const okLang = b => P.otherLangs || !b.lang || /^english$/i.test(b.lang);
      const bo = d.botd && map.get(String(d.botd.id)), card = $('#botd-card'), bsec = $('#sec-botd');
      if (bo) {
        const b = pub(bo);
        card.textContent = '';
        const hue = colHue(0, (parseInt(b.id, 10) || 0) + 3), blurb = d.botd.blurb || '';
        card.append(h('button', { class: 'botd-hero', type: 'button', style: '--h:' + hue, 'aria-label': 'Book of the day: ' + b.title + (b.authors ? ', ' + b.authors : ''), onclick: () => openDetail(b) },
          h('span', { class: 'botd-cover', 'aria-hidden': 'true' }, coverNode(b)),
          h('span', { class: 'botd-body' },
            h('span', { class: 'botd-k' }, 'Book of the day'),
            h('span', { class: 'botd-t' }, b.title),
            h('span', { class: 'botd-a' }, b.authors || ''),
            blurb ? h('span', { class: 'botd-b' }, blurb) : null,
            h('span', { class: 'botd-go' }, svgIcon('#i-play'), 'Listen'))));
        bsec.hidden = false; RW.botd = b.id;
      } else { bsec.hidden = true; RW.botd = null; }
      newWeekPaint();
      const books = (d.trending || []).map(i => map.get(String(i))).filter(b => b && okLang(b)).slice(0, 20).map(pub);
      POP.list = books.slice(0, 8);
      RW.trending = books.length >= 3 ? books : [];   // fewer than three is not a row (colExtraPaint hides it)
      colExtraPaint();   // Trending is the top row, so Featured and Recently added repaint without its books
    } catch (e) { /* the rows stay hidden */ }
    finally { HSK.done.daily = true; skSweep('sec-botd'); }
  }


  /* ------ New this week + Editor's Collections: curation.json is rebuilt daily by build_curation.py ------ */
  async function getCuration() {
    const c = store.get('wt:curation', null);
    if (c && c.d && Date.now() - c.t < TTL_DAILY) return c.d;
    try {
      const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 10000);
      const r = await fetch('https://raw.githubusercontent.com/' + ghCfg().repo + '/main/curation.json', { signal: ctl.signal }); clearTimeout(to);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const d = await r.json();
      if (d && d.v === 1) { store.set('wt:curation', { t: Date.now(), d }); return d; }
    } catch (e) { /* not built yet or offline: use the saved copy */ }
    return c && c.d ? c.d : null;
  }
  /* One build of curation.json against the catalog, shared by the Home teaser and the Collections tab. */
  async function curBuild(max) {
    await catLoad();
    if (!CAT.books) return null;
    const d = (await getCuration()) || {};
    const map = new Map(CAT.books.map(b => [b.id, b]));
    const pub = ({ _t, _a, _l, _g, ...b }) => b;
    const okLang = b => P.otherLangs || !b.lang || /^english$/i.test(b.lang);
    const pick = ids => (ids || []).map(i => map.get(String(i))).filter(b => b && okLang(b)).slice(0, max).map(pub);
    const cols = (d.collections || []).map((c, i) => ({ key: String(c.id || c.slug || i), title: c.title || '', blurb: c.blurb || '', group: c.group || '', books: pick(c.ids) })).filter(c => c.title && c.books.length >= 3);
    const lowT = c => c.title.toLowerCase();
    const gs = genreShelves(max, okLang, pub, new Set(cols.map(c => genreTopic(c.title))));
    const shown = new Set(); gs.main.forEach(m => (GEN_MAIN.find(g => g.key === m.key).tp || []).forEach(t => shown.add(t)));   // topics the "Browse by genre" rows already cover
    const cols2 = cols.filter(c => { const t = genreTopic(c.title); if (shown.has(t)) return false; if (/genre/i.test(c.group) && GEN_MAIN.some(g => g.test(lowT(c)))) return false; shown.add(t); return true; });   // a curated "Mystery" shelf would repeat the Detective row; two curated shelves on one topic keep the first
    return { nw: pick(d.new), cols: cols2, gen: gs.main, all: gs.all };
  }
  /* Genre shelves, built from the catalog already on the device (each book carries its LibriVox genre names).
     "Browse by genre" are the big six, shown as rows of covers; "All genres" is every genre with enough books,
     shown as tiles at the bottom. Books with a cover and a text edition come first, shuffled a little each day. */
  const GEN_MAIN = [
    { key: 'g-scifi-horror', tp: ['scifi', 'horror'], title: 'Sci-Fi & Horror', blurb: 'Strange worlds, and things that go bump in the night.', test: g => /science fiction|sci-?fi|horror|supernatural/.test(g) },
    { key: 'g-romance', tp: ['romance'], title: 'Romance', blurb: 'Love stories, from drawing rooms to the wild.', test: g => /romance/.test(g) },
    { key: 'g-children', tp: ['children'], title: 'Children', blurb: 'Stories and tales for younger listeners.', test: g => /child/.test(g) },
    { key: 'g-detective', tp: ['mystery'], title: 'Detective Fiction & Mysteries', blurb: 'Clues, culprits and cunning detectives.', test: g => /detect|mystery|crime/.test(g) },
    { key: 'g-fiction', tp: ['fiction'], title: 'Fiction', blurb: 'Novels and stories, old and new.', test: g => /fiction/.test(g.replace(/non[- ]?fiction/g, '')) },
    { key: 'g-nonfiction', tp: ['nonfiction'], title: 'Non-fiction', blurb: 'Biography, history, essays and ideas.', test: g => /non[- ]?fiction|biograph|history|essay|philosoph|travel|religio|politic|memoir|nature|economic|psycholog/.test(g.replace(/science fiction|historical fiction/g, '')) }
  ];
  const GEN = { k: '', v: null };
  function genreShelves(max, okLang, pub, skip) {
    const day = new Date().toISOString().slice(0, 10), k = [CAT.books.length, day, max, !!P.otherLangs, [...skip].join(',')].join('|');
    if (GEN.k === k && GEN.v) return GEN.v;
    const pool = CAT.books.filter(b => b._g && okLang(b));
    const sep = /[,;|\/]+/, title = t => t.replace(/(^|[\s&(-])[a-z]/g, m => m.toUpperCase());
    const take = (test, key) => pool.filter(b => test(b._g))
      .map(b => [b, (b.ia ? 1 : 0) + (b.textUrl ? 1 : 0) + (b.total >= 1800 ? .5 : 0) + (covHash(day + key + b.id) % 1000) / 1000])
      .sort((x, y) => y[1] - x[1]).slice(0, max).map(x => pub(x[0]));
    const main = GEN_MAIN.map(g => ({ key: g.key, title: g.title, blurb: g.blurb, group: 'Browse by genre', books: take(g.test, g.key) })).filter(c => c.books.length >= 3);
    /* Every genre becomes one tile, except: topics the six rows above already cover (by name), genres whose name
       is the same as another once words like "fiction" are ignored, genres already shown as a curated shelf, and
       genres that are mostly the same books as a bigger one ("Mystery & Detection" next to "Detective Fiction"). */
    const covered = /science fiction|sci-?fi|horror|supernatural|romance|child|detect|mystery|crime|^(general |literary )?fiction$|^non[- ]?fiction$/;
    const norm = genreTopic;
    const sets = new Map();
    pool.forEach(b => new Set(b._g.split(sep).map(x => x.trim()).filter(Boolean)).forEach(t => { if (!sets.has(t)) sets.set(t, new Set()); sets.get(t).add(b.id); }));
    const seen = new Set(skip), kept = [], all = [];
    main.forEach(m => (GEN_MAIN.find(g => g.key === m.key).tp || []).forEach(t => seen.add(t)));
    [...sets].filter(([t, st]) => st.size >= 8 && t.length > 2 && t.length < 40).sort((a, b) => b[1].size - a[1].size).forEach(([t, st]) => {
      if (all.length >= 30 || covered.test(t)) return;
      const n = norm(t); if (!n || seen.has(n)) return;
      for (const o of kept) { let hit = 0; st.forEach(id => { if (o.has(id)) hit++; }); if (hit / st.size >= .85) return; }
      const books = take(g => g.split(sep).some(x => x.trim() === t), 'all' + t);
      if (books.length < 3) return;
      seen.add(n); kept.push(st);
      all.push({ key: 'g-' + seSlug(t), title: title(t), blurb: '', group: 'All genres', n: st.size, books });
    });
    GEN.k = k; GEN.v = { main, all };
    return GEN.v;
  }
  async function loadCuration() {
    try {
      const d = await curBuild(20); if (!d) return;
      RW.nw = d.nw; newWeekPaint();   // New this week skips books already in Picked for you
      // Home keeps one compact card that opens the Collections tab.
      const wrap = $('#sec-collections'); wrap.textContent = '';
      const shelves = colShelves(d);
      if (shelves.length) {
        const covers = colFan({ books: shelves.slice(0, 3).map(c => c.books[0]) });
        wrap.append(h('button', { class: 'col-card', type: 'button', style: '--h:' + colHue(shelves[0].key, 0), onclick: () => { COL.open = null; showTab('collections', true); } },
          covers,
          h('span', { class: 'cc-t' }, h('strong', {}, 'Browse collections'), h('small', {}, shelves.length + ' curated shelves \u00b7 ' + shelves.slice(0, 3).map(c => c.title).join(' \u00b7 '))),
          svgIcon('#i-go')));
      }
      wrap.hidden = !shelves.length;
    } catch (e) { /* the rows stay hidden */ }
    finally { HSK.done.cur = true; skSweep('sec-newweek'); skSweep('sec-collections'); }
  }

  /* ---------- Customise home (Settings > Reading) ----------
     Home shows Continue listening first, then ONE hero card, then at most HC_ROWS rows. The hero is the time-of-day
     card when it has something to say, otherwise Book of the day (never both). Rows are Picked for you, New this
     week and Collections, in page order. Each part has a switch in Settings; the ones switched off are kept in
     P.homeOff (a list of keys), saved with the other prefs, so a new row is on until someone turns it off.
     The loaders above and in 120 keep deciding by themselves when a section has content (they set `hidden`);
     this code only adds classes on top: .hh-off (switched off) and .hh-cap (one card / three rows already shown),
     both display:none in 70-collections-detail-motion.css. A MutationObserver re-checks whenever a section's
     `hidden` changes, so the order in which the loaders finish does not matter. */
  const HC_ROWS = 3;
  const HC_ITEMS = [
    ['recents', 'recents', 'Continue listening', 'Your books in progress'],
    ['tod', 'sec-tod', 'Time-of-day card', 'Morning review or bedtime story'],
    ['botd', 'sec-botd', 'Book of the day', 'Shown when there is no time-of-day card'],
    ['picks', 'sec-picks', 'Picked for you', 'Suggestions from your listening'],
    ['newweek', 'sec-newweek', 'New this week', 'Fresh arrivals in the library'],
    ['collections', 'sec-collections', 'Collections', 'Curated shelves']
  ];
  const hcOff = () => new Set(Array.isArray(P.homeOff) ? P.homeOff : []);
  function homeApply() {
    const off = hcOff(), g = id => document.getElementById(id), live = id => { const e = g(id); return !!e && !e.hidden; };
    HC_ITEMS.forEach(([k, id]) => { const e = g(id); if (e) e.classList.toggle('hh-off', off.has(k)); });
    const botd = g('sec-botd'); if (botd) botd.classList.toggle('hh-cap', !off.has('tod') && live('sec-tod'));   // one hero card
    let rows = 0;
    ['sec-picks', 'sec-newweek', 'sec-collections'].forEach(id => {
      const e = g(id); if (!e) return;
      const on = live(id) && !e.classList.contains('hh-off');
      e.classList.toggle('hh-cap', on && ++rows > HC_ROWS);   // at most three rows
    });
  }
  function homeCustInit() {
    homeApply();
    try { const mo = new MutationObserver(homeApply); HC_ITEMS.forEach(([, id]) => { const e = document.getElementById(id); if (e) mo.observe(e, { attributes: true, attributeFilter: ['hidden'] }); }); } catch (e) { /* the classes still apply on every change of the switches */ }
  }
  /* the switches in Settings > Reading; called every time Settings opens (fillSettings in 290) */
  function homeCustPaint() {
    const box = $('#hc-list'); if (!box) return;
    const off = hcOff();
    box.textContent = '';
    HC_ITEMS.forEach(([k, , name, note]) => {
      const id = 'hc-' + k, cb = h('input', { id, type: 'checkbox', 'aria-describedby': id + '-d' });
      cb.checked = !off.has(k);
      cb.addEventListener('change', () => {
        const now = hcOff(); if (cb.checked) now.delete(k); else now.add(k);
        P.homeOff = [...now]; savePrefs(); homeApply();
      });
      box.append(h('div', { class: 'row hc-row' }, h('label', { for: id }, h('span', { class: 'hc-n' }, name), h('small', { id: id + '-d', class: 'hc-s' }, note)), cb));
    });
  }
  guideDoc('home', 'Customise home', "Settings > Reading > Customise home has a switch for each part of the Library tab. Continue listening always comes first, then one card (the time-of-day card when it has something for you, otherwise Book of the day), then up to three rows: Picked for you, New this week and Collections. Turn a part off and it disappears from Home; the next one moves up.", '2026-10-19');

  guideDoc('collections', 'Browse shelves', "Collections are curated shelves such as Trending and New this week, rebuilt daily. Tap See all for a whole shelf, then sort it, hide books you have heard, or tap Surprise me.");
