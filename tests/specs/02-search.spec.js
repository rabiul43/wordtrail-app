const { test, expect } = require('../helpers/test');
const { startApp, search, submitSearch } = require('../helpers/app');

test.describe('search (network mocked)', () => {
  test('a title search lists the matching books', async ({ page, net }) => {
    await startApp(page);
    await search(page, 'lantern');

    const titles = page.locator('#sp-list .sp-row .sp-t');
    await expect(titles).toHaveCount(2);
    expect((await titles.allTextContents()).map(t => t.trim()).sort()).toEqual(['Lantern Hill Mysteries', 'The Lantern Keeper']);   // order is the app's choice
    await expect(page.locator('#sp-list .sp-row', { hasText: 'Mara Quill' })).toHaveCount(1);
    await expect(page.locator('#sp .sp-count')).toContainText('2 results');

    // the answer came from the mocked catalog, and nothing reached the real internet
    expect(net.log.requests.some(r => /catalog\.json/.test(r))).toBe(true);
    expect(net.log.unmocked).toEqual([]);
  });

  test('searching by author finds their book', async ({ page }) => {
    await startApp(page);
    await search(page, 'Harrow');
    await expect(page.locator('#sp-list .sp-row .sp-t')).toHaveText(['Tales of the Moor']);
  });

  test('a search with no match says so', async ({ page }) => {
    await startApp(page);
    await submitSearch(page, 'zzzzqqqq');
    await expect(page.getByText('No results for')).toBeVisible();
    await expect(page.locator('#sp-list .sp-row')).toHaveCount(0);
  });

  test('clearing the search brings back the empty Search page', async ({ page }) => {
    await startApp(page);
    await search(page, 'lantern');
    await page.locator('#sp-x').click();
    await expect(page.locator('#sp')).toHaveAttribute('data-mode', 'empty');
    await expect(page.locator('#sp-list')).toHaveCount(0);
    await expect(page.locator('#sp-q')).toHaveValue('');
  });
});
