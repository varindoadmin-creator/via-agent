import { NextRequest, NextResponse } from 'next/server';
import { getZohoAccessToken, getZohoApiBaseUrl, getZohoOrgId } from '@/lib/zoho/auth';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const singleId = body?.purchaseorder_id;

    const token = await getZohoAccessToken();
    const base = getZohoApiBaseUrl();
    const orgId = getZohoOrgId();

    let pos: Record<string, unknown>[] = [];
    if (singleId) {
      // Single PO approve
      pos = [{ purchaseorder_id: singleId, purchaseorder_number: singleId }];
    } else {
      // Fetch all pending approval POs
      const res = await fetch(`${base}/purchaseorders?status=pending_approval&per_page=200&organization_id=${orgId}`, {
        headers: { Authorization: `Zoho-oauthtoken ${token}` },
      });
      const data = await res.json();
      pos = data.purchaseorders || [];
    }

    const results: Array<{ po_number: string; success: boolean; error?: string }> = [];

    for (const po of pos) {
      try {
        const tok = await getZohoAccessToken();
        const approveRes = await fetch(`${base}/purchaseorders/${po.purchaseorder_id}/status/open?organization_id=${orgId}`, {
          method: 'POST',
          headers: { Authorization: `Zoho-oauthtoken ${tok}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });
        const approveData = await approveRes.json();
        if (!approveRes.ok && approveData.code !== 0) throw new Error(approveData.message || 'Failed');
        results.push({ po_number: String(po.purchaseorder_number), success: true });
      } catch (e) {
        results.push({ po_number: String(po.purchaseorder_number), success: false, error: String(e) });
      }
    }

    const approved = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    return NextResponse.json({ success: true, sent: approved, failed, results });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
