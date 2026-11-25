import { ImageResponse } from 'next/og';

import { BrandCard, OG_SIZE } from '@speedy/ui/og';

import { tool } from '../../tool.config';

export const alt = tool.name;
export const size = OG_SIZE;
export const contentType = 'image/png';

/** Default link preview: the Naples AI mark, tool name and what it does. */
export default function OpenGraphImage() {
  return new ImageResponse(<BrandCard title={tool.name} subtitle={tool.lede} />, size);
}
