import { NextRequest, NextResponse } from 'next/server';
import { computeApprovalData, approvePurchaseOrders } from '@/lib/zoho/poApprovalEngine';

export const maxDuration = 60;

export async function GET() {
  try {
    const data = await computeApprovalData();
    return NextResponse.json({ success: true, ...data });
  } catch (error) {
    console.error('[PO Approval] GET error:', error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { purchaseorder_ids } = body as { purchaseorder_ids?: string[] };
    if (!purchaseorder_ids?.length) return NextResponse.json({ success: false, error: 'purchaseorder_ids required' }, { status: 400 });

    const results = await approvePurchaseOrders(purchaseorder_ids);

    return NextResponse.json({
      success: true,
      approved: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      results,
    });
  } catch (error) {
    console.error('[PO Approval] POST error:', error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
