'use client';

import { useEffect, useMemo, useState } from 'react';
import ChatInterface from '@/components/ChatInterface';

type DashboardData = {
  success: boolean;
  generated_at: string;
  errors?: string[];
  monthly_sales: {
    from: string;
    to: string;
    revenueBeforePpn: number;
    cogs: number;
    grossProfit: number;
    gpMargin: number;
    invoiceCount: number;
    detailedInvoiceCount: number;
    missingCostLines: number;
  };
  gross_profit: {
    revenueBeforePpn: number;
    cogs: number;
    grossProfit: number;
    gpMargin: number;
    missingCostLines: number;
  };
  receivables: {
    totalReceivables: number;
    invoiceCount: number;
    overdueReceivables: number;
  };
  inventory_summary: {
    stockValue: number;
    stockQty: number;
    itemCount: number;
    zeroOrMissingCostItems: number;
    by_brand: Array<{ brand: string; stockValue: number; stockQty: number; itemCount: number }>;
  };
};

function formatRp(value: number) {
  return `Rp ${Math.round(Number(value || 0)).toLocaleString('id-ID')}`;
}

function formatQty(value: number) {
  return Math.round(Number(value || 0)).toLocaleString('id-ID');
}

function formatPercent(value: number) {
  return `${(Number(value || 0) * 100).toFixed(1)}%`;
}

function MetricCard({ title, value, subtitle, tone = 'default' }: { title: string; value: string; subtitle: string; tone?: 'default' | 'accent' | 'warning' | 'good' }) {
  const color = tone === 'accent' ? 'var(--accent)' : tone === 'warning' ? '#d8995f' : tone === 'good' ? '#75b798' : 'var(--text)';
  return (
    <div style={{
      background: 'var(--panel)',
      border: '1px solid var(--border)',
      borderRadius: 12,
      padding: 18,
      minHeight: 120,
    }}>
      <div style={{ color: 'var(--muted)', fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 12 }}>
        {title}
      </div>
      <div style={{ color, fontSize: 24, fontWeight: 700, fontFamily: 'JetBrains Mono, monospace' }}>
        {value}
      </div>
      <div style={{ color: 'var(--muted)', fontSize: 12, marginTop: 8, lineHeight: 1.4 }}>
        {subtitle}
      </div>
    </div>
  );
}

