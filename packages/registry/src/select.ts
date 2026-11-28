import { TOOLS } from './tools';
import type { Tool } from './tools';

/** The registry entry for `slug`, or undefined for a tool not yet registered. */
export function getTool(slug: string, tools: readonly Tool[] = TOOLS): Tool | undefined {
  return tools.find((tool) => tool.slug === slug);
}

/** The Naples AI website entry. The registry always has exactly one. */
export function websiteEntry(tools: readonly Tool[] = TOOLS): Tool {
  const site = tools.find((tool) => tool.kind === 'website');
  if (!site) {
    throw new Error('Registry has no website entry');
  }
  return site;
}

function sharedTagCount(a: Tool | undefined, b: Tool): number {
  if (!a) return 0;
  return b.tradeTags.filter((tag) => a.tradeTags.includes(tag)).length;
}

/**
 * Up to `limit` other live tools to show under the current one.
 * Tools sharing more trade tags with the current tool come first; ties keep registry order.
 * Never returns the current tool, a `building` entry or the website.
 * An unknown `currentSlug` (a tool scaffolded but not yet registered) just returns live tools.
 */
export function selectMoreTools(
  tools: readonly Tool[],
  currentSlug: string | undefined,
  limit = 3,
): Tool[] {
  const current = currentSlug === undefined ? undefined : getTool(currentSlug, tools);
  return tools
    .filter((tool) => tool.kind === 'tool' && tool.status === 'live' && tool.slug !== currentSlug)
    .map((tool, index) => ({ tool, index, shared: sharedTagCount(current, tool) }))
    .sort((a, b) => b.shared - a.shared || a.index - b.index)
    .slice(0, Math.max(0, limit))
    .map((entry) => entry.tool);
}
