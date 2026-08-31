import { NextRequest, NextResponse } from 'next/server';
import { searchItems } from '@/lib/zoho/items';
import { normalizeItemCode, extractBrandPrefix } from '@/lib/utils/normalizeItemCode';
import { classifyPricingGroup } from '@/lib/products/specialPricePolicy';

export const dynamic = 'force-dynamic';

// GET /api/inventory/products?q=... — the product-source diagnostic view
// (brief section 68). Search-driven rather than a full-catalogue dump (Zoho's
// item list is unbounded) — an admin looks up any product and sees exactly
// where each field comes from. Metadata/enrichment fields report "Zoho" /
// "Not enriched" honestly: no product_enrichment table exists yet (brief
// sections 5-6, 62-64 — deferred until a real Lamitak/EDL CSV is provided).
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q')?.trim();
  if (!q) return NextResponse.json({ success: true, products: [] });

  try {
    const items = await searchItems(q, 25);
    const products = items.map(item => {
      const pricingGroup = classifyPricingGroup(item.sku || '');
      console.info('[inventory.products]', JSON.stringify({ event: 'product.zoho_resolved', itemId: item.item_id }));
      console.info('[inventory.products]', JSON.stringify({ event: 'pricing.special_group_resolved', itemId: item.item_id, pricingGroup }));
      return {
        zohoItemId: item.item_id,
        itemName: item.name,
        canonicalCode: normalizeItemCode(item.sku || ''),
        sku: item.sku || null,
        brand: extractBrandPrefix(item.sku || '') || null,
        pricingGroup,
        activeStatus: item.status,
        metadataSource: 'Zoho',
        enrichmentStatus: 'Not enriched',
      };
    });
    return NextResponse.json({ success: true, products });
  } catch (error) {
    console.error('[InventoryProducts]', error instanceof Error ? error.message : 'unknown error');
    return NextResponse.json({ success: false, error: 'Unable to search products.' }, { status: 500 });
  }
}
