import type { Metadata } from 'next';

import { createServerSupabase } from '@speedy/auth/server';
import { requireUser } from '@speedy/auth/user';
import { getProfile } from '@speedy/db/core';

import { SettingsForm } from '@/features/settings/settings-form';

export const metadata: Metadata = { title: 'Settings' };

export default async function SettingsPage() {
  const user = await requireUser('/settings');
  const supabase = await createServerSupabase();
  const profile = await getProfile(supabase, user.id);

  return (
    <section className="flex flex-col gap-6 py-4">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Your business</h1>
        <p className="text-sm text-muted">
          Two things every rain-day text needs: who it is from and who to call back.
        </p>
      </header>
      <SettingsForm businessName={profile?.business_name ?? ''} phone={profile?.phone ?? ''} />
    </section>
  );
}
