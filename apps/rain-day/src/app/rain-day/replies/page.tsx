import type { Metadata } from 'next';
import Link from 'next/link';

import { createServerSupabase } from '@speedy/auth/server';
import { requireUser } from '@speedy/auth/user';
import { EmptyState } from '@speedy/ui/empty-state';

import { ButtonLink } from '@/components/button-link';
import { listReplies } from '@/features/replies/queries';
import { env } from '@/config/env';
import { isPracticeOwner } from '@/features/practice/gate';
import { PracticeRepliesSection } from '@/features/practice/practice-replies-section';
import { listPracticeReplies } from '@/features/practice/queries';
import { getOwnerSettings } from '@/features/settings/owner-cell';

export const metadata: Metadata = { title: 'Replies' };

const FORWARD_LABELS: Record<string, string> = {
  sent: 'Texted to your cell',
  failed: 'Could not text to your cell',
  capped: 'Not forwarded: 30 an hour limit',
  not_set_up: 'Not forwarded: add your cell in Settings',
  pending: 'Forwarding',
};

const when = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

export default async function RepliesPage() {
  await requireUser('/rain-day/replies');
  const supabase = await createServerSupabase();
  const [replies, settings] = await Promise.all([
    listReplies(supabase),
    getOwnerSettings(supabase),
  ]);
  // Practice replies show only while the owner is in practice mode, decided from their settings.
  const practice = isPracticeOwner(settings, env.SMS_PROVIDER);
  const practiceReplies = practice ? await listPracticeReplies(supabase) : [];

  return (
    <section className="flex flex-col gap-6 py-4">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Replies</h1>
        <p className="text-sm text-muted">The latest texts customers sent back.</p>
      </header>
      {!settings?.owner_cell && (
        <p className="rounded-brand border border-border bg-surface px-4 py-3 text-sm text-ink">
          Replies are not being texted to you yet.{' '}
          <Link href="/settings" className="font-medium text-primary underline">
            Add your cell in Settings
          </Link>
          .
        </p>
      )}
      {replies.length === 0 && !practice ? (
        <EmptyState
          title="No replies yet"
          description="When a customer answers a rain-day text, it shows up here."
          action={<ButtonLink href="/rain-day">Run a rain day</ButtonLink>}
        />
      ) : replies.length === 0 ? null : (
        <ul aria-label="Replies" className="flex flex-col gap-2">
          {replies.map((r) => (
            <li
              key={r.id}
              className="flex flex-col gap-1 rounded-brand border border-border bg-surface px-4 py-3"
            >
              <div className="flex items-start justify-between gap-3">
                <span className="text-base font-medium text-ink">{r.customer_name}</span>
                <span className="text-sm text-muted">{when.format(new Date(r.created_at))}</span>
              </div>
              <p className="text-base text-ink">{r.body}</p>
              <p className="text-sm text-muted">
                {FORWARD_LABELS[r.forward_status] ?? r.forward_status}
              </p>
            </li>
          ))}
        </ul>
      )}
      {practice && <PracticeRepliesSection replies={practiceReplies} />}
    </section>
  );
}
