import { NextRequest, NextResponse } from 'next/server';
import { formatBusinessName, normalizeSpaces } from '@/lib/customerCleanup/rules';

const MARKS_TABLE = 'lead_customer_marks';

type Row = {
  id: string;
  created_at: string;
  request_type: string;
  customer_name: string | null;
  phone: string | null;
  address: string | null;
};

const TYPE_LABEL: Record<string, string> = {
  sample: 'Sample',
  quote: 'Quote',
  catalogue: 'Catalogue',
};

function sbHeaders(extra: Record<string, string> = {}) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  return { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...extra };
}

function sbUrl(path: string) {
  return `${(process.env.SUPABASE_URL || '').replace(/\/$/, '')}/rest/v1/${path}`;
}

async function sbGet(path: string): Promise<Row[]> {
  const res = await fetch(sbUrl(path), { headers: sbHeaders() });
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
  return res.json();
}

/** Last 9 digits — absorbs 0/62/+62 country-code prefix differences (same rule as customer/item duplicate matching). */
function normalizePhoneKey(raw: string | null): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 8) return null;
  return digits.slice(-9);
}

function normalizeNameKey(raw: string | null): string {
  return (raw || '').trim().toUpperCase().replace(/\s+/g, ' ');
}

// Collapses multi-item submissions (e.g. 4 sample rows added within the same
// checkout) into one logical "submission" per request_type — same 5s window
// rule the per-type request routes use — so one visit isn't counted 4 times.
function groupSubmissions(rows: Row[]): { request_type: string; customer_name: string | null; phone: string | null; address: string | null; created_at: string }[] {
  const sorted = [...rows].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const groups: { key: string; rep: Row; lastTime: number }[] = [];

  for (const row of sorted) {
    const key = `${row.request_type}|${row.customer_name || ''}|${row.phone || ''}|${row.address || ''}`;
    const t = new Date(row.created_at).getTime();
    let merged = false;
    for (let i = groups.length - 1; i >= 0; i--) {
      if (groups[i].key !== key) continue;
      if (t - groups[i].lastTime <= 5000) {
        if (t > groups[i].lastTime) groups[i].lastTime = t;
        merged = true;
      }
      break;
    }
    if (!merged) groups.push({ key, rep: row, lastTime: t });
  }

  return groups.map(g => ({
    request_type: g.rep.request_type,
    customer_name: g.rep.customer_name,
    phone: g.rep.phone,
    address: g.rep.address,
    created_at: g.rep.created_at,
  }));
}

/** Keys already marked as an existing customer — soft-fails to an empty set if the
 * lead_customer_marks table hasn't been created yet, so viewing the list never breaks. */
async function getMarkedKeys(): Promise<Set<string>> {
  try {
    const res = await fetch(sbUrl(`${MARKS_TABLE}?select=lead_key`), { headers: sbHeaders() });
    if (!res.ok) return new Set();
    const rows = (await res.json()) as Array<{ lead_key: string }>;
    return new Set(rows.map(r => r.lead_key));
  } catch {
    return new Set();
  }
}

export async function GET() {
  try {
    const [rows, markedKeys] = await Promise.all([
      sbGet('requests?select=id,created_at,request_type,customer_name,phone,address&order=created_at.asc&limit=2000'),
      getMarkedKeys(),
    ]);
    const submissions = groupSubmissions(rows);

    const byKey = new Map<string, {
      name: string;
      phone: string;
      address: string;
      types: Set<string>;
      total_requests: number;
      first_at: string;
      last_at: string;
    }>();

    for (const s of submissions) {
      const phoneKey = normalizePhoneKey(s.phone);
      const key = phoneKey || `name:${normalizeNameKey(s.customer_name)}`;
      if (!key || key === 'name:') continue;

      const existing = byKey.get(key);
      const typeLabel = TYPE_LABEL[s.request_type] || s.request_type;
      if (existing) {
        existing.types.add(typeLabel);
        existing.total_requests += 1;
        if (s.created_at < existing.first_at) existing.first_at = s.created_at;
        if (s.created_at > existing.last_at) {
          existing.last_at = s.created_at;
          // Keep the most recent name/phone/address as the display values.
          existing.name = s.customer_name || existing.name;
          existing.phone = s.phone || existing.phone;
          existing.address = s.address || existing.address;
        }
      } else {
        byKey.set(key, {
          name: s.customer_name || '',
          phone: s.phone || '',
          address: s.address || '',
          types: new Set([typeLabel]),
          total_requests: 1,
          first_at: s.created_at,
          last_at: s.created_at,
        });
      }
    }

    const customers = Array.from(byKey.entries())
      .filter(([key]) => !markedKeys.has(key))
      .map(([key, c]) => ({
        key,
        ...c,
        name: c.name ? formatBusinessName(c.name) : c.name,
        address: c.address ? normalizeSpaces(c.address) : c.address,
        types: Array.from(c.types),
      }))
      .sort((a, b) => b.last_at.localeCompare(a.last_at));

    return NextResponse.json({ success: true, customers });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}

// ─── POST /api/leads/customers — mark leads as already a customer ─────────────
// Removes them from the Leads list (see GET above) without touching the
// underlying requests rows — reversible by deleting the row from
// lead_customer_marks directly in Supabase if ever needed.

export async function POST(request: NextRequest) {
  try {
    const { leads } = await request.json() as {
      leads: Array<{ key: string; name?: string; phone?: string }>;
    };
    if (!leads?.length) return NextResponse.json({ success: false, error: 'leads required' }, { status: 400 });

    const rows = leads.map(l => ({
      lead_key: l.key,
      name: l.name || null,
      phone: l.phone || null,
      marked_at: new Date().toISOString(),
    }));

    const res = await fetch(sbUrl(`${MARKS_TABLE}?on_conflict=lead_key`), {
      method: 'POST',
      headers: sbHeaders({ Prefer: 'return=minimal,resolution=merge-duplicates' }),
      body: JSON.stringify(rows),
    });
    if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
