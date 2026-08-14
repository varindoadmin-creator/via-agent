'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

type Metrics = { id: string; name: string; status: string; impressions: number; clicks: number; cost: number; conversions: number; conversion_value: number; ctr: number; average_cpc: number; cost_per_conversion: number };
type Brand = Metrics & { campaigns: Metrics[] };
type Report = { month: string; ranges: { current: { from: string; to: string; label: string }; previous: { from: string; to: string; label: string } }; brands: Brand[]; previous_brands: Brand[]; unmatched_campaigns: string[]; basis: string; generated_at: string };

const mono = { fontFamily: 'JetBrains Mono, monospace' };
const rp = (value: number) => `Rp ${Math.round(value || 0).toLocaleString('id-ID')}`;
const integer = (value: number) => Math.round(value || 0).toLocaleString('id-ID');
const decimal = (value: number) => (value || 0).toLocaleString('id-ID', { maximumFractionDigits: 2 });
const pct = (value: number) => `${((value || 0) * 100).toFixed(2)}%`;
const currentMonth = () => {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }));
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};
const change = (current: number, previous: number) => previous > 0 ? (current - previous) / previous : null;
const changeText = (value: number | null) => value === null ? 'No prior data' : `${value >= 0 ? '+' : ''}${(value * 100).toFixed(1)}% vs previous period`;

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3"><div className="text-[10px] uppercase tracking-wider text-[var(--text-4)]">{label}</div><div className="mt-1 text-sm font-semibold text-[var(--text)]" style={mono}>{value}</div></div>;
}

