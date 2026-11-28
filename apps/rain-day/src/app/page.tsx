import Link from 'next/link';

import { cn } from '@speedy/ui/cn';

import { tool } from '../../tool.config';

/**
 * Landing page. The moment, what happens, and the one button. Sign-in comes first because the
 * tool keeps customer phone numbers.
 */
export default function LandingPage() {
  return (
    <section className="space-y-6 py-6">
      <header className="space-y-3">
        <h1 className="text-3xl font-semibold leading-tight">{tool.name}</h1>
        <p className="text-lg text-muted">{tool.scope}</p>
      </header>
      <Link
        href="/sign-in?next=/customers"
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
        <li>Add your customers once, with their usual day.</li>
        <li>Rain day: pick the day, pick the new day, tap once. Everyone gets their own text.</li>
        <li>Sign in with your email so your customer list is there next time.</li>
      </ul>
    </section>
  );
}
