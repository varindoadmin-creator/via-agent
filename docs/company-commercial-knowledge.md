# VIA — Company & Commercial Knowledge

## One canonical source, two consumers

`lib/companyKnowledge/` is the single source of truth for company identity, brand relationships, payment destination, shipping policy, and product scope. Both the WATI customer pipeline (via `lib/integrations/wati/companyKnowledge/responses.ts`) and internal Jarvis (via `lib/jarvis/knowledge/catalog.ts`'s `COMPANY_REFERENCE` entries, generated from these same modules) read from it — this resolves a pre-existing inconsistency where a separate, unrelated `knowledge/varindo/business-rules.md` file and the internal RAG catalog held different, uncoordinated content.

## Modules

- `companyIdentity.ts` — legal entity `CV. VARINDO FORMA HUTAMA`, head office (Branz BSD Tower A), registered office (Bandung), contact. All `PUBLIC`.
- `brandRelationships.ts` — the two approved authorized-dealer statements (Lamitak, EDL) and their brand websites (`varindo.co.id`, `varindohpl.com` respectively). Deliberately fixed sentences, never upgraded to "exclusive/sole/master distributor."
- `paymentDestination.ts` — the one `ACTIVE` approved BCA account. `CUSTOMER_SHAREABLE`.
- `shippingPolicy.ts` — deterministic, Asia/Jakarta-safe 14:00 WIB Monday-Friday cutoff logic, Jabodetabek-vs-outside dispatch commitments (never an arrival promise), and Java free-shipping eligibility (a deterministic province/city allow-list — ask if unclear, never guessed).
- `productScope.ts` — the approved EDL/Lamitak-only commercial scope and the decline templates for unsupported brands/plywood.

## Disclosure classification

Four new `PUBLIC`/`CUSTOMER_SHAREABLE` categories were added to `lib/security/disclosure/classification.ts`: `COMPANY_INFO`, `DEALER_STATUS`, `SHIPPING_POLICY`, `PAYMENT_DESTINATION` — all `Allow` for any audience, reusing the existing extensible policy matrix rather than a new mechanism.

## WATI intents

Seven new deterministic `WatiIntent` values were added to `lib/integrations/wati/intent.ts`, each with its own regex pattern checked early in the deterministic chain (before the generic fallback), and a corresponding branch in `lib/integrations/wati/responseDecision.ts`: `COMPANY_INFO_INQUIRY`, `DEALER_STATUS_INQUIRY`, `SHIPPING_POLICY_INQUIRY`, `PAYMENT_DESTINATION_INQUIRY`, `TIER_OR_PRICING_CLASSIFICATION_PROBE`, `UNSUPPORTED_PRODUCT_INQUIRY`, `SAMPLE_CATALOGUE_REQUEST`. None of these use an LLM to generate customer-facing text — every reply is a fixed template, same convention as every other domain.

## Admin UI

`/knowledge` — a read-only, sectioned display (Company/Brands/Shipping/Payment/Product Scope/Sample-Catalogue) of these same modules, so the admin view and the WATI/Jarvis responses can never drift apart. Facts are code-deployed and versioned in source this pass; a live-editable form is a documented deferral.
