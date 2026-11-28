'use client';

import Image from 'next/image';
import { useId, type ChangeEvent } from 'react';

import { cn } from '@speedy/ui/cn';

import type { PhotoKind } from '@/config/constants';

export type PickedPhotoStatus = 'uploading' | 'done' | 'failed';

export interface PickedPhoto {
  id: string;
  previewUrl: string;
  status: PickedPhotoStatus;
  error?: string;
}

export interface PhotoPickerProps {
  kind: PhotoKind;
  photos: readonly PickedPhoto[];
  max: number;
  disabled?: boolean;
  onFiles: (files: File[]) => void;
}

const pickerButton =
  'flex min-h-tap flex-1 cursor-pointer items-center justify-center rounded-brand border px-4 text-base font-medium ' +
  'focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-primary';

/**
 * Two big buttons, camera and library, over hidden file inputs, plus a grid of what has been
 * taken so far. Each input is `accept="image/*" multiple`; the camera one adds
 * `capture="environment"` so phones open the back camera straight away.
 */
export function PhotoPicker({ kind, photos, max, disabled = false, onFiles }: PhotoPickerProps) {
  const cameraId = useId();
  const libraryId = useId();
  const remaining = Math.max(0, max - photos.length);
  const full = remaining === 0;
  const label = kind === 'before' ? 'Before' : 'After';

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []).slice(0, remaining);
    event.target.value = '';
    if (files.length) onFiles(files);
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted" aria-live="polite">
        {photos.length} of {max} {label.toLowerCase()} photos
        {full ? '. That is the most for one job.' : ''}
      </p>
      <div className="flex gap-3">
        <label
          htmlFor={cameraId}
          className={cn(
            pickerButton,
            'border-primary bg-primary text-primary-foreground hover:bg-primary-hover',
            (disabled || full) && 'cursor-not-allowed opacity-60',
          )}
        >
          Take a photo
          <input
            id={cameraId}
            data-testid={`${kind}-camera`}
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            disabled={disabled || full}
            onChange={handleChange}
            className="sr-only"
          />
        </label>
        <label
          htmlFor={libraryId}
          className={cn(
            pickerButton,
            'border-border bg-surface text-ink hover:bg-background',
            (disabled || full) && 'cursor-not-allowed opacity-60',
          )}
        >
          Choose from library
          <input
            id={libraryId}
            data-testid={`${kind}-library`}
            type="file"
            accept="image/*"
            multiple
            disabled={disabled || full}
            onChange={handleChange}
            className="sr-only"
          />
        </label>
      </div>
      {photos.length > 0 && (
        <ul className="grid grid-cols-3 gap-2" aria-label={`${label} photos`}>
          {photos.map((photo, index) => (
            <li
              key={photo.id}
              className="relative aspect-square overflow-hidden rounded-brand border border-border bg-surface"
            >
              <Image
                src={photo.previewUrl}
                alt={`${label} photo ${index + 1}`}
                fill
                unoptimized
                sizes="33vw"
                className={cn('object-cover', photo.status !== 'done' && 'opacity-60')}
              />
              {photo.status === 'uploading' && (
                <span className="absolute inset-x-0 bottom-0 bg-ink/70 px-2 py-1 text-xs text-primary-foreground">
                  Saving…
                </span>
              )}
              {photo.status === 'failed' && (
                <span
                  role="alert"
                  className="absolute inset-x-0 bottom-0 bg-danger px-2 py-1 text-xs text-primary-foreground"
                >
                  {photo.error ?? 'Did not save'}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
