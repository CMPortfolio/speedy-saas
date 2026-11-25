export type StorageDriver = 'supabase' | 'memory';

/**
 * Which storage adapter to use. Pure so it can be tested: "memory" keeps everything in the
 * server process and is refused in production, where a restart would lose every photo.
 */
export function resolveStorageDriver(
  driver: StorageDriver | undefined,
  nodeEnv: string | undefined,
): StorageDriver {
  const chosen = driver ?? 'supabase';
  if (chosen === 'memory' && nodeEnv === 'production') {
    throw new Error('STORAGE_DRIVER=memory is not allowed when NODE_ENV=production');
  }
  return chosen;
}
