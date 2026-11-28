import { constantTimeEqual, hashClaimToken } from '@speedy/lib/device-claims';

/**
 * Is this request carrying the cron secret as `Authorization: Bearer <secret>`? Both sides are
 * hashed first so the compare is constant-time and does not leak the secret's length. With no
 * secret configured nothing is authorised.
 */
export async function isAuthorizedCron(
  request: Request,
  secret: string | undefined,
): Promise<boolean> {
  if (!secret) return false;
  const header = request.headers.get('authorization') ?? '';
  const match = /^Bearer (.+)$/.exec(header);
  if (!match?.[1]) return false;
  const [given, expected] = await Promise.all([hashClaimToken(match[1]), hashClaimToken(secret)]);
  return constantTimeEqual(given, expected);
}
