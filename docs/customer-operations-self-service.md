# VIA Customer Operations — Phase 7 (Order, Invoice, Delivery & Payment Self-Service)

## Architecture

```text
WATI
  |
  v
Phase 6 CustomerChannelIdentity mapping (+ Phase 2 phone match as a weaker fallback)
  |
  v
activeCustomerId (resolved server-side; cross-turn reuse via wati_conversation_state)
  |
  v
lib/customerSelfService/* (ownership-scoped by construction — every function's
  Zoho query itself is filtered by customerId, never a post-hoc check)
  |
  v
Customer-safe DTO (CustomerSafeOrderStatus / CustomerSafeInvoice / ...)
  |
  v
Phase 4 evaluateDisclosure (CUSTOMER_SCOPED category, identity-level gated)
  |
  v
WATI response (via sendWatiTextGated, same structural gate as every prior phase)
```

## Supported self-service intents

| Intent | Capability | Min. identity level | Feature flag |
|---|---|---|---|
| `ORDER_STATUS_INQUIRY` | Own SO status | `CUSTOMER_MATCHED` | `CUSTOMER_ORDER_STATUS_ENABLED` |
| `ORDER_HISTORY` | Latest 3-5 orders | `CUSTOMER_MATCHED` | `CUSTOMER_ORDER_STATUS_ENABLED` |
| `LAST_ORDER` | Most recent order | `CUSTOMER_MATCHED` | `CUSTOMER_ORDER_STATUS_ENABLED` |
| `DELIVERY_STATUS` | Package/shipment status for an SO | `CUSTOMER_MATCHED` | `CUSTOMER_DELIVERY_STATUS_ENABLED` |
| `INVOICE_STATUS` | Own invoice paid/unpaid/overdue | `CUSTOMER_MATCHED` | `CUSTOMER_INVOICE_STATUS_ENABLED` |
| `OUTSTANDING_INVOICES` | List of own open invoices | `CUSTOMER_MATCHED` | `CUSTOMER_INVOICE_STATUS_ENABLED` |
| `RECEIVABLE_SUMMARY` | Sum of own open balances | `CUSTOMER_MATCHED` | `CUSTOMER_RECEIVABLE_SUMMARY_ENABLED` |
| `PAYMENT_STATUS` | Whether a payment is recorded | `CUSTOMER_MATCHED` | `CUSTOMER_PAYMENT_STATUS_ENABLED` |
| `INVOICE_DOCUMENT_REQUEST` | Sends the real invoice PDF via WATI | `VERIFIED_CUSTOMER` | `CUSTOMER_INVOICE_DOCUMENT_ENABLED` |

`ORDER_STATUS_INQUIRY` is the existing Phase 4 intent, reused (not duplicated) — it already detected "my own order" phrasing; this phase gives it a real lookup instead of a hand-off.

## Identity levels (brief sections 15-16)

`lib/security/disclosure/audience.ts`'s `externalWatiAudience` now implements the full ladder, built entirely from server-side resolution (never from message text):

```text
No Phase 6 mapping, no Phase 2 phone match        -> ANONYMOUS
No Phase 6 mapping, Phase 2 finds a Zoho contact  -> PHONE_MATCHED
Phase 6 mapping (ONE), relationship_status UNVERIFIED -> CUSTOMER_MATCHED
Phase 6 mapping (ONE), relationship_status VERIFIED   -> VERIFIED_CUSTOMER
```

Phase 6 mapping always takes priority when present. Phase 2's older ad-hoc phone-field search (`lib/customers/phoneResolution.ts`) is a real, pre-existing mechanism, kept only as the weaker `PHONE_MATCHED` fallback signal — Phase 6's authoritative mapping is what actually gates self-service access. No OTP/identity-verification flow was built to actively promote someone to `VERIFIED_CUSTOMER` mid-conversation; the brief explicitly permits falling back to a "please verify with Admin" hand-off instead (section 15), which is what happens today when only `CUSTOMER_MATCHED` is available for a `VERIFIED_CUSTOMER`-gated capability (invoice documents).

## Ownership enforcement (brief sections 5, 32-35)

Every `lib/customerSelfService/*` function takes `activeCustomerId` as its first argument and passes it straight into the underlying Zoho query's own `customer_id` filter (`lib/zoho/salesOrders.ts`'s `searchSalesOrders`, `lib/zoho/invoices.ts`'s `searchCustomerInvoices`/`getCustomerInvoiceByNumber`). A cross-customer SO/invoice number is never even confirmed to exist — the query itself never returns it, so the function returns `null`/an empty list, not a "found but denied" signal. There is no exposed "get any record by ID" function anywhere in this module.

`lib/integrations/wati/responseDecision.ts`'s `L_CUSTOMER_SELF_SERVICE` case is only ever returned after `evaluateDisclosure` (Phase 4, unchanged) confirms the audience's identity level clears the per-category bar — using a deliberate self-reference (`ownerCustomerId: audience.customerId`) since at that pre-lookup stage the only possible "owner" is whichever customer Phase 6 already resolved for this exact phone.

## Multi-customer accounts (brief sections 3-4, 36-37)

`lib/integrations/wati/selfService/orchestrator.ts`'s `resolveActiveCustomer`:

```text
wati_conversation_state.active_customer_id already set -> reuse, never re-ask
Phase 6 mapping resolves to ONE                          -> auto-select, persist as active
Phase 6 mapping resolves to MANY                          -> ask which account, store the pending question
Phase 6 mapping resolves to NONE                          -> no lookup attempted (Case H disclosure-denied already sent)
```

