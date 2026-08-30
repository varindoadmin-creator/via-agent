// ─── Stock-safe response templates ──────────────────────────────────────────────
// Brief section 19. Fixed Bahasa Indonesia templates only — no LLM text
// generation for customer-facing stock replies, same posture as Phase 2's
// responseDecision.ts. None of these functions accept a quantity parameter for
// the AVAILABLE/SUFFICIENT/INSUFFICIENT/OUT_OF_STOCK cases — that's enforced
// at the type level, not just by convention.

export function needQuantityPrompt(): string {
  return 'Baik Pak/Bu, boleh diinformasikan berapa lembar yang dibutuhkan? Kami bantu cek ketersediaannya.';
}

export function existenceAvailable(): string {
  return 'Baik Pak/Bu, untuk barang tersebut saat ini tersedia.';
}

export function existenceOutOfStock(): string {
  return 'Mohon maaf Pak/Bu, untuk barang tersebut saat ini stok belum tersedia.';
}

export function sufficientForRequest(requestedQuantity: number, requestedUnit: string | null): string {
  const unit = requestedUnit || 'unit';
  return `Baik Pak/Bu, untuk kebutuhan ${requestedQuantity} ${unit} saat ini tersedia.`;
}

/** Used identically whether the fulfilling source was the vendor or Varindo's own fallback stock — the customer never needs to know which (brief section 19's explicit example). */
export function sufficientViaFallback(requestedQuantity: number, requestedUnit: string | null): string {
  const unit = requestedUnit || 'unit';
  return `Baik Pak/Bu, untuk kebutuhan ${requestedQuantity} ${unit} saat ini masih dapat kami penuhi.`;
}

export function insufficientForRequest(): string {
  return 'Mohon maaf Pak/Bu, untuk kebutuhan tersebut saat ini belum dapat kami penuhi.';
}

/** Sent when the vendor's operating hours mean the check can't start yet — never mentions vendor hours or internal sourcing (brief section 21). */
export function vendorClosedAck(): string {
  return 'Baik Pak/Bu, kami akan segera cek ketersediaannya dan menginformasikan kembali secepatnya.';
}

export function unknownNeedsFollowUp(): string {
  return 'Mohon maaf Pak/Bu, kami masih memverifikasi ketersediaannya dan akan segera menginformasikan kembali.';
}

/** Renders the correct fixed template for a resolved CustomerStockResult — never takes a raw quantity for anything but echoing back what the customer themselves asked for. */
export function renderStockResult(
  result: 'AVAILABLE' | 'SUFFICIENT' | 'INSUFFICIENT' | 'OUT_OF_STOCK' | 'UNKNOWN',
  context: { requestedQuantity: number | null; requestedUnit: string | null; fulfilledByFallback: boolean },
): string {
  switch (result) {
    case 'AVAILABLE':
      return existenceAvailable();
    case 'SUFFICIENT':
      return context.requestedQuantity == null
        ? existenceAvailable()
        : context.fulfilledByFallback
          ? sufficientViaFallback(context.requestedQuantity, context.requestedUnit)
          : sufficientForRequest(context.requestedQuantity, context.requestedUnit);
    case 'INSUFFICIENT':
      return insufficientForRequest();
    case 'OUT_OF_STOCK':
      return existenceOutOfStock();
    case 'UNKNOWN':
      return unknownNeedsFollowUp();
  }
}
