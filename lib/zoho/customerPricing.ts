import { getCustomerById } from './customers.ts';
import { getItemDetail } from './items.ts';
import { getItemPricebookEntry } from './pricebooks.ts';
import { getPricebookIdByTier } from './pricebookConfig.ts';

export interface CustomerItemPrice {
  customer_id: string;
  customer_name: string;
  item_id: string;
  item_name: string;
  sku: string | null;
  currency: string;
  customer_tier: string | null;
  pricebook_id: string | null;
  official_rate: number;
  base_rate: number;
  discount_percent: number;
  price_source: 'customer_pricebook' | 'base_item_rate';
}

export async function getCustomerItemPrice(
  customerId: string,
  itemId: string,
): Promise<CustomerItemPrice | null> {
  const [customer, item] = await Promise.all([
    getCustomerById(customerId),
    getItemDetail(itemId),
  ]);
  if (!customer || !item || item.status !== 'active') return null;

  const tier = customer.cf_tier || '';
  const pricebookId = customer.pricebook_id || getPricebookIdByTier(tier);
  const pricebookEntry = pricebookId
    ? await getItemPricebookEntry(pricebookId, itemId)
    : null;
  const baseRate = Number(item.rate) || 0;

  return {
    customer_id: customer.contact_id,
    customer_name: customer.contact_name,
    item_id: item.item_id,
    item_name: item.name,
    sku: item.sku || null,
    currency: customer.currency_code || 'IDR',
    customer_tier: tier || null,
    pricebook_id: pricebookId || null,
    official_rate: pricebookEntry?.rate ?? baseRate,
    base_rate: baseRate,
    discount_percent: pricebookEntry?.discount_percent ?? 0,
    price_source: pricebookEntry ? 'customer_pricebook' : 'base_item_rate',
  };
}
