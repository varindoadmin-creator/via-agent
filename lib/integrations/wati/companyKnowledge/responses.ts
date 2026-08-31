// ─── Company-knowledge WATI response templates ────────────────────────────────
// VIA Product/Pricing/Company Architecture brief: deterministic Bahasa
// Indonesia templates only, same convention as every other domain's
// responses.ts (pricing/commercial/selfService/stock) — no LLM-generated
// customer-facing text. Content is sourced from lib/companyKnowledge/*, the
// single canonical fact source shared with internal Jarvis.

import { COMPANY_IDENTITY } from '../../../companyKnowledge/companyIdentity.ts';
import { getBrandRelationship, type BrandName } from '../../../companyKnowledge/brandRelationships.ts';
import { getActivePaymentDestination } from '../../../companyKnowledge/paymentDestination.ts';
import { FREE_SHIPPING_JAVA_TEXT, SHIPPING_CONDITIONS_TEXT } from '../../../companyKnowledge/shippingPolicy.ts';
import { UNSUPPORTED_BRAND_TEXT, UNSUPPORTED_CATEGORY_TEXT } from '../../../companyKnowledge/productScope.ts';

export function companyInfoResponse(): string {
  return `Halo Pak/Bu, berikut informasi kantor Varindo:\n\nKantor Pusat:\n${COMPANY_IDENTITY.headOffice.lines.join('\n')}\nT. ${COMPANY_IDENTITY.headOffice.phone}\n\nEmail: ${COMPANY_IDENTITY.contact.email}\nWebsite: ${COMPANY_IDENTITY.contact.website}`;
}

/** brand is null when the customer didn't name one — both approved statements are shared. */
export function dealerStatusResponse(brand: BrandName | null): string {
  if (brand) {
    const relationship = getBrandRelationship(brand);
    return `Ya Pak/Bu, ${relationship.dealerStatement} Info lebih lanjut dapat dilihat di ${relationship.website}.`;
  }
  const lamitak = getBrandRelationship('LAMITAK');
  const edl = getBrandRelationship('EDL');
  return `Ya Pak/Bu. ${lamitak.dealerStatement} ${edl.dealerStatement}`;
}

export function shippingPolicyResponse(): string {
  return [
    'Berikut kebijakan pengiriman Varindo:',
    'Pesanan sebelum jam 14:00 WIB (Senin-Jumat): wilayah Jabodetabek dikirim keesokan hari kerja (maks. 2 hari kerja); di luar Jabodetabek diserahkan ke mitra logistik keesokan hari kerja (maks. 2 hari kerja).',
    'Pesanan setelah jam 14:00 WIB atau di luar hari kerja: wilayah Jabodetabek dikirim dalam 2 hari kerja; di luar Jabodetabek diserahkan ke mitra logistik dalam 2 hari kerja.',
    FREE_SHIPPING_JAVA_TEXT,
    SHIPPING_CONDITIONS_TEXT,
  ].join(' ');
}

export function paymentDestinationResponse(): string {
  const destination = getActivePaymentDestination();
  if (!destination) return 'Mohon maaf Pak/Bu, saat ini kami tidak dapat menampilkan tujuan pembayaran. Mohon hubungi Admin Varindo.';
  return `Baik Pak/Bu, pembayaran dapat ditransfer ke:\n\nBank ${destination.bank}\na/n ${destination.accountName}\nNo. Rek. ${destination.accountNumber}\n${destination.branch}`;
}

// Brief section 31 — the exact preferred redirect, never disclosing Tier/Special-Price classification.
export function tierProbeRedirect(): string {
  return 'Baik Pak/Bu, kami dapat membantu cek harga yang berlaku untuk akun perusahaan Bapak/Ibu. Boleh diinformasikan kode produknya?';
}

export function unsupportedProductResponse(reason: 'BRAND' | 'CATEGORY'): string {
  return reason === 'BRAND' ? UNSUPPORTED_BRAND_TEXT : UNSUPPORTED_CATEGORY_TEXT;
}

/** brand is null when the customer didn't specify — both website options are shared. */
export function sampleCatalogueResponse(brand: BrandName | null): string {
  if (brand === 'LAMITAK') return `Baik Pak/Bu, untuk permintaan sample Lamitak, Bapak/Ibu dapat mengisi formulir melalui ${getBrandRelationship('LAMITAK').website}.`;
  if (brand === 'EDL') return `Baik Pak/Bu, untuk permintaan sample EDL, Bapak/Ibu dapat mengisi formulir melalui ${getBrandRelationship('EDL').website}.`;
  return `Baik Pak/Bu, untuk permintaan sample/katalog, Bapak/Ibu dapat mengisi formulir melalui ${getBrandRelationship('LAMITAK').website} (Lamitak) atau ${getBrandRelationship('EDL').website} (EDL) sesuai brand yang diinginkan.`;
}
