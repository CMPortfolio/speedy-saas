import type { Metadata } from 'next';

import { createServerSupabase, createServiceSupabase } from '@speedy/auth/server';
import { requireUser } from '@speedy/auth/user';
import { getProfile } from '@speedy/db/core';

import { CellForm } from '@/features/settings/cell-form';
import { getOwnerSettings } from '@/features/settings/owner-cell';
import { createVerifyStore, hasPendingCode } from '@/features/settings/verify-store';
import { SettingsForm } from '@/features/settings/settings-form';

export const metadata: Metadata = { title: 'Settings' };

export default async function SettingsPage() {
  const user = await requireUser('/settings');
  const supabase = await createServerSupabase();
  const [profile, settings, codePending] = await Promise.all([
    getProfile(supabase, user.id),
    getOwnerSettings(supabase),
    hasPendingCode(createVerifyStore(createServiceSupabase()), user.id),
  ]);

  return (
    <section className="flex flex-col gap-6 py-4">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Your business</h1>
        <p className="text-sm text-muted">
          Two things every rain-day text needs: who it is from and who to call back.
        </p>
      </header>
      <SettingsForm businessName={profile?.business_name ?? ''} phone={profile?.phone ?? ''} />
      <section className="flex flex-col gap-3 border-t border-border pt-6">
        <h2 className="text-lg font-semibold">Customer replies</h2>
        <p className="text-sm text-muted">
          When a customer texts back, we text it to your cell with their name. Every reply is also
          kept in your Replies list.
        </p>
        <CellForm
          verifiedCell={settings?.owner_cell ?? null}
          codePending={codePending}
          suggestedPhone={profile?.phone ?? ''}
        />
      </section>
    </section>
  );
}
