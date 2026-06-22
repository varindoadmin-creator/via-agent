// GET /api/zoho/items?q=query

import { NextRequest, NextResponse } from 'next/server';
import { searchItems, getItemById } from '@/lib/zoho/items';

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(req.url);
    const query = searchParams.get('q') || '';
    const itemId = searchParams.get('id') || '';
    const limit = parseInt(searchParams.get('limit') || '10', 10);

    // Get single item by ID
    if (itemId) {
      const item = await getItemById(itemId);
      if (!item) {
        return NextResponse.json({ error: 'Item not found' }, { status: 404 });
      }
      return NextResponse.json({ item });
    }

    // Search items
    if (!query || query.trim().length < 2) {
      return NextResponse.json({ items: [], error: 'Query too short' });
    }

    const items = await searchItems(query.trim(), limit);

    return NextResponse.json({ items });
  } catch (error) {
    console.error('Items API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
