'use client';

import React from 'react';
import { useState, useEffect, useCallback, useMemo } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PendingPackage {
  package_id: string;
  package_number: string;
  shipment_id: string;
  shipment_number: string;
  shipment_status: string;
  date: string;
  shipment_date: string;
  tracking_number: string;
  carrier: string;
  quantity: number;
}

interface PendingDelivery {
  salesorder_id: string;
  salesorder_number: string;
  customer_name: string;
  so_date: string;
  total: number;
  quantity: number;
  quantity_packed: number;
  delivery_method: string;
  is_full: boolean;
  packages: PendingPackage[];
}

interface ShippingAddress {
  attention: string; address: string; street2: string;
  city: string; state: string; zip: string; country: string; phone: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatRp(n: number) {
  return 'Rp ' + Number(n).toLocaleString('id-ID');
}

function agingDays(dateStr: string): number {
  if (!dateStr) return 0;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return 0;
  return Math.floor((Date.now() - d.getTime()) / 86400000);
}

function AgingBadge({ date, label }: { date: string; label?: string }) {
  const days = agingDays(date);
  if (!date) return <span className="text-[var(--text-4)] text-xs">—</span>;
  const color = days >= 14 ? 'var(--danger)'
    : days >= 7  ? 'var(--warning)'
    : days >= 3  ? 'var(--accent-text)'
    : 'var(--text-3)';
  return (
    <div className="flex flex-col items-end gap-0.5">
      <span className="text-xs font-semibold" style={{ fontFamily: 'JetBrains Mono, monospace', color }}>
        {days}d
      </span>
      {label && <span className="text-xs" style={{ color: 'var(--text-4)', fontSize: 10 }}>{label}</span>}
    </div>
  );
}

function StatusBadge({ label, type }: { label: string; type: 'success' | 'warning' | 'info' | 'muted' | 'danger' }) {
  const styles = {
    success: 'bg-[var(--success-bg)] text-[var(--success)] border-[var(--success-border)]',
    warning: 'bg-[var(--warning-bg)] text-[var(--warning)] border-[var(--warning-border)]',
    info:    'bg-[var(--info-bg)] text-[var(--info)] border-[var(--info-border)]',
    muted:   'bg-[var(--surface-3)] text-[var(--text-3)] border-[var(--border)]',
    danger:  'bg-[var(--danger-bg)] text-[var(--danger)] border-[var(--danger-border)]',
  };
  return <span className={'via-badge border text-xs ' + styles[type]}>{label}</span>;
}

function TableShell({ title, count, loading, search, onSearch, extra, children }: {
  title: string; count?: number; loading: boolean;
  search?: string; onSearch?: (v: string) => void;
  extra?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <div className="via-card overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
        <div>
          <h2 className="text-[var(--text)] font-semibold text-sm">{title}</h2>
        </div>
        <div className="flex items-center gap-3">
          {!loading && count !== undefined && (
            <span className="text-[var(--text-4)] text-xs" style={{ fontFamily: 'JetBrains Mono, monospace' }}>{count} orders</span>
          )}
          {onSearch && (
            <input value={search} onChange={e => onSearch(e.target.value)}
              placeholder="Search…" className="via-input text-xs py-1.5 px-3 w-44" />
          )}
          {extra}
        </div>
      </div>
      {children}
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="p-5 space-y-2">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="flex gap-4 animate-pulse">
          <div className="h-4 bg-[var(--surface-3)] rounded w-28" />
          <div className="h-4 bg-[var(--surface-3)] rounded flex-1" />
          <div className="h-4 bg-[var(--surface-3)] rounded w-20" />
          <div className="h-4 bg-[var(--surface-3)] rounded w-16" />
        </div>
      ))}
    </div>
  );
}

function EmptyState({ icon, msg }: { icon: string; msg: string }) {
  return (
    <div className="flex flex-col items-center py-10">
      <div className="text-3xl mb-2 opacity-20">{icon}</div>
      <div className="text-[var(--text-3)] text-sm">{msg}</div>
    </div>
  );
}

