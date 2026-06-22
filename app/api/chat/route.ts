// ─── Chat API Route ───────────────────────────────────────────────────────────
// POST /api/chat

import { NextRequest, NextResponse } from 'next/server';
import { aiCompletion } from '@/lib/ai/provider';
import { extractOrder } from '@/lib/ai/orderExtraction';
import { SYSTEM_PROMPT_MAIN } from '@/lib/ai/prompts';
import {
  searchCustomers,
  scoreCustomerMatch,
} from '@/lib/zoho/customers';
import { searchItems, getItemWithStock } from '@/lib/zoho/items';
import {
  searchSalesOrders,
  getSalesOrderById,
  getSalesOrderByNumber,
  createDraftSalesOrder,
  updateSalesOrder,
} from '@/lib/zoho/salesOrders';
import {
  getOpenPurchaseOrders,
  getOpenPOQuantityForItem,
} from '@/lib/zoho/purchaseOrders';
import { isApprovalCommand, looksLikeApprovalAttempt, validateSOPreviewForCreation } from '@/lib/utils/validation';
import { formatRupiah } from '@/lib/utils/money';
import { ChatRequest, ChatResponse, MessageType } from '@/types/chat';
import { ExtractedOrder, SOPreview, SOPreviewItem, SOStockPOCheck, SOItemCheckResult } from '@/types/order';
import { ZohoItemWithStock } from '@/types/zoho';

export const maxDuration = 60; // seconds

