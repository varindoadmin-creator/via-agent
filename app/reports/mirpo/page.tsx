'use client';

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────
type Period = 'this_month' | 'prev_month' | 'this_year' | 'prev_year' | 'custom';
type View   = 'summary' | 'monthly' | 'yearly' | 'by-po' | 'by-item';

type MirpoItem = {
  sku: string; name: string; qty_purchased: number; purchase_rate: number; purchase_cost: number;
  // FIFO-capped sold quantities
  sold_30d: number; sold_same_month: number; sold_same_year: number; sold_total: number;
  // Raw (uncapped) sold quantities for context
  raw_sales_30d: number; raw_sales_same_month: number; raw_sales_same_year: number;
  // Revenue per window
  revenue_30d: number; revenue_same_month: number; revenue_same_year: number; revenue_total: number;
  // Remaining per window
  remaining_30d: number; remaining_same_month: number; remaining_same_year: number; remaining: number;
  // Sell-through % per window (always <= 100)
  sell_through_30d_pct: number;
  sell_through_same_month_pct: number;
  sell_through_same_year_pct: number;
  // Financial / inventory
  gp_30d: number; gp_margin_30d_pct: number;
  stock_cover_months: number | null;
  last_sale_date: string; age_days?: number;
  inventory_value_remaining?: number;
  // Status
  stock_status: string;
  dead_stock?: boolean; slow_moving?: boolean; overstock?: boolean;
  reorder_freeze?: boolean; clearance_candidate?: boolean;
  clearance_discount_pct?: number; inventory_reduction_value?: number;
  reduction_priority?: string; reduction_action?: string; recommendation?: string;
  // Injected on client for context
  purchaseorder_number?: string; po_date?: string;
};

type MirpoRow = {
  purchaseorder_id: string; purchaseorder_number: string; reference_number: string;
  vendor_name: string; date: string; month: string; year: string; status: string;
  qty_purchased: number; crates: number; sheets_per_crate: number;
  sold_30d: number; sold_same_month: number; sold_same_year: number;
  remaining_30d: number; remaining_same_month: number; remaining_same_year: number; remaining: number;
  sell_through_30d_pct: number; sell_through_same_month_pct: number; sell_through_same_year_pct: number;
  purchase_cost: number;
  revenue_30d: number; revenue_same_month: number; revenue_same_year: number;
  gp_30d: number; gp_margin_30d_pct: number; roi_30d_pct: number;
  cash_locked_inventory?: number; potential_inventory_reduction_value?: number;
  dead_stock_value?: number; overstock_value?: number;
  dead_stock_sheets?: number; slow_moving_sheets?: number;
  inventory_reduction_recommendations?: MirpoItem[];
  items: MirpoItem[];
};

type MonthGroup = {
  month: string; mirpo_count: number; qty_purchased: number;
  sold_30d: number; sold_same_month: number; remaining_30d: number;
  sell_through_30d_pct: number; sell_through_same_month_pct: number;
  dead_stock_sheets: number; slow_moving_sheets: number;
};

type YearGroup = {
  year: string; mirpo_count: number; qty_purchased: number;
  sold_30d: number; sold_same_year: number;
  remaining_30d: number; remaining_same_year: number;
  sell_through_30d_pct: number; sell_through_same_year_pct: number;
  dead_stock_sheets: number; slow_moving_sheets: number;
};

type Summary = {
  mirpo_count: number; qty_purchased: number; crates: number;
  sold_30d: number; sold_same_month: number; sold_same_year: number;
  remaining_30d: number; remaining_same_month: number; remaining_same_year: number; remaining: number;
  purchase_cost: number; revenue_30d: number; gp_30d: number;
  sell_through_30d_pct: number; sell_through_same_month_pct: number; sell_through_same_year_pct: number;
  roi_30d_pct: number; gp_margin_30d_pct: number;
  cash_locked_inventory?: number; potential_inventory_reduction_value?: number;
  dead_stock_value?: number; overstock_value?: number;
  dead_stock_sheets?: number; slow_moving_sheets?: number;
  next_mirpo_recommendation?: {
    recommended_qty: number; note: string;
    items?: { sku: string; name: string; qty: number; reason: string }[];
  };
};

// ─── Format helpers ───────────────────────────────────────────────────────────
const mono = { fontFamily: 'JetBrains Mono, monospace' };
const fRp  = (v: number) => 'Rp ' + Math.round(v || 0).toLocaleString('id-ID');
const fQty = (v: number) => Math.round(v || 0).toLocaleString('id-ID');
const fPct = (v: number) => `${(Number(v) || 0).toFixed(1)}%`;

const PERIODS: { key: Period; label: string }[] = [
  { key: 'this_month', label: 'This Month'    },
  { key: 'prev_month', label: 'Prev Month'    },
  { key: 'this_year',  label: 'This Year'     },
  { key: 'prev_year',  label: 'Prev Year'     },
  { key: 'custom',     label: 'Custom Range'  },
];

// Default custom range starts from the MIRPO programme start date (1 March 2026).
const MIRPO_START = '2026-03-01';

const VIEWS: { key: View; label: string }[] = [
  { key: 'summary',  label: 'Summary'   },
  { key: 'monthly',  label: 'Monthly'   },
  { key: 'yearly',   label: 'Yearly'    },
  { key: 'by-po',    label: 'By PO'     },
  { key: 'by-item',  label: 'By Item'   },
];

