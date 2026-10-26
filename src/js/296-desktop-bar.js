  /* ------ desktop: the bottom player bar on Home and the track list beside the text ------
     Styles are in src/css/98-desktop-layout.css (they only apply from 1100px wide). The bar reuses the existing player buttons and seek bar, so no
     audio code changes: back/forward click the dock buttons, the seek bar drives #seek. dtSeekSync is called from updateSeekUI (150). */
  const DT_WIDE = window.matchMedia ? window.matchMedia('(min-width: 1100px)') : { matches: false };
  function dtSeekSync(t, d) {
    const sk = $('#mini-seek'); if (!sk) return;
    $('#mini-cur').textContent = fmt(t);
    $('#mini-left').textContent = '-' + fmt(Math.max(0, d - t));
    sk.max = d || 100;
    if (!sk._drag) sk.value = t;
    sk.style.setProperty('--fill', (d ? Math.min(100, t / d * 100) : 0) + '%');
  }
  let dtKey = '';
  function dtTracks() {
    const box = $('#dt-tracks'); if (!box) return;
    const list = $('.dt-list', box), b = S.book;
    if (!DT_WIDE.matches || !b || !S.secs || !S.secs.length) { if (!b) { list.textContent = ''; dtKey = ''; } return; }
    const base = b.id + ':' + S.secs.length + ':', key = base + S.sec;
    if (key === dtKey) return;
    const same = dtKey.indexOf(base) === 0 && list.children.length === S.secs.length;
    dtKey = key;
    if (!same) {
      list.textContent = '';
      S.secs.forEach((s, i) => list.append(h('button', { class: 'dt-track', type: 'button', onclick: () => goTrack(i, 0, true) },
        h('span', { class: 'n' }, String(i + 1)), h('span', { class: 'tt' }, s.title || ('Track ' + (i + 1))), h('span', { class: 'd' }, S.durs[i] ? fmt(S.durs[i]) : ''))));
    }
    Array.from(list.children).forEach((r, i) => { if (i === S.sec) r.setAttribute('aria-current', 'true'); else r.removeAttribute('aria-current'); });
    const cur = list.children[S.sec]; if (cur && cur.scrollIntoView) cur.scrollIntoView({ block: 'nearest' });
  }
  function dtInit() {
    const sk = $('#mini-seek');
    if (sk) {
      sk.addEventListener('input', () => { sk._drag = true; el.seek.value = sk.value; sk.style.setProperty('--fill', (sk.value / (+sk.max || 1) * 100) + '%'); el.seek.dispatchEvent(new Event('input')); });
      sk.addEventListener('change', () => { sk._drag = false; el.seek.dispatchEvent(new Event('change')); });
    }
    const back = $('#mini-back'), fwd = $('#mini-fwd');
    if (back) back.addEventListener('click', () => $('#b-back15').click());
    if (fwd) fwd.addEventListener('click', () => $('#b-fwd15').click());
    ['#p-sub', '#p-title'].forEach(q => { const n = $(q); if (n && window.MutationObserver) new MutationObserver(dtTracks).observe(n, { childList: true, characterData: true, subtree: true }); });
    audio.addEventListener('loadedmetadata', dtTracks);
    if (DT_WIDE.addEventListener) DT_WIDE.addEventListener('change', dtTracks);
    dtTracks();
  }
  try { dtInit(); } catch (e) { /* the desktop extras are optional: the app works without them */ }
