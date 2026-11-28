import { expect, test } from '@playwright/test';

import { tool } from '../tool.config';

/**
 * Smoke tests on a phone viewport. The API needs a Supabase project, which CI does not have, so
 * these cover what renders before the first request: landing, metadata, the new-job form and
 * the camera inputs. The full one-moment flow is exercised against a local stack by hand.
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
  await expect(page.getByRole('contentinfo')).toContainText('Naples AI');
});

test('open graph image renders', async ({ request }) => {
  const res = await request.get('/opengraph-image');
  expect(res.ok()).toBe(true);
  expect(res.headers()['content-type']).toContain('image/png');
});

test('new job form works at phone width with 44px targets', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('start').click();
  await expect(page).toHaveURL(/\/new$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('New job');

  const jobName = page.getByLabel('Job name (optional)');
  await expect(jobName).toBeVisible();
  const businessName = page.getByLabel('Your business name');
  await businessName.fill('Gulf Coast Cooling');
  for (const control of [jobName, businessName, page.getByTestId('details-next')]) {
    const box = await control.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(390);
  }

  // The business name is remembered on this phone for next time.
  await page.reload();
  await expect(page.getByLabel('Your business name')).toHaveValue('Gulf Coast Cooling');

  // Without a backend the create call fails and the form says so, instead of hanging.
  await page.getByTestId('details-next').click();
  await expect(page.getByRole('alert')).toBeVisible();
});

/** A 1x1 PNG so the browser-side resize has a real image to decode. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

test('one-moment flow: details, before, after, note (API mocked)', async ({ page }) => {
  const uploads: { kind: string | null; size: number }[] = [];
  await page.route('**/api/jobs', (route) =>
    route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({ id: 'job-1', shareSlug: 'abcdefghijklmnopqrstuv', claimToken: 'tok' }),
    }),
  );
  await page.route('**/api/jobs/job-1/photos', async (route) => {
    const request = route.request();
    const body = request.postDataBuffer();
    expect(request.headers()['x-claim-token']).toBe('tok');
    const kind = /name="kind"\r\n\r\n(\w+)/.exec(body?.toString('latin1') ?? '')?.[1] ?? null;
    uploads.push({ kind, size: body?.length ?? 0 });
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({
        photo: { id: `p${uploads.length}`, kind, position: 0, width: 1, height: 1 },
        remaining: 5,
      }),
    });
  });
  await page.route('**/api/jobs/job-1', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ id: 'job-1' }),
    }),
  );

  await page.goto('/new');
  await page.getByLabel('Job name (optional)').fill('Smith kitchen drain');
  await page.getByTestId('details-next').click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Before photos');

  for (const kind of ['before', 'after'] as const) {
    const camera = page.getByTestId(`${kind}-camera`);
    await expect(camera).toHaveAttribute('accept', 'image/*');
    await expect(camera).toHaveAttribute('capture', 'environment');
    await expect(camera).toHaveAttribute('multiple', '');
    await expect(page.getByTestId(`${kind}-library`)).not.toHaveAttribute('capture', /.*/);
    for (const label of ['Take a photo', 'Choose from library']) {
      const box = await page.getByText(label).boundingBox();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    }
    await camera.setInputFiles({ name: 'shot.png', mimeType: 'image/png', buffer: PNG });
    await expect(page.getByText(`1 of 6 ${kind} photos`)).toBeVisible();
    const next = page.getByTestId(`${kind}-next`);
    await expect(next).toBeEnabled();
    await next.click();
  }

  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Anything to tell the customer?',
  );
  await page
    .getByLabel('A note for the customer (optional)')
    .fill('Cleared the line and tested it.');
  await page.getByTestId('note-next').click();
  await expect(page.getByTestId('done-summary')).toContainText('1 before and 1 after');
  expect(uploads.map((u) => u.kind)).toEqual(['before', 'after']);
  expect(uploads.every((u) => u.size > 0)).toBe(true);

  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(scrollWidth).toBeLessThanOrEqual(390);
});
