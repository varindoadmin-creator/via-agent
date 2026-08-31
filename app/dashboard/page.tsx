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

type PurchaseGapSO = {
  salesorder_id: string; salesorder_number: string; customer_name: string; total: number;
  confirmed_at: string; sub_status_formatted: string; locations: string[];
  uncovered_items: Array<{ item_name: string; sku: string; required_quantity: number; stock_on_hand: number; location_name: string }>;
};

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
type DuplicateCustomer = { contact_id: string; contact_name: string; company_name: string; email: string; phone: string; mobile: string; npwp: string; status: string };
type DuplicateGroup = { key: string; reasons: string[]; customers: DuplicateCustomer[] };

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

function DuplicateCustomerReview() {
  const [scan, setScan] = useState<{ scanned_at: string; total_customers: number; group_count: number; duplicate_customer_count: number; groups: DuplicateGroup[] } | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    setError('');
    try {
      const response = await fetch('/api/customers/duplicates/scan', { cache: 'no-store' });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || 'Could not load the duplicate scan.');
      setScan(result.scan);
      setSelected(new Set());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function runNow() {
    setRunning(true); setError('');
    try {
      const response = await fetch('/api/customers/duplicates/scan', { method: 'POST' });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || 'Duplicate scan failed.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  }

  async function ignoreSelected() {
    if (!scan || selected.size === 0) return;
    setRunning(true); setError('');
    try {
      for (const group of scan.groups.filter(candidate => selected.has(candidate.key))) {
        const response = await fetch('/api/customers/duplicates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'ignore', contact_ids: group.customers.map(customer => customer.contact_id) }),
        });
        const result = await response.json();
        if (!response.ok || !result.success) throw new Error(result.error || 'Could not ignore the selected group.');
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  }

  return (
    <div style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 12, padding: 18, marginBottom: 20 }}>
      <div className="flex items-center justify-between gap-4 mb-3">
        <div>
          <h2 className="text-[var(--text)] font-semibold text-sm">Duplicate Customer Review</h2>
          <div className="text-[var(--muted)] text-xs mt-1">
            {scan ? `${scan.group_count} possible group${scan.group_count === 1 ? '' : 's'} from ${scan.total_customers} active customers · scanned ${formatJakarta(scan.scanned_at)}` : 'Daily scan scheduled for 09:35 Jakarta time'}
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={ignoreSelected} disabled={running || selected.size === 0} className="via-btn via-btn-secondary !text-xs disabled:opacity-40">Ignore selected{selected.size ? ` (${selected.size})` : ''}</button>
          <button onClick={runNow} disabled={running} className="via-btn via-btn-secondary !text-xs disabled:opacity-40">{running ? 'Working…' : 'Run now'}</button>
        </div>
      </div>
      {error && <div className="rounded-lg p-3 text-xs mb-3" style={{ background: 'var(--danger-bg)', color: 'var(--danger)' }}>{error}</div>}
      {loading && <div className="text-xs py-3" style={{ color: 'var(--muted)' }}>Loading latest scan…</div>}
      {!loading && !scan && !error && <div className="text-xs py-3" style={{ color: 'var(--muted)' }}>No completed scan yet. Use Run now, or wait for the scheduled scan.</div>}
      {scan && scan.groups.length === 0 && <div className="rounded-lg p-3 text-xs" style={{ background: 'var(--success-bg)', color: 'var(--success)' }}>✓ No unreviewed duplicate customers in the latest scan.</div>}
      {scan && scan.groups.length > 0 && (
        <div className="space-y-2">
          {scan.groups.map(group => (
            <label key={group.key} className="flex items-start gap-3 rounded-lg p-3 cursor-pointer" style={{ border: '1px solid var(--border)', background: selected.has(group.key) ? 'var(--surface-2)' : 'transparent' }}>
              <input type="checkbox" className="mt-0.5" checked={selected.has(group.key)} onChange={event => setSelected(previous => { const next = new Set(previous); if (event.target.checked) next.add(group.key); else next.delete(group.key); return next; })} />
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-medium" style={{ color: 'var(--text)' }}>{group.customers.map(customer => customer.company_name || customer.contact_name || '(unnamed)').join(' ↔ ')}</span>
                <span className="block text-[11px] mt-1" style={{ color: 'var(--muted)' }}>{group.reasons.join(' · ')}</span>
              </span>
            </label>
          ))}
          <div className="text-[11px]" style={{ color: 'var(--muted)' }}>Ignoring only hides a confirmed false positive from future checks. It does not change or delete Zoho customer data.</div>
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
          ⚠ {gaps.length} Confirmed SO{gaps.length === 1 ? '' : 's'} without stock or PO coverage
        </h2>
        <button onClick={load} className="text-xs px-2 py-1 rounded-lg" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--muted)' }}>↻</button>
      </div>
      <div className="text-xs mb-2" style={{ color: 'var(--text-2)' }}>
        Checks all confirmed Sales Orders, regardless of date. Only items that are neither Ordered nor Stock Ready at the assigned HUB are shown.
      </div>
      <div className="space-y-1">
        {gaps.map(g => (
          <div key={g.salesorder_id} className="flex items-center justify-between text-xs py-1" style={{ borderTop: '1px solid var(--border)' }}>
            <span>
              <span style={{ fontFamily: 'JetBrains Mono, monospace', color: 'var(--accent-text)', fontWeight: 500 }}>{g.salesorder_number}</span>
              {' — '}{g.customer_name || '(unnamed)'}
            </span>
            <span style={{ color: 'var(--muted)' }}>
              {g.locations?.join(', ') || 'HUB not assigned'} · {g.uncovered_items?.map(item => `${item.sku || item.item_name}: need ${item.required_quantity}, stock ${item.stock_on_hand}`).join('; ') || g.sub_status_formatted}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function AutomatedTaskGroup<T>({
  taskKey, label, days, expanded, toggle, getItems, renderItem,
}: {
  taskKey: string; label: string; days: DailyBriefDay[]; expanded: Set<string>; toggle: (key: string) => void;
  getItems: (day: DailyBriefDay) => T[]; renderItem: (item: T) => React.ReactNode;
}) {
  const count = days.reduce((sum, day) => sum + getItems(day).length, 0);
  if (count === 0) return null;
  const isOpen = expanded.has(taskKey);
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
      <button onClick={() => toggle(taskKey)} className="w-full flex items-center justify-between px-3 py-2" style={{ background: 'var(--surface-2)' }}>
        <span className="text-[var(--text)] text-xs font-medium">{label}</span>
        <span className="text-[var(--muted)] text-xs" style={{ fontFamily: 'JetBrains Mono, monospace' }}>{count} action{count === 1 ? '' : 's'} {isOpen ? '▲' : '▼'}</span>
      </button>
      {isOpen && (
        <div style={{ borderTop: '1px solid var(--border)' }}>
          {days.map(day => {
            const items = getItems(day);
            if (items.length === 0) return null;
            return (
              <div key={`${taskKey}-${day.date}`}>
                <div className="px-3 py-1.5 text-[11px] uppercase tracking-wide" style={{ color: 'var(--text-4)', background: 'var(--surface-1)', borderBottom: '1px solid var(--border-muted)' }}>{day.label}</div>
                <div className="divide-y">{items.map((item, index) => <div key={index}>{renderItem(item)}</div>)}</div>
              </div>
            );
          })}
        </div>
      )}
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
      setExpanded(prev => (prev.size ? prev : new Set(['customer-repair'])));
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

  function toggle(key: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  return (
    <div style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 12, padding: 18, marginBottom: 20 }}>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-[var(--text)] font-semibold text-sm">Automated Task Activity</h2>
          <div className="text-[var(--muted)] text-xs mt-1">Grouped by task · activity from the last 14 days</div>
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
          <AutomatedTaskGroup taskKey="customer-repair" label="Customer Data Repairs" days={days} expanded={expanded} toggle={toggle} getItems={day => day.customers} renderItem={c => (
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
          )} />
          <AutomatedTaskGroup taskKey="shipment-invoice" label="Shipments Converted to Invoice" days={days} expanded={expanded} toggle={toggle} getItems={day => day.invoices} renderItem={inv => (
                        <div key={inv.salesorder_id} className="px-3 py-2">
                          <div className="text-[var(--text)] text-xs font-medium">{inv.customer_name || '(unnamed)'}</div>
                          <div className="text-[var(--muted)] text-xs mt-1">
                            <span style={{ fontFamily: 'JetBrains Mono, monospace' }}>{inv.salesorder_number}</span> converted to invoice
                            {inv.invoice_number && <> — <span style={{ color: 'var(--success)', fontFamily: 'JetBrains Mono, monospace' }}>{inv.invoice_number}</span></>}
                          </div>
                        </div>
          )} />
          <AutomatedTaskGroup taskKey="invoice-sent" label="Invoices Marked as Sent" days={days} expanded={expanded} toggle={toggle} getItems={day => day.sentInvoices} renderItem={inv => (
                        <div key={inv.invoice_id} className="px-3 py-2">
                          <div className="text-[var(--text)] text-xs font-medium">{inv.customer_name || '(unnamed)'}</div>
                          <div className="text-[var(--muted)] text-xs mt-1">
                            Invoice <span style={{ color: 'var(--success)', fontFamily: 'JetBrains Mono, monospace' }}>{inv.invoice_number}</span> marked as sent
                          </div>
                        </div>
          )} />
          <AutomatedTaskGroup taskKey="price-list" label="Price List Additions" days={days} expanded={expanded} toggle={toggle} getItems={day => day.priceListItems} renderItem={item => (
                        <div key={item.item_id} className="px-3 py-2">
                          <div className="text-[var(--text)] text-xs font-medium">{item.item_name}</div>
                          <div className="text-[var(--muted)] text-xs mt-1">
                            Added to Price Lists — <span style={{ color: 'var(--success)' }}>{item.tiers.join(', ')}</span>
                          </div>
                        </div>
          )} />
          <AutomatedTaskGroup taskKey="salesperson" label="Salesperson Auto-Assignments" days={days} expanded={expanded} toggle={toggle} getItems={day => day.salespersonAssignments} renderItem={s => (
                        <div key={s.document_type + s.document_id} className="px-3 py-2">
                          <div className="text-[var(--text)] text-xs font-medium">{s.customer_name || '(unnamed)'}</div>
                          <div className="text-[var(--muted)] text-xs mt-1">
                            {s.document_type === 'sales_order' ? 'Sales Order' : 'Invoice'} <span style={{ fontFamily: 'JetBrains Mono, monospace' }}>{s.document_number}</span> assigned to{' '}
                            <span style={{ color: 'var(--success)' }}>{s.salesperson_name}</span>
                          </div>
                        </div>
          )} />
          <AutomatedTaskGroup taskKey="so-approval" label="Sales Orders Approved" days={days} expanded={expanded} toggle={toggle} getItems={day => day.soApprovals} renderItem={a => (
                        <div key={a.salesorder_id} className="px-3 py-2">
                          <div className="text-[var(--text)] text-xs font-medium">{a.customer_name || '(unnamed)'}</div>
                          <div className="text-[var(--muted)] text-xs mt-1">
                            <span style={{ fontFamily: 'JetBrains Mono, monospace' }}>{a.salesorder_number}</span> — {a.item_count} item{a.item_count === 1 ? '' : 's'}, {formatRp(a.total)} — approved by {a.approved_by}
                          </div>
                        </div>
          )} />
          <AutomatedTaskGroup taskKey="po-approval" label="Purchase Orders Approved" days={days} expanded={expanded} toggle={toggle} getItems={day => day.poApprovals} renderItem={a => (
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
          )} />
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

type OperationalBriefFinding = { id: string; severity: string; title: string; category: string };

/** Brief section 142: a small sibling to AutomationHealthPanel, not a new home page. Renders nothing when OPERATIONAL_FINDINGS_UI_ENABLED is off. */
function OperationalIntelligenceWidget() {
  const [data, setData] = useState<{ enabled: boolean; topFindings?: OperationalBriefFinding[]; topOpportunity?: OperationalBriefFinding | null; totalOpenCount?: number } | null>(null);

  useEffect(() => {
    fetch('/api/requests/wati/operational-findings/brief', { cache: 'no-store' })
      .then(r => r.json())
      .then(body => { if (body.success) setData(body); })
      .catch(() => undefined);
  }, []);

  if (!data?.enabled) return null;
  const highOrCritical = (data.topFindings ?? []).filter(f => f.severity === 'HIGH' || f.severity === 'CRITICAL');
  const medium = (data.topFindings ?? []).filter(f => f.severity === 'MEDIUM');

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 mb-5">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-[var(--text)] font-semibold text-sm">Jarvis — Needs Your Attention</h2>
        <a href="/requests/wati/operational-intelligence" className="text-xs text-[#6161ff] font-medium">View all ({data.totalOpenCount ?? 0}) →</a>
      </div>
      {(data.topFindings ?? []).length === 0 && !data.topOpportunity ? (
        <p className="text-sm text-[var(--text-secondary)]">No open findings need attention right now.</p>
      ) : (
        <div className="space-y-1.5 text-sm">
          {highOrCritical.length > 0 && <p className="text-[var(--text-secondary)]">{highOrCritical.length} High Priority{medium.length > 0 ? `, ${medium.length} Medium Priority` : ''}</p>}
          {data.topFindings?.[0] && <p className="text-[var(--text)]"><span className="font-medium">Top Issue:</span> {data.topFindings[0].title}</p>}
          {data.topOpportunity && <p className="text-[var(--text)]"><span className="font-medium">Top Opportunity:</span> {data.topOpportunity.title}</p>}
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

        <OperationalIntelligenceWidget />
        <PurchaseGapAlert />
        <ShipmentAgingAlert />
        <DuplicateCustomerReview />
        <AutomationHealthPanel />
        <DailyBriefPanel />
      </div>
    </div>
  );
}
