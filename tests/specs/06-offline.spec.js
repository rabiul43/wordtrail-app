const { test, expect } = require('../helpers/test');
const { mockNetwork } = require('../helpers/mock-network');
const { startApp, search } = require('../helpers/app');
const server = require('../serve');

// The offline test needs its own server it can really switch off (the shared one must keep running for the other specs).
test('the page reloads with no connection', async ({ browser }) => {
  const app = await server.start();                         // own copy of the app on a free port
  const context = await browser.newContext({ serviceWorkers: 'allow', baseURL: app.url, viewport: { width: 412, height: 800 } });
  const mock = await mockNetwork(context);
  // Playwright's fake network cannot see what a service worker fetches itself, and sw.js fetches catalog.json itself. So the worker
  // is held back (page.evaluate sets window.__allowSW below) until the app has fetched the catalog through the fake network and saved
  // it: then the saved catalog is the test one every time, not whichever answer happened to arrive first.
  await context.addInitScript(() => {
    const sw = navigator.serviceWorker;
    if (!sw || !sw.register) return;
    const real = sw.register.bind(sw);
    sw.register = async (...args) => {
      if (await sw.getRegistration()) return real(...args);                  // already installed (after a reload): nothing to hold back
      for (let i = 0; i < 600 && !window.__allowSW; i++) await new Promise(r => setTimeout(r, 50));
      return real(...args);
    };
  });
  const page = await context.newPage();
  try {
    // 1. online first visit: the catalog is saved first, then the service worker installs and keeps the page
    await startApp(page);
    await expect.poll(() => page.evaluate(() => new Promise(res => {
      const open = indexedDB.open('wordtrail', 1);
      open.onerror = () => res(false);
      open.onsuccess = () => { const q = open.result.transaction('texts').objectStore('texts').get('catalog'); q.onsuccess = () => res(!!(q.result && q.result.b && q.result.b.length)); q.onerror = () => res(false); };
    })), { message: 'the catalog should be saved on the device before the service worker starts' }).toBe(true);
    await page.evaluate(() => { window.__allowSW = true; });
    await page.evaluate(() => navigator.serviceWorker.ready);
    await expect.poll(() => page.evaluate(async () => {
      const keys = await caches.keys();
      return keys.includes('wt-shell-v1') && (await (await caches.open('wt-shell-v1')).keys()).length > 0;
    }), { message: 'the service worker should have saved the page' }).toBe(true);
    // the catalog is saved in the browser too (IndexedDB "wordtrail" > "texts" > "catalog"): it is what makes search work offline
    await expect.poll(() => page.evaluate(() => new Promise(res => {
      const open = indexedDB.open('wordtrail', 1);
      open.onerror = () => res(false);
      open.onsuccess = () => { const q = open.result.transaction('texts').objectStore('texts').get('catalog'); q.onsuccess = () => res(!!(q.result && q.result.b && q.result.b.length)); q.onerror = () => res(false); };
    })), { message: 'the catalog should be saved on the device' }).toBe(true);

    // 2. go offline for real: the server is switched off and every outside request fails
    mock.mocks.offline = true;
    await app.stop();
    await expect(page.evaluate(url => fetch(url, { cache: 'no-store' }).then(() => 'reachable', () => 'unreachable'), app.url)).resolves.toBe('unreachable');

    // 3. reload: the app still opens, from the saved copy
    await page.reload();
    await expect(page.locator('#q')).toBeVisible();
    await expect(page.locator('#ob-overlay')).toBeHidden();               // and it still knows onboarding is done
    await expect(page).toHaveTitle('Wordtrail');
    expect(await page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);   // served by the service worker

    // 4. the saved catalog still answers searches
    await search(page, 'lantern');
    await expect(page.locator('#result-list .card:not(.sk) .t')).toContainText(['The Lantern Keeper']);
  } finally {
    await context.close();
    await app.stop().catch(() => {});
  }
});
