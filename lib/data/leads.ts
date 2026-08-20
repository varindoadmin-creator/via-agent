// Sub-dealer recruitment targets — sourced from the Varindo Distribution Pyramid
// research (Level 2: local toko HPL). Reference data is static; outreach
// progress (stage/notes) is tracked separately in Supabase (see /api/leads).

import { normalizeLeadRecord } from '../leadCleanup/rules';

export type LamitakStatus = 'yes' | 'unconfirmed' | 'no';

export interface Lead {
  id: string;
  rank: number;
  tier: string;
  tierGroup: 'top' | 'tier1' | 'tier2';
  province: string;
  city: string;
  storeName: string;
  address: string;
  contact: string;
  carriesLamitak: LamitakStatus;
  carriesLamitakNote: string;
  otherBrands: string;
  whyGood: string;
  proposedTerritory: string;
  recruitmentAction: string;
}

function tierGroup(tier: string): Lead['tierGroup'] {
  if (tier.includes('TOP PRIORITY')) return 'top';
  if (tier.includes('TIER 2')) return 'tier2';
  return 'tier1';
}

function lamitakStatus(note: string): LamitakStatus {
  if (note.startsWith('YES')) return 'yes';
  if (note.startsWith('Not confirmed') || note.startsWith('N/A')) return 'unconfirmed';
  return 'no';
}

