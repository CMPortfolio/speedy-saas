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
      body: JSON.stringify({
        id: 'job-1',
        shareSlug: 'abcdefghijklmnopqrstuv',
        shareUrl: 'http://127.0.0.1:3001/j/abcdefghijklmnopqrstuv',
        claimToken: 'tok',
      }),
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

  // Headless Chromium has no share sheet, so the Copy link fallback is what we can test.
  await page.addInitScript(() => {
    (window as unknown as { copied: string[] }).copied = [];
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: (t: string) => {
          (window as unknown as { copied: string[] }).copied.push(t);
          return Promise.resolve();
        },
      },
    });
  });

  await page.goto('/new');
  await page.getByLabel('Job name (optional)').fill('Smith kitchen drain');
  await page.getByLabel('Link for reviews (optional)').fill('http://not-secure.example');
  await page.getByTestId('details-next').click();
  await expect(page.getByText('Paste the full link, starting with https://')).toBeVisible();
  await page.getByLabel('Link for reviews (optional)').fill('https://g.page/r/abc/review');
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
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Send it to the customer');
  await expect(page.getByTestId('share-url')).toHaveValue(
    'http://127.0.0.1:3001/j/abcdefghijklmnopqrstuv',
  );
  await page.getByTestId('copy-link').click();
  await expect(page.getByTestId('copy-link')).toHaveText('Copied');
  const save = page.getByTestId('save-my-jobs');
  await expect(save).toHaveAttribute('href', '/sign-in?next=/jobs');
  expect((await save.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  expect(await page.evaluate(() => (window as unknown as { copied: string[] }).copied)).toEqual([
    'http://127.0.0.1:3001/j/abcdefghijklmnopqrstuv',
  ]);
  expect(uploads.map((u) => u.kind)).toEqual(['before', 'after']);
  expect(uploads.every((u) => u.size > 0)).toBe(true);

  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(scrollWidth).toBeLessThanOrEqual(390);
});

test('share page: a malformed slug is a 404 and the preview image is a png', async ({
  request,
}) => {
  const page = await request.get('/j/not-a-real-slug');
  expect(page.status()).toBe(404);
  const image = await request.get('/j/not-a-real-slug/opengraph-image');
  expect(image.ok()).toBe(true);
  expect(image.headers()['content-type']).toContain('image/png');
});

test('my jobs needs sign-in and comes back to /jobs afterwards', async ({ page }) => {
  await page.goto('/jobs');
  await expect(page).toHaveURL(/\/sign-in\?next=%2Fjobs$/);
  await expect(page.getByLabel('Email')).toBeVisible();
});
