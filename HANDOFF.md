# Speedy SaaS handoff (Nov 25, 2026)

Handoff notes for the engineer finishing this in the terminal. Lives only on the integration branch `claude/fervent-meitner-bjt4ze`; do not merge it to `main`.

## Where things stand

Repo: CMPortfolio/speedy-saas. `main` holds only an initial README commit. Everything else is on
stacked `CU-<ticket>` branches with one draft PR each. Merge order is top to bottom; GitHub
retargets each PR to `main` as its base merges. Nothing has been merged. ClickUp was never set to
`complete` (that is yours after merge).

| Ticket                                          | Branch                                                    | PR                | State                                   |
| ----------------------------------------------- | --------------------------------------------------------- | ----------------- | --------------------------------------- |
| F1 repo baseline                                | `CU-1dfc7p9xnhg-speedy-saas-f1-repo-baseline-pnpm-turbor` | #1 (base main)    | done                                    |
| F2 config + lib                                 | `CU-1dfc7p9xnhh-speedy-saas-f2-packages-config-and-packa` | #2                | done                                    |
| F3 db + auth                                    | `CU-1dfc7p9xnhj-speedy-saas-f3-shared-supabase-core-sche` | #4                | done                                    |
| F4 ui + registry                                | `CU-1dfc7p9xnhk-speedy-saas-f4-packages-ui-shell-naplesf` | #3 (base F2)      | done                                    |
| F5 template + new-tool (+ local Supabase stack) | `CU-1dfc7p9xnhm-speedy-saas-f5-tool-template-and-pnpm-ne` | #5 (merges F3+F4) | done                                    |
| P1 job-photos scaffold                          | `CU-1dfc7p9xnhn-job-photos-p1-scaffold-the-job-photos-ap` | #7                | done                                    |
| P2 capture + upload                             | `CU-1dfc7p9xnhp-job-photos-p2-capture-and-upload-without` | #10               | done                                    |
| P3 share page + OG                              | `CU-1dfc7p9xnhq-job-photos-p3-public-share-page-open-gra` | #12               | done                                    |
| P4 sign in + claim                              | `CU-1dfc7p9xnhr-job-photos-p4-sign-in-to-save-past-jobs`  | #13               | done                                    |
| P5 landing + e2e                                | `CU-1dfc7p9xnht-job-photos-p5-landing-page-and-end-to-en` | none              | **todo** (local branch only, see below) |
| P6 deploy config                                | `CU-1dfc7p9xnhu-job-photos-p6-deploy-config-and-launch-c` | none              | **todo**                                |
| M1 missed-call scaffold                         | `CU-1dfc7p9xnhv-missed-call-m1-scaffold-the-missed-call`  | #6                | done                                    |
| M2 packages/sms                                 | `CU-1dfc7p9xnhw-missed-call-m2-packages-sms-send-receive` | #9                | done                                    |
| M3 webhook, auto-text, cooldown                 | `CU-1dfc7p9xnhx-missed-call-m3-missed-call-webhook-auto`  | none              | **todo** (local branch only)            |
| M4 replies, forward, list                       | `CU-1dfc7p9xnhy-missed-call-m4-reply-capture-forward-to`  | none              | **todo**                                |
| M5 setup, landing, e2e                          | `CU-1dfc7p9xnhz-missed-call-m5-setup-flow-landing-page-a` | none              | **todo**                                |
| M6 deploy config                                | `CU-1dfc7p9xnj0-missed-call-m6-deploy-config-and-launch`  | none              | **todo**                                |
| R1 rain-day scaffold                            | `CU-1dfc7p9xnj1-rain-day-r1-scaffold-the-rain-day-app`    | #8                | done                                    |
| R2 settings + customers                         | `CU-1dfc7p9xnj2-rain-day-r2-owner-settings-and-customer`  | #11               | done                                    |
| R3 send flow via sms                            | `CU-1dfc7p9xnj3-rain-day-r3-rain-day-send-flow-through-p` | none              | **todo** (local branch only)            |
| R4 replies, opt-out, history                    | `CU-1dfc7p9xnj4-rain-day-r4-replies-forwarding-opt-out-a` | none              | **todo**                                |
| R5 landing + e2e                                | `CU-1dfc7p9xnj5-rain-day-r5-landing-page-and-end-to-end`  | none              | **todo**                                |
| R6 deploy config                                | `CU-1dfc7p9xnj6-rain-day-r6-deploy-config-and-launch-che` | none              | **todo**                                |

