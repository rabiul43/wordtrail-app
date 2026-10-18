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
