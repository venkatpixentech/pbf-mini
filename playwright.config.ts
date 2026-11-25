// Browser tests: npm run build && npm run test:e2e   (docs/10-TESTING-STANDARDS.md)
// Runs the production builds from ../pbf-game-builds, each game in a subfolder, in the installed Google Chrome
// (channel 'chrome', so no browser download is needed).
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1, // one game at a time: parallel GPU work skews timing and canvas checks
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4173',
    channel: 'chrome',
    headless: true,
  },
  webServer: {
    command: 'node scripts/serve-builds.mjs 4173',
    url: 'http://localhost:4173/higherlower/',
    reuseExistingServer: true,
  },
});
