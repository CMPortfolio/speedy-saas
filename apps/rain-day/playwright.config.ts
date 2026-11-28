import { defineConfig, devices } from '@playwright/test';

import { tool } from './tool.config';

const port = Number(process.env.PORT ?? tool.devPort);
const practicePort = port + 1;
// localhost, not 127.0.0.1: `next start` builds redirect URLs from its own host name, and the sign-in
// cookie has to be set for the same host the browser is redirected to.
const baseURL = `http://localhost:${port}`;
const practiceURL = `http://localhost:${practicePort}`;

const baseEnv = process.env as Record<string, string>;
// Texting credentials never reach the practice server, whatever is in this shell.
const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, ...withoutTwilio } = baseEnv;
void TWILIO_ACCOUNT_SID;
void TWILIO_AUTH_TOKEN;

/**
 * Every tool's one-moment flow is tested on a phone viewport. `pnpm test:e2e` builds first
 * (turbo: test:e2e depends on build) and starts two production servers:
 *
 *  - the main one uses the fake SMS provider, which `next start` (production) refuses unless this
 *    local run says so. Texts never leave the process. Never set these on a deployed service.
 *  - the practice one is configured like production before Twilio exists: SMS_PROVIDER=twilio and
 *    NO Twilio credentials, no fake provider. Practice mode has to work exactly like that.
 */
export default defineConfig({
  testDir: './tests',
  testMatch: /.*\.spec\.ts/,
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  projects: [
    {
      name: 'app',
      testIgnore: /practice\.spec\.ts/,
      // Phone viewport and touch in Chromium (the iPhone descriptor would otherwise pick WebKit).
      use: { ...devices['iPhone 13'], browserName: 'chromium', baseURL, trace: 'off' },
    },
    {
      name: 'practice',
      testMatch: /practice\.spec\.ts/,
      use: { ...devices['iPhone 13'], browserName: 'chromium', baseURL: practiceURL, trace: 'off' },
    },
  ],
  webServer: [
    {
      command: `pnpm exec next start -p ${port}`,
      env: {
        ...baseEnv,
        SMS_PROVIDER: 'fake',
        ALLOW_FAKE_SMS: '1',
        APP_URL: baseURL,
        SMS_FROM_NUMBER: '+12395550100',
      },
      url: baseURL,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: `pnpm exec next start -p ${practicePort}`,
      env: {
        ...withoutTwilio,
        SMS_PROVIDER: 'twilio',
        APP_URL: practiceURL,
        ALLOW_FAKE_SMS: '',
      },
      url: practiceURL,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
