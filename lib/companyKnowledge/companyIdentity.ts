// ─── Company identity — approved static facts ─────────────────────────────────
// VIA Product/Pricing/Company Architecture brief, sections 35-38: the
// approved legal entity, offices, and contact details. All PUBLIC — safe for
// any audience, internal or external.

export interface CompanyIdentity {
  legalName: string;
  headOffice: { lines: string[]; phone: string };
  registeredOffice: { lines: string[]; phone: string };
  contact: { email: string; website: string };
}

export const COMPANY_IDENTITY: CompanyIdentity = {
  legalName: 'CV. VARINDO FORMA HUTAMA',
  headOffice: {
    lines: [
      'Branz BSD Tower A Unit 3310',
      'Jl. BSD Boulevard Parcel 55-F',
      'Tangerang 15339',
      'Banten',
      'Indonesia',
    ],
    phone: '0812 8888 5224',
  },
  registeredOffice: {
    lines: [
      'Ruko Pasar Modern Batununggal Blok RA/06',
      'Kel. Mengger, Kec. Bandung Kidul',
      'Bandung 40267',
      'Jawa Barat',
      'Indonesia',
    ],
    phone: '0812 1001 5224',
  },
  contact: {
    email: 'contact@varindo.co.id',
    website: 'varindo.co.id',
  },
};
