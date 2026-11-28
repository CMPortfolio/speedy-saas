import { describe, expect, it } from 'vitest';

import {
  all,
  andThen,
  appError,
  err,
  isErr,
  isOk,
  map,
  mapErr,
  ok,
  tryCatch,
  tryCatchAsync,
  unwrapOr,
} from './result';

describe('Result', () => {
  it('ok and err narrow correctly', () => {
    const a = ok(1);
    const b = err(appError('nope', 'No.'));
    expect(isOk(a) && a.value).toBe(1);
    expect(isErr(b) && b.error.code).toBe('nope');
  });

  it('map, mapErr and andThen chain', () => {
    expect(map(ok(2), (n) => n * 2)).toEqual(ok(4));
    expect(mapErr(err('x'), (e) => `${e}!`)).toEqual(err('x!'));
    expect(andThen(ok(2), (n) => (n > 1 ? ok('big') : err('small')))).toEqual(ok('big'));
    expect(andThen(err('bad') as ReturnType<typeof err<string>>, () => ok(1))).toEqual(err('bad'));
  });

  it('unwrapOr falls back on error', () => {
    expect(unwrapOr(err('x'), 9)).toBe(9);
    expect(unwrapOr(ok(1), 9)).toBe(1);
  });

  it('tryCatch captures thrown errors', async () => {
    const r = tryCatch(() => {
      throw new Error('boom');
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('unexpected');
    const r2 = await tryCatchAsync(async () => 5);
    expect(r2).toEqual(ok(5));
  });

  it('all returns the first error or every value', () => {
    expect(all([ok(1), ok(2)])).toEqual(ok([1, 2]));
    expect(all([ok(1), err('e'), err('f')])).toEqual(err('e'));
  });
});
