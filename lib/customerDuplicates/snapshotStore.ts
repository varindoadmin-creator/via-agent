import { DuplicateGroup } from '@/lib/customerCleanup/duplicates';
import { duplicateGroupFingerprint, getIgnoredDuplicateFingerprints } from '@/lib/customerDuplicates/ignoreStore';

function config() {
  return {
    url: (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, ''),
    key: process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || '',
  };
}

async function request(path: string, init: RequestInit = {}) {
  const { url, key } = config();
  if (!url || !key) throw new Error('Supabase service configuration is missing.');
  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`Supabase ${response.status}: ${await response.text()}`);
  if (response.status === 204) return [];
  return response.json();
}

export async function getLatestDuplicateScan() {
  const rows = await request('cron_run_log?select=finished_at,summary&job_name=eq.customers-duplicate-check&status=eq.success&order=finished_at.desc&limit=1');
  const latest = Array.isArray(rows) ? rows[0] : null;
  if (!latest) return null;
  const summary = (latest.summary || {}) as { total_customers?: number; groups?: DuplicateGroup[] };
  const ignored = await getIgnoredDuplicateFingerprints();
  const groups = (summary.groups || []).filter(group =>
    !ignored.has(duplicateGroupFingerprint(group.customers.map(customer => customer.contact_id))),
  );
  return {
    scanned_at: String(latest.finished_at),
    total_customers: Number(summary.total_customers || 0),
    groups,
    group_count: groups.length,
    duplicate_customer_count: groups.reduce((sum, group) => sum + group.customers.length, 0),
  };
}
