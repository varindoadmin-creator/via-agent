// GET /api/zoho/purchase-orders?status=open

import { NextRequest, NextResponse } from 'next/server';
import { getOpenPurchaseOrders } from '@/lib/zoho/purchaseOrders';

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get('limit') || '50', 10);

    const orders = await getOpenPurchaseOrders(limit);

    return NextResponse.json({ purchaseorders: orders });
  } catch (error) {
    console.error('Purchase Orders API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
