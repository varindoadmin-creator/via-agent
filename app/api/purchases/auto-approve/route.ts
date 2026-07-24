import { NextRequest, NextResponse } from 'next/server';
import { computeApprovalData, approvePurchaseOrders } from '@/lib/zoho/poApprovalEngine';

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const singleId = body?.purchaseorder_id;

    // Every PO approved here — whether a single id or the whole pending-approval
    // batch — goes through the same SO-matching / stock-on-hand validation as the
    // Pending Approval page, so this quick-action can never bypass those checks.
    let ids: string[];
    if (singleId) {
      ids = [String(singleId)];
    } else {
      const { purchase_orders } = await computeApprovalData();
      ids = purchase_orders.map(po => po.purchaseorder_id);
    }

    const results = await approvePurchaseOrders(ids);
    const approved = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    return NextResponse.json({
      success: true,
      sent: approved,
      failed,
      results: results.map(r => ({ po_number: r.purchaseorder_number, success: r.success, error: r.error, so_status_updates: r.so_status_updates })),
    });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
