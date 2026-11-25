import { NAPLES_MARK_DATA_URL } from './og-mark';

/**
 * Open Graph cards rendered with next/og (Satori). Inline styles only, flexbox only: Satori
 * has no Tailwind and no CSS grid. Colours are the naplesaiagency.com tokens.
 */
export const OG_SIZE = { width: 1200, height: 630 } as const;

export const OG_COLORS = {
  navy: '#0B2240',
  lineDark: '#253D5E',
  brandDeep: '#1364A6',
  brandLight: '#5AAEE6',
  orange: '#F97316',
  paper: '#F4F6F9',
  ink: '#0F1C2E',
  line: '#D9E0E8',
  slate: '#A9BBD0',
} as const;

/** The Naples AI mark on a white chip, with the wordmark. */
export function OgBrandMark({ size = 72, color = '#FFFFFF' }: { size?: number; color?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center' }}>
      <div style={{ display: 'flex', background: '#FFFFFF', padding: 8 }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- Satori renders plain img tags only */}
        <img src={NAPLES_MARK_DATA_URL} alt="" width={size} height={size} />
      </div>
      <div style={{ marginLeft: 20, fontSize: size * 0.5, fontWeight: 700, color }}>Naples AI</div>
    </div>
  );
}

/** Default link preview: navy grid, the mark, the tool name and what it does. */
export function BrandCard({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: 72,
        backgroundColor: OG_COLORS.navy,
        backgroundImage:
          'linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)',
        backgroundSize: '48px 48px',
        color: '#FFFFFF',
        fontFamily: 'sans-serif',
      }}
    >
      <OgBrandMark />
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', width: 72, height: 6, background: OG_COLORS.orange }} />
        <div style={{ marginTop: 28, fontSize: 84, fontWeight: 700, lineHeight: 1.05 }}>
          {title}
        </div>
        <div style={{ marginTop: 24, fontSize: 34, lineHeight: 1.3, color: OG_COLORS.slate }}>
          {subtitle}
        </div>
      </div>
      <div style={{ fontSize: 26, color: OG_COLORS.brandLight }}>naplesaiagency.com</div>
    </div>
  );
}
