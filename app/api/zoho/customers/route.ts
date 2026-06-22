// GET /api/zoho/customers?q=query

import { NextRequest, NextResponse } from 'next/server';
import { searchCustomers } from '@/lib/zoho/customers';

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(req.url);
    const query = searchParams.get('q') || '';
    const limit = parseInt(searchParams.get('limit') || '10', 10);

    if (!query || query.trim().length < 2) {
      return NextResponse.json({ customers: [], error: 'Query too short' });
    }

    const customers = await searchCustomers(query.trim(), limit);

    return NextResponse.json({ customers });
  } catch (error) {
    console.error('Customers API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
