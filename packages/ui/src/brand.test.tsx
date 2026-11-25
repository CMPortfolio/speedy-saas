import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Alert } from './alert';
import { buttonClasses } from './button';
import { Card } from './card';
import { NaplesMark } from './naples-mark';
import { PageHeader } from './page-header';
import { AppShell } from './shell';
import { Steps } from './steps';

describe('brand components', () => {
  it('buttonClasses keeps the tap target and focus ring for link buttons', () => {
    const classes = buttonClasses({ fullWidth: true });
    expect(classes).toContain('min-h-tap');
    expect(classes).toContain('focus-visible:outline-2');
    expect(classes).toContain('w-full');
  });

  it('PageHeader renders eyebrow, one h1, lede and actions', () => {
    render(
      <PageHeader
        size="hero"
        eyebrow="For crews"
        title="Rain Day"
        description="Text everyone at once."
        actions={<a href="/x">Start</a>}
      />,
    );
    expect(screen.getByRole('heading', { level: 1, name: 'Rain Day' })).toBeInTheDocument();
    expect(screen.getByText('For crews')).toBeInTheDocument();
    expect(screen.getByText('Text everyone at once.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Start' })).toBeInTheDocument();
  });

  it('Steps is an ordered list with numbered items', () => {
    render(<Steps items={[{ body: 'One' }, { title: 'Two', body: 'Second' }]} />);
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByRole('heading', { level: 3, name: 'Two' })).toBeInTheDocument();
    expect(screen.getByText('01')).toBeInTheDocument();
  });

  it('Alert announces errors and not the rest', () => {
    const { rerender } = render(<Alert tone="error">Bad</Alert>);
    expect(screen.getByRole('alert')).toHaveTextContent('Bad');
    rerender(<Alert>Fine</Alert>);
    expect(screen.getByRole('status')).toHaveTextContent('Fine');
  });

  it('Card can carry the brand accent rule', () => {
    render(
      <Card accent data-testid="card">
        Hi
      </Card>,
    );
    expect(screen.getByTestId('card').className).toContain('border-t-brand');
  });

  it('NaplesMark is decorative and sized', () => {
    const { container } = render(<NaplesMark size={40} />);
    const img = container.querySelector('img');
    expect(img).toHaveAttribute('alt', '');
    expect(img).toHaveAttribute('width', '40');
  });

  it('AppShell links the Naples AI mark to the website and shows the tool name', () => {
    render(
      <AppShell toolName="Rain Day" headerRight={<nav aria-label="App">links</nav>}>
        body
      </AppShell>,
    );
    expect(screen.getByRole('link', { name: 'Naples AI' })).toHaveAttribute(
      'href',
      'https://naplesaiagency.com',
    );
    expect(screen.getByRole('link', { name: 'Rain Day' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('main')).toHaveTextContent('body');
  });
});
