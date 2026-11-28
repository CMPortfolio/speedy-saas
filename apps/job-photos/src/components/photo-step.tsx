'use client';

import { Button } from '@speedy/ui/button';

import { MAX_PHOTOS_PER_KIND, type PhotoKind } from '@/config/constants';

import { PhotoPicker, type PickedPhoto } from './photo-picker';

export interface PhotoStepProps {
  kind: PhotoKind;
  photos: readonly PickedPhoto[];
  uploading: boolean;
  saved: number;
  onFiles: (files: File[]) => void;
  onNext: () => void;
}

/** Steps 2 and 3: pick photos of one kind, then go on once at least one has saved. */
export function PhotoStep({ kind, photos, uploading, saved, onFiles, onNext }: PhotoStepProps) {
  return (
    <div className="space-y-6">
      <PhotoPicker kind={kind} photos={photos} max={MAX_PHOTOS_PER_KIND} onFiles={onFiles} />
      <Button
        type="button"
        size="lg"
        fullWidth
        data-testid={`${kind}-next`}
        disabled={saved === 0 || uploading}
        loading={uploading}
        onClick={onNext}
      >
        {kind === 'before' ? 'Next: after photos' : 'Next: add a note'}
      </Button>
      {saved === 0 && !uploading ? (
        <p className="text-center text-sm text-muted">Add at least one photo to go on.</p>
      ) : null}
    </div>
  );
}
