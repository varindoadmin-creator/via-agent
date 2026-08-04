'use client';
import React from 'react';

import { useState, useEffect, useCallback, useMemo } from 'react';
import POApprovalPanel from '@/components/POApprovalPanel';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ItemMatch {
  salesorder_number: string;
  customer_name: string;
  so_quantity: number;
  fulfilled_qty: number;
}

interface POLineItem {
  item_id: string;
  name: string;
  sku: string;
  unit: string;
  quantity: number;
  rate: number;
  amount: number;
  location_name: string;
  matches: ItemMatch[];
  matched_qty: number;
  stock_qty: number;
  match_status: 'matched' | 'multi_match' | 'partial_so' | 'excess_stock' | 'for_stock' | 'needs_review';
}

interface PO {
  purchaseorder_id: string;
  purchaseorder_number: string;
  vendor_name: string;
  date: string;
  expected_delivery_date: string;
  status: string;
  total: number;
  total_quantity: number;
  billed_status: string;
  received_status: string;
  quantity_yet_to_receive: number;
  location_name: string;
  line_items: POLineItem[];
  fulfillment_type: 'so_fulfillment' | 'multi_so' | 'mixed' | 'stock_only' | 'needs_review';
  matched_so_numbers: string[];
}

interface PurchaseRecommendation {
  item_id: string; sku: string; name: string; unit: string;
  category: string; warehouse: string; vendor_name: string; purchase_rate: number;
  stock_on_hand: number; committed_stock: number; available_stock: number;
  open_sales_order_qty: number; incoming_po_qty: number; history_bucket_days: number;
  sold_recent_days: number; sold_middle_days: number; sold_older_days: number;
  active_sales_periods: number; distinct_customer_count: number; sales_transaction_count: number; retail_demand_score: number;
  lead_time_days: number; safety_stock_qty: number; forecast_demand: number;
  projected_available_qty: number; recommended_qty: number; estimated_unit_cost: number; estimated_cost: number;
  recommended_order_date: string; expected_stockout_date: string | null;
  confidence: 'high' | 'medium' | 'low';
  urgency: 'recommended_now' | 'recommended_soon' | 'no_action' | 'insufficient_data' | 'data_error';
  explanation: string; assumptions: string[];
  coverage_status: 'uncovered_so' | 'replenishment' | 'covered';
  sales_orders: string[]; purchase_orders: string[]; mirpo_orders: string[];
}

