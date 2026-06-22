import { NextRequest, NextResponse } from 'next/server';

type Row = {
  id: string;
  created_at: string;
  status: string | null;
  customer_name: string | null;
  phone: string | null;
  address: string | null;
  item_code: string | null;
  quantity: number | null;
  unit: string | null;
  notes: string | null;
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

function formatTs(isoStr: string): string {
  const d = new Date(new Date(isoStr).getTime() + 7 * 3600 * 1000);
  return `${d.getUTCDate()}/${d.getUTCMonth() + 1}/${d.getUTCFullYear()}, ${String(d.getUTCHours()).padStart(2, '0')}.${String(d.getUTCMinutes()).padStart(2, '0')}.${String(d.getUTCSeconds()).padStart(2, '0')}`;
}

function normalizeStatus(s: string | null): string {
  return (s === 'new' || !s) ? 'New' : s;
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

export async function GET() {
  try {
    const rows = await sbGet('requests?request_type=eq.quote&order=created_at.desc&limit=500');
    const groups = groupRows(rows);

    const requests = groups.map(({ rep, items }) => {
      const quoteItems = items
        .filter(r => r.item_code)
        .map(r => ({ code: r.item_code || '', qty: r.quantity != null ? String(r.quantity) : '' }));
      return {
        id: rep.id,
        timestamp: formatTs(rep.created_at),
        name: rep.customer_name || '',
        address: rep.address || '',
        phone: rep.phone || '',
        items: quoteItems,
        total_items: quoteItems.length,
        status: normalizeStatus(rep.status),
        notes: rep.notes || '',
        raw: [],
      };
    });

    return NextResponse.json({ success: true, requests });
  } catch (err) {
    console.error('[Quotes] GET error:', err);
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { id, status, notes } = await request.json() as { id: string; status?: string; notes?: string };
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

    const lookup = await sbGet(`requests?id=eq.${encodeURIComponent(id)}&select=customer_name,phone,address,created_at`);
    if (!lookup.length) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const ref = lookup[0];
    const refTime = new Date(ref.created_at).getTime();
    const windowStart = new Date(refTime - 5000).toISOString();
    const windowEnd = new Date(refTime + 5000).toISOString();

    const updates: Record<string, unknown> = {};
    if (status !== undefined) updates.status = status;
    if (notes !== undefined) updates.notes = notes;

    const params = new URLSearchParams();
    params.append('request_type', 'eq.quote');
    if (ref.customer_name) params.append('customer_name', `eq.${ref.customer_name}`);
    if (ref.phone) params.append('phone', `eq.${ref.phone}`);
    if (ref.address) params.append('address', `eq.${ref.address}`);
    params.append('created_at', `gte.${windowStart}`);
    params.append('created_at', `lte.${windowEnd}`);

    await sbPatch(`requests?${params.toString()}`, updates);
    return NextResponse.json({ success: true, message: 'Updated' });
  } catch (err) {
    console.error('[Quotes] POST error:', err);
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
