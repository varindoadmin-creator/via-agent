'use client';

import { useState, useEffect } from 'react';

interface PO {
  purchaseorder_id: string;
  purchaseorder_number: string;
  vendor_name: string;
  date: string;
  total: number;
}

const mono = { fontFamily: 'JetBrains Mono, monospace' };
const formatRp = (n: number) => 'Rp ' + Number(n).toLocaleString('id-ID');

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
  /* Standalone print document opened in its own window — cannot reference the
     app's CSS custom properties, so the theme's hex values are inlined here
     directly (kept in sync with app/globals.css: --text, --primary, --accent, etc). */
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Arial, sans-serif; font-size: 11px; color: #111827; padding: 24px 32px; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 4px; }
  .company { font-size: 15px; font-weight: bold; color: #111827; }
  .doc-title { font-size: 15px; font-weight: bold; color: #1e3a5f; text-align: right; }
  .divider { border: none; border-top: 2.5px solid #1e3a5f; margin: 8px 0 12px; }
  .info-grid { display: grid; grid-template-columns: 90px 1fr 110px 1fr; gap: 4px 8px; margin-bottom: 16px; }
  .info-label { color: #6b7280; font-size: 10px; }
  .info-value { font-weight: bold; }
  .pickup-addr { grid-column: 4; grid-row: 1 / span 3; border-left: 2px solid #e5e7eb; padding-left: 10px; }
  .pickup-addr .addr-name { font-weight: bold; font-size: 11px; }
  .pickup-addr .addr-line { font-size: 10px; color: #374151; line-height: 1.5; }
  .section-title { font-size: 9px; font-weight: bold; color: #6b7280; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 6px; }
  .courier-box { background: #f9fafb; border: 0.5px solid #e5e7eb; padding: 8px 12px; margin-bottom: 16px; }
  .courier-grid { display: grid; grid-template-columns: 70px 1fr 80px 1fr; gap: 4px 8px; }
  .cou-label { color: #6b7280; font-size: 10px; }
  .cou-value { font-weight: bold; font-size: 11px; }
  table { width: 100%; border-collapse: collapse; font-size: 10px; margin-bottom: 14px; }
  thead tr { background: #18181b; color: white; }
  th { padding: 6px 8px; font-size: 9px; text-transform: uppercase; letter-spacing: 0.04em; }
  th:first-child, td:first-child { text-align: center; width: 30px; }
  td { padding: 5px 8px; border-bottom: 0.4px solid #e5e7eb; }
  tr:nth-child(even) td { background: #f9fafb; }
  td:nth-child(2) { font-weight: bold; }
  .notes { background: #eaeef5; border: 0.5px solid #1e3a5f; padding: 7px 10px; font-size: 9px; color: #374151; margin-bottom: 14px; line-height: 1.5; }
  .footer-bar { background: #f3f4f6; border: 0.5px solid #e5e7eb; text-align: center; padding: 8px; font-size: 10px; font-weight: bold; color: #111827; }
  .footer-line { text-align: center; font-size: 8px; color: #9ca3af; margin-top: 5px; }
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
    <span class="info-label" style="border-left:2px solid #e5e7eb; padding-left:10px;">Pickup Location</span>
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

export default function GoodsCollectionMemoPage() {
  const [issuedPOs, setIssuedPOs] = useState<PO[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const today = new Date().toISOString().split('T')[0];
  const [courierName, setCourierName] = useState('');
  const [vehicle, setVehicle] = useState('');
  const [courierService, setCourierService] = useState('Lalamove');
  const [date, setDate] = useState(today);
  const [selectedPOs, setSelectedPOs] = useState<Set<string>>(new Set());
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      setLoading(true); setLoadError('');
      try {
        const res = await fetch('/api/documents/goods-collection-memo');
        const data = await res.json();
        if (!data.success) throw new Error(data.error || 'Failed to load issued Purchase Orders');
        setIssuedPOs(data.purchaseorders || []);
      } catch (e) {
        setLoadError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

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
    <div style={{ padding: 24, maxWidth: 1000, margin: '0 auto' }}>
      <div style={{ marginBottom: 22 }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, color: 'var(--text)', margin: 0 }}>Goods Collection Memo</h1>
        <p style={{ color: 'var(--text-4)', fontSize: 13, marginTop: 4 }}>Generate a courier pickup memo for POs within the last 7 days</p>
      </div>

      {loadError && (
        <div style={{ marginBottom: 14, padding: 12, borderRadius: 8, background: 'var(--danger-bg)', color: 'var(--danger)', border: '1px solid var(--danger-border)', fontSize: 13 }}>{loadError}</div>
      )}

      <div className="via-card mb-4">
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
            {loading ? (
              <div className="text-[var(--text-4)] text-xs py-3">Loading issued Purchase Orders...</div>
            ) : eligiblePOs.length === 0 ? (
              <div className="text-[var(--text-4)] text-xs py-3">No POs within the last 7 days.</div>
            ) : (
              <div className="border border-[var(--border)] rounded-lg overflow-x-auto" style={{ WebkitOverflowScrolling: 'touch' }}>
                <table style={{ width: '100%', minWidth: 520, borderCollapse: 'collapse', fontSize: 12 }}>
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
    </div>
  );
}
