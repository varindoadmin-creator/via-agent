export interface JarvisToolActivity {
  name: string;
  status: 'completed' | 'failed';
}

const TOOL_LABELS: Record<string, string> = {
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

export function collectToolActivity(items: Array<{ rawItem?: unknown }>): JarvisToolActivity[] {
  const names = new Set<string>();
  for (const item of items) {
    const raw = item.rawItem as { type?: string; name?: string } | undefined;
    if (raw?.type === 'function_call' && raw.name) names.add(raw.name);
  }
  return [...names].map(name => ({
    name: TOOL_LABELS[name] || name,
    status: 'completed',
  }));
}
