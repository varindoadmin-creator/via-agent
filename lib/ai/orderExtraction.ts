// ─── Order Extraction ─────────────────────────────────────────────────────────
// Extracts structured order data from user messages using AI.

import { ExtractedOrder, OrderIntent } from '@/types/order';
import { aiCompletion } from './provider';
import { SYSTEM_PROMPT_ORDER_EXTRACTION } from './prompts';
import { normalizeItemCode } from '@/lib/utils/normalizeItemCode';
import { searchCustomers, scoreCustomerMatch } from '@/lib/zoho/customers';
import { searchItems, scoreItemMatch } from '@/lib/zoho/items';
import { getItemPricebookRate, getPricebookIdByTier } from '@/lib/zoho/pricebooks';
import { getCustomerById } from '@/lib/zoho/customers';

/**
 * Extract structured order information from a user message.
 * Enriches with Zoho data (customer/item matching).
 */
export async function extractOrder(
  userMessage: string,
  attachmentText?: string
): Promise<ExtractedOrder> {
  const content = attachmentText
    ? `${userMessage}\n\nAttached content:\n${attachmentText}`
    : userMessage;

  // Step 1: Use AI to extract raw structure
  let rawExtraction: ExtractedOrder;

  try {
    const aiResult = await aiCompletion(
      [{ role: 'user', content }],
      {
        system: SYSTEM_PROMPT_ORDER_EXTRACTION,
        temperature: 0.1,
        maxTokens: 2000,
      }
    );

    // Parse JSON response — strip markdown code fences if present
    const jsonText = aiResult.content
      .trim()
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim();
    rawExtraction = JSON.parse(jsonText);
  } catch (err) {
    console.error('Order extraction AI error:', err);
    // Return empty extraction on failure
    return emptyExtraction(userMessage);
  }

  // Step 2: Enrich with Zoho data

  // Enrich customer — skip for price_check (no customer needed)
  if (rawExtraction.customer?.raw_name && rawExtraction.intent !== 'price_check') {
    rawExtraction = await enrichCustomer(rawExtraction);
  }

  // For price_check and stock_check: clear customer/Zoho warnings — not needed
  if (rawExtraction.intent === 'price_check' || rawExtraction.intent === 'stock_check') {
    rawExtraction.warnings = rawExtraction.warnings.filter(
      (w: string) => !w.toLowerCase().includes('customer') && !w.toLowerCase().includes('not found in zoho')
    );
    rawExtraction.missing_fields = rawExtraction.missing_fields.filter(
      (f: string) => f !== 'customer'
    );
  }

  // Normalize and enrich items
  if (rawExtraction.items?.length > 0) {
    rawExtraction = await enrichItems(rawExtraction);
  }

  // Post-enrichment cleanup:
  // If customer was successfully matched with good confidence, remove stale AI warnings
  if (rawExtraction.customer?.matched_customer_id && rawExtraction.customer?.confidence >= 0.7) {
    rawExtraction.warnings = rawExtraction.warnings.filter(w => {
      const wl = w.toLowerCase();
      const isCustomerWarning = wl.includes('customer') && (
        wl.includes('could not') || wl.includes('not found') ||
        wl.includes('verify') || wl.includes('match') || wl.includes('confirm')
      );
      return !isCustomerWarning;
    });
    rawExtraction.missing_fields = rawExtraction.missing_fields.filter(f => {
      const fl = f.toLowerCase();
      // Remove customer fields (already matched) and delivery fields (confirmed later by admin)
      return !fl.includes('customer') &&
             !fl.includes('delivery') &&
             !fl.includes('address') &&
             !fl.includes('location');
    });
  }

  return rawExtraction;
}

/**
 * Enrich customer match using Zoho search.
 */
