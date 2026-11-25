import { MAX_TEMPLATE_LENGTH } from './template';

export function MessageField({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor="template" className="text-sm font-medium text-ink">
        Your message
      </label>
      <textarea
        id="template"
        rows={4}
        maxLength={MAX_TEMPLATE_LENGTH}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="min-h-tap w-full rounded-brand border border-border bg-surface px-3 py-2 text-base text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        aria-describedby="template-hint"
      />
      <p id="template-hint" className="text-sm text-muted">
        {'{first_name}'} and {'{new_day}'} are filled in for each customer, as you see above.
      </p>
    </div>
  );
}
