import { NextRequest, NextResponse } from 'next/server';
import { createDraftPOsForBrand, BRAND_VENDORS } from '@/lib/zoho/createPO';

export const maxDuration = 60;

export async function GET() {
  return NextResponse.json({ success: true, brands: BRAND_VENDORS });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { brand } = body as { brand?: string };
    if (!brand) return NextResponse.json({ success: false, error: 'brand required' }, { status: 400 });

    const summary = await createDraftPOsForBrand(brand);
    return NextResponse.json({ success: true, ...summary });
  } catch (error) {
    console.error('[Create PO] POST error:', error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
