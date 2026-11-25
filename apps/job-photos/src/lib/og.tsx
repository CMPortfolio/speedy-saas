import { OG_COLORS, OgBrandMark } from '@speedy/ui/og';

export { BrandCard, OG_SIZE } from '@speedy/ui/og';

/** Share-page preview cards (Satori: inline styles, flexbox only). Colours are the brand tokens. */
const INK = OG_COLORS.ink;
const PAPER = OG_COLORS.paper;

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
        background: OG_COLORS.line,
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
          background: 'rgba(11,34,64,0.82)',
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
          height: 110,
          padding: '0 40px',
          fontSize: 32,
        }}
      >
        <div style={{ fontWeight: 700 }}>{businessName}</div>
        <OgBrandMark size={44} color={OG_COLORS.brandDeep} />
      </div>
    </div>
  );
}
