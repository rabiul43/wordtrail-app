const { test, expect } = require('../helpers/test');
const { BOOK, startApp, openBookPage } = require('../helpers/app');

test.describe('opening a book (network mocked)', () => {
  test('tapping a result shows the book page', async ({ page }) => {
    await startApp(page);
    await openBookPage(page);
    const detail = page.locator('#detail');
    await expect(detail).toContainText(BOOK.title);
    await expect(detail).toContainText(BOOK.author);
    await expect(page.getByRole('button', { name: 'Read and listen' })).toBeEnabled();
  });

  test('"Read and listen" opens the player with the tracks and the text', async ({ page }) => {
    await startApp(page);
    await openBookPage(page);
    await page.getByRole('button', { name: 'Read and listen' }).click();

    await expect(page.locator('#player')).toBeVisible();
    await expect(page.locator('#p-title')).toHaveText(BOOK.title);
    await expect(page.locator('#p-sub')).toContainText('Track 1 of 2');        // two tracks came from the mocked LibriVox book
    await expect(page.locator('#p-sub')).toContainText(BOOK.author);
    await expect(page.locator('#page')).toContainText('The lantern swung slowly'); // the mocked book text is on screen
  });

  test('Back from the player returns to the book page', async ({ page }) => {
    await startApp(page);
    await openBookPage(page);
    await page.getByRole('button', { name: 'Read and listen' }).click();
    await expect(page.locator('#player')).toBeVisible();
    await page.locator('#btn-back').click();
    await expect(page.locator('#player')).toBeHidden();
    await expect(page.locator('#detail')).toContainText(BOOK.title);
    // the main button reads "Resume" once any of the book has played, so accept either label
    await expect(page.getByRole('button', { name: /Read and listen|Resume/ })).toBeVisible();
  });
});