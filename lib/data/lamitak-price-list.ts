// Lamitak Official Price List — Effective July 2025
// Source: CV. Varindo Forma Hutama official price list PDF
// All prices in IDR (Indonesian Rupiah), EXCLUDE PPN/VAT
// Do NOT disclose purchase rates or internal margins

export interface LamitakSheetPrice {
  articleNo: string;
  range: string;
  thickness: string;
  price4x8: number | null;   // per sheet, size 4' x 8'
  price4x10: number | null;  // per sheet, size 4' x 10'
}

export interface LamitakEdgingPrice {
  articleNo: string;
  range: string;
  type: string; // EAS, EAW, EAP, EMS, EMP, EMW
  rollPrice23x1mm: number | null;   // per roll 100m, size 23x1mm
  rollPrice44x1mm: number | null;   // per roll 100m, size 44x1mm
  per10mPrice23x1mm: number | null; // per 10 metre, size 23x1mm
  per10mPrice44x1mm: number | null; // per 10 metre, size 44x1mm
}

// ─── SHEET PRICES (Page 1) ───────────────────────────────────────────────────

export const LAMITAK_SHEET_PRICES: LamitakSheetPrice[] = [
  // Solids
  { articleNo: "CES",                         range: "Solids",      thickness: "0.7mm", price4x8: 400000,  price4x10: 570000  },
  { articleNo: "PCA",                         range: "Solids",      thickness: "0.7mm", price4x8: 500000,  price4x10: null    },
  { articleNo: "SCA",                         range: "Solids",      thickness: "0.7mm", price4x8: 550000,  price4x10: 720000  },
  { articleNo: "SCM",                         range: "Solids",      thickness: "0.7mm", price4x8: 550000,  price4x10: null    },
  { articleNo: "SCT",                         range: "Solids",      thickness: "0.7mm", price4x8: 550000,  price4x10: 720000  },
  { articleNo: "SCX",                         range: "Solids",      thickness: "0.7mm", price4x8: 550000,  price4x10: null    },
  { articleNo: "SHG",                         range: "Solids",      thickness: "1.0mm", price4x8: 680000,  price4x10: null    },
  // Solids+
  { articleNo: "TSP",                         range: "Solids+",     thickness: "0.7mm", price4x8: 700000,  price4x10: 870000  },
  { articleNo: "TSW",                         range: "Solids+",     thickness: "0.7mm", price4x8: 700000,  price4x10: 870000  },
  // Woods
  { articleNo: "WG",                          range: "Woods",       thickness: "0.7mm", price4x8: 680000,  price4x10: 850000  },
  { articleNo: "WY",                          range: "Woods",       thickness: "0.7mm", price4x8: 700000,  price4x10: 870000  },
  { articleNo: "WYA",                         range: "Woods",       thickness: "0.7mm", price4x8: 700000,  price4x10: 870000  },
  { articleNo: "WHG",                         range: "Woods",       thickness: "1.0mm", price4x8: 700000,  price4x10: null    },
  // Patterns
  { articleNo: "MTA",                         range: "Patterns",    thickness: "0.7mm", price4x8: 550000,  price4x10: null    },
  { articleNo: "MEP",                         range: "Patterns",    thickness: "0.7mm", price4x8: 700000,  price4x10: null    },
  { articleNo: "DXN",                         range: "Patterns",    thickness: "0.7mm", price4x8: 700000,  price4x10: null    },
  { articleNo: "DXO",                         range: "Patterns",    thickness: "0.7mm", price4x8: 700000,  price4x10: 870000  },
  { articleNo: "DXO 4316G",                   range: "Patterns",    thickness: "1.0mm", price4x8: 700000,  price4x10: null    },
  { articleNo: "DXP",                         range: "Patterns",    thickness: "0.7mm", price4x8: 750000,  price4x10: 920000  },
  { articleNo: "DXP 4318G/4319G/4320G/4321G", range: "Patterns",    thickness: "1.0mm", price4x8: 750000,  price4x10: null    },
  { articleNo: "DXP 1354G/1355G/1358G",       range: "Patterns",    thickness: "1.0mm", price4x8: 750000,  price4x10: null    },
  // Savile
  { articleNo: "ARTE",                        range: "Savile",      thickness: "0.7mm", price4x8: 950000,  price4x10: null    },
  // Bookmatched
  { articleNo: "ART",                         range: "Bookmatched", thickness: "0.7mm", price4x8: 1400000, price4x10: 1800000 },
  // Solid Core
  { articleNo: "CC 47101S",                   range: "Solid Core",  thickness: "1.0mm", price4x8: 1950000, price4x10: null    },
  { articleNo: "CC 47101G",                   range: "Solid Core",  thickness: "1.0mm", price4x8: 1950000, price4x10: null    },
  { articleNo: "CC 47101B",                   range: "Solid Core",  thickness: "1.0mm", price4x8: 2200000, price4x10: null    },
  { articleNo: "CCM",                         range: "Solid Core",  thickness: "1.0mm", price4x8: 2200000, price4x10: null    },
  { articleNo: "CCP",                         range: "Solid Core",  thickness: "1.0mm", price4x8: 2200000, price4x10: null    },
  { articleNo: "CCX",                         range: "Solid Core",  thickness: "1.0mm", price4x8: 2200000, price4x10: null    },
  // Protak
  { articleNo: "ATS",                         range: "Protak",      thickness: "0.7mm", price4x8: 1850000, price4x10: 2300000 },
  { articleNo: "ATP",                         range: "Protak",      thickness: "0.7mm", price4x8: 2100000, price4x10: 2600000 },
  { articleNo: "ATW",                         range: "Protak",      thickness: "0.7mm", price4x8: 2100000, price4x10: 2600000 },
  // Protak Core
  { articleNo: "CATS",                        range: "Protak Core", thickness: "1.0mm", price4x8: null,    price4x10: 3200000 },
  { articleNo: "CATP",                        range: "Protak Core", thickness: "1.0mm", price4x8: null,    price4x10: 3500000 },
];

