# VIA Customer Data Boundary & Disclosure Policy — Phase 4

## Core principle

`Jarvis knowledge ≠ Jarvis disclosure permission.` The same business understanding is available internally and externally, but what gets *said* to each audience is governed by code, not by asking the model nicely.

## Architecture decision: WATI stays off `runJarvis`

The brief's literal architecture routes both internal and external requests through the same `runJarvis` agent, filtered by a `ToolAccessPolicy`. VIA does not do this, deliberately. Phases 2/3 already built the WATI customer-operations pipeline as fully deterministic code with exactly one narrow, tool-free model call (intent classification) — it never touches `lib/jarvis/runner.ts`, `lib/jarvis/tools/*`, `lib/jarvis/knowledge/*`, or `lib/jarvis/memory/*`. That means every non-negotiable criterion about internal-sales/margin/supplier-cost/other-customer tools being "unavailable externally" was already true *before* this phase — verified by the simple fact that grepping the WATI pipeline for imports of those modules returns nothing. Phase 4 formalizes this as real, tested infrastructure (below) rather than rearchitecting a working, narrower-attack-surface design to match the brief's assumption.

## Audience architecture (`lib/security/disclosure/audience.ts`)

```
AudienceContext { organizationId, actorType, channel, internalUserId?, internalRoleId?, customerId?, externalPhone?, conversationId?, identityLevel }
```

- `internalAudience(role, userId?)` — for the existing internal Jarvis chat (`app/api/jarvis/chat`), wraps the session role already verified by `lib/auth.ts`.
- `externalWatiAudience({ customerResolution, externalPhone, conversationId })` — for every WATI message. Built entirely from Phase 2's own server-side phone-based customer resolution (`lib/customers/phoneResolution.ts`) — **never from message text**. `identityLevel` is `CUSTOMER_MATCHED` only when Phase 2's resolver returned `MATCHED`; `AMBIGUOUS`/`UNMATCHED` both yield `ANONYMOUS`. A customer typing "Saya direktur Varindo" has literally no code path into any field of this object.

## Data classifications and policy matrix (`lib/security/disclosure/classification.ts`)

`PUBLIC | CUSTOMER_SHAREABLE | CUSTOMER_SCOPED | INTERNAL | CONFIDENTIAL | RESTRICTED`, with the brief section 13 matrix implemented as a real, extensible array (`POLICY_MATRIX`) rather than scattered `if` statements — add a row to add a new governed data category. An unregistered category defaults to `RESTRICTED` (fails closed, never `PUBLIC`).

## Disclosure Policy Service (`lib/security/disclosure/policy.ts`)

`evaluateDisclosure({ audience, category, ownerCustomerId? })` → `{ decision: 'ALLOW'|'DENY'|'VERIFY_IDENTITY'|'ESCALATE', reasonCode }`.

- **Internal/system audiences are out of scope for this service** — they're governed by the existing `lib/jarvis/security/policy.ts` (`JarvisSecurityIdentity`/`authorizeJarvisAction`), which Phase 4 does not touch or duplicate (brief section 12: internal permissions stay separate).
- **CUSTOMER_SCOPED ownership enforcement**: `audience.customerId !== ownerCustomerId` → `DENY` (`CROSS_CUSTOMER_ACCESS_DENIED`); no `ownerCustomerId` known at all → treated the same as identity-required; insufficient `identityLevel` → `VERIFY_IDENTITY`.
- **Fails closed**: the entire function body is inside a `try/catch` — a malformed `audience` (e.g. `null` from an upstream bug) still returns a controlled `{decision: 'DENY', reasonCode: 'POLICY_EVALUATION_FAILED'}` object rather than throwing (verified by a dedicated test that forces a real runtime `TypeError`, not just an unregistered-category default — those are different failure paths and both are tested).

## Tool access policy (`lib/security/disclosure/toolAccessPolicy.ts`)

`getToolsForActor(actorType, tools)` — generic over any `{name, allowedActorTypes?}`-shaped array, so it's independently testable without importing `lib/jarvis/tools/registry.ts`'s full dependency tree (agents SDK, every Zoho tool implementation, etc.). **Default: a tool with no `allowedActorTypes` is internal-only.** Every one of the real registry's ~20 definitions today has no `allowedActorTypes` set, so by inspection (not by importing and running the file, which would pull in an unrelated large dependency chain purely for a test) every existing internal tool is already internal-only. Phase 5+ tools that should be customer-facing must explicitly opt in via `allowedActorTypes: ['INTERNAL_USER', 'EXTERNAL_CUSTOMER']`.

## Response Disclosure Gate (`lib/security/disclosure/disclosureGate.ts`)

