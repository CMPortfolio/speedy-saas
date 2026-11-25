/**
 * Device claims: let a phone that created something without signing in prove, later, that it
 * did. The server hands out a random token and stores only its SHA-256 hash; the device keeps
 * the token in localStorage under a tool-specific namespace. After sign-in the device sends its
 * tokens and the server attaches those rows to the new account.
 *
 * Nothing in here knows about any one tool. Works in the browser and in Node (Web Crypto).
 */

export interface DeviceClaim {
  id: string;
  token: string;
  /** ISO timestamp of when the device remembered it. */
  rememberedAt: string;
}

/** The slice of Storage we use, so tests can pass a plain Map-backed fake. */
export interface ClaimStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const PREFIX = 'speedy.claims.';
const MAX_CLAIMS = 200;

function keyFor(namespace: string): string {
  if (!/^[a-z0-9-]{1,40}$/.test(namespace)) {
    throw new RangeError(`device-claims: bad namespace "${namespace}"`);
  }
  return `${PREFIX}${namespace}`;
}

function defaultStore(): ClaimStore | null {
  try {
    return typeof window !== 'undefined' && window.localStorage ? window.localStorage : null;
  } catch {
    return null;
  }
}

function read(store: ClaimStore, key: string): DeviceClaim[] {
  try {
    const raw = store.getItem(key);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (c): c is DeviceClaim =>
        typeof c === 'object' &&
        c !== null &&
        typeof (c as DeviceClaim).id === 'string' &&
        typeof (c as DeviceClaim).token === 'string',
    );
  } catch {
    return [];
  }
}

function write(store: ClaimStore, key: string, claims: DeviceClaim[]): void {
  if (claims.length === 0) {
    store.removeItem(key);
    return;
  }
  store.setItem(key, JSON.stringify(claims.slice(-MAX_CLAIMS)));
}

/** Client: remember that this device created `id`. Replaces an older token for the same id. */
export function rememberClaim(
  namespace: string,
  id: string,
  token: string,
  store: ClaimStore | null = defaultStore(),
): void {
  if (!store) return;
  const key = keyFor(namespace);
  const others = read(store, key).filter((c) => c.id !== id);
  write(store, key, [...others, { id, token, rememberedAt: new Date().toISOString() }]);
}

/** Client: every claim this device holds for the namespace, oldest first. */
export function listClaims(
  namespace: string,
  store: ClaimStore | null = defaultStore(),
): DeviceClaim[] {
  if (!store) return [];
  return read(store, keyFor(namespace));
}

/** Client: drop claims once the server has honoured them. */
export function forgetClaims(
  namespace: string,
  ids: readonly string[],
  store: ClaimStore | null = defaultStore(),
): void {
  if (!store) return;
  const key = keyFor(namespace);
  const drop = new Set(ids);
  write(
    store,
    key,
    read(store, key).filter((c) => !drop.has(c.id)),
  );
}

// ---------------------------------------------------------------------------
// Server side
// ---------------------------------------------------------------------------

function toHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** SHA-256 of the token as lowercase hex. This is what goes in the database, never the token. */
export async function hashClaimToken(token: string): Promise<string> {
  const data = new TextEncoder().encode(token);
  return toHex(await globalThis.crypto.subtle.digest('SHA-256', data));
}

/** Compare two equal-length strings without leaking where they differ. */
export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Does `token` hash to `hash`? Constant-time on the hash compare. */
export async function verifyClaimToken(
  token: string,
  hash: string | null | undefined,
): Promise<boolean> {
  if (!hash || !token) return false;
  return constantTimeEqual(await hashClaimToken(token), hash.toLowerCase());
}
