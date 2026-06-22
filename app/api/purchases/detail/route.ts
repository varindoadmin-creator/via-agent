import { NextRequest, NextResponse } from 'next/server';
import { getZohoAccessToken, getZohoApiBaseUrl, getZohoOrgId } from '@/lib/zoho/auth';

export async function GET(request: NextRequest) {
  try {
    const poId = request.nextUrl.searchParams.get('id');
    if (!poId) return NextResponse.json({ error: 'id required' }, { status: 400 });

    const token = await getZohoAccessToken();
    const base = getZohoApiBaseUrl();
    const orgId = getZohoOrgId();

    const res = await fetch(`${base}/purchaseorders/${poId}?organization_id=${orgId}`, {
      headers: { Authorization: `Zoho-oauthtoken ${token}` },
    });
    const data = await res.json();
    const po = data.purchaseorder;
    if (!po) throw new Error('PO not found');

    return NextResponse.json({
      success: true,
      po: {
        purchaseorder_id: po.purchaseorder_id,
        purchaseorder_number: po.purchaseorder_number,
        vendor_name: po.vendor_name,
        date: po.date,
        expected_delivery_date: po.expected_delivery_date,
        status: po.status,
        total: po.total,
        line_items: (po.line_items || []).map((li: Record<string, unknown>) => ({
          line_item_id: li.line_item_id,
          item_id: li.item_id,
          name: li.name,
          sku: li.sku,
          quantity: Number(li.quantity) || 0,
          quantity_received: Number(li.quantity_received) || 0,
          unit: li.unit || 'sht',
          rate: Number(li.rate) || 0,
          item_total: Number(li.item_total) || 0,
        })),
      },
    });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
