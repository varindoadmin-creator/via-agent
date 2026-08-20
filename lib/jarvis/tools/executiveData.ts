import { tool } from '@openai/agents';
import { z } from 'zod';
import type { JarvisRunContext } from '@/lib/jarvis/context';
import { cached } from '@/lib/jarvis/cache';
import { summarizeReceivables } from '@/lib/jarvis/intelligence/receivables';
import { zohoRequest } from '@/lib/zoho/client';

type Row = Record<string, unknown>;
const emptyParameters = z.object({});

async function fetchAll(path: string, key: string, queryParams: Record<string, string> = {}) {
  const rows: Row[] = [];
  let coverageComplete = true;
  for (let page = 1; page <= 20; page++) {
    const result = await zohoRequest<Row>(path, { queryParams: { ...queryParams, per_page: '200', page: String(page) } });
    const batch = (result[key] || []) as Row[];
    rows.push(...batch);
    const hasMore = Boolean((result.page_context as Row | undefined)?.has_more_page) || batch.length === 200;
    if (!hasMore) break;
    if (page === 20) coverageComplete = false;
  }
  return { rows, coverageComplete };
}

function jakartaDate() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

export const analyzeReceivablesTool = tool<typeof emptyParameters, JarvisRunContext>({
  name: 'analyze_receivables',
  description: 'Analyze current Zoho Books unpaid and overdue invoice balances with deterministic aging buckets and customer concentration. Read-only. Returns explicit pagination completeness.',
  parameters: emptyParameters,
  async execute(_input, context) {
    const result = await cached(context, 'analytics:receivables', async () => {
      const statuses = await Promise.all(['unpaid', 'partially_paid', 'overdue'].map(status => fetchAll('/invoices', 'invoices', { status })));
      const invoices = new Map<string, Row>();
      for (const status of statuses) for (const row of status.rows) invoices.set(String(row.invoice_id || ''), row);
      return { invoices: [...invoices.values()], coverageComplete: statuses.every(status => status.coverageComplete) };
    });
    const rows = result.invoices.map(row => ({ balance: Number(row.balance || 0), dueDate: String(row.due_date || ''), customerName: String(row.customer_name || 'Unassigned') }));
    return {
      source: 'Zoho Books unpaid, partially paid, and overdue invoices',
      as_of: jakartaDate(),
      coverage_complete: result.coverageComplete,
      invoice_count: rows.filter(row => row.balance > 0).length,
      ...summarizeReceivables(rows, jakartaDate()),
    };
  },
});

export const getOperationalPipelineTool = tool<typeof emptyParameters, JarvisRunContext>({
  name: 'get_operational_pipeline',
  description: 'Summarize the current Zoho Sales Order and Purchase Order pipeline: draft/open counts and values. This is a header-level operational snapshot, not fulfilment or late-order root-cause analysis.',
  parameters: emptyParameters,
  async execute(_input, context) {
    const data = await cached(context, 'analytics:operational-pipeline', async () => {
      const [draftSO, openSO, draftPO, openPO] = await Promise.all([
        fetchAll('/salesorders', 'salesorders', { status: 'draft' }),
        fetchAll('/salesorders', 'salesorders', { status: 'open' }),
        fetchAll('/purchaseorders', 'purchaseorders', { status: 'draft' }),
        fetchAll('/purchaseorders', 'purchaseorders', { status: 'open' }),
      ]);
      return { draftSO, openSO, draftPO, openPO };
    });
    const summary = (result: Awaited<ReturnType<typeof fetchAll>>) => ({ count: result.rows.length, value: result.rows.reduce((sum, row) => sum + Number(row.total || 0), 0) });
    return {
      source: 'Zoho Books Sales Order and Purchase Order headers',
      coverage_complete: Object.values(data).every(result => result.coverageComplete),
      sales_orders: { draft: summary(data.draftSO), open: summary(data.openSO) },
      purchase_orders: { draft: summary(data.draftPO), open: summary(data.openPO) },
      limitation: 'Header-level pipeline only. It does not establish stock allocation, supplier lateness, or fulfilment root causes.',
    };
  },
});
