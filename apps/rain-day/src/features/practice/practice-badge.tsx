/** Marks a row as practice, so it is never taken for a real rain day or reply. */
export function PracticeBadge() {
  return (
    <span className="rounded-brand border border-line bg-brand-soft px-2 py-0.5 text-xs font-medium text-brand-deep">
      Practice
    </span>
  );
}
