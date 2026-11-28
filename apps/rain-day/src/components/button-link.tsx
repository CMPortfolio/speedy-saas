import Link from 'next/link';
import type { ComponentPropsWithoutRef } from 'react';

import { cn } from '@speedy/ui/cn';

type Variant = 'primary' | 'secondary' | 'ghost';

const variants: Record<Variant, string> = {
  primary: 'bg-primary text-primary-foreground hover:bg-primary-hover',
  secondary: 'border border-border bg-surface text-ink hover:bg-background',
  ghost: 'bg-transparent text-primary hover:bg-primary/10',
};

export interface ButtonLinkProps extends ComponentPropsWithoutRef<typeof Link> {
  variant?: Variant;
  fullWidth?: boolean;
}

/** A Next link that looks like the house `Button`, for navigation from server components. */
export function ButtonLink({
  variant = 'primary',
  fullWidth = false,
  className,
  children,
  ...rest
}: ButtonLinkProps) {
  return (
    <Link
      className={cn(
        'inline-flex min-h-tap min-w-tap items-center justify-center gap-2 rounded-brand px-4 text-base font-medium',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
        variants[variant],
        fullWidth && 'w-full',
        className,
      )}
      {...rest}
    >
      {children}
    </Link>
  );
}
