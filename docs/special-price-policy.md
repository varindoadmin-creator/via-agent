# VIA — Special Price Policy

## Purpose

`lib/products/specialPricePolicy.ts`'s `classifyPricingGroup(itemCode)` is a **pure, internal classification** — `STANDARD` | `EDL_SPECIAL` | `LAMITAK_SPECIAL`. It never computes a discount or a price; actual dollar pricing remains 100% Zoho-pricebook-driven via `lib/zoho/customerPricing.ts`, completely unchanged by this module. No discount-percentage matrix is invented — the brief explicitly forbids hardcoding percentages not present in an approved matrix, and none was given this pass.

## Approved prefixes

- **EDL Special**: `DC, DS, DSD, DSF, DSL, DSW, DV, DWL, DWV, ESS, EST, L-FA`
- **Lamitak Special**: `ARTE, ART, CC, CCM, CCP, CCX, ATS, ATP, ATW, CATS, CATP`

Matching is longest-prefix-first (`ARTE` before `ART`, `CCM`/`CCP`/`CCX` before `CC`) — never naive substring/list-order matching, which would misclassify an `ARTE`-coded product as the shorter `ART` group.

## Where this is used

- `/inventory/products`'s product-source diagnostic view (internal admin only).
- Available for future internal Jarvis analytics/reporting — never surfaced to a customer.

## Customer confidentiality

Special Price classification is `INTERNAL` in `lib/security/disclosure/classification.ts`'s policy matrix — `evaluateDisclosure()` denies it for any external audience. A customer asking "Produk ini masuk Special Price?" is detected as `TIER_OR_PRICING_CLASSIFICATION_PROBE` and answered with the same fixed price-check redirect used for Tier probes — never confirming or denying a product's internal classification.

## A known, deliberately unresolved conflict

This brief's stated commercial scope is "EDL and Lamitak only," but `lib/zoho/brands.ts`'s `BRAND_VENDORS` map — Phase 3's real, working stock-check vendor-routing table — already routes live traffic for **AICA, TACO, CARTA, GRASMERINO, and GREENLAM** as well. This phase does not silently resolve that conflict either way: `lib/companyKnowledge/productScope.ts`'s unsupported-brand denylist deliberately excludes all five names, so Phase 3's existing behavior for them is completely unaffected. This is a `PRODUCT_DATA_CONFLICT` per the brief's own framework (§8) and should be resolved by whoever owns the actual commercial-scope decision, not by this implementation guessing.
