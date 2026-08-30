// ─── Conversational quantity follow-up ──────────────────────────────────────────
// Brief section 9: after VIA asks "berapa yang dibutuhkan?", a bare reply like
// "20" must attach to the EXISTING inquiry, never create a new one. Checked in
// the pipeline BEFORE normal intent detection, since a bare number wouldn't
// classify as anything useful there.

import { extractQuantity } from '../quantity.ts';
import { findOpenNeedsQuantityInquiry, type StockInquiryRow } from './store.ts';

const BARE_NUMBER_PATTERN = /^\s*(\d+(?:[.,]\d+)?)\s*$/;

export interface QuantityFollowUpMatch {
  inquiry: StockInquiryRow;
  quantity: number;
  unit: string | null;
}

/** Returns null when there's no open NEEDS_QUANTITY inquiry, or the text doesn't look like a quantity reply. */
export async function matchQuantityFollowUp(conversationId: string | null, text: string): Promise<QuantityFollowUpMatch | null> {
  if (!conversationId) return null;
  const inquiry = await findOpenNeedsQuantityInquiry(conversationId);
  if (!inquiry) return null;

  const extracted = extractQuantity(text);
  if (extracted) return { inquiry, quantity: extracted.quantity, unit: extracted.unit };

  const bareMatch = text.match(BARE_NUMBER_PATTERN);
  if (bareMatch) {
    const quantity = Number(bareMatch[1].replace(',', '.'));
    if (Number.isFinite(quantity) && quantity > 0) return { inquiry, quantity, unit: null };
  }

  return null;
}