async function enrichCustomer(order: ExtractedOrder): Promise<ExtractedOrder> {
  try {
    const rawName = order.customer.raw_name;
    if (!rawName) return order;

    // Try searching with meaningful words from the name
    const searchWords = rawName
      .split(/\s+/)
      .filter((w) => w.length > 3 && !['PT', 'CV', 'UD', 'PD', 'TB'].includes(w.toUpperCase()));

    const allMatches = new Map<string, { contact: import('@/types/zoho').ZohoContact; score: number }>();

    // Search with each meaningful word
    for (const word of searchWords.slice(0, 3)) {
      const results = await searchCustomers(word);
      for (const contact of results) {
        const score = scoreCustomerMatch(contact.contact_name, rawName);
        const existing = allMatches.get(contact.contact_id);
        if (!existing || existing.score < score) {
          allMatches.set(contact.contact_id, { contact, score });
        }
      }
    }

    // Also try the full raw name
    const fullResults = await searchCustomers(rawName);
    for (const contact of fullResults) {
      const score = scoreCustomerMatch(contact.contact_name, rawName);
      const existing = allMatches.get(contact.contact_id);
      if (!existing || existing.score < score) {
        allMatches.set(contact.contact_id, { contact, score });
      }
    }

    // Sort by score descending — filter out zero-score matches
    const sorted = Array.from(allMatches.values())
      .filter((m) => m.score > 0)
      .sort((a, b) => b.score - a.score);

    if (sorted.length > 0) {
      const best = sorted[0];
      order.customer.matched_customer_id = best.contact.contact_id;
      order.customer.matched_customer_name = best.contact.contact_name;
      order.customer.confidence = best.score;

      // Fetch customer detail to get pricebook_id and tier
      try {
        const detail = await getCustomerById(best.contact.contact_id);
        if (detail) {
          order.customer.pricebook_id = (detail as Record<string, unknown>).pricebook_id as string || '';
          order.customer.tier = (detail as Record<string, unknown>).cf_tier as string || '';
          // If no pricebook_id set directly, derive from tier
          if (!order.customer.pricebook_id && order.customer.tier) {
            order.customer.pricebook_id = getPricebookIdByTier(order.customer.tier);
          }
        }
      } catch { /* use base rate if pricebook fetch fails */ }

      // Add alternatives if multiple good matches
      if (sorted.length > 1) {
        order.customer.alternatives = sorted
          .slice(1, 4)
          .filter((m) => m.score > 0.3)
          .map((m) => ({
            id: m.contact.contact_id,
            name: m.contact.contact_name,
            confidence: m.score,
          }));
      }

      if (best.score < 0.5) {
        order.warnings.push(
          `Low confidence customer match (${Math.round(best.score * 100)}%). Please verify: "${best.contact.contact_name}".`
        );
      }
    } else {
      order.warnings.push(
        `Customer "${rawName}" not found in Zoho Books. Please verify or add the customer first.`
      );
      order.missing_fields.push('customer_id');
    }
  } catch (err) {
    console.error('Customer enrichment error:', err);
    order.warnings.push('Unable to search Zoho for customer. Please verify manually.');
  }

  return order;
}

/**
 * Enrich items with official Zoho data.
 * For price_check intent, skip Zoho lookup — catalog is used instead.
 */
async function enrichItems(order: ExtractedOrder): Promise<ExtractedOrder> {
  // Price checks use the local product catalog — no Zoho lookup needed
  // Stock checks use searchItemsWithStock directly in the handler — skip enrichment here
  if (order.intent === 'price_check' || order.intent === 'stock_check') {
    for (const item of order.items) {
      item.normalized_code = normalizeItemCode(item.item_code || item.raw_text || '');
    }
    return order;
  }

  for (let i = 0; i < order.items.length; i++) {
    const item = order.items[i];

    try {
      // Normalize the item code
      item.normalized_code = normalizeItemCode(item.item_code || item.raw_text || '');

      if (!item.normalized_code) continue;

      // Search Zoho for matching items
      const zohoItems = await searchItems(item.normalized_code);

      if (zohoItems.length === 0) {
        // Try searching by raw text
        const byRaw = await searchItems(item.raw_text || '');
        zohoItems.push(...byRaw);
      }

      if (zohoItems.length > 0) {
        // Score and pick best match
        const scored = zohoItems
          .map((zi) => ({
            item: zi,
            score: scoreItemMatch(zi, item.normalized_code),
          }))
          .sort((a, b) => b.score - a.score);

        const best = scored[0];
        item.matched_item_id = best.item.item_id;
        item.matched_item_name = best.item.name;
        item.confidence = best.score;

        // Apply pricebook rate if customer has a pricebook
        const custPricebookId = order.customer.pricebook_id || '';
        if (custPricebookId && best.item.item_id) {
          const pbRate = await getItemPricebookRate(custPricebookId, best.item.item_id, best.item.rate);
          item.official_price = pbRate;
        } else {
          item.official_price = best.item.rate;
        }
        item.official_price_currency = 'IDR';

        // Detect price mismatch
        if (
          item.customer_provided_price !== null &&
          item.official_price !== null &&
          Math.abs(item.customer_provided_price - item.official_price) > 0.01
        ) {
          item.warnings.push(
            `Price mismatch: customer provided Rp ${item.customer_provided_price.toLocaleString('id-ID')} vs official Rp ${item.official_price.toLocaleString('id-ID')}.`
          );
        }

        if (best.score < 0.7) {
          item.warnings.push(
            `Low confidence item match (${Math.round(best.score * 100)}%). Matched to: "${best.item.name}". Please verify.`
          );
        }
      } else {
        item.confidence = 0;
        item.warnings.push(
          `Item code "${item.item_code}" not found in Zoho Books. Please verify the item code.`
        );
        if (!order.missing_fields.includes('item_id')) {
          order.warnings.push(
            `Item "${item.item_code}" not found in Zoho Books.`
          );
        }
      }
    } catch (err) {
      console.error(`Item enrichment error for ${item.item_code}:`, err);
      item.warnings.push('Unable to search Zoho for this item. Please verify manually.');
    }
  }

  return order;
}

/**
 * Return an empty extraction for fallback.
 */
function emptyExtraction(rawMessage: string): ExtractedOrder {
  return {
    intent: 'general_question' as OrderIntent,
    customer: {
      raw_name: '',
      matched_customer_id: '',
      matched_customer_name: '',
      confidence: 0,
    },
    items: [],
    delivery: { location: '', address: '', notes: '' },
    missing_fields: [],
    warnings: ['Order extraction failed. Please rephrase or provide more detail.'],
    recommended_next_action: 'Please provide order details including customer name, item codes, and quantities.',
    raw_so_number: '',
  };
}
