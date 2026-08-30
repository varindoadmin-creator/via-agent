import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

function database() {
  const base = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || '';
  if (!base || !key) return null;
  return { base, headers: { apikey: key, Authorization: `Bearer ${key}` } };
}

// GET /api/requests/wati/customer-service — brief section 45's exception
// queue: Needs Identity / Needs Human / Payment Review / Delivery Check /
// Document Send Failed / Zoho Unavailable / Resolved. Normal self-service
// traffic never writes a row here — only the cases that couldn't go
// straight-through.
export async function GET() {
  const db = database();
  if (!db) return NextResponse.json({ success: false, error: 'Customer service exception storage is not configured.' }, { status: 503 });

  try {
    const params = new URLSearchParams({ select: '*', order: 'created_at.desc', limit: '200' });
    const response = await fetch(`${db.base}/rest/v1/customer_service_exceptions?${params.toString()}`, { headers: db.headers, cache: 'no-store' });
    if (!response.ok) throw new Error(`Supabase returned ${response.status}`);
    const exceptions = await response.json();
    return NextResponse.json({ success: true, exceptions });
  } catch (error) {
    console.error('[WatiCustomerServiceDashboard]', error instanceof Error ? error.message : 'unknown error');
    return NextResponse.json({ success: false, error: 'Unable to load customer service exceptions.' }, { status: 500 });
  }
}
