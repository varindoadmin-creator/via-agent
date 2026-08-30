# VIA Customer Operations — Phase 6 (WATI Contact Sync)

## Direction

```text
Zoho Customer -> VIA CustomerChannelIdentity -> WatiContactSyncService -> WATI
```

One-directional only. WATI is never authoritative — a display name or metadata edited directly in WATI is never read back to update Zoho/VIA's customer master.

## What syncs (`lib/customerIdentity/watiContactSync.ts`'s `buildSyncableAttributes`)

```text
company_name
contact_person
zoho_customer_id
salesperson
customer_type
billing_city  (if present)
```

## What never syncs

```text
NPWP, credit limit, outstanding AR, internal notes, margin, supplier data,
pricing strategy, exact stock, credit risk
```

These are excluded structurally: `buildSyncableAttributes` never reads them off the `ZohoContact` object in the first place — the same "never fetched" pattern Phase 5 used for cost/margin in the customer-safe price DTO, not field-stripping after the fact.

## Multi-customer phones

If one phone maps to multiple Zoho customers, WATI's single Contact record is never given a false single "Company Name." (This pass doesn't sync a summary/count field for the multi-customer case — the mapping itself, which is the actual source of truth, stays entirely in `customer_channel_identities`; a future pass could add a non-authoritative "Linked Customer Count" attribute if useful.)

## Sync API (`lib/integrations/wati/client.ts`'s `updateWatiContactAttributes`)

Uses WATI's documented `POST /api/v1/addUpdateContactAttributes/{whatsappNumber}` endpoint — same inert-until-configured convention as the existing `sendWatiText` (no `WATI_API_TOKEN`/`WATI_API_BASE_URL` configured -> logs and returns `disabled`, never throws). Verify the exact payload shape against your WATI account's real API docs before relying on it in production, same caveat as the existing outbound-message client.

If WATI doesn't yet have these custom Contact Attributes configured, an Admin needs to create them in the WATI dashboard (Company Name, Zoho Customer ID, Customer Code, Contact Person, Salesperson, Customer Type) before sync calls will do anything useful — this integration doesn't invent or auto-provision WATI capabilities that don't exist.

## Triggers

- New Zoho customer created (end of the onboarding-approval flow).
- New WhatsApp <-> customer mapping created (including an auto-linked `ZOHO_CONTACT_MATCH`).

Not built this pass: a scheduled daily reconciliation sweep (brief section 19) — retry is manual via the admin dashboard's "Retry WATI Sync" action instead.

## Status tracking (`wati_contact_sync_log`)

```text
SYNC_PENDING | SYNCED | SYNC_FAILED_RETRYABLE | SYNC_FAILED_FINAL
```

A sync failure **never** blocks or rolls back a valid Zoho customer creation or mapping — `syncCustomerToWati` never throws, and every call site treats it as best-effort (`.catch(() => undefined)`).

## Feature flag

`WATI_CONTACT_SYNC_ENABLED` (off by default) — when off, `syncCustomerToWati` records a `SYNC_FAILED_RETRYABLE` log row without ever calling WATI, so Stages 1-2 (identity mapping, customer creation) can run in production before this stage is turned on.

## Tests

`lib/customerIdentity/watiContactSync.test.ts` — sensitive-field exclusion, WATI-unavailable retryable status.
