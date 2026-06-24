'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';

type SOList = {
  salesorder_id: string;
  salesorder_number: string;
  customer_name: string;
  date: string;
  status: string;
  total: number;
  salesperson_name?: string;
};

type SOItem = {
  name: string;
  sku: string;
  quantity: number;
  unit: string;
  rate: number;
  amount: number;
  location_name: string;
};

type SODetail = SOList & {
  sub_total: number;
  notes: string;
  line_items: SOItem[];
};

type Analysis = {
  overall_status?: string;
  summary?: string;
  approval_recommendation?: string;
  customer_check?: { so_customer?: string; proof_customer?: string; status?: string; notes?: string };
  extracted_items?: Array<{ item?: string; sku?: string; quantity?: number; unit?: string; price?: number | null; source_note?: string }>;
  comparison?: Array<{ so_item?: string; so_sku?: string; so_qty?: number; proof_item?: string; proof_sku?: string; proof_qty?: number | null; status?: string; notes?: string }>;
};

const formatRp = (n: number) => 'Rp ' + Math.round(n || 0).toLocaleString('id-ID');
const fmt = (n: number) => Number(n || 0).toLocaleString('id-ID');
const mono = { fontFamily: 'JetBrains Mono, monospace' };

function badgeColor(status?: string) {
  if (status === 'MATCH' || status === 'APPROVE') return { color: '#6ee7a8', bg: 'rgba(34,197,94,0.12)', border: 'rgba(34,197,94,0.25)' };
  if (status === 'MISMATCH' || status === 'REJECT') return { color: '#fb7185', bg: 'rgba(244,63,94,0.12)', border: 'rgba(244,63,94,0.25)' };
  if (status === 'PARTIAL_MATCH' || status === 'REVIEW') return { color: '#fbbf24', bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.25)' };
  return { color: '#94a3b8', bg: 'rgba(148,163,184,0.10)', border: 'rgba(148,163,184,0.20)' };
}

function Badge({ value }: { value?: string }) {
  const c = badgeColor(value);
  return <span style={{ ...mono, fontSize: 10, padding: '4px 8px', borderRadius: 999, color: c.color, background: c.bg, border: `1px solid ${c.border}` }}>{value || 'UNCLEAR'}</span>;
}

