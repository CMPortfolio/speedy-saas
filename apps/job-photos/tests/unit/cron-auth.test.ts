import { describe, expect, it } from 'vitest';

import { isAuthorizedCron } from '@/features/cleanup/cron-auth';

const secret = 'correct-horse-battery-staple';
const req = (auth?: string) =>
  new Request('http://x/api/cron/cleanup', {
    method: 'POST',
    headers: auth ? { authorization: auth } : {},
  });

describe('isAuthorizedCron', () => {
  it('accepts the exact bearer secret', async () => {
    expect(await isAuthorizedCron(req(`Bearer ${secret}`), secret)).toBe(true);
  });

  it('rejects a missing, wrong, partial or differently-shaped header', async () => {
    expect(await isAuthorizedCron(req(), secret)).toBe(false);
    expect(await isAuthorizedCron(req('Bearer nope'), secret)).toBe(false);
    expect(await isAuthorizedCron(req(`Bearer ${secret}x`), secret)).toBe(false);
    expect(await isAuthorizedCron(req(`Bearer ${secret.slice(0, -1)}`), secret)).toBe(false);
    expect(await isAuthorizedCron(req(secret), secret)).toBe(false);
    expect(await isAuthorizedCron(req(`Basic ${secret}`), secret)).toBe(false);
  });

  it('fails closed when no secret is configured', async () => {
    expect(await isAuthorizedCron(req('Bearer '), undefined)).toBe(false);
    expect(await isAuthorizedCron(req('Bearer x'), '')).toBe(false);
    expect(await isAuthorizedCron(req('Bearer undefined'), undefined)).toBe(false);
  });
});