export async function POST(req: NextRequest): Promise<NextResponse<ChatResponse>> {
  try {
    const body: ChatRequest = await req.json();
    const { message, conversationId, attachments, history = [], pendingAction } = body;

    if (!message && !attachments?.length) {
      return NextResponse.json(
        { message: 'Message or attachment is required', type: 'error', error: 'EMPTY_REQUEST' },
        { status: 400 }
      );
    }

    const trimmedMessage = (message || '').trim();

    // ─── Check for Approval Commands ─────────────────────────────────────────

    const approvalCheck = isApprovalCommand(trimmedMessage);

    if (approvalCheck.isApproval && pendingAction) {
      if (approvalCheck.type === 'create_so' && pendingAction.type === 'create_so') {
        return await handleCreateSO(pendingAction.data as SOPreview);
      }

      if (approvalCheck.type === 'update_so' && pendingAction.type === 'update_so') {
        return await handleUpdateSO(pendingAction.data as { soId: string; preview: SOPreview });
      }
    }

    // Check if it looks like an approval attempt but isn't exact
    if (looksLikeApprovalAttempt(trimmedMessage) && !approvalCheck.isApproval && pendingAction) {
      return NextResponse.json({
        message: buildApprovalBlockMessage(pendingAction.type),
        type: 'warning',
        metadata: { warnings: ['Exact approval command required'] },
      });
    }

    // ─── Extract Attachment Text ──────────────────────────────────────────────

    let attachmentText = '';
    if (attachments?.length) {
      attachmentText = attachments
        .map((a) => a.extractedText || a.content || '')
        .filter(Boolean)
        .join('\n\n');
    }

    // ─── Slash commands — intercept before order extraction ─────────────────
    const cmd = trimmedMessage.trim().toLowerCase();
    if (cmd === '/update') {
      try {
        const baseUrl = req.nextUrl.origin;
        const updateRes = await fetch(baseUrl + '/api/update');
        const updateData = await updateRes.json();
        if (updateData.success && updateData.briefing) {
          return NextResponse.json({
            message: updateData.briefing,
            type: 'update',
            metadata: {
              intent: 'general_question',
              warnings: [],
              actions: updateData.actions || [],
            },
          });
        }
        return NextResponse.json({
          message: 'Update API error: ' + (updateData.error || 'no briefing returned'),
          type: 'text',
          metadata: { intent: 'general_question', warnings: [] },
        });
      } catch (updateErr) {
        return NextResponse.json({
          message: 'Update API failed: ' + String(updateErr),
          type: 'text',
          metadata: { intent: 'general_question', warnings: [] },
        });
      }
    }

    // ─── Extract Order Intent ─────────────────────────────────────────────────

    const extraction = await extractOrder(trimmedMessage, attachmentText || undefined);

    // ─── Route by Intent ──────────────────────────────────────────────────────

    switch (extraction.intent) {
      case 'create_so':
        return await handleSOPreviewIntent(extraction, trimmedMessage);

      case 'update_so':
        return await handleUpdateSOIntent(extraction, trimmedMessage);

      case 'price_check':
        return await handlePriceCheckIntent(extraction);

      case 'stock_check':
        return await handleStockCheckIntent(extraction);

      case 'check_so_vs_stock_po':
        return await handleSOStockPOCheckIntent(extraction, trimmedMessage);

      case 'search_customer':
        return await handleCustomerSearchIntent(extraction, trimmedMessage);

      case 'search_item':
        return await handleItemSearchIntent(extraction, trimmedMessage);

      case 'general_question':
      default:
        return await handleGeneralQuestion(trimmedMessage, history, extraction);
    }
  } catch (error) {
    console.error('Chat API error:', error);
    return NextResponse.json(
      {
        message: `Internal error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        type: 'error',
        error: 'INTERNAL_ERROR',
      },
      { status: 500 }
    );
  }
}

// ─── Intent Handlers ──────────────────────────────────────────────────────────

async function handleSOPreviewIntent(
  extraction: ExtractedOrder,
  userMessage: string
): Promise<NextResponse<ChatResponse>> {
  // Build SO Preview
  const previewItems: SOPreviewItem[] = extraction.items.map((item) => ({
    item_id: item.matched_item_id,
    item_name: item.matched_item_name || item.item_code,
    item_code: item.normalized_code || item.item_code,
    quantity: item.quantity,
    unit: item.unit || 'sht',
    official_price: item.official_price || 0,
    customer_provided_price: item.customer_provided_price,
    price_mismatch:
      item.customer_provided_price !== null &&
      item.official_price !== null &&
      Math.abs(item.customer_provided_price - (item.official_price || 0)) > 0.01,
    line_total: (item.quantity || 0) * (item.official_price || 0),
    warnings: item.warnings,
  }));

  const subtotal = previewItems.reduce((sum, i) => sum + i.line_total, 0);

  const preview: SOPreview = {
    customer_id: extraction.customer.matched_customer_id,
    customer_name:
      extraction.customer.matched_customer_name || extraction.customer.raw_name,
    customer_confidence: extraction.customer.confidence,
    items: previewItems,
    subtotal,
    currency: 'IDR',
    delivery: extraction.delivery,
    missing_fields: extraction.missing_fields,
    warnings: extraction.warnings,
    notes: extraction.delivery.notes || '',
    requires_approval: 'APPROVE CREATE SO',
  };

  const { valid, blockers } = validateSOPreviewForCreation(preview);
  if (!valid) {
    preview.warnings.push(...blockers);
  }

  const messageText = buildSOPreviewMessage(preview, extraction);

  return NextResponse.json({
    message: messageText,
    type: 'so_preview',
    metadata: {
      intent: 'create_so',
      extractedOrder: extraction,
      previewData: preview,
      warnings: preview.warnings,
    },
  });
}

async function handleUpdateSOIntent(
  extraction: ExtractedOrder,
  userMessage: string
): Promise<NextResponse<ChatResponse>> {
  // Try to find the referenced SO
  let existingSO = null;

  if (extraction.raw_so_number) {
    existingSO = await getSalesOrderByNumber(extraction.raw_so_number);
  }

  if (!existingSO) {
    // Search by customer
    if (extraction.customer.matched_customer_id) {
      const orders = await searchSalesOrders(
        undefined,
        extraction.customer.matched_customer_id,
        undefined,
        5
      );
      existingSO = orders[0] || null;
    }
  }

  if (!existingSO) {
    return NextResponse.json({
      message: `Could not find the Sales Order to update. Please provide the SO number (e.g., SO-00001).\n\nIf you have the SO number, please specify it like:\n"Update SO-00001 with [changes]"`,
      type: 'warning',
      metadata: { intent: 'update_so', warnings: ['SO not found'] },
    });
  }

  // Build proposed changes message
  const previewItems: SOPreviewItem[] = extraction.items.map((item) => ({
    item_id: item.matched_item_id,
    item_name: item.matched_item_name || item.item_code,
    item_code: item.normalized_code || item.item_code,
    quantity: item.quantity,
    unit: item.unit || 'sht',
    official_price: item.official_price || 0,
    customer_provided_price: item.customer_provided_price,
    price_mismatch:
      item.customer_provided_price !== null &&
      item.official_price !== null &&
      Math.abs(item.customer_provided_price - (item.official_price || 0)) > 0.01,
    line_total: (item.quantity || 0) * (item.official_price || 0),
    warnings: item.warnings,
  }));

  const updatePreview: SOPreview = {
    customer_id: existingSO.customer_id,
    customer_name: existingSO.customer_name,
    customer_confidence: 1,
    items: previewItems,
    subtotal: previewItems.reduce((s, i) => s + i.line_total, 0),
    currency: 'IDR',
    delivery: extraction.delivery,
    missing_fields: extraction.missing_fields,
    warnings: extraction.warnings,
    notes: extraction.delivery.notes || '',
    requires_approval: 'APPROVE UPDATE SO',
  };

  const messageText = buildSOUpdatePreviewMessage(existingSO, updatePreview);

  return NextResponse.json({
    message: messageText,
    type: 'so_update_preview',
    metadata: {
      intent: 'update_so',
      extractedOrder: extraction,
      previewData: updatePreview,
      zohoData: existingSO,
      warnings: updatePreview.warnings,
    },
  });
}

async function handlePriceCheckIntent(
  extraction: ExtractedOrder
): Promise<NextResponse<ChatResponse>> {
  const { fuzzyFindByCode } = await import('@/lib/data/lamitak-products');

  const lines: string[] = ['## Price Check Results\n'];

  if (extraction.items.length === 0) {
    lines.push('No item codes found. Please provide an item code, e.g. `ATP 1358M` or `WY 5217`.');
    return NextResponse.json({ message: lines.join('\n'), type: 'text' });
  }

  for (const item of extraction.items) {
    // Use the most complete code available — prefer item_code over normalized_code for lookup
    const rawCode = (item.item_code || item.normalized_code || item.raw_text || '').trim();
    const displayCode = rawCode.toUpperCase();
    lines.push(`### ${displayCode}`);

    // Fuzzy lookup — handles partial codes like "ATP 1358" → "ATP 1358M"
    const matches = fuzzyFindByCode(rawCode);

    if (matches.length === 0) {
      lines.push(`❌ **Not found** in Lamitak product catalog.`);
      lines.push(`Please check the item code or design name, or contact Admin Varindo.`);
    } else if (matches.length === 1) {
      const p = matches[0];
      lines.push(`**Item:** ${p.itemName}`);
      lines.push(`**Code:** ${p.code}`);
      lines.push(`**Design Name:** ${p.designName}`);
      lines.push(`**Size:** ${p.size}`);
      lines.push(`**Price:** Rp ${p.rateInclTax.toLocaleString('id-ID')} incl. Tax`);
    } else {
      lines.push(`Found **${matches.length} variants:**\n`);
      lines.push(`| Code | Design Name | Size | Price incl. Tax |`);
      lines.push(`|---|---|---|---|`);
      for (const p of matches) {
        lines.push(`| ${p.code} | ${p.designName} | ${p.size} | Rp ${p.rateInclTax.toLocaleString('id-ID')} |`);
      }
    }

    if (item.customer_provided_price !== null) {
      lines.push(`\n> ⚠️ **Customer-provided price:** Rp ${item.customer_provided_price.toLocaleString()} — not used. Official catalog price shown above.`);
    }

    lines.push('');
  }


  return NextResponse.json({
    message: lines.join('\n'),
    type: 'text',
    metadata: {
      intent: 'price_check',
      extractedOrder: extraction,
      warnings: extraction.warnings,
    },
  });
}

async function handleStockCheckIntent(
  extraction: ExtractedOrder
): Promise<NextResponse<ChatResponse>> {
  const { searchItemsWithStock, formatStockSummary } = await import('@/lib/zoho/items');

  const lines: string[] = ['## Stock Check\n'];

  if (extraction.items.length === 0) {
    lines.push('No item codes found. Please provide an item code, e.g. `DXO 5338D` or `WY 5217`.');
    return NextResponse.json({ message: lines.join('\n'), type: 'text' });
  }

  for (const item of extraction.items) {
    const rawCode = (item.item_code || item.normalized_code || item.raw_text || '').trim();
    lines.push(`### ${rawCode.toUpperCase()}`);

    try {
      console.log('[Stock Check] Searching Zoho for:', rawCode);
      const stockResults = await searchItemsWithStock(rawCode);
      console.log('[Stock Check] Results:', stockResults.length);

      if (stockResults.length === 0) {
        lines.push(`❌ Item not found in Zoho Books.`);
        lines.push(`Searched for: \`${rawCode}\``);
        lines.push(`Please check the item code or try a shorter code e.g. \`DXO 5338\`.`);
      } else if (stockResults.length === 1) {
        lines.push(formatStockSummary(stockResults[0]));
      } else {
        lines.push(`Found ${stockResults.length} matching items:\n`);
        for (const s of stockResults) {
          lines.push(formatStockSummary(s));
          lines.push('');
        }
      }
    } catch (err) {
      console.error('[Stock Check] Error:', err);
      lines.push(`❌ Error fetching stock: ${String(err)}`);
    }

    lines.push('');
  }

  lines.push('> Stock data is from Zoho Books. Admin Varindo confirms actual availability before order confirmation.');

  return NextResponse.json({
    message: lines.join('\n'),
    type: 'text',
    metadata: { intent: 'stock_check', extractedOrder: extraction },
  });
}

async function handleSOStockPOCheckIntent(
  extraction: ExtractedOrder,
  userMessage: string
): Promise<NextResponse<ChatResponse>> {
  // Find the SO
  let so = null;

  if (extraction.raw_so_number) {
    so = await getSalesOrderByNumber(extraction.raw_so_number);
  }

  // Try extracting SO number from message
  if (!so) {
    const soMatch = userMessage.match(/SO[-\s]?(\d+)/i);
    if (soMatch) {
      const soNum = `SO-${soMatch[1].padStart(5, '0')}`;
      so = await getSalesOrderByNumber(soNum);
    }
  }

  if (!so) {
    return NextResponse.json({
      message: `Please provide a Sales Order number to check.\n\nExample: "Check SO-00001 against stock and PO"`,
      type: 'warning',
      metadata: { warnings: ['SO number required'] },
    });
  }

  // Get open POs
  const openPOs = await getOpenPurchaseOrders();

  // Check each SO item
  const itemResults: SOItemCheckResult[] = [];

  for (const lineItem of so.line_items) {
    const zohoItem = lineItem.item_id
      ? (await getItemWithStock(String(lineItem.item_id)))
      : null;

    const availableStock = zohoItem?.available_stock ?? null;
    const soQty = lineItem.quantity;
    const stockStatus =
      availableStock === null
        ? 'unknown'
        : availableStock === 0
        ? 'zero'
        : availableStock < soQty
        ? 'low'
        : 'sufficient';

    const quantityShort = availableStock !== null ? Math.max(0, soQty - availableStock) : soQty;

    const poResult = getOpenPOQuantityForItem(
      openPOs,
      lineItem.item_id || '',
      lineItem.name
    );

    const hasPO = poResult.quantity > 0;
    const poStatus = hasPO ? 'has_open_po' : availableStock === null ? 'unknown' : 'no_po';
    const hasPurchased = hasPO;

    let recommendation: SOItemCheckResult['recommendation'] = 'unknown';
    let recommendationText = '';

    if (stockStatus === 'sufficient') {
      recommendation = 'ok';
      recommendationText = 'Stock sufficient. No action needed.';
    } else if (stockStatus === 'low' || stockStatus === 'zero') {
      if (hasPO && poResult.quantity >= quantityShort) {
        recommendation = 'check_po';
        recommendationText = `Stock short by ${quantityShort} sht. Open PO covers shortfall (${poResult.quantity} sht on PO ${poResult.poNumbers.join(', ')}).`;
      } else if (hasPO) {
        recommendation = 'order_needed';
        recommendationText = `Stock short by ${quantityShort} sht. Open PO partially covers (${poResult.quantity} sht). Additional ${quantityShort - poResult.quantity} sht need to be ordered.`;
      } else {
        recommendation = 'order_needed';
        recommendationText = `Stock short by ${quantityShort} sht. No open PO found. Please create a Purchase Order.`;
      }
    } else {
      recommendation = 'confirm_stock';
      recommendationText = 'Stock data unavailable. Admin to confirm.';
    }

    const warnings: string[] = [];
    if (stockStatus === 'unknown') warnings.push('Stock data not available from Zoho');
    if (stockStatus === 'zero') warnings.push('Zero stock on hand');
    if (!hasPO && quantityShort > 0) warnings.push('No open Purchase Order found');

    itemResults.push({
      item_id: lineItem.item_id || '',
      item_code: lineItem.name,
      item_name: lineItem.name,
      so_quantity: soQty,
      unit: lineItem.unit || 'sht',
      available_stock: availableStock,
      stock_status: stockStatus,
      quantity_short: quantityShort,
      open_po_quantity: poResult.quantity,
      po_number: poResult.poNumbers[0] || null,
      po_status: poStatus,
      has_been_purchased: hasPurchased,
      recommendation,
      recommendation_text: recommendationText,
      warnings,
    });
  }

  const check: SOStockPOCheck = {
    so_number: so.salesorder_number,
    so_id: so.salesorder_id,
    customer_name: so.customer_name,
    so_status: so.status,
    items: itemResults,
    overall_warnings: [],
    summary: buildSOCheckSummary(itemResults),
  };

  const message = buildSOCheckMessage(check);

  return NextResponse.json({
    message,
    type: 'so_stock_po_check',
    metadata: {
      intent: 'check_so_vs_stock_po',
      zohoData: so,
      previewData: check,
    },
  });
}

async function handleCustomerSearchIntent(
  extraction: ExtractedOrder,
  userMessage: string
): Promise<NextResponse<ChatResponse>> {
  const query = extraction.customer.raw_name || userMessage;
  const customers = await searchCustomers(query);

  if (customers.length === 0) {
    return NextResponse.json({
      message: `No customers found matching "${query}" in Zoho Books. Please check the spelling or add the customer first.`,
      type: 'text',
      metadata: { intent: 'search_customer' },
    });
  }

  const lines = [`## Customer Search Results for "${query}"\n`];
  customers.forEach((c, idx) => {
    const score = scoreCustomerMatch(c.contact_name, query);
    lines.push(`**${idx + 1}. ${c.contact_name}**`);
    lines.push(`   ID: \`${c.contact_id}\` | Status: ${c.status} | Match: ${Math.round(score * 100)}%`);
    if (c.billing_address?.city) {
      lines.push(`   City: ${c.billing_address.city}`);
    }
    lines.push('');
  });

  return NextResponse.json({
    message: lines.join('\n'),
    type: 'search_results',
    metadata: {
      intent: 'search_customer',
      zohoData: customers,
    },
  });
}

async function handleItemSearchIntent(
  extraction: ExtractedOrder,
  userMessage: string
): Promise<NextResponse<ChatResponse>> {
  const query =
    extraction.items[0]?.item_code ||
    extraction.items[0]?.raw_text ||
    userMessage;

  const items = await searchItems(query);

  if (items.length === 0) {
    return NextResponse.json({
      message: `No items found matching "${query}" in Zoho Books. Please check the item code.`,
      type: 'text',
      metadata: { intent: 'search_item' },
    });
  }

  const lines = [`## Item Search Results for "${query}"\n`];
  items.forEach((item, idx) => {
    lines.push(`**${idx + 1}. ${item.name}**`);
    lines.push(`   SKU: \`${item.sku || 'N/A'}\` | Price: ${formatRupiah(item.rate)} / ${item.unit || 'sht'} (excl. PPN)`);
    if (item.stock_on_hand !== undefined) {
      lines.push(`   Stock: ${item.stock_on_hand} ${item.unit || 'sht'}`);
    }
    lines.push('');
  });

  return NextResponse.json({
    message: lines.join('\n'),
    type: 'search_results',
    metadata: {
      intent: 'search_item',
      zohoData: items,
    },
  });
}

async function handleGeneralQuestion(
  message: string,
  history: Array<{ role: string; content: string }>,
  extraction?: ExtractedOrder
): Promise<NextResponse<ChatResponse>> {
  const conversationMessages = [
    ...history.slice(-10).map((h) => ({
      role: h.role as 'user' | 'assistant',
      content: h.content,
    })),
    { role: 'user' as const, content: message },
  ];

  const result = await aiCompletion(conversationMessages, {
    system: SYSTEM_PROMPT_MAIN,
    temperature: 0.3,
    maxTokens: 1500,
  });

  return NextResponse.json({
    message: result.content,
    type: 'text',
    metadata: {
      intent: extraction?.intent ?? 'general_question',
      warnings: extraction?.warnings ?? [],
    },
  });
}

// ─── SO Create / Update Handlers ──────────────────────────────────────────────

async function handleCreateSO(
  preview: SOPreview
): Promise<NextResponse<ChatResponse>> {
  try {
    const today = new Date().toISOString().split('T')[0];

    const createdSO = await createDraftSalesOrder({
      customer_id: preview.customer_id,
      date: today,
      line_items: preview.items.map((item) => ({
        item_id: item.item_id,
        quantity: item.quantity,
        rate: item.official_price,
        unit: item.unit,
        description: item.item_name,
      })),
      notes: preview.notes || '',
    });

    const lines = [
      '## ✅ Draft Sales Order Created',
      '',
      `**SO Number:** \`${createdSO.salesorder_number}\``,
      `**SO ID:** \`${createdSO.salesorder_id}\``,
      `**Customer:** ${createdSO.customer_name}`,
      `**Status:** ${createdSO.status}`,
      `**Total:** ${formatRupiah(createdSO.total)}`,
      '',
      '> The Sales Order has been created as a Draft in Zoho Books. Admin Varindo will confirm stock and proceed with fulfillment.',
    ];

    return NextResponse.json({
      message: lines.join('\n'),
      type: 'action_result',
      metadata: {
        intent: 'create_so',
        actionResult: { success: true, so: createdSO },
      },
    });
  } catch (error) {
    return NextResponse.json({
      message: `❌ Failed to create Sales Order: ${error instanceof Error ? error.message : 'Unknown error'}. Please check Zoho connection and try again.`,
      type: 'error',
      error: 'CREATE_SO_FAILED',
    });
  }
}

async function handleUpdateSO(data: {
  soId: string;
  preview: SOPreview;
}): Promise<NextResponse<ChatResponse>> {
  try {
    const updatedSO = await updateSalesOrder(data.soId, {
      line_items: data.preview.items.map((item) => ({
        item_id: item.item_id,
        quantity: item.quantity,
        rate: item.official_price,
        unit: item.unit,
        description: item.item_name,
      })),
      notes: data.preview.notes || undefined,
    });

    const lines = [
      '## ✅ Sales Order Updated',
      '',
      `**SO Number:** \`${updatedSO.salesorder_number}\``,
      `**Customer:** ${updatedSO.customer_name}`,
      `**Status:** ${updatedSO.status}`,
      `**New Total:** ${formatRupiah(updatedSO.total)}`,
      '',
      '> Changes have been saved to Zoho Books.',
    ];

    return NextResponse.json({
      message: lines.join('\n'),
      type: 'action_result',
      metadata: {
        intent: 'update_so',
        actionResult: { success: true, so: updatedSO },
      },
    });
  } catch (error) {
    return NextResponse.json({
      message: `❌ Failed to update Sales Order: ${error instanceof Error ? error.message : 'Unknown error'}.`,
      type: 'error',
      error: 'UPDATE_SO_FAILED',
    });
  }
}

// ─── Message Builders ─────────────────────────────────────────────────────────

function buildSOPreviewMessage(preview: SOPreview, extraction: ExtractedOrder): string {
  const confidence = Math.round(preview.customer_confidence * 100);
  const customerOk = preview.customer_confidence >= 0.7;
  const lines: string[] = [];

  const tierLabel = extraction?.customer?.tier ? ` — ${extraction.customer.tier} tier` : '';
  const pricebookLabel = extraction?.customer?.pricebook_id ? ' (pricebook applied)' : '';
  lines.push(`Sales Order preview ready for **${preview.customer_name || 'Unknown Customer'}**${tierLabel}${pricebookLabel}${!customerOk ? ` ⚠️ (${confidence}% confidence — please verify)` : ''}.`);
  lines.push('');

  if (preview.missing_fields.length > 0) {
    lines.push(`⚠️ **Missing:** ${preview.missing_fields.join(', ')}`);
    lines.push('');
  }

  lines.push('To create this Sales Order in Zoho Books, type exactly:');
  lines.push('```');
  lines.push('APPROVE CREATE SO');
  lines.push('```');
  lines.push('⛔ Shorter commands like "approve", "yes", or "ok" will not work.');

  return lines.join('\n');
}

function buildSOUpdatePreviewMessage(existingSO: import('@/types/zoho').ZohoSalesOrder, preview: SOPreview): string {
  const lines: string[] = ['## Sales Order Update Preview\n'];

  lines.push(`**Existing SO:** \`${existingSO.salesorder_number}\``);
  lines.push(`**Customer:** ${existingSO.customer_name}`);
  lines.push(`**Current Status:** ${existingSO.status}`);
  lines.push(`**Current Total:** ${formatRupiah(existingSO.total)}`);
  lines.push('');

  lines.push('### Current Items');
  lines.push('| Item | Qty | Rate | Amount |');
  lines.push('|------|-----|------|--------|');
  existingSO.line_items.forEach((li) => {
    lines.push(`| ${li.name} | ${li.quantity} | ${formatRupiah(li.rate)} | ${formatRupiah(li.amount)} |`);
  });
  lines.push('');

  lines.push('### Proposed Changes');
  lines.push('| Item | Qty | Rate | Amount |');
  lines.push('|------|-----|------|--------|');
  preview.items.forEach((item) => {
    lines.push(`| ${item.item_name} | ${item.quantity} | ${formatRupiah(item.official_price)} | ${formatRupiah(item.line_total)} |`);
  });
  lines.push('');
  lines.push(`**New Subtotal:** ${formatRupiah(preview.subtotal)}`);
  lines.push('');

  if (preview.warnings.length > 0) {
    lines.push('### ⚠️ Warnings');
    preview.warnings.forEach((w) => lines.push(`- ${w}`));
    lines.push('');
  }

  lines.push('---');
  lines.push('### Approval Required');
  lines.push('To update this Sales Order in Zoho Books, type the exact command:');
  lines.push('');
  lines.push('```');
  lines.push('APPROVE UPDATE SO');
  lines.push('```');

  return lines.join('\n');
}

function buildSOCheckMessage(check: SOStockPOCheck): string {
  const lines: string[] = [
    `## SO vs Stock & PO Check: \`${check.so_number}\`\n`,
    `**Customer:** ${check.customer_name}`,
    `**SO Status:** ${check.so_status}`,
    '',
  ];

  lines.push('### Item Analysis');

  check.items.forEach((item) => {
    const stockIcon =
      item.stock_status === 'sufficient'
        ? '✅'
        : item.stock_status === 'low'
        ? '⚠️'
        : item.stock_status === 'zero'
        ? '❌'
        : '❓';

    lines.push(`**${stockIcon} ${item.item_name}**`);
    lines.push(`- SO Qty: **${item.so_quantity} ${item.unit}**`);
    lines.push(
      `- Available Stock: **${item.available_stock ?? 'Unknown'}** ${item.available_stock !== null ? item.unit : ''}`
    );
    if (item.quantity_short > 0) {
      lines.push(`- Short: **${item.quantity_short} ${item.unit}** ⚠️`);
    }
    lines.push(
      `- Open PO: **${item.open_po_quantity > 0 ? `${item.open_po_quantity} ${item.unit} (${item.po_number || 'various'})` : 'None'}**`
    );
    lines.push(`- Purchased: ${item.has_been_purchased ? '✅ Yes' : '❌ No'}`);
    lines.push(`- **Action:** ${item.recommendation_text}`);
    lines.push('');
  });

  lines.push('---');
  lines.push(`**Summary:** ${check.summary}`);

  return lines.join('\n');
}

function buildSOCheckSummary(items: SOItemCheckResult[]): string {
  const needOrder = items.filter((i) => i.recommendation === 'order_needed').length;
  const ok = items.filter((i) => i.recommendation === 'ok').length;
  const checkPO = items.filter((i) => i.recommendation === 'check_po').length;
  const unknown = items.filter((i) => i.recommendation === 'unknown' || i.recommendation === 'confirm_stock').length;

  const parts: string[] = [];
  if (ok > 0) parts.push(`${ok} item(s) OK`);
  if (checkPO > 0) parts.push(`${checkPO} item(s) covered by open PO`);
  if (needOrder > 0) parts.push(`${needOrder} item(s) need purchasing`);
  if (unknown > 0) parts.push(`${unknown} item(s) need Admin confirmation`);

  return parts.join(' | ') || 'No items analyzed';
}

function buildApprovalBlockMessage(pendingType: string): string {
  const command =
    pendingType === 'create_so' ? 'APPROVE CREATE SO' : 'APPROVE UPDATE SO';
  return `⛔ **Action blocked.** The exact approval command is required.\n\nTo proceed, type exactly:\n\`\`\`\n${command}\n\`\`\`\n\nDo not use "approve", "yes", "ok", or any other variation.`;
}
