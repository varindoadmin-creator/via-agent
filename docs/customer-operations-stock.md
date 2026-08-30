# VIA Customer Operations — Phase 3 (Stock Inquiry Operations)

Extends Phase 2 (`docs/customer-operations.md`) with the actual vendor-first stock-checking workflow. Read Phase 2's doc first — this one only covers what Phase 3 adds.

## The four rules, and exactly where each is enforced in code

1. **Vendor is always checked first, never Varindo's own stock.** `lib/integrations/wati/stock/service.ts`'s `startVendorCheck` never calls Zoho stock lookup — it only resolves a vendor source and creates a `StockCheckRequest`. The only function that can query Varindo's own stock is `varindoFallback.ts`'s `checkVarindoAvailability`, and the *only* caller of it is `service.ts`'s `runVarindoFallback`, which is itself only ever invoked from the `OUT_OF_STOCK` branch of `applyVendorResultToInquiry`. This is enforced structurally, not just by convention: `lib/integrations/wati/stock/workflow.ts`'s transition table only allows entering `CHECKING_VARINDO_STOCK` from `VENDOR_OUT_OF_STOCK` — every other attempt throws `InvalidStockTransitionError`. Tested directly in `workflow.test.ts`.
2. **Exact quantities are never disclosed to a customer.** `disclosurePolicy.ts`'s `toCustomerStockResult()` is the *only* function permitted to turn a quantity into a customer-facing signal, and its return type (`'AVAILABLE'|'SUFFICIENT'|'INSUFFICIENT'|'OUT_OF_STOCK'|'UNKNOWN'`) has no quantity field — a caller cannot leak a number through it even by mistake. `responses.ts`'s templates never accept a raw available-quantity parameter, only the customer's own requested quantity (which they already know) is ever echoed back. Tested in `disclosurePolicy.test.ts` and `responses.test.ts`.
3. **"How many do you have?" becomes "how many do you need?"** `quantityInquiryType.ts` classifies every stock question into `EXISTENCE` / `QUANTITY_SPECIFIC` / `COUNT_INQUIRY` (Types A/B/C). A `COUNT_INQUIRY` never triggers a vendor or internal stock check — it only sends `needQuantityPrompt()` and sets the inquiry to `NEEDS_QUANTITY`. The customer's next message is caught by `quantityFollowUp.ts`'s `matchQuantityFollowUp`, checked in the pipeline *before* normal intent detection (a bare "20" wouldn't classify as anything useful otherwise), and attaches to the *same* inquiry rather than creating a new one.
4. **Vendor-closed and no-response are not out-of-stock.** `vendorResponse.ts` only ever returns `OUT_OF_STOCK` from explicit negative phrasing (`kosong`, `habis`, `tidak ada`); an empty/no response is `UNKNOWN`, ambiguous text is `AMBIGUOUS` — neither routes to the internal fallback (only the workflow's `VENDOR_OUT_OF_STOCK` state does, per rule 1's enforcement). A vendor outside its operating hours transitions to `VENDOR_CLOSED`, which the state table only allows moving back into the vendor-check flow itself, never into `CHECKING_VARINDO_STOCK`.

## Architecture

```
Pipeline (existing message + product resolution from Phase 2)
  -> quantityInquiryType.classify()  [Type A/B/C]
     Type C -> needQuantityPrompt(), NEEDS_QUANTITY, stop
     Type A/B -> stock/service.ts: startVendorCheck()
        -> sourceResolver.resolveStockSource()   [UNRESOLVED -> NEEDS_HUMAN]
        -> operatingCalendar.isSourceOpen()      [closed -> VENDOR_CLOSED + next_eligible_check_at]
        -> store.getOrCreateCheckRequest()       [dedup: shares one StockCheckRequest per item+vendor]
        -> WAITING_FOR_VENDOR, sends Phase 2's existing "kami bantu cek..." ack

-- admin dashboard action (Human Bridge), NOT the webhook request --
Admin records vendor response (button or free text)
  -> vendorResponse.parseVendorResponse()  [buttons bypass this entirely]
  -> service.ts: recordVendorResponse()
     -> fans out to every linked StockInquiry (quantity-safe, see stock_check_request_inquiries)
     -> OUT_OF_STOCK  -> runVarindoFallback() -> varindoFallback.checkVarindoAvailability()
     -> AVAILABLE     -> disclosurePolicy.toCustomerStockResult()
     -> AMBIGUOUS/FUTURE/UNKNOWN -> NEEDS_HUMAN
  -> RESPONSE_READY, prepared_response_text stored

Admin clicks Send (or auto-send, if enabled) -> service.ts: sendPreparedResponse() -> CLOSED
```

## Data model

- `stock_inquiries` (extended from Phase 2, `supabase/stock_inquiries_workflow.sql`): full workflow state, `stock_inquiry_type`, `primary_source`, `active_stock_check_request_id`, `final_availability`/`final_source`, `prepared_response_text`, `human_required`, `sla_deadline_at`, `next_eligible_check_at`, `customer_phone_raw` (added because `conversation_id` is often the normalized phone key, not a valid WhatsApp send target).
- `stock_check_requests` (new, `supabase/stock_check_requests.sql`): the vendor-facing entity, one per item+vendor+open-window (not one per customer inquiry).
- `stock_check_request_inquiries` (new, `supabase/stock_check_request_inquiries.sql`): join table — each row keeps its own `requested_quantity`/`unit` so a single vendor response fans out to multiple inquiries without ever misapplying one inquiry's sufficiency to another's (brief section 25).

## Workflow states

`RECEIVED → NEEDS_QUANTITY → READY_FOR_VENDOR_CHECK → {WAITING_FOR_VENDOR | VENDOR_CLOSED | NEEDS_HUMAN} → {VENDOR_AVAILABLE | VENDOR_OUT_OF_STOCK} → (if OOS) CHECKING_VARINDO_STOCK → {VARINDO_AVAILABLE | VARINDO_OUT_OF_STOCK} → RESPONSE_READY → CLOSED`, plus `NEEDS_HUMAN`/`CANCELLED`/`FAILED` as exception states. The full transition table and its validation live in `lib/integrations/wati/stock/workflow.ts` — every move is checked server-side; an invalid one throws rather than silently succeeding.

## Human Bridge (vendor communication)

No automated channel to EDL/TAK/other vendors exists or was built — confirmed absent in both the Phase 2 and Phase 3 audits (no vendor API, no WATI group-posting capability verified). The admin dashboard (`/requests/wati/stock`) is the entire vendor interface: **Record Available** / **Record Out of Stock** buttons (zero ambiguity, bypass the text parser) and an **Enter Vendor Response** free-text field (parsed by `vendorResponse.ts`) for capturing a quantity too. VIA owns the item↔customer linkage — the admin never needs to remember which customer asked for what.

## Business hours

`lib/integrations/wati/stock/operatingCalendar.ts` — per-vendor hours as env-var-overridable code config (`VENDOR_HOURS_<SOURCE>_OPEN`, `_CLOSE`, `_TZ_OFFSET_MINUTES`), defaulting to Mon–Sat 08:00–17:00 Asia/Jakarta. **Not** a DB-backed admin-editable calendar in this phase — see Limitations.

## SLA

`lib/integrations/wati/stock/sla.ts` — configurable via `STOCK_SLA_WARNING_MINUTES` (default 30) / `STOCK_SLA_BREACH_MINUTES` (default 120). Surfaced as a badge on the dashboard and swept by the cron job below.

## Deferred checks & SLA sweep (cron)

`POST /api/wati/stock/sweep` (added to `middleware.ts`'s `CRON_PATHS`, same `x-cron-secret` auth as VIA's other scheduled jobs) — reopens `VENDOR_CLOSED` *inquiries* whose vendor is now open, and sends **one** bounded summary email (via the existing `lib/email/sendMail.ts`) to `VIA_ALERT_EMAIL` if any inquiry has breached its SLA. **You need to add this endpoint to your cron-job.org schedule** the same way the other cron endpoints (e.g. `/api/shipments/aging-check`) are configured — VIA has no scheduler of its own.

Note: reopening operates on `stock_inquiries` rows, not `stock_check_requests` — `startVendorCheck` checks vendor hours *before* ever creating a `StockCheckRequest`, so a closed inquiry never has one yet to reopen. The sweep re-runs that same "create/attach check request" step once the vendor's hours resume.

## Auto-send policy

`AUTO_SEND_STOCK_RESPONSES` env var, **defaults to `false`** — every prepared response sits at `RESPONSE_READY` until an admin clicks Send on `/requests/wati/stock`. Even if enabled, auto-send additionally requires: not `human_required`, and the conversation not `NEEDS_HUMAN`/`HUMAN_ACTIVE`. Sending is idempotent — the state machine makes `CLOSED` unreachable a second time from itself, so a retried send attempt on an already-sent inquiry is rejected, not double-sent.

## Dashboard

`/requests/wati/stock` (admin/director, same session auth as the rest of `/requests`). Columns: Age, Conversation, Product, Requested Qty, Source, Status, SLA, Next Action. Status filter tabs. Actions render conditionally by status (vendor-response buttons while `WAITING_FOR_VENDOR`/`VENDOR_CLOSED`; Send Reply while `RESPONSE_READY`). New API routes: `GET /api/requests/wati/stock`, `POST /api/requests/wati/stock/check-requests/[id]/respond`, `POST /api/requests/wati/stock/inquiries/[id]/send`.

## Security

No Zoho writes. Vendor replies and Varindo inventory are internal-only. `detectPromptInjection` (Phase 2) still runs on all customer text before any model call — though notably, Phase 3's confidentiality boundary doesn't depend on the model behaving: it's structural (the disclosure function's return type), so a prompt-injection attempt asking for exact stock has no code path to a number regardless of whether the injection is detected. Admin actions (`recorded_by`, `sent_by`) are attached to every write for auditability.

