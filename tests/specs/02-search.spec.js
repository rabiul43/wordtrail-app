const { test, expect } = require('../helpers/test');
const { startApp, search } = require('../helpers/app');

test.describe('search (network mocked)', () => {
  test('a title search lists the matching books', async ({ page, net }) => {
    await startApp(page);
    await search(page, 'lantern');

    const titles = page.locator('#result-list .card:not(.sk) .t');
    await expect(titles).toHaveCount(2);
    expect((await titles.allTextContents()).map(t => t.trim()).sort()).toEqual(['Lantern Hill Mysteries', 'The Lantern Keeper']);   // order is the app's choice
    await expect(page.locator('#result-list .card', { hasText: 'Mara Quill' })).toHaveCount(1);
    await expect(page.locator('#status')).toContainText('2 recordings found');

    // the answer came from the mocked catalog, and nothing reached the real internet
    expect(net.log.requests.some(r => /catalog\.json/.test(r))).toBe(true);
    expect(net.log.unmocked).toEqual([]);
  });

  test('searching by author finds their book', async ({ page }) => {
    await startApp(page);
    await search(page, 'Harrow');
    await expect(page.locator('#result-list .card:not(.sk) .t')).toHaveText(['Tales of the Moor']);
  });

  test('a search with no match says so', async ({ page }) => {
    await startApp(page);
    await page.locator('#q').fill('zzzzqqqq');
    await page.locator('#q').press('Enter');
    await expect(page.getByText('No results for')).toBeVisible();
    await expect(page.locator('#result-list .card:not(.sk)')).toHaveCount(0);
  });

  test('clearing the search brings the home screen back', async ({ page }) => {
    await startApp(page);
    await search(page, 'lantern');
    await page.locator('#btn-clear-q').click();
    await expect(page.locator('#results')).toBeHidden();
    await expect(page.locator('#q')).toHaveValue('');
  });
});
