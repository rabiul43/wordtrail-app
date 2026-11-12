  /* ---------- Learn hub and tile registry (LearnHub) ----------
     The Learn side of My Library (switch in 169) shows a grid of tiles. The hub knows no feature: it draws only what has been registered.
       LearnHub.register({ id, title, subtitle, icon, open, badge })   add a tile, or replace the tile with the same id (never two)
           title, subtitle  text, or a function returning text (worked out each time the hub is drawn)
           icon             one short glyph, e.g. '★'
           open             function called on tap; it opens the feature the usual way (a sheet, a lesson layer), so Back and history work as before
           badge            optional: a number, or a function returning one; 0 or empty = no badge (gold badge, hidden in Calm mode)
           order            optional number; tiles are sorted by order, then by the order they were registered
           player           optional: false keeps the tile out of the "Study this chapter" sheet in the player (169e); default true
           playerSubtitle   optional: text, or a function(ctx) returning text, used instead of subtitle inside that sheet.
                            ctx = { book, bookId, chapter (index, -1 if unknown), chapterTitle, track, time (seconds) }; open(ctx) gets the same ctx there
       LearnHub.head(fn)        fn() returns a node (or null) drawn ABOVE the tiles each time the hub is drawn; used by the IELTS hub (169o) when an exam is on
       LearnHub.unregister(id)  LearnHub.has(id)  LearnHub.list()  LearnHub.refresh()  (redraws when Learn is on screen)
     The hub is drawn by LSW.render (169), each time Learn opens. A tile whose functions throw is skipped, never the whole hub.
     Styles 94h-learn-hub.css. Tiles that are registered here: My Words, Review (at the end of this file). */
  const LearnHub = (() => {
    const tiles = [], heads = [];
    let seq = 0;
    const val = (v, a) => { try { return typeof v === 'function' ? v(a) : v; } catch (e) { return ''; } };
    function register(t) {
      if (!t || typeof t.id !== 'string' || !t.id || typeof t.open !== 'function' || !t.title) return false;
      const rec = { id: t.id, title: t.title, subtitle: t.subtitle || '', icon: t.icon || '', open: t.open, badge: t.badge, order: typeof t.order === 'number' ? t.order : 0, inPlayer: t.player !== false, ps: t.playerSubtitle, seq: seq++ };
      const i = tiles.findIndex(x => x.id === t.id);
      if (i >= 0) { rec.seq = tiles[i].seq; tiles[i] = rec; } else tiles.push(rec);
      return true;
    }
    function unregister(id) { const i = tiles.findIndex(x => x.id === id); if (i >= 0) tiles.splice(i, 1); return i >= 0; }
    const list = () => tiles.slice().sort((a, b) => a.order - b.order || a.seq - b.seq);
    function tile(t, ctx, go) {   // ctx and go are used only by the player sheet (169e): go(fn) closes the sheet, then runs fn
      const n = Number(val(t.badge)) || 0;
      const b = h('button', { type: 'button', class: 'wl-card wl-card--tap lhub-tile', 'data-tile': t.id });
      b.append(
        h('span', { class: 'lhub-top' }, h('span', { class: 'lhub-ic', 'aria-hidden': 'true' }, String(val(t.icon) || '')), n > 0 ? h('span', { class: 'wl-badge lhub-badge', 'aria-hidden': 'true' }, n > 99 ? '99+' : String(n)) : ''),
        h('span', { class: 'lhub-title' }, String(val(t.title) || '')),
        h('span', { class: 'lhub-sub' }, String((ctx && t.ps != null ? val(t.ps, ctx) : val(t.subtitle)) || ''))
      );
      b.addEventListener('click', () => { const run = () => { try { t.open(ctx); } catch (e) { toast('Could not open that.', 1800); } }; if (go) go(run); else run(); });
      return b;
    }
    const emptyView = LSW.render;   // the empty state from 169, shown while nothing is registered
    function draw(host) {
      const ts = list(), top = [];
      heads.forEach(fn => { try { const n = fn(); if (n) top.push(n); } catch (e) { /* a broken head is skipped */ } });
      if (!ts.length && !top.length) { emptyView(host); return; }
      const grid = h('div', { class: 'lhub-grid' });
      ts.forEach(t => { try { grid.append(tile(t)); } catch (e) { /* skip a broken tile */ } });
      host.textContent = ''; top.forEach(n => host.append(n)); if (ts.length) host.append(grid);
    }
    function refresh() { if (!$('#shelf-learn').hidden) applyShelfMode(); }
    return { head: fn => { if (typeof fn === 'function' && heads.indexOf(fn) < 0) heads.push(fn); }, register, unregister, has: id => tiles.some(x => x.id === id), list, tile, draw, refresh };
  })();
  LSW.render = LearnHub.draw;

  /* My Words and Review: the two tiles that exist today. They open what was always there. */
  LearnHub.register({
    id: 'words', order: 10, icon: '★', title: 'My Words',
    subtitle: () => { const n = WS.all().length; return n ? n + ' saved' : 'Nothing saved yet'; },
    open: () => vocOpen('mine')
  });
  LearnHub.register({
    id: 'review', order: 20, icon: '↻', title: 'Review',
    subtitle: () => { const n = LSW.dueN(); return n ? n + ' due' : 'Nothing due'; },
    badge: () => LSW.dueN(),
    open: () => { if (!RL.start()) vocOpen('review'); }   // the Review lesson (168); the old Review tab stays as the fallback
  });
