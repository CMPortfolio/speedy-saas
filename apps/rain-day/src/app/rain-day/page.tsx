import type { Metadata } from 'next';

import { createServerSupabase } from '@speedy/auth/server';
import { requireUser } from '@speedy/auth/user';
import { getProfile } from '@speedy/db/core';

import { ButtonLink } from '@/components/button-link';
import { skipReason } from '@/features/rain-day/plan';
import { env } from '@/config/env';
import { getOwnerSettings } from '@/features/settings/owner-cell';
import { isPracticeOwner } from '@/features/practice/gate';
import { listPracticeOptedOutIds } from '@/features/practice/queries';
import {
  listContactedCustomerIds,
  listCustomersForDay,
  listOptedOutPhones,
} from '@/features/rain-day/queries';
import { RainDayForm } from '@/features/rain-day/rain-day-form';
import { defaultTemplate } from '@/features/rain-day/template';
import { addDays, isIsoDate, todayInNewYork, weekdayOf } from '@/lib/dates';

export const metadata: Metadata = { title: 'Rain day' };

type Search = Promise<{ from?: string; to?: string }>;

export default async function RainDayPage({ searchParams }: { searchParams: Search }) {
  const user = await requireUser('/rain-day');
  const params = await searchParams;
  const today = todayInNewYork();
  const from = params.from && isIsoDate(params.from) ? params.from : today;
  const to = params.to && isIsoDate(params.to) ? params.to : addDays(from, 1);

  const supabase = await createServerSupabase();
  const [customers, profile, optedOut, contacted, settings] = await Promise.all([
    listCustomersForDay(supabase, weekdayOf(from)),
    getProfile(supabase, user.id),
    listOptedOutPhones(supabase),
    listContactedCustomerIds(supabase),
    getOwnerSettings(supabase),
  ]);

  // Decided here on the server from the owner's own settings, never from the URL.
  const practice = isPracticeOwner(settings, env.SMS_PROVIDER);
  // A STOP typed on the practice phone skips that customer in practice, and only there.
  const practiceStopped = practice ? await listPracticeOptedOutIds(supabase) : new Set<string>();

  return (
    <section className="flex flex-col gap-6 py-4">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Rain day</h1>
        <p className="text-sm text-muted">
          Pick the day that&apos;s off and the day you&apos;re moving to. Everyone on that day gets
          their own text.
        </p>
      </header>
      <nav aria-label="Rain day pages" className="grid grid-cols-2 gap-2">
        <ButtonLink href="/rain-day/replies" variant="secondary">
          Replies
        </ButtonLink>
        <ButtonLink href="/rain-day/history" variant="secondary">
          Past rain days
        </ButtonLink>
        {practice && (
          <ButtonLink href="/rain-day/practice" variant="secondary" className="col-span-2">
            Practice phone
          </ButtonLink>
        )}
      </nav>
      <RainDayForm
        from={from}
        to={to}
        today={today}
        day={weekdayOf(from)}
        customers={customers.map((c) => ({
          id: c.id,
          name: c.name,
          phone: c.phone,
          skip: skipReason(c, optedOut) ?? (practiceStopped.has(c.id) ? 'opted_out' : null),
          firstContact: !contacted.has(c.id),
        }))}
        initialTemplate={defaultTemplate(profile?.business_name ?? '')}
        businessName={profile?.business_name?.trim() ?? ''}
        senderReady={!practice}
      />
    </section>
  );
}
