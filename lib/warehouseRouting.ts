// ─── Warehouse / region routing ────────────────────────────────────────────────
// Shared by SO Approval and PO Approval: which warehouse should serve a given
// customer, based on their Zoho Region custom field (authoritative) or City
// (fallback). Used to flag SOs/POs routed to the wrong warehouse, which would
// otherwise cause incorrect stock movement between HEAD OFFICE / HUB-BDG / HUB-MDN.

import { zohoRequest } from '@/lib/zoho/client';

function s(value: unknown): string {
  return value == null ? '' : String(value);
}

const CITY_WAREHOUSE_RULES: Array<{ match: (city: string) => boolean; warehouse: string }> = [
  { match: city => city.includes('bandung') || city.includes('cimahi'), warehouse: 'HUB-BDG' },
  { match: city => city.includes('medan'), warehouse: 'HUB-MDN' },
];
const DEFAULT_WAREHOUSE = 'HEAD OFFICE';

function expectedWarehouseForCity(city: string): string {
  const lower = city.toLowerCase();
  const rule = CITY_WAREHOUSE_RULES.find(r => r.match(lower));
  return rule ? rule.warehouse : DEFAULT_WAREHOUSE;
}

// The Region custom field (cf_region) is the customer's already-assigned hub — it uses a
// different naming convention (BDG-HUB/MDN-HUB) than the warehouse location names on SOs/POs
// (HUB-BDG/HUB-MDN). This is the authoritative signal; City is only a fallback when Region
// hasn't been set on the customer yet.
const REGION_TO_WAREHOUSE: Record<string, string> = {
  'HEAD OFFICE': 'HEAD OFFICE',
  'BDG-HUB': 'HUB-BDG',
  'MDN-HUB': 'HUB-MDN',
  // Retired hubs route back to Head Office.
  'SMG-HUB': 'HEAD OFFICE',
  'SBY-HUB': 'HEAD OFFICE',
};

export function extractCfRegion(contact: Record<string, unknown>): string {
  if (contact.cf_region != null) return s(contact.cf_region).trim();
  const hash = contact.custom_field_hash as Record<string, unknown> | undefined;
  if (hash && hash.cf_region != null) return s(hash.cf_region).trim();
  const fields = (contact.custom_fields || []) as Record<string, unknown>[];
  const match = fields.find(f => f.api_name === 'cf_region' || f.placeholder === 'cf_region');
  return match ? s(match.value).trim() : '';
}

export function expectedWarehouseForCustomer(city: string, cfRegion: string): string {
  const normalizedRegion = cfRegion.toUpperCase();
  if (normalizedRegion && REGION_TO_WAREHOUSE[normalizedRegion]) return REGION_TO_WAREHOUSE[normalizedRegion];
  if (city) return expectedWarehouseForCity(city);
  return '';
}

export async function getCustomerRoutingInfo(customerId: string): Promise<{ city: string; cfRegion: string }> {
  if (!customerId) return { city: '', cfRegion: '' };
  try {
    const response = await zohoRequest<{ contact?: Record<string, unknown> }>(`/contacts/${customerId}`);
    const contact = response.contact || {};
    const billingAddress = (contact.billing_address || {}) as Record<string, unknown>;
    return { city: s(billingAddress.city).trim(), cfRegion: extractCfRegion(contact) };
  } catch {
    return { city: '', cfRegion: '' };
  }
}

export const normalizeWarehouse = (value: string) => value.toUpperCase().replace(/\s+/g, ' ').trim();
