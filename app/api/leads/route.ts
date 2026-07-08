import { NextRequest, NextResponse } from 'next/server';

const TABLE = 'leads_status';

type StatusRow = {
  lead_id: string;
  stage: string;
  notes: string;
  updated_at: string;
};

function sbHeaders(extra: Record<string, string> = {}) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  return { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...extra };
}

function sbUrl(path: string) {
  return `${(process.env.SUPABASE_URL || '').replace(/\/$/, '')}/rest/v1/${path}`;
}

export async function GET() {
  try {
    const res = await fetch(sbUrl(`${TABLE}?select=lead_id,stage,notes,updated_at`), { headers: sbHeaders() });
    if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
    const rows: StatusRow[] = await res.json();
    const statuses: Record<string, { stage: string; notes: string; updated_at: string }> = {};
    for (const r of rows) statuses[r.lead_id] = { stage: r.stage, notes: r.notes, updated_at: r.updated_at };
    return NextResponse.json({ success: true, statuses });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { lead_id, stage, notes } = await request.json() as { lead_id: string; stage?: string; notes?: string };
    if (!lead_id) return NextResponse.json({ success: false, error: 'lead_id required' }, { status: 400 });

    const body: Record<string, unknown> = { lead_id, updated_at: new Date().toISOString() };
    if (stage !== undefined) body.stage = stage;
    if (notes !== undefined) body.notes = notes;

    const res = await fetch(sbUrl(`${TABLE}?on_conflict=lead_id`), {
      method: 'POST',
      headers: sbHeaders({ Prefer: 'return=minimal,resolution=merge-duplicates' }),
      body: JSON.stringify([body]),
    });
    if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
