// Kept dependency-free so the conversation UI can show tool activity without loading tool handlers.
export const JARVIS_TOOL_LABELS: Record<string, string> = {
  find_via_feature: 'VIA feature lookup',
  search_customer: 'Customer lookup',
  get_customer: 'Customer details',
  search_item: 'Item lookup',
  get_item: 'Item details',
  get_customer_price: 'Customer price lookup',
  get_item_stock: 'System stock lookup',
  search_sales_orders: 'Sales Order lookup',
  get_sales_order: 'Sales Order details',
  assess_order_fulfillment: 'Order fulfilment analysis',
  search_purchase_orders: 'Purchase Order lookup',
  get_purchase_order: 'Purchase Order details',
  get_open_purchase_orders_for_item: 'Open PO coverage',
  prepare_sales_order: 'Sales Order preview',
  analyze_sales_periods: 'Sales performance analysis',
  analyze_sales_drivers: 'Sales driver analysis',
  identify_customer_opportunities: 'Customer opportunity analysis',
  run_customer_recovery_scenario: 'Customer recovery scenario',
  boardroom_sales_brief: 'Boardroom sales brief',
  analyze_receivables: 'Receivables analysis',
  get_operational_pipeline: 'Operational pipeline',
  analyze_gross_profit: 'Gross profit analysis',
  analyze_inventory_risk: 'Inventory risk analysis',
  search_knowledge: 'Knowledge search',
};

// Lightweight metadata for routing context. It intentionally has no tool-handler
// imports, so it is safe to use in deterministic context tests and the UI.
export const JARVIS_TOOL_CONTEXT_CATALOG = [
  ['find_via_feature', 'system', 'READ'], ['search_customer', 'customer', 'READ'], ['get_customer', 'customer', 'READ'],
  ['search_item', 'products', 'READ'], ['get_item', 'products', 'READ'], ['get_customer_price', 'sales', 'READ'],
  ['get_item_stock', 'inventory', 'READ'], ['search_sales_orders', 'sales', 'READ'], ['get_sales_order', 'sales', 'READ'],
  ['assess_order_fulfillment', 'inventory', 'ANALYZE'], ['search_purchase_orders', 'purchasing', 'READ'],
  ['get_purchase_order', 'purchasing', 'READ'], ['get_open_purchase_orders_for_item', 'purchasing', 'READ'],
  ['prepare_sales_order', 'sales', 'PREPARE'], ['analyze_sales_periods', 'analytics', 'ANALYZE'],
  ['analyze_sales_drivers', 'analytics', 'ANALYZE'], ['identify_customer_opportunities', 'analytics', 'ANALYZE'], ['run_customer_recovery_scenario', 'analytics', 'ANALYZE'],
  ['boardroom_sales_brief', 'analytics', 'ANALYZE'], ['analyze_receivables', 'finance', 'ANALYZE'],
  ['get_operational_pipeline', 'sales', 'ANALYZE'], ['analyze_gross_profit', 'finance', 'ANALYZE'],
  ['analyze_inventory_risk', 'inventory', 'ANALYZE'], ['search_knowledge', 'knowledge', 'READ'],
] as const;
