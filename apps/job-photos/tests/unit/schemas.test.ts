import { describe, expect, it } from 'vitest';

import {
  createJobSchema,
  jobIdSchema,
  photoUploadFieldsSchema,
  updateJobSchema,
} from '@/features/jobs/schemas';

describe('job schemas', () => {
  it('turns blank form fields into null and trims the rest', () => {
    expect(
      createJobSchema.parse({ title: '  Smith drain ', business_name: '', note: '   ' }),
    ).toEqual({
      title: 'Smith drain',
      business_name: null,
      note: null,
    });
    expect(createJobSchema.parse({})).toEqual({});
  });

  it('caps lengths', () => {
    expect(createJobSchema.safeParse({ title: 'x'.repeat(121) }).success).toBe(false);
    expect(createJobSchema.safeParse({ note: 'x'.repeat(301) }).success).toBe(false);
    expect(createJobSchema.safeParse({ business_name: 'x'.repeat(120) }).success).toBe(true);
  });

  it('rejects anything that is not a string', () => {
    expect(createJobSchema.safeParse({ title: 42 }).success).toBe(false);
    expect(updateJobSchema.safeParse({ note: ['a'] }).success).toBe(false);
  });

  it('only accepts uuid job ids', () => {
    expect(jobIdSchema.safeParse('3f2a2c9e-5b3d-4c1a-9f0e-2b7a1d6c8e10').success).toBe(true);
    expect(jobIdSchema.safeParse('../other').success).toBe(false);
  });
});

describe('photo upload fields', () => {
  it('coerces multipart strings and checks the kind', () => {
    expect(
      photoUploadFieldsSchema.parse({ kind: 'before', width: '2000', height: '1500' }),
    ).toEqual({
      kind: 'before',
      width: 2000,
      height: 1500,
    });
    expect(photoUploadFieldsSchema.safeParse({ kind: 'during', width: 1, height: 1 }).success).toBe(
      false,
    );
    expect(photoUploadFieldsSchema.safeParse({ kind: 'after', width: 0, height: 1 }).success).toBe(
      false,
    );
    expect(
      photoUploadFieldsSchema.safeParse({ kind: 'after', width: 10001, height: 1 }).success,
    ).toBe(false);
    expect(
      photoUploadFieldsSchema.safeParse({ kind: 'after', width: 1.5, height: 1 }).success,
    ).toBe(false);
  });
});
