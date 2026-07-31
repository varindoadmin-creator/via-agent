// ─── Customer data-cleanup rules ──────────────────────────────────────────────
// Pure functions that look at a raw Zoho contact record and compute what
// should change, per Varindo's house rules. Used by both the scan (preview)
// and apply routes so the two never drift out of sync — apply always
// recomputes from the live contact rather than trusting client-sent values.

export const TARGET_TAX_ID = '8607767000000093294'; // "PPN [11%]"
export const TARGET_TAX_NAME = 'PPN [11%]';
export const TARGET_ACCOUNT_ID = '8607767000000000364'; // "Accounts Receivable"
export const TARGET_ACCOUNT_NAME = 'Accounts Receivable';
export const TARGET_PAYMENT_TERMS = 0; // "Due on Receipt"
export const TARGET_PAYMENT_TERMS_LABEL = 'Due on Receipt';

// Region routing: Bandung-hub assignment is driven by City (not the broader West Java
// province), North Sumatra customers stay on the Medan hub. Semarang/Surabaya hubs are retired —
// anyone still on them gets moved back to Head Office regardless of what their State says.
const STATE_TO_REGION: Record<string, string> = {
  'North Sumatra': 'MDN-HUB',
};
const DEFAULT_REGION = 'HEAD OFFICE';
const RETIRED_REGIONS = new Set(['SMG-HUB', 'SBY-HUB']);

const PRICEBOOK_TO_TIER: Record<string, string> = {
  'Tier 1 - Bronze': 'Bronze',
  'Tier 2 - Bronze Plus': 'Bronze Plus',
  'Tier 3 - Silver': 'Silver',
  'Tier 4 - Gold': 'Gold',
  'Tier 5 - Platinum': 'Platinum',
};

const LEGAL_SUFFIXES = ['PT', 'CV', 'UD', 'PD', 'FA', 'TBK', 'KOPERASI', 'YAYASAN'];

export const INDONESIA_PROVINCES = [
  // English names — this org's Zoho state dropdown is in English (verified against 68 live
  // customer records: "West Java", "Special Capital Region of Jakarta", "North Sumatra", etc.)
  'Aceh', 'North Sumatra', 'West Sumatra', 'Riau', 'Riau Islands', 'Jambi', 'South Sumatra',
  'Bangka Belitung Islands', 'Bengkulu', 'Lampung', 'Special Capital Region of Jakarta', 'West Java', 'Central Java',
  'Special Region of Yogyakarta', 'East Java', 'Banten', 'Bali', 'West Nusa Tenggara', 'East Nusa Tenggara',
  'West Kalimantan', 'Central Kalimantan', 'South Kalimantan', 'East Kalimantan', 'North Kalimantan',
  'North Sulawesi', 'Gorontalo', 'Central Sulawesi', 'West Sulawesi', 'South Sulawesi', 'Southeast Sulawesi',
  'Maluku', 'North Maluku', 'Papua', 'West Papua', 'Central Papua', 'Highland Papua', 'South Papua', 'Southwest Papua',
];
const PROVINCE_ALIASES: Record<string, string> = {
  'jakarta': 'Special Capital Region of Jakarta',
  'dki': 'Special Capital Region of Jakarta',
  'dki jakarta': 'Special Capital Region of Jakarta',
  'jogja': 'Special Region of Yogyakarta',
  'jogjakarta': 'Special Region of Yogyakarta',
  'yogyakarta': 'Special Region of Yogyakarta',
  'yogya': 'Special Region of Yogyakarta',
  'di yogyakarta': 'Special Region of Yogyakarta',
  // Indonesian-language names, in case an admin typed the local name instead of picking from the dropdown
  'sumatera utara': 'North Sumatra',
  'sumatera barat': 'West Sumatra',
  'kepulauan riau': 'Riau Islands',
  'sumatera selatan': 'South Sumatra',
  'kepulauan bangka belitung': 'Bangka Belitung Islands',
  'jawa barat': 'West Java',
  'jawa tengah': 'Central Java',
  'jawa timur': 'East Java',
  'nusa tenggara barat': 'West Nusa Tenggara',
  'nusa tenggara timur': 'East Nusa Tenggara',
  'kalimantan barat': 'West Kalimantan',
  'kalimantan tengah': 'Central Kalimantan',
  'kalimantan selatan': 'South Kalimantan',
  'kalimantan timur': 'East Kalimantan',
  'kalimantan utara': 'North Kalimantan',
  'sulawesi utara': 'North Sulawesi',
  'sulawesi tengah': 'Central Sulawesi',
  'sulawesi barat': 'West Sulawesi',
  'sulawesi selatan': 'South Sulawesi',
  'sulawesi tenggara': 'Southeast Sulawesi',
  'maluku utara': 'North Maluku',
  'papua barat': 'West Papua',
  'papua tengah': 'Central Papua',
  'papua pegunungan': 'Highland Papua',
  'papua selatan': 'South Papua',
  'papua barat daya': 'Southwest Papua',
};

