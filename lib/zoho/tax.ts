// ─── Tax computation ─────────────────────────────────────────────────────────
// Brief section 9/10: pricing and tax are separate concerns, and tax is never
// hardcoded — the rate always comes from the live Zoho item's own
// tax_percentage field. Deterministic integer-cent-safe arithmetic (no
// floating-point financial errors, brief section 9's explicit requirement).

/** IDR has no subunit in practice — round to the nearest whole Rupiah. */
export function computeDisplayPrice(baseRateExclTax: number, taxPercentagePoints: number): number {
  // Work in integer "basis points of a rupiah" (×100) to avoid float drift,
  // then round back down to whole Rupiah.
  const baseCents = Math.round(baseRateExclTax * 100);
  const taxCents = Math.round((baseCents * taxPercentagePoints) / 100);
  return Math.round((baseCents + taxCents) / 100);
}

/** Deterministic `Rp2.886.000` formatting — Varindo's standard customer-facing format. */
export function formatIDR(amount: number): string {
  const rounded = Math.round(amount);
  return `Rp${rounded.toLocaleString('id-ID')}`;
}
