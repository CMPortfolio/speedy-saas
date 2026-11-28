import { NextResponse } from 'next/server';

import { env } from '@/config/env';
import { getMemoryStorage } from '@/lib/storage';
import { resolveStorageDriver } from '@/lib/storage-driver';

type Params = { params: Promise<{ path: string[] }> };

/**
 * GET /api/dev-storage/<path>?token=…: serves objects from the in-memory store so the share
 * page works with STORAGE_DRIVER=memory in development. 404 for any other driver, a bad token
 * or a missing object, the same way an expired Supabase signed URL would fail.
 */
export async function GET(request: Request, { params }: Params): Promise<Response> {
  if (resolveStorageDriver(env.STORAGE_DRIVER, env.NODE_ENV) !== 'memory') {
    return new NextResponse(null, { status: 404 });
  }
  const key = (await params).path.join('/');
  const token = new URL(request.url).searchParams.get('token');
  const memory = getMemoryStorage();
  const object = token && memory.verifyToken(key, token) ? memory.get(key) : undefined;
  if (!object) return new NextResponse(null, { status: 404 });
  return new NextResponse(Buffer.from(object.bytes), {
    headers: {
      'content-type': object.contentType,
      'cache-control': 'private, max-age=600',
      'x-content-type-options': 'nosniff',
    },
  });
}
