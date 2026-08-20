import { tool } from '@openai/agents';
import { z } from 'zod';
import { cached } from '@/lib/jarvis/cache';
import type { JarvisRunContext } from '@/lib/jarvis/context';
import { savePendingSalesOrder } from '@/lib/jarvis/approvals/store';
import { getCustomerById } from '@/lib/zoho/customers';
import { getCustomerItemPrice } from '@/lib/zoho/customerPricing';
import { getItemDetail } from '@/lib/zoho/items';

const parameters = z.object({
  customer_id: z.string().min(1).max(100),
  items: z.array(z.object({
    item_id: z.string().min(1).max(100),
    quantity: z.number().positive().max(100000),
  })).min(1).max(20),
  notes: z.string().max(1000).default(''),
});

export const prepareSalesOrderTool = tool<typeof parameters, JarvisRunContext>({
  name: 'prepare_sales_order',
  description: 'Prepare and persist a read-only Sales Order preview after exact customer and item IDs are resolved. It validates live official prices and never creates a Zoho record. Use only when the user asks to prepare or create an SO.',
  parameters,
  async execute({ customer_id, items, notes }, context) {
    if (!context?.context) throw new Error('JARVIS run context is unavailable.');
    const customer = await cached(context, `customer:${customer_id}`, () => getCustomerById(customer_id));
    if (!customer || customer.status !== 'active') return { kind: 'jarvis_so_preview_error', error: 'Customer is unavailable or inactive.' };

    const resolved = await Promise.all(items.map(async requested => {
      const [item, price] = await Promise.all([
        cached(context, `item:${requested.item_id}`, () => getItemDetail(requested.item_id)),
        cached(context, `price:${customer_id}:${requested.item_id}`, () => getCustomerItemPrice(customer_id, requested.item_id)),
      ]);
      if (!item || item.status !== 'active' || !price) return null;
      return {
        item_id: item.item_id,
        item_name: item.name,
        item_code: item.sku || '',
        quantity: requested.quantity,
        unit: item.unit || '',
        official_price: price.official_rate,
        customer_provided_price: null,
        price_mismatch: false,
        line_total: price.official_rate * requested.quantity,
        warnings: [] as string[],
      };
    }));
    if (resolved.some(item => !item)) return { kind: 'jarvis_so_preview_error', error: 'One or more items are unavailable, inactive, or missing an official price.' };
    const previewItems = resolved.filter((item): item is NonNullable<typeof item> => Boolean(item));
    const preview = {
      customer_id: customer.contact_id,
      customer_name: customer.contact_name,
      customer_confidence: 1,
      items: previewItems,
      subtotal: previewItems.reduce((sum, item) => sum + item.line_total, 0),
      currency: customer.currency_code || 'IDR',
      delivery: { location: '', address: '', notes: '' },
      missing_fields: [],
      warnings: ['This preview does not reserve physical stock.'],
      notes,
      requires_approval: 'APPROVE CREATE SO' as const,
    };
    const approvalId = await savePendingSalesOrder({
      conversationId: context.context.conversationId,
      role: context.context.role,
      preview,
      payload: {
        customer_id: customer.contact_id,
        items: previewItems.map(item => ({ item_id: item.item_id, quantity: item.quantity, rate: item.official_price, unit: item.unit, description: item.item_name })),
        notes,
      },
    });
    return { kind: 'jarvis_so_preview', approval_id: approvalId, preview };
  },
});
