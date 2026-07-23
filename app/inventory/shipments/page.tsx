'use client';

import React from 'react';
import { useState, useEffect, useCallback, useMemo } from 'react';
import StatusPill, { PillTone } from '@/components/ui/StatusPill';

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
  location_name: string;
  packages: PendingPackage[];
}

interface ShippingAddress {
  attention: string; address: string; street2: string;
  city: string; state: string; zip: string; country: string; phone: string;
}

const LOCATIONS = ['HEAD OFFICE', 'HUB-BDG', 'HUB-MDN'] as const;
type Location = typeof LOCATIONS[number];

const LOCATION_META: Record<Location, { label: string; city: string; color: string; border: string }> = {
  'HEAD OFFICE': { label: 'Head Office',  city: 'Tangerang',  color: 'text-[var(--accent)]',   border: 'border-[var(--accent-border)]' },
  'HUB-BDG':    { label: 'Hub Bandung',   city: 'Bandung',    color: 'text-[var(--info)]',    border: 'border-[var(--border)]' },
  'HUB-MDN':    { label: 'Hub Medan',     city: 'Medan',      color: 'text-[var(--success)]', border: 'border-[var(--border)]' },
};

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
  const tones: Record<typeof type, PillTone> = {
    success: 'good',
    warning: 'warning',
    info:    'info',
    muted:   'neutral',
    danger:  'critical',
  };
  return <StatusPill tone={tones[type]}>{label}</StatusPill>;
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

