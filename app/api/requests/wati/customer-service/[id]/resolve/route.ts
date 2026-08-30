import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken, SESSION_COOKIE_NAME } from '@/lib/auth';

export const dynamic = 'force-dynamic';

function database() {
  const base = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || '';
  if (!base || !key) return null;
  return { base, headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' } };
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const role = await verifySessionToken(req.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!role) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

  const db = database();
  if (!db) return NextResponse.json({ success: false, error: 'Customer service exception storage is not configured.' }, { status: 503 });

  const { id } = await params;
  try {
    const response = await fetch(`${db.base}/rest/v1/customer_service_exceptions?id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { ...db.headers, Prefer: 'return=minimal' },
      body: JSON.stringify({ status: 'RESOLVED', resolved_at: new Date().toISOString(), resolved_by: role }),
    });
    if (!response.ok) throw new Error(`Supabase returned ${response.status}`);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[WatiCustomerServiceResolve]', error instanceof Error ? error.message : 'unknown error');
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Resolve failed.' }, { status: 500 });
  }
}
