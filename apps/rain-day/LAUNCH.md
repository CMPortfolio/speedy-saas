# Rain Day: launch notes

Everything the engineer does to take this tool live, in order. Nothing here has been run for you:
the code never touches Railway, Supabase, Twilio or DNS.

> **Do not show the tool to owners until their texting registration is approved** (A2P 10DLC,
> section 3) and an admin has given them a texting number. Until then US carriers filter or block
> the texts, and the app keeps Send switched off for an owner with no number.

## What is already in place

| Thing                | Value                                                                                                               |
| -------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Railway project      | `26cb37f8-e9e1-4a3d-8681-180d53e2bb3a` ("speedy-saas")                                                              |
| Railway service      | `rain-day`, id `88775d46-e2fc-4cc7-bd5c-d5d5fb478727` (config path `apps/rain-day/railway.json`)                    |
| Custom domain        | `rain-day.naplesaiagency.com`, attached to the service                                                              |
| DNS (Cloudflare)     | `rain-day` CNAME to `v3y4lhtz.up.railway.app` (DNS only, not proxied) and the `_railway-verify.rain-day` TXT record |
| Supabase project ref | `rxcuuhzwgwnfbfboujak` (shared by every tool)                                                                       |
| Registry status      | `building`. Flip to `live` only when you decide the tool ships.                                                     |

Check the domain any time:

```bash
dig +short CNAME rain-day.naplesaiagency.com                 # v3y4lhtz.up.railway.app.
dig +short TXT _railway-verify.rain-day.naplesaiagency.com   # the railway-verify=... value
```

and in Railway, service `rain-day`, Settings, Networking: the custom domain shows as verified with a
certificate issued. HTTPS must work before you give Twilio the webhook URLs.

## 1. Supabase (project `rxcuuhzwgwnfbfboujak`)

1. Apply **every file in `packages/db/supabase/migrations/`, in order**, with `supabase db push`
   (do not pick and choose). The ones for this tool, after `20261125000000_core.sql`, are:
   `20261125005215_rain_day_init.sql`, `20261125010100_rain_day_customers.sql`,
   `20261125300000_rain_day_reschedules.sql`, `20261125300050_rain_day_send_hardening.sql`,
   `20261125300100_rain_day_replies.sql`, `20261125300150_rain_day_help_throttle.sql`,
   `20261125300200_rain_day_per_owner_numbers.sql`, `20261125300250_rain_day_help_per_owner.sql`, `20261125300300_rain_day_messaging_service.sql`.
   `20261125300050` moves opt-outs out of `customers.opted_out` into `rain_day.opt_outs` and drops
   that column; it copies existing opt-outs first.
2. Settings, API, **Exposed schemas**: add `rain_day` (next to `public`). Without it every call from
   the app returns "schema not found".
3. Authentication, URL configuration: add `https://rain-day.naplesaiagency.com/auth/callback` to the
   redirect URLs. The shared cookie domain is `.naplesaiagency.com`.
4. Regenerate `packages/db/src/database.types.ts` with the Supabase CLI (`pnpm db:types:remote`; the
   file is hand-maintained until then) and commit it.

## 2. Railway (service `rain-day`)

- Root directory: the repository root (the build needs the workspace).
- Config path: `apps/rain-day/railway.json`. It sets the builder (Railpack), the build command
  `pnpm turbo build --filter=@speedy/rain-day`, the start command
  `pnpm --filter @speedy/rain-day start`, the watch paths and the `/` health check.
