# Missed Call Text-Back: launch notes

Everything the engineer does to take this tool live, in order. Nothing here has been run for you:
the code never touches Railway, Supabase, Twilio or DNS.

> **Do not show the tool to owners until the texting registration is approved** (A2P 10DLC, below).
> Until then US carriers filter or block the texts, so a missed call would get no text-back.

## What is already in place

| Thing                | Value                                                           |
| -------------------- | --------------------------------------------------------------- |
| Railway service      | `missed-call` (config path `apps/missed-call/railway.json`)     |
| Domain               | `missed-call.naplesaiagency.com` (attached, DNS done)           |
| Supabase project ref | `rxcuuhzwgwnfbfboujak` (shared by every tool)                   |
| Registry status      | `building`. Flip to `live` only when you decide the tool ships. |

## 1. Supabase (project `rxcuuhzwgwnfbfboujak`)

1. Apply the migrations in `packages/db/supabase/migrations/` in order. The ones for this tool, after
   `20261125000000_core.sql`, are:
   `20261125004322_missed_call_init.sql`, `20261125200000_missed_call_tables.sql`,
   `20261125200050_missed_call_hardening.sql`, `20261125200100_missed_call_replies.sql`,
   `20261125200150_missed_call_reply_cap.sql`, `20261125200200_missed_call_review_fixes.sql`,
   `20261125200300_missed_call_owner_cell_verified.sql`, `20261125200400_missed_call_review_lows.sql`.
2. Settings, API, **Exposed schemas**: add `missed_call` (next to `public`). Without it every call
   from the app returns "schema not found".
3. Authentication, URL configuration: add `https://missed-call.naplesaiagency.com/auth/callback`
   to the redirect URLs. The shared cookie domain is `.naplesaiagency.com`.
4. Regenerate `packages/db/src/database.types.ts` with the Supabase CLI (the file is hand-maintained
   until then) and commit it.

## 2. Railway (service `missed-call`)

- Root directory: the repository root (the build needs the workspace).
- Config path: `apps/missed-call/railway.json`. It sets the builder (Railpack), the build command
  `pnpm turbo build --filter=@speedy/missed-call`, the start command
  `pnpm --filter @speedy/missed-call start`, the watch paths and the `/` health check.
- Watch paths: `apps/missed-call/**`, `packages/**`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`,
  `turbo.json`.
- Set every variable below **before the first build**: the `NEXT_PUBLIC_*` ones are baked into the
  bundle.

### Environment variables

| Variable                        | Required            | Production value / notes                                                                                                                       |
| ------------------------------- | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | yes                 | `https://rxcuuhzwgwnfbfboujak.supabase.co`                                                                                                     |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes                 | the project's anon key                                                                                                                         |
| `SUPABASE_SERVICE_ROLE_KEY`     | yes                 | server only. Webhooks write with it after the signature check. Never `NEXT_PUBLIC_`.                                                           |
| `APP_URL`                       | yes                 | `https://missed-call.naplesaiagency.com` (its default is localhost)                                                                            |
| `SMS_WEBHOOK_PUBLIC_URL`        | **yes**             | `https://missed-call.naplesaiagency.com`. Twilio signs the exact URL; without this the app refuses to answer webhooks (500) rather than guess. |
| `SMS_PROVIDER`                  | yes                 | `twilio`. `fake` is refused in production and on Railway.                                                                                      |
| `TWILIO_ACCOUNT_SID`            | yes                 | `AC...` from the Twilio console                                                                                                                |
| `TWILIO_AUTH_TOKEN`             | yes                 | server only. Sends texts and signs every webhook.                                                                                              |
| `TWILIO_MESSAGING_SERVICE_SID`  | optional            | `MG...`. When set, texts go out through the Messaging Service, which is what A2P registration attaches to.                                     |
| `AUTH_COOKIE_DOMAIN`            | yes                 | `.naplesaiagency.com` (one sign-in across tools)                                                                                               |
| `LOG_LEVEL`                     | optional            | `info` (default)                                                                                                                               |
| `PORT`                          | set by Railway      | do not set                                                                                                                                     |
| `NODE_ENV`                      | set by `next start` | `production`                                                                                                                                   |
| `ALLOW_FAKE_SMS`                | **never**           | local e2e only; it is refused on Railway and for any non-local `APP_URL`                                                                       |

