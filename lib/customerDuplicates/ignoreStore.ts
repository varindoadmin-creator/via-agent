const TABLE = 'customer_duplicate_ignores';

export function duplicateGroupFingerprint(contactIds: string[]): string {
  return [...new Set(contactIds.filter(Boolean))].sort().join(':');
}

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
      apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json',
      Prefer: 'return=representation,resolution=merge-duplicates', ...(init.headers || {}),
    },
  });
  if (!response.ok) throw new Error(`Supabase ${response.status}: ${await response.text()}`);
  if (response.status === 204) return [];
  return response.json();
}

export async function getIgnoredDuplicateFingerprints(): Promise<Set<string>> {
  try {
    const rows = await request(`${TABLE}?select=group_fingerprint`);
    return new Set((Array.isArray(rows) ? rows : []).map(row => String(row.group_fingerprint || '')).filter(Boolean));
  } catch (error) {
    console.warn('[Customer Duplicates] Ignore list unavailable:', error);
    return new Set();
  }
}

export async function ignoreDuplicateGroup(customers: Array<{ contact_id: string; contact_name: string; company_name: string }>, reasons: string[]) {
  const ids = customers.map(customer => customer.contact_id);
  const fingerprint = duplicateGroupFingerprint(ids);
  if (ids.length < 2 || !fingerprint) throw new Error('At least two customers are required to ignore a duplicate group.');
  return request(`${TABLE}?on_conflict=group_fingerprint`, {
    method: 'POST',
    body: JSON.stringify([{
      group_fingerprint: fingerprint,
      contact_ids: ids.sort(),
      customer_names: customers.map(customer => customer.company_name || customer.contact_name),
      match_reasons: reasons,
      ignored_at: new Date().toISOString(),
    }]),
  });
}
