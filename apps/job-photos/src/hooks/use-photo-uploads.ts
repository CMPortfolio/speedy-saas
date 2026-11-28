'use client';

import { useCallback, useState } from 'react';

import { resizeImage } from '@speedy/lib/photos';

import { PHOTO_JPEG_QUALITY, PHOTO_MAX_EDGE, type PhotoKind } from '@/config/constants';
import { validateUpload } from '@/features/jobs/photo-limits';
import type { PickedPhoto } from '@/components/photo-picker';
import { ApiError, uploadPhotoRequest, type JobHandle } from '@/lib/api-client';

export type PhotoSets = Record<PhotoKind, PickedPhoto[]>;

function messageFor(e: unknown): string {
  return e instanceof ApiError ? e.message : 'Did not save. Check your signal and try again.';
}

/**
 * Picked photos per kind and the upload pipeline: resize in the browser, then POST one at a
 * time so a weak signal in a driveway still gets photos through in order.
 */
export function usePhotoUploads() {
  const [photos, setPhotos] = useState<PhotoSets>({ before: [], after: [] });

  const patch = useCallback((kind: PhotoKind, id: string, changes: Partial<PickedPhoto>) => {
    setPhotos((prev) => ({
      ...prev,
      [kind]: prev[kind].map((p) => (p.id === id ? { ...p, ...changes } : p)),
    }));
  }, []);

  const addPhotos = useCallback(
    async (job: JobHandle, kind: PhotoKind, files: File[]) => {
      const startAt = photos[kind].length;
      const picked = files.map((file) => ({
        file,
        entry: {
          id: crypto.randomUUID(),
          previewUrl: URL.createObjectURL(file),
          status: 'uploading',
        } satisfies PickedPhoto,
      }));
      setPhotos((prev) => ({ ...prev, [kind]: [...prev[kind], ...picked.map((p) => p.entry)] }));

      for (const [index, { file, entry }] of picked.entries()) {
        // Only the type and the slot count can be checked before resizing; a raw camera file is
        // often over the upload limit and shrinks well under it.
        const pre = validateUpload({ type: file.type, size: 1 }, startAt + index);
        if (!pre.ok) {
          patch(kind, entry.id, { status: 'failed', error: pre.error.message });
          continue;
        }
        try {
          const resized = await resizeImage(file, {
            maxEdge: PHOTO_MAX_EDGE,
            quality: PHOTO_JPEG_QUALITY,
          });
          const post = validateUpload(
            { type: resized.type, size: resized.blob.size },
            startAt + index,
          );
          if (!post.ok) throw new ApiError(400, post.error.code, post.error.message);
          await uploadPhotoRequest(job, kind, resized.blob, resized);
          patch(kind, entry.id, { status: 'done' });
        } catch (e) {
          patch(kind, entry.id, { status: 'failed', error: messageFor(e) });
        }
      }
    },
    [patch, photos],
  );

  const uploading = (kind: PhotoKind) => photos[kind].some((p) => p.status === 'uploading');
  const saved = (kind: PhotoKind) => photos[kind].filter((p) => p.status === 'done').length;

  const reset = useCallback(() => setPhotos({ before: [], after: [] }), []);

  return { photos, addPhotos, uploading, saved, reset };
}
