import { describe, expect, it } from 'vitest';

import { createLogger, redact } from './logger';

describe('logger', () => {
  it('redacts secret-looking keys, including nested ones', () => {
    expect(redact({ apiKey: 'x', nested: { password: 'y', fine: 1 }, fine: 'z' })).toEqual({
      apiKey: '[redacted]',
      nested: { password: '[redacted]', fine: 1 },
      fine: 'z',
    });
  });

  it('honours the level threshold and emits JSON when not pretty', () => {
    const lines: string[] = [];
    const log = createLogger(
      { app: 't' },
      { level: 'info', pretty: false, write: (_l, line) => lines.push(line) },
    );
    log.debug('hidden');
    log.info('shown', { n: 1 });
    expect(lines).toHaveLength(1);
    const parsed = JSON.parse(lines[0]!) as Record<string, unknown>;
    expect(parsed.level).toBe('info');
    expect(parsed.message).toBe('shown');
    expect(parsed.app).toBe('t');
    expect(parsed.n).toBe(1);
  });

  it('child loggers inherit fields', () => {
    const lines: string[] = [];
    const log = createLogger(
      {},
      { level: 'debug', pretty: false, write: (_l, line) => lines.push(line) },
    ).child({ req: 'abc' });
    log.warn('w');
    expect(JSON.parse(lines[0]!)).toMatchObject({ req: 'abc', level: 'warn' });
  });
});
