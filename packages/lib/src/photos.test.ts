import { describe, expect, it, vi } from 'vitest';

import {
  buildObjectPath,
  extensionFor,
  fitWithin,
  memoryStorage,
  supabaseStorage,
  type StorageAdapter,
} from './photos';

describe('fitWithin', () => {
  it('keeps images already within the limit', () => {
    expect(fitWithin(1200, 800, 2000)).toEqual({ width: 1200, height: 800 });
    expect(fitWithin(2000, 2000, 2000)).toEqual({ width: 2000, height: 2000 });
  });

  it('scales the long edge down and keeps the ratio', () => {
    expect(fitWithin(4000, 3000, 2000)).toEqual({ width: 2000, height: 1500 });
    expect(fitWithin(3000, 4000, 2000)).toEqual({ width: 1500, height: 2000 });
    expect(fitWithin(4032, 3024, 2000)).toEqual({ width: 2000, height: 1500 });
  });

  it('never returns less than one pixel', () => {
    expect(fitWithin(10000, 1, 100)).toEqual({ width: 100, height: 1 });
  });

  it('rejects impossible sizes', () => {
    expect(() => fitWithin(0, 10, 100)).toThrow(RangeError);
    expect(() => fitWithin(10, 10, 0)).toThrow(RangeError);
  });
});

describe('object paths', () => {
  it('builds a path from safe segments', () => {
    expect(buildObjectPath(['jobs', 'abc-123', 'before', 'p1'], 'jpg')).toBe(
      'jobs/abc-123/before/p1.jpg',
    );
  });

  it('refuses separators, dots and empty segments', () => {
    expect(() => buildObjectPath(['jobs', '../x'], 'jpg')).toThrow(RangeError);
    expect(() => buildObjectPath(['a/b'], 'jpg')).toThrow(RangeError);
    expect(() => buildObjectPath([''], 'jpg')).toThrow(RangeError);
    expect(() => buildObjectPath([], 'jpg')).toThrow(RangeError);
    expect(() => buildObjectPath(['a'], 'JPG')).toThrow(RangeError);
    expect(() => buildObjectPath(['a'], 'jpg/..')).toThrow(RangeError);
  });

  it('maps image types to extensions', () => {
    expect(extensionFor('image/jpeg')).toBe('jpg');
    expect(extensionFor('IMAGE/PNG; charset=binary')).toBe('png');
    expect(extensionFor('text/html')).toBeUndefined();
  });
});

/** The contract every adapter must meet. Run against memoryStorage here. */
function adapterContract(make: () => StorageAdapter) {
  it('stores, signs and removes objects', async () => {
    const storage = make();
    await storage.put('jobs/a/before/1.jpg', new Uint8Array([1, 2, 3]), 'image/jpeg');
    const url = await storage.createSignedUrl('jobs/a/before/1.jpg', 60);
    expect(url).toContain('jobs/a/before/1.jpg');
    await storage.remove(['jobs/a/before/1.jpg', 'missing.jpg']);
    await expect(storage.createSignedUrl('jobs/a/before/1.jpg', 60)).rejects.toThrow();
  });

  it('accepts Blob, ArrayBuffer and Uint8Array bodies', async () => {
    const storage = make();
    await storage.put('a.jpg', new Blob([new Uint8Array([1])]), 'image/jpeg');
    await storage.put('b.jpg', new Uint8Array([1]).buffer, 'image/jpeg');
    await storage.put('c.jpg', new Uint8Array([1]), 'image/jpeg');
    await expect(storage.createSignedUrl('b.jpg', 1)).resolves.toBeTypeOf('string');
  });
}

describe('memoryStorage', () => {
  adapterContract(() => memoryStorage());

  it('serves objects back and expires signed urls', async () => {
    let clock = 1_000_000;
    const storage = memoryStorage({ urlBase: '/api/dev-storage', now: () => clock });
    await storage.put('x/y.jpg', new Uint8Array([9, 9]), 'image/jpeg');
    expect(storage.get('x/y.jpg')).toEqual({
      bytes: new Uint8Array([9, 9]),
      contentType: 'image/jpeg',
    });
    expect(storage.size).toBe(1);
    const url = await storage.createSignedUrl('x/y.jpg', 600);
    expect(url.startsWith('/api/dev-storage/x/y.jpg?token=')).toBe(true);
    const token = decodeURIComponent(url.split('token=')[1]!);
    expect(storage.verifyToken('x/y.jpg', token)).toBe(true);
    expect(storage.verifyToken('x/other.jpg', token)).toBe(false);
    clock += 601_000;
    expect(storage.verifyToken('x/y.jpg', token)).toBe(false);
  });
});

describe('supabaseStorage', () => {
  it('maps the adapter onto the bucket api and surfaces errors', async () => {
    const upload = vi.fn().mockResolvedValue({ error: null });
    const createSignedUrl = vi
      .fn()
      .mockResolvedValue({ data: { signedUrl: 'https://x/signed' }, error: null });
    const remove = vi.fn().mockResolvedValue({ error: null });
    const from = vi.fn().mockReturnValue({ upload, createSignedUrl, remove });
    const storage = supabaseStorage({ storage: { from } } as never, 'job-photos');

    await storage.put('p.jpg', new Uint8Array([1]), 'image/jpeg');
    expect(from).toHaveBeenCalledWith('job-photos');
    expect(upload).toHaveBeenCalledWith('p.jpg', expect.any(Uint8Array), {
      contentType: 'image/jpeg',
      upsert: true,
    });
    await expect(storage.createSignedUrl('p.jpg', 600)).resolves.toBe('https://x/signed');
    await storage.remove([]);
    expect(remove).not.toHaveBeenCalled();
    await storage.remove(['p.jpg']);
    expect(remove).toHaveBeenCalledWith(['p.jpg']);

    upload.mockResolvedValueOnce({ error: new Error('boom') });
    await expect(storage.put('p.jpg', new Uint8Array([1]), 'image/jpeg')).rejects.toThrow('boom');
  });
});
