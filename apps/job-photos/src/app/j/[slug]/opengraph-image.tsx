import { ImageResponse } from 'next/og';

import { ogLayout, selectOgPhotos } from '@/features/jobs/og-selection';
import { loadShareJob } from '@/features/jobs/server/share';
import { BrandCard, OG_SIZE, PairCard } from '@/lib/og';

import { tool } from '../../../../tool.config';

type Params = { params: Promise<{ slug: string }> };

export const alt = 'Before and after photos';
export const size = OG_SIZE;
export const contentType = 'image/png';
export const dynamic = 'force-dynamic';

/** Fetch a signed photo and inline it; Satori is happiest with data URLs. */
async function toDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const type = res.headers.get('content-type') ?? 'image/jpeg';
    const bytes = Buffer.from(await res.arrayBuffer());
    return `data:${type};base64,${bytes.toString('base64')}`;
  } catch {
    return null;
  }
}

/**
 * Link preview for a share page: the first before and after photo side by side. Falls back to
 * the brand card when the job has no photos, is unknown or has expired.
 */
export default async function ShareOpenGraphImage({ params }: Params) {
  const result = await loadShareJob((await params).slug);
  const brand = new ImageResponse(
    <BrandCard title={tool.name} subtitle={tool.description} />,
    size,
  );
  if (result.state !== 'ok') return brand;

  const selection = selectOgPhotos([...result.job.before, ...result.job.after]);
  if (ogLayout(selection) === 'brand') return brand;
  const [before, after] = await Promise.all([
    selection.before ? toDataUrl(selection.before.url) : null,
    selection.after ? toDataUrl(selection.after.url) : null,
  ]);
  if (!before && !after) return brand;

  return new ImageResponse(
    <PairCard before={before} after={after} businessName={result.job.businessName ?? tool.name} />,
    size,
  );
}
