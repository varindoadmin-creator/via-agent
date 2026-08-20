import { zohoRequest } from './client';

type Row = Record<string, unknown>;

function customField(row: Row, apiName: string): string {
  const hash = (row.custom_field_hash || {}) as Row;
  const direct = String(row[apiName] || hash[apiName] || '').trim();
  if (direct) return direct;
  const fields = (row.custom_fields || []) as Row[];
  const match = fields.find(field => String(field.api_name || '') === apiName);
  return String(match?.value || '').trim();
}

async function listAll(path: string, key: string): Promise<Row[]> {
  const rows: Row[] = [];
  for (let page = 1; page <= 10; page++) {
    const response = await zohoRequest<Row>(path, { queryParams: { per_page: 200, page, sort_column: 'date', sort_order: 'D' } });
    const batch = (response[key] || []) as Row[];
    rows.push(...batch);
    const context = (response.page_context || {}) as Row;
    if (!context.has_more_page && batch.length < 200) break;
  }
  return rows;
}

export interface NpwpRepairResult {
  scanned_salesorders: number;
  scanned_invoices: number;
  eligible_documents: number;
  updated_salesorders: number;
  updated_invoices: number;
  skipped_without_customer_npwp: number;
  failed: Array<{ type: 'salesorder' | 'invoice'; id: string; error: string }>;
}

export async function repairMissingDocumentNpwp(): Promise<NpwpRepairResult> {
  const [salesorders, invoices] = await Promise.all([
    listAll('/salesorders', 'salesorders'),
    listAll('/invoices', 'invoices'),
  ]);
  const customerCache = new Map<string, Promise<string>>();
  const getCustomerNpwp = (customerId: string) => {
    if (!customerCache.has(customerId)) {
      customerCache.set(customerId, zohoRequest<Row>(`/contacts/${encodeURIComponent(customerId)}`)
        .then(response => customField((response.contact || {}) as Row, 'cf_npwp')));
    }
    return customerCache.get(customerId)!;
  };

  const result: NpwpRepairResult = {
    scanned_salesorders: salesorders.length,
    scanned_invoices: invoices.length,
    eligible_documents: 0,
    updated_salesorders: 0,
    updated_invoices: 0,
    skipped_without_customer_npwp: 0,
    failed: [],
  };

  async function repair(type: 'salesorder' | 'invoice', row: Row) {
    const idKey = type === 'salesorder' ? 'salesorder_id' : 'invoice_id';
    const id = String(row[idKey] || '');
    const customerId = String(row.customer_id || '');
    if (!id || !customerId || customField(row, 'cf_npwp')) return;
    try {
      const collection = type === 'salesorder' ? 'salesorders' : 'invoices';
      const detailResponse = await zohoRequest<Row>(`/${collection}/${encodeURIComponent(id)}`);
      const detail = (detailResponse[type] || {}) as Row;
      if (customField(detail, 'cf_npwp')) return;
      result.eligible_documents++;
      const npwp = await getCustomerNpwp(customerId);
      if (!npwp) { result.skipped_without_customer_npwp++; return; }
      await zohoRequest(`/${collection}/${encodeURIComponent(id)}`, {
        method: 'PUT',
        body: { custom_fields: [{ api_name: 'cf_npwp', value: npwp }] },
      });
      if (type === 'salesorder') result.updated_salesorders++;
      else result.updated_invoices++;
    } catch (cause) {
      result.failed.push({ type, id, error: cause instanceof Error ? cause.message : String(cause) });
    }
  }

  for (let index = 0; index < salesorders.length; index += 5) await Promise.all(salesorders.slice(index, index + 5).map(row => repair('salesorder', row)));
  for (let index = 0; index < invoices.length; index += 5) await Promise.all(invoices.slice(index, index + 5).map(row => repair('invoice', row)));
  return result;
}