const RAW: Array<Omit<Lead, 'tierGroup' | 'carriesLamitak'>> = [
  {
    id: 'makmur-jaya-serpong', rank: 1, tier: '⭐ TIER 1 — Immediate',
    province: 'Banten', city: 'Tangerang Selatan – Serpong', storeName: 'Makmur Jaya Serpong',
    address: 'Jl. Raya Serpong No.65, Cilenggang, Serpong, Tangsel 15310',
    contact: '021-29308080 / @makmurjayaserpong (Instagram)',
    carriesLamitakNote: 'YES — listed in Instagram bio',
    otherBrands: 'Aica, Carta, Taco, Huben, Harfit, Ecoware, Splendor, Blum, Hafele, Hettich',
    whyGood: 'Already stocking Lamitak. 7,600+ Tokopedia followers, active Instagram. Largest multi-brand HPL store in Serpong. Converting to formal sub-dealer = territory rights + better pricing from Varindo.',
    proposedTerritory: 'Tangerang Selatan, Pondok Aren, BSD, Ciputat',
    recruitmentAction: 'Visit in person. Formalize: territory agreement + Varindo sub-dealer pricing + sample book.',
  },
  {
    id: 'berkat-sejati-hpl', rank: 2, tier: '⭐ TIER 1 — Immediate',
    province: 'Banten', city: 'Tangerang Kab. – Kelapa Dua', storeName: 'Berkat Sejati HPL',
    address: 'Jl. Kelapa Dua Raya No.61-62, Kec. Kelapa Dua, Kab. Tangerang 15810',
    contact: '0812-5020-5030 / @berkatsejatitangerang',
    carriesLamitakNote: 'YES — listed in Instagram bio',
    otherBrands: 'Aica, Carta, Taco, Huben, CS HPL, Hafele, Blum, Hettich, FGV',
    whyGood: 'Already stocking Lamitak. 7,708 Instagram followers. Located near Gading Serpong / Paramount furniture cluster. High-traffic store. Formal sub-dealer = Kabupaten Tangerang coverage.',
    proposedTerritory: 'Kabupaten Tangerang – Kelapa Dua, Pasar Kemis, Cikupa, Legok, Balaraja',
    recruitmentAction: 'Visit in person. Formalize sub-dealer agreement. Already a customer — just needs official terms.',
  },
  {
    id: 'trendku-jakarta-barat', rank: 3, tier: '⭐ TIER 1 — Immediate',
    province: 'DKI Jakarta', city: 'Jakarta Barat – Tamansari / Glodok', storeName: 'TrendKU (Jl. Pinangsia Raya)',
    address: 'Jl. Pinangsia Raya No.59, Tamansari, Jakarta Barat 11110',
    contact: '0811-9621-550 / trendku.id',
    carriesLamitakNote: 'YES — listed on trendku.id/hpl pages',
    otherBrands: 'Greenlam, Splendor, AICA, Formica, Arborite, Wilsonart, Taco, Carta, Grasmerino, Violam, Homega',
    whyGood: 'Carries 15+ HPL brands including Lamitak. Highest brand diversity found in Jakarta. Converting to formal sub-dealer = preferred Lamitak pricing + Jakarta territory exclusivity.',
    proposedTerritory: 'DKI Jakarta – Jakarta Barat, Pusat, Utara, Timur',
    recruitmentAction: 'Approach with sub-dealer pricing advantage. They already carry Lamitak — lock in the relationship with formal terms.',
  },
  {
    id: 'winston-sukses-abadi-kembangan', rank: 4, tier: 'TIER 1',
    province: 'DKI Jakarta', city: 'Jakarta Barat – Kembangan', storeName: 'Winston – Sukses Abadi (Kembangan)',
    address: 'Jl. Pesanggrahan Raya No.10A-B, Kembangan Selatan, Jakarta Barat 11610',
    contact: '021-5808801 / 0812-8325-3637 / winston-best-hpl.com',
    carriesLamitakNote: 'Not confirmed — needs verification',
    otherBrands: 'Winston HPL, Taco HPL, Huben, PVC Sheet, Edging, Hardware',
    whyGood: 'Well-established multi-branch HPL store (3 branches: Kembangan, Meruya, Serpong). High Google Maps rating (4.7). Large customer base of furniture workshops. Adding Lamitak = differentiation from own-brand Winston.',
    proposedTerritory: 'Jakarta Barat, Jakarta Selatan (Meruya branch), Serpong (Serpong branch)',
    recruitmentAction: 'Pitch Lamitak as premium addition above Winston brand. Stress Varindo sub-dealer price advantage.',
  },
  {
    id: 'esa-trading-bandung', rank: 5, tier: '⭐ TIER 1',
    province: 'Jawa Barat', city: 'Kota Bandung – Moch Toha', storeName: 'ESA Trading Bandung',
    address: 'Jl. Moch. Toha No.286, Kota Bandung 40243',
    contact: 'Via esa_trading.indonetwork.co.id',
    carriesLamitakNote: 'Not confirmed — likely not yet',
    otherBrands: 'Grasmerino HPL, Violam HPL, Vio Sheet, Taco HPL, Taco Sheet, Hafele',
    whyGood: "Authorized dealer for 3 HPL brands + Hafele hardware. Jl. Moch. Toha is Bandung's interior material street. Adding Lamitak = premium tier they currently lack above Grasmerino.",
    proposedTerritory: 'Kota Bandung, Kota Cimahi, Kab. Bandung Barat',
    recruitmentAction: "Pitch: 'Lamitak is the Thai premium brand your competitors on Jl. Moch. Toha don't have yet.' First-mover advantage in Bandung.",
  },
  {
    id: 'cv-rajawali-decoration', rank: 6, tier: 'TIER 1',
    province: 'Jawa Barat', city: 'Kota Bandung – Rajawali', storeName: 'CV Rajawali Decoration',
    address: 'Jl. Rajawali Barat No.39, Kota Bandung',
    contact: 'Via indonetwork.co.id',
    carriesLamitakNote: 'Not confirmed',
    otherBrands: 'Taco, Himmel, ORI, Grasmerino, Eco, Artform, Formica, Supre HPL (8 brands)',
    whyGood: 'Widest brand portfolio found in Bandung (8 brands). A store that collects brands actively is the easiest to pitch a new one to. Lamitak fills their premium gap.',
    proposedTerritory: 'Bandung – Rajawali area, Bandung Utara',
    recruitmentAction: 'Collector store: easiest to add Lamitak. Emphasize unique Lamitak designs not available elsewhere.',
  },
  {
    id: 'adypeny-semarang', rank: 7, tier: '⭐ TIER 1',
    province: 'Jawa Tengah', city: 'Kota Semarang – Sendowo', storeName: 'Adypeny (PT Adypeny Selaras Jaya)',
    address: 'Jl. Sendowo No.5-6, Semarang 50137',
    contact: '087832460832 / adypeny.com',
    carriesLamitakNote: 'Not confirmed — verify',
    otherBrands: 'Carta HPL, Homega HPL, CS Laminates, PVC Sheet, Hardware (1,000+ SKU)',
    whyGood: 'Established since 1980s. 1,000+ SKU. The most documented HPL distributor in Central Java. Adds Lamitak = premium Thai brand entry point for Semarang market. Serves furniture workshops across Jawa Tengah.',
    proposedTerritory: 'Kota Semarang, Kab. Semarang, Demak, Kendal, Grobogan',
    recruitmentAction: "Key Central Java anchor. Approach as the Semarang/Jateng sub-dealer. Pitch: 'Lamitak for your clients who want above Carta but below Greenlam.'",
  },
  {
    id: 'cs-laminates-gallery-semarang', rank: 8, tier: 'TIER 2',
    province: 'Jawa Tengah', city: 'Kota Semarang – PIKA', storeName: 'CS Laminates Gallery Semarang',
    address: 'Komplek PIKA, Jl. Imam Bonjol No.96, Pandansari, Semarang Tengah 50139',
    contact: '0813-9150-9009',
    carriesLamitakNote: 'Not confirmed',
    otherBrands: 'CS Laminates HPL, CS Edging, Catalite, Saca',
    whyGood: 'Official CS Laminates gallery. Well-trafficked by interior professionals. PIKA = furniture & interior school complex = high contractor traffic daily. Lamitak as premium add-on above CS.',
    proposedTerritory: 'Kota Semarang (Semarang Tengah)',
    recruitmentAction: 'Good secondary target in Semarang. May have CS exclusivity clause — verify before approaching.',
  },
  {
    id: 'qhomemart-yogyakarta', rank: 9, tier: '⭐ TIER 1',
    province: 'DI Yogyakarta', city: 'Kab. Bantul – Banguntapan', storeName: 'Qhomemart Yogyakarta',
    address: 'Jl. Raya Janti / Ringroad Timur No.96, Banguntapan, Bantul 55198',
    contact: '0274-4932288 / qhomemart.com',
    carriesLamitakNote: 'Not confirmed',
    otherBrands: "HPL (multi-brand), Flooring, Vinyl (self-described 'terlengkap di Jogja')",
    whyGood: 'Self-described largest HPL store in Yogyakarta. Large format store. Own website. Daily contractor traffic. Yogyakarta underserved for premium HPL. First store to carry Lamitak in Yogyakarta = market dominance.',
    proposedTerritory: 'DI Yogyakarta – Kota Yogyakarta, Sleman, Bantul',
    recruitmentAction: "Yogyakarta is a gap. Qhomemart is the obvious anchor. Pitch: 'Be the only store in Yogyakarta with Lamitak.'",
  },
  {
    id: 'santoso-jaya-rungkut', rank: 10, tier: '⭐⭐ TOP PRIORITY',
    province: 'Jawa Timur', city: 'Kota Surabaya – Rungkut', storeName: 'Santoso Jaya HPL (Rungkut HQ)',
    address: 'Jl. Raya Rungkut Tengah No.77a, Gn. Anyar, Surabaya 60293',
    contact: 'santosojaya.com',
    carriesLamitakNote: 'Not confirmed',
    otherBrands: 'HPL, Vinyl, Flooring, Plywood, Edging, Wall Panel (multi-brand, 6 branches)',
    whyGood: '6-branch HPL chain across Surabaya, Sidoarjo, Malang, Kediri. Largest HPL distribution network in East Java. One sub-dealer agreement = Lamitak in 6 cities instantly. Highest-leverage single account in the database.',
    proposedTerritory: 'Surabaya, Sidoarjo, Malang, Kediri — all of East Java',
    recruitmentAction: 'Single conversation = 6-city coverage. Visit Rungkut HQ first. This is the most important sub-dealer recruitment Varindo can make.',
  },
  {
    id: 'santoso-jaya-bubutan', rank: 11, tier: 'TIER 1 (via Santoso Jaya HQ)',
    province: 'Jawa Timur', city: 'Kota Surabaya – Bubutan', storeName: 'Santoso Jaya HPL – Bubutan branch',
    address: 'Jl. Pahlawan No.34, Alun-alun Contong, Bubutan, Surabaya 60174',
    contact: 'santosojaya.com',
    carriesLamitakNote: 'Not confirmed',
    otherBrands: 'Same as Santoso Jaya network',
    whyGood: "Bubutan is in Surabaya's furniture/interior material district. Second Santoso Jaya branch for Surabaya coverage.",
    proposedTerritory: 'Surabaya Pusat / Bubutan area',
    recruitmentAction: 'Supply flows Varindo → Santoso Jaya Rungkut → all branches including Bubutan.',
  },
  {
    id: 'santoso-jaya-wiyung', rank: 12, tier: 'TIER 1 (via Santoso Jaya HQ)',
    province: 'Jawa Timur', city: 'Kota Surabaya – Wiyung', storeName: 'Santoso Jaya HPL – Wiyung branch',
    address: 'Jl. Raya Menganti No.412, Wiyung, Surabaya 60227',
    contact: '0877-5207-8586 / @hpl_bersama.wiyung',
    carriesLamitakNote: 'Not confirmed',
    otherBrands: 'Taco HPL, Triplek, Lem Kuning, Aksesori',
    whyGood: 'West Surabaya branch. Instagram confirmed active (@hpl_bersama.wiyung, 920 followers).',
    proposedTerritory: 'Surabaya Barat / Wiyung',
    recruitmentAction: 'Active Instagram = active sales. Part of Santoso Jaya network.',
  },
  {
    id: 'unique-carpet-deco-bali', rank: 13, tier: '⭐ TIER 1',
    province: 'Bali', city: 'Kota Denpasar', storeName: 'Unique Carpet Deco Bali',
    address: 'Denpasar, Bali (showroom)',
    contact: 'uniquecarpetdecobali.com',
    carriesLamitakNote: 'Not confirmed',
    otherBrands: 'Taco HPL, Taco Ultimate, Taco PVC Sheet, Taco Edging, Taco Vinyl (full Taco range)',
    whyGood: 'Official Taco distributor for Bali. Serves hotel/villa/resort projects. Bali = premium HPL = Lamitak positioning. Adding Lamitak = premium upgrade option above Taco for their hospitality clients.',
    proposedTerritory: 'Kota Denpasar, Kab. Badung, Kab. Gianyar, Kab. Tabanan',
    recruitmentAction: "Bali hospitality projects = high-value, spec-driven. Lamitak's design range fits. Pitch as 'the Thai premium brand your Bali clients need.'",
  },
  {
    id: 'profil-indah-bali', rank: 14, tier: 'TIER 2',
    province: 'Bali', city: 'Kota Denpasar – Buluh Indah', storeName: 'Profil Indah Bali',
    address: 'Jl. Buluh Indah No.54C, Denpasar, Bali',
    contact: '085100400588',
    carriesLamitakNote: 'Not confirmed',
    otherBrands: 'CS Laminates, Taco HPL',
    whyGood: "CS Laminates + Taco authorized agent in Bali. Multi-brand posture = open to adding Lamitak. Good secondary Bali sub-dealer if Unique Carpet Deco is Taco-exclusive.",
    proposedTerritory: 'Kota Denpasar, Denpasar Selatan',
    recruitmentAction: "Fallback if Unique Carpet Deco can't add brands. Or recruit both for different Bali areas.",
  },
  {
    id: 'cv-bogor-hpl', rank: 15, tier: 'TIER 2',
    province: 'Jawa Barat', city: 'Kab. Bogor – Tegal Gundil', storeName: 'CV Bogor HPL',
    address: 'Ruko Pandu Raya No.21, Jl. Achmad Adnawijaya, Tegal Gundil, Bogor Utara 16152',
    contact: 'Via indonetwork.co.id',
    carriesLamitakNote: 'Not confirmed',
    otherBrands: 'Splendor/Greenlam HPL, Great Wall/Frantinco HPL, Parquet, Vinyl',
    whyGood: 'Premium-brand oriented store (Greenlam, Great Wall). Already in upper segment. Lamitak fits perfectly alongside or between Greenlam and standard brands. Serves active Bogor contractor market.',
    proposedTerritory: 'Kota Bogor, Kab. Bogor Selatan, Bogor Utara',
    recruitmentAction: 'Approach as the Bogor sub-dealer. Premium orientation = natural Lamitak customer.',
  },
];

