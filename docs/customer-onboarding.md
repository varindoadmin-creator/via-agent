# VIA Customer Operations — Phase 6 (New Customer Onboarding)

## Flow

```text
Company Name
  -> Needs Faktur Pajak?
       YES -> NPWP (validated, 15/16-digit format)
       NO  -> (skip NPWP entirely)
  -> Office Address = Billing Address
  -> Shipping same as Billing?
       YES -> copy Billing Address
       NO  -> collect Shipping Address separately
  -> duplicate check
  -> READY_FOR_REVIEW (admin dashboard) / POSSIBLE_DUPLICATE (human review)
```

One question at a time (`lib/customerIdentity/onboarding.ts`'s `processOnboardingReply` — a pure function: current draft + latest reply in, next question + field patch out). Never a giant form.

## NPWP rule

NPWP is asked **only** when `needs_faktur_pajak = true` (`lib/customerIdentity/npwp.ts`). Format is validated deterministically (15 or 16 digits) — never inferred or generated, and re-asked (not guessed) on an invalid format.

## CustomerDraft

`lib/customerIdentity/customerDraft.ts`, backed by `supabase/customer_drafts.sql`. Status machine: `COLLECTING_COMPANY -> COLLECTING_TAX_REQUIREMENT -> [COLLECTING_NPWP] -> COLLECTING_BILLING_ADDRESS -> COLLECTING_SHIPPING_ADDRESS -> POSSIBLE_DUPLICATE | READY_FOR_REVIEW -> WAITING_FOR_APPROVAL -> APPROVED -> CREATING_ZOHO_CUSTOMER -> CUSTOMER_CREATED | FAILED | CANCELLED`. Every field update increments `version`, which invalidates any approval bound to an older version (`lib/customerIdentity/approval.ts`).

## Duplicate prevention

Once collection is done, `lib/customerIdentity/duplicateCheck.ts` (built on the same `matching.ts` engine as identity resolution) runs against live Zoho customers:

```text
NO_DUPLICATE   -> READY_FOR_REVIEW
LIKELY_DUPLICATE / AMBIGUOUS -> POSSIBLE_DUPLICATE (human review required, never auto-created)
```

Creating a duplicate Zoho Customer is treated as a critical error — this check runs again immediately before the actual write (see below), not just once at collection time.

## Zoho Customer creation — approval-controlled

```text
CustomerDraft (READY_FOR_REVIEW)
  -> Admin clicks "Approve & Create" (/requests/wati/customers)
  -> POST /api/requests/wati/customers/[id]/approve (session-gated)
  -> lib/commercialApprovals/store.ts: requestApproval + approveRequest (binds draftId + draftVersion + draftHash)
  -> lib/commercialApprovals/executeCustomerCreation.ts: claim -> revalidate (duplicate check, required fields, NPWP rule, version/hash) -> lib/zoho/customers.ts's createApprovedCustomer() -> mapping -> WATI sync
```

`createApprovedCustomer()` is the **only** function in the codebase that POSTs a new Zoho contact from this pipeline. Jarvis never calls raw Zoho APIs for this.

## Idempotency

`claimApprovalForExecution` atomically flips the approval row `APPROVED -> EXECUTING` via a status-filtered PATCH — a duplicate click or duplicate webhook finds no row to claim and no-ops. If Zoho's response is ambiguous after the POST (timeout, etc.) the approval is marked for manual reconciliation (`markExecutionUnknown`) — the pipeline never retries a create automatically, since that could produce two Zoho customers for one draft.

## After creation

```text
Zoho Customer created
  -> customer_drafts.status = CUSTOMER_CREATED, created_customer_id saved
  -> customer_channel_identities row created (source: ONBOARDING_CREATED, VERIFIED)
  -> any CommercialDraft that was waiting on this onboarding (status CUSTOMER_ONBOARDING) is woken up automatically (attachCustomerToOnboardingDrafts) and continues straight into product/price/stock resolution
  -> WATI contact sync attempted (docs/wati-contact-sync.md) — failure here never rolls back the Zoho customer
```

## Feature flags

`NEW_CUSTOMER_ONBOARDING_ENABLED` gates whether an unmatched phone starts a fresh onboarding draft at all (off by default -> routes to human instead). `ZOHO_CUSTOMER_CREATION_ENABLED` gates the approve endpoint itself (off by default -> the endpoint returns 503 even for an authenticated admin, so onboarding conversations can be dark-launched before any real Zoho write is possible).

## Tests

`lib/customerIdentity/onboarding.test.ts`, `lib/customerIdentity/npwp.test.ts`, `lib/customerIdentity/duplicateCheck.ts` (exercised via `matching.test.ts`), `lib/commercialApprovals/executeCustomerCreation.test.ts` (duplicate-claim idempotency, stale-draft rejection).

## Known limitation

This pass builds the collection flow, duplicate check, and approval-controlled creation exactly as specified. Not built: the admin "Edit draft" action (section 67) beyond Approve/Reject/Retry-Sync, and the daily WATI-sync reconciliation cron (section 19) — sync failures are visible and retryable from the dashboard instead of self-healing on a schedule.
