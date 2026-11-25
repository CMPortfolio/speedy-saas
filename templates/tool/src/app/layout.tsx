import type { Metadata, Viewport } from 'next';
import { Inter, Newsreader } from 'next/font/google';
import type { ReactNode } from 'react';

import { NaplesFooter } from '@speedy/ui/naples-footer';
import { AppShell } from '@speedy/ui/shell';

import { tool } from '../../tool.config';

import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-inter',
  display: 'swap',
});
const newsreader = Newsreader({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-newsreader',
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_URL ?? `http://localhost:${tool.devPort}`),
  title: { default: tool.name, template: `%s · ${tool.name}` },
  description: tool.description,
  openGraph: {
    title: tool.name,
    description: tool.description,
    siteName: tool.name,
    type: 'website',
  },
  twitter: { card: 'summary_large_image', title: tool.name, description: tool.description },
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${newsreader.variable}`}>
      <body>
        <AppShell toolName={tool.name} footer={<NaplesFooter currentSlug={tool.slug} />}>
          {children}
        </AppShell>
      </body>
    </html>
  );
}
