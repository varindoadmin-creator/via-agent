'use client';

import { useEffect, useState } from 'react';
import type { InventoryException, ExceptionType } from '@/lib/inventory/exceptionAnalysis';

interface AlertResponse {
  success: boolean;
  error?: string;
  generated_at: string;
  scanned_items: number;
  total_alerts: number;
  counts: Partial<Record<ExceptionType, number>>;
  alerts: InventoryException[];
  methodology: string;
  truncated?: boolean;
}

const LABELS: Record<ExceptionType, string> = {
  negative_stock: 'Negative stock',
  stockout_risk: 'Stockout risk',
  aging_stock: 'No sales (365d)',
  slow_moving: 'Slow-moving',
  location_mismatch: 'Location mismatch',
};

export default function InventoryExceptionAlerts() {
  const [data, setData] = useState<AlertResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<ExceptionType | 'all'>('all');
  const [expanded, setExpanded] = useState(false);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/inventory/exceptions');
      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) throw new Error(`Server returned ${response.status} instead of JSON`);
      const result = await response.json() as AlertResponse;
      if (!response.ok || !result.success) throw new Error(result.error || 'Inventory scan failed');
      setData(result);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Inventory scan failed');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const visible = (data?.alerts || []).filter((alert) => filter === 'all' || alert.type === filter);
  const shown = expanded ? visible : visible.slice(0, 12);

  return (
    <section className="mb-6 rounded-xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
      <div className="flex items-start justify-between gap-4 p-4 border-b border-[var(--border)]">
        <div>
          <h2 className="font-semibold text-[var(--text)]">Inventory Exception Alerts</h2>
          <p className="text-xs text-[var(--text-4)] mt-1">Read-only recommendations. No Zoho stock or transfers are changed.</p>
        </div>
        <button onClick={() => void load()} disabled={loading} className="px-3 py-1.5 text-xs border border-[var(--border)] rounded-lg text-[var(--text-3)] disabled:opacity-50">
          {loading ? 'Scanning…' : '↻ Rescan'}
        </button>
      </div>

      {error && <div className="m-4 p-3 rounded-lg bg-[var(--danger-bg)] text-[var(--danger)] text-sm">{error}</div>}
      {loading && !data && <div className="p-8 text-center text-sm text-[var(--text-4)]">Scanning active items and recent sales…</div>}

      {data && (
        <>
          <div className="flex flex-wrap gap-2 p-4">
            <button onClick={() => setFilter('all')} className={`px-3 py-2 rounded-lg border text-xs ${filter === 'all' ? 'border-[var(--accent)] text-[var(--accent-text)] bg-[var(--accent-subtle)]' : 'border-[var(--border)] text-[var(--text-3)]'}`}>
              All <strong className="ml-1">{data.total_alerts}</strong>
            </button>
            {(Object.keys(LABELS) as ExceptionType[]).map((type) => (
              <button key={type} onClick={() => setFilter(type)} className={`px-3 py-2 rounded-lg border text-xs ${filter === type ? 'border-[var(--accent)] text-[var(--accent-text)] bg-[var(--accent-subtle)]' : 'border-[var(--border)] text-[var(--text-3)]'}`}>
                {LABELS[type]} <strong className="ml-1">{data.counts[type] || 0}</strong>
              </button>
            ))}
          </div>

          <div className="overflow-x-auto border-t border-[var(--border)]">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs uppercase tracking-wider text-[var(--text-4)] bg-[var(--surface-2)]">
                <th className="px-4 py-2.5">Item</th><th className="px-4 py-2.5">Exception</th><th className="px-4 py-2.5">Stock</th><th className="px-4 py-2.5">Recommended action</th>
              </tr></thead>
              <tbody className="divide-y divide-[var(--border-muted)]">
                {shown.map((alert) => (
                  <tr key={alert.id} className="align-top">
                    <td className="px-4 py-3"><div className="text-[var(--text-2)]">{alert.item_name}</div><div className="font-mono text-xs text-[var(--text-4)]">{alert.sku || 'No SKU'}</div></td>
                    <td className="px-4 py-3"><span className={`text-xs font-medium ${alert.severity === 'critical' ? 'text-[var(--danger)]' : alert.severity === 'warning' ? 'text-[var(--warning)]' : 'text-[var(--info)]'}`}>{LABELS[alert.type]}</span><div className="text-xs text-[var(--text-3)] mt-1 max-w-sm">{alert.message}</div></td>
                    <td className="px-4 py-3 whitespace-nowrap font-mono text-xs"><div>{alert.available_stock} available</div>{alert.days_of_stock !== null && <div className="text-[var(--text-4)]">~{alert.days_of_stock} days</div>}</td>
                    <td className="px-4 py-3 text-xs text-[var(--text-3)] max-w-md">{alert.recommendation}</td>
                  </tr>
                ))}
                {shown.length === 0 && <tr><td colSpan={4} className="p-8 text-center text-[var(--text-4)]">No exceptions in this category.</td></tr>}
              </tbody>
            </table>
          </div>
          {visible.length > 12 && <button onClick={() => setExpanded((value) => !value)} className="w-full py-3 border-t border-[var(--border)] text-xs text-[var(--accent-text)]">{expanded ? 'Show fewer' : `Show all ${visible.length}`}</button>}
          <div className="px-4 py-3 border-t border-[var(--border)] text-[11px] text-[var(--text-4)]">
            Scanned {data.scanned_items.toLocaleString('id-ID')} active items · Updated {new Date(data.generated_at).toLocaleString('id-ID')}. {data.methodology}{data.truncated ? ' Results are capped to protect performance.' : ''}
          </div>
        </>
      )}
    </section>
  );
}
