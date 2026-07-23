'use client';

import { useEffect, useState } from 'react';

type DailyBriefChange = { field: string; from: string; to: string };
type DailyBriefCustomer = { contact_id: string; contact_name: string; changes: DailyBriefChange[]; fixed_at: string };
type DailyBriefInvoice = { salesorder_id: string; salesorder_number: string; customer_name: string; invoice_number: string | null; converted_at: string };
type DailyBriefSentInvoice = { invoice_id: string; invoice_number: string; customer_name: string; sent_at: string };
type DailyBriefPriceListItem = { item_id: string; item_name: string; tiers: string[]; created_at: string };
type DailyBriefSalespersonAssignment = { document_type: 'sales_order' | 'invoice'; document_id: string; document_number: string; customer_name: string; salesperson_name: string; assigned_at: string };
type DailyBriefSOApproval = { salesorder_id: string; salesorder_number: string; customer_name: string; total: number; item_count: number; approved_by: string; approved_at: string };
type DailyBriefPOStockItem = { item_name: string; sku: string; quantity: number; stock_qty: number; match_status: 'for_stock' | 'excess_stock'; location_name: string };
type DailyBriefPOApproval = { purchaseorder_id: string; purchaseorder_number: string; vendor_name: string; total: number; stock_items: DailyBriefPOStockItem[]; approved_by: string; approved_at: string };
type DailyBriefDay = {
  date: string; label: string;
  customers: DailyBriefCustomer[]; invoices: DailyBriefInvoice[]; sentInvoices: DailyBriefSentInvoice[];
  priceListItems: DailyBriefPriceListItem[]; salespersonAssignments: DailyBriefSalespersonAssignment[];
  soApprovals: DailyBriefSOApproval[]; poApprovals: DailyBriefPOApproval[];
};

const formatRp = (n: number) => 'Rp ' + Math.round(n).toLocaleString('id-ID');

type PurchaseGapSO = { salesorder_id: string; salesorder_number: string; customer_name: string; total: number; confirmed_at: string; sub_status_formatted: string };

