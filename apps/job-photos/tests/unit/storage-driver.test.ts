import { describe, expect, it } from 'vitest';

import { resolveStorageDriver } from '@/lib/storage-driver';

describe('resolveStorageDriver', () => {
  it('defaults to supabase', () => {
    expect(resolveStorageDriver(undefined, 'production')).toBe('supabase');
    expect(resolveStorageDriver(undefined, 'development')).toBe('supabase');
  });

  it('allows memory outside production only', () => {
    expect(resolveStorageDriver('memory', 'development')).toBe('memory');
    expect(resolveStorageDriver('memory', 'test')).toBe('memory');
    expect(resolveStorageDriver('memory', undefined)).toBe('memory');
    expect(() => resolveStorageDriver('memory', 'production')).toThrow(/production/);
  });
});
