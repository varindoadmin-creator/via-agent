import { NextRequest, NextResponse } from 'next/server';

function sbHeaders() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  return { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
}

function sbUrl(path: string) {
  return `${(process.env.SUPABASE_URL || '').replace(/\/$/, '')}/rest/v1/${path}`;
}

async function sbGet(path: string) {
  const res = await fetch(sbUrl(path), { headers: sbHeaders() });
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
  return res.json();
}

async function sbPatch(path: string, body: Record<string, unknown>) {
  const res = await fetch(sbUrl(path), {
    method: 'PATCH',
    headers: { ...sbHeaders(), Prefer: 'return=minimal' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
}

function formatTs(isoStr: string): string {
  const d = new Date(new Date(isoStr).getTime() + 7 * 3600 * 1000);
  return `${d.getUTCDate()}/${d.getUTCMonth() + 1}/${d.getUTCFullYear()}, ${String(d.getUTCHours()).padStart(2, '0')}.${String(d.getUTCMinutes()).padStart(2, '0')}.${String(d.getUTCSeconds()).padStart(2, '0')}`;
}

function normalizeStatus(s: string | null): string {
  return (s === 'new' || !s) ? 'New' : s;
}

export async function GET() {
  try {
    const rows = await sbGet('requests?request_type=eq.catalogue&order=created_at.desc&limit=500');

    const requests = rows.map((row: Record<string, unknown>) => ({
      id: String(row.id || ''),
      timestamp: formatTs(String(row.created_at || '')),
      name: String(row.customer_name || row.company_name || ''),
      address: String(row.address || ''),
      phone: String(row.phone || ''),
      status: normalizeStatus(row.status as string | null),
      notes: String(row.notes || ''),
    }));

    return NextResponse.json({ success: true, requests });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { id, status, notes } = await request.json() as { id: string; status?: string; notes?: string };
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

    const updates: Record<string, unknown> = {};
    if (status !== undefined) updates.status = status;
    if (notes !== undefined) updates.notes = notes;

    await sbPatch(`requests?id=eq.${encodeURIComponent(id)}`, updates);
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
