// ─── WATI short conversation context ────────────────────────────────────────────
// Brief section 23: a follow-up like "stock?" after "ATP11358M" should resolve
// against the prior message's product, without needing a debounce/coalescing
// system (none exists in this repo — see the Phase 2 plan's documented
// limitation on section 22). This looks back a few minutes of message history
// instead of batching sends.

import { fetchRecentWatiMessages } from './store.ts';

const LOOKBACK_MINUTES = 10;
const LOOKBACK_LIMIT = 5;

export interface ConversationContext {
  /** A product code/name carried over from a recent message in the same conversation, if any. */
  carriedProductCode: string | null;
  carriedBrand: string | null;
}

export async function resolveConversationContext(customerPhoneNormalized: string | null): Promise<ConversationContext> {
  if (!customerPhoneNormalized) return { carriedProductCode: null, carriedBrand: null };
  try {
    const recent = await fetchRecentWatiMessages(customerPhoneNormalized, LOOKBACK_MINUTES, LOOKBACK_LIMIT);
    for (const row of recent) {
      if (row.item_code) return { carriedProductCode: row.item_code, carriedBrand: row.brand };
    }
    return { carriedProductCode: null, carriedBrand: null };
  } catch (error) {
    // Context is an enhancement, not a correctness requirement — never fail the
    // webhook over a lookback query.
    console.warn('[wati.context]', JSON.stringify({ event: 'lookback_failed', error: error instanceof Error ? error.message : 'unknown' }));
    return { carriedProductCode: null, carriedBrand: null };
  }
}