interface MirpoPortfolioSummary {
  target_qty: number; recommended_qty: number; sell_through_horizon_days: number;
  projected_30d_sales: number; projected_30d_sell_through_pct: number;
  safely_absorbable_qty: number; excess_risk_qty: number; ready_to_order: boolean;
  decision: 'ready' | 'review' | 'insufficient_data'; explanation: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const mono = { fontFamily: 'JetBrains Mono, monospace' };
const formatRp = (n: number) => 'Rp ' + Number(n).toLocaleString('id-ID');

function FulfillmentBadge({ type }: { type: PO['fulfillment_type'] }) {
  const map: Record<string, { label: string; cls: string }> = {
    so_fulfillment: { label: 'SO Fulfillment', cls: 'bg-[var(--success-bg)] text-[var(--success)] border-[var(--success-border)]' },
    multi_so:       { label: 'Multiple SOs',   cls: 'bg-[var(--info-bg)] text-[var(--info)] border-[var(--info-border)]' },
    mixed:          { label: 'Mixed',           cls: 'bg-[var(--accent-light)] text-[var(--accent-text)] border-[var(--accent-border)]' },
    stock_only:     { label: 'Stock Only',      cls: 'bg-[var(--surface-3)] text-[var(--text-3)] border-[var(--border)]' },
    needs_review:   { label: 'Needs Review',    cls: 'bg-[var(--warning-bg)] text-[var(--warning)] border-[var(--warning-border)]' },
  };
  const { label, cls } = map[type] || map.stock_only;
  return <span className={`via-badge border text-xs ${cls}`}>{label}</span>;
}

function MatchDot({ status }: { status: POLineItem['match_status'] }) {
  const colors: Record<string, string> = {
    matched:      'var(--success)',
    multi_match:  'var(--info)',
    partial_so:   'var(--accent-text)',
    excess_stock: 'var(--accent-text)',
    for_stock:    'var(--text-4)',
    needs_review: 'var(--warning)',
  };
  const labels: Record<string, string> = {
    matched:      'Matched',
    multi_match:  'Multi SO',
    partial_so:   'Partial SO',
    excess_stock: 'SO + Stock',
    for_stock:    'For Stock',
    needs_review: 'Needs Review',
  };
  return <span style={{ color: colors[status] || 'var(--text-3)', fontSize: 11, fontWeight: 500 }}>{labels[status] || status}</span>;
}

// ─── Expandable Row ───────────────────────────────────────────────────────────

function PORow({
  po, selectable, selected, onToggle, showMatching, showReceipt, onReceive,
}: {
  po: PO;
  selectable: boolean;
  selected: boolean;
  onToggle: (id: string) => void;
  showMatching: boolean;
  showReceipt?: boolean;
  onReceive?: (poId: string) => void;
  onToggleAll?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const colSpan = selectable ? (showMatching ? 10 : 9) : (showMatching ? (showReceipt ? 11 : 9) : 8);

  return (
    <>
      <tr
        className={`cursor-pointer transition-colors ${selected ? 'bg-[var(--accent-light)]' : 'hover:bg-[var(--surface-2)]'}`}
        onClick={() => setExpanded(e => !e)}
      >
        {selectable && (
          <td className="px-3 py-2.5 w-8" onClick={e => e.stopPropagation()}>
            <input type="checkbox" className="w-3.5 h-3.5 rounded"
              checked={selected} onChange={() => onToggle(po.purchaseorder_id)} />
          </td>
        )}
        <td className="px-3 py-2.5 text-center text-[var(--text-4)] text-xs w-8 select-none">
          {expanded ? '▾' : '▸'}
        </td>
        <td className="px-3 py-2.5 text-xs font-medium text-[var(--accent-text)]" style={mono}>{po.purchaseorder_number}</td>
        <td className="px-3 py-2.5 text-xs text-[var(--text)] max-w-[160px] truncate" title={po.vendor_name}>{po.vendor_name}</td>
        <td className="px-3 py-2.5 text-xs text-[var(--text-3)]">{po.date}</td>
        <td className="px-3 py-2.5 text-xs text-[var(--text-3)]">{po.expected_delivery_date || '—'}</td>
        {/* Fulfillment + Matched SOs — always shown when showMatching */}
        {showMatching && (
          <>
            <td className="px-3 py-2.5"><FulfillmentBadge type={po.fulfillment_type} /></td>
            <td className="px-3 py-2.5">
              {po.matched_so_numbers.length > 0 ? (
                <div className="flex flex-wrap gap-1">
                  {po.matched_so_numbers.slice(0, 2).map(n => (
                    <span key={n} className="text-xs text-[var(--accent-text)]" style={mono}>{n}</span>
                  ))}
                  {po.matched_so_numbers.length > 2 && (
                    <span className="text-[var(--text-4)] text-xs">+{po.matched_so_numbers.length - 2}</span>
                  )}
                </div>
              ) : <span className="text-[var(--text-4)] text-xs">—</span>}
            </td>
          </>
        )}
        {/* Receipt status — shown for issued POs */}
        {showReceipt && (
          <>
            <td className="px-3 py-2.5">
              <span className={`via-badge border text-xs ${
                po.received_status === 'received'
                  ? 'bg-[var(--success-bg)] text-[var(--success)] border-[var(--success-border)]'
                  : po.received_status === 'partially_received'
                  ? 'bg-[var(--accent-light)] text-[var(--accent-text)] border-[var(--accent-border)]'
                  : 'bg-[var(--warning-bg)] text-[var(--warning)] border-[var(--warning-border)]'
              }`}>
                {po.received_status === 'to_be_received' ? 'Pending'
                  : po.received_status === 'partially_received' ? 'Partial' : 'Received'}
              </span>
            </td>
            <td className="px-3 py-2.5 text-xs text-right" style={{ ...mono, color: po.quantity_yet_to_receive > 0 ? 'var(--warning)' : 'var(--success)' }}>
              {po.quantity_yet_to_receive}
            </td>
          </>
        )}
        <td className="px-3 py-2.5 text-xs text-right text-[var(--text-2)]" style={mono}>{po.total_quantity}</td>
        <td className="px-3 py-2.5 text-xs text-right text-[var(--text-2)]" style={mono}>{formatRp(po.total)}</td>
        {onReceive && po.received_status !== 'received' && (
          <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
            <button
              onClick={() => onReceive(po.purchaseorder_id)}
              className="px-2.5 py-1 text-xs bg-[var(--info-bg)] text-[var(--info)] border border-[var(--info-border)] rounded hover:opacity-80 transition-opacity">
              ↓ Receive
            </button>
          </td>
        )}
        {onReceive && po.received_status === 'received' && (
          <td className="px-3 py-2.5">
            <span className="text-[var(--text-4)] text-xs">—</span>
          </td>
        )}
      </tr>

      {/* Accordion */}
      {expanded && (
        <tr>
          <td colSpan={colSpan} className="p-0 border-b border-[var(--border)]">
            <div className="bg-[var(--surface-2)] px-6 py-4">
              <div className="text-[var(--text-4)] text-xs uppercase tracking-wider mb-3" style={mono}>
                Line Items — {po.purchaseorder_number}
              </div>
              <div className="overflow-x-auto">
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                      {['Item', 'SKU', 'Location', ...(showMatching ? ['PO Qty', 'Matched', 'Stock', 'Matched SOs'] : ['PO Qty']), 'Rate', 'Amount', ...(showMatching ? ['Status'] : [])].map((h, i) => (
                        <th key={i} style={{
                          padding: '6px 10px',
                          textAlign: (h === 'PO Qty' || h === 'Matched' || h === 'Stock' || h === 'Rate' || h === 'Amount') ? 'right' : 'left',
                          color: 'var(--text-3)', fontWeight: 500, fontSize: 11,
                          textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap',
                        }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {po.line_items.map((item, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid var(--border-muted)' }}>
                        <td style={{ padding: '7px 10px', color: 'var(--text)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.name}>{item.name}</td>
                        <td style={{ padding: '7px 10px', color: 'var(--text-3)', fontSize: 11, ...mono }}>{item.sku || '—'}</td>
                        <td style={{ padding: '7px 10px', color: 'var(--text-3)', fontSize: 11 }}>{item.location_name || '—'}</td>
                        <td style={{ padding: '7px 10px', textAlign: 'right', ...mono, color: 'var(--text-2)' }}>{item.quantity} {item.unit}</td>
                        {showMatching && (
                          <>
                            <td style={{ padding: '7px 10px', textAlign: 'right', ...mono, fontWeight: 500, color: item.matched_qty > 0 ? 'var(--success)' : 'var(--text-4)' }}>
                              {item.matched_qty > 0 ? item.matched_qty : '—'}
                            </td>
                            <td style={{ padding: '7px 10px', textAlign: 'right', ...mono, color: item.stock_qty > 0 ? 'var(--text-3)' : 'var(--text-4)' }}>
                              {item.stock_qty > 0 ? item.stock_qty : '—'}
                            </td>
                            <td style={{ padding: '7px 10px', minWidth: 180 }}>
                              {item.matches.length > 0 ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                                  {item.matches.map((m, mi) => (
                                    <div key={mi} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
                                      <span style={{ ...mono, color: 'var(--accent-text)', fontWeight: 500, flexShrink: 0 }}>{m.salesorder_number}</span>
                                      <span style={{ color: 'var(--text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 120 }} title={m.customer_name}>{m.customer_name}</span>
                                      <span style={{ ...mono, color: 'var(--success)', marginLeft: 'auto', flexShrink: 0 }}>→{m.fulfilled_qty}</span>
                                    </div>
                                  ))}
                                </div>
                              ) : <span style={{ color: 'var(--text-4)', fontSize: 11 }}>—</span>}
                            </td>
                          </>
                        )}
                        <td style={{ padding: '7px 10px', textAlign: 'right', ...mono, color: 'var(--text-3)', fontSize: 11 }}>{formatRp(item.rate)}</td>
                        <td style={{ padding: '7px 10px', textAlign: 'right', ...mono, color: 'var(--text-2)' }}>{formatRp(item.amount)}</td>
                        {showMatching && (
                          <td style={{ padding: '7px 10px' }}><MatchDot status={item.match_status} /></td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ borderTop: '1px solid var(--border)', background: 'var(--surface-3)' }}>
                      <td colSpan={showMatching ? 8 : 4} style={{ padding: '6px 10px', color: 'var(--text-3)', fontSize: 11, ...mono }}>TOTAL</td>
                      <td style={{ padding: '6px 10px', textAlign: 'right', ...mono, color: 'var(--text)', fontWeight: 600 }}>
                        {formatRp(po.line_items.reduce((s, i) => s + i.amount, 0))}
                      </td>
                      {showMatching && <td />}
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ─── Table ────────────────────────────────────────────────────────────────────

function POTable({
  title, groupColor, desc, pos, loading, search, showMatching,
  selectable, selected, onToggleAll, onToggle, showReceipt, onReceive,
}: {
  title: string; groupColor?: string; desc: string; pos: PO[]; loading: boolean; search: string;
  showMatching: boolean; selectable: boolean; showReceipt?: boolean;
  selected?: Set<string>; onToggleAll?: () => void; onToggle?: (id: string) => void;
  onReceive?: (poId: string) => void;
}) {
  const filtered = useMemo(() => {
    if (!search.trim()) return pos;
    const q = search.toLowerCase();
    return pos.filter(po =>
      po.purchaseorder_number.toLowerCase().includes(q) ||
      po.vendor_name.toLowerCase().includes(q) ||
      po.matched_so_numbers.some(n => n.toLowerCase().includes(q)) ||
      po.line_items.some(li =>
        li.name.toLowerCase().includes(q) || li.sku.toLowerCase().includes(q) ||
        li.matches.some(m => m.customer_name.toLowerCase().includes(q))
      )
    );
  }, [pos, search]);

  const allSelected = selectable && selected && filtered.length > 0 && filtered.every(po => selected.has(po.purchaseorder_id));

  const thStyle: React.CSSProperties = {
    padding: '8px 12px', textAlign: 'left',
    color: 'var(--text-3)', fontWeight: 500, fontSize: 11,
    textTransform: 'uppercase', letterSpacing: '0.06em',
    background: 'var(--surface-2)', borderBottom: '1px solid var(--border)',
  };

  return (
    <div className="via-card overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--border)]">
        <div>
          <h2 className="font-bold text-base" style={{ color: groupColor || 'var(--text)' }}>{title}</h2>
          <p className="text-[var(--text-3)] text-xs mt-0.5">{desc}</p>
        </div>
        <div className="flex items-center gap-3">
          {!loading && <span className="text-[var(--text-4)] text-xs">Total ({filtered.length} POs)</span>}
          {!loading && filtered.length > 0 && (
            <span className="text-[var(--text-4)] text-xs" style={mono}>{formatRp(filtered.reduce((s, p) => s + p.total, 0))}</span>
          )}
        </div>
      </div>

      <div style={groupColor ? { borderLeft: `4px solid ${groupColor}` } : undefined}>
      {loading && (
        <div className="p-5 space-y-2">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="flex gap-4 animate-pulse">
              <div className="h-4 bg-[var(--surface-3)] rounded w-6" />
              <div className="h-4 bg-[var(--surface-3)] rounded w-28" />
              <div className="h-4 bg-[var(--surface-3)] rounded flex-1" />
              <div className="h-4 bg-[var(--surface-3)] rounded w-24" />
            </div>
          ))}
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <div className="flex flex-col items-center py-10">
          <div className="text-3xl mb-2 opacity-20">◫</div>
          <div className="text-[var(--text-3)] text-sm">No purchase orders found.</div>
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <div className="overflow-x-auto">
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr>
                {selectable && (
                  <th style={{ ...thStyle, width: 36 }}>
                    <input type="checkbox" className="w-3.5 h-3.5 rounded"
                      checked={allSelected} onChange={onToggleAll} />
                  </th>
                )}
                <th style={{ ...thStyle, width: 32 }}></th>
                <th style={thStyle}>PO Number</th>
                <th style={thStyle}>Vendor</th>
                <th style={thStyle}>Date</th>
                <th style={thStyle}>Exp. Delivery</th>
                {showMatching && (
                  <>
                    <th style={thStyle}>Fulfillment</th>
                    <th style={thStyle}>Matched SOs</th>
                  </>
                )}
                {showReceipt && (
                  <>
                    <th style={thStyle}>Receipt</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>To Receive</th>
                  </>
                )}
                <th style={{ ...thStyle, textAlign: 'right' }}>Qty</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(po => (
                <PORow
                  key={po.purchaseorder_id}
                  po={po}
                  selectable={selectable}
                  selected={selected?.has(po.purchaseorder_id) ?? false}
                  onToggle={onToggle ?? (() => {})}
                  showMatching={showMatching}
                  showReceipt={showReceipt}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
      </div>
    </div>
  );
}

// ─── Purchasing recommendations ──────────────────────────────────────────────

export function PurchasingRecommendations() {
  const [recommendations, setRecommendations] = useState<PurchaseRecommendation[]>([]);
  const [summary, setSummary] = useState({ suppliers: 0, items_to_purchase: 0, recommended_now: 0, recommended_soon: 0, no_action: 0, insufficient_data: 0, estimated_cost: 0 });
  const [portfolio, setPortfolio] = useState<MirpoPortfolioSummary | null>(null);
  const [methodology, setMethodology] = useState('');
  const [generatedAt, setGeneratedAt] = useState('');
  const [syncStatus, setSyncStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const [creatingMirpo, setCreatingMirpo] = useState(false);
  const [error, setError] = useState('');
  const [draftMessage, setDraftMessage] = useState('');
  const [filters, setFilters] = useState({ search: '', vendor: '', urgency: '', category: '', confidence: '', warehouse: '' });
  const [sort, setSort] = useState<'urgency' | 'quantity' | 'cost' | 'stockout'>('urgency');
  const [config, setConfig] = useState({ lead_time_days: 30, safety_days: 14, history_days: 90, include_open_so: true, ignore_abnormal: true, minimum_confidence: 'low', currency: 'IDR', include_tax: false, tax_rate_percent: 0, warehouse: 'all' });
  const [adjustments, setAdjustments] = useState<Record<string, { quantity?: number; vendor_name?: string; required_date?: string }>>({});
  const [exclusions, setExclusions] = useState<Record<string, string>>({});

  const load = useCallback(async (refresh = false) => {
    setLoading(true); setError('');
    try {
      const query = new URLSearchParams({
        lead_time_days: String(config.lead_time_days), safety_days: String(config.safety_days), history_days: String(config.history_days),
        include_open_so: String(config.include_open_so), ignore_abnormal: String(config.ignore_abnormal), minimum_confidence: config.minimum_confidence,
        currency: config.currency, include_tax: String(config.include_tax), tax_rate_percent: String(config.tax_rate_percent), warehouse: config.warehouse,
        ...(refresh ? { refresh: 'true' } : {}),
      });
      const response = await fetch(`/api/purchases/recommendations?${query}`);
      const data = await response.json();
      if (!data.success) throw new Error(data.error || 'Unable to calculate recommendations');
      setRecommendations(data.recommendations || []);
      setSummary(data.summary || {});
      setPortfolio(data.portfolio || null);
      setMethodology(data.methodology || '');
      setGeneratedAt(data.generated_at || ''); setSyncStatus(data.sync_status || 'current');
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  }, [config]);

  useEffect(() => { load(false); }, [load]);
  useEffect(() => {
    fetch('/api/purchases/recommendations/drafts').then(r => r.json()).then(data => {
      if (data.success && data.draft) { setAdjustments(data.draft.adjustments || {}); setExclusions(data.draft.exclusions || {}); setDraftMessage('Restored manual changes from the latest local draft.'); }
    }).catch(() => {});
  }, []);

  const effective = useCallback((item: PurchaseRecommendation) => ({
    quantity: adjustments[item.item_id]?.quantity ?? item.recommended_qty,
    vendor_name: adjustments[item.item_id]?.vendor_name || item.vendor_name,
    required_date: adjustments[item.item_id]?.required_date || item.recommended_order_date,
    excluded: Object.prototype.hasOwnProperty.call(exclusions, item.item_id),
  }), [adjustments, exclusions]);

  const filtered = useMemo(() => {
    const rank = { recommended_now: 0, recommended_soon: 1, insufficient_data: 2, no_action: 3, data_error: 4 };
    return recommendations.filter(item => {
      const e = effective(item); const q = filters.search.toLowerCase();
      return (!q || `${item.sku} ${item.name}`.toLowerCase().includes(q)) && (!filters.vendor || e.vendor_name === filters.vendor) &&
        (!filters.urgency || item.urgency === filters.urgency) && (!filters.category || item.category === filters.category) &&
        (!filters.confidence || item.confidence === filters.confidence) && (!filters.warehouse || item.warehouse === filters.warehouse);
    }).sort((a, b) => sort === 'quantity' ? effective(b).quantity - effective(a).quantity : sort === 'cost' ? effective(b).quantity * b.estimated_unit_cost - effective(a).quantity * a.estimated_unit_cost : sort === 'stockout' ? (a.expected_stockout_date || '9999').localeCompare(b.expected_stockout_date || '9999') : rank[a.urgency] - rank[b.urgency]);
  }, [recommendations, effective, filters, sort]);

  const total = recommendations.reduce((sum, item) => { const e = effective(item); return sum + (e.excluded ? 0 : e.quantity * item.estimated_unit_cost); }, 0);
  const options = (key: 'vendor_name' | 'category' | 'warehouse') => Array.from(new Set(recommendations.map(item => key === 'vendor_name' ? effective(item).vendor_name : item[key]).filter(Boolean))).sort();

  async function createLocalDraft() {
    const active = recommendations.filter(item => !effective(item).excluded && effective(item).quantity > 0);
    if (!active.length) { setError('No included recommendation has a positive quantity.'); return; }
    const draftQty = active.reduce((sum, item) => sum + effective(item).quantity, 0);
    if (draftQty !== 600) { setError(`A MIRPO must total exactly 600 sheets. The edited draft currently totals ${draftQty}.`); return; }
    if (!window.confirm(`Create a real Draft Purchase Order in Zoho Books for ${active.length} LAMITAK items (${draftQty} sheets, ${formatRp(total)})? Vendor: TAK PRODUCTS AND SERVICES, PT. Reference: MIRPO. The PO will remain Draft and will not be submitted or approved.`)) return;
    setCreatingMirpo(true);
    setDraftMessage(''); setError('');
    try {
      const response = await fetch('/api/purchases/recommendations/drafts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
        generated_at: generatedAt, configuration: config, adjustments, exclusions,
        source_snapshot: { generated_at: generatedAt, sync_status: syncStatus, methodology },
        items: recommendations.map(item => { const e = effective(item); return { item_id: item.item_id, sku: item.sku, name: item.name, quantity: e.quantity, vendor_name: e.vendor_name, required_date: e.required_date, estimated_unit_cost: item.estimated_unit_cost, purchase_rate: item.purchase_rate, excluded: e.excluded, exclusion_reason: exclusions[item.item_id] || '' }; }),
      }) });
      const data = await response.json();
      if (!data.success) throw new Error(data.error || 'Unable to save the local MIRPO audit draft');
      const zohoResponse = await fetch('/api/purchases/recommendations/drafts/create-zoho', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ draft_id: data.draft.id }),
      });
      const zohoData = await zohoResponse.json();
      if (!zohoData.success) throw new Error(zohoData.error || 'Unable to create the Zoho Draft Purchase Order');
      const po = zohoData.purchaseorder || zohoData;
      setDraftMessage(`Zoho Draft PO ${po.purchaseorder_number || po.purchaseorder_id} created for TAK PRODUCTS AND SERVICES, PT with reference MIRPO. It has not been submitted or approved.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCreatingMirpo(false);
    }
  }

  const urgencyLabel = { recommended_now: 'Recommended now', recommended_soon: 'Recommended soon', no_action: 'No action', insufficient_data: 'Insufficient data', data_error: 'Data error' };
  const urgencyClass = { recommended_now: 'bg-[var(--danger-bg)] text-[var(--danger)] border-[var(--danger-border)]', recommended_soon: 'bg-[var(--warning-bg)] text-[var(--warning)] border-[var(--warning-border)]', no_action: 'bg-[var(--success-bg)] text-[var(--success)] border-[var(--success-border)]', insufficient_data: 'bg-[var(--surface-3)] text-[var(--text-3)] border-[var(--border)]', data_error: 'bg-[var(--danger-bg)] text-[var(--danger)] border-[var(--danger-border)]' };
  return (
    <div className="via-card mb-6 overflow-hidden">
      <div className="flex items-start justify-between px-5 py-4 border-b border-[var(--border)]">
        <div><h2 className="font-bold text-base text-[var(--text)]">Recommended Next MIRPO — LAMITAK HPL</h2><p className="text-[var(--text-3)] text-xs mt-0.5">600-sheet monthly portfolio · target: sell through within 30 days · creates a Zoho Draft PO after Director confirmation</p><div className="text-[var(--text-4)] text-xs mt-1">Sync: <span className={syncStatus === 'current' ? 'text-[var(--success)]' : 'text-[var(--warning)]'}>{syncStatus || 'waiting'}</span>{generatedAt && ` · ${new Date(generatedAt).toLocaleString('id-ID')}`}</div></div>
        <div className="flex gap-2"><button onClick={() => load(true)} disabled={loading || creatingMirpo} className="px-3 py-1.5 text-xs border border-[var(--border)] rounded-lg text-[var(--text-3)] disabled:opacity-50">{loading ? 'Refreshing Zoho…' : 'Refresh Zoho'}</button><button onClick={createLocalDraft} disabled={loading || creatingMirpo} className="px-3 py-1.5 text-xs bg-[var(--accent)] text-white rounded-lg disabled:opacity-50">{creatingMirpo ? 'Creating Zoho Draft…' : 'Create Draft MIRPO in Zoho'}</button></div>
      </div>
      {portfolio && <div className={`mx-5 mt-4 rounded-lg border p-3 text-xs ${portfolio.ready_to_order ? 'bg-[var(--success-bg)] border-[var(--success-border)] text-[var(--success)]' : 'bg-[var(--warning-bg)] border-[var(--warning-border)] text-[var(--warning)]'}`}><div className="font-semibold">{portfolio.ready_to_order ? 'Ready: 30-day demand supports this MIRPO' : 'Review before ordering: dead-stock risk detected'}</div><div className="mt-1">{portfolio.explanation}</div></div>}
      <div className="grid grid-cols-6 gap-px bg-[var(--border)] border-y border-[var(--border)] mt-4">
        {[['MIRPO target', `${portfolio?.target_qty || 600} sheets`], ['Proposed', `${portfolio?.recommended_qty || 0} sheets`], ['30D sell-through', `${portfolio?.projected_30d_sell_through_pct || 0}%`], ['30D supported', `${portfolio?.safely_absorbable_qty || 0} sheets`], ['Risk balance', `${portfolio?.excess_risk_qty || 0} sheets`], ['Draft value', formatRp(total)]].map(([label, value]) => <div key={String(label)} className="bg-[var(--surface)] px-4 py-3"><div className="text-[var(--text-4)] text-xs">{label}</div><div className="text-[var(--text)] font-semibold mt-1" style={mono}>{value}</div></div>)}
      </div>
      <div className="px-5 py-3 border-b border-[var(--border)] grid grid-cols-6 gap-2 bg-[var(--surface-2)]">
        <input className="via-input text-xs px-2 py-1.5" placeholder="Search item…" value={filters.search} onChange={e => setFilters(f => ({ ...f, search: e.target.value }))} />
        {[['vendor', 'All vendors', options('vendor_name')], ['category', 'All categories', options('category')], ['warehouse', 'All warehouses', options('warehouse')]].map(([key, label, values]) => <select key={String(key)} className="via-input text-xs px-2 py-1.5" value={filters[key as 'vendor']} onChange={e => setFilters(f => ({ ...f, [key as string]: e.target.value }))}><option value="">{String(label)}</option>{(values as string[]).map(value => <option key={value}>{value}</option>)}</select>)}
        <select className="via-input text-xs px-2 py-1.5" value={filters.urgency} onChange={e => setFilters(f => ({ ...f, urgency: e.target.value }))}><option value="">All urgency</option>{Object.entries(urgencyLabel).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>
        <select className="via-input text-xs px-2 py-1.5" value={filters.confidence} onChange={e => setFilters(f => ({ ...f, confidence: e.target.value }))}><option value="">All confidence</option><option>high</option><option>medium</option><option>low</option></select>
      </div>
      <details className="px-5 py-3 border-b border-[var(--border)]"><summary className="text-xs text-[var(--accent-text)] cursor-pointer">Forecast configuration and fallback assumptions</summary><div className="grid grid-cols-6 gap-3 mt-3 text-xs"><label>Default lead days<input type="number" className="via-input mt-1 w-full p-1.5" value={config.lead_time_days} onChange={e => setConfig(c => ({ ...c, lead_time_days: Number(e.target.value) }))}/></label><label>Safety days<input type="number" className="via-input mt-1 w-full p-1.5" value={config.safety_days} onChange={e => setConfig(c => ({ ...c, safety_days: Number(e.target.value) }))}/></label><label>History days<select className="via-input mt-1 w-full p-1.5" value={config.history_days} onChange={e => setConfig(c => ({ ...c, history_days: Number(e.target.value) }))}><option value={60}>60</option><option value={90}>90</option><option value={180}>180</option></select></label><label>Minimum confidence<select className="via-input mt-1 w-full p-1.5" value={config.minimum_confidence} onChange={e => setConfig(c => ({ ...c, minimum_confidence: e.target.value }))}><option>low</option><option>medium</option><option>high</option></select></label><label>Warehouse scope<input className="via-input mt-1 w-full p-1.5" value={config.warehouse} onChange={e => setConfig(c => ({ ...c, warehouse: e.target.value || 'all' }))}/></label><label>Currency<input className="via-input mt-1 w-full p-1.5" value={config.currency} onChange={e => setConfig(c => ({ ...c, currency: e.target.value.toUpperCase() }))}/></label><label className="flex items-center gap-2"><input type="checkbox" checked={config.include_open_so} onChange={e => setConfig(c => ({ ...c, include_open_so: e.target.checked }))}/>Include open SOs</label><label className="flex items-center gap-2"><input type="checkbox" checked={config.ignore_abnormal} onChange={e => setConfig(c => ({ ...c, ignore_abnormal: e.target.checked }))}/>Ignore abnormal spikes</label><label className="flex items-center gap-2"><input type="checkbox" checked={config.include_tax} onChange={e => setConfig(c => ({ ...c, include_tax: e.target.checked }))}/>Include tax in estimate</label><label>Tax rate %<input type="number" min={0} max={100} step="0.1" disabled={!config.include_tax} className="via-input mt-1 w-full p-1.5 disabled:opacity-50" value={config.tax_rate_percent} onChange={e => setConfig(c => ({ ...c, tax_rate_percent: Number(e.target.value) }))}/></label><div className="col-span-2 text-[var(--text-4)]">Retail policy: ignores Zoho reorder level · sold in at least 2 periods or to 3 customers · purchase rate ≤ Rp1,000,000 · recurring periods, customer breadth, and invoice frequency drive priority.</div></div></details>
      {error && <div className="m-4 p-3 bg-[var(--danger-bg)] border border-[var(--danger-border)] rounded-lg text-[var(--danger)] text-xs">{error}</div>}
      {draftMessage && <div className="mx-4 mt-4 p-3 bg-[var(--success-bg)] border border-[var(--success-border)] rounded-lg text-[var(--success)] text-xs">{draftMessage}</div>}
      <div className="px-5 py-2 flex justify-end"><select className="via-input text-xs p-1.5" value={sort} onChange={e => setSort(e.target.value as typeof sort)}><option value="urgency">Sort: urgency</option><option value="quantity">Sort: quantity</option><option value="cost">Sort: value</option><option value="stockout">Sort: stockout date</option></select></div>
      <div className="overflow-x-auto"><table className="w-full text-xs"><thead className="bg-[var(--surface-2)]"><tr>{['Item / explanation', 'Status', 'Available', 'Incoming', 'Forecast', 'Safety', 'Vendor', 'Qty / required date', 'Estimated value', 'Exclude'].map(label => <th key={label} className="px-3 py-2 text-left text-[10px] uppercase tracking-wider text-[var(--text-3)] border-b border-[var(--border)]">{label}</th>)}</tr></thead><tbody>{filtered.map(item => { const e = effective(item); return <tr key={item.item_id} className={`border-b border-[var(--border-muted)] ${e.excluded ? 'opacity-50' : ''}`}><td className="px-3 py-2 min-w-[260px]"><div className="font-semibold text-[var(--text)]">{item.sku || item.name}</div><div className="text-[var(--text-4)]">{item.name} · {item.category} · {item.warehouse}</div><div className="text-[var(--text-3)] mt-1">{item.explanation}</div>{item.assumptions.length > 0 && <div className="text-[var(--warning)] mt-1">Assumptions: {item.assumptions.join('; ')}</div>}</td><td className="px-3 py-2"><span className={`via-badge border ${urgencyClass[item.urgency]}`}>{urgencyLabel[item.urgency]}</span><div className="text-[var(--text-4)] mt-1">{item.confidence} confidence</div><div className="text-[var(--text-4)]">Stockout: {item.expected_stockout_date || 'unknown'}</div></td><td className="px-3 py-2 text-right" style={mono}>{item.available_stock}<div className="text-[var(--text-4)]">committed {item.committed_stock}</div></td><td className="px-3 py-2 text-right" style={mono}>{item.incoming_po_qty}<div className="text-[var(--text-4)] max-w-[120px]">{item.purchase_orders.join(', ')}</div></td><td className="px-3 py-2 text-right" style={mono}>{item.forecast_demand}</td><td className="px-3 py-2 text-right" style={mono}>{item.safety_stock_qty}</td><td className="px-3 py-2"><input className="via-input p-1.5 w-44" value={e.vendor_name} onChange={ev => setAdjustments(a => ({ ...a, [item.item_id]: { ...a[item.item_id], vendor_name: ev.target.value } }))}/></td><td className="px-3 py-2"><input type="number" min={0} className="via-input p-1.5 w-20 text-right" value={e.quantity} onChange={ev => setAdjustments(a => ({ ...a, [item.item_id]: { ...a[item.item_id], quantity: Math.max(0, Number(ev.target.value)) } }))}/><input type="date" className="via-input p-1.5 mt-1 w-32" value={e.required_date} onChange={ev => setAdjustments(a => ({ ...a, [item.item_id]: { ...a[item.item_id], required_date: ev.target.value } }))}/></td><td className="px-3 py-2 text-right" style={mono}>{formatRp(e.quantity * item.estimated_unit_cost)}<div className="text-[var(--text-4)]">@ {formatRp(item.estimated_unit_cost)}</div></td><td className="px-3 py-2"><input type="checkbox" checked={e.excluded} onChange={ev => setExclusions(x => { const next = { ...x }; if (ev.target.checked) next[item.item_id] = next[item.item_id] || 'Excluded by user'; else delete next[item.item_id]; return next; })}/>{e.excluded && <input className="via-input p-1 mt-1 w-36" value={exclusions[item.item_id] || ''} placeholder="Reason" onChange={ev => setExclusions(x => ({ ...x, [item.item_id]: ev.target.value }))}/>}</td></tr>; })}</tbody></table></div>
      {!loading && filtered.length === 0 && <div className="px-5 py-8 text-center text-[var(--text-3)]">No recommendations match the current filters.</div>}
      {methodology && <div className="px-5 py-3 bg-[var(--surface-2)] text-[var(--text-4)] text-xs border-t border-[var(--border)]">{methodology}</div>}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

// ─── Receive Items Modal ─────────────────────────────────────────────────────

interface ReceivePOLineItem {
  line_item_id: string;
  item_id: string;
  name: string;
  sku: string;
  quantity: number;
  quantity_received: number;
  rate: number;
  unit: string;
  location_id: string;
  location_name: string;
  tax_id: string;
}

interface ReceivePO {
  purchaseorder_id: string;
  purchaseorder_number: string;
  vendor_id: string;
  vendor_name: string;
  received_status: string;
  billed_status: string;
  line_items: ReceivePOLineItem[];
}

function ReceiveItemsModal({ poId, onClose, onDone }: {
  poId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [po, setPo] = useState<ReceivePO | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [createBill, setCreateBill] = useState(false);
  const [billNumber, setBillNumber] = useState('');
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ receive?: string; bill?: string; error?: string } | null>(null);

  const mono = { fontFamily: 'JetBrains Mono, monospace' };
  const formatRp = (n: number) => 'Rp ' + Number(n).toLocaleString('id-ID');

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/purchases/receive?po_id=' + poId);
        const data = await res.json();
        if (!data.success) throw new Error(data.error);
        setPo(data.po);
        setBillNumber(data.po.purchaseorder_number);
        // Default: receive all remaining quantity
        const qts: Record<string, number> = {};
        for (const li of data.po.line_items) {
          qts[li.line_item_id] = Math.max(0, li.quantity - li.quantity_received);
        }
        setQuantities(qts);
      } catch(e) { setError(String(e)); }
      finally { setLoading(false); }
    }
    load();
  }, [poId]);

  async function handleSubmit() {
    if (!po) return;
    const lineItems = po.line_items
      .map(li => ({ line_item_id: li.line_item_id, quantity_received: quantities[li.line_item_id] || 0 }))
      .filter(li => li.quantity_received > 0);

    if (!lineItems.length) { setError('Enter quantity for at least one item'); return; }

    setSaving(true); setError('');
    try {
      const res = await fetch('/api/purchases/receive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          po_id: poId,
          line_items: lineItems,
          date,
          create_bill: createBill,
          bill_number: billNumber,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      setResult({
        receive: data.receive?.receive_number,
        bill: data.bill?.bill_number,
        error: data.bill?.error,
      });
      setTimeout(() => { onDone(); }, 2000);
    } catch(e) { setError(String(e)); }
    finally { setSaving(false); }
  }

  const lbl: React.CSSProperties = { fontSize: 11, color: 'var(--text-3)', marginBottom: 4,
    display: 'block', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.04em' };
  const inp = 'via-input text-xs py-1.5 px-2 w-full';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="via-card w-[640px] max-h-[85vh] mx-4 flex flex-col" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)] flex-shrink-0">
          <div>
            <h3 className="text-[var(--text)] font-semibold text-sm">
              Receive Items — {po?.purchaseorder_number || '…'}
            </h3>
            {po && <p className="text-[var(--text-3)] text-xs mt-0.5">{po.vendor_name}</p>}
          </div>
          <button onClick={onClose} className="text-[var(--text-3)] hover:text-[var(--text)] text-lg">✕</button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-4">
          {loading && <div className="text-[var(--text-3)] text-sm animate-pulse">Loading…</div>}
          {error && <div className="p-3 bg-[var(--danger-bg)] border border-[var(--danger-border)] rounded-lg text-[var(--danger)] text-xs mb-4">{error}</div>}

          {result && (
            <div className="p-3 bg-[var(--success-bg)] border border-[var(--success-border)] rounded-lg text-xs mb-4 space-y-1">
              {result.receive && <div className="text-[var(--success)] font-medium">✓ Receive created: {result.receive}</div>}
              {result.bill && <div className="text-[var(--success)] font-medium">✓ Bill created: {result.bill}</div>}
              {result.error && <div className="text-[var(--warning)]">⚠ Bill error: {result.error}</div>}
            </div>
          )}

          {!loading && po && !result && (
            <div className="space-y-5">
              {/* Date */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label style={lbl}>Receive Date</label>
                  <input type="date" value={date} onChange={e => setDate(e.target.value)} className={inp} />
                </div>
              </div>

              {/* Line items */}
              <div>
                <label style={lbl}>Items to Receive</label>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                      {['Item', 'PO Qty', 'Already Received', 'Receiving Now'].map((h, i) => (
                        <th key={i} style={{ padding: '5px 8px', textAlign: i >= 1 ? 'right' : 'left',
                          color: 'var(--text-4)', fontWeight: 500, fontSize: 10, textTransform: 'uppercase' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {po.line_items.map(li => {
                      const remaining = li.quantity - li.quantity_received;
                      return (
                        <tr key={li.line_item_id} style={{ borderBottom: '1px solid var(--border-muted)' }}>
                          <td style={{ padding: '7px 8px' }}>
                            <div className="text-[var(--text)] text-xs" style={{ maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={li.name}>{li.name}</div>
                            <div className="text-[var(--text-4)]" style={{ fontSize: 10, ...mono }}>{li.sku}</div>
                          </td>
                          <td style={{ padding: '7px 8px', textAlign: 'right', ...mono, color: 'var(--text-3)', fontSize: 12 }}>
                            {li.quantity} {li.unit}
                          </td>
                          <td style={{ padding: '7px 8px', textAlign: 'right', ...mono,
                            color: li.quantity_received > 0 ? 'var(--success)' : 'var(--text-4)', fontSize: 12 }}>
                            {li.quantity_received || '—'}
                          </td>
                          <td style={{ padding: '7px 8px', textAlign: 'right' }}>
                            <input
                              type="number"
                              min={0}
                              max={remaining}
                              value={quantities[li.line_item_id] ?? 0}
                              onChange={e => setQuantities(prev => ({
                                ...prev, [li.line_item_id]: Math.min(remaining, Math.max(0, Number(e.target.value)))
                              }))}
                              className="via-input text-xs py-1 px-2 w-20 text-right"
                              style={mono}
                            />
                            <span className="text-[var(--text-4)] text-xs ml-1">{li.unit}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Convert to Bill option */}
              <div className="border border-[var(--border)] rounded-lg p-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={createBill} onChange={e => setCreateBill(e.target.checked)} className="w-3.5 h-3.5 rounded" />
                  <span className="text-[var(--text)] text-xs font-medium">Also convert to Bill after receiving</span>
                </label>
                {createBill && (
                  <div className="mt-3">
                    <label style={lbl}>Bill Number</label>
                    <input value={billNumber} onChange={e => setBillNumber(e.target.value)}
                      placeholder={po.purchaseorder_number}
                      className={inp} style={mono} />
                    <p className="text-[var(--text-4)] text-xs mt-1">Default: PO number. Can use vendor invoice number.</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {!result && (
          <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-[var(--border)] flex-shrink-0">
            <button onClick={onClose}
              className="px-4 py-2 text-xs text-[var(--text-3)] border border-[var(--border)] rounded-lg hover:bg-[var(--surface-2)] transition-colors">
              Cancel
            </button>
            <button onClick={handleSubmit} disabled={saving || loading || !!result}
              className="px-4 py-2 text-xs bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white rounded-lg font-medium transition-colors disabled:opacity-50">
              {saving ? 'Saving…' : createBill ? 'Receive & Create Bill' : 'Receive Items'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Bulk Receive Modal ──────────────────────────────────────────────────────

function BulkReceiveModal({ poIds, pos, onClose, onDone }: {
  poIds: string[];
  pos: PO[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [saving, setSaving] = useState(false);
  const [results, setResults] = useState<Array<{po_number: string; receive_number?: string; success: boolean; error?: string}>>([]);
  const [error, setError] = useState('');

  const mono = { fontFamily: 'JetBrains Mono, monospace' };
  const selectedPOs = pos.filter(p => poIds.includes(p.purchaseorder_id));

  async function handleReceiveAll() {
    setSaving(true); setError('');
    const out: typeof results = [];

    for (const po of selectedPOs) {
      try {
        // Fetch PO detail to get line_item_ids and quantities
        const detRes = await fetch('/api/purchases/receive?po_id=' + po.purchaseorder_id);
        const detData = await detRes.json();
        if (!detData.success) throw new Error(detData.error);

        const lineItems = detData.po.line_items
          .filter((li: {quantity: number; quantity_received: number}) => li.quantity > li.quantity_received)
          .map((li: {line_item_id: string; quantity: number; quantity_received: number}) => ({
            line_item_id: li.line_item_id,
            quantity_received: li.quantity - li.quantity_received,
          }));

        if (!lineItems.length) {
          out.push({ po_number: po.purchaseorder_number, success: false, error: 'Nothing to receive' });
          continue;
        }

        const res = await fetch('/api/purchases/receive', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ po_id: po.purchaseorder_id, line_items: lineItems, date }),
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error);
        out.push({ po_number: po.purchaseorder_number, receive_number: data.receive?.receive_number, success: true });
      } catch(e) {
        out.push({ po_number: po.purchaseorder_number, success: false, error: String(e) });
      }
    }

    setResults(out);
    setSaving(false);
    if (out.every(r => r.success)) setTimeout(onDone, 2000);
  }

  const done = results.length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="via-card w-[520px] mx-4 flex flex-col max-h-[80vh]" onClick={e => e.stopPropagation()}>

        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)] flex-shrink-0">
          <div>
            <h3 className="text-[var(--text)] font-semibold text-sm">Receive Items</h3>
            <p className="text-[var(--text-3)] text-xs mt-0.5">{selectedPOs.length} Purchase Order{selectedPOs.length > 1 ? 's' : ''} — full quantity</p>
          </div>
          <button onClick={onClose} className="text-[var(--text-3)] hover:text-[var(--text)] text-lg">✕</button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-3">
          {error && <div className="p-2.5 bg-[var(--danger-bg)] border border-[var(--danger-border)] rounded-lg text-[var(--danger)] text-xs">{error}</div>}

          {!done && (
            <>
              <div>
                <label className="block text-xs text-[var(--text-3)] mb-1 uppercase tracking-wider font-medium" style={{ fontSize: 11 }}>Receive Date</label>
                <input type="date" value={date} onChange={e => setDate(e.target.value)}
                  className="via-input text-xs py-1.5 px-3 w-48" />
              </div>
              <div className="space-y-2">
                {selectedPOs.map(po => (
                  <div key={po.purchaseorder_id} className="flex items-center justify-between px-3 py-2 bg-[var(--surface-2)] rounded-lg border border-[var(--border)]">
                    <div>
                      <span style={mono} className="text-[var(--accent-text)] text-xs font-medium">{po.purchaseorder_number}</span>
                      <span className="text-[var(--text-3)] text-xs ml-2">{po.vendor_name}</span>
                    </div>
                    <span className="text-[var(--text-4)] text-xs" style={mono}>
                      {po.received_status === 'partially_received' ? 'Partial → Full' : 'All items'}
                    </span>
                  </div>
                ))}
              </div>
              <p className="text-[var(--text-4)] text-xs">Full remaining quantity will be received for each PO.</p>
            </>
          )}

          {done && (
            <div className="space-y-2">
              {results.map((r, i) => (
                <div key={i} className={`flex items-center gap-3 px-3 py-2 rounded-lg border text-xs ${
                  r.success ? 'bg-[var(--success-bg)] border-[var(--success-border)] text-[var(--success)]'
                  : 'bg-[var(--danger-bg)] border-[var(--danger-border)] text-[var(--danger)]'}`}>
                  <span className="font-bold">{r.success ? '✓' : '✗'}</span>
                  <span style={mono} className="font-medium">{r.po_number}</span>
                  <span>{r.success ? `Receive ${r.receive_number} created` : r.error}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-[var(--border)] flex-shrink-0">
          <button onClick={onClose}
            className="px-4 py-2 text-xs text-[var(--text-3)] border border-[var(--border)] rounded-lg hover:bg-[var(--surface-2)] transition-colors">
            {done ? 'Close' : 'Cancel'}
          </button>
          {!done && (
            <button onClick={handleReceiveAll} disabled={saving}
              className="px-4 py-2 text-xs bg-[var(--info)] hover:opacity-90 text-white rounded-lg font-medium transition-opacity disabled:opacity-50">
              {saving ? 'Receiving…' : `↓ Receive ${selectedPOs.length} PO${selectedPOs.length > 1 ? 's' : ''}`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Received Not Billed Table ───────────────────────────────────────────────

interface ReceivedPO {
  purchaseorder_id: string;
  purchaseorder_number: string;
  vendor_id: string;
  vendor_name: string;
  date: string;
  total: number;
  received_status: string;
}

function ReceivedNotBilledTable({ onRefresh }: { onRefresh: () => void }) {
  const [items, setItems] = useState<ReceivedPO[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [converting, setConverting] = useState(false);
  const [results, setResults] = useState<{number: string; bill_number?: string; success: boolean; error?: string}[]>([]);
  const mono = { fontFamily: 'JetBrains Mono, monospace' };
  const formatRp = (n: number) => 'Rp ' + Number(n).toLocaleString('id-ID');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/purchases?mode=received_not_billed');
      const data = await res.json();
      setItems(data.purchaseorders || []);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function handleConvert() {
    setConverting(true); setResults([]);
    const out: typeof results = [];
    for (const id of selected) {
      const po = items.find(p => p.purchaseorder_id === id);
      try {
        const res = await fetch('/api/purchases/receive', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ po_id: id, line_items: [], date: new Date().toISOString().split('T')[0], create_bill: true, bill_number: po?.purchaseorder_number }),
        });
        const d = await res.json();
        if (d.bill?.success) {
          out.push({ number: po?.purchaseorder_number || id, bill_number: d.bill.bill_number, success: true });
        } else {
          throw new Error(d.bill?.error || d.error || 'Unknown error');
        }
      } catch(e) { out.push({ number: po?.purchaseorder_number || id, success: false, error: String(e) }); }
    }
    setResults(out);
    setSelected(new Set());
    await fetchData();
    onRefresh();
    setConverting(false);
  }

  if (!loading && items.length === 0) return null;

  return (
    <div className="via-card mb-4">
      <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--border)]">
        <div>
          <h3 className="font-bold text-base" style={{ color: 'var(--serious)' }}>Received — Not Billed</h3>
          <p className="text-[var(--text-4)] text-xs">Items received, pending bill conversion — tick to convert</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[var(--text-4)] text-xs">Total ({items.length} POs)</span>
          {selected.size > 0 && (
            <button onClick={handleConvert} disabled={converting}
              className="px-3 py-1.5 text-xs bg-[var(--warning-bg)] text-[var(--warning)] border border-[var(--warning-border)] rounded-lg font-medium hover:opacity-90 disabled:opacity-50">
              {converting ? 'Converting…' : `→ Convert to Bill (${selected.size})`}
            </button>
          )}
        </div>
      </div>
      {results.length > 0 && (
        <div className="px-5 py-2 border-b border-[var(--border)] space-y-1">
          {results.map((r,i) => (
            <div key={i} className={`text-xs flex gap-2 ${r.success?'text-[var(--success)]':'text-[var(--danger)]'}`}>
              <span>{r.success?'✓':'✗'}</span><span style={mono}>{r.number}</span>
              <span>{r.success?`Bill ${r.bill_number} created`:r.error}</span>
            </div>
          ))}
        </div>
      )}
      <div style={{ borderLeft: '4px solid var(--serious)' }}>
      <table className="via-table">
        <thead><tr>
          <th className="w-8"><input type="checkbox" className="w-3.5 h-3.5 rounded"
            checked={selected.size===items.length&&items.length>0}
            onChange={()=>selected.size===items.length?setSelected(new Set()):setSelected(new Set(items.map(p=>p.purchaseorder_id)))} /></th>
          <th>PO Number</th><th>Vendor</th><th>Date</th>
          <th>Received Status</th><th className="text-right">Total</th>
        </tr></thead>
        <tbody>
          {items.map(po => (
            <tr key={po.purchaseorder_id} className={selected.has(po.purchaseorder_id)?'bg-[var(--accent-light)]':'hover:bg-[var(--surface-2)] transition-colors'}>
              <td><input type="checkbox" className="w-3.5 h-3.5 rounded"
                checked={selected.has(po.purchaseorder_id)}
                onChange={()=>setSelected(prev=>{const n=new Set(prev);n.has(po.purchaseorder_id)?n.delete(po.purchaseorder_id):n.add(po.purchaseorder_id);return n;})} /></td>
              <td className="text-[var(--accent-text)] text-xs font-medium" style={mono}>{po.purchaseorder_number}</td>
              <td className="text-[var(--text)] text-xs">{po.vendor_name}</td>
              <td className="text-[var(--text-3)] text-xs">{po.date}</td>
              <td><span className={`via-badge ${po.received_status==='received'?'via-badge-success':'via-badge-warning'}`}>
                {po.received_status==='received'?'Fully Received':'Partial'}
              </span></td>
              <td className="text-right text-[var(--text-2)] text-xs" style={mono}>{formatRp(po.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  );
}

// ─── Create PO ────────────────────────────────────────────────────────────────
// One click, per brand: raises a Draft PO per warehouse (HEAD OFFICE / HUB-BDG /
// HUB-MDN) covering only the still-unpurchased portion of Confirmed SO demand
// for that brand (net of stock on hand and anything already on order). Draft
// status — Admin reviews/revises in Zoho before it goes to Pending Approval.

interface BrandVendor { brand: string; vendor_name: string }

interface CreatePOLinePreview {
  item_id: string;
  name: string;
  sku: string;
  quantity: number;
  unit: string;
  rate: number;
  covers: Array<{ salesorder_number: string; customer_name: string; qty: number }>;
}

interface CreatePOHubResult {
  location_name: string;
  purchaseorder_id?: string;
  purchaseorder_number?: string;
  line_items: CreatePOLinePreview[];
  total: number;
  error?: string;
}

interface CreatePOSummary {
  brand: string;
  vendor_name: string;
  hubs: CreatePOHubResult[];
}

function CreatePOPanel({ onCreated }: { onCreated: () => void }) {
  const [brands, setBrands] = useState<BrandVendor[]>([]);
  const [brand, setBrand] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [summary, setSummary] = useState<CreatePOSummary | null>(null);

  useEffect(() => {
    fetch('/api/purchases/create-po')
      .then(r => r.json())
      .then(d => {
        if (d.success) {
          setBrands(d.brands || []);
          if (d.brands?.length) setBrand(d.brands[0].brand);
        }
      })
      .catch(() => {});
  }, []);

  async function handleCreate() {
    if (!brand) return;
    const bv = brands.find(b => b.brand === brand);
    const ok = window.confirm(`Create Draft Purchase Order(s) in Zoho for brand ${brand} (vendor: ${bv?.vendor_name || '—'})? One PO will be raised per warehouse with unmet Confirmed SO demand.`);
    if (!ok) return;

    setCreating(true); setError(''); setSummary(null);
    try {
      const res = await fetch('/api/purchases/create-po', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brand }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Failed to create Purchase Order(s)');
      setSummary(data);
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="via-card mb-6 overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--border)]">
        <div>
          <h2 className="font-bold text-base text-[var(--text)]">Create Purchase Order</h2>
          <p className="text-[var(--text-3)] text-xs mt-0.5">Raises Draft POs per warehouse, covering only unmet Confirmed SO demand for the selected brand</p>
        </div>
      </div>
      <div className="px-5 py-4 flex items-center gap-3">
        <select
          value={brand}
          onChange={e => { setBrand(e.target.value); setSummary(null); setError(''); }}
          className="via-input text-xs py-1.5 px-3 w-56"
        >
          {brands.map(b => <option key={b.brand} value={b.brand}>{b.brand}</option>)}
        </select>
        <span className="text-[var(--text-4)] text-xs">
          Vendor: {brands.find(b => b.brand === brand)?.vendor_name || '—'}
        </span>
        <button
          onClick={handleCreate}
          disabled={creating || !brand}
          className="ml-auto px-4 py-2 text-xs bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white rounded-lg font-medium transition-colors disabled:opacity-50"
        >
          {creating ? 'Creating…' : '+ Create PO'}
        </button>
      </div>

      {error && (
        <div className="mx-5 mb-4 p-3 bg-[var(--danger-bg)] border border-[var(--danger-border)] rounded-lg text-[var(--danger)] text-xs">{error}</div>
      )}

      {summary && (
        <div className="mx-5 mb-4 space-y-2">
          <div className="text-[var(--text-3)] text-xs font-medium uppercase tracking-wider" style={mono}>
            PO Created Summary — {summary.brand} ({summary.vendor_name})
          </div>
          {summary.hubs.length === 0 && (
            <div className="p-3 bg-[var(--success-bg)] border border-[var(--success-border)] rounded-lg text-[var(--success)] text-xs">
              No purchase needed — every Confirmed SO for {summary.brand} is already covered by stock or an existing PO.
            </div>
          )}
          {summary.hubs.map((h, i) => (
            <div key={i} className={`p-3 rounded-lg border text-xs ${h.error ? 'bg-[var(--danger-bg)] border-[var(--danger-border)]' : 'bg-[var(--success-bg)] border-[var(--success-border)]'}`}>
              <div className="flex items-center justify-between">
                <span className={`font-semibold ${h.error ? 'text-[var(--danger)]' : 'text-[var(--success)]'}`}>
                  {h.error ? '✗' : '✓'} {h.location_name}
                  {h.purchaseorder_number && <span style={mono} className="ml-2 text-[var(--accent-text)]">{h.purchaseorder_number}</span>}
                </span>
                {!h.error && <span style={mono} className="text-[var(--text-2)]">{h.line_items.length} item{h.line_items.length !== 1 ? 's' : ''} · {formatRp(h.total)}</span>}
              </div>
              {h.error && <div className="mt-1 text-[var(--danger)]">{h.error}</div>}
              {!h.error && (
                <div className="mt-2 space-y-1">
                  {h.line_items.map((li, li_i) => (
                    <div key={li_i} className="flex items-center justify-between text-[var(--text-3)]">
                      <span className="truncate max-w-[300px]" title={li.name}>{li.name}</span>
                      <span style={mono}>{li.quantity} {li.unit}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function PurchasesPage() {
  const [draftPOs, setDraftPOs] = useState<PO[]>([]);
  const [issuedPOs, setIssuedPOs] = useState<PO[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [soCount, setSoCount] = useState(0);
  const [lastRefreshed, setLastRefreshed] = useState('');

  const [receiveModal, setReceiveModal] = useState<string | null>(null);
  const [selectedIssued, setSelectedIssued] = useState<Set<string>>(new Set());
  const [showBulkReceive, setShowBulkReceive] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/purchases');
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      setDraftPOs(data.draft_pos || []);
      setIssuedPOs(data.issued_pos || []);
      setSoCount(data.so_count || 0);
      setLastRefreshed(new Date().toLocaleTimeString('id-ID'));
    } catch (e) { setError(String(e)); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  return (
    <div className="via-page" style={{ background: 'var(--bg)', minHeight: '100%' }}>
      <div style={{ maxWidth: 1400, margin: '0 auto' }}>

        {/* Header */}
        <div className="flex items-start justify-between mb-5">
          <div>
            <h1 className="text-[var(--text)] font-semibold text-2xl tracking-tight">Purchases</h1>
          </div>
          <div className="flex items-center gap-3">
            {lastRefreshed && <span className="text-[var(--text-4)] text-xs" style={mono}>Updated {lastRefreshed}</span>}
            <button onClick={fetchAll} disabled={loading}
              className="px-3 py-1.5 text-xs bg-[var(--surface-2)] hover:bg-[var(--surface-3)] text-[var(--text-3)] hover:text-[var(--text)] rounded-lg border border-[var(--border)] transition-colors disabled:opacity-50">
              {loading ? '…' : '↻'}
            </button>
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-3 gap-3 mb-5">
          {[
            { label: 'Draft', value: loading ? '…' : draftPOs.length, color: 'var(--text-3)' },
            { label: 'Issued (Open)', value: loading ? '…' : issuedPOs.length, color: 'var(--info)' },
            { label: 'Confirmed SOs Checked', value: loading ? '…' : soCount, color: 'var(--success)' },
          ].map(c => (
            <div key={c.label} className="via-card px-4 py-3">
              <div className="text-[var(--text-3)] text-xs mb-1">{c.label}</div>
              <div className="text-2xl font-semibold" style={{ ...mono, color: c.color }}>{c.value}</div>
            </div>
          ))}
        </div>

        {error && <div className="mb-4 p-3 bg-[var(--danger-bg)] border border-[var(--danger-border)] rounded-lg text-[var(--danger)] text-sm">{error}</div>}

        {/* Search */}
        <div className="flex items-center gap-3 mb-5">
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search…"
            className="via-input text-xs py-1.5 px-3 w-80" />
        </div>

        {/* Create PO — brand-batched Draft PO generation, covers unmet Confirmed SO demand */}
        <CreatePOPanel onCreated={fetchAll} />

        {/* Table 1 — Draft POs (real Zoho draft status — not yet submitted for approval, no checks) */}
        <div className="mb-6">
          <POTable
            title="Draft" groupColor="var(--neutral)"
            desc="Not yet submitted for approval — plain list, no SO matching"
            pos={draftPOs} loading={loading} search={search} showMatching={false}
            selectable={false}
          />
        </div>

        {/* Pending Approval — SO-matching, stock-on-hand, and the only gated approval path */}
        <div className="mb-6">
          <POApprovalPanel compact onApproved={fetchAll} />
        </div>

        {/* Table 2 — Issued POs */}
        {selectedIssued.size > 0 && (
          <div className="flex items-center gap-3 px-4 py-2 mb-2 bg-[var(--info-bg)] border border-[var(--info-border)] rounded-lg">
            <span className="text-[var(--info)] text-xs font-medium">{selectedIssued.size} PO{selectedIssued.size > 1 ? 's' : ''} selected</span>
            <button onClick={() => setShowBulkReceive(true)}
              className="px-3 py-1.5 text-xs bg-[var(--info)] text-white rounded-lg font-medium hover:opacity-80 transition-opacity">
              ↓ Receive Selected
            </button>
            <button onClick={() => setSelectedIssued(new Set())}
              className="ml-auto text-[var(--text-4)] text-xs">Clear</button>
          </div>
        )}
        <POTable
          title="Issued" groupColor="var(--warning)"
          desc="Approved & sent to vendor — tick to receive"
          pos={issuedPOs} loading={loading} search={search} showMatching={true}
          selectable={true} showReceipt={true}
          selected={selectedIssued}
          onToggle={(id) => {
            const po = issuedPOs.find(p => p.purchaseorder_id === id);
            if (po?.received_status === 'received') return; // skip fully received
            setSelectedIssued(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
          }}
          onToggleAll={() => {
            const unreceived = issuedPOs.filter(p => p.received_status !== 'received').map(p => p.purchaseorder_id);
            if (selectedIssued.size === unreceived.length) setSelectedIssued(new Set());
            else setSelectedIssued(new Set(unreceived));
          }}
          onReceive={(poId: string) => setReceiveModal(poId)}
        />

        {/* Received Not Billed */}
        <ReceivedNotBilledTable onRefresh={fetchAll} />

        {/* Receive Items Modal (single) */}
        {receiveModal && (
          <ReceiveItemsModal
            poId={receiveModal}
            onClose={() => setReceiveModal(null)}
            onDone={() => { setReceiveModal(null); fetchAll(); }}
          />
        )}

        {/* Bulk Receive Modal */}
        {showBulkReceive && selectedIssued.size > 0 && (
          <BulkReceiveModal
            poIds={Array.from(selectedIssued)}
            pos={issuedPOs}
            onClose={() => setShowBulkReceive(false)}
            onDone={() => { setShowBulkReceive(false); setSelectedIssued(new Set()); fetchAll(); }}
          />
        )}

      </div>
    </div>
  );
}
