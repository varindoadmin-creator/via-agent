// ─── Website price mismatch detection ───────────────────────────────────────────
// Brief section 13/42: the inbound website-displayed price is context only,
// never authoritative — but comparing it to the current approved price is
// valuable internal telemetry for catching stale website pricing. Internal
// only; the customer is never told about a mismatch, they just always get the
// current correct price (built elsewhere in this module from
// customerSafePrice.ts, never from the inbound text).

export interface WebsiteMismatchResult {
  mismatched: boolean;
  websiteDisplayedPrice: number;
  currentApprovedPrice: number;
}

/** A tiny tolerance absorbs rounding differences between tax-inclusive display conventions — not a real mismatch. */
const TOLERANCE_RUPIAH = 5;

export function checkWebsitePriceMismatch(websiteDisplayedPrice: number | null, currentApprovedPrice: number): WebsiteMismatchResult | null {
  if (websiteDisplayedPrice == null) return null;
  const mismatched = Math.abs(websiteDisplayedPrice - currentApprovedPrice) > TOLERANCE_RUPIAH;
  return { mismatched, websiteDisplayedPrice, currentApprovedPrice };
}

/** Internal-only observability event — never surfaced to the customer. */
export function logWebsitePriceMismatch(itemCode: string | null, result: WebsiteMismatchResult): void {
  if (!result.mismatched) return;
  console.info('[wati.pricing]', JSON.stringify({
    event: 'price.website_mismatch',
    itemCode,
    websiteDisplayedPrice: result.websiteDisplayedPrice,
    currentApprovedPrice: result.currentApprovedPrice,
  }));
}
