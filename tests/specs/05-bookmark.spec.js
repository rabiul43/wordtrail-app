const { test, expect } = require('../helpers/test');
const { BOOK, startApp, openPlayer, audioState } = require('../helpers/app');

// top-right menu > "Speed, sleep timer, settings and more" > More > "Bookmark this place": opens the "Bookmark at a position" sheet
async function openBookmarkSheet(page) {
  await page.locator('#btn-topmore').click();
  const more = page.locator('#dm-more');                                  // the menu's More row (stays open once opened)
  if ((await more.getAttribute('aria-expanded')) !== 'true') await more.click();
  await page.locator('#dmenu [data-go="bm"]').click();                      // Bookmark row
  await expect(page.locator('#bm-save')).toBeVisible();
}

test.describe('bookmarks', () => {
  test('a bookmark saves, and shows under My Library', async ({ page }) => {
    await startApp(page);
    await openPlayer(page);
    await expect.poll(async () => (await audioState(page)).time).toBeGreaterThan(0.5);
    await page.evaluate(() => document.getElementById('au').pause());       // stop the tone so it can't move on to track 2 while the menus open

    await page.locator('#btn-fav').click();                                  // star: save the book to My Library
    await expect(page.locator('#btn-fav')).toHaveAttribute('aria-label', 'Remove from My Library');

    // menu > settings > More > "Bookmark this place" > Save bookmark
    await openBookmarkSheet(page);
    await page.locator('#bm-save').click();

    await expect(page.locator('#toast')).toContainText('Bookmark saved');

    // saved on the device: the first track, a few seconds in
    const bm = await page.evaluate(id => JSON.parse(localStorage.getItem('wt:bm:' + id)), BOOK.id);
    expect(bm.sec).toBe(0);
    expect(bm.time).toBeGreaterThanOrEqual(0);
    expect(bm.time).toBeLessThanOrEqual(6);

    // and it is listed under the book in My Library
    await page.locator('#btn-back').click();
    await page.locator('.tab[data-tab="shelf"]').click();
    await page.locator('.lt-saved').click();                    // on a phone My Library opens on tiles: open the Saved page
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
    await page.locator('.lt-saved').click();                    // on a phone My Library opens on tiles: open the Saved page
    await expect(page.locator('#shelf-list .bm-go')).toHaveAttribute('aria-label', /Go to bookmark, Track 1/);
  });
});