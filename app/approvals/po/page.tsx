'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';

type MatchRow = { salesorder_number: string; customer_name: string; customer_region: string; so_quantity: number; fulfilled_qty: number };

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

function badgeColor(status?: string) {
  const v = (status || '').toUpperCase();
  if (v === 'OK' || v === 'MATCHED' || v === 'MULTI_MATCH') return { color: 'var(--success)', bg: 'var(--success-bg)', border: 'var(--success-border)' };
  if (v === 'REGION_MIX' || v === 'NEEDS_REVIEW') return { color: 'var(--danger)', bg: 'var(--danger-bg)', border: 'var(--danger-border)' };
  if (v === 'PARTIAL' || v === 'PARTIAL_SO' || v === 'EXCESS_STOCK') return { color: 'var(--warning)', bg: 'var(--warning-bg)', border: 'var(--warning-border)' };
  return { color: 'var(--text-3)', bg: 'var(--surface-3)', border: 'var(--border)' };
}

function Badge({ value }: { value?: string }) {
  const c = badgeColor(value);
  return <span style={{ ...mono, fontSize: 10, padding: '4px 8px', borderRadius: 999, color: c.color, background: c.bg, border: `1px solid ${c.border}` }}>{value || 'UNKNOWN'}</span>;
}

export default function POApprovalCheckPage() {
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
      setApproveMessage(`${po.purchaseorder_number} approved in Zoho.`);
      setPurchaseOrders(prev => prev.filter(item => item.purchaseorder_id !== po.purchaseorder_id));
      setExpanded(prev => prev === po.purchaseorder_id ? null : prev);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setApprovingId(null); }
  }

  const totalValue = purchaseOrders.reduce((sum, po) => sum + (po.total || 0), 0);

  return (
    <div style={{ padding: 24, maxWidth: 1280, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start', marginBottom: 22 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: 'var(--text)', margin: 0 }}>Purchase Order Approval</h1>
        </div>
        <button onClick={load} disabled={loading} style={{ border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text-2)', borderRadius: 8, padding: '9px 14px', fontSize: 12, cursor: 'pointer' }}>↻ Refresh</button>
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

      {error && <div style={{ marginBottom: 14, padding: 12, borderRadius: 8, background: 'var(--danger-bg)', color: 'var(--danger)', border: '1px solid var(--danger-border)', fontSize: 13 }}>{error}</div>}
      {approveMessage && <div style={{ marginBottom: 14, padding: 12, borderRadius: 8, background: 'var(--success-bg)', color: 'var(--success)', border: '1px solid var(--success-border)', fontSize: 13 }}>{approveMessage}</div>}

      <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
          <div>
            <div style={{ color: 'var(--text)', fontWeight: 650 }}>Pending Approval</div>
          </div>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search PO/vendor..." style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-2)', padding: '9px 12px', borderRadius: 8, width: 230, outline: 'none' }} />
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'var(--surface-3)', color: 'var(--text-4)', ...mono, fontSize: 10, letterSpacing: '0.08em' }}>
              <th style={{ width: 44, padding: '11px 12px', textAlign: 'left' }}></th>
              <th style={{ padding: '11px 12px', textAlign: 'left' }}>PO NUMBER</th>
              <th style={{ padding: '11px 12px', textAlign: 'left' }}>VENDOR</th>
              <th style={{ padding: '11px 12px', textAlign: 'left' }}>DATE</th>
              <th style={{ padding: '11px 12px', textAlign: 'left' }}>WAREHOUSE</th>
              <th style={{ padding: '11px 12px', textAlign: 'right' }}>TOTAL</th>
              <th style={{ padding: '11px 12px', textAlign: 'center' }}>STATUS</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} style={{ padding: 28, color: 'var(--text-3)', textAlign: 'center' }}>Loading pending approval POs...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={7} style={{ padding: 28, color: 'var(--text-3)', textAlign: 'center' }}>No Pending Approval Purchase Orders found.</td></tr>
            ) : filtered.map(po => {
              const isOpen = expanded === po.purchaseorder_id;
              const canApprove = po.status === 'OK';
              return (
                <Fragment key={po.purchaseorder_id}>
                  <tr onClick={() => toggle(po.purchaseorder_id)} style={{ borderTop: '1px solid var(--border)', cursor: 'pointer', color: 'var(--text-2)' }}>
                    <td style={{ padding: '12px' }}><span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 19, height: 19, borderRadius: '50%', background: isOpen ? 'var(--accent-light)' : 'var(--surface-3)', color: isOpen ? 'var(--accent)' : 'var(--text-3)', fontSize: 11 }}>{isOpen ? '⌄' : '›'}</span></td>
                    <td style={{ padding: '12px', ...mono, color: 'var(--text)', fontSize: 12 }}>{po.purchaseorder_number}</td>
                    <td style={{ padding: '12px', fontWeight: 600 }}>{po.vendor_name}</td>
                    <td style={{ padding: '12px', ...mono, fontSize: 12 }}>{po.date}</td>
                    <td style={{ padding: '12px', ...mono, fontSize: 12 }}>{po.location_name}</td>
                    <td style={{ padding: '12px', textAlign: 'right', ...mono, fontWeight: 700 }}>{formatRp(po.total)}</td>
                    <td style={{ padding: '12px', textAlign: 'center' }}><Badge value={po.status} /></td>
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
                              <strong>Partial coverage:</strong> one or more line items order less than the matched Sales Order(s) need. Approving this PO will not fully clear that demand — the remainder still needs a PO. See STATUS below and Sales Order Items Requests.
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

                          <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                            <thead>
                              <tr style={{ background: 'var(--surface-3)', color: 'var(--text-4)', ...mono, fontSize: 10 }}>
                                <th style={{ padding: 9, textAlign: 'left' }}>ITEM</th>
                                <th style={{ padding: 9, textAlign: 'left' }}>LOCATION</th>
                                <th style={{ padding: 9, textAlign: 'right' }}>PO QTY</th>
                                <th style={{ padding: 9, textAlign: 'left' }}>MATCHED SO(s)</th>
                                <th style={{ padding: 9, textAlign: 'right' }}>STOCK QTY</th>
                                <th style={{ padding: 9, textAlign: 'center' }}>STATUS</th>
                              </tr>
                            </thead>
                            <tbody>
                              {po.line_items.map((li, idx) => (
                                <tr key={idx} style={{ borderTop: '1px solid var(--border)', verticalAlign: 'top' }}>
                                  <td style={{ padding: 9 }}>{li.name}<div style={{ ...mono, color: 'var(--text-4)', fontSize: 10 }}>{li.sku}</div></td>
                                  <td style={{ padding: 9, ...mono, fontSize: 11 }}>{li.location_name}</td>
                                  <td style={{ padding: 9, textAlign: 'right', ...mono }}>{fmt(li.quantity)} {li.unit}</td>
                                  <td style={{ padding: 9 }}>
                                    {li.matches.length === 0 ? <span style={{ color: 'var(--text-4)' }}>—</span> : li.matches.map((m, i) => (
                                      <div key={i} style={{ fontSize: 12 }}>
                                        <span style={mono}>{m.salesorder_number}</span> {m.customer_name}
                                        {m.customer_region && <span style={{ color: 'var(--text-4)' }}> ({m.customer_region})</span>}
                                        <span style={{ ...mono, color: 'var(--text-3)' }}> — {fmt(m.fulfilled_qty)} {li.unit}</span>
                                      </div>
                                    ))}
                                  </td>
                                  <td style={{ padding: 9, textAlign: 'right', ...mono }}>{li.stock_qty > 0 ? `+${fmt(li.stock_qty)} ${li.unit}` : '—'}</td>
                                  <td style={{ padding: 9, textAlign: 'center' }}><Badge value={li.match_status} /></td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {uncoveredDemand.length > 0 && (
        <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', marginTop: 20 }}>
          <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ color: 'var(--text)', fontWeight: 650 }}>Sales Order Items Requests</div>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--surface-3)', color: 'var(--text-4)', ...mono, fontSize: 10, letterSpacing: '0.08em' }}>
                <th style={{ padding: '10px 12px', textAlign: 'left' }}>ITEM</th>
                <th style={{ padding: '10px 12px', textAlign: 'left' }}>LOCATION</th>
                <th style={{ padding: '10px 12px', textAlign: 'left' }}>SO NUMBER</th>
                <th style={{ padding: '10px 12px', textAlign: 'left' }}>CUSTOMER</th>
                <th style={{ padding: '10px 12px', textAlign: 'right' }}>QTY</th>
              </tr>
            </thead>
            <tbody>
              {uncoveredDemand.map((u, idx) => (
                <tr key={idx} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '10px 12px' }}>{u.name}<div style={{ ...mono, color: 'var(--text-4)', fontSize: 10 }}>{u.sku}</div></td>
                  <td style={{ padding: '10px 12px', ...mono, fontSize: 12 }}>{u.location_name}</td>
                  <td style={{ padding: '10px 12px', ...mono, fontSize: 12 }}>{u.salesorder_number}</td>
                  <td style={{ padding: '10px 12px' }}>{u.customer_name}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', ...mono, fontWeight: 700 }}>{fmt(u.qty)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p style={{ color: 'var(--text-4)', fontSize: 12, marginTop: 12 }}>VIA matches Pending Approval Purchase Orders against Confirmed Sales Order demand and current stock per warehouse. Final approval should still be reviewed by Admin/Manager before approving in Zoho.</p>
    </div>
  );
}
