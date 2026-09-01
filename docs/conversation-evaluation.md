# VIA — Conversation Evaluation (Phase 14)

## Test inventory against the brief's own test list (sections 65-77)

| # | Test | Status | Where |
|---|---|---|---|
| 65 | Pure greeting → open-ended, no forced Admin option | Already covered before this phase | `lib/integrations/wati/responseDecision.test.ts`, Case A |
| 66 | Direct stock question → no greeting menu, straight to stock workflow | Already covered | `lib/integrations/wati/responseDecision.test.ts`, Case D; `lib/integrations/wati/intent.test.ts` |
| 67 | Multi-message burst → coalesce | **Not covered — feature not built.** See `docs/conversation-ux.md`'s debounce deferral. |
| 68 | Multi-intent → price + stock + shipping all handled | **Not covered — only the existing stock+price combo is built.** `STOCK_AND_PRICE_INQUIRY` is tested; the three-way combo from the brief's own example is deferred. |
| 69 | Interruption → side question answered, active workflow preserved | Partially true by construction (see `docs/context-management.md`) but **not tested directly**, and the proactive "still waiting" acknowledgment is not built. |
| 70 | Correction → quantity corrected | **Not covered — "bukan X, tapi Y" phrasing not built.** The existing "ubah/ganti X jadi Y" phrasing has its own coverage in `lib/integrations/wati/intent.test.ts`. |
| 71 | Human request → immediate handoff | Already covered | `lib/integrations/wati/responseDecision.test.ts`, `lib/customerService/handoff.test.ts` |
| 72 | Human active → no AI outbound | Already covered | `lib/integrations/wati/responseDecision.test.ts` ("every new company-knowledge intent is suppressed..."), `lib/integrations/wati/pipelineRace.test.ts` (Phase 13) |
| 73 | Tier → no exposure | Already covered | `lib/integrations/wati/responseDecision.test.ts` (Test 79/80), `lib/jarvis/evals/cases.ts`'s `SAFE-TIER-001` (Phase 13) |
| 74 | Other brand → polite decline + optional alternative | Already covered | `lib/integrations/wati/intent.test.ts` (Test 83), `responseDecision.test.ts` (Test 83/84) |
| 75 | Plywood → correct scope decline | Already covered | `lib/integrations/wati/intent.test.ts` (Test 84) |
| 76 | Catalogue → Lamitak/EDL correct websites | Already covered | `lib/integrations/wati/responseDecision.test.ts` (Test 89/90) |
| 77 | Bot question → transparent identity | **Newly covered this phase** | `lib/integrations/wati/intent.test.ts`, `responseDecision.test.ts` |

Eight of thirteen were already correct and tested before this phase touched anything (further evidence that the brief's premise — a from-scratch conversation redesign — didn't match reality). One (#77) was built and tested this phase. Four (#67, #68 fully, #69's proactive half, #70) remain genuinely open — see `docs/conversation-ux.md`'s deferred list for why each one wasn't forced through under time pressure.

## Jarvis eval cases (brief section 78's realistic-conversation dataset)

The Jarvis eval framework (`lib/jarvis/evals/`, `docs/jarvis-evaluation-engineering.md`) evaluates the *internal*, tool-using Jarvis agent — not the customer-facing WATI pipeline, which is fully deterministic and has no eval harness of its own beyond the `node --test` files in `lib/integrations/wati/*.test.ts` referenced in the table above. Phase 13 already added cases closing the release-blocking gaps most relevant to customer-facing safety (`SAFE-TIER-001`, `SAFE-BANK-001`, `SAFE-UNSUPPORTED-PRODUCT-001`, `SAFE-DUPLICATE-ORDER-001`, `SAFE-PAYMENT-CLAIM-001` in `lib/jarvis/evals/cases.ts`) — no new cases were needed there for this phase's actual scope (bot-identity, greeting wording, and a reliability fix aren't things the internal-Jarvis eval harness would exercise; they're WATI-pipeline-only concerns, tested by the `node --test` files above instead).

A genuine section-78 dataset (realistic multi-turn conversations covering typos, slang, mixed language, multi-intent, corrections, complaints) doesn't exist yet as a structured corpus — the `lib/integrations/wati/*.test.ts` files are unit tests over `detectIntentDeterministic`/`decideResponse` in isolation, not full conversation transcripts. Building that corpus is a bigger undertaking than this phase's gap-filling scope; it's the natural next step once the deferred gaps above (multi-intent, correction, interruption-acknowledgment) actually exist to test.

## Conversation quality metrics and human review (brief sections 79-80)

Not implemented this phase — see `docs/conversation-ux.md`'s "conversation quality metrics and human review" section for the intended extension points (the existing `analytics_events` pipeline and the Phase 13 feedback schema) and why they weren't built out this pass.

## Running the tests that do exist

```
npm run test:wati-inquiry       # intent detection + response decision, including all Phase 14 additions
npm run test:wati-stock         # stock workflow, unaffected by this phase
npm run test:wati-commercial    # commercial draft workflow, unaffected by this phase
npm run test:wati-pricing       # pricing responses, unaffected by this phase
npm run test:customer-service   # handoff/SLA, unaffected by this phase
npm run eval:jarvis              # internal Jarvis agent evals — 49/49 passing, 0 critical failures, unchanged by this phase
```

All of the above were re-run after every change in this phase with zero regressions — see `docs/conversation-ux.md` for the specific fixes and their test coverage.
