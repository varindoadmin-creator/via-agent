// ─── Zoho Books Sales Orders ──────────────────────────────────────────────────

import {
  ZohoSalesOrder,
  ZohoSOListResponse,
  ZohoSOResponse,
  ZohoCreateSOPayload,
} from '@/types/zoho';
import { zohoRequest, isMockMode } from './client';

// ─── Mock Data ────────────────────────────────────────────────────────────────

const MOCK_SALES_ORDERS: ZohoSalesOrder[] = [
  {
    salesorder_id: 'SO-MOCK-001',
    salesorder_number: 'SO-00001',
    date: '2025-01-15',
    status: 'open',
    customer_id: 'CUST-001',
    customer_name: 'PT PROFITTO INOVASI KREATIF',
    currency_code: 'IDR',
    line_items: [
      {
        line_item_id: 'LI-001',
        item_id: 'ITEM-001',
        name: 'Lamitak DXO 5338D',
        quantity: 50,
        unit: 'sht',
        rate: 125000,
        amount: 6250000,
      },
      {
        line_item_id: 'LI-002',
        item_id: 'ITEM-002',
        name: 'Lamitak WY 5217',
        quantity: 30,
        unit: 'sht',
        rate: 118000,
        amount: 3540000,
      },
    ],
    sub_total: 9790000,
    total: 9790000,
    notes: 'Pengiriman ke Jakarta, harap konfirmasi sebelum kirim.',
    created_time: '2025-01-15T09:00:00+07:00',
  },
  {
    salesorder_id: 'SO-MOCK-002',
    salesorder_number: 'SO-00002',
    date: '2025-01-16',
    status: 'draft',
    customer_id: 'CUST-002',
    customer_name: 'CV MAJU BERSAMA INDONESIA',
    currency_code: 'IDR',
    line_items: [
      {
        line_item_id: 'LI-003',
        item_id: 'ITEM-003',
        name: 'Lamitak SCT 1234D',
        quantity: 100,
        unit: 'sht',
        rate: 132000,
        amount: 13200000,
      },
    ],
    sub_total: 13200000,
    total: 13200000,
    notes: 'Bandung delivery.',
    created_time: '2025-01-16T10:00:00+07:00',
  },
];

let mockSOCounter = 3;

// ─── Sales Order Operations ───────────────────────────────────────────────────

/**
 * Search sales orders.
 */
export async function searchSalesOrders(
  query?: string,
  customerId?: string,
  status?: string,
  limit = 10
): Promise<ZohoSalesOrder[]> {
  if (isMockMode()) {
    return mockSearchSalesOrders(query, customerId, status);
  }

  const queryParams: Record<string, string | number | boolean> = {
    per_page: limit,
    sort_column: 'date',
    sort_order: 'D',
  };

  if (query) queryParams.search_text = query;
  if (customerId) queryParams.customer_id = customerId;
  if (status) queryParams.status = status;

  const response = await zohoRequest<ZohoSOListResponse>('/salesorders', {
    queryParams,
  });

  return response.salesorders || [];
}

/**
 * Get sales order by ID.
 */
export async function getSalesOrderById(
  soId: string
): Promise<ZohoSalesOrder | null> {
  if (isMockMode()) {
    return MOCK_SALES_ORDERS.find((so) => so.salesorder_id === soId) || null;
  }

  try {
    const response = await zohoRequest<ZohoSOResponse>(
      `/salesorders/${soId}`
    );
    return response.salesorder || null;
  } catch {
    return null;
  }
}

/**
 * Get sales order by SO number.
 */
export async function getSalesOrderByNumber(
  soNumber: string
): Promise<ZohoSalesOrder | null> {
  if (isMockMode()) {
    return (
      MOCK_SALES_ORDERS.find(
        (so) =>
          so.salesorder_number.toUpperCase() === soNumber.toUpperCase()
      ) || null
    );
  }

  const results = await searchSalesOrders(soNumber);
  return (
    results.find(
      (so) => so.salesorder_number.toUpperCase() === soNumber.toUpperCase()
    ) || results[0] || null
  );
}

/**
 * Create a draft Sales Order in Zoho Books.
 * ONLY called after APPROVE CREATE SO.
 */
