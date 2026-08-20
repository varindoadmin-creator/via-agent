import { tool } from '@openai/agents';
import { z } from 'zod';
import { searchCustomers } from '@/lib/zoho/customers';
import { getItemWithStock, searchItems } from '@/lib/zoho/items';
import type { JarvisRunContext } from '@/lib/jarvis/context';

const searchParameters = z.object({
  query: z.string().min(2).max(160),
  limit: z.number().int().min(1).max(10).default(5),
});

export const searchCustomerTool = tool<typeof searchParameters, JarvisRunContext>({
  name: 'search_customer',
  description: 'Search active Zoho Books customers by name. Returns candidate customer IDs and names only. An empty matches array means no customer was found.',
  parameters: searchParameters,
  async execute({ query, limit }) {
    const matches = await searchCustomers(query, limit);
    return {
      source: 'Zoho Books contacts',
      matches: matches.map(customer => ({
        customer_id: String(customer.contact_id),
        customer_name: customer.contact_name,
        company_name: customer.company_name || null,
        status: customer.status,
      })),
    };
  },
});

export const searchItemTool = tool<typeof searchParameters, JarvisRunContext>({
  name: 'search_item',
  description: 'Search Zoho Books items by SKU, item code, or name. Returns candidate item IDs, SKUs, names, and status. An empty matches array means no item was found.',
  parameters: searchParameters,
  async execute({ query, limit }) {
    const matches = await searchItems(query, limit);
    return {
      source: 'Zoho Books items',
      matches: matches.map(item => ({
        item_id: String(item.item_id),
        sku: item.sku || null,
        name: item.name,
        status: item.status || null,
      })),
    };
  },
});

const stockParameters = z.object({
  item_id: z.string().min(1).max(100).describe('Exact Zoho item_id returned by search_item.'),
});

export const getItemStockTool = tool<typeof stockParameters, JarvisRunContext>({
  name: 'get_item_stock',
  description: 'Read current system stock for one exact Zoho item ID. Returns totals and location-level system stock, or found=false when detail is unavailable. This is not physical stock confirmation.',
  parameters: stockParameters,
  async execute({ item_id }) {
    const stock = await getItemWithStock(item_id);
    if (!stock) return { source: 'Zoho Books items', found: false, item_id };
    return {
      source: 'Zoho Books items',
      found: true,
      stock_basis: 'SYSTEM_STOCK_NOT_PHYSICAL_CONFIRMATION',
      ...stock,
    };
  },
});
