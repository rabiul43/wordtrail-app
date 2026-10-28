  /* ---------- Virtual lists ----------
     vlist(host, items, make, opts) fills `host` with one node per item, but only keeps the rows near the screen in the page.
     The rest is replaced by padding at the top and bottom of `host`, so the page keeps its full height and the scroll bar is right.
       host   the list element (the page scrolls, not the host)
       items  array of anything
       make   (item, index) => Element   (called when a row comes near the screen, again if it was dropped and comes back)
       opts   { min: 60 }   lists shorter than this are drawn in full, exactly as before
              { est: 110 }  guess for the height of a row not measured yet (px; replaced by the real height as rows are drawn)
     Returns { destroy, count, scrollTo(i) } and also keeps it on host._vl. Call vlist again on the same host to replace it.
     Heights are measured, so rows may differ in height (a row that grows later is picked up by ResizeObserver).
     Ctrl+F finds only rows that are drawn; that is the price of a light page. */
  function vlist(host, items, make, opts) {
    opts = opts || {};
    if (host._vl) host._vl.destroy();
    host.textContent = '';
    const MIN = opts.min || 60;
    if (items.length < MIN || typeof requestAnimationFrame !== 'function') {
      const nodes = items.map(make);
      host.append(...nodes);
      const plain = { destroy() { host._vl = null; }, count: items.length, nodes, scrollTo(i) { const n = nodes[i]; if (n) n.scrollIntoView({ block: 'start' }); } };
      host._vl = plain; return plain;
    }
    const n = items.length, hs = new Array(n).fill(0);   // measured heights (row + gap), 0 = not measured yet
    let est = opts.est || 110, sumM = 0, cntM = 0;
    let a = 0, b = 0, gap = 0, raf = 0, dead = false;
    let PT = 0, PB = 0, dirty = false, lastT = '', lastB = '';   // PT: height above row a (padding), PB: below row b; dirty: a row changed size since the last refit
    const live = new Map();                               // index -> node currently in the page
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(es => { for (const e of es) { const i = e.target._vi; if (i != null && live.get(i) === e.target) { setH(i, e.target.offsetHeight + gap); dirty = true; } } schedule(); }) : null;
    const hro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => schedule()) : null;   // wakes up when a hidden view is shown
    if (hro) hro.observe(host);
    host.style.overflowAnchor = 'none';                   // we correct the scroll position ourselves
    const hOf = i => hs[i] || est;
    function setH(i, v) { if (v <= 0) return; if (!hs[i]) { sumM += v; cntM++; } else sumM += v - hs[i]; hs[i] = v; }
    function pads(from, to) {
      let top = 0, bot = 0;
      for (let i = 0; i < from; i++) top += hOf(i);
      for (let i = to; i < n; i++) bot += hOf(i);
      PT = top; PB = bot;
      const t = Math.round(top) + 'px', bb = Math.round(bot) + 'px';   // writing padding makes the browser lay the page out again, so only write a real change
      if (t !== lastT) { host.style.paddingTop = lastT = t; }
      if (bb !== lastB) { host.style.paddingBottom = lastB = bb; }
    }
    function range() {
      const vh = window.innerHeight || 700, buf = vh * 1.5;
      const r = host.getBoundingClientRect();
      const y0 = -r.top - buf, y1 = -r.top + vh + buf;   // visible band in host coordinates (padding included)
      let y = PT, from = a;   // PT is the height above row a: start there and move only as far as the scroll has moved
      while (from > 0 && y > y0) { from--; y -= hOf(from); }
      while (from < n && y + hOf(from) < y0) { y += hOf(from); from++; }
      let to = from, yy = y;
      while (to < n && yy < y1) { yy += hOf(to); to++; }
      return [from, Math.max(to, Math.min(n, from + 1))];
    }
    function update() {
      raf = 0;
      if (dead || !host.isConnected || host.offsetParent === null) return;   // hidden view: nothing to measure
      const [from, to] = range();
      if (from === a && to === b && live.size) { if (!ro) { for (const [i, node] of live) setH(i, node.offsetHeight + gap); dirty = true; }   // no ResizeObserver: measure as before
        if (dirty) { dirty = false; refit(); } return; }   // same rows as last time: nothing to measure
      gap = parseFloat(getComputedStyle(host).rowGap) || 0;   // read only when rows are added or dropped
      /* keep one row that stays on screen as the anchor, so padding changes never move what the person is reading */
      let anchor = null, top0 = 0;
      for (const [i, node] of live) if (i >= from && i < to) { anchor = node; top0 = node.getBoundingClientRect().top; break; }
      for (const [i, node] of live) if (i < from || i >= to) { if (ro) ro.unobserve(node); node.remove(); live.delete(i); }
      let firstKept = null;
      for (const [i, node] of live) if (firstKept === null || i < firstKept._vi) firstKept = node;
      const head = document.createDocumentFragment(), tail = document.createDocumentFragment(), add = [];
      for (let i = from; i < to; i++) if (!live.has(i)) {
        const node = make(items[i], i); node._vi = i; live.set(i, node); add.push(node);
        (firstKept && i < firstKept._vi ? head : tail).append(node);
      }
      if (firstKept) host.insertBefore(head, firstKept); else host.append(head);
      host.append(tail);
      a = from; b = to;
      for (const node of add) if (ro) ro.observe(node);
      measure(add);
      if (anchor && anchor.isConnected) { const d = anchor.getBoundingClientRect().top - top0; if (Math.abs(d) > 0.5) window.scrollBy(0, d); }
    }
    function measure(add) {   // only the rows just drawn are read; the others are watched by the ResizeObserver
      for (const node of add) setH(node._vi, node.offsetHeight + gap);
      refit();
    }
    function refit() { if (cntM) est = sumM / cntM; pads(a, b); }
    function schedule() { if (!raf && !dead) raf = requestAnimationFrame(update); }
    const onScroll = () => schedule();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    pads(0, 0);   // all height is "below" until the first update has run
    update();
    const api = {
      count: n,
      destroy() { dead = true; if (raf) cancelAnimationFrame(raf); if (ro) ro.disconnect(); if (hro) hro.disconnect(); window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onScroll); host.style.paddingTop = host.style.paddingBottom = host.style.overflowAnchor = ''; live.clear(); host._vl = null; },
      scrollTo(i) { let y = 0; for (let k = 0; k < i; k++) y += hOf(k); window.scrollTo(0, window.scrollY + host.getBoundingClientRect().top + y - 70); schedule(); }
    };
    host._vl = api; return api;
  }
