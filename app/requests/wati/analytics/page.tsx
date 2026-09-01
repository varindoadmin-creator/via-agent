'use client';

import { useEffect, useState } from 'react';
import { RefreshCw, TrendingUp, TrendingDown, Minus } from 'lucide-react';

type Grain = 'TODAY' | 'YESTERDAY' | 'LAST_7_DAYS' | 'THIS_MONTH' | 'LAST_MONTH';
const GRAINS: Grain[] = ['TODAY', 'YESTERDAY', 'LAST_7_DAYS', 'THIS_MONTH', 'LAST_MONTH'];

interface PeriodComparison { current: number; previous: number; percentChange: number | null; smallSample: boolean }

interface AnalyticsResponse {
  success: boolean;
  error?: string;
  executive: {
    customerService: { inboundConversations: number; handoffCount: number; slaCompliance: number | null; slaBreachRate: number | null };
    commercialFunnel: { draftsCreated: number; quotationsCreated: number; ordersCreated: number; draftToOrderConversion: number | null; soValue: number };
    inboundConversationsComparison: PeriodComparison;
    slaComplianceComparison: PeriodComparison | null;
    orderCountComparison: PeriodComparison;
    soValueComparison: PeriodComparison;
    freshness: { computedAt: string; note: string };
  };
  customerService: {
    funnel: {
      inboundConversations: number; handoffCount: number; humanResolvedCount: number;
      autoResolutionRate: number | null; humanHandoffRate: number | null; humanResolutionRate: number | null;
      medianResolutionMinutes: number; averageResolutionMinutes: number;
      slaCompliance: number | null; slaBreachRate: number | null; backlog: number;
    };
    handoffReasons: { reason: string; count: number }[];
  };
  stock: {
    overall: { inquiryCount: number; medianResponseMinutes: number; averageResponseMinutes: number; oosRate: number | null; noResponseRate: number | null; varindoFallbackRate: number | null; humanEscalationRate: number | null };
    byVendor: { vendor: string; inquiryCount: number; medianResponseMinutes: number; availableRate: number | null; oosRate: number | null }[];
  };
  commercial: { funnel: { draftsCreated: number; quotationsCreated: number; ordersCreated: number; draftToOrderConversion: number | null; soValue: number } };
  onboarding: {
    funnel: { onboardingStarted: number; onboardingCompleted: number; onboardingAbandoned: number; duplicateDetected: number; completionRate: number | null; medianOnboardingMinutes: number; existingZohoMatchCount: number; newCustomersCreated: number };
    identityFriction: { singleCustomerAutoResolutionRate: number | null; unmatchedCustomerRate: number | null };
  };
  sourceAttribution: { known: { source: string; count: number }[]; unknownCount: number };
  dataQuality: { coverage: { attributionCoverage: number | null; customerMappingCoverage: number | null; orderLinkageCoverage: number | null } };
  decisionEngineering: {
    customerSegments: Record<string, number>;
    extendedDataQuality: {
      duplicateCustomerGroups: { count: number | null; snapshotComputedAt: string | null };
      orphanProductCodes: number;
      customersMissingSalesperson: { activeCustomers: number; missingSalesperson: number };
      priceResolutionFailuresOpen: number;
      syncFreshness: { jobName: string; hoursSinceLastSuccess: number | null; stale: boolean }[];
    };
  } | null;
}

function fmtPct(v: number | null): string {
  return v === null ? '—' : `${(v * 100).toFixed(0)}%`;
}
function fmtIdr(v: number): string {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(v);
}
function fmtMinutes(v: number): string {
  if (v < 60) return `${Math.round(v)}m`;
  const h = Math.floor(v / 60);
  const m = Math.round(v % 60);
  return `${h}h ${m}m`;
}

function Trend({ c }: { c: PeriodComparison | null }) {
  if (!c || c.percentChange === null) return <span className="text-xs text-[var(--text-secondary)]">vs prev: n/a</span>;
  const up = c.percentChange > 0;
  const flat = Math.abs(c.percentChange) < 0.5;
  const Icon = flat ? Minus : up ? TrendingUp : TrendingDown;
  const color = flat ? 'text-slate-500' : up ? 'text-emerald-600' : 'text-red-600';
  return <span className={`inline-flex items-center gap-1 text-xs font-medium ${color}`}>
    <Icon size={12} />{Math.abs(c.percentChange).toFixed(0)}%{c.smallSample && <span className="text-[var(--text-secondary)] font-normal"> (small sample)</span>}
  </span>;
}

function Card({ label, value, comparison, sub }: { label: string; value: string; comparison?: PeriodComparison | null; sub?: string }) {
  return <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
    <div className="text-xs uppercase tracking-wide text-[var(--text-secondary)]">{label}</div>
    <div className="mt-1 text-2xl font-semibold tabular-nums text-[var(--text)]">{value}</div>
    <div className="mt-1 flex items-center gap-2">{comparison !== undefined && <Trend c={comparison} />}{sub && <span className="text-xs text-[var(--text-secondary)]">{sub}</span>}</div>
  </div>;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="space-y-3">
    <h2 className="text-lg font-semibold text-[var(--text)]">{title}</h2>
    {children}
  </section>;
}