export default function SOApprovalCheckPage() {
  const [salesorders, setSalesorders] = useState<SOList[]>([]);
  const [details, setDetails] = useState<Record<string, SODetail>>({});
  const [expanded, setExpanded] = useState<string | null>(null);
  const [files, setFiles] = useState<Record<string, File[]>>({});
  const [customerOverride, setCustomerOverride] = useState<Record<string, string>>({});
  const [customers, setCustomers] = useState<{ contact_id: string; contact_name: string }[]>([]);
  const [analysis, setAnalysis] = useState<Record<string, Analysis>>({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [approveMessage, setApproveMessage] = useState('');
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  async function load() {
    setLoading(true); setError('');
    try {
      const res = await fetch('/api/approvals/so');
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Failed to load pending approval SOs');
      setSalesorders(data.salesorders || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setLoading(false); }
  }

  useEffect(() => {
    load();
    fetch('/api/approvals/so?customers=1')
      .then(r => r.json())
      .then(d => { if (d.success) setCustomers(d.customers || []); })
      .catch(() => {});
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return salesorders;
    return salesorders.filter(so =>
      so.salesorder_number.toLowerCase().includes(q) ||
      so.customer_name.toLowerCase().includes(q) ||
      (so.salesperson_name || '').toLowerCase().includes(q)
    );
  }, [salesorders, search]);

  async function toggle(so: SOList) {
    const id = so.salesorder_id;
    setExpanded(prev => prev === id ? null : id);
    if (!details[id]) {
      setBusyId(id);
      try {
        const res = await fetch(`/api/approvals/so?id=${encodeURIComponent(id)}`);
        const data = await res.json();
        if (!data.success) throw new Error(data.error || 'Failed to load SO detail');
        setDetails(prev => ({ ...prev, [id]: data.salesorder }));
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally { setBusyId(null); }
    }
  }

  async function checkSO(soId: string) {
    const selectedFiles = files[soId] || [];
    if (!selectedFiles.length) { setError('Please upload WhatsApp screenshot, image, PDF, or text proof first.'); return; }
    setBusyId(soId); setError('');
    try {
      const fd = new FormData();
      fd.append('salesorder_id', soId);
      selectedFiles.forEach(f => fd.append('files', f));
      if (customerOverride[soId]) fd.append('customer_name_override', customerOverride[soId]);
      const res = await fetch('/api/approvals/so', { method: 'POST', body: fd });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'AI check failed');
      setDetails(prev => ({ ...prev, [soId]: data.salesorder }));
      setAnalysis(prev => ({ ...prev, [soId]: data.analysis || {} }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setBusyId(null); }
  }

  async function approveSO(soId: string) {
    const result = analysis[soId];
    if (result?.approval_recommendation !== 'APPROVE' && result?.overall_status !== 'MATCH') {
      setError('VIA result is not MATCH/APPROVE yet. Run the approval check first or review the mismatch manually.');
      return;
    }

    const so = salesorders.find(item => item.salesorder_id === soId);
    const ok = window.confirm(`Approve ${so?.salesorder_number || 'this Sales Order'} in Zoho? This will change the SO status to Approved.`);
    if (!ok) return;

    setApprovingId(soId); setError(''); setApproveMessage('');
    try {
      const res = await fetch('/api/approvals/so', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ salesorder_id: soId }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Failed to approve Sales Order');
      setApproveMessage(`${data.salesorder_number || 'Sales Order'} approved in Zoho.`);
      setSalesorders(prev => prev.filter(item => item.salesorder_id !== soId));
      setExpanded(prev => prev === soId ? null : prev);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setApprovingId(null); }
  }

  const totalValue = salesorders.reduce((sum, so) => sum + (so.total || 0), 0);

  return (
    <div style={{ padding: 24, maxWidth: 1280, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start', marginBottom: 22 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: 'var(--text-1)', margin: 0 }}>SO Approval Check</h1>
          <p style={{ color: 'var(--text-3)', marginTop: 6, fontSize: 13 }}>Upload customer order proof and let VIA compare item and quantity against Pending Approval Sales Orders.</p>
        </div>
        <button onClick={load} disabled={loading} style={{ border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text-2)', borderRadius: 8, padding: '9px 14px', fontSize: 12, cursor: 'pointer' }}>↻ Refresh</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12, marginBottom: 16 }}>
        <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, padding: 16 }}>
          <div style={{ ...mono, color: 'var(--text-4)', fontSize: 11, letterSpacing: '0.08em' }}>PENDING SO</div>
          <div style={{ color: 'var(--text-1)', fontSize: 22, fontWeight: 700 }}>{salesorders.length}</div>
        </div>
        <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, padding: 16 }}>
          <div style={{ ...mono, color: 'var(--text-4)', fontSize: 11, letterSpacing: '0.08em' }}>TOTAL VALUE</div>
          <div style={{ color: 'var(--text-1)', fontSize: 22, fontWeight: 700 }}>{formatRp(totalValue)}</div>
        </div>
        <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, padding: 16 }}>
          <div style={{ ...mono, color: 'var(--text-4)', fontSize: 11, letterSpacing: '0.08em' }}>MODE</div>
          <div style={{ color: 'var(--accent)', fontSize: 22, fontWeight: 700 }}>Human Review</div>
        </div>
      </div>

      {error && <div style={{ marginBottom: 14, padding: 12, borderRadius: 8, background: 'rgba(244,63,94,0.12)', color: '#fda4af', border: '1px solid rgba(244,63,94,0.25)', fontSize: 13 }}>{error}</div>}
      {approveMessage && <div style={{ marginBottom: 14, padding: 12, borderRadius: 8, background: 'rgba(34,197,94,0.12)', color: '#86efac', border: '1px solid rgba(34,197,94,0.25)', fontSize: 13 }}>{approveMessage}</div>}

      <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
          <div>
            <div style={{ color: 'var(--text-1)', fontWeight: 650 }}>Pending Approval Sales Orders</div>
            <div style={{ color: 'var(--text-4)', fontSize: 12 }}>Click the arrow, upload proof, then run VIA check.</div>
          </div>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search SO/customer..." style={{ background: 'var(--surface-1)', border: '1px solid var(--border)', color: 'var(--text-2)', padding: '9px 12px', borderRadius: 8, width: 230, outline: 'none' }} />
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'var(--surface-3)', color: 'var(--text-4)', ...mono, fontSize: 10, letterSpacing: '0.08em' }}>
              <th style={{ width: 44, padding: '11px 12px', textAlign: 'left' }}></th>
              <th style={{ padding: '11px 12px', textAlign: 'left' }}>SO NUMBER</th>
              <th style={{ padding: '11px 12px', textAlign: 'left' }}>CUSTOMER</th>
              <th style={{ padding: '11px 12px', textAlign: 'left' }}>DATE</th>
              <th style={{ padding: '11px 12px', textAlign: 'left' }}>SALES PERSON</th>
              <th style={{ padding: '11px 12px', textAlign: 'right' }}>TOTAL</th>
              <th style={{ padding: '11px 12px', textAlign: 'center' }}>AI STATUS</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} style={{ padding: 28, color: 'var(--text-3)', textAlign: 'center' }}>Loading pending approval SOs...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={7} style={{ padding: 28, color: 'var(--text-3)', textAlign: 'center' }}>No Pending Approval Sales Orders found.</td></tr>
            ) : filtered.map(so => {
              const isOpen = expanded === so.salesorder_id;
              const detail = details[so.salesorder_id];
              const result = analysis[so.salesorder_id];
              return (
                <Fragment key={so.salesorder_id}>
                  <tr key={so.salesorder_id} onClick={() => toggle(so)} style={{ borderTop: '1px solid var(--border)', cursor: 'pointer', color: 'var(--text-2)' }}>
                    <td style={{ padding: '12px' }}><span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 19, height: 19, borderRadius: '50%', background: isOpen ? 'rgba(220,113,79,.20)' : 'var(--surface-3)', color: isOpen ? 'var(--accent)' : 'var(--text-3)', fontSize: 11 }}>{isOpen ? '⌄' : '›'}</span></td>
                    <td style={{ padding: '12px', ...mono, color: 'var(--text-1)', fontSize: 12 }}>{so.salesorder_number}</td>
                    <td style={{ padding: '12px', fontWeight: 600 }}>{so.customer_name}</td>
                    <td style={{ padding: '12px', ...mono, fontSize: 12 }}>{so.date}</td>
                    <td style={{ padding: '12px' }}>{so.salesperson_name || '—'}</td>
                    <td style={{ padding: '12px', textAlign: 'right', ...mono, fontWeight: 700 }}>{formatRp(so.total)}</td>
                    <td style={{ padding: '12px', textAlign: 'center' }}><Badge value={result?.overall_status} /></td>
                  </tr>

                  {isOpen && (
                    <tr key={so.salesorder_id + '-detail'}>
                      <td colSpan={7} style={{ padding: 0, background: 'rgba(255,255,255,0.025)', borderTop: '1px solid var(--border)' }}>
                        <div style={{ padding: '18px 22px 22px 54px' }}>
                          <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 16 }}>
                            <div>
                              <h3 style={{ margin: '0 0 10px', color: 'var(--text-1)', fontSize: 15 }}>SO Items</h3>
                              {!detail || busyId === so.salesorder_id && !detail ? <div style={{ color: 'var(--text-3)' }}>Loading SO detail...</div> : (
                                <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                                  <thead><tr style={{ background: 'var(--surface-3)', color: 'var(--text-4)', ...mono, fontSize: 10 }}><th style={{ padding: 9, textAlign: 'left' }}>ITEM</th><th style={{ padding: 9, textAlign: 'left' }}>SKU</th><th style={{ padding: 9, textAlign: 'right' }}>QTY</th><th style={{ padding: 9, textAlign: 'right' }}>RATE</th></tr></thead>
                                  <tbody>{detail.line_items.map((li, idx) => <tr key={idx} style={{ borderTop: '1px solid var(--border)' }}><td style={{ padding: 9 }}>{li.name}</td><td style={{ padding: 9, ...mono, fontSize: 11 }}>{li.sku}</td><td style={{ padding: 9, textAlign: 'right', ...mono }}>{fmt(li.quantity)} {li.unit}</td><td style={{ padding: 9, textAlign: 'right', ...mono }}>{formatRp(li.rate)}</td></tr>)}</tbody>
                                </table>
                              )}
                            </div>

                            <div>
                              <h3 style={{ margin: '0 0 10px', color: 'var(--text-1)', fontSize: 15 }}>Upload Proof</h3>
                              <input type="file" multiple accept="image/*,application/pdf,text/plain,text/csv" onChange={e => setFiles(prev => ({ ...prev, [so.salesorder_id]: Array.from(e.target.files || []) }))} style={{ width: '100%', background: 'var(--surface-1)', border: '1px dashed var(--border)', borderRadius: 8, color: 'var(--text-2)', padding: 12 }} />
                              <div style={{ color: 'var(--text-4)', fontSize: 11, marginTop: 8 }}>Supported: WhatsApp screenshots, images, PDFs, text/CSV. VIA reads the proof and compares item + quantity.</div>
                              {(files[so.salesorder_id] || []).length > 0 && <div style={{ marginTop: 10, color: 'var(--text-3)', fontSize: 12 }}>{files[so.salesorder_id].map(f => f.name).join(', ')}</div>}
                              <div style={{ marginTop: 14 }}>
                                <div style={{ color: 'var(--text-3)', fontSize: 12, marginBottom: 6 }}>Customer Name <span style={{ color: 'var(--text-4)' }}>(optional — select if proof has no customer info)</span></div>
                                <select
                                  value={customerOverride[so.salesorder_id] || ''}
                                  onChange={e => setCustomerOverride(prev => ({ ...prev, [so.salesorder_id]: e.target.value }))}
                                  style={{ width: '100%', background: 'var(--surface-1)', border: '1px solid var(--border)', color: customerOverride[so.salesorder_id] ? 'var(--text-1)' : 'var(--text-4)', borderRadius: 8, padding: '9px 12px', fontSize: 13, outline: 'none' }}
                                >
                                  <option value=''>— auto-detect from proof —</option>
                                  {customers.map(c => <option key={c.contact_id} value={c.contact_name}>{c.contact_name}</option>)}
                                </select>
                              </div>
                              <button onClick={() => checkSO(so.salesorder_id)} disabled={busyId === so.salesorder_id} style={{ marginTop: 12, width: '100%', border: '1px solid rgba(220,113,79,.35)', background: 'var(--accent)', color: 'white', borderRadius: 8, padding: '10px 12px', fontWeight: 700, cursor: 'pointer' }}>{busyId === so.salesorder_id ? 'Checking...' : 'Run VIA Approval Check'}</button>
                            </div>
                          </div>

                          {result && (
                            <div style={{ marginTop: 18, border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', background: 'var(--surface-2)' }}>
                              <div style={{ padding: 14, display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', borderBottom: '1px solid var(--border)' }}>
                                <div><div style={{ color: 'var(--text-1)', fontWeight: 700 }}>VIA Check Result</div><div style={{ color: 'var(--text-3)', fontSize: 12 }}>{result.summary}</div></div>
                                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                  <Badge value={result.overall_status} />
                                  <Badge value={result.approval_recommendation} />
                                  <button
                                    onClick={(e) => { e.stopPropagation(); approveSO(so.salesorder_id); }}
                                    disabled={approvingId === so.salesorder_id || (result.approval_recommendation !== 'APPROVE' && result.overall_status !== 'MATCH')}
                                    title={(result.approval_recommendation !== 'APPROVE' && result.overall_status !== 'MATCH') ? 'Approval is enabled only when VIA result is MATCH/APPROVE.' : 'Approve this Sales Order in Zoho'}
                                    style={{
                                      border: '1px solid rgba(34,197,94,.35)',
                                      background: (result.approval_recommendation === 'APPROVE' || result.overall_status === 'MATCH') ? 'rgba(34,197,94,.18)' : 'rgba(148,163,184,.10)',
                                      color: (result.approval_recommendation === 'APPROVE' || result.overall_status === 'MATCH') ? '#86efac' : 'var(--text-4)',
                                      borderRadius: 8,
                                      padding: '7px 10px',
                                      fontWeight: 700,
                                      cursor: (result.approval_recommendation === 'APPROVE' || result.overall_status === 'MATCH') ? 'pointer' : 'not-allowed',
                                      fontSize: 12,
                                    }}
                                  >{approvingId === so.salesorder_id ? 'Approving...' : 'Approve SO'}</button>
                                </div>
                              </div>

                              {result.customer_check && <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', color: 'var(--text-2)', fontSize: 12 }}>Customer check: <Badge value={result.customer_check.status} /> <span style={{ marginLeft: 8 }}>{result.customer_check.notes}</span></div>}

                              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead><tr style={{ background: 'var(--surface-3)', color: 'var(--text-4)', ...mono, fontSize: 10 }}><th style={{ padding: 10, textAlign: 'left' }}>SO ITEM</th><th style={{ padding: 10, textAlign: 'right' }}>SO QTY</th><th style={{ padding: 10, textAlign: 'left' }}>PROOF ITEM</th><th style={{ padding: 10, textAlign: 'right' }}>PROOF QTY</th><th style={{ padding: 10, textAlign: 'center' }}>STATUS</th><th style={{ padding: 10, textAlign: 'left' }}>NOTES</th></tr></thead>
                                <tbody>{(result.comparison || []).map((row, idx) => <tr key={idx} style={{ borderTop: '1px solid var(--border)' }}><td style={{ padding: 10 }}>{row.so_item}<div style={{ ...mono, color: 'var(--text-4)', fontSize: 10 }}>{row.so_sku}</div></td><td style={{ padding: 10, textAlign: 'right', ...mono }}>{row.so_qty}</td><td style={{ padding: 10 }}>{row.proof_item}<div style={{ ...mono, color: 'var(--text-4)', fontSize: 10 }}>{row.proof_sku}</div></td><td style={{ padding: 10, textAlign: 'right', ...mono }}>{row.proof_qty ?? '—'}</td><td style={{ padding: 10, textAlign: 'center' }}><Badge value={row.status} /></td><td style={{ padding: 10, color: 'var(--text-3)', fontSize: 12 }}>{row.notes}</td></tr>)}</tbody>
                              </table>
                            </div>
                          )}
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

      <p style={{ color: 'var(--text-4)', fontSize: 12, marginTop: 12 }}>VIA gives a recommendation only. Final approval should still be reviewed by Admin/Manager before approving in Zoho.</p>
    </div>
  );
}
