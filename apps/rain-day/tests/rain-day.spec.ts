import { fileURLToPath } from 'node:url';

import { expect, test } from '@playwright/test';

import {
  assignSenderNumber,
  createOwner,
  customerTexts,
  deleteOwner,
  hasSupabase,
  nextWeekday,
  reportDelivered,
  sentProviderIds,
  signIn,
  type TestOwner,
} from './e2e-helpers';

/**
 * The one moment, on a phone, with the fake SMS provider: sign in, import 15 customers from a
 * CSV, one of them texts STOP, run a rain day, see 15 individual texts with their statuses and
 * the opted-out customer shown as skipped. Needs the local Supabase stack (see e2e-helpers).
 */
test.skip(
  !hasSupabase && !process.env.CI,
  'Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (local Supabase).',
);

const CSV = fileURLToPath(new URL('./fixtures/customers.csv', import.meta.url));
// Pat Ruiz, the second line of the fixture.
const OPTED_OUT = { name: 'Pat Ruiz', phone: '+12395551101' };
const FIRST_NAMES = [
  'Maria',
  'Jim',
  'Dee',
  'Sam',
  'Lena',
  'Tom',
  'Ana',
  'Rick',
  'Joy',
  'Hank',
  'Nia',
  'Ed',
  'Cara',
  'Omar',
];

let owner: TestOwner;

test.beforeAll(async ({ request }) => {
  owner = await createOwner(request);
});

test.afterAll(async ({ request }) => {
  if (owner) await deleteOwner(request, owner.id);
});

test('import 15 customers, run a rain day, see 15 individual sends and the opted-out customer skipped', async ({
  page,
  request,
}) => {
  await signIn(page, owner, '/settings');
  await expect(page.getByRole('heading', { name: 'Your business' })).toBeVisible();
  await page.getByLabel('Business name').fill('Green Gulf Lawn');
  await page.getByLabel('Your cell').fill('(239) 555-0111');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Saved.' })).toBeVisible();

  // Import the fixture: the preview shows all 15 before anything is saved.
  await page.goto('/customers/import');
  await page.getByLabel(/choose a csv|csv file|file/i).setInputFiles(CSV);
  await expect(page.getByText('Will be imported: 15 customers')).toBeVisible();
  await page.getByRole('button', { name: 'Import 15 customers' }).click();
  await expect(page).toHaveURL(/\/customers$/);
  await expect(page.getByRole('list', { name: 'Customers' }).getByRole('listitem')).toHaveCount(15);

  // Until an admin gives this owner a texting number the page is in practice mode: no real Send.
  await page.goto('/rain-day');
  await page.getByLabel("Day that's off").fill(nextWeekday(2));
  await expect(page.getByRole('heading', { name: /Tuesday customers/ })).toBeVisible();
  await expect(page.getByTestId('practice-banner')).toContainText('nothing is texted to anyone');
  await expect(page.getByRole('button', { name: /^Send \d+ texts?$/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Send as practice/ })).toBeVisible();

  const senderNumber = await assignSenderNumber(request, owner);

  // One customer texts STOP to the owner's number.
  expect(await customerTexts(request, OPTED_OUT.phone, senderNumber, 'STOP')).toBe(200);

  // Pick the Tuesday that is off; the new day follows as Wednesday.
  const tuesday = nextWeekday(2);
  await page.goto('/rain-day');
  await page.getByLabel("Day that's off").fill(tuesday);
  await expect(page.getByRole('heading', { name: /Tuesday customers \(14 of 15/ })).toBeVisible();
  const list = page.getByRole('list', { name: 'Customers to text' });
  await expect(list.getByRole('listitem')).toHaveCount(15);
  await expect(list.getByRole('listitem').filter({ hasText: OPTED_OUT.name })).toContainText(
    'Skipped',
  );
  await expect(list.getByRole('listitem').filter({ hasText: 'Maria Lopez' })).toContainText(
    'Hi Maria, the weather is wiping out our day',
  );

  await page.getByRole('button', { name: 'Send 14 texts' }).click();
  await page.getByRole('button', { name: 'Send now' }).click();
  await expect(page).toHaveURL(/\/rain-day\/[0-9a-f-]{36}$/);

  // 15 rows: 14 individual sends and the skipped customer.
  const rows = page.getByRole('list', { name: 'Texts sent' }).getByRole('listitem');
  await expect(rows).toHaveCount(15);
  await expect(page.locator('li[data-status="sent"]')).toHaveCount(14);
  const skipped = page.locator('li[data-status="skipped"]');
  await expect(skipped).toHaveCount(1);
  await expect(skipped).toContainText(OPTED_OUT.name);
  await expect(skipped).toContainText('Skipped (opted out)');
  // Each customer's own text carries their own name and nobody else's number.
  for (const first of FIRST_NAMES) {
    await expect(page.getByText(new RegExp(`^Hi ${first}, `))).toHaveCount(1);
  }
  await expect(page.locator('body')).not.toContainText('555-1');

  // The provider reports the texts delivered; the statuses follow.
  const ids = await sentProviderIds(request, owner);
  expect(ids).toHaveLength(14);
  for (const status of await Promise.all(ids.map((id) => reportDelivered(request, id)))) {
    expect(status).toBe(204);
  }
  await expect(async () => {
    await page.reload();
    await expect(page.locator('li[data-status="delivered"]')).toHaveCount(14, { timeout: 2000 });
  }).toPass();
  await expect(page.locator('li[data-status="skipped"]')).toHaveCount(1);

  // A customer replies and it shows up in the Replies list.
  expect(
    await customerTexts(request, '+12395551100', senderNumber, 'Can you do Thursday instead?'),
  ).toBe(200);
  await page.goto('/rain-day/replies');
  await expect(page.getByRole('list', { name: 'Replies' })).toContainText(
    'Can you do Thursday instead?',
  );
});
