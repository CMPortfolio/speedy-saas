import { appError, err, ok, type Result } from './result';

export interface FetchOptions extends RequestInit {
  /** Abort after this many milliseconds. Default 10 000. */
  timeoutMs?: number;
  /** Retry on network errors or 5xx this many times. Default 0. */
  retries?: number;
}

export class FetchTimeoutError extends Error {
  constructor(
    public readonly url: string,
    public readonly timeoutMs: number,
  ) {
    super(`Request to ${url} timed out after ${timeoutMs}ms`);
    this.name = 'FetchTimeoutError';
  }
}

async function once(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const outer = init.signal;
  const onOuterAbort = (): void => controller.abort();
  outer?.addEventListener('abort', onOuterAbort, { once: true });
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (e) {
    if (controller.signal.aborted && !outer?.aborted) throw new FetchTimeoutError(url, timeoutMs);
    throw e;
  } finally {
    clearTimeout(timer);
    outer?.removeEventListener('abort', onOuterAbort);
  }
}

/** fetch() with a hard timeout and optional retries. Throws FetchTimeoutError on timeout. */
export async function fetchWithTimeout(url: string, options: FetchOptions = {}): Promise<Response> {
  const { timeoutMs = 10_000, retries = 0, ...init } = options;
  let attempt = 0;
  for (;;) {
    try {
      const res = await once(url, init, timeoutMs);
      if (res.status >= 500 && attempt < retries) {
        attempt += 1;
        continue;
      }
      return res;
    } catch (e) {
      if (attempt >= retries || init.signal?.aborted) throw e;
      attempt += 1;
    }
  }
}

/** fetch JSON and get a Result instead of exceptions. Non-2xx is an error with code "http_<status>". */
export async function fetchJson<T>(url: string, options: FetchOptions = {}): Promise<Result<T>> {
  try {
    const res = await fetchWithTimeout(url, {
      ...options,
      headers: { accept: 'application/json', ...(options.headers ?? {}) },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return err(
        appError(`http_${res.status}`, 'The service returned an error.', body.slice(0, 500)),
      );
    }
    return ok((await res.json()) as T);
  } catch (e) {
    if (e instanceof FetchTimeoutError)
      return err(appError('timeout', 'The service took too long.', e));
    return err(appError('network', 'Could not reach the service.', e));
  }
}
