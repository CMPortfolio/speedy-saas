import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Input } from './input';

describe('Input', () => {
  it('always renders a label associated with the field', () => {
    render(<Input label="Phone number" name="phone" />);
    const input = screen.getByLabelText('Phone number');
    expect(input).toBeInTheDocument();
    expect(input).toHaveAttribute('id');
    expect(input).not.toHaveAttribute('aria-invalid');
    expect(input).not.toHaveAttribute('aria-describedby');
  });

  it('describes the field with its hint', () => {
    render(<Input label="Phone number" hint="We only text about this job." />);
    const input = screen.getByLabelText('Phone number');
    const hint = screen.getByText('We only text about this job.');
    expect(input).toHaveAttribute('aria-describedby', hint.id);
  });

  it('marks the field invalid and links the error through aria-describedby', () => {
    render(<Input label="Phone number" hint="10 digits" error="Enter a 10-digit number." />);
    const input = screen.getByLabelText('Phone number');
    const error = screen.getByRole('alert');
    expect(error).toHaveTextContent('Enter a 10-digit number.');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input.getAttribute('aria-describedby')?.split(' ')).toContain(error.id);
    expect(input.className).toContain('border-danger');
  });

  it('respects a caller-provided id', () => {
    render(<Input id="job-name" label="Job name" />);
    expect(screen.getByLabelText('Job name')).toHaveAttribute('id', 'job-name');
  });
});
