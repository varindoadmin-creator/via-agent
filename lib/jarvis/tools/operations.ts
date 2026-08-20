import { tool } from '@openai/agents';
import { z } from 'zod';
import { cached } from '@/lib/jarvis/cache';
import type { JarvisRunContext } from '@/lib/jarvis/context';
import { getCustomerById } from '@/lib/zoho/customers';
import { getCustomerItemPrice } from '@/lib/zoho/customerPricing';
import { getItemDetail } from '@/lib/zoho/items';
import {
  getSalesOrderById,
  getSalesOrderByNumber,
  searchSalesOrders,
} from '@/lib/zoho/salesOrders';
import {
  getOpenPOQuantityForItem,
  getPurchaseOrderById,
  getPurchaseOrderByNumber,
  searchPOCoverageForItem,
  searchPurchaseOrders,
} from '@/lib/zoho/purchaseOrders';
import {
  purchaseOrderDetail,
  purchaseOrderSummary,
  salesOrderDetail,
  salesOrderSummary,
} from './normalizers';

const idParameters = z.object({ id: z.string().min(1).max(100) });

export const getCustomerTool = tool<typeof idParameters, JarvisRunContext>({
  name: 'get_customer',
  description: 'Read one exact Zoho customer by customer ID. Returns found, source, name, status, tier, currency, outstanding receivable, and billing city. Returns found=false when unavailable.',
  parameters: idParameters,
  async execute({ id }, context) {
    const customer = await cached(context, `customer:${id}`, () => getCustomerById(id));
    if (!customer) return { source: 'Zoho Books contacts', found: false, customer_id: id };
    return {
      source: 'Zoho Books contacts',
      found: true,
      customer_id: customer.contact_id,
      customer_name: customer.contact_name,
      company_name: customer.company_name || null,
      status: customer.status,
      tier: customer.cf_tier || null,
      currency: customer.currency_code || 'IDR',
      outstanding_receivable: Number(customer.outstanding_receivable_amount) || 0,
      billing_city: customer.billing_address?.city || null,
    };
  },
});

export const getItemTool = tool<typeof idParameters, JarvisRunContext>({
  name: 'get_item',
  description: 'Read one exact Zoho item by item ID. Returns found, source, SKU, name, status, unit, base sales rate, and purchase rate. Returns found=false when unavailable.',
  parameters: idParameters,
  async execute({ id }, context) {
    const item = await cached(context, `item:${id}`, () => getItemDetail(id));
    if (!item) return { source: 'Zoho Books items', found: false, item_id: id };
    return {
      source: 'Zoho Books items',
      found: true,
      item_id: item.item_id,
      sku: item.sku || null,
      name: item.name,
      status: item.status,
      unit: item.unit || null,
      base_sales_rate: Number(item.rate) || 0,
      purchase_rate: Number(item.purchase_rate) || 0,
      currency: 'IDR',
    };
  },
});

const priceParameters = z.object({
  customer_id: z.string().min(1).max(100),
  item_id: z.string().min(1).max(100),
});

export const getCustomerPriceTool = tool<typeof priceParameters, JarvisRunContext>({
  name: 'get_customer_price',
  description: 'Resolve the official current customer-specific item rate using the exact Zoho customer ID and item ID. Returns found=false when either record is missing/inactive. Output identifies whether the customer pricebook or base item rate was used.',
  parameters: priceParameters,
  async execute({ customer_id, item_id }, context) {
    const price = await cached(context, `price:${customer_id}:${item_id}`, () =>
      getCustomerItemPrice(customer_id, item_id)
    );
    return price
      ? { source: 'Zoho Books customer and pricebook', found: true, ...price }
      : { source: 'Zoho Books customer and pricebook', found: false, customer_id, item_id };
  },
});

const salesOrderSearchParameters = z.object({
  query: z.string().max(160).optional(),
  customer_id: z.string().max(100).optional(),
  status: z.enum(['draft', 'open', 'invoiced', 'partially_invoiced', 'void', 'overdue']).optional(),
  limit: z.number().int().min(1).max(20).default(10),
});

