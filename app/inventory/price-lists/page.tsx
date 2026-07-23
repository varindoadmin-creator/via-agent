'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';

const TIERS = ['Bronze', 'Silver', 'Gold', 'Platinum'] as const;
type Tier = (typeof TIERS)[number];

interface PriceListItem {
  item_id: string;
  name: string;
  discount_percent: number;
  rate: number;
}

function formatRp(n: number) {
  return 'Rp ' + Number(n).toLocaleString('id-ID');
}

export default function PriceListsPage() {
  const [activeTier, setActiveTier] = useState<Tier>('Bronze');
  const [dataByTier, setDataByTier] = useState<Partial<Record<Tier, PriceListItem[]>>>({});
  const [loadingTier, setLoadingTier] = useState<Tier | null>(null);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  const fetchTier = useCallback(async (tier: Tier) => {
    setLoadingTier(tier);
    setError('');
    try {
      const res = await fetch('/api/inventory/price-lists?tier=' + tier);
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      setDataByTier(prev => ({ ...prev, [tier]: data.items }));
    } catch (e) {
      setError(String(e));
    } finally {
      setLoadingTier(null);
    }
  }, []);

  useEffect(() => {
    if (!dataByTier[activeTier]) fetchTier(activeTier);
  }, [activeTier, dataByTier, fetchTier]);

  const items = dataByTier[activeTier] || [];
  const loading = loadingTier === activeTier;

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return items.filter(i => !q || i.name.toLowerCase().includes(q));
  }, [items, search]);

  return (
    <div className="via-page" style={{ background: 'var(--bg)', minHeight: '100%' }}>
      <div style={{ maxWidth: 1280, margin: '0 auto' }}>

        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-[var(--text)] font-semibold text-2xl tracking-tight">Price Lists</h1>
          </div>
          <button onClick={() => fetchTier(activeTier)} disabled={loading}
            className="px-3 py-1.5 text-xs bg-[var(--surface-2)] hover:bg-[var(--surface-3)] text-[var(--text-3)] hover:text-[var(--text)] rounded-lg border border-[var(--border)] transition-colors disabled:opacity-50">
            {loading ? '…' : '↻'}
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-5 border-b border-[var(--border)]">
          {TIERS.map(tier => (
            <button
              key={tier}
              onClick={() => setActiveTier(tier)}
              className="px-4 py-2 text-sm font-medium transition-colors"
              style={{
                color: activeTier === tier ? 'var(--accent-text)' : 'var(--text-3)',
                borderBottom: activeTier === tier ? '2px solid var(--accent)' : '2px solid transparent',
                marginBottom: -1,
              }}
            >
              {tier}
            </button>
          ))}
        </div>

        {/* Table */}
        <div className="via-card overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
            <h2 className="text-[var(--text)] font-semibold text-sm">{activeTier} Tier</h2>
            <div className="flex items-center gap-3">
              {!loading && !error && (
                <span className="text-[var(--text-4)] text-xs" style={{ fontFamily: 'JetBrains Mono, monospace' }}>{filtered.length} items</span>
              )}
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search…" className="via-input text-xs py-1.5 px-3 w-56" />
            </div>
          </div>

          {loading && (
            <div className="p-5 space-y-2">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="flex gap-4 animate-pulse">
                  <div className="h-4 bg-[var(--surface-3)] rounded flex-1" />
                  <div className="h-4 bg-[var(--surface-3)] rounded w-20" />
                  <div className="h-4 bg-[var(--surface-3)] rounded w-28" />
                </div>
              ))}
            </div>
          )}

          {!loading && error && <div className="p-5 text-[var(--danger)] text-sm">{error}</div>}

          {!loading && !error && filtered.length === 0 && (
            <div className="flex flex-col items-center py-10">
              <div className="text-3xl mb-2 opacity-20">%</div>
              <div className="text-[var(--text-3)] text-sm">No discounted items for {activeTier}.</div>
            </div>
          )}

          {!loading && !error && filtered.length > 0 && (
            <div className="overflow-x-auto">
              <table className="via-table">
                <thead><tr>
                  <th>Item</th>
                  <th className="text-right">Discount</th>
                  <th className="text-right">Price</th>
                </tr></thead>
                <tbody>
                  {filtered.map(item => (
                    <tr key={item.item_id} className="hover:bg-[var(--surface-2)] transition-colors">
                      <td className="text-[var(--text)] text-xs font-medium max-w-[500px] truncate" title={item.name}>{item.name}</td>
                      <td className="text-right text-[var(--accent-text)] text-xs font-semibold" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                        {item.discount_percent.toFixed(2)}%
                      </td>
                      <td className="text-right text-[var(--text-2)] text-xs" style={{ fontFamily: 'JetBrains Mono, monospace' }}>{formatRp(item.rate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
