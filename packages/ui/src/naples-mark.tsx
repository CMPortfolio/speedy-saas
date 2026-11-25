import { cn } from './cn';

export interface NaplesMarkProps {
  /** Rendered size in px (square). */
  size?: number;
  /** On a navy band the mark sits on a white chip, as on naplesaiagency.com. */
  chip?: boolean;
  className?: string;
}

/**
 * The Naples AI mark. Each app serves it from `/naples-mark.png` (copied from
 * packages/ui/assets, with the favicon files). Decorative: the wordmark next to it names it.
 */
export function NaplesMark({ size = 30, chip = false, className }: NaplesMarkProps) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- a 64px static asset; no optimiser needed
    <img
      src="/naples-mark.png"
      alt=""
      width={size}
      height={size}
      className={cn('shrink-0 object-contain', chip && 'bg-white p-[3px]', className)}
    />
  );
}
