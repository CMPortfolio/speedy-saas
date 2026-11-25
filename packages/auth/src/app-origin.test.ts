import { describe, expect, it } from 'vitest';

import { appOrigin } from './app-origin';

describe('appOrigin', () => {
  it('uses APP_URL when it is set, whatever the request says', () => {
    expect(appOrigin('https://localhost:8080', 'https://job-photos.naplesaiagency.com')).toBe(
      'https://job-photos.naplesaiagency.com',
    );
  });

  it('keeps only the origin: no path, query or trailing slash', () => {
    expect(appOrigin(undefined, 'https://missed-call.naplesaiagency.com/some/path/?x=1')).toBe(
      'https://missed-call.naplesaiagency.com',
    );
    expect(appOrigin(undefined, 'http://127.0.0.1:3002/')).toBe('http://127.0.0.1:3002');
  });

  it('falls back to the request origin when APP_URL is not set', () => {
    expect(appOrigin('http://localhost:3002', undefined)).toBe('http://localhost:3002');
    expect(appOrigin('http://localhost:3002', '')).toBe('http://localhost:3002');
  });

  it.each([
    'localhost:3000',
    '/relative',
    'not a url',
    'ftp://files.example',
    'javascript:alert(1)',
  ])('ignores an APP_URL that is not an absolute http(s) URL: %s', (bad) => {
    expect(appOrigin('http://localhost:3002', bad)).toBe('http://localhost:3002');
  });

  it('falls back to localhost:3000 when there is nothing else', () => {
    expect(appOrigin(undefined, undefined)).toBe('http://localhost:3000');
  });

  it('reads process.env.APP_URL by default', () => {
    const before = process.env.APP_URL;
    process.env.APP_URL = 'https://rain-day.naplesaiagency.com';
    try {
      expect(appOrigin('https://localhost:8080')).toBe('https://rain-day.naplesaiagency.com');
    } finally {
      if (before === undefined) delete process.env.APP_URL;
      else process.env.APP_URL = before;
    }
  });
});
