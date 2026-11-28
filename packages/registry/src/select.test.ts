import { describe, expect, it } from 'vitest';

import { getTool, selectMoreTools, websiteEntry } from './select';
import { TOOLS } from './tools';
import type { Tool } from './tools';

const site: Tool = {
  slug: 'site',
  name: 'Site',
  pitch: 'The website.',
  url: 'https://example.com',
  tradeTags: ['general'],
  status: 'live',
  kind: 'website',
};

function tool(slug: string, tradeTags: Tool['tradeTags'], status: Tool['status'] = 'live'): Tool {
  return {
    slug,
    name: slug,
    pitch: `${slug} pitch`,
    url: `https://${slug}.example.com`,
    tradeTags,
    status,
    kind: 'tool',
  };
}

const fixture: readonly Tool[] = [
  site,
  tool('lawn-quotes', ['lawn', 'outdoor', 'home-services']),
  tool('pool-logs', ['pool', 'outdoor', 'home-services']),
  tool('menu-photos', ['restaurants']),
  tool('rain-day', ['lawn', 'outdoor'], 'building'),
  tool('shop-hours', ['retail']),
  tool('sprinkler-check', ['lawn', 'home-services']),
];

const slugs = (tools: Tool[]) => tools.map((t) => t.slug);

describe('selectMoreTools', () => {
  it('never returns the current tool', () => {
    expect(slugs(selectMoreTools(fixture, 'lawn-quotes', 10))).not.toContain('lawn-quotes');
  });

  it('never returns building entries or the website', () => {
    const picked = slugs(selectMoreTools(fixture, 'menu-photos', 10));
    expect(picked).not.toContain('rain-day');
    expect(picked).not.toContain('site');
  });

  it('prefers tools sharing more trade tags, then registry order', () => {
    expect(slugs(selectMoreTools(fixture, 'lawn-quotes', 10))).toEqual([
      'pool-logs',
      'sprinkler-check',
      'menu-photos',
      'shop-hours',
    ]);
  });

  it('fills with other live tools when nothing shares a tag', () => {
    expect(slugs(selectMoreTools(fixture, 'menu-photos', 2))).toEqual(['lawn-quotes', 'pool-logs']);
  });

  it('caps at the limit, 3 by default', () => {
    expect(selectMoreTools(fixture, 'shop-hours')).toHaveLength(3);
    expect(selectMoreTools(fixture, 'shop-hours', 1)).toHaveLength(1);
    expect(selectMoreTools(fixture, 'shop-hours', 0)).toHaveLength(0);
  });

  it('works when the current slug is unknown or missing', () => {
    expect(slugs(selectMoreTools(fixture, 'not-registered-yet'))).toEqual([
      'lawn-quotes',
      'pool-logs',
      'menu-photos',
    ]);
    expect(selectMoreTools(fixture, undefined)).toHaveLength(3);
  });

  it('runs against the real registry without returning the website or building tools', () => {
    for (const picked of selectMoreTools(TOOLS, 'milo', 10)) {
      expect(picked.kind).toBe('tool');
      expect(picked.status).toBe('live');
      expect(picked.slug).not.toBe('milo');
    }
  });
});

describe('getTool', () => {
  it('finds a tool by slug and returns undefined for unknown slugs', () => {
    expect(getTool('pool-logs', fixture)?.name).toBe('pool-logs');
    expect(getTool('nope', fixture)).toBeUndefined();
    expect(getTool('milo')?.kind).toBe('tool');
  });
});

describe('websiteEntry', () => {
  it('returns the single website entry', () => {
    expect(websiteEntry(fixture).slug).toBe('site');
    expect(websiteEntry().url).toBe('https://naplesaiagency.com');
  });

  it('throws when the registry has no website', () => {
    expect(() => websiteEntry([tool('x', ['general'])])).toThrow();
  });
});

describe('TOOLS', () => {
  it('has unique slugs and exactly one website', () => {
    const all = TOOLS.map((t) => t.slug);
    expect(new Set(all).size).toBe(all.length);
    expect(TOOLS.filter((t) => t.kind === 'website')).toHaveLength(1);
  });
});
