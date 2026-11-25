/**
 * The origin (scheme and host) this app is served from, for links and redirects it builds itself.
 *
 * Behind Railway the request URL is the container's own address (https://localhost:8080), so a
 * redirect built from it sends the user to localhost. APP_URL is set on every deployed service to
 * the public address and is the source of truth there. `fallback` (the request origin or the Origin
 * header) is only used where APP_URL is not set, which is local development. An APP_URL that is not
 * an absolute http(s) URL is ignored rather than trusted, and in production it throws instead of
 * falling back.
 */
export function appOrigin(
  fallback?: string,
  appUrl: string | undefined = process.env.APP_URL,
  nodeEnv: string | undefined = process.env.NODE_ENV,
): string {
  const configured = httpOrigin(appUrl);
  if (configured) return configured;
  // In production a missing or broken APP_URL would quietly send people to the container's own
  // address, so fail loudly at the request instead. This only runs when a request comes in, never
  // at build time.
  if (nodeEnv === 'production') {
    throw new Error('APP_URL must be set to the public https:// address of this app in production');
  }
  return fallback || 'http://localhost:3000';
}

function httpOrigin(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.origin : null;
  } catch {
    return null;
  }
}
