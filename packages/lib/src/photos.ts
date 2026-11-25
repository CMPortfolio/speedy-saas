import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Photo upload helpers shared by every tool that stores images: resize in the browser before
 * uploading, build safe object paths, and talk to storage through one small adapter so server
 * code can run against Supabase Storage in production and an in-memory store in development.
 */

export interface Size {
  width: number;
  height: number;
}

/**
 * Scale (w, h) down so the longer edge is at most `maxEdge`, keeping the aspect ratio.
 * Never scales up. Results are whole pixels and at least 1.
 */
export function fitWithin(width: number, height: number, maxEdge: number): Size {
  if (width <= 0 || height <= 0 || maxEdge <= 0) {
    throw new RangeError('fitWithin: width, height and maxEdge must be positive');
  }
  const longest = Math.max(width, height);
  if (longest <= maxEdge) return { width: Math.round(width), height: Math.round(height) };
  const scale = maxEdge / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

export interface ResizeOptions {
  /** Longest edge of the output in pixels, e.g. 2000. */
  maxEdge: number;
  /** JPEG/WebP quality 0..1. Default 0.82. */
  quality?: number;
  /** Output MIME type. Default image/jpeg. */
  type?: 'image/jpeg' | 'image/webp' | 'image/png';
}

export interface ResizedImage extends Size {
  blob: Blob;
  type: string;
}

function makeCanvas(width: number, height: number): OffscreenCanvas | HTMLCanvasElement {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(width, height);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

async function canvasToBlob(
  canvas: OffscreenCanvas | HTMLCanvasElement,
  type: string,
  quality: number,
): Promise<Blob> {
  if (canvas instanceof OffscreenCanvas) return canvas.convertToBlob({ type, quality });
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Could not encode the image'))),
      type,
      quality,
    );
  });
}

/**
 * Browser only: decode `file`, honour its EXIF orientation, scale it to fit `maxEdge` and
 * re-encode it. A 12MP phone photo comes out around 300-600KB at 2000px / 0.82.
 */
export async function resizeImage(file: Blob, options: ResizeOptions): Promise<ResizedImage> {
  const type = options.type ?? 'image/jpeg';
  const quality = options.quality ?? 0.82;
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  try {
    const { width, height } = fitWithin(bitmap.width, bitmap.height, options.maxEdge);
    const canvas = makeCanvas(width, height);
    const ctx = canvas.getContext('2d') as
      OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null;
    if (!ctx) throw new Error('Canvas is not available');
    ctx.drawImage(bitmap, 0, 0, width, height);
    const blob = await canvasToBlob(canvas, type, quality);
    return { blob, width, height, type };
  } finally {
    bitmap.close();
  }
}

// ---------------------------------------------------------------------------
// Object paths
// ---------------------------------------------------------------------------

const SEGMENT = /^[A-Za-z0-9_-]{1,64}$/;

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/heic': 'heic',
  'image/heif': 'heif',
};

/** File extension for an image MIME type, or undefined for anything that is not an image we store. */
export function extensionFor(contentType: string): string | undefined {
  return EXTENSIONS[contentType.toLowerCase().split(';')[0]?.trim() ?? ''];
}

/**
 * Build a storage object path from safe segments: `jobs/<id>/before/<photo>.jpg`.
 * Every segment must be letters, digits, dash or underscore so a caller can never climb out
 * of its prefix or inject separators.
 */
export function buildObjectPath(segments: readonly string[], extension: string): string {
  if (segments.length === 0) throw new RangeError('buildObjectPath: at least one segment');
  for (const segment of segments) {
    if (!SEGMENT.test(segment)) throw new RangeError(`buildObjectPath: bad segment "${segment}"`);
  }
  if (!/^[a-z0-9]{1,8}$/.test(extension)) {
    throw new RangeError(`buildObjectPath: bad extension "${extension}"`);
  }
  return `${segments.join('/')}.${extension}`;
}

// ---------------------------------------------------------------------------
// Storage adapter
// ---------------------------------------------------------------------------

export type StorageBody = Blob | ArrayBuffer | Uint8Array;

export interface StorageAdapter {
  /** Write (or overwrite) one object. */
  put(path: string, body: StorageBody, contentType: string): Promise<void>;
  /** A URL that reads the object for `ttlSeconds`. */
  createSignedUrl(path: string, ttlSeconds: number): Promise<string>;
  /** Delete objects. Missing paths are not an error. */
  remove(paths: readonly string[]): Promise<void>;
}

/** Anything with a Supabase `storage` namespace: a typed SupabaseClient for any Database. */
export type StorageClient = Pick<SupabaseClient, 'storage'>;

/** Supabase Storage behind the adapter. The client decides the rights (service role or user). */
export function supabaseStorage(client: StorageClient, bucket: string): StorageAdapter {
  const from = () => client.storage.from(bucket);
  return {
    async put(path, body, contentType) {
      const { error } = await from().upload(path, body, { contentType, upsert: true });
      if (error) throw error;
    },
    async createSignedUrl(path, ttlSeconds) {
      const { data, error } = await from().createSignedUrl(path, ttlSeconds);
      if (error) throw error;
      return data.signedUrl;
    },
    async remove(paths) {
      if (paths.length === 0) return;
      const { error } = await from().remove([...paths]);
      if (error) throw error;
    },
  };
}

export interface MemoryObject {
  bytes: Uint8Array;
  contentType: string;
}

export interface MemoryStorage extends StorageAdapter {
  /** Read an object back (for a dev route that serves them). */
  get(path: string): MemoryObject | undefined;
  /** Is this signed URL token still valid for the path? */
  verifyToken(path: string, token: string): boolean;
  readonly size: number;
}

export interface MemoryStorageOptions {
  /** Prefix for signed URLs, e.g. "/api/dev-storage". Default "memory:/". */
  urlBase?: string;
  /** Clock, for tests. */
  now?: () => number;
}

async function toBytes(body: StorageBody): Promise<Uint8Array> {
  if (body instanceof Uint8Array) return body;
  if (body instanceof ArrayBuffer) return new Uint8Array(body);
  return new Uint8Array(await body.arrayBuffer());
}

/**
 * In-memory storage for development and tests. Signed URLs carry an expiry token that
 * `verifyToken` checks, so a dev route can serve objects with the same rules as production.
 * Never for production: nothing survives a restart.
 */
export function memoryStorage(options: MemoryStorageOptions = {}): MemoryStorage {
  const objects = new Map<string, MemoryObject>();
  const tokens = new Map<string, number>();
  const urlBase = (options.urlBase ?? 'memory:/').replace(/\/$/, '');
  const now = options.now ?? Date.now;
  return {
    get size() {
      return objects.size;
    },
    async put(path, body, contentType) {
      objects.set(path, { bytes: await toBytes(body), contentType });
    },
    async createSignedUrl(path, ttlSeconds) {
      if (!objects.has(path)) throw new Error(`Object not found: ${path}`);
      const token = `${now() + ttlSeconds * 1000}-${Math.random().toString(36).slice(2, 10)}`;
      tokens.set(`${path}#${token}`, now() + ttlSeconds * 1000);
      return `${urlBase}/${path}?token=${encodeURIComponent(token)}`;
    },
    async remove(paths) {
      for (const path of paths) objects.delete(path);
    },
    get: (path) => objects.get(path),
    verifyToken(path, token) {
      const expires = tokens.get(`${path}#${token}`);
      return expires !== undefined && expires > now() && objects.has(path);
    },
  };
}
