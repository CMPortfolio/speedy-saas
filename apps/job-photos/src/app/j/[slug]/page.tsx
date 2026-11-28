import type { Metadata } from 'next';
import Image from 'next/image';
import { notFound } from 'next/navigation';

import { cn } from '@speedy/ui/cn';

import { loadShareJob, type SharePhoto } from '@/features/jobs/server/share';

import { tool } from '../../../../tool.config';

type Params = { params: Promise<{ slug: string }> };

/** Signed URLs expire, so never cache the page. */
export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const result = await loadShareJob((await params).slug);
  const business = result.state === 'ok' ? result.job.businessName : null;
  const title = business ? `${business}: before and after` : 'Before and after photos';
  return {
    title,
    description: `Photos of the job, before and after, from ${business ?? 'your tech'}.`,
    robots: { index: false, follow: false },
    openGraph: { title, type: 'article' },
  };
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'America/New_York',
  });
}

function PhotoColumn({ label, photos }: { label: string; photos: SharePhoto[] }) {
  return (
    <section className="space-y-3" aria-labelledby={`${label}-heading`}>
      <h2 id={`${label}-heading`} className="text-lg font-semibold">
        {label}
      </h2>
      {photos.length === 0 ? (
        <p className="rounded-brand border border-dashed border-border px-4 py-8 text-center text-sm text-muted">
          No {label.toLowerCase()} photos.
        </p>
      ) : (
        <ul className="space-y-3">
          {photos.map((photo, index) => (
            <li
              key={photo.id}
              className="overflow-hidden rounded-brand border border-border bg-surface"
            >
              <Image
                src={photo.url}
                alt={`${label} photo ${index + 1}`}
                width={photo.width}
                height={photo.height}
                unoptimized
                sizes="(min-width: 640px) 50vw, 100vw"
                className="h-auto w-full"
                priority={index === 0}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ExpiredPage() {
  return (
    <section className="space-y-3 py-10 text-center">
      <h1 className="text-2xl font-semibold">This link has expired</h1>
      <p className="text-muted">
        Photos shared without an account are kept for 30 days. Ask the business to send the job
        again if you still need them.
      </p>
    </section>
  );
}

/** What the customer sees: who did the work, before and after side by side, the note, the date. */
export default async function SharePage({ params }: Params) {
  const result = await loadShareJob((await params).slug);
  if (result.state === 'not_found') notFound();
  if (result.state === 'expired') return <ExpiredPage />;
  const { job } = result;
  const business = job.businessName ?? tool.name;

  return (
    <article className="space-y-6 py-4">
      <header className="flex items-center gap-4">
        {job.logoUrl ? (
          <Image
            src={job.logoUrl}
            alt=""
            width={64}
            height={64}
            unoptimized
            className="size-16 rounded-brand border border-border bg-surface object-contain"
          />
        ) : null}
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold leading-tight">{business}</h1>
          <p className="text-sm text-muted">
            {job.title ? `${job.title} · ` : ''}
            <time dateTime={job.createdAt}>{formatDate(job.createdAt)}</time>
          </p>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <PhotoColumn label="Before" photos={job.before} />
        <PhotoColumn label="After" photos={job.after} />
      </div>

      {job.note ? (
        <p className="rounded-brand border border-border bg-surface px-4 py-3 text-base">
          {job.note}
        </p>
      ) : null}

      {job.reviewUrl ? (
        <a
          href={job.reviewUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            'flex min-h-tap w-full items-center justify-center rounded-brand bg-primary px-6 text-lg font-medium',
            'text-primary-foreground hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
          )}
        >
          Leave {business} a review
        </a>
      ) : null}
    </article>
  );
}
