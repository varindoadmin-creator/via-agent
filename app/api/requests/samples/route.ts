import { NextRequest, NextResponse } from 'next/server';
import { matchRequestPhoneToIdentity } from '@/lib/companyKnowledge/requestIdentityMatch';

type Row = {
  id: string;
  created_at: string;
  status: string | null;
  customer_name: string | null;
  phone: string | null;
  address: string | null;
  item_code: string | null;
  notes: string | null;
};

// The `requests` table has a CHECK constraint allowing only these raw values —
// each request-type page maps its own display labels on/off this fixed set.
const RAW_TO_LABEL: Record<string, string> = {
  new: 'New',
  pending: 'Requested to Vendor',
  completed: 'Sent to Customer',
  cancelled: 'Cancelled',
};
const LABEL_TO_RAW: Record<string, string> = {
  'New': 'new',
  'Requested to Vendor': 'pending',
  'Sent to Customer': 'completed',
  'Cancelled': 'cancelled',
};

function sbHeaders() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  return { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
}

function sbUrl(path: string) {
  return `${(process.env.SUPABASE_URL || '').replace(/\/$/, '')}/rest/v1/${path}`;
}

async function sbGet(path: string): Promise<Row[]> {
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

async function sbDelete(path: string) {
  const res = await fetch(sbUrl(path), { method: 'DELETE', headers: { ...sbHeaders(), Prefer: 'return=minimal' } });
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
}

function formatTs(isoStr: string): string {
  const d = new Date(new Date(isoStr).getTime() + 7 * 3600 * 1000);
  return `${d.getUTCDate()}/${d.getUTCMonth() + 1}/${d.getUTCFullYear()}, ${String(d.getUTCHours()).padStart(2, '0')}.${String(d.getUTCMinutes()).padStart(2, '0')}.${String(d.getUTCSeconds()).padStart(2, '0')}`;
}

function normalizeStatus(s: string | null): string {
  if (!s) return 'New';
  return RAW_TO_LABEL[s] || s;
}

function groupRows(rows: Row[]): { rep: Row; items: Row[] }[] {
  const sorted = [...rows].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const groups: { key: string; rep: Row; items: Row[]; lastTime: number }[] = [];

  for (const row of sorted) {
    const key = `${row.customer_name || ''}|${row.phone || ''}|${row.address || ''}`;
    const t = new Date(row.created_at).getTime();
    let merged = false;
    for (let i = groups.length - 1; i >= 0; i--) {
      if (groups[i].key !== key) continue;
      if (t - groups[i].lastTime <= 5000) {
        groups[i].items.push(row);
        if (t > groups[i].lastTime) groups[i].lastTime = t;
        merged = true;
      }
      break;
    }
    if (!merged) groups.push({ key, rep: row, items: [row], lastTime: t });
  }

  return groups.reverse();
}

// Builds the PostgREST filter params matching every row in a representative
// row's group (same customer/phone/address within the 5s creation window).
async function groupFilterParams(id: string): Promise<URLSearchParams | null> {
  const lookup = await sbGet(`requests?id=eq.${encodeURIComponent(id)}&select=customer_name,phone,address,created_at`);
  if (!lookup.length) return null;

  const ref = lookup[0];
  const refTime = new Date(ref.created_at).getTime();
  const windowStart = new Date(refTime - 5000).toISOString();
  const windowEnd = new Date(refTime + 5000).toISOString();

  const params = new URLSearchParams();
  params.append('request_type', 'eq.sample');
  if (ref.customer_name) params.append('customer_name', `eq.${ref.customer_name}`);
  if (ref.phone) params.append('phone', `eq.${ref.phone}`);
  if (ref.address) params.append('address', `eq.${ref.address}`);
  params.append('created_at', `gte.${windowStart}`);
  params.append('created_at', `lte.${windowEnd}`);
  return params;
}

export async function GET() {
  try {
    const rows = await sbGet('requests?request_type=eq.sample&order=created_at.desc&limit=500');
    const groups = groupRows(rows);

    const requests = await Promise.all(groups.map(async ({ rep, items }) => {
      const samples = items.map(r => r.item_code || '').filter(Boolean);
      return {
        id: rep.id,
        timestamp: formatTs(rep.created_at),
        name: rep.customer_name || '',
        address: rep.address || '',
        phone: rep.phone || '',
        samples,
        total_samples: samples.length,
        status: normalizeStatus(rep.status),
        notes: rep.notes || '',
        // Brief section 56 — read-only enrichment, never used to create a Zoho customer.
        identityMatch: await matchRequestPhoneToIdentity(rep.phone),
      };
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

    const params = await groupFilterParams(id);
    if (!params) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const updates: Record<string, unknown> = {};
    if (status !== undefined) updates.status = LABEL_TO_RAW[status] || status;
    if (notes !== undefined) updates.notes = notes;

    await sbPatch(`requests?${params.toString()}`, updates);
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { ids } = await request.json() as { ids: string[] };
    if (!Array.isArray(ids) || !ids.length) return NextResponse.json({ error: 'ids required' }, { status: 400 });

    for (const id of ids) {
      const params = await groupFilterParams(id);
      if (params) await sbDelete(`requests?${params.toString()}`);
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
