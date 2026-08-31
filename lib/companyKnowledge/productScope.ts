// ─── Commercial product scope ──────────────────────────────────────────────────
// VIA Product/Pricing/Company Architecture brief, sections 9-11: Varindo's
// approved commercial catalogue is HPL from Lamitak and EDL only. This is
// deliberately separate from lib/zoho/brands.ts's BRAND_VENDORS map — that map
// is Phase 3's stock-check VENDOR-ROUTING table (which vendor entity to query
// for stock on an already-resolved SKU) and lists several other brand names
// for that unrelated purpose. This module never reads or modifies it.

export const APPROVED_HPL_BRANDS = ['LAMITAK', 'EDL'] as const;

// A curated denylist for the decline path (brief sections 10-11) — common
// competitor HPL brand names and explicitly unsupported product categories.
// Not exhaustive by design: an unrecognized brand/product simply falls
// through to normal product resolution (NOT_FOUND), which already declines
// to invent a product — this list only exists to produce the specific,
// approved "we don't carry this" wording rather than a generic not-found reply.
//
// DELIBERATELY EXCLUDES AICA, TACO, CARTA, GRASMERINO, GREENLAM: this brief's
// stated commercial scope (EDL/Lamitak only) directly conflicts with
// lib/zoho/brands.ts's BRAND_VENDORS map, which already routes real Zoho
// stock-check/PO traffic to those five brands via named, working vendor
// relationships (Phase 3, untouched by this change). Rather than silently
// picking a side, this is a PRODUCT_DATA_CONFLICT surfaced in the phase
// report — see docs/product-source-of-truth.md — and none of the five is
// added to this denylist, so existing Phase 3 behavior for them is
// unaffected either way.
const KNOWN_UNSUPPORTED_HPL_BRANDS = ['ARBORITE', 'WILSONART', 'FORMICA', 'DECOLAM'];
const UNSUPPORTED_PRODUCT_CATEGORIES = ['PLYWOOD', 'TRIPLEK', 'MULTIPLEK', 'MULTIPLEX'];

export interface ScopeCheckResult {
  inScope: boolean;
  matchedUnsupportedBrand: string | null;
  matchedUnsupportedCategory: string | null;
}

/** Deterministic keyword check — never expands scope from general model knowledge (brief section 9's explicit instruction). */
export function checkCommercialScope(messageText: string): ScopeCheckResult {
  const normalized = (messageText || '').toUpperCase();
  const matchedUnsupportedBrand = KNOWN_UNSUPPORTED_HPL_BRANDS.find(b => normalized.includes(b)) ?? null;
  const matchedUnsupportedCategory = UNSUPPORTED_PRODUCT_CATEGORIES.find(c => normalized.includes(c)) ?? null;
  return {
    inScope: !matchedUnsupportedBrand && !matchedUnsupportedCategory,
    matchedUnsupportedBrand,
    matchedUnsupportedCategory,
  };
}

// Brief section 10 — exact approved wording for an unsupported HPL brand.
export const UNSUPPORTED_BRAND_TEXT = 'Mohon maaf Pak/Bu, saat ini Varindo tidak menjual HPL merek tersebut. Produk HPL yang kami sediakan adalah EDL dan Lamitak.';
// Brief section 11 — exact approved wording for plywood/unsupported products.
export const UNSUPPORTED_CATEGORY_TEXT = 'Mohon maaf Pak/Bu, Varindo tidak menjual plywood. Produk yang kami sediakan berfokus pada HPL EDL dan Lamitak.';
