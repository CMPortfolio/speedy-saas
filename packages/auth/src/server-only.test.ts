import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { authCookieOptions } from './cookies';
import { safeNext } from './safe-next';

const src = join(import.meta.dirname, '.');
const files = readdirSync(src).filter((f) => /\.tsx?$/.test(f) && !f.endsWith('.test.ts'));
const read = (f: string) => readFileSync(join(src, f), 'utf8');

describe('service-role key stays on the server', () => {
  it('only server.ts reads SUPABASE_SERVICE_ROLE_KEY', () => {
    const offenders = files.filter(
      (f) => f !== 'server.ts' && f !== 'env.ts' && read(f).includes('SERVICE_ROLE'),
    );
    expect(offenders).toEqual([]);
  });

  it('server.ts and user.ts import server-only, client files do not', () => {
    expect(read('server.ts')).toMatch(/^import 'server-only';/m);
    expect(read('user.ts')).toMatch(/^import 'server-only';/m);
    for (const f of ['client.ts', 'sign-in.tsx', 'cookies.ts', 'middleware.ts']) {
      expect(read(f), f).not.toContain('./server');
    }
  });

  it("client files start with 'use client'", () => {
    for (const f of ['client.ts', 'sign-in.tsx'])
      expect(read(f).startsWith("'use client';"), f).toBe(true);
  });
});

describe('cookies and redirects', () => {
  it('uses the configured parent domain so one sign-in spans tools', () => {
    expect(authCookieOptions('.naplesaiagency.com', true)).toMatchObject({
      domain: '.naplesaiagency.com',
      secure: true,
      sameSite: 'lax',
    });
    expect(authCookieOptions(undefined, false)).not.toHaveProperty('domain');
  });

  it('safeNext only allows same-origin paths', () => {
    expect(safeNext('/jobs?x=1')).toBe('/jobs?x=1');
    expect(safeNext('//evil.com')).toBe('/');
    expect(safeNext('https://evil.com')).toBe('/');
    expect(safeNext(null)).toBe('/');
  });
});
