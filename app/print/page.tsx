'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface InvoiceLineItem {
  line_item_id: string;
  item_id: string;
  name: string;
  sku: string;
  quantity: number;
  unit: string;
  rate: number;
  location_id: string;
  location_name: string;
  available_stock: number;
  stock_on_hand: number;
  is_available: boolean;
  shortage: number;
}

interface DraftInvoice {
  invoice_id: string;
  invoice_number: string;
  customer_name: string;
  date: string;
  due_date: string;
  total: number;
  balance: number;
  salesperson_name: string;
  location_name: string;
  salesorder_number: string;
  line_items: InvoiceLineItem[];
  all_available: boolean;
  partial_available: boolean;
  unavailable_count: number;
}

interface OverdueInvoice {
  invoice_id: string;
  invoice_number: string;
  customer_name: string;
  date: string;
  due_date: string;
  total: number;
  balance: number;
  salesperson_name: string;
  location_name: string;
  days_overdue: number;
}

interface ConvertResult {
  invoice_id: string;
  invoice_number: string;
  success: boolean;
  error?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const mono = { fontFamily: 'JetBrains Mono, monospace' };
const formatRp = (n: number) => 'Rp ' + Number(n).toLocaleString('id-ID');

type SortDir = 'asc' | 'desc';

function SortHeader({ label, sortKey, active, dir, onSort }: {
  label: string; sortKey: string;
  active: boolean; dir: SortDir;
  onSort: (k: string) => void;
}) {
  return (
    <span
      style={{ cursor: 'pointer', userSelect: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}
      onClick={() => onSort(sortKey)}
    >
      {label}
      <span style={{ fontSize: 9, color: active ? 'var(--accent)' : 'var(--border)' }}>
        {active ? (dir === 'desc' ? '▼' : '▲') : '⇅'}
      </span>
    </span>
  );
}

function StockBadge({ inv }: { inv: DraftInvoice }) {
  if (inv.all_available) return (
    <span className="via-badge via-badge-success text-xs">✓ All Ready</span>
  );
  if (inv.unavailable_count === inv.line_items.length) return (
    <span className="via-badge via-badge-danger text-xs border border-[var(--danger-border)]">✗ Not Ready</span>
  );
  return (
    <span className="via-badge via-badge-warning text-xs border border-[var(--warning-border)]">
      ⚠ {inv.unavailable_count} short
    </span>
  );
}

function OverdueBadge({ days }: { days: number }) {
  const color = days >= 60 ? 'var(--danger)'
    : days >= 30 ? 'var(--warning)'
    : days >= 14 ? 'var(--accent-text)'
    : 'var(--text-3)';
  return <span style={{ ...mono, fontSize: 12, fontWeight: 700, color }}>{days}d overdue</span>;
}

// ─── Draft Invoice Row with expandable line items ─────────────────────────────

function DraftRow({ inv, selected, onToggle }: {
  inv: DraftInvoice;
  selected: boolean;
  onToggle: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const thStyle: React.CSSProperties = {
    padding: '5px 10px', textAlign: 'left',
    color: 'var(--text-4)', fontWeight: 500, fontSize: 10,
    textTransform: 'uppercase', letterSpacing: '0.05em',
    background: 'var(--surface-3)', borderBottom: '1px solid var(--border)',
  };

  return (
    <>
      <tr className={`transition-colors ${selected ? 'bg-[var(--accent-light)]' : 'hover:bg-[var(--surface-2)]'}`}
        style={{ borderBottom: expanded ? 'none' : '1px solid var(--border-muted)' }}>
        <td className="px-3 py-2.5 w-8" onClick={e => e.stopPropagation()}>
          <input type="checkbox" className="w-3.5 h-3.5 rounded"
            checked={selected}
            onChange={() => onToggle(inv.invoice_id)}
            disabled={!inv.all_available}
            title={!inv.all_available ? 'Stock not fully available' : undefined}
          />
        </td>
        <td className="px-3 py-2.5 w-8 text-center cursor-pointer text-[var(--text-4)] text-xs select-none"
          onClick={() => setExpanded(e => !e)}>
          {expanded ? '▾' : '▸'}
        </td>
        <td className="px-3 py-2.5 text-xs font-medium text-[var(--accent-text)]" style={mono}>{inv.invoice_number}</td>
        <td className="px-3 py-2.5 text-xs text-[var(--text)] max-w-[160px] truncate" title={inv.customer_name}>{inv.customer_name}</td>
        <td className="px-3 py-2.5 text-xs text-[var(--text-3)]">{inv.date}</td>
        <td className="px-3 py-2.5 text-xs text-[var(--text-3)]">{inv.due_date || '—'}</td>
        <td className="px-3 py-2.5 text-xs text-[var(--text-3)]" style={mono}>{inv.salesorder_number || '—'}</td>
        <td className="px-3 py-2.5"><StockBadge inv={inv} /></td>
        <td className="px-3 py-2.5 text-xs text-right text-[var(--text-2)]" style={mono}>{formatRp(inv.total)}</td>
      </tr>
      {expanded && (
        <tr style={{ borderBottom: '1px solid var(--border)' }}>
          <td colSpan={9} className="p-0">
            <div className="bg-[var(--surface-2)] px-6 py-4">
              <div className="text-[var(--text-4)] text-xs uppercase tracking-wider mb-3" style={mono}>
                Line Items — {inv.invoice_number}
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr>
                    {['Item', 'SKU', 'Location', 'Invoice Qty', 'Stock on Hand', 'Shortage', 'Status'].map((h, i) => (
                      <th key={i} style={{ ...thStyle, textAlign: ['Invoice Qty','Stock on Hand','Shortage'].includes(h) ? 'right' : 'left' }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {inv.line_items.map((li, i) => (
                    <tr key={i} style={{
                      borderBottom: '1px solid var(--border-muted)',
                      background: li.is_available ? 'transparent' : 'var(--danger-bg)',
                    }}>
                      <td style={{ padding: '7px 10px', color: 'var(--text)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                        title={li.name}>{li.name}</td>
                      <td style={{ padding: '7px 10px', color: 'var(--text-3)', fontSize: 11, ...mono }}>{li.sku}</td>
                      <td style={{ padding: '7px 10px', color: 'var(--text-3)', fontSize: 11 }}>{li.location_name || '—'}</td>
                      <td style={{ padding: '7px 10px', textAlign: 'right', ...mono, color: 'var(--text-2)' }}>{li.quantity} {li.unit}</td>
                      <td style={{ padding: '7px 10px', textAlign: 'right', ...mono, fontWeight: 600,
                        color: li.is_available ? 'var(--success)' : 'var(--danger)' }}>
                        {li.stock_on_hand}
                      </td>
                      <td style={{ padding: '7px 10px', textAlign: 'right', ...mono,
                        color: li.shortage > 0 ? 'var(--danger)' : 'var(--text-4)',
                        fontWeight: li.shortage > 0 ? 700 : 400 }}>
                        {li.shortage > 0 ? '-' + li.shortage : '—'}
                      </td>
                      <td style={{ padding: '7px 10px' }}>
                        {li.is_available
                          ? <span style={{ color: 'var(--success)', fontSize: 11, fontWeight: 600 }}>✓ Ready</span>
                          : <span style={{ color: 'var(--danger)', fontSize: 11, fontWeight: 600 }}>✗ Short {li.shortage} — Awaiting PO</span>
                        }
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function InvoicesPage() {
  const [draftInvoices, setDraftInvoices] = useState<DraftInvoice[]>([]);
  const [overdueInvoices, setOverdueInvoices] = useState<OverdueInvoice[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [lastRefreshed, setLastRefreshed] = useState('');

  // Draft table state
  const [draftSort, setDraftSort] = useState<{ key: string; dir: SortDir }>({ key: 'date', dir: 'desc' });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showConfirm, setShowConfirm] = useState(false);
  const [converting, setConverting] = useState(false);
  const [convertResults, setConvertResults] = useState<ConvertResult[]>([]);

  // Overdue table state
  const [overdueSort, setOverdueSort] = useState<{ key: string; dir: SortDir }>({ key: 'days_overdue', dir: 'desc' });
  const [selectedOverdue, setSelectedOverdue] = useState<Set<string>>(new Set());
  const [exportingPDF, setExportingPDF] = useState(false);



  // Print section state
  const [printSearch, setPrintSearch] = useState('');
  const [printDateFrom, setPrintDateFrom] = useState('');
  const [printDateTo, setPrintDateTo] = useState('');
  const [printing, setPrinting] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError('');
    setConvertResults([]);
    try {
      const res = await fetch('/api/invoices-page');
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      setDraftInvoices(data.draft_invoices || []);
      setOverdueInvoices(data.overdue_invoices || []);
      setLastRefreshed(new Date().toLocaleTimeString('id-ID'));
    } catch (e) { setError(String(e)); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Sorting
  function sortData<T extends Record<string, unknown>>(data: T[], key: string, dir: SortDir): T[] {
    return [...data].sort((a, b) => {
      const av = a[key]; const bv = b[key];
      if (typeof av === 'number' && typeof bv === 'number')
        return dir === 'desc' ? bv - av : av - bv;
      return dir === 'desc'
        ? String(bv).localeCompare(String(av))
        : String(av).localeCompare(String(bv));
    });
  }

  function handleDraftSort(key: string) {
    setDraftSort(prev => ({ key, dir: prev.key === key && prev.dir === 'desc' ? 'asc' : 'desc' }));
  }
  function handleOverdueSort(key: string) {
    setOverdueSort(prev => ({ key, dir: prev.key === key && prev.dir === 'desc' ? 'asc' : 'desc' }));
  }

  const sortedDraft = useMemo(() =>
    sortData(draftInvoices as unknown as Record<string, unknown>[], draftSort.key, draftSort.dir) as unknown as DraftInvoice[],
    [draftInvoices, draftSort]);

  const sortedOverdue = useMemo(() =>
    sortData(overdueInvoices as unknown as Record<string, unknown>[], overdueSort.key, overdueSort.dir) as unknown as OverdueInvoice[],
    [overdueInvoices, overdueSort]);

  // Selection — only allow all_available invoices
  const selectableIds = sortedDraft.filter(inv => inv.all_available).map(inv => inv.invoice_id);
  function toggleAll() {
    if (selected.size === selectableIds.length) setSelected(new Set());
    else setSelected(new Set(selectableIds));
  }
  function toggle(id: string) {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  const selectedInvoices = sortedDraft.filter(inv => selected.has(inv.invoice_id));

  async function doConvert() {
    setConverting(true);
    try {
      const res = await fetch('/api/invoices-page', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoice_ids: Array.from(selected) }),
      });
      const data = await res.json();
      setConvertResults(data.results || []);
      const successIds = (data.results || []).filter((r: ConvertResult) => r.success).map((r: ConvertResult) => r.invoice_id);
      if (successIds.length > 0) {
        setDraftInvoices(prev => prev.filter(inv => !successIds.includes(inv.invoice_id)));
        setSelected(new Set());
      }
    } catch (e) { setError(String(e)); }
    finally { setConverting(false); setShowConfirm(false); }
  }

  function openPdf(invoiceId: string) {
    window.open('/api/invoices/pdf?invoice_id=' + invoiceId, '_blank');
  }

  const thStyle: React.CSSProperties = {
    padding: '8px 12px', textAlign: 'left',
    color: 'var(--text-3)', fontWeight: 500, fontSize: 11,
    textTransform: 'uppercase', letterSpacing: '0.06em',
    background: 'var(--surface-2)', borderBottom: '1px solid var(--border)',
    whiteSpace: 'nowrap',
  };

  function handleExportPDF() {
    setExportingPDF(true);
    let count = 0;
    const ids = Array.from(selectedOverdue);
    const total = ids.length;
    ids.forEach(invId => {
      fetch('/api/invoices-page?mode=pdf_url&id=' + invId)
        .then(function(r) { return r.json(); })
        .then(function(d: Record<string, unknown>) {
          if (d.url) window.open(d.url as string, '_blank');
          count++;
          if (count >= total) setExportingPDF(false);
        })
        .catch(function() {
          count++;
          if (count >= total) setExportingPDF(false);
        });
    });
  }

  return (
    <div className="via-page" style={{ background: 'var(--bg)', minHeight: '100%' }}>
      <div style={{ maxWidth: 1300, margin: '0 auto' }}>

        {/* Header */}
        <div className="flex items-start justify-between mb-5">
          <div>
            <h1 className="text-[var(--text)] font-semibold text-2xl tracking-tight">Invoices</h1>
            <p className="text-[var(--text-3)] text-sm mt-1">
              Review draft invoices, check stock readiness, follow up overdue, and print.
            </p>
          </div>
          <div className="flex items-center gap-3">
            {lastRefreshed && <span className="text-[var(--text-4)] text-xs" style={mono}>Updated {lastRefreshed}</span>}
            <button onClick={fetchAll} disabled={loading}
              className="px-3 py-1.5 text-xs bg-[var(--surface-2)] hover:bg-[var(--surface-3)] text-[var(--text-3)] hover:text-[var(--text)] rounded-lg border border-[var(--border)] transition-colors disabled:opacity-50">
              {loading ? '…' : '↻ Refresh'}
            </button>
          </div>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-3 gap-3 mb-5">
          {[
            { label: 'Draft', value: loading ? '…' : draftInvoices.length, color: 'var(--text)' },
            { label: 'Stock Ready', value: loading ? '…' : draftInvoices.filter(i => i.all_available).length, color: 'var(--success)' },
            { label: 'Overdue', value: loading ? '…' : overdueInvoices.length, color: 'var(--danger)' },
          ].map(c => (
            <div key={c.label} className="via-card px-4 py-3">
              <div className="text-[var(--text-3)] text-xs mb-1">{c.label}</div>
              <div className="text-2xl font-semibold" style={{ ...mono, color: c.color }}>{c.value}</div>
            </div>
          ))}
        </div>

        {error && <div className="mb-4 p-3 bg-[var(--danger-bg)] border border-[var(--danger-border)] rounded-lg text-[var(--danger)] text-sm">{error}</div>}

        {convertResults.length > 0 && (
          <div className="mb-4 via-card p-4 space-y-1">
            {convertResults.map((r, i) => (
              <div key={i} className={'text-xs flex gap-2 ' + (r.success ? 'text-[var(--success)]' : 'text-[var(--danger)]')}>
                <span>{r.success ? '✓' : '✗'}</span>
                <span style={mono} className="font-medium">{r.invoice_number}</span>
                <span>{r.success ? 'Marked as Sent' : r.error}</span>
              </div>
            ))}
          </div>
        )}

        {/* ── TABLE 1: Draft ── */}
        <div className="via-card overflow-hidden mb-6">
          <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--border)]">
            <div>
              <h2 className="text-[var(--text)] font-semibold text-sm">Draft</h2>
              <p className="text-[var(--text-3)] text-xs mt-0.5">
                Click ▸ to check stock per item. Only fully ready invoices can be converted.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[var(--text-4)] text-xs" style={mono}>{draftInvoices.length} invoices</span>
              {selected.size > 0 && (
                <button onClick={() => setShowConfirm(true)} disabled={converting}
                  className="px-3 py-1.5 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-xs font-medium rounded-lg transition-colors disabled:opacity-50">
                  {converting ? 'Converting…' : `Mark ${selected.size} as Sent`}
                </button>
              )}
            </div>
          </div>

          {selected.size > 0 && (
            <div className="flex items-center gap-3 px-5 py-2 bg-[var(--accent-light)] border-b border-[var(--accent-border)]">
              <span className="text-[var(--accent-text)] text-xs font-medium">
                {selected.size} selected — {formatRp(selectedInvoices.reduce((s, i) => s + i.total, 0))}
              </span>
              <button onClick={() => setSelected(new Set())} className="ml-auto text-[var(--text-4)] text-xs">Clear</button>
            </div>
          )}

          {loading && (
            <div className="p-5 space-y-2">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="flex gap-4 animate-pulse">
                  <div className="h-4 bg-[var(--surface-3)] rounded w-6" />
                  <div className="h-4 bg-[var(--surface-3)] rounded w-28" />
                  <div className="h-4 bg-[var(--surface-3)] rounded flex-1" />
                  <div className="h-4 bg-[var(--surface-3)] rounded w-20" />
                </div>
              ))}
            </div>
          )}

          {!loading && draftInvoices.length === 0 && (
            <div className="flex flex-col items-center py-10">
              <div className="text-3xl mb-2 opacity-20">✓</div>
              <div className="text-[var(--text-3)] text-sm">No draft invoices.</div>
            </div>
          )}

          {!loading && draftInvoices.length > 0 && (
            <div className="overflow-x-auto">
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr>
                    <th style={{ ...thStyle, width: 36 }}>
                      <input type="checkbox" className="w-3.5 h-3.5 rounded"
                        checked={selected.size === selectableIds.length && selectableIds.length > 0}
                        onChange={toggleAll} />
                    </th>
                    <th style={{ ...thStyle, width: 32 }}></th>
                    <th style={{ ...thStyle, width: 36, textAlign: 'center' }} title="Select for Tax Invoice / Faktur Pajak">FP</th>
                    <th style={thStyle}><SortHeader label="Invoice No." sortKey="invoice_number" active={draftSort.key==='invoice_number'} dir={draftSort.dir} onSort={handleDraftSort} /></th>
                    <th style={thStyle}>Customer</th>
                    <th style={thStyle}><SortHeader label="Date" sortKey="date" active={draftSort.key==='date'} dir={draftSort.dir} onSort={handleDraftSort} /></th>
                    <th style={thStyle}><SortHeader label="Due Date" sortKey="due_date" active={draftSort.key==='due_date'} dir={draftSort.dir} onSort={handleDraftSort} /></th>
                    <th style={thStyle}>SO Number</th>
                    <th style={thStyle}>Stock</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}><SortHeader label="Total" sortKey="total" active={draftSort.key==='total'} dir={draftSort.dir} onSort={handleDraftSort} /></th>
                  </tr>
                </thead>
                <tbody>
                  {sortedDraft.map(inv => (
                    <DraftRow key={inv.invoice_id} inv={inv}
                      selected={selected.has(inv.invoice_id)}
                      onToggle={toggle} />
                  ))}
                </tbody>
                <tfoot style={{ borderTop: '1px solid var(--border)', background: 'var(--surface-2)' }}>
                  <tr>
                    <td colSpan={8} style={{ padding: '7px 12px', ...mono, color: 'var(--text-3)', fontSize: 11 }}>TOTAL</td>
                    <td style={{ padding: '7px 12px', textAlign: 'right', ...mono, color: 'var(--text)', fontWeight: 600 }}>
                      {formatRp(draftInvoices.reduce((s, i) => s + i.total, 0))}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>

        {/* ── TABLE 2: Overdue ── */}
        <div className="via-card overflow-hidden mb-6">
          <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--border)]">
            <div>
              <h2 className="text-[var(--text)] font-semibold text-sm">Overdue</h2>
              <p className="text-[var(--text-3)] text-xs mt-0.5">Invoices past due date — sorted by overdue days</p>
            </div>
            <div className="flex items-center gap-2">
              {selectedOverdue.size > 0 && (
                <button onClick={handleExportPDF} disabled={exportingPDF}
                  className="px-3 py-1.5 text-xs bg-[var(--danger-bg)] text-[var(--danger)] border border-[var(--danger-border)] rounded-lg font-medium hover:opacity-80 disabled:opacity-50 transition-opacity">
                  {exportingPDF ? 'Exporting…' : '↓ Export PDF (' + selectedOverdue.size + ')'}
                </button>
              )}
              <span className="text-[var(--text-4)] text-xs" style={mono}>{overdueInvoices.length} invoices</span>
            </div>
          </div>

          {loading && (
            <div className="p-5 space-y-2">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="flex gap-4 animate-pulse">
                  <div className="h-4 bg-[var(--surface-3)] rounded w-28" />
                  <div className="h-4 bg-[var(--surface-3)] rounded flex-1" />
                  <div className="h-4 bg-[var(--surface-3)] rounded w-24" />
                </div>
              ))}
            </div>
          )}

          {!loading && overdueInvoices.length === 0 && (
            <div className="flex flex-col items-center py-10">
              <div className="text-3xl mb-2 opacity-20">✓</div>
              <div className="text-[var(--text-3)] text-sm">No overdue invoices.</div>
            </div>
          )}

          {!loading && overdueInvoices.length > 0 && (
            <div className="overflow-x-auto">
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr>
                    <th style={thStyle}><SortHeader label="Invoice No." sortKey="invoice_number" active={overdueSort.key==='invoice_number'} dir={overdueSort.dir} onSort={handleOverdueSort} /></th>
                    <th style={thStyle}><SortHeader label="Customer" sortKey="customer_name" active={overdueSort.key==='customer_name'} dir={overdueSort.dir} onSort={handleOverdueSort} /></th>
                    <th style={thStyle}><SortHeader label="Invoice Date" sortKey="date" active={overdueSort.key==='date'} dir={overdueSort.dir} onSort={handleOverdueSort} /></th>
                    <th style={thStyle}><SortHeader label="Due Date" sortKey="due_date" active={overdueSort.key==='due_date'} dir={overdueSort.dir} onSort={handleOverdueSort} /></th>
                    <th style={{ ...thStyle, textAlign: 'right' }}><SortHeader label="Overdue" sortKey="days_overdue" active={overdueSort.key==='days_overdue'} dir={overdueSort.dir} onSort={handleOverdueSort} /></th>
                    <th style={{ ...thStyle, textAlign: 'right' }}><SortHeader label="Total" sortKey="total" active={overdueSort.key==='total'} dir={overdueSort.dir} onSort={handleOverdueSort} /></th>
                    <th style={{ ...thStyle, textAlign: 'right' }}><SortHeader label="Balance Due" sortKey="balance" active={overdueSort.key==='balance'} dir={overdueSort.dir} onSort={handleOverdueSort} /></th>
                    <th style={thStyle}>Salesperson</th>
                    <th style={{ ...thStyle, width: 40, textAlign: 'center' }}>
                      <input type="checkbox" className="w-3.5 h-3.5 rounded"
                        checked={selectedOverdue.size === sortedOverdue.length && sortedOverdue.length > 0}
                        onChange={function() {
                          if (selectedOverdue.size === sortedOverdue.length) {
                            setSelectedOverdue(new Set());
                          } else {
                            setSelectedOverdue(new Set(sortedOverdue.map(function(x) { return x.invoice_id; })));
                          }
                        }} />
                    </th>

                  </tr>
                </thead>
                <tbody>
                  {sortedOverdue.map(inv => (
                    <tr key={inv.invoice_id} style={{ borderBottom: '1px solid var(--border-muted)' }}
                      className="hover:bg-[var(--surface-2)] transition-colors">
                      <td style={{ padding: '8px 12px', ...mono, fontSize: 12, color: 'var(--accent-text)', fontWeight: 500 }}>{inv.invoice_number}</td>
                      <td style={{ padding: '8px 12px', fontSize: 12, color: 'var(--text)', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={inv.customer_name}>{inv.customer_name}</td>
                      <td style={{ padding: '8px 12px', fontSize: 12, color: 'var(--text-3)' }}>{inv.date}</td>
                      <td style={{ padding: '8px 12px', fontSize: 12, color: 'var(--text-3)' }}>{inv.due_date}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'right' }}><OverdueBadge days={inv.days_overdue} /></td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', ...mono, fontSize: 12, color: 'var(--text-2)' }}>{formatRp(inv.total)}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', ...mono, fontSize: 12, fontWeight: 700, color: 'var(--danger)' }}>{formatRp(inv.balance)}</td>
                      <td style={{ padding: '8px 12px', fontSize: 11, color: 'var(--text-3)' }}>{inv.salesperson_name || '—'}</td>
                      <td style={{ padding: '8px 12px', width: 40, textAlign: 'center' }}
                        onClick={function(e) { e.stopPropagation(); }}>
                        <input type="checkbox" className="w-3.5 h-3.5 rounded"
                          checked={selectedOverdue.has(inv.invoice_id)}
                          onChange={function() {
                            const id = inv.invoice_id;
                            setSelectedOverdue(function(prev) {
                              const n = new Set(prev);
                              if (n.has(id)) { n.delete(id); } else { n.add(id); }
                              return n;
                            });
                          }} />
                      </td>

                  </tr>
                  ))}
                </tbody>
                <tfoot style={{ borderTop: '1px solid var(--border)', background: 'var(--surface-2)' }}>
                  <tr>
                    <td colSpan={6} style={{ padding: '7px 12px', ...mono, color: 'var(--text-3)', fontSize: 11 }}>
                      TOTAL OVERDUE ({overdueInvoices.length} invoices)
                    </td>
                    <td style={{ padding: '7px 12px', textAlign: 'right', ...mono, color: 'var(--danger)', fontWeight: 700 }}>
                      {formatRp(overdueInvoices.reduce((s, i) => s + i.balance, 0))}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>

        {/* ── PRINT SECTION ── */}
        <div className="via-card overflow-hidden">
          <div className="px-5 py-3 border-b border-[var(--border)]">
            <h2 className="text-[var(--text)] font-semibold text-sm">Print</h2>
            <p className="text-[var(--text-3)] text-xs mt-0.5">Search and print any invoice as PDF</p>
          </div>
          <div className="p-5">
            <div className="flex items-center gap-3 flex-wrap">
              <input value={printSearch} onChange={e => setPrintSearch(e.target.value)}
                placeholder="Invoice number or customer name…"
                className="via-input text-xs py-1.5 px-3 w-60" />
              <input type="date" value={printDateFrom} onChange={e => setPrintDateFrom(e.target.value)}
                className="via-input text-xs py-1.5 px-3" />
              <span className="text-[var(--text-3)] text-xs">to</span>
              <input type="date" value={printDateTo} onChange={e => setPrintDateTo(e.target.value)}
                className="via-input text-xs py-1.5 px-3" />
            </div>
            <p className="text-[var(--text-4)] text-xs mt-3">
              To print an invoice, click any invoice row above and use your browser's PDF export, or access invoices directly from Zoho Books.
            </p>
          </div>
        </div>

        {/* Confirm modal */}
        {showConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
            <div className="via-card w-[480px] p-6 mx-4">
              <h3 className="text-[var(--text)] font-semibold text-sm mb-2">Mark Invoices as Sent</h3>
              <p className="text-[var(--text-3)] text-xs mb-4">
                Convert <strong className="text-[var(--text)]">{selected.size}</strong> Draft Invoice{selected.size > 1 ? 's' : ''} to Sent status?
                All selected invoices have confirmed stock availability.
              </p>
              <div className="max-h-40 overflow-y-auto mb-4 border border-[var(--border)] rounded-lg divide-y divide-[var(--border-muted)]">
                {selectedInvoices.map(inv => (
                  <div key={inv.invoice_id} className="flex items-center justify-between px-3 py-2 text-xs">
                    <span style={mono} className="text-[var(--accent-text)] font-medium">{inv.invoice_number}</span>
                    <span className="text-[var(--text-3)] truncate mx-2 flex-1">{inv.customer_name}</span>
                    <span style={mono} className="text-[var(--text-2)]">{formatRp(inv.total)}</span>
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
                  {converting ? 'Converting…' : 'Mark as Sent'}
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
