import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';

import { NaplesFooter } from '@speedy/ui/naples-footer';
import { AppShell } from '@speedy/ui/shell';

import { tool } from '../../tool.config';

import './globals.css';

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
    <html lang="en">
      <body>
        <AppShell toolName={tool.name} footer={<NaplesFooter currentSlug={tool.slug} />}>
          {children}
        </AppShell>
      </body>
    </html>
  );
}
