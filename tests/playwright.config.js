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
    serviceWorkers: 'allow',
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
