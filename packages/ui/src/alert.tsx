import type { ReactNode } from 'react';

import { cn } from './cn';

export type AlertTone = 'error' | 'success' | 'info' | 'warning';

export interface AlertProps {
  tone?: AlertTone;
  children: ReactNode;
  className?: string;
}

const tones: Record<AlertTone, string> = {
  error: 'border-danger/40 bg-danger/5 text-danger',
  success: 'border-success/40 bg-success/5 text-success',
  warning: 'border-warning/40 bg-warning/5 text-warning',
  info: 'border-brand/30 bg-brand-soft text-brand-deep',
};

/** A short message. Errors are announced right away (`role="alert"`), the rest politely. */
export function Alert({ tone = 'info', children, className }: AlertProps) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn('rounded-brand border px-3 py-2 text-sm', tones[tone], className)}
    >
      {children}
    </div>
  );
}
