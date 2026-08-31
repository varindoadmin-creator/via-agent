'use client';

import { useState } from 'react';

interface ProductDiagnostic {
  zohoItemId: string;
  itemName: string;
  canonicalCode: string;
  sku: string | null;
  brand: string | null;
  pricingGroup: 'STANDARD' | 'EDL_SPECIAL' | 'LAMITAK_SPECIAL';
  activeStatus: 'active' | 'inactive';
  metadataSource: string;
  enrichmentStatus: string;
}

const PRICING_GROUP_STYLE: Record<string, string> = {
  STANDARD: 'bg-slate-100 text-slate-600',
  EDL_SPECIAL: 'bg-amber-100 text-amber-700',
  LAMITAK_SPECIAL: 'bg-blue-100 text-blue-700',
};

export default function ProductSourcePage() {
  const [query, setQuery] = useState('');
  const [products, setProducts] = useState<ProductDiagnostic[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [searched, setSearched] = useState(false);

  async function runSearch() {
    if (!query.trim()) return;
    setLoading(true); setError('');
    try {
      const response = await fetch(`/api/inventory/products?q=${encodeURIComponent(query.trim())}`);
      const body = await response.json();
      if (!response.ok || !body.success) throw new Error(body.error || 'Search failed.');
      setProducts(body.products);
      setSearched(true);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setLoading(false); }
  }

  return (
    <div className="via-page" style={{ background: 'var(--bg)', minHeight: '100%' }}>
      <div style={{ maxWidth: 1280, margin: '0 auto' }}>
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-[var(--text)] font-semibold text-2xl tracking-tight">Product Source</h1>
            <p className="text-[var(--text-4)] text-xs mt-1">Field-level ownership diagnostic — Zoho Books Items is the canonical product master.</p>
          </div>
        </div>

        <div className="via-card overflow-hidden">
          <div className="flex items-center gap-3 px-5 py-4 border-b border-[var(--border)]">
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && runSearch()}
              placeholder="Search by item code or name…"
              className="via-input text-sm py-2 px-3 flex-1"
            />
            <button onClick={runSearch} disabled={loading || !query.trim()}
              className="px-4 py-2 text-sm font-medium bg-[#6161ff] text-white rounded-lg disabled:opacity-50">
              {loading ? 'Searching…' : 'Search'}
            </button>
          </div>

          {error && <div className="p-5 text-[var(--danger)] text-sm">{error}</div>}

          {!error && searched && products.length === 0 && (
            <div className="flex flex-col items-center py-10">
              <div className="text-[var(--text-3)] text-sm">No matching Zoho item found.</div>
            </div>
          )}

          {!error && products.length > 0 && (
            <div className="overflow-x-auto">
              <table className="via-table">
                <thead><tr>
                  <th>Product</th><th>Zoho Item ID</th><th>Canonical Code</th><th>Brand</th>
                  <th>Pricing Group</th><th>Active Status</th><th>Metadata Source</th><th>Enrichment</th>
                </tr></thead>
                <tbody>
                  {products.map(p => (
                    <tr key={p.zohoItemId} className="hover:bg-[var(--surface-2)] transition-colors">
                      <td className="text-[var(--text)] text-xs font-medium max-w-[300px] truncate" title={p.itemName}>{p.itemName}</td>
                      <td className="text-[var(--text-3)] text-xs" style={{ fontFamily: 'JetBrains Mono, monospace' }}>{p.zohoItemId}</td>
                      <td className="text-[var(--text-2)] text-xs" style={{ fontFamily: 'JetBrains Mono, monospace' }}>{p.canonicalCode}</td>
                      <td className="text-[var(--text-2)] text-xs">{p.brand || '—'}</td>
                      <td><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${PRICING_GROUP_STYLE[p.pricingGroup]}`}>{p.pricingGroup}</span></td>
                      <td><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${p.activeStatus === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>{p.activeStatus}</span></td>
                      <td className="text-[var(--text-3)] text-xs">{p.metadataSource}</td>
                      <td className="text-[var(--text-3)] text-xs">{p.enrichmentStatus}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {!searched && !error && (
            <div className="flex flex-col items-center py-10">
              <div className="text-[var(--text-3)] text-sm">Search for a product to see its full source-of-truth breakdown.</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
