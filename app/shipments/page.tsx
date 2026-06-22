'use client';

import React from 'react';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { SOStockCheckTable } from './stock-check-table';

// ─── Types ────────────────────────────────────────────────────────────────────

interface DraftSO {
  salesorder_id: string;
  salesorder_number: string;
  customer_name: string;
  date: string;
  created_time: string;
  total: number;
  salesperson_name: string;
  location_name: string;
  quantity: number;
}

interface ConfirmedNotReady {
  salesorder_id: string;
  salesorder_number: string;
  customer_name: string;
  date: string;
  confirmed_date: string;
  total: number;
  quantity: number;
  quantity_packed: number;
  quantity_shipped: number;
  delivery_method: string;
  salesperson_name: string;
  location_name: string;
  reason: string;
}

interface PendingPackage {
  package_id: string;
  package_number: string;
  shipment_id: string;
  shipment_number: string;
  shipment_status: string;
  date: string;
  shipment_date: string;
  tracking_number: string;
  carrier: string;
  quantity: number;
}

interface PendingDelivery {
  salesorder_id: string;
  salesorder_number: string;
  customer_name: string;
  so_date: string;
  total: number;
  quantity: number;
  quantity_packed: number;
  delivery_method: string;
  is_full: boolean;
  packages: PendingPackage[];
}

interface DeliveredPackage {
  package_number: string;
  shipment_number: string;
  shipment_status: string;
  delivery_date: string;
}

interface DeliveredNotInvoiced {
  salesorder_id: string;
  salesorder_number: string;
  customer_name: string;
  date: string;
  total: number;
  invoiced_status: string;
  quantity: number;
  delivery_method: string;
  salesperson_name: string;
  all_delivered: boolean;
  delivered_shipments: number;
  total_shipments: number;
  latest_delivery_date: string;
  packages: DeliveredPackage[];
  location_name?: string;
}

interface ConvertResult {
  salesorder_id: string;
  salesorder_number: string;
  success: boolean;
  invoice_number?: string;
  error?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatRp(n: number) {
  return 'Rp ' + Number(n).toLocaleString('id-ID');
}

function agingDays(dateStr: string): number {
  if (!dateStr) return 0;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return 0;
  return Math.floor((Date.now() - d.getTime()) / 86400000);
}

function AgingBadge({ date, label }: { date: string; label?: string }) {
  const days = agingDays(date);
  if (!date) return <span className="text-[var(--text-4)] text-xs">—</span>;
  const color = days >= 14 ? 'var(--danger)'
    : days >= 7  ? 'var(--warning)'
    : days >= 3  ? 'var(--accent-text)'
    : 'var(--text-3)';
  return (
    <div className="flex flex-col items-end gap-0.5">
      <span className="text-xs font-semibold" style={{ fontFamily: 'JetBrains Mono, monospace', color }}>
        {days}d
      </span>
      {label && <span className="text-xs" style={{ color: 'var(--text-4)', fontSize: 10 }}>{label}</span>}
    </div>
  );
}

function StatusBadge({ label, type }: { label: string; type: 'success' | 'warning' | 'info' | 'muted' | 'danger' }) {
  const styles = {
    success: 'bg-[var(--success-bg)] text-[var(--success)] border-[var(--success-border)]',
    warning: 'bg-[var(--warning-bg)] text-[var(--warning)] border-[var(--warning-border)]',
    info:    'bg-[var(--info-bg)] text-[var(--info)] border-[var(--info-border)]',
    muted:   'bg-[var(--surface-3)] text-[var(--text-3)] border-[var(--border)]',
    danger:  'bg-[var(--danger-bg)] text-[var(--danger)] border-[var(--danger-border)]',
  };
  return <span className={'via-badge border text-xs ' + styles[type]}>{label}</span>;
}

function TableShell({ title, desc, count, loading, search, onSearch, extra, children }: {
  title: string; desc: string; count?: number; loading: boolean;
  search?: string; onSearch?: (v: string) => void;
  extra?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <div className="via-card overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
        <div>
          <h2 className="text-[var(--text)] font-semibold text-sm">{title}</h2>
          <p className="text-[var(--text-3)] text-xs mt-0.5">{desc}</p>
        </div>
        <div className="flex items-center gap-3">
          {!loading && count !== undefined && (
            <span className="text-[var(--text-4)] text-xs" style={{ fontFamily: 'JetBrains Mono, monospace' }}>{count} orders</span>
          )}
          {onSearch && (
            <input value={search} onChange={e => onSearch(e.target.value)}
              placeholder="Search…" className="via-input text-xs py-1.5 px-3 w-44" />
          )}
          {extra}
        </div>
      </div>
      {children}
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="p-5 space-y-2">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="flex gap-4 animate-pulse">
          <div className="h-4 bg-[var(--surface-3)] rounded w-28" />
          <div className="h-4 bg-[var(--surface-3)] rounded flex-1" />
          <div className="h-4 bg-[var(--surface-3)] rounded w-20" />
          <div className="h-4 bg-[var(--surface-3)] rounded w-16" />
        </div>
      ))}
    </div>
  );
}

function EmptyState({ icon, msg }: { icon: string; msg: string }) {
  return (
    <div className="flex flex-col items-center py-10">
      <div className="text-3xl mb-2 opacity-20">{icon}</div>
      <div className="text-[var(--text-3)] text-sm">{msg}</div>
    </div>
  );
}

// ─── Table -1: Pending Approval SOs ──────────────────────────────────────────

