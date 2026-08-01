import { NextResponse } from 'next/server';
import { getZohoAccessToken, getZohoApiBaseUrl, getZohoOrgId } from '@/lib/zoho/auth';
import { calculateCustomerRisk } from '@/lib/customers/riskScoring';
import { fetchWithRetry } from '@/lib/zoho/retry';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

type Row = Record<string, unknown>;
const DAY_MS = 86_400_000;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
let cache: { expiresAt: number; payload: unknown } | null = null;

async function zohoGet(path: string) {
  const token = await getZohoAccessToken();
  const separator = path.includes('?') ? '&' : '?';
  const response = await fetchWithRetry(`${getZohoApiBaseUrl()}${path}${separator}organization_id=${getZohoOrgId()}`, {
    headers: { Authorization: `Zoho-oauthtoken ${token}` },
  });
  const body = await response.json();
  if (!response.ok || (body.code !== undefined && body.code !== 0)) throw new Error(`Zoho ${response.status}: ${body.message || 'request failed'}`);
  return body;
}

async function fetchAll(path: string, key: string, maxPages = 40) {
  const rows: Row[] = [];
  for (let page = 1; page <= maxPages; page++) {
    const data = await zohoGet(`${path}${path.includes('?') ? '&' : '?'}per_page=200&page=${page}`);
    const batch = (data[key] || []) as Row[];
    rows.push(...batch);
    if (!data.page_context?.has_more_page && batch.length < 200) break;
  }
  return rows;
}

function dateValue(row: Row, keys: string[]) {
  for (const key of keys) {
    const value = String(row[key] || '');
    if (value && !Number.isNaN(new Date(value).getTime())) return value;
  }
  return '';
}

function daysLate(dueDate: string, comparisonDate: string) {
  return Math.max(0, Math.round((new Date(comparisonDate).getTime() - new Date(dueDate).getTime()) / DAY_MS));
}

