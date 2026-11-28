import type { PhotoKind } from '@/config/constants';

export interface OgCandidate {
  kind: PhotoKind;
  position: number;
}

export interface OgSelection<T> {
  before: T | null;
  after: T | null;
}

export type OgLayout = 'pair' | 'single' | 'brand';

/** The first (lowest position) before and after photo, or null when a side has none. */
export function selectOgPhotos<T extends OgCandidate>(photos: readonly T[]): OgSelection<T> {
  const first = (kind: PhotoKind): T | null =>
    photos.filter((p) => p.kind === kind).sort((a, b) => a.position - b.position)[0] ?? null;
  return { before: first('before'), after: first('after') };
}

/** Side by side when both exist, one photo when only one side does, the brand card otherwise. */
export function ogLayout(selection: OgSelection<unknown>): OgLayout {
  if (selection.before && selection.after) return 'pair';
  if (selection.before || selection.after) return 'single';
  return 'brand';
}
