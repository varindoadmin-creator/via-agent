'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { CopyWAButton } from './CopyWAButton';

interface DupCustomer {
  contact_id: string;
  contact_name: string;
  company_name: string;
  email: string;
  phone: string;
  mobile: string;
  npwp: string;
  status: string;
}

interface DupGroup {
  key: string;
  reasons: string[];
  customers: DupCustomer[];
}

function reasonBadgeClass(reason: string) {
  switch (reason) {
    case 'Same NPWP': return 'via-badge-danger';
    case 'Same phone/mobile number': return 'via-badge-warning';
    case 'Same email': return 'via-badge-info';
    default: return 'via-badge-muted';
  }
}

function buildWAMessage(groups: DupGroup[]): string {
  const lines = groups.map((g, i) => {
    const names = g.customers.map((c) => c.company_name || c.contact_name).join('  ↔  ');
    return `${i + 1}. ${names}\n   (${g.reasons.join(', ')})`;
  });
  return `🔎 Possible Duplicate Customers (${groups.length} group${groups.length === 1 ? '' : 's'})\n\n${lines.join('\n\n')}\n\nPlease review and merge in Zoho Books. Thanks!`;
}

export default function CustomerDuplicatesModal({ onClose }: { onClose: () => void }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [groups, setGroups] = useState<DupGroup[] | null>(null);
  const [totalCustomers, setTotalCustomers] = useState(0);

  const runScan = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/customers/duplicates');
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Scan failed');
      setGroups(data.groups);
      setTotalCustomers(data.total_customers || 0);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { runScan(); }, [runScan]);

  const waMessage = useMemo(() => (groups ? buildWAMessage(groups) : ''), [groups]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="via-card w-[760px] mx-4 flex flex-col max-h-[90vh]" onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)] flex-shrink-0">
          <div>
            <h3 className="text-[var(--text)] font-semibold text-sm">Duplicate Customer Check</h3>
            {groups && (
              <p className="text-[var(--text-3)] text-xs mt-0.5">
                {groups.length === 0
                  ? `No likely duplicates found among ${totalCustomers} customers.`
                  : `${groups.length} possible duplicate group${groups.length === 1 ? '' : 's'} — ${groups.reduce((s, g) => s + g.customers.length, 0)} customers affected, out of ${totalCustomers} total.`}
              </p>
            )}
          </div>
          <button onClick={onClose} className="text-[var(--text-3)] hover:text-[var(--text)] text-lg transition-colors">✕</button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto flex-1 px-6 py-5">
          {loading && (
            <div className="py-16 text-center text-[var(--text-3)] text-sm">Scanning customer data for duplicates…</div>
          )}

          {error && (
            <div className="mb-4 rounded-lg p-3 text-sm" style={{ background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', color: 'var(--danger)' }}>
              {error}
            </div>
          )}

          {!loading && !error && groups && groups.length === 0 && (
            <div className="py-16 text-center text-[var(--text-3)] text-sm">✓ No likely duplicate customers found.</div>
          )}

          {!loading && !error && groups && groups.length > 0 && (
            <div className="space-y-4">
              {groups.map((g) => (
                <div key={g.key} className="via-card overflow-hidden">
                  <div className="flex items-center gap-2 px-4 py-2.5 border-b border-[var(--border)] bg-[var(--surface-2)]">
                    {g.reasons.map((r) => (
                      <span key={r} className={`via-badge border text-xs ${reasonBadgeClass(r)}`}>{r}</span>
                    ))}
                    <span className="text-[var(--text-4)] text-xs ml-auto">{g.customers.length} matching customers</span>
                  </div>
                  <div className="via-table-wrap">
                    <table className="via-table">
                      <thead>
                        <tr>
                          <th>Customer</th>
                          <th>Contact</th>
                          <th>NPWP</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {g.customers.map((c) => (
                          <tr key={c.contact_id}>
                            <td>
                              <div className="font-medium text-[var(--text)] whitespace-nowrap">{c.contact_name || '(unnamed)'}</div>
                              {c.company_name && c.company_name !== c.contact_name && (
                                <div className="text-[var(--text-4)] text-xs">{c.company_name}</div>
                              )}
                            </td>
                            <td className="text-[var(--text-3)] whitespace-nowrap">
                              {c.mobile || c.phone || c.email || '—'}
                            </td>
                            <td className="text-[var(--text-3)] whitespace-nowrap">{c.npwp || '—'}</td>
                            <td className="text-[var(--text-3)] whitespace-nowrap capitalize">{c.status || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-[var(--border)] flex-shrink-0">
          <span className="text-xs text-[var(--text-4)]">Report only — review and merge manually in Zoho Books.</span>
          <div className="flex gap-2">
            <button onClick={onClose} className="via-btn via-btn-secondary">Close</button>
            {!loading && groups && groups.length > 0 && (
              <CopyWAButton message={waMessage} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
