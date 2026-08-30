// ─── Varindo internal stock fallback ─────────────────────────────────────────────
// Brief Rule 5 / section 18: ONLY called after a vendor check has definitively
// resolved to VENDOR_OUT_OF_STOCK (enforced by lib/integrations/wati/stock/
// workflow.ts's state machine, not just by convention here). Reuses the
// existing lib/zoho/items.ts stock lookup — no new Zoho integration needed.

import { getItemWithStock } from '../../../zoho/items.ts';

export interface VarindoFallbackResult {
  availability: 'AVAILABLE' | 'OUT_OF_STOCK' | 'UNKNOWN';
  /**
   * Confidential. Named explicitly so a misuse (passing this into a customer
   * response or a model prompt) is obvious at the call site — only
   * disclosurePolicy.toCustomerStockResult() may read this field.
   */
  availableQuantityConfidential: number | null;
}

export async function checkVarindoAvailability(itemId: string): Promise<VarindoFallbackResult> {
  const stock = await getItemWithStock(itemId);
  if (!stock) return { availability: 'UNKNOWN', availableQuantityConfidential: null };
  const available = stock.total_available_stock;
  return {
    availability: available > 0 ? 'AVAILABLE' : 'OUT_OF_STOCK',
    availableQuantityConfidential: available,
  };
}
