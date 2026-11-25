# @speedy/sms

Send and receive texts, verify webhook signatures, and handle STOP / START / HELP, behind one
provider-agnostic interface. Twilio is the first adapter (the usual choice; still an assumption
until Chris picks a provider). A Telnyx or Plivo adapter would be one more file next to
`src/twilio.ts`; no tool would change.

## Exports

| Import                 | What it is                                                                                                         |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `@speedy/sms/provider` | `SmsProvider` interface and the event types (`InboundMessage`, `CallStatusEvent`, `DeliveryEvent`)                 |
| `@speedy/sms/twilio`   | `twilioProvider(options)`, `verifyTwilioSignature`, `parseTwilioWebhook`, `twimlHangup()`, `twimlSay()`            |
| `@speedy/sms/fake`     | `fakeProvider()`: in-memory provider with `sent[]`, `inbound(event)`, `failNext()`, `reset()`                      |
| `@speedy/sms/webhook`  | `handleNextWebhook(provider, request, handlers)` (a whole route), `handleWebhook`, `fromNextRequest`, `toResponse` |
| `@speedy/sms/keywords` | `classifyKeyword(body)`, `helpReply(business)`, `withOptOutFooter(body, business)`                                 |
| `@speedy/sms/send`     | `OptOutStore` interface, `sendFirstOrFollowup(provider, store, input)`, `applyOptOutKeyword`                       |
| `@speedy/sms/env`      | `smsEnvSchema` to spread into a tool's `createEnv`                                                                 |
| `@speedy/sms/create`   | `createSmsProvider(env)`: picks fake or Twilio from env, refuses fake in production                                |

No barrel file; import each path (CLAUDE.md rule 4).

## Env

Add to the tool's `.env.example` and `src/config/env.ts` (`...smsEnvSchema.server`):

| Variable                 | Required           | Meaning                                                                     |
| ------------------------ | ------------------ | --------------------------------------------------------------------------- |
| `SMS_PROVIDER`           | no, default `fake` | `twilio` or `fake`. `fake` is refused in production by `createSmsProvider`. |
| `TWILIO_ACCOUNT_SID`     | with `twilio`      | `AC…` from the Twilio console                                               |
| `TWILIO_AUTH_TOKEN`      | with `twilio`      | Signs webhooks and authenticates sends. Server only, never logged.          |
| `SMS_WEBHOOK_PUBLIC_URL` | optional           | Public origin for signature checks when it differs from `APP_URL`.          |

## Wiring a tool

One provider instance per app, created at boot:

```ts
// apps/<slug>/src/config/sms.ts
import { createSmsProvider } from '@speedy/sms/create';

import { env } from './env';

export const sms = createSmsProvider(env, {
  statusCallbackUrl: `${env.APP_URL}/api/sms/status`,
});
```

Three route handlers, each one line around `handleWebhook`. It answers 403 to anything the
provider did not sign, 400 to bodies it cannot parse, 204 when the handler returns nothing, and
200 with `text/xml` when the handler returns TwiML.

```ts
// apps/<slug>/src/app/api/sms/inbound/route.ts   — texts people send to the business number
import { classifyKeyword, helpReply } from '@speedy/sms/keywords';
import { applyOptOutKeyword } from '@speedy/sms/send';
import { fromNextRequest, handleWebhook, toResponse } from '@speedy/sms/webhook';

import { sms } from '@/config/sms';
import { optOuts, saveReply } from '@/features/replies/store';

export async function POST(request: Request) {
  return toResponse(
    await handleWebhook(sms, await fromNextRequest(request), {
      async onInbound(message) {
        const keyword = classifyKeyword(message.body);
        if (await applyOptOutKeyword(optOuts, message.from, keyword)) return; // carrier confirms STOP/START
        if (keyword === 'help') {
          await sms.sendText({
            to: message.from,
            from: message.to,
            body: helpReply('Gulf Coast Plumbing'),
          });
          return;
        }
        await saveReply(message);
      },
    }),
  );
}
```

```ts
// apps/<slug>/src/app/api/sms/status/route.ts    — delivery receipts for texts we sent
export async function POST(request: Request) {
  return toResponse(
    await handleWebhook(sms, await fromNextRequest(request), {
      onDelivery: (event) => markDelivery(event.providerMessageId, event.status),
    }),
  );
}
```

