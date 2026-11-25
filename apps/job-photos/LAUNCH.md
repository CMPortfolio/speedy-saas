## Launch: Job Photos at job-photos.naplesaiagency.com

Job Photos lets a tech snap before and after photos on a job and send the customer one link that
shows them side by side. This PR adds the Railway config, the daily cleanup of expired anonymous
jobs and this launch checklist. The registry entry stays `building`; flip it to `live` in a
separate change once the steps below are done and you say it is shipping.

### What the engineer does (Claude does none of this)

#### 1. Supabase (the shared project)

1. Apply the two migrations in `packages/db/supabase/migrations/`
   (`20261125004439_job_photos_init.sql`, `20261125010000_job_photos_tables.sql`). The second one
   also creates the private `job-photos` storage bucket.
2. Dashboard > Project Settings > API > Exposed schemas: add `job_photos`.
3. Dashboard > Authentication > URL Configuration: add `https://job-photos.naplesaiagency.com/**`
   to the redirect URLs (sign-in links land on `/auth/callback`).

#### 2. Railway: web service

1. In the `speedy-saas` project, New Service > GitHub repo `CMPortfolio/speedy-saas`. Name it `job-photos`.
2. Settings: root directory = repository root; config path = `apps/job-photos/railway.json`.
   That file carries:
   - Build: `pnpm turbo build --filter=@speedy/job-photos` (after `pnpm install --frozen-lockfile`)
   - Start: `pnpm --filter @speedy/job-photos start`
   - Watch paths: `apps/job-photos/**`, `packages/**` (plus the lockfile and workspace files)
   - Health check: `/`
3. Set the variables below, then deploy.

#### 3. Railway: daily cleanup (cron service)

1. New Service from the same repo, name it `job-photos-cleanup`. Same root directory.
2. Config path = `apps/job-photos/railway.cleanup.json`. It runs
   `pnpm --filter @speedy/job-photos cleanup` on schedule `0 8 * * *` (08:00 UTC daily).
3. Give it only `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and
   `SUPABASE_SERVICE_ROLE_KEY` (use the same values as the web service, via Railway shared variables).
4. The run deletes anonymous jobs whose 30-day expiry has passed, with their photos and logo from
   storage. Signed-in (claimed) jobs are never touched. A run that could not clean a job exits 1,
   so it shows as failed in Railway.
5. Optional manual trigger through the web service:
   `curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://job-photos.naplesaiagency.com/api/cron/cleanup`
   (401 without the right secret, and for everyone if `CRON_SECRET` is unset).

#### 4. Cloudflare DNS

1. In the Railway `job-photos` service > Settings > Networking > Custom Domain, add
   `job-photos.naplesaiagency.com`. Railway shows a CNAME target.
2. In Cloudflare (zone `naplesaiagency.com`) add `CNAME job-photos` pointing at that target.
   Proxy status: DNS only (grey cloud), as for the other tools.
3. Wait for Railway to show the domain as verified and the certificate as issued, then open
   `https://job-photos.naplesaiagency.com`.

### Production environment variables (web service)

| Variable                         | Value                                          | Notes                                               |
| -------------------------------- | ---------------------------------------------- | --------------------------------------------------- |
| `NODE_ENV`                       | `production`                                   |                                                     |
| `APP_URL`                        | `https://job-photos.naplesaiagency.com`        | no trailing slash; used in share links and previews |
| `NEXT_PUBLIC_SUPABASE_URL`       | shared project URL                             | build-time                                          |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`  | shared project anon key                        | build-time                                          |
| `SUPABASE_SERVICE_ROLE_KEY`      | shared project service-role key                | server only; never `NEXT_PUBLIC_`                   |
| `AUTH_COOKIE_DOMAIN`             | `.naplesaiagency.com`                          | one sign-in across tools                            |
| `NEXT_PUBLIC_AUTH_COOKIE_DOMAIN` | `.naplesaiagency.com`                          | build-time; same value as above                     |
| `STORAGE_DRIVER`                 | `supabase`                                     | `memory` is refused in production                   |
| `CRON_SECRET`                    | 32+ random characters (`openssl rand -hex 32`) | guards `/api/cron/cleanup`                          |
| `LOG_LEVEL`                      | `info`                                         | optional                                            |
| `PORT`                           | set by Railway                                 | do not set it yourself                              |

The `job-photos-cleanup` service needs only the three Supabase variables.

### Before you flip the registry to `live`

- [ ] Open the site on a phone, start a job, add a before and an after photo, send the link
- [ ] Open the link in a private tab: both photos show, business name and note show
- [ ] Sign in with the magic link, confirm the job appears under My jobs
- [ ] Trigger the cleanup service once from Railway and check its log reads `cleanup finished` with 0 failures