Three phase-2 branches exist locally in agent worktrees (nothing pushed, nothing uncommitted):

- `.claude/worktrees/agent-ac54e87e251fc8e41` on P5 = P4 + merge of F5
- `.claude/worktrees/agent-a86b669f95a976599` on M3 = M2 + merge of F5
- `.claude/worktrees/agent-a405fe9af0ead94d4` on R3 = R2 + merge of F5 + merge of M2 (brings `packages/sms`)

They were stopped before any feature work. Reuse them (`git -C <worktree> log --oneline -3`) or
recreate the same merges from the remote branches. Ignore the other worktrees.

Integration branch `claude/fervent-meitner-bjt4ze` currently equals the F5 branch. Railway is
not connected to any branch yet.

## What the finished pieces give you

- `pnpm new-tool <slug>` scaffolds a tool; the three tools were made with it.
- `@speedy/lib`: logger, `createEnv`, `Result`, fetch with timeout, Resend guard, phones, ids,
  `photos` (resize + storage adapter: Supabase Storage or in-memory), `device-claims`.
- `@speedy/db`: core migration (profiles, organizations, memberships, tool_usage, feedback),
  hand-written `database.types.ts` (regenerate with `pnpm db:types` once a real project exists),
  `@speedy/db/testing` harness (RLS tests as a given user), local stack (below).
- `@speedy/auth`: SSR/browser/service clients, `updateSession` (used from `src/proxy.ts`, the Next
  16 name for middleware), `requireUser`, magic-link `SignInForm`, `/auth/callback`.
- `@speedy/ui`: cn, Button, Input, Modal, EmptyState, AppShell, NaplesFooter, MoreFromNaplesAI,
  CustomerList, CsvImport (+ pure `csv` parser). `@speedy/registry`: TOOLS + `selectMoreTools`.
- `@speedy/sms` (on the M2 branch): provider interface, Twilio adapter (assumed provider, Chris
  has not picked), fake provider, webhook helper (403 on bad signature), STOP/START/HELP, opt-out
  aware `sendFirstOrFollowup`, `createSmsProvider` (refuses `fake` in production). 69 tests.
- Tool dev ports: job-photos 3001, missed-call 3001 (change to 3002 in M3), rain-day 3003.

## Local Supabase

The Supabase CLI images cannot be pulled through this environment's network (ECR CDN blocked),
so `packages/db/local/docker-compose.yml` runs Postgres + GoTrue + PostgREST + Storage API +
nginx from Docker Hub on the same ports and demo keys as `supabase start`:

```bash
pnpm --filter @speedy/db db:local:up        # http://127.0.0.1:54321, Postgres 54322, applies migrations
pnpm --filter @speedy/db db:local:down
# a second copy on other ports:
COMPOSE_PROJECT_NAME=speedy-supabase-x SUPABASE_API_PORT=54341 SUPABASE_DB_PORT=54342 pnpm --filter @speedy/db db:local:up
docker kill -s SIGUSR1 <project>-rest-1     # reload PostgREST schema cache after a migration
```

Magic links are not emailed locally: call `POST {url}/auth/v1/admin/generate_link` with the
service key and open `/auth/callback?token_hash=<hashed_token>&type=magiclink&next=/...`.
Two stacks from the stopped agents may still be running in this container
(`speedy-supabase-jp` on 54341/54342, `speedy-supabase-rd` on 54361/54362): `docker compose -p <name> -f packages/db/local/docker-compose.yml down -v`.

Checks: `pnpm turbo run typecheck lint test build --filter=@speedy/<slug>... --continue` with
`DB_TESTS=1 DATABASE_URL=...` for RLS tests and the Supabase env exported for the build. E2E:
`CI=1 pnpm --filter @speedy/<slug> test:e2e` (Chromium with the iPhone 13 descriptor; never run
`playwright install` here). CI (`.github/workflows/ci.yml`) runs affected checks with a Postgres
service plus a job that scaffolds a throwaway tool and runs its smoke test.

