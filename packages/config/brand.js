/**
 * Naples AI brand tokens. One source of truth for every Speedy SaaS tool.
 * Colors are also exposed as CSS variables by ./tailwind.preset.css.
 */
export const brand = {
  name: 'Naples AI',
  website: 'https://naplesaiagency.com',
  colors: {
    // Gulf blue: primary actions and links
    primary: '#0E7490',
    primaryHover: '#155E75',
    primaryForeground: '#FFFFFF',
    // Sunset coral: accents, badges, the occasional highlight
    accent: '#F97362',
    accentForeground: '#2B1B17',
    // Sand and ink: surfaces and text
    background: '#FAF9F6',
    surface: '#FFFFFF',
    border: '#E5E1DA',
    ink: '#1C1917',
    muted: '#6B6560',
    // Status
    success: '#15803D',
    warning: '#B45309',
    danger: '#B91C1C',
  },
  radius: '0.75rem',
  fonts: {
    sans: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  /** Minimum tap target in px (house accessibility rule). */
  tapTarget: 44,
};
