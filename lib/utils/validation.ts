// ─── Validation Utilities ─────────────────────────────────────────────────────

import { ExtractedOrder, SOPreview } from '@/types/order';

export const APPROVAL_COMMANDS = {
  CREATE_SO: 'APPROVE CREATE SO',
  UPDATE_SO: 'APPROVE UPDATE SO',
} as const;

/**
 * Check if a user message is an exact approval command.
 */
export function isApprovalCommand(message: string): {
  isApproval: boolean;
  type: 'create_so' | 'update_so' | null;
} {
  const trimmed = message.trim();

  if (trimmed === APPROVAL_COMMANDS.CREATE_SO) {
    return { isApproval: true, type: 'create_so' };
  }

  if (trimmed === APPROVAL_COMMANDS.UPDATE_SO) {
    return { isApproval: true, type: 'update_so' };
  }

  return { isApproval: false, type: null };
}

/**
 * Check if a message looks like an approval attempt (but wrong format).
 * Used to show helpful error messages.
 */
export function looksLikeApprovalAttempt(message: string): boolean {
  const lower = message.toLowerCase().trim();
  const approvalWords = ['approve', 'approved', 'yes', 'ok', 'confirm', 'confirmed', 'create so', 'update so'];
  return approvalWords.some((word) => lower.includes(word));
}

/**
 * Validate that an extracted order has enough data to create a preview.
 */
export function validateOrderForPreview(order: ExtractedOrder): {
  valid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Critical fields
  if (!order.customer?.raw_name && !order.customer?.matched_customer_id) {
    errors.push('Customer name is missing.');
  }

  if (!order.items || order.items.length === 0) {
    errors.push('No items found in the order.');
  }

  // Item-level validation
  order.items?.forEach((item, idx) => {
    if (!item.item_code && !item.raw_text) {
      errors.push(`Item ${idx + 1}: Item code is missing.`);
    }
    if (!item.quantity || item.quantity <= 0) {
      errors.push(`Item ${idx + 1} (${item.item_code || 'unknown'}): Quantity is missing or zero.`);
    }
    if (item.confidence < 0.5) {
      warnings.push(`Item ${idx + 1} (${item.item_code || 'unknown'}): Low confidence match (${Math.round(item.confidence * 100)}%). Please verify.`);
    }
    if (item.official_price === null) {
      warnings.push(`Item ${idx + 1} (${item.item_code || 'unknown'}): Official price not found.`);
    }
    if (item.customer_provided_price !== null && item.official_price !== null) {
      if (Math.abs(item.customer_provided_price - item.official_price) > 0.01) {
        warnings.push(`Item ${idx + 1} (${item.item_code}): Customer-provided price differs from official Zoho price.`);
      }
    }
  });

  // Customer confidence
  if (order.customer?.confidence !== undefined && order.customer.confidence < 0.7) {
    warnings.push(`Customer match confidence is low (${Math.round(order.customer.confidence * 100)}%). Please verify customer.`);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validate a SO preview before creating in Zoho.
 */
export function validateSOPreviewForCreation(preview: SOPreview): {
  valid: boolean;
  blockers: string[];
} {
  const blockers: string[] = [];

  if (!preview.customer_id) {
    blockers.push('No matched customer ID. Cannot create SO without a valid customer.');
  }

  const itemsWithNoId = preview.items.filter((item) => !item.item_id);
  if (itemsWithNoId.length > 0) {
    blockers.push(
      `${itemsWithNoId.length} item(s) have no Zoho item ID: ${itemsWithNoId.map((i) => i.item_code).join(', ')}.`
    );
  }

  const itemsWithNoPrice = preview.items.filter((item) => !item.official_price || item.official_price <= 0);
  if (itemsWithNoPrice.length > 0) {
    blockers.push(
      `${itemsWithNoPrice.length} item(s) have no official price: ${itemsWithNoPrice.map((i) => i.item_code).join(', ')}.`
    );
  }

  return {
    valid: blockers.length === 0,
    blockers,
  };
}

/**
 * Determine brand coverage based on brand name and delivery location.
 */
export function checkBrandCoverage(brand: string, location: string): {
  covered: boolean;
  warning: string | null;
} {
  const bandungOnlyBrands = ['AICA', 'TACO', 'CARTA', 'AIDI'];
  const brandUpper = brand.toUpperCase();
  const locationLower = location.toLowerCase();

  const isBandungOnly = bandungOnlyBrands.includes(brandUpper);
  const isBandung = locationLower.includes('bandung');
  const isIndonesia =
    !locationLower.includes('singapore') &&
    !locationLower.includes('malaysia') &&
    !locationLower.includes('overseas') &&
    !locationLower.includes('luar negeri');

  if (!isIndonesia) {
    return {
      covered: false,
      warning: 'Varindo currently serves delivery within Indonesia only.',
    };
  }

  if (isBandungOnly && !isBandung) {
    return {
      covered: false,
      warning: `${brand} is currently served for the Bandung area only. Please contact Admin for further review.`,
    };
  }

  return { covered: true, warning: null };
}
