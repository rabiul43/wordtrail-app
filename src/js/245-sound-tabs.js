  /* ---------- Sound screen: tabs, layer dots and the "off" look ----------
     The four layer tabs (Ambient, Music, Opening, Story) show one panel at a time. A dot on a tab means that layer is on.
     While Sound is off the panel is dimmed and cannot be used (the saved settings are kept); flip the main switch first. */
  const SND_TABS = [['amb', 'Ambient'], ['mus', 'Music'], ['open', 'Opening'], ['story', 'Story']];
  function sndTabSelect(k, focus) {
    SND_TABS.forEach(([x]) => {
      const t = $('#snd-t-' + x), p = $('#snd-p-' + x), on = x === k;
      if (t) { t.setAttribute('aria-selected', on ? 'true' : 'false'); t.tabIndex = on ? 0 : -1; if (on && focus) t.focus(); }
      if (p) p.hidden = !on;
    });
  }
  function sndTabsPaint() {
    try {
      const body = $('#snd-body'); if (!body) return;
      const on = sndOn();
      body.toggleAttribute('data-off', !on);
      const st = $('#snd-state'); if (st) st.textContent = on ? 'On' : 'Off';
      const live = { amb: P.ambOn === true, mus: P.musOn === true, open: P.openOn !== false, story: P.ambCues !== false };
      SND_TABS.forEach(([k, n]) => {
        const d = $('#snd-d-' + k), t = $('#snd-t-' + k);
        if (d) d.hidden = !live[k];
        if (t) t.setAttribute('aria-label', n + (live[k] ? ', on' : ', off'));
      });
      const pn = $('#snd-panels'); if (pn) pn.inert = !on;   // the settings stay, but nothing can be changed while Sound is off
      ['#snd-vol', '#amb-sug-go'].forEach(id => { const e = $(id); if (e) e.disabled = !on; });
    } catch (e) { /* the tabs are cosmetic; the sound itself does not depend on them */ }
  }
  function sndTabsInit() {
    const bar = $('.snd-tabs'); if (!bar) return;
    bar.addEventListener('click', e => { const b = e.target.closest('.snd-tab'); if (b) sndTabSelect(b.dataset.p); });
    bar.addEventListener('keydown', e => {
      const ks = SND_TABS.map(x => x[0]), cur = ks.indexOf((e.target.closest('.snd-tab') || {}).dataset ? e.target.closest('.snd-tab').dataset.p : '');
      if (cur < 0) return;
      const rtl = document.documentElement.dir === 'rtl', fwd = rtl ? 'ArrowLeft' : 'ArrowRight', back = rtl ? 'ArrowRight' : 'ArrowLeft';
      let n = -1;
      if (e.key === fwd) n = (cur + 1) % ks.length; else if (e.key === back) n = (cur + ks.length - 1) % ks.length;
      else if (e.key === 'Home') n = 0; else if (e.key === 'End') n = ks.length - 1;
      if (n < 0) return;
      e.preventDefault(); sndTabSelect(ks[n], true);
    });
    const sheet = $('#sheet-amb');
    sheet.addEventListener('change', () => sndTabsPaint());   // a switch moved by hand: the dots follow (the control's own handler has already run)
    new MutationObserver(sndTabsPaint).observe(sheet, { attributes: true, attributeFilter: ['hidden'] });
    sndTabsPaint();
  }
