import { expect, test } from '@playwright/test';

import { createOwner, deleteOwner, hasSupabase, type TestOwner } from './e2e-helpers';

/**
 * Sign-in `next` handling. A sign-in link or form that names another tool's page (Missed Call's
 * /setup) must land on Rain day, not on a 404, and someone who is already signed in (one sign-in
 * is shared across the tools) is not asked for another link.
 */
test.skip(
  !hasSupabase && !process.env.CI,
  'Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (local Supabase).',
);

let owner: TestOwner;

test.beforeAll(async ({ request }) => {
  owner = await createOwner(request);
});

test.afterAll(async ({ request }) => {
  if (owner) await deleteOwner(request, owner.id);
});

test('a link made for another tool’s page lands on Rain day, not a 404', async ({ page }) => {
  await page.goto(
    `/auth/callback?token_hash=${owner.tokenHash}&type=magiclink&next=${encodeURIComponent('/setup')}`,
  );
  await expect(page).toHaveURL(/\/rain-day$/);
  await expect(page.getByRole('heading', { name: 'Rain day', exact: true })).toBeVisible();
});

test('a link for a page that is ours still goes there', async ({ page, request }) => {
  const fresh = await createOwner(request);
  try {
    await page.goto(
      `/auth/callback?token_hash=${fresh.tokenHash}&type=magiclink&next=${encodeURIComponent('/settings')}`,
    );
    await expect(page).toHaveURL(/\/settings$/);
  } finally {
    await deleteOwner(request, fresh.id);
  }
});

test('someone already signed in is sent on from the sign-in page, whatever next says', async ({
  page,
  request,
}) => {
  const fresh = await createOwner(request);
  try {
    await page.goto(
      `/auth/callback?token_hash=${fresh.tokenHash}&type=magiclink&next=${encodeURIComponent('/customers')}`,
    );
    await expect(page).toHaveURL(/\/customers$/);
    await page.goto('/sign-in?next=%2Fsetup');
    await expect(page).toHaveURL(/\/rain-day$/);
    await page.goto('/sign-in?next=%2Fsettings');
    await expect(page).toHaveURL(/\/settings$/);
  } finally {
    await deleteOwner(request, fresh.id);
  }
});

test('a signed-out visitor still gets the form, with a usable next', async ({ page }) => {
  await page.goto('/sign-in?next=%2Fsetup');
  await expect(page.getByLabel('Email')).toBeVisible();
  await expect(page.locator('input[name="next"]')).toHaveValue('/rain-day');
});
