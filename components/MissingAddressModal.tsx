'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { CopyWAButton } from './CopyWAButton';

interface MissingAddressCustomer {
  contact_id: string;
  contact_name: string;
  contact_number: string;
  billing_missing: boolean;
  shipping_missing: boolean;
}

function missingLabel(c: MissingAddressCustomer): string {
  if (c.billing_missing && c.shipping_missing) return 'Billing & Shipping';
  if (c.billing_missing) return 'Billing only';
  return 'Shipping only';
}

function buildWAMessage(customers: MissingAddressCustomer[]): string {
  const lines = customers.map((c, i) => {
    const num = c.contact_number ? ` (${c.contact_number})` : '';
    return `${i + 1}. ${c.contact_name}${num} — ${missingLabel(c)}`;
  });
  return `📋 Customers Missing Address (${customers.length})\n\n${lines.join('\n')}\n\nPlease fill these in via Zoho Books. Thanks!`;
}

export default function MissingAddressModal({ onClose }: { onClose: () => void }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [customers, setCustomers] = useState<MissingAddressCustomer[] | null>(null);

  const runScan = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/customers/missing-address');
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Scan failed');
      setCustomers(data.customers);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { runScan(); }, [runScan]);

  const waMessage = useMemo(() => (customers ? buildWAMessage(customers) : ''), [customers]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="via-card w-[700px] mx-4 flex flex-col max-h-[90vh]" onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)] flex-shrink-0">
          <div>
            <h3 className="text-[var(--text)] font-semibold text-sm">Missing Address Report</h3>
            {customers && (
              <p className="text-[var(--text-3)] text-xs mt-0.5">
                {customers.length} customer{customers.length === 1 ? '' : 's'} missing Billing and/or Shipping address
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

          {!loading && !error && customers && customers.length === 0 && (
            <div className="py-16 text-center text-[var(--text-3)] text-sm">✓ Every customer has a Billing and Shipping address on file.</div>
          )}

          {!loading && !error && customers && customers.length > 0 && (
            <div className="via-table-wrap via-card">
              <table className="via-table">
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th>Customer #</th>
                    <th>Missing</th>
                  </tr>
                </thead>
                <tbody>
                  {customers.map((c) => (
                    <tr key={c.contact_id}>
                      <td className="font-medium text-[var(--text)] whitespace-nowrap">{c.contact_name}</td>
                      <td className="text-[var(--text-3)] whitespace-nowrap">{c.contact_number || '—'}</td>
                      <td className="text-[var(--warning)]">{missingLabel(c)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-[var(--border)] flex-shrink-0">
          <span className="text-xs text-[var(--text-4)]" />
          <div className="flex gap-2">
            <button onClick={onClose} className="via-btn via-btn-secondary">Close</button>
            {!loading && customers && customers.length > 0 && (
              <CopyWAButton message={waMessage} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
