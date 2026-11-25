/**
 * Facts about this tool that the landing page, metadata and registry entry share.
 * Keep the scope line identical to the first line of README.md.
 */
export const tool = {
  slug: 'rain-day',
  name: 'Rain Day',
  /** One line: what it does and what it won't. Identical to the first line of README.md. */
  scope:
    "When weather wipes out a day, the owner picks the day, picks the new day, and every affected customer gets one personal text about the change. It won't be a route planner, a scheduling system or a weather app.",
  /** Owner-facing landing headline: second person, plain, for the trade. */
  headline: 'Rained out? Tell every customer in one tap.',
  /** Owner-facing landing lede: what happens for them. `scope` is for the README and DoD only. */
  lede: "Pick the day you lost and the day you're moving to. Each customer on that route gets their own text with their name on it.",
  /** Shown in <title> and link previews. Plain, specific, for the trade, not about AI. */
  description:
    'Rain washed out the day? Pick the day, pick the new one, and every customer on that route gets a personal text about the change.',
  /** Postgres schema for this tool's own tables. */
  schema: 'rain_day',
  /** Local dev port. Production uses $PORT from Railway. */
  devPort: 3003,
  /** Production URL. Set when the subdomain exists. */
  url: 'https://rain-day.naplesaiagency.com',
} as const;

export type ToolConfig = typeof tool;
