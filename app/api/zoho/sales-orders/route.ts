// GET  /api/zoho/sales-orders?q=query&id=soId&number=soNumber
// POST /api/zoho/sales-orders — should not be called directly (use /api/chat)

import { NextRequest, NextResponse } from 'next/server';
import {
  searchSalesOrders,
  getSalesOrderById,
  getSalesOrderByNumber,
} from '@/lib/zoho/salesOrders';

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(req.url);
    const soId = searchParams.get('id') || '';
    const soNumber = searchParams.get('number') || '';
    const query = searchParams.get('q') || '';
    const customerId = searchParams.get('customer_id') || '';
    const status = searchParams.get('status') || '';
    const limit = parseInt(searchParams.get('limit') || '10', 10);

    // Get by ID
    if (soId) {
      const so = await getSalesOrderById(soId);
      if (!so) {
        return NextResponse.json({ error: 'Sales Order not found' }, { status: 404 });
      }
      return NextResponse.json({ salesorder: so });
    }

    // Get by number
    if (soNumber) {
      const so = await getSalesOrderByNumber(soNumber);
      if (!so) {
        return NextResponse.json({ error: 'Sales Order not found' }, { status: 404 });
      }
      return NextResponse.json({ salesorder: so });
    }

    // Search
    const orders = await searchSalesOrders(
      query || undefined,
      customerId || undefined,
      status || undefined,
      limit
    );

    return NextResponse.json({ salesorders: orders });
  } catch (error) {
    console.error('Sales Orders API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
