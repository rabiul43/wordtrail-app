const { test, expect } = require('../helpers/test');
const { startApp, openPlayer, audioState } = require('../helpers/app');
const { SECTION_SECONDS } = require('../fixtures/books');

test.describe('playback with the short test tone (fixtures/test-tone.wav)', () => {
  test('play and pause', async ({ page }) => {
    await startApp(page);
    await openPlayer(page);                                   // "Read and listen" starts the narration
    const play = page.locator('#b-play');

    // playing: the audio element is running and the button offers "Pause"
    await expect.poll(async () => (await audioState(page)).time, { message: 'audio should start moving' }).toBeGreaterThan(0.3);
    let a = await audioState(page);
    expect(a.error).toBeNull();
    expect(a.duration).toBeCloseTo(SECTION_SECONDS, 0);       // it really loaded the tone
    expect(a.paused).toBe(false);
    await expect(play).toHaveAttribute('aria-label', 'Pause');

    // pause: it stops and stays put
    await play.click();
    await expect(play).toHaveAttribute('aria-label', 'Play');
    a = await audioState(page);
    expect(a.paused).toBe(true);
    const stoppedAt = a.time;
    await page.waitForTimeout(800);
    expect((await audioState(page)).time).toBeCloseTo(stoppedAt, 1);

    // play again: it carries on from where it stopped
    await play.click();
    await expect(play).toHaveAttribute('aria-label', 'Pause');
    await expect.poll(async () => (await audioState(page)).time).toBeGreaterThan(stoppedAt + 0.3);
    expect((await audioState(page)).paused).toBe(false);

    // and pause once more
    await play.click();
    await expect(play).toHaveAttribute('aria-label', 'Play');
    expect((await audioState(page)).paused).toBe(true);
  });

  test('the position bar and the "forward 15" button follow the audio', async ({ page }) => {
    await startApp(page);
    await openPlayer(page);
    await expect.poll(async () => (await audioState(page)).time).toBeGreaterThan(0.3);
    await page.locator('#b-play').click();                    // pause so nothing moves under us
    const before = (await audioState(page)).time;
    await page.locator('#b-fwd15').click();                   // the tone is only 6 s long: this goes to the next track or the end
    await expect.poll(async () => { const a = await audioState(page); return a.time < before || a.time >= before + 1; }).toBe(true);
  });
});
