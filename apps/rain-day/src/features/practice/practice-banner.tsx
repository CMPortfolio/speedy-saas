import { PRACTICE_BANNER } from './constants';

/** Says plainly that nothing is texted. Shown wherever the owner is in practice mode. */
export function PracticeBanner() {
  return (
    <p
      role="status"
      data-testid="practice-banner"
      className="rounded-brand border border-border bg-surface px-4 py-3 text-sm text-ink"
    >
      {PRACTICE_BANNER}
    </p>
  );
}