## Tests

`lib/integrations/wati/stock/*.test.ts` (`npm run test:wati-stock`, 38 tests): state-machine invariants (explicit coverage of "Zoho stock never queried first," per the brief's own requirement), confidentiality (no template or disclosure result ever carries a raw quantity beyond the customer's own request), Type A/B/C classification, vendor-response parsing (including the no-response ≠ out-of-stock distinction), business-hours open/closed, SLA thresholds, and source resolution (including the deliberate non-guessing fallback).

## Known limitations (by design)

- **Business-hours calendar is code/env config**, not DB-backed or admin-editable — a future iteration would move this to a table.
- **No automated vendor messaging** — Human Bridge only, per explicit decision; `VendorStockCheckAdapter`-style pluggable adapters (`EDLWhatsAppAdapter`, etc.) were not built since there's nothing to adapt to yet.
- **No confirmation-freshness reuse across separate time windows** — every new inquiry outside an active dedup window gets its own fresh vendor check; a "confirmed Monday, still valid Wednesday" policy was not implemented (safest conservative default).
- **WATI tag synchronization not implemented** — no verified WATI tag-management API access.
- **Full operational analytics/operational-excellence metrics (brief sections 37–38) and the Jarvis internal-query tool (section 33) are not built this phase** — the data model supports both once prioritized.
- **NEEDS_HUMAN inquiries have no dedicated dashboard action yet** beyond the status badge — resolving one currently means editing the row directly or extending the dashboard.

## Next phase

Recommend **Customer Operations Phase 4 — Customer Data Boundary & Disclosure Policy**, generalizing this stock-specific confidentiality model to sales, margins, supplier costs, and other internal data — per the brief's own instruction, not started automatically.
