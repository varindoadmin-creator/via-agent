// ─── Brand relationships — dealer status & brand websites ─────────────────────
// VIA Product/Pricing/Company Architecture brief, sections 12-14, 25: approved
// wording only. Never upgraded to "exclusive/sole/master distributor" unless
// separately approved (brief section 12's explicit guard) — enforced by only
// ever exposing these two fixed sentences, never a template that could be
// filled in with a stronger claim.

export type BrandName = 'LAMITAK' | 'EDL';

export interface BrandRelationship {
  brand: BrandName;
  dealerStatement: string;
  website: string;
}

export const BRAND_RELATIONSHIPS: Record<BrandName, BrandRelationship> = {
  LAMITAK: {
    brand: 'LAMITAK',
    dealerStatement: 'Varindo is an Authorized Dealer of Lamitak.',
    website: 'varindo.co.id',
  },
  EDL: {
    brand: 'EDL',
    dealerStatement: 'Varindo is an Authorized Dealer of EDL in Indonesia.',
    website: 'varindohpl.com',
  },
};

export function getBrandRelationship(brand: BrandName): BrandRelationship {
  return BRAND_RELATIONSHIPS[brand];
}
