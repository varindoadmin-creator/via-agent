// ─── WATI product resolution ────────────────────────────────────────────────────
// Resolves a customer-provided code/name against VIA's actual Zoho item
// catalogue (brief section 9). Reuses lib/zoho/items.ts's search + scoring and
// lib/utils/normalizeItemCode.ts's code normalization — never invents a match.

import { searchItems, scoreItemMatch } from '../../zoho/items.ts';
import { buildSearchVariants } from '../../utils/normalizeItemCode.ts';
import { resolveBrandForVendorName } from '../../zoho/brands.ts';
import type { ZohoItem } from '../../../types/zoho.ts';

export type ProductResolutionStatus = 'EXACT' | 'AMBIGUOUS' | 'NOT_FOUND';

export interface ProductResolutionResult {
  status: ProductResolutionStatus;
  item: ZohoItem | null;
  brand: string | null;
  candidates: ZohoItem[];
}

const EXACT_THRESHOLD = 0.9;
const CANDIDATE_THRESHOLD = 0.5;
const AMBIGUITY_GAP = 0.15;

export async function resolveProduct(codeOrText: string): Promise<ProductResolutionResult> {
  const variants = buildSearchVariants(codeOrText);
  const seen = new Map<string, ZohoItem>();
  for (const variant of variants) {
    const results = await searchItems(variant, 10);
    for (const item of results) if (!seen.has(item.item_id)) seen.set(item.item_id, item);
  }
  const candidates = Array.from(seen.values());
  if (candidates.length === 0) return { status: 'NOT_FOUND', item: null, brand: null, candidates: [] };

  const scored = candidates
    .map(item => ({ item, score: Math.max(...variants.map(v => scoreItemMatch(item, v))) }))
    .sort((a, b) => b.score - a.score)
    .filter(s => s.score >= CANDIDATE_THRESHOLD);

  if (scored.length === 0) return { status: 'NOT_FOUND', item: null, brand: null, candidates: [] };

  const [best, second] = scored;
  const isClearWinner = best.score >= EXACT_THRESHOLD && (!second || best.score - second.score >= AMBIGUITY_GAP);
  if (isClearWinner) {
    return {
      status: 'EXACT',
      item: best.item,
      brand: resolveBrandForVendorName(best.item.vendor_name),
      candidates: scored.map(s => s.item),
    };
  }

  return { status: 'AMBIGUOUS', item: null, brand: null, candidates: scored.slice(0, 5).map(s => s.item) };
}
