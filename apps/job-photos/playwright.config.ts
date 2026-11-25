import { defineConfig, devices } from '@playwright/test';

import { tool } from './tool.config';

const port = Number(process.env.PORT ?? tool.devPort);
const baseURL = `http://127.0.0.1:${port}`;

/**
 * Every tool's one-moment flow is tested on a phone viewport. `pnpm test:e2e` builds first
 * (turbo: test:e2e depends on build) and starts the production server.
 */
export default defineConfig({
  testDir: './tests',
  testMatch: /.*\.spec\.ts/,
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  // Phone viewport and touch in Chromium (the iPhone descriptor would otherwise pick WebKit).
  use: { ...devices['iPhone 13'], browserName: 'chromium', baseURL, trace: 'off' },
  webServer: {
    command: `pnpm exec next start -p ${port}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    // Production builds refuse to guess the public address for sign-in redirects.
    env: { APP_URL: baseURL },
    timeout: 120_000,
  },
});
