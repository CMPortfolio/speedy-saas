import { fileURLToPath } from 'node:url';

import { expect, test, type APIRequestContext } from '@playwright/test';

import {
  assignSenderNumber,
  createOwner,
  deleteOwner,
  hasSupabase,
  nextWeekday,
  signIn,
  supabaseUrl,
  type TestOwner,
} from './e2e-helpers';

/**
 * Practice mode on a phone, against a server configured like production before Twilio exists:
 * SMS_PROVIDER=twilio and no Twilio credentials at all (see playwright.config.ts). An owner with
 * no texting number runs the whole flow on the on-screen phone; nothing is texted. Once a real
 * number is set, the practice screens are gone and practice is refused.
 */
test.skip(
  !hasSupabase && !process.env.CI,
  'Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (local Supabase).',
);

const CSV = fileURLToPath(new URL('./fixtures/customers.csv', import.meta.url));
let owner: TestOwner;

test.beforeAll(async ({ request }) => {
  owner = await createOwner(request);
});

test.afterAll(async ({ request }) => {
  if (owner) await deleteOwner(request, owner.id);
});

/** How many rows this owner has in a real rain_day table, read with the service role. */
async function realRows(
  request: APIRequestContext,
  table: 'reschedules' | 'replies' | 'opt_outs',
): Promise<number> {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  const res = await request.get(
    `${supabaseUrl}/rest/v1/${table}?select=id&owner_id=eq.${owner.id}`,
    {
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'accept-profile': 'rain_day' },
    },
  );
  return ((await res.json()) as unknown[]).length;
}

test('an owner with no texting number runs a rain day on the practice phone', async ({
  page,
  request,
}) => {
  // Sign in, name the business, and import the 15 customers.
  await signIn(page, owner, '/settings');
  await page.getByLabel('Business name').fill('Green Gulf Lawn');
  await page.getByLabel('Your cell').fill('(239) 555-0111');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Saved.' })).toBeVisible();
  await page.goto('/customers/import');
  await page.getByLabel(/csv file/i).setInputFiles(CSV);
  await page.getByRole('button', { name: 'Import 15 customers' }).click();
  await expect(page).toHaveURL(/\/customers$/);

  // No dead Send: the page says it is practice and offers to send as practice.
  const tuesday = nextWeekday(2);
  await page.goto('/rain-day');
  await page.getByLabel("Day that's off").fill(tuesday);
  await expect(page.getByRole('heading', { name: /Tuesday customers \(15 of 15/ })).toBeVisible();
  await expect(page.getByTestId('practice-banner')).toContainText(
    "Practice mode — nothing is texted to anyone. Your real number isn't set up yet.",
  );
  await expect(page.getByRole('button', { name: /^Send \d+ texts?$/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Send as practice (15 texts)' }).click();
  await expect(page.getByRole('dialog')).toContainText('Nothing is texted to anyone');
  await page.getByRole('button', { name: 'Send as practice', exact: true }).click();

  // The practice phone: one customer per row, statuses going queued, sent, delivered.
  await expect(page).toHaveURL(/\/rain-day\/practice\?day=[0-9a-f-]{36}$/);
  const customers = page.getByRole('region', { name: 'Customers' }).getByRole('listitem');
  await expect(customers).toHaveCount(15);
  await expect(page.locator('button[data-status="delivered"]')).toHaveCount(15, {
    timeout: 20_000,
  });

  // Play Maria: her own text, then her reply shows on "Your cell" with her name.
  await page.getByRole('button', { name: /^Maria Lopez/ }).click();
  const phone = page.getByTestId('customer-phone');
  await expect(phone).toContainText('Hi Maria, the weather is wiping out our day');
  await page.getByLabel('Reply as Maria').fill('Can you do Thursday instead?');
  await page.getByRole('button', { name: 'Send reply' }).click();
  await expect(page.getByTestId('your-cell')).toContainText(
    'Maria Lopez replied: "Can you do Thursday instead?"',
  );
  await expect(phone).toContainText('Can you do Thursday instead?');

  // Play Pat: STOP opts them out. HELP gets the carrier line.
  await page.getByRole('button', { name: /^Pat Ruiz/ }).click();
  await page.getByRole('button', { name: 'STOP', exact: true }).click();
  await expect(page.getByTestId('customer-phone')).toContainText('Opted out');
  await page.getByRole('button', { name: /^Jim Hale/ }).click();
  await page.getByRole('button', { name: 'HELP', exact: true }).click();
  await expect(page.getByTestId('customer-phone')).toContainText(
    'Green Gulf Lawn: reply STOP to opt out.',
  );

  // The reply is in the Replies list, badged Practice.
  await page.goto('/rain-day/replies');
  await expect(page.getByRole('list', { name: 'Practice replies list' })).toContainText(
    'Can you do Thursday instead?',
  );
  await expect(page.getByRole('heading', { name: /Practice replies/ })).toContainText('Practice');

  // A second practice rain day skips Pat, who typed STOP, as production would.
  await page.goto('/rain-day');
  await page.getByLabel("Day that's off").fill(tuesday);
  await expect(page.getByRole('heading', { name: /Tuesday customers \(14 of 15/ })).toBeVisible();
  await page.getByRole('button', { name: 'Send as practice (14 texts)' }).click();
  await page.getByRole('button', { name: 'Send as practice', exact: true }).click();
  await expect(page).toHaveURL(/\/rain-day\/practice\?day=/);
  await expect(page.getByRole('button', { name: /^Pat Ruiz/ })).toContainText('skipped');

  // History lists both practice rain days, badged Practice.
  await page.goto('/rain-day/history');
  await expect(
    page.getByRole('region', { name: 'Practice rain days' }).getByRole('listitem'),
  ).toHaveCount(2);

  // Nothing real was written.
  expect(await realRows(request, 'reschedules')).toBe(0);
  expect(await realRows(request, 'replies')).toBe(0);
  expect(await realRows(request, 'opt_outs')).toBe(0);

  // Clear practice empties the phone.
  await page.goto('/rain-day/practice');
  await page.getByRole('button', { name: 'Clear practice' }).click();
  await page.getByRole('button', { name: 'Clear it' }).click();
  await expect(page).toHaveURL(/\/rain-day$/);
  await page.goto('/rain-day/practice');
  await expect(page.getByText('Nothing sent to the practice phone yet')).toBeVisible();
});

test('once a real number is set, the practice screens are gone and practice is refused', async ({
  page,
  request,
}) => {
  const real = await createOwner(request);
  try {
    await assignSenderNumber(request, real);
    // A real provider needs the Messaging Service too: with both set the owner is ready.
    await signIn(page, real, '/rain-day');
    await page.goto('/rain-day');
    await expect(page.getByTestId('practice-banner')).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Practice phone' })).toHaveCount(0);
    await page.goto('/rain-day/practice');
    await expect(page).toHaveURL(/\/rain-day$/);
  } finally {
    await deleteOwner(request, real.id);
  }
});
