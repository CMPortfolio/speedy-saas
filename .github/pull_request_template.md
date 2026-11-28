## Ticket

ClickUp: <!-- https://app.clickup.com/t/<id> -->

## Summary

<!-- One paragraph: what changed and why. -->

## Done when

<!-- Copy the ticket's Done when items. Tick each one and say how it was tested. -->

- [ ]

## Out of scope / left for the engineer

<!-- Anything the ticket excluded, plus Railway, Supabase, DNS or env steps a person must do. -->

## Checks

- [ ] `pnpm typecheck` · `pnpm lint` · `pnpm format:check` · `pnpm test` · `pnpm build` pass for every affected package
- [ ] New or changed migration: RLS per operation, `pnpm db:types` committed
- [ ] New tool: registry entry, `<NaplesFooter />`, landing metadata, README scope line, `.env.example`, Playwright one-moment test