A pending "which account" question is stored on `wati_conversation_state` (`pending_self_service_intent`/`pending_self_service_ref`) so the customer's next reply resumes the original question rather than being reclassified as something new. Switching accounts explicitly ("Sekarang cek CV ABC") is supported via the same mapping-resolution path and is logged (`console.info`) — balances are never combined across linked companies.

## Order status normalization (brief section 9)

`lib/customerSelfService/statusNormalization.ts`'s `normalizeOrderStatus` maps real Zoho Sales Order status values (`draft`, `pending_approval`, `approved`, `confirmed`, `open`, `partially_invoiced`, `invoiced`, `void`, `overdue` — all observed in this codebase's existing `app/api/shipments/route.ts` usage) to the brief's `RECEIVED | PROCESSING | CONFIRMED | PARTIALLY_FULFILLED | FULFILLED | CANCELLED | UNKNOWN`. This is a judgment call on non-obvious real values, not invented Zoho behavior — an unrecognized value always falls to `UNKNOWN`, never a guess.

## Invoice status & payment (brief sections 12-14, 20-24)

`normalizeInvoiceStatus` uses Zoho's own `status` + live `balance` fields — never guessed from invoice age. `PAYMENT_STATUS` reuses the exact same invoice lookup (no new Zoho surface) and never treats a customer's own claim ("Saya sudah transfer kemarin") as confirmation — an unrecorded payment always routes to `PAYMENT_REVIEW` in the Customer Service queue, never auto-marked paid. `RECEIVABLE_SUMMARY` sums only that customer's own open-invoice balances; overall Varindo AR remains `INTERNAL`/denied, unchanged from Phase 4.

## Invoice document security (brief sections 17-19, 44)

`lib/zoho/invoices.ts`'s `getInvoicePdf` calls the exact same `/invoices/{id}?accept=pdf` endpoint already proven by `app/api/invoices/pdf/route.ts` — the official accounting document, never a model-generated reconstruction. `lib/customerSelfService/documentSend.ts` requires an already ownership-scoped `CustomerSafeInvoice` (never a bare invoice ID), sends via `lib/integrations/wati/client.ts`'s new `sendWatiDocument` (WATI's documented `sendSessionFile` endpoint, same inert-until-configured convention as `sendWatiText`), and writes an audit row to `customer_document_sends` (`customerId, documentType, documentId, conversationId, watiMessageId, sentAt, sentBy`) regardless of send success/failure. A duplicate webhook can never trigger a second send — the pre-existing `wati_messages` idempotency gate stops reprocessing before this code path is ever reached again.

## Delivery data (brief sections 25-29, 58)

`lib/zoho/shipments.ts` wraps the real `/packages` and `/shipmentorders` Zoho endpoints (both scoped by `salesorder_id`), already proven live by `app/api/shipments/route.ts`. `deriveDeliveryStatus` only reports `NOT_YET_DISPATCHED | PROCESSING | PARTIALLY_DISPATCHED | DISPATCHED | DELIVERED | UNKNOWN` from what these records actually show — never a driver, ETA, truck, or tracking number, and never inferred from SO confirmation or invoice payment. When the Zoho lookup itself fails, the customer gets the brief's own exact honest-limitation text ("Pesanan sudah diproses, namun status pengiriman belum tersedia secara otomatis...") and a `DELIVERY_CHECK` row is logged for Admin.

## Error handling (brief sections 41-43)

Any unexpected failure inside a self-service lookup (Zoho timeout, etc.) is caught by the orchestrator, logged to `customer_service_exceptions` as `ZOHO_UNAVAILABLE`, and answered with the brief's exact fallback text — never a stale/fabricated status, and never sourced from Jarvis memory (no self-service function reads from any Jarvis memory store at all; every answer is a live Zoho lookup).

## Admin UI

`/requests/wati/customer-service` — the exception queue (`NEEDS_IDENTITY`, `NEEDS_HUMAN`, `PAYMENT_REVIEW`, `DELIVERY_CHECK`, `DOCUMENT_SEND_FAILED`, `ZOHO_UNAVAILABLE`, `RESOLVED`). Normal self-service traffic that resolves straight-through never appears here by design — this is exception management only, per brief section 45.

## Feature flags

Six flags (see table above), all off by default, same env-var-gated pattern as every prior phase. Off behavior is today's pre-Phase-7 hand-off ack (`G_ACK_ROUTE`), never an error.

## Tests

`lib/customerSelfService/*.test.ts` (ownership scoping, status normalization), `lib/integrations/wati/conversationState.test.ts` (active-customer cross-turn reuse), `lib/integrations/wati/selfService/orchestrator.test.ts` (ONE/MANY/NONE resolution, pending-selection resume), `lib/integrations/wati/intent.test.ts`/`responseDecision.test.ts` (new intents, identity-level gating, feature-flag fallback), plus the existing `test:security-disclosure` regression suite (identity-ladder change verified not to weaken any existing Phase 4 denial).

## Known limitations

- Single-order/single-invoice lookups only — no bulk account-statement generation (brief section 57 explicitly defers this unless official Zoho statement functionality exists, which it doesn't here).
- No real identity-verification (OTP) flow — `VERIFIED_CUSTOMER` is only reachable via a Phase 6 `VERIFIED` mapping (admin-confirmed or exact-phone-match); a customer cannot self-elevate mid-conversation.
- The full analytics/KPI dashboard (brief sections 46-49) beyond the Customer Service queue view itself.
- No scheduled reconciliation job for stuck exceptions — resolution is manual via the admin dashboard.
