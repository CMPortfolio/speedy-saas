/**
 * Facts about this tool that the landing page, metadata and registry entry share.
 * Keep the scope line identical to the first line of README.md.
 */
export const tool = {
  slug: 'missed-call',
  name: 'Missed Call Text-Back',
  /** One line: what it does and what it won't. Replace the placeholder. */
  scope:
    "When an owner misses a call while on a job, the caller gets a text within seconds asking what they need, and the owner sees the reply in one list. It won't be a phone system, answering service, AI receptionist or CRM.",
  /** Owner-facing landing headline: second person, plain, for the trade. */
  headline: 'Miss a call, still get the job.',
  /** Owner-facing landing lede: what happens for them. `scope` is for the README and DoD only. */
  lede: "When you can't pick up, the caller gets a text from you within seconds asking what they need. Their reply lands in one list on your phone.",
  /** Shown in <title> and link previews. Plain, specific, for the trade, not about AI. */
  description:
    'Miss a call on a job and the caller gets a text back in seconds. Their reply lands in one list.',
  /** Postgres schema for this tool's own tables. */
  schema: 'missed_call',
  /** Local dev port. Production uses $PORT from Railway. */
  devPort: 3002,
  /** Production URL. Set when the subdomain exists. */
  url: 'https://missed-call.naplesaiagency.com',
} as const;

export type ToolConfig = typeof tool;
