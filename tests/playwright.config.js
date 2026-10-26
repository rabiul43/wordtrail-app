// Playwright config. The app is dist/index.html, built by "python build.py" (run that first; CI does).
const { defineConfig, devices } = require('@playwright/test');

const PORT = 4173;

module.exports = defineConfig({
  testDir: './specs',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://127.0.0.1:' + PORT,
    ...devices['Pixel 7'],                       // the app is a phone app: phone-sized screen
    channel: process.env.CI ? undefined : 'chrome',   // locally use installed Chrome (no Chromium download)
    // Block the service worker in the normal specs. Playwright's fake network (helpers/mock-network.js) cannot see what a service
    // worker fetches itself, and sw.js fetches catalog.json itself once it has taken over. Whether the page's own request (answered by
    // the fake) or the worker's (answered by the real internet) came first was a race, so search sometimes got the wrong catalog.
    // 06-offline.spec.js needs the worker and asks for it on its own browser context.
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
    launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] }   // lets the test tone play in headless Chromium
  },
  projects: [{ name: 'chromium' }],
  webServer: {
    command: 'node serve.js ' + PORT,
    url: 'http://127.0.0.1:' + PORT + '/',
    reuseExistingServer: !process.env.CI,
    timeout: 15_000
  }
});