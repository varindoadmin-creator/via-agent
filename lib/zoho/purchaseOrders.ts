// ─── Zoho Books Purchase Orders ───────────────────────────────────────────────

import { ZohoPurchaseOrder, ZohoPOListResponse } from '@/types/zoho';
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
      per_page: limit,
      sort_column: 'date',
      sort_order: 'D',
    },
  });

  return response.purchaseorders || [];
}

/**
 * Search purchase orders by item ID or item code.
 * Returns open POs that contain the specified item.
 */
export async function searchPOsForItem(
  itemId: string,
  itemCode?: string
): Promise<ZohoPurchaseOrder[]> {
  const openPOs = await getOpenPurchaseOrders();

  return openPOs.filter((po) => {
    return po.line_items.some((li) => {
      if (li.item_id && li.item_id === itemId) return true;
      if (itemCode && li.name) {
        const normalizedLineName = normalizeItemCode(li.name);
        const normalizedCode = normalizeItemCode(itemCode);
        return normalizedLineName.includes(normalizedCode);
      }
      return false;
    });
  });
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
    for (const li of po.line_items) {
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
