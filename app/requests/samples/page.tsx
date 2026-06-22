'use client';
import { CopyWAButton } from '@/components/CopyWAButton';

import { useState, useEffect, useCallback, useMemo } from 'react';

interface SampleRequest {
  id: string;
  timestamp: string;
  name: string;
  address: string;
  phone: string;
  samples: string[];
  total_samples: number;
  status: string;
  notes: string;
}

type SortKey = 'timestamp' | 'name' | 'total_samples' | 'status';
type SortDir = 'asc' | 'desc';

const STATUS_OPTIONS = ['New', 'Requested to Vendor', 'Delivered by Courier', 'Sent to Customer'];

const STATUS_STYLE: Record<string, string> = {
  'New':                    'bg-[var(--info-bg)] text-[var(--info)] border-[var(--info-border)]',
  'Requested to Vendor':    'bg-[var(--warning-bg)] text-[var(--warning)] border-[var(--warning-border)]',
  'Delivered by Courier':   'bg-[var(--accent-light)] text-[var(--accent-text)] border-[var(--accent-border)]',
  'Sent to Customer':       'bg-[var(--success-bg)] text-[var(--success)] border-[var(--success-border)]',
};

const mono = { fontFamily: 'JetBrains Mono, monospace' };

function formatTs(ts: string) { return ts.replace(',', ''); }

function buildSampleWAMessage(req: SampleRequest): string {
  const lines = [
    `*Sample Requests*`,
    ``,
    `Name: ${req.name}`,
    `Address: ${req.address || '—'}`,
    `Phone: ${req.phone || '—'}`,
    `Samples:`,
    ...req.samples.map((s, i) => `${i + 1}. ${s}`),
  ];
  return lines.join('\n');
}

function agingDays(ts: string): number {
  const match = ts.match(/(\d+)\/(\d+)\/(\d+)/);
  if (!match) return 0;
  const d = new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
  return Math.floor((Date.now() - d.getTime()) / 86400000);
}

function AgingBadge({ ts }: { ts: string }) {
  const days = agingDays(ts);
  const color = days >= 7 ? 'var(--danger)' : days >= 3 ? 'var(--warning)' : 'var(--text-4)';
  return <span style={{ ...mono, fontSize: 11, fontWeight: 600, color }}>{days}d ago</span>;
}