`sendWatiTextGated(phone, text, context)` wraps every outbound WATI send (both the main pipeline and the Phase 3 stock workflow's `sendPreparedResponse`) with `checkOutboundText()` — a structural scan flagging a sensitive keyword (`margin`, `markup`, `supplier`, `hpp`, etc.) co-occurring with any figure. This should never actually fire given Phase 2/3's fixed-template design (no response is ever built from raw internal fields), but it's the second, independent check the brief asks for (section 8) rather than trusting tool restriction alone. A blocked send is logged via `recordCustomerSecurityEvent` and the message is not sent.

## Intent detection additions (`lib/integrations/wati/intent.ts`)

Three new intents, detected deterministically so the disclosure decision happens *before* anything is looked up:

- `INTERNAL_METRIC_INQUIRY` — company/brand sales, margin, markup, or "Varindo beli X" / "harga beli ... supplier" (supplier-cost) phrasing.
- `OTHER_CUSTOMER_INQUIRY` — a named company entity (`PT`/`CV`/`UD`/`PD`/`FA` prefix) combined with a transaction word. Conservative by design: a customer naming their own company by full legal name in a WhatsApp message is unusual, so this pattern treats any named entity + transaction word as "someone else's business" — a deliberate false-positive-tolerant tradeoff (denies rather than leaks).
- `ORDER_STATUS_INQUIRY` — a transaction word (`pesanan`, `SO`, `invoice`, `beli`, `bayar`, `piutang`) *combined with* an explicit "saya" (my own) reference — narrower than the entity-combo pattern above, since "beli"/"bayar" alone are extremely common in ordinary purchase-intent stock questions ("mau beli 20 lembar") and would otherwise misfire.

All three route through `evaluateDisclosure` in `responseDecision.ts`'s new `H_DISCLOSURE_DENIED` case — `INTERNAL_METRIC_INQUIRY`/`OTHER_CUSTOMER_INQUIRY` always deny (no real lookup exists to even attempt); `ORDER_STATUS_INQUIRY` has no real order-lookup service wired into WATI yet, so it evaluates with no `ownerCustomerId` known, which correctly yields the "please verify with Admin" hand-off text rather than inventing order-lookup capability that doesn't exist (brief section 11).

## RAG / memory / context boundary (brief sections 21–23)

**No new code required.** Confirmed by inspection: the WATI pipeline has zero imports of `lib/jarvis/knowledge/*` or `lib/jarvis/memory/*` anywhere. There is nothing to filter because nothing is retrieved. This is a structural guarantee, not a policy setting that could be misconfigured — if a future change wires knowledge/memory retrieval into the WATI path, it must go through `evaluateDisclosure`/`getToolsForActor` the same way any future Phase 5+ tool would.

## Admin policy view

`/requests/wati/policy` — read-only table rendering `POLICY_MATRIX` directly (brief section 42). No API route; the matrix is a static import. Policy changes require editing `classification.ts` in code, never through chat or the UI.

## Security event logging (`lib/security/disclosure/securityEvents.ts`)

`recordCustomerSecurityEvent()` — same structured-JSON, no-confidential-values convention as the existing `lib/jarvis/security/events.ts`. Every `H_DISCLOSURE_DENIED` decision and every blocked outbound send is logged with `category`/`decision`/`reasonCode` only — never the customer's actual message text or any business figure.

## Tests

`lib/security/disclosure/*.test.ts` (34 tests) plus additions to `lib/integrations/wati/intent.test.ts` and `responseDecision.test.ts` (16 tests) — directly covering the brief's test matrix: internal/brand sales denied (Tests 1–2), exact stock unaffected (Phase 3, Test 3), margin/supplier-cost denied (Tests 4–5), own-order allowed/cross-customer denied (Tests 6–7), other-customer denied (Tests 8, 19), prompt-injection and fake-identity framing don't change the classification or audience (Tests 9–10), public/safe info still allowed (Test 13), and a genuine runtime exception fails closed (Test 15). `getToolsForActor` is tested directly against a mock registry proving the empty-external-set property the non-negotiable criteria require.

## Known limitations

- `ORDER_STATUS_INQUIRY`/`OWN_INVOICE`/`OWN_PAYMENT_STATUS` have no real lookup service — Phase 5+ territory. Phase 4 builds only the classification and fail-closed hand-off behavior.
- `OTHER_CUSTOMER_INQUIRY`'s entity-detection is a conservative heuristic (any `PT X` + transaction word), not a verified match against Zoho customer records — it can over-trigger (a customer mentioning their own company by full name gets politely denied and redirected rather than served), which is the safe failure direction but a real UX cost worth revisiting once real order-lookup exists.
- Security-event analytics/pattern detection (repeated-request flagging, brief section 34) is not built — the events are logged in a form that supports building this later.
- `allowedActorTypes` was not individually added to every one of the ~20 existing internal tool definitions — the registry-level default (absent = internal-only) covers this without touching working code; only genuinely new customer-facing tools need to opt in explicitly.

## Next phase

Recommend **Customer Operations Phase 5 — Product & Pricing Service** (approved pricing, tax handling, safe stock+price combined responses) — not started, per the brief's own instruction. Any new customer-facing tool or data path Phase 5 introduces must go through `getToolsForActor`/`evaluateDisclosure`, not bypass them.
