/** Never used as a real address: only here to resolve a path and see whether it stays on the site. */
const BASE = 'https://app.invalid';

/** A backslash, or a control character (tab, newline, NUL, DEL and the rest). */
function hasUnsafeCharacter(value: string): boolean {
  for (const ch of value) {
    const code = ch.codePointAt(0) ?? 0;
    if (ch === '\\' || code <= 0x1f || code === 0x7f) return true;
  }
  return false;
}

/**
 * Safe redirect target after sign-in: a path on this site only, never another origin.
 *
 * Browsers treat a backslash like a slash and drop tabs and newlines inside a URL, so `/\evil.com`,
 * `/\t/evil.com` and `/\n/evil.com` all become `//evil.com`, a different site. Those and any other
 * backslash or control character are refused outright. What is left is resolved the way a browser
 * would, and only the path, query and hash are kept, so a trick we did not think of still cannot
 * change the origin. (`/%5Cevil.com` is fine: an encoded backslash is data in a path, not a
 * separator.)
 */
export function safeNext(next: string | undefined | null): string {
  if (!next || !next.startsWith('/') || next.startsWith('//')) return '/';
  if (hasUnsafeCharacter(next)) return '/';
  try {
    const url = new URL(next, BASE);
    if (url.origin !== BASE) return '/';
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return '/';
  }
}