// ─── Stock status badge ───────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const cls: Record<string, string> = {
    'Sold Out':        'bg-[var(--accent-bg,#e8f4fd)]   text-[var(--accent,#0ea5e9)]',
    'Fast Moving':     'bg-[var(--success-bg,#dcfce7)]  text-[var(--success,#16a34a)]',
    'Healthy':         'bg-[var(--info-bg,#e0f2fe)]     text-[var(--info,#0284c7)]',
    'Slow Moving':     'bg-[var(--warning-bg,#fef9c3)]  text-[var(--warning,#ca8a04)]',
    'Dead Stock Risk': 'bg-[var(--danger-bg,#fee2e2)]   text-[var(--danger,#dc2626)]',
  };
  return (
    <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${cls[status] || 'bg-[var(--surface-2)] text-[var(--text-3)]'}`}>
      {status}
    </span>
  );
}

// ─── Summary card ─────────────────────────────────────────────────────────────
function Card({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className="via-card p-4">
      <div className="text-[var(--text-4)] text-xs uppercase tracking-wider mb-1">{label}</div>
      <div className={`font-bold text-lg ${accent ? 'text-[var(--accent)]' : 'text-[var(--text)]'}`} style={mono}>{value}</div>
      {sub && <div className="text-[var(--text-4)] text-xs mt-1">{sub}</div>}
    </div>
  );
}

// ─── Page component ───────────────────────────────────────────────────────────
export default function MirpoAnalysisPage() {
  const [period, setPeriod]       = useState<Period>('this_year');
  const [customFrom, setCustomFrom] = useState(MIRPO_START);
  const [customTo,   setCustomTo]   = useState(() => new Date().toISOString().slice(0, 10));
  const [view, setView]           = useState<View>('summary');
  const [rows, setRows]           = useState<MirpoRow[]>([]);
  const [monthly, setMonthly]     = useState<MonthGroup[]>([]);
  const [yearly, setYearly]       = useState<YearGroup[]>([]);
  const [summary, setSummary]     = useState<Summary | null>(null);
  const [dateRange, setDateRange] = useState('');
  const [inventoryRecommendations, setInventoryRecommendations] = useState<MirpoItem[]>([]);
  const [expanded, setExpanded]   = useState('');
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');

  // Filters for By-Item view
  const [filterSku, setFilterSku]       = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterPo, setFilterPo]         = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const url = period === 'custom'
        ? `/api/reports/mirpo?period=custom&from=${customFrom}&to=${customTo}`
        : `/api/reports/mirpo?period=${period}`;
      const res  = await fetch(url);
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Failed to load MIRPO analysis');
      setRows(data.rows || []);
      setMonthly(data.monthly || []);
      setYearly(data.yearly || []);
      setSummary(data.summary || null);
      setInventoryRecommendations(data.inventory_reduction_recommendations || []);
      setDateRange(data.from && data.to ? `${data.from} – ${data.to}` : '');
    } catch (e) { setError(String(e)); }
    finally { setLoading(false); }
  }, [period, customFrom, customTo]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const allItems = useMemo(() =>
    rows.flatMap(r => r.items.map(i => ({ ...i, purchaseorder_number: r.purchaseorder_number, po_date: r.date }))),
    [rows],
  );

  const filteredItems = useMemo(() => {
    let items = allItems;
    if (filterSku)    items = items.filter(i => (i.sku + ' ' + i.name).toLowerCase().includes(filterSku.toLowerCase()));
    if (filterStatus) items = items.filter(i => i.stock_status === filterStatus);
    if (filterPo)     items = items.filter(i => (i.purchaseorder_number || '').includes(filterPo));
    return items;
  }, [allItems, filterSku, filterStatus, filterPo]);

  const fastest    = useMemo(() => [...allItems].sort((a, b) => b.sold_30d - a.sold_30d).slice(0, 5), [allItems]);
  const slowest    = useMemo(() => [...allItems].sort((a, b) => a.sell_through_30d_pct - b.sell_through_30d_pct || b.remaining - a.remaining).slice(0, 5), [allItems]);
  const freezeList = useMemo(() => inventoryRecommendations.filter(i => i.reorder_freeze).slice(0, 8), [inventoryRecommendations]);
  const clearList  = useMemo(() => inventoryRecommendations.filter(i => i.clearance_candidate).slice(0, 8), [inventoryRecommendations]);

  return (
    <div className="via-page" style={{ background: 'var(--bg)', minHeight: '100%' }}>
      <div style={{ maxWidth: 1440, margin: '0 auto' }}>

        {/* Header */}
        <div className="flex items-start justify-between mb-5">
          <div>
            <h1 className="text-[var(--text)] font-semibold text-2xl tracking-tight">MIRPO Analysis</h1>
            <p className="text-[var(--text-3)] text-sm mt-0.5">
              Monthly Inventory Replenishment Purchase Orders · {dateRange || 'Loading…'}
            </p>
          </div>
          <button onClick={fetchData} disabled={loading}
            className="px-3 py-1.5 text-xs bg-[var(--surface-2)] hover:bg-[var(--surface-3)] text-[var(--text-3)] rounded-lg border border-[var(--border)] transition-colors disabled:opacity-50"
            style={mono}>
            {loading ? '…' : '↻ Refresh'}
          </button>
        </div>

        {/* Period selector */}
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          {PERIODS.map(p => (
            <button key={p.key} onClick={() => setPeriod(p.key)}
              className={`px-4 py-1.5 text-xs font-medium rounded-lg border transition-all ${period === p.key ? 'bg-[var(--accent)] text-white border-[var(--accent)]' : 'bg-[var(--surface-2)] text-[var(--text-3)] border-[var(--border)] hover:bg-[var(--surface-3)]'}`}>
              {p.label}
            </button>
          ))}
          {period === 'custom' && (
            <div className="flex items-center gap-2 ml-2">
              <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
                className="px-2 py-1 text-xs bg-[var(--surface-2)] border border-[var(--border)] rounded-lg text-[var(--text)] outline-none focus:border-[var(--accent)]"
                style={mono} />
              <span className="text-[var(--text-4)] text-xs">to</span>
              <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
                className="px-2 py-1 text-xs bg-[var(--surface-2)] border border-[var(--border)] rounded-lg text-[var(--text)] outline-none focus:border-[var(--accent)]"
                style={mono} />
              <button onClick={fetchData} disabled={loading}
                className="px-3 py-1 text-xs bg-[var(--accent)] text-white rounded-lg border border-[var(--accent)] disabled:opacity-50">
                Apply
              </button>
            </div>
          )}
        </div>

        {/* View tabs */}
        <div className="flex items-center gap-1 mb-5 border-b border-[var(--border)]">
          {VIEWS.map(v => (
            <button key={v.key} onClick={() => setView(v.key)}
              className={`px-4 py-2 text-xs font-medium transition-all border-b-2 -mb-px ${view === v.key ? 'text-[var(--accent)] border-[var(--accent)]' : 'text-[var(--text-3)] border-transparent hover:text-[var(--text)]'}`}>
              {v.label}
            </button>
          ))}
        </div>

        {error && (
          <div className="p-4 mb-4 bg-[var(--danger-bg)] border border-[var(--danger-border)] rounded-lg text-[var(--danger)] text-sm">{error}</div>
        )}

        {/* ══ VIEW: Summary ════════════════════════════════════════════════════ */}
        {view === 'summary' && (
          <>
            {summary && (
              <>
                {/* Row 1: Sell-through across all three windows */}
                <div className="grid grid-cols-4 gap-3 mb-3">
                  <Card label="MIRPO Total Qty"
                    value={`${fQty(summary.qty_purchased)} sht`}
                    sub={`${summary.mirpo_count} MIRPO × 600 sheets`} />
                  <Card label="30D Sell-Through"
                    value={fPct(summary.sell_through_30d_pct)}
                    sub={`${fQty(summary.sold_30d)} sht sold within 30 days of PO`}
                    accent />
                  <Card label="Same-Month Sell-Through"
                    value={fPct(summary.sell_through_same_month_pct)}
                    sub={`${fQty(summary.sold_same_month)} sht sold in PO's calendar month`}
                    accent />
                  <Card label="Same-Year Sell-Through"
                    value={fPct(summary.sell_through_same_year_pct)}
                    sub={`${fQty(summary.sold_same_year)} sht sold in PO's calendar year`}
                    accent />
                </div>

                {/* Row 2: Inventory health */}
                <div className="grid grid-cols-4 gap-3 mb-5">
                  <Card label="Cash Locked"
                    value={fRp(summary.cash_locked_inventory || 0)}
                    sub="Remaining MIRPO stock value" />
                  <Card label="Potential Reduction"
                    value={fRp(summary.potential_inventory_reduction_value || 0)}
                    sub="Freeze + clearance candidates"
                    accent />
                  <Card label="Dead Stock Value"
                    value={fRp(summary.dead_stock_value || 0)}
                    sub={`${fQty(summary.dead_stock_sheets || 0)} sht — 0 sales ≥60 days`} />
                  <Card label="Next MIRPO Policy Qty"
                    value={`${fQty(summary.next_mirpo_recommendation?.recommended_qty || 600)} sht`}
                    sub="Must total 600 sheets per brand policy"
                    accent />
                </div>
              </>
            )}

            {/* Next MIRPO recommendation */}
            {summary?.next_mirpo_recommendation && (
              <div className="via-card p-4 mb-5">
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-[var(--text)] font-semibold text-sm">Next MIRPO Recommendation — 600 Sheets</h2>
                  <span className="text-[var(--text-4)] text-xs">Based on 30D velocity, remaining stock, sell-through, and stock cover</span>
                </div>
                <p className="text-[var(--text-4)] text-xs mb-3">{summary.next_mirpo_recommendation.note}</p>
                {(summary.next_mirpo_recommendation.items?.length ?? 0) > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-[var(--text-4)] uppercase tracking-wider border-b border-[var(--border)]">
                          <th className="py-2 text-left">Item</th>
                          <th className="py-2 text-right">Qty</th>
                          <th className="py-2 text-left">Reason</th>
                        </tr>
                      </thead>
                      <tbody>
                        {summary.next_mirpo_recommendation.items!.map((item, idx) => (
                          <tr key={`${item.sku || item.name}-${idx}`} className="border-b border-[var(--border)] last:border-0">
                            <td className="py-2">
                              <div className="text-[var(--text)] font-medium">{item.sku || item.name}</div>
                              <div className="text-[var(--text-4)]">{item.name}</div>
                            </td>
                            <td className="py-2 text-right text-[var(--accent)] font-bold" style={mono}>{fQty(item.qty)} sht</td>
                            <td className="py-2 text-[var(--text-3)]">{item.reason}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t border-[var(--border)] text-[var(--text)] font-semibold">
                          <td className="py-2">Total</td>
                          <td className="py-2 text-right" style={mono}>
                            {fQty(summary.next_mirpo_recommendation.items!.reduce((s, i) => s + i.qty, 0))} sht
                          </td>
                          <td className="py-2 text-[var(--text-4)]">Must equal 600 sheets</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                ) : (
                  <p className="text-[var(--text-4)] text-xs">No item allocation yet. Check sales velocity or review manually.</p>
                )}
              </div>
            )}

            {/* Fastest / Slowest */}
            <div className="grid grid-cols-2 gap-4 mb-5">
              <div className="via-card p-4">
                <h2 className="text-[var(--text)] font-semibold text-sm mb-3">Fastest Moving Items (30D)</h2>
                {fastest.length === 0 ? <p className="text-[var(--text-4)] text-xs">No sales yet.</p> : fastest.map((i, idx) => (
                  <div key={`${i.purchaseorder_number}-${i.sku}-fast-${idx}`}
                    className="flex justify-between py-2 border-b border-[var(--border)] last:border-0 text-xs">
                    <div>
                      <div className="text-[var(--text)] font-medium">{i.sku || i.name}</div>
                      <div className="text-[var(--text-4)]">{i.name}</div>
                    </div>
                    <div className="text-right" style={mono}>
                      <div className="text-[var(--accent)] font-bold">{fQty(i.sold_30d)} sht</div>
                      <div className="text-[var(--text-4)]">{fPct(i.sell_through_30d_pct)} 30D</div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="via-card p-4">
                <h2 className="text-[var(--text)] font-semibold text-sm mb-3">Slow / Dead Stock Risk</h2>
                {slowest.length === 0 ? <p className="text-[var(--text-4)] text-xs">No MIRPO items.</p> : slowest.map((i, idx) => (
                  <div key={`${i.purchaseorder_number}-${i.sku}-slow-${idx}`}
                    className="flex justify-between py-2 border-b border-[var(--border)] last:border-0 text-xs">
                    <div>
                      <div className="text-[var(--text)] font-medium">{i.sku || i.name}</div>
                      <div className="mt-0.5"><StatusBadge status={i.stock_status} /></div>
                    </div>
                    <div className="text-right" style={mono}>
                      <div className="text-[var(--warning)] font-bold">{fQty(i.remaining)} left</div>
                      <div className="text-[var(--text-4)]">{fQty(i.sold_30d)} sold 30D</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Inventory reduction table */}
            <div className="via-card p-4 mb-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-[var(--text)] font-semibold text-sm">Inventory Reduction Recommendations</h2>
                <span className="text-[var(--text-4)] text-xs">Prioritised by cash locked, age, sell-through, and stock cover</span>
              </div>
              {inventoryRecommendations.length === 0 ? (
                <p className="text-[var(--text-4)] text-xs">No inventory reduction risk detected for this period.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-[var(--text-4)] uppercase tracking-wider border-b border-[var(--border)]">
                        <th className="py-2 text-left">Priority</th>
                        <th className="py-2 text-left">Item</th>
                        <th className="py-2 text-right">Left</th>
                        <th className="py-2 text-right">Cash Locked</th>
                        <th className="py-2 text-right">Age</th>
                        <th className="py-2 text-right">30D ST%</th>
                        <th className="py-2 text-left">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {inventoryRecommendations.slice(0, 12).map((i, idx) => (
                        <tr key={`${i.purchaseorder_number || 'po'}-${i.sku || i.name}-${idx}`}
                          className="border-b border-[var(--border)] last:border-0">
                          <td className="py-2">
                            <span className={`px-2 py-1 rounded text-[10px] font-medium ${i.reduction_priority === 'High' ? 'bg-[var(--danger-bg)] text-[var(--danger)]' : i.reduction_priority === 'Medium' ? 'bg-[var(--warning-bg)] text-[var(--warning)]' : 'bg-[var(--surface-2)] text-[var(--text-3)]'}`}>
                              {i.reduction_priority || 'Low'}
                            </span>
                          </td>
                          <td className="py-2">
                            <div className="text-[var(--text)] font-medium">{i.sku || i.name}</div>
                            <div className="text-[var(--text-4)]">{i.name}</div>
                            <div className="text-[var(--text-4)]">{i.purchaseorder_number}</div>
                          </td>
                          <td className="py-2 text-right" style={mono}>{fQty(i.remaining)}</td>
                          <td className="py-2 text-right" style={mono}>{fRp(i.inventory_value_remaining || 0)}</td>
                          <td className="py-2 text-right" style={mono}>{fQty(i.age_days || 0)}d</td>
                          <td className="py-2 text-right" style={mono}>{fPct(i.sell_through_30d_pct)}</td>
                          <td className="py-2 text-[var(--text-3)]">{i.reduction_action || i.recommendation}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Reorder freeze / clearance */}
            <div className="grid grid-cols-2 gap-4 mb-5">
              <div className="via-card p-4">
                <h2 className="text-[var(--text)] font-semibold text-sm mb-3">Reorder Freeze List</h2>
                {freezeList.length === 0 ? <p className="text-[var(--text-4)] text-xs">No freeze candidates.</p> : freezeList.map((i, idx) => (
                  <div key={`${i.sku || i.name}-freeze-${idx}`}
                    className="flex justify-between py-2 border-b border-[var(--border)] last:border-0 text-xs">
                    <div>
                      <div className="text-[var(--text)] font-medium">{i.sku || i.name}</div>
                      <div className="text-[var(--text-4)]">{i.recommendation}</div>
                    </div>
                    <div className="text-right" style={mono}>
                      <div className="text-[var(--warning)] font-bold">{fQty(i.remaining)} left</div>
                      <div className="text-[var(--text-4)]">{fRp(i.inventory_value_remaining || 0)}</div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="via-card p-4">
                <h2 className="text-[var(--text)] font-semibold text-sm mb-3">Clearance Candidates</h2>
                {clearList.length === 0 ? <p className="text-[var(--text-4)] text-xs">No clearance candidates.</p> : clearList.map((i, idx) => (
                  <div key={`${i.sku || i.name}-clear-${idx}`}
                    className="flex justify-between py-2 border-b border-[var(--border)] last:border-0 text-xs">
                    <div>
                      <div className="text-[var(--text)] font-medium">{i.sku || i.name}</div>
                      <div className="text-[var(--text-4)]">{i.reduction_action}</div>
                    </div>
                    <div className="text-right" style={mono}>
                      <div className="text-[var(--accent)] font-bold">{fQty(i.clearance_discount_pct || 0)}%</div>
                      <div className="text-[var(--text-4)]">suggested discount</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <p className="text-[var(--text-4)] text-xs mt-2 mb-4">
              MIRPO identified by PO reference or number containing "MIRPO". Wooden crate/packing lines are excluded from all sheet counts. Each MIRPO is expected to be 600 sheets by brand policy. Sell-through is capped at 100% per MIRPO item and computed via FIFO allocation — the same sale unit is not counted across multiple MIRPOs for the same SKU.
            </p>
          </>
        )}

        {/* ══ VIEW: Monthly Analysis ═══════════════════════════════════════════ */}
        {view === 'monthly' && (
          <div className="via-card overflow-hidden mb-5">
            <div className="p-4 border-b border-[var(--border)]">
              <h2 className="text-[var(--text)] font-semibold text-sm">Monthly Analysis</h2>
              <p className="text-[var(--text-4)] text-xs mt-1">
                Sell-through within 30 days of PO date vs. within the same calendar month as PO date.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ background: 'var(--surface-2)', color: 'var(--text-3)' }}>
                    <th className="p-3 text-left uppercase tracking-wider">Month</th>
                    <th className="p-3 text-right uppercase tracking-wider">MIRPOs</th>
                    <th className="p-3 text-right uppercase tracking-wider">Purchased</th>
                    <th className="p-3 text-right uppercase tracking-wider">Sold 30D</th>
                    <th className="p-3 text-right uppercase tracking-wider text-[var(--accent)]">30D ST%</th>
                    <th className="p-3 text-right uppercase tracking-wider">Sold Same Month</th>
                    <th className="p-3 text-right uppercase tracking-wider text-[var(--accent)]">Month ST%</th>
                    <th className="p-3 text-right uppercase tracking-wider">Remaining 30D</th>
                    <th className="p-3 text-right uppercase tracking-wider">Dead Stock</th>
                    <th className="p-3 text-right uppercase tracking-wider">Slow Moving</th>
                  </tr>
                </thead>
                <tbody>
                  {loading && <tr><td colSpan={10} className="p-6 text-center text-[var(--text-4)]">Loading…</td></tr>}
                  {!loading && monthly.length === 0 && <tr><td colSpan={10} className="p-6 text-center text-[var(--text-4)]">No MIRPO data for this period.</td></tr>}
                  {monthly.map(g => (
                    <tr key={g.month} className="border-b border-[var(--border)] hover:bg-[var(--surface-2)]">
                      <td className="p-3 font-semibold text-[var(--text)]" style={mono}>{g.month}</td>
                      <td className="p-3 text-right" style={mono}>{g.mirpo_count}</td>
                      <td className="p-3 text-right" style={mono}>{fQty(g.qty_purchased)} sht</td>
                      <td className="p-3 text-right" style={mono}>{fQty(g.sold_30d)}</td>
                      <td className="p-3 text-right font-bold text-[var(--accent)]" style={mono}>{fPct(g.sell_through_30d_pct)}</td>
                      <td className="p-3 text-right" style={mono}>{fQty(g.sold_same_month)}</td>
                      <td className="p-3 text-right font-bold text-[var(--accent)]" style={mono}>{fPct(g.sell_through_same_month_pct)}</td>
                      <td className="p-3 text-right" style={mono}>{fQty(g.remaining_30d)}</td>
                      <td className="p-3 text-right text-[var(--danger)]" style={mono}>{fQty(g.dead_stock_sheets)}</td>
                      <td className="p-3 text-right text-[var(--warning)]" style={mono}>{fQty(g.slow_moving_sheets)}</td>
                    </tr>
                  ))}
                </tbody>
                {monthly.length > 1 && (
                  <tfoot>
                    <tr className="border-t-2 border-[var(--border)] font-semibold text-[var(--text)]" style={{ background: 'var(--surface-1)' }}>
                      <td className="p-3">Total</td>
                      <td className="p-3 text-right" style={mono}>{monthly.reduce((s, g) => s + g.mirpo_count, 0)}</td>
                      <td className="p-3 text-right" style={mono}>{fQty(monthly.reduce((s, g) => s + g.qty_purchased, 0))} sht</td>
                      <td className="p-3 text-right" style={mono}>{fQty(monthly.reduce((s, g) => s + g.sold_30d, 0))}</td>
                      <td className="p-3 text-right text-[var(--accent)]" style={mono}>{fPct(summary?.sell_through_30d_pct || 0)}</td>
                      <td className="p-3 text-right" style={mono}>{fQty(monthly.reduce((s, g) => s + g.sold_same_month, 0))}</td>
                      <td className="p-3 text-right text-[var(--accent)]" style={mono}>{fPct(summary?.sell_through_same_month_pct || 0)}</td>
                      <td className="p-3 text-right" style={mono}>{fQty(monthly.reduce((s, g) => s + g.remaining_30d, 0))}</td>
                      <td className="p-3 text-right text-[var(--danger)]" style={mono}>{fQty(monthly.reduce((s, g) => s + g.dead_stock_sheets, 0))}</td>
                      <td className="p-3 text-right text-[var(--warning)]" style={mono}>{fQty(monthly.reduce((s, g) => s + g.slow_moving_sheets, 0))}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        )}

        {/* ══ VIEW: Yearly Analysis ════════════════════════════════════════════ */}
        {view === 'yearly' && (
          <div className="via-card overflow-hidden mb-5">
            <div className="p-4 border-b border-[var(--border)]">
              <h2 className="text-[var(--text)] font-semibold text-sm">Yearly Analysis</h2>
              <p className="text-[var(--text-4)] text-xs mt-1">
                Sell-through within 30 days of PO date vs. within the same calendar year as PO date.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ background: 'var(--surface-2)', color: 'var(--text-3)' }}>
                    <th className="p-3 text-left uppercase tracking-wider">Year</th>
                    <th className="p-3 text-right uppercase tracking-wider">MIRPOs</th>
                    <th className="p-3 text-right uppercase tracking-wider">Purchased</th>
                    <th className="p-3 text-right uppercase tracking-wider">Sold 30D</th>
                    <th className="p-3 text-right uppercase tracking-wider text-[var(--accent)]">30D ST%</th>
                    <th className="p-3 text-right uppercase tracking-wider">Sold Same Year</th>
                    <th className="p-3 text-right uppercase tracking-wider text-[var(--accent)]">Year ST%</th>
                    <th className="p-3 text-right uppercase tracking-wider">Remaining (Year)</th>
                    <th className="p-3 text-right uppercase tracking-wider">Dead Stock</th>
                    <th className="p-3 text-right uppercase tracking-wider">Slow Moving</th>
                  </tr>
                </thead>
                <tbody>
                  {loading && <tr><td colSpan={10} className="p-6 text-center text-[var(--text-4)]">Loading…</td></tr>}
                  {!loading && yearly.length === 0 && <tr><td colSpan={10} className="p-6 text-center text-[var(--text-4)]">No MIRPO data for this period.</td></tr>}
                  {yearly.map(g => (
                    <tr key={g.year} className="border-b border-[var(--border)] hover:bg-[var(--surface-2)]">
                      <td className="p-3 font-semibold text-[var(--text)]" style={mono}>{g.year}</td>
                      <td className="p-3 text-right" style={mono}>{g.mirpo_count}</td>
                      <td className="p-3 text-right" style={mono}>{fQty(g.qty_purchased)} sht</td>
                      <td className="p-3 text-right" style={mono}>{fQty(g.sold_30d)}</td>
                      <td className="p-3 text-right font-bold text-[var(--accent)]" style={mono}>{fPct(g.sell_through_30d_pct)}</td>
                      <td className="p-3 text-right" style={mono}>{fQty(g.sold_same_year)}</td>
                      <td className="p-3 text-right font-bold text-[var(--accent)]" style={mono}>{fPct(g.sell_through_same_year_pct)}</td>
                      <td className="p-3 text-right" style={mono}>{fQty(g.remaining_same_year)}</td>
                      <td className="p-3 text-right text-[var(--danger)]" style={mono}>{fQty(g.dead_stock_sheets)}</td>
                      <td className="p-3 text-right text-[var(--warning)]" style={mono}>{fQty(g.slow_moving_sheets)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ══ VIEW: Detail by PO ═══════════════════════════════════════════════ */}
        {view === 'by-po' && (
          <div className="via-card overflow-hidden mb-5">
            <div className="p-4 border-b border-[var(--border)]">
              <h2 className="text-[var(--text)] font-semibold text-sm">MIRPO Detail by Purchase Order</h2>
              <p className="text-[var(--text-4)] text-xs mt-1">
                Click a row to expand item breakdown. Crate lines excluded. Sell-through capped at 100% per item via FIFO.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ background: 'var(--surface-2)', color: 'var(--text-3)' }}>
                    <th className="p-3 text-left text-xs uppercase tracking-wider">PO</th>
                    <th className="p-3 text-left text-xs uppercase tracking-wider">Date</th>
                    <th className="p-3 text-right text-xs uppercase tracking-wider">Purchased</th>
                    <th className="p-3 text-right text-xs uppercase tracking-wider">Sold 30D</th>
                    <th className="p-3 text-right text-xs uppercase tracking-wider text-[var(--accent)]">30D ST%</th>
                    <th className="p-3 text-right text-xs uppercase tracking-wider">Sold Month</th>
                    <th className="p-3 text-right text-xs uppercase tracking-wider text-[var(--accent)]">Month ST%</th>
                    <th className="p-3 text-right text-xs uppercase tracking-wider">Remaining</th>
                    <th className="p-3 text-right text-xs uppercase tracking-wider">GP 30D</th>
                    <th className="p-3 text-right text-xs uppercase tracking-wider">ROI</th>
                  </tr>
                </thead>
                <tbody>
                  {loading && <tr><td colSpan={10} className="p-6 text-center text-[var(--text-4)]">Loading MIRPO analysis…</td></tr>}
                  {!loading && rows.length === 0 && <tr><td colSpan={10} className="p-6 text-center text-[var(--text-4)]">No MIRPO PO found. Put MIRPO in the PO reference field.</td></tr>}
                  {rows.map(row => (
                    <Fragment key={row.purchaseorder_id}>
                      <tr onClick={() => setExpanded(expanded === row.purchaseorder_id ? '' : row.purchaseorder_id)}
                        className="cursor-pointer hover:bg-[var(--surface-2)] border-b border-[var(--border)]">
                        <td className="p-3">
                          <span className="text-[var(--accent)] mr-1.5">{expanded === row.purchaseorder_id ? '−' : '+'}</span>
                          <span className="font-semibold text-[var(--text)]">{row.purchaseorder_number}</span>
                          <div className="text-[var(--text-4)] text-xs">Ref: {row.reference_number || 'MIRPO'}</div>
                        </td>
                        <td className="p-3 text-[var(--text-3)]" style={mono}>{row.date}</td>
                        <td className="p-3 text-right" style={mono}>
                          {fQty(row.qty_purchased)} sht
                          <div className="text-[var(--text-4)] text-xs">{row.items.length} items</div>
                        </td>
                        <td className="p-3 text-right" style={mono}>{fQty(row.sold_30d)}</td>
                        <td className="p-3 text-right font-bold text-[var(--accent)]" style={mono}>{fPct(row.sell_through_30d_pct)}</td>
                        <td className="p-3 text-right" style={mono}>{fQty(row.sold_same_month)}</td>
                        <td className="p-3 text-right font-bold text-[var(--accent)]" style={mono}>{fPct(row.sell_through_same_month_pct)}</td>
                        <td className="p-3 text-right" style={mono}>{fQty(row.remaining)}</td>
                        <td className="p-3 text-right" style={mono}>{fRp(row.gp_30d)}</td>
                        <td className="p-3 text-right" style={mono}>{fPct(row.roi_30d_pct)}</td>
                      </tr>

                      {expanded === row.purchaseorder_id && (
                        <tr>
                          <td colSpan={10} className="p-0 bg-[var(--surface-1)]">
                            <div className="p-4">
                              <h3 className="text-[var(--text)] font-semibold text-xs uppercase tracking-wider mb-3">
                                Items — {row.purchaseorder_number} · {row.date}
                              </h3>
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="text-[var(--text-4)] uppercase tracking-wider border-b border-[var(--border)]">
                                    <th className="py-2 text-left">Item</th>
                                    <th className="py-2 text-left">Status</th>
                                    <th className="py-2 text-right">Bought</th>
                                    <th className="py-2 text-right">Sold 30D</th>
                                    <th className="py-2 text-right" title="Raw invoiced qty in 30D window before MIRPO cap">Raw 30D</th>
                                    <th className="py-2 text-right">30D ST%</th>
                                    <th className="py-2 text-right">Month ST%</th>
                                    <th className="py-2 text-right">Remaining</th>
                                    <th className="py-2 text-right">Cash Locked</th>
                                    <th className="py-2 text-left">Recommendation</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {row.items.map(i => (
                                    <tr key={`${row.purchaseorder_id}-${i.sku}-${i.name}`}
                                      className="border-b border-[var(--border)] last:border-0">
                                      <td className="py-2">
                                        <div className="text-[var(--text)] font-medium">{i.sku || i.name}</div>
                                        <div className="text-[var(--text-4)]">{i.name}</div>
                                      </td>
                                      <td className="py-2"><StatusBadge status={i.stock_status} /></td>
                                      <td className="py-2 text-right" style={mono}>{fQty(i.qty_purchased)}</td>
                                      <td className="py-2 text-right" style={mono}>{fQty(i.sold_30d)}</td>
                                      <td className="py-2 text-right text-[var(--text-4)]" style={mono}>{fQty(i.raw_sales_30d)}</td>
                                      <td className="py-2 text-right font-bold text-[var(--accent)]" style={mono}>{fPct(i.sell_through_30d_pct)}</td>
                                      <td className="py-2 text-right" style={mono}>{fPct(i.sell_through_same_month_pct)}</td>
                                      <td className="py-2 text-right" style={mono}>{fQty(i.remaining)}</td>
                                      <td className="py-2 text-right" style={mono}>{fRp(i.inventory_value_remaining || 0)}</td>
                                      <td className="py-2 text-[var(--text-3)]">
                                        <div>{i.recommendation}</div>
                                        {i.reduction_action && <div className="text-[var(--text-4)] mt-0.5">{i.reduction_action}</div>}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ══ VIEW: Detail by Item ═════════════════════════════════════════════ */}
        {view === 'by-item' && (
          <>
            <div className="via-card p-4 mb-4">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-[var(--text-4)] text-xs uppercase tracking-wider mb-1 block">SKU / Name</label>
                  <input value={filterSku} onChange={e => setFilterSku(e.target.value)}
                    placeholder="Search SKU or name…"
                    className="w-full px-3 py-2 text-xs bg-[var(--surface-2)] border border-[var(--border)] rounded-lg text-[var(--text)] placeholder:text-[var(--text-4)] outline-none focus:border-[var(--accent)]" />
                </div>
                <div>
                  <label className="text-[var(--text-4)] text-xs uppercase tracking-wider mb-1 block">Stock Status</label>
                  <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-[var(--surface-2)] border border-[var(--border)] rounded-lg text-[var(--text)] outline-none focus:border-[var(--accent)]">
                    <option value="">All Statuses</option>
                    <option>Sold Out</option>
                    <option>Fast Moving</option>
                    <option>Healthy</option>
                    <option>Slow Moving</option>
                    <option>Dead Stock Risk</option>
                  </select>
                </div>
                <div>
                  <label className="text-[var(--text-4)] text-xs uppercase tracking-wider mb-1 block">PO Number</label>
                  <input value={filterPo} onChange={e => setFilterPo(e.target.value)}
                    placeholder="Filter by PO…"
                    className="w-full px-3 py-2 text-xs bg-[var(--surface-2)] border border-[var(--border)] rounded-lg text-[var(--text)] placeholder:text-[var(--text-4)] outline-none focus:border-[var(--accent)]" />
                </div>
              </div>
              <p className="text-[var(--text-4)] text-xs mt-2">{filteredItems.length.toLocaleString()} items</p>
            </div>

            <div className="via-card overflow-hidden mb-5">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr style={{ background: 'var(--surface-2)', color: 'var(--text-3)' }}>
                      <th className="p-3 text-left uppercase tracking-wider">Item</th>
                      <th className="p-3 text-left uppercase tracking-wider">PO</th>
                      <th className="p-3 text-left uppercase tracking-wider">Status</th>
                      <th className="p-3 text-right uppercase tracking-wider">Bought</th>
                      <th className="p-3 text-right uppercase tracking-wider">Sold 30D</th>
                      <th className="p-3 text-right uppercase tracking-wider" title="Raw invoiced qty in 30D window before MIRPO cap">Raw 30D</th>
                      <th className="p-3 text-right uppercase tracking-wider text-[var(--accent)]">30D ST%</th>
                      <th className="p-3 text-right uppercase tracking-wider text-[var(--accent)]">Month ST%</th>
                      <th className="p-3 text-right uppercase tracking-wider text-[var(--accent)]">Year ST%</th>
                      <th className="p-3 text-right uppercase tracking-wider">Remaining</th>
                      <th className="p-3 text-right uppercase tracking-wider">Last Sale</th>
                      <th className="p-3 text-left uppercase tracking-wider">Recommendation</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading && <tr><td colSpan={12} className="p-6 text-center text-[var(--text-4)]">Loading…</td></tr>}
                    {!loading && filteredItems.length === 0 && (
                      <tr><td colSpan={12} className="p-6 text-center text-[var(--text-4)]">
                        {allItems.length === 0 ? 'No MIRPO items found.' : 'No items match the current filters.'}
                      </td></tr>
                    )}
                    {filteredItems.map((i, idx) => (
                      <tr key={`${i.purchaseorder_number}-${i.sku || i.name}-${idx}`}
                        className="border-b border-[var(--border)] hover:bg-[var(--surface-2)]">
                        <td className="p-3">
                          <div className="text-[var(--text)] font-medium">{i.sku || i.name}</div>
                          <div className="text-[var(--text-4)]">{i.name}</div>
                        </td>
                        <td className="p-3 text-[var(--text-3)]" style={mono}>
                          <div>{i.purchaseorder_number}</div>
                          <div className="text-[var(--text-4)]">{i.po_date}</div>
                        </td>
                        <td className="p-3"><StatusBadge status={i.stock_status} /></td>
                        <td className="p-3 text-right" style={mono}>{fQty(i.qty_purchased)}</td>
                        <td className="p-3 text-right" style={mono}>{fQty(i.sold_30d)}</td>
                        <td className="p-3 text-right text-[var(--text-4)]" style={mono}
                          title="Raw invoiced qty in 30D window. If Raw 30D > Sold 30D, the MIRPO cap was applied.">
                          {fQty(i.raw_sales_30d)}
                        </td>
                        <td className="p-3 text-right font-bold text-[var(--accent)]" style={mono}>{fPct(i.sell_through_30d_pct)}</td>
                        <td className="p-3 text-right font-bold text-[var(--accent)]" style={mono}>{fPct(i.sell_through_same_month_pct)}</td>
                        <td className="p-3 text-right font-bold text-[var(--accent)]" style={mono}>{fPct(i.sell_through_same_year_pct)}</td>
                        <td className="p-3 text-right" style={mono}>{fQty(i.remaining)}</td>
                        <td className="p-3 text-right text-[var(--text-3)]" style={mono}>{i.last_sale_date || '—'}</td>
                        <td className="p-3 text-[var(--text-3)]">
                          <div>{i.recommendation}</div>
                          {i.reduction_action && <div className="text-[var(--text-4)] mt-0.5 text-[10px]">{i.reduction_action}</div>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

      </div>
    </div>
  );
}
