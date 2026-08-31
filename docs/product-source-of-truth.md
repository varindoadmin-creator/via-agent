# VIA — Product Source of Truth

## Hierarchy

```text
Zoho Books Items          — canonical operational product master
VIA ProductService        — normalized customer-safe product access
                             (lib/integrations/wati/productResolution.ts)
Approved enrichment       — optional metadata only (deferred this pass — see docs/product-enrichment.md)
PricingService            — standard approved selling price (lib/zoho/pricing.ts)
CustomerPricingService    — customer-specific final approved price (lib/zoho/customerPricing.ts)
SpecialPricePolicy        — internal pricing classification (lib/products/specialPricePolicy.ts)
TaxService                — PPN calculation (lib/zoho/tax.ts)
Phase 3 Stock Service     — stock availability (vendor-first)
Company Knowledge         — static Varindo facts/policies (lib/companyKnowledge/)
```

## Which Zoho Item fields are reliable

Audited against the live codebase's actual usage, not assumed:

| Field | Reliable? | Notes |
|---|---|---|
| `item_id` | Yes | Canonical identity everywhere. |
| `sku` | Yes | The canonical item code, normalized via `normalizeItemCode()` (space/hyphen/case-insensitive). |
| `status` (active/inactive) | Yes | Authoritative — an inactive item is never treated as sellable regardless of any enrichment data. |
| `name` | Yes, when populated | Used directly as the design name where no enrichment exists. |
| `rate` | Yes, but never used directly as customer price | Feeds `PricingService`, not shown raw. |
| `tax_percentage` | Yes | `TaxService` reads this live, never a hardcoded PPN rate. |
| Size/collection/finish/colour | **Not tracked in Zoho** | These fields don't exist on Zoho items today — see `docs/product-enrichment.md`. |

## Zoho → ProductService flow

1. Customer text arrives at `lib/integrations/wati/intent.ts`, which extracts a candidate code via `ITEM_CODE_PATTERN`.
2. `lib/integrations/wati/productResolution.ts`'s `resolveProduct()` normalizes the candidate (`normalizeItemCode()` — now hyphen-insensitive, fixed this pass) and calls `lib/zoho/items.ts`'s `searchItems()`/`scoreItemMatch()`, returning `EXACT` / `AMBIGUOUS` / `NOT_FOUND` — never a guess.
3. `EXACT` resolutions carry the full `ZohoItem` forward; `AMBIGUOUS` asks for clarification; `NOT_FOUND` never invents a product.
4. `Zoho active/inactive status wins` unconditionally — this is enforced at the source (Zoho's own item status), so no downstream code needs to re-check it.

## Field-level ownership matrix

See `docs/customer-pricing-policy.md` for the pricing-specific rows and `docs/product-enrichment.md` for the full table including deferred enrichment fields.
