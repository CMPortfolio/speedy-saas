/** The current time in ms. Server pages call this instead of Date.now() in render. */
export function nowMs(): number {
  return Date.now();
}

/** After this long a text still "sending" never will, so pages stop waiting and say so. */
export const QUEUED_STALE_MS = 2 * 60_000;

export function isStale(createdAt: string, now: number = nowMs()): boolean {
  return now - new Date(createdAt).getTime() > QUEUED_STALE_MS;
}
