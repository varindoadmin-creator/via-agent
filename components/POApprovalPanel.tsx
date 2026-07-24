'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import StatusPill, { PillTone } from '@/components/ui/StatusPill';
import BoardGroupHeader from '@/components/ui/BoardGroupHeader';

type MatchRow = { salesorder_number: string; customer_name: string; customer_region: string; so_quantity: number; fulfilled_qty: number; fully_covered: boolean };

type LineItem = {
  item_id: string;
  name: string;
  sku: string;
  unit: string;
  location_name: string;
  quantity: number;
  rate: number;
  amount: number;
  matches: MatchRow[];
  matched_qty: number;
  stock_qty: number;
  stock_on_hand: number;
  match_status: string;
};

type RegionMixWarning = { regions: string[]; detail: string };

type PurchaseOrder = {
  purchaseorder_id: string;
  purchaseorder_number: string;
  vendor_name: string;
  date: string;
  location_name: string;
  total: number;
  status: 'OK' | 'PARTIAL' | 'REGION_MIX' | 'NEEDS_REVIEW';
  region_mix_warning: RegionMixWarning | null;
  line_items: LineItem[];
};

type UncoveredDemand = { item_id: string; name: string; sku: string; location_name: string; salesorder_number: string; customer_name: string; qty: number };

const formatRp = (n: number) => 'Rp ' + Math.round(n || 0).toLocaleString('id-ID');
const fmt = (n: number) => Number(n || 0).toLocaleString('id-ID');
const mono = { fontFamily: 'JetBrains Mono, monospace' };

function toneForValue(value?: string): PillTone {
  const v = (value || '').toUpperCase();
  if (v === 'OK' || v === 'MATCHED' || v === 'MULTI_MATCH') return 'good';
  if (v === 'REGION_MIX' || v === 'NEEDS_REVIEW') return 'critical';
  if (v === 'PARTIAL' || v === 'PARTIAL_SO' || v === 'EXCESS_STOCK') return 'warning';
  return 'neutral';
}

function Badge({ value, size = 'inline' }: { value?: string; size?: 'inline' | 'cell' }) {
  return <StatusPill tone={toneForValue(value)} size={size}>{value || 'UNKNOWN'}</StatusPill>;
}

// ─── PO-level board grouping — the 4 known PurchaseOrder.status values,
// problems surfaced first. ──────────────────────────────────────────────────
const PO_GROUPS: Record<PurchaseOrder['status'], { label: string; color: string }> = {
  NEEDS_REVIEW: { label: 'Needs Review',      color: 'var(--critical)' },
  REGION_MIX:   { label: 'Region Mix',        color: 'var(--critical)' },
  PARTIAL:      { label: 'Partial Coverage',  color: 'var(--warning)' },
  OK:           { label: 'Ready to Approve',  color: 'var(--good)' },
};
const PO_GROUP_ORDER: PurchaseOrder['status'][] = ['NEEDS_REVIEW', 'REGION_MIX', 'PARTIAL', 'OK'];

