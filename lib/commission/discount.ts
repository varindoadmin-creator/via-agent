export type DiscountCommissionSchema = "standard" | "low_margin";

export type DiscountCommissionBucketKey =
  | "standard_0"
  | "standard_2"
  | "standard_5"
  | "standard_7"
  | "standard_10"
  | "low_margin_0"
  | "low_margin_3"
  | "low_margin_5"
  | "other";

export interface DiscountCommissionBucket {
  key: DiscountCommissionBucketKey;
  rate: number;
  schema: DiscountCommissionSchema;
}

const SPECIAL_DISCOUNT_PREFIXES = [
  "ARTE", "ART", "CC", "CCM", "CCP", "CCX",
  "ATS", "ATP", "ATW", "CATS", "CATP",
];

export function usesLowMarginDiscountSchema(sku: string, itemName: string): boolean {
  const normalizedSku = sku.trim().toUpperCase();
  const normalizedName = itemName.trim().toUpperCase();
  return SPECIAL_DISCOUNT_PREFIXES.some((prefix) =>
    normalizedSku.startsWith(prefix),
  ) || normalizedSku.includes("NEWEDGE") || normalizedName.includes("NEWEDGE");
}

export function getDiscountCommissionBucket(
  discountPercent: number,
  lowMarginSchema: boolean,
): DiscountCommissionBucket {
  const schema: DiscountCommissionSchema = lowMarginSchema ? "low_margin" : "standard";
  if (Math.abs(discountPercent) < 0.01) {
    return { key: lowMarginSchema ? "low_margin_0" : "standard_0", rate: lowMarginSchema ? 0.03 : 0.05, schema };
  }

  if (lowMarginSchema) {
    if (discountPercent > 0 && discountPercent <= 3) {
      return { key: "low_margin_3", rate: 0.02, schema };
    }
    if (discountPercent > 3 && discountPercent <= 5) {
      return { key: "low_margin_5", rate: 0.01, schema };
    }
    return { key: "other", rate: 0, schema };
  }

  if (discountPercent > 0 && discountPercent <= 2) {
    return { key: "standard_2", rate: 0.04, schema };
  }
  if (discountPercent > 2 && discountPercent <= 5) {
    return { key: "standard_5", rate: 0.03, schema };
  }
  if (discountPercent > 5 && discountPercent <= 7) {
    return { key: "standard_7", rate: 0.02, schema };
  }
  if (discountPercent > 7 && discountPercent <= 10) {
    return { key: "standard_10", rate: 0.01, schema };
  }
  return { key: "other", rate: 0, schema };
}
