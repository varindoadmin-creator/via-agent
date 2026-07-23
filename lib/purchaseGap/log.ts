// ─── Supabase log for Same-day Purchase Gap alerts ────────────────────────────
// Same REST-call pattern as lib/customerCleanup/supabaseLog.ts — no
// supabase-js client, just plain fetch against PostgREST.

import type { PurchaseGapSO } from './check';

const TABLE = 'so_purchase_gap_log';

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

/** salesorder_ids already logged (any notified state) for a given check_date — used to send only one email per SO per day. */
export async function getLoggedGapIds(checkDate: string): Promise<Set<string>> {
  const data = await supabaseRequest(`${TABLE}?select=salesorder_id&check_date=eq.${checkDate}&notified=eq.true`);
  if (!Array.isArray(data)) return new Set();
  return new Set(data.map((r: Record<string, unknown>) => String(r.salesorder_id || '')).filter(Boolean));
}

export async function logPurchaseGaps(gaps: PurchaseGapSO[], checkDate: string, notified: boolean) {
  if (gaps.length === 0) return;
  return supabaseRequest(`${TABLE}?on_conflict=salesorder_id,check_date`, {
    method: 'POST',
    body: JSON.stringify(gaps.map(g => ({
      salesorder_id: g.salesorder_id,
      salesorder_number: g.salesorder_number,
      customer_name: g.customer_name,
      total: g.total,
      sub_status_formatted: g.sub_status_formatted,
      check_date: checkDate,
      confirmed_at: g.confirmed_at,
      notified,
      flagged_at: new Date().toISOString(),
    }))),
  });
}