function PendingApprovalSOTable() {
  const [items, setItems] = useState<DraftSO[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [approving, setApproving] = useState(false);
  const [approveResults, setApproveResults] = useState<{number: string; success: boolean; error?: string}[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [soLineItems, setSoLineItems] = useState<Record<string, Array<{name: string; quantity: number; unit: string; rate: number; item_total: number; location_name: string}>>>({});
  const [loadingLines, setLoadingLines] = useState<Set<string>>(new Set());

  const fetchData = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await fetch('/api/shipments?mode=pending_approval');
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      setItems(data.salesorders || []);
    } catch(e) { setError(String(e)); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return items.filter(i => !q || i.salesorder_number.toLowerCase().includes(q) || i.customer_name.toLowerCase().includes(q));
  }, [items, search]);

  async function toggleExpand(id: string) {
    setExpanded(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
    if (!soLineItems[id]) {
      setLoadingLines(prev => new Set(prev).add(id));
      try {
        const res = await fetch('/api/shipments?mode=so_detail&id=' + id);
        const data = await res.json();
        if (data.line_items) setSoLineItems(prev => ({ ...prev, [id]: data.line_items }));
      } catch { /* ignore */ }
      finally { setLoadingLines(prev => { const n = new Set(prev); n.delete(id); return n; }); }
    }
  }

  async function handleApprove() {
    if (!selected.size) return;
    setApproving(true); setApproveResults([]);
    const results: {number: string; success: boolean; error?: string}[] = [];
    for (const soId of selected) {
      const item = items.find(i => i.salesorder_id === soId);
      try {
        const res = await fetch(`/api/shipments?mode=approve_draft&id=${soId}`);
        const data = await res.json();
        if (!data.success) throw new Error(data.error);
        results.push({ number: item?.salesorder_number || soId, success: true });
      } catch(e) {
        results.push({ number: item?.salesorder_number || soId, success: false, error: String(e) });
      }
    }
    setApproveResults(results);
    setSelected(new Set());
    await fetchData();
    setApproving(false);
  }

  const mono = { fontFamily: 'JetBrains Mono, monospace' };

  return (
    <TableShell title="Pending Approval" desc="SOs submitted for approval — review items and tick to approve"
      count={filtered.length} loading={loading} search={search} onSearch={setSearch}
      extra={selected.size > 0 ? (
        <button onClick={handleApprove} disabled={approving}
          className="px-4 py-1.5 text-xs bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white rounded-lg font-medium transition-colors disabled:opacity-50">
          {approving ? 'Approving…' : `✓ Approve (${selected.size})`}
        </button>
      ) : undefined}>
      {loading && <LoadingSkeleton />}
      {!loading && error && <div className="p-5 text-[var(--danger)] text-sm">{error}</div>}
      {approveResults.length > 0 && (
        <div className="px-5 py-3 border-b border-[var(--border)] space-y-1">
          {approveResults.map((r, i) => (
            <div key={i} className={`text-xs flex gap-2 ${r.success ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>
              <span>{r.success ? '✓' : '✗'}</span>
              <span style={mono} className="font-medium">{r.number}</span>
              <span>{r.success ? 'Approved' : r.error}</span>
            </div>
          ))}
        </div>
      )}
      {!loading && !error && filtered.length === 0 && <EmptyState icon="✓" msg="No SOs pending approval." />}
      {!loading && !error && filtered.length > 0 && (
        <div className="overflow-x-auto">
          <table className="via-table">
            <thead><tr>
              <th className="w-8">
                <input type="checkbox" className="w-3.5 h-3.5 rounded"
                  checked={selected.size === filtered.length && filtered.length > 0}
                  onChange={() => selected.size === filtered.length ? setSelected(new Set()) : setSelected(new Set(filtered.map(i => i.salesorder_id)))} />
              </th>
              <th className="w-8"></th>
              <th>SO Number</th><th>Customer</th><th>Date</th>
              <th className="text-right">Aging</th><th>Location</th>
              <th>Salesperson</th><th className="text-right">Total</th>
            </tr></thead>
            <tbody>
              {filtered.map(item => {
                const exp = expanded.has(item.salesorder_id);
                const ageDays = Math.floor((Date.now() - new Date(item.created_time || item.date).getTime()) / 86400000);
                const ageColor = ageDays >= 7 ? 'var(--danger)' : ageDays >= 3 ? 'var(--warning)' : 'var(--text-4)';
                return (
                  <React.Fragment key={item.salesorder_id}>
                    <tr className={`transition-colors ${selected.has(item.salesorder_id) ? 'bg-[var(--accent-light)]' : 'hover:bg-[var(--surface-2)]'}`}>
                      <td onClick={e => e.stopPropagation()}>
                        <input type="checkbox" className="w-3.5 h-3.5 rounded"
                          checked={selected.has(item.salesorder_id)}
                          onChange={() => setSelected(prev => { const n = new Set(prev); n.has(item.salesorder_id) ? n.delete(item.salesorder_id) : n.add(item.salesorder_id); return n; })} />
                      </td>
                      <td className="text-center text-[var(--text-4)] text-xs select-none cursor-pointer w-8"
                        onClick={() => toggleExpand(item.salesorder_id)}>{exp ? '▾' : '▸'}</td>
                      <td className="text-[var(--accent-text)] text-xs font-medium" style={mono}>{item.salesorder_number}</td>
                      <td className="text-[var(--text)] text-xs font-medium max-w-[160px] truncate" title={item.customer_name}>{item.customer_name}</td>
                      <td className="text-[var(--text-3)] text-xs">{item.date}</td>
                      <td className="text-right"><span style={{ ...mono, fontSize:12, fontWeight:700, color:ageColor }}>{ageDays}d</span></td>
                      <td className="text-[var(--text-3)] text-xs">{item.location_name||'—'}</td>
                      <td className="text-[var(--text-3)] text-xs">{item.salesperson_name||'—'}</td>
                      <td className="text-right text-[var(--text-2)] text-xs" style={mono}>{formatRp(item.total)}</td>
                    </tr>
                    {exp && (
                      <tr><td colSpan={9} className="p-0">
                        <div className="bg-[var(--surface-2)] px-6 py-4">
                          <div className="text-[var(--text-4)] text-xs uppercase tracking-wider mb-2" style={mono}>Items</div>
                          {loadingLines.has(item.salesorder_id) ? <div className="text-[var(--text-4)] text-xs animate-pulse">Loading…</div>
                            : soLineItems[item.salesorder_id]
                              ? <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                                  <thead><tr style={{ borderBottom:'1px solid var(--border)' }}>
                                    {['Item','SKU','Location','Qty','Rate','Total'].map((h,i) => (
                                      <th key={i} style={{ padding:'4px 10px', textAlign:i>=3?'right':'left', color:'var(--text-4)', fontWeight:500, fontSize:10, textTransform:'uppercase' }}>{h}</th>
                                    ))}
                                  </tr></thead>
                                  <tbody>
                                    {soLineItems[item.salesorder_id].map((li,i) => (
                                      <tr key={i} style={{ borderBottom:'1px solid var(--border-muted)' }}>
                                        <td style={{ padding:'6px 10px', color:'var(--text)', maxWidth:260, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }} title={li.name}>{li.name}</td>
                                        <td style={{ padding:'6px 10px', color:'var(--text-3)', fontSize:11, ...mono }}>{(li as Record<string,unknown>).sku as string||'—'}</td>
                                        <td style={{ padding:'6px 10px', color:'var(--text-3)', fontSize:11 }}>{li.location_name||'—'}</td>
                                        <td style={{ padding:'6px 10px', textAlign:'right', ...mono, color:'var(--text-2)' }}>{li.quantity} {li.unit}</td>
                                        <td style={{ padding:'6px 10px', textAlign:'right', ...mono, color:'var(--text-3)' }}>{formatRp((li as Record<string,unknown>).rate as number||0)}</td>
                                        <td style={{ padding:'6px 10px', textAlign:'right', ...mono, color:'var(--text-2)', fontWeight:600 }}>{formatRp((li as Record<string,unknown>).item_total as number||0)}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                  <tfoot style={{ borderTop:'1px solid var(--border)', background:'var(--surface-3)' }}>
                                    <tr><td colSpan={5} style={{ padding:'6px 10px', color:'var(--text-3)', fontSize:11, ...mono }}>SUBTOTAL</td>
                                      <td style={{ padding:'6px 10px', textAlign:'right', ...mono, color:'var(--text)', fontWeight:700 }}>{formatRp(item.total)}</td>
                                    </tr>
                                  </tfoot>
                                </table>
                              : <div className="text-[var(--text-4)] text-xs animate-pulse">Loading…</div>}
                        </div>
                      </td></tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
            <tfoot style={{ borderTop:'1px solid var(--border)', background:'var(--surface-2)' }}>
              <tr>
                <td colSpan={8} style={{ padding:'7px 12px', color:'var(--text-3)', fontSize:11, ...mono }}>TOTAL ({filtered.length} SOs)</td>
                <td style={{ padding:'7px 12px', textAlign:'right', ...mono, color:'var(--text)', fontWeight:700 }}>{formatRp(filtered.reduce((s,i)=>s+i.total,0))}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </TableShell>
  );
}

// ─── Table 0: Draft ─────────────────────────────────────────────

function DraftSOTable() {
  const [items, setItems] = useState<DraftSO[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [approving, setApproving] = useState(false);
  const [approveResults, setApproveResults] = useState<{number: string; success: boolean; error?: string}[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [soLineItems, setSoLineItems] = useState<Record<string, Array<{name: string; quantity: number; unit: string; rate: number; item_total: number; location_name: string}>>>({});
  const [loadingLines, setLoadingLines] = useState<Set<string>>(new Set());

  const fetchData = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await fetch('/api/shipments?mode=drafts');
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      setItems(data.salesorders || []);
    } catch(e) { setError(String(e)); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return items.filter(i => !q || i.salesorder_number.toLowerCase().includes(q) || i.customer_name.toLowerCase().includes(q));
  }, [items, search]);

  async function toggleExpand(id: string, soId: string) {
    setExpanded(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
    if (!soLineItems[id]) {
      setLoadingLines(prev => new Set(prev).add(id));
      try {
        const res = await fetch('/api/shipments?mode=so_detail&id=' + soId);
        const data = await res.json();
        if (data.line_items) setSoLineItems(prev => ({ ...prev, [id]: data.line_items }));
      } catch { /* ignore */ }
      finally { setLoadingLines(prev => { const n = new Set(prev); n.delete(id); return n; }); }
    }
  }

  function toggleSelect(id: string) {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  async function handleApprove() {
    if (!selected.size) return;
    setApproving(true); setApproveResults([]);
    const results: {number: string; success: boolean; error?: string}[] = [];
    for (const soId of selected) {
      const item = items.find(i => i.salesorder_id === soId);
      try {
        const res = await fetch(`/api/shipments?mode=approve_draft&id=${soId}`);
        const data = await res.json();
        if (!data.success) throw new Error(data.error);
        results.push({ number: item?.salesorder_number || soId, success: true });
      } catch(e) {
        results.push({ number: item?.salesorder_number || soId, success: false, error: String(e) });
      }
    }
    setApproveResults(results);
    setSelected(new Set());
    await fetchData();
    setApproving(false);
  }

  const mono = { fontFamily: 'JetBrains Mono, monospace' };

  return (
    <TableShell title="Draft" desc="Draft SOs awaiting approval — tick to approve"
      count={filtered.length} loading={loading} search={search} onSearch={setSearch}
      extra={selected.size > 0 ? (
        <button onClick={handleApprove} disabled={approving}
          className="px-4 py-1.5 text-xs bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white rounded-lg font-medium transition-colors disabled:opacity-50">
          {approving ? 'Approving…' : `✓ Approve (${selected.size})`}
        </button>
      ) : undefined}>

      {loading && <LoadingSkeleton />}
      {!loading && error && <div className="p-5 text-[var(--danger)] text-sm">{error}</div>}

      {approveResults.length > 0 && (
        <div className="px-5 py-3 border-b border-[var(--border)] space-y-1">
          {approveResults.map((r, i) => (
            <div key={i} className={`text-xs flex gap-2 ${r.success ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>
              <span>{r.success ? '✓' : '✗'}</span>
              <span style={mono} className="font-medium">{r.number}</span>
              <span>{r.success ? 'Approved' : r.error}</span>
            </div>
          ))}
        </div>
      )}

      {!loading && !error && filtered.length === 0 && <EmptyState icon="✓" msg="No draft sales orders." />}
      {!loading && !error && filtered.length > 0 && (
        <div className="overflow-x-auto">
          <table className="via-table">
            <thead><tr>
              <th className="w-8">
                <input type="checkbox" className="w-3.5 h-3.5 rounded"
                  checked={selected.size === filtered.length && filtered.length > 0}
                  onChange={() => {
                    if (selected.size === filtered.length) setSelected(new Set());
                    else setSelected(new Set(filtered.map(i => i.salesorder_id)));
                  }} />
              </th>
              <th className="w-8"></th>
              <th>SO Number</th>
              <th>Customer</th>
              <th>Date</th>
              <th className="text-right">Aging</th>
              <th>Location</th>
              <th>Salesperson</th>
              <th className="text-right">Total</th>
            </tr></thead>
            <tbody>
              {filtered.map(item => {
                const exp = expanded.has(item.salesorder_id);
                const ageDays = Math.floor((Date.now() - new Date(item.created_time || item.date).getTime()) / 86400000);
                const ageColor = ageDays >= 7 ? 'var(--danger)' : ageDays >= 3 ? 'var(--warning)' : 'var(--text-4)';
                return (
                  <React.Fragment key={item.salesorder_id}>
                    <tr className={`transition-colors ${selected.has(item.salesorder_id) ? 'bg-[var(--accent-light)]' : 'hover:bg-[var(--surface-2)]'}`}>
                      <td onClick={e => e.stopPropagation()}>
                        <input type="checkbox" className="w-3.5 h-3.5 rounded"
                          checked={selected.has(item.salesorder_id)}
                          onChange={() => toggleSelect(item.salesorder_id)} />
                      </td>
                      <td className="text-center text-[var(--text-4)] text-xs select-none cursor-pointer w-8"
                        onClick={() => toggleExpand(item.salesorder_id, item.salesorder_id)}>
                        {exp ? '▾' : '▸'}
                      </td>
                      <td className="text-[var(--accent-text)] text-xs font-medium" style={mono}>{item.salesorder_number}</td>
                      <td className="text-[var(--text)] text-xs font-medium max-w-[160px] truncate" title={item.customer_name}>{item.customer_name}</td>
                      <td className="text-[var(--text-3)] text-xs">{item.date}</td>
                      <td className="text-right">
                        <span style={{ ...mono, fontSize: 12, fontWeight: 700, color: ageColor }}>{ageDays}d</span>
                      </td>
                      <td className="text-[var(--text-3)] text-xs">{item.location_name || '—'}</td>
                      <td className="text-[var(--text-3)] text-xs">{item.salesperson_name || '—'}</td>
                      <td className="text-right text-[var(--text-2)] text-xs" style={mono}>{formatRp(item.total)}</td>
                    </tr>
                    {exp && (
                      <tr>
                        <td colSpan={9} className="p-0">
                          <div className="bg-[var(--surface-2)] px-6 py-4">
                            <div className="text-[var(--text-4)] text-xs uppercase tracking-wider mb-2" style={mono}>Items</div>
                            {loadingLines.has(item.salesorder_id) ? (
                              <div className="text-[var(--text-4)] text-xs animate-pulse">Loading…</div>
                            ) : soLineItems[item.salesorder_id] ? (
                              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                                <thead>
                                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                                    {['Item', 'SKU', 'Location', 'Qty', 'Rate', 'Total'].map((h, i) => (
                                      <th key={i} style={{ padding: '4px 10px', textAlign: i >= 3 ? 'right' : 'left',
                                        color: 'var(--text-4)', fontWeight: 500, fontSize: 10, textTransform: 'uppercase' }}>{h}</th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {soLineItems[item.salesorder_id].map((li, i) => (
                                    <tr key={i} style={{ borderBottom: '1px solid var(--border-muted)' }}>
                                      <td style={{ padding: '6px 10px', color: 'var(--text)', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={li.name}>{li.name}</td>
                                      <td style={{ padding: '6px 10px', color: 'var(--text-3)', fontSize: 11, ...mono }}>{(li as Record<string, unknown>).sku as string || '—'}</td>
                                      <td style={{ padding: '6px 10px', color: 'var(--text-3)', fontSize: 11 }}>{li.location_name || '—'}</td>
                                      <td style={{ padding: '6px 10px', textAlign: 'right', ...mono, color: 'var(--text-2)' }}>{li.quantity} {li.unit}</td>
                                      <td style={{ padding: '6px 10px', textAlign: 'right', ...mono, color: 'var(--text-3)' }}>
                                        {formatRp((li as Record<string, unknown>).rate as number || 0)}
                                      </td>
                                      <td style={{ padding: '6px 10px', textAlign: 'right', ...mono, color: 'var(--text-2)', fontWeight: 600 }}>
                                        {formatRp((li as Record<string, unknown>).item_total as number || 0)}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                                <tfoot style={{ borderTop: '1px solid var(--border)', background: 'var(--surface-3)' }}>
                                  <tr>
                                    <td colSpan={5} style={{ padding: '6px 10px', color: 'var(--text-3)', fontSize: 11, ...mono }}>SUBTOTAL</td>
                                    <td style={{ padding: '6px 10px', textAlign: 'right', ...mono, color: 'var(--text)', fontWeight: 700 }}>
                                      {formatRp(item.total)}
                                    </td>
                                  </tr>
                                </tfoot>
                              </table>
                            ) : <div className="text-[var(--text-4)] text-xs animate-pulse">Loading…</div>}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
            <tfoot style={{ borderTop: '1px solid var(--border)', background: 'var(--surface-2)' }}>
              <tr>
                <td colSpan={8} style={{ padding: '7px 12px', color: 'var(--text-3)', fontSize: 11, fontFamily: 'JetBrains Mono, monospace' }}>
                  TOTAL ({filtered.length} drafts)
                </td>
                <td style={{ padding: '7px 12px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace', color: 'var(--text)', fontWeight: 700 }}>
                  {formatRp(filtered.reduce((s, i) => s + i.total, 0))}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </TableShell>
  );
}

// ─── Table 1: Confirmed Not Ready ─────────────────────────────────────────────

function NotReadyTable({ items, loading, error }: { items: ConfirmedNotReady[]; loading: boolean; error: string }) {
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [soLineItems, setSoLineItems] = useState<Record<string, Array<{name: string; quantity: number; unit: string; quantity_packed: number}>>>({});
  const [loadingLines, setLoadingLines] = useState<Set<string>>(new Set());

  async function toggleExpand(id: string) {
    setExpanded(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
    if (!soLineItems[id]) {
      setLoadingLines(prev => new Set(prev).add(id));
      try {
        const res = await fetch('/api/shipments?mode=so_detail&id=' + id);
        const data = await res.json();
        if (data.line_items) setSoLineItems(prev => ({ ...prev, [id]: data.line_items }));
      } catch { /* ignore */ }
      finally { setLoadingLines(prev => { const n = new Set(prev); n.delete(id); return n; }); }
    }
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return items.filter(i =>
      !q || i.salesorder_number.toLowerCase().includes(q) || i.customer_name.toLowerCase().includes(q)
    );
  }, [items, search]);

  return (
    <TableShell title="Confirmed — Not Packaged" desc="Confirmed SOs not yet packaged"
      count={filtered.length} loading={loading} search={search} onSearch={setSearch}>
      {loading && <LoadingSkeleton />}
      {!loading && error && <div className="p-5 text-[var(--danger)] text-sm">{error}</div>}
      {!loading && !error && filtered.length === 0 && <EmptyState icon="✓" msg="All confirmed orders have packages." />}
      {!loading && !error && filtered.length > 0 && (
        <div className="overflow-x-auto">
          <table className="via-table">
            <thead><tr>
              <th className="w-8"></th>
              <th>SO Number</th>
              <th>Customer</th>
              <th>SO Date</th>
              <th className="text-right">Aging</th>
              <th>Status</th>
              <th className="text-right">Qty</th>
              <th className="text-right">Packed</th>
              <th className="text-right">Total</th>
              <th>Location</th>
            </tr></thead>
            <tbody>
              {filtered.map(item => {
                const exp = expanded.has(item.salesorder_id);
                return (
                <React.Fragment key={item.salesorder_id}>
                <tr className="cursor-pointer hover:bg-[var(--surface-2)] transition-colors"
                  onClick={() => toggleExpand(item.salesorder_id)}>
                  <td className="text-center text-[var(--text-4)] text-xs select-none w-8">{exp ? '▾' : '▸'}</td>
                  <td className="text-[var(--accent-text)] text-xs" style={{ fontFamily: 'JetBrains Mono, monospace' }}>{item.salesorder_number}</td>
                  <td className="text-[var(--text)] text-xs font-medium max-w-[160px] truncate" title={item.customer_name}>{item.customer_name}</td>
                  <td className="text-[var(--text-3)] text-xs">{item.date}</td>
                  <td className="text-right"><AgingBadge date={item.confirmed_date || item.date} label="since confirmed" /></td>
                  <td>
                    {item.reason === 'no_package'
                      ? <StatusBadge label="No Package" type="muted" />
                      : <StatusBadge label="Partial Packed" type="warning" />}
                  </td>
                  <td className="text-right text-[var(--text-2)] text-xs" style={{ fontFamily: 'JetBrains Mono, monospace' }}>{item.quantity}</td>
                  <td className="text-right text-xs" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                    <span className={item.quantity_packed > 0 ? 'text-[var(--warning)]' : 'text-[var(--text-4)]'}>
                      {item.quantity_packed}
                    </span>
                  </td>
                  <td className="text-right text-[var(--text-2)] text-xs" style={{ fontFamily: 'JetBrains Mono, monospace' }}>{formatRp(item.total)}</td>
                  <td className="text-[var(--text-3)] text-xs">{item.location_name || '—'}</td>
                </tr>
                {exp && (
                  <tr key={item.salesorder_id + '_detail'}>
                    <td colSpan={10} className="p-0">
                      <div className="bg-[var(--surface-2)] px-6 py-4">
                        <div className="text-[var(--text-4)] text-xs uppercase tracking-wider mb-2" style={{ fontFamily: 'JetBrains Mono, monospace' }}>Items</div>
                        {loadingLines.has(item.salesorder_id) ? (
                          <div className="text-[var(--text-4)] text-xs">Loading…</div>
                        ) : soLineItems[item.salesorder_id] ? (
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                            <thead>
                              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                                {['Item', 'SO Qty', 'Packed', 'Status'].map((h, i) => (
                                  <th key={i} style={{ padding: '4px 10px', textAlign: i >= 1 ? 'right' : 'left',
                                    color: 'var(--text-4)', fontWeight: 500, fontSize: 10, textTransform: 'uppercase' }}>{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {soLineItems[item.salesorder_id].map((li, i) => {
                                const packed = li.quantity_packed >= li.quantity;
                                return (
                                  <tr key={i} style={{ borderBottom: '1px solid var(--border-muted)' }}>
                                    <td style={{ padding: '6px 10px', color: 'var(--text)', maxWidth: 300,
                                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={li.name}>{li.name}</td>
                                    <td style={{ padding: '6px 10px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace', color: 'var(--text-3)' }}>{li.quantity} {li.unit}</td>
                                    <td style={{ padding: '6px 10px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace',
                                      color: li.quantity_packed > 0 ? 'var(--warning)' : 'var(--text-4)', fontWeight: 600 }}>{li.quantity_packed}</td>
                                    <td style={{ padding: '6px 10px', textAlign: 'right', fontSize: 11, fontWeight: 600 }}>
                                      {li.quantity_packed === 0
                                        ? <span style={{ color: 'var(--text-4)' }}>Not Packed</span>
                                        : packed
                                          ? <span style={{ color: 'var(--success)' }}>✓ Packed</span>
                                          : <span style={{ color: 'var(--warning)' }}>⚠ Partial ({li.quantity_packed}/{li.quantity})</span>}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        ) : <div className="text-[var(--text-4)] text-xs animate-pulse">Loading…</div>}
                      </div>
                    </td>
                  </tr>
                )}
                </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </TableShell>
  );
}

// ─── Table 2: Shipment In-Transit ────────────────────────────────────────────────

function PendingDeliveryTable({ items, loading, error }: { items: PendingDelivery[]; loading: boolean; error: string }) {
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [soLineItems, setSoLineItems] = useState<Record<string, Array<{name: string; quantity: number; unit: string; quantity_packed: number}>>>({});
  const [loadingLines, setLoadingLines] = useState<Set<string>>(new Set());

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return items.filter(i =>
      !q || i.salesorder_number.toLowerCase().includes(q) || i.customer_name.toLowerCase().includes(q)
    );
  }, [items, search]);

  async function toggleExpand(id: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
    // Fetch line items if not already loaded
    if (!soLineItems[id]) {
      setLoadingLines(prev => new Set(prev).add(id));
      try {
        const res = await fetch('/api/shipments?mode=so_detail&id=' + id);
        const data = await res.json();
        if (data.line_items) {
          setSoLineItems(prev => ({ ...prev, [id]: data.line_items }));
        }
      } catch { /* ignore */ }
      finally {
        setLoadingLines(prev => { const n = new Set(prev); n.delete(id); return n; });
      }
    }
  }

  return (
    <TableShell title="Shipment In-Transit" desc="SOs with active shipments in transit"
      count={filtered.length} loading={loading} search={search} onSearch={setSearch}>
      {loading && <LoadingSkeleton />}
      {!loading && error && <div className="p-5 text-[var(--danger)] text-sm">{error}</div>}
      {!loading && !error && filtered.length === 0 && <EmptyState icon="▤" msg="No pending deliveries." />}
      {!loading && !error && filtered.length > 0 && (
        <div className="overflow-x-auto">
          <table className="via-table">
            <thead><tr>
              <th className="w-8"></th>
              <th>SO Number</th>
              <th>Customer</th>
              <th>SO Date</th>
              <th>Shipment</th>
              <th className="text-right">Aging</th>
              <th className="text-right">Qty</th>
              <th className="text-right">Packed</th>
              <th>Courier</th>
              <th>Status</th>
            </tr></thead>
            <tbody>
              {filtered.map(item => {
                const exp = expanded.has(item.salesorder_id);
                const hasMultiple = item.packages.length > 1;
                return (
                  <React.Fragment key={item.salesorder_id}>
                    <tr
                      className="cursor-pointer hover:bg-[var(--surface-2)] transition-colors"
                      onClick={() => toggleExpand(item.salesorder_id)}>
                      <td className="text-center text-[var(--text-4)] text-xs select-none w-8">
                        {exp ? '▾' : '▸'}
                      </td>
                      <td className="text-[var(--accent-text)] text-xs" style={{ fontFamily: 'JetBrains Mono, monospace' }}>{item.salesorder_number}</td>
                      <td className="text-[var(--text)] text-xs font-medium max-w-[150px] truncate" title={item.customer_name}>{item.customer_name}</td>
                      <td className="text-[var(--text-3)] text-xs">{item.so_date}</td>
                      <td className="text-xs" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                        {item.packages.length === 1 ? (
                          <div>
                            <div className="text-[var(--text-2)]">{item.packages[0].shipment_number || item.packages[0].package_number}</div>
                            {item.packages[0].shipment_date && <div className="text-[var(--text-4)] text-xs">{item.packages[0].shipment_date}</div>}
                          </div>
                        ) : (
                          <span className="text-[var(--text-3)]">{item.packages.length} shipments</span>
                        )}
                      </td>
                      <td className="text-right">
                        <AgingBadge
                          date={item.packages[0]?.shipment_date || item.packages[0]?.date || item.so_date}
                          label="in transit"
                        />
                      </td>
                      <td className="text-right text-[var(--text-2)] text-xs" style={{ fontFamily: 'JetBrains Mono, monospace' }}>{item.quantity}</td>
                      <td className="text-right text-xs" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                        <span className={item.quantity_packed >= item.quantity ? 'text-[var(--success)]' : 'text-[var(--warning)]'}>
                          {item.quantity_packed}
                        </span>
                      </td>
                      <td className="text-[var(--text-3)] text-xs">
                        {item.packages[0]?.carrier || item.delivery_method || '—'}
                      </td>
                      <td>
                        {item.is_full
                          ? <StatusBadge label="Full" type="info" />
                          : <StatusBadge label="Partial" type="warning" />}
                      </td>
                    </tr>
                    {exp && (
                      <tr key={item.salesorder_id + '_detail'}>
                        <td colSpan={10} className="p-0">
                          <div className="bg-[var(--surface-2)] px-6 py-4">
                            {/* Packages */}
                            <div className="text-[var(--text-4)] text-xs uppercase tracking-wider mb-2" style={{ fontFamily: 'JetBrains Mono, monospace' }}>Shipments</div>
                            <div className="flex gap-3 mb-4 flex-wrap">
                              {item.packages.map((pkg, pi) => (
                                <div key={pi} className="flex items-center gap-2 text-xs px-3 py-1.5 bg-[var(--surface-3)] rounded-lg border border-[var(--border)]">
                                  <span style={{ color: pkg.shipment_status === 'shipped' ? 'var(--info)' : 'var(--text-4)' }}>
                                    {pkg.shipment_status === 'shipped' ? '🚚' : '📦'}
                                  </span>
                                  <span style={{ fontFamily: 'JetBrains Mono, monospace' }} className="text-[var(--text-2)]">
                                    {pkg.shipment_number || pkg.package_number}
                                  </span>
                                  {pkg.shipment_date && <span className="text-[var(--text-4)]">{pkg.shipment_date}</span>}
                                  <StatusBadge
                                    label={pkg.shipment_status === 'shipped' ? 'Shipped' : 'Not Shipped'}
                                    type={pkg.shipment_status === 'shipped' ? 'info' : 'muted'} />
                                </div>
                              ))}
                            </div>
                            {/* Line items */}
                            <div className="text-[var(--text-4)] text-xs uppercase tracking-wider mb-2" style={{ fontFamily: 'JetBrains Mono, monospace' }}>Items</div>
                            {loadingLines.has(item.salesorder_id) ? (
                              <div className="text-[var(--text-4)] text-xs">Loading items…</div>
                            ) : soLineItems[item.salesorder_id] ? (
                              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                                <thead>
                                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                                    {['Item', 'SO Qty', 'Packed', 'Status'].map((h, i) => (
                                      <th key={i} style={{ padding: '4px 10px', textAlign: i >= 1 ? 'right' : 'left',
                                        color: 'var(--text-4)', fontWeight: 500, fontSize: 10, textTransform: 'uppercase' }}>{h}</th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {soLineItems[item.salesorder_id].map((li, i) => {
                                    const fullyPacked = li.quantity_packed >= li.quantity;
                                    return (
                                      <tr key={i} style={{ borderBottom: '1px solid var(--border-muted)' }}>
                                        <td style={{ padding: '6px 10px', color: 'var(--text)', maxWidth: 300,
                                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={li.name}>{li.name}</td>
                                        <td style={{ padding: '6px 10px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace', color: 'var(--text-3)' }}>
                                          {li.quantity} {li.unit}
                                        </td>
                                        <td style={{ padding: '6px 10px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace',
                                          color: fullyPacked ? 'var(--success)' : 'var(--warning)', fontWeight: 600 }}>
                                          {li.quantity_packed}
                                        </td>
                                        <td style={{ padding: '6px 10px', textAlign: 'right' }}>
                                          {fullyPacked
                                            ? <span style={{ color: 'var(--success)', fontSize: 11, fontWeight: 600 }}>✓ Packed</span>
                                            : <span style={{ color: 'var(--warning)', fontSize: 11, fontWeight: 600 }}>⚠ Partial ({li.quantity_packed}/{li.quantity})</span>}
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            ) : (
                              <div className="text-[var(--text-4)] text-xs animate-pulse">Loading…</div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </TableShell>
  );
}

// ─── Table 3: Delivered Not Invoiced ──────────────────────────────────────────

function DeliveredTable({ items, loading, error, onConverted }: {
  items: DeliveredNotInvoiced[]; loading: boolean; error: string;
  onConverted: (ids: string[]) => void;
}) {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [converting, setConverting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [convertResults, setConvertResults] = useState<ConvertResult[]>([]);
  const [convertError, setConvertError] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [soLineItems, setSoLineItems] = useState<Record<string, Array<{name: string; quantity: number; unit: string; quantity_packed: number}>>>({});
  const [loadingLines, setLoadingLines] = useState<Set<string>>(new Set());

  useEffect(() => { setSelected(new Set()); }, [items]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return items.filter(i =>
      !q || i.salesorder_number.toLowerCase().includes(q) || i.customer_name.toLowerCase().includes(q)
    );
  }, [items, search]);

  const convertible = filtered.filter(i => i.all_delivered);

  function toggleAll() {
    if (selected.size === convertible.length) setSelected(new Set());
    else setSelected(new Set(convertible.map(i => i.salesorder_id)));
  }

  function toggle(id: string, allDelivered: boolean) {
    if (!allDelivered) return;
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function toggleExpand(id: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
    // Fetch line items if not already loaded
    if (!soLineItems[id]) {
      setLoadingLines(prev => new Set(prev).add(id));
      try {
        const res = await fetch('/api/shipments?mode=so_detail&id=' + id);
        const data = await res.json();
        if (data.line_items) {
          setSoLineItems(prev => ({ ...prev, [id]: data.line_items }));
        }
      } catch { /* ignore */ }
      finally {
        setLoadingLines(prev => { const n = new Set(prev); n.delete(id); return n; });
      }
    }
  }

  async function doConvert() {
    setConverting(true);
    setConvertError('');
    setConvertResults([]);
    try {
      const res = await fetch('/api/shipments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ salesorder_ids: Array.from(selected) }),
      });
      const data = await res.json();
      setConvertResults(data.results || []);
      const successIds = (data.results || [])
        .filter((r: ConvertResult) => r.success)
        .map((r: ConvertResult) => r.salesorder_id);
      if (successIds.length > 0) onConverted(successIds);
    } catch (e) {
      setConvertError(String(e));
    } finally {
      setConverting(false);
      setShowConfirm(false);
    }
  }

  const selectedItems = filtered.filter(i => selected.has(i.salesorder_id));
  const totalSelected = selectedItems.reduce((s, i) => s + i.total, 0);

  return (
    <TableShell title="Shipment Delivered — Not Invoiced"
      desc="All shipments delivered. ✅ = ready to invoice. ⚠ = partially delivered, waiting for remaining shipments."
      count={filtered.length} loading={loading} search={search} onSearch={setSearch}
      extra={selected.size > 0 ? (
        <button onClick={() => setShowConfirm(true)} disabled={converting}
          className="px-3 py-1.5 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-xs font-medium rounded-lg transition-colors disabled:opacity-50">
          {converting ? 'Converting…' : 'Convert ' + selected.size + ' to Invoice'}
        </button>
      ) : undefined}>

      {/* Selection bar */}
      {selected.size > 0 && (
        <div className="flex items-center gap-4 px-5 py-2.5 bg-[var(--accent-light)] border-b border-[var(--accent-border)]">
          <span className="text-[var(--accent-text)] text-xs font-medium">
            {selected.size} selected — {formatRp(totalSelected)}
          </span>
          <button onClick={() => setSelected(new Set())}
            className="ml-auto text-[var(--text-4)] hover:text-[var(--text-3)] text-xs">Clear</button>
        </div>
      )}

      {/* Convert results */}
      {convertResults.length > 0 && (
        <div className="px-5 py-3 border-b border-[var(--border)] space-y-1">
          {convertResults.map((r, i) => (
            <div key={i} className={'text-xs flex items-center gap-2 ' + (r.success ? 'text-[var(--success)]' : 'text-[var(--danger)]')}>
              <span>{r.success ? '✓' : '✗'}</span>
              <span style={{ fontFamily: 'JetBrains Mono, monospace' }} className="font-medium">{r.salesorder_number}</span>
              {r.success
                ? <span className="text-[var(--text-3)]">→ Invoice {r.invoice_number}</span>
                : <span>{r.error}</span>}
            </div>
          ))}
        </div>
      )}
      {convertError && <div className="px-5 py-2 text-[var(--danger)] text-xs border-b border-[var(--border)]">{convertError}</div>}

      {loading && <LoadingSkeleton />}
      {!loading && error && <div className="p-5 text-[var(--danger)] text-sm">{error}</div>}
      {!loading && !error && filtered.length === 0 && <EmptyState icon="✓" msg="All delivered orders have been invoiced." />}

      {!loading && !error && filtered.length > 0 && (
        <div className="overflow-x-auto">
          <table className="via-table">
            <thead><tr>
              <th className="w-8">
                <input type="checkbox"
                  checked={selected.size === convertible.length && convertible.length > 0}
                  onChange={toggleAll} className="w-3.5 h-3.5 rounded" />
              </th>
              <th className="w-8"></th>
              <th>SO Number</th>
              <th>Customer</th>
              <th>Location</th>
              <th>SO Date</th>
              <th>Delivery Date</th>
              <th className="text-right">Aging</th>
              <th>Shipments</th>
              <th>Invoice Status</th>
              <th className="text-right">Total</th>
            </tr></thead>
            <tbody>
              {filtered.map(item => {
                const sel = selected.has(item.salesorder_id);
                const exp = expanded.has(item.salesorder_id);
                const hasMultiple = item.packages.length > 1;
                return (
                  <React.Fragment key={item.salesorder_id}>
                    <tr
                      className={item.all_delivered ? 'cursor-pointer' + (sel ? ' bg-[var(--accent-light)]' : '') : 'opacity-60'}
                      onClick={() => item.all_delivered && toggle(item.salesorder_id, item.all_delivered)}>
                      <td onClick={e => e.stopPropagation()}>
                        <input type="checkbox" checked={sel} disabled={!item.all_delivered}
                          onChange={() => toggle(item.salesorder_id, item.all_delivered)}
                          className="w-3.5 h-3.5 rounded" />
                      </td>
                      <td onClick={e => { e.stopPropagation(); toggleExpand(item.salesorder_id); }}
                        className="text-center text-[var(--text-4)] text-xs cursor-pointer select-none w-8">
                        {exp ? '▾' : '▸'}
                      </td>
                      <td className="text-[var(--accent-text)] text-xs" style={{ fontFamily: 'JetBrains Mono, monospace' }}>{item.salesorder_number}</td>
                      <td className="text-[var(--text)] text-xs font-medium max-w-[150px] truncate" title={item.customer_name}>{item.customer_name}</td>
                      <td className="text-xs">
                        {item.location_name ? (
                          <span className="via-badge via-badge-muted text-xs">{item.location_name}</span>
                        ) : <span className="text-[var(--text-4)]">—</span>}
                      </td>
                      <td className="text-[var(--text-3)] text-xs">{item.date}</td>
                      <td className="text-xs">
                        {item.all_delivered
                          ? <span className="text-[var(--text-2)]">{item.latest_delivery_date}</span>
                          : <span className="text-[var(--warning)]">⚠ Partial</span>}
                      </td>
                      <td className="text-right">
                        <AgingBadge
                          date={item.latest_delivery_date}
                          label="since delivery"
                        />
                      </td>
                      <td className="text-xs text-[var(--text-3)]">
                        {item.delivered_shipments}/{item.total_shipments} delivered
                      </td>
                      <td>
                        {item.all_delivered
                          ? <StatusBadge label="Ready" type="success" />
                          : <StatusBadge label="Partial Delivery" type="warning" />}
                      </td>
                      <td className="text-right text-[var(--text-2)] text-xs" style={{ fontFamily: 'JetBrains Mono, monospace' }}>{formatRp(item.total)}</td>
                    </tr>
                    {exp && (
                      <tr key={item.salesorder_id + '_detail'}>
                        <td colSpan={11} className="p-0">
                          <div className="bg-[var(--surface-2)] px-6 py-4">
                            {/* Packages */}
                            <div className="text-[var(--text-4)] text-xs uppercase tracking-wider mb-2" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                              Shipments
                            </div>
                            <div className="flex gap-4 mb-4 flex-wrap">
                              {item.packages.map((pkg, pi) => (
                                <div key={pi} className="flex items-center gap-2 text-xs px-3 py-1.5 bg-[var(--surface-3)] rounded-lg border border-[var(--border)]">
                                  <span className="text-[var(--success)]">✓</span>
                                  <span style={{ fontFamily: 'JetBrains Mono, monospace' }} className="text-[var(--text-3)]">{pkg.package_number || pkg.shipment_number}</span>
                                  <span className="text-[var(--text-4)]">delivered {pkg.delivery_date}</span>
                                </div>
                              ))}
                            </div>
                            {/* Line items */}
                            <div className="text-[var(--text-4)] text-xs uppercase tracking-wider mb-2" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                              Items
                            </div>
                            {loadingLines.has(item.salesorder_id) ? (
                              <div className="text-[var(--text-4)] text-xs">Loading items…</div>
                            ) : soLineItems[item.salesorder_id] ? (
                              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                                <thead>
                                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                                    {['Item', 'SO Qty', 'Packed', 'Delivery Status'].map((h, i) => (
                                      <th key={i} style={{ padding: '4px 10px', textAlign: i >= 1 ? 'right' : 'left',
                                        color: 'var(--text-4)', fontWeight: 500, fontSize: 10, textTransform: 'uppercase' }}>{h}</th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {soLineItems[item.salesorder_id].map((li, i) => {
                                    const fullyPacked = li.quantity_packed >= li.quantity;
                                    return (
                                      <tr key={i} style={{ borderBottom: '1px solid var(--border-muted)' }}>
                                        <td style={{ padding: '6px 10px', color: 'var(--text)', maxWidth: 280,
                                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={li.name}>{li.name}</td>
                                        <td style={{ padding: '6px 10px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace', color: 'var(--text-3)' }}>
                                          {li.quantity} {li.unit}
                                        </td>
                                        <td style={{ padding: '6px 10px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace',
                                          color: fullyPacked ? 'var(--success)' : 'var(--warning)', fontWeight: 600 }}>
                                          {li.quantity_packed}
                                        </td>
                                        <td style={{ padding: '6px 10px', textAlign: 'right' }}>
                                          {fullyPacked
                                            ? <span style={{ color: 'var(--success)', fontSize: 11, fontWeight: 600 }}>✓ Fully Delivered</span>
                                            : <span style={{ color: 'var(--warning)', fontSize: 11, fontWeight: 600 }}>⚠ Partial ({li.quantity_packed}/{li.quantity})</span>
                                          }
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            ) : (
                              <div className="text-[var(--text-4)] text-xs">Click to load items</div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
            <tfoot className="border-t border-[var(--border)] bg-[var(--surface-2)]">
              <tr>
                <td colSpan={10} className="px-3 py-2 text-[var(--text-3)] text-xs" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                  TOTAL ({filtered.length} orders · {convertible.length} ready to invoice)
                </td>
                <td className="px-3 py-2 text-right text-[var(--text)] text-xs font-medium" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                  {formatRp(filtered.reduce((s, i) => s + i.total, 0))}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* Confirm modal */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="via-card w-96 p-6 mx-4">
            <h3 className="text-[var(--text)] font-semibold text-sm mb-2">Confirm Invoice Conversion</h3>
            <p className="text-[var(--text-3)] text-xs mb-4">
              Convert <strong className="text-[var(--text)]">{selected.size}</strong> Sales Order{selected.size > 1 ? 's' : ''} to Invoice.
              Invoice date = shipment delivered date.
            </p>
            <div className="max-h-36 overflow-y-auto mb-4 space-y-1 border border-[var(--border)] rounded-lg p-3">
              {selectedItems.map(i => (
                <div key={i.salesorder_id} className="flex items-center justify-between text-xs">
                  <span style={{ fontFamily: 'JetBrains Mono, monospace' }} className="text-[var(--accent-text)]">{i.salesorder_number}</span>
                  <span className="text-[var(--text-3)] truncate mx-2 max-w-[130px]">{i.customer_name}</span>
                  <span style={{ fontFamily: 'JetBrains Mono, monospace' }} className="text-[var(--text-2)]">{formatRp(i.total)}</span>
                </div>
              ))}
            </div>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setShowConfirm(false)}
                className="px-4 py-2 text-xs text-[var(--text-3)] border border-[var(--border)] rounded-lg hover:bg-[var(--surface-2)] transition-colors">
                Cancel
              </button>
              <button onClick={doConvert} disabled={converting}
                className="px-4 py-2 text-xs bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white rounded-lg font-medium transition-colors disabled:opacity-50">
                {converting ? 'Converting…' : 'Convert to Invoice'}
              </button>
            </div>
          </div>
        </div>
      )}
    </TableShell>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ShipmentsPage() {
  const [notReady, setNotReady] = useState<ConfirmedNotReady[]>([]);
  const [pending, setPending] = useState<PendingDelivery[]>([]);
  const [delivered, setDelivered] = useState<DeliveredNotInvoiced[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [lastRefreshed, setLastRefreshed] = useState('');

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/shipments?mode=all');
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      setNotReady(data.not_ready || []);
      setPending(data.pending || []);
      setDelivered(data.delivered || []);
      setLastRefreshed(new Date().toLocaleTimeString('id-ID'));
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  function handleConverted(ids: string[]) {
    setDelivered(prev => prev.filter(i => !ids.includes(i.salesorder_id)));
  }

  const readyToInvoice = delivered.filter(i => i.all_delivered).length;
  const totalReadyValue = delivered.filter(i => i.all_delivered).reduce((s, i) => s + i.total, 0);

  return (
    <div className="via-page" style={{ background: 'var(--bg)', minHeight: '100%' }}>
      <div style={{ maxWidth: 1280, margin: '0 auto' }}>

        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-[var(--text)] font-semibold text-2xl tracking-tight">Sales Orders</h1>
            <p className="text-[var(--text-3)] text-sm mt-1">
              Track confirmed orders, active deliveries, and convert delivered orders to invoices.
            </p>
          </div>
          <div className="flex items-center gap-3">
            {lastRefreshed && (
              <span className="text-[var(--text-4)] text-xs" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                Updated {lastRefreshed}
              </span>
            )}
            <button onClick={fetchAll} disabled={loading}
              className="px-3 py-1.5 text-xs bg-[var(--surface-2)] hover:bg-[var(--surface-3)] text-[var(--text-3)] hover:text-[var(--text)] rounded-lg border border-[var(--border)] transition-colors disabled:opacity-50">
              {loading ? '…' : '↻ Refresh'}
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-5 p-3 bg-[var(--danger-bg)] border border-[var(--danger-border)] rounded-lg text-[var(--danger)] text-sm">
            {error}
          </div>
        )}

        {/* Summary cards */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="via-card px-5 py-4">
            <div className="text-[var(--text-3)] text-xs mb-1">Confirmed, Not Ready</div>
            <div className="text-[var(--text)] text-2xl font-semibold" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
              {loading ? '…' : notReady.length}
            </div>
            <div className="text-[var(--text-4)] text-xs mt-1">orders pending packing</div>
          </div>
          <div className="via-card px-5 py-4">
            <div className="text-[var(--text-3)] text-xs mb-1">Shipment In-Transit</div>
            <div className="text-2xl font-semibold" style={{ fontFamily: 'JetBrains Mono, monospace', color: pending.length > 0 ? 'var(--info)' : 'var(--text)' }}>
              {loading ? '…' : pending.length}
            </div>
            <div className="text-[var(--text-4)] text-xs mt-1">
              {pending.filter(i => i.is_full).length} full · {pending.filter(i => !i.is_full).length} partial
            </div>
          </div>
          <div className="via-card px-5 py-4">
            <div className="text-[var(--text-3)] text-xs mb-1">Ready to Invoice</div>
            <div className="text-2xl font-semibold" style={{ fontFamily: 'JetBrains Mono, monospace', color: readyToInvoice > 0 ? 'var(--warning)' : 'var(--text)' }}>
              {loading ? '…' : readyToInvoice}
            </div>
            <div className="text-[var(--text-4)] text-xs mt-1">
              {readyToInvoice > 0 ? formatRp(totalReadyValue) : 'all invoiced'}
            </div>
          </div>
        </div>

        {/* Tables */}
        <div className="space-y-6">
          <DraftSOTable />
          <PendingApprovalSOTable />
          <NotReadyTable items={notReady} loading={loading} error={error} />
          <PendingDeliveryTable items={pending} loading={loading} error={error} />
          <DeliveredTable items={delivered} loading={loading} error={error} onConverted={handleConverted} />
        </div>

      {/* ── Table 4: SO Stock Check ── */}
        <SOStockCheckTable />
      </div>
    </div>
  );
}