function SortBtn({ label, k, sort, onSort }: { label: string; k: SortKey; sort: { key: SortKey; dir: SortDir }; onSort: (k: SortKey) => void }) {
  const active = sort.key === k;
  return (
    <span style={{ cursor: 'pointer', userSelect: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}
      onClick={() => onSort(k)}>
      {label}
      <span style={{ fontSize: 9, color: active ? 'var(--accent)' : 'var(--border)' }}>
        {active ? (sort.dir === 'desc' ? '▼' : '▲') : '⇅'}
      </span>
    </span>
  );
}

function SampleRow({ req, onStatusChange, savingId }: {
  req: SampleRequest;
  onStatusChange: (id: string, status: string) => void;
  savingId: string | null;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <tr className="hover:bg-[var(--surface-2)] transition-colors cursor-pointer"
        style={{ borderBottom: expanded ? 'none' : '1px solid var(--border-muted)' }}
        onClick={() => setExpanded(e => !e)}>
        <td className="px-3 py-2.5 text-center text-[var(--text-4)] text-xs w-8 select-none">{expanded ? '▾' : '▸'}</td>
        <td className="px-3 py-2.5 text-xs text-[var(--text-3)]">{formatTs(req.timestamp)}</td>
        <td className="px-3 py-2.5">
          <div className="text-xs font-medium text-[var(--text)] max-w-[160px] truncate" title={req.name}>{req.name}</div>
          {req.phone && <div className="text-xs text-[var(--text-4)]" style={mono}>{req.phone}</div>}
        </td>
        <td className="px-3 py-2.5 text-xs text-[var(--text-3)] max-w-[150px] truncate" title={req.address}>{req.address || '—'}</td>
        <td className="px-3 py-2.5 text-center text-xs font-semibold text-[var(--text-2)]" style={mono}>{req.total_samples}</td>
        <td className="px-3 py-2.5">
          <div className="flex flex-wrap gap-1">
            {req.samples.slice(0, 3).map((s, i) => (
              <span key={i} className="text-xs px-1.5 py-0.5 bg-[var(--surface-3)] text-[var(--text-3)] rounded" style={mono}>{s}</span>
            ))}
            {req.samples.length > 3 && <span className="text-xs text-[var(--text-4)]">+{req.samples.length - 3}</span>}
          </div>
        </td>
        <td className="px-3 py-2.5"><AgingBadge ts={req.timestamp} /></td>
        <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
          <select value={req.status || 'New'}
            onChange={e => onStatusChange(req.id, e.target.value)}
            disabled={savingId === req.id}
            className="via-input text-xs py-1 px-2 w-full" style={{ minWidth: 110 }}>
            {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </td>
      </tr>
      {expanded && (
        <tr style={{ borderBottom: '1px solid var(--border)' }}>
          <td colSpan={8} className="p-0">
            <div className="bg-[var(--surface-2)] px-6 py-4">
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <div className="text-[var(--text-4)] text-xs uppercase tracking-wider mb-2" style={mono}>Contact</div>
                  <div className="space-y-1.5">
                    {[['Name', req.name], ['Phone', req.phone], ['Address', req.address]].map(([label, val]) => (
                      <div key={label} className="flex gap-2 text-xs">
                        <span className="text-[var(--text-4)] w-16">{label}</span>
                        <span className="text-[var(--text-2)]" style={label === 'Phone' ? mono : {}}>{val || '—'}</span>
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
                      <CopyWAButton message={buildSampleWAMessage(req)} />
                    </div>
                  )}
                </div>
                <div>
                  <div className="text-[var(--text-4)] text-xs uppercase tracking-wider mb-2" style={mono}>Requested Samples</div>
                  <div className="space-y-1.5">
                    {req.samples.map((s, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs">
                        <span className="text-[var(--text-4)] w-4">{i + 1}</span>
                        <span className="px-2 py-1 bg-[var(--surface-3)] text-[var(--text)] rounded" style={mono}>{s}</span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 text-xs text-[var(--text-4)]">Max 5 samples per request</div>
                </div>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export default function SampleRequestsPage() {
  const [requests, setRequests] = useState<SampleRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: 'timestamp', dir: 'desc' });
  const [savingId, setSavingId] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/requests/samples');
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
      const res = await fetch('/api/requests/samples', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
      result = result.filter(r =>
        r.name.toLowerCase().includes(q) ||
        r.phone.includes(q) ||
        r.address.toLowerCase().includes(q) ||
        r.samples.some(s => s.toLowerCase().includes(q))
      );
    }
    return [...result].sort((a, b) => {
      const av = sort.key === 'total_samples' ? a.total_samples : String(a[sort.key]);
      const bv = sort.key === 'total_samples' ? b.total_samples : String(b[sort.key]);
      if (typeof av === 'number' && typeof bv === 'number')
        return sort.dir === 'desc' ? bv - av : av - bv;
      return sort.dir === 'desc'
        ? String(bv).localeCompare(String(av))
        : String(av).localeCompare(String(bv));
    });
  }, [requests, search, filterStatus, sort]);

  const statusCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const r of requests) c[r.status || 'New'] = (c[r.status || 'New'] || 0) + 1;
    return c;
  }, [requests]);

  const thStyle: React.CSSProperties = {
    padding: '8px 12px', textAlign: 'left',
    color: 'var(--text-3)', fontWeight: 500, fontSize: 11,
    textTransform: 'uppercase', letterSpacing: '0.06em',
    background: 'var(--surface-2)', borderBottom: '1px solid var(--border)',
    whiteSpace: 'nowrap',
  };

  return (
    <div className="via-page" style={{ background: 'var(--bg)', minHeight: '100%' }}>
      <div style={{ maxWidth: 1300, margin: '0 auto' }}>

        <div className="flex items-start justify-between mb-5">
          <div>
            <h1 className="text-[var(--text)] font-semibold text-2xl tracking-tight">Sample Requests</h1>
            <p className="text-[var(--text-3)] text-sm mt-1">
              Requests from varindo.co.id/request-sample — up to 5 samples per request.
            </p>
          </div>
          <div className="flex items-center gap-3">
            {lastRefreshed && <span className="text-[var(--text-4)] text-xs" style={mono}>Updated {lastRefreshed}</span>}
            <button onClick={fetchData} disabled={loading}
              className="px-3 py-1.5 text-xs bg-[var(--surface-2)] hover:bg-[var(--surface-3)] text-[var(--text-3)] hover:text-[var(--text)] rounded-lg border border-[var(--border)] transition-colors disabled:opacity-50">
              {loading ? '…' : '↻ Refresh'}
            </button>
          </div>
        </div>

        {/* Status pills */}
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
            placeholder="Search name, phone, address, sample code…"
            className="via-input text-xs py-1.5 px-3 w-72" />
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
              <div className="text-3xl mb-2 opacity-20">◻</div>
              <div className="text-[var(--text-3)] text-sm">No sample requests found.</div>
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
                    <th style={thStyle}>Address</th>
                    <th style={{ ...thStyle, textAlign: 'center' }}><SortBtn label="Samples" k="total_samples" sort={sort} onSort={handleSort} /></th>
                    <th style={thStyle}>Codes</th>
                    <th style={thStyle}>Age</th>
                    <th style={thStyle}><SortBtn label="Status" k="status" sort={sort} onSort={handleSort} /></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(req => (
                    <SampleRow key={req.id} req={req} onStatusChange={handleStatusChange} savingId={savingId} />
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
