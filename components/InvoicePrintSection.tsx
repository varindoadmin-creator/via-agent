'use client';

import { useEffect, useState } from 'react';

interface PrintInvoice {
  invoice_id: string;
  invoice_number: string;
  customer_name: string;
  date: string;
  total: number;
  status: string;
  has_attachment: boolean;
}

interface CustomerOption { contact_id: string; contact_name: string }

const mono = { fontFamily: 'JetBrains Mono, monospace' };
const formatRp = (n: number) => 'Rp ' + Number(n).toLocaleString('id-ID');

export default function InvoicePrintSection() {
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [customerId, setCustomerId] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [results, setResults] = useState<PrintInvoice[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [printing, setPrinting] = useState(false);

  useEffect(() => {
    fetch('/api/zoho/customers').then(res => res.json()).then(data => setCustomers(data.customers || [])).catch(() => {});
  }, []);

  async function showInvoices() {
    if (!customerId && (!dateFrom || !dateTo)) { setError('Select a customer or a full date range.'); return; }
    setLoading(true); setError(''); setSelected(new Set());
    try {
      const params = new URLSearchParams();
      if (customerId) params.set('customer_id', customerId);
      if (dateFrom) params.set('from', dateFrom);
      if (dateTo) params.set('to', dateTo);
      const response = await fetch('/api/invoices?' + params.toString());
      const data = await response.json();
      if (!data.success) throw new Error(data.error || data.message || 'Unable to load invoices');
      setResults(data.invoices || []);
    } catch (cause) { setError(String(cause)); }
    finally { setLoading(false); }
  }

  async function printSelected() {
    if (!selected.size) return;
    setPrinting(true); setError('');
    try {
      const response = await fetch('/api/sales/tax-invoices/print', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoice_ids: Array.from(selected) }),
      });
      if (!response.ok) throw new Error((await response.json()).error || 'Failed to generate PDF');
      const url = URL.createObjectURL(await response.blob());
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (cause) { setError(String(cause)); }
    finally { setPrinting(false); }
  }

  return (
    <div className="via-card overflow-hidden mt-6">
      <div className="px-5 py-3 border-b border-[var(--border)]">
        <h2 className="text-[var(--text)] font-semibold text-sm">Print Invoices</h2>
        <p className="text-[var(--text-3)] text-xs mt-0.5">Choose a customer and/or period. Tax Invoice PDFs are included where attached.</p>
      </div>
      <div className="p-5">
        <div className="flex items-center gap-3 flex-wrap">
          <select value={customerId} onChange={event => setCustomerId(event.target.value)} className="via-input text-xs py-1.5 px-3 w-60">
            <option value="">All Customers</option>
            {customers.map(customer => <option key={customer.contact_id} value={customer.contact_id}>{customer.contact_name}</option>)}
          </select>
          <input type="date" value={dateFrom} onChange={event => setDateFrom(event.target.value)} className="via-input text-xs py-1.5 px-3" />
          <span className="text-[var(--text-3)] text-xs">to</span>
          <input type="date" value={dateTo} onChange={event => setDateTo(event.target.value)} className="via-input text-xs py-1.5 px-3" />
          <button onClick={showInvoices} disabled={loading} className="px-3 py-1.5 bg-[var(--accent)] text-white text-xs font-medium rounded-lg disabled:opacity-50">{loading ? 'Loading…' : 'Show'}</button>
          {selected.size > 0 && <button onClick={printSelected} disabled={printing} className="px-3 py-1.5 bg-[var(--surface-2)] text-[var(--text)] text-xs font-medium rounded-lg border border-[var(--border)] disabled:opacity-50">{printing ? 'Preparing PDF…' : `Print Selected (${selected.size})`}</button>}
        </div>
        {error && <div className="mt-3 p-3 bg-[var(--danger-bg)] border border-[var(--danger-border)] rounded-lg text-[var(--danger)] text-xs">{error}</div>}
        {results && <div className="mt-4 overflow-x-auto border border-[var(--border)] rounded-lg">
          <table className="via-table"><thead><tr>
            <th className="w-8"><input type="checkbox" checked={selected.size === results.length && results.length > 0} onChange={() => setSelected(selected.size === results.length ? new Set() : new Set(results.map(row => row.invoice_id)))} /></th>
            <th>Invoice</th><th>Customer</th><th>Date</th><th>Status</th><th>Tax Invoice</th><th className="text-right">Total</th>
          </tr></thead><tbody>
            {results.map(invoice => <tr key={invoice.invoice_id}>
              <td><input type="checkbox" checked={selected.has(invoice.invoice_id)} onChange={() => setSelected(previous => { const next = new Set(previous); next.has(invoice.invoice_id) ? next.delete(invoice.invoice_id) : next.add(invoice.invoice_id); return next; })} /></td>
              <td className="text-[var(--accent-text)] text-xs" style={mono}>{invoice.invoice_number}</td>
              <td className="text-xs">{invoice.customer_name}</td><td className="text-xs text-[var(--text-3)]">{invoice.date}</td>
              <td className="text-xs text-[var(--text-3)] capitalize">{invoice.status?.replace('_', ' ')}</td>
              <td className="text-xs">{invoice.has_attachment ? 'Attached' : 'Not attached'}</td>
              <td className="text-right text-xs" style={mono}>{formatRp(invoice.total)}</td>
            </tr>)}
          </tbody></table>
        </div>}
      </div>
    </div>
  );
}
