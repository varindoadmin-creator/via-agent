import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

function database() {
  const base = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || '';
  if (!base || !key) return null;
  return { base, headers: { apikey: key, Authorization: `Bearer ${key}` } };
}

// GET /api/requests/wati/customers — the New Customer Onboarding dashboard
// (brief section 66): Needs Info / Possible Duplicate / Ready Review /
// Waiting Approval / Creation Failed / Created / WATI Sync Failed.
export async function GET() {
  const db = database();
  if (!db) return NextResponse.json({ success: false, error: 'Customer draft storage is not configured.' }, { status: 503 });

  try {
    const params = new URLSearchParams({
      select: '*',
      status: 'not.in.(CANCELLED)',
      order: 'updated_at.desc',
      limit: '200',
    });
    const response = await fetch(`${db.base}/rest/v1/customer_drafts?${params.toString()}`, { headers: db.headers, cache: 'no-store' });
    if (!response.ok) throw new Error(`Supabase returned ${response.status}`);
    const drafts = await response.json();
    return NextResponse.json({ success: true, drafts });
  } catch (error) {
    console.error('[WatiCustomerOnboardingDashboard]', error instanceof Error ? error.message : 'unknown error');
    return NextResponse.json({ success: false, error: 'Unable to load customer drafts.' }, { status: 500 });
  }
}