export default function CustomerOperationsAnalyticsPage() {
  const [grain, setGrain] = useState<Grain>('THIS_MONTH');
  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function load(g: Grain) {
    setLoading(true); setError('');
    try {
      const response = await fetch(`/api/requests/wati/analytics?grain=${g}`, { cache: 'no-store' });
      const body: AnalyticsResponse = await response.json();
      if (!response.ok || !body.success) throw new Error(body.error || 'Unable to load analytics.');
      setData(body);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setLoading(false); }
  }
  useEffect(() => { void load(grain); }, [grain]);

  return <div className="min-h-full bg-[var(--surface-secondary)] p-6 lg:p-8"><div className="mx-auto max-w-[1400px] space-y-6">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--text)]">Customer Operations Analytics</h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">Customer service, stock/vendor, and commercial funnel metrics — computed live from operational data, the same numbers Jarvis reports.</p>
      </div>
      <div className="flex items-center gap-2">
        <select value={grain} onChange={e => setGrain(e.target.value as Grain)} className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm">
          {GRAINS.map(g => <option key={g} value={g}>{g.replace(/_/g, ' ')}</option>)}
        </select>
        <button onClick={() => load(grain)} disabled={loading} className="inline-flex items-center gap-2 rounded-lg bg-[#6161ff] px-4 py-2 text-sm font-medium text-white disabled:opacity-60">
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />Refresh
        </button>
      </div>
    </header>

    {error && <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}

    {data && <>
      <Section title="Executive Overview">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Card label="Inbound Conversations" value={String(data.executive.customerService.inboundConversations)} comparison={data.executive.inboundConversationsComparison} />
          <Card label="SLA Compliance" value={fmtPct(data.executive.customerService.slaCompliance)} comparison={data.executive.slaComplianceComparison} />
          <Card label="Orders Created" value={String(data.executive.commercialFunnel.ordersCreated)} comparison={data.executive.orderCountComparison} />
          <Card label="Sales Order Value" value={fmtIdr(data.executive.commercialFunnel.soValue)} comparison={data.executive.soValueComparison} />
        </div>
        <p className="text-xs text-[var(--text-secondary)]">{data.executive.freshness.note}</p>
      </Section>

      <Section title="Customer Service">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Card label="Handoffs" value={String(data.customerService.funnel.handoffCount)} />
          <Card label="Auto-Resolution Rate" value={fmtPct(data.customerService.funnel.autoResolutionRate)} />
          <Card label="Human Resolution Rate" value={fmtPct(data.customerService.funnel.humanResolutionRate)} />
          <Card label="Backlog (open cases)" value={String(data.customerService.funnel.backlog)} />
          <Card label="Median Resolution Time" value={fmtMinutes(data.customerService.funnel.medianResolutionMinutes)} />
          <Card label="Average Resolution Time" value={fmtMinutes(data.customerService.funnel.averageResolutionMinutes)} />
          <Card label="SLA Compliance" value={fmtPct(data.customerService.funnel.slaCompliance)} />
          <Card label="SLA Breach Rate" value={fmtPct(data.customerService.funnel.slaBreachRate)} />
        </div>
        {data.customerService.handoffReasons.length > 0 && <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <div className="mb-2 text-xs uppercase tracking-wide text-[var(--text-secondary)]">Handoff Reasons</div>
          <div className="flex flex-wrap gap-2">{data.customerService.handoffReasons.map(r => <span key={r.reason} className="rounded-full bg-[var(--surface-2)] px-3 py-1 text-xs font-medium">{r.reason.replace(/_/g, ' ')} <span className="tabular-nums text-[var(--text-secondary)]">({r.count})</span></span>)}</div>
        </div>}
      </Section>

      <Section title="Stock / Vendor Operations">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Card label="Stock Inquiries" value={String(data.stock.overall.inquiryCount)} />
          <Card label="Median Response Time" value={fmtMinutes(data.stock.overall.medianResponseMinutes)} />
          <Card label="Out-of-Stock Rate" value={fmtPct(data.stock.overall.oosRate)} />
          <Card label="Varindo Fallback Rate" value={fmtPct(data.stock.overall.varindoFallbackRate)} />
        </div>
        {data.stock.byVendor.length > 0 && <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
          <table className="w-full text-left text-sm">
            <thead className="bg-[var(--surface-secondary)] text-xs uppercase tracking-wide text-[var(--text-secondary)]"><tr>
              <th className="px-4 py-2">Vendor</th><th className="px-4 py-2">Inquiries</th><th className="px-4 py-2">Median Response</th><th className="px-4 py-2">Available Rate</th><th className="px-4 py-2">OOS Rate</th>
            </tr></thead>
            <tbody className="divide-y divide-[var(--border)]">{data.stock.byVendor.map(v => <tr key={v.vendor}>
              <td className="px-4 py-2 font-medium">{v.vendor}</td><td className="px-4 py-2 tabular-nums">{v.inquiryCount}</td>
              <td className="px-4 py-2 tabular-nums">{fmtMinutes(v.medianResponseMinutes)}</td>
              <td className="px-4 py-2 tabular-nums">{fmtPct(v.availableRate)}</td><td className="px-4 py-2 tabular-nums">{fmtPct(v.oosRate)}</td>
            </tr>)}</tbody>
          </table>
        </div>}
      </Section>

      <Section title="Commercial Funnel">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Card label="Drafts Created" value={String(data.commercial.funnel.draftsCreated)} />
          <Card label="Quotations" value={String(data.commercial.funnel.quotationsCreated)} />
          <Card label="Orders" value={String(data.commercial.funnel.ordersCreated)} />
          <Card label="Draft → Order Conversion" value={fmtPct(data.commercial.funnel.draftToOrderConversion)} />
        </div>
        <Card label="Sales Order Value (live Zoho)" value={fmtIdr(data.commercial.funnel.soValue)} />
      </Section>

      <Section title="Source Attribution">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <div className="flex flex-wrap gap-2">
            {data.sourceAttribution.known.map(s => <span key={s.source} className="rounded-full bg-[var(--surface-2)] px-3 py-1 text-xs font-medium">{s.source} <span className="tabular-nums text-[var(--text-secondary)]">({s.count})</span></span>)}
            <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">UNKNOWN <span className="tabular-nums">({data.sourceAttribution.unknownCount})</span></span>
          </div>
          <p className="mt-2 text-xs text-[var(--text-secondary)]">UNKNOWN is never ranked as a marketing source or attributed to a channel.</p>
        </div>
      </Section>

      <Section title="Data Quality">
        <div className="grid grid-cols-3 gap-4">
          <Card label="Attribution Coverage" value={fmtPct(data.dataQuality.coverage.attributionCoverage)} />
          <Card label="Customer Mapping Coverage" value={fmtPct(data.dataQuality.coverage.customerMappingCoverage)} />
          <Card label="Order Linkage Coverage" value={fmtPct(data.dataQuality.coverage.orderLinkageCoverage)} />
        </div>
      </Section>

      {data.decisionEngineering && <Section title="Customer Segments (Analytical — never the pricing Tier)">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <div className="flex flex-wrap gap-2">
            {Object.entries(data.decisionEngineering.customerSegments).map(([segment, count]) => (
              <span key={segment} className="rounded-full bg-[var(--surface-2)] px-3 py-1 text-xs font-medium">{segment.replace(/_/g, ' ')} <span className="tabular-nums text-[var(--text-secondary)]">({count})</span></span>
            ))}
          </div>
          <p className="mt-2 text-xs text-[var(--text-secondary)]">Deterministic analytical segments computed from VIA-tracked orders only. A customer can carry more than one tag. This is never the Zoho pricing Tier — see docs/metric-registry.md. Ask Jarvis for forecasts, scenarios, concentration/Pareto, cohort retention, and decision briefs, which need explicit date ranges better suited to a conversation than a fixed dashboard grain.</p>
        </div>
      </Section>}

      {data.decisionEngineering && <Section title="Extended Data Quality">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Card label="Duplicate Customer Groups" value={data.decisionEngineering.extendedDataQuality.duplicateCustomerGroups.count === null ? '—' : String(data.decisionEngineering.extendedDataQuality.duplicateCustomerGroups.count)} sub={data.decisionEngineering.extendedDataQuality.duplicateCustomerGroups.snapshotComputedAt ? `as of ${new Date(data.decisionEngineering.extendedDataQuality.duplicateCustomerGroups.snapshotComputedAt).toLocaleString('en-ID')}` : 'no scan yet'} />
          <Card label="Orphan Product Codes" value={String(data.decisionEngineering.extendedDataQuality.orphanProductCodes)} />
          <Card label="Customers Missing Salesperson" value={`${data.decisionEngineering.extendedDataQuality.customersMissingSalesperson.missingSalesperson} / ${data.decisionEngineering.extendedDataQuality.customersMissingSalesperson.activeCustomers}`} />
          <Card label="Open Pricing-Resolution Findings" value={String(data.decisionEngineering.extendedDataQuality.priceResolutionFailuresOpen)} />
        </div>
        <div className="flex flex-wrap gap-2">
          {data.decisionEngineering.extendedDataQuality.syncFreshness.map(s => (
            <span key={s.jobName} className={`rounded-full px-3 py-1 text-xs font-medium ${s.stale ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}>
              {s.jobName}: {s.hoursSinceLastSuccess === null ? 'never synced' : `${Math.round(s.hoursSinceLastSuccess)}h ago`}{s.stale && ' — stale'}
            </span>
          ))}
        </div>
      </Section>}
    </>}
  </div></div>;
}
