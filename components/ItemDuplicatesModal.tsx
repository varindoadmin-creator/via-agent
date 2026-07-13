'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { CopyWAButton } from './CopyWAButton';

interface DupItem {
  item_id: string;
  name: string;
  sku: string;
  brand: string;
  unit: string;
  status: string;
}

interface DupGroup {
  key: string;
  reasons: string[];
  items: DupItem[];
}

function reasonBadgeClass(reason: string) {
  switch (reason) {
    case 'Same SKU': return 'via-badge-danger';
    case 'Same item name': return 'via-badge-warning';
    default: return 'via-badge-muted';
  }
}

function buildWAMessage(groups: DupGroup[]): string {
  const lines = groups.map((g, i) => {
    const names = g.items.map((it) => `${it.name}${it.sku ? ` (${it.sku})` : ''}`).join('  ↔  ');
    return `${i + 1}. ${names}\n   (${g.reasons.join(', ')})`;
  });
  return `🔎 Possible Duplicate Items (${groups.length} group${groups.length === 1 ? '' : 's'})\n\n${lines.join('\n\n')}\n\nPlease review and merge in Zoho Books. Thanks!`;
}

export default function ItemDuplicatesModal({ onClose }: { onClose: () => void }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [groups, setGroups] = useState<DupGroup[] | null>(null);
  const [totalItems, setTotalItems] = useState(0);

  const runScan = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/items/duplicates');
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Scan failed');
      setGroups(data.groups);
      setTotalItems(data.total_items || 0);
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
            <h3 className="text-[var(--text)] font-semibold text-sm">Duplicate Item Check</h3>
            {groups && (
              <p className="text-[var(--text-3)] text-xs mt-0.5">
                {groups.length === 0
                  ? `No likely duplicates found among ${totalItems} items.`
                  : `${groups.length} possible duplicate group${groups.length === 1 ? '' : 's'} — ${groups.reduce((s, g) => s + g.items.length, 0)} items affected, out of ${totalItems} total.`}
              </p>
            )}
          </div>
          <button onClick={onClose} className="text-[var(--text-3)] hover:text-[var(--text)] text-lg transition-colors">✕</button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto flex-1 px-6 py-5">
          {loading && (
            <div className="py-16 text-center text-[var(--text-3)] text-sm">Scanning item data for duplicates…</div>
          )}

          {error && (
            <div className="mb-4 rounded-lg p-3 text-sm" style={{ background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', color: 'var(--danger)' }}>
              {error}
            </div>
          )}

          {!loading && !error && groups && groups.length === 0 && (
            <div className="py-16 text-center text-[var(--text-3)] text-sm">✓ No likely duplicate items found.</div>
          )}

          {!loading && !error && groups && groups.length > 0 && (
            <div className="space-y-4">
              {groups.map((g) => (
                <div key={g.key} className="via-card overflow-hidden">
                  <div className="flex items-center gap-2 px-4 py-2.5 border-b border-[var(--border)] bg-[var(--surface-2)]">
                    {g.reasons.map((r) => (
                      <span key={r} className={`via-badge border text-xs ${reasonBadgeClass(r)}`}>{r}</span>
                    ))}
                    <span className="text-[var(--text-4)] text-xs ml-auto">{g.items.length} matching items</span>
                  </div>
                  <div className="via-table-wrap">
                    <table className="via-table">
                      <thead>
                        <tr>
                          <th>Item Name</th>
                          <th>SKU</th>
                          <th>Brand</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {g.items.map((it) => (
                          <tr key={it.item_id}>
                            <td>
                              <div className="font-medium text-[var(--text)] whitespace-nowrap">{it.name || '(unnamed)'}</div>
                            </td>
                            <td className="text-[var(--text-3)] whitespace-nowrap font-mono">{it.sku || '—'}</td>
                            <td className="text-[var(--text-3)] whitespace-nowrap">{it.brand || '—'}</td>
                            <td className="text-[var(--text-3)] whitespace-nowrap capitalize">{it.status || '—'}</td>
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
