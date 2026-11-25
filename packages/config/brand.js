/**
 * Naples AI brand tokens. One source of truth for every Speedy SaaS tool.
 * Colors are also exposed as CSS variables by ./tailwind.preset.css.
 */
export const brand = {
  name: 'Naples AI',
  website: 'https://naplesaiagency.com',
  colors: {
    // The naplesaiagency.com palette, under the site's names
    brand: '#1A7AC6',
    brandDeep: '#1364A6',
    brandLight: '#5AAEE6',
    brandSoft: '#E6F1FA',
    orange: '#F97316',
    orangeDeep: '#C2410C',
    paper: '#F4F6F9',
    ink: '#0F1C2E',
    ink2: '#34445A',
    line: '#D9E0E8',
    navy: '#0B2240',
    lineDark: '#253D5E',
    // Text on navy
    onNavy: '#A9BBD0',
    onNavyMuted: '#9DB0C8',
    onNavyStrong: '#C3D2E3',
    // Semantic names the tools use
    primary: '#1364A6',
    primaryHover: '#0F548C',
    primaryForeground: '#FFFFFF',
    accent: '#F97316',
    accentForeground: '#0F1C2E',
    background: '#F4F6F9',
    surface: '#FFFFFF',
    border: '#D9E0E8',
    // Input and select borders: 3.5:1 on white
    field: '#7A899E',
    // The site's muted is #66768B (4.3:1 on paper); text uses this deeper slate for AA.
    muted: '#5B6B80',
    // Status
    success: '#15803D',
    warning: '#B45309',
    danger: '#B91C1C',
  },
  radius: '0.125rem',
  fonts: {
    sans: 'Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    serif: 'Newsreader, Georgia, "Times New Roman", serif',
  },
  /** Minimum tap target in px (house accessibility rule). */
  tapTarget: 44,
};
