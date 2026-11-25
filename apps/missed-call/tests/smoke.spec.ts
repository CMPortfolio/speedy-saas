import { expect, test } from '@playwright/test';

import { tool } from '../tool.config';

/**
 * Smoke test: the landing page loads on a phone, carries its metadata, shows the Start button
 * (which goes to sign-in because this tool stores phone numbers) and the Naples AI footer.
 * The one-moment flow (setup → missed call → text-back → reply list) is added in later tickets.
 */
test('landing page loads with metadata, start button and footer', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(new RegExp(tool.name));
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
    'content',
    new RegExp(tool.name),
  );
  await expect(page.locator('meta[name="description"]')).toHaveAttribute(
    'content',
    tool.description,
  );
  const start = page.getByTestId('start');
  await expect(start).toBeVisible();
  const box = await start.boundingBox();
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  await expect(start).toHaveAttribute('href', '/sign-in?next=/setup');
  await expect(page.getByTestId('why-sign-in')).toContainText('sign in first');
  await expect(page.getByRole('contentinfo')).toContainText('Naples AI');
});

test('start goes to sign-in and keeps the next path', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('start').click();
  await expect(page).toHaveURL(/\/sign-in\?next=%2Fsetup|\/sign-in\?next=\/setup/);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
});

test('open graph image renders', async ({ request }) => {
  const res = await request.get('/opengraph-image');
  expect(res.ok()).toBe(true);
  expect(res.headers()['content-type']).toContain('image/png');
});

test('the missed calls list needs a sign-in', async ({ page }) => {
  await page.goto('/calls');
  await expect(page).toHaveURL(/\/sign-in\?next=%2Fcalls/);
});

test('brand icons are served (no 404 on /favicon.ico)', async ({ request }) => {
  for (const path of ['/favicon.ico', '/icon.png', '/apple-icon.png', '/naples-mark.png']) {
    const res = await request.get(path);
    expect(res.ok(), path).toBe(true);
  }
});