## 3. Twilio

### Number and webhooks

1. Buy a US local number (239 or the owner's area) in the Twilio console. In v1 an admin does this
   per owner; there is no number buying in the app.
2. On the number, all `HTTP POST`:

   | Console field                 | URL                                                         |
   | ----------------------------- | ----------------------------------------------------------- |
   | Voice, A call comes in        | `https://missed-call.naplesaiagency.com/api/voice/incoming` |
   | Voice, Call status changes    | `https://missed-call.naplesaiagency.com/api/voice/incoming` |
   | Messaging, A message comes in | `https://missed-call.naplesaiagency.com/api/sms/inbound`    |

   `/api/sms/status` (delivery receipts) is **not used**: leave the Messaging Service delivery
   status callback empty.

3. Give the number to the owner's line (SQL editor, service role):
   `update missed_call.lines set provider_number = '+1239XXXXXXX' where id = '<line id>';`
   The setup page then shows the owner their forwarding codes.

### Account protection (do before any real traffic)

- **Messaging Geo Permissions: US only.** Console, Messaging, Settings, Geo permissions: enable the
  United States and disable every other country. The app also never texts non-US numbers, but this
  stops a bug or an abuser from running up international charges.
- **Account spend alert.** Console, Billing, set a usage alert and a low spend trigger (for example
  alert at $25 and $50 a month) to an email you read.
- **HELP auto-reply.** Twilio Advanced Opt-Out answers HELP by itself, and so does the app (once a
  day, to numbers that called the line). Turn off one of them so callers do not get two: either
  switch off the HELP auto-reply in the Messaging Service's Advanced Opt-Out settings, or keep it and
  remove the HELP branch in `src/features/missed-calls/handle-reply.ts`. STOP and START are handled
  by Twilio and by the app and are safe to run in both.

### Texting registration: A2P 10DLC (must be approved before owners see the tool)

US carriers require registration for business texts from a local number. From the research notes
(sources at the end):

- **Model:** Naples AI registers as an **ISV Reseller or Partner** (one approved primary customer
  profile). **Each business owner gets their own secondary profile, brand and campaign**, built from
  that owner's business data. Do not use one shared brand.
- **Campaign type:** one **Low-Volume Mixed** campaign per owner brand, covering both missed-call
  text-back and rain-day reschedule notices. Both fit customer-care and account-notification
  messaging. The sample messages and the opt-in description must describe **both** flows: mismatched
  samples are the usual reason for rejection. Split into separate campaigns only if volume grows.
  Low-Volume Mixed is limited to under about 2,000 segments a day on T-Mobile.
- **No EIN:** an owner without an EIN uses the sole proprietor flow (one brand, one campaign, one
  number, about 1,000 segments a day to T-Mobile). A US LLC has an EIN and uses the standard
  low-volume flow.
- **Cost and timing:** Twilio passes carrier fees through at cost (roughly $0.0035 AT&T, $0.0045
  T-Mobile, $0.005 Verizon per segment). Approval takes one or more business days, so plan
  multi-day waits per owner.
- **Gate:** the tool is not shown to an owner until their brand and campaign are approved and the
  number is attached to the Messaging Service.

**Open question for Chris, to settle with Twilio before launch:** the caller never opted in to texts;
they phoned the business and we text them back. Confirm with Twilio how carriers treat a text-back
to a caller who initiated contact by calling, and whether the campaign's opt-in description (caller
initiated contact by phoning the business) is accepted as consent. Until that is answered, assume it
could be rejected and keep the first text to the minimum (business name, one question, STOP line,
which is what the app sends).

Sources: https://www.twilio.com/docs/messaging/compliance/a2p-10dlc,
https://support.twilio.com/hc/en-us/articles/4403014741403,
https://www.twilio.com/docs/messaging/compliance/a2p-10dlc/onboarding-isv-api-sole-prop-new,
https://www.twilio.com/en-us/sms/pricing/us

