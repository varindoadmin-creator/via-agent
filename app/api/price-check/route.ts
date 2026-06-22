import { NextRequest, NextResponse } from 'next/server';
import { findByCode, findByPrefix, searchProducts, formatProductResult, LAMITAK_CATALOG_META } from '@/lib/data/lamitak-products';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const query = searchParams.get('q');

  if (!code && !query) {
    return NextResponse.json({ error: 'Provide ?code= or ?q=' }, { status: 400 });
  }

  let results;

  if (code) {
    // Try exact match first
    results = findByCode(code);
    // If no exact match, try prefix
    if (results.length === 0) {
      results = findByPrefix(code);
    }
  } else {
    results = searchProducts(query!);
  }

  return NextResponse.json({
    query: code || query,
    count: results.length,
    meta: LAMITAK_CATALOG_META,
    results: results.map((p) => ({
      ...p,
      formatted: formatProductResult(p),
    })),
  });
}
