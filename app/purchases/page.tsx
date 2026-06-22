'use client';
import React from 'react';

import { useState, useEffect, useCallback, useMemo } from 'react';

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

interface ApproveResult {
  purchaseorder_id: string;
  purchaseorder_number: string;
  success: boolean;
  error?: string;
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
  title, desc, pos, loading, search, showMatching,
  selectable, selected, onToggleAll, onToggle, showReceipt, onReceive,
}: {
  title: string; desc: string; pos: PO[]; loading: boolean; search: string;
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
          <h2 className="text-[var(--text)] font-semibold text-sm">{title}</h2>
          <p className="text-[var(--text-3)] text-xs mt-0.5">{desc}</p>
        </div>
        <div className="flex items-center gap-3">
          {!loading && <span className="text-[var(--text-4)] text-xs" style={mono}>{filtered.length} POs</span>}
          {!loading && filtered.length > 0 && (
            <span className="text-[var(--text-4)] text-xs" style={mono}>{formatRp(filtered.reduce((s, p) => s + p.total, 0))}</span>
          )}
        </div>
      </div>

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
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
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
            <tfoot>
              <tr style={{ borderTop: '1px solid var(--border)', background: 'var(--surface-2)' }}>
                <td colSpan={selectable ? (showMatching ? 8 : 8) : (showMatching ? 7 : 7)}
                  style={{ padding: '7px 12px', color: 'var(--text-3)', fontSize: 11, ...mono }}>
                  TOTAL ({filtered.length} POs)
                </td>
                <td style={{ padding: '7px 12px', textAlign: 'right', ...mono, color: 'var(--text)', fontWeight: 600, fontSize: 12 }}>
                  {formatRp(filtered.reduce((s, p) => s + p.total, 0))}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
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
          {loading && <div className="text-[var(--text-3)] text-sm animate-pulse">Loading PO details…</div>}
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

// ─── Pending Approval PO Table ───────────────────────────────────────────────

function PendingApprovalPOTable({ onRefresh }: { onRefresh: () => void }) {
  const [items, setItems] = useState<PO[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [approving, setApproving] = useState(false);
  const [results, setResults] = useState<{number: string; success: boolean; error?: string}[]>([]);
  const mono = { fontFamily: 'JetBrains Mono, monospace' };
  const formatRp = (n: number) => 'Rp ' + Number(n).toLocaleString('id-ID');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/purchases?mode=pending_approval');
      const data = await res.json();
      setItems(data.purchaseorders || []);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function handleApprove() {
    setApproving(true); setResults([]);
    const out: typeof results = [];
    for (const id of selected) {
      const po = items.find(p => p.purchaseorder_id === id);
      try {
        const res = await fetch('/api/purchases/auto-approve', { method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ purchaseorder_id: id }),
        });
        const d = await res.json();
        if (!d.success) throw new Error(d.error);
        out.push({ number: po?.purchaseorder_number || id, success: true });
      } catch(e) { out.push({ number: po?.purchaseorder_number || id, success: false, error: String(e) }); }
    }
    setResults(out);
    setSelected(new Set());
    await fetchData();
    onRefresh();
    setApproving(false);
  }

  if (!loading && items.length === 0) return null;

  return (
    <div className="via-card mb-4">
      <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--border)]">
        <div>
          <h3 className="text-[var(--text)] font-semibold text-sm">Pending Approval</h3>
          <p className="text-[var(--text-4)] text-xs">POs awaiting approval — tick to approve</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[var(--text-4)] text-xs" style={mono}>{items.length} POs</span>
          {selected.size > 0 && (
            <button onClick={handleApprove} disabled={approving}
              className="px-3 py-1.5 text-xs bg-[var(--accent)] text-white rounded-lg font-medium hover:opacity-90 disabled:opacity-50">
              {approving ? 'Approving…' : `✓ Approve (${selected.size})`}
            </button>
          )}
        </div>
      </div>
      {results.length > 0 && (
        <div className="px-5 py-2 border-b border-[var(--border)] space-y-1">
          {results.map((r,i) => (
            <div key={i} className={`text-xs flex gap-2 ${r.success?'text-[var(--success)]':'text-[var(--danger)]'}`}>
              <span>{r.success?'✓':'✗'}</span><span style={mono}>{r.number}</span>
              <span>{r.success?'Approved':r.error}</span>
            </div>
          ))}
        </div>
      )}
      <table className="via-table">
        <thead><tr>
          <th className="w-8"><input type="checkbox" className="w-3.5 h-3.5 rounded"
            checked={selected.size===items.length&&items.length>0}
            onChange={()=>selected.size===items.length?setSelected(new Set()):setSelected(new Set(items.map(p=>p.purchaseorder_id)))} /></th>
          <th>PO Number</th><th>Vendor</th><th>Date</th><th className="text-right">Total</th>
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
              <td className="text-right text-[var(--text-2)] text-xs" style={mono}>{formatRp(po.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
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
          <h3 className="text-[var(--text)] font-semibold text-sm">Received — Not Billed</h3>
          <p className="text-[var(--text-4)] text-xs">Items received, pending bill conversion — tick to convert</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[var(--text-4)] text-xs" style={mono}>{items.length} POs</span>
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
  );
}

