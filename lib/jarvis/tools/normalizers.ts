import type { ZohoPurchaseOrder, ZohoSalesOrder } from '@/types/zoho';

export function salesOrderSummary(order: ZohoSalesOrder) {
  return {
    salesorder_id: order.salesorder_id,
    salesorder_number: order.salesorder_number,
    reference_number: order.reference_number || null,
    date: order.date,
    status: order.status,
    customer_id: order.customer_id,
    customer_name: order.customer_name,
    currency: order.currency_code,
    total: Number(order.total) || 0,
  };
}

export function salesOrderDetail(order: ZohoSalesOrder) {
  return {
    ...salesOrderSummary(order),
    delivery_method: order.delivery_method || null,
    shipment_date: order.shipment_date || null,
    line_items: (order.line_items || []).map(item => ({
      item_id: item.item_id,
      sku: item.sku || null,
      name: item.name,
      quantity: Number(item.quantity) || 0,
      unit: item.unit || null,
      rate: Number(item.rate) || 0,
      amount: Number(item.amount) || 0,
    })),
  };
}

export function purchaseOrderSummary(order: ZohoPurchaseOrder) {
  return {
    purchaseorder_id: order.purchaseorder_id,
    purchaseorder_number: order.purchaseorder_number,
    reference_number: order.reference_number || null,
    date: order.date,
    status: order.status,
    vendor_id: order.vendor_id,
    vendor_name: order.vendor_name,
    currency: order.currency_code,
    total: Number(order.total) || 0,
    expected_delivery_date: order.expected_delivery_date || null,
  };
}

export function purchaseOrderDetail(order: ZohoPurchaseOrder) {
  return {
    ...purchaseOrderSummary(order),
    line_items: (order.line_items || []).map(item => ({
      item_id: item.item_id || null,
      sku: item.sku || null,
      name: item.name,
      quantity: Number(item.quantity) || 0,
      quantity_billed: Number(item.quantity_billed) || 0,
      quantity_cancelled: Number(item.quantity_cancelled) || 0,
      open_quantity: Math.max(0,
        (Number(item.quantity) || 0) -
        (Number(item.quantity_billed) || 0) -
        (Number(item.quantity_cancelled) || 0)
      ),
      unit: item.unit || null,
      rate: Number(item.rate) || 0,
      amount: Number(item.amount) || 0,
    })),
  };
}
