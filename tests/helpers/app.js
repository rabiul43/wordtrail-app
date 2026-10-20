// Small "how a person uses the app" steps shared by the specs.
const { expect } = require('@playwright/test');

const BOOK = { id: '9001', title: 'The Lantern Keeper', author: 'Mara Quill', query: 'lantern keeper' };

// First visit: shows the welcome screen.
async function openApp(page) {
  await page.goto('/');
  await expect(page.locator('#ob-overlay')).toBeVisible();
}

// Picks Medium, continues, keeps the default language and starts reading.
async function completeOnboarding(page) {
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

// Types in the search box and waits for real result cards (not the grey loading placeholders).
async function search(page, term) {
  await page.locator('#q').fill(term);
  await page.locator('#q').press('Enter');
  await expect(page.locator('#result-list .card:not(.sk)').first()).toBeVisible();
}

// Search, tap the first result: the book's page.
async function openBookPage(page, book = BOOK) {
  await search(page, book.query);
  await page.locator('#result-list .card:not(.sk)', { hasText: book.title }).first().click();
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

module.exports = { BOOK, openApp, completeOnboarding, startApp, search, openBookPage, openPlayer, audioState };