export const LEADS: Lead[] = RAW.map(r => {
  const normalized = normalizeLeadRecord({ customer_name: r.storeName, phone: r.contact, address: r.address }, 'business');
  return {
    ...r,
    storeName: normalized.customer_name,
    contact: normalized.phone,
    address: normalized.address,
    tierGroup: tierGroup(r.tier),
    carriesLamitak: lamitakStatus(r.carriesLamitakNote),
  };
});

// ─── 30-day recruitment plan (reference only, not per-lead tracked) ───────────

export interface RecruitmentPlanItem {
  action: string;
  target: string;
  whatToDo: string;
  successMetric: string;
}

export interface RecruitmentPlanWeek {
  label: string;
  items: RecruitmentPlanItem[];
}

export const RECRUITMENT_PLAN: RecruitmentPlanWeek[] = [
  {
    label: 'PRE-WORK (Before Day 1)',
    items: [
      { action: 'Prepare the sub-dealer pitch', target: 'All Level 2 targets', whatToDo: 'Create a 1-page sub-dealer offer document showing: (1) Lamitak brand overview, (2) Pricing tier (their buy price from Varindo vs. their recommended sell price), (3) Territory map, (4) What Varindo provides (sample books, catalog access, delivery, support).', successMetric: '1-page sub-dealer offer document ready' },
      { action: 'Prepare sample books', target: 'All Level 2 targets', whatToDo: 'Order 5–10 Lamitak sample books from PT. TAK Products and Services Indonesia (Alam Sutera). These will be left with each sub-dealer at the recruitment visit.', successMetric: 'Sample books in hand before Week 1 visits' },
      { action: 'Set up Varindo sub-dealer WhatsApp group template', target: 'Internal', whatToDo: 'Create a WhatsApp group structure for order management: Varindo team + sub-dealer contact. Establish order process: WA order → Varindo confirms stock → invoice → delivery.', successMetric: 'Order process documented and ready to deploy' },
    ],
  },
  {
    label: 'WEEK 1 — Convert confirmed Lamitak carriers',
    items: [
      { action: 'Visit Makmur Jaya Serpong', target: 'Jl. Raya Serpong No.65, Tangsel. @makmurjayaserpong', whatToDo: 'They already carry Lamitak. Visit in person. Present: (1) Formal sub-dealer agreement, (2) Better pricing than walk-in, (3) Tangsel territory exclusivity at sub-dealer price, (4) Leave sample book. Agree on minimum monthly order.', successMetric: 'Signed/agreed sub-dealer arrangement. First Lamitak order placed via Varindo.' },
      { action: 'Visit Berkat Sejati HPL', target: 'Jl. Kelapa Dua Raya No.61-62, Kab. Tangerang. @berkatsejatitangerang', whatToDo: 'Already carries Lamitak per Instagram. Same approach: formalize the relationship. Kab. Tangerang territory. Leave sample book. Instagram co-branding proposal (tag @varindo in Lamitak posts).', successMetric: 'Formal agreement. Kab. Tangerang territory assigned.' },
      { action: 'WhatsApp outreach to TrendKU', target: '0811-9621-550 / trendku.id', whatToDo: "They list Lamitak on their website (lamitak.hpl.co.id). Send a formal introduction via WA: 'Kami Varindo, D2 Authorized Dealer Lamitak Indonesia. Kami ingin memformalisasi hubungan distribusi Lamitak dengan TrendKU di Jakarta.' Arrange a meeting.", successMetric: 'Meeting scheduled with TrendKU for Week 2.' },
    ],
  },
  {
    label: 'WEEK 2 — Pitch non-Lamitak stores in Jakarta & Bandung',
    items: [
      { action: 'Visit Winston Sukses Abadi (Kembangan)', target: 'Jl. Pesanggrahan Raya No.10A-B, Jakarta Barat. 021-5808801', whatToDo: 'Approach as a new brand addition above Winston HPL. Frame Lamitak as the premium international tier they can add for contractors and designers wanting something beyond their own brand. Present sub-dealer pricing + sample book.', successMetric: 'Agreement to trial Lamitak. First trial order placed.' },
      { action: 'Visit ESA Trading Bandung', target: 'Jl. Moch. Toha No.286, Bandung', whatToDo: "Pitch: 'Lamitak fills the gap above Grasmerino and below Greenlam — a Thai premium brand not yet on Jl. Moch. Toha.' Present sub-dealer pricing + Bandung territory exclusivity. Leave sample book.", successMetric: 'Agreement in principle. Bandung territory assigned to ESA Trading.' },
      { action: 'Meet TrendKU in Jakarta', target: 'Jl. Pinangsia Raya No.59, Tamansari, Jakarta Barat', whatToDo: 'Follow up Week 1 WA outreach with in-person visit. They already carry Lamitak — formalize: Jakarta sub-dealer pricing, sample books for their showroom, co-branding on their website/social.', successMetric: 'TrendKU formally onboarded as Jakarta sub-dealer.' },
    ],
  },
  {
    label: 'WEEK 3 — East Java & Central Java',
    items: [
      { action: 'Visit Santoso Jaya HPL HQ (Rungkut, Surabaya)', target: 'Jl. Raya Rungkut Tengah No.77a, Surabaya. santosojaya.com', whatToDo: 'This is the most important visit. 6 branches = 6-city coverage. Present: (1) Sub-dealer agreement for all East Java, (2) Supply from Varindo to Surabaya HQ, (3) They distribute Lamitak to their 6 branches. Bring full sample set + pricing proposal.', successMetric: 'East Java sub-dealer agreement signed. Varindo becomes Lamitak supplier for all 6 Santoso Jaya branches.' },
      { action: 'Visit Adypeny Semarang', target: 'Jl. Sendowo No.5-6, Semarang. adypeny.com. 087832460832', whatToDo: 'Central Java anchor. 1,000+ SKU dealer. Pitch Lamitak as premium addition for their customer base. Sub-dealer pricing + Semarang/Jateng territory. Drop sample book.', successMetric: 'Adypeny onboarded as Central Java sub-dealer.' },
    ],
  },
  {
    label: 'WEEK 4 — Yogyakarta & Bali',
    items: [
      { action: 'Visit Qhomemart Yogyakarta', target: 'Jl. Raya Janti No.96, Banguntapan, Bantul. 0274-4932288', whatToDo: "Pitch: 'Be the first and only store in Yogyakarta with Lamitak.' Yogyakarta is completely unserved for Lamitak right now. Territory exclusivity is a strong incentive. Bring sample book.", successMetric: 'Yogyakarta sub-dealer onboarded. Varindo has DIY coverage.' },
      { action: 'Visit Unique Carpet Deco Bali', target: 'Denpasar, Bali. uniquecarpetdecobali.com', whatToDo: "Pitch Lamitak as a premium complement to Taco for Bali's hospitality clients. Hotel/villa clients want options above standard Taco. Sub-dealer pricing + Bali/Badung territory. Drop Lamitak sample book.", successMetric: 'Bali sub-dealer onboarded. Varindo has Bali coverage.' },
    ],
  },
  {
    label: 'MONTH 2 ONWARDS — Scale',
    items: [
      { action: 'Activate Level 2 sub-dealers', target: 'All onboarded stores', whatToDo: 'Monitor monthly orders from each sub-dealer. Provide ongoing support: new collection updates, motif availability, fast restock. Set up quarterly business review with top 3 sub-dealers.', successMetric: 'Monthly order volume tracking per sub-dealer. Target: 50+ sheets/month per active sub-dealer.' },
      { action: 'Recruit secondary Level 2 stores', target: 'CV Rajawali Bandung, CV Bogor HPL, Profil Indah Bali, secondary Semarang stores', whatToDo: 'With proof from Month 1 success, approach Tier 2 stores with evidence that Lamitak is moving in their city. Secondary stores are easier to recruit once the first in each city is onboarded.', successMetric: '3–5 additional sub-dealers onboarded by Month 2 end.' },
      { action: 'Influence Level 3 end customers', target: 'Interior contractors, bengkel kayu, kitchen set makers', whatToDo: 'Ask each Level 2 sub-dealer to push Lamitak sample books to their top 5 contractor clients. Offer Varindo to provide those sample books free. This pulls through demand from Level 3 to Level 2.', successMetric: '10+ contractors in each city have Lamitak sample books. Contractor-driven orders start flowing.' },
    ],
  },
];
