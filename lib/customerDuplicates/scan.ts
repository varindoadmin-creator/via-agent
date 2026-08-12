import { getZohoAccessToken, getZohoApiBaseUrl, getZohoOrgId } from '@/lib/zoho/auth';
import { fetchWithRetry } from '@/lib/zoho/retry';
import { getCustomFieldValue, RawContact } from '@/lib/customerCleanup/rules';
import { findDuplicateGroups, DuplicateCandidate } from '@/lib/customerCleanup/duplicates';
import { duplicateGroupFingerprint, getIgnoredDuplicateFingerprints } from '@/lib/customerDuplicates/ignoreStore';

async function zohoGet(path: string) {
  const token = await getZohoAccessToken();
  const separator = path.includes('?') ? '&' : '?';
  const url = `${getZohoApiBaseUrl()}${path}${separator}organization_id=${getZohoOrgId()}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetchWithRetry(url, {
      headers: { Authorization: `Zoho-oauthtoken ${token}` },
      signal: controller.signal,
    });
    const body = await response.json();
    if (!response.ok) throw new Error(`Zoho ${response.status}: ${JSON.stringify(body)}`);
    return body;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchAllCustomerIds(): Promise<string[]> {
  const ids: string[] = [];
  for (let page = 1; page <= 20; page++) {
    const result = await zohoGet(`/contacts?contact_type=customer&status=active&per_page=200&page=${page}`);
    const contacts = (result.contacts || []) as Array<{ contact_id: string }>;
    ids.push(...contacts.map(contact => contact.contact_id));
    if (!result.page_context?.has_more_page) break;
  }
  return ids;
}

async function fetchCustomerDetails(ids: string[]): Promise<RawContact[]> {
  const results: RawContact[] = [];
  const batchSize = 15;
  for (let index = 0; index < ids.length; index += batchSize) {
    const details = await Promise.all(ids.slice(index, index + batchSize).map(async id => {
      try {
        const result = await zohoGet(`/contacts/${id}`);
        return (result.contact as RawContact) || null;
      } catch {
        return null;
      }
    }));
    results.push(...details.filter((contact): contact is RawContact => Boolean(contact)));
  }
  return results;
}

export async function scanCustomerDuplicates(includeIgnored = false) {
  const ids = await fetchAllCustomerIds();
  const details = await fetchCustomerDetails(ids);
  const candidates: DuplicateCandidate[] = details.map(contact => {
    const raw = contact as RawContact & { email?: string; phone?: string; mobile?: string; status?: string };
    return {
      contact_id: contact.contact_id,
      contact_name: contact.contact_name || '',
      company_name: contact.company_name || '',
      email: raw.email || '',
      phone: raw.phone || '',
      mobile: raw.mobile || '',
      npwp: getCustomFieldValue(contact, 'cf_npwp') || '',
      status: raw.status || '',
    };
  });
  const allGroups = findDuplicateGroups(candidates);
  const ignored = await getIgnoredDuplicateFingerprints();
  const groups = includeIgnored
    ? allGroups
    : allGroups.filter(group => !ignored.has(duplicateGroupFingerprint(group.customers.map(customer => customer.contact_id))));
  return {
    totalCustomers: ids.length,
    groups,
    ignoredCount: allGroups.length - groups.length,
  };
}
