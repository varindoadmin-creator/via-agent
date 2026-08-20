// ─── Zoho Books Purchase Orders ───────────────────────────────────────────────

import { ZohoPurchaseOrder, ZohoPOListResponse, ZohoPOResponse } from '@/types/zoho';
import { zohoRequest, isMockMode } from './client';
import { normalizeItemCode } from '@/lib/utils/normalizeItemCode';

// ─── Mock Data ────────────────────────────────────────────────────────────────

const MOCK_PURCHASE_ORDERS: ZohoPurchaseOrder[] = [
  {
    purchaseorder_id: 'PO-MOCK-001',
    purchaseorder_number: 'PO-00001',
    date: '2025-01-10',
    status: 'open',
    vendor_id: 'VENDOR-001',
    vendor_name: 'PT LAMITAK INDONESIA',
    currency_code: 'IDR',
    line_items: [
      {
        line_item_id: 'PLI-001',
        item_id: 'ITEM-001',
        name: 'Lamitak DXO 5338D',
        quantity: 200,
        quantity_billed: 0,
        unit: 'sht',
        rate: 80000,
        amount: 16000000,
      },
      {
        line_item_id: 'PLI-002',
        item_id: 'ITEM-003',
        name: 'Lamitak SCT 1234D',
        quantity: 100,
        quantity_billed: 50,
        unit: 'sht',
        rate: 85000,
        amount: 8500000,
      },
    ],
    sub_total: 24500000,
    total: 24500000,
    expected_delivery_date: '2025-01-25',
    created_time: '2025-01-10T08:00:00+07:00',
  },
  {
    purchaseorder_id: 'PO-MOCK-002',
    purchaseorder_number: 'PO-00002',
    date: '2025-01-12',
    status: 'open',
    vendor_id: 'VENDOR-001',
    vendor_name: 'PT LAMITAK INDONESIA',
    currency_code: 'IDR',
    line_items: [
      {
        line_item_id: 'PLI-003',
        item_id: 'ITEM-002',
        name: 'Lamitak WY 5217',
        quantity: 150,
        quantity_billed: 0,
        unit: 'sht',
        rate: 78000,
        amount: 11700000,
      },
    ],
    sub_total: 11700000,
    total: 11700000,
    expected_delivery_date: '2025-01-28',
    created_time: '2025-01-12T09:00:00+07:00',
  },
];

// ─── Purchase Order Operations ────────────────────────────────────────────────

/**
 * Get all open (not closed/billed) Purchase Orders.
 */
export async function getOpenPurchaseOrders(limit = 50): Promise<ZohoPurchaseOrder[]> {
  if (isMockMode()) {
    return MOCK_PURCHASE_ORDERS.filter(
      (po) => po.status === 'open' || po.status === 'draft'
    );
  }

  const response = await zohoRequest<ZohoPOListResponse>('/purchaseorders', {
    queryParams: {
      status: 'open',
      per_page: Math.max(1, Math.min(200, limit)),
      sort_column: 'date',
      sort_order: 'D',
    },
  });

  return response.purchaseorders || [];
}

export async function searchPurchaseOrders(
  query?: string,
  status?: string,
  limit = 10,
): Promise<ZohoPurchaseOrder[]> {
  if (isMockMode()) {
    const normalized = query?.trim().toUpperCase();
    return MOCK_PURCHASE_ORDERS.filter(po =>
      (!status || po.status === status) &&
      (!normalized || po.purchaseorder_number.toUpperCase().includes(normalized) || po.vendor_name.toUpperCase().includes(normalized))
    ).slice(0, limit);
  }

  const queryParams: Record<string, string | number | boolean> = {
    per_page: Math.max(1, Math.min(50, limit)),
    sort_column: 'date',
    sort_order: 'D',
  };
  if (query) queryParams.search_text = query;
  if (status) queryParams.status = status;
  const response = await zohoRequest<ZohoPOListResponse>('/purchaseorders', { queryParams });
  return response.purchaseorders || [];
}

export async function getPurchaseOrderById(poId: string): Promise<ZohoPurchaseOrder | null> {
  if (isMockMode()) return MOCK_PURCHASE_ORDERS.find(po => po.purchaseorder_id === poId) || null;
  try {
    const response = await zohoRequest<ZohoPOResponse>(`/purchaseorders/${encodeURIComponent(poId)}`);
    return response.purchaseorder || null;
  } catch {
    return null;
  }
}

