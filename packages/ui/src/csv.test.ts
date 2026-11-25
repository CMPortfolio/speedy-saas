import { describe, expect, it } from 'vitest';

import {
  DEFAULT_MAPPING,
  detectColumns,
  detectDelimiter,
  mapRows,
  parseDelimited,
  previewImport,
} from './csv';
import type { RowValidators } from './csv';

/** Test rules: ten digits make a phone; a three-letter prefix makes a day (0 = Sunday). */
const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const validators: RowValidators<string, number> = {
  phone: (raw) => {
    const digits = raw.replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');
    return digits.length === 10 ? `+1${digits}` : null;
  },
  day: (raw) => {
    const i = DAYS.indexOf(raw.trim().toLowerCase().slice(0, 3));
    return i === -1 ? null : i;
  },
};

describe('parseDelimited', () => {
  it('splits comma lines, trims cells and drops blank lines', () => {
    expect(parseDelimited('Maria Lopez, 239-555-0123 , Tue\n\nJim, 2395550188, wed\n')).toEqual([
      ['Maria Lopez', '239-555-0123', 'Tue'],
      ['Jim', '2395550188', 'wed'],
    ]);
  });

  it('prefers tabs when the lines are tab separated, even with commas in a note', () => {
    const text =
      'Maria Lopez\t239-555-0123\tTue\tgate code 1234, dog in yard\nJim\t2395550188\tWed';
    expect(detectDelimiter(text)).toBe('\t');
    expect(parseDelimited(text)[0]).toEqual([
      'Maria Lopez',
      '239-555-0123',
      'Tue',
      'gate code 1234, dog in yard',
    ]);
  });

  it('handles semicolons and Windows line endings', () => {
    expect(parseDelimited('Maria;239-555-0123;Tue\r\nJim;2395550188;Wed\r\n')).toEqual([
      ['Maria', '239-555-0123', 'Tue'],
      ['Jim', '2395550188', 'Wed'],
    ]);
  });

  it('honours quoted fields with delimiters and escaped quotes inside', () => {
    const text = '"Lopez, Maria","239-555-0123",Tue,"Says ""ring twice"""';
    expect(parseDelimited(text)).toEqual([
      ['Lopez, Maria', '239-555-0123', 'Tue', 'Says "ring twice"'],
    ]);
  });

  it('ignores a byte-order mark from spreadsheet exports', () => {
    expect(parseDelimited('﻿Name,Phone\nMaria,2395550123')[0]).toEqual(['Name', 'Phone']);
  });
});

describe('detectColumns', () => {
  it('finds columns by name, in any order and case', () => {
    expect(detectColumns(['Service Day', 'Customer', 'Mobile', 'Notes'])).toEqual({
      day: 0,
      name: 1,
      phone: 2,
      note: 3,
    });
    expect(detectColumns(['NAME', 'cell phone', 'day'])).toEqual({ name: 0, phone: 1, day: 2 });
  });

  it('returns null for a data row so the first line is imported, not skipped', () => {
    expect(detectColumns(['Maria Lopez', '239-555-0123', 'Tue'])).toBeNull();
    expect(detectColumns(['Name', 'Day'])).toBeNull();
  });
});

describe('mapRows', () => {
  it('accepts good rows with an optional note', () => {
    const { accepted, skipped } = mapRows(
      [
        ['Maria Lopez', '239-555-0123', 'Tuesday', 'back gate'],
        ['Jim Hale', '(239) 555-0188', 'wed'],
      ],
      DEFAULT_MAPPING,
      validators,
    );
    expect(skipped).toEqual([]);
    expect(accepted).toEqual([
      { line: 1, name: 'Maria Lopez', phone: '+12395550123', day: 2, note: 'back gate' },
      { line: 2, name: 'Jim Hale', phone: '+12395550188', day: 3, note: null },
    ]);
  });

  it('skips bad phones, duplicates in the file, numbers already in the list, and missing or unknown days', () => {
    const { accepted, skipped } = mapRows(
      [
        ['Maria Lopez', '239-555-0123', 'Tue'],
        ['Bad Phone', '555-0123', 'Tue'],
        ['Maria Again', '+1 239 555 0123', 'Wed'],
        ['Already Here', '2395550199', 'Thu'],
        ['No Day', '2395550177', ''],
        ['Odd Day', '2395550166', 'someday'],
        ['', '2395550155', 'Fri'],
      ],
      DEFAULT_MAPPING,
      { ...validators, existingPhones: new Set(['+12395550199']) },
    );
    expect(accepted.map((r) => r.name)).toEqual(['Maria Lopez']);
    expect(skipped.map((r) => [r.line, r.reason])).toEqual([
      [2, 'Bad phone number'],
      [3, 'Same number appears above'],
      [4, 'Already in your list'],
      [5, 'No service day'],
      [6, 'Unknown day'],
      [7, 'No name'],
    ]);
    expect(skipped[0]?.raw).toEqual(['Bad Phone', '555-0123', 'Tue']);
  });

  it('reads cells from the mapping and treats a missing note column as no note', () => {
    const { accepted } = mapRows(
      [['Tue', 'Maria', '2395550123']],
      { day: 0, name: 1, phone: 2 },
      validators,
    );
    expect(accepted[0]).toMatchObject({ name: 'Maria', day: 2, note: null });
  });
});

describe('previewImport', () => {
  it('uses the header row when there is one and numbers lines from 2', () => {
    const result = previewImport(
      'Customer,Service day,Cell\nMaria Lopez,Tuesday,239-555-0123\nJim,Wed,bad',
      validators,
    );
    expect(result.hasHeader).toBe(true);
    expect(result.accepted).toEqual([
      { line: 2, name: 'Maria Lopez', phone: '+12395550123', day: 2, note: null },
    ]);
    expect(result.skipped).toEqual([
      { line: 3, raw: ['Jim', 'Wed', 'bad'], reason: 'Bad phone number' },
    ]);
  });

  it('falls back to Name, phone, day, note without a header', () => {
    const result = previewImport('Maria Lopez\t239-555-0123\tTue\tpool cage', validators);
    expect(result.hasHeader).toBe(false);
    expect(result.accepted[0]).toMatchObject({ line: 1, name: 'Maria Lopez', note: 'pool cage' });
  });

  it('returns nothing for empty text', () => {
    expect(previewImport('  \n', validators)).toEqual({
      hasHeader: false,
      accepted: [],
      skipped: [],
    });
  });
});
