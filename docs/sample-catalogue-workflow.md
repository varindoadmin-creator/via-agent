# VIA — Sample / Catalogue Workflow

## Architecture (preserved, not rebuilt)

```text
Customer → Website Form → Email Notification + Supabase Record → VIA
```

- **Website**: intake only. The actual form lives outside this repository — it inserts directly into Supabase's `requests` table (confirmed by code audit: no creation endpoint exists in this app for `requests`).
- **Supabase (`requests` table)**: the operational source of truth. Now has a tracked migration (`supabase/requests.sql`, additive/retroactive — the table already existed in production without one).
- **Email**: notification only, never authoritative. Since the website form is external, notification is decoupled via a new cron sweep (`app/api/requests/notify-sweep`, same pattern as the existing WATI sweeps) that polls for `notified_at IS NULL` rows, sends one digest email via the existing `lib/email/sendMail.ts`, and marks them notified. **An email failure leaves the row unnotified for the next run — the Supabase record is never at risk.**

## Status model

Reused the table's existing fixed status enum (`new | pending | completed | cancelled`), which each of the three admin pages (`/requests/samples`, `/requests/catalogues`, `/requests/quotes`) already maps onto its own display labels (e.g. samples: New/Requested to Vendor/Sent to Customer/Cancelled). No new status model was introduced.

## Customer identity matching

`lib/companyKnowledge/requestIdentityMatch.ts`'s `matchRequestPhoneToIdentity()` — read-only enrichment added to all three admin views' API routes, reusing Phase 6's `resolveCustomerIdentities()`. Returns `KNOWN` / `MULTIPLE` / `UNKNOWN`, never guesses when a phone maps to more than one customer, and never creates a Zoho customer merely because a request exists — customer onboarding into Zoho only happens when the actual commercial process requires it (unchanged, pre-existing behavior).

## WATI-side behavior

`SAMPLE_CATALOGUE_REQUEST` intent (keywords: "sample", "katalog") replies with the brand-specific website only — `varindo.co.id` for Lamitak, `varindohpl.com` for EDL, or both if no brand was named. WATI never re-collects company/email/address/sample details that the website form already captures.

## Physical/exception requests

A customer who says they can't use the website is routed to the existing Phase 8 human handoff (`triggerHandoff`) rather than a new queue — no free sample, shipping timing, or quantity is ever promised by VIA without human approval.
