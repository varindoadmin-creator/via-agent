'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';

interface SOItemCheck {
  item_id: string;
  name: string;
  sku: string;
  quantity: number;
  unit: string;
  location_name: string;
  location_stock_on_hand: number;
  shortage: number;
  po_number: string;
  po_quantity: number;
  status: 'ready' | 'ordered' | 'needs_po' | 'indent';
}

interface SOStockResult {
  salesorder_id: string;
  salesorder_number: string;
  customer_name: string;
  confirmed_date: string;
  aging_days: number;
  current_sub_status: string;
  items: SOItemCheck[];
  overall_status: 'all_ready' | 'all_ordered' | 'needs_po' | 'mixed';
  updated_sub_status?: string;
}

const mono = { fontFamily: 'JetBrains Mono, monospace' };
const formatRp = (n: number) => 'Rp ' + Number(n).toLocaleString('id-ID');

function OverallBadge({ status }: { status: SOStockResult['overall_status'] }) {
  const map: Record<string, { label: string; cls: string }> = {
    all_ready:   { label: '✓ All Ready',        cls: 'bg-[var(--success-bg)] text-[var(--success)] border-[var(--success-border)]' },
    all_ordered: { label: '◎ All Ordered',       cls: 'bg-[var(--info-bg)] text-[var(--info)] border-[var(--info-border)]' },
    needs_po:    { label: '⚠ Not Ordered',       cls: 'bg-[var(--danger-bg)] text-[var(--danger)] border-[var(--danger-border)]' },
    mixed:       { label: '◑ Partial Ordered',   cls: 'bg-[var(--warning-bg)] text-[var(--warning)] border-[var(--warning-border)]' },
  };
  const { label, cls } = map[status] || map.needs_po;
  return <span className={`via-badge border text-xs ${cls}`}>{label}</span>;
}

function ItemStatusDot({ status }: { status: SOItemCheck['status'] }) {
  const map: Record<string, { label: string; color: string }> = {
    ready:    { label: '✓ Ready',    color: 'var(--success)' },
    ordered:  { label: '◎ Ordered',  color: 'var(--info)' },
    needs_po: { label: '⚠ Needs PO', color: 'var(--danger)' },
    indent:   { label: '⋯ Indent',   color: 'var(--text-3)' },
  };
  const { label, color } = map[status] || map.needs_po;
  return <span style={{ color, fontSize: 11, fontWeight: 600 }}>{label}</span>;
}

function AgingBadge({ days }: { days: number }) {
  const color = days >= 14 ? 'var(--danger)' : days >= 7 ? 'var(--warning)' : days >= 3 ? 'var(--accent-text)' : 'var(--text-4)';
  return <span style={{ ...mono, fontSize: 11, fontWeight: 700, color }}>{days}d</span>;
}

// ─── PO Detail Modal ─────────────────────────────────────────────────────────

interface POLineItem {
  name: string;
  sku: string;
  quantity: number;
  quantity_received: number;
  unit: string;
  rate: number;
  item_total: number;
}

interface PODetail {
  purchaseorder_number: string;
  vendor_name: string;
  date: string;
  status: string;
  total: number;
  line_items: POLineItem[];
}

