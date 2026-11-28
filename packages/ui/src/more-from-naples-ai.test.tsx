import type { Tool } from '@speedy/registry/tools';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { MoreFromNaplesAI } from './more-from-naples-ai';

const site: Tool = {
  slug: 'site',
  name: 'Naples AI',
  pitch: 'The website.',
  url: 'https://naplesaiagency.com',
  tradeTags: ['general'],
  status: 'live',
  kind: 'website',
};

function tool(slug: string, status: Tool['status'] = 'live'): Tool {
  return {
    slug,
    name: `Tool ${slug}`,
    pitch: `Pitch ${slug}`,
    url: `https://${slug}.naplesaiagency.com`,
    tradeTags: ['general'],
    status,
    kind: 'tool',
  };
}

const tools: readonly Tool[] = [
  site,
  tool('a'),
  tool('b'),
  tool('c', 'building'),
  tool('d'),
  tool('e'),
];

describe('MoreFromNaplesAI', () => {
  it('renders at most 3 other live tools plus the website link', () => {
    render(<MoreFromNaplesAI currentSlug="a" tools={tools} />);
    const nav = screen.getByRole('navigation', { name: 'More from Naples AI' });
    const links = within(nav).getAllByRole('link');
    expect(links).toHaveLength(4);
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      'https://b.naplesaiagency.com',
      'https://d.naplesaiagency.com',
      'https://e.naplesaiagency.com',
      'https://naplesaiagency.com',
    ]);
    expect(within(nav).getByText('Pitch b')).toBeInTheDocument();
  });

  it('never lists the current tool or a building tool', () => {
    render(<MoreFromNaplesAI currentSlug="a" tools={tools} />);
    expect(screen.queryByText('Tool a')).not.toBeInTheDocument();
    expect(screen.queryByText('Tool c')).not.toBeInTheDocument();
  });

  it('renders only the website link when there are no other live tools', () => {
    render(<MoreFromNaplesAI currentSlug="a" tools={[site, tool('a'), tool('c', 'building')]} />);
    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute('href', 'https://naplesaiagency.com');
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
  });

  it('works against the real registry with an unregistered slug', () => {
    render(<MoreFromNaplesAI currentSlug="brand-new-tool" />);
    const links = screen.getAllByRole('link');
    expect(links.length).toBeLessThanOrEqual(4);
    expect(links.at(-1)).toHaveAttribute('href', 'https://naplesaiagency.com');
    expect(screen.queryByText('EasyBoard')).not.toBeInTheDocument();
  });
});
