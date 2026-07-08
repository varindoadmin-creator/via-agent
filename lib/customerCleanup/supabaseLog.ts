// ─── Supabase log of already-fixed customers ──────────────────────────────────
// Same REST-call pattern as app/api/reconcile/route.ts's supabaseRequest —
// no supabase-js client, just plain fetch against PostgREST.

const TABLE = 'customer_cleanup_log';

function supabaseConfig() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || '';
  return { url: url.replace(/\/$/, ''), key };
}

async function supabaseRequest(path: string, init: RequestInit = {}) {
  const { url, key } = supabaseConfig();
  if (!url || !key) return null;
  const res = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation,resolution=merge-duplicates',
      ...(init.headers || {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase ${res.status}: ${text}`);
  }
  if (res.status === 204) return [];
  return res.json();
}

/** contact_ids already logged as fixed — scan should skip these. */
export async function getFixedContactIds(): Promise<Set<string>> {
  const data = await supabaseRequest(`${TABLE}?select=contact_id`);
  if (!Array.isArray(data)) return new Set();
  return new Set(data.map((r: Record<string, unknown>) => String(r.contact_id || '')).filter(Boolean));
}

export async function logCustomerFixed(
  contactId: string,
  contactName: string,
  changes: Array<{ field: string; from: string; to: string }>
) {
  return supabaseRequest(`${TABLE}?on_conflict=contact_id`, {
    method: 'POST',
    body: JSON.stringify([
      {
        contact_id: contactId,
        contact_name: contactName,
        changes,
        fixed_at: new Date().toISOString(),
      },
    ]),
  });
}
