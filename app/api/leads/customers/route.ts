import { NextResponse } from 'next/server';
import { formatBusinessName, normalizeSpaces } from '@/lib/customerCleanup/rules';

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

export async function GET() {
  try {
    const rows = await sbGet('requests?select=id,created_at,request_type,customer_name,phone,address&order=created_at.asc&limit=2000');
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

    const customers = Array.from(byKey.values())
      .map(c => ({
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
