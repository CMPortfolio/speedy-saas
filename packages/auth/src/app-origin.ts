/**
 * The origin (scheme and host) this app is served from, for links and redirects it builds itself.
 *
 * Behind Railway the request URL is the container's own address (https://localhost:8080), so a
 * redirect built from it sends the user to localhost. APP_URL is set on every deployed service to
 * the public address and is the source of truth there. `fallback` (the request origin or the Origin
 * header) is only used where APP_URL is not set, which is local development. An APP_URL that is not
 * an absolute http(s) URL is ignored rather than trusted.
 */
export function appOrigin(
  fallback?: string,
  appUrl: string | undefined = process.env.APP_URL,
): string {
  if (appUrl) {
    try {
      const url = new URL(appUrl);
      if (url.protocol === 'https:' || url.protocol === 'http:') return url.origin;
    } catch {
      // Not a URL: fall through to the fallback.
    }
  }
  return fallback || 'http://localhost:3000';
}
