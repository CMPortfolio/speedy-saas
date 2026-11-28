import Link from 'next/link';

import { cn } from '@speedy/ui/cn';

import { tool } from '../../tool.config';

/**
 * Landing page. Plain copy for the trade: the moment, what happens, what it costs them now.
 * Replace the placeholder copy before shipping; keep the Start button above the fold.
 */
export default function LandingPage() {
  return (
    <section className="space-y-6 py-6">
      <header className="space-y-3">
        <h1 className="text-3xl font-semibold leading-tight">{tool.name}</h1>
        <p className="text-lg text-muted">{tool.scope}</p>
      </header>
      <Link
        href="/start"
        data-testid="start"
        className={cn(
          'flex min-h-tap w-full items-center justify-center rounded-brand bg-primary px-6 text-lg font-medium',
          'text-primary-foreground hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
        )}
      >
        Start
      </Link>
      <ul className="space-y-2 text-muted">
        <li>Works on your phone, no app to install.</li>
        <li>Under 3 minutes from opening it to done.</li>
        <li>Sign in only if you want to come back to your work.</li>
      </ul>
    </section>
  );
}
