// GET /api/zoho/customers?q=query  (omit q, or leave it empty, to list all customers)

import { NextRequest, NextResponse } from 'next/server';
import { searchCustomers } from '@/lib/zoho/customers';

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(req.url);
    const query = (searchParams.get('q') || '').trim();
    const limit = parseInt(searchParams.get('limit') || (query ? '10' : '1000'), 10);

    if (query.length === 1) {
      return NextResponse.json({ customers: [], error: 'Query too short' });
    }

    const customers = await searchCustomers(query, limit);

    return NextResponse.json({ customers });
  } catch (error) {
    console.error('Customers API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
