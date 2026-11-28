/**
 * Facts about this tool that the landing page, metadata and registry entry share.
 * Keep the scope line identical to the first line of README.md.
 */
export const tool = {
  slug: 'job-photos',
  name: 'Job Photos',
  /** One line: what it does and what it won't. Replace the placeholder. */
  scope:
    "A tech snaps before and after photos on a job and sends the customer one link that shows them side by side. It won't do invoices, scheduling, a photo library across jobs, or editing beyond crop and rotate.",
  /** Shown in <title> and link previews. Plain, specific, for the trade, not about AI. */
  description:
    'Snap before and after photos on the job and send the customer one link that shows them side by side.',
  /** Postgres schema for this tool's own tables. */
  schema: 'job_photos',
  /** Local dev port. Production uses $PORT from Railway. */
  devPort: 3001,
  /** Production URL. Set when the subdomain exists. */
  url: 'https://job-photos.naplesaiagency.com',
} as const;

export type ToolConfig = typeof tool;