// Shared Pending Approval panel — matches Purchase Orders against Confirmed Sales
// Order demand and current stock, and is the ONLY surface that can approve a
// Pending Approval PO. Used standalone on /approvals/po and embedded inside the
// Purchases page's "Pending Approval" section, so there is exactly one gated
// approval path in VIA (no separate quick-approve list that skips these checks).
export default function POApprovalPanel({ compact = false, onApproved }: { compact?: boolean; onApproved?: () => void }) {
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [uncoveredDemand, setUncoveredDemand] = useState<UncoveredDemand[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [approveMessage, setApproveMessage] = useState('');
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  async function load() {
    setLoading(true); setError('');
    try {
      const res = await fetch('/api/approvals/po');
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Failed to load pending approval POs');
      setPurchaseOrders(data.purchase_orders || []);
      setUncoveredDemand(data.uncovered_demand || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return purchaseOrders;
    return purchaseOrders.filter(po =>
      po.purchaseorder_number.toLowerCase().includes(q) ||
      po.vendor_name.toLowerCase().includes(q) ||
      po.location_name.toLowerCase().includes(q)
    );
  }, [purchaseOrders, search]);

  function toggle(id: string) {
    setExpanded(prev => prev === id ? null : id);
  }

  async function approvePO(po: PurchaseOrder) {
    if (po.status !== 'OK') {
      setError(po.status === 'REGION_MIX'
        ? 'Cannot approve: matched Sales Orders span multiple regions. Resolve the mix first.'
        : po.status === 'PARTIAL'
        ? 'Cannot approve: one or more line items only partially cover the matched Sales Order(s).'
        : 'Cannot approve: one or more line items need manual review.');
      return;
    }

    const ok = window.confirm(`Approve ${po.purchaseorder_number} in Zoho? This will change the PO status to Issued (Open).`);
    if (!ok) return;

    setApprovingId(po.purchaseorder_id); setError(''); setApproveMessage('');
    try {
      const res = await fetch('/api/approvals/po', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ purchaseorder_ids: [po.purchaseorder_id] }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Failed to approve Purchase Order');
      const result = (data.results || [])[0];
      if (result && !result.success) throw new Error(result.error || 'Failed to approve Purchase Order');

      const failedSOs = ((result?.so_status_updates || []) as { salesorder_number: string; success: boolean }[])
        .filter(u => !u.success);
      if (failedSOs.length > 0) {
        setError(`${po.purchaseorder_number} approved, but VIA could not confirm the covered Sales Order(s) flipped to "Ordered" in Zoho: ${failedSOs.map(u => u.salesorder_number).join(', ')}. Check these manually.`);
      }
      setApproveMessage(`${po.purchaseorder_number} approved in Zoho.`);
      setPurchaseOrders(prev => prev.filter(item => item.purchaseorder_id !== po.purchaseorder_id));
      setExpanded(prev => prev === po.purchaseorder_id ? null : prev);
      onApproved?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setApprovingId(null); }
  }

  const totalValue = purchaseOrders.reduce((sum, po) => sum + (po.total || 0), 0);

  return (
    <div>
      {!compact && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start', marginBottom: 22 }}>
            <div>
              <h1 style={{ fontSize: 26, fontWeight: 700, color: 'var(--text)', margin: 0 }}>Purchase Order Approval</h1>
            </div>
            <button onClick={load} disabled={loading} style={{ border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text-2)', borderRadius: 8, padding: '9px 14px', fontSize: 12, cursor: 'pointer' }}>↻</button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12, marginBottom: 16 }}>
            <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, padding: 16 }}>
              <div style={{ ...mono, color: 'var(--text-4)', fontSize: 11, letterSpacing: '0.08em' }}>TOTAL PENDING PO</div>
              <div style={{ color: 'var(--text)', fontSize: 22, fontWeight: 700 }}>{purchaseOrders.length}</div>
            </div>
            <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, padding: 16 }}>
              <div style={{ ...mono, color: 'var(--text-4)', fontSize: 11, letterSpacing: '0.08em' }}>TOTAL VALUE</div>
              <div style={{ color: 'var(--text)', fontSize: 22, fontWeight: 700 }}>{formatRp(totalValue)}</div>
            </div>
            <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, padding: 16 }}>
              <div style={{ ...mono, color: 'var(--text-4)', fontSize: 11, letterSpacing: '0.08em' }}>UNCOVERED SO ITEMS</div>
              <div style={{ color: uncoveredDemand.length ? 'var(--warning)' : 'var(--text)', fontSize: 22, fontWeight: 700 }}>{uncoveredDemand.length}</div>
            </div>
          </div>
        </>
      )}

      {error && <div style={{ marginBottom: 14, padding: 12, borderRadius: 8, background: 'var(--danger-bg)', color: 'var(--danger)', border: '1px solid var(--danger-border)', fontSize: 13 }}>{error}</div>}
      {approveMessage && <div style={{ marginBottom: 14, padding: 12, borderRadius: 8, background: 'var(--success-bg)', color: 'var(--success)', border: '1px solid var(--success-border)', fontSize: 13 }}>{approveMessage}</div>}

      <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
          <div>
            <div style={{ color: 'var(--text)', fontWeight: 650 }}>Pending Approval</div>
            <div style={{ color: 'var(--text-4)', fontSize: 11 }}>POs awaiting approval — matched against SO demand and stock, tick to approve</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ color: 'var(--text-4)', fontSize: 12 }}>Total ({filtered.length} POs)</span>
            {compact && (
              <button onClick={load} disabled={loading} style={{ border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-2)', borderRadius: 8, padding: '8px 12px', fontSize: 11, cursor: 'pointer' }}>↻</button>
            )}
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…" style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-2)', padding: '9px 12px', borderRadius: 8, width: 230, outline: 'none' }} />
          </div>
        </div>

        <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
        <table style={{ width: '100%', minWidth: 780, borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr style={{ background: 'var(--surface-3)', color: 'var(--text-4)', ...mono, fontSize: 11, fontWeight: 500, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
              <th style={{ width: 44, padding: '11px 12px', textAlign: 'left' }}></th>
              <th style={{ padding: '11px 12px', textAlign: 'left' }}>PO Number</th>
              <th style={{ padding: '11px 12px', textAlign: 'left' }}>Vendor</th>
              <th style={{ padding: '11px 12px', textAlign: 'left' }}>Date</th>
              <th style={{ padding: '11px 12px', textAlign: 'left' }}>Warehouse</th>
              <th style={{ padding: '11px 12px', textAlign: 'right' }}>Total</th>
              <th style={{ padding: '11px 12px', textAlign: 'center' }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} style={{ padding: 28, color: 'var(--text-3)', textAlign: 'center' }}>Loading…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={7} style={{ padding: 28, color: 'var(--text-3)', textAlign: 'center' }}>No Pending Approval Purchase Orders found.</td></tr>
            ) : PO_GROUP_ORDER.flatMap(statusKey => {
              const group = PO_GROUPS[statusKey];
              const items = filtered.filter(po => po.status === statusKey);
              if (items.length === 0) return [];
              return [
                <tr key={`group-${statusKey}`}>
                  <td colSpan={7} style={{ padding: 0 }}>
                    <BoardGroupHeader label={group.label} count={items.length} color={group.color} />
                  </td>
                </tr>,
                ...items.map(po => {
              const isOpen = expanded === po.purchaseorder_id;
              const canApprove = po.status === 'OK';
              return (
                <Fragment key={po.purchaseorder_id}>
                  <tr onClick={() => toggle(po.purchaseorder_id)} style={{ borderTop: '1px solid var(--border)', cursor: 'pointer', color: 'var(--text-2)' }}>
                    <td style={{ padding: '12px', borderLeft: `4px solid ${group.color}` }}><span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 19, height: 19, borderRadius: '50%', background: isOpen ? 'var(--accent-light)' : 'var(--surface-3)', color: isOpen ? 'var(--accent)' : 'var(--text-3)', fontSize: 11 }}>{isOpen ? '⌄' : '›'}</span></td>
                    <td style={{ padding: '12px', ...mono, color: 'var(--accent-text)', fontWeight: 500, fontSize: 13 }}>{po.purchaseorder_number}</td>
                    <td style={{ padding: '12px', fontWeight: 600, fontSize: 14 }}>{po.vendor_name}</td>
                    <td style={{ padding: '12px', ...mono, fontSize: 13 }}>{po.date}</td>
                    <td style={{ padding: '12px', ...mono, fontSize: 13 }}>{po.location_name}</td>
                    <td style={{ padding: '12px', textAlign: 'right', ...mono, fontWeight: 700, fontSize: 14 }}>{formatRp(po.total)}</td>
                    <td style={{ padding: '6px 8px' }}><Badge value={po.status} size="cell" /></td>
                  </tr>

                  {isOpen && (
                    <tr>
                      <td colSpan={7} style={{ padding: 0, background: 'var(--surface-2)', borderTop: '1px solid var(--border)' }}>
                        <div style={{ padding: '18px 22px 22px 54px' }}>
                          {po.region_mix_warning && (
                            <div style={{ marginBottom: 14, padding: 12, borderRadius: 8, background: 'var(--danger-bg)', color: 'var(--danger)', border: '1px solid var(--danger-border)', fontSize: 12 }}>
                              <strong>Region mix:</strong> this PO's matched Sales Orders span more than one region ({po.region_mix_warning.regions.join(', ')}) — a single PO must serve one region only, to keep stock movement correct. {po.region_mix_warning.detail}
                            </div>
                          )}
                          {po.status === 'NEEDS_REVIEW' && !po.region_mix_warning && (
                            <div style={{ marginBottom: 14, padding: 12, borderRadius: 8, background: 'var(--danger-bg)', color: 'var(--danger)', border: '1px solid var(--danger-border)', fontSize: 12 }}>
                              One or more line items on this PO are missing a linked item and could not be checked automatically — review manually before approving.
                            </div>
                          )}
                          {po.status === 'PARTIAL' && (
                            <div style={{ marginBottom: 14, padding: 12, borderRadius: 8, background: 'var(--warning-bg)', color: 'var(--warning)', border: '1px solid var(--warning-border)', fontSize: 12 }}>
                              <strong>Partial coverage:</strong> this PO orders less than the matched Sales Order needs. The remainder still needs a separate PO.
                            </div>
                          )}
                          {po.line_items.some(li => li.stock_qty > 0) && (
                            <div style={{ marginBottom: 14, padding: 12, borderRadius: 8, background: 'var(--info-bg)', color: 'var(--info)', border: '1px solid var(--info-border)', fontSize: 12 }}>
                              <strong>Excess stock:</strong> some quantity ordered is beyond current Sales Order need. Double-check it wasn't a typo before approving.
                            </div>
                          )}

                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                            <h3 style={{ margin: 0, color: 'var(--text)', fontSize: 15 }}>Line Items</h3>
                            <button
                              onClick={(e) => { e.stopPropagation(); approvePO(po); }}
                              disabled={approvingId === po.purchaseorder_id || !canApprove}
                              title={!canApprove ? 'Approval is disabled until the region mix / partial coverage / review issue is resolved.' : 'Approve this Purchase Order in Zoho'}
                              style={{
                                border: canApprove ? '1px solid var(--success)' : '1px solid var(--border)',
                                background: canApprove ? 'var(--success)' : 'var(--surface-3)',
                                color: canApprove ? '#ffffff' : 'var(--text-4)',
                                borderRadius: 8,
                                padding: '7px 12px',
                                fontWeight: 700,
                                cursor: canApprove ? 'pointer' : 'not-allowed',
                                fontSize: 12,
                              }}
                            >{approvingId === po.purchaseorder_id ? 'Approving...' : 'Approve PO'}</button>
                          </div>

                          <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
                          <table style={{ width: '100%', minWidth: 760, borderCollapse: 'collapse' }}>
                            <thead>
                              <tr style={{ background: 'var(--surface-3)', color: 'var(--text-4)', ...mono, fontSize: 11, fontWeight: 500, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                                <th style={{ padding: 9, textAlign: 'left' }}>Item</th>
                                <th style={{ padding: 9, textAlign: 'left' }}>Location</th>
                                <th style={{ padding: 9, textAlign: 'right' }}>Stock on Hand</th>
                                <th style={{ padding: 9, textAlign: 'right' }}>PO Qty</th>
                                <th style={{ padding: 9, textAlign: 'left' }}>Matched SO(s)</th>
                                <th style={{ padding: 9, textAlign: 'right' }}>Excess Qty</th>
                                <th style={{ padding: 9, textAlign: 'center' }}>Status</th>
                              </tr>
                            </thead>
                            <tbody>
                              {po.line_items.map((li, idx) => (
                                <tr key={idx} style={{ borderTop: '1px solid var(--border)', verticalAlign: 'top' }}>
                                  <td style={{ padding: 9 }}>{li.name}<div style={{ ...mono, color: 'var(--text-4)', fontSize: 10 }}>{li.sku}</div></td>
                                  <td style={{ padding: 9, ...mono, fontSize: 11 }}>{li.location_name}</td>
                                  <td style={{ padding: 9, textAlign: 'right', ...mono }}>{fmt(li.stock_on_hand)} {li.unit}</td>
                                  <td style={{ padding: 9, textAlign: 'right', ...mono }}>{fmt(li.quantity)} {li.unit}</td>
                                  <td style={{ padding: 9 }}>
                                    {li.matches.length === 0 ? <span style={{ color: 'var(--text-4)' }}>—</span> : li.matches.map((m, i) => (
                                      <div key={i} style={{ fontSize: 12 }}>
                                        <span style={{ ...mono, color: 'var(--accent-text)', fontWeight: 500 }}>{m.salesorder_number}</span> {m.customer_name}
                                        {m.customer_region && <span style={{ color: 'var(--text-4)' }}> ({m.customer_region})</span>}
                                        <span style={{ ...mono, color: 'var(--text-3)' }}> — {fmt(m.fulfilled_qty)} of {fmt(m.so_quantity)} {li.unit} SO qty</span>
                                        {!m.fully_covered && <span style={{ color: 'var(--warning)' }}> (remainder still needed)</span>}
                                      </div>
                                    ))}
                                  </td>
                                  <td style={{ padding: 9, textAlign: 'right', ...mono }}>{li.stock_qty > 0 ? `+${fmt(li.stock_qty)} ${li.unit}` : '—'}</td>
                                  <td style={{ padding: '5px 6px' }}><Badge value={li.match_status} size="cell" /></td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            }),
              ];
            })}
          </tbody>
        </table>
        </div>
      </div>

      {uncoveredDemand.length > 0 && (
        <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', marginTop: 20 }}>
          <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ color: 'var(--text)', fontWeight: 650 }}>Sales Order Items Requests</div>
          </div>
          <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          <table style={{ width: '100%', minWidth: 640, borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--surface-3)', color: 'var(--text-4)', ...mono, fontSize: 11, fontWeight: 500, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                <th style={{ padding: '10px 12px', textAlign: 'left' }}>Item</th>
                <th style={{ padding: '10px 12px', textAlign: 'left' }}>Location</th>
                <th style={{ padding: '10px 12px', textAlign: 'left' }}>SO Number</th>
                <th style={{ padding: '10px 12px', textAlign: 'left' }}>Customer</th>
                <th style={{ padding: '10px 12px', textAlign: 'right' }}>Qty</th>
              </tr>
            </thead>
            <tbody>
              {uncoveredDemand.map((u, idx) => (
                <tr key={idx} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '10px 12px' }}>{u.name}<div style={{ ...mono, color: 'var(--text-4)', fontSize: 10 }}>{u.sku}</div></td>
                  <td style={{ padding: '10px 12px', ...mono, fontSize: 12 }}>{u.location_name}</td>
                  <td style={{ padding: '10px 12px', ...mono, color: 'var(--accent-text)', fontWeight: 500, fontSize: 12 }}>{u.salesorder_number}</td>
                  <td style={{ padding: '10px 12px' }}>{u.customer_name}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', ...mono, fontWeight: 700 }}>{fmt(u.qty)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}

      {!compact && (
        <p style={{ color: 'var(--text-4)', fontSize: 12, marginTop: 12 }}>VIA matches Pending Approval Purchase Orders against Confirmed Sales Order demand and current stock per warehouse. Final approval should still be reviewed by Admin/Manager before approving in Zoho.</p>
      )}
    </div>
  );
}
