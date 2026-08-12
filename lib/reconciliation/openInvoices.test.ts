import assert from 'node:assert/strict';
import test from 'node:test';
import { collectOpenInvoices } from './openInvoices.ts';

const invoice = (id: string, balance = 100) => ({
  invoice_id: id,
  invoice_number: `INV-${id}`,
  customer_name: 'Customer',
  customer_id: 'customer-1',
  date: '2026-04-08',
  due_date: '2026-04-08',
  total: balance,
  balance,
});

test('loads every page for each open status and includes overdue invoices', async () => {
  const calls: string[] = [];
  const result = await collectOpenInvoices(async (status, page) => {
    calls.push(`${status}:${page}`);
    if (status === 'unpaid' && page === 1) return { invoices: [invoice('new')], page_context: { has_more_page: true } };
    if (status === 'unpaid' && page === 2) return { invoices: [invoice('old')], page_context: { has_more_page: false } };
    if (status === 'overdue') return { invoices: [invoice('VFH-000083')], page_context: { has_more_page: false } };
    return { invoices: [], page_context: { has_more_page: false } };
  });

  assert.deepEqual(result.map(row => row.invoice_id).sort(), ['VFH-000083', 'new', 'old']);
  assert.deepEqual(calls, ['unpaid:1', 'unpaid:2', 'partially_paid:1', 'overdue:1']);
});

test('deduplicates overlapping statuses and removes zero-balance invoices', async () => {
  const result = await collectOpenInvoices(async status => ({
    invoices: status === 'unpaid' ? [invoice('same'), invoice('closed', 0)] : [invoice('same')],
    page_context: { has_more_page: false },
  }));

  assert.deepEqual(result.map(row => row.invoice_id), ['same']);
});
