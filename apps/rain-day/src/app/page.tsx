import Link from 'next/link';

import { cn } from '@speedy/ui/cn';

import { tool } from '../../tool.config';

const TRADES = [
  'Lawn care',
  'Pool service',
  'Landscaping',
  'Pressure washing',
  'Painting',
  'Pest control',
];

const STEPS = [
  {
    title: 'Add your customers once',
    body: 'Type them in, paste a list, or bring a spreadsheet. Each one has a name, a cell and their usual day.',
  },
  {
    title: 'Pick the day that is off',
    body: "Tap Rain day, pick the day the weather killed and the day you're moving to. Everyone whose usual day matches is already ticked.",
  },
  {
    title: 'Tap send',
    body: 'Each customer gets their own text with their own name, like "Hi Maria, the weather is wiping out our day, so we\'re moving your service to Wednesday." No group thread.',
  },
];

/**
 * Landing page. The moment, what happens, and the one button. Sign-in comes first because the
 * tool keeps customer phone numbers.
 */
export default function LandingPage() {
  return (
    <div className="space-y-10 py-6">
      <section className="space-y-6">
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
        <p className="text-sm text-muted">
          Works on your phone, no app to install. Sign in with your email so your customer list is
          there next time.
        </p>
      </section>

      <section aria-labelledby="who" className="space-y-3">
        <h2 id="who" className="text-xl font-semibold">
          For crews who work outside
        </h2>
        <p className="text-muted">
          A storm parks over the route at 2 PM. You have fourteen customers on the books and no time
          to text them one by one. Rain Day does it in one tap.
        </p>
        <ul aria-label="Trades" className="flex flex-wrap gap-2">
          {TRADES.map((trade) => (
            <li
              key={trade}
              className="rounded-brand border border-border bg-surface px-3 py-1 text-sm text-ink"
            >
              {trade}
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="how" className="space-y-4">
        <h2 id="how" className="text-xl font-semibold">
          How it works
        </h2>
        <ol className="space-y-4">
          {STEPS.map((step, i) => (
            <li key={step.title} className="flex gap-3">
              <span
                aria-hidden="true"
                className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground"
              >
                {i + 1}
              </span>
              <div className="space-y-1">
                <h3 className="font-medium text-ink">{step.title}</h3>
                <p className="text-muted">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="after" className="space-y-3">
        <h2 id="after" className="text-xl font-semibold">
          After you send
        </h2>
        <ul className="list-disc space-y-2 pl-5 text-muted">
          <li>You see who got their text, who it reached, and who was skipped.</li>
          <li>When a customer answers, it is texted to your cell with their name.</li>
          <li>Anyone who replies STOP is never texted again.</li>
          <li>US numbers only. It does not plan routes, schedule jobs or check the weather.</li>
        </ul>
      </section>
    </div>
  );
}
