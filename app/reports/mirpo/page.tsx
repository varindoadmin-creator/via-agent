'use client';

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';

type Period = 'this_month' | 'prev_month' | 'this_year' | 'prev_year';
type MirpoItem = {
  sku: string; name: string; qty_purchased: number; purchase_rate: number; purchase_cost: number;
  sold_30d: number; sold_total: number; remaining: number; sell_through_30d_pct: number;
  revenue_30d: number; gp_30d: number; gp_margin_30d_pct: number; stock_cover_months: number | null;
  last_sale_date: string; recommendation: string;
  age_days?: number; inventory_value_remaining?: number; dead_stock?: boolean; slow_moving?: boolean; overstock?: boolean;
  reorder_freeze?: boolean; clearance_candidate?: boolean; clearance_discount_pct?: number; inventory_reduction_value?: number;
  reduction_priority?: string; reduction_action?: string; purchaseorder_number?: string; po_date?: string;
};
type MirpoRow = {
  purchaseorder_id: string; purchaseorder_number: string; reference_number: string; vendor_name: string; date: string; status: string;
  qty_purchased: number; crates: number; sheets_per_crate: number; sold_30d: number; sold_total: number; remaining: number;
  sell_through_30d_pct: number; purchase_cost: number; revenue_30d: number; gp_30d: number; gp_margin_30d_pct: number; roi_30d_pct: number;
  cash_locked_inventory?: number; potential_inventory_reduction_value?: number; dead_stock_value?: number; overstock_value?: number;
  inventory_reduction_recommendations?: MirpoItem[];
  items: MirpoItem[];
};
type Summary = {
  mirpo_count: number; qty_purchased: number; crates: number; sold_30d: number; remaining: number;
  purchase_cost: number; revenue_30d: number; gp_30d: number; sell_through_30d_pct: number; roi_30d_pct: number; gp_margin_30d_pct: number;
  cash_locked_inventory?: number; potential_inventory_reduction_value?: number; dead_stock_value?: number; overstock_value?: number;
  next_mirpo_recommendation?: { recommended_qty: number; note: string; items?: { sku: string; name: string; qty: number; reason: string }[] };
};

const mono = { fontFamily: 'JetBrains Mono, monospace' };
const formatRp = (n: number) => 'Rp ' + Math.round(n || 0).toLocaleString('id-ID');
const formatQty = (n: number) => Math.round(n || 0).toLocaleString('id-ID');
const formatPct = (n: number) => `${(Number(n) || 0).toFixed(1)}%`;
const PERIODS: { key: Period; label: string }[] = [
  { key: 'this_month', label: 'This Month' },
  { key: 'prev_month', label: 'Previous Month' },
  { key: 'this_year', label: 'This Year' },
  { key: 'prev_year', label: 'Previous Year' },
];

