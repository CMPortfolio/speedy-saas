import path from 'node:path';

import { devices, expect, test } from '@playwright/test';

const fixture = (name: string) => path.join(import.meta.dirname, 'fixtures', name);

/**
 * The real one-moment flow on a phone viewport, against a local Supabase stack (no mocks):
 * create a job, upload a before and an after photo, send, then open the share link in a fresh
 * browser context with no session and see both photos. Needs the Supabase env vars. Locally it
 * is skipped when they are missing; in CI it is never skipped, so a missing stack fails loudly.
 */
test.skip(
  !process.env.CI &&
    (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.NEXT_PUBLIC_SUPABASE_URL),
  'needs a Supabase stack (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)',
);

test('a tech sends before and after photos and the customer sees both', async ({
  page,
  browser,
  baseURL,
}) => {
  await page.goto('/');
  await page.getByTestId('start').click();
  await page.getByLabel('Job name (optional)').fill('Johnson water heater');
  await page.getByLabel('Your business name').fill('Gulf Coast Plumbing');
  await page.getByTestId('details-next').click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Before photos');

  await page.getByTestId('before-camera').setInputFiles(fixture('before.png'));
  await expect(page.getByText('1 of 6 before photos')).toBeVisible();
  await expect(page.getByTestId('before-next')).toBeEnabled();
  await page.getByTestId('before-next').click();

  await page.getByTestId('after-camera').setInputFiles(fixture('after.png'));
  await expect(page.getByText('1 of 6 after photos')).toBeVisible();
  await expect(page.getByTestId('after-next')).toBeEnabled();
  await page.getByTestId('after-next').click();

  await page
    .getByLabel('A note for the customer (optional)')
    .fill('New heater, tested and running.');
  await page.getByTestId('note-next').click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Send it to the customer');
  await expect(page.getByText('1 before and 1 after photos are ready')).toBeVisible();

  const shareUrl = await page.getByTestId('share-url').inputValue();
  const slug = new URL(shareUrl).pathname;
  expect(slug).toMatch(/^\/j\/[A-Za-z0-9_-]{16,}$/);

  // The customer: a brand new context, no cookies, no storage, no session.
  const { defaultBrowserType: _, ...phone } = devices['iPhone 13'];
  const customer = await browser.newContext(phone);
  try {
    const view = await customer.newPage();
    await view.goto(new URL(slug, baseURL).toString());
    await expect(view.getByRole('heading', { level: 1 })).toHaveText('Gulf Coast Plumbing');
    await expect(view.getByText('Johnson water heater')).toBeVisible();
    await expect(view.getByText('New heater, tested and running.')).toBeVisible();
    for (const alt of ['Before photo 1', 'After photo 1']) {
      const img = view.getByAltText(alt);
      await expect(img).toBeVisible();
      await expect
        .poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0))
        .toBe(true);
    }
    expect(await customer.cookies()).toEqual([]);
  } finally {
    await customer.close();
  }
});
