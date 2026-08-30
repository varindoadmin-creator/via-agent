// ─── Stock disclosure policy ─────────────────────────────────────────────────────
// Brief Rule 2 + section 10/11/34: this is THE enforcement point for stock
// confidentiality. Its return type has no quantity field — structurally, not
// just by convention, so no caller downstream of this function can leak an
// exact quantity to a customer even by mistake.

export type CustomerStockResult = 'AVAILABLE' | 'SUFFICIENT' | 'INSUFFICIENT' | 'OUT_OF_STOCK' | 'UNKNOWN';

export interface DisclosureInput {
  /** null = existence-only inquiry (Type A); a Type B/C inquiry always has this. */
  requestedQuantity: number | null;
  /** Confidential — read here and nowhere else customer-facing. */
  availableQuantity: number | null;
  /** When the source only confirmed/denied availability without a number. */
  availability: 'AVAILABLE' | 'OUT_OF_STOCK' | 'UNKNOWN';
}

/**
 * The only function in this codebase allowed to turn a confidential quantity
 * into a customer-facing signal. Never returns the quantity itself.
 */
export function toCustomerStockResult(input: DisclosureInput): CustomerStockResult {
  if (input.availability === 'UNKNOWN') return 'UNKNOWN';

  if (input.requestedQuantity == null) {
    // Existence-only inquiry — availability alone answers it.
    return input.availability === 'AVAILABLE' ? 'AVAILABLE' : 'OUT_OF_STOCK';
  }

  if (input.availability === 'OUT_OF_STOCK') return 'OUT_OF_STOCK';

  // AVAILABLE with a specific requested quantity: only a known available
  // quantity can answer sufficiency. No number known but marked AVAILABLE
  // (e.g. vendor just said "ada" with no count) is not enough information for
  // a quantity-specific request — caller must route this to NEEDS_HUMAN
  // rather than treating it as automatically sufficient.
  if (input.availableQuantity == null) return 'UNKNOWN';
  return input.availableQuantity >= input.requestedQuantity ? 'SUFFICIENT' : 'INSUFFICIENT';
}
