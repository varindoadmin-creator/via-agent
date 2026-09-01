# VIA — Customer Pricing Policy

## Standard vs. customer-final pricing

- **Standard price**: the approved selling price with no customer-specific assignment. Resolved by `lib/zoho/pricing.ts`'s `resolveAuthoritativePrice()`.
- **Customer-final price**: `lib/zoho/customerPricing.ts`'s `getCustomerItemPrice()` resolves the customer's Zoho `cf_tier` custom field → the matching Zoho pricebook (`lib/zoho/pricebookConfig.ts`'s `TIER_PRICEBOOK_MAP`) → the live pricebook item rate (`lib/zoho/pricebooks.ts`, 30-minute cache), falling back to the base item rate when no tier-specific rate exists.
- Both flow through `lib/zoho/tax.ts`'s `computeDisplayPrice()` for PPN, using the item's own live `tax_percentage` — never a hardcoded rate.
- The customer-facing DTO (`lib/integrations/wati/pricing/customerSafePrice.ts`'s `CustomerSafePrice`) structurally excludes Tier, discount percentage, cost, and margin — there is no field to leak, by construction.

**Jarvis never calculates or guesses a price.** Every price shown to a customer traces back through this exact chain — never WATI text, website text, customer claims, old chat history, RAG, model memory, supplier cost, or a margin calculation.

## New customer default

A new Zoho customer's `cf_tier` defaults to no assigned tier (`No Discount`) — standard pricing applies automatically, with no code needed to enforce this (it's the field's own Zoho default). Tier assignment is manual-admin-only via `app/customers/page.tsx`'s Tier dropdown; Jarvis never assigns a Tier.

## Tier confidentiality

Tier is internal/confidential. `lib/security/disclosure/classification.ts` now carries a `CUSTOMER_TIER` category (`INTERNAL`), which `evaluateDisclosure()` denies for any `EXTERNAL_CUSTOMER` audience. A customer asking "Tier saya apa?" or "kenapa harga saya beda?" is detected as `TIER_OR_PRICING_CLASSIFICATION_PROBE` (`lib/integrations/wati/intent.ts`) and answered with a fixed redirect — "Baik Kak, kami dapat membantu cek harga yang berlaku untuk akun perusahaan Kakak. Boleh diinformasikan kode produknya?" — never a Tier name, ID, or discount percentage, and never escalated to a human (Jarvis can already help with the real price deterministically).

## WATI never receives Tier data

Nothing in `lib/customerIdentity/watiContactSync.ts` (Phase 6's WATI contact-attribute sync) ever includes Tier, discount, price list, or Special Price classification — only safe customer fields are synced.
