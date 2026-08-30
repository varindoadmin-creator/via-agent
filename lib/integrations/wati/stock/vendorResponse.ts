// ─── Vendor response normalization ──────────────────────────────────────────────
// Brief section 15: admin-entered vendor text ("ada 75", "kosong", "besok
// ada") normalized deterministically first. Only genuinely ambiguous text
// falls through to a narrow model call — and even then, an unparseable result
// is NEEDS_HUMAN, never a guessed availability. This is admin-entered text,
// not raw customer input, but the same "never guess" posture applies: the
// business cost of a wrong OUT_OF_STOCK/AVAILABLE call is high enough that a
// human should resolve genuine ambiguity, not a model.

export type ParsedVendorAvailability = 'AVAILABLE' | 'OUT_OF_STOCK' | 'AMBIGUOUS' | 'FUTURE_AVAILABILITY' | 'UNKNOWN';

export interface ParsedVendorResponse {
  availability: ParsedVendorAvailability;
  quantity: number | null;
}

const OUT_OF_STOCK_PATTERN = /\b(kosong|habis|tidak ada|out of stock|nihil)\b/i;
const FUTURE_PATTERN = /\b(besok|minggu depan|nanti|next week|tomorrow)\b.*\bada\b|\bada\b.*\b(besok|minggu depan|nanti|next week|tomorrow)\b/i;
const AVAILABLE_PATTERN = /\b(ada|ready|tersedia|cukup|available)\b/i;
const QUANTITY_PATTERN = /\b(\d+(?:[.,]\d+)?)\b/;

/**
 * Deterministic-only pass. Returns null when the text needs a human to
 * interpret (never guessed) — there is no model fallback for vendor responses
 * by design: this feeds a business decision (fallback to Varindo stock,
 * or tell the customer OUT_OF_STOCK), which must be reviewable and reversible
 * by a human, not silently model-decided.
 */
export function parseVendorResponse(rawText: string): ParsedVendorResponse {
  const text = rawText.trim();
  if (!text) return { availability: 'UNKNOWN', quantity: null };

  if (FUTURE_PATTERN.test(text)) return { availability: 'FUTURE_AVAILABILITY', quantity: null };

  // Out-of-stock phrasing wins over a stray "ada" elsewhere (e.g. "tidak ada stok").
  if (OUT_OF_STOCK_PATTERN.test(text)) return { availability: 'OUT_OF_STOCK', quantity: null };

  if (AVAILABLE_PATTERN.test(text)) {
    const quantityMatch = text.match(QUANTITY_PATTERN);
    const quantity = quantityMatch ? Number(quantityMatch[1].replace(',', '.')) : null;
    return { availability: 'AVAILABLE', quantity: Number.isFinite(quantity) ? quantity : null };
  }

  return { availability: 'AMBIGUOUS', quantity: null };
}
