/**
 * The registry of every Naples AI tool and the website. One entry per product.
 * Tools read it through `@speedy/registry/select` to render "More from Naples AI".
 *
 * Status rule (CLAUDE.md): set `live` only when the engineer says the tool is shipping.
 */

/** Trades and moments a tool is for. Used to pick related tools in the footer. */
export type TradeTag =
  | 'home-services'
  | 'lawn'
  | 'pool'
  | 'outdoor'
  | 'hvac'
  | 'plumbing'
  | 'electrical'
  | 'cleaning'
  | 'restaurants'
  | 'retail'
  | 'professional-services'
  | 'marketing'
  | 'scheduling'
  | 'education'
  | 'general';

export type ToolStatus = 'building' | 'live';

export type ToolKind = 'tool' | 'website';

export interface Tool {
  /** URL-safe id, also the app folder name for Speedy SaaS tools (e.g. `job-photos`). */
  slug: string;
  /** Display name. */
  name: string;
  /** One line, plain and specific: what it does for an owner. */
  pitch: string;
  /** Public URL of the tool. */
  url: string;
  /** Who the tool is for. At least one. */
  tradeTags: readonly TradeTag[];
  status: ToolStatus;
  kind: ToolKind;
}

export const TOOLS: readonly Tool[] = [
  {
    slug: 'naples-ai',
    name: 'Naples AI',
    pitch: 'Small tools and AI help for Southwest Florida businesses.',
    url: 'https://naplesaiagency.com',
    tradeTags: ['general'],
    status: 'live',
    kind: 'website',
  },
  {
    slug: 'milo',
    name: 'MILO',
    pitch: 'Runs your Meta ads like a media buyer would, without the retainer.',
    // Railway project "milo", service milo-prod, custom domain app.milolessons.com.
    url: 'https://app.milolessons.com',
    tradeTags: ['marketing', 'general'],
    status: 'live',
    kind: 'tool',
  },
  {
    slug: 'mia',
    name: 'MIA',
    pitch: 'A learning app that teaches one skill at a time.',
    // Railway project "MIA-Learning", custom domain mialearning.com.
    url: 'https://mialearning.com',
    tradeTags: ['education', 'general'],
    status: 'live',
    kind: 'tool',
  },
  {
    slug: 'easyboard',
    name: 'EasyBoard',
    pitch: 'A simple board that keeps the week’s jobs in order.',
    // No Railway record yet. Placeholder subdomain; confirm the URL before setting status to live.
    url: 'https://easyboard.naplesaiagency.com',
    tradeTags: ['home-services', 'scheduling', 'general'],
    status: 'building',
    kind: 'tool',
  },
  {
    slug: 'duelendar',
    name: 'Duelendar',
    pitch: 'A shared calendar for two, so plans never clash.',
    // Railway project "duelendar", service web, custom domain duelendar.com.
    url: 'https://duelendar.com',
    tradeTags: ['scheduling', 'general'],
    status: 'live',
    kind: 'tool',
  },
  {
    slug: 'job-photos',
    name: 'Job Photos',
    pitch: 'Before and after photos of the job, sent to the customer as one link.',
    // No Railway service yet. Subdomain planned; confirm before setting status to live.
    url: 'https://job-photos.naplesaiagency.com',
    tradeTags: ['home-services', 'hvac', 'plumbing', 'electrical', 'cleaning', 'lawn', 'pool'],
    status: 'building',
    kind: 'tool',
  },
  {
    slug: 'missed-call',
    name: 'Missed Call Text-Back',
    pitch: 'Miss a call on a job and the caller gets a text back in seconds.',
    // Railway service `missed-call` exists, with the custom domain attached and DNS (Cloudflare CNAME) in place.
    // Still building: texting registration (A2P 10DLC) must be approved before owners see it. See
    // apps/missed-call/LAUNCH.md. Confirm before setting status to live.
    url: 'https://missed-call.naplesaiagency.com',
    tradeTags: ['home-services', 'plumbing', 'hvac', 'electrical', 'cleaning'],
    status: 'building',
    kind: 'tool',
  },
  // new-tool: entries are added above this line. Keep this comment.
];
