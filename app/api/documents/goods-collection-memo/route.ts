import { NextResponse } from 'next/server';
import { zohoRequest } from '@/lib/zoho/client';

// Lightweight, read-only listing for the Goods Collection Memo tool — deliberately
// separate from /api/purchases (which also handles bulk-approve on POST) so this
// page can be exposed to the Admin role without granting access to that action.

function n(value: unknown): number {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function s(value: unknown): string {
  return value == null ? '' : String(value);
}

export async function GET() {
  try {
    const items: Record<string, unknown>[] = [];
    let page = 1;
    let hasMore = true;
    while (hasMore) {
      const res = await zohoRequest<{ purchaseorders?: Record<string, unknown>[] }>('/purchaseorders', {
        queryParams: { status: 'open', sort_column: 'date', sort_order: 'D', per_page: 200, page },
      });
      const batch = res.purchaseorders || [];
      items.push(...batch);
      hasMore = batch.length === 200;
      page++;
      if (page > 10) break;
    }

    return NextResponse.json({
      success: true,
      purchaseorders: items.map(po => ({
        purchaseorder_id: s(po.purchaseorder_id),
        purchaseorder_number: s(po.purchaseorder_number),
        vendor_name: s(po.vendor_name),
        date: s(po.date),
        total: n(po.total),
      })),
    });
  } catch (error) {
    console.error('[Goods Collection Memo] GET error:', error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
