import { firstName } from '@speedy/lib/phone';

/** The only two blanks a message can have. Everything else the owner types is sent as written. */
export const PLACEHOLDERS = ['{first_name}', '{new_day}'] as const;
export const MAX_TEMPLATE_LENGTH = 480;

export function defaultTemplate(businessName: string): string {
  const sign = businessName.trim() ? ` — ${businessName.trim()}` : '';
  return `Hi {first_name}, the weather is wiping out our day, so we're moving your service to {new_day}.${sign}`;
}

/** Placeholders in curly braces that we do not fill in, so the owner can fix them before sending. */
export function findBadPlaceholders(template: string): string[] {
  const found = template.match(/\{[^{}]*\}/g) ?? [];
  return [...new Set(found)].filter((p) => !(PLACEHOLDERS as readonly string[]).includes(p));
}

/**
 * Fill one customer's message. Values go in with a single pass, so a name that happens to contain
 * "{new_day}" stays as typed and never pulls in anything else.
 */
export function renderMessage(template: string, values: { name: string; newDay: string }): string {
  const first = firstName(values.name) || 'there';
  return template.replace(/\{first_name\}|\{new_day\}/g, (token) =>
    token === '{first_name}' ? first : values.newDay,
  );
}
