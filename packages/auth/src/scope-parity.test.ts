import { NextRequest } from 'next/server';
import type { CookieOptions } from '@supabase/ssr';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The server client (sign-in action, callback) and the middleware must name a tool's verifier
 * cookie the same way, including in local development where APP_URL is unset and each falls back
 * to the request's own origin: a verifier one of them writes has to be one the other can see.
 */
interface Handlers {
  getAll: () => { name: string; value: string }[];
  setAll: (c: { name: string; value: string; options: CookieOptions }[]) => void;
}
const captured: Handlers[] = [];
const store = new Map<string, string>();
let hostHeader: string | null = null;

vi.mock('server-only', () => ({}));
vi.mock('@supabase/ssr', () => ({
  createServerClient: (_u: string, _k: string, options: { cookies: Handlers }) => {
    captured.push(options.cookies);
    return { auth: { getUser: async () => ({ data: { user: null } }) } };
  },
}));
vi.mock('next/headers', () => ({
  cookies: async () => ({
    getAll: () => [...store].map(([name, value]) => ({ name, value })),
    set: (name: string, value: string) => void store.set(name, value),
  }),
  headers: async () => ({ get: (name: string) => (name === 'host' ? hostHeader : null) }),
}));

const VERIFIER = 'sb-ref-auth-token-code-verifier';

beforeEach(() => {
  captured.length = 0;
  store.clear();
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://supabase.test');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon');
});
afterEach(() => vi.unstubAllEnvs());

async function middlewareHandlers(origin: string, host: string): Promise<Handlers> {
  const { updateSession } = await import('./middleware');
  const request = new NextRequest(`${origin}/rain-day`, {
    headers: { cookie: cookieHeader(), host },
  });
  await updateSession(request);
  return captured.at(-1)!;
}
const cookieHeader = () => [...store].map(([n, v]) => `${n}=${v}`).join('; ');

async function serverHandlers(): Promise<Handlers> {
  const { createServerSupabase } = await import('./server');
  await createServerSupabase();
  return captured.at(-1)!;
}

describe('verifier cookie scope: server client and middleware agree', () => {
  it.each(['localhost:3003', '127.0.0.1:3003'])(
    'in development on %s (no APP_URL) the middleware sees the verifier the server wrote',
    async (host) => {
      vi.stubEnv('APP_URL', '');
      vi.stubEnv('NODE_ENV', 'development');
      hostHeader = host;
      const server = await serverHandlers();
      server.setAll([{ name: VERIFIER, value: 'secret', options: { secure: false, path: '/' } }]);
      const written = [...store.keys()];
      expect(written).toHaveLength(1);
      expect(written[0]).not.toBe(VERIFIER);
      const middleware = await middlewareHandlers(`http://${host}`, host);
      expect(middleware.getAll()).toEqual([{ name: VERIFIER, value: 'secret' }]);
    },
  );

  it('in production APP_URL decides, for both, whatever the request says', async () => {
    vi.stubEnv('APP_URL', 'https://rain-day.naplesaiagency.com');
    vi.stubEnv('NODE_ENV', 'production');
    hostHeader = 'localhost:8080'; // the container's own address behind Railway
    const server = await serverHandlers();
    server.setAll([{ name: VERIFIER, value: 'secret', options: { secure: true, path: '/' } }]);
    const [name] = [...store.keys()];
    expect(name).toBe('__Host-sb-ref-auth-token-code-verifier~rain-day-naplesaiagency-com');
    const middleware = await middlewareHandlers('https://localhost:8080', 'localhost:8080');
    expect(middleware.getAll()).toEqual([{ name: VERIFIER, value: 'secret' }]);
  });
});
