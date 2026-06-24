import { NextRequest, NextResponse } from 'next/server';
import { zohoRequest } from '@/lib/zoho/client';

export const maxDuration = 60;

interface ZohoSalesOrderListResponse {
  salesorders?: Record<string, unknown>[];
}

interface ZohoSalesOrderResponse {
  salesorder?: Record<string, unknown>;
}

interface SOItem {
  name: string;
  sku: string;
  item_id: string;
  quantity: number;
  unit: string;
  rate: number;
  amount: number;
  location_name: string;
}

function n(value: unknown): number {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function s(value: unknown): string {
  return value == null ? '' : String(value);
}


type AIComparisonRow = {
  so_item?: string;
  so_sku?: string;
  so_qty?: number | null;
  proof_item?: string;
  proof_sku?: string;
  proof_qty?: number | null;
  status?: string;
  notes?: string;
  item?: string;
  sku?: string;
};

function normalizeMatchText(value: unknown): string {
  return s(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function compactMatchText(value: unknown): string {
  return normalizeMatchText(value).replace(/\s+/g, '');
}


const CUSTOMER_ALIAS_GROUPS = [
  ['CASA CIPTA ABADI', 'CASA CIPTA ABADI PT', 'PT CASA CIPTA ABADI', 'CASA INTERIOR'],
];

function normalizeCustomerForAlias(value: unknown): string {
  return normalizeMatchText(value)
    .replace(/\b(pt|cv|tbk|ud)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function aliasGroupForCustomer(value: unknown): string[] {
  const normalized = normalizeCustomerForAlias(value);
  if (!normalized) return [];
  for (const group of CUSTOMER_ALIAS_GROUPS) {
    const normalizedGroup = group.map(normalizeCustomerForAlias);
    if (normalizedGroup.some(alias => alias === normalized || normalized.includes(alias) || alias.includes(normalized))) {
      return group;
    }
  }
  return [s(value)];
}

function customerNamesEquivalent(soCustomer: unknown, proofCustomer: unknown, proofText?: unknown): { match: boolean; proofName: string; notes: string } {
  const soAliases = aliasGroupForCustomer(soCustomer);
  const proofAliases = aliasGroupForCustomer(proofCustomer);
  const soNormalized = soAliases.map(normalizeCustomerForAlias).filter(Boolean);
  const proofNormalized = proofAliases.map(normalizeCustomerForAlias).filter(Boolean);
  const textNormalized = normalizeCustomerForAlias(proofText);

  for (const soName of soNormalized) {
    if (proofNormalized.some(proofName => proofName === soName || proofName.includes(soName) || soName.includes(proofName))) {
      return { match: true, proofName: s(proofCustomer), notes: 'Customer matches by exact name or configured alias.' };
    }
    if (textNormalized && textNormalized.includes(soName)) {
      return { match: true, proofName: s(proofCustomer) || soName, notes: 'Customer name appears in uploaded proof.' };
    }
  }

  for (const group of CUSTOMER_ALIAS_GROUPS) {
    const normalizedGroup = group.map(normalizeCustomerForAlias);
    const soInGroup = normalizedGroup.some(alias => soNormalized.some(name => name === alias || name.includes(alias) || alias.includes(name)));
    const proofInGroup = normalizedGroup.some(alias => proofNormalized.includes(alias) || (textNormalized && textNormalized.includes(alias)));
    if (soInGroup && proofInGroup) {
      const matchedAlias = group.find(alias => textNormalized.includes(normalizeCustomerForAlias(alias))) || s(proofCustomer);
      return { match: true, proofName: matchedAlias, notes: 'Customer matches by configured alias.' };
    }
  }

  return { match: false, proofName: s(proofCustomer), notes: s(proofCustomer) ? 'Customer name does not match configured aliases.' : 'Customer name was not clearly extracted.' };
}

function candidateCodesForSOItem(soItem: SOItem): string[] {
  const values = [soItem.sku, soItem.name.split('-')[0], soItem.name].map(s).filter(Boolean);
  const codes = new Set<string>();

  for (const value of values) {
    const compact = compactMatchText(value);
    if (compact.length >= 4) codes.add(compact);

    // If SKU is like AICA-AK14004CS16, also use AK14004CS16.
    for (const part of value.split(/[\s_\-\/]+/)) {
      const partCompact = compactMatchText(part);
      if (partCompact.length >= 4) codes.add(partCompact);
    }

    // Extract item-code patterns written with or without spaces, e.g. AK 14004 CS16 -> AK14004CS16.
    const spacedCodeMatches = value.match(/[A-Z]{1,6}\s*[-_]?\s*\d{3,6}(?:\s*[-_]?\s*[A-Z]{1,4}\d{0,3})?/gi) || [];
    for (const match of spacedCodeMatches) {
      const code = compactMatchText(match);
      if (code.length >= 4) codes.add(code);
    }
  }

  // Avoid very generic long product names becoming the only candidate.
  return Array.from(codes).filter(code => code.length >= 4).sort((a, b) => a.length - b.length);
}

function extractQtyFromProofTextForSOItem(proofText: unknown, soItem: SOItem): number | null {
  const raw = s(proofText);
  if (!raw) return null;

  const compact = compactMatchText(raw);
  const codes = candidateCodesForSOItem(soItem);
  const matchedCode = codes.find(code => compact.includes(code));
  if (!matchedCode) return null;

  // Strong deterministic parser for Indonesian PO rows.
  // Example PDF row:
  // 1 HPL AICA AK 14004 CS16 MEDIUM PROVENCE OAK -Rp 388.056,00- 6 LEMBAR -Rp 2.328.336,00-
  // The SO SKU may be AK14004CS16 while the PDF writes AK 14004 CS16, so always compare compact text.
  const candidateLines = raw
    .split(/\r?\n|(?=\b\d+\s+HPL\b)/i)
    .map(line => line.trim())
    .filter(Boolean);

  for (const line of candidateLines) {
    const lineCompact = compactMatchText(line);
    const lineHasCode = codes.some(code => lineCompact.includes(code));
    if (!lineHasCode) continue;

    const qtyMatches = Array.from(line.matchAll(/(?:qty|jumlah)?\s*(\d+(?:[\.,]\d+)?)\s*(?:lembar|lbr|sheet|sht|sheets|pcs|pc|unit)\b/gi));
    if (qtyMatches.length) {
      const lastQty = qtyMatches[qtyMatches.length - 1]?.[1];
      const qty = n(s(lastQty).replace(',', '.'));
      if (qty > 0) return qty;
    }
  }

  // Fallback: search near the code in compact text, then inspect a wider normalized word window.
  const normalized = normalizeMatchText(raw);
  const words = normalized.split(' ');
  const soCodeTokens = normalizeMatchText(soItem.sku || soItem.name.split('-')[0]).split(' ').filter(Boolean);
  const nameTokens = normalizeMatchText(soItem.name).split(' ').filter(Boolean);
  const possibleFirstTokens = Array.from(new Set([...soCodeTokens, ...nameTokens].filter(token => token.length >= 2)));

  let idx = -1;
  for (const token of possibleFirstTokens) {
    idx = words.findIndex(w => w === token);
    if (idx >= 0) break;
  }
  if (idx < 0) idx = 0;

  const windowText = words.slice(Math.max(0, idx - 12), Math.min(words.length, idx + 90)).join(' ');

  const unitQty = windowText.match(/(?:qty|jumlah)?\s*(\d+(?:[\.,]\d+)?)\s*(?:lembar|lbr|sheet|sht|sheets|pcs|pc|unit)\b/i);
  if (unitQty) return n(unitQty[1].replace(',', '.'));

  const equalsQty = windowText.match(/[=x]\s*(\d+(?:[\.,]\d+)?)/i);
  if (equalsQty) return n(equalsQty[1].replace(',', '.'));

  // Last fallback for clean PO PDFs: if the proof contains this item code and there is
  // exactly one quantity with a sheet-like unit, use it. This handles rows extracted
  // from PDF as one long line where column spacing is lost.
  const allUnitQty = Array.from(raw.matchAll(/\b(\d+(?:[\.,]\d+)?)\s*(?:lembar|lbr|sheet|sht|sheets|pcs|pc|unit)\b/gi))
    .map(match => n(s(match[1]).replace(',', '.')))
    .filter(qty => qty > 0);
  const uniqueUnitQty = Array.from(new Set(allUnitQty));
  if (uniqueUnitQty.length === 1) return uniqueUnitQty[0];

  return null;
}

function qtySame(a: unknown, b: unknown): boolean {
  const x = n(a);
  const y = n(b);
  return x > 0 && y > 0 && Math.abs(x - y) < 0.0001;
}

function proofContainsSOItem(proof: AIComparisonRow | Record<string, unknown>, soItem: SOItem): boolean {
  const proofText = compactMatchText([
    proof.proof_item,
    proof.proof_sku,
    proof.notes,
    (proof as Record<string, unknown>).source_note,
    (proof as Record<string, unknown>).item,
    (proof as Record<string, unknown>).sku,
  ].filter(Boolean).join(' '));

  const soSku = compactMatchText(soItem.sku);
  const soName = compactMatchText(soItem.name);
  const soCodeFromName = compactMatchText(soItem.name.split('-')[0]);

  if (soSku && proofText.includes(soSku)) return true;
  if (soCodeFromName && proofText.includes(soCodeFromName)) return true;

  // Allow partial item-name match when the SKU/code is not perfectly captured by OCR.
  const soWords = normalizeMatchText(soItem.name).split(' ').filter(w => w.length >= 4);
  const proofWords = new Set(normalizeMatchText(proofText).split(' '));
  const matchedWords = soWords.filter(w => proofWords.has(w));
  return matchedWords.length >= 2 || (soName.length > 8 && proofText.includes(soName.slice(0, 8)));
}

function findProofQtyForSOItem(analysis: Record<string, unknown>, soItem: SOItem): number | null {
  const rows = Array.isArray(analysis.comparison) ? analysis.comparison as AIComparisonRow[] : [];
  for (const row of rows) {
    if (proofContainsSOItem(row, soItem) && n(row.proof_qty) > 0) return n(row.proof_qty);
  }

  const extracted = Array.isArray(analysis.extracted_items) ? analysis.extracted_items as Record<string, unknown>[] : [];
  for (const item of extracted) {
    if (proofContainsSOItem(item, soItem) && n(item.quantity) > 0) return n(item.quantity);
  }

  const textQty = extractQtyFromProofTextForSOItem(analysis.proof_text, soItem);
  if (textQty !== null && textQty > 0) return textQty;

  return null;
}

function postProcessApprovalAnalysis(analysisInput: unknown, so: ReturnType<typeof normalizeSO>, customerOverride?: string) {
  const analysis = (analysisInput && typeof analysisInput === 'object' ? analysisInput : {}) as Record<string, unknown>;
  const originalRows = Array.isArray(analysis.comparison) ? analysis.comparison as AIComparisonRow[] : [];

  const comparison = so.line_items.map((soItem, index) => {
    const original = originalRows[index] || originalRows.find(row => proofContainsSOItem(row, soItem)) || {};
    const proofQty = findProofQtyForSOItem(analysis, soItem);
    const itemMatched = proofContainsSOItem(original, soItem) || proofQty !== null;

    let status: 'MATCH' | 'MISMATCH' | 'UNCLEAR' = 'UNCLEAR';
    let notes = s(original.notes);

    if (itemMatched && proofQty !== null && qtySame(soItem.quantity, proofQty)) {
      status = 'MATCH';
      notes = 'Item code/name and quantity match the Sales Order.';
    } else if (itemMatched && proofQty !== null && !qtySame(soItem.quantity, proofQty)) {
      status = 'MISMATCH';
      notes = `Item appears to match, but quantity differs. SO qty ${soItem.quantity}, proof qty ${proofQty}.`;
    } else if (itemMatched) {
      status = 'UNCLEAR';
      notes = notes || 'Item appears in proof, but quantity is unclear.';
    } else {
      status = 'UNCLEAR';
      notes = notes || 'Could not confidently find this SO item in the uploaded proof.';
    }

    return {
      ...original,
      so_item: soItem.name,
      so_sku: soItem.sku,
      so_qty: soItem.quantity,
      proof_item: s(original.proof_item || original.item || ''),
      proof_sku: s(original.proof_sku || original.sku || ''),
      proof_qty: proofQty,
      status,
      notes,
    };
  });

  const statuses = comparison.map(row => row.status);
  const allMatch = statuses.length > 0 && statuses.every(status => status === 'MATCH');
  const anyMismatch = statuses.some(status => status === 'MISMATCH');
  const anyMatch = statuses.some(status => status === 'MATCH');

  const rawCustomerCheck = (analysis.customer_check && typeof analysis.customer_check === 'object')
    ? analysis.customer_check as Record<string, unknown>
    : { so_customer: so.customer_name, proof_customer: '', status: 'UNCLEAR', notes: 'Customer name was not clearly extracted.' };

  const aliasCustomer = customerNamesEquivalent(
    so.customer_name,
    customerOverride || rawCustomerCheck.proof_customer,
    customerOverride ? customerOverride : analysis.proof_text
  );

  const customerCheck = {
    ...rawCustomerCheck,
    so_customer: so.customer_name,
    proof_customer: aliasCustomer.proofName || s(rawCustomerCheck.proof_customer),
    status: aliasCustomer.match ? 'MATCH' : s(rawCustomerCheck.status || 'UNCLEAR'),
    notes: aliasCustomer.match ? aliasCustomer.notes : s(rawCustomerCheck.notes || aliasCustomer.notes),
  };

  let overall_status: 'MATCH' | 'PARTIAL_MATCH' | 'MISMATCH' | 'UNCLEAR' = 'UNCLEAR';
  let approval_recommendation: 'APPROVE' | 'REVIEW' | 'REJECT' = 'REVIEW';

  if (allMatch && !anyMismatch) {
    overall_status = 'MATCH';
    approval_recommendation = 'APPROVE';
  } else if (anyMismatch) {
    overall_status = 'MISMATCH';
    approval_recommendation = 'REJECT';
  } else if (anyMatch) {
    overall_status = 'PARTIAL_MATCH';
    approval_recommendation = 'REVIEW';
  }

  return {
    ...analysis,
    comparison,
    customer_check: customerCheck,
    overall_status,
    approval_recommendation,
    summary: allMatch
      ? 'Uploaded proof matches the Sales Order item(s) and quantity. Recommended to approve.'
      : s(analysis.summary) || 'VIA could not fully match the proof against the Sales Order.',
  };
}


function normalizeSO(so: Record<string, unknown>) {
  const lineItems = ((so.line_items || []) as Record<string, unknown>[]).map((li): SOItem => ({
    name: s(li.name),
    sku: s(li.sku || li.item_code),
    item_id: s(li.item_id),
    quantity: n(li.quantity),
    unit: s(li.unit || 'sht'),
    rate: n(li.rate),
    amount: n(li.item_total || li.amount),
    location_name: s(li.location_name),
  }));

  return {
    salesorder_id: s(so.salesorder_id),
    salesorder_number: s(so.salesorder_number),
    customer_name: s(so.customer_name),
    customer_id: s(so.customer_id),
    date: s(so.date),
    status: s(so.status),
    salesperson_name: s(so.salesperson_name),
    total: n(so.total),
    sub_total: n(so.sub_total),
    notes: s(so.notes),
    line_items: lineItems,
  };
}

async function getSODetail(id: string) {
  const response = await zohoRequest<ZohoSalesOrderResponse>(`/salesorders/${id}`);
  if (!response.salesorder) throw new Error('Zoho did not return salesorder detail');
  return normalizeSO(response.salesorder);
}

function tryJson(text: string): Record<string, unknown> | null {
  try { return JSON.parse(text); } catch {}
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try { return JSON.parse(match[0]); } catch { return null; }
}

async function extractPdfText(buffer: Buffer): Promise<string> {
  try {
    const mod = await import('pdf-parse');
    const pdfParse = (mod.default ?? mod) as unknown as (buf: Buffer) => Promise<{ text?: string }>;
    const parsed = await pdfParse(buffer);
    return (parsed.text || '').slice(0, 12000);
  } catch {
    const raw = buffer.toString('latin1');
    const matches = Array.from(raw.matchAll(/\(([^()]{2,})\)\s*Tj/g)).map(m => m[1]);
    return matches.join(' ').slice(0, 6000) || '[PDF uploaded, but text extraction failed.]';
  }
}

async function callOpenAIForProof(input: {
  so: ReturnType<typeof normalizeSO>;
  textBlocks: string[];
  images: Array<{ mime: string; base64: string; name: string }>;
  pdfs?: Array<{ mime: string; base64: string; name: string }>;
  customerOverride?: string;
}) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      extracted_items: [],
      comparison: input.so.line_items.map(item => ({
        so_item: item.name,
        so_sku: item.sku,
        so_qty: item.quantity,
        proof_item: '',
        proof_qty: null,
        status: 'UNCLEAR',
        notes: 'ANTHROPIC_API_KEY is not configured, so VIA could not read the uploaded proof automatically.',
      })),
      overall_status: 'UNCLEAR',
      summary: 'AI proof reading unavailable. Configure Anthropic API key, then try again.',
    };
  }

  const customerNote = input.customerOverride
    ? `Customer name provided by user: "${input.customerOverride}". The proof may not show the customer name — treat this as the confirmed proof customer.`
    : 'Customer alias rule: CASA INTERIOR is the same customer as CASA CIPTA ABADI / CASA CIPTA ABADI, PT.';

  const prompt = `You are VIA, an internal order approval checker for Varindo.

Task:
1. Read the uploaded proof of order. It may be a WhatsApp screenshot, image, PDF text, or mixed files.
2. Extract customer requested items, SKUs/codes if visible, quantities, units, and prices if visible.
3. Compare the proof against the Zoho Sales Order below.
4. Be strict and practical. If item code or qty is not clear, mark UNCLEAR. If qty differs, mark MISMATCH. If it matches, mark MATCH.
5. Return ONLY valid JSON. No markdown.
6. ${customerNote}

Zoho Sales Order:
${JSON.stringify(input.so, null, 2)}

Text extracted from uploaded proofs:
${input.textBlocks.map((t, i) => `--- FILE TEXT ${i + 1} ---\n${t}`).join('\n\n')}

Return JSON with this exact shape:
{
  "overall_status": "MATCH" | "PARTIAL_MATCH" | "MISMATCH" | "UNCLEAR",
  "summary": "short approval recommendation",
  "extracted_items": [
    { "item": "", "sku": "", "quantity": 0, "unit": "", "price": null, "source_note": "" }
  ],
  "comparison": [
    { "so_item": "", "so_sku": "", "so_qty": 0, "proof_item": "", "proof_sku": "", "proof_qty": 0, "status": "MATCH" | "MISMATCH" | "UNCLEAR", "notes": "" }
  ],
  "customer_check": { "so_customer": "", "proof_customer": "", "status": "MATCH" | "MISMATCH" | "UNCLEAR", "notes": "" },
  "approval_recommendation": "APPROVE" | "REVIEW" | "REJECT"
}`;

  const model = process.env.ANTHROPIC_MODEL || 'claude-opus-4-8';
  const pdfs = input.pdfs || [];

  const userContent: Array<Record<string, unknown>> = [{ type: 'text', text: prompt }];

  for (const pdf of pdfs.slice(0, 3)) {
    userContent.push({
      type: 'document',
      source: {
        type: 'base64',
        media_type: pdf.mime || 'application/pdf',
        data: pdf.base64,
      },
    });
  }

  for (const image of input.images.slice(0, 6)) {
    userContent.push({
      type: 'image',
      source: {
        type: 'base64',
        media_type: image.mime,
        data: image.base64,
      },
    });
  }

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 2500,
      messages: [{ role: 'user', content: userContent }],
    }),
  });

  const body = await res.json();
  if (!res.ok) throw new Error(`Anthropic error ${res.status}: ${JSON.stringify(body)}`);
  const text = (Array.isArray(body.content)
    ? body.content.filter((b: Record<string, unknown>) => b.type === 'text').map((b: Record<string, unknown>) => b.text).join('')
    : '') || '{}';
  return tryJson(text) || { overall_status: 'UNCLEAR', summary: text, comparison: [], extracted_items: [] };
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (id) {
      const so = await getSODetail(id);
      return NextResponse.json({ success: true, salesorder: so });
    }

    if (searchParams.get('customers') === '1') {
      const res = await zohoRequest<{ contacts?: Record<string, unknown>[] }>('/contacts', {
        queryParams: { contact_type: 'customer', status: 'active', per_page: 200, sort_column: 'contact_name', sort_order: 'A' },
      });
      const customers = (res.contacts || [])
        .map(c => ({ contact_id: s(c.contact_id), contact_name: s(c.contact_name) }))
        .filter(c => c.contact_name);
      return NextResponse.json({ success: true, customers });
    }

    const response = await zohoRequest<ZohoSalesOrderListResponse>('/salesorders', {
      queryParams: {
        status: 'pending_approval',
        per_page: 200,
        sort_column: 'date',
        sort_order: 'D',
      },
    });

    return NextResponse.json({
      success: true,
      salesorders: (response.salesorders || []).map(so => ({
        salesorder_id: s(so.salesorder_id),
        salesorder_number: s(so.salesorder_number),
        customer_name: s(so.customer_name),
        date: s(so.date),
        status: s(so.status),
        total: n(so.total),
        salesperson_name: s(so.salesperson_name),
      })),
    });
  } catch (error) {
    console.error('[SO Approval] GET error:', error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const soId = s(formData.get('salesorder_id'));
    if (!soId) return NextResponse.json({ success: false, error: 'salesorder_id is required' }, { status: 400 });

    const customerOverride = s(formData.get('customer_name_override')).trim() || undefined;

    const so = await getSODetail(soId);
    const files = formData.getAll('files').filter(Boolean) as File[];
    if (!files.length) return NextResponse.json({ success: false, error: 'Upload at least one proof file.' }, { status: 400 });

    const textBlocks: string[] = [];
    const images: Array<{ mime: string; base64: string; name: string }> = [];
    const pdfs: Array<{ mime: string; base64: string; name: string }> = [];

    for (const file of files.slice(0, 8)) {
      const buffer = Buffer.from(await file.arrayBuffer());
      if (file.type.startsWith('image/')) {
        images.push({ mime: file.type, base64: buffer.toString('base64'), name: file.name });
        textBlocks.push(`[Image uploaded: ${file.name}]`);
      } else if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
        const pdfText = await extractPdfText(buffer);
        console.log('[SO Approval] PDF text extracted', { file: file.name, length: pdfText.length, preview: pdfText.slice(0, 500) });
        textBlocks.push(`[PDF: ${file.name}]\n${pdfText}`);
        pdfs.push({ mime: file.type || 'application/pdf', base64: buffer.toString('base64'), name: file.name });
      } else {
        textBlocks.push(`[File: ${file.name}]\n${buffer.toString('utf-8').slice(0, 12000)}`);
      }
    }

    const rawAnalysis = await callOpenAIForProof({ so, textBlocks, images, pdfs, customerOverride });
    const proofText = textBlocks.join('\n\n');
    const rawAnalysisWithText = (rawAnalysis && typeof rawAnalysis === 'object' ? rawAnalysis : {}) as Record<string, unknown>;
    rawAnalysisWithText.proof_text = proofText;
    if (!Array.isArray(rawAnalysisWithText.extracted_items) || rawAnalysisWithText.extracted_items.length === 0) {
      rawAnalysisWithText.extracted_items = so.line_items
        .map(item => {
          const quantity = extractQtyFromProofTextForSOItem(proofText, item);
          if (quantity === null) return null;
          return { item: item.name, sku: item.sku, quantity, unit: item.unit || 'sht', price: null, source_note: 'Extracted by VIA deterministic SKU/quantity parser.' };
        })
        .filter(Boolean);
    }
    const analysis = postProcessApprovalAnalysis(rawAnalysisWithText, so, customerOverride);
    console.log('[SO Approval] final analysis', {
      so: so.salesorder_number,
      customer: so.customer_name,
      proofTextLength: proofText.length,
      overall: (analysis as Record<string, unknown>).overall_status,
      recommendation: (analysis as Record<string, unknown>).approval_recommendation,
      comparison: (analysis as Record<string, unknown>).comparison,
    });

    return NextResponse.json({
      success: true,
      salesorder: so,
      file_count: files.length,
      analysis,
    });
  } catch (error) {
    console.error('[SO Approval] POST error:', error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const soId = s(body.salesorder_id);
    if (!soId) {
      return NextResponse.json({ success: false, error: 'salesorder_id is required' }, { status: 400 });
    }

    // Only approve Sales Orders that are still pending approval.
    const so = await getSODetail(soId);
    if (so.status && so.status !== 'pending_approval') {
      return NextResponse.json({
        success: false,
        error: `Only Pending Approval Sales Orders can be approved. Current status: ${so.status}`,
      }, { status: 400 });
    }

    const response = await zohoRequest<Record<string, unknown>>(`/salesorders/${soId}/approve`, {
      method: 'POST',
      body: {},
    });

    return NextResponse.json({
      success: true,
      message: s(response.message) || 'Sales Order approved in Zoho.',
      salesorder_id: soId,
      salesorder_number: so.salesorder_number,
    });
  } catch (error) {
    console.error('[SO Approval] PUT approve error:', error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
