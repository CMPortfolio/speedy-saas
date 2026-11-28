import 'server-only';

import { createServiceSupabase } from '@speedy/auth/server';
import {
  memoryStorage,
  supabaseStorage,
  type MemoryStorage,
  type StorageAdapter,
} from '@speedy/lib/photos';

import { STORAGE_BUCKET } from '@/config/constants';
import { env } from '@/config/env';

import { resolveStorageDriver } from './storage-driver';

/**
 * One in-memory store for the whole server process, so a photo uploaded by one request can be
 * read back by the next. Development only; `resolveStorageDriver` refuses it in production.
 */
let memory: MemoryStorage | undefined;

export function getMemoryStorage(): MemoryStorage {
  memory ??= memoryStorage({ urlBase: `${env.APP_URL}/api/dev-storage` });
  return memory;
}

/** The storage adapter for this server, per STORAGE_DRIVER. */
export function getStorage(): StorageAdapter {
  const driver = resolveStorageDriver(env.STORAGE_DRIVER, env.NODE_ENV);
  if (driver === 'memory') return getMemoryStorage();
  return supabaseStorage(createServiceSupabase(), STORAGE_BUCKET);
}
