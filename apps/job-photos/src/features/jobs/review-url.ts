import { z } from 'zod';

/**
 * The owner's "Leave a review" link: a well-formed https URL (Google, Yelp, Facebook, their own
 * site). http, javascript:, mailto: and friends are refused so the share page never links out
 * to anything but a web page over TLS.
 */
export const reviewUrlSchema = z
  .string()
  .trim()
  .max(2000)
  .pipe(
    z.url({
      protocol: /^https$/,
      error: 'Paste the full link, starting with https://',
    }),
  );

export type ReviewUrlCheck = { ok: true; url: string } | { ok: false; message: string };

/** Form-friendly wrapper: empty means "no link". */
export function checkReviewUrl(input: string | null | undefined): ReviewUrlCheck | null {
  const value = input?.trim() ?? '';
  if (!value) return null;
  const parsed = reviewUrlSchema.safeParse(value);
  if (parsed.success) return { ok: true, url: parsed.data };
  return {
    ok: false,
    message: parsed.error.issues[0]?.message ?? 'That link does not look right.',
  };
}
