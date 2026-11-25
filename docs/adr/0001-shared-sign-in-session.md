# 0001. One sign-in across the tools, with a verifier per tool

Status: accepted · 2026-11-25

## Context

Every Speedy SaaS tool shares one Supabase project, and an owner signs in once and is signed in on
every tool (`job-photos`, `missed-call`, `rain-day`). That is a product decision: owners use more
than one tool and should not sign in again. It is done with the session cookie on
`Domain=.naplesaiagency.com` (`AUTH_COOKIE_DOMAIN`, `NEXT_PUBLIC_AUTH_COOKIE_DOMAIN`), so every tool
reads the same session.

Sign-in is a magic link finished with PKCE. Asking for a link stores a secret, the code verifier, in
a cookie. Supabase names that cookie `<storageKey>-code-verifier`, one fixed name per project. With
the session on the shared domain, the verifier was on the shared domain too, and two things went
wrong:

1. Asking for a link on one tool replaced the verifier of a link still waiting on another. The first
   link then failed with "expired or already used" even though it was fine, and the owner asked for
   more links.
2. The sign-in redirect carries a `next` path. A `next` that belongs to another tool (Missed Call's
   `/setup`) was accepted by any tool, because the shared sign-in only checks that `next` stays on
   the same site, and landed on a 404. On 2026-11-25 an owner hit exactly that on Rain day, already
   signed in through the shared cookie and shown the sign-in form anyway.

## Decision

- **The session stays shared** on `.naplesaiagency.com`. One sign-in everywhere is kept.
- **The verifier is per tool.** `packages/auth` (`scopedCookieMethods`, used by the server client and
  the middleware) writes verifier cookies host-only, with the tool's name in the cookie name
  (`...-code-verifier~rain-day-naplesaiagency-com`), and reads them back under the plain name. A
  verifier that is not this tool's, including the old shared one, is ignored. The tool comes from
  `APP_URL`, so it is the same in the middleware, the sign-in action and the callback.
- **`next` is limited to the tool's own pages** where the tool has a fixed set of them (Rain day:
  `rainDayNext` in the sign-in page and in `/auth/callback`), and falls back to the tool's home.
- **A signed-in owner on `/sign-in` is sent on** instead of being asked for another link (Rain day).

## Consequences

- A link requested on one tool no longer breaks a link requested on another. Covered by a test that
  runs the real Supabase client against a shared cookie jar (`packages/auth/src/verifier-scope.test.ts`).
- Signing out still signs the owner out of every tool, and a session refresh on one tool is seen by
  the others. That is the point of the shared session.
- Links requested before this change hold the old shared verifier, which is now ignored: they fail
  once, with the usual "ask for a new link" message. Nothing else is affected.
- The browser client (`createBrowserSupabase`) is not used to start sign-in. If a tool ever starts
  one from the browser, it needs the same scoping.
- Other tools should use the same `next` limit as Rain day if they have a fixed set of pages.

## Alternatives considered

- **Separate cookies per tool** (no shared session): simplest and safest, but owners sign in once per
  tool, which the product decision rules out.
- **Supabase's experimental per-flow verifier slots** (`appendPkceFlowIdToRedirects`): still shares
  cookies across tools and is marked experimental.
- **An alias for `/setup` on Rain day**: hides the symptom for one path and fixes nothing.
