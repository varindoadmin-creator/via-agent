'use client';

import { useEffect, useState } from 'react';
import ChatInterface from '@/components/ChatInterface';

type DailyBriefChange = { field: string; from: string; to: string };
type DailyBriefCustomer = { contact_id: string; contact_name: string; changes: DailyBriefChange[]; fixed_at: string };
type DailyBriefInvoice = { salesorder_id: string; salesorder_number: string; customer_name: string; invoice_number: string | null; converted_at: string };
type DailyBriefSentInvoice = { invoice_id: string; invoice_number: string; customer_name: string; sent_at: string };
type DailyBriefPriceListItem = { item_id: string; item_name: string; tiers: string[]; created_at: string };
type DailyBriefSalespersonAssignment = { document_type: 'sales_order' | 'invoice'; document_id: string; document_number: string; customer_name: string; salesperson_name: string; assigned_at: string };
type DailyBriefDay = { date: string; label: string; customers: DailyBriefCustomer[]; invoices: DailyBriefInvoice[]; sentInvoices: DailyBriefSentInvoice[]; priceListItems: DailyBriefPriceListItem[]; salespersonAssignments: DailyBriefSalespersonAssignment[] };

function CategorySection({ label, count, children }: { label: string; count: number; children: React.ReactNode }) {
  if (count === 0) return null;
  return (
    <div>
      <div className="px-3 pt-2.5 pb-1 text-[var(--text-4)] text-xs uppercase tracking-wider" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
        {label} ({count})
      </div>
      <div className="divide-y">
        {children}
      </div>
    </div>
  );
}

