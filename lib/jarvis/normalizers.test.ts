import assert from 'node:assert/strict';
import test from 'node:test';
import { purchaseOrderDetail, salesOrderDetail } from './tools/normalizers.ts';

test('purchase order detail calculates open quantity deterministically', () => {
  const detail = purchaseOrderDetail({
    purchaseorder_id: 'po-1',
    purchaseorder_number: 'PO-1',
    date: '2026-08-01',
    status: 'open',
    vendor_id: 'vendor-1',
    vendor_name: 'Vendor',
    currency_code: 'IDR',
    sub_total: 1_000,
    total: 1_000,
    line_items: [{
      item_id: 'item-1',
      name: 'Item',
      quantity: 20,
      quantity_billed: 7,
      quantity_cancelled: 3,
      rate: 50,
      amount: 1_000,
    }],
  });

  assert.equal(detail.line_items[0].open_quantity, 10);
});

test('sales order detail exposes bounded business fields without notes', () => {
  const detail = salesOrderDetail({
    salesorder_id: 'so-1',
    salesorder_number: 'SO-1',
    date: '2026-08-01',
    status: 'open',
    customer_id: 'customer-1',
    customer_name: 'Customer',
    currency_code: 'IDR',
    sub_total: 500,
    total: 500,
    notes: 'Sensitive internal note',
    line_items: [{ item_id: 'item-1', name: 'Item', quantity: 5, rate: 100, amount: 500 }],
  });

  assert.equal(detail.line_items[0].quantity, 5);
  assert.equal('notes' in detail, false);
});
