'use client';

import { useState, useEffect } from 'react';
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';

interface PO {
  purchaseorder_id: string;
  purchaseorder_number: string;
  vendor_name: string;
  date: string;
  total: number;
}

const mono = { fontFamily: 'JetBrains Mono, monospace' };
const formatRp = (n: number) => 'Rp ' + Number(n).toLocaleString('id-ID');

const NAVY = rgb(0.118, 0.227, 0.373);
const DARK = rgb(0.067, 0.094, 0.153);
const GRAY = rgb(0.42, 0.45, 0.5);
const BODY_GRAY = rgb(0.216, 0.255, 0.318);
const LIGHT_BG = rgb(0.976, 0.98, 0.984);
const BORDER = rgb(0.898, 0.906, 0.922);
const WHITE = rgb(1, 1, 1);
const HEADER_BG = rgb(0.094, 0.094, 0.106);

function truncateToWidth(text: string, font: PDFFont, size: number, maxWidth: number): string {
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && font.widthOfTextAtSize(t + '...', size) > maxWidth) t = t.slice(0, -1);
  return t + '...';
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (current && font.widthOfTextAtSize(test, size) > maxWidth) {
      lines.push(current);
      current = word;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines;
}

async function generateMemoPDF(data: {
  courier_name: string; vehicle: string; courier_service: string;
  date: string; pos: Array<{ po_number: string; vendor_name: string; date: string }>;
}) {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const margin = 40;
  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const contentWidth = pageWidth - margin * 2;

  let page!: PDFPage;
  let y!: number;

  function newPage() {
    page = pdfDoc.addPage([pageWidth, pageHeight]);
    y = pageHeight - margin;
  }

  function drawTableHeader() {
    const headers = ['#', 'PO Number', 'Vendor', 'PO Date', 'Remarks'];
    const colX = [margin, margin + 26, margin + 150, margin + 350, margin + 440];
    page.drawRectangle({ x: margin, y: y - 14, width: contentWidth, height: 18, color: HEADER_BG });
    headers.forEach((h, i) => page.drawText(h, { x: colX[i] + 4, y: y - 9, size: 8, font: fontBold, color: WHITE }));
    y -= 18;
    return colX;
  }

  newPage();

  // ── Header ──
  page.drawText('CV. VARINDO FORMA HUTAMA', { x: margin, y, size: 14, font: fontBold, color: DARK });
  const title = 'GOODS COLLECTION MEMO';
  page.drawText(title, { x: pageWidth - margin - fontBold.widthOfTextAtSize(title, 14), y, size: 14, font: fontBold, color: NAVY });
  y -= 8;
  page.drawLine({ start: { x: margin, y }, end: { x: pageWidth - margin, y }, thickness: 2, color: NAVY });
  y -= 26;

  // ── Info grid ──
  const pickupX = margin + 260;
  page.drawText('DATE', { x: margin, y, size: 8, font, color: GRAY });
  page.drawText('PICKUP LOCATION', { x: pickupX, y, size: 8, font, color: GRAY });
  y -= 13;
  page.drawText(data.date, { x: margin, y, size: 10, font: fontBold, color: DARK });
  page.drawText('TAK PRODUCTS AND SERVICES, PT', { x: pickupX, y, size: 10, font: fontBold, color: DARK });
  y -= 12;
  page.drawText('Jl. Komp. Multi Guna No. 17 Blok C', { x: pickupX, y, size: 9, font, color: BODY_GRAY });
  y -= 12;
  page.drawText('Kec. Serpong Utara, Tangerang 15320, Banten', { x: pickupX, y, size: 9, font, color: BODY_GRAY });
  y -= 22;
  page.drawText('PREPARED BY', { x: margin, y, size: 8, font, color: GRAY });
  y -= 13;
  page.drawText('Varindo Admin', { x: margin, y, size: 10, font: fontBold, color: DARK });
  y -= 26;

  // ── Courier details ──
  page.drawText('COURIER DETAILS', { x: margin, y, size: 8, font: fontBold, color: GRAY });
  y -= 12;
  const courierBoxTop = y;
  page.drawRectangle({ x: margin, y: courierBoxTop - 34, width: contentWidth, height: 34, color: LIGHT_BG, borderColor: BORDER, borderWidth: 0.5 });
  const cx = [margin + 10, margin + 190, margin + 350];
  const clabels = ['NAME', 'VEHICLE NO.', 'SERVICE'];
  const cvalues = [data.courier_name, data.vehicle, data.courier_service];
  clabels.forEach((label, i) => {
    page.drawText(label, { x: cx[i], y: courierBoxTop - 12, size: 8, font, color: GRAY });
    page.drawText(truncateToWidth(cvalues[i], fontBold, 10, 150), { x: cx[i], y: courierBoxTop - 25, size: 10, font: fontBold, color: DARK });
  });
  y = courierBoxTop - 34 - 24;

  // ── PO table ──
  page.drawText('PURCHASE ORDERS TO COLLECT', { x: margin, y, size: 8, font: fontBold, color: GRAY });
  y -= 12;
  let colX = drawTableHeader();

  const rowHeight = 20;
  const footerReserve = 90; // notes box + footer bar
  data.pos.forEach((po, i) => {
    if (y - rowHeight < footerReserve) {
      newPage();
      colX = drawTableHeader();
    }
    if (i % 2 === 1) page.drawRectangle({ x: margin, y: y - 14, width: contentWidth, height: rowHeight - 2, color: LIGHT_BG });
    page.drawText(String(i + 1), { x: colX[0] + 8, y: y - 9, size: 9, font, color: DARK });
    page.drawText(truncateToWidth(po.po_number, fontBold, 9, 120), { x: colX[1] + 4, y: y - 9, size: 9, font: fontBold, color: DARK });
    page.drawText(truncateToWidth(po.vendor_name, font, 9, 195), { x: colX[2] + 4, y: y - 9, size: 9, font, color: DARK });
    page.drawText(po.date, { x: colX[3] + 4, y: y - 9, size: 9, font, color: DARK });
    y -= rowHeight;
  });
  y -= 16;

  // ── Notes ──
  const notesLines = wrapText(
    'Please ensure all items listed above are handed over to the courier before departure. Both parties must verify quantities and conditions upon handover.',
    font, 9, contentWidth - 20,
  );
  const notesHeight = notesLines.length * 12 + 12;
  page.drawRectangle({ x: margin, y: y - notesHeight, width: contentWidth, height: notesHeight, color: rgb(0.918, 0.933, 0.961), borderColor: NAVY, borderWidth: 0.5 });
  notesLines.forEach((line, i) => {
    page.drawText(line, { x: margin + 10, y: y - 14 - i * 12, size: 9, font, color: BODY_GRAY });
  });
  y -= notesHeight + 14;

  // ── Footer ──
  page.drawRectangle({ x: margin, y: y - 22, width: contentWidth, height: 22, color: rgb(0.953, 0.957, 0.965), borderColor: BORDER, borderWidth: 0.5 });
  const footerText = 'Computer-Generated Document - No Signature Required';
  page.drawText(footerText, {
    x: margin + (contentWidth - fontBold.widthOfTextAtSize(footerText, 10)) / 2,
    y: y - 15, size: 10, font: fontBold, color: DARK,
  });
  y -= 32;
  const companyText = 'CV. Varindo Forma Hutama';
  page.drawText(companyText, {
    x: margin + (contentWidth - font.widthOfTextAtSize(companyText, 8)) / 2,
    y, size: 8, font, color: rgb(0.612, 0.639, 0.686),
  });

  const pdfBytes = await pdfDoc.save();
  const blob = new Blob([new Uint8Array(pdfBytes)], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Goods-Collection-Memo-${data.date}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
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

  async function handleCreate() {
    if (!courierName.trim()) { setError('Enter courier name'); return; }
    if (!vehicle.trim()) { setError('Enter vehicle number'); return; }
    if (!selectedPOs.size) { setError('Select at least one PO'); return; }
    setError('');

    const pos = eligiblePOs
      .filter(po => selectedPOs.has(po.purchaseorder_id))
      .map(po => ({ po_number: po.purchaseorder_number, vendor_name: po.vendor_name, date: po.date }));

    try {
      await generateMemoPDF({ courier_name: courierName, vehicle, courier_service: courierService, date, pos });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to generate PDF');
    }
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
              <div className="text-[var(--text-4)] text-xs py-3">Loading…</div>
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
              Export to PDF
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
