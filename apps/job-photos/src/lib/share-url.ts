/** The link the owner sends: `${appUrl}/j/<slug>`. Pure so the route and tests agree. */
export function shareUrlFor(appUrl: string, shareSlug: string): string {
  return `${appUrl.replace(/\/+$/, '')}/j/${shareSlug}`;
}

/** Share slugs come from `randomSlug()`: base-62, 16 to 40 characters. Anything else is a 404. */
export const SHARE_SLUG_PATTERN = /^[A-Za-z0-9]{16,40}$/;
