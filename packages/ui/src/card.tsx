import type { ComponentPropsWithoutRef } from 'react';

import { cn } from './cn';

export interface CardProps extends ComponentPropsWithoutRef<'div'> {
  /** A 3px brand-blue top rule, like the cards on the site. */
  accent?: boolean;
}

/** A white panel on the paper background. */
export function Card({ accent = false, className, ...rest }: CardProps) {
  return (
    <div
      className={cn(
        'rounded-brand border border-line bg-surface p-5',
        accent && 'border-t-[3px] border-t-brand',
        className,
      )}
      {...rest}
    />
  );
}