function PurchaseGapAlert() {
  const [gaps, setGaps] = useState<PurchaseGapSO[] | null>(null);

  async function load() {
    try {
      const res = await fetch('/api/salesorders/purchase-gap-check', { cache: 'no-store' });
      const json = await res.json();
      if (json.success) setGaps(json.gaps || []);
    } catch {
      // Silent — this is a supplementary alert, the daily email is the reliable channel.
    }
  }

  useEffect(() => { load(); }, []);

  if (!gaps || gaps.length === 0) return null;

  return (
    <div style={{ background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', borderRadius: 12, padding: 16, marginBottom: 20 }}>
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-semibold" style={{ color: 'var(--danger)' }}>
          ⚠ {gaps.length} Confirmed SO{gaps.length === 1 ? '' : 's'} not Ordered today
        </h2>
        <button onClick={load} className="text-xs px-2 py-1 rounded-lg" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--muted)' }}>↻</button>
      </div>
      <div className="text-xs mb-2" style={{ color: 'var(--text-2)' }}>
        Confirmed today but no Purchase Order has been placed yet — Admin may have forgotten.
      </div>
      <div className="space-y-1">
        {gaps.map(g => (
          <div key={g.salesorder_id} className="flex items-center justify-between text-xs py-1" style={{ borderTop: '1px solid var(--border)' }}>
            <span>
              <span style={{ fontFamily: 'JetBrains Mono, monospace', color: 'var(--accent-text)', fontWeight: 500 }}>{g.salesorder_number}</span>
              {' — '}{g.customer_name || '(unnamed)'}
            </span>
            <span style={{ color: 'var(--muted)' }}>{formatRp(g.total)} · {g.sub_status_formatted}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

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
            {loading ? '…' : '↻'}
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
        <div className="text-[var(--muted)] text-xs py-3">No customer repairs, auto-invoiced shipments, auto-sent invoices, price list additions, salesperson assignments, or SO/PO approvals in the last 14 days.</div>
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
                    {day.customers.length} {day.customers.length === 1 ? 'customer' : 'customers'} · {day.invoices.length} {day.invoices.length === 1 ? 'invoice' : 'invoices'} · {day.sentInvoices.length} sent · {day.priceListItems.length} priced · {day.salespersonAssignments.length} salesperson · {day.soApprovals.length} SO · {day.poApprovals.length} PO {isOpen ? '▲' : '▼'}
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

                    <CategorySection label="Sales Orders Approved" count={day.soApprovals.length}>
                      {day.soApprovals.map(a => (
                        <div key={a.salesorder_id} className="px-3 py-2">
                          <div className="text-[var(--text)] text-xs font-medium">{a.customer_name || '(unnamed)'}</div>
                          <div className="text-[var(--muted)] text-xs mt-1">
                            <span style={{ fontFamily: 'JetBrains Mono, monospace' }}>{a.salesorder_number}</span> — {a.item_count} item{a.item_count === 1 ? '' : 's'}, {formatRp(a.total)} — approved by {a.approved_by}
                          </div>
                        </div>
                      ))}
                    </CategorySection>

                    <CategorySection label="Purchase Orders Approved" count={day.poApprovals.length}>
                      {day.poApprovals.map(a => (
                        <div key={a.purchaseorder_id} className="px-3 py-2">
                          <div className="text-[var(--text)] text-xs font-medium">{a.vendor_name || '(unnamed)'}</div>
                          <div className="text-[var(--muted)] text-xs mt-1">
                            <span style={{ fontFamily: 'JetBrains Mono, monospace' }}>{a.purchaseorder_number}</span> — {formatRp(a.total)} — approved by {a.approved_by}
                          </div>
                          {a.stock_items.length > 0 ? (
                            <div className="mt-1.5 space-y-1">
                              {a.stock_items.map((it, i) => (
                                <div key={i} className="text-xs" style={{ color: 'var(--warning)' }}>
                                  ⚠ {it.item_name} ({it.sku}) — {it.quantity} {it.location_name && `at ${it.location_name}`} —{' '}
                                  {it.match_status === 'for_stock'
                                    ? 'no current order needs this'
                                    : `${it.stock_qty} extra beyond what's needed`}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="text-[var(--muted)] text-xs mt-1">Fully matched to confirmed Sales Order demand.</div>
                          )}
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

type AgingPackage = { package_id: string; package_number: string; salesorder_id: string; salesorder_number: string; customer_name: string; date: string; days_aging: number; tracking_number: string; carrier: string };

function ShipmentAgingAlert() {
  const [packages, setPackages] = useState<AgingPackage[] | null>(null);

  async function load() {
    try {
      const res = await fetch('/api/shipments/aging-check', { cache: 'no-store' });
      const json = await res.json();
      if (json.success) setPackages(json.packages || []);
    } catch {
      // Silent — this is a supplementary alert, the daily email is the reliable channel.
    }
  }

  useEffect(() => { load(); }, []);

  if (!packages || packages.length === 0) return null;

  return (
    <div style={{ background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', borderRadius: 12, padding: 16, marginBottom: 20 }}>
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-semibold" style={{ color: 'var(--danger)' }}>
          ⚠ {packages.length} shipment{packages.length === 1 ? '' : 's'} stuck Not Shipped
        </h2>
        <button onClick={load} className="text-xs px-2 py-1 rounded-lg" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--muted)' }}>↻</button>
      </div>
      <div className="text-xs mb-2" style={{ color: 'var(--text-2)' }}>
        Packed a day or more ago but still "Not Shipped" in Zoho — likely failed to actually go out.
      </div>
      <div className="space-y-1">
        {packages.map(p => (
          <div key={p.package_id} className="flex items-center justify-between text-xs py-1" style={{ borderTop: '1px solid var(--border)' }}>
            <span>
              <span style={{ fontFamily: 'JetBrains Mono, monospace', color: 'var(--accent-text)', fontWeight: 500 }}>{p.salesorder_number || '—'}</span>
              {' — '}{p.customer_name || '(unnamed)'}
              {' · '}<span style={{ fontFamily: 'JetBrains Mono, monospace' }}>{p.package_number}</span>
            </span>
            <span style={{ color: 'var(--muted)' }}>{p.days_aging} day{p.days_aging === 1 ? '' : 's'} · {p.carrier || 'no carrier'}</span>
          </div>
        ))}
      </div>
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

        <PurchaseGapAlert />
        <ShipmentAgingAlert />
        <DailyBriefPanel />
      </div>
    </div>
  );
}
