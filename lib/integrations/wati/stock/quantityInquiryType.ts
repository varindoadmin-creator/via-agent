// ─── Stock inquiry quantity-type classification ─────────────────────────────────
// Brief section 8: three shapes of stock question, each with a different safe
// response. This is the logic gap Phase 2 didn't have — it treated every
// STOCK_CHECK the same way.

import { extractQuantity, type ExtractedQuantity } from '../quantity.ts';

export type StockInquiryType = 'EXISTENCE' | 'QUANTITY_SPECIFIC' | 'COUNT_INQUIRY';

const COUNT_QUESTION_PATTERN = /\bberapa\b/i;

export interface QuantityClassification {
  type: StockInquiryType;
  quantity: ExtractedQuantity | null;
}

/**
 * Type B (QUANTITY_SPECIFIC) wins over Type C even if "berapa" also appears,
 * since an explicit number in the same message ("ada berapa banyak, minimal
 * 20?") already answers the question a Type C flow would otherwise ask.
 */
export function classifyQuantityInquiry(text: string): QuantityClassification {
  const quantity = extractQuantity(text);
  if (quantity) return { type: 'QUANTITY_SPECIFIC', quantity };
  if (COUNT_QUESTION_PATTERN.test(text)) return { type: 'COUNT_INQUIRY', quantity: null };
  return { type: 'EXISTENCE', quantity: null };
}