- Watch paths: `apps/rain-day/**`, `packages/**`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`,
  `turbo.json`.
- Set every variable below **before the first build**: the `NEXT_PUBLIC_*` ones are baked into the
  bundle.

### Environment variables

There is no global Messaging Service variable: each owner's service lives in the database (section 3), and a
leftover `TWILIO_MESSAGING_SERVICE_SID` in the environment is ignored.

Every `process.env` read reachable from `apps/rain-day` is in this table (audited across
`apps/rain-day`, `packages/auth`, `packages/lib`, `packages/sms`, `packages/db`, `packages/ui`).

| Variable                         | Required             | Production value / notes                                                                                                                                                                    |
| -------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`       | yes                  | `https://rxcuuhzwgwnfbfboujak.supabase.co`                                                                                                                                                  |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`  | yes                  | the project's anon key                                                                                                                                                                      |
| `SUPABASE_SERVICE_ROLE_KEY`      | yes                  | server only. The send step and the webhooks write with it, after their checks. Never `NEXT_PUBLIC_`.                                                                                        |
| `APP_URL`                        | **yes**              | `https://rain-day.naplesaiagency.com`. In production the app will not start without it: Twilio signs the exact webhook URL and it is taken from here.                                       |
| `SMS_WEBHOOK_PUBLIC_URL`         | recommended          | `https://rain-day.naplesaiagency.com`. Set it explicitly: Twilio signs the exact URL. It falls back to `APP_URL`; with neither set in production the webhooks answer 500 rather than guess. |
| `SMS_PROVIDER`                   | yes                  | `twilio`. `fake` is refused in production and on Railway.                                                                                                                                   |
| `TWILIO_ACCOUNT_SID`             | yes                  | `AC...` from the Twilio console                                                                                                                                                             |
| `TWILIO_AUTH_TOKEN`              | yes                  | server only. Sends texts and signs every webhook.                                                                                                                                           |
| `SMS_FROM_NUMBER`                | **leave unset**      | development default for the fake provider only. Real owners text from `rain_day.owner_settings.sender_number`.                                                                              |
| `AUTH_COOKIE_DOMAIN`             | yes                  | `.naplesaiagency.com` (one sign-in across tools)                                                                                                                                            |
| `NEXT_PUBLIC_AUTH_COOKIE_DOMAIN` | yes                  | `.naplesaiagency.com`, the same value for the browser client. `NEXT_PUBLIC_*` is baked in at build time, so set it in Railway **before the build runs**.                                    |
| `LOG_LEVEL`                      | optional             | `info` (default in production)                                                                                                                                                              |
| `RAILWAY_ENVIRONMENT`            | set by Railway       | do not set. Its presence makes the app refuse the fake SMS provider.                                                                                                                        |
| `PORT`                           | set by Railway       | do not set                                                                                                                                                                                  |
| `NODE_ENV`                       | set by `next start`  | `production`                                                                                                                                                                                |
| `NEXT_PHASE`                     | set by Next          | do not set. It lets `next build` run before `APP_URL` is needed.                                                                                                                            |
| `SKIP_ENV_VALIDATION`, `CI`      | **never** on Railway | build and test switches only: `SKIP_ENV_VALIDATION=1` skips env checks in a CI build, `CI=1` makes the e2e fail instead of skip.                                                            |
| `ALLOW_FAKE_SMS`                 | **never**            | local e2e only (`playwright.config.ts` sets it for its own server). It is refused on Railway, but never set it on a deployed host.                                                          |

## 3. Twilio

### Webhooks (all `HTTP POST`)

| Where                                              | URL                                                   |
| -------------------------------------------------- | ----------------------------------------------------- |
| Each owner's number, Messaging: A message comes in | `https://rain-day.naplesaiagency.com/api/sms/inbound` |
| Delivery status (statusCallback)                   | `https://rain-day.naplesaiagency.com/api/sms/status`  |

Delivery receipts arrive on `/api/sms/status`. The app passes it as the `statusCallback` on every
message, so nothing to paste for it. If you also set a delivery status callback on a Messaging
Service, give it the same URL. Rain Day does not use voice: leave the voice webhooks alone.

One Twilio account serves every owner (no subaccounts), so there is **one `TWILIO_AUTH_TOKEN`** and
it verifies every webhook. If owners are ever moved into Twilio subaccounts, each subaccount has its
own auth token and the app would have to verify webhooks per account; that is not built.

### One texting number and one Messaging Service per owner

Every owner texts from **their own number**, and customer replies come back to that number. The app
finds the owner by the number that was texted, so two owners can never share one
(`rain_day.owner_settings.sender_number` is unique) and a reply is only ever filed under the owner
who was texted.

Per owner, an admin follows the runbook below. **This is a deviation from the original plan** (one
texting number for the whole tool): it needs the engineer's sign-off, because it costs a number and
a Messaging Service per owner and each owner needs their own approved A2P brand and campaign.

#### Runbook: assign an owner's texting number

1. **Registration.** Get the owner's brand and campaign approved (A2P, below). Do not go further
   until the campaign is approved.
2. **Buy the number** (paid; the engineer does it). In the Twilio console buy a US local number for
   the owner (239 or their area). The app never buys numbers.
