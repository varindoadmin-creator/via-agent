export const PRICE_LIST_TIERS = ['Bronze', 'Bronze Plus', 'Silver', 'Gold', 'Platinum'] as const;
export type PriceListTier = (typeof PRICE_LIST_TIERS)[number];

export const TIER_PRICEBOOK_MAP: Record<PriceListTier, string> = {
  Bronze: '8607767000000225630',
  'Bronze Plus': '8607767000004477463',
  Silver: '8607767000000229114',
  Gold: '8607767000000236082',
  Platinum: '8607767000000232598',
};

export function getPricebookIdByTier(tier: string): string {
  if (tier === 'No Discount') return '';
  return TIER_PRICEBOOK_MAP[tier as PriceListTier] || '';
}

export function filterItemsByActiveIds<T extends { item_id: string }>(
  items: T[],
  activeItemIds: ReadonlySet<string>,
): T[] {
  return items.filter(item => activeItemIds.has(item.item_id));
}
