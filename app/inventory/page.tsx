'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';

const BRANDS = ['All Brands', 'AICA', 'AIDI', 'CARTA', 'ECO', 'EDL', 'LAMITAK', 'TACO'];
const LOCATIONS = ['HEAD OFFICE', 'HUB-BDG', 'HUB-MDN'] as const;
type Location = typeof LOCATIONS[number];

const LOCATION_META: Record<Location, { label: string; city: string; color: string; border: string }> = {
  'HEAD OFFICE': { label: 'Head Office',  city: 'Tangerang',  color: 'text-[var(--accent)]',   border: 'border-blue-900/50' },
  'HUB-BDG':    { label: 'Hub Bandung',   city: 'Bandung',    color: 'text-[var(--info)]',    border: 'border-[var(--border)]' },
  'HUB-MDN':    { label: 'Hub Medan',     city: 'Medan',      color: 'text-[var(--success)]', border: 'border-[var(--border)]' },
};

type SortField = 'item_code' | 'item_name' | 'brand' | 'stock_on_hand' | 'committed_stock' | 'available_for_sale';
type SortDir = 'asc' | 'desc';

interface InventoryItem {
  item_id: string;
  item_name: string;
  item_code: string;
  brand: string;
  sku: string;
  unit: string;
  location_name: string;
  stock_on_hand: number;
  committed_stock: number;
  available_for_sale: number;
}

interface LocationSort { field: SortField; dir: SortDir; }

function formatNum(n: number) { return n.toLocaleString('id-ID'); }

function SortIcon({ field, sort }: { field: SortField; sort: LocationSort }) {
  if (sort.field !== field) return <span className="text-gray-700 ml-1">↕</span>;
  return <span className="text-[var(--accent)] ml-1">{sort.dir === 'asc' ? '↑' : '↓'}</span>;
}

