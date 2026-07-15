import { NextRequest, NextResponse } from 'next/server';
import { getPriceListForTier, PRICE_LIST_TIERS, type PriceListTier } from '@/lib/zoho/pricebooks';

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const tier = req.nextUrl.searchParams.get('tier') || '';
  if (!PRICE_LIST_TIERS.includes(tier as PriceListTier)) {
    return NextResponse.json({ success: false, error: `tier must be one of: ${PRICE_LIST_TIERS.join(', ')}` }, { status: 400 });
  }

  try {
    const items = await getPriceListForTier(tier as PriceListTier);
    return NextResponse.json({ success: true, tier, items });
  } catch (err) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
