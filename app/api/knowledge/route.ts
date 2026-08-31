import { NextResponse } from 'next/server';
import { COMPANY_IDENTITY } from '@/lib/companyKnowledge/companyIdentity';
import { BRAND_RELATIONSHIPS } from '@/lib/companyKnowledge/brandRelationships';
import { getActivePaymentDestination } from '@/lib/companyKnowledge/paymentDestination';
import { FREE_SHIPPING_JAVA_TEXT, SHIPPING_CONDITIONS_TEXT } from '@/lib/companyKnowledge/shippingPolicy';
import { APPROVED_HPL_BRANDS, UNSUPPORTED_BRAND_TEXT, UNSUPPORTED_CATEGORY_TEXT } from '@/lib/companyKnowledge/productScope';

// GET /api/knowledge — read-only display of lib/companyKnowledge/*'s approved,
// versioned facts (brief section 70). Facts are code-deployed this pass, not
// live-editable via this page (documented deferral) — this route exists so
// the admin view and the WATI/Jarvis response templates can never drift
// apart, since both read the same source modules.
export async function GET() {
  return NextResponse.json({
    success: true,
    company: COMPANY_IDENTITY,
    brands: BRAND_RELATIONSHIPS,
    shipping: { freeShippingJava: FREE_SHIPPING_JAVA_TEXT, conditions: SHIPPING_CONDITIONS_TEXT },
    payment: getActivePaymentDestination(),
    productScope: { approvedBrands: APPROVED_HPL_BRANDS, unsupportedBrandText: UNSUPPORTED_BRAND_TEXT, unsupportedCategoryText: UNSUPPORTED_CATEGORY_TEXT },
  });
}
