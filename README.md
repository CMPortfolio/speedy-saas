# Speedy SaaS

One monorepo for every Speedy SaaS tool: small, tightly scoped tools for Southwest Florida
Main Street businesses, shipped about once a week. Each tool solves one moment for an owner and
gives value in under 3 minutes on a phone.

The playbook lives in the Operational Hub (Speedy SaaS tab). Tickets live in ClickUp under
Naples AI › Dev Tickets, tagged `speedy-saas`. The rules this repo follows are in [CLAUDE.md](./CLAUDE.md).

## Layout

| Path                | What lives there                                                       |
| ------------------- | ---------------------------------------------------------------------- |
| `apps/<slug>/`      | One Next.js app per tool, house `src/` layout inside                   |
| `packages/config`   | tsconfig base, eslint config, prettier config, Tailwind preset         |
| `packages/lib`      | logger, `createEnv()`, `Result<T>`, fetch with timeout, Resend, phones |
| `packages/db`       | `supabase/` migrations, generated types, core-table queries            |
| `packages/auth`     | Supabase SSR clients, middleware, sign-in, `requireUser()`             |
| `packages/ui`       | shared components, `cn()`, layout shell, `NaplesFooter`                |
| `packages/registry` | the list of every Naples AI tool and the website                       |
| `packages/sms`      | provider-agnostic SMS: send, receive, signature check, STOP and HELP   |
| `templates/tool`    | scaffold copied by `pnpm new-tool <slug>`                              |

## Commands

```bash
pnpm install
pnpm dev --filter <slug>
pnpm new-tool <slug>
pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build
pnpm db:types
```

Add `--filter <slug>...` to any check to run it for one tool and the packages it depends on.

## Tools

| Tool          | Scope                                                                                  | Status   |
| ------------- | -------------------------------------------------------------------------------------- | -------- |
| `job-photos`  | Before and after photos on a job, sent to the customer as one side-by-side link        | building |
| `missed-call` | A missed call gets a text back in seconds; the owner sees the reply in one list        | building |
| `rain-day`    | Weather wipes out a day; every affected customer gets one personal text about the move | building |

## Hosting

Railway, one service per app, each on `<tool>.naplesaiagency.com`. One shared Supabase project
for every tool with one sign-in across tools. Email through Resend. DNS on Cloudflare.

Feature branches go to `develop`, then `staging`, then `main`; production deploys from `main`.
Launch setup (Railway, Supabase, domains, SMS) is in [docs/launch-setup.md](docs/launch-setup.md).