// ─── Shipment In-Transit ──────────────────────────────────────────────────────

function PendingDeliveryTable({ items, loading, error }: { items: PendingDelivery[]; loading: boolean; error: string }) {
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [soLineItems, setSoLineItems] = useState<Record<string, Array<{name: string; quantity: number; unit: string; quantity_packed: number}>>>({});
  const [soShippingAddress, setSoShippingAddress] = useState<Record<string, ShippingAddress>>({});
  const [loadingLines, setLoadingLines] = useState<Set<string>>(new Set());
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [printing, setPrinting] = useState(false);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return items.filter(i =>
      !q || i.salesorder_number.toLowerCase().includes(q) || i.customer_name.toLowerCase().includes(q)
    );
  }, [items, search]);

  async function fetchLineItemsFor(id: string): Promise<{
    lines: Array<{name: string; quantity: number; unit: string; quantity_packed: number}>;
    address: ShippingAddress | null;
  }> {
    if (soLineItems[id]) return { lines: soLineItems[id], address: soShippingAddress[id] || null };
    setLoadingLines(prev => new Set(prev).add(id));
    try {
      const res = await fetch('/api/shipments?mode=so_detail&id=' + id);
      const data = await res.json();
      const lines = data.line_items || [];
      const address = data.shipping_address || null;
      setSoLineItems(prev => ({ ...prev, [id]: lines }));
      if (address) setSoShippingAddress(prev => ({ ...prev, [id]: address }));
      return { lines, address };
    } catch {
      return { lines: [], address: null };
    } finally {
      setLoadingLines(prev => { const n = new Set(prev); n.delete(id); return n; });
    }
  }

  async function toggleExpand(id: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
    // Fetch line items if not already loaded
    if (!soLineItems[id]) fetchLineItemsFor(id);
  }

  function toggleSelect(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function printSelectedShipments() {
    if (selectedIds.size === 0) return;
    setPrinting(true);
    try {
      const selected = filtered.filter(i => selectedIds.has(i.salesorder_id));
      const detailsById = await Promise.all(selected.map(i => fetchLineItemsFor(i.salesorder_id)));

      const blocks = selected.map((item, idx) => {
        const { lines, address: a } = detailsById[idx];
        const rows = lines.map(li =>
          `<tr><td>${li.name}</td><td class="qty">${li.quantity} ${li.unit}</td></tr>`
        ).join('');
        const shipmentRefs = item.packages.map(p => p.shipment_number || p.package_number).filter(Boolean).join(', ') || '—';
        const addressLines = a ? [
          a.attention,
          a.address,
          a.street2,
          [a.city, a.zip].filter(Boolean).join(' '),
          [a.state, a.country].filter(Boolean).join(', '),
          a.phone ? `Tel. ${a.phone}` : '',
        ].filter(Boolean) : [];
        const addressHtml = addressLines.length
          ? addressLines.map(l => `<div>${l}</div>`).join('')
          : '<div class="muted">No shipping address on file</div>';
        return `
          <div class="shipment">
            <div class="hdr">
              <div><span class="lbl">SO Number</span><span class="val">${item.salesorder_number}</span></div>
              <div><span class="lbl">Customer</span><span class="val">${item.customer_name}</span></div>
              <div><span class="lbl">Shipment</span><span class="val">${shipmentRefs}</span></div>
            </div>
            <div class="addr">
              <span class="lbl">Shipping Address</span>
              ${addressHtml}
            </div>
            <table class="items">
              <thead><tr><th>Item</th><th class="qty">Qty</th></tr></thead>
              <tbody>${rows}</tbody>
            </table>
          </div>`;
      }).join('');

      const css = [
        '* { margin: 0; padding: 0; box-sizing: border-box; }',
        'body { font-family: Arial, sans-serif; font-size: 13px; color: #111; background: white; }',
        '.page { padding: 16mm; }',
        'h1 { font-size: 18px; margin-bottom: 4mm; }',
        '.shipment { border: 1px solid #ccc; border-radius: 6px; padding: 4mm; margin-bottom: 6mm; page-break-inside: avoid; }',
        '.hdr { display: flex; gap: 8mm; margin-bottom: 3mm; flex-wrap: wrap; }',
        '.hdr .lbl { display: block; font-size: 10px; text-transform: uppercase; color: #888; letter-spacing: 0.04em; }',
        '.hdr .val { display: block; font-weight: 600; font-size: 13px; }',
        '.addr { margin-bottom: 4mm; padding: 3mm; background: #f7f7f7; border-radius: 4px; }',
        '.addr .lbl { display: block; font-size: 10px; text-transform: uppercase; color: #888; letter-spacing: 0.04em; margin-bottom: 1mm; }',
        '.addr div { font-size: 12px; line-height: 1.5; }',
        '.addr .muted { color: #999; font-style: italic; }',
        'table.items { width: 100%; border-collapse: collapse; }',
        'table.items th { text-align: left; font-size: 10px; text-transform: uppercase; color: #888; border-bottom: 1px solid #ccc; padding: 3px 6px; }',
        'table.items td { padding: 4px 6px; border-bottom: 1px solid #eee; font-size: 12px; }',
        'table.items .qty { text-align: right; white-space: nowrap; }',
        '@media print { body { margin: 0; } .page { padding: 10mm 16mm; } }',
      ].join(' ');

      const html = '<!DOCTYPE html><html><head><meta charset="utf-8">'
        + '<title>Shipments</title>'
        + '<style>' + css + '</style>'
        + '</head><body>'
        + '<div class="page"><h1>Shipment In-Transit — ' + selected.length + ' order' + (selected.length > 1 ? 's' : '') + '</h1>' + blocks + '</div>'
        + '<script>window.onload = function(){ window.print(); }<\/script>'
        + '</body></html>';

      const win = window.open('', '_blank');
      if (win) { win.document.write(html); win.document.close(); }
      setSelectedIds(new Set());
    } finally {
      setPrinting(false);
    }
  }

  return (
    <TableShell title="Shipment In-Transit"
      count={filtered.length} loading={loading} search={search} onSearch={setSearch}
      extra={selectedIds.size > 0 ? (
        <button onClick={printSelectedShipments} disabled={printing}
          className="px-3 py-1.5 text-xs bg-[var(--accent-hover)] hover:bg-[var(--accent)] text-white rounded-lg transition-colors disabled:opacity-50">
          {printing ? '…' : `🖨 Print Shipments (${selectedIds.size})`}
        </button>
      ) : undefined}>
      {loading && <LoadingSkeleton />}
      {!loading && error && <div className="p-5 text-[var(--danger)] text-sm">{error}</div>}
      {!loading && !error && filtered.length === 0 && <EmptyState icon="▤" msg="No pending deliveries." />}
      {!loading && !error && filtered.length > 0 && (
        <div className="overflow-x-auto">
          <table className="via-table">
            <thead><tr>
              <th className="w-8">
                <input type="checkbox" className="w-3.5 h-3.5 rounded"
                  checked={filtered.length > 0 && filtered.every(i => selectedIds.has(i.salesorder_id))}
                  onChange={() => {
                    const allSel = filtered.every(i => selectedIds.has(i.salesorder_id));
                    setSelectedIds(allSel ? new Set() : new Set(filtered.map(i => i.salesorder_id)));
                  }} />
              </th>
              <th className="w-8"></th>
              <th>SO Number</th>
              <th>Customer</th>
              <th>SO Date</th>
              <th>Shipment</th>
              <th className="text-right">Aging</th>
              <th className="text-right">Qty</th>
              <th className="text-right">Packed</th>
              <th>Courier</th>
              <th>Status</th>
            </tr></thead>
            <tbody>
              {filtered.map(item => {
                const exp = expanded.has(item.salesorder_id);
                return (
                  <React.Fragment key={item.salesorder_id}>
                    <tr
                      className="cursor-pointer hover:bg-[var(--surface-2)] transition-colors"
                      onClick={() => toggleExpand(item.salesorder_id)}>
                      <td className="w-8" onClick={e => e.stopPropagation()}>
                        <input type="checkbox" className="w-3.5 h-3.5 rounded"
                          checked={selectedIds.has(item.salesorder_id)}
                          onChange={() => toggleSelect(item.salesorder_id)} />
                      </td>
                      <td className="text-center text-[var(--text-4)] text-xs select-none w-8">
                        {exp ? '▾' : '▸'}
                      </td>
                      <td className="text-[var(--accent-text)] text-xs" style={{ fontFamily: 'JetBrains Mono, monospace' }}>{item.salesorder_number}</td>
                      <td className="text-[var(--text)] text-xs font-medium max-w-[150px] truncate" title={item.customer_name}>{item.customer_name}</td>
                      <td className="text-[var(--text-3)] text-xs">{item.so_date}</td>
                      <td className="text-xs" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                        {item.packages.length === 1 ? (
                          <div>
                            <div className="text-[var(--text-2)]">{item.packages[0].shipment_number || item.packages[0].package_number}</div>
                            {item.packages[0].shipment_date && <div className="text-[var(--text-4)] text-xs">{item.packages[0].shipment_date}</div>}
                          </div>
                        ) : (
                          <span className="text-[var(--text-3)]">{item.packages.length} shipments</span>
                        )}
                      </td>
                      <td className="text-right">
                        <AgingBadge
                          date={item.packages[0]?.shipment_date || item.packages[0]?.date || item.so_date}
                          label="in transit"
                        />
                      </td>
                      <td className="text-right text-[var(--text-2)] text-xs" style={{ fontFamily: 'JetBrains Mono, monospace' }}>{item.quantity}</td>
                      <td className="text-right text-xs" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                        <span className={item.quantity_packed >= item.quantity ? 'text-[var(--success)]' : 'text-[var(--warning)]'}>
                          {item.quantity_packed}
                        </span>
                      </td>
                      <td className="text-[var(--text-3)] text-xs">
                        {item.packages[0]?.carrier || item.delivery_method || '—'}
                      </td>
                      <td>
                        {item.is_full
                          ? <StatusBadge label="Full" type="info" />
                          : <StatusBadge label="Partial" type="warning" />}
                      </td>
                    </tr>
                    {exp && (
                      <tr key={item.salesorder_id + '_detail'}>
                        <td colSpan={11} className="p-0">
                          <div className="bg-[var(--surface-2)] px-6 py-4">
                            {/* Packages */}
                            <div className="text-[var(--text-4)] text-xs uppercase tracking-wider mb-2" style={{ fontFamily: 'JetBrains Mono, monospace' }}>Shipments</div>
                            <div className="flex gap-3 mb-4 flex-wrap">
                              {item.packages.map((pkg, pi) => (
                                <div key={pi} className="flex items-center gap-2 text-xs px-3 py-1.5 bg-[var(--surface-3)] rounded-lg border border-[var(--border)]">
                                  <span style={{ color: pkg.shipment_status === 'shipped' ? 'var(--info)' : 'var(--text-4)' }}>
                                    {pkg.shipment_status === 'shipped' ? '🚚' : '📦'}
                                  </span>
                                  <span style={{ fontFamily: 'JetBrains Mono, monospace' }} className="text-[var(--text-2)]">
                                    {pkg.shipment_number || pkg.package_number}
                                  </span>
                                  {pkg.shipment_date && <span className="text-[var(--text-4)]">{pkg.shipment_date}</span>}
                                  <StatusBadge
                                    label={pkg.shipment_status === 'shipped' ? 'Shipped' : 'Not Shipped'}
                                    type={pkg.shipment_status === 'shipped' ? 'info' : 'muted'} />
                                </div>
                              ))}
                            </div>
                            {/* Line items */}
                            <div className="text-[var(--text-4)] text-xs uppercase tracking-wider mb-2" style={{ fontFamily: 'JetBrains Mono, monospace' }}>Items</div>
                            {loadingLines.has(item.salesorder_id) ? (
                              <div className="text-[var(--text-4)] text-xs">Loading items…</div>
                            ) : soLineItems[item.salesorder_id] ? (
                              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                                <thead>
                                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                                    {['Item', 'SO Qty', 'Packed', 'Status'].map((h, i) => (
                                      <th key={i} style={{ padding: '4px 10px', textAlign: i >= 1 ? 'right' : 'left',
                                        color: 'var(--text-4)', fontWeight: 500, fontSize: 10, textTransform: 'uppercase' }}>{h}</th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {soLineItems[item.salesorder_id].map((li, i) => {
                                    const fullyPacked = li.quantity_packed >= li.quantity;
                                    return (
                                      <tr key={i} style={{ borderBottom: '1px solid var(--border-muted)' }}>
                                        <td style={{ padding: '6px 10px', color: 'var(--text)', maxWidth: 300,
                                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={li.name}>{li.name}</td>
                                        <td style={{ padding: '6px 10px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace', color: 'var(--text-3)' }}>
                                          {li.quantity} {li.unit}
                                        </td>
                                        <td style={{ padding: '6px 10px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace',
                                          color: fullyPacked ? 'var(--success)' : 'var(--warning)', fontWeight: 600 }}>
                                          {li.quantity_packed}
                                        </td>
                                        <td style={{ padding: '6px 10px', textAlign: 'right' }}>
                                          {fullyPacked
                                            ? <span style={{ color: 'var(--success)', fontSize: 11, fontWeight: 600 }}>✓ Packed</span>
                                            : <span style={{ color: 'var(--warning)', fontSize: 11, fontWeight: 600 }}>⚠ Partial ({li.quantity_packed}/{li.quantity})</span>}
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            ) : (
                              <div className="text-[var(--text-4)] text-xs animate-pulse">Loading…</div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </TableShell>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function InventoryShipmentsPage() {
  const [pending, setPending] = useState<PendingDelivery[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [lastRefreshed, setLastRefreshed] = useState('');

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/shipments?mode=pending');
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      setPending(data.pending || []);
      setLastRefreshed(new Date().toLocaleTimeString('id-ID'));
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  return (
    <div className="via-page" style={{ background: 'var(--bg)', minHeight: '100%' }}>
      <div style={{ maxWidth: 1280, margin: '0 auto' }}>

        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-[var(--text)] font-semibold text-2xl tracking-tight">Shipments</h1>
          </div>
          <div className="flex items-center gap-3">
            {lastRefreshed && (
              <span className="text-[var(--text-4)] text-xs" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                Updated {lastRefreshed}
              </span>
            )}
            <button onClick={fetchAll} disabled={loading}
              className="px-3 py-1.5 text-xs bg-[var(--surface-2)] hover:bg-[var(--surface-3)] text-[var(--text-3)] hover:text-[var(--text)] rounded-lg border border-[var(--border)] transition-colors disabled:opacity-50">
              {loading ? '…' : '↻ Refresh'}
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-5 p-3 bg-[var(--danger-bg)] border border-[var(--danger-border)] rounded-lg text-[var(--danger)] text-sm">
            {error}
          </div>
        )}

        {/* Summary card */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="via-card px-5 py-4">
            <div className="text-[var(--text-3)] text-xs mb-1">Shipment In-Transit</div>
            <div className="text-2xl font-semibold" style={{ fontFamily: 'JetBrains Mono, monospace', color: pending.length > 0 ? 'var(--info)' : 'var(--text)' }}>
              {loading ? '…' : pending.length}
            </div>
            <div className="text-[var(--text-4)] text-xs mt-1">
              {pending.filter(i => i.is_full).length} full · {pending.filter(i => !i.is_full).length} partial
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="space-y-6">
          <PendingDeliveryTable items={pending} loading={loading} error={error} />
        </div>

      </div>
    </div>
  );
}
