import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { CustomerList } from './customer-list';
import { EmptyState } from './empty-state';

interface Row {
  id: string;
  name: string;
  phone: string;
  day: string;
  note: string | null;
}

const rows: Row[] = [
  { id: 'a', name: 'Maria Lopez', phone: '(239) 555-0123', day: 'Tuesday', note: 'Back gate' },
  { id: 'b', name: 'Jim Hale', phone: '(239) 555-0188', day: 'Wednesday', note: null },
];

const columns = {
  name: (r: Row) => r.name,
  phone: (r: Row) => r.phone,
  day: (r: Row) => r.day,
  note: (r: Row) => r.note,
};

describe('CustomerList', () => {
  it('renders one card per customer with name, phone, day and note', () => {
    render(
      <CustomerList items={rows} getKey={(r) => r.id} columns={columns} emptyState={<p>none</p>} />,
    );
    const list = screen.getByRole('list', { name: 'Customers' });
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(within(items[0]!).getByText('Maria Lopez')).toBeInTheDocument();
    expect(within(items[0]!).getByText('(239) 555-0123')).toBeInTheDocument();
    expect(within(items[0]!).getByText('Tuesday')).toBeInTheDocument();
    expect(within(items[0]!).getByText('Back gate')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('calls onEdit and onDelete with the row, using the label for the button names', async () => {
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    render(
      <CustomerList
        items={rows}
        getKey={(r) => r.id}
        getLabel={(r) => r.name}
        columns={columns}
        onEdit={onEdit}
        onDelete={onDelete}
        emptyState={<p>none</p>}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Edit Jim Hale' }));
    expect(onEdit).toHaveBeenCalledWith(rows[1]);
    await userEvent.click(screen.getByRole('button', { name: 'Delete Maria Lopez' }));
    expect(onDelete).toHaveBeenCalledWith(rows[0]);
    const edit = screen.getByRole('button', { name: 'Edit Maria Lopez' });
    expect(edit.className).toContain('min-h-tap');
  });

  it('marks the busy row and shows the empty state when there are no customers', () => {
    const { rerender } = render(
      <CustomerList
        items={rows}
        getKey={(r) => r.id}
        getLabel={(r) => r.name}
        columns={columns}
        onDelete={vi.fn()}
        busyKey="a"
        emptyState={<p>none</p>}
      />,
    );
    expect(screen.getByRole('button', { name: 'Delete Maria Lopez' })).toHaveAttribute(
      'aria-busy',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Delete Jim Hale' })).toBeEnabled();

    rerender(
      <CustomerList
        items={[]}
        getKey={(r: Row) => r.id}
        columns={columns}
        emptyState={<EmptyState title="No customers yet" description="Add your first one." />}
      />,
    );
    expect(screen.getByRole('heading', { name: 'No customers yet' })).toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });
});
