# VIA — Product Enrichment

## Is a Lamitak/EDL CSV necessary?

**Yes, eventually — but none exists in this codebase or this session to import.** Zoho Books items carry no `collection`, `finish`, `colour`, `pattern`, `application`, `catalogue URL`, `product image`, or `customer-safe description` fields today. A static Lamitak catalogue snapshot exists at `lib/data/lamitak-products.ts`/`lamitak-price-list.ts` (July 2025) but is explicitly documented elsewhere as **not authoritative for pricing** and was never wired into `ProductService`.

## What the CSV should contain, when provided

Per the brief's own field-ownership matrix:

| Field | Source of truth |
|---|---|
| Zoho Item ID, canonical code, active status, sales unit | Zoho Books (never overridden) |
| Item/design name, brand, size | Zoho if reliable, otherwise enrichment |
| Collection, finish, colour, pattern | Enrichment/catalogue |
| Product image, catalogue URL | Approved catalogue/website |
| Customer-safe description | Enrichment |
| Standard/customer price, Tier, Special Price classification | Never CSV — always live services |

A CSV row must reference the canonical Zoho item code (`item_code → normalized canonical code → Zoho Item → VIA enrichment record`) — never become an independent product master.

## What's built now vs. deferred

**Built**: `lib/utils/normalizeItemCode.ts`'s canonical-code normalization (now hyphen-insensitive), and `lib/products/specialPricePolicy.ts`'s pricing-group classification — both of which any future enrichment import would key off of.

**Deferred**: the actual `product_enrichment` table, the merge-read path (Zoho + enrichment, field-ownership-correct), and the CSV import pipeline (validate headers → normalize code → match Zoho item → preview → show conflicts → approve → write → audit). This is a real, separate piece of work that needs an actual CSV file to design against — building speculative import UI for data that doesn't exist yet was explicitly out of scope this pass (the brief's own framing: "if CSV is provided later").

## Conflict handling (when enrichment is eventually built)

- Zoho-owned field vs. enrichment disagreement → Zoho wins, never a silent overwrite.
- Enrichment-owned field with no ownership rule → `PRODUCT_DATA_CONFLICT`, surfaced internally, never guessed.
- CSV row with no matching Zoho item → `UNMATCHED_ENRICHMENT`, never auto-created as a sellable product.
- Zoho item deactivated → not shown as sellable regardless of what a stale CSV row still says.
