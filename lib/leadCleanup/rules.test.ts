import assert from 'node:assert/strict';
import test from 'node:test';
import { inferLeadNameKind, normalizeLeadAddress, normalizeLeadPhone, normalizeLeadRecord } from './rules.ts';

test('uses the Customer company-name convention for legal entities', () => {
  const result = normalizeLeadRecord({ customer_name: 'PT. logam mas', phone: '+62 812-3456-7890', address: 'Jl. Mawar  1 ,  Jakarta' });
  assert.equal(result.customer_name, 'LOGAM MAS, PT');
  assert.equal(result.phone, '081234567890');
  assert.equal(result.address, 'Jl. Mawar 1, Jakarta');
  assert.equal(result.nameKind, 'business');
});

test('title-cases clear individual names and leaves unclear single words unchanged', () => {
  assert.equal(normalizeLeadRecord({ customer_name: 'budi santoso' }).customer_name, 'Budi Santoso');
  assert.equal(normalizeLeadRecord({ customer_name: 'TrendKU' }).customer_name, 'TrendKU');
  assert.equal(inferLeadNameKind('TrendKU'), 'unclear');
});

test('normalizes multiple phones without damaging handles or websites', () => {
  assert.equal(normalizeLeadPhone('0812-5020-5030 / @berkatsejati / trendku.id'), '081250205030 / @berkatsejati / trendku.id');
  assert.equal(normalizeLeadAddress(' Ruko 1 ,,  Bandung '), 'Ruko 1, Bandung');
});