// ─── EDGING PRICES (Page 2) ──────────────────────────────────────────────────

export const LAMITAK_EDGING_PRICES: LamitakEdgingPrice[] = [
  // Solids & Solids+ — EAS
  { articleNo: "SCA",  range: "Solids & Solids+", type: "EAS", rollPrice23x1mm: 18000, rollPrice44x1mm: null,  per10mPrice23x1mm: 20000, per10mPrice44x1mm: null  },
  { articleNo: "SCX",  range: "Solids & Solids+", type: "EAS", rollPrice23x1mm: 18000, rollPrice44x1mm: null,  per10mPrice23x1mm: 20000, per10mPrice44x1mm: null  },
  { articleNo: "SCM",  range: "Solids & Solids+", type: "EAS", rollPrice23x1mm: 18000, rollPrice44x1mm: null,  per10mPrice23x1mm: 20000, per10mPrice44x1mm: null  },
  { articleNo: "TSP",  range: "Solids & Solids+", type: "EAS", rollPrice23x1mm: 18000, rollPrice44x1mm: null,  per10mPrice23x1mm: 20000, per10mPrice44x1mm: null  },
  { articleNo: "TSW",  range: "Solids & Solids+", type: "EAS", rollPrice23x1mm: 18000, rollPrice44x1mm: null,  per10mPrice23x1mm: 20000, per10mPrice44x1mm: null  },
  { articleNo: "SHG",  range: "Solids & Solids+", type: "EAS", rollPrice23x1mm: 18000, rollPrice44x1mm: null,  per10mPrice23x1mm: 20000, per10mPrice44x1mm: null  },
  // Woods — EAW
  { articleNo: "WG",   range: "Woods",            type: "EAW", rollPrice23x1mm: 18000, rollPrice44x1mm: 30000, per10mPrice23x1mm: 20000, per10mPrice44x1mm: 35000 },
  { articleNo: "WY",   range: "Woods",            type: "EAW", rollPrice23x1mm: 18000, rollPrice44x1mm: 30000, per10mPrice23x1mm: 20000, per10mPrice44x1mm: 35000 },
  { articleNo: "WYA",  range: "Woods",            type: "EAW", rollPrice23x1mm: 18000, rollPrice44x1mm: 30000, per10mPrice23x1mm: 20000, per10mPrice44x1mm: 35000 },
  { articleNo: "WHG",  range: "Woods",            type: "EAW", rollPrice23x1mm: 18000, rollPrice44x1mm: 30000, per10mPrice23x1mm: 20000, per10mPrice44x1mm: 35000 },
  // Patterns — EAP
  { articleNo: "DXO",  range: "Patterns",         type: "EAP", rollPrice23x1mm: 18000, rollPrice44x1mm: 30000, per10mPrice23x1mm: 20000, per10mPrice44x1mm: 35000 },
  { articleNo: "DXN",  range: "Patterns",         type: "EAP", rollPrice23x1mm: 18000, rollPrice44x1mm: null,  per10mPrice23x1mm: 20000, per10mPrice44x1mm: null  },
  { articleNo: "DXP",  range: "Patterns",         type: "EAP", rollPrice23x1mm: 18000, rollPrice44x1mm: 30000, per10mPrice23x1mm: 20000, per10mPrice44x1mm: 35000 },
  // Protak Anti-Fingerprint
  { articleNo: "ATS",  range: "Protak",           type: "EMS", rollPrice23x1mm: 30000, rollPrice44x1mm: 43000, per10mPrice23x1mm: 35000, per10mPrice44x1mm: 48000 },
  { articleNo: "ATP",  range: "Protak",           type: "EMP", rollPrice23x1mm: 30000, rollPrice44x1mm: 43000, per10mPrice23x1mm: 35000, per10mPrice44x1mm: 48000 },
  { articleNo: "ATW",  range: "Protak",           type: "EMW", rollPrice23x1mm: 30000, rollPrice44x1mm: 43000, per10mPrice23x1mm: 35000, per10mPrice44x1mm: 48000 },
];

// ─── LOOKUP HELPERS ──────────────────────────────────────────────────────────

export function lookupSheetPrice(articleCode: string): LamitakSheetPrice[] {
  const q = articleCode.toUpperCase().replace(/\s+/g, " ").trim();
  return LAMITAK_SHEET_PRICES.filter((p) => {
    const code = p.articleNo.toUpperCase().replace(/\s+/g, " ").trim();
    return code === q || code.startsWith(q + " ") || q.startsWith(code + " ");
  });
}

export function lookupEdgingPrice(articleCode: string): LamitakEdgingPrice[] {
  const q = articleCode.toUpperCase().replace(/\s+/g, " ").trim();
  return LAMITAK_EDGING_PRICES.filter((p) => {
    const code = p.articleNo.toUpperCase().replace(/\s+/g, " ").trim();
    return code === q || code.startsWith(q + " ") || q.startsWith(code + " ");
  });
}

export function formatLamitakPrice(price: number | null): string {
  if (price === null) return "-";
  return `Rp ${price.toLocaleString("id-ID")}`;
}

export const LAMITAK_PRICELIST_META = {
  effectiveDate: "July 2025",
  currency: "IDR",
  excludesPPN: true,
  source: "CV. Varindo Forma Hutama — Official Lamitak Price List",
};
