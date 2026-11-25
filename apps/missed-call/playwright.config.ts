import { defineConfig, devices } from '@playwright/test';

import { tool } from './tool.config';

const port = Number(process.env.PORT ?? tool.devPort);
const baseURL = `http://localhost:${port}`;
// A second production server for practice mode: the real provider is selected (SMS_PROVIDER=twilio)
// and no Twilio credentials are set, exactly like a deployment before its number exists.
const practicePort = port + 10;
const practiceURL = `http://localhost:${practicePort}`;

/**
 * Every tool's one-moment flow is tested on a phone viewport. `pnpm test:e2e` builds first
 * (turbo: test:e2e depends on build) and starts the production servers.
 */
export default defineConfig({
  testDir: './tests',
  testMatch: /.*\.spec\.ts/,
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  // Phone viewport and touch in Chromium (the iPhone descriptor would otherwise pick WebKit).
  use: { ...devices['iPhone 13'], browserName: 'chromium', baseURL, trace: 'off' },
  projects: [
    { name: 'main', testIgnore: /practice\.spec\.ts/ },
    { name: 'practice', testMatch: /practice\.spec\.ts/, use: { baseURL: practiceURL } },
  ],
  webServer: [
    {
      command: `pnpm exec next start -p ${port}`,
      url: baseURL,
      reuseExistingServer: !process.env.CI,
      // The provider is mocked: the fake SMS provider on a production build, and the public URL the
      // webhooks are verified against.
      env: { SMS_PROVIDER: 'fake', ALLOW_FAKE_SMS: '1', APP_URL: baseURL },
      timeout: 120_000,
    },
    {
      command: `pnpm exec next start -p ${practicePort}`,
      url: practiceURL,
      reuseExistingServer: !process.env.CI,
      env: { SMS_PROVIDER: 'twilio', APP_URL: practiceURL },
      timeout: 120_000,
    },
  ],
});
