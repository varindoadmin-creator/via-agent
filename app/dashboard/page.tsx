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

type AutomationHealthJob = {
  name: string; label: string; schedule: string;
  status: 'healthy' | 'pending' | 'missing' | 'failed';
  lastSuccessAt: string | null; nextExpectedAt: string;
};
type DraftReadinessIssue = {
  product_code: string; item_name: string; required_quantity: number; available_quantity: number;
  shortage_quantity: number; assigned_location: string;
  other_locations: Array<{ location: string; available_quantity: number }>;
  suggested_transfers: Array<{ from_location: string; quantity: number }>;
};
type DraftReadinessInvoice = { invoice_id: string; invoice_number: string; customer_name: string; issues: DraftReadinessIssue[] };

function formatJakarta(value: string | null) {
  if (!value) return 'Never';
  return new Date(value).toLocaleString('en-GB', {
    timeZone: 'Asia/Jakarta', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

function AutomationHealthPanel() {
  const [data, setData] = useState<{ healthy: boolean; jobs: AutomationHealthJob[]; alerts: Array<{ severity: string; message: string }>; draftReadiness: DraftReadinessInvoice[] } | null>(null);
  const [error, setError] = useState('');

  async function load() {
    setError('');
    try {
      const res = await fetch('/api/dashboard/automation-health', { cache: 'no-store' });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Health check failed');
      setData(json);
    } catch (err) {
      setError(String(err));
    }
  }

  useEffect(() => { load(); }, []);

  return (
    <div style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 12, padding: 18, marginBottom: 20 }}>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-[var(--text)] font-semibold text-sm">Automation Health</h2>
          <div className="text-[var(--muted)] text-xs mt-1">Daily schedules use Asia/Jakarta time · 30-minute grace period</div>
        </div>
        <button onClick={load} className="px-3 py-1.5 text-xs rounded-lg" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--muted)' }}>↻</button>
      </div>

      {error && <div className="rounded-lg p-3 text-xs" style={{ background: 'var(--danger-bg)', color: 'var(--danger)' }}>{error}</div>}
      {data?.alerts.map((alert, index) => (
        <div key={index} className="rounded-lg p-3 text-xs mb-2" style={{ background: alert.severity === 'critical' ? 'var(--danger-bg)' : 'var(--warning-bg)', border: `1px solid ${alert.severity === 'critical' ? 'var(--danger-border)' : 'var(--warning-border)'}`, color: alert.severity === 'critical' ? 'var(--danger)' : 'var(--warning)' }}>
          ⚠ {alert.message}
        </div>
      ))}
      {data?.healthy && <div className="rounded-lg p-3 text-xs mb-3" style={{ background: 'var(--success-bg)', color: 'var(--success)' }}>✓ All scheduled tasks are healthy.</div>}

      {data && data.draftReadiness.length > 0 && (
        <div className="mb-4 space-y-3">
          <div className="text-xs font-semibold" style={{ color: 'var(--warning)' }}>Draft invoices needing stock action</div>
          {data.draftReadiness.map(invoice => (
            <div key={invoice.invoice_id} className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--warning-border)' }}>
              <div className="px-3 py-2 text-xs" style={{ background: 'var(--warning-bg)', color: 'var(--text)' }}>
                <strong>{invoice.invoice_number}</strong> — {invoice.customer_name}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead><tr style={{ color: 'var(--muted)', borderBottom: '1px solid var(--border)' }}>
                    <th className="text-left p-2">Product</th><th className="text-left p-2">Assigned location</th><th className="text-right p-2">Required</th><th className="text-right p-2">Available</th><th className="text-left p-2">Other stock</th><th className="text-left p-2">Suggested transfer</th>
                  </tr></thead>
                  <tbody>{invoice.issues.map((issue, index) => (
                    <tr key={`${issue.product_code}-${index}`} style={{ borderBottom: '1px solid var(--border-muted)' }}>
                      <td className="p-2"><div style={{ color: 'var(--text)', fontWeight: 600 }}>{issue.product_code}</div><div style={{ color: 'var(--muted)' }}>{issue.item_name}</div></td>
                      <td className="p-2" style={{ color: 'var(--text-2)' }}>{issue.assigned_location}</td>
                      <td className="p-2 text-right" style={{ color: 'var(--text-2)' }}>{issue.required_quantity}</td>
                      <td className="p-2 text-right" style={{ color: 'var(--danger)', fontWeight: 600 }}>{issue.available_quantity}</td>
                      <td className="p-2" style={{ color: 'var(--text-2)' }}>{issue.other_locations.length ? issue.other_locations.map(loc => `${loc.location}: ${loc.available_quantity}`).join(', ') : 'None'}</td>
                      <td className="p-2" style={{ color: issue.suggested_transfers.length ? 'var(--success)' : 'var(--danger)' }}>
                        {issue.suggested_transfers.length ? issue.suggested_transfers.map(move => `${move.quantity} from ${move.from_location}`).join(', ') : `Purchase/receive ${issue.shortage_quantity}`}
                      </td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}

      {data && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead><tr style={{ color: 'var(--muted)', borderBottom: '1px solid var(--border)' }}>
              <th className="text-left py-2">Task</th><th className="text-left py-2">Status</th><th className="text-left py-2">Last successful run</th><th className="text-left py-2">Next expected run</th>
            </tr></thead>
            <tbody>{data.jobs.map(job => (
              <tr key={job.name} style={{ borderBottom: '1px solid var(--border-muted)' }}>
                <td className="py-2.5"><div style={{ color: 'var(--text)' }}>{job.label}</div><div style={{ color: 'var(--muted)' }}>Daily {job.schedule}</div></td>
                <td className="py-2.5"><span style={{ color: job.status === 'healthy' ? 'var(--success)' : job.status === 'pending' ? 'var(--muted)' : 'var(--danger)', fontWeight: 600 }}>{job.status.toUpperCase()}</span></td>
                <td className="py-2.5" style={{ color: 'var(--text-2)' }}>{formatJakarta(job.lastSuccessAt)}</td>
                <td className="py-2.5" style={{ color: 'var(--text-2)' }}>{formatJakarta(job.nextExpectedAt)}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}

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

type AgingPackage = { package_id: string; package_number: string; salesorder_id: string; salesorder_number: string; customer_name: string; status: string; date: string; days_aging: number; tracking_number: string; carrier: string };

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
          ⚠ {packages.length} shipment{packages.length === 1 ? '' : 's'} not delivered
        </h2>
        <button onClick={load} className="text-xs px-2 py-1 rounded-lg" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--muted)' }}>↻</button>
      </div>
      <div className="text-xs mb-2" style={{ color: 'var(--text-2)' }}>
        Dispatched a day or more ago but still not marked Delivered in Zoho — likely stuck in transit.
      </div>
      <div className="space-y-1">
        {packages.map(p => (
          <div key={p.package_id} className="flex items-center justify-between text-xs py-1" style={{ borderTop: '1px solid var(--border)' }}>
            <span>
              <span style={{ fontFamily: 'JetBrains Mono, monospace', color: 'var(--accent-text)', fontWeight: 500 }}>{p.salesorder_number || '—'}</span>
              {' — '}{p.customer_name || '(unnamed)'}
              {' · '}<span style={{ fontFamily: 'JetBrains Mono, monospace' }}>{p.package_number}</span>
              {' · '}{p.status === 'shipped' ? 'shipped, not delivered' : 'never shipped'}
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
        <AutomationHealthPanel />
        <DailyBriefPanel />
      </div>
    </div>
  );
}