export default function HomePage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadDashboard() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/dashboard', { cache: 'no-store' });
      const isJson = res.headers.get('content-type')?.includes('application/json');
      if (!isJson) {
        const text = await res.text();
        throw new Error(`HTTP ${res.status} (non-JSON): ${text.slice(0, 300)}`);
      }
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setData(json);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDashboard();
  }, []);

  const periodLabel = useMemo(() => {
    if (!data) return 'This month';
    return `${data.monthly_sales.from} – ${data.monthly_sales.to}`;
  }, [data]);

  return (
    <div className="via-page" style={{ background: 'var(--bg)', minHeight: '100%' }}>
      <div style={{ maxWidth: 1500, margin: '0 auto' }}>
        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="text-[var(--text)] font-semibold text-2xl tracking-tight">VIA Dashboard</h1>
            <p className="text-[var(--muted)] text-sm mt-1">Operational summary · {periodLabel}</p>
          </div>
          <button
            onClick={loadDashboard}
            disabled={loading}
            className="px-4 py-2 rounded-lg text-sm disabled:opacity-50"
            style={{ background: 'var(--panel)', border: '1px solid var(--border)', color: 'var(--text)' }}
          >
            ↻ Refresh
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-lg p-3 text-sm" style={{ background: 'rgba(220, 85, 70, 0.12)', border: '1px solid rgba(220, 85, 70, 0.35)', color: '#f0a39a' }}>
            {error}
          </div>
        )}

        {data?.errors?.length ? (
          <div className="mb-4 rounded-lg p-3 text-xs" style={{ background: 'rgba(216, 153, 95, 0.10)', border: '1px solid rgba(216, 153, 95, 0.30)', color: '#d8995f' }}>
            Some dashboard sources could not load: {data.errors.join(' | ')}
          </div>
        ) : null}

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-5">
          <MetricCard
            title="Monthly Sales Before PPN"
            value={loading && !data ? 'Loading…' : formatRp(data?.monthly_sales.revenueBeforePpn || 0)}
            subtitle={`${data?.monthly_sales.invoiceCount || 0} invoices this month`}
            tone="accent"
          />
          <MetricCard
            title="Gross Profit This Month"
            value={loading && !data ? 'Loading…' : formatRp(data?.gross_profit.grossProfit || 0)}
            subtitle={`COGS ${formatRp(data?.gross_profit.cogs || 0)} · GP margin ${formatPercent(data?.gross_profit.gpMargin || 0)}`}
            tone="good"
          />
          <MetricCard
            title="Total Receivables"
            value={loading && !data ? 'Loading…' : formatRp(data?.receivables.totalReceivables || 0)}
            subtitle={`${data?.receivables.invoiceCount || 0} unpaid invoices · Overdue ${formatRp(data?.receivables.overdueReceivables || 0)}`}
            tone="warning"
          />
          <div style={{
            background: 'var(--panel)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            padding: 18,
            minHeight: 120,
          }}>
            <div style={{ color: 'var(--muted)', fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 12 }}>
              Inventory Summary Value
            </div>
            <div style={{ color: 'var(--text)', fontSize: 24, fontWeight: 700, fontFamily: 'JetBrains Mono, monospace' }}>
              {loading && !data ? 'Loading…' : formatRp(data?.inventory_summary.stockValue || 0)}
            </div>
            <div style={{ color: 'var(--muted)', fontSize: 12, marginTop: 6, marginBottom: 10 }}>
              {formatQty(data?.inventory_summary.stockQty || 0)} sheets/items · {data?.inventory_summary.itemCount || 0} active items
            </div>
            {data?.inventory_summary.by_brand?.length ? (
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 5 }}>
                {data.inventory_summary.by_brand.map(b => (
                  <div key={b.brand} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{ color: 'var(--muted)', fontSize: 11, fontFamily: 'JetBrains Mono, monospace', minWidth: 70 }}>{b.brand}</span>
                    <div style={{ flex: 1, height: 3, borderRadius: 2, background: 'var(--border)', overflow: 'hidden' }}>
                      <div style={{
                        height: '100%',
                        borderRadius: 2,
                        background: 'var(--accent)',
                        width: `${Math.round((b.stockValue / (data.inventory_summary.stockValue || 1)) * 100)}%`,
                      }} />
                    </div>
                    <span style={{ color: 'var(--text)', fontSize: 11, fontFamily: 'JetBrains Mono, monospace', textAlign: 'right', minWidth: 90 }}>
                      {formatRp(b.stockValue)}
                    </span>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[340px_1fr] gap-5">
          <div style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 12, padding: 18 }}>
            <h2 className="text-[var(--text)] font-semibold text-sm mb-3">Quick Summary</h2>
            <div className="space-y-3 text-sm text-[var(--muted)]">
              <p>Monthly Sales uses Zoho invoice subtotal before PPN.</p>
              <p>Gross Profit = Monthly Sales before PPN minus COGS. COGS uses item Purchase Rate × quantity sold.</p>
              <p>Total Receivables uses unpaid invoice balance due.</p>
              <p>Inventory Summary uses stock on hand × item Purchase Rate.</p>
              {data?.gross_profit.missingCostLines ? (
                <p style={{ color: '#d8995f' }}>
                  Note: {data.gross_profit.missingCostLines} invoice lines had missing Purchase Rate, so GP may be understated.
                </p>
              ) : null}
              {data?.inventory_summary.zeroOrMissingCostItems ? (
                <p style={{ color: '#d8995f' }}>
                  Note: {data.inventory_summary.zeroOrMissingCostItems} stocked items had missing Purchase Rate, so inventory value may be understated.
                </p>
              ) : null}
            </div>
          </div>

          <div style={{ minHeight: 'min(620px, 70dvh)', overflow: 'hidden', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--panel)' }}>
            <ChatInterface />
          </div>
        </div>
      </div>
    </div>
  );
}
