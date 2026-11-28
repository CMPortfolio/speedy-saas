import { Alert } from '@speedy/ui/alert';

import { PRACTICE_BANNER } from './constants';

/** Says plainly that nothing is texted. Shown wherever the owner is in practice mode. */
export function PracticeBanner() {
  return (
    <div data-testid="practice-banner">
      <Alert tone="info">{PRACTICE_BANNER}</Alert>
    </div>
  );
}
