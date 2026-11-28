import { afterEach, describe, expect, it, vi } from 'vitest';

import { fetchJson, FetchTimeoutError, fetchWithTimeout } from './fetch';

function slowFetch(delayMs: number, status = 200): typeof fetch {
  return ((_url: string, init?: RequestInit) =>
    new Promise<Response>((resolve, reject) => {
      const t = setTimeout(
        () => resolve(new Response(JSON.stringify({ hi: 1 }), { status })),
        delayMs,
      );
      init?.signal?.addEventListener('abort', () => {
        clearTimeout(t);
        reject(new DOMException('aborted', 'AbortError'));
      });
    })) as typeof fetch;
}

describe('fetchWithTimeout', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('throws FetchTimeoutError when the request is too slow', async () => {
    vi.stubGlobal('fetch', slowFetch(200));
    await expect(fetchWithTimeout('https://x.test', { timeoutMs: 20 })).rejects.toBeInstanceOf(
      FetchTimeoutError,
    );
  });

  it('resolves when the request is fast enough', async () => {
    vi.stubGlobal('fetch', slowFetch(5));
    const res = await fetchWithTimeout('https://x.test', { timeoutMs: 500 });
    expect(res.status).toBe(200);
  });

  it('retries 5xx responses up to the limit', async () => {
    let calls = 0;
    vi.stubGlobal('fetch', (() => {
      calls += 1;
      return Promise.resolve(new Response('bad', { status: calls < 3 ? 503 : 200 }));
    }) as typeof fetch);
    const res = await fetchWithTimeout('https://x.test', { retries: 2 });
    expect(res.status).toBe(200);
    expect(calls).toBe(3);
  });

  it('fetchJson maps outcomes to Result', async () => {
    vi.stubGlobal('fetch', slowFetch(1));
    expect(await fetchJson<{ hi: number }>('https://x.test')).toEqual({
      ok: true,
      value: { hi: 1 },
    });
    vi.stubGlobal('fetch', slowFetch(1, 404));
    const notFound = await fetchJson('https://x.test');
    expect(!notFound.ok && notFound.error.code).toBe('http_404');
    vi.stubGlobal('fetch', slowFetch(100));
    const timeout = await fetchJson('https://x.test', { timeoutMs: 10 });
    expect(!timeout.ok && timeout.error.code).toBe('timeout');
  });
});
