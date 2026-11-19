import { defineConfig, devices } from '@playwright/test';
// Without an override, use the browser installed by Playwright.
const executable = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
export default defineConfig({
  outputDir: 'work/phases55-67/offline', testDir: './tests/pilot-e2e', testMatch: ['offline.spec.ts', 'exp05-pwa.spec.ts'], workers: 1, timeout: 45000,
  // Run artifacts go to work/, never into docs/ evidence directories.
  reporter: [['list'], ['json', { outputFile: 'work/phases55-67/offline-browser.json' }]],
  use: { baseURL: 'http://127.0.0.1:5176', ...devices['Pixel 7'], launchOptions: { executablePath: executable }, trace: 'retain-on-failure' },
  webServer: { command: 'node scripts/serve-release.mjs', url: 'http://127.0.0.1:5176', reuseExistingServer: false, env: { PORT: '5176' } },
});
