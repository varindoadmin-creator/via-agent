'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import React from 'react';

type Period = 'this_month' | 'prev_month' | 'this_year' | 'prev_year';
type SortDir = 'asc' | 'desc';
type SortKey = 'name' | 'amount' | 'cost' | 'gross_profit' | 'gp_margin' | 'commission_rate' | 'commission_amount' | 'company_keeps';

interface InvoiceLine {
  item_id: string;
  name: string;
  sku: string;
  brand: string;
  quantity: number;
  rate: number;
  revenue: number;
  purchase_rate: number;
  cost: number;
  gross_profit: number;
  gp_margin: number;
}

interface InvoiceDetail {
  invoice_id: string;
  invoice_number: string;
  date: string;
  due_date: string;
  customer_name: string;
  status: string;
  paid: boolean;
  total: number;
  balance: number;
  quantity: number;
  revenue: number;
  cost: number;
  gross_profit: number;
  gp_margin: number;
  missing_cost_lines: number;
  line_items: InvoiceLine[];
}

interface CommissionRow {
  name: string;
  quantity: number;
  amount: number;
  cost: number;
  gross_profit: number;
  gp_margin: number;
  invoice_count: number;
  customer_count: number;
  missing_cost_lines: number;
  commission_tier: string;
  commission_rate: number;
  commission_amount: number;
  company_keeps: number;
  invoices: InvoiceDetail[];
}

const mono = { fontFamily: 'JetBrains Mono, monospace' };
const formatRp = (n: number) => 'Rp ' + Math.round(n || 0).toLocaleString('id-ID');
const formatPct = (n: number) => ((n || 0) * 100).toFixed(1) + '%';
const formatQty = (n: number) => Number(n || 0).toLocaleString('id-ID');

const PERIODS: { key: Period; label: string }[] = [
  { key: 'this_month', label: 'This Month' },
  { key: 'prev_month', label: 'Previous Month' },
  { key: 'this_year', label: 'This Year' },
  { key: 'prev_year', label: 'Previous Year' },
];

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <span style={{ color: 'var(--text-4)', marginLeft: 4, fontSize: 9 }}>↕</span>;
  return <span style={{ color: 'var(--accent)', marginLeft: 4, fontSize: 9 }}>{dir === 'asc' ? '↑' : '↓'}</span>;
}

