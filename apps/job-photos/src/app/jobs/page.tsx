import type { Metadata } from 'next';
import Link from 'next/link';

import { createServerSupabase } from '@speedy/auth/server';
import { requireUser } from '@speedy/auth/user';
import { cn } from '@speedy/ui/cn';
import { EmptyState } from '@speedy/ui/empty-state';

import { ClaimOnSignIn } from '@/components/claim-on-sign-in';
import { listOwnedJobs } from '@/features/jobs/server/owned';

export const metadata: Metadata = { title: 'My jobs', robots: { index: false } };
export const dynamic = 'force-dynamic';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'America/New_York',
  });
}

const startLink = cn(
  'inline-flex min-h-tap items-center justify-center rounded-brand bg-primary px-6 text-base font-medium',
  'text-primary-foreground hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
);

/** Past jobs for the signed-in owner, newest first. Each row opens the page the customer saw. */
export default async function JobsPage() {
  const user = await requireUser('/jobs');
  const jobs = await listOwnedJobs(await createServerSupabase(), user.id);

  return (
    <section className="space-y-6 py-2">
      <header className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold leading-tight">My jobs</h1>
        <Link href="/new" className={startLink}>
          New job
        </Link>
      </header>
      <ClaimOnSignIn />
      {jobs.length === 0 ? (
        <EmptyState
          title="No jobs saved yet"
          description="Jobs you make on this phone from now on are saved here, and any you made before signing in are being added."
          action={
            <Link href="/new" className={startLink}>
              Start a job
            </Link>
          }
        />
      ) : (
        <ul className="divide-y divide-border rounded-brand border border-border bg-surface">
          {jobs.map((job) => (
            <li key={job.id}>
              <Link
                href={`/j/${job.share_slug}`}
                className="flex min-h-tap items-center justify-between gap-4 px-4 py-3 hover:bg-background focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium">{job.title ?? 'Untitled job'}</span>
                  {job.business_name ? (
                    <span className="block truncate text-sm text-muted">{job.business_name}</span>
                  ) : null}
                </span>
                <time dateTime={job.created_at} className="shrink-0 text-sm text-muted">
                  {formatDate(job.created_at)}
                </time>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
