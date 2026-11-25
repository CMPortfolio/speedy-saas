import type { Metadata } from 'next';

import { createServerSupabase } from '@speedy/auth/server';
import { requireUser } from '@speedy/auth/user';
import { getProfile } from '@speedy/db/core';

import { skipReason } from '@/features/rain-day/plan';
import { listCustomersForDay, listOptedOutPhones } from '@/features/rain-day/queries';
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
  const [customers, profile, optedOut] = await Promise.all([
    listCustomersForDay(supabase, weekdayOf(from)),
    getProfile(supabase, user.id),
    listOptedOutPhones(supabase),
  ]);

  return (
    <section className="flex flex-col gap-6 py-4">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Rain day</h1>
        <p className="text-sm text-muted">
          Pick the day that&apos;s off and the day you&apos;re moving to. Everyone on that day gets
          their own text.
        </p>
      </header>
      <RainDayForm
        from={from}
        to={to}
        today={today}
        day={weekdayOf(from)}
        customers={customers.map((c) => ({
          id: c.id,
          name: c.name,
          phone: c.phone,
          skip: skipReason(c, optedOut),
        }))}
        initialTemplate={defaultTemplate(profile?.business_name ?? '')}
      />
    </section>
  );
}
