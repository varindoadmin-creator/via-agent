import { normalizeLeadRecord } from './rules';

type RequestRow = {
  id: string;
  customer_name: string | null;
  phone: string | null;
  address: string | null;
};

export interface LeadAutoRepairResult {
  scanned: number;
  fixed: number;
  unchanged: number;
  unclear_names: number;
  fixed_records: Array<{ id: string; fields: string[] }>;
  failed: Array<{ id: string; error: string }>;
}

function config() {
  const base = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || '';
  if (!base || !key) throw new Error('Supabase is not configured');
  return { base, key };
}

function headers(key: string, extra: Record<string, string> = {}) {
  return { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...extra };
}

export async function runLeadAutoRepair(): Promise<LeadAutoRepairResult> {
  const { base, key } = config();
  const read = await fetch(`${base}/rest/v1/requests?select=id,customer_name,phone,address&order=created_at.asc&limit=5000`, {
    headers: headers(key),
    cache: 'no-store',
  });
  if (!read.ok) throw new Error(`Supabase ${read.status}: ${await read.text()}`);
  const rows = await read.json() as RequestRow[];
  const result: LeadAutoRepairResult = { scanned: rows.length, fixed: 0, unchanged: 0, unclear_names: 0, fixed_records: [], failed: [] };

  for (const row of rows) {
    const normalized = normalizeLeadRecord(row);
    if (normalized.nameKind === 'unclear' && row.customer_name?.trim()) result.unclear_names++;
    const patch: Record<string, string> = {};
    if (normalized.customer_name !== (row.customer_name || '')) patch.customer_name = normalized.customer_name;
    if (normalized.phone !== (row.phone || '')) patch.phone = normalized.phone;
    if (normalized.address !== (row.address || '')) patch.address = normalized.address;
    if (!Object.keys(patch).length) { result.unchanged++; continue; }

    try {
      const update = await fetch(`${base}/rest/v1/requests?id=eq.${encodeURIComponent(row.id)}`, {
        method: 'PATCH',
        headers: headers(key, { Prefer: 'return=minimal' }),
        body: JSON.stringify(patch),
      });
      if (!update.ok) throw new Error(`Supabase ${update.status}: ${await update.text()}`);
      result.fixed++;
      result.fixed_records.push({ id: row.id, fields: Object.keys(patch) });
    } catch (error) {
      result.failed.push({ id: row.id, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return result;
}
