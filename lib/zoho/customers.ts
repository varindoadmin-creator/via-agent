// ─── Zoho Books Customers ─────────────────────────────────────────────────────

import { ZohoContact, ZohoContactListResponse } from '@/types/zoho';
import { zohoRequest, isMockMode } from './client';

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

async function getAllCustomers(): Promise<ZohoContact[]> {
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

  return Math.min(1, wordScore + boost);
}
