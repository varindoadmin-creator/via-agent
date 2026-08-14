import assert from 'node:assert/strict';
import test from 'node:test';
import { aggregateCampaigns, groupBrandCampaigns, normalizeCampaign, parseMatcher } from './report.ts';

test('normalizes Google Ads micros and derived metrics', () => {
  const row = normalizeCampaign({
    campaign: { id: '1', name: 'LAMITAK Search', status: 'ENABLED' },
    metrics: { impressions: '1000', clicks: '50', costMicros: '250000000', conversions: '5', conversionsValue: '9000000' },
  });
  assert.equal(row.cost, 250);
  assert.equal(row.ctr, 0.05);
  assert.equal(row.average_cpc, 5);
  assert.equal(row.cost_per_conversion, 50);
});

test('groups multiple campaigns into the two configured brands', () => {
  const campaigns = [
    normalizeCampaign({ campaign: { id: '1', name: 'Lamitak Search', status: 'ENABLED' }, metrics: { clicks: 4, impressions: 40, costMicros: 8_000_000 } }),
    normalizeCampaign({ campaign: { id: '2', name: 'EDL Display', status: 'PAUSED' }, metrics: { clicks: 2, impressions: 100, costMicros: 3_000_000 } }),
  ];
  const grouped = groupBrandCampaigns(campaigns, { Lamitak: ['lamitak'], EDL: ['edl'] });
  assert.equal(grouped[0].campaigns.length, 1);
  assert.equal(grouped[0].clicks, 4);
  assert.equal(grouped[1].status, 'PAUSED');
});

test('handles empty totals and comma-separated matchers safely', () => {
  assert.deepEqual(parseMatcher('LAMITAK, LTK', 'x'), ['LAMITAK', 'LTK']);
  assert.equal(aggregateCampaigns('EDL', []).average_cpc, 0);
});