// ─── Memo Creator ────────────────────────────────────────────────────────────

function generateMemoPDF(data: {
  courier_name: string; vehicle: string; courier_service: string;
  date: string; pos: Array<{ po_number: string; vendor_name: string; date: string }>;
}) {
  // Build printable HTML and trigger browser print-to-PDF
  const pos_rows = data.pos.map((po, i) => `
    <tr>
      <td style="text-align:center">${i + 1}</td>
      <td><strong>${po.po_number}</strong></td>
      <td>${po.vendor_name}</td>
      <td>${po.date}</td>
      <td></td>
    </tr>`).join('');

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Goods Collection Memo</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Arial, sans-serif; font-size: 11px; color: #1a1a2e; padding: 24px 32px; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 4px; }
  .company { font-size: 15px; font-weight: bold; color: #1a1a2e; }
  .doc-title { font-size: 15px; font-weight: bold; color: #cc785c; text-align: right; }
  .divider { border: none; border-top: 2.5px solid #cc785c; margin: 8px 0 12px; }
  .info-grid { display: grid; grid-template-columns: 90px 1fr 110px 1fr; gap: 4px 8px; margin-bottom: 16px; }
  .info-label { color: #888; font-size: 10px; }
  .info-value { font-weight: bold; }
  .pickup-addr { grid-column: 4; grid-row: 1 / span 3; border-left: 2px solid #e0ddd8; padding-left: 10px; }
  .pickup-addr .addr-name { font-weight: bold; font-size: 11px; }
  .pickup-addr .addr-line { font-size: 10px; color: #555; line-height: 1.5; }
  .section-title { font-size: 9px; font-weight: bold; color: #888; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 6px; }
  .courier-box { background: #f8f6f3; border: 0.5px solid #e0ddd8; padding: 8px 12px; margin-bottom: 16px; }
  .courier-grid { display: grid; grid-template-columns: 70px 1fr 80px 1fr; gap: 4px 8px; }
  .cou-label { color: #888; font-size: 10px; }
  .cou-value { font-weight: bold; font-size: 11px; }
  table { width: 100%; border-collapse: collapse; font-size: 10px; margin-bottom: 14px; }
  thead tr { background: #1a1a2e; color: white; }
  th { padding: 6px 8px; font-size: 9px; text-transform: uppercase; letter-spacing: 0.04em; }
  th:first-child, td:first-child { text-align: center; width: 30px; }
  td { padding: 5px 8px; border-bottom: 0.4px solid #e0ddd8; }
  tr:nth-child(even) td { background: #f8f6f3; }
  td:nth-child(2) { font-weight: bold; }
  .notes { background: #fff8f5; border: 0.5px solid #cc785c; padding: 7px 10px; font-size: 9px; color: #666; margin-bottom: 14px; line-height: 1.5; }
  .footer-bar { background: #f5f5f2; border: 0.5px solid #e0ddd8; text-align: center; padding: 8px; font-size: 10px; font-weight: bold; color: #444; }
  .footer-line { text-align: center; font-size: 8px; color: #aaa; margin-top: 5px; }
  @media print { body { padding: 16px 24px; } }
</style>
</head>
<body>
  <div class="header">
    <div class="company">CV. VARINDO FORMA HUTAMA</div>
    <div class="doc-title">GOODS COLLECTION MEMO</div>
  </div>
  <hr class="divider">

  <div class="info-grid">
    <span class="info-label">Date</span>
    <span class="info-value">${data.date}</span>
    <span class="info-label" style="border-left:2px solid #e0ddd8; padding-left:10px;">Pickup Location</span>
    <div class="pickup-addr">
      <div class="addr-name">TAK PRODUCTS AND SERVICES, PT</div>
      <div class="addr-line">Jl. Komp. Multi Guna No. 17 Blok C<br>Kec. Serpong Utara, Tangerang 15320, Banten</div>
    </div>
    <span class="info-label">Prepared by</span>
    <span class="info-value">Varindo Admin</span>
    <span></span>
  </div>

  <div class="section-title">Courier Details</div>
  <div class="courier-box">
    <div class="courier-grid">
      <span class="cou-label">Name</span>
      <span class="cou-value">${data.courier_name}</span>
      <span class="cou-label">Vehicle No.</span>
      <span class="cou-value">${data.vehicle}</span>
      <span class="cou-label">Service</span>
      <span class="cou-value">${data.courier_service}</span>
      <span></span><span></span>
    </div>
  </div>

  <div class="section-title">Purchase Orders to Collect</div>
  <table>
    <thead>
      <tr>
        <th>#</th><th>PO Number</th><th>Vendor</th><th>PO Date</th><th>Remarks</th>
      </tr>
    </thead>
    <tbody>
      ${pos_rows}
      <tr><td></td><td></td><td></td><td></td><td></td></tr>
    </tbody>
  </table>

  <div class="notes">Please ensure all items listed above are handed over to the courier before departure. Both parties must verify quantities and conditions upon handover.</div>

  <div class="footer-bar">Computer-Generated Document &mdash; No Signature Required</div>
  <div class="footer-line">CV. Varindo Forma Hutama</div>
</body>
</html>`;

  const win = window.open('', '_blank');
  if (!win) return;
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => { win.print(); }, 500);
}

function MemoCreator({ issuedPOs }: { issuedPOs: PO[] }) {
  const today = new Date().toISOString().split('T')[0];
  const [courierName, setCourierName] = useState('');
  const [vehicle, setVehicle] = useState('');
  const [courierService, setCourierService] = useState('Lalamove');
  const [date, setDate] = useState(today);
  const [selectedPOs, setSelectedPOs] = useState<Set<string>>(new Set());
  const [error, setError] = useState('');

  const mono = { fontFamily: 'JetBrains Mono, monospace' };
  const formatRp = (n: number) => 'Rp ' + Number(n).toLocaleString('id-ID');
  const lbl: React.CSSProperties = { fontSize: 11, color: 'var(--text-3)', marginBottom: 4,
    display: 'block', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.04em' };

  const eligiblePOs = issuedPOs.filter(po => {
    const diff = (Date.now() - new Date(po.date).getTime()) / (1000 * 60 * 60 * 24);
    return diff <= 7;
  });

  function togglePO(id: string) {
    setSelectedPOs(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  function handleCreate() {
    if (!courierName.trim()) { setError('Enter courier name'); return; }
    if (!vehicle.trim()) { setError('Enter vehicle number'); return; }
    if (!selectedPOs.size) { setError('Select at least one PO'); return; }
    setError('');

    const pos = eligiblePOs
      .filter(po => selectedPOs.has(po.purchaseorder_id))
      .map(po => ({ po_number: po.purchaseorder_number, vendor_name: po.vendor_name, date: po.date }));

    generateMemoPDF({ courier_name: courierName, vehicle, courier_service: courierService, date, pos });
  }

  return (
    <div className="via-card mb-4">
      <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--border)]">
        <div>
          <h3 className="text-[var(--text)] font-semibold text-sm">Goods Collection Memo</h3>
          <p className="text-[var(--text-4)] text-xs">Generate a courier pickup memo for POs within the last 7 days</p>
        </div>
      </div>

      <div className="px-5 py-4 space-y-4">
        {error && (
          <div className="p-2.5 bg-[var(--danger-bg)] border border-[var(--danger-border)] rounded-lg text-[var(--danger)] text-xs">{error}</div>
        )}

        <div className="grid grid-cols-4 gap-4">
          <div>
            <label style={lbl}>Courier Name</label>
            <input value={courierName} onChange={e => setCourierName(e.target.value)}
              placeholder="e.g. Bapak Budi" className="via-input text-xs py-1.5 px-3 w-full" />
          </div>
          <div>
            <label style={lbl}>Vehicle No.</label>
            <input value={vehicle} onChange={e => setVehicle(e.target.value)}
              placeholder="e.g. B 1234 ABC" className="via-input text-xs py-1.5 px-3 w-full" style={mono} />
          </div>
          <div>
            <label style={lbl}>Courier Service</label>
            <select value={courierService} onChange={e => setCourierService(e.target.value)}
              className="via-input text-xs py-1.5 px-3 w-full">
              <option>Lalamove</option>
              <option>Gojek</option>
              <option>Grab</option>
              <option>Other</option>
            </select>
          </div>
          <div>
            <label style={lbl}>Pickup Date</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)}
              className="via-input text-xs py-1.5 px-3 w-full" />
          </div>
        </div>

        <div>
          <label style={{ ...lbl, marginBottom: 8 }}>
            Select POs to Collect
            <span className="text-[var(--text-4)] normal-case font-normal ml-2">
              (issued within last 7 days &mdash; {eligiblePOs.length} available)
            </span>
          </label>
          {eligiblePOs.length === 0 ? (
            <div className="text-[var(--text-4)] text-xs py-3">No POs within the last 7 days.</div>
          ) : (
            <div className="border border-[var(--border)] rounded-lg overflow-hidden">
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }}>
                    <th style={{ width: 36, padding: '6px 10px' }}>
                      <input type="checkbox" className="w-3.5 h-3.5 rounded"
                        checked={selectedPOs.size === eligiblePOs.length && eligiblePOs.length > 0}
                        onChange={function() {
                          if (selectedPOs.size === eligiblePOs.length) setSelectedPOs(new Set());
                          else setSelectedPOs(new Set(eligiblePOs.map(p => p.purchaseorder_id)));
                        }} />
                    </th>
                    {['PO Number', 'Vendor', 'PO Date', 'Total'].map((h, i) => (
                      <th key={i} style={{ padding: '6px 10px', textAlign: i === 3 ? 'right' : 'left',
                        color: 'var(--text-4)', fontWeight: 500, fontSize: 10, textTransform: 'uppercase' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {eligiblePOs.map(po => (
                    <tr key={po.purchaseorder_id}
                      className={`cursor-pointer transition-colors ${selectedPOs.has(po.purchaseorder_id) ? 'bg-[var(--accent-light)]' : 'hover:bg-[var(--surface-2)]'}`}
                      onClick={function() { togglePO(po.purchaseorder_id); }}
                      style={{ borderBottom: '1px solid var(--border-muted)' }}>
                      <td style={{ padding: '7px 10px', width: 36 }} onClick={function(e) { e.stopPropagation(); }}>
                        <input type="checkbox" className="w-3.5 h-3.5 rounded"
                          checked={selectedPOs.has(po.purchaseorder_id)}
                          onChange={function() { togglePO(po.purchaseorder_id); }} />
                      </td>
                      <td style={{ padding: '7px 10px', ...mono, color: 'var(--accent-text)', fontWeight: 600, fontSize: 12 }}>{po.purchaseorder_number}</td>
                      <td style={{ padding: '7px 10px', color: 'var(--text)', fontSize: 12 }}>{po.vendor_name}</td>
                      <td style={{ padding: '7px 10px', color: 'var(--text-3)', fontSize: 12 }}>{po.date}</td>
                      <td style={{ padding: '7px 10px', textAlign: 'right', ...mono, color: 'var(--text-2)', fontSize: 12 }}>{formatRp(po.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between pt-2">
          <div className="text-[var(--text-4)] text-xs">
            {selectedPOs.size > 0 && `${selectedPOs.size} PO${selectedPOs.size > 1 ? 's' : ''} selected`}
          </div>
          <button onClick={handleCreate} disabled={selectedPOs.size === 0 || !courierName || !vehicle}
            className="px-5 py-2 text-xs bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white rounded-lg font-semibold transition-colors disabled:opacity-40">
            Print / Save as PDF
          </button>
        </div>
      </div>
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

  // Approve state
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showConfirm, setShowConfirm] = useState(false);
  const [approving, setApproving] = useState(false);
  const [approveResults, setApproveResults] = useState<ApproveResult[]>([]);
  const [receiveModal, setReceiveModal] = useState<string | null>(null);
  const [selectedIssued, setSelectedIssued] = useState<Set<string>>(new Set());
  const [showBulkReceive, setShowBulkReceive] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError('');
    setApproveResults([]);
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

  function toggleAll() {
    if (selected.size === draftPOs.length) setSelected(new Set());
    else setSelected(new Set(draftPOs.map(po => po.purchaseorder_id)));
  }

  function toggle(id: string) {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  const selectedPOs = draftPOs.filter(po => selected.has(po.purchaseorder_id));
  const hasNeedsReview = selectedPOs.some(po => po.fulfillment_type === 'needs_review');

  async function doApprove() {
    setApproving(true);
    try {
      const res = await fetch('/api/purchases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ purchaseorder_ids: Array.from(selected) }),
      });
      const data = await res.json();
      setApproveResults(data.results || []);
      const successIds = (data.results || [])
        .filter((r: ApproveResult) => r.success)
        .map((r: ApproveResult) => r.purchaseorder_id);
      if (successIds.length > 0) {
        setDraftPOs(prev => prev.filter(po => !successIds.includes(po.purchaseorder_id)));
        setSelected(new Set());
      }
    } catch (e) { setError(String(e)); }
    finally { setApproving(false); setShowConfirm(false); }
  }

  return (
    <div className="via-page" style={{ background: 'var(--bg)', minHeight: '100%' }}>
      <div style={{ maxWidth: 1400, margin: '0 auto' }}>

        {/* Header */}
        <div className="flex items-start justify-between mb-5">
          <div>
            <h1 className="text-[var(--text)] font-semibold text-2xl tracking-tight">Purchases</h1>
            <p className="text-[var(--text-3)] text-sm mt-1">
              Review Draft POs against Confirmed Sales Orders and approve. Click any row to expand line items.
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

        {/* Summary cards */}
        <div className="grid grid-cols-4 gap-3 mb-5">
          {[
            { label: 'Draft (Pending Approval)', value: loading ? '…' : draftPOs.length, color: 'var(--warning)' },
            { label: 'Issued (Open)', value: loading ? '…' : issuedPOs.length, color: 'var(--info)' },
            { label: 'Confirmed SOs Checked', value: loading ? '…' : soCount, color: 'var(--success)' },
            { label: 'Needs Review', value: loading ? '…' : draftPOs.filter(p => p.fulfillment_type === 'needs_review').length, color: 'var(--danger)' },
          ].map(c => (
            <div key={c.label} className="via-card px-4 py-3">
              <div className="text-[var(--text-3)] text-xs mb-1">{c.label}</div>
              <div className="text-2xl font-semibold" style={{ ...mono, color: c.color }}>{c.value}</div>
            </div>
          ))}
        </div>

        {error && <div className="mb-4 p-3 bg-[var(--danger-bg)] border border-[var(--danger-border)] rounded-lg text-[var(--danger)] text-sm">{error}</div>}

        {/* Approve results */}
        {approveResults.length > 0 && (
          <div className="mb-4 via-card p-4 space-y-1">
            {approveResults.map((r, i) => (
              <div key={i} className={'text-xs flex gap-2 ' + (r.success ? 'text-[var(--success)]' : 'text-[var(--danger)]')}>
                <span>{r.success ? '✓' : '✗'}</span>
                <span style={mono} className="font-medium">{r.purchaseorder_number}</span>
                <span>{r.success ? 'Approved — moved to Issued' : r.error}</span>
              </div>
            ))}
          </div>
        )}

        {/* Search + Approve button */}
        <div className="flex items-center gap-3 mb-5">
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search PO number, vendor, SO number, item, customer…"
            className="via-input text-xs py-1.5 px-3 w-80" />
          {selected.size > 0 && (
            <button onClick={() => setShowConfirm(true)} disabled={approving}
              className="ml-auto px-4 py-1.5 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-xs font-medium rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2">
              {approving ? 'Approving…' : `Approve ${selected.size} PO${selected.size > 1 ? 's' : ''}`}
              {hasNeedsReview && <span className="text-yellow-200">⚠</span>}
            </button>
          )}
        </div>

        {/* Table 1 — Draft POs */}
        <div className="mb-6">
          <POTable
            title="Draft"
            desc="Pending Approval — review SO matching below, tick and approve when ready"
            pos={draftPOs} loading={loading} search={search} showMatching={true}
            selectable={true} selected={selected} onToggleAll={toggleAll} onToggle={toggle}
          />
        </div>

        {/* Pending Approval POs */}
        <PendingApprovalPOTable onRefresh={fetchAll} />

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
          title="Issued"
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

        {/* Goods Collection Memo */}
        <MemoCreator issuedPOs={issuedPOs} />

        {/* Confirm modal */}
        {showConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
            <div className="via-card w-[480px] p-6 mx-4">
              <h3 className="text-[var(--text)] font-semibold text-sm mb-2">Approve Purchase Orders</h3>
              {hasNeedsReview && (
                <div className="mb-3 p-2.5 bg-[var(--warning-bg)] border border-[var(--warning-border)] rounded-lg text-[var(--warning)] text-xs">
                  ⚠ Some selected POs have items that could not be matched to Confirmed SOs. Please verify before approving.
                </div>
              )}
              <p className="text-[var(--text-3)] text-xs mb-4">
                Approve <strong className="text-[var(--text)]">{selected.size}</strong> Draft Purchase Order{selected.size > 1 ? 's' : ''}?
                They will move to Issued status and be sent to the vendor.
              </p>
              <div className="max-h-48 overflow-y-auto mb-4 border border-[var(--border)] rounded-lg divide-y divide-[var(--border-muted)]">
                {selectedPOs.map(po => (
                  <div key={po.purchaseorder_id} className="flex items-center justify-between px-3 py-2.5 text-xs">
                    <span style={mono} className="text-[var(--accent-text)] font-medium">{po.purchaseorder_number}</span>
                    <span className="text-[var(--text-3)] truncate mx-2 flex-1">{po.vendor_name}</span>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <FulfillmentBadge type={po.fulfillment_type} />
                      <span style={mono} className="text-[var(--text-2)]">{formatRp(po.total)}</span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex gap-3 justify-end">
                <button onClick={() => setShowConfirm(false)}
                  className="px-4 py-2 text-xs text-[var(--text-3)] border border-[var(--border)] rounded-lg hover:bg-[var(--surface-2)] transition-colors">
                  Cancel
                </button>
                <button onClick={doApprove} disabled={approving}
                  className="px-4 py-2 text-xs bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white rounded-lg font-medium transition-colors disabled:opacity-50">
                  {approving ? 'Approving…' : 'Confirm Approve'}
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
