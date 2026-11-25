'use client';

import { useCallback, useMemo, useSyncExternalStore } from 'react';

/**
 * The business name and logo an owner typed last time, kept on this phone so the next job is
 * prefilled. Moves to the owner's profile once they sign in (P4). The logo is a small data URL.
 */
export interface DeviceBusiness {
  name: string;
  logoDataUrl: string | null;
}

export const DEVICE_BUSINESS_KEY = 'job-photos.business';

const EMPTY: DeviceBusiness = { name: '', logoDataUrl: null };

export function parseDeviceBusiness(raw: string | null | undefined): DeviceBusiness {
  if (!raw) return EMPTY;
  try {
    const parsed = JSON.parse(raw) as Partial<DeviceBusiness>;
    return {
      name: typeof parsed.name === 'string' ? parsed.name : '',
      logoDataUrl: typeof parsed.logoDataUrl === 'string' ? parsed.logoDataUrl : null,
    };
  } catch {
    return EMPTY;
  }
}

export function readDeviceBusiness(storage: Pick<Storage, 'getItem'> | null): DeviceBusiness {
  try {
    return parseDeviceBusiness(storage?.getItem(DEVICE_BUSINESS_KEY));
  } catch {
    return EMPTY;
  }
}

export function writeDeviceBusiness(
  storage: Pick<Storage, 'setItem' | 'removeItem'> | null,
  value: DeviceBusiness,
): void {
  try {
    if (!value.name && !value.logoDataUrl) storage?.removeItem(DEVICE_BUSINESS_KEY);
    else storage?.setItem(DEVICE_BUSINESS_KEY, JSON.stringify(value));
  } catch {
    // Private mode or a full store: the owner just types it again next time.
  }
}

function localStore(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

// localStorage as an external store: same-tab writes notify through `listeners`, other tabs
// through the window "storage" event. When storage is unavailable (private mode) the value
// lives in `fallbackRaw` for the life of the page so the form still works.
const listeners = new Set<() => void>();
let fallbackRaw: string | null = null;

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  window.addEventListener('storage', listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', listener);
  };
}

function getSnapshot(): string | null {
  try {
    return localStore()?.getItem(DEVICE_BUSINESS_KEY) ?? fallbackRaw;
  } catch {
    return fallbackRaw;
  }
}

/** On the server (and the first client render) we do not know yet; undefined means "not loaded". */
function getServerSnapshot(): string | null | undefined {
  return undefined;
}

export function useDeviceBusiness(): [
  DeviceBusiness,
  (patch: Partial<DeviceBusiness>) => void,
  boolean,
] {
  const raw = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const value = useMemo(() => parseDeviceBusiness(raw), [raw]);

  const update = useCallback((patch: Partial<DeviceBusiness>) => {
    const next = { ...parseDeviceBusiness(getSnapshot()), ...patch };
    fallbackRaw = !next.name && !next.logoDataUrl ? null : JSON.stringify(next);
    writeDeviceBusiness(localStore(), next);
    for (const listener of listeners) listener();
  }, []);

  return [value, update, raw !== undefined];
}
