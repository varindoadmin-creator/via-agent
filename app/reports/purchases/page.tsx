'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import React from 'react';

type Period = 'this_month' | 'prev_month' | 'this_year' | 'prev_year';
type ReportType = 'item' | 'brand' | 'location' | 'vendor';
type SortDir = 'asc' | 'desc';

interface ReportRow {
  name: string;
  sku?: string;
  quantity: number;
  amount: number;
  avg_price: number;
  count?: number;
}

const mono = { fontFamily: 'JetBrains Mono, monospace' };
const formatRp = (n: number) => 'Rp ' + Math.round(n).toLocaleString('id-ID');
const formatQty = (n: number) => Number(n).toLocaleString('id-ID');

const PERIODS: { key: Period; label: string }[] = [
  { key: 'this_month', label: 'This Month' },
  { key: 'prev_month', label: 'Previous Month' },
  { key: 'this_year', label: 'This Year' },
  { key: 'prev_year', label: 'Previous Year' },
];

const REPORT_TYPES: { key: ReportType; label: string; desc: string; icon: string }[] = [
  { key: 'item', label: 'Purchases by Item', desc: 'Top 100 items by purchase value', icon: '▣' },
  { key: 'brand', label: 'Purchases by Brand', desc: 'Purchase value breakdown by brand', icon: '◈' },
  { key: 'location', label: 'Purchases by Location', desc: 'Purchase value by warehouse', icon: '⊙' },
  { key: 'vendor', label: 'Purchases by Vendor', desc: 'Purchase value breakdown by vendor', icon: '◎' },
];

const brandColors: Record<string, string> = {
  'Lamitak': '#cc785c', 'EDL': '#5c8acc', 'AICA': '#5cac6a',
  'TACO': '#ac5c8a', 'CARTA': '#8a7c5c', 'AIDI': '#5c8aac',
};

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <span style={{ color: 'var(--text-4)', marginLeft: 4, fontSize: 9 }}>↕</span>;
  return <span style={{ color: 'var(--accent)', marginLeft: 4, fontSize: 9 }}>{dir === 'asc' ? '↑' : '↓'}</span>;
}

