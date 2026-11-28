import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Button } from './button';

describe('Button', () => {
  it('renders an accessible button with the house tap-target and focus classes', () => {
    render(<Button>Save job</Button>);
    const button = screen.getByRole('button', { name: 'Save job' });
    expect(button).toBeEnabled();
    expect(button).toHaveAttribute('type', 'button');
    expect(button.className).toContain('min-h-tap');
    expect(button.className).toContain('min-w-tap');
    expect(button.className).toContain('focus-visible:outline-2');
  });

  it('disables itself and reports busy while loading', async () => {
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        Sending
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Sending' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('applies the variant and merges extra classes', () => {
    render(
      <Button variant="danger" className="mt-4">
        Delete
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Delete' });
    expect(button.className).toContain('bg-danger');
    expect(button.className).toContain('mt-4');
  });
});