function LocationTable({
  location, items, loading,
}: {
  location: Location;
  items: InventoryItem[];
  loading: boolean;
}) {
  const meta = LOCATION_META[location];
  const [sort, setSort] = useState<LocationSort>({ field: 'brand', dir: 'asc' });

  function toggleSort(field: SortField) {
    setSort(prev => ({
      field,
      dir: prev.field === field && prev.dir === 'asc' ? 'desc' : 'asc',
    }));
  }

  const sorted = useMemo(() => {
    return [...items].sort((a, b) => {
      const av = a[sort.field];
      const bv = b[sort.field];
      const cmp = typeof av === 'number'
        ? (av as number) - (bv as number)
        : String(av).localeCompare(String(bv));
      return sort.dir === 'asc' ? cmp : -cmp;
    });
  }, [items, sort]);

  const totals = useMemo(() => ({
    stock: items.reduce((s, i) => s + i.stock_on_hand, 0),
    committed: items.reduce((s, i) => s + i.committed_stock, 0),
    available: items.reduce((s, i) => s + i.available_for_sale, 0),
  }), [items]);

  const thClass = "px-3 py-2.5 text-left text-xs font-medium tracking-wider uppercase cursor-pointer select-none whitespace-nowrap hover:text-[var(--text-2)] transition-colors";
  const tdClass = "px-3 py-2.5 text-sm";

  return (
    <div className={`rounded-xl border ${meta.border}  overflow-hidden`}>
      {/* Table header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
        <div className="flex items-center gap-3">
          <div className={`text-xs font-bold tracking-widest uppercase ${meta.color}`}
            style={{ fontFamily: "'DM Mono', monospace" }}>
            {location}
          </div>
          <div className="text-[var(--text-4)] text-xs">{meta.city}</div>
          {!loading && (
            <div className="text-xs px-2 py-0.5 rounded-full  text-[var(--text-3)]">
              {items.length} items
            </div>
          )}
        </div>
        {!loading && items.length > 0 && (
          <div className="flex items-center gap-4 text-xs text-[var(--text-4)]" style={{ fontFamily: "'DM Mono', monospace" }}>
            <span>SOH: <span className="text-[var(--text-2)]">{formatNum(totals.stock)}</span></span>
            <span>Committed: <span className="text-[var(--warning)]/80">{formatNum(totals.committed)}</span></span>
            <span>Available: <span className="text-[var(--success)]/80">{formatNum(totals.available)}</span></span>
          </div>
        )}
      </div>

      {/* Loading skeleton */}
      {loading && (
        <div className="p-4 space-y-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex gap-4 animate-pulse">
              <div className="h-4  rounded w-24" />
              <div className="h-4  rounded flex-1" />
              <div className="h-4  rounded w-16" />
              <div className="h-4  rounded w-16" />
              <div className="h-4  rounded w-16" />
              <div className="h-4  rounded w-16" />
            </div>
          ))}
        </div>
      )}

      {/* Empty */}
      {!loading && items.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="text-2xl mb-2 opacity-20">▣</div>
          <div className="text-[var(--text-4)] text-sm">No available inventory for this location.</div>
        </div>
      )}

      {/* Table */}
      {!loading && items.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="">
              <tr className="text-[var(--text-4)] border-b border-[var(--border)]">
                <th className={thClass} onClick={() => toggleSort('item_code')}>
                  Item Code <SortIcon field="item_code" sort={sort} />
                </th>
                <th className={thClass} onClick={() => toggleSort('item_name')}>
                  Item Name <SortIcon field="item_name" sort={sort} />
                </th>
                <th className={thClass} onClick={() => toggleSort('brand')}>
                  Brand <SortIcon field="brand" sort={sort} />
                </th>
                <th className={`${thClass} text-right`} onClick={() => toggleSort('stock_on_hand')}>
                  Stock on Hand <SortIcon field="stock_on_hand" sort={sort} />
                </th>
                <th className={`${thClass} text-right`} onClick={() => toggleSort('committed_stock')}>
                  Committed <SortIcon field="committed_stock" sort={sort} />
                </th>
                <th className={`${thClass} text-right`} onClick={() => toggleSort('available_for_sale')}>
                  Available for Sale <SortIcon field="available_for_sale" sort={sort} />
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-muted)]">
              {sorted.map((item, idx) => (
                <tr key={`${item.item_id}-${idx}`}
                  className="hover:/30 transition-colors group">
                  <td className={`${tdClass} font-mono text-[var(--accent)] text-xs`}>{item.item_code}</td>
                  <td className={`${tdClass} text-[var(--text-2)] max-w-xs`}>
                    <div className="truncate" title={item.item_name}>{item.item_name}</div>
                  </td>
                  <td className={tdClass}>
                    <span className="text-xs px-1.5 py-0.5 rounded  text-[var(--text-3)] font-mono">
                      {item.brand}
                    </span>
                  </td>
                  <td className={`${tdClass} text-right font-mono text-[var(--text-2)]`}>
                    {formatNum(item.stock_on_hand)}
                    <span className="text-[var(--text-4)] text-xs ml-1">{item.unit}</span>
                  </td>
                  <td className={`${tdClass} text-right font-mono ${item.committed_stock > 0 ? 'text-[var(--warning)]/80' : 'text-[var(--text-4)]'}`}>
                    {formatNum(item.committed_stock)}
                  </td>
                  <td className={`${tdClass} text-right font-mono ${item.available_for_sale > 0 ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>
                    {formatNum(item.available_for_sale)}
                  </td>
                </tr>
              ))}
            </tbody>
            {/* Totals footer */}
            <tfoot className="border-t border-[var(--border)] ">
              <tr className="text-xs font-medium">
                <td className="px-3 py-2.5 text-[var(--text-4)] font-mono" colSpan={3}>TOTAL</td>
                <td className="px-3 py-2.5 text-right font-mono text-[var(--text-2)]">{formatNum(totals.stock)}</td>
                <td className="px-3 py-2.5 text-right font-mono text-[var(--warning)]/80">{formatNum(totals.committed)}</td>
                <td className="px-3 py-2.5 text-right font-mono text-[var(--success)]">{formatNum(totals.available)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

export default function InventoryPage() {
  const [brand, setBrand] = useState('All Brands');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [byLocation, setByLocation] = useState<Record<string, InventoryItem[]>>({
    'HEAD OFFICE': [], 'HUB-BDG': [], 'HUB-MDN': [],
  });
  const [error, setError] = useState('');
  const [totalItems, setTotalItems] = useState(0);
  const [lastFetched, setLastFetched] = useState('');

  const cache = useRef<Map<string, { data: Record<string, InventoryItem[]>; total: number; time: string }>>(new Map());

  const fetchInventory = useCallback(async (b: string, s: string, force = false) => {
    const cacheKey = `${b}::${s}`;
    if (!force && cache.current.has(cacheKey)) {
      const cached = cache.current.get(cacheKey)!;
      setByLocation(cached.data);
      setTotalItems(cached.total);
      setLastFetched(cached.time + ' (cached)');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (b !== 'All Brands') params.set('brand', b);
      if (s.trim()) params.set('search', s.trim());
      const res = await fetch(`/api/inventory?${params}`);
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      const time = new Date().toLocaleTimeString('id-ID');
      cache.current.set(cacheKey, { data: data.by_location, total: data.total_items, time });
      setByLocation(data.by_location);
      setTotalItems(data.total_items);
      setLastFetched(time);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchInventory('All Brands', ''); }, [fetchInventory]);

  function handleBrandChange(b: string) {
    setBrand(b);
    fetchInventory(b, search);
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setSearch(searchInput);
    fetchInventory(brand, searchInput);
  }

  function handleClearSearch() {
    setSearchInput('');
    setSearch('');
    fetchInventory(brand, '');
  }

  return (
    <div className=" text-[var(--text)] p-6 pb-24 min-h-full"
      style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <div className="max-w-7xl mx-auto">

        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold text-[var(--text)] tracking-tight">Inventory</h1>
            <p className="text-[var(--text-4)] text-sm mt-1">
              Stock on hand, committed stock, and available-for-sale by location.
            </p>
          </div>
          <div className="flex items-center gap-3">
            {lastFetched && (
              <span className="text-[var(--text-4)] text-xs" style={{ fontFamily: "'DM Mono', monospace" }}>
                Updated {lastFetched}
              </span>
            )}
            <button onClick={() => fetchInventory(brand, search, true)} disabled={loading}
              className="px-3 py-1.5 text-xs  hover:bg-[#222840] text-[var(--text-3)] hover:text-[var(--text-2)] rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1.5">
              <span className={loading ? 'animate-spin inline-block' : ''}>↻</span>
              Refresh
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 mb-6 flex-wrap">
          {/* Brand filter */}
          <div className="flex items-center gap-2">
            <span className="text-[var(--text-4)] text-xs uppercase tracking-wider"
              style={{ fontFamily: "'DM Mono', monospace" }}>Brand</span>
            <div className="flex items-center gap-1  border border-[var(--border)] rounded-lg p-1">
              {BRANDS.map(b => (
                <button key={b} onClick={() => handleBrandChange(b)}
                  className={`px-3 py-1 text-xs rounded-md transition-all font-medium
                    ${brand === b
                      ? ' text-[var(--text)] shadow-sm'
                      : 'text-[var(--text-4)] hover:text-[var(--text-2)]'
                    }`}>
                  {b === 'All Brands' ? 'All' : b}
                </button>
              ))}
            </div>
          </div>

          {/* Search */}
          <form onSubmit={handleSearch} className="flex items-center gap-2 ml-auto">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-4)] text-xs">⌕</span>
              <input
                type="text"
                value={searchInput}
                onChange={e => setSearchInput(e.target.value)}
                placeholder="Search item code, name, brand…"
                className="pl-8 pr-8 py-1.5 text-sm  border border-[var(--border)] rounded-lg text-[var(--text)] placeholder-gray-600 focus:outline-none focus:border-[var(--accent)] w-64"
                style={{ fontFamily: "'DM Mono', monospace", fontSize: '12px' }}
              />
              {searchInput && (
                <button type="button" onClick={handleClearSearch}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-4)] hover:text-[var(--text-3)] text-xs">✕</button>
              )}
            </div>
            <button type="submit"
              className="px-3 py-1.5 text-xs bg-[var(--accent-hover)] hover:bg-[var(--accent)] text-[var(--text)] rounded-lg transition-colors">
              Search
            </button>
          </form>
        </div>

        {/* Summary strip */}
        {!loading && totalItems > 0 && (
          <div className="flex items-center gap-6 mb-5 px-1">
            <span className="text-[var(--text-4)] text-xs" style={{ fontFamily: "'DM Mono', monospace" }}>
              {totalItems} items with stock
              {brand !== 'All Brands' && <span className="text-[var(--accent)] ml-2">· {brand}</span>}
              {search && <span className="text-[var(--warning)] ml-2">· "{search}"</span>}
            </span>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="mb-5 p-3 bg-[var(--danger-bg)] border border-red-900/50 rounded-lg text-[var(--danger)] text-sm">
            {error}
          </div>
        )}

        {/* Location Tables */}
        <div className="space-y-5">
          {LOCATIONS.map(loc => (
            <LocationTable
              key={loc}
              location={loc}
              items={byLocation[loc] || []}
              loading={loading}
            />
          ))}
        </div>

      </div>
    </div>
  );
}
