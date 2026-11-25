import type { ReactNode } from 'react';

import { cn } from './cn';

/** The site's small uppercase label above a heading ("Custom AI solutions for businesses"). */
export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'block text-xs font-semibold uppercase tracking-[0.08em] text-muted',
        className,
      )}
    >
      {children}
    </span>
  );
}
