// ─── Supabase log for Aging Undelivered Package alerts ────────────────────────
// Same REST-call pattern as lib/purchaseGap/log.ts — no supabase-js client,
// just plain fetch against PostgREST.

import type { AgingPackage } from './check';

const TABLE = 'shipment_aging_log';

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

export async function logAgingPackages(packages: AgingPackage[], checkDate: string) {
  if (packages.length === 0) return;
  return supabaseRequest(`${TABLE}?on_conflict=package_id,check_date`, {
    method: 'POST',
    body: JSON.stringify(packages.map(p => ({
      package_id: p.package_id,
      package_number: p.package_number,
      salesorder_id: p.salesorder_id,
      salesorder_number: p.salesorder_number,
      customer_name: p.customer_name,
      status: p.status,
      days_aging: p.days_aging,
      check_date: checkDate,
      flagged_at: new Date().toISOString(),
    }))),
  });
}
