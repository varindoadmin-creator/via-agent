// ─── Zoho Books Customers ─────────────────────────────────────────────────────

import type { ZohoContact, ZohoContactListResponse, ZohoAddress } from '../../types/zoho.ts';
import { zohoRequest, isMockMode } from './client.ts';
import { fuzzyNameSimilarity } from '../ai/phoneticMatching.ts';

// ─── Mock Data ────────────────────────────────────────────────────────────────

const MOCK_CUSTOMERS: ZohoContact[] = [
  {
    contact_id: 'CUST-001',
    contact_name: 'PT PROFITTO INOVASI KREATIF',
    company_name: 'PT PROFITTO INOVASI KREATIF',
    email: 'order@profitto.co.id',
    phone: '021-12345678',
    status: 'active',
    contact_type: 'customer',
    currency_code: 'IDR',
    billing_address: {
      address: 'Jl. Sudirman No. 123',
      city: 'Jakarta',
      state: 'DKI Jakarta',
      zip: '10220',
      country: 'Indonesia',
    },
  },
  {
    contact_id: 'CUST-002',
    contact_name: 'CV MAJU BERSAMA INDONESIA',
    company_name: 'CV MAJU BERSAMA INDONESIA',
    email: 'purchasing@majubersama.com',
    phone: '022-98765432',
    status: 'active',
    contact_type: 'customer',
    currency_code: 'IDR',
    billing_address: {
      address: 'Jl. Asia Afrika No. 45',
      city: 'Bandung',
      state: 'Jawa Barat',
      zip: '40111',
      country: 'Indonesia',
    },
  },
  {
    contact_id: 'CUST-003',
    contact_name: 'PT KARYA INTERIOR NUSANTARA',
    company_name: 'PT KARYA INTERIOR NUSANTARA',
    email: 'admin@karyanusantara.id',
    phone: '031-44556677',
    status: 'active',
    contact_type: 'customer',
    currency_code: 'IDR',
    billing_address: {
      address: 'Jl. Pemuda No. 78',
      city: 'Surabaya',
      state: 'Jawa Timur',
      zip: '60271',
      country: 'Indonesia',
    },
  },
  {
    contact_id: 'CUST-004',
    contact_name: 'TOKO BAHAN BANGUNAN SEJAHTERA',
    company_name: 'TOKO BAHAN BANGUNAN SEJAHTERA',
    email: 'tb.sejahtera@gmail.com',
    phone: '022-55443322',
    status: 'active',
    contact_type: 'customer',
    currency_code: 'IDR',
    billing_address: {
      address: 'Jl. Soekarno Hatta No. 200',
      city: 'Bandung',
      state: 'Jawa Barat',
      zip: '40256',
      country: 'Indonesia',
    },
  },
];

// ─── Customer Search ──────────────────────────────────────────────────────────

/**
 * Search customers in Zoho Books.
 * Uses meaningful word matching to avoid irrelevant suggestions.
 */
// In-memory cache for customer list (refreshed every 5 minutes)
let customerCache: ZohoContact[] = [];
let customerCacheTime = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export async function getAllCustomers(): Promise<ZohoContact[]> {
  const now = Date.now();
  if (customerCache.length > 0 && now - customerCacheTime < CACHE_TTL) {
    return customerCache;
  }
  // Fetch all active customers (paginated)
  const allCustomers: ZohoContact[] = [];
  let page = 1;
  let hasMore = true;
  while (hasMore) {
    const response = await zohoRequest<ZohoContactListResponse>('/contacts', {
      queryParams: {
        contact_type: 'customer',
        status: 'active',
        per_page: '200',
        page: String(page),
        sort_column: 'contact_name',
        sort_order: 'A',
      },
    });
    const batch = response.contacts || [];
    allCustomers.push(...batch);
    hasMore = batch.length === 200;
    page++;
    if (page > 10) break; // safety limit
  }
  customerCache = allCustomers;
  customerCacheTime = now;
  return allCustomers;
}

export async function searchCustomers(
  query: string,
  limit = 10
): Promise<ZohoContact[]> {
  if (isMockMode()) {
    return mockSearchCustomers(query);
  }

  try {
    const allCustomers = await getAllCustomers();
    if (!query || query.trim().length < 2) return allCustomers.slice(0, limit);

    const queryUpper = query.toUpperCase().trim();

    // Score all customers and return top matches
    const scored = allCustomers
      .map(c => ({ contact: c, score: scoreCustomerMatch(c.contact_name, query) }))
      .filter(m => m.score > 0)
      .sort((a, b) => b.score - a.score);

    // If no scored matches, try substring on company name
    if (scored.length === 0) {
      const fallback = allCustomers.filter(c =>
        String(c.contact_name).toUpperCase().includes(queryUpper) ||
        String(c.company_name || '').toUpperCase().includes(queryUpper)
      );
      return fallback.slice(0, limit);
    }

    return scored.slice(0, limit).map(m => m.contact);
  } catch (error) {
    console.error('Zoho customer search error:', error);
    throw error;
  }
}

/**
 * Get a single customer by ID.
 */
export async function getCustomerById(contactId: string): Promise<ZohoContact | null> {
  if (isMockMode()) {
    return MOCK_CUSTOMERS.find((c) => c.contact_id === contactId) || null;
  }

  try {
    const response = await zohoRequest<{ contact: ZohoContact }>(
      `/contacts/${contactId}`
    );
    return response.contact || null;
  } catch {
    return null;
  }
}

/**
 * Candidate shipping/delivery addresses for a customer (brief sections
 * 23-30). Combines the contact's primary shipping_address with any
 * additional addresses on file, deduplicated by address_id/address text.
 * Never returns another customer's addresses — always scoped by contactId.
 */
