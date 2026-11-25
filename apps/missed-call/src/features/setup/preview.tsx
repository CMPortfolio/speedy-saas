import { withOptOutFooter } from '@speedy/sms/keywords';

import { formatClock, type OpenHours } from './hours';

interface PreviewProps {
  businessName: string;
  template: string;
  afterHoursTemplate: string;
  hours: OpenHours | null;
}

function Bubble({ label, text }: { label: string; text: string }) {
  return (
    <div className="space-y-1">
      <p className="text-sm font-medium text-muted">{label}</p>
      <p
        className="whitespace-pre-line rounded-brand bg-background px-4 py-3 text-base text-ink"
        data-testid="preview-text"
      >
        {text || 'Your text shows up here as you type.'}
      </p>
    </div>
  );
}

/** What a caller will read, including the business name and STOP line the first text carries. */
export function Preview({ businessName, template, afterHoursTemplate, hours }: PreviewProps) {
  const name = businessName.trim() || 'Your business';
  return (
    <section
      aria-label="What callers get"
      className="space-y-3 rounded-brand border border-border bg-surface p-4"
    >
      <h2 className="text-lg font-semibold">What callers get</h2>
      <Bubble
        label={
          hours
            ? `During your hours (${formatClock(hours.opens)} to ${formatClock(hours.closes)})`
            : 'Every missed call'
        }
        text={template.trim() ? withOptOutFooter(template.trim(), name) : ''}
      />
      {hours && afterHoursTemplate.trim() && (
        <Bubble label="After hours" text={withOptOutFooter(afterHoursTemplate.trim(), name)} />
      )}
      <p className="text-sm text-muted">
        The first text a number gets always ends with your business name and how to stop texts.
      </p>
    </section>
  );
}
