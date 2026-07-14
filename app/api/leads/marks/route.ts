import { NextResponse } from 'next/server';

const TABLE = 'lead_customer_marks';

function sbHeaders() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  return { apikey: key, Authorization: `Bearer ${key}` };
}

function sbUrl(path: string) {
  return `${(process.env.SUPABASE_URL || '').replace(/\/$/, '')}/rest/v1/${path}`;
}

// GET /api/leads/marks — every lead_key already marked as an existing customer.
// Shared by the static Sub-Dealer table and the Requests-derived Leads table
// (see /api/leads/customers) so both can exclude already-marked rows. Soft-fails
// to an empty list if lead_customer_marks hasn't been created yet in Supabase.
export async function GET() {
  try {
    const res = await fetch(sbUrl(`${TABLE}?select=lead_key`), { headers: sbHeaders() });
    if (!res.ok) return NextResponse.json({ success: true, keys: [] });
    const rows = (await res.json()) as Array<{ lead_key: string }>;
    return NextResponse.json({ success: true, keys: rows.map(r => r.lead_key) });
  } catch {
    return NextResponse.json({ success: true, keys: [] });
  }
}
