// Small "how a person uses the app" steps shared by the specs.
const { expect } = require('@playwright/test');

const BOOK = { id: '9001', title: 'The Lantern Keeper', author: 'Mara Quill', query: 'lantern keeper' };

// First visit: shows the welcome screen.
async function openApp(page) {
  // CI check: no background audio alignment / intro detection while the tests run (set once, so a reload keeps the saved prefs)
  await page.addInitScript(() => { try { if (!localStorage.getItem('wt:prefs')) localStorage.setItem('wt:prefs', JSON.stringify({ bgAlign: 'off', smartSync: false, autoStart: false, fastCheck: false, smartCut: false })); } catch (e) { /* no storage */ } });
  await page.goto('/');
  await expect(page.locator('#ob-overlay')).toBeVisible();
}

// Keeps the default goal (Enjoy stories) and continues, picks Medium, continues, keeps the default language and starts reading.
async function completeOnboarding(page) {
  await page.locator('#ob-next-g').click();
  await expect(page.locator('#ob-step-0')).toBeVisible();
  await page.locator('#ob-pick-1').click();
  await page.locator('#ob-next-0').click();
  await expect(page.locator('#ob-step-1')).toBeVisible();
  await page.locator('#ob-done').click();
  await expect(page.locator('#ob-overlay')).toBeHidden();
}

async function startApp(page) {
  await openApp(page);
  await completeOnboarding(page);
}

// Opens the Search page: taps the Search tab in the bottom bar (the box #sp-q lives on that page, not on Home).
async function openSearchPage(page) {
  const box = page.locator('#sp-q');
  if (!(await box.isVisible())) await page.locator('#tabbar .tab[data-tab="search"]').click();
  await expect(box).toBeVisible();
}

// Types a term in the Search page and presses Enter (does not wait for anything).
async function submitSearch(page, term) {
  await openSearchPage(page);
  await page.locator('#sp-q').fill(term);
  await page.locator('#sp-q').press('Enter');
}

// Searches and waits for real result rows (.sp-row inside #sp-list; the grey loading blocks are .sp-sk, so they never match).
async function search(page, term) {
  await submitSearch(page, term);
  await expect(page.locator('#sp-list .sp-row').first()).toBeVisible();
}

// Search, tap the first result: the book's page.
async function openBookPage(page, book = BOOK) {
  await search(page, book.query);
  await page.locator('#sp-list .sp-row', { hasText: book.title }).first().click();
  await expect(page.getByRole('button', { name: 'Read and listen' })).toBeVisible();
}

// ... and "Read and listen": the player opens and the narration starts.
async function openPlayer(page, book = BOOK) {
  await openBookPage(page, book);
  await page.getByRole('button', { name: 'Read and listen' }).click();
  await expect(page.locator('#player')).toBeVisible();
  await expect(page.locator('#p-title')).toHaveText(book.title);
}

// The state of the <audio> element, read straight from the browser.
const audioState = page => page.evaluate(() => {
  const a = document.getElementById('au');
  return { paused: a.paused, time: a.currentTime, duration: a.duration, ready: a.readyState, error: a.error ? a.error.code : null, src: a.currentSrc };
});

module.exports = { BOOK, openApp, completeOnboarding, startApp, openSearchPage, submitSearch, search, openBookPage, openPlayer, audioState };
