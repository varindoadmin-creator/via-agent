# VIA Customer Operations — Phase 5 (Product Intelligence, Approved Pricing, Tax)

## Authoritative price source

**Live Zoho data, via the pricing chain that already existed before this phase**: `lib/zoho/customerPricing.ts`'s `getCustomerItemPrice()` (tier-based pricebook rate with base-item-rate fallback, already used by the internal Jarvis tool `get_customer_price`). Phase 5 adds a thin orchestration layer (`lib/zoho/pricing.ts`'s `resolveAuthoritativePrice()`) on top of it — no new Zoho integration.

**Explicitly not authoritative**: `lib/data/lamitak-price-list.ts` and `lib/data/lamitak-products.ts`. These are static, generated-once (July 2025) snapshots — confirmed by grep to be imported nowhere in the live app. Using them as a live pricing source would risk quoting a stale price, directly violating this phase's own non-negotiable criteria. They remain useful only for their structured attributes (`collection`, `subCollection`, `designName`) that Zoho's own item records don't carry — a candidate input for future product search/recommendation work, not pricing.

Inbound WhatsApp/website prices (e.g. a structured message's `Harga: Rp. 2.886.000`) are never authoritative — see "Website price validation" below.

## Product resolution

Unchanged from Phase 2 (`lib/integrations/wati/productResolution.ts`) — exact/ambiguous/not-found via `lib/zoho/items.ts`'s search + scoring. Phase 5 adds no new product-matching logic; it only adds what happens *after* a product resolves.

## Tax computation

`lib/zoho/tax.ts`. `taxPercentage` always comes from the live Zoho item's own `tax_percentage` field — never hardcoded (confirmed 11% PPN on real data: `ATP 11358M`, `rate 2,600,000` → `2,886,000` incl., matching the brief's own worked example exactly). `computeDisplayPrice()` works in integer basis-points internally to avoid floating-point drift. `formatIDR()` produces `Rp2.886.000` (no space) — deliberately distinct from the existing internal `lib/utils/money.ts`'s `formatRupiah()`, which outputs `Rp 2.886.000` (with a space) for internal reports; the two conventions were already different before this phase and this doesn't attempt to unify them.

## Lamitak size resolution (`lib/integrations/wati/pricing/lamitakSize.ts`)

The brief's digit-count rule (4-digit motif → 4×8, 5-digit → 4×10) was spot-checked against real data and holds (`ATP 11358M` → 5 digits → `4'x10'`; `ART 1009XM` → 4 digits → `4'x8'`). It is implemented as a **disambiguation signal only** — once a product resolves to one exact Zoho item, that item's own name already states its size as text (`extractSizeFromItemName`), which is authoritative. The digit rule and `detectCustomerStatedSize()` (explicit customer phrasing — "jumbo", "3 meter", "4x10" — always overrides inference) exist for the case where a code doesn't resolve to one exact item.

## Customer-safe price DTO (`lib/integrations/wati/pricing/customerSafePrice.ts`)

`CustomerSafePrice { productId, itemCode, amount, currency, taxIncluded, taxRate, priceType, validAsOf, sourceStatus }`. Structurally excludes cost/margin/markup/discount-floor — not by field-stripping after the fact, but because `resolveAuthoritativePrice()` never fetches Zoho's purchase-rate fields in the first place. `sourceStatus: 'NOT_FOUND'` (never a guessed amount) when the item can't be resolved.

## Customer-specific pricing

Reuses the existing tier/pricebook system unchanged — a matched customer's own pricebook rate is used when one exists (`priceType: 'CUSTOMER_SPECIFIC'`), otherwise the standard base rate (`priceType: 'STANDARD'`). Ownership is inherent to the design: `resolveAuthoritativePrice()` only ever looks up the *requesting* customer's own price — there is no code path that accepts an arbitrary `customerId` from customer-supplied text. "PT ABC dapat harga berapa?" is denied before any price lookup is attempted at all (see Security below).

## Website price validation

