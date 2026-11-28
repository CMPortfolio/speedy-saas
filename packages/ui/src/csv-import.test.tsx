import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { CsvImport } from './csv-import';
import type { RowValidators } from './csv';

const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const validators: RowValidators<string, number> = {
  phone: (raw) => {
    const digits = raw.replace(/\D/g, '');
    return digits.length === 10 ? `+1${digits}` : null;
  },
  day: (raw) => {
    const i = DAYS.indexOf(raw.trim().toLowerCase().slice(0, 3));
    return i === -1 ? null : i;
  },
};

function Harness({
  onImport,
  initial = '',
  importing = false,
}: {
  onImport: (rows: unknown[]) => void;
  initial?: string;
  importing?: boolean;
}) {
  const [text, setText] = useState(initial);
  return (
    <CsvImport
      text={text}
      onTextChange={setText}
      validators={validators}
      onImport={onImport}
      formatDay={(d) => DAYS[d] ?? ''}
      importing={importing}
    />
  );
}

describe('CsvImport', () => {
  it('shows labelled paste and file controls and no preview until there is text', () => {
    render(<Harness onImport={vi.fn()} />);
    expect(screen.getByLabelText('Paste a list')).toBeInTheDocument();
    expect(screen.getByLabelText('Or choose a CSV file')).toHaveAttribute('type', 'file');
    expect(screen.queryByRole('button', { name: /Import/ })).not.toBeInTheDocument();
  });

  it('previews accepted and skipped lines with reasons, then imports the accepted ones', async () => {
    const onImport = vi.fn();
    render(<Harness onImport={onImport} />);
    await userEvent.type(
      screen.getByLabelText('Paste a list'),
      'Maria Lopez, 239-555-0123, Tue{enter}Jim Hale, 555, Wed{enter}No Day, 2395550188',
    );

    const accepted = screen.getByRole('table', { name: 'Customers that will be imported' });
    expect(within(accepted).getByText('Maria Lopez')).toBeInTheDocument();
    expect(within(accepted).getByText('tue')).toBeInTheDocument();
    expect(screen.getByText('Will be imported: 1 customer')).toBeInTheDocument();

    const skipped = screen.getByRole('table', { name: 'Lines that will be skipped' });
    expect(within(skipped).getByText('Bad phone number')).toBeInTheDocument();
    expect(within(skipped).getByText('No service day')).toBeInTheDocument();
    expect(screen.getByText('Will be skipped: 2 lines')).toBeInTheDocument();

    const button = screen.getByRole('button', { name: 'Import 1 customer' });
    expect(button).toBeEnabled();
    await userEvent.click(button);
    expect(onImport).toHaveBeenCalledWith([
      { line: 1, name: 'Maria Lopez', phone: '+12395550123', day: 2, note: null },
    ]);
  });

  it('disables the Import button when nothing can be imported', async () => {
    render(<Harness onImport={vi.fn()} initial="Jim, 555, Wed" />);
    expect(screen.getByRole('button', { name: 'Import 0 customers' })).toBeDisabled();
    expect(screen.getByText(/Nothing can be imported yet/)).toBeInTheDocument();
  });

  it('reads a chosen CSV file into the paste box', async () => {
    render(<Harness onImport={vi.fn()} />);
    const file = new File(['Name,Phone,Day\nMaria,2395550123,Tuesday\n'], 'customers.csv', {
      type: 'text/csv',
    });
    await userEvent.upload(screen.getByLabelText('Or choose a CSV file'), file);
    expect(await screen.findByText('Will be imported: 1 customer')).toBeInTheDocument();
    expect(screen.getByLabelText('Paste a list')).toHaveValue(
      'Name,Phone,Day\nMaria,2395550123,Tuesday\n',
    );
  });

  it('shows the import as busy', () => {
    render(<Harness onImport={vi.fn()} initial="Maria, 2395550123, Tue" importing />);
    expect(screen.getByRole('button', { name: 'Import 1 customer' })).toHaveAttribute(
      'aria-busy',
      'true',
    );
  });
});