export const searchSalesOrdersTool = tool<typeof salesOrderSearchParameters, JarvisRunContext>({
  name: 'search_sales_orders',
  description: 'Search recent Zoho Sales Orders by text/SO number, exact customer ID, and/or status. Returns source and summary matches without line items. Use get_sales_order for exact details. Empty matches means none found.',
  parameters: salesOrderSearchParameters,
  async execute({ query, customer_id, status, limit }, context) {
    const key = `so-search:${query || ''}:${customer_id || ''}:${status || ''}:${limit}`;
    const orders = await cached(context, key, () =>
      searchSalesOrders(query, customer_id, status, limit)
    );
    return { source: 'Zoho Books sales orders', matches: orders.map(salesOrderSummary) };
  },
});

const documentParameters = z.object({
  identifier: z.string().min(1).max(100),
  identifier_type: z.enum(['id', 'number']),
});

export const getSalesOrderTool = tool<typeof documentParameters, JarvisRunContext>({
  name: 'get_sales_order',
  description: 'Read an exact Zoho Sales Order by internal ID or visible SO number. Returns found, source, header, totals, delivery fields, and line items. Returns found=false when unavailable.',
  parameters: documentParameters,
  async execute({ identifier, identifier_type }, context) {
    const order = await cached(context, `so:${identifier_type}:${identifier}`, () =>
      identifier_type === 'id' ? getSalesOrderById(identifier) : getSalesOrderByNumber(identifier)
    );
    return order
      ? { source: 'Zoho Books sales orders', found: true, ...salesOrderDetail(order) }
      : { source: 'Zoho Books sales orders', found: false, identifier, identifier_type };
  },
});

const purchaseOrderSearchParameters = z.object({
  query: z.string().max(160).optional(),
  status: z.enum(['draft', 'open', 'billed', 'partially_billed', 'cancelled']).optional(),
  limit: z.number().int().min(1).max(20).default(10),
});

export const searchPurchaseOrdersTool = tool<typeof purchaseOrderSearchParameters, JarvisRunContext>({
  name: 'search_purchase_orders',
  description: 'Search recent Zoho Purchase Orders by text/PO number/vendor and optional status. Returns source and summary matches. Use get_purchase_order for exact line-item details. Empty matches means none found.',
  parameters: purchaseOrderSearchParameters,
  async execute({ query, status, limit }, context) {
    const key = `po-search:${query || ''}:${status || ''}:${limit}`;
    const orders = await cached(context, key, () => searchPurchaseOrders(query, status, limit));
    return { source: 'Zoho Books purchase orders', matches: orders.map(purchaseOrderSummary) };
  },
});

export const getPurchaseOrderTool = tool<typeof documentParameters, JarvisRunContext>({
  name: 'get_purchase_order',
  description: 'Read an exact Zoho Purchase Order by internal ID or visible PO number. Returns found, source, vendor, dates, totals, and line items with deterministic open quantities. Returns found=false when unavailable.',
  parameters: documentParameters,
  async execute({ identifier, identifier_type }, context) {
    const order = await cached(context, `po:${identifier_type}:${identifier}`, () =>
      identifier_type === 'id' ? getPurchaseOrderById(identifier) : getPurchaseOrderByNumber(identifier)
    );
    return order
      ? { source: 'Zoho Books purchase orders', found: true, ...purchaseOrderDetail(order) }
      : { source: 'Zoho Books purchase orders', found: false, identifier, identifier_type };
  },
});

const itemPOParameters = z.object({
  item_id: z.string().min(1).max(100),
  item_code: z.string().max(160).optional(),
});

export const getOpenPurchaseOrdersForItemTool = tool<typeof itemPOParameters, JarvisRunContext>({
  name: 'get_open_purchase_orders_for_item',
  description: 'Find an item in the newest 200 open Zoho Purchase Orders, hydrating PO details before calculation. Returns deterministic total open quantity, matching PO details, and explicit coverage completeness. Never describe an empty result as no open PO coverage when coverage_complete is false.',
  parameters: itemPOParameters,
  async execute({ item_id, item_code }, context) {
    const result = await cached(context, `po-item:${item_id}:${item_code || ''}`, () =>
      searchPOCoverageForItem(item_id, item_code)
    );
    const coverage = getOpenPOQuantityForItem(result.orders, item_id, item_code);
    return {
      source: 'Zoho Books purchase orders',
      item_id,
      item_code: item_code || null,
      coverage_scope: 'newest_open_purchase_orders',
      open_purchase_orders_scanned: result.scannedOpenPurchaseOrders,
      coverage_complete: !result.hasMoreOpenPurchaseOrders,
      total_open_quantity: coverage.quantity,
      po_numbers: coverage.poNumbers,
      purchase_orders: result.orders.map(purchaseOrderDetail),
    };
  },
});
