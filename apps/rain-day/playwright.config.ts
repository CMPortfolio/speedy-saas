import { defineConfig, devices } from '@playwright/test';

import { tool } from './tool.config';

const port = Number(process.env.PORT ?? tool.devPort);
// localhost, not 127.0.0.1: `next start` builds redirect URLs from its own host name, and the sign-in
// cookie has to be set for the same host the browser is redirected to.
const baseURL = `http://localhost:${port}`;

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
    // `next start` runs as production, which refuses the fake SMS provider unless this local
    // test run says so. Texts never leave the process. Never set these on a deployed service.
    env: {
      ...(process.env as Record<string, string>),
      SMS_PROVIDER: 'fake',
      ALLOW_FAKE_SMS: '1',
      APP_URL: baseURL,
      SMS_FROM_NUMBER: '+12395550100',
    },
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
