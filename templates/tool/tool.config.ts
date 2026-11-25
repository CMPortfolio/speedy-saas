/**
 * Facts about this tool that the landing page, metadata and registry entry share.
 * Keep the scope line identical to the first line of README.md.
 */
export const tool = {
  slug: '__SLUG__',
  name: '__NAME__',
  /** One line: what it does and what it won't. Replace the placeholder. */
  scope: 'SCOPE LINE: what this tool does for an owner, and what it will not do.',
  /** Owner-facing landing headline: second person, plain, for the trade. */
  headline: 'HEADLINE: what the owner gets, in their words.',
  /** Owner-facing landing lede: what happens for them. `scope` is for the README and DoD only. */
  lede: 'LEDE: one or two sentences on what happens for the owner. Second person, plain, no jargon.',
  /** Shown in <title> and link previews. Plain, specific, for the trade, not about AI. */
  description: 'DESCRIPTION: one sentence an owner would say to a friend.',
  /** Postgres schema for this tool's own tables. */
  schema: '__SCHEMA__',
  /** Local dev port. Production uses $PORT from Railway. */
  devPort: __PORT__,
  /** Production URL. Set when the subdomain exists. */
  url: 'https://__SLUG__.naplesaiagency.com',
} as const;

export type ToolConfig = typeof tool;
