// ─── Shipping address resolution ─────────────────────────────────────────────
// Brief sections 23-30: 0/1/many rules, cross-customer isolation enforced
// server-side, and free-text matching only against the selected customer's
// own addresses.

import type { ZohoAddress } from '../../../../types/zoho.ts';

export type AddressResolution =
  | { status: 'AUTO_SELECTED'; address: ZohoAddress }
  | { status: 'ASK'; candidates: ZohoAddress[] }
  | { status: 'NONE' };

/** Brief sections 24-25: exactly one -> auto-select; 0 -> ask customer for a new address (never auto-add to Zoho master data); 2+ -> ask which one, never inferred. */
export function resolveDeliveryAddress(addresses: ZohoAddress[]): AddressResolution {
  if (addresses.length === 0) return { status: 'NONE' };
  if (addresses.length === 1) return { status: 'AUTO_SELECTED', address: addresses[0] };
  return { status: 'ASK', candidates: addresses };
}

export type FreeTextAddressMatch =
  | { outcome: 'EXACT'; address: ZohoAddress }
  | { outcome: 'AMBIGUOUS'; candidates: ZohoAddress[] }
  | { outcome: 'NOT_FOUND' };

function normalizeAddressText(text: string): string {
  return text.toUpperCase().replace(/[^A-Z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Matches customer free text (e.g. "Kirim ke proyek BSD") only against
 * addresses already scoped to the selected customer (brief section 30, 64) —
 * callers must never pass in another customer's addresses.
 */
export function matchAddressFreeText(text: string, customerAddresses: ZohoAddress[]): FreeTextAddressMatch {
  const query = normalizeAddressText(text);
  if (!query) return { outcome: 'NOT_FOUND' };

  const matches = customerAddresses.filter(addr => {
    const haystack = normalizeAddressText([addr.attention, addr.address, addr.city].filter(Boolean).join(' '));
    return haystack.includes(query) || query.split(' ').filter(w => w.length >= 3).some(word => haystack.includes(word));
  });

  if (matches.length === 1) return { outcome: 'EXACT', address: matches[0] };
  if (matches.length > 1) return { outcome: 'AMBIGUOUS', candidates: matches };
  return { outcome: 'NOT_FOUND' };
}

/** Brief section 29: server-side enforcement that a delivery address actually belongs to the resolved customer. Never trust an address ID from customer text alone. */
export function addressBelongsToCustomer(addressId: string, customerAddresses: ZohoAddress[]): boolean {
  return customerAddresses.some(a => a.address_id === addressId);
}