3. **Create the owner's Messaging Service.** One per owner, named for the business. Add the number
   to its sender pool and attach the owner's approved campaign to the service. "A Messaging Service
   can only be linked with one Campaign at a time", and approving the campaign registers the numbers
   in that service's pool
   (https://www.twilio.com/docs/messaging/compliance/a2p-10dlc/direct-standard-onboarding). The
   association is asynchronous: **add the number to the service's sender pool, then poll the campaign
   until it shows as VERIFIED** before you enter the values in step 5.
4. **Point the number at the app.** Messaging, "A message comes in", `HTTP POST`:
   `https://rain-day.naplesaiagency.com/api/sms/inbound`.
5. **Give the number and the service to the owner, together** (SQL editor, service role; owners
   cannot write these columns):

   ```sql
   insert into rain_day.owner_settings (owner_id, sender_number, sender_messaging_service_sid)
   values ('<owner user id>', '+1239XXXXXXX', 'MGxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx')
   on conflict (owner_id) do update
     set sender_number = excluded.sender_number,
         sender_messaging_service_sid = excluded.sender_messaging_service_sid;
   ```

   The SID is the 34-character `MG...` of **that owner's** service. It must be unique (one service per
   owner), and so must the number.

6. **Check Send enables.** Sign in as the owner (or look at their page): Settings shows "Customers get
   your texts from (239) ...", and the Rain day page no longer says "Your texting number isn't set up
   yet", so Send is available. The owner's cell confirmation code is texted from this number.

Until the row has both a number and a Messaging Service, the owner's Rain day page shows "Your texting number isn't set up yet.
We'll let you know when it's ready." and Send is off.

