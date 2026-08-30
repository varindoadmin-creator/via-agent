// ─── Stock source (vendor) resolver ──────────────────────────────────────────────
// Brief section 6: given a resolved product, determine the correct vendor
// deterministically — never let Jarvis guess when metadata exists. Varindo's
// vendors are exactly the brands already mapped in lib/zoho/brands.ts.

import { resolveBrandForVendorName } from '../../../zoho/brands.ts';
import type { ZohoItem } from '../../../../types/zoho.ts';

export type SourceConfidence = 'AUTHORITATIVE' | 'UNRESOLVED';

export interface StockSourceResolution {
  sourceId: string | null;
  sourceType: 'VENDOR';
  confidence: SourceConfidence;
}

/**
 * `knownBrand` is an already-deterministically-resolved brand carried over
 * from Phase 2's product/intent resolution (e.g. the customer named "Lamitak"
 * directly, or the item's vendor_name matched elsewhere in the pipeline) —
 * used as a fallback since an item's own vendor_name doesn't reliably map back
 * to a brand for every product (see lib/zoho/brands.ts's module comment).
 * Ambiguous/unmapped products resolve UNRESOLVED — routed to human review,
 * never guessed.
 */
export function resolveStockSource(item: ZohoItem, knownBrand?: string | null): StockSourceResolution {
  const brand = resolveBrandForVendorName(item.vendor_name) || knownBrand || null;
  if (!brand) return { sourceId: null, sourceType: 'VENDOR', confidence: 'UNRESOLVED' };
  return { sourceId: brand, sourceType: 'VENDOR', confidence: 'AUTHORITATIVE' };
}
