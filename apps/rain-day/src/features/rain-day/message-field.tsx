export interface MessageFieldProps {
  value: string;
  onChange: (value: string) => void;
}

/**
 * The editable message. {first_name} and {new_day} are filled in per customer in the preview
 * above it. A customer's first text also gets "Business. Reply STOP to opt out." added.
 */
export function MessageField({ value, onChange }: MessageFieldProps) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor="template" className="text-sm font-medium text-ink">
        Your message
      </label>
      <textarea
        id="template"
        rows={4}
        maxLength={480}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="min-h-tap w-full rounded-brand border border-field bg-surface px-3 py-2 text-base text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        aria-describedby="template-hint"
      />
      <p id="template-hint" className="text-sm text-muted">
        {'{first_name}'} and {'{new_day}'} are filled in for each customer, as you see above.
        Customers who have never heard from you also get a line at the end with your business name
        and how to opt out.
      </p>
    </div>
  );
}
