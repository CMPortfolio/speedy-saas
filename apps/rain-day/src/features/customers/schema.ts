import { z } from 'zod';

import { phoneField } from '@/lib/form-state';

const name = z
  .string()
  .trim()
  .min(1, 'Enter a name.')
  .max(120, 'Keep the name under 120 characters.');

const note = z
  .string()
  .trim()
  .max(500, 'Keep the note under 500 characters.')
  .nullable()
  .optional()
  .transform((value) => (value ? value : null));

/** What the add/edit form posts. The day arrives as the select's string value. */
export const customerFormSchema = z.object({
  name,
  phone: phoneField,
  service_day: z
    .string()
    .regex(/^[0-6]$/, 'Pick their usual day.')
    .transform(Number),
  note,
});

/** One row from the import preview, already parsed on the client; checked again here. */
export const importRowSchema = z.object({
  name,
  phone: phoneField,
  service_day: z.number().int().min(0).max(6),
  note,
});

export const importRowsSchema = z
  .array(importRowSchema)
  .min(1, 'Nothing to import.')
  .max(500, 'Import up to 500 customers at a time.');

export type CustomerInput = z.output<typeof customerFormSchema>;
export type CustomerField = 'name' | 'phone' | 'service_day' | 'note';
export const CUSTOMER_FIELDS: readonly CustomerField[] = ['name', 'phone', 'service_day', 'note'];