function SkeletonRows({ cols }: { cols: number }) {
  return (
    <>
      {[...Array(8)].map((_, i) => (
        <tr key={i} className="animate-pulse">
          {[...Array(cols)].map((_, j) => (
            <td key={j} style={{ padding: '10px 12px' }}>
              <div style={{ height: 12, background: 'var(--surface-3)', borderRadius: 4, width: j === 0 ? '70%' : '50%' }} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

export default function PurchasesReportsPage() {
  const [period, setPeriod] = useState<Period>('this_month');
  const [reportType, setReportType] = useState<ReportType>('item');
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [dateRange, setDateRange] = useState('');
  const [sortKey, setSortKey] = useState<'amount' | 'quantity' | 'avg_price' | 'name'>('amount');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [search, setSearch] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await fetch(`/api/reports/purchases?type=${reportType}&period=${period}`);
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      const limited = reportType === 'item'
        ? (data.rows as ReportRow[]).sort((a, b) => b.amount - a.amount).slice(0, 100)
        : data.rows as ReportRow[];
      setRows(limited);
      setDateRange(data.from && data.to ? `${data.from} – ${data.to}` : '');
    } catch(e) { setError(String(e)); }
    finally { setLoading(false); }
  }, [reportType, period]);

  useEffect(() => { fetchData(); }, [fetchData]);

  function handleSort(key: typeof sortKey) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
  }

  const filtered = useMemo(() => {
    let r = rows;
    if (search.trim()) {
      const q = search.toLowerCase();
      r = r.filter(row => row.name.toLowerCase().includes(q) || (row.sku || '').toLowerCase().includes(q));
    }
    return [...r].sort((a, b) => {
      const av = sortKey === 'name' ? a.name : a[sortKey];
      const bv = sortKey === 'name' ? b.name : b[sortKey];
      if (typeof av === 'string') return sortDir === 'asc' ? av.localeCompare(bv as string) : (bv as string).localeCompare(av);
      return sortDir === 'asc' ? (av as number) - (bv as number) : (bv as number) - (av as number);
    });
  }, [rows, search, sortKey, sortDir]);

  const totals = useMemo(() => ({
    amount: rows.reduce((s, r) => s + r.amount, 0),
    quantity: rows.reduce((s, r) => s + r.quantity, 0),
  }), [rows]);

  const thStyle: React.CSSProperties = {
    padding: '9px 12px', textAlign: 'left', cursor: 'pointer', userSelect: 'none',
    color: 'var(--text-3)', fontWeight: 500, fontSize: 10, textTransform: 'uppercase',
    letterSpacing: '0.06em', background: 'var(--surface-2)',
    borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap',
  };

  const currentType = REPORT_TYPES.find(t => t.key === reportType)!;

  return (
    <div className="via-page" style={{ background: 'var(--bg)', minHeight: '100%' }}>
      <div style={{ maxWidth: 1400, margin: '0 auto' }}>

        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-[var(--text)] font-semibold text-2xl tracking-tight">Purchases Reports</h1>
            <p className="text-[var(--text-3)] text-sm mt-0.5">{dateRange || 'Loading…'}</p>
          </div>
          <button onClick={fetchData} disabled={loading}
            className="px-3 py-1.5 text-xs bg-[var(--surface-2)] hover:bg-[var(--surface-3)] text-[var(--text-3)] rounded-lg border border-[var(--border)] transition-colors disabled:opacity-50"
            style={mono}>
            {loading ? '…' : '↻ Refresh'}
          </button>
        </div>

        {/* Period tabs */}
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

        {/* Report type cards */}
        <div className="grid grid-cols-4 gap-3 mb-5">
          {REPORT_TYPES.map(t => (
            <button key={t.key} onClick={() => setReportType(t.key)}
              className={`via-card p-4 text-left transition-all border-2 ${
                reportType === t.key
                  ? 'border-[var(--accent)] bg-[var(--accent-light)]'
                  : 'border-transparent hover:border-[var(--border)]'
              }`}>
              <div className="flex items-center gap-2 mb-1">
                <span style={{ fontSize: 14, color: reportType === t.key ? 'var(--accent)' : 'var(--text-3)' }}>{t.icon}</span>
                <span className={`text-xs font-semibold ${reportType === t.key ? 'text-[var(--accent)]' : 'text-[var(--text)]'}`}>{t.label}</span>
              </div>
              <p className="text-[var(--text-4)] text-xs">{t.desc}</p>
            </button>
          ))}
        </div>

        {/* Summary strip */}
        {!loading && rows.length > 0 && (
          <div className="flex items-center gap-6 mb-4 px-4 py-3 bg-[var(--surface-2)] rounded-lg border border-[var(--border)]">
            <div>
              <div className="text-[var(--text-4)] text-xs uppercase tracking-wider mb-0.5">Total Purchases</div>
              <div className="text-[var(--text)] font-bold text-sm" style={mono}>{formatRp(totals.amount)}</div>
            </div>
            <div className="w-px h-8 bg-[var(--border)]" />
            <div>
              <div className="text-[var(--text-4)] text-xs uppercase tracking-wider mb-0.5">Total Qty</div>
              <div className="text-[var(--text)] font-bold text-sm" style={mono}>{formatQty(totals.quantity)} sht</div>
            </div>
            <div className="w-px h-8 bg-[var(--border)]" />
            <div>
              <div className="text-[var(--text-4)] text-xs uppercase tracking-wider mb-0.5">{currentType.label}</div>
              <div className="text-[var(--text)] font-bold text-sm" style={mono}>{rows.length} rows</div>
            </div>
            <div className="ml-auto">
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search…" className="via-input text-xs py-1.5 px-3 w-48" />
            </div>
          </div>
        )}

        {error && (
          <div className="p-4 mb-4 bg-[var(--danger-bg)] border border-[var(--danger-border)] rounded-lg text-[var(--danger)] text-sm">{error}</div>
        )}

        {/* Table */}
        <div className="via-card overflow-hidden">
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ ...thStyle, width: 40, textAlign: 'center' }}>#</th>
                <th style={thStyle} onClick={() => handleSort('name')}>
                  {reportType === 'item' ? 'Item' : reportType === 'brand' ? 'Brand' :
                   reportType === 'location' ? 'Location' : 'Vendor'}
                  <SortIcon active={sortKey === 'name'} dir={sortDir} />
                </th>
                {reportType === 'item' && <th style={{ ...thStyle, width: 140 }}>SKU</th>}
                <th style={{ ...thStyle, textAlign: 'right', width: 120 }} onClick={() => handleSort('quantity')}>
                  Qty <SortIcon active={sortKey === 'quantity'} dir={sortDir} />
                </th>
                <th style={{ ...thStyle, textAlign: 'right', width: 160 }} onClick={() => handleSort('avg_price')}>
                  Avg Cost <SortIcon active={sortKey === 'avg_price'} dir={sortDir} />
                </th>
                <th style={{ ...thStyle, textAlign: 'right', width: 180 }} onClick={() => handleSort('amount')}>
                  Purchase Value <SortIcon active={sortKey === 'amount'} dir={sortDir} />
                </th>
                <th style={{ ...thStyle, width: 120 }}>Share</th>
              </tr>
            </thead>
            <tbody>
              {loading && <SkeletonRows cols={reportType === 'item' ? 7 : 6} />}
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-4)', fontSize: 13 }}>
                    No data for this period.
                  </td>
                </tr>
              )}
              {!loading && filtered.map((row, i) => {
                const pct = totals.amount > 0 ? (row.amount / totals.amount) * 100 : 0;
                const brandColor = reportType === 'brand' ? (brandColors[row.name] || 'var(--accent)') : 'var(--accent)';
                const skuPrefix = row.sku ? row.sku.split('-')[0].toUpperCase() : '';
                const brandLookup: Record<string, string> = {
                  'LAM': 'Lamitak', 'EDL': 'EDL', 'EAS': 'EDL',
                  'AICA': 'AICA', 'TACO': 'TACO', 'TAC': 'TACO',
                  'CARTA': 'CARTA', 'AIDI': 'AIDI',
                };
                const itemColor = brandColors[brandLookup[skuPrefix] || ''] || 'var(--accent)';

                return (
                  <tr key={row.name + i} style={{ borderBottom: '1px solid var(--border-muted)' }}
                    className="hover:bg-[var(--surface-2)] transition-colors">
                    <td style={{ padding: '9px 12px', textAlign: 'center', color: 'var(--text-4)', fontSize: 11, ...mono }}>{i + 1}</td>
                    <td style={{ padding: '9px 12px', maxWidth: 340 }}>
                      <div style={{ color: 'var(--text)', fontSize: 12, fontWeight: 500,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={row.name}>
                        {reportType === 'brand' && (
                          <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
                            background: brandColor, marginRight: 6, verticalAlign: 'middle' }} />
                        )}
                        {row.name}
                      </div>
                    </td>
                    {reportType === 'item' && (
                      <td style={{ padding: '9px 12px' }}>
                        {row.sku && (
                          <span style={{ ...mono, fontSize: 10, color: itemColor,
                            background: 'var(--surface-3)', padding: '2px 6px', borderRadius: 4 }}>
                            {row.sku}
                          </span>
                        )}
                      </td>
                    )}
                    <td style={{ padding: '9px 12px', textAlign: 'right', ...mono, color: 'var(--text-2)', fontSize: 12 }}>
                      {formatQty(row.quantity)}
                    </td>
                    <td style={{ padding: '9px 12px', textAlign: 'right', ...mono, color: 'var(--text-3)', fontSize: 12 }}>
                      {formatRp(row.avg_price)}
                    </td>
                    <td style={{ padding: '9px 12px', textAlign: 'right', ...mono, color: 'var(--text)', fontSize: 12, fontWeight: 600 }}>
                      {formatRp(row.amount)}
                    </td>
                    <td style={{ padding: '9px 12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div style={{ flex: 1, height: 4, background: 'var(--surface-3)', borderRadius: 2, overflow: 'hidden' }}>
                          <div style={{ width: `${Math.min(pct, 100)}%`, height: '100%',
                            background: reportType === 'brand' ? brandColor : 'var(--info)',
                            borderRadius: 2, transition: 'width 0.3s ease' }} />
                        </div>
                        <span style={{ ...mono, fontSize: 10, color: 'var(--text-4)', minWidth: 32, textAlign: 'right' }}>
                          {pct.toFixed(1)}%
                        </span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {!loading && filtered.length > 0 && (
              <tfoot style={{ borderTop: '1px solid var(--border)', background: 'var(--surface-2)' }}>
                <tr>
                  <td colSpan={reportType === 'item' ? 3 : 2} style={{ padding: '8px 12px', ...mono, color: 'var(--text-3)', fontSize: 11, fontWeight: 600 }}>
                    TOTAL ({filtered.length} rows)
                  </td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', ...mono, color: 'var(--text-2)', fontWeight: 700 }}>
                    {formatQty(filtered.reduce((s, r) => s + r.quantity, 0))}
                  </td>
                  <td />
                  <td style={{ padding: '8px 12px', textAlign: 'right', ...mono, color: 'var(--text)', fontWeight: 700, fontSize: 13 }}>
                    {formatRp(filtered.reduce((s, r) => s + r.amount, 0))}
                  </td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        {!loading && reportType !== 'item' && (
          <p className="text-[var(--text-4)] text-xs mt-3">Based on bills in the selected period.</p>
        )}
      </div>
    </div>
  );
}