## 4. Carrier call-forwarding codes (shown on the setup page)

The codes live in one file, `src/config/carrier-codes.ts`, each with a `verified` flag and a source
URL. They are the no-answer ("conditional") forwarding codes: calls the owner does not pick up go to
the missed-call number, calls they answer are untouched.

| Carrier  | Turn on                          | Turn off | Check   | Status                                                                                                                                                            | Source                                                                    |
| -------- | -------------------------------- | -------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Verizon  | `*71` + 10-digit number          | `*73`    | none    | Verified on Verizon's page. Fails while roaming; forwarded calls are billed as answered.                                                                          | https://www.verizon.com/support/how-to-use-call-forwarding                |
| T-Mobile | `**61*1` + 10-digit number + `#` | `##61#`  | `*#61#` | Partly verified: the cancel code is on T-Mobile's page, the turn-on code is the GSM standard. The setup page says "Check with a test call after setting this up." | https://www.t-mobile.com/support/plans-features/self-service-short-codes/ |
| AT&T     | `**61*1` + 10-digit number + `#` | `##61#`  | `*#61#` | Not verified on any AT&T page: GSM standard codes, cited from Wikipedia. The setup page says "Check with a test call after setting this up."                      | https://en.wikipedia.org/wiki/Call_forwarding                             |

Prepaid and MVNO plans are unverified. The setup page tells those owners to turn on Call Forwarding,
When unanswered, in their phone settings, or to call their carrier.

**Before launch:** make a test call on a real AT&T and a real T-Mobile line, then set
`verified: true` (and replace the AT&T source with an AT&T page if one exists) in
`src/config/carrier-codes.ts`. `tests/unit/setup.test.ts` pins the current codes and the "only
Verizon verified" state, so update it with the data file.

## 5. Owner cell confirmation

Reply forwarding is off for a line until the owner confirms their cell on `/setup`: "Send code" texts
a 6-digit code (10 minutes, five tries, three codes an hour) from the line's own number, and the
owner types it back. `missed_call.lines.owner_cell_verified` is set by the server only, after
re-checking that the cell on the line is still the one the code went to; changing the cell puts it
back to unconfirmed. Until then replies are saved and listed but not texted to the owner.

The code is texted from the line's missed-call number, so an owner cannot confirm until an admin has
set `provider_number` (section 3). That text also needs the number's texting registration to be
approved, like every other text.

## Notes

- Times on the setup page and the quiet hours are **Eastern only** for v1.
- **Never set `ALLOW_FAKE_SMS` on any deployed host.** It exists only so a local production build can
  run the end-to-end test with the fake provider; the app refuses it on Railway and for any
  `APP_URL` that is not localhost, but do not rely on that.
- The `/api/dev/sms/sent` route answers 404 unless the fake provider is running, so in production
  it is always a 404.
- Each owner has one line (v1): the database enforces `unique (owner_id)`.

## 6. Smoke test after the first deploy

1. `https://missed-call.naplesaiagency.com/` loads (this is also the Railway health check).
2. Sign in, complete `/setup`, and confirm the forwarding codes appear once you have set a
   provider number. Send and enter the confirmation code to confirm your own cell.
3. Call the Twilio number from a phone you own and let it ring out. You hear the short greeting,
   get the text within seconds, and the call is in `/calls`.
4. Reply to the text. The reply shows in `/calls` as Replied (and is texted to the owner's cell, because the
   cell is confirmed).
5. Mark it Junk, call again, and confirm no second text.
6. Check the Railway logs: no `webhook rejected` or `SMS_WEBHOOK_PUBLIC_URL` errors.

## 7. Rollback

Redeploy the previous Railway deployment. Migrations are additive; do not roll them back on the live
project without checking the data first. To stop all texting at once, remove the Twilio number's
voice and messaging webhook URLs, or unset `TWILIO_AUTH_TOKEN` in Railway.
