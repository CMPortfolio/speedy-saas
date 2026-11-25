import { describe, expect, it } from 'vitest';

import { safeNext } from './safe-next';

describe('safeNext keeps normal same-site paths', () => {
  it.each([
    ['/', '/'],
    ['/jobs', '/jobs'],
    ['/jobs?x=1', '/jobs?x=1'],
    ['/jobs/new?a=1&b=two#top', '/jobs/new?a=1&b=two#top'],
    ['/calls#row-3', '/calls#row-3'],
    ['/setup?next=%2Fcalls', '/setup?next=%2Fcalls'],
  ])('%s', (input, expected) => {
    expect(safeNext(input)).toBe(expected);
  });
});

describe('safeNext refuses anything that could leave the site', () => {
  it.each([
    ['empty', ''],
    ['null', null],
    ['undefined', undefined],
    ['a full URL', 'https://evil.com'],
    ['a relative path', 'jobs'],
    ['a protocol-relative URL', '//evil.com'],
    ['a protocol-relative URL with a path', '//evil.com/x'],
    ['a backslash', '/\\evil.com'],
    ['a backslash further in', '/jobs\\..\\evil.com'],
    ['a tab after the slash', '/\t/evil.com'],
    ['a newline after the slash', '/\n/evil.com'],
    ['a carriage return after the slash', '/\r/evil.com'],
    ['a control character', '/jobs\u0000x'],
    ['a delete character', '/jobs\u007fx'],
    ['a javascript URL', 'javascript:alert(1)'],
    ['a slash then a scheme-like host', '/\\/evil.com'],
  ])('%s', (_name, input) => {
    expect(safeNext(input as string | null | undefined)).toBe('/');
  });
});

describe('safeNext on encoded input', () => {
  it('leaves an encoded backslash on the site, as a path that stays on the site', () => {
    // %5C is data in a path, not a separator: the browser never turns it into a host.
    expect(safeNext('/%5Cevil.com')).toBe('/%5Cevil.com');
    const resolved = new URL(safeNext('/%5Cevil.com'), 'https://app.example');
    expect(resolved.origin).toBe('https://app.example');
  });

  it('never resolves off the site for any of the tricky inputs', () => {
    for (const input of [
      '/\\evil.com',
      '/\t/evil.com',
      '/\n/evil.com',
      '//evil.com',
      '/%5Cevil.com',
    ]) {
      expect(new URL(safeNext(input), 'https://app.example').origin).toBe('https://app.example');
    }
  });
});