```ts
// apps/<slug>/src/app/api/voice/incoming/route.ts — the call itself; answer with TwiML
import { twimlSay } from '@speedy/sms/twilio';

export async function POST(request: Request) {
  return toResponse(
    await handleWebhook(sms, await fromNextRequest(request), {
      onCallStatus: async (call) => {
        if (call.status === 'no-answer' || call.status === 'busy')
          await textBack(call.from, call.to);
        return twimlSay("Sorry we missed you. We're texting you right now.");
      },
    }),
  );
}
```

Sending the compliant way, with the tool's own opt-out table behind `OptOutStore`:

```ts
const result = await sendFirstOrFollowup(sms, optOuts, {
  to: caller,
  from: businessNumber,
  body: 'Sorry we missed your call. What do you need?',
  businessName: 'Gulf Coast Plumbing',
  isFirstContact: true, // adds "Gulf Coast Plumbing. Reply STOP to opt out."
});
if (!result.ok && result.error.code === 'opted_out') {
  /* they asked us not to text; show the owner the missed call only */
}
```

### Production guards

- `fakeProvider()` and `createSmsProvider` refuse the fake provider when `NODE_ENV=production`
  (unless `ALLOW_FAKE_SMS=1`, for a local e2e run) and always on Railway (`RAILWAY_ENVIRONMENT`).
- In production the signing URL comes only from `SMS_WEBHOOK_PUBLIC_URL` or `APP_URL`. With
  neither set, `handleNextWebhook` answers 500 and logs; it never trusts `X-Forwarded-Host`.

### Behind Railway's proxy

Twilio signs the public URL it posted to. Inside the container `request.url` is the internal
address, so `fromNextRequest` rewrites the origin to `SMS_WEBHOOK_PUBLIC_URL`, then `APP_URL`, then
the `X-Forwarded-Proto`/`X-Forwarded-Host` headers outside production only. Set `APP_URL` (every tool already has it) and
the signature check works; set `SMS_WEBHOOK_PUBLIC_URL` only when the webhook host differs.

## URLs to paste into the provider console (Twilio)

For the business phone number (Phone Numbers → Manage → Active numbers → the number), all
`HTTP POST`:

| Console field                                | URL                                                    |
| -------------------------------------------- | ------------------------------------------------------ |
| Messaging → A message comes in               | `https://<tool>.naplesaiagency.com/api/sms/inbound`    |
| Voice → A call comes in                      | `https://<tool>.naplesaiagency.com/api/voice/incoming` |
| Voice → Call status changes                  | `https://<tool>.naplesaiagency.com/api/voice/incoming` |
| Messaging Service → Delivery status callback | `https://<tool>.naplesaiagency.com/api/sms/status`     |

Without a Messaging Service, delivery receipts come from the `statusCallbackUrl` passed to
`createSmsProvider`, so nothing to paste for that row. "Call status changes" posts to the same
voice route with `CallStatus=no-answer|busy|completed|…`; the voice route handles both the
initial ring (`ringing`) and the final status.

## Local development

`SMS_PROVIDER=fake` (the default) never contacts a provider. In a test or a dev script:

```ts
const sms = fakeProvider();
const req = sms.inbound({
  kind: 'inbound',
  from: '+12395550123',
  to: '+12395550100',
  body: 'STOP',
  providerMessageId: 'FAKE-1',
});
await handleWebhook(sms, req, handlers); // signed with the fixed test header
sms.sent; // every text the code under test sent
```

To exercise a real Twilio webhook locally, run `ngrok http 3001`, set `SMS_WEBHOOK_PUBLIC_URL`
to the ngrok origin and paste the ngrok URLs into a trial number. Use a Twilio test account; never
real customer numbers from development (CLAUDE.md).

## Segment count (`@speedy/sms/segments`)

`countSegments(text)` says how many text segments a message costs: GSM-7 (160 characters, 153 per
part when split) or UCS-2 when any character is outside the GSM alphabet (70 and 67). One curly
quote or emoji moves the whole message to UCS-2. Use it for a live preview; carriers bill and
filter by segment.

## Out of scope here

Buying numbers, A2P 10DLC registration, production credentials and a shared opt-out table in
`public` are not part of this package. Each tool stores opt-outs in its own schema.
