export interface FulfillmentInputs {
  requestedQuantity: number;
  availableSystemStock: number;
  openPurchaseOrderQuantity: number;
  poCoverageComplete: boolean;
}

export interface FulfillmentAssessment {
  requested_quantity: number;
  available_system_stock: number;
  immediate_system_shortfall: number;
  open_purchase_order_quantity: number;
  projected_quantity_after_open_pos: number;
  projected_shortfall_after_open_pos: number;
  can_fulfil_from_system_stock: boolean;
  can_cover_after_open_pos: boolean;
  po_coverage_complete: boolean;
  confidence: 'high' | 'limited';
}

/** Deterministic quantity arithmetic; the model only interprets this result. */
export function calculateFulfillmentAssessment(input: FulfillmentInputs): FulfillmentAssessment {
  const requested = Math.max(0, Number(input.requestedQuantity) || 0);
  const available = Math.max(0, Number(input.availableSystemStock) || 0);
  const openPo = Math.max(0, Number(input.openPurchaseOrderQuantity) || 0);
  const immediateShortfall = Math.max(0, requested - available);
  const projected = available + openPo;
  const projectedShortfall = Math.max(0, requested - projected);

  return {
    requested_quantity: requested,
    available_system_stock: available,
    immediate_system_shortfall: immediateShortfall,
    open_purchase_order_quantity: openPo,
    projected_quantity_after_open_pos: projected,
    projected_shortfall_after_open_pos: projectedShortfall,
    can_fulfil_from_system_stock: immediateShortfall === 0,
    can_cover_after_open_pos: projectedShortfall === 0,
    po_coverage_complete: input.poCoverageComplete,
    confidence: input.poCoverageComplete ? 'high' : 'limited',
  };
}
