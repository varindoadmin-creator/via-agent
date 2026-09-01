// ─── Disclosure denial templates ────────────────────────────────────────────────
// Brief section 32: concise, natural replies — never a "security policy 403"
// style message to a customer. Fixed templates only, same posture as Phase 2/3
// (no LLM text generation for anything a disclosure decision produces).

import type { DisclosureReasonCode } from './policy.ts';

function internalDataDenied(): string {
  return 'Mohon maaf Kak, informasi penjualan internal Varindo tidak dapat kami bagikan. Namun kami dapat membantu terkait produk, stok, harga, atau pesanan Kakak.';
}

function otherCustomerDenied(): string {
  return 'Mohon maaf Kak, kami tidak dapat membagikan informasi transaksi pelanggan lain.';
}

function confidentialDenied(): string {
  return 'Mohon maaf Kak, informasi tersebut merupakan data internal Varindo dan tidak dapat kami bagikan.';
}

function verifyIdentity(): string {
  return 'Baik Kak, untuk informasi tersebut kami perlu memverifikasi data Kakak terlebih dahulu. Mohon hubungi Admin Varindo untuk verifikasi.';
}

/** Maps a disclosure reason code straight to its fixed customer-facing text. Never used for ALLOW/INTERNAL_USER_GOVERNED_ELSEWHERE outcomes. */
export function responseForReasonCode(reasonCode: DisclosureReasonCode): string {
  switch (reasonCode) {
    case 'INTERNAL_DATA_EXTERNAL_DENIED':
      return internalDataDenied();
    case 'CROSS_CUSTOMER_ACCESS_DENIED':
    case 'RESTRICTED_DATA_DENIED':
      return otherCustomerDenied();
    case 'CONFIDENTIAL_DATA_EXTERNAL_DENIED':
      return confidentialDenied();
    case 'CUSTOMER_IDENTITY_REQUIRED':
      return verifyIdentity();
    case 'POLICY_EVALUATION_FAILED':
      // Fail closed with the safest generic denial rather than a technical error string.
      return internalDataDenied();
    case 'PUBLIC_DATA_ALLOWED':
    case 'CUSTOMER_SHAREABLE_ALLOWED':
    case 'CUSTOMER_OWNED_RESOURCE_ALLOWED':
    case 'INTERNAL_USER_GOVERNED_ELSEWHERE':
      return '';
  }
}
