'use client';
import { CopyWAButton } from '@/components/CopyWAButton';

import { useState, useEffect, useCallback, useMemo } from 'react';

interface CatalogueRequest {
  id: string;
  timestamp: string;
  name: string;
  address: string;
  phone: string;
  status: string;
  notes: string;
}

type SortKey = 'timestamp' | 'name' | 'status';
type SortDir = 'asc' | 'desc';

function buildCatalogueWAMessage(req: { name: string; address?: string; phone?: string }): string {
  const lines = [
    `*Catalogue Requests*`,
    ``,
    `Name: ${req.name}`,
    `Address: ${req.address || '—'}`,
    `Phone: ${req.phone || '—'}`,
  ];
  return lines.join('\n');
}

const STATUS_OPTIONS = ['New', 'Sent', 'Done'];
const STATUS_STYLE: Record<string, string> = {
  'New':  'bg-[var(--info-bg)] text-[var(--info)] border-[var(--info-border)]',
  'Sent': 'bg-[var(--warning-bg)] text-[var(--warning)] border-[var(--warning-border)]',
  'Done': 'bg-[var(--success-bg)] text-[var(--success)] border-[var(--success-border)]',
};

const mono = { fontFamily: 'JetBrains Mono, monospace' };

function agingDays(ts: string): number {
  const match = ts.match(/(\d+)\/(\d+)\/(\d+)/);
  if (!match) return 0;
  const d = new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
  return Math.floor((Date.now() - d.getTime()) / 86400000);
}

function SortBtn({ label, k, sort, onSort }: { label: string; k: SortKey; sort: { key: SortKey; dir: SortDir }; onSort: (k: SortKey) => void }) {
  const active = sort.key === k;
  return (
    <span style={{ cursor: 'pointer', userSelect: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }} onClick={() => onSort(k)}>
      {label}
      <span style={{ fontSize: 9, color: active ? 'var(--accent)' : 'var(--border)' }}>
        {active ? (sort.dir === 'desc' ? '▼' : '▲') : '⇅'}
      </span>
    </span>
  );
}

