export type GoogleAdsCampaignRow = {
  campaign: { id?: string; name?: string; status?: string };
  metrics?: {
    impressions?: string | number;
    clicks?: string | number;
    costMicros?: string | number;
    conversions?: string | number;
    conversionsValue?: string | number;
  };
};

export type CampaignMetrics = {
  id: string;
  name: string;
  status: string;
  impressions: number;
  clicks: number;
  cost: number;
  conversions: number;
  conversion_value: number;
  ctr: number;
  average_cpc: number;
  cost_per_conversion: number;
};

export type BrandMetrics = CampaignMetrics & { campaigns: CampaignMetrics[] };

const number = (value: unknown): number => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

export function normalizeCampaign(row: GoogleAdsCampaignRow): CampaignMetrics {
  const impressions = number(row.metrics?.impressions);
  const clicks = number(row.metrics?.clicks);
  const cost = number(row.metrics?.costMicros) / 1_000_000;
  const conversions = number(row.metrics?.conversions);
  return {
    id: String(row.campaign?.id || ''),
    name: String(row.campaign?.name || 'Unnamed campaign'),
    status: String(row.campaign?.status || 'UNKNOWN'),
    impressions,
    clicks,
    cost,
    conversions,
    conversion_value: number(row.metrics?.conversionsValue),
    ctr: impressions > 0 ? clicks / impressions : 0,
    average_cpc: clicks > 0 ? cost / clicks : 0,
    cost_per_conversion: conversions > 0 ? cost / conversions : 0,
  };
}

export function aggregateCampaigns(name: string, campaigns: CampaignMetrics[]): BrandMetrics {
  const totals = campaigns.reduce((sum, row) => ({
    impressions: sum.impressions + row.impressions,
    clicks: sum.clicks + row.clicks,
    cost: sum.cost + row.cost,
    conversions: sum.conversions + row.conversions,
    conversion_value: sum.conversion_value + row.conversion_value,
  }), { impressions: 0, clicks: 0, cost: 0, conversions: 0, conversion_value: 0 });
  return {
    id: name.toLowerCase(),
    name,
    status: campaigns.some(row => row.status === 'ENABLED') ? 'ENABLED' : campaigns[0]?.status || 'NOT_FOUND',
    ...totals,
    ctr: totals.impressions > 0 ? totals.clicks / totals.impressions : 0,
    average_cpc: totals.clicks > 0 ? totals.cost / totals.clicks : 0,
    cost_per_conversion: totals.conversions > 0 ? totals.cost / totals.conversions : 0,
    campaigns,
  };
}

export function groupBrandCampaigns(campaigns: CampaignMetrics[], matchers: Record<string, string[]>): BrandMetrics[] {
  return Object.entries(matchers).map(([brand, terms]) => {
    const normalizedTerms = terms.map(term => term.trim().toLowerCase()).filter(Boolean);
    const matches = campaigns.filter(campaign => normalizedTerms.some(term => campaign.name.toLowerCase().includes(term)));
    return aggregateCampaigns(brand, matches);
  });
}

export function parseMatcher(value: string | undefined, fallback: string): string[] {
  return (value || fallback).split(',').map(term => term.trim()).filter(Boolean);
}
