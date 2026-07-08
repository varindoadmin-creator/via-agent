'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';

interface FieldChange { field: string; from: string; to: string }
interface CompletenessFlag { field: string; message: string }
interface ScanCustomer {
  contact_id: string;
  contact_name: string;
  changes: FieldChange[];
  flags: CompletenessFlag[];
}
interface ScanResponse {
  success: boolean;
  error?: string;
  total_customers: number;
  already_fixed: number;
  scanned: number;
  needs_attention: number;
  customers: ScanCustomer[];
}
interface ApplyResult {
  succeeded: Array<{ contact_id: string; contact_name: string }>;
  failed: Array<{ contact_id: string; error: string }>;
}

export default function CustomerCleanupModal({ onClose, onApplied }: { onClose: () => void; onApplied: () => void }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [scan, setScan] = useState<ScanResponse | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [applying, setApplying] = useState(false);
  const [result, setResult] = useState<ApplyResult | null>(null);

  const runScan = useCallback(async () => {
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const res = await fetch('/api/customers/cleanup');
      const data: ScanResponse = await res.json();
      if (!data.success) throw new Error(data.error || 'Scan failed');
      setScan(data);
      // Pre-select every row that actually has an applicable change (not flag-only rows)
      setSelected(new Set(data.customers.filter((c) => c.changes.length > 0).map((c) => c.contact_id)));
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { runScan(); }, [runScan]);

  const applicableCustomers = useMemo(() => scan?.customers.filter((c) => c.changes.length > 0) || [], [scan]);
  const flagOnlyCustomers = useMemo(() => scan?.customers.filter((c) => c.changes.length === 0 && c.flags.length > 0) || [], [scan]);

  function toggle(id: string) {
    setSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  function toggleAll() {
    setSelected((prev) => prev.size === applicableCustomers.length ? new Set() : new Set(applicableCustomers.map((c) => c.contact_id)));
  }

  async function handleApply() {
    if (selected.size === 0) return;
    setApplying(true);
    setError('');
    try {
      const res = await fetch('/api/customers/cleanup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contact_ids: Array.from(selected) }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Apply failed');
      setResult({ succeeded: data.succeeded || [], failed: data.failed || [] });
      onApplied();
    } catch (e) {
      setError(String(e));
    } finally {
      setApplying(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="via-card w-[820px] mx-4 flex flex-col max-h-[90vh]" onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)] flex-shrink-0">
          <div>
            <h3 className="text-[var(--text)] font-semibold text-sm">Customer Data Repair</h3>
            {scan && !result && (
              <p className="text-[var(--text-3)] text-xs mt-0.5">
                {scan.total_customers} total · {scan.already_fixed} already repaired · {scan.needs_attention} need attention
              </p>
            )}
          </div>
          <button onClick={onClose} className="text-[var(--text-3)] hover:text-[var(--text)] text-lg transition-colors">✕</button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto flex-1 px-6 py-5">
          {loading && (
            <div className="py-16 text-center text-[var(--text-3)] text-sm">Scanning customer data…</div>
          )}

          {error && (
            <div className="mb-4 rounded-lg p-3 text-sm" style={{ background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', color: 'var(--danger)' }}>
              {error}
            </div>
          )}

          {!loading && result && (
            <div className="space-y-3">
              <div className="via-badge via-badge-success">✓ {result.succeeded.length} repaired</div>
              {result.failed.length > 0 && (
                <div className="via-badge via-badge-danger ml-2">✗ {result.failed.length} failed</div>
              )}
              {result.failed.length > 0 && (
                <ul className="mt-3 space-y-1">
                  {result.failed.map((f) => (
                    <li key={f.contact_id} className="text-xs text-[var(--danger)]">{f.contact_id}: {f.error}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {!loading && !result && scan && scan.needs_attention === 0 && (
            <div className="py-16 text-center text-[var(--text-3)] text-sm">✓ All customers already match the house rules.</div>
          )}

          {!loading && !result && scan && scan.needs_attention > 0 && (
            <div className="space-y-6">
              {applicableCustomers.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-[var(--text-3)] uppercase tracking-wider">
                      Proposed Fixes ({applicableCustomers.length})
                    </span>
                    <button onClick={toggleAll} className="text-xs text-[var(--accent)] hover:underline">
                      {selected.size === applicableCustomers.length ? 'Deselect all' : 'Select all'}
                    </button>
                  </div>
                  <div className="via-table-wrap via-card">
                    <table className="via-table">
                      <thead>
                        <tr>
                          <th style={{ width: 32 }}></th>
                          <th>Customer</th>
                          <th>Changes</th>
                        </tr>
                      </thead>
                      <tbody>
                        {applicableCustomers.map((c) => (
                          <tr key={c.contact_id}>
                            <td>
                              <input
                                type="checkbox"
                                checked={selected.has(c.contact_id)}
                                onChange={() => toggle(c.contact_id)}
                              />
                            </td>
                            <td className="font-medium text-[var(--text)] align-top whitespace-nowrap">{c.contact_name}</td>
                            <td>
                              <div className="space-y-1">
                                {c.changes.map((ch, i) => (
                                  <div key={i} className="text-xs">
                                    <span className="text-[var(--text-3)]">{ch.field}:</span>{' '}
                                    <span className="text-[var(--text-3)]">{ch.from}</span>
                                    <span className="text-[var(--text-4)]"> → </span>
                                    <span className="text-[var(--success)] font-medium">{ch.to}</span>
                                  </div>
                                ))}
                                {c.flags.map((f, i) => (
                                  <div key={`flag-${i}`} className="text-xs text-[var(--warning)]">⚠ {f.field}: {f.message}</div>
                                ))}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {flagOnlyCustomers.length > 0 && (
                <div>
                  <span className="text-xs font-semibold text-[var(--text-3)] uppercase tracking-wider">
                    Needs Manual Review ({flagOnlyCustomers.length}) — VIA can&apos;t auto-fix these
                  </span>
                  <div className="via-table-wrap via-card mt-2">
                    <table className="via-table">
                      <thead>
                        <tr>
                          <th>Customer</th>
                          <th>Issue</th>
                        </tr>
                      </thead>
                      <tbody>
                        {flagOnlyCustomers.map((c) => (
                          <tr key={c.contact_id}>
                            <td className="font-medium text-[var(--text)] align-top whitespace-nowrap">{c.contact_name}</td>
                            <td>
                              <div className="space-y-1">
                                {c.flags.map((f, i) => (
                                  <div key={i} className="text-xs text-[var(--warning)]">⚠ {f.field}: {f.message}</div>
                                ))}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-[var(--border)] flex-shrink-0">
          <span className="text-xs text-[var(--text-4)]">
            {!result && applicableCustomers.length > 0 && `${selected.size} of ${applicableCustomers.length} selected`}
          </span>
          <div className="flex gap-2">
            <button onClick={onClose} className="via-btn via-btn-secondary">
              {result ? 'Close' : 'Cancel'}
            </button>
            {!result && applicableCustomers.length > 0 && (
              <button onClick={handleApply} disabled={applying || selected.size === 0} className="via-btn via-btn-primary">
                {applying ? 'Applying…' : `Apply Selected Fixes (${selected.size})`}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
