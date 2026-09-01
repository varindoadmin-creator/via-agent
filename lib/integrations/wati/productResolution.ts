// ─── WATI product resolution ────────────────────────────────────────────────────
// Resolves a customer-provided code/name against VIA's actual Zoho item
// catalogue (brief section 9). Reuses lib/zoho/items.ts's search + scoring and
// lib/utils/normalizeItemCode.ts's code normalization — never invents a match.

import { searchItems, scoreItemMatch } from '../../zoho/items.ts';
import { buildSearchVariants } from '../../utils/normalizeItemCode.ts';
import { resolveBrandForVendorName } from '../../zoho/brands.ts';
import { extractMotifDigits, extractSizeFromItemName, type LamitakSize } from './pricing/lamitakSize.ts';
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

/**
 * Phase 15 fix (live WABA test, 2026-09-01): a follow-up like "ada yang
 * ukuran 3 meter?" after a resolved 4x8 item must resolve against the real
 * 4x10 sibling SKU, never re-answer about the carried (wrong-size) item —
 * that was silently starting a stock check against the original 4x8 code.
 * `resolvedItem` must already be an EXACT match; only called when the
 * customer's stated size (lamitakSize.ts's `detectCustomerStatedSize`)
 * disagrees with `extractSizeFromItemName(resolvedItem.name)`. Uses the
 * digit-count convention (brief section 6: 4 digits <-> 4x8, 5 digits <->
 * 4x10, the 4x10 code being the 4x8 motif digits with a leading "1") only to
 * construct a search candidate — the candidate is never trusted until the
 * *returned* item's own name confirms the requested size, keeping the
 * "resolved item's own name is authoritative" rule intact.
 */
export async function resolveSizeVariant(resolvedItem: ZohoItem, requestedSize: LamitakSize): Promise<ProductResolutionResult> {
  const currentSize = extractSizeFromItemName(resolvedItem.name);
  if (currentSize === requestedSize) {
    return { status: 'EXACT', item: resolvedItem, brand: resolveBrandForVendorName(resolvedItem.vendor_name), candidates: [resolvedItem] };
  }

  const code = resolvedItem.sku || resolvedItem.name;
  const digits = extractMotifDigits(code);
  if (!digits) return { status: 'NOT_FOUND', item: null, brand: null, candidates: [] };

  let candidateDigits: string | null = null;
  if (requestedSize === '4x10' && digits.length === 4) candidateDigits = `1${digits}`;
  if (requestedSize === '4x8' && digits.length === 5 && digits.startsWith('1')) candidateDigits = digits.slice(1);
  if (!candidateDigits) return { status: 'NOT_FOUND', item: null, brand: null, candidates: [] };

  const candidateCode = code.replace(digits, candidateDigits);
  const result = await resolveProduct(candidateCode);
  if (result.status === 'EXACT' && result.item && extractSizeFromItemName(result.item.name) === requestedSize) {
    return result;
  }
  return { status: 'NOT_FOUND', item: null, brand: null, candidates: result.candidates };
}
