const { test, expect } = require('../helpers/test');
const { openApp, completeOnboarding } = require('../helpers/app');

const saved = page => page.evaluate(() => ({ onboarded: localStorage.getItem('wt:onboarded'), prefs: JSON.parse(localStorage.getItem('wt:prefs') || '{}') }));

test.describe('onboarding', () => {
  test('first visit: pick a level, pick a language, finish', async ({ page }) => {
    await openApp(page);
    await expect(page.getByText("What's your English reading level?")).toBeVisible();
    await expect(page.locator('#ob-next-0')).toBeDisabled();            // Continue waits for a choice

    await page.locator('#ob-pick-1').click();                           // Medium
    await expect(page.locator('#ob-pick-1')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#ob-next-0')).toBeEnabled();
    await page.locator('#ob-next-0').click();

    await expect(page.getByText("What's your native language?")).toBeVisible();
    await page.locator('#ob-done').click();
    await expect(page.locator('#ob-overlay')).toBeHidden();

    await expect(page.locator('#q')).toBeVisible();                     // the home screen is underneath
    const s = await saved(page);
    expect(s.onboarded).toBe('1');
    expect(s.prefs.readerLvl).toBe(1);
  });

  test('it does not come back after a reload', async ({ page }) => {
    await openApp(page);
    await completeOnboarding(page);
    await page.reload();
    await expect(page.locator('#q')).toBeVisible();
    await expect(page.locator('#ob-overlay')).toBeHidden();
  });

  test('"Skip for now" also completes it, with the Medium level', async ({ page }) => {
    await openApp(page);
    await page.locator('#ob-skip-now').click();
    await expect(page.locator('#ob-overlay')).toBeHidden();
    const s = await saved(page);
    expect(s.onboarded).toBe('1');
    expect(s.prefs.readerLvl).toBe(1);
  });
});
