'use client';

import { useEffect, useState } from 'react';
import ChatInterface from '@/components/ChatInterface';

type DailyBriefChange = { field: string; from: string; to: string };
type DailyBriefCustomer = { contact_id: string; contact_name: string; changes: DailyBriefChange[]; fixed_at: string };
type DailyBriefInvoice = { salesorder_id: string; salesorder_number: string; customer_name: string; invoice_number: string | null; converted_at: string };
type DailyBriefSentInvoice = { invoice_id: string; invoice_number: string; customer_name: string; sent_at: string };
type DailyBriefDay = { date: string; label: string; customers: DailyBriefCustomer[]; invoices: DailyBriefInvoice[]; sentInvoices: DailyBriefSentInvoice[] };

function DailyBriefPanel() {
  const [days, setDays] = useState<DailyBriefDay[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

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
          <h2 className="text-[var(--text)] font-semibold text-sm">Daily Brief</h2>
        </div>
        <button onClick={load} disabled={loading}
          className="px-3 py-1.5 text-xs rounded-lg disabled:opacity-50"
          style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--muted)' }}>
          {loading ? '…' : '↻ Refresh'}
        </button>
      </div>

      {error && (
        <div className="rounded-lg p-3 text-xs" style={{ background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', color: 'var(--danger)' }}>
          {error}
        </div>
      )}

      {!loading && !error && days && days.length === 0 && (
        <div className="text-[var(--muted)] text-xs py-3">No customer repairs, auto-invoiced shipments, or auto-sent invoices in the last 14 days.</div>
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
                    {day.customers.length} {day.customers.length === 1 ? 'customer' : 'customers'} · {day.invoices.length} {day.invoices.length === 1 ? 'invoice' : 'invoices'} · {day.sentInvoices.length} sent {isOpen ? '▲' : '▼'}
                  </span>
                </button>
                {isOpen && (
                  <div className="divide-y" style={{ borderTop: '1px solid var(--border)' }}>
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
                    {day.invoices.map(inv => (
                      <div key={inv.salesorder_id} className="px-3 py-2">
                        <div className="text-[var(--text)] text-xs font-medium">{inv.customer_name || '(unnamed)'}</div>
                        <div className="text-[var(--muted)] text-xs mt-1">
                          <span style={{ fontFamily: 'JetBrains Mono, monospace' }}>{inv.salesorder_number}</span> converted to invoice
                          {inv.invoice_number && <> — <span style={{ color: 'var(--success)', fontFamily: 'JetBrains Mono, monospace' }}>{inv.invoice_number}</span></>}
                        </div>
                      </div>
                    ))}
                    {day.sentInvoices.map(inv => (
                      <div key={inv.invoice_id} className="px-3 py-2">
                        <div className="text-[var(--text)] text-xs font-medium">{inv.customer_name || '(unnamed)'}</div>
                        <div className="text-[var(--muted)] text-xs mt-1">
                          Invoice <span style={{ color: 'var(--success)', fontFamily: 'JetBrains Mono, monospace' }}>{inv.invoice_number}</span> marked as sent
                        </div>
                      </div>
                    ))}
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
