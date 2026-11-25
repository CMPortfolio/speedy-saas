# Missed Call Text-Back: launch notes

The full launch checklist (production env vars, webhook URLs, Railway and DNS steps, A2P 10DLC)
is written in M6. This file starts with what M5 needs reviewed before the tool is shown to owners.

## Carrier call-forwarding codes (shown on the setup page)

The codes live in one file, `src/config/carrier-codes.ts`, each with a `verified` flag and a source
URL. They are the no-answer ("conditional") forwarding codes: calls the owner does not pick up go to
the missed-call number, calls they answer are untouched.

| Carrier  | Turn on                          | Turn off | Check   | Status                                                                                                                                                            | Source                                                                    |
| -------- | -------------------------------- | -------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Verizon  | `*71` + 10-digit number          | `*73`    | none    | Verified on Verizon's page. Fails while roaming; forwarded calls are billed as answered.                                                                          | https://www.verizon.com/support/how-to-use-call-forwarding                |
| T-Mobile | `**61*1` + 10-digit number + `#` | `##61#`  | `*#61#` | Partly verified: the cancel code is on T-Mobile's page, the turn-on code is the GSM standard. The setup page says "Check with a test call after setting this up." | https://www.t-mobile.com/support/plans-features/self-service-short-codes/ |
| AT&T     | `**61*1` + 10-digit number + `#` | `##61#`  | `*#61#` | Not verified on any AT&T page: GSM standard codes, cited from Wikipedia. The setup page says "Check with a test call after setting this up."                      | https://en.wikipedia.org/wiki/Call_forwarding                             |

Prepaid and MVNO plans are unverified. The setup page tells those owners to turn on Call Forwarding

> When unanswered in their phone settings, or to call their carrier.

**To do before launch:** make a test call on a real AT&T and a real T-Mobile line, then set
`verified: true` (and replace the AT&T source with an AT&T page if one exists) in
`src/config/carrier-codes.ts`. The tests in `tests/unit/setup.test.ts` pin the current codes and the
"only Verizon verified" state, so update them with the data file.

## Owner cell confirmation (not wired yet)

Reply forwarding is off for a line until `missed_call.lines.owner_cell_verified` is true (default
false, and an owner cannot set it themselves). The one-time-code step plugs in through
`OwnerCellVerifier` in `src/features/setup/verify-cell.ts`; until the shared helper lands, replies
are saved and shown in the list but not texted to the owner.

## Provider number

For v1 a person with the service-role key sets `lines.provider_number` after buying the number in
the provider console. The setup page shows the forwarding codes once it is set.
