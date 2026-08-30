# VIA Customer Operations — Phase 6 (Commercial Draft: Order/Quotation Processing)

## Intent classification (`lib/integrations/wati/intent.ts`)

New deterministic intents, additive to the Phase 2-5 set: `ORDER_INTENT`, `QUOTATION_REQUEST`, `ORDER_MODIFICATION`, `ORDER_CANCELLATION_REQUEST`. `QUOTATION_REQUEST` (explicit "quote"/"quotation"/"penawaran") is checked before `ORDER_INTENT` (a commit verb — `ambil`/`pesan`/`order`/`beli` — plus a quantity plus a resolvable product/brand), so "Quote ATP11358M 50 lembar" never misfires as a confirmed order. A bare price/stock question with no commit verb never becomes `ORDER_INTENT` — the classifier requires the quantity+verb combination, not just a number in the message.

`CUSTOMER_IDENTITY_SELECTION`, `DELIVERY_ADDRESS_SELECTION`, and `NEW_CUSTOMER_ONBOARDING` are declared in the `WatiIntent` type per the brief but are **not** free-text-classified — a reply like "1" or a bare company name isn't reliably a classifiable intent on its own. Instead `lib/integrations/wati/commercial/followUp.ts`'s `matchCommercialFollowUp` checks *before* generic intent detection (same short-circuit shape as the existing stock quantity follow-up) whether this conversation has an active draft waiting on exactly this kind of reply, and routes there directly. This is safer than guessing an intent from ambiguous short text.

## WhatsApp number vs. Zoho Customer vs. Shipping Address

Kept as three distinct concepts throughout (see `docs/customer-identity-mapping.md` for the identity side). This doc covers the commercial draft that sits on top of a resolved customer + address.

## CommercialDraft (`lib/integrations/wati/commercial/draft.ts`, `supabase/commercial_drafts.sql`)

```text
DRAFT -> NEEDS_CUSTOMER -> [CUSTOMER_ONBOARDING] -> NEEDS_PRODUCT -> NEEDS_DELIVERY_INFO
      -> NEEDS_PRICE -> READY_FOR_REVIEW -> WAITING_FOR_APPROVAL -> APPROVED -> EXECUTING
      -> COMPLETED | FAILED | STALE | CANCELLED
```

**Scope of this pass — single line only.** Every one of the brief's own numbered test scenarios (sections 70-79) is single-product. Multi-line orders and true partial-availability sequencing (section 51, "ATP tersedia, DWE belum — lanjutkan ATP saja?") are **not built** — a real gap, documented here rather than silently handled. The product/quantity from the message that started the draft is carried as `pending_*` columns directly on the draft row (not yet a materialized `commercial_draft_lines` row) specifically so that a later identity/address *selection* reply — which never repeats the product — can resume exactly what was originally asked for.

## Workflow (`lib/integrations/wati/commercial/workflow.ts`)

```text
1. Customer identity   -> lib/customerIdentity (ONE: auto-select; MANY: ask, never repeat within this draft; NONE: match/onboard)
2. Delivery address    -> lib/integrations/wati/commercial/addressResolution.ts (0: ask for one; 1: auto-select; 2+: ask)
3. Price               -> Phase 5's getCustomerSafePrice (never customer-supplied/old-conversation/cost-derived)
4. Stock               -> Phase 3's exact vendor-first workflow, status-only (SUFFICIENT/INSUFFICIENT/OUT_OF_STOCK/PENDING/UNKNOWN) — never a quantity
5. READY_FOR_REVIEW    -> customer gets a "sedang direview" ack, no promise, no Zoho write yet
```

