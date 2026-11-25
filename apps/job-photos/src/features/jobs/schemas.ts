import { z } from 'zod';

import { PHOTO_KINDS } from '@/config/constants';

import { reviewUrlSchema } from './review-url';

/** Empty strings from forms become null so they never overwrite a column with "". */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === '' ? null : v))
    .nullable()
    .optional();

export const jobDetailsSchema = z.object({
  title: optionalText(120),
  note: optionalText(300),
  business_name: optionalText(120),
  review_url: z
    .preprocess(
      (v) => (typeof v === 'string' && v.trim() === '' ? null : v),
      reviewUrlSchema.nullable(),
    )
    .optional(),
});
export type JobDetails = z.infer<typeof jobDetailsSchema>;

export const createJobSchema = jobDetailsSchema;
export type CreateJobInput = z.infer<typeof createJobSchema>;

export const updateJobSchema = jobDetailsSchema.partial();
export type UpdateJobInput = z.infer<typeof updateJobSchema>;

export const photoKindSchema = z.enum(PHOTO_KINDS);

/** Fields that ride along with a photo upload (the browser knows the size after resizing). */
export const photoUploadFieldsSchema = z.object({
  kind: photoKindSchema,
  width: z.coerce.number().int().min(1).max(10000),
  height: z.coerce.number().int().min(1).max(10000),
});
export type PhotoUploadFields = z.infer<typeof photoUploadFieldsSchema>;

export const jobIdSchema = z.uuid();

/** What the create route returns. The claim token is shown once and kept on the device. */
export interface CreatedJob {
  id: string;
  shareSlug: string;
  /** `${APP_URL}/j/<shareSlug>`: what the owner sends to the customer. */
  shareUrl: string;
  claimToken: string;
}

export interface PhotoSummary {
  id: string;
  kind: z.infer<typeof photoKindSchema>;
  position: number;
  width: number;
  height: number;
}
