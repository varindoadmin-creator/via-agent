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
  const [ignoredCount, setIgnoredCount] = useState(0);
  const [selectedGroups, setSelectedGroups] = useState<Set<string>>(new Set());
  const [keepByGroup, setKeepByGroup] = useState<Record<string, string>>({});
  const [acting, setActing] = useState('');

  const runScan = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/customers/duplicates');
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Scan failed');
      setGroups(data.groups);
      setTotalCustomers(data.total_customers || 0);
      setIgnoredCount(data.ignored_group_count || 0);
      setSelectedGroups(new Set());
      setKeepByGroup({});
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { runScan(); }, [runScan]);

  const waMessage = useMemo(() => (groups ? buildWAMessage(groups) : ''), [groups]);

  async function performAction(payload: Record<string, unknown>, actionKey: string) {
    setActing(actionKey); setError('');
    try {
      const res = await fetch('/api/customers/duplicates', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) throw new Error(`Server returned ${res.status} instead of JSON.`);
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Action failed');
      await runScan();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setActing(''); }
  }

  async function ignoreSelected() {
    if (!groups || !selectedGroups.size) return;
    for (const group of groups.filter(candidate => selectedGroups.has(candidate.key))) {
      await performAction({ action: 'ignore', contact_ids: group.customers.map(customer => customer.contact_id) }, `ignore:${group.key}`);
    }
  }

  async function mergeGroup(group: DupGroup) {
    const keepId = keepByGroup[group.key];
    const keep = group.customers.find(customer => customer.contact_id === keepId);
    if (!keep) { setError('Select the customer record that Zoho should keep.'); return; }
    const removed = group.customers.filter(customer => customer.contact_id !== keepId).map(customer => customer.company_name || customer.contact_name).join(', ');
    const ok = window.confirm(`Merge this group in Zoho Books?\n\nKEEP: ${keep.company_name || keep.contact_name}\nMERGE AND REMOVE: ${removed}\n\nTransactions and balances will be consolidated by Zoho. This cannot be undone.`);
    if (!ok) return;
    await performAction({ action: 'merge', contact_ids: group.customers.map(customer => customer.contact_id), keep_contact_id: keepId, confirmation: `MERGE ${keepId}` }, `merge:${group.key}`);
  }

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
            {ignoredCount > 0 && <p className="text-[var(--text-4)] text-[11px] mt-0.5">{ignoredCount} known false-positive group{ignoredCount === 1 ? '' : 's'} hidden.</p>}
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
                    <input type="checkbox" aria-label={`Select duplicate group ${g.key}`} checked={selectedGroups.has(g.key)} onChange={event => setSelectedGroups(previous => { const next = new Set(previous); if (event.target.checked) next.add(g.key); else next.delete(g.key); return next; })}/>
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
                          <th>Keep</th>
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
                            <td><input type="radio" name={`keep-${g.key}`} aria-label={`Keep ${c.company_name || c.contact_name}`} checked={keepByGroup[g.key] === c.contact_id} onChange={() => setKeepByGroup(previous => ({ ...previous, [g.key]: c.contact_id }))}/></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex items-center justify-between gap-3 border-t border-[var(--border)] px-4 py-3">
                    <span className="text-[11px] text-[var(--text-4)]">Choose the record Zoho should keep. The other duplicate record(s) will be merged and removed.</span>
                    <button disabled={acting !== '' || !keepByGroup[g.key]} onClick={() => mergeGroup(g)} className="via-btn via-btn-primary !text-xs disabled:opacity-40">{acting === `merge:${g.key}` ? 'Merging…' : 'Merge in Zoho'}</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-[var(--border)] flex-shrink-0">
          <span className="text-xs text-[var(--text-4)]">Ignored groups are saved in Supabase and excluded from future checks.</span>
          <div className="flex gap-2">
            <button onClick={ignoreSelected} disabled={!selectedGroups.size || acting !== ''} className="via-btn via-btn-secondary disabled:opacity-40">{acting.startsWith('ignore:') ? 'Saving…' : `Ignore selected${selectedGroups.size ? ` (${selectedGroups.size})` : ''}`}</button>
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