**Stock resolution is async, by design.** The vendor-first check (Phase 3) is not something the pipeline can resolve within one HTTP request — it's kicked off (`startVendorCheck`, identical to Phase 3's own stock-inquiry flow) and the resulting `stock_inquiries.id` is linked onto the `commercial_draft_lines` row. The draft reaches `READY_FOR_REVIEW` with the line's `stock_status` at `PENDING`; the admin dashboard's "Refresh Stock Status" action (`lib/integrations/wati/commercial/workflow.ts`'s `refreshLineStockStatus`) derives the current customer-safe status from that linked inquiry on demand, without duplicating Phase 3's state machine.

## Customer commitment ≠ internal approval

"Ya, pesan" only ever produces or advances a `CommercialDraft`. There is no code path from a WATI message to a Zoho write — `runCommercialWorkflow`/`advanceDraft`/`finalizeDraft` never call `lib/zoho/salesOrders.ts` or `lib/zoho/estimates.ts` directly.

## Approval & execution (`lib/commercialApprovals/executeCommercialDraft.ts`)

```text
CommercialDraft (READY_FOR_REVIEW)
  -> Admin clicks "Approve & Create" (/requests/wati/orders)
  -> POST /api/requests/wati/orders/[id]/approve (session-gated)
  -> requestApproval + approveRequest (binds draftId + draftVersion + draftHash)
  -> claim -> revalidate (customer active, every line's price still current, draft unchanged) -> createDraftEstimate() or createDraftSalesOrder()
```

`lib/zoho/estimates.ts` is new this phase (Zoho Books' Estimate/Quotation object had no wrapper before); `lib/zoho/salesOrders.ts`'s existing `createDraftSalesOrder` is reused unchanged. Both are only ever called from this one execution path — never directly by Jarvis or the WATI pipeline.

## Idempotency

Same claim-with-status-filter pattern as customer creation: `commercial_approvals` and `commercial_drafts.status` are both flipped atomically before any Zoho call, so a duplicate webhook or duplicate approval click cannot create two Quotations/Sales Orders for one draft. An ambiguous Zoho response after the POST is marked for manual reconciliation, never auto-retried.

## Modification / cancellation

```text
ORDER_MODIFICATION before Zoho creation  -> update the draft's line, bump version (invalidates any prior approval), re-price
ORDER_MODIFICATION after Zoho creation   -> human/Admin route, no automatic SO edit
ORDER_CANCELLATION_REQUEST, draft only   -> cancel safely
ORDER_CANCELLATION_REQUEST, Zoho exists  -> human/Admin route, no auto-cancel
```

## Security

- No WATI-sourced text is ever parsed as a raw customer ID or address ID — both are always resolved through `lib/customerIdentity`/`addressResolution.ts` lookups scoped to the exact phone/customer.
- `evaluateDisclosure` continues to gate all customer-facing text; the confirmation messages use the `CustomerSafeOrderSummary`-shaped fields only (item code, name, quantity, unit price, total) — cost, margin, credit risk, and internal notes are never fetched into this path.
- Execution endpoints require an authenticated admin/director session (`verifySessionToken`); WATI's inbound webhook never reaches them.

## Feature flags

`COMMERCIAL_DRAFT_ENABLED` (off by default) is the master switch checked in `responseDecision.ts` — off, `ORDER_INTENT`/`QUOTATION_REQUEST`/`ORDER_MODIFICATION`/`ORDER_CANCELLATION_REQUEST` fall back to the pre-Phase-6 `G_ACK_ROUTE` human handoff instead of starting a draft. `SALES_ORDER_EXECUTION_ENABLED` (off by default) gates the execution endpoint itself for both Sales Orders and Estimates — a deliberate scope simplification from the brief's separate `QUOTATION_PREP_ENABLED`/`SALES_ORDER_PREP_ENABLED`/`SALES_ORDER_EXECUTION_ENABLED` list; this pass checks one master draft-creation flag and one master execution flag rather than building out all five as independently switchable.

## Tests

`lib/integrations/wati/commercial/addressResolution.test.ts`, `lib/integrations/wati/commercial/draft.test.ts`, `lib/integrations/wati/intent.test.ts` (new commercial-intent cases), `lib/integrations/wati/responseDecision.test.ts` (`K_COMMERCIAL_WORKFLOW` cases + the feature-flag fallback), `lib/commercialApprovals/executeCommercialDraft.test.ts` (idempotency, stale-draft rejection).

## Known limitations

- Multi-line orders and partial-availability sequencing (brief section 51) — deferred, documented above.
- No standalone dashboard metrics (brief section 69) beyond what the two admin pages show directly.
- The full observability event catalog (brief section 68) is not emitted as named events — existing `console.info`/`console.error` logging conventions are used instead, same posture as Phases 2-5.