## Infrastructure created this session

- Railway project `speedy-saas` (id `26cb37f8-e9e1-4a3d-8681-180d53e2bb3a`, env `production`
  `f434fe0b-8d8b-4cf2-b7ba-08a472cd6920`). Three services, no source attached yet:
  - job-photos `fcb02b46-9bc9-4c5b-ab04-47bf77363ad6` → https://job-photos-production.up.railway.app
  - missed-call `09d98d93-0539-4080-a88a-279fba3f35c8` → https://missed-call-production-d1ed3cc4.up.railway.app
  - rain-day `88775d46-e2fc-4cc7-bd5c-d5d5fb478727` → https://rain-day-production.up.railway.app
  - Each has Railpack builder, build `pnpm turbo build --filter=@speedy/<slug>`, start
    `pnpm --filter @speedy/<slug> start`, watch paths, healthcheck `/`, and variables
    `NODE_ENV`, `LOG_LEVEL`, `APP_URL`, `NEXT_TELEMETRY_DISABLED`, `STORAGE_DRIVER` (job-photos)
    and **placeholder** `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` /
    `SUPABASE_SERVICE_ROLE_KEY` ("replace-me"). Replace them before anything is shown to an owner.
- Supabase: **no hosted project**. Creating one via the Supabase MCP was blocked by the
  session's permission classifier. Create `speedy-saas` (org Naples AI, us-east-1), then: expose
  `job_photos, missed_call, rain_day` in API settings, `supabase link` + `supabase db push` from
  `packages/db`, set Resend as SMTP, add each tool's `/auth/callback` to redirect URLs, run
  `pnpm --filter @speedy/db db:types:remote`, and put the real values in Railway.

## Remaining todos, in order

1. Finish P5, P6 (job-photos), M3–M6 (missed-call), R3–R6 (rain-day) as stacked branches +
   draft PRs. Full specs are the ticket descriptions in ClickUp; the per-ticket checklists used
   for the agents are summarised in this session's transcript. Key decisions already taken:
   dev routes `/api/dev/sms/*` only when `SMS_PROVIDER=fake` and not production; job-photos
   cleanup as `pnpm --filter @speedy/job-photos cleanup` (Railway cron `0 8 * * *`) plus
   `POST /api/cron/cleanup` behind `CRON_SECRET`; registry stays `building` until Chris says ship.
2. Integrate: merge P6, M6, R6 heads into `claude/fervent-meitner-bjt4ze` (conflicts expected in
   `packages/registry/src/tools.ts`, `packages/db/src/database.types.ts`,
   `packages/db/supabase/config.jsonc`, `pnpm-lock.yaml`), run all checks, then connect each
   Railway service to the repo (`connect-service-source`, branch `claude/fervent-meitner-bjt4ze`
   now, `main` after merges) and watch the first deploys. Consider adding an `e2e` CI job that
   runs `db:local:up` then each app's `test:e2e`.
3. Supabase project (above), real env values in Railway, redeploy.
4. Custom domains: `generate-domain` with `<tool>.naplesaiagency.com` per service, CNAME in
   Cloudflare (DNS only), then set `AUTH_COOKIE_DOMAIN=.naplesaiagency.com` on every service.
5. SMS: pick the provider (Twilio adapter exists), buy a number, start A2P 10DLC registration,
   set `SMS_PROVIDER=twilio`, `TWILIO_*`, `SMS_WEBHOOK_PUBLIC_URL`, paste webhook URLs.
6. ClickUp (budget ~100 calls/day; ~45 used today): comment PR link + two-line summary on each
   remaining ticket, bulk status via `task.update_many` (`status_label: "in progress"`), and
   `complete` only after merge. F1–F5, P1–P4, M1–M2, R1–R2 already have comments and are
   `in progress`. Add a "Related PRs" line to descriptions only if `git_links` stays empty.
7. Review the open questions Chris left on the tool tasks (photo retention 30 days assumed,
   subdomain names, PIN on links: no, provider: Twilio assumed, number per owner: admin-entered).
8. Turn on branch protection on `main`; merge in order F1 → F2 → F3/F4 → F5 → tools.