function SkeletonRows() {
  return (
    <>
      {[...Array(6)].map((_, i) => (
        <tr key={i} className="animate-pulse">
          {[...Array(10)].map((_, j) => (
            <td key={j} style={{ padding: '10px 12px' }}>
              <div style={{ height: 12, background: 'var(--surface-3)', borderRadius: 4, width: j === 1 ? '70%' : '50%' }} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

function esc(s: string) {
  return String(s || '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] || c));
}

function printStatement(row: CommissionRow, dateRange: string) {
  const invoiceRows = row.invoices.map(inv => `
    <tr>
      <td>${esc(inv.date)}</td>
      <td>${esc(inv.invoice_number)}</td>
      <td>${esc(inv.customer_name)}</td>
      <td class="right">${formatRp(inv.revenue)}</td>
      <td class="right">${formatRp(inv.cost)}</td>
      <td class="right">${formatRp(inv.gross_profit)}</td>
      <td class="right">${formatPct(inv.gp_margin)}</td>
    </tr>
    <tr>
      <td colspan="7" class="nested">
        <table>
          <thead><tr><th>Item</th><th>SKU</th><th class="right">Qty</th><th class="right">Sell Price</th><th class="right">Revenue</th><th class="right">Purchase Rate</th><th class="right">Cost</th><th class="right">GP</th></tr></thead>
          <tbody>
            ${inv.line_items.map(li => `
              <tr>
                <td>${esc(li.name)}</td><td>${esc(li.sku)}</td><td class="right">${formatQty(li.quantity)}</td><td class="right">${formatRp(li.rate)}</td><td class="right">${formatRp(li.revenue)}</td><td class="right">${formatRp(li.purchase_rate)}</td><td class="right">${formatRp(li.cost)}</td><td class="right">${formatRp(li.gross_profit)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </td>
    </tr>
  `).join('');

  const html = `<!doctype html><html><head><title>Commission Statement - ${esc(row.name)}</title>
    <style>
      body{font-family:Arial,sans-serif;color:#111;margin:24px;font-size:12px} h1{font-size:20px;margin:0 0 4px} .muted{color:#666}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:18px 0}.card{border:1px solid #ddd;border-radius:8px;padding:10px}.label{font-size:10px;text-transform:uppercase;color:#666}.value{font-size:15px;font-weight:700;margin-top:4px}table{width:100%;border-collapse:collapse}th,td{border-bottom:1px solid #ddd;padding:7px;text-align:left;vertical-align:top}th{background:#f5f5f5;font-size:10px;text-transform:uppercase;color:#555}.right{text-align:right}.nested{padding:0 0 12px 28px;background:#fafafa}.nested table{font-size:11px}.note{margin-top:18px;color:#555;font-size:11px}@media print{button{display:none}}
    </style></head><body>
      <button onclick="window.print()" style="float:right;padding:8px 12px">Print / Save as PDF</button>
      <h1>Sales Commission Statement</h1>
      <div class="muted">${esc(dateRange)} · Paid invoices only · ${esc(row.name)}</div>
      <div class="grid">
        <div class="card"><div class="label">Revenue before PPN</div><div class="value">${formatRp(row.amount)}</div></div>
        <div class="card"><div class="label">Gross Profit</div><div class="value">${formatRp(row.gross_profit)}</div></div>
        <div class="card"><div class="label">Commission Rate</div><div class="value">${formatPct(row.commission_rate)} (${esc(row.commission_tier)})</div></div>
        <div class="card"><div class="label">Commission Payable</div><div class="value">${formatRp(row.commission_amount)}</div></div>
      </div>
      <table><thead><tr><th>Date</th><th>Invoice</th><th>Customer</th><th class="right">Revenue</th><th class="right">Cost</th><th class="right">GP</th><th class="right">GP %</th></tr></thead><tbody>${invoiceRows}</tbody></table>
      <div class="note">Calculation: GP = invoice line revenue before PPN − Item Purchase Rate × quantity. Commission is calculated only from paid invoices.</div>
    </body></html>`;

  const w = window.open('', '_blank');
  if (!w) return;
  w.document.write(html);
  w.document.close();
  w.focus();
}

export default function CommissionReportPage() {
  const [period, setPeriod] = useState<Period>('this_month');
  const [rows, setRows] = useState<CommissionRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [dateRange, setDateRange] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('commission_amount');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [search, setSearch] = useState('');
  const [selectedName, setSelectedName] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/reports?type=commission&period=${period}&paid_only=true`);
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Failed to load commission report');
      setRows(data.rows || []);
      setDateRange(data.from && data.to ? `${data.from} – ${data.to}` : '');
      setSelectedName('');
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => { fetchData(); }, [fetchData]);

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
  }

  const filtered = useMemo(() => {
    let r = rows;
    if (search.trim()) {
      const q = search.toLowerCase();
      r = r.filter(row => row.name.toLowerCase().includes(q));
    }
    return [...r].sort((a, b) => {
      const av = sortKey === 'name' ? a.name : a[sortKey];
      const bv = sortKey === 'name' ? b.name : b[sortKey];
      if (typeof av === 'string') return sortDir === 'asc' ? av.localeCompare(bv as string) : (bv as string).localeCompare(av);
      return sortDir === 'asc' ? (av as number) - (bv as number) : (bv as number) - (av as number);
    });
  }, [rows, search, sortKey, sortDir]);

  const selected = useMemo(() => rows.find(r => r.name === selectedName) || null, [rows, selectedName]);

  const totals = useMemo(() => {
    const revenue = rows.reduce((s, r) => s + r.amount, 0);
    const cost = rows.reduce((s, r) => s + r.cost, 0);
    const gp = rows.reduce((s, r) => s + r.gross_profit, 0);
    const commission = rows.reduce((s, r) => s + r.commission_amount, 0);
    return {
      revenue,
      cost,
      gp,
      commission,
      companyKeeps: gp - commission,
      gpMargin: revenue > 0 ? gp / revenue : 0,
    };
  }, [rows]);

  const thStyle: React.CSSProperties = {
    padding: '9px 12px', textAlign: 'left', cursor: 'pointer', userSelect: 'none',
    color: 'var(--text-3)', fontWeight: 500, fontSize: 10, textTransform: 'uppercase',
    letterSpacing: '0.06em', background: 'var(--surface-2)',
    borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap',
  };

  return (
    <div className="via-page" style={{ background: 'var(--bg)', minHeight: '100%' }}>
      <div style={{ maxWidth: 1500, margin: '0 auto' }}>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-[var(--text)] font-semibold text-2xl tracking-tight">Sales Commission</h1>
            <p className="text-[var(--text-3)] text-sm mt-0.5">
              {dateRange || 'Loading date range…'} · Paid invoices only · GP before PPN
            </p>
          </div>
          <button onClick={fetchData} disabled={loading}
            className="px-3 py-1.5 text-xs bg-[var(--surface-2)] hover:bg-[var(--surface-3)] text-[var(--text-3)] rounded-lg border border-[var(--border)] transition-colors disabled:opacity-50"
            style={mono}>
            {loading ? '…' : '↻ Refresh'}
          </button>
        </div>

        <div className="flex items-center gap-2 mb-5">
          {PERIODS.map(p => (
            <button key={p.key} onClick={() => setPeriod(p.key)}
              className={`px-4 py-2 text-xs font-medium rounded-lg border transition-all ${
                period === p.key
                  ? 'bg-[var(--accent)] text-white border-[var(--accent)]'
                  : 'bg-[var(--surface-2)] text-[var(--text-3)] border-[var(--border)] hover:bg-[var(--surface-3)]'
              }`}>
              {p.label}
            </button>
          ))}
        </div>

        {!loading && rows.length > 0 && (
          <div className="grid grid-cols-5 gap-3 mb-5">
            <div className="via-card p-4"><div className="text-[var(--text-4)] text-xs uppercase tracking-wider mb-1">Paid Revenue Before PPN</div><div className="text-[var(--text)] font-bold text-sm" style={mono}>{formatRp(totals.revenue)}</div></div>
            <div className="via-card p-4"><div className="text-[var(--text-4)] text-xs uppercase tracking-wider mb-1">Gross Profit</div><div className="text-[var(--success)] font-bold text-sm" style={mono}>{formatRp(totals.gp)}</div></div>
            <div className="via-card p-4"><div className="text-[var(--text-4)] text-xs uppercase tracking-wider mb-1">GP Margin</div><div className="text-[var(--text)] font-bold text-sm" style={mono}>{formatPct(totals.gpMargin)}</div></div>
            <div className="via-card p-4"><div className="text-[var(--text-4)] text-xs uppercase tracking-wider mb-1">Commission Payable</div><div className="text-[var(--accent)] font-bold text-sm" style={mono}>{formatRp(totals.commission)}</div></div>
            <div className="via-card p-4"><div className="text-[var(--text-4)] text-xs uppercase tracking-wider mb-1">Company Keeps</div><div className="text-[var(--text)] font-bold text-sm" style={mono}>{formatRp(totals.companyKeeps)}</div></div>
          </div>
        )}

        <div className="flex items-center gap-4 mb-4 px-4 py-3 bg-[var(--surface-2)] rounded-lg border border-[var(--border)]">
          <div className="text-[var(--text-3)] text-xs">
            Tier rules: paid monthly GP &lt; Rp25m = 10%, Rp25m–&lt;Rp50m = 15%, Rp50m+ = 20%.
          </div>
          <div className="ml-auto">
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search salesperson…" className="via-input text-xs py-1.5 px-3 w-56" />
          </div>
        </div>

        {error && (
          <div className="p-4 mb-4 bg-[var(--danger-bg)] border border-[var(--danger-border)] rounded-lg text-[var(--danger)] text-sm">
            {error}
          </div>
        )}

        <div className="via-card overflow-hidden mb-5">
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ ...thStyle, width: 40, textAlign: 'center' }}>#</th>
                <th style={thStyle} onClick={() => handleSort('name')}>Sales Person <SortIcon active={sortKey === 'name'} dir={sortDir} /></th>
                <th style={{ ...thStyle, textAlign: 'right' }} onClick={() => handleSort('amount')}>Paid Revenue <SortIcon active={sortKey === 'amount'} dir={sortDir} /></th>
                <th style={{ ...thStyle, textAlign: 'right' }} onClick={() => handleSort('cost')}>Cost <SortIcon active={sortKey === 'cost'} dir={sortDir} /></th>
                <th style={{ ...thStyle, textAlign: 'right' }} onClick={() => handleSort('gross_profit')}>Gross Profit <SortIcon active={sortKey === 'gross_profit'} dir={sortDir} /></th>
                <th style={{ ...thStyle, textAlign: 'right' }} onClick={() => handleSort('gp_margin')}>GP % <SortIcon active={sortKey === 'gp_margin'} dir={sortDir} /></th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Tier</th>
                <th style={{ ...thStyle, textAlign: 'right' }} onClick={() => handleSort('commission_rate')}>Rate <SortIcon active={sortKey === 'commission_rate'} dir={sortDir} /></th>
                <th style={{ ...thStyle, textAlign: 'right' }} onClick={() => handleSort('commission_amount')}>Commission <SortIcon active={sortKey === 'commission_amount'} dir={sortDir} /></th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {loading && <SkeletonRows />}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={10} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-4)', fontSize: 13 }}>No paid invoice commission data for this period.</td></tr>
              )}
              {!loading && filtered.map((row, i) => (
              <React.Fragment key={row.name}>
                <tr style={{ borderBottom: '1px solid var(--border-muted)', cursor: 'pointer', background: selected?.name === row.name ? 'var(--surface-2)' : undefined }} className="hover:bg-[var(--surface-2)] transition-colors" onClick={() => setSelectedName(prev => prev === row.name ? '' : row.name)}>
                  <td style={{ padding: '9px 12px', textAlign: 'center', color: 'var(--text-4)', fontSize: 11, ...mono }}>{i + 1}</td>
                  <td style={{ padding: '9px 12px', color: 'var(--text)', fontSize: 12, fontWeight: 600 }}>{row.name}<div style={{ color: 'var(--text-4)', fontSize: 10 }}>{row.invoice_count} paid invoices · {row.customer_count} customers</div></td>
                  <td style={{ padding: '9px 12px', textAlign: 'right', ...mono, color: 'var(--text)', fontSize: 12 }}>{formatRp(row.amount)}</td>
                  <td style={{ padding: '9px 12px', textAlign: 'right', ...mono, color: 'var(--text-3)', fontSize: 12 }}>{formatRp(row.cost)}</td>
                  <td style={{ padding: '9px 12px', textAlign: 'right', ...mono, color: row.gross_profit >= 0 ? 'var(--success)' : 'var(--danger)', fontSize: 12, fontWeight: 700 }}>{formatRp(row.gross_profit)}</td>
                  <td style={{ padding: '9px 12px', textAlign: 'right', ...mono, color: 'var(--text-2)', fontSize: 12 }}>{formatPct(row.gp_margin)}</td>
                  <td style={{ padding: '9px 12px', textAlign: 'right', color: 'var(--text-3)', fontSize: 12 }}>{row.commission_tier}</td>
                  <td style={{ padding: '9px 12px', textAlign: 'right', ...mono, color: 'var(--text-2)', fontSize: 12 }}>{formatPct(row.commission_rate)}</td>
                  <td style={{ padding: '9px 12px', textAlign: 'right', ...mono, color: 'var(--accent)', fontSize: 12, fontWeight: 700 }}>{formatRp(row.commission_amount)}</td>
                  <td style={{ padding: '9px 12px', textAlign: 'right' }}>
                    <div className="flex justify-end gap-2">
                      <button onClick={(e) => { e.stopPropagation(); setSelectedName(prev => prev === row.name ? '' : row.name); }} className="px-2 py-1 text-[10px] rounded border border-[var(--border)] bg-[var(--surface-1)] hover:bg-[var(--surface-3)] text-[var(--text-3)]">
                        {selectedName === row.name ? 'Hide' : 'View'} Details
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); printStatement(row, dateRange); }} className="px-2 py-1 text-[10px] rounded border border-[var(--border)] bg-[var(--surface-1)] hover:bg-[var(--surface-3)] text-[var(--text-3)]">Print / PDF</button>
                    </div>
                  </td>
                </tr>
                {selectedName === row.name && (
                  <tr key={`${row.name}-details`}>
                    <td colSpan={10} style={{ padding: 0, background: 'var(--surface-1)', borderBottom: '1px solid var(--border)' }}>
                      <div className="p-4">
                        <div className="flex items-center justify-between mb-3">
                          <div>
                            <div className="text-[var(--text)] font-semibold text-sm">Invoice Details — {row.name}</div>
                            <div className="text-[var(--text-4)] text-xs">Only paid invoices are included in commission.</div>
                          </div>
                          <button onClick={() => printStatement(row, dateRange)} className="px-3 py-1.5 text-xs rounded-lg bg-[var(--accent)] text-white hover:opacity-90">Print / Save PDF</button>
                        </div>
                        <div style={{ overflowX: 'auto' }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                              <tr>
                                <th style={{ ...thStyle, cursor: 'default' }}>Invoice</th>
                                <th style={{ ...thStyle, cursor: 'default' }}>Customer</th>
                                <th style={{ ...thStyle, cursor: 'default' }}>Item Details</th>
                                <th style={{ ...thStyle, cursor: 'default', textAlign: 'right' }}>Revenue</th>
                                <th style={{ ...thStyle, cursor: 'default', textAlign: 'right' }}>Cost</th>
                                <th style={{ ...thStyle, cursor: 'default', textAlign: 'right' }}>GP</th>
                              </tr>
                            </thead>
                            <tbody>
                              {row.invoices.map(inv => (
                                <tr key={inv.invoice_id} style={{ borderBottom: '1px solid var(--border-muted)' }}>
                                  <td style={{ padding: '10px 12px', verticalAlign: 'top', minWidth: 130 }}>
                                    <div className="text-[var(--text)] text-xs font-semibold">{inv.invoice_number}</div>
                                    <div className="text-[var(--text-4)] text-[10px]">{inv.date}</div>
                                    <div className="text-[var(--success)] text-[10px] mt-1">Paid</div>
                                  </td>
                                  <td style={{ padding: '10px 12px', verticalAlign: 'top', color: 'var(--text-2)', fontSize: 12, minWidth: 180 }}>{inv.customer_name}</td>
                                  <td style={{ padding: '10px 12px', verticalAlign: 'top', minWidth: 520 }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                      <tbody>
                                        {inv.line_items.map((li, idx) => (
                                          <tr key={`${inv.invoice_id}-${idx}`}>
                                            <td style={{ padding: '4px 6px 4px 0', color: 'var(--text)', fontSize: 11 }}>
                                              <div>{li.name || '-'}</div>
                                              <div className="text-[var(--text-4)] text-[10px]">{li.sku || '-'} · Qty {formatQty(li.quantity)}</div>
                                            </td>
                                            <td style={{ padding: '4px 6px', textAlign: 'right', ...mono, color: 'var(--text-4)', fontSize: 10 }}>Sell {formatRp(li.rate)}</td>
                                            <td style={{ padding: '4px 6px', textAlign: 'right', ...mono, color: 'var(--text-4)', fontSize: 10 }}>Buy {formatRp(li.purchase_rate)}</td>
                                            <td style={{ padding: '4px 0 4px 6px', textAlign: 'right', ...mono, color: li.gross_profit >= 0 ? 'var(--success)' : 'var(--danger)', fontSize: 10 }}>GP {formatRp(li.gross_profit)}</td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </td>
                                  <td style={{ padding: '10px 12px', textAlign: 'right', verticalAlign: 'top', ...mono, color: 'var(--text)', fontSize: 12 }}>{formatRp(inv.revenue)}</td>
                                  <td style={{ padding: '10px 12px', textAlign: 'right', verticalAlign: 'top', ...mono, color: 'var(--text-3)', fontSize: 12 }}>{formatRp(inv.cost)}</td>
                                  <td style={{ padding: '10px 12px', textAlign: 'right', verticalAlign: 'top', ...mono, color: inv.gross_profit >= 0 ? 'var(--success)' : 'var(--danger)', fontSize: 12, fontWeight: 700 }}>{formatRp(inv.gross_profit)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>

        <p className="text-[var(--text-4)] text-xs mt-3">
          Calculation: Commission uses paid invoices only. Gross Profit = invoice line revenue before PPN − Item Purchase Rate × quantity. Commission rate is applied to the full monthly GP per salesperson, not progressively.
        </p>
      </div>
    </div>
  );
}
