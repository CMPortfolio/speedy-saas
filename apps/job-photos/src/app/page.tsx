import Link from 'next/link';

import { cn } from '@speedy/ui/cn';

import { tool } from '../../tool.config';

/** Landing page: the moment, what happens, and the one button. No account needed to start. */
export default function LandingPage() {
  return (
    <section className="space-y-6 py-6">
      <header className="space-y-3">
        <h1 className="text-3xl font-semibold leading-tight">
          Show the customer the work. One link, before and after.
        </h1>
        <p className="text-lg text-muted">{tool.scope}</p>
      </header>
      <Link
        href="/new"
        data-testid="start"
        className={cn(
          'flex min-h-tap w-full items-center justify-center rounded-brand bg-primary px-6 text-lg font-medium',
          'text-primary-foreground hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
        )}
      >
        Start a job
      </Link>
      <ol className="space-y-2 text-muted">
        <li>1. Snap up to six photos before you start and six when you finish.</li>
        <li>2. Add a one-line note if you want.</li>
        <li>3. Send the link from your phone. The customer sees them side by side.</li>
      </ol>
      <p className="text-sm text-muted">
        No account needed. Sign in later if you want to keep your past jobs.
      </p>
    </section>
  );
}
