import { ImageResponse } from 'next/og';

import { tool } from '../../tool.config';

export const alt = tool.name;
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

/** Default link preview: tool name and scope on the brand colours. Tools can override per route. */
export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: 72,
        background: '#0E7490',
        color: '#FFFFFF',
        fontFamily: 'sans-serif',
      }}
    >
      <div style={{ fontSize: 72, fontWeight: 700, lineHeight: 1.1 }}>{tool.name}</div>
      <div style={{ fontSize: 34, lineHeight: 1.3, opacity: 0.95 }}>{tool.description}</div>
      <div style={{ fontSize: 28, opacity: 0.8 }}>Naples AI · naplesaiagency.com</div>
    </div>,
    size,
  );
}