export async function createDraftSalesOrder(
  payload: ZohoCreateSOPayload
): Promise<ZohoSalesOrder> {
  if (isMockMode()) {
    return mockCreateSalesOrder(payload);
  }

  const response = await zohoRequest<ZohoSOResponse>('/salesorders', {
    method: 'POST',
    body: {
      ...payload,
      // Always create as draft first
      status: 'draft',
    } as Record<string, unknown>,
  });

  if (!response.salesorder) {
    throw new Error('Zoho did not return salesorder after creation');
  }

  return response.salesorder;
}

/**
 * Update an existing Sales Order in Zoho Books.
 * ONLY called after APPROVE UPDATE SO.
 */
export async function updateSalesOrder(
  soId: string,
  payload: Partial<ZohoCreateSOPayload>
): Promise<ZohoSalesOrder> {
  if (isMockMode()) {
    return mockUpdateSalesOrder(soId, payload);
  }

  const response = await zohoRequest<ZohoSOResponse>(
    `/salesorders/${soId}`,
    {
      method: 'PUT',
      body: payload as Record<string, unknown>,
    }
  );

  if (!response.salesorder) {
    throw new Error('Zoho did not return salesorder after update');
  }

  return response.salesorder;
}

// ─── Mock Implementation ──────────────────────────────────────────────────────

function mockSearchSalesOrders(
  query?: string,
  customerId?: string,
  status?: string
): ZohoSalesOrder[] {
  let results = [...MOCK_SALES_ORDERS];

  if (query) {
    const q = query.toUpperCase();
    results = results.filter(
      (so) =>
        so.salesorder_number.toUpperCase().includes(q) ||
        so.customer_name.toUpperCase().includes(q)
    );
  }

  if (customerId) {
    results = results.filter((so) => so.customer_id === customerId);
  }

  if (status) {
    results = results.filter((so) => so.status === status);
  }

  return results;
}

function mockCreateSalesOrder(payload: ZohoCreateSOPayload): ZohoSalesOrder {
  const soNumber = `SO-${String(mockSOCounter++).padStart(5, '0')}`;
  const now = new Date().toISOString();

  const newSO: ZohoSalesOrder = {
    salesorder_id: `SO-MOCK-${mockSOCounter}`,
    salesorder_number: soNumber,
    date: payload.date,
    status: 'draft',
    customer_id: payload.customer_id,
    customer_name: `Customer ${payload.customer_id}`,
    currency_code: 'IDR',
    line_items: payload.line_items.map((li, idx) => ({
      line_item_id: `LI-NEW-${idx + 1}`,
      item_id: li.item_id,
      name: li.description || `Item ${li.item_id}`,
      quantity: li.quantity,
      unit: li.unit || 'sht',
      rate: li.rate,
      amount: li.quantity * li.rate,
    })),
    sub_total: payload.line_items.reduce(
      (sum, li) => sum + li.quantity * li.rate,
      0
    ),
    total: payload.line_items.reduce(
      (sum, li) => sum + li.quantity * li.rate,
      0
    ),
    notes: payload.notes,
    created_time: now,
  };

  MOCK_SALES_ORDERS.push(newSO);
  return newSO;
}

function mockUpdateSalesOrder(
  soId: string,
  payload: Partial<ZohoCreateSOPayload>
): ZohoSalesOrder {
  const idx = MOCK_SALES_ORDERS.findIndex((so) => so.salesorder_id === soId);
  if (idx === -1) {
    throw new Error(`Mock SO not found: ${soId}`);
  }

  const existing = MOCK_SALES_ORDERS[idx];
  const updated: ZohoSalesOrder = {
    ...existing,
    ...payload,
    line_items: payload.line_items
      ? payload.line_items.map((li, i) => ({
          line_item_id: `LI-UPD-${i}`,
          item_id: li.item_id,
          name: li.description || `Item ${li.item_id}`,
          quantity: li.quantity,
          unit: li.unit || 'sht',
          rate: li.rate,
          amount: li.quantity * li.rate,
        }))
      : existing.line_items,
  };

  if (payload.line_items) {
    updated.sub_total = payload.line_items.reduce(
      (sum, li) => sum + li.quantity * li.rate,
      0
    );
    updated.total = updated.sub_total;
  }

  MOCK_SALES_ORDERS[idx] = updated;
  return updated;
}