`lib/integrations/wati/pricing/websiteMismatch.ts`. Runs whenever a structured website message (Phase 2's `parseWebsiteStructuredProduct`) carried a displayed price and the product resolves exactly — **independent of which intent fired**, since a pure product-inquiry-shaped website message (Case C) should still get this internal check even though its customer-facing reply doesn't change. Compares the inbound price to the freshly-resolved authoritative price with a small rounding tolerance; logs `price.website_mismatch` (`console.info`, internal only) when they differ. The customer is never told about a mismatch and never receives the stale inbound figure — they always get the current authoritative price when they explicitly ask about price.

## Stock + price combined (brief section 21)

New intents `PRICE_INQUIRY` (Phase 2 defined this in the type but never actually produced it deterministically — Phase 5 closes that gap) and `STOCK_AND_PRICE_INQUIRY`, detected via a `harga` keyword alongside the existing stock-keyword check in `lib/integrations/wati/intent.ts`. `pipeline.ts`'s `startPriceInquiry()` resolves price first (always answerable if verified), then — only for the combined intent — runs the exact same Phase 3 vendor-first stock workflow (`startVendorCheck`), composing one message: price line + the appropriate stock line (ack, needs-quantity prompt, or nothing extra for the silent-escalation `NEEDS_HUMAN`/`VENDOR_CLOSED` cases). Stock count confidentiality is unchanged — the combined response never states a quantity.

## Security (Phase 4 reuse — no new classification categories)

`APPROVED_PRICE`/`CUSTOMER_SAFE_STOCK` (already `CUSTOMER_SHAREABLE`, already `ALLOW`) and `SUPPLIER_COST`/`MARGIN`/`PURCHASE_PRICE`/`DISCOUNT_FLOOR` (already `CONFIDENTIAL`, already `DENY`) required zero new entries in `lib/security/disclosure/classification.ts` — this phase is additive on intents, not on the policy matrix. Two real Phase 4 gaps surfaced during this audit and were fixed:

1. **`INTERNAL_METRIC_PATTERN` didn't catch "modal"** (brief Test 48) — added, along with `\w*` suffix tolerance on every bare keyword in that pattern (a general bug: Indonesian suffixes like `-nya` attach with no word boundary, so `\bmodal\b` never matched `modalnya`; this affected the original Phase 4 patterns too and is now fixed there as well).
2. **`OTHER_CUSTOMER_INQUIRY` didn't catch a price-context question about another company** (brief Test 53, "PT ABC dapat ATP11358M harga berapa?") — the entity-combo pattern is now broader (`harga`, `dapat`) than the bare "my own order" fallback pattern, which stays narrow specifically so "saya mau tanya harga produk" (very common, no company named) isn't misfired as `ORDER_STATUS_INQUIRY`.

Every price response — verified, not-found, or the combined stock+price message — still passes through `sendWatiTextGated`'s structural disclosure gate before sending, unchanged from Phase 4.

## Discount requests

New `DISCOUNT_REQUEST` intent (brief sections 37–38: "Bisa kurang?", bulk/project pricing) — no approved automatic-discount policy exists, so this always routes to human/Sales handoff and marks the conversation `NEEDS_HUMAN` (same suppression mechanism as `HUMAN_REQUEST`) so VIA doesn't keep auto-responding about pricing while a human is handling the negotiation.

## Tests

`lib/zoho/tax.test.ts`, `lib/integrations/wati/pricing/*.test.ts` (23 tests) plus additions to `intent.test.ts`/`responseDecision.test.ts` (16 tests) — directly covering the brief's test cases 48–59: standard price with correct tax and no confidential fields, structured website price never trusted, price+stock combined never discloses a count, the two fixed Phase 4 gaps, ambiguous-size never guessed, unknown product → `PRODUCT_NOT_FOUND`, discount → human handoff, prompt injection → permissions unchanged.

## Known limitations (deferred, documented in the approved plan)

- Product search/recommendation by semantic attribute ("cari motif marmer putih") — needs the static catalogue's attributes properly wired into a real search index; not a quick add-on.
- Product images/documents sending via WATI.
- The admin product/pricing diagnostics view.
- Full observability event catalog beyond `price.website_mismatch` — the one with an immediate concrete detection mechanism already available from Phase 2's parsed data.
- Feature-flag-gated staged rollout — shipping directly with the same admin-in-the-loop-by-default posture already established in Phases 2–4; nothing here auto-sends anything at a higher trust level than what Phase 2's product-info responses already did.
- The "smart ambiguous-size clarification" refinement (detecting that AMBIGUOUS candidates differ only by size and asking the specific size question instead of the generic clarification) was not built — an ambiguous price-shaped product currently falls back to the existing generic Case E clarification, which is safe (never guesses) but less specific than it could be.

## Next phase

Recommend **Customer Operations Phase 6 — Order Intent, Quotation & Sales Order Preparation** — not started, per the brief's instruction.