export async function getCustomerAddresses(contactId: string): Promise<ZohoAddress[]> {
  if (isMockMode()) {
    const customer = MOCK_CUSTOMERS.find((c) => c.contact_id === contactId);
    return customer?.shipping_address ? [customer.shipping_address] : [];
  }
  const customer = await getCustomerById(contactId);
  const addresses: ZohoAddress[] = [];
  if (customer?.shipping_address) addresses.push(customer.shipping_address);
  try {
    const response = await zohoRequest<{ addresses?: ZohoAddress[] }>(`/contacts/${contactId}/address`);
    for (const addr of response.addresses || []) {
      const isDuplicate = addresses.some(a => a.address_id ? a.address_id === addr.address_id : a.address === addr.address);
      if (!isDuplicate) addresses.push(addr);
    }
  } catch {
    // Additional-address sub-resource unavailable — fall back to just the primary shipping address.
  }
  return addresses;
}

/**
 * Create a new Zoho Customer.
 *
 * VIA Customer Operations Phase 6, brief section 13: this is the ONLY code
 * path that creates Zoho master-data customers. It must only ever be called
 * after: a duplicate check has run, an internal admin/director has approved
 * an unexpired, version/hash-matched CustomerDraft, and required fields (incl.
 * the NPWP rule — only present when needsFakturPajak) have been validated.
 * Callers (lib/commercialApprovals/executeCustomerCreation.ts) are
 * responsible for that revalidation immediately before calling this —
 * this function does not re-run the duplicate check itself, since it has no
 * visibility into which approval authorized the call.
 */
export async function createApprovedCustomer(input: {
  companyName: string;
  contactPersonName?: string | null;
  email?: string | null;
  needsFakturPajak: boolean;
  npwp?: string | null;
  billingAddress?: { address: string; city?: string; state?: string; zip?: string; country?: string } | null;
  shippingAddress?: { address: string; city?: string; state?: string; zip?: string; country?: string } | null;
}): Promise<ZohoContact> {
  if (isMockMode()) {
    const mock: ZohoContact = {
      contact_id: `MOCK-CUST-${Date.now()}`,
      contact_name: input.companyName,
      company_name: input.companyName,
      status: 'active',
      contact_type: 'customer',
      currency_code: 'IDR',
      cf_needs_faktur_pajak: input.needsFakturPajak,
      cf_npwp: input.needsFakturPajak ? (input.npwp ?? undefined) : undefined,
    };
    MOCK_CUSTOMERS.push(mock);
    return mock;
  }

  const toZohoAddress = (a: NonNullable<typeof input.billingAddress>) => ({
    address: a.address, city: a.city || '', state: a.state || '', zip: a.zip || '', country: a.country || 'Indonesia',
  });

  const payload: Record<string, unknown> = {
    contact_name: input.companyName,
    company_name: input.companyName,
    contact_type: 'customer',
    currency_code: 'IDR',
  };
  if (input.needsFakturPajak && input.npwp) payload.cf_npwp = input.npwp;
  payload.cf_needs_faktur_pajak = input.needsFakturPajak;
  if (input.contactPersonName) {
    payload.contact_persons = [{ first_name: input.contactPersonName, email: input.email || undefined, is_primary_contact: true }];
  }
  if (input.billingAddress) payload.billing_address = toZohoAddress(input.billingAddress);
  if (input.shippingAddress) payload.shipping_address = toZohoAddress(input.shippingAddress);

  const response = await zohoRequest<{ contact: ZohoContact }>('/contacts', {
    method: 'POST',
    // A timed-out create has an unknown outcome. The approval workflow leaves
    // it for manual reconciliation instead of issuing a duplicate POST.
    retries: 0,
    body: payload,
  });
  if (!response.contact) throw new Error('Zoho did not return a contact after customer creation.');
  customerCache = []; // invalidate the read cache so the new customer is immediately findable
  return response.contact;
}

// ─── Mock Implementation ──────────────────────────────────────────────────────

function mockSearchCustomers(query: string): ZohoContact[] {
  if (!query || query.trim().length < 2) return [];

  const queryWords = query
    .toUpperCase()
    .split(/\s+/)
    .filter((w) => w.length > 2); // meaningful words only

  return MOCK_CUSTOMERS.filter((customer) => {
    const name = (customer.contact_name || '').toUpperCase();
    // Match if any meaningful query word appears in the customer name
    return queryWords.some((word) => name.includes(word));
  });
}

/**
 * Score customer match confidence based on word overlap.
 * Returns 0-1 score.
 */
export function scoreCustomerMatch(customerName: string, query: string): number {
  if (!customerName || !query) return 0;

  const nameUpper = customerName.toUpperCase();
  const queryUpper = query.toUpperCase().trim();

  // Direct substring match — highest confidence
  if (nameUpper.includes(queryUpper)) return 0.95;
  if (queryUpper.includes(nameUpper)) return 0.9;

  const nameWords = nameUpper.split(/[\s,]+/).filter((w) => w.length > 2);
  const queryWords = queryUpper.split(/[\s,]+/).filter((w) => w.length > 2);

  if (queryWords.length === 0) return 0;

  // Word-level matching with partial support
  const matches = queryWords.filter((qw) =>
    nameWords.some((nw) => nw.includes(qw) || qw.includes(nw))
  );

  const wordScore = matches.length / queryWords.length;

  // Boost if the name starts with the query
  const boost = nameUpper.startsWith(queryUpper) ? 0.1 : 0;

  const fuzzyScore = fuzzyNameSimilarity(customerName, query);
  // Fuzzy matches are intentionally capped below exact/substring matches so
  // a speech prediction is visible for confirmation, never silently certain.
  return Math.max(Math.min(1, wordScore + boost), Math.min(0.84, fuzzyScore * 0.9));
}