**How a text is sent.** Every text goes out with **both** the owner's `From` number and the owner's
`MessagingServiceSid`: that pins the sender and keeps the service's features (Advanced Opt-Out, logs,
Insights) (https://www.twilio.com/docs/messaging/services,
https://www.twilio.com/docs/messaging/services/services-send-messages). Sending with `From` alone is
undocumented for registered traffic, so the app does not do it. This covers every send: reschedule
texts, forwards to the owner's cell, HELP answers and the cell confirmation code.

With the real provider, an owner whose row lacks **either** value is not ready for any of those: Send
is off, and a forward, HELP answer or confirmation code is refused, logged as a warning
`owner has no messaging service`, and counted as failed (a forward shows as failed on the Replies
list). The fake provider needs only the number. What Twilio does when `From` is not in the service's
sender pool is not documented, so make a test send to your own phone for each owner before launch.

### Account protection (do before any real traffic)

- **Messaging Geo Permissions: US only.** Console, Messaging, Settings, Geo permissions: enable the
  United States and disable every other country. The app also only texts US area codes (customers
  with Canadian or Caribbean numbers are rejected on add and import and skipped at send), but this
  stops a bug or an abuser from running up international charges.
- **Account spend alert.** Console, Billing: set a usage alert and a low spend trigger (for example
  alert at $25 and $50 a month) to an email you read.
- **HELP auto-reply.** Twilio Advanced Opt-Out answers HELP by itself, and so does the app (once a
  day per owner's number, only to a number on that owner's customer list). Turn off one of them so people do not get
  two: either switch off the HELP auto-reply in the Messaging Service's Advanced Opt-Out settings, or
  keep it and remove the HELP branch in `src/features/replies/handle-inbound.ts`. STOP and START are
  handled by Twilio and by the app and are safe to run in both.

### Texting registration: A2P 10DLC (must be approved before owners see the tool)

US carriers require registration for business texts from a local number. What Twilio requires, with
the pages it comes from:

- **Do the reschedule texts fit the same registration as missed-call?** Yes, if the campaign is
  built for both. Rain-day reschedule notices ("we're moving your service to Wednesday") and
  missed-call text-backs are both customer-care and account-notification style messages, so **one
  Low-Volume Mixed campaign per owner brand can cover both tools**, provided the **sample messages
  and the opt-in description describe both flows**. Mismatched samples are the usual reason for
  rejection. Include at least one reschedule sample, such as
  `Hi Maria, the weather is wiping out our day, so we're moving your service to Wednesday. Green Gulf Lawn. Reply STOP to opt out.`,
  and one missed-call sample. Split into separate campaigns only if volume grows. Low-Volume Mixed
  is limited to under about 2,000 segments a day on T-Mobile
  (https://www.twilio.com/docs/messaging/compliance/a2p-10dlc,
  https://support.twilio.com/hc/en-us/articles/4403014741403).
- **Model:** Naples AI registers as an **ISV Reseller or Partner** (one approved primary customer
  profile; see https://www.twilio.com/docs/messaging/compliance/a2p-10dlc/onboarding-isv-api-sole-prop-new).
  **Each business owner gets their own secondary profile, brand and campaign**, built from that
  owner's business data. Do not use one shared brand.
- **Opt-in:** customers give their number to the business, which is the opt-in for service
  notices. Describe that in the campaign: the owner collects the customer's cell for service
  scheduling and texts them only about their service day. Every customer's first text carries the
  business name and "Reply STOP to opt out", which is what the app sends.
- **No EIN:** an owner without an EIN uses the sole proprietor flow (one brand, one campaign, one
  number, about 1,000 segments a day to T-Mobile). A US LLC has an EIN and uses the standard
  low-volume flow (same ISV page as above).
- **Cost and timing:** Twilio passes carrier fees through at cost (roughly $0.0035 AT&T, $0.0045
  T-Mobile, $0.005 Verizon per segment; https://www.twilio.com/en-us/sms/pricing/us). Approval takes
  one or more business days, so plan multi-day waits per owner.
- **Gate:** the tool is not shown to an owner until their brand and campaign are approved and their
  number is in their Messaging Service.

## 4. What owners and the engineer should know

- **STOP applies to the owner whose number was texted.** Each owner has their own number, and a
  carrier STOP is to one sender number, so a customer's STOP to Owner A's number blocks A's texts to
  them only. Owner B's texts to the same person are not skipped, and B never sees A's opt-out
  (`rain_day.opt_outs` is read per owner). START to a number clears only that owner's entry. The
  opt-out is stored by number, so deleting and re-importing the customer does not clear it, and it is
  recorded even when the person is not on the owner's list yet. There is no cross-owner signal, so
  the privacy policy needs no sentence about one business affecting another.
- **Replies from a deleted customer do not match.** If an owner deletes a customer, that person's
  later replies are not filed or forwarded, because the customer is the link to the original text.
  Their opt-outs survive deletion and re-import.
- **Daily caps need your OK before launch:** the database stops an owner at **3 rain days and 1,000
  texts per New York day**, and the owner is told plainly when they hit it. These numbers are a
  toll-fraud and mistake guard; change them in `create_reschedule` if you want different ones.
- **Forwarding replies to the owner's cell:** off until the owner confirms their cell with a 6-digit
  code (10 minutes, five tries, three codes an hour and six a day). Forwards are capped at 30 an hour
  per owner; replies over the cap are kept in the Replies list. Forwards go to US cells only.
- **Texts go out from the owner's own number.** The confirmation code also needs the owner's number,
  so an owner cannot confirm their cell until an admin has set `sender_number`.
- **Never set `ALLOW_FAKE_SMS` on any deployed host.** It exists so a local production build can run
  the end-to-end test; the app refuses the fake provider on Railway, but do not rely on that.
- The `/api/dev/sms/*` routes answer 404 unless the fake provider is running outside production, and
  they need a signed-in user, so in production they are always a 404.

## 5. Smoke test after the first deploy

1. `https://rain-day.naplesaiagency.com/` loads (this is also the Railway health check) and shows the
   landing page and the Naples AI footer.
2. Sign in, open Settings, save the business name and cell. Confirm the page says your texting number
   isn't set up yet, then set the number and Messaging Service for your own user (section 3, step 5).
3. Import a few customers whose usual day is today's weekday (include your own cell), open Rain day,
   and send. Your phone gets its own text and the results page moves from Sent to Delivered.
4. Reply to the text. The reply shows under Replies; after you confirm your cell it is also texted to
   you with the customer's name.
5. Text STOP, run another rain day, and confirm that customer is shown as skipped and no text goes.
6. Check the Railway logs: no `webhook rejected` or `public URL not configured` errors.

## 6. Rollback

Redeploy the previous Railway deployment. Migrations are additive apart from `20261125300050`, which
drops `customers.opted_out`; do not roll migrations back on the live project without checking the
data first. To stop all texting at once, remove the Twilio numbers' messaging webhook URLs, or unset
`TWILIO_AUTH_TOKEN` in Railway.
