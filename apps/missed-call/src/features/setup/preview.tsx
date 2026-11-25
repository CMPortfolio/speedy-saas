import { countSegments, MAX_COMFORTABLE_SEGMENTS } from '@speedy/sms/segments';
import { withOptOutFooter } from '@speedy/sms/keywords';

import { formatClock, type OpenHours } from './hours';

interface PreviewProps {
  businessName: string;
  template: string;
  afterHoursTemplate: string;
  hours: OpenHours | null;
}

/** How many text messages this will cost, and a plain warning when it is more than two. */
function Segments({ text }: { text: string }) {
  const count = countSegments(text);
  if (count.segments === 0) return null;
  const tooLong = count.segments > MAX_COMFORTABLE_SEGMENTS;
  const curly = count.nonGsm.filter((c) => /[’‘“”]/.test(c));
  return (
    <div className="space-y-1 text-sm">
      <p className={tooLong ? 'font-medium text-danger' : 'text-muted'} data-testid="segment-count">
        {count.segments} {count.segments === 1 ? 'message' : 'messages'} ({count.length} characters)
      </p>
      {tooLong && (
        <p role="status" className="text-danger" data-testid="segment-warning">
          This is long: it goes out as {count.segments} messages.{' '}
          {count.encoding === 'ucs2'
            ? curly.length > 0
              ? 'Curly quotes and apostrophes make every message shorter. Use plain \' and " to fit more.'
              : `The character ${count.nonGsm.slice(0, 3).join(' ')} makes every message shorter. Take it out to fit more.`
            : 'Cut it down to two messages or fewer.'}
        </p>
      )}
    </div>
  );
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
      <Segments text={text} />
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