function PODetailModal({ poId, poNumber, onClose }: {
  poId: string;
  poNumber: string;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<PODetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/purchases/detail?id=' + poId);
        const data = await res.json();
        if (!data.success) throw new Error(data.error);
        setDetail(data.po);
      } catch(e) { setError(String(e)); }
      finally { setLoading(false); }
    }
    load();
  }, [poId]);

  const formatRp = (n: number) => 'Rp ' + Number(n).toLocaleString('id-ID');

  const thStyle: React.CSSProperties = {
    padding: '6px 10px', textAlign: 'left', fontSize: 10,
    color: 'var(--text-4)', fontWeight: 500,
    textTransform: 'uppercase', letterSpacing: '0.05em',
    background: 'var(--surface-3)', borderBottom: '1px solid var(--border)',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onClose}>
      <div className="via-card w-[700px] max-h-[80vh] mx-4 flex flex-col"
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)] flex-shrink-0">
          <div>
            <h3 className="text-[var(--text)] font-semibold text-sm" style={mono}>{poNumber}</h3>
            {detail && (
              <p className="text-[var(--text-3)] text-xs mt-0.5">
                {detail.vendor_name} · {detail.date} ·
                <span className="ml-1 via-badge via-badge-muted">{detail.status}</span>
              </p>
            )}
          </div>
          <button onClick={onClose}
            className="text-[var(--text-3)] hover:text-[var(--text)] text-lg transition-colors">✕</button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto flex-1">
          {loading && (
            <div className="p-6 space-y-2">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="flex gap-4 animate-pulse">
                  <div className="h-4 bg-[var(--surface-3)] rounded flex-1" />
                  <div className="h-4 bg-[var(--surface-3)] rounded w-20" />
                  <div className="h-4 bg-[var(--surface-3)] rounded w-16" />
                </div>
              ))}
            </div>
          )}

          {error && (
            <div className="p-5 text-[var(--danger)] text-sm">{error}</div>
          )}

          {!loading && detail && (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr>
                  <th style={thStyle}>Item</th>
                  <th style={thStyle}>SKU</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>PO Qty</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Received</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Yet to Receive</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Rate</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {detail.line_items.map((li, i) => {
                  const ytr = li.quantity - (li.quantity_received || 0);
                  return (
                    <tr key={i} style={{ borderBottom: '1px solid var(--border-muted)' }}
                      className="hover:bg-[var(--surface-2)] transition-colors">
                      <td style={{ padding: '8px 10px', color: 'var(--text)', maxWidth: 220,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                        title={li.name}>{li.name}</td>
                      <td style={{ padding: '8px 10px', color: 'var(--text-3)', fontSize: 11, ...mono }}>{li.sku || '—'}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', ...mono, color: 'var(--text-2)' }}>{li.quantity} {li.unit}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', ...mono,
                        color: li.quantity_received > 0 ? 'var(--success)' : 'var(--text-4)' }}>
                        {li.quantity_received || 0}
                      </td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', ...mono,
                        color: ytr > 0 ? 'var(--warning)' : 'var(--text-4)',
                        fontWeight: ytr > 0 ? 700 : 400 }}>
                        {ytr > 0 ? ytr : '—'}
                      </td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', ...mono, color: 'var(--text-3)' }}>
                        {formatRp(li.rate)}
                      </td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', ...mono, color: 'var(--text-2)' }}>
                        {formatRp(li.item_total)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot style={{ borderTop: '1px solid var(--border)', background: 'var(--surface-2)' }}>
                <tr>
                  <td colSpan={6} style={{ padding: '7px 10px', ...mono, color: 'var(--text-3)', fontSize: 11 }}>
                    TOTAL ({detail.line_items.length} items)
                  </td>
                  <td style={{ padding: '7px 10px', textAlign: 'right', ...mono, color: 'var(--text)', fontWeight: 700 }}>
                    {formatRp(detail.total)}
                  </td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

function SORow({ so, onMarkOrdered }: {
  so: SOStockResult;
  onMarkOrdered: (id: string, subStatus: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [marking, setMarking] = useState(false);
  const [selectedPO, setSelectedPO] = useState<{ id: string; number: string } | null>(null);

  const needsPO = so.items.some(i => i.status === 'needs_po');
  const allOrdered = so.overall_status === 'all_ordered';
  const allReady = so.overall_status === 'all_ready';
  const canMarkOrdered = so.current_sub_status !== 'cs_awaitin' && allOrdered;

  async function handleMark(subStatus: string) {
    setMarking(true);
    try {
      await onMarkOrdered(so.salesorder_id, subStatus);
    } finally {
      setMarking(false);
    }
  }

  return (
    <>
      <tr
        className={`cursor-pointer transition-colors ${needsPO ? 'hover:bg-[var(--danger-bg)]' : 'hover:bg-[var(--surface-2)]'}`}
        style={{ borderBottom: expanded ? 'none' : '1px solid var(--border-muted)' }}
        onClick={() => setExpanded(e => !e)}
      >
        <td className="px-3 py-2.5 text-center text-[var(--text-4)] text-xs w-8 select-none">{expanded ? '▾' : '▸'}</td>
        <td className="px-3 py-2.5 text-xs font-medium text-[var(--accent-text)]" style={mono}>{so.salesorder_number}</td>
        <td className="px-3 py-2.5 text-xs text-[var(--text)] max-w-[160px] truncate" title={so.customer_name}>{so.customer_name}</td>
        <td className="px-3 py-2.5 text-xs text-[var(--text-3)]">{so.confirmed_date}</td>
        <td className="px-3 py-2.5"><AgingBadge days={so.aging_days} /></td>
        <td className="px-3 py-2.5 text-xs text-[var(--text-3)]" style={mono}>
          {so.current_sub_status ? (
            <span className="via-badge via-badge-muted">{so.current_sub_status}</span>
          ) : '—'}
        </td>
        <td className="px-3 py-2.5"><OverallBadge status={so.overall_status} /></td>
        <td className="px-3 py-2.5 text-xs text-center text-[var(--text-3)]" style={mono}>
          {so.items.filter(i => i.status === 'needs_po').length > 0 && (
            <span className="text-[var(--danger)] font-bold">{so.items.filter(i => i.status === 'needs_po').length} items</span>
          )}
        </td>
        <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
          <div className="flex gap-1.5">
            {needsPO && (
              <span className="text-xs px-2 py-1 bg-[var(--danger-bg)] text-[var(--danger)] border border-[var(--danger-border)] rounded text-center">
                Create PO
              </span>
            )}
            {canMarkOrdered && (
              <button
                onClick={() => handleMark('cs_awaitin')}
                disabled={marking}
                className="text-xs px-2 py-1 bg-[var(--info-bg)] text-[var(--info)] border border-[var(--info-border)] rounded hover:opacity-80 transition-opacity disabled:opacity-50"
              >
                {marking ? '…' : 'Mark Ordered'}
              </button>
            )}
          </div>
        </td>
      </tr>

      {expanded && (
        <tr style={{ borderBottom: '1px solid var(--border)' }}>
          <td colSpan={9} className="p-0">
            <div className="bg-[var(--surface-2)] px-6 py-4">
              <div className="text-[var(--text-4)] text-xs uppercase tracking-wider mb-3" style={mono}>
                Stock Check — {so.salesorder_number}
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    {['Item', 'SKU', 'Location', 'SO Qty', 'Stock on Hand', 'Shortage', 'Open PO', 'Status'].map((h, i) => (
                      <th key={i} style={{
                        padding: '5px 10px', textAlign: ['SO Qty', 'Stock on Hand', 'Shortage'].includes(h) ? 'right' : 'left',
                        color: 'var(--text-4)', fontWeight: 500, fontSize: 10,
                        textTransform: 'uppercase', letterSpacing: '0.05em',
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {so.items.map((item, i) => (
                    <tr key={i} style={{
                      borderBottom: '1px solid var(--border-muted)',
                      background: item.status === 'needs_po' ? 'var(--danger-bg)' : 'transparent',
                    }}>
                      <td style={{ padding: '7px 10px', color: 'var(--text)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.name}>{item.name}</td>
                      <td style={{ padding: '7px 10px', color: 'var(--text-3)', fontSize: 11, ...mono }}>{item.sku}</td>
                      <td style={{ padding: '7px 10px', color: 'var(--text-3)', fontSize: 11 }}>{item.location_name || '—'}</td>
                      <td style={{ padding: '7px 10px', textAlign: 'right', ...mono, color: 'var(--text-2)' }}>{item.quantity} {item.unit}</td>
                      <td style={{ padding: '7px 10px', textAlign: 'right', ...mono, fontWeight: 600,
                        color: item.location_stock_on_hand >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                        {item.location_stock_on_hand}
                      </td>
                      <td style={{ padding: '7px 10px', textAlign: 'right', ...mono,
                        color: item.shortage > 0 ? 'var(--danger)' : 'var(--text-4)',
                        fontWeight: item.shortage > 0 ? 700 : 400 }}>
                        {item.shortage > 0 ? '-' + item.shortage : '—'}
                      </td>
                      <td style={{ padding: '7px 10px', fontSize: 11 }}>
                        {item.po_number ? (
                          <button
                            onClick={e => { e.stopPropagation(); setSelectedPO({ id: item.po_id, number: item.po_number }); }}
                            style={{ ...mono, color: 'var(--info)', background: 'none', border: 'none',
                              cursor: 'pointer', fontSize: 11, textDecoration: 'underline', padding: 0 }}>
                            {item.po_number}
                          </button>
                        ) : item.status === 'needs_po' ? (
                          <span style={{ color: 'var(--danger)', fontWeight: 600 }}>⚠ None</span>
                        ) : '—'}
                      </td>
                      <td style={{ padding: '7px 10px' }}><ItemStatusDot status={item.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Actions */}
              <div className="flex gap-3 mt-4">
                {needsPO && (
                  <div className="text-xs p-2.5 bg-[var(--danger-bg)] border border-[var(--danger-border)] rounded-lg text-[var(--danger)]">
                    ⚠ {so.items.filter(i => i.status === 'needs_po').map(i => i.name.split(' - ')[0] || i.sku).join(', ')} — create Purchase Order before confirming delivery
                  </div>
                )}
                {allOrdered && so.current_sub_status !== 'cs_awaitin' && (
                  <button onClick={() => handleMark('cs_awaitin')} disabled={marking}
                    className="px-3 py-2 text-xs bg-[var(--info-bg)] text-[var(--info)] border border-[var(--info-border)] rounded-lg hover:opacity-80 transition-opacity disabled:opacity-50">
                    {marking ? 'Marking…' : '◎ Mark SO as Ordered'}
                  </button>
                )}
                {allReady && (
                  <button onClick={() => handleMark('cs_readyfo')} disabled={marking}
                    className="px-3 py-2 text-xs bg-[var(--success-bg)] text-[var(--success)] border border-[var(--success-border)] rounded-lg hover:opacity-80 transition-opacity disabled:opacity-50">
                    {marking ? 'Marking…' : '✓ Mark Stock Ready'}
                  </button>
                )}
              </div>
            </div>
          </td>
        </tr>
      )}
      {selectedPO && (
        <PODetailModal
          poId={selectedPO.id}
          poNumber={selectedPO.number}
          onClose={() => setSelectedPO(null)}
        />
      )}
    </>
  );
}

export function SOStockCheckTable() {
  const [data, setData] = useState<SOStockResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'needs_po' | 'all_ordered' | 'all_ready' | 'needs_attention'>('needs_attention');
  const [lastRefreshed, setLastRefreshed] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await fetch('/api/so-stock-check');
      const d = await res.json();
      if (!d.success) throw new Error(d.error);
      setData(d.results || []);
      setLastRefreshed(new Date().toLocaleTimeString('id-ID'));
    } catch (e) { setError(String(e)); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function handleMarkOrdered(soId: string, subStatus: string) {
    try {
      const res = await fetch('/api/so-stock-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ salesorder_id: soId, sub_status: subStatus }),
      });
      const d = await res.json();
      if (!d.success) throw new Error(d.error);
      // Update local state
      setData(prev => prev.map(so =>
        so.salesorder_id === soId ? { ...so, current_sub_status: subStatus } : so
      ));
    } catch (e) { setError(String(e)); }
  }

  const filtered = useMemo(() => {
    let result = data;
    if (filter === 'needs_attention') {
      result = result.filter(so => so.overall_status !== 'all_ready');
    } else if (filter !== 'all') {
      result = result.filter(so => so.overall_status === filter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(so =>
        so.salesorder_number.toLowerCase().includes(q) ||
        so.customer_name.toLowerCase().includes(q) ||
        so.items.some(i => i.sku.toLowerCase().includes(q) || i.name.toLowerCase().includes(q))
      );
    }
    return result;
  }, [data, filter, search]);

  const counts = useMemo(() => ({
    needs_po: data.filter(s => s.overall_status === 'needs_po').length,
    mixed: data.filter(s => s.overall_status === 'mixed').length,
    all_ordered: data.filter(s => s.overall_status === 'all_ordered').length,
    all_ready: data.filter(s => s.overall_status === 'all_ready').length,
  }), [data]);

  const thStyle: React.CSSProperties = {
    padding: '8px 12px', textAlign: 'left', color: 'var(--text-3)',
    fontWeight: 500, fontSize: 11, textTransform: 'uppercase',
    letterSpacing: '0.06em', background: 'var(--surface-2)',
    borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap',
  };

  return (
    <div className="via-card overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
        <div>
          <h2 className="text-[var(--text)] font-semibold text-sm">Confirmed — Stock Check</h2>
          <p className="text-[var(--text-3)] text-xs mt-0.5">
            Per-location stock vs committed qty. ⚠ = create PO. ◎ = PO exists. ✓ = ready.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {lastRefreshed && <span className="text-[var(--text-4)] text-xs" style={mono}>Updated {lastRefreshed}</span>}
          {counts.all_ready > 0 && (
            <button
              onClick={async () => {
                const readySOs = data.filter(so => so.overall_status === 'all_ready' && so.current_sub_status !== 'cs_readyfo');
                if (!readySOs.length) return;
                for (const so of readySOs) {
                  await handleMarkOrdered(so.salesorder_id, 'cs_readyfo');
                }
                await fetchData();
              }}
              disabled={loading}
              className="px-3 py-1.5 text-xs bg-[var(--success-bg)] text-[var(--success)] border border-[var(--success-border)] rounded-lg hover:opacity-80 transition-opacity disabled:opacity-50">
              ✓ Mark All Ready ({counts.all_ready})
            </button>
          )}
          <button onClick={fetchData} disabled={loading}
            className="px-3 py-1.5 text-xs bg-[var(--surface-2)] hover:bg-[var(--surface-3)] text-[var(--text-3)] hover:text-[var(--text)] rounded-lg border border-[var(--border)] transition-colors disabled:opacity-50">
            {loading ? '…' : '↻ Refresh'}
          </button>
        </div>
      </div>

      {/* Filter pills */}
      <div className="flex gap-2 px-5 py-3 border-b border-[var(--border)] flex-wrap">
        {[
          { k: 'needs_attention', label: `⚡ Needs Attention (${data.length - counts.all_ready})` },
          { k: 'needs_po', label: `⚠ Not Ordered (${counts.needs_po})`, color: counts.needs_po > 0 ? 'var(--danger)' : undefined },
          { k: 'mixed', label: `◑ Partial Ordered (${counts.mixed})` },
          { k: 'all_ordered', label: `◎ All Ordered (${counts.all_ordered})` },
          { k: 'all_ready', label: `✓ All Ready (${counts.all_ready})` },
          { k: 'all', label: `All (${data.length})` },
        ].map(({ k, label, color }) => (
          <button key={k} onClick={() => setFilter(k as typeof filter)}
            style={filter === k && color ? { background: 'var(--danger)', borderColor: 'var(--danger)', color: 'white' } : {}}
            className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
              filter === k && !color ? 'bg-[var(--accent)] text-white border-[var(--accent)]'
              : 'bg-[var(--surface-2)] text-[var(--text-3)] border-[var(--border)] hover:bg-[var(--surface-3)]'
            }`}>
            {label}
          </button>
        ))}
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search SO, customer, item…"
          className="via-input text-xs py-1.5 px-3 ml-auto w-52" />
      </div>

      {error && <div className="px-5 py-3 text-[var(--danger)] text-sm">{error}</div>}

      {loading && (
        <div className="p-6 space-y-2">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="flex gap-4 animate-pulse">
              <div className="h-4 bg-[var(--surface-3)] rounded w-28" />
              <div className="h-4 bg-[var(--surface-3)] rounded flex-1" />
              <div className="h-4 bg-[var(--surface-3)] rounded w-24" />
              <div className="h-4 bg-[var(--surface-3)] rounded w-20" />
            </div>
          ))}
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <div className="flex flex-col items-center py-10">
          <div className="text-3xl mb-2 opacity-20">✓</div>
          <div className="text-[var(--text-3)] text-sm">All confirmed SOs have sufficient stock.</div>
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <div className="overflow-x-auto">
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                <th style={{ ...thStyle, width: 32 }}></th>
                <th style={thStyle}>SO Number</th>
                <th style={thStyle}>Customer</th>
                <th style={thStyle}>Confirmed</th>
                <th style={thStyle}>Aging</th>
                <th style={thStyle}>Sub-Status</th>
                <th style={thStyle}>Stock Status</th>
                <th style={thStyle}>Needs PO</th>
                <th style={thStyle}>Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(so => (
                <SORow key={so.salesorder_id} so={so} onMarkOrdered={handleMarkOrdered} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
