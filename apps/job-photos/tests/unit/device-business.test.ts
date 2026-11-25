import { describe, expect, it } from 'vitest';

import {
  DEVICE_BUSINESS_KEY,
  readDeviceBusiness,
  writeDeviceBusiness,
} from '@/hooks/use-device-business';

function fakeStorage() {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  };
}

describe('device business details', () => {
  it('round-trips name and logo', () => {
    const store = fakeStorage();
    writeDeviceBusiness(store, {
      name: 'Gulf Coast Cooling',
      logoDataUrl: 'data:image/png;base64,AAAA',
      reviewUrl: 'https://g.page/r/x/review',
    });
    expect(readDeviceBusiness(store)).toEqual({
      name: 'Gulf Coast Cooling',
      logoDataUrl: 'data:image/png;base64,AAAA',
      reviewUrl: 'https://g.page/r/x/review',
    });
  });

  it('clears the key when both fields are empty', () => {
    const store = fakeStorage();
    writeDeviceBusiness(store, { name: 'x', logoDataUrl: null, reviewUrl: null });
    writeDeviceBusiness(store, { name: '', logoDataUrl: null, reviewUrl: null });
    expect(store.map.has(DEVICE_BUSINESS_KEY)).toBe(false);
  });

  it('falls back to empty on garbage or no storage', () => {
    const store = fakeStorage();
    store.setItem(DEVICE_BUSINESS_KEY, '{oops');
    expect(readDeviceBusiness(store)).toEqual({ name: '', logoDataUrl: null, reviewUrl: null });
    store.setItem(DEVICE_BUSINESS_KEY, JSON.stringify({ name: 7, logoDataUrl: 'ok' }));
    expect(readDeviceBusiness(store)).toEqual({ name: '', logoDataUrl: 'ok', reviewUrl: null });
    expect(readDeviceBusiness(null)).toEqual({ name: '', logoDataUrl: null, reviewUrl: null });
  });
});
