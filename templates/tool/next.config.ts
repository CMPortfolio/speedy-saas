import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Workspace packages are TypeScript source; Next compiles them.
  transpilePackages: [
    '@speedy/auth',
    '@speedy/db',
    '@speedy/lib',
    '@speedy/registry',
    '@speedy/ui',
  ],
  images: { remotePatterns: [{ protocol: 'https', hostname: '*.supabase.co' }] },
};

export default nextConfig;
