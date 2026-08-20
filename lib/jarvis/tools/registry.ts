import { findViaFeatureTool } from './features';
import { assessOrderFulfillmentTool } from './fulfillment';
import { prepareSalesOrderTool } from './actions';
import { analyzeSalesPeriodsTool, boardroomSalesBriefTool } from './analytics';
import { analyzeReceivablesTool, getOperationalPipelineTool } from './executiveData';
import { analyzeGrossProfitTool, analyzeInventoryRiskTool } from './financeOperations';
import { searchKnowledgeTool } from './knowledge';
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
  assessOrderFulfillmentTool,
  prepareSalesOrderTool,
  analyzeSalesPeriodsTool,
  boardroomSalesBriefTool,
  analyzeReceivablesTool,
  getOperationalPipelineTool,
  analyzeGrossProfitTool,
  analyzeInventoryRiskTool,
  searchKnowledgeTool,
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
  assess_order_fulfillment: 'Order fulfilment analysis',
  prepare_sales_order: 'Sales Order preview',
  analyze_sales_periods: 'Sales performance analysis',
  boardroom_sales_brief: 'Boardroom sales brief',
  analyze_receivables: 'Receivables analysis',
  get_operational_pipeline: 'Operational pipeline',
  analyze_gross_profit: 'Gross profit analysis',
  analyze_inventory_risk: 'Inventory risk analysis',
  search_knowledge: 'Knowledge search',
};
