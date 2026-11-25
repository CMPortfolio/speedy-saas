/**
 * pnpm new-tool <slug> [--name "Display Name"]
 *
 * Copies templates/tool to apps/<slug>, fills in slug, name, schema and a free dev port, adds a
 * registry entry with status "building", creates the tool's first migration, and prints the
 * checklist a person still has to do. Never hand-copy another tool's folder (CLAUDE.md rule 7).
 */
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const TEMPLATE = join(root, 'templates', 'tool');
const APPS = join(root, 'apps');
const REGISTRY = join(root, 'packages', 'registry', 'src', 'tools.ts');
const MIGRATIONS = join(root, 'packages', 'db', 'supabase', 'migrations');
const MARKER = '  // new-tool: entries are added above this line. Keep this comment.';
const FIRST_PORT = 3001;

interface Args {
  slug: string;
  name: string;
  dryRun: boolean;
}

function fail(message: string): never {
  console.error(`new-tool: ${message}`);
  process.exit(1);
}

function titleCase(slug: string): string {
  return slug
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function parseArgs(argv: string[]): Args {
  const slug = argv.find((a) => !a.startsWith('--'));
  if (!slug) fail('usage: pnpm new-tool <slug> [--name "Display Name"] [--dry-run]');
  if (!/^[a-z][a-z0-9-]{1,30}$/.test(slug) || slug.endsWith('-')) {
    fail(`slug "${slug}" must be lowercase letters, digits and dashes, e.g. job-photos`);
  }
  const nameIndex = argv.indexOf('--name');
  const name = nameIndex >= 0 ? argv[nameIndex + 1] : undefined;
  return {
    slug,
    name: name && name.trim() ? name.trim() : titleCase(slug),
    dryRun: argv.includes('--dry-run'),
  };
}

function usedPorts(): Set<number> {
  const ports = new Set<number>();
  if (!existsSync(APPS)) return ports;
  for (const dir of readdirSync(APPS)) {
    const pkg = join(APPS, dir, 'package.json');
    if (!existsSync(pkg)) continue;
    const text = readFileSync(pkg, 'utf8');
    for (const m of text.matchAll(/next dev -p (\d+)/g)) ports.add(Number(m[1]));
  }
  return ports;
}

function freePort(): number {
  const used = usedPorts();
  let port = FIRST_PORT;
  while (used.has(port)) port += 1;
  return port;
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

function fill(text: string, vars: Record<string, string>): string {
  return text.replace(
    /__(SLUG|NAME|PORT|SCHEMA)__/g,
    (_, key: string) => vars[key] ?? `__${key}__`,
  );
}

function timestamp(): string {
  return new Date().toISOString().replace(/\D/g, '').slice(0, 14);
}

function registryEntry(slug: string, name: string): string {
  return `  {
    slug: '${slug}',
    name: '${name}',
    pitch: 'PITCH: one line on what it does for an owner.',
    url: 'https://${slug}.naplesaiagency.com',
    tradeTags: ['general'],
    status: 'building',
    kind: 'tool',
  },
`;
}

function migrationSql(schema: string, slug: string): string {
  return `-- ${slug}: first migration. Tables for this tool live in schema "${schema}".
-- Every table: id, created_at, updated_at (timestamptz), RLS on, one policy per operation.
-- Expose the schema to the API (api.schemas in packages/db/supabase/config.jsonc) when you add
-- the first table, then run pnpm db:types.

create schema if not exists ${schema};
grant usage on schema ${schema} to anon, authenticated, service_role;
alter default privileges in schema ${schema} grant all on tables to anon, authenticated, service_role;
alter default privileges in schema ${schema} grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema ${schema} grant execute on functions to anon, authenticated, service_role;
`;
}

function main(): void {
  const { slug, name, dryRun } = parseArgs(process.argv.slice(2));
  const dest = join(APPS, slug);
  if (existsSync(dest)) fail(`apps/${slug} already exists`);
  if (!existsSync(TEMPLATE)) fail('templates/tool is missing');
  const registry = readFileSync(REGISTRY, 'utf8');
  if (!registry.includes(MARKER))
    fail('packages/registry/src/tools.ts is missing the new-tool marker');
  if (registry.includes(`slug: '${slug}'`)) fail(`registry already has an entry for "${slug}"`);

  const port = String(freePort());
  const schema = slug.replace(/-/g, '_');
  const vars = { SLUG: slug, NAME: name, PORT: port, SCHEMA: schema };
  const migration = join(MIGRATIONS, `${timestamp()}_${schema}_init.sql`);

  if (dryRun) {
    console.warn(
      `[dry run] would create apps/${slug} (port ${port}, schema ${schema}), a registry entry and ${migration}`,
    );
    return;
  }

  mkdirSync(APPS, { recursive: true });
  cpSync(TEMPLATE, dest, { recursive: true });
  for (const file of walk(dest)) {
    const text = readFileSync(file, 'utf8');
    const filled = fill(text, vars);
    if (filled !== text) writeFileSync(file, filled);
    const renamed = fill(file, vars);
    if (renamed !== file) renameSync(file, renamed);
  }
  writeFileSync(REGISTRY, registry.replace(MARKER, `${registryEntry(slug, name)}${MARKER}`));
  mkdirSync(MIGRATIONS, { recursive: true });
  writeFileSync(migration, migrationSql(schema, slug));

  console.warn(`
Created apps/${slug} (${name}) on port ${port}, schema "${schema}".
  - registry entry added with status "building" (packages/registry/src/tools.ts)
  - migration created: ${migration.replace(`${root}/`, '')}

Next, in code:
  1. pnpm install
  2. Replace the SCOPE LINE at the top of apps/${slug}/README.md and in apps/${slug}/tool.config.ts
  3. Fill in the registry pitch and trade tags
  4. pnpm turbo run typecheck lint test build --filter=@speedy/${slug}... && pnpm test:e2e --filter=@speedy/${slug}

Left for a person:
  [ ] ClickUp: link the ticket in apps/${slug}/README.md
  [ ] Railway: new service in project "speedy-saas", root = repo, config = apps/${slug}/railway.json
  [ ] Railway: env vars from apps/${slug}/.env.example (+ PORT, NODE_ENV=production)
  [ ] Cloudflare: CNAME ${slug}.naplesaiagency.com -> the Railway domain (DNS only), then add the
      domain to the service and to Supabase's redirect URLs
  [ ] Supabase: add "${schema}" to the exposed API schemas once it has tables
`);
}

main();
