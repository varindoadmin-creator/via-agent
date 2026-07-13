import { NextResponse } from 'next/server';

// ─── Daily Brief: customers VIA auto-repaired, grouped by day ─────────────────
// Reads the same customer_cleanup_log table the daily 09:00 Asia/Jakarta
// auto-repair job writes to (see lib/customerCleanup/autoRepair.ts). Rows
// with an empty `changes` array mean "scanned, nothing needed fixing" —
// those are excluded here since the Daily Brief is specifically about
// customers that were actually changed.

const JAKARTA_OFFSET_MS = 7 * 60 * 60 * 1000; // Asia/Jakarta is a fixed UTC+7, no DST.
const DAYS_BACK = 14;

interface LogRow {
  contact_id: string;
  contact_name: string;
  changes: Array<{ field: string; from: string; to: string }>;
  fixed_at: string;
}

function sbHeaders() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  return { apikey: key, Authorization: `Bearer ${key}` };
}

function sbUrl(path: string) {
  return `${(process.env.SUPABASE_URL || '').replace(/\/$/, '')}/rest/v1/${path}`;
}

/** Jakarta calendar date (YYYY-MM-DD) for a UTC timestamp. */
function jakartaDate(isoStr: string): string {
  const shifted = new Date(new Date(isoStr).getTime() + JAKARTA_OFFSET_MS);
  return shifted.toISOString().split('T')[0];
}

function dayLabel(date: string, today: string, yesterday: string): string {
  if (date === today) return 'Today';
  if (date === yesterday) return 'Yesterday';
  return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export async function GET() {
  try {
    const cutoff = new Date(Date.now() - DAYS_BACK * 24 * 60 * 60 * 1000).toISOString();
    const res = await fetch(
      sbUrl(`customer_cleanup_log?select=contact_id,contact_name,changes,fixed_at&fixed_at=gte.${cutoff}&order=fixed_at.desc&limit=500`),
      { headers: sbHeaders() }
    );
    if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
    const rows = (await res.json()) as LogRow[];

    const repaired = rows.filter(r => Array.isArray(r.changes) && r.changes.length > 0);

    const nowJakarta = new Date(Date.now() + JAKARTA_OFFSET_MS).toISOString().split('T')[0];
    const yesterdayJakarta = new Date(Date.now() + JAKARTA_OFFSET_MS - 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const byDate = new Map<string, LogRow[]>();
    for (const row of repaired) {
      const date = jakartaDate(row.fixed_at);
      const list = byDate.get(date);
      if (list) list.push(row);
      else byDate.set(date, [row]);
    }

    const days = Array.from(byDate.entries())
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([date, customers]) => ({
        date,
        label: dayLabel(date, nowJakarta, yesterdayJakarta),
        customers: customers.map(c => ({
          contact_id: c.contact_id,
          contact_name: c.contact_name,
          changes: c.changes,
          fixed_at: c.fixed_at,
        })),
      }));

    return NextResponse.json({ success: true, days });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
