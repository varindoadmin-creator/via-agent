import { tool } from '@openai/agents';
import { z } from 'zod';
import { cached } from '@/lib/jarvis/cache';
import type { JarvisRunContext } from '@/lib/jarvis/context';
import { calculateFulfillmentAssessment } from '@/lib/jarvis/intelligence/fulfillment';
import { getCustomerById } from '@/lib/zoho/customers';
import { getCustomerItemPrice } from '@/lib/zoho/customerPricing';
import { getItemDetail, getItemWithStock } from '@/lib/zoho/items';
import { getOpenPOQuantityForItem, searchPOCoverageForItem } from '@/lib/zoho/purchaseOrders';

const parameters = z.object({
  customer_id: z.string().min(1).max(100),
  item_id: z.string().min(1).max(100),
  quantity: z.number().positive().max(100000),
});

export const assessOrderFulfillmentTool = tool<typeof parameters, JarvisRunContext>({
  name: 'assess_order_fulfillment',
  description: 'Assess one proposed customer/item quantity after the exact customer and item IDs have been resolved. Deterministically combines current Zoho system stock, official customer price, and open Purchase Order coverage. Read-only; it does not reserve stock or create an order.',
  parameters,
  async execute({ customer_id, item_id, quantity }, context) {
    const [customer, item, stock] = await Promise.all([
      cached(context, `customer:${customer_id}`, () => getCustomerById(customer_id)),
      cached(context, `item:${item_id}`, () => getItemDetail(item_id)),
      cached(context, `stock:${item_id}`, () => getItemWithStock(item_id)),
    ]);
    if (!customer) return { source: 'Zoho Books', found: false, missing: 'customer', customer_id };
    if (!item || !stock) return { source: 'Zoho Books', found: false, missing: 'item_or_stock', item_id };

    const itemCode = String(item.sku || '');
    const [price, poResult] = await Promise.all([
      cached(context, `price:${customer_id}:${item_id}`, () => getCustomerItemPrice(customer_id, item_id)),
      cached(context, `po-item:${item_id}:${itemCode}`, () => searchPOCoverageForItem(item_id, itemCode)),
    ]);
    const poCoverage = getOpenPOQuantityForItem(poResult.orders, item_id, itemCode);
    const assessment = calculateFulfillmentAssessment({
      requestedQuantity: quantity,
      availableSystemStock: stock.total_available_stock,
      openPurchaseOrderQuantity: poCoverage.quantity,
      poCoverageComplete: !poResult.hasMoreOpenPurchaseOrders,
    });

    return {
      source: 'Zoho Books customer, item, inventory, pricebook, and purchase orders',
      found: true,
      read_only: true,
      stock_basis: 'SYSTEM_STOCK_NOT_PHYSICAL_CONFIRMATION',
      customer: { customer_id: customer.contact_id, customer_name: customer.contact_name },
      item: { item_id: item.item_id, sku: item.sku || null, name: item.name, unit: item.unit || null },
      official_price: price ? {
        found: true,
        rate: price.official_rate,
        currency: price.currency,
        price_source: price.price_source,
        pricebook_id: price.pricebook_id,
        customer_tier: price.customer_tier,
      } : { found: false },
      estimated_line_value: price ? Number(price.official_rate) * assessment.requested_quantity : null,
      ...assessment,
      stock_by_location: stock.by_location,
      po_numbers: poCoverage.poNumbers,
      open_purchase_orders_scanned: poResult.scannedOpenPurchaseOrders,
    };
  },
});
