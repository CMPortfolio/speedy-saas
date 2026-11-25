/** The current time in ms. Server pages call this instead of Date.now() in render. */
export function nowMs(): number {
  return Date.now();
}