function DailyBriefPanel() {
  const [days, setDays] = useState<DailyBriefDay[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/dashboard/daily-brief', { cache: 'no-store' });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Failed to load');
      setDays(json.days || []);
      setExpanded(prev => (prev.size ? prev : new Set((json.days || []).slice(0, 1).map((d: DailyBriefDay) => d.date))));
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function runSalespersonSync() {
    setSyncing(true);
    setSyncMessage('');
    try {
      const res = await fetch('/api/salesperson-map/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Sync failed');
      setSyncMessage(`Assigned ${json.assigned}, learned ${json.learned}, skipped ${json.skipped}, failed ${json.failed}.`);
      await load();
    } catch (err) {
      setSyncMessage('Sync failed: ' + String(err));
    } finally {
      setSyncing(false);
    }
  }

  function toggle(date: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date); else next.add(date);
      return next;
    });
  }

  return (
    <div style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 12, padding: 18, marginBottom: 20 }}>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-[var(--text)] font-semibold text-sm">Daily Automated Tasks</h2>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={runSalespersonSync} disabled={syncing}
            className="px-3 py-1.5 text-xs rounded-lg disabled:opacity-50"
            style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--muted)' }}>
            {syncing ? 'Syncing…' : 'Run Salesperson Sync Now'}
          </button>
          <button onClick={load} disabled={loading}
            className="px-3 py-1.5 text-xs rounded-lg disabled:opacity-50"
            style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--muted)' }}>
            {loading ? '…' : '↻ Refresh'}
          </button>
        </div>
      </div>

      {syncMessage && (
        <div className="rounded-lg p-3 text-xs mb-3" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--muted)' }}>
          {syncMessage}
        </div>
      )}

      {error && (
        <div className="rounded-lg p-3 text-xs" style={{ background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', color: 'var(--danger)' }}>
          {error}
        </div>
      )}

      {!loading && !error && days && days.length === 0 && (
        <div className="text-[var(--muted)] text-xs py-3">No customer repairs, auto-invoiced shipments, auto-sent invoices, price list additions, or salesperson assignments in the last 14 days.</div>
      )}

      {!error && days && days.length > 0 && (
        <div className="space-y-2">
          {days.map(day => {
            const isOpen = expanded.has(day.date);
            return (
              <div key={day.date} style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
                <button
                  onClick={() => toggle(day.date)}
                  className="w-full flex items-center justify-between px-3 py-2"
                  style={{ background: 'var(--surface-2)' }}
                >
                  <span className="text-[var(--text)] text-xs font-medium">{day.label}</span>
                  <span className="text-[var(--muted)] text-xs" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                    {day.customers.length} {day.customers.length === 1 ? 'customer' : 'customers'} · {day.invoices.length} {day.invoices.length === 1 ? 'invoice' : 'invoices'} · {day.sentInvoices.length} sent · {day.priceListItems.length} priced · {day.salespersonAssignments.length} salesperson {isOpen ? '▲' : '▼'}
                  </span>
                </button>
                {isOpen && (
                  <div className="divide-y" style={{ borderTop: '1px solid var(--border)' }}>
                    <CategorySection label="Customer Data Fixes" count={day.customers.length}>
                      {day.customers.map(c => (
                        <div key={c.contact_id} className="px-3 py-2">
                          <div className="text-[var(--text)] text-xs font-medium">{c.contact_name || '(unnamed)'}</div>
                          <div className="text-[var(--muted)] text-xs mt-1 space-y-0.5">
                            {c.changes.map((ch, i) => (
                              <div key={i}>
                                <span style={{ fontFamily: 'JetBrains Mono, monospace' }}>{ch.field}</span>: {ch.from || '(blank)'} → <span style={{ color: 'var(--success)' }}>{ch.to}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </CategorySection>

                    <CategorySection label="Shipments Converted to Invoice" count={day.invoices.length}>
                      {day.invoices.map(inv => (
                        <div key={inv.salesorder_id} className="px-3 py-2">
                          <div className="text-[var(--text)] text-xs font-medium">{inv.customer_name || '(unnamed)'}</div>
                          <div className="text-[var(--muted)] text-xs mt-1">
                            <span style={{ fontFamily: 'JetBrains Mono, monospace' }}>{inv.salesorder_number}</span> converted to invoice
                            {inv.invoice_number && <> — <span style={{ color: 'var(--success)', fontFamily: 'JetBrains Mono, monospace' }}>{inv.invoice_number}</span></>}
                          </div>
                        </div>
                      ))}
                    </CategorySection>

                    <CategorySection label="Invoices Marked as Sent" count={day.sentInvoices.length}>
                      {day.sentInvoices.map(inv => (
                        <div key={inv.invoice_id} className="px-3 py-2">
                          <div className="text-[var(--text)] text-xs font-medium">{inv.customer_name || '(unnamed)'}</div>
                          <div className="text-[var(--muted)] text-xs mt-1">
                            Invoice <span style={{ color: 'var(--success)', fontFamily: 'JetBrains Mono, monospace' }}>{inv.invoice_number}</span> marked as sent
                          </div>
                        </div>
                      ))}
                    </CategorySection>

                    <CategorySection label="Price List Additions" count={day.priceListItems.length}>
                      {day.priceListItems.map(item => (
                        <div key={item.item_id} className="px-3 py-2">
                          <div className="text-[var(--text)] text-xs font-medium">{item.item_name}</div>
                          <div className="text-[var(--muted)] text-xs mt-1">
                            Added to Price Lists — <span style={{ color: 'var(--success)' }}>{item.tiers.join(', ')}</span>
                          </div>
                        </div>
                      ))}
                    </CategorySection>

                    <CategorySection label="Salesperson Auto-Assigned" count={day.salespersonAssignments.length}>
                      {day.salespersonAssignments.map(s => (
                        <div key={s.document_type + s.document_id} className="px-3 py-2">
                          <div className="text-[var(--text)] text-xs font-medium">{s.customer_name || '(unnamed)'}</div>
                          <div className="text-[var(--muted)] text-xs mt-1">
                            {s.document_type === 'sales_order' ? 'Sales Order' : 'Invoice'} <span style={{ fontFamily: 'JetBrains Mono, monospace' }}>{s.document_number}</span> assigned to{' '}
                            <span style={{ color: 'var(--success)' }}>{s.salesperson_name}</span>
                          </div>
                        </div>
                      ))}
                    </CategorySection>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function DashboardPage() {
  return (
    <div className="via-page" style={{ background: 'var(--bg)', minHeight: '100%' }}>
      <div style={{ maxWidth: 1500, margin: '0 auto' }}>
        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="text-[var(--text)] font-semibold text-2xl tracking-tight">Dashboard</h1>
          </div>
        </div>

        <DailyBriefPanel />

        <div style={{ minHeight: 'min(620px, 70dvh)', overflow: 'hidden', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--panel)' }}>
          <ChatInterface />
        </div>
      </div>
    </div>
  );
}