export interface RawAddress {
  address?: string;
  street2?: string;
  city?: string;
  state?: string;
  state_code?: string;
  zip?: string;
}

/** No Address and no City on file — the two fields treated as "required" for a real address. */
export function isAddressEmpty(a: RawAddress | undefined | null): boolean {
  return !a?.address?.trim() && !a?.city?.trim();
}

export interface RawContact {
  contact_id: string;
  contact_name?: string;
  company_name?: string;
  first_name?: string;
  last_name?: string;
  customer_sub_type?: string; // 'business' | 'individual'
  tax_id?: string;
  account_id?: string;
  payment_terms?: number;
  pricebook_id?: string;
  pricebook_name?: string;
  billing_address?: RawAddress;
  shipping_address?: RawAddress;
  custom_field_hash?: Record<string, unknown>;
  custom_fields?: Array<{ api_name?: string; value?: unknown }>;
}

export interface FieldChange {
  field: string;
  from: string;
  to: string;
}

export interface CompletenessFlag {
  field: string;
  message: string;
}

export interface CustomerFixResult {
  contactId: string;
  changes: FieldChange[];
  flags: CompletenessFlag[];
  payload: Record<string, unknown>; // Zoho PUT /contacts/{id} body — only the changed fields
}

export function normalizeSpaces(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

/** ALL CAPS with a leading legal-entity prefix (PT/CV/...) moved to the end after a comma. */
export function formatBusinessName(raw: string): string {
  const name = normalizeSpaces(raw);
  if (!name) return name;

  for (const suf of LEGAL_SUFFIXES) {
    const prefixPattern = new RegExp('^' + suf + '\\.?\\s+', 'i');
    if (prefixPattern.test(name)) {
      const rest = normalizeSpaces(name.replace(prefixPattern, ''));
      return `${rest.toUpperCase()}, ${suf}`;
    }
  }

  // Already in "..., SUFFIX" form? Just fix casing/spacing, keep order.
  const suffixAtEnd = name.match(/,\s*([A-Za-z.]+)\s*$/);
  if (suffixAtEnd && LEGAL_SUFFIXES.includes(suffixAtEnd[1].toUpperCase().replace('.', ''))) {
    const rest = normalizeSpaces(name.slice(0, name.lastIndexOf(',')));
    const suf = suffixAtEnd[1].toUpperCase().replace('.', '');
    return `${rest.toUpperCase()}, ${suf}`;
  }

  return name.toUpperCase();
}

/** Title Case for individual first/last names. */
export function formatPersonName(raw: string): string {
  return normalizeSpaces(raw)
    .toLowerCase()
    .replace(/\b\p{L}/gu, (c) => c.toUpperCase());
}

/** Strip dots/dashes; pad legacy 15-digit NPWP with a leading 0 to match the new 16-digit format. */
export function fixNpwp(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const digits = raw.replace(/[.\-]/g, '');
  let result = digits;
  if (/^\d{15}$/.test(result)) result = '0' + result;
  return result !== raw ? result : null;
}

/** Case/spelling-normalize a State value against the known Indonesian province list. Never invents a value. */
export function normalizeProvince(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const trimmed = normalizeSpaces(raw);
  const key = trimmed.toLowerCase();

  const exact = INDONESIA_PROVINCES.find((p) => p.toLowerCase() === key);
  if (exact) return exact !== trimmed ? exact : null;

  const alias = PROVINCE_ALIASES[key];
  if (alias) return alias;

  return null; // unrecognized — flag instead of guessing
}

// Matchers for pulling a known province name out of free text (e.g. a jumbled address line
// like "TANGERANG BANTEN 12345"), longest name first so multi-word names win over substrings.
const PROVINCE_TEXT_MATCHERS: Array<{ pattern: RegExp; canonical: string }> = (() => {
  const entries: Array<{ pattern: RegExp; canonical: string }> = [];
  const seen = new Set<string>();
  const add = (name: string, canonical: string) => {
    const key = name.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    entries.push({ pattern: new RegExp(`\\b${escaped}\\b`, 'i'), canonical: canonical });
  };
  for (const p of INDONESIA_PROVINCES) add(p, p);
  for (const [alias, canonical] of Object.entries(PROVINCE_ALIASES)) add(alias, canonical);
  entries.sort((a, b) => b.pattern.source.length - a.pattern.source.length);
  return entries;
})();

/** Find a known province name mentioned anywhere in free text (e.g. a jumbled address line). */
export function extractProvinceFromText(text: string | undefined | null): string | null {
  if (!text) return null;
  for (const { pattern, canonical } of PROVINCE_TEXT_MATCHERS) {
    if (pattern.test(text)) return canonical;
  }
  return null;
}

/** Find a standalone 5-digit Indonesian postal code mentioned anywhere in free text. */
export function extractZipFromText(text: string | undefined | null): string | null {
  if (!text) return null;
  const m = text.match(/\b\d{5}\b/);
  return m ? m[0] : null;
}

// Known city -> province mappings, checked as a case-insensitive substring match against the
// City field (so "Kota Bandung", "Bandung Barat", "Tangerang Selatan", "Jakarta Timur" etc. all
// still match). Extend this list as more cities come up.
const CITY_PROVINCE_SUBSTRINGS: Array<{ match: string; province: string }> = [
  { match: 'jakarta', province: 'Special Capital Region of Jakarta' },
  { match: 'bandung', province: 'West Java' },
  { match: 'tangerang', province: 'Banten' },
];

/** Infer a province from a known City name (substring match, case-insensitive). Never guesses beyond this list. */
export function provinceForCity(city: string | undefined | null): string | null {
  if (!city?.trim()) return null;
  const key = city.trim().toLowerCase();
  const hit = CITY_PROVINCE_SUBSTRINGS.find((c) => key.includes(c.match));
  return hit ? hit.province : null;
}

export function getCustomFieldValue(contact: RawContact, apiName: string): string | undefined {
  if (contact.custom_field_hash && apiName in contact.custom_field_hash) {
    const v = contact.custom_field_hash[apiName];
    return v == null ? undefined : String(v);
  }
  const cf = contact.custom_fields?.find((f) => f.api_name === apiName);
  return cf?.value == null ? undefined : String(cf.value);
}

export function computeCustomerFix(contact: RawContact): CustomerFixResult {
  const changes: FieldChange[] = [];
  const flags: CompletenessFlag[] = [];
  const payload: Record<string, unknown> = {};

  const wasBusiness = (contact.customer_sub_type || 'business') !== 'individual';
  // Classified as Business but looks like a person (First Name filled, no Company Name — Last
  // Name may be blank) — actually reclassify to Individual rather than just flagging it.
  const shouldBeIndividual = wasBusiness && !!contact.first_name?.trim() && !contact.company_name?.trim();
  // Classified as Individual but has BOTH First Name and Company Name filled in (e.g. "DUA KARYA
  // SEJAHTERA, CV" with contact person "Setiawan") — that's a business with a named contact,
  // reclassify to Business rather than flagging it.
  const shouldBeBusiness = !wasBusiness && !!contact.first_name?.trim() && !!contact.company_name?.trim();
  const isBusiness = wasBusiness ? !shouldBeIndividual : shouldBeBusiness;

  if (shouldBeIndividual) {
    changes.push({ field: 'Customer Type', from: 'Business', to: 'Individual' });
    payload.customer_sub_type = 'individual';
  }
  if (shouldBeBusiness) {
    changes.push({ field: 'Customer Type', from: 'Individual', to: 'Business' });
    payload.customer_sub_type = 'business';
  }

  // ── Name / Display Name ──────────────────────────────────────────────────
  if (isBusiness) {
    const currentName = contact.company_name?.trim() || contact.contact_name?.trim() || '';
    if (currentName) {
      const fixed = formatBusinessName(currentName);
      if (fixed !== contact.company_name || fixed !== contact.contact_name) {
        if (fixed !== (contact.company_name || '')) {
          changes.push({ field: 'Company Name', from: contact.company_name || '(blank)', to: fixed });
        }
        if (fixed !== (contact.contact_name || '')) {
          changes.push({ field: 'Display Name', from: contact.contact_name || '(blank)', to: fixed });
        }
        payload.company_name = fixed;
        payload.contact_name = fixed;
      }
    } else {
      flags.push({ field: 'Company Name', message: 'No name on file at all — cannot auto-fix.' });
    }
  } else {
    const first = formatPersonName(contact.first_name || '');
    const last = formatPersonName(contact.last_name || '');
    const displayName = normalizeSpaces(`${first} ${last}`);
    // A true individual shouldn't have a Company Name on file at all — if one is set,
    // treat it as a sub_type mismatch rather than blindly discarding it.
    const hasUnrelatedCompanyName = !!contact.company_name?.trim();

    if (!displayName) {
      flags.push({ field: 'Name', message: 'No first/last name on file — cannot auto-fix.' });
    } else if (hasUnrelatedCompanyName) {
      // Individual-classified contact but with a distinct Company Name on file (e.g. sub_type
      // mismatch) — overwriting Display Name here would silently discard the company name, so
      // flag it for a human to sort out instead of guessing.
      flags.push({
        field: 'Display Name',
        message: `Classified as Individual but has a Company Name ("${contact.company_name}") on file — please review before renaming to "${displayName}".`,
      });
    } else {
      if (first !== (contact.first_name || '')) {
        changes.push({ field: 'First Name', from: contact.first_name || '(blank)', to: first });
      }
      if (last !== (contact.last_name || '')) {
        changes.push({ field: 'Last Name', from: contact.last_name || '(blank)', to: last });
      }
      if (displayName !== (contact.contact_name || '')) {
        changes.push({ field: 'Display Name', from: contact.contact_name || '(blank)', to: displayName });
      }
      if (first !== (contact.first_name || '')) payload.first_name = first;
      if (last !== (contact.last_name || '')) payload.last_name = last;
      if (displayName !== (contact.contact_name || '')) payload.contact_name = displayName;
    }
  }

  // ── Tax Rate ──────────────────────────────────────────────────────────────
  if (contact.tax_id !== TARGET_TAX_ID) {
    changes.push({ field: 'Tax Rate', from: contact.tax_id ? '(other)' : '(blank)', to: TARGET_TAX_NAME });
    payload.tax_id = TARGET_TAX_ID;
  }

  // ── Accounts Receivable ───────────────────────────────────────────────────
  if (contact.account_id !== TARGET_ACCOUNT_ID) {
    changes.push({ field: 'Accounts Receivable', from: contact.account_id ? '(other)' : '(blank)', to: TARGET_ACCOUNT_NAME });
    payload.account_id = TARGET_ACCOUNT_ID;
  }

  // ── Payment Terms ─────────────────────────────────────────────────────────
  if ((contact.payment_terms ?? null) !== TARGET_PAYMENT_TERMS) {
    changes.push({ field: 'Payment Terms', from: String(contact.payment_terms ?? '(blank)'), to: TARGET_PAYMENT_TERMS_LABEL });
    payload.payment_terms = TARGET_PAYMENT_TERMS;
  }

  // Price List: intentionally left alone. Tier 1-5 (Bronze/Bronze Plus/Silver/Gold/Platinum) price books
  // are legitimate, expected values — not something to clear.

  // ── Discount Tier must match Price List, when a Price List is set ───────────
  const pricebookName = contact.pricebook_name?.trim();
  if (pricebookName) {
    const expectedTier = PRICEBOOK_TO_TIER[pricebookName];
    const currentTier = getCustomFieldValue(contact, 'cf_tier');
    if (expectedTier && currentTier !== expectedTier) {
      changes.push({ field: 'Discount Tier', from: currentTier || '(blank)', to: expectedTier });
      payload.custom_fields = [
        ...((payload.custom_fields as unknown[]) || []),
        { api_name: 'cf_tier', value: expectedTier },
      ];
    } else if (!expectedTier) {
      flags.push({ field: 'Discount Tier', message: `Price List "${pricebookName}" isn't one of the known tiers — please review manually.` });
    }
  }

  // ── NPWP ──────────────────────────────────────────────────────────────────
  const npwp = getCustomFieldValue(contact, 'cf_npwp');
  const fixedNpwp = fixNpwp(npwp);
  if (fixedNpwp) {
    changes.push({ field: 'NPWP', from: npwp || '(blank)', to: fixedNpwp });
    payload.custom_fields = [
      ...((payload.custom_fields as unknown[]) || []),
      { api_name: 'cf_npwp', value: fixedNpwp },
    ];
  }

  // ── Address completeness + State normalization ───────────────────────────
  // Only Address and City are treated as "required" — State and Zip Code are not flagged
  // as missing (nice-to-have, not essential).
  const ba = contact.billing_address || {};
  const sa = contact.shipping_address || {};

  // No address on file at all (billing AND shipping both blank) is a normal, acceptable state —
  // only flag when there's a PARTIAL address (some fields filled, others missing).
  if (!(isAddressEmpty(ba) && isAddressEmpty(sa))) {
    const missingAddressParts: string[] = [];
    if (!ba.address?.trim()) missingAddressParts.push('Address');
    if (!ba.city?.trim()) missingAddressParts.push('City');
    if (missingAddressParts.length) {
      flags.push({ field: 'Billing Address', message: `Missing: ${missingAddressParts.join(', ')} — VIA can't guess a real address, please fill in manually.` });
    }
  }
  const addressUpdates: Partial<RawAddress> = {};

  if (ba.state?.trim()) {
    const normalized = normalizeProvince(ba.state);
    if (normalized) {
      changes.push({ field: 'State', from: ba.state, to: normalized });
      addressUpdates.state = normalized;
    } else if (!INDONESIA_PROVINCES.some((p) => p.toLowerCase() === ba.state!.trim().toLowerCase())) {
      flags.push({ field: 'State', message: `"${ba.state}" doesn't match a known Indonesian province — please review manually.` });
    }
  } else {
    // State blank — first try inferring it from a known City, then fall back to pulling it
    // out of the address text itself (e.g. a jumbled "TANGERANG BANTEN 12345" line).
    const foundState = provinceForCity(ba.city) || extractProvinceFromText(ba.address) || extractProvinceFromText(ba.street2);
    if (foundState) {
      changes.push({ field: 'State', from: '(blank)', to: foundState });
      addressUpdates.state = foundState;
    }
  }

  if (!ba.zip?.trim()) {
    // Same idea for Zip Code — a standalone 5-digit number in the address text is a postal code.
    const foundZip = extractZipFromText(ba.address) || extractZipFromText(ba.street2);
    if (foundZip) {
      changes.push({ field: 'Zip Code', from: '(blank)', to: foundZip });
      addressUpdates.zip = foundZip;
    }
  }

  if (Object.keys(addressUpdates).length > 0) {
    payload.billing_address = { ...ba, ...addressUpdates };
  }

  // ── Region routing ────────────────────────────────────────────────────────
  // Priority: City=Bandung is the most specific/confident signal -> BDG-HUB. Otherwise
  // State=North Sumatra -> MDN-HUB (kept as before). Otherwise, if the customer is currently
  // on a retired hub (Semarang/Surabaya), force them back to Head Office regardless of State.
  // Otherwise leave an already-set Region alone (don't guess/downgrade); only fill in a truly
  // blank Region with the Head Office default.
  const effectiveState = addressUpdates.state ?? ba.state?.trim();
  const currentRegion = getCustomFieldValue(contact, 'cf_region');
  const mappedRegion = ba.city?.toLowerCase().includes('bandung')
    ? 'BDG-HUB'
    : effectiveState
    ? STATE_TO_REGION[effectiveState]
    : undefined;

  if (mappedRegion) {
    if (currentRegion !== mappedRegion) {
      changes.push({ field: 'Region', from: currentRegion || '(blank)', to: mappedRegion });
      payload.custom_fields = [
        ...((payload.custom_fields as unknown[]) || []),
        { api_name: 'cf_region', value: mappedRegion },
      ];
    }
  } else if (currentRegion && RETIRED_REGIONS.has(currentRegion)) {
    changes.push({ field: 'Region', from: currentRegion, to: DEFAULT_REGION });
    payload.custom_fields = [
      ...((payload.custom_fields as unknown[]) || []),
      { api_name: 'cf_region', value: DEFAULT_REGION },
    ];
  } else if (!currentRegion) {
    changes.push({ field: 'Region', from: '(blank)', to: DEFAULT_REGION });
    payload.custom_fields = [
      ...((payload.custom_fields as unknown[]) || []),
      { api_name: 'cf_region', value: DEFAULT_REGION },
    ];
  }

  return { contactId: contact.contact_id, changes, flags, payload };
}
