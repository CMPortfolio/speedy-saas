import { ImageResponse } from 'next/og';

import { BrandCard, OG_SIZE } from '@/lib/og';

import { tool } from '../../tool.config';

export const alt = tool.name;
export const size = OG_SIZE;
export const contentType = 'image/png';

/** Default link preview: tool name and scope on the brand colours. Share pages have their own. */
export default function OpenGraphImage() {
  return new ImageResponse(<BrandCard title={tool.name} subtitle={tool.lede} />, size);
}
