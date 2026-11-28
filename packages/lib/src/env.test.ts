import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { createEnv, EnvError, envHelpers } from './env';

describe('createEnv', () => {
  it('parses server and client vars', () => {
    const env = createEnv({
      server: { SECRET: z.string().min(1) },
      client: { NEXT_PUBLIC_URL: z.url() },
      runtimeEnv: { SECRET: 'x', NEXT_PUBLIC_URL: 'https://a.test' },
    });
    expect(env.SECRET).toBe('x');
    expect(env.NEXT_PUBLIC_URL).toBe('https://a.test');
  });

  it('fails fast with every missing variable named', () => {
    expect(() =>
      createEnv({
        server: { A: z.string().min(1), B: z.string().min(1) },
        runtimeEnv: {},
      }),
    ).toThrowError(EnvError);
    try {
      createEnv({ server: { A: z.string().min(1), B: z.string().min(1) }, runtimeEnv: {} });
    } catch (e) {
      expect((e as EnvError).issues).toHaveLength(2);
      expect((e as EnvError).message).toContain('A:');
      expect((e as EnvError).message).toContain('B:');
    }
  });

  it('rejects client keys without the NEXT_PUBLIC_ prefix', () => {
    expect(() => createEnv({ client: { URL: z.string() }, runtimeEnv: { URL: 'x' } })).toThrow(
      /NEXT_PUBLIC_/,
    );
  });

  it('applies defaults and helpers', () => {
    const env = createEnv({
      server: {
        NODE_ENV: envHelpers.nodeEnv,
        LIST: envHelpers.list,
        FLAG: envHelpers.bool,
        PORT: envHelpers.port,
      },
      runtimeEnv: { LIST: 'a, b,,c', FLAG: '1', PORT: '3001' },
    });
    expect(env.NODE_ENV).toBe('development');
    expect(env.LIST).toEqual(['a', 'b', 'c']);
    expect(env.FLAG).toBe(true);
    expect(env.PORT).toBe(3001);
  });

  it('skips validation when asked', () => {
    const env = createEnv({ server: { A: z.string() }, runtimeEnv: {}, skipValidation: true });
    expect(env.A).toBeUndefined();
  });
});
