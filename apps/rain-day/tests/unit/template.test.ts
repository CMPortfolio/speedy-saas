import { describe, expect, it } from 'vitest';

import { defaultTemplate, findBadPlaceholders, renderMessage } from '@/features/rain-day/template';

describe('template', () => {
  it('fills {first_name} and {new_day} for each customer', () => {
    const t =
      'Hi {first_name}, we are moving your lawn service to {new_day}. {first_name}, thanks.';
    expect(renderMessage(t, { name: 'Maria Lopez', newDay: 'Wednesday' })).toBe(
      'Hi Maria, we are moving your lawn service to Wednesday. Maria, thanks.',
    );
  });

  it('falls back to a plain greeting when the name is empty', () => {
    expect(renderMessage('Hi {first_name},', { name: '  ', newDay: 'Monday' })).toBe('Hi there,');
  });

  it('does not re-expand placeholders that appear inside a customer name', () => {
    expect(renderMessage('Hi {first_name}', { name: '{new_day} Smith', newDay: 'Monday' })).toBe(
      'Hi {new_day}',
    );
  });

  it('flags placeholders it does not know', () => {
    expect(findBadPlaceholders('Hi {first_name}, {new_day}')).toEqual([]);
    expect(findBadPlaceholders('Hi {name} and {phone}')).toEqual(['{name}', '{phone}']);
  });

  it('builds a default message that carries the business name', () => {
    const t = defaultTemplate('Green Gulf Lawn');
    expect(t).toContain('{first_name}');
    expect(t).toContain('{new_day}');
    expect(t).toContain('Green Gulf Lawn');
    expect(findBadPlaceholders(t)).toEqual([]);
  });
});