export async function getPurchaseOrderByNumber(poNumber: string): Promise<ZohoPurchaseOrder | null> {
  if (isMockMode()) {
    return MOCK_PURCHASE_ORDERS.find(po => po.purchaseorder_number.toUpperCase() === poNumber.toUpperCase()) || null;
  }
  const matches = await searchPurchaseOrders(poNumber, undefined, 10);
  const summary = matches.find(po => po.purchaseorder_number.toUpperCase() === poNumber.toUpperCase());
  return summary ? getPurchaseOrderById(summary.purchaseorder_id) : null;
}

/**
 * Search purchase orders by item ID or item code.
 * Returns open POs that contain the specified item.
 */
export async function searchPOsForItem(
  itemId: string,
  itemCode?: string
): Promise<ZohoPurchaseOrder[]> {
  const result = await searchPOCoverageForItem(itemId, itemCode);
  return result.orders;
}

export interface PurchaseOrderCoverageSearch {
  orders: ZohoPurchaseOrder[];
  scannedOpenPurchaseOrders: number;
  hasMoreOpenPurchaseOrders: boolean;
}

/** Search the newest open-PO page and expose whether older pages also exist. */
export async function searchPOCoverageForItem(
  itemId: string,
  itemCode?: string
): Promise<PurchaseOrderCoverageSearch> {
  let summaries: ZohoPurchaseOrder[];
  let hasMoreOpenPurchaseOrders = false;

  if (isMockMode()) {
    summaries = MOCK_PURCHASE_ORDERS.filter(
      po => po.status === 'open' || po.status === 'draft'
    );
  } else {
    const response = await zohoRequest<ZohoPOListResponse>('/purchaseorders', {
      queryParams: {
        status: 'open',
        per_page: 200,
        page: 1,
        sort_column: 'date',
        sort_order: 'D',
      },
    });
    summaries = response.purchaseorders || [];
    hasMoreOpenPurchaseOrders = Boolean(response.page_context?.has_more_page);
  }

  // List endpoints do not consistently include line_items. Hydrate each bounded
  // candidate before calculating item coverage.
  const openPOs: ZohoPurchaseOrder[] = [];
  for (let index = 0; index < summaries.length; index += 5) {
    const batch = summaries.slice(index, index + 5);
    const hydrated = await Promise.all(
      batch.map(po => po.line_items?.length ? Promise.resolve(po) : getPurchaseOrderById(po.purchaseorder_id)),
    );
    openPOs.push(...hydrated.filter((po): po is ZohoPurchaseOrder => Boolean(po)));
  }

  const orders = openPOs.filter((po) => {
    return (po.line_items || []).some((li) => {
      if (li.item_id && li.item_id === itemId) return true;
      if (itemCode && li.name) {
        const normalizedLineName = normalizeItemCode(li.name);
        const normalizedCode = normalizeItemCode(itemCode);
        return normalizedLineName.includes(normalizedCode);
      }
      return false;
    });
  });

  return {
    orders,
    scannedOpenPurchaseOrders: summaries.length,
    hasMoreOpenPurchaseOrders,
  };
}

/**
 * Get total open PO quantity for an item across all open POs.
 */
export function getOpenPOQuantityForItem(
  openPOs: ZohoPurchaseOrder[],
  itemId: string,
  itemCode?: string
): { quantity: number; poNumbers: string[] } {
  let totalQty = 0;
  const poNumbers: string[] = [];

  for (const po of openPOs) {
    let addedPO = false;
    for (const li of po.line_items || []) {
      const matchById = li.item_id && li.item_id === itemId;
      const matchByCode =
        itemCode &&
        li.name &&
        normalizeItemCode(li.name).includes(normalizeItemCode(itemCode));

      if (matchById || matchByCode) {
        const openQty =
          li.quantity - (li.quantity_billed || 0) - (li.quantity_cancelled || 0);
        if (openQty > 0) {
          totalQty += openQty;
          if (!addedPO) {
            poNumbers.push(po.purchaseorder_number);
            addedPO = true;
          }
        }
      }
    }
  }

  return { quantity: totalQty, poNumbers };
}
