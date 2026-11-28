import Link from 'next/link';

import { cn } from '@speedy/ui/cn';

import { tool } from '../../tool.config';

/**
 * Landing page. Plain copy for the trade: the moment, what happens, and why this tool asks for a
 * sign-in up front (it stores the business number and the owner's cell).
 */
export default function LandingPage() {
  return (
    <section className="space-y-6 py-6">
      <header className="space-y-3">
        <h1 className="text-3xl font-semibold leading-tight">{tool.name}</h1>
        <p className="text-lg text-muted">{tool.scope}</p>
      </header>
      <Link
        href="/sign-in?next=/setup"
        data-testid="start"
        className={cn(
          'flex min-h-tap w-full items-center justify-center rounded-brand bg-primary px-6 text-lg font-medium',
          'text-primary-foreground hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
        )}
      >
        Start
      </Link>
      <p className="text-muted" data-testid="why-sign-in">
        This one asks you to sign in first. It keeps the number customers call and your own cell on
        file so it knows which calls you missed and where to send the replies. Phone numbers stay
        behind a sign-in; nothing is saved until you do.
      </p>
      <ul className="space-y-2 text-muted">
        <li>Works on your phone, no app to install.</li>
        <li>Set up in under 3 minutes; the first text-back goes out on the next missed call.</li>
        <li>Replies land in one list, newest first, so you call back when the job is done.</li>
      </ul>
    </section>
  );
}
