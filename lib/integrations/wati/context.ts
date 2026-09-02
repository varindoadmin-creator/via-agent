// ─── WATI short conversation context ────────────────────────────────────────────
// Brief section 23: a follow-up like "stock?" after "ATP11358M" should resolve
// against the prior message's product, without needing a debounce/coalescing
// system (none exists in this repo — see the Phase 2 plan's documented
// limitation on section 22). This looks back a few minutes of message history
// instead of batching sends.

import { fetchRecentWatiMessages } from './store.ts';

/**
 * 2026-09-02 (live WABA test): 10 minutes was too short for realistic B2B
 * pacing — a real customer asked about edging, then came back 13m40s later
 * ("Bisa beli 15 meter?") to find the carried product context had already
 * expired, so the follow-up had nothing to resolve against. Widened to a
 * more forgiving default; still bounded (never the full 24h WhatsApp session
 * window) so a customer who's clearly moved to an unrelated topic hours
 * later doesn't get a stale product silently assumed.
 */
function lookbackMinutes(): number {
  const value = Number(process.env.WATI_CONTEXT_LOOKBACK_MINUTES);
  return Number.isFinite(value) && value > 0 ? value : 30;
}
const LOOKBACK_LIMIT = 8;

export interface ConversationContext {
  /** A product code/name carried over from a recent message in the same conversation, if any. */
  carriedProductCode: string | null;
  carriedBrand: string | null;
}

export async function resolveConversationContext(customerPhoneNormalized: string | null): Promise<ConversationContext> {
  if (!customerPhoneNormalized) return { carriedProductCode: null, carriedBrand: null };
  try {
    const recent = await fetchRecentWatiMessages(customerPhoneNormalized, lookbackMinutes(), LOOKBACK_LIMIT);
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
