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
      /* silent: the newer page is already saved and opens the next time the app starts */
    });
  }

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
