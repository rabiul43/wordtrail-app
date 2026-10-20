const { test, expect } = require('../helpers/test');
const { BOOK, startApp, openPlayer, audioState } = require('../helpers/app');

// top-right menu > "Speed, sleep timer, settings and more" > More > "Bookmark this place": opens the "Bookmark at a position" sheet
async function openBookmarkSheet(page) {
  await page.locator('#btn-topmore').click();
  await page.locator('#btn-player-settings').click();
  await page.locator('#qk-more').click();
  await page.locator('#b-bm').click();
  await expect(page.locator('#bm-save')).toBeVisible();
}

test.describe('bookmarks', () => {
  test('a bookmark saves, and shows under My books', async ({ page }) => {
    await startApp(page);
    await openPlayer(page);
    await expect.poll(async () => (await audioState(page)).time).toBeGreaterThan(0.5);

    await page.locator('#btn-fav').click();                                  // star: save the book to My books
    await expect(page.locator('#btn-fav')).toHaveAttribute('aria-label', 'Remove from My books');

    // menu > settings > More > "Bookmark this place" > Save bookmark
    await openBookmarkSheet(page);
    await page.locator('#bm-save').click();

    await expect(page.locator('#toast')).toContainText('Bookmark saved');

    // saved on the device: the first track, a few seconds in
    const bm = await page.evaluate(id => JSON.parse(localStorage.getItem('wt:bm:' + id)), BOOK.id);
    expect(bm.sec).toBe(0);
    expect(bm.time).toBeGreaterThanOrEqual(0);
    expect(bm.time).toBeLessThanOrEqual(6);

    // and it is listed under the book in My books
    await page.locator('#btn-back').click();
    await page.locator('.tab[data-tab="shelf"]').click();
    await expect(page.locator('#shelf-list .card', { hasText: BOOK.title })).toBeVisible();
    await expect(page.locator('#shelf-list .bm-go')).toHaveAttribute('aria-label', /Go to bookmark, Track 1/);
  });

  test('the bookmark is still there after a reload', async ({ page }) => {
    await startApp(page);
    await openPlayer(page);
    await page.locator('#btn-fav').click();
    await openBookmarkSheet(page);
    await page.locator('#bm-save').click();
    await expect(page.locator('#toast')).toContainText('Bookmark saved');

    await page.reload();                                      // the app reopens the book you were in
    await expect(page.locator('#player')).toBeVisible();
    await page.locator('#btn-back').click();
    await page.locator('.tab[data-tab="shelf"]').click();
    await expect(page.locator('#shelf-list .bm-go')).toHaveAttribute('aria-label', /Go to bookmark, Track 1/);
  });
});
