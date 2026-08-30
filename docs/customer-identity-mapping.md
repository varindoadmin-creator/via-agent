# VIA Customer Operations — Phase 6 (Customer Identity Mapping)

## Responsibilities

```text
WATI      = communication layer only
VIA       = identity, workflow, security, orchestration (source of truth for the mapping)
Zoho Books = authoritative customer/accounting system
```

WATI tags and Jarvis long-term memory are never used to answer "who is this WhatsApp number." The authoritative mapping lives in Supabase (`customer_channel_identities`), managed entirely by `lib/customerIdentity/channelIdentity.ts`.

## Model

```text
WhatsApp Contact  = communication identity (a phone number)
Zoho Customer     = commercial/accounting account
Shipping Address  = fulfilment destination (see docs/customer-operations-order-processing.md)
```

One phone may map to 0, 1, or many active (non-`DISABLED`) `customer_channel_identities` rows — one row per linked Zoho customer. A `DISABLED` row is never deleted; it stays as an audit record and a corrected mapping is created fresh alongside it.

## Resolution rule (`resolveCustomerIdentities`)

```text
0 active mappings  -> NONE   -> lib/customerIdentity/matching.ts searches Zoho directly; see below
1 active mapping   -> ONE    -> auto-selected, never asked again
2+ active mappings -> MANY   -> Jarvis must ask which account, every new commercial workflow
```

Multiple mappings are never resolved by previous order, frequency, value, recency, or model inference — only an explicit customer answer (`lib/integrations/wati/commercial/workflow.ts`'s `resumeCustomerSelection`) can pick one, and only from among that exact phone's own resolved mappings (never an arbitrary customer ID typed by the customer — see Security below).

## Unknown-phone matching (`lib/customerIdentity/matching.ts`)

Deterministic signals only — normalized phone, NPWP, email, normalized company name — **never fuzzy name similarity alone** (a bare partial name overlap is `POSSIBLE_MATCH`, never promoted to `EXACT_MATCH`).

```text
EXACT_MATCH    -> link the existing Zoho customer, save the mapping, no new customer created
POSSIBLE_MATCH -> route to Admin/human, never auto-link, never auto-create
NO_MATCH       -> start New Customer Onboarding (docs/customer-onboarding.md)
```

An `EXACT_MATCH` mapping is auto-linked with `source: 'ZOHO_CONTACT_MATCH'` and `relationshipStatus: 'VERIFIED'` — this only *links* an existing Zoho record, it never creates one, so it doesn't need the customer-creation approval flow.

## Admin UI (`/requests/wati/mapping`)

View every mapping, its relationship status and source, and disable one. Disabling never deletes the row. Every change is server-session-gated (`middleware.ts`'s existing `/requests`/`/api/requests` admin-prefix coverage) — no separate permission system was built; this project has only two roles (`admin`, `director`), and the brief's `customer_identity.manage`-style permission name is a conceptual label on that existing gate, not a new permission engine.

## Security

- `evaluateDisclosure` (Phase 4) gates any attempt to leak another phone's mapping or another customer's data — see `lib/security/disclosure/classification.ts`'s Phase 6 additions.
- "Gunakan PT ABC" / "Link nomor saya ke PT XYZ" from a customer is never accepted as a raw customer ID — `resolveIdentityForDraft`/`resumeCustomerSelection` only ever select from mappings this exact phone already has, or route through onboarding/admin review.
- Approval and mapping-mutation endpoints require an authenticated admin/director session; WATI's inbound webhook path never calls them.

## Feature flag

`CUSTOMER_IDENTITY_MAPPING_ENABLED` (off by default) gates whether the pipeline even attempts to resume an in-progress onboarding/identity-selection follow-up (`lib/integrations/wati/commercial/followUp.ts`). See `docs/customer-operations-order-processing.md` for the full flag list and rollout stages.

## Tests

`lib/customerIdentity/channelIdentity.test.ts`, `lib/customerIdentity/matching.test.ts` — one/many/none resolution, exact vs. possible-vs-fuzzy matching, disable never deletes.
