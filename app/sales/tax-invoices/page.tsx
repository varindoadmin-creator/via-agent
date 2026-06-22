'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';

const mono = { fontFamily: 'JetBrains Mono, monospace' };
const formatRp = (n: number) => 'Rp ' + Math.round(n).toLocaleString('id-ID');

interface TaxInvoice {
  invoice_id: string;
  invoice_number: string;
  customer_name: string;
  date: string;
  due_date: string;
  status: string;
  total: number;
  balance: number;
  cf_npwp: string;
  cf_customer_po_no: string;
  has_attachment: boolean;
}

const STATUS_COLORS: Record<string, string> = {
  'draft':           'var(--text-4)',
  'sent':            'var(--info)',
  'overdue':         'var(--danger)',
  'paid':            'var(--success)',
  'partially_paid':  'var(--warning)',
  'void':            'var(--text-4)',
};

export default function TaxInvoicesPage() {
  const [period, setPeriod] = useState<'this_month' | 'prev_month'>('this_month');
  const [invoices, setInvoices] = useState<TaxInvoice[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [dateRange, setDateRange] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState(false);
  const [printing, setPrinting] = useState(false);

  // Upload state
  const [uploading, setUploading] = useState(false);
  const [uploadResults, setUploadResults] = useState<Array<{
    filename: string; invoice_number: string | null; customer_name: string | null;
    success: boolean; error?: string;
  }> | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  async function handleUpload(files: FileList | File[]) {
    const pdfs = Array.from(files).filter(f => f.type === 'application/pdf' || f.name.endsWith('.pdf'));
    if (!pdfs.length) return;
    setUploading(true); setUploadResults(null);
    try {
      const form = new FormData();
      pdfs.forEach(f => form.append('files', f));
      const res = await fetch('/api/sales/tax-invoices/attach', { method: 'POST', body: form });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      setUploadResults(data.results);
      if (data.succeeded > 0) fetchData(); // refresh list
    } catch(e) { alert('Upload failed: ' + String(e)); }
    finally { setUploading(false); }
  }

  const fetchData = useCallback(async () => {
    setLoading(true); setError(''); setSelected(new Set());
    try {
      const res = await fetch(`/api/sales/tax-invoices?period=${period}`);
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      setInvoices(data.invoices);
      setDateRange(`${data.from} – ${data.to}`);
    } catch(e) { setError(String(e)); }
    finally { setLoading(false); }
  }, [period]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const filtered = useMemo(() => {
    if (!search.trim()) return invoices;
    const q = search.toLowerCase();
    return invoices.filter(inv =>
      inv.invoice_number.toLowerCase().includes(q) ||
      inv.customer_name.toLowerCase().includes(q) ||
      inv.cf_npwp.includes(q)
    );
  }, [invoices, search]);

  function toggleSelect(id: string) {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  async function printSelectedInvoices() {
    const items = filtered.filter(inv => selected.has(inv.invoice_id));
    if (!items.length) return;
    setPrinting(true);
    try {
      const res = await fetch('/api/sales/tax-invoices/print', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoice_ids: items.map(i => i.invoice_id) }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to generate PDF');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch(e) { alert('Print failed: ' + String(e)); }
    finally { setPrinting(false); }
  }

    function copyTaxList() {
    const items = filtered.filter(inv => selected.has(inv.invoice_id));
    if (!items.length) return;
    const lines = [
      '*Tax Invoice / Faktur Pajak*',
      '',
      'Mohon dicetak Faktur Pajak untuk invoice berikut:',
      '',
      ...items.map((inv, i) => `${i + 1}. ${inv.invoice_number} — ${inv.customer_name}`),
      '',
      `Total: ${items.length} invoice`,
    ];
    navigator.clipboard.writeText(lines.join('\n')).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  }

  const thStyle: React.CSSProperties = {
    padding: '9px 12px', textAlign: 'left',
    color: 'var(--text-3)', fontWeight: 500, fontSize: 10,
    textTransform: 'uppercase', letterSpacing: '0.06em',
    background: 'var(--surface-2)', borderBottom: '1px solid var(--border)',
    whiteSpace: 'nowrap',
  };

  const totals = useMemo(() => ({
    count: filtered.length,
    total: filtered.reduce((s, i) => s + i.total, 0),
    withNPWP: filtered.filter(i => i.cf_npwp).length,
    attached: filtered.filter(i => i.has_attachment).length,
  }), [filtered]);

  return (
    <div className="via-page" style={{ background: 'var(--bg)', minHeight: '100%' }}>
      <div style={{ maxWidth: 1300, margin: '0 auto' }}>

        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="text-[var(--text)] font-semibold text-2xl tracking-tight">Tax Invoices</h1>
            <p className="text-[var(--text-3)] text-sm mt-0.5">{dateRange || 'Loading…'}</p>
          </div>
          <div className="flex items-center gap-2">
            {selected.size > 0 && (() => {
              const selItems = filtered.filter(inv => selected.has(inv.invoice_id));
              const hasFP = selItems.some(inv => inv.has_attachment);
              const allFP = selItems.every(inv => inv.has_attachment);
              const mixedFP = hasFP && !allFP;
              return (
                <>
                  <button onClick={printSelectedInvoices} disabled={printing}
                    className="px-4 py-2 text-xs font-semibold rounded-lg border transition-all bg-[var(--surface-2)] text-[var(--text)] border-[var(--border)] hover:bg-[var(--surface-3)] disabled:opacity-50">
                    {printing
                      ? '⏳ Preparing PDF…'
                      : allFP
                      ? `🖨 Print Invoice + FP (${selected.size})`
                      : mixedFP
                      ? `🖨 Print Invoice + FP where available (${selected.size})`
                      : `🖨 Print Invoice Only (${selected.size})`}
                  </button>
                  <button onClick={copyTaxList}
                    className={`px-4 py-2 text-xs font-semibold rounded-lg border transition-all ${
                      copied
                        ? 'bg-[var(--success-bg)] text-[var(--success)] border-[var(--success-border)]'
                        : 'bg-[var(--accent)] text-white border-[var(--accent)] hover:opacity-90'
                    }`}>
                    {copied ? '✓ Copied!' : `📋 Copy FP List (${selected.size})`}
                  </button>
                </>
              );
            })()}
            <button onClick={fetchData} disabled={loading}
              className="px-3 py-2 text-xs bg-[var(--surface-2)] hover:bg-[var(--surface-3)] text-[var(--text-3)] rounded-lg border border-[var(--border)] disabled:opacity-50"
              style={mono}>
              {loading ? '…' : '↻ Refresh'}
            </button>
          </div>
        </div>

        {/* Period + Search */}
        <div className="flex items-center gap-3 mb-4">
          {(['this_month', 'prev_month'] as const).map(p => (
            <button key={p} onClick={() => setPeriod(p)}
              className={`px-4 py-2 text-xs font-medium rounded-lg border transition-all ${
                period === p
                  ? 'bg-[var(--accent)] text-white border-[var(--accent)]'
                  : 'bg-[var(--surface-2)] text-[var(--text-3)] border-[var(--border)] hover:bg-[var(--surface-3)]'
              }`}>
              {p === 'this_month' ? 'This Month' : 'Previous Month'}
            </button>
          ))}
          <div className="ml-auto flex items-center gap-3">
            <div className="flex items-center gap-4 text-xs text-[var(--text-3)]">
              <span>{totals.count} invoices</span>
              <span className="text-[var(--success)]">{totals.withNPWP} with NPWP</span>
              <span className="text-[var(--warning)]">{totals.count - totals.withNPWP} without NPWP</span>
              <span style={{ color: 'var(--text-3)' }}>📎 {totals.attached} FP attached</span>
            </div>
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search invoice, customer, NPWP…"
              className="via-input text-xs py-1.5 px-3 w-56" />
          </div>
        </div>

        {/* Upload Tax Invoice PDFs */}
        <div
          onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={e => { e.preventDefault(); setIsDragging(false); handleUpload(e.dataTransfer.files); }}
          className={`mb-4 border-2 border-dashed rounded-xl p-5 text-center transition-all cursor-pointer ${
            isDragging ? 'border-[var(--accent)] bg-[var(--accent-light)]' : 'border-[var(--border)] hover:border-[var(--accent)] hover:bg-[var(--surface-2)]'
          }`}
          onClick={() => { const inp = document.getElementById('fp-upload') as HTMLInputElement; inp?.click(); }}
        >
          <input id="fp-upload" type="file" accept=".pdf,application/pdf" multiple className="hidden"
            onChange={e => { if (e.target.files) handleUpload(e.target.files); e.target.value = ''; }} />
          {uploading ? (
            <div className="text-[var(--text-3)] text-sm animate-pulse">Processing PDFs…</div>
          ) : (
            <div>
              <div className="text-2xl mb-1">📎</div>
              <div className="text-[var(--text)] text-sm font-medium">Drop Tax Invoice PDFs here or click to upload</div>
              <div className="text-[var(--text-4)] text-xs mt-1">VIA will extract the invoice number and attach each PDF to its Zoho invoice automatically</div>
            </div>
          )}
        </div>

        {/* Upload results */}
        {uploadResults && (
          <div className="mb-4 via-card overflow-hidden">
            <div className="px-4 py-3 border-b border-[var(--border)] flex items-center gap-3">
              <span className="text-[var(--text)] text-xs font-semibold">Upload Results</span>
              <span className="text-[var(--success)] text-xs">✓ {uploadResults.filter(r => r.success).length} attached</span>
              {uploadResults.filter(r => !r.success).length > 0 && (
                <span className="text-[var(--danger)] text-xs">✗ {uploadResults.filter(r => !r.success).length} failed</span>
              )}
              <button onClick={() => setUploadResults(null)} className="ml-auto text-[var(--text-4)] text-xs">✕</button>
            </div>
            <div className="divide-y divide-[var(--border-muted)]">
              {uploadResults.map((r, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-2.5">
                  <span className={`text-sm ${r.success ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>
                    {r.success ? '✓' : '✗'}
                  </span>
                  <span className="text-[var(--text-3)] text-xs truncate max-w-[200px]" title={r.filename}>{r.filename}</span>
                  {r.invoice_number && (
                    <span className="text-[var(--accent-text)] text-xs font-medium" style={mono}>{r.invoice_number}</span>
                  )}
                  {r.customer_name && (
                    <span className="text-[var(--text-3)] text-xs">{r.customer_name}</span>
                  )}
                  {r.success && <span className="text-[var(--success)] text-xs ml-auto">Attached to Zoho ✓</span>}
                  {!r.success && <span className="text-[var(--danger)] text-xs ml-auto">{r.error}</span>}
                </div>
              ))}
            </div>
          </div>
        )}

        {error && (
          <div className="p-4 mb-4 bg-[var(--danger-bg)] border border-[var(--danger-border)] rounded-lg text-[var(--danger)] text-sm">{error}</div>
        )}

        {/* Table */}
        <div className="via-card overflow-hidden">
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ ...thStyle, width: 40 }}>
                  <input type="checkbox" className="w-3.5 h-3.5 rounded"
                    checked={selected.size === filtered.length && filtered.length > 0}
                    onChange={function() {
                      if (selected.size === filtered.length) setSelected(new Set());
                      else setSelected(new Set(filtered.map(i => i.invoice_id)));
                    }} />
                </th>
                <th style={{ ...thStyle, width: 40, textAlign: 'center' }} title="Tax Invoice / Faktur Pajak attached">FP</th>
                <th style={thStyle}>#</th>
                <th style={thStyle}>Invoice No.</th>
                <th style={thStyle}>Customer</th>
                <th style={thStyle}>Date</th>
                <th style={thStyle}>NPWP</th>
                <th style={thStyle}>Status</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {loading && [...Array(8)].map((_, i) => (
                <tr key={i} className="animate-pulse">
                  {[...Array(8)].map((_, j) => (
                    <td key={j} style={{ padding: '10px 12px' }}>
                      <div style={{ height: 12, background: 'var(--surface-3)', borderRadius: 4, width: j === 2 ? '60%' : '80%' }} />
                    </td>
                  ))}
                </tr>
              ))}
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={8} style={{ padding: 40, textAlign: 'center', color: 'var(--text-4)', fontSize: 13 }}>
                    No invoices for this period.
                  </td>
                </tr>
              )}
              {!loading && filtered.map((inv, i) => (
                <tr key={inv.invoice_id}
                  onClick={() => toggleSelect(inv.invoice_id)}
                  className={`cursor-pointer transition-colors ${selected.has(inv.invoice_id) ? 'bg-[var(--accent-light)]' : 'hover:bg-[var(--surface-2)]'}`}
                  style={{ borderBottom: '1px solid var(--border-muted)' }}>
                  <td style={{ padding: '9px 12px' }} onClick={e => e.stopPropagation()}>
                    <input type="checkbox" className="w-3.5 h-3.5 rounded"
                      checked={selected.has(inv.invoice_id)}
                      onChange={() => toggleSelect(inv.invoice_id)} />
                  </td>
                  <td style={{ padding: '9px 12px', textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                    {inv.has_attachment
                      ? <span title="Faktur Pajak attached" style={{ fontSize: 14 }}>📎</span>
                      : <span style={{ color: 'var(--border)', fontSize: 11 }}>—</span>
                    }
                  </td>
                  <td style={{ padding: '9px 12px', color: 'var(--text-4)', fontSize: 11, ...mono }}>{i + 1}</td>
                  <td style={{ padding: '9px 12px', ...mono, color: 'var(--accent-text)', fontWeight: 600, fontSize: 12 }}>
                    {inv.invoice_number}
                  </td>
                  <td style={{ padding: '9px 12px', color: 'var(--text)', fontSize: 12, maxWidth: 220,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                    title={inv.customer_name}>
                    {inv.customer_name}
                  </td>
                  <td style={{ padding: '9px 12px', color: 'var(--text-3)', fontSize: 12 }}>{inv.date}</td>
                  <td style={{ padding: '9px 12px' }}>
                    {inv.cf_npwp ? (
                      <span style={{ ...mono, fontSize: 11, color: 'var(--text-2)',
                        background: 'var(--surface-3)', padding: '2px 7px', borderRadius: 4 }}>
                        {inv.cf_npwp}
                      </span>
                    ) : (
                      <span style={{ fontSize: 11, color: 'var(--text-4)' }}>—</span>
                    )}
                  </td>
                  <td style={{ padding: '9px 12px' }}>
                    <span style={{
                      fontSize: 11, fontWeight: 500, textTransform: 'capitalize',
                      color: STATUS_COLORS[inv.status] || 'var(--text-3)',
                    }}>
                      {inv.status?.replace('_', ' ')}
                    </span>
                  </td>
                  <td style={{ padding: '9px 12px', textAlign: 'right', ...mono, color: 'var(--text-2)', fontSize: 12, fontWeight: 600 }}>
                    {formatRp(inv.total)}
                  </td>
                </tr>
              ))}
            </tbody>
            {!loading && filtered.length > 0 && (
              <tfoot style={{ borderTop: '1px solid var(--border)', background: 'var(--surface-2)' }}>
                <tr>
                  <td colSpan={7} style={{ padding: '8px 12px', ...mono, color: 'var(--text-3)', fontSize: 11, fontWeight: 600 }}>
                    TOTAL ({filtered.length} invoices)
                  </td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', ...mono, color: 'var(--text)', fontWeight: 700, fontSize: 13 }}>
                    {formatRp(filtered.reduce((s, i) => s + i.total, 0))}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}
