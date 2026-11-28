import { z } from 'zod';

/** Zod schemas for the core tables, used by forms and server routes in every tool. */
export const profileUpdateSchema = z.object({
  full_name: z.string().trim().max(120).nullable().optional(),
  business_name: z.string().trim().max(120).nullable().optional(),
  trade: z.string().trim().max(60).nullable().optional(),
  city: z.string().trim().max(60).nullable().optional(),
  phone: z.string().trim().max(32).nullable().optional(),
  logo_path: z.string().trim().max(400).nullable().optional(),
});
export type ProfileUpdate = z.infer<typeof profileUpdateSchema>;

export const feedbackSchema = z.object({
  tool_slug: z.string().min(1).max(60),
  helped: z.boolean(),
  note: z.string().trim().max(1000).optional(),
});
export type FeedbackInput = z.infer<typeof feedbackSchema>;

export const toolSlugSchema = z
  .string()
  .regex(/^[a-z][a-z0-9-]{1,40}$/, 'slug: lowercase letters, digits and dashes');
