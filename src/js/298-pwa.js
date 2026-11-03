  /* ===== Install and offline: service worker + browser/status-bar colour =====
     sw.js (see src/pwa/) keeps the app page for offline use. The manifest and icons let a phone or desktop install
     the app. Everything here is optional polish: if anything fails, the app works exactly as before. */

  /* theme-color follows the app's own background, so the phone's status bar / browser bar matches whichever theme
     is on (auto, light, dark, sepia, high contrast). The head sets a first guess before the page paints. */
  function pwaThemeColor() {
    try {
      const m = document.querySelector('meta[name="theme-color"]'); if (!m) return;
      const c = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
      if (/^#[0-9a-f]{3,8}$/i.test(c) && m.getAttribute('content') !== c) m.setAttribute('content', c);
    } catch (e) { /* cosmetic only */ }
  }
  pwaThemeColor();
  try { new MutationObserver(pwaThemeColor).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] }); } catch (e) { /* not supported */ }
  try { const mq = matchMedia('(prefers-color-scheme: light)'); if (mq.addEventListener) mq.addEventListener('change', pwaThemeColor); else if (mq.addListener) mq.addListener(pwaThemeColor); } catch (e) { /* not supported */ }

  /* Service worker: registered after the page has finished loading, so it never competes with the first paint.
     Needs https (or localhost); a page opened from a file just skips it. */
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    const pwaRegister = () => navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(e => { try { if (window.__wtDiag) window.__wtDiag.add('sw', (e && e.message) || e); } catch (x) { /* ignore */ } });
    if (document.readyState === 'complete') pwaRegister(); else window.addEventListener('load', pwaRegister, { once: true });
  }

  /* Fast start: the saved page opens at once and the newest one is fetched in the background (sw.js). When a newer
     page has been saved, sw.js sends 'wt-update' and this offers a reload (once per visit). A reload keeps the open book. */
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    let told = false;
    navigator.serviceWorker.addEventListener('message', e => {
      if (told || !e.data || e.data.type !== 'wt-update') return;
      told = true;
      const bar = h('div', { class: 'upd-bar', role: 'status' }, h('span', {}, 'New version ready'),
        h('button', { type: 'button', class: 'btn small', onclick: () => { try { persist(); } catch (e) { /* the page still reloads */ } location.reload(); } }, 'Reload'),
        h('button', { type: 'button', class: 'upd-x', 'aria-label': 'Later', onclick: () => bar.remove() }, '\u2715'));
      document.body.append(bar);   // the newer page is already saved: Reload opens it and keeps the open book
    });
  }
  /* Settings shows which build this device runs, with a button that drops the saved page and reloads from the network. */
  { const WT_BUILD = '__WT_BUILD__';
    const v = $('#wt-ver'), u = $('#wt-upd');
    if (v) v.textContent = 'Version ' + WT_BUILD;
    if (u) u.addEventListener('click', async () => {
      u.disabled = true; u.textContent = 'Updating\u2026';
      try { if (window.caches) await caches.delete('wt-shell-v1'); const r = await navigator.serviceWorker.getRegistration(); if (r) await r.update(); } catch (e) { /* reload anyway */ }
      location.reload();
    });
  }

  /* Install button (Settings > Basics > Install Wordtrail).
     Android / desktop Chrome and Edge: the browser's own install offer is kept (head script -> window.__wtIP) and shown by the button.
     iPhone / iPad: there is no such offer, so the button explains Share > Add to Home Screen.
     The row is hidden when the app is already installed (opened from the home screen) or when neither case applies. */
  guideDoc('settings', 'Install Wordtrail', "Settings > Install Wordtrail adds the app to your home screen. It opens faster and works offline. The row is not shown once the app is installed.");
  const INST = { ev: window.__wtIP || null, done: false };
  const pwaStandalone = () => { try { return matchMedia('(display-mode: standalone)').matches || navigator.standalone === true; } catch (e) { return false; } };
  const pwaIOS = () => /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const pwaCanInstall = () => !INST.done && !pwaStandalone() && /^https?:$/.test(location.protocol) && (!!INST.ev || pwaIOS());
  async function pwaInstall() {
    const ev = INST.ev;
    if (!ev) { toast(pwaIOS() ? 'Tap Share, then Add to Home Screen.' : 'Use the browser menu: Install app.', 6000); return; }
    INST.ev = null;   // the browser lets an offer be used once
    try {
      ev.prompt();
      const c = await ev.userChoice;
      if (c && c.outcome === 'accepted') { INST.done = true; toast('Installing Wordtrail\u2026', 3500); }
      else toast('Not installed. You can still use the browser menu: Install app.', 5000);
    } catch (e) { toast('Could not start the install. Try the browser menu: Install app.', 5000); }
  }
  try {
    addEventListener('beforeinstallprompt', e => { e.preventDefault(); INST.ev = e; });
    addEventListener('appinstalled', () => { INST.done = true; INST.ev = null; toast('Wordtrail is installed.', 3500); });
  } catch (e) { /* no install events in this browser */ }

  /* Splash screen covers: keeps 24 real covers (title, author, image address) from the catalogue for the next launch, renewed every 3 days.
     Read by the splash script in 10-body-views.html. Kept in localStorage directly, so it is not synced to the account. */
  function splashRemember() {
    try {
      const old = parseInt(localStorage.getItem('wt:splash-t') || '0', 10) || 0;
      if (Date.now() - old < 3 * 864e5 && localStorage.getItem('wt:splash')) return;
      const eng = (CAT.books || []).filter(b => b.ia && b.cover && (!b.lang || /^english$/i.test(b.lang)));
      if (eng.length < 8) return;
      const pick = [];
      for (let i = 0; i < 24 && eng.length; i++) { const b = eng.splice(Math.floor(Math.random() * eng.length), 1)[0]; pick.push({ t: String(b.title || '').slice(0, 60), a: String(b.authors || '').split(',')[0].slice(0, 40), c: b.cover }); }
      localStorage.setItem('wt:splash', JSON.stringify(pick)); localStorage.setItem('wt:splash-t', String(Date.now()));
    } catch (e) { /* storage unavailable */ }
  }
