/**
 * Result<T, E>: a value or a typed error, never a thrown exception across a boundary.
 * Use it for anything a caller is expected to handle (validation, provider calls, lookups).
 */
export type Ok<T> = { readonly ok: true; readonly value: T };
export type Err<E> = { readonly ok: false; readonly error: E };
export type Result<T, E = AppError> = Ok<T> | Err<E>;

export interface AppError {
  /** Stable machine-readable code, for example "not_found" or "provider_failed". */
  code: string;
  /** Plain message safe to show an owner. */
  message: string;
  /** Anything useful for logs. Never shown to users. */
  cause?: unknown;
}

export function ok<T>(value: T): Ok<T> {
  return { ok: true, value };
}

export function err<E>(error: E): Err<E> {
  return { ok: false, error };
}

export function appError(code: string, message: string, cause?: unknown): AppError {
  return cause === undefined ? { code, message } : { code, message, cause };
}

export function isOk<T, E>(r: Result<T, E>): r is Ok<T> {
  return r.ok;
}

export function isErr<T, E>(r: Result<T, E>): r is Err<E> {
  return !r.ok;
}

export function map<T, U, E>(r: Result<T, E>, fn: (value: T) => U): Result<U, E> {
  return r.ok ? ok(fn(r.value)) : r;
}

export function mapErr<T, E, F>(r: Result<T, E>, fn: (error: E) => F): Result<T, F> {
  return r.ok ? r : err(fn(r.error));
}

export function andThen<T, U, E>(r: Result<T, E>, fn: (value: T) => Result<U, E>): Result<U, E> {
  return r.ok ? fn(r.value) : r;
}

export function unwrapOr<T, E>(r: Result<T, E>, fallback: T): T {
  return r.ok ? r.value : fallback;
}

/** Run a function that may throw and capture the outcome as a Result. */
export function tryCatch<T>(fn: () => T, onError?: (e: unknown) => AppError): Result<T> {
  try {
    return ok(fn());
  } catch (e) {
    return err(onError ? onError(e) : appError('unexpected', 'Something went wrong.', e));
  }
}

export async function tryCatchAsync<T>(
  fn: () => Promise<T>,
  onError?: (e: unknown) => AppError,
): Promise<Result<T>> {
  try {
    return ok(await fn());
  } catch (e) {
    return err(onError ? onError(e) : appError('unexpected', 'Something went wrong.', e));
  }
}

/** Collect an array of results into one: the first error wins. */
export function all<T, E>(results: readonly Result<T, E>[]): Result<T[], E> {
  const values: T[] = [];
  for (const r of results) {
    if (!r.ok) return r;
    values.push(r.value);
  }
  return ok(values);
}
