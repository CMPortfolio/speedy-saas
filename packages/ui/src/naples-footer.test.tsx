import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { NaplesFooter } from './naples-footer';

describe('NaplesFooter', () => {
  it('renders the footer with other tools, the Built by link and small print', () => {
    render(<NaplesFooter currentSlug="milo" />);
    const footer = screen.getByRole('contentinfo');
    expect(footer).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'More from Naples AI' })).toBeInTheDocument();
    expect(screen.getByText(/Built by/)).toBeInTheDocument();
    const builtBy = screen.getByRole('link', { name: 'Naples AI' });
    expect(builtBy).toHaveAttribute('href', 'https://naplesaiagency.com');
    expect(screen.getByText(new RegExp(String(new Date().getFullYear())))).toBeInTheDocument();
    expect(screen.queryByText('MILO')).not.toBeInTheDocument();
  });

  it('renders without a current slug', () => {
    render(<NaplesFooter />);
    expect(screen.getByRole('contentinfo')).toBeInTheDocument();
  });
});
