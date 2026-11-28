/** Safe redirect target after sign-in: a same-origin path only, never a full URL. */
export function safeNext(next: string | undefined | null): string {
  if (!next || !next.startsWith('/') || next.startsWith('//')) return '/';
  return next;
}
