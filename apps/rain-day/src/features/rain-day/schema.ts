import { z } from 'zod';

import { isIsoDate } from '@/lib/dates';

import { findBadPlaceholders, MAX_TEMPLATE_LENGTH } from './template';

const isoDate = z.string().refine(isIsoDate, 'Pick a date.');

/** What the Send button posts. The server re-reads customers and fills in each message itself. */
export const sendInputSchema = z
  .object({
    idempotencyKey: z.uuid(),
    from: isoDate,
    to: isoDate,
    template: z
      .string()
      .trim()
      .min(1, 'Write the message first.')
      .max(MAX_TEMPLATE_LENGTH, `Keep the message under ${MAX_TEMPLATE_LENGTH} characters.`)
      .refine(
        (t) => findBadPlaceholders(t).length === 0,
        'Only {first_name} and {new_day} can be filled in.',
      ),
    customerIds: z
      .array(z.uuid())
      .min(1, 'Tick at least one customer.')
      .max(500, 'Send up to 500 customers at a time.'),
  })
  .refine((v) => v.from !== v.to, { message: 'Pick a different day to move to.', path: ['to'] });

export type SendInput = z.output<typeof sendInputSchema>;
