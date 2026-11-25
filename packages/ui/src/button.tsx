import type { ComponentPropsWithoutRef, ReactNode } from 'react';

import { cn } from './cn';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ComponentPropsWithoutRef<'button'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows a spinner, disables the button and tells assistive tech it is busy. */
  loading?: boolean;
  /** Stretches to the container width. Handy for the main action on a phone. */
  fullWidth?: boolean;
  children: ReactNode;
}

const base =
  'inline-flex items-center justify-center gap-2 rounded-brand border border-transparent font-medium ' +
  'min-h-tap min-w-tap select-none no-underline transition-colors ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ' +
  'disabled:cursor-not-allowed disabled:opacity-60';

// The site's buttons: solid deep blue, or an ink outline that fills on hover.
const variants: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-primary-foreground hover:bg-primary-hover',
  secondary: 'border-ink bg-transparent text-ink hover:bg-ink hover:text-white',
  ghost: 'bg-transparent text-primary hover:bg-brand-soft',
  danger: 'bg-danger text-primary-foreground hover:bg-danger/90',
};

const sizes: Record<ButtonSize, string> = {
  sm: 'px-3 text-sm',
  md: 'px-5 text-[0.95rem]',
  lg: 'px-6 text-base',
};

/**
 * The button look for anything that is not a `<button>`, such as a Next `<Link>` that should
 * read as a button (landing pages): `<Link className={buttonClasses({ fullWidth: true })}>`.
 */
export function buttonClasses({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
}: { variant?: ButtonVariant; size?: ButtonSize; fullWidth?: boolean } = {}): string {
  return cn(base, variants[variant], sizes[size], fullWidth && 'w-full');
}

function Spinner() {
  return (
    <svg
      aria-hidden="true"
      className="size-4 animate-spin"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
    >
      <circle cx="12" cy="12" r="9" className="opacity-25" />
      <path d="M21 12a9 9 0 0 0-9-9" strokeLinecap="round" />
    </svg>
  );
}

/**
 * The house button. Always at least 44px tall and wide, always with a visible focus ring.
 * Server-component friendly: pass `onClick` only from a client component.
 */
export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  fullWidth = false,
  disabled,
  className,
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  const isDisabled = disabled || loading;
  return (
    <button
      type={type}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      className={cn(buttonClasses({ variant, size, fullWidth }), className)}
      {...rest}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
}
