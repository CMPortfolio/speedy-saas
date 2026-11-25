import { expect, test } from '@playwright/test';

import { tool } from '../tool.config';

/**
 * Smoke tests on a phone viewport: the landing page loads with its metadata, Start button and
 * the Naples AI footer; the customer and settings pages send a signed-out owner to sign in and
 * bring them back afterwards. The one-moment flow is in rain-day.spec.ts.
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
  await expect(start).toHaveAttribute('href', '/sign-in?next=/customers');
  const box = await start.boundingBox();
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  await expect(page.getByRole('contentinfo')).toContainText('Naples AI');
});

test('landing page speaks to lawn, pool and outdoor trades and says what it will not do', async ({
  page,
}) => {
  await page.goto('/');
  const trades = page.getByRole('list', { name: 'Trades' });
  await expect(trades).toContainText('Lawn care');
  await expect(trades).toContainText('Pool service');
  await expect(page.getByRole('heading', { name: 'How it works' })).toBeVisible();
  await expect(page.getByRole('main')).toContainText('does not plan routes');
});

test('open graph image renders', async ({ request }) => {
  const res = await request.get('/opengraph-image');
  expect(res.ok()).toBe(true);
  expect(res.headers()['content-type']).toContain('image/png');
});

for (const path of ['/customers', '/customers/import', '/settings']) {
  test(`${path} needs sign-in and comes back afterwards`, async ({ page }) => {
    await page.goto(path);
    await expect(page).toHaveURL(new RegExp(`/sign-in\\?next=${encodeURIComponent(path)}$`));
    await expect(page.getByLabel('Email')).toBeVisible();
  });
}
