import { describe, expect, it } from 'vitest';

import { countSegments, MAX_COMFORTABLE_SEGMENTS } from './segments';

const gsm = (n: number) => 'a'.repeat(n);

describe('countSegments', () => {
  it('counts nothing for an empty message', () => {
    expect(countSegments('')).toEqual({ encoding: 'gsm7', length: 0, segments: 0, nonGsm: [] });
  });

  it('GSM-7: 160 characters is one segment, 161 is two (153 each when split)', () => {
    expect(countSegments(gsm(160))).toMatchObject({ encoding: 'gsm7', length: 160, segments: 1 });
    expect(countSegments(gsm(161))).toMatchObject({ segments: 2 });
    expect(countSegments(gsm(306))).toMatchObject({ segments: 2 });
    expect(countSegments(gsm(307))).toMatchObject({ segments: 3 });
    expect(countSegments(gsm(459))).toMatchObject({ segments: 3 });
    expect(countSegments(gsm(460))).toMatchObject({ segments: 4 });
  });

  it('GSM-7: extended characters cost two', () => {
    expect(countSegments('{}[]')).toMatchObject({ encoding: 'gsm7', length: 8, segments: 1 });
    expect(countSegments(gsm(159) + '€')).toMatchObject({
      encoding: 'gsm7',
      length: 161,
      segments: 2,
    });
    expect(countSegments(gsm(158) + '€')).toMatchObject({ length: 160, segments: 1 });
  });

  it('accepts accented letters and symbols that are in the GSM alphabet', () => {
    expect(countSegments('Café, ¿qué tal? £5 @home')).toMatchObject({ encoding: 'gsm7' });
  });

  it('a curly apostrophe or quote forces UCS-2, the usual trap', () => {
    const r = countSegments('We’ll call you back');
    expect(r).toMatchObject({ encoding: 'ucs2', segments: 1, nonGsm: ['’'] });
    expect(countSegments('“hi”').nonGsm).toEqual(['“', '”']);
  });

  it('UCS-2: 70 characters is one segment, 71 is two (67 each when split)', () => {
    const u = (n: number) => 'é'.repeat(0) + '’' + 'a'.repeat(n - 1);
    expect(countSegments(u(70))).toMatchObject({ encoding: 'ucs2', length: 70, segments: 1 });
    expect(countSegments(u(71))).toMatchObject({ segments: 2 });
    expect(countSegments(u(134))).toMatchObject({ segments: 2 });
    expect(countSegments(u(135))).toMatchObject({ segments: 3 });
  });

  it('an emoji is two UTF-16 units and moves the message to UCS-2', () => {
    expect(countSegments('hi 🔧')).toMatchObject({ encoding: 'ucs2', length: 5, segments: 1 });
    expect(countSegments('🔧'.repeat(36))).toMatchObject({ length: 72, segments: 2 });
  });

  it('a 320-character template can be five UCS-2 segments, so the preview warns', () => {
    const r = countSegments('’' + 'a'.repeat(319));
    expect(r.segments).toBe(5);
    expect(r.segments).toBeGreaterThan(MAX_COMFORTABLE_SEGMENTS);
  });
});
