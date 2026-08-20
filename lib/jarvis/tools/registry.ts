import { findViaFeatureTool } from './features';
import { getItemStockTool, searchCustomerTool, searchItemTool } from './zoho';
import {
  getCustomerPriceTool,
  getCustomerTool,
  getItemTool,
  getOpenPurchaseOrdersForItemTool,
  getPurchaseOrderTool,
  getSalesOrderTool,
  searchPurchaseOrdersTool,
  searchSalesOrdersTool,
} from './operations';

export const JARVIS_READ_TOOLS = [
  findViaFeatureTool,
  searchCustomerTool,
  searchItemTool,
  getItemStockTool,
  getCustomerTool,
  getItemTool,
  getCustomerPriceTool,
  searchSalesOrdersTool,
  getSalesOrderTool,
  searchPurchaseOrdersTool,
  getPurchaseOrderTool,
  getOpenPurchaseOrdersForItemTool,
] as const;

export const JARVIS_TOOL_LABELS: Record<string, string> = {
  find_via_feature: 'VIA feature lookup',
  search_customer: 'Customer lookup',
  search_item: 'Item lookup',
  get_item_stock: 'System stock lookup',
  get_customer: 'Customer details',
  get_item: 'Item details',
  get_customer_price: 'Customer price lookup',
  search_sales_orders: 'Sales Order lookup',
  get_sales_order: 'Sales Order details',
  search_purchase_orders: 'Purchase Order lookup',
  get_purchase_order: 'Purchase Order details',
  get_open_purchase_orders_for_item: 'Open PO coverage',
};
