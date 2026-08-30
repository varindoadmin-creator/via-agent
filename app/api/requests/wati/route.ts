import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

type WatiMessageRow = {
  id: string;
  received_at: string;
  customer_name: string | null;
  customer_phone_raw: string | null;
  customer_resolution: string | null;
  text: string | null;
  intent: string | null;
  product_name: string | null;
  item_code: string | null;
  source: string | null;
  processing_status: string | null;
  response_type: string | null;
};

export async function GET() {
  const base = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || '';
  if (!base || !key) return NextResponse.json({ success: false, error: 'WATI message storage is not configured.' }, { status: 503 });

  try {
    const params = new URLSearchParams({
      direction: 'eq.INBOUND',
      select: 'id,received_at,customer_name,customer_phone_raw,customer_resolution,text,intent,product_name,item_code,source,processing_status,response_type',
      order: 'received_at.desc',
      limit: '100',
    });
    const response = await fetch(`${base}/rest/v1/wati_messages?${params.toString()}`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      cache: 'no-store',
    });
    if (!response.ok) throw new Error(`Supabase returned ${response.status}`);
    const messages = await response.json() as WatiMessageRow[];
    return NextResponse.json({ success: true, messages });
  } catch (error) {
    console.error('[WatiInbox]', error instanceof Error ? error.message : 'unknown error');
    return NextResponse.json({ success: false, error: 'Unable to load WATI messages.' }, { status: 500 });
  }
}
