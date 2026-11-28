# Launch setup (what is not in code)

State as of 2026-11-25. Placeholders are marked; nothing here is a secret.

Branch flow: feature branches go to `develop`, then `staging`, then `main`. Production deploys
from `main`.

## Railway

Project `speedy-saas` (id `26cb37f8-e9e1-4a3d-8681-180d53e2bb3a`), environment `production`
(`f434fe0b-8d8b-4cf2-b7ba-08a472cd6920`). One service per tool, Railpack builder, build
`pnpm turbo build --filter=@speedy/<slug>`, start `pnpm --filter @speedy/<slug> start`, healthcheck `/`.

| Tool        | Service id                             | URL                                                    |
| ----------- | -------------------------------------- | ------------------------------------------------------ |
| job-photos  | `fcb02b46-9bc9-4c5b-ab04-47bf77363ad6` | https://job-photos-production.up.railway.app           |
| missed-call | `09d98d93-0539-4080-a88a-279fba3f35c8` | https://missed-call-production-d1ed3cc4.up.railway.app |
| rain-day    | `88775d46-e2fc-4cc7-bd5c-d5d5fb478727` | https://rain-day-production.up.railway.app             |

The four services (job-photos, missed-call, rain-day, job-photos-cleanup) are connected to
CMPortfolio/speedy-saas and deploy from `main`.

Variables set on the web services (names only; values live in Railway):
`APP_URL`, `AUTH_COOKIE_DOMAIN`, `CRON_SECRET`, `LOG_LEVEL`, `NEXT_PUBLIC_AUTH_COOKIE_DOMAIN`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_TELEMETRY_DISABLED`, `NODE_ENV`,
`STORAGE_DRIVER`, `SUPABASE_SERVICE_ROLE_KEY`.

The Supabase values were `replace-me` placeholders. Replace them before anything is shown to an
owner.

## Supabase (no hosted project yet)

Create `speedy-saas` (org Naples AI, us-east-1), then: expose `job_photos, missed_call, rain_day`
in API settings; `supabase link` and `supabase db push` from `packages/db`; set Resend as SMTP; add
each tool's `/auth/callback` to the redirect URLs; run `pnpm --filter @speedy/db db:types:remote` (needs `SUPABASE_PROJECT_ID`);
put the real values in Railway and redeploy.

## Domains, SMS, jobs

- Domains: `<tool>.naplesaiagency.com` per service, CNAME in Cloudflare (DNS only), then set
  `AUTH_COOKIE_DOMAIN=.naplesaiagency.com` on every service.
- SMS: provider not chosen (the Twilio adapter is the assumed one). Buy a number, start A2P 10DLC
  registration, set `SMS_PROVIDER=twilio`, `TWILIO_*`, `SMS_WEBHOOK_PUBLIC_URL`, paste webhook URLs.
  `fake` is refused on any Railway service, and in production builds except a local e2e run with
  `ALLOW_FAKE_SMS=1`.
- job-photos cleanup: `pnpm --filter @speedy/job-photos cleanup` as a Railway cron (`0 8 * * *`),
  or `POST /api/cron/cleanup` behind `CRON_SECRET`.
- Local magic links are not emailed: `POST {url}/auth/v1/admin/generate_link` with the service key,
  then open `/auth/callback?token_hash=<hashed_token>&type=magiclink&next=/...`.

## Open questions

Photo retention (30 days assumed), subdomain names, PIN on links (no), SMS provider (Twilio
assumed), number per owner (admin-entered). The registry keeps tools at `building` until shipped.
