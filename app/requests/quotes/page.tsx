'use client';
import { CopyWAButton } from '@/components/CopyWAButton';

import { useState, useEffect, useCallback, useMemo } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface QuoteItem {
  code: string;
  qty: string;
}

interface QuoteRequest {
  id: string;              // row index as string
  timestamp: string;
  name: string;
  address: string;
  phone: string;
  items: QuoteItem[];
  total_items: number;
  status: string;
  notes: string;
  raw: string[];           // original row for status update reference
}

type SortKey = 'timestamp' | 'name' | 'total_items' | 'status';
type SortDir = 'asc' | 'desc';

const STATUS_OPTIONS = ['New', 'Sent to Customer'];

const STATUS_STYLE: Record<string, string> = {
  'New':              'bg-[var(--info-bg)] text-[var(--info)] border-[var(--info-border)]',
  'Sent to Customer': 'bg-[var(--success-bg)] text-[var(--success)] border-[var(--success-border)]',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const mono = { fontFamily: 'JetBrains Mono, monospace' };

function buildQuoteWAMessage(req: { name: string; address?: string; phone?: string; items: { code: string; qty: string }[] }): string {
  const lines = [
    `*Quote Requests*`,
    ``,
    `Name: ${req.name}`,
    `Address: ${req.address || '—'}`,
    `Phone: ${req.phone || '—'}`,
    `Items:`,
    ...req.items.map((it, i) => `${i + 1}. ${it.code}${it.qty ? ' — Qty: ' + it.qty : ''}`),
  ];
  return lines.join('\n');
}

function formatTs(ts: string) {
  if (!ts) return '—';
  // "31/5/2026, 23.17.25" → readable
  return ts.replace(',', '');
}

function agingDays(ts: string): number {
  if (!ts) return 0;
  // Parse "31/5/2026, 23.17.25"
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

function StatusBadge({ status }: { status: string }) {
  const cls = STATUS_STYLE[status] || STATUS_STYLE['New'];
  return <span className={`via-badge border text-xs ${cls}`}>{status || 'New'}</span>;
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

// ─── Row ──────────────────────────────────────────────────────────────────────

function QuoteRow({ req, onStatusChange, savingId }: {
  req: QuoteRequest;
  onStatusChange: (id: string, status: string) => void;
  savingId: string | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const isSaving = savingId === req.id;

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
        <td className="px-3 py-2.5 text-xs text-[var(--text-3)] max-w-[160px] truncate" title={req.address}>{req.address || '—'}</td>
        <td className="px-3 py-2.5 text-center text-xs font-semibold text-[var(--text-2)]" style={mono}>{req.total_items}</td>
        <td className="px-3 py-2.5">
          <div className="flex flex-wrap gap-1">
            {req.items.slice(0, 3).map((item, i) => (
              item.code ? <span key={i} className="text-xs px-1.5 py-0.5 bg-[var(--surface-3)] text-[var(--text-3)] rounded" style={mono}>{item.code}</span> : null
            ))}
            {req.items.filter(i => i.code).length > 3 && (
              <span className="text-xs text-[var(--text-4)]">+{req.items.filter(i => i.code).length - 3}</span>
            )}
          </div>
        </td>
        <td className="px-3 py-2.5"><AgingBadge ts={req.timestamp} /></td>
        <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
          <select
            value={req.status || 'New'}
            onChange={e => onStatusChange(req.id, e.target.value)}
            disabled={isSaving}
            className="via-input text-xs py-1 px-2 w-full"
            style={{ minWidth: 110 }}
          >
            {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </td>
      </tr>
      {expanded && (
        <tr style={{ borderBottom: '1px solid var(--border)' }}>
          <td colSpan={8} className="p-0">
            <div className="bg-[var(--surface-2)] px-6 py-4">
              <div className="grid grid-cols-2 gap-6">
                {/* Contact info */}
                <div>
                  <div className="text-[var(--text-4)] text-xs uppercase tracking-wider mb-2" style={mono}>Contact</div>
                  <div className="space-y-1.5">
                    <div className="flex gap-2 text-xs">
                      <span className="text-[var(--text-4)] w-16">Name</span>
                      <span className="text-[var(--text)]">{req.name}</span>
                    </div>
                    <div className="flex gap-2 text-xs">
                      <span className="text-[var(--text-4)] w-16">Phone</span>
                      <span className="text-[var(--text-2)]" style={mono}>{req.phone || '—'}</span>
                    </div>
                    <div className="flex gap-2 text-xs">
                      <span className="text-[var(--text-4)] w-16">Address</span>
                      <span className="text-[var(--text-3)]">{req.address || '—'}</span>
                    </div>
                  </div>
                  {/* WhatsApp button */}
                  {req.phone && (
                    <div className="mt-3 flex items-center gap-2 flex-wrap">
                      <a href={'https://wa.me/62' + req.phone.replace(/^0/, '').replace(/[^0-9]/g, '')}
                        target="_blank" rel="noreferrer"
                        className="inline-flex items-center gap-2 px-3 py-1.5 text-xs bg-[var(--success-bg)] text-[var(--success)] border border-[var(--success-border)] rounded-lg hover:opacity-80 transition-opacity"
                        onClick={e => e.stopPropagation()}>
                        <span>💬</span> WhatsApp
                      </a>
                      <CopyWAButton message={buildQuoteWAMessage({ name: req.name, address: req.address, phone: req.phone, items: req.items })} />
                    </div>
                  )}
                </div>
                {/* Items */}
                <div>
                  <div className="text-[var(--text-4)] text-xs uppercase tracking-wider mb-2" style={mono}>Requested Items</div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border)' }}>
                        <th style={{ padding: '4px 8px', textAlign: 'left', color: 'var(--text-4)', fontWeight: 500, fontSize: 10, textTransform: 'uppercase' }}>#</th>
                        <th style={{ padding: '4px 8px', textAlign: 'left', color: 'var(--text-4)', fontWeight: 500, fontSize: 10, textTransform: 'uppercase' }}>Code / Design</th>
                        <th style={{ padding: '4px 8px', textAlign: 'right', color: 'var(--text-4)', fontWeight: 500, fontSize: 10, textTransform: 'uppercase' }}>Qty</th>
                      </tr>
                    </thead>
                    <tbody>
                      {req.items.filter(i => i.code).map((item, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid var(--border-muted)' }}>
                          <td style={{ padding: '5px 8px', color: 'var(--text-4)', fontSize: 11 }}>{i + 1}</td>
                          <td style={{ padding: '5px 8px', color: 'var(--text)', ...mono }}>{item.code}</td>
                          <td style={{ padding: '5px 8px', textAlign: 'right', color: 'var(--text-2)', ...mono }}>{item.qty || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function QuoteRequestsPage() {
  const [requests, setRequests] = useState<QuoteRequest[]>([]);
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
      const res = await fetch('/api/requests/quotes');
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
      const res = await fetch('/api/requests/quotes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      setRequests(prev => prev.map(r => r.id === id ? { ...r, status } : r));
    } catch (e) {
      setError('Failed to update status: ' + String(e));
    } finally {
      setSavingId(null);
    }
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
        r.items.some(i => i.code.toLowerCase().includes(q))
      );
    }
    return [...result].sort((a, b) => {
      let av: string | number = a[sort.key] as string | number;
      let bv: string | number = b[sort.key] as string | number;
      if (sort.key === 'timestamp') { av = a.timestamp; bv = b.timestamp; }
      if (sort.key === 'total_items') { av = a.total_items; bv = b.total_items; }
      if (typeof av === 'number' && typeof bv === 'number')
        return sort.dir === 'desc' ? bv - av : av - bv;
      return sort.dir === 'desc'
        ? String(bv).localeCompare(String(av))
        : String(av).localeCompare(String(bv));
    });
  }, [requests, search, filterStatus, sort]);

  const thStyle: React.CSSProperties = {
    padding: '8px 12px', textAlign: 'left',
    color: 'var(--text-3)', fontWeight: 500, fontSize: 11,
    textTransform: 'uppercase', letterSpacing: '0.06em',
    background: 'var(--surface-2)', borderBottom: '1px solid var(--border)',
    whiteSpace: 'nowrap',
  };

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const r of requests) counts[r.status || 'New'] = (counts[r.status || 'New'] || 0) + 1;
    return counts;
  }, [requests]);

  return (
    <div className="via-page" style={{ background: 'var(--bg)', minHeight: '100%' }}>
      <div style={{ maxWidth: 1300, margin: '0 auto' }}>

        {/* Header */}
        <div className="flex items-start justify-between mb-5">
          <div>
            <h1 className="text-[var(--text)] font-semibold text-2xl tracking-tight">Quote Requests</h1>
            <p className="text-[var(--text-3)] text-sm mt-1">
              Requests from varindo.co.id/request-quote — update status to track follow-up.
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

        {/* Status summary pills */}
        <div className="flex flex-wrap gap-2 mb-5">
          <button
            onClick={() => setFilterStatus('all')}
            className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${filterStatus === 'all' ? 'bg-[var(--accent)] text-white border-[var(--accent)]' : 'bg-[var(--surface-2)] text-[var(--text-3)] border-[var(--border)] hover:bg-[var(--surface-3)]'}`}>
            All ({requests.length})
          </button>
          {STATUS_OPTIONS.map(s => {
            const count = statusCounts[s] || 0;
            if (count === 0) return null;
            return (
              <button key={s} onClick={() => setFilterStatus(s)}
                className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${filterStatus === s ? 'bg-[var(--accent)] text-white border-[var(--accent)]' : 'bg-[var(--surface-2)] text-[var(--text-3)] border-[var(--border)] hover:bg-[var(--surface-3)]'}`}>
                {s} ({count})
              </button>
            );
          })}
        </div>

        {error && <div className="mb-4 p-3 bg-[var(--danger-bg)] border border-[var(--danger-border)] rounded-lg text-[var(--danger)] text-sm">{error}</div>}

        {/* Search */}
        <div className="mb-4">
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search name, phone, address, item code…"
            className="via-input text-xs py-1.5 px-3 w-72" />
        </div>

        {/* Table */}
        <div className="via-card overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--border)]">
            <span className="text-[var(--text-3)] text-xs">{filtered.length} requests</span>
          </div>

          {loading && (
            <div className="p-5 space-y-2">
              {[...Array(4)].map((_, i) => (
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
              <div className="text-[var(--text-3)] text-sm">No quote requests found.</div>
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
                    <th style={{ ...thStyle, textAlign: 'center' }}><SortBtn label="Items" k="total_items" sort={sort} onSort={handleSort} /></th>
                    <th style={thStyle}>Codes</th>
                    <th style={thStyle}>Age</th>
                    <th style={thStyle}><SortBtn label="Status" k="status" sort={sort} onSort={handleSort} /></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(req => (
                    <QuoteRow key={req.id} req={req} onStatusChange={handleStatusChange} savingId={savingId} />
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