const PRINT_CSS = [
  '* { margin: 0; padding: 0; box-sizing: border-box; }',
  'body { font-family: Arial, sans-serif; font-size: 13px; color: #111; background: white; }',
  '.page { padding: 16mm; }',
  'h1 { font-size: 18px; margin-bottom: 4mm; }',
  '.docmeta { display: flex; gap: 8mm; margin-bottom: 6mm; flex-wrap: wrap; padding-bottom: 4mm; border-bottom: 1px solid #ccc; }',
  '.docmeta div { font-size: 12px; }',
  '.docmeta .lbl { display: block; font-size: 10px; text-transform: uppercase; color: #888; letter-spacing: 0.04em; }',
  '.docmeta .val { display: block; font-weight: 600; font-size: 13px; }',
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

function buildPrintHtml(meta: { total: number; warehouse: string }, blocks: string): string {
  const date = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  const docmeta = `
    <div class="docmeta">
      <div><span class="lbl">Date</span><span class="val">${date}</span></div>
      <div><span class="lbl">Status</span><span class="val">Out for Delivery</span></div>
      <div><span class="lbl">Total</span><span class="val">${meta.total} Order${meta.total > 1 ? 's' : ''}</span></div>
      <div><span class="lbl">Warehouse</span><span class="val">${meta.warehouse}</span></div>
    </div>`;
  return '<!DOCTYPE html><html><head><meta charset="utf-8">'
    + '<title>Shipments</title>'
    + '<style>' + PRINT_CSS + '</style>'
    + '</head><body>'
    + '<div class="page"><h1>Shipments</h1>' + docmeta + blocks + '</div>'
    + '<script>window.onload = function(){ window.print(); }<\/script>'
    + '</body></html>';
}

// ─── Out-for-Delivery Shipments (per hub) ──────────────────────────────────────

function HubShipmentTable({ location, items, loading, error }: {
  location: Location; items: PendingDelivery[]; loading: boolean; error: string;
}) {
  const meta = LOCATION_META[location];
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [soLineItems, setSoLineItems] = useState<Record<string, Array<{name: string; quantity: number; unit: string; quantity_packed: number}>>>({});
  const [soShippingAddress, setSoShippingAddress] = useState<Record<string, ShippingAddress>>({});
  const [loadingLines, setLoadingLines] = useState<Set<string>>(new Set());
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [printing, setPrinting] = useState(false);
  const [exporting, setExporting] = useState(false);

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
    if (!soLineItems[id]) fetchLineItemsFor(id);
  }

  function toggleSelect(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function buildBlocks(rows: PendingDelivery[], detailsById: Array<{
    lines: Array<{name: string; quantity: number; unit: string; quantity_packed: number}>;
    address: ShippingAddress | null;
  }>): string {
    return rows.map((item, idx) => {
      const { lines, address: a } = detailsById[idx];
      const rowsHtml = lines.map(li =>
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
            <tbody>${rowsHtml}</tbody>
          </table>
        </div>`;
    }).join('');
  }

  async function printSelectedShipments() {
    if (selectedIds.size === 0) return;
    setPrinting(true);
    try {
      const selected = filtered.filter(i => selectedIds.has(i.salesorder_id));
      const detailsById = await Promise.all(selected.map(i => fetchLineItemsFor(i.salesorder_id)));
      const html = buildPrintHtml({ total: selected.length, warehouse: meta.label }, buildBlocks(selected, detailsById));
      const win = window.open('', '_blank');
      if (win) { win.document.write(html); win.document.close(); }
      setSelectedIds(new Set());
    } finally {
      setPrinting(false);
    }
  }

  async function exportTablePDF() {
    if (filtered.length === 0) return;
    setExporting(true);
    try {
      const detailsById = await Promise.all(filtered.map(i => fetchLineItemsFor(i.salesorder_id)));
      const html = buildPrintHtml({ total: filtered.length, warehouse: meta.label }, buildBlocks(filtered, detailsById));
      const win = window.open('', '_blank');
      if (win) { win.document.write(html); win.document.close(); }
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className={`rounded-xl border ${meta.border} bg-[var(--surface)] overflow-hidden`}>
      {/* Table header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)] flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className={`text-xs font-bold tracking-widest uppercase ${meta.color}`}>
            {location}
          </div>
          {!loading && (
            <div className="text-[var(--text-4)] text-xs">
              Total: {filtered.length} Orders ({filtered.filter(i => i.is_full).length} Full, {filtered.filter(i => !i.is_full).length} Partial)
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search…" className="via-input text-xs py-1.5 px-3 w-44" />
          <button onClick={exportTablePDF} disabled={exporting || filtered.length === 0}
            className="px-3 py-1.5 text-xs bg-[var(--accent-hover)] hover:bg-[var(--accent)] text-white rounded-lg transition-colors disabled:opacity-50">
            {exporting ? '…' : '⬇ Export'}
          </button>
          {selectedIds.size > 0 && (
            <button onClick={printSelectedShipments} disabled={printing}
              className="px-3 py-1.5 text-xs bg-[var(--accent-hover)] hover:bg-[var(--accent)] text-white rounded-lg transition-colors disabled:opacity-50">
              {printing ? '…' : `🖨 Print Selected (${selectedIds.size})`}
            </button>
          )}
        </div>
      </div>

      {loading && <LoadingSkeleton />}
      {!loading && error && <div className="p-5 text-[var(--danger)] text-sm">{error}</div>}
      {!loading && !error && filtered.length === 0 && <EmptyState icon="▤" msg="No out-for-delivery shipments at this hub." />}
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
    </div>
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

  const byLocation = useMemo(() => {
    const grouped: Record<Location, PendingDelivery[]> = { 'HEAD OFFICE': [], 'HUB-BDG': [], 'HUB-MDN': [] };
    for (const item of pending) {
      if (grouped[item.location_name as Location]) grouped[item.location_name as Location].push(item);
    }
    return grouped;
  }, [pending]);

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

        {/* Hub tables */}
        <div className="space-y-5">
          {LOCATIONS.map(loc => (
            <HubShipmentTable
              key={loc}
              location={loc}
              items={byLocation[loc]}
              loading={loading}
              error={error}
            />
          ))}
        </div>

      </div>
    </div>
  );
}
