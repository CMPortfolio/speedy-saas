import Link from 'next/link';

import { buttonClasses } from '@speedy/ui/button';
import { PageHeader } from '@speedy/ui/page-header';
import { Steps } from '@speedy/ui/steps';

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
    <div className="space-y-10 py-2">
      <section className="space-y-6">
        <PageHeader
          size="hero"
          eyebrow="For lawn, pool and outdoor crews"
          title={tool.headline}
          description={tool.lede}
          actions={
            <Link
              href="/sign-in?next=/customers"
              data-testid="start"
              className={buttonClasses({ size: 'lg', fullWidth: true })}
            >
              Start
            </Link>
          }
        />
        <p className="text-sm text-muted">
          Works on your phone, no app to install. Sign in with your email so your customer list is
          there next time.
        </p>
      </section>

      <section aria-labelledby="who" className="space-y-3">
        <h2 id="who" className="text-3xl text-ink">
          When a storm hits the route
        </h2>
        <p className="text-muted">
          A storm parks over the route at 2 PM. You have fourteen customers on the books and no time
          to text them one by one. Rain Day does it in one tap.
        </p>
        <ul aria-label="Trades" className="flex flex-wrap gap-2">
          {TRADES.map((trade) => (
            <li
              key={trade}
              className="rounded-brand border border-line bg-surface px-3 py-1 text-sm text-ink"
            >
              {trade}
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="how" className="space-y-4">
        <h2 id="how" className="text-3xl text-ink">
          How it works
        </h2>
        <Steps items={STEPS.map((step) => ({ title: step.title, body: step.body }))} />
      </section>

      <section aria-labelledby="after" className="space-y-3">
        <h2 id="after" className="text-3xl text-ink">
          After you send
        </h2>
        <ul className="list-disc space-y-2 pl-5 text-muted">
          <li>You see who got their text, who it reached, and who was skipped.</li>
          <li>When a customer answers, it is texted to your cell with their name.</li>
          <li>Anyone who replies STOP is never texted again.</li>
          <li>Works with US cell numbers.</li>
        </ul>
      </section>
    </div>
  );
}
