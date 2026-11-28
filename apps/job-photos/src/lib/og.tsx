/**
 * Open Graph cards rendered with next/og (Satori). Inline styles only, flexbox only: Satori
 * has no Tailwind and no CSS grid. Colours mirror packages/config/brand.js.
 */
export const OG_SIZE = { width: 1200, height: 630 } as const;

const BRAND = '#0E7490';
const INK = '#1C1917';
const PAPER = '#FAF9F6';

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
        background: BRAND,
        color: '#FFFFFF',
        fontFamily: 'sans-serif',
      }}
    >
      <div style={{ fontSize: 72, fontWeight: 700, lineHeight: 1.1 }}>{title}</div>
      <div style={{ fontSize: 34, lineHeight: 1.3, opacity: 0.95 }}>{subtitle}</div>
      <div style={{ fontSize: 28, opacity: 0.8 }}>Naples AI · naplesaiagency.com</div>
    </div>
  );
}

export interface PairCardProps {
  /** Data URLs (or absolute URLs) for the photos; a missing side shows a plain panel. */
  before: string | null;
  after: string | null;
  businessName: string;
}

function Panel({ src, label }: { src: string | null; label: string }) {
  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        background: '#E5E1DA',
        overflow: 'hidden',
      }}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- Satori renders plain img tags only
        <img
          src={src}
          alt=""
          width={600}
          height={530}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      ) : null}
      <div
        style={{
          position: 'absolute',
          top: 24,
          left: 24,
          padding: '10px 20px',
          borderRadius: 12,
          background: 'rgba(28,25,23,0.78)',
          color: '#FFFFFF',
          fontSize: 32,
          fontWeight: 700,
        }}
      >
        {label}
      </div>
    </div>
  );
}

/** Before on the left, after on the right, business name underneath. */
export function PairCard({ before, after, businessName }: PairCardProps) {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: PAPER,
        color: INK,
        fontFamily: 'sans-serif',
      }}
    >
      <div style={{ display: 'flex', flex: 1, gap: 8 }}>
        <Panel src={before} label="Before" />
        <Panel src={after} label="After" />
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          height: 100,
          padding: '0 40px',
          fontSize: 32,
        }}
      >
        <div style={{ fontWeight: 700 }}>{businessName}</div>
        <div style={{ color: BRAND, fontSize: 26 }}>Before and after photos</div>
      </div>
    </div>
  );
}