export async function GET() {
  if (cache && cache.expiresAt > Date.now()) return NextResponse.json(cache.payload);
  try {
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const day90 = new Date(now.getTime() - 90 * DAY_MS).toISOString().slice(0, 10);
    const day180 = new Date(now.getTime() - 180 * DAY_MS).toISOString().slice(0, 10);
    const day365 = new Date(now.getTime() - 365 * DAY_MS).toISOString().slice(0, 10);
    const [contacts, recentInvoices, overdueInvoices, salesOrders] = await Promise.all([
      fetchAll('/contacts?contact_type=customer&status=active', 'contacts'),
      fetchAll(`/invoices?date_after=${day365}`, 'invoices'),
      fetchAll('/invoices?status=overdue', 'invoices'),
      fetchAll(`/salesorders?date_after=${day180}`, 'salesorders'),
    ]);

    const invoiceMap = new Map<string, Row>();
    for (const invoice of [...recentInvoices, ...overdueInvoices]) {
      const invoiceId = String(invoice.invoice_id || '');
      if (invoiceId) invoiceMap.set(invoiceId, invoice);
    }
    const invoicesByCustomer = new Map<string, Row[]>();
    for (const invoice of invoiceMap.values()) {
      const customerId = String(invoice.customer_id || '');
      if (customerId) invoicesByCustomer.set(customerId, [...(invoicesByCustomer.get(customerId) || []), invoice]);
    }
    const ordersByCustomer = new Map<string, Row[]>();
    for (const order of salesOrders) {
      const customerId = String(order.customer_id || '');
      if (customerId) ordersByCustomer.set(customerId, [...(ordersByCustomer.get(customerId) || []), order]);
    }

    const customers = contacts.map(contact => {
      const customerId = String(contact.contact_id || '');
      const invoices = invoicesByCustomer.get(customerId) || [];
      const orders = ordersByCustomer.get(customerId) || [];
      const issued = invoices.filter(invoice => !['draft', 'void', 'cancelled'].includes(String(invoice.status || '').toLowerCase()));
      const overdue = issued.filter(invoice => {
        const balance = Number(invoice.balance) || 0;
        const dueDate = String(invoice.due_date || '');
        return balance > 0 && Boolean(dueDate) && dueDate < today;
      });
      const exactDelays = issued.flatMap(invoice => {
        const dueDate = String(invoice.due_date || '');
        const paidDate = dateValue(invoice, ['last_payment_date', 'paid_date', 'payment_made_date']);
        return dueDate && paidDate ? [daysLate(dueDate, paidDate)] : [];
      });
      const openOverdueDelays = overdue.map(invoice => daysLate(String(invoice.due_date), today));
      const delayValues = exactDelays.length ? exactDelays : openOverdueDelays;
      const averagePaymentDelayDays = delayValues.length ? delayValues.reduce((sum, days) => sum + days, 0) / delayValues.length : null;
      const paymentDelayBasis = exactDelays.length ? 'paid_invoice_dates' : openOverdueDelays.length ? 'open_overdue_estimate' : 'unavailable';
      const outstandingFromInvoices = issued.reduce((sum, invoice) => sum + (Number(invoice.balance) || 0), 0);
      const outstandingBalance = Number(contact.outstanding_receivable_amount ?? contact.outstanding_receivables ?? outstandingFromInvoices) || 0;
      const rawCreditLimit = Number(contact.credit_limit ?? contact.credit_limit_amount ?? contact.creditlimit);
      const creditLimit = Number.isFinite(rawCreditLimit) && rawCreditLimit > 0 ? rawCreditLimit : null;
      const validOrders = orders.filter(order => !['draft', 'void', 'cancelled'].includes(String(order.status || '').toLowerCase()));
      const recentRevenue = validOrders.filter(order => String(order.date || '') >= day90).reduce((sum, order) => sum + (Number(order.total) || 0), 0);
      const previousRevenue = validOrders.filter(order => String(order.date || '') < day90).reduce((sum, order) => sum + (Number(order.total) || 0), 0);
      const exceptional = [...invoices, ...orders].filter(transaction => {
        const status = String(transaction.status || '').toLowerCase();
        return ['disputed', 'void', 'cancelled'].includes(status) || transaction.is_disputed === true;
      });
      const result = calculateCustomerRisk({ overdueInvoiceCount: overdue.length, issuedInvoiceCount: issued.length, averagePaymentDelayDays, outstandingBalance, creditLimit, recentRevenue, previousRevenue, disputedOrCancelledCount: exceptional.length });
      return {
        customer_id: customerId,
        customer_name: String(contact.contact_name || contact.company_name || 'Unknown customer'),
        ...result,
        overdue_invoice_count: overdue.length,
        issued_invoice_count: issued.length,
        average_payment_delay_days: averagePaymentDelayDays == null ? null : Math.round(averagePaymentDelayDays),
        payment_delay_basis: paymentDelayBasis,
        outstanding_balance: outstandingBalance,
        credit_limit: creditLimit,
        recent_revenue_90d: recentRevenue,
        previous_revenue_90d: previousRevenue,
        disputed_or_cancelled_count: exceptional.length,
      };
    }).filter(customer => customer.issued_invoice_count > 0 || customer.outstanding_balance > 0 || (ordersByCustomer.get(customer.customer_id)?.length || 0) > 0)
      .sort((a, b) => b.score - a.score || b.outstanding_balance - a.outstanding_balance);

    const payload = {
      success: true,
      generated_at: now.toISOString(),
      advisory_only: true,
      methodology: 'Risk scores prioritize overdue behavior, payment delay, outstanding balance, configured credit utilization, sales decline, and disputed/void/cancelled transactions. Missing data adds no risk points.',
      summary: {
        critical: customers.filter(customer => customer.level === 'critical').length,
        high: customers.filter(customer => customer.level === 'high').length,
        watch: customers.filter(customer => customer.level === 'watch').length,
        low: customers.filter(customer => customer.level === 'low').length,
      },
      customers,
    };
    cache = { expiresAt: Date.now() + CACHE_TTL_MS, payload };
    return NextResponse.json(payload);
  } catch (error) {
    console.error('[CustomerRiskScores]', error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