export default function MirpoAnalysisPage() {
  const [period, setPeriod] = useState<Period>('this_year');
  const [rows, setRows] = useState<MirpoRow[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [dateRange, setDateRange] = useState('');
  const [inventoryRecommendations, setInventoryRecommendations] = useState<MirpoItem[]>([]);
  const [expanded, setExpanded] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await fetch(`/api/reports/mirpo?period=${period}`);
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Failed to load MIRPO analysis');
      setRows(data.rows || []);
      setSummary(data.summary || null);
      setInventoryRecommendations(data.inventory_reduction_recommendations || []);
      setDateRange(data.from && data.to ? `${data.from} – ${data.to}` : '');
    } catch (e) { setError(String(e)); }
    finally { setLoading(false); }
  }, [period]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const allItems = useMemo(() => rows.flatMap(r => r.items.map(i => ({ ...i, po: r.purchaseorder_number }))), [rows]);
  const fastest = useMemo(() => [...allItems].sort((a,b) => b.sold_30d - a.sold_30d).slice(0, 5), [allItems]);
  const slowest = useMemo(() => [...allItems].sort((a,b) => a.sold_30d - b.sold_30d || b.remaining - a.remaining).slice(0, 5), [allItems]);
  const freezeList = useMemo(() => inventoryRecommendations.filter(i => i.reorder_freeze).slice(0, 8), [inventoryRecommendations]);
  const clearanceList = useMemo(() => inventoryRecommendations.filter(i => i.clearance_candidate).slice(0, 8), [inventoryRecommendations]);

  const card = (label: string, value: string, sub?: string, accent?: boolean) => (
    <div className="via-card p-4">
      <div className="text-[var(--text-4)] text-xs uppercase tracking-wider mb-1">{label}</div>
      <div className={`${accent ? 'text-[var(--accent)]' : 'text-[var(--text)]'} font-bold text-lg`} style={mono}>{value}</div>
      {sub && <div className="text-[var(--text-4)] text-xs mt-1">{sub}</div>}
    </div>
  );

  return (
    <div className="via-page" style={{ background: 'var(--bg)', minHeight: '100%' }}>
      <div style={{ maxWidth: 1400, margin: '0 auto' }}>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-[var(--text)] font-semibold text-2xl tracking-tight">MIRPO Analysis</h1>
            <p className="text-[var(--text-3)] text-sm mt-0.5">Monthly Inventory Replenishment Purchase Orders · {dateRange || 'Loading…'}</p>
          </div>
          <button onClick={fetchData} disabled={loading}
            className="px-3 py-1.5 text-xs bg-[var(--surface-2)] hover:bg-[var(--surface-3)] text-[var(--text-3)] rounded-lg border border-[var(--border)] transition-colors disabled:opacity-50" style={mono}>
            {loading ? '…' : '↻ Refresh'}
          </button>
        </div>

        <div className="flex items-center gap-2 mb-5">
          {PERIODS.map(p => (
            <button key={p.key} onClick={() => setPeriod(p.key)}
              className={`px-4 py-2 text-xs font-medium rounded-lg border transition-all ${period === p.key ? 'bg-[var(--accent)] text-white border-[var(--accent)]' : 'bg-[var(--surface-2)] text-[var(--text-3)] border-[var(--border)] hover:bg-[var(--surface-3)]'}`}>
              {p.label}
            </button>
          ))}
        </div>

        {error && <div className="p-4 mb-4 bg-[var(--danger-bg)] border border-[var(--danger-border)] rounded-lg text-[var(--danger)] text-sm">{error}</div>}

        {summary && (
          <div className="grid grid-cols-4 gap-3 mb-5">
            {card('MIRPO Qty', `${formatQty(summary.qty_purchased)} sht`, `${summary.mirpo_count} MIRPO × 600 sheets`)}
            {card('Total 30D Sell Through', formatPct(summary.sell_through_30d_pct), `${formatQty(summary.sold_30d)} sold within 30 days across all MIRPO`, true)}
            {card('Remaining Now', `${formatQty(summary.remaining)} sht`, `${formatPct(summary.qty_purchased ? summary.remaining / summary.qty_purchased * 100 : 0)} of MIRPO left`)}
            {card('30D GP / ROI', formatRp(summary.gp_30d), `${formatPct(summary.roi_30d_pct)} ROI · ${formatPct(summary.gp_margin_30d_pct)} GP margin`, true)}
          </div>
        )}

        {summary && (
          <div className="grid grid-cols-4 gap-3 mb-5">
            {card('Cash Locked', formatRp(summary.cash_locked_inventory || 0), 'Remaining MIRPO stock value')}
            {card('Potential Reduction', formatRp(summary.potential_inventory_reduction_value || 0), 'Stock to freeze / clear', true)}
            {card('Dead Stock Value', formatRp(summary.dead_stock_value || 0), '0 sales for 60+ days')}
            {card('Next MIRPO Policy Qty', `${formatQty(summary.next_mirpo_recommendation?.recommended_qty || 600)} sht`, 'Must total 600 sheets per brand policy', true)}
          </div>
        )}

        {summary?.next_mirpo_recommendation && (
          <div className="via-card p-4 mb-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-[var(--text)] font-semibold text-sm">Next MIRPO Recommendation — 600 Sheets</h2>
              <span className="text-[var(--text-4)] text-xs">Based on fast-moving items, low remaining stock, 30D sell-through, and stock cover</span>
            </div>
            <p className="text-[var(--text-4)] text-xs mb-3">{summary.next_mirpo_recommendation.note}</p>
            {summary.next_mirpo_recommendation.items && summary.next_mirpo_recommendation.items.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-[var(--text-4)] uppercase tracking-wider border-b border-[var(--border)]">
                      <th className="py-2 text-left">Item</th>
                      <th className="py-2 text-right">Recommended Qty</th>
                      <th className="py-2 text-left">Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.next_mirpo_recommendation.items.map((item, idx) => (
                      <tr key={`${item.sku || item.name}-${idx}`} className="border-b border-[var(--border)] last:border-0">
                        <td className="py-2"><div className="text-[var(--text)] font-medium">{item.sku || item.name}</div><div className="text-[var(--text-4)]">{item.name}</div></td>
                        <td className="py-2 text-right text-[var(--accent)] font-bold" style={mono}>{formatQty(item.qty)} sht</td>
                        <td className="py-2 text-[var(--text-3)]">{item.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-[var(--border)] text-[var(--text)] font-semibold">
                      <td className="py-2">Total</td>
                      <td className="py-2 text-right" style={mono}>{formatQty(summary.next_mirpo_recommendation.items.reduce((sum, item) => sum + item.qty, 0))} sht</td>
                      <td className="py-2 text-[var(--text-4)]">Must equal 600 sheets</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            ) : (
              <p className="text-[var(--text-4)] text-xs">No item allocation yet. Check item sales velocity or review manually.</p>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 gap-4 mb-5">
          <div className="via-card p-4">
            <h2 className="text-[var(--text)] font-semibold text-sm mb-3">Fastest Moving Items</h2>
            {fastest.length === 0 ? <p className="text-[var(--text-4)] text-xs">No sales yet.</p> : fastest.map(i => (
              <div key={`${i.po}-${i.sku}-fast`} className="flex justify-between py-2 border-b border-[var(--border)] last:border-0 text-xs">
                <div><div className="text-[var(--text)] font-medium">{i.sku || i.name}</div><div className="text-[var(--text-4)]">{i.name}</div></div>
                <div className="text-right" style={mono}><div className="text-[var(--accent)] font-bold">{formatQty(i.sold_30d)} sht</div><div className="text-[var(--text-4)]">30D sold</div></div>
              </div>
            ))}
          </div>
          <div className="via-card p-4">
            <h2 className="text-[var(--text)] font-semibold text-sm mb-3">Slow / Overstock Risk</h2>
            {slowest.length === 0 ? <p className="text-[var(--text-4)] text-xs">No MIRPO items.</p> : slowest.map(i => (
              <div key={`${i.po}-${i.sku}-slow`} className="flex justify-between py-2 border-b border-[var(--border)] last:border-0 text-xs">
                <div><div className="text-[var(--text)] font-medium">{i.sku || i.name}</div><div className="text-[var(--text-4)]">{i.recommendation}</div></div>
                <div className="text-right" style={mono}><div className="text-[var(--warning)] font-bold">{formatQty(i.remaining)} left</div><div className="text-[var(--text-4)]">{formatQty(i.sold_30d)} sold 30D</div></div>
              </div>
            ))}
          </div>
        </div>

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
                    <th className="py-2 text-right">30D %</th>
                    <th className="py-2 text-left">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {inventoryRecommendations.slice(0, 12).map((i, idx) => (
                    <tr key={`${i.purchaseorder_number || 'po'}-${i.sku || i.name}-${idx}`} className="border-b border-[var(--border)] last:border-0">
                      <td className="py-2"><span className={`px-2 py-1 rounded text-[10px] ${i.reduction_priority === 'High' ? 'bg-[var(--danger-bg)] text-[var(--danger)]' : i.reduction_priority === 'Medium' ? 'bg-[var(--warning-bg)] text-[var(--warning)]' : 'bg-[var(--surface-2)] text-[var(--text-3)]'}`}>{i.reduction_priority || 'Low'}</span></td>
                      <td className="py-2"><div className="text-[var(--text)] font-medium">{i.sku || i.name}</div><div className="text-[var(--text-4)]">{i.name}</div><div className="text-[var(--text-4)]">{i.purchaseorder_number}</div></td>
                      <td className="py-2 text-right" style={mono}>{formatQty(i.remaining)}</td>
                      <td className="py-2 text-right" style={mono}>{formatRp(i.inventory_value_remaining || 0)}</td>
                      <td className="py-2 text-right" style={mono}>{formatQty(i.age_days || 0)}d</td>
                      <td className="py-2 text-right" style={mono}>{formatPct(i.sell_through_30d_pct)}</td>
                      <td className="py-2 text-[var(--text-3)]">{i.reduction_action || i.recommendation}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4 mb-5">
          <div className="via-card p-4">
            <h2 className="text-[var(--text)] font-semibold text-sm mb-3">Reorder Freeze List</h2>
            {freezeList.length === 0 ? <p className="text-[var(--text-4)] text-xs">No freeze candidates.</p> : freezeList.map((i, idx) => (
              <div key={`${i.sku || i.name}-freeze-${idx}`} className="flex justify-between py-2 border-b border-[var(--border)] last:border-0 text-xs">
                <div><div className="text-[var(--text)] font-medium">{i.sku || i.name}</div><div className="text-[var(--text-4)]">{i.recommendation}</div></div>
                <div className="text-right" style={mono}><div className="text-[var(--warning)] font-bold">{formatQty(i.remaining)} left</div><div className="text-[var(--text-4)]">{formatRp(i.inventory_value_remaining || 0)}</div></div>
              </div>
            ))}
          </div>
          <div className="via-card p-4">
            <h2 className="text-[var(--text)] font-semibold text-sm mb-3">Clearance Candidates</h2>
            {clearanceList.length === 0 ? <p className="text-[var(--text-4)] text-xs">No clearance candidates.</p> : clearanceList.map((i, idx) => (
              <div key={`${i.sku || i.name}-clear-${idx}`} className="flex justify-between py-2 border-b border-[var(--border)] last:border-0 text-xs">
                <div><div className="text-[var(--text)] font-medium">{i.sku || i.name}</div><div className="text-[var(--text-4)]">{i.reduction_action}</div></div>
                <div className="text-right" style={mono}><div className="text-[var(--accent)] font-bold">{formatQty(i.clearance_discount_pct || 0)}%</div><div className="text-[var(--text-4)]">suggested discount</div></div>
              </div>
            ))}
          </div>
        </div>

        <div className="via-card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: 'var(--surface-2)', color: 'var(--text-3)' }}>
                <th className="p-3 text-left text-xs uppercase tracking-wider">PO</th>
                <th className="p-3 text-left text-xs uppercase tracking-wider">Date</th>
                <th className="p-3 text-right text-xs uppercase tracking-wider">Purchased</th>
                <th className="p-3 text-right text-xs uppercase tracking-wider">Sold 30D</th>
                <th className="p-3 text-right text-xs uppercase tracking-wider">Remaining</th>
                <th className="p-3 text-right text-xs uppercase tracking-wider">Sell Through</th>
                <th className="p-3 text-right text-xs uppercase tracking-wider">GP 30D</th>
                <th className="p-3 text-right text-xs uppercase tracking-wider">ROI</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={8} className="p-6 text-center text-[var(--text-4)]">Loading MIRPO analysis…</td></tr>}
              {!loading && rows.length === 0 && <tr><td colSpan={8} className="p-6 text-center text-[var(--text-4)]">No MIRPO PO found. Put MIRPO in the PO reference field.</td></tr>}
              {rows.map(row => (
                <Fragment key={row.purchaseorder_id}>
                  <tr onClick={() => setExpanded(expanded === row.purchaseorder_id ? '' : row.purchaseorder_id)} className="cursor-pointer hover:bg-[var(--surface-2)] border-b border-[var(--border)]">
                    <td className="p-3"><span className="text-[var(--accent)] mr-2">{expanded === row.purchaseorder_id ? '−' : '+'}</span><span className="font-semibold text-[var(--text)]">{row.purchaseorder_number}</span><div className="text-[var(--text-4)] text-xs">Ref: {row.reference_number || 'MIRPO'}</div></td>
                    <td className="p-3 text-[var(--text-3)]" style={mono}>{row.date}</td>
                    <td className="p-3 text-right" style={mono}>{formatQty(row.qty_purchased)} sht<br/><span className="text-[var(--text-4)] text-xs">Policy: 600 sheets</span></td>
                    <td className="p-3 text-right" style={mono}>{formatQty(row.sold_30d)}</td>
                    <td className="p-3 text-right" style={mono}>{formatQty(row.remaining)}</td>
                    <td className="p-3 text-right text-[var(--accent)] font-bold" style={mono}>{formatPct(row.sell_through_30d_pct)}</td>
                    <td className="p-3 text-right" style={mono}>{formatRp(row.gp_30d)}</td>
                    <td className="p-3 text-right" style={mono}>{formatPct(row.roi_30d_pct)}</td>
                  </tr>
                  {expanded === row.purchaseorder_id && (
                    <tr>
                      <td colSpan={8} className="p-0 bg-[var(--surface-1)]">
                        <div className="p-4">
                          <h3 className="text-[var(--text)] font-semibold text-sm mb-3">Item Analysis</h3>
                          <table className="w-full text-xs">
                            <thead><tr className="text-[var(--text-4)] uppercase tracking-wider border-b border-[var(--border)]"><th className="py-2 text-left">Item</th><th className="py-2 text-right">Bought</th><th className="py-2 text-right">Sold 30D</th><th className="py-2 text-right">Sold Total</th><th className="py-2 text-right">Left</th><th className="py-2 text-right">Cash Locked</th><th className="py-2 text-right">30D %</th><th className="py-2 text-right">GP 30D</th><th className="py-2 text-left">Recommendation</th></tr></thead>
                            <tbody>{row.items.map(i => <tr key={`${row.purchaseorder_id}-${i.sku}-${i.name}`} className="border-b border-[var(--border)] last:border-0"><td className="py-2"><div className="text-[var(--text)] font-medium">{i.sku || i.name}</div><div className="text-[var(--text-4)]">{i.name}</div></td><td className="py-2 text-right" style={mono}>{formatQty(i.qty_purchased)}</td><td className="py-2 text-right" style={mono}>{formatQty(i.sold_30d)}</td><td className="py-2 text-right" style={mono}>{formatQty(i.sold_total)}</td><td className="py-2 text-right" style={mono}>{formatQty(i.remaining)}</td><td className="py-2 text-right" style={mono}>{formatRp(i.inventory_value_remaining || 0)}</td><td className="py-2 text-right" style={mono}>{formatPct(i.sell_through_30d_pct)}</td><td className="py-2 text-right" style={mono}>{formatRp(i.gp_30d)}</td><td className="py-2 text-[var(--text-3)]"><div>{i.recommendation}</div>{i.reduction_action && <div className="text-[var(--text-4)] mt-1">{i.reduction_action}</div>}</td></tr>)}</tbody>
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

        <p className="text-[var(--text-4)] text-xs mt-4">MIRPO is identified by PO reference containing “MIRPO”. Wooden crate / packing lines are excluded from sheet quantity. Each MIRPO is expected to be 600 sheets by brand policy. 30-day sell-through is shown per MIRPO and in total, based on invoices dated within 30 days from the PO date. Inventory reduction uses remaining stock value, age, sell-through, and stock cover.</p>
      </div>
    </div>
  );
}