function BrandPanel({ brand, previous }: { brand: Brand; previous?: Brand }) {
  const spendChange = change(brand.cost, previous?.cost || 0);
  const conversionChange = change(brand.conversions, previous?.conversions || 0);
  const empty = brand.campaigns.length === 0;
  return <section className="via-card overflow-hidden">
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--border)] px-5 py-4">
      <div><div className="flex items-center gap-2"><h2 className="text-lg font-semibold text-[var(--text)]">{brand.name}</h2><span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${brand.status === 'ENABLED' ? 'bg-[var(--success-bg)] text-[var(--success)]' : 'bg-[var(--surface-3)] text-[var(--text-4)]'}`}>{brand.status.replace('_', ' ')}</span></div><p className="mt-1 text-xs text-[var(--text-4)]">{brand.campaigns.length} matching campaign{brand.campaigns.length === 1 ? '' : 's'}</p></div>
      <div className="text-right"><div className="text-xl font-bold text-[var(--accent-text)]" style={mono}>{rp(brand.cost)}</div><div className={`text-[11px] ${spendChange !== null && spendChange > 0 ? 'text-[var(--warning)]' : 'text-[var(--text-4)]'}`}>{changeText(spendChange)}</div></div>
    </div>
    {empty ? <div className="p-8 text-center text-sm text-[var(--warning)]">No campaign name matched this brand. Check the campaign name or the configured matcher.</div> : <>
      <div className="grid grid-cols-2 gap-3 p-5 md:grid-cols-4"><Metric label="Impressions" value={integer(brand.impressions)}/><Metric label="Clicks" value={integer(brand.clicks)}/><Metric label="CTR" value={pct(brand.ctr)}/><Metric label="Average CPC" value={rp(brand.average_cpc)}/><Metric label="Conversions" value={decimal(brand.conversions)}/><Metric label="Cost / Conversion" value={brand.conversions > 0 ? rp(brand.cost_per_conversion) : '—'}/><Metric label="Conversion Value" value={rp(brand.conversion_value)}/><Metric label="Conversion Change" value={changeText(conversionChange).replace(' vs previous period', '')}/></div>
      <div className="overflow-x-auto border-t border-[var(--border)]"><table className="w-full text-xs"><thead className="bg-[var(--surface-2)]"><tr>{['Campaign','Status','Impressions','Clicks','CTR','Spend','Avg. CPC','Conversions','Cost / Conv.'].map(label => <th key={label} className="border-b border-[var(--border)] px-3 py-2 text-[10px] uppercase tracking-wider text-[var(--text-4)]" style={{ textAlign: label === 'Campaign' || label === 'Status' ? 'left' : 'right' }}>{label}</th>)}</tr></thead><tbody>{brand.campaigns.map(campaign => <tr key={campaign.id} className="border-b border-[var(--border-muted)]"><td className="px-3 py-2 font-medium text-[var(--text)]">{campaign.name}</td><td className="px-3 py-2 text-[var(--text-3)]">{campaign.status}</td><td className="px-3 py-2 text-right" style={mono}>{integer(campaign.impressions)}</td><td className="px-3 py-2 text-right" style={mono}>{integer(campaign.clicks)}</td><td className="px-3 py-2 text-right" style={mono}>{pct(campaign.ctr)}</td><td className="px-3 py-2 text-right" style={mono}>{rp(campaign.cost)}</td><td className="px-3 py-2 text-right" style={mono}>{rp(campaign.average_cpc)}</td><td className="px-3 py-2 text-right" style={mono}>{decimal(campaign.conversions)}</td><td className="px-3 py-2 text-right" style={mono}>{campaign.conversions > 0 ? rp(campaign.cost_per_conversion) : '—'}</td></tr>)}</tbody></table></div>
    </>}
  </section>;
}

export default function GoogleAdsPage() {
  const [month, setMonth] = useState(currentMonth);
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(async () => { setLoading(true); setError(''); try { const response = await fetch(`/api/reports/google-ads?month=${month}`, { cache: 'no-store' }); const contentType = response.headers.get('content-type') || ''; if (!contentType.includes('application/json')) throw new Error(`Unexpected server response (${response.status})`); const data = await response.json(); if (!response.ok || !data.success) throw new Error(data.error || 'Unable to load Google Ads'); setReport(data); } catch (err) { setError(err instanceof Error ? err.message : String(err)); setReport(null); } finally { setLoading(false); } }, [month]);
  useEffect(() => { load(); }, [load]);
  const previousByName = useMemo(() => new Map((report?.previous_brands || []).map(brand => [brand.name, brand])), [report]);
  return <div className="via-page min-h-full bg-[var(--bg)]"><div className="mx-auto" style={{ maxWidth: 1440 }}>
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-2xl font-semibold tracking-tight text-[var(--text)]">Google Ads</h1><p className="mt-1 text-xs text-[var(--text-4)]">Read-only performance for Lamitak and EDL · Compared with the same period in the previous month</p></div><div className="flex gap-2"><input type="month" value={month} onChange={event => setMonth(event.target.value)} className="via-input px-3 py-1.5 text-xs"/><button onClick={load} disabled={loading} className="rounded-lg border border-[var(--border)] bg-[var(--surface-1)] px-3 py-1.5 text-xs text-[var(--text-3)] disabled:opacity-50">{loading ? 'Loading…' : 'Refresh'}</button></div></div>
    {error && <div className="mb-5 rounded-lg border border-[var(--danger-border)] bg-[var(--danger-bg)] p-4 text-sm text-[var(--danger)]"><div className="font-semibold">Google Ads data is unavailable</div><div className="mt-1">{error}</div>{error.includes('not configured') && <div className="mt-3 text-xs text-[var(--text-3)]">Add the required Google Ads secrets to Cloud Run: customer ID, developer token, OAuth client ID, OAuth client secret, and refresh token.</div>}</div>}
    {loading && !report && <div className="via-card p-12 text-center text-sm text-[var(--text-4)]">Loading campaign performance from Google Ads…</div>}
    {report && <><div className="mb-4 flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--text-4)]"><span>{report.ranges.current.label}: {report.ranges.current.from} to {report.ranges.current.to}</span><span>Comparison: {report.ranges.previous.from} to {report.ranges.previous.to}</span></div><div className="grid grid-cols-1 gap-5">{report.brands.map(brand => <BrandPanel key={brand.name} brand={brand} previous={previousByName.get(brand.name)}/>)}</div>{report.unmatched_campaigns.length > 0 && <details className="via-card mt-5 p-4 text-xs"><summary className="cursor-pointer font-semibold text-[var(--text-3)]">Other campaigns not included ({report.unmatched_campaigns.length})</summary><div className="mt-3 grid gap-1 text-[var(--text-4)]">{report.unmatched_campaigns.map(name => <div key={name}>• {name}</div>)}</div></details>}<div className="mt-4 text-xs text-[var(--text-4)]">{report.basis}</div></>}
  </div></div>;
}
