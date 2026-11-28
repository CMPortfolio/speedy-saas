import { normalizeUsPhone } from '@speedy/lib/phone';
import { z } from 'zod';

/** What a form's server action hands back to `useActionState`. */
export type FieldErrors<K extends string> = Partial<Record<K, string>>;

export type FormState<K extends string> =
  | { status: 'idle' }
  | { status: 'saved' }
  | { status: 'error'; message: string; fieldErrors?: FieldErrors<K> };

export const IDLE: { status: 'idle' } = { status: 'idle' };

/** First message per top-level field from a Zod failure. */
export function fieldErrorsFrom<K extends string>(
  issues: readonly { path: readonly PropertyKey[]; message: string }[],
): FieldErrors<K> {
  const out: FieldErrors<K> = {};
  for (const issue of issues) {
    const key = issue.path[0];
    if (typeof key === 'string' && out[key as K] === undefined) out[key as K] = issue.message;
  }
  return out;
}

export function invalid<K extends string>(
  issues: readonly { path: readonly PropertyKey[]; message: string }[],
): FormState<K> {
  return {
    status: 'error',
    message: 'Check the fields below.',
    fieldErrors: fieldErrorsFrom(issues),
  };
}

/** A US cell number in any spelling, stored as E.164. */
export const phoneField = z
  .string()
  .trim()
  .min(1, 'Enter a cell number.')
  .transform((value, ctx) => {
    const phone = normalizeUsPhone(value);
    if (!phone) {
      ctx.addIssue({ code: 'custom', message: 'Enter a 10-digit US cell number.' });
      return z.NEVER;
    }
    return phone;
  });

/** Read a FormData into plain strings for Zod. Missing fields become ''. */
export function formValues<K extends string>(
  formData: FormData,
  keys: readonly K[],
): Record<K, string> {
  const out = {} as Record<K, string>;
  for (const key of keys) out[key] = String(formData.get(key) ?? '');
  return out;
}
