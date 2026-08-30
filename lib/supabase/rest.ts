// ─── Minimal Supabase REST helper ───────────────────────────────────────────
// Shared by Phase 6's new tables (customer_channel_identities, customer_drafts,
// commercial_drafts, commercial_draft_lines, commercial_approvals,
// wati_contact_sync_log) to avoid repeating the same database()/fetch
// boilerplate six times. Existing modules (lib/integrations/wati/store.ts,
// lib/jarvis/approvals/store.ts, etc.) hand-roll their own copy and are left
// unchanged.

export interface SupabaseTable {
  url: string;
  headers: Record<string, string>;
}

export function supabaseTable(table: string): SupabaseTable {
  const base = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || '';
  if (!base || !key) throw new Error(`Supabase storage is not configured (table: ${table}).`);
  return {
    url: `${base}/rest/v1/${table}`,
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
  };
}

export async function supabaseSelect<T>(table: string, query: string): Promise<T[]> {
  const db = supabaseTable(table);
  const response = await fetch(`${db.url}?${query}`, { headers: db.headers, cache: 'no-store' });
  if (!response.ok) throw new Error(`Supabase select failed on ${table} (${response.status}): ${await response.text()}`);
  return response.json() as Promise<T[]>;
}

export async function supabaseInsert<T>(table: string, body: Record<string, unknown>, returnRepresentation = true): Promise<T | null> {
  const db = supabaseTable(table);
  const response = await fetch(db.url, {
    method: 'POST',
    headers: { ...db.headers, Prefer: returnRepresentation ? 'return=representation' : 'return=minimal' },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`Supabase insert failed on ${table} (${response.status}): ${await response.text()}`);
  if (!returnRepresentation) return null;
  const rows = await response.json() as T[];
  return rows[0] ?? null;
}

/** PATCH with an existing-row filter query (e.g. "id=eq.X&status=eq.pending"). Returns updated rows — empty when the filter matched nothing (the caller's concurrency guard). */
export async function supabasePatch<T>(table: string, filterQuery: string, body: Record<string, unknown>): Promise<T[]> {
  const db = supabaseTable(table);
  const response = await fetch(`${db.url}?${filterQuery}`, {
    method: 'PATCH',
    headers: { ...db.headers, Prefer: 'return=representation' },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`Supabase update failed on ${table} (${response.status}): ${await response.text()}`);
  return response.json() as Promise<T[]>;
}