function CatRow({ req, onStatusChange, savingId }: {
  req: CatalogueRequest;
  onStatusChange: (id: string, status: string) => void;
  savingId: string | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const days = agingDays(req.timestamp);
  const ageColor = days >= 7 ? 'var(--danger)' : days >= 3 ? 'var(--warning)' : 'var(--text-4)';

  return (
    <>
      <tr className="hover:bg-[var(--surface-2)] transition-colors cursor-pointer"
        style={{ borderBottom: expanded ? 'none' : '1px solid var(--border-muted)' }}
        onClick={() => setExpanded(e => !e)}>
        <td className="px-3 py-2.5 text-center text-[var(--text-4)] text-xs w-8 select-none">{expanded ? '▾' : '▸'}</td>
        <td className="px-3 py-2.5 text-xs text-[var(--text-3)]">{req.timestamp.replace(',', '')}</td>
        <td className="px-3 py-2.5">
          <div className="text-xs font-medium text-[var(--text)] max-w-[180px] truncate" title={req.name}>{req.name}</div>
          {req.phone && <div className="text-xs text-[var(--text-4)]" style={mono}>{req.phone}</div>}
        </td>
        <td className="px-3 py-2.5 text-xs text-[var(--text-3)] max-w-[180px] truncate" title={req.address}>{req.address || '—'}</td>
        <td className="px-3 py-2.5">
          <span style={{ ...mono, fontSize: 11, fontWeight: 600, color: ageColor }}>{days}d ago</span>
        </td>
        <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
          <select value={req.status || 'New'}
            onChange={e => onStatusChange(req.id, e.target.value)}
            disabled={savingId === req.id}
            className="via-input text-xs py-1 px-2 w-full" style={{ minWidth: 90 }}>
            {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </td>
      </tr>
      {expanded && (
        <tr style={{ borderBottom: '1px solid var(--border)' }}>
          <td colSpan={6} className="p-0">
            <div className="bg-[var(--surface-2)] px-6 py-4 flex items-start gap-8">
              <div>
                <div className="text-[var(--text-4)] text-xs uppercase tracking-wider mb-2" style={mono}>Contact</div>
                <div className="space-y-1.5">
                  {[['Name', req.name], ['Phone', req.phone], ['Address', req.address]].map(([l, v]) => (
                    <div key={l} className="flex gap-2 text-xs">
                      <span className="text-[var(--text-4)] w-16">{l}</span>
                      <span className="text-[var(--text-2)]" style={l === 'Phone' ? mono : {}}>{v || '—'}</span>
                    </div>
                  ))}
                </div>
                {req.phone && (
                  <div className="mt-3 flex items-center gap-2 flex-wrap">
                    <a href={'https://wa.me/62' + req.phone.replace(/^0/, '').replace(/[^0-9]/g, '')}
                      target="_blank" rel="noreferrer"
                      className="inline-flex items-center gap-2 px-3 py-1.5 text-xs bg-[var(--success-bg)] text-[var(--success)] border border-[var(--success-border)] rounded-lg hover:opacity-80 transition-opacity"
                      onClick={e => e.stopPropagation()}>
                      💬 WhatsApp
                    </a>
                    <CopyWAButton message={buildCatalogueWAMessage({ name: req.name, address: req.address, phone: req.phone })} />
                  </div>
                )}
              </div>
              <div className="flex-1">
                <div className="text-[var(--text-4)] text-xs uppercase tracking-wider mb-2" style={mono}>Catalogue Request</div>
                <div className="text-[var(--text-3)] text-xs">
                  Requesting Varindo product catalogue. Deliver to: <span className="text-[var(--text)]">{req.address || 'Address not provided'}</span>
                </div>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export default function CatalogueRequestsPage() {
  const [requests, setRequests] = useState<CatalogueRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: 'timestamp', dir: 'desc' });
  const [savingId, setSavingId] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await fetch('/api/requests/catalogues');
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      setRequests(data.requests || []);
      setLastRefreshed(new Date().toLocaleTimeString('id-ID'));
    } catch (e) { setError(String(e)); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  function handleSort(key: SortKey) {
    setSort(prev => ({ key, dir: prev.key === key && prev.dir === 'desc' ? 'asc' : 'desc' }));
  }

  async function handleStatusChange(id: string, status: string) {
    setSavingId(id);
    try {
      const res = await fetch('/api/requests/catalogues', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      setRequests(prev => prev.map(r => r.id === id ? { ...r, status } : r));
    } catch (e) { setError('Failed to update: ' + String(e)); }
    finally { setSavingId(null); }
  }

  const filtered = useMemo(() => {
    let result = requests;
    if (filterStatus !== 'all') result = result.filter(r => (r.status || 'New') === filterStatus);
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(r => r.name.toLowerCase().includes(q) || r.phone.includes(q) || r.address.toLowerCase().includes(q));
    }
    return [...result].sort((a, b) => {
      const av = String(a[sort.key]); const bv = String(b[sort.key]);
      return sort.dir === 'desc' ? bv.localeCompare(av) : av.localeCompare(bv);
    });
  }, [requests, search, filterStatus, sort]);

  const statusCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const r of requests) c[r.status || 'New'] = (c[r.status || 'New'] || 0) + 1;
    return c;
  }, [requests]);

  const thStyle: React.CSSProperties = {
    padding: '8px 12px', textAlign: 'left', color: 'var(--text-3)', fontWeight: 500,
    fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em',
    background: 'var(--surface-2)', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap',
  };

  return (
    <div className="via-page" style={{ background: 'var(--bg)', minHeight: '100%' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <div className="flex items-start justify-between mb-5">
          <div>
            <h1 className="text-[var(--text)] font-semibold text-2xl tracking-tight">Catalogue Requests</h1>
            <p className="text-[var(--text-3)] text-sm mt-1">Requests from varindo.co.id — send Varindo product catalogue to customer.</p>
          </div>
          <div className="flex items-center gap-3">
            {lastRefreshed && <span className="text-[var(--text-4)] text-xs" style={mono}>Updated {lastRefreshed}</span>}
            <button onClick={fetchData} disabled={loading}
              className="px-3 py-1.5 text-xs bg-[var(--surface-2)] hover:bg-[var(--surface-3)] text-[var(--text-3)] hover:text-[var(--text)] rounded-lg border border-[var(--border)] transition-colors disabled:opacity-50">
              {loading ? '…' : '↻ Refresh'}
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mb-5">
          <button onClick={() => setFilterStatus('all')}
            className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${filterStatus === 'all' ? 'bg-[var(--accent)] text-white border-[var(--accent)]' : 'bg-[var(--surface-2)] text-[var(--text-3)] border-[var(--border)] hover:bg-[var(--surface-3)]'}`}>
            All ({requests.length})
          </button>
          {STATUS_OPTIONS.map(s => {
            const count = statusCounts[s] || 0;
            if (!count) return null;
            return (
              <button key={s} onClick={() => setFilterStatus(s)}
                className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${filterStatus === s ? 'bg-[var(--accent)] text-white border-[var(--accent)]' : 'bg-[var(--surface-2)] text-[var(--text-3)] border-[var(--border)] hover:bg-[var(--surface-3)]'}`}>
                {s} ({count})
              </button>
            );
          })}
        </div>

        {error && <div className="mb-4 p-3 bg-[var(--danger-bg)] border border-[var(--danger-border)] rounded-lg text-[var(--danger)] text-sm">{error}</div>}

        <div className="mb-4">
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search name, phone, address…"
            className="via-input text-xs py-1.5 px-3 w-64" />
        </div>

        <div className="via-card overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--border)]">
            <span className="text-[var(--text-3)] text-xs">{filtered.length} requests</span>
          </div>
          {loading && (
            <div className="p-5 space-y-2">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="flex gap-4 animate-pulse">
                  <div className="h-4 bg-[var(--surface-3)] rounded w-32" />
                  <div className="h-4 bg-[var(--surface-3)] rounded flex-1" />
                  <div className="h-4 bg-[var(--surface-3)] rounded w-20" />
                </div>
              ))}
            </div>
          )}
          {!loading && filtered.length === 0 && (
            <div className="flex flex-col items-center py-12">
              <div className="text-3xl mb-2 opacity-20">📖</div>
              <div className="text-[var(--text-3)] text-sm">No catalogue requests found.</div>
            </div>
          )}
          {!loading && filtered.length > 0 && (
            <div className="overflow-x-auto">
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr>
                    <th style={{ ...thStyle, width: 32 }}></th>
                    <th style={thStyle}><SortBtn label="Timestamp" k="timestamp" sort={sort} onSort={handleSort} /></th>
                    <th style={thStyle}><SortBtn label="Name / Company" k="name" sort={sort} onSort={handleSort} /></th>
                    <th style={thStyle}>Delivery Address</th>
                    <th style={thStyle}>Age</th>
                    <th style={thStyle}><SortBtn label="Status" k="status" sort={sort} onSort={handleSort} /></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(req => (
                    <CatRow key={req.id} req={req} onStatusChange={handleStatusChange} savingId={savingId} />
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
