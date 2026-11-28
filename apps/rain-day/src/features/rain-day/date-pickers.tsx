import { Input } from '@speedy/ui/input';

export interface DatePickersProps {
  from: string;
  to: string;
  today: string;
  error: string | undefined;
  onFrom: (value: string) => void;
  onTo: (value: string) => void;
}

/** The day that is off and the day to move to, side by side. */
export function DatePickers({ from, to, today, error, onFrom, onTo }: DatePickersProps) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <Input
        label="Day that's off"
        type="date"
        name="from"
        value={from}
        onChange={(e) => e.target.value && onFrom(e.target.value)}
      />
      <Input
        label="Move them to"
        type="date"
        name="to"
        value={to}
        min={today}
        onChange={(e) => e.target.value && onTo(e.target.value)}
        error={error}
      />
    </div>
  );
}
