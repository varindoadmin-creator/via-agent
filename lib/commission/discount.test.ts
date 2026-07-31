import assert from "node:assert/strict";
import test from "node:test";
import {
  getDiscountCommissionBucket,
  usesLowMarginDiscountSchema,
} from "./discount.ts";

test("standard commission tiers include every requested boundary", () => {
  const cases = [
    [0, "standard_0", 0.05],
    [1, "standard_2", 0.04],
    [2, "standard_2", 0.04],
    [3, "standard_5", 0.03],
    [5, "standard_5", 0.03],
    [6, "standard_7", 0.02],
    [7, "standard_7", 0.02],
    [8, "standard_10", 0.01],
    [10, "standard_10", 0.01],
    [10.01, "other", 0],
  ] as const;

  for (const [discount, key, rate] of cases) {
    const result = getDiscountCommissionBucket(discount, false);
    assert.equal(result.key, key, `${discount}% bucket`);
    assert.equal(result.rate, rate, `${discount}% rate`);
  }
});

test("Special Price commission tiers include every requested boundary", () => {
  const cases = [
    [0, "low_margin_0", 0.03],
    [1, "low_margin_3", 0.02],
    [3, "low_margin_3", 0.02],
    [4, "low_margin_5", 0.01],
    [5, "low_margin_5", 0.01],
    [5.01, "other", 0],
  ] as const;

  for (const [discount, key, rate] of cases) {
    const result = getDiscountCommissionBucket(discount, true);
    assert.equal(result.key, key, `${discount}% bucket`);
    assert.equal(result.rate, rate, `${discount}% rate`);
  }
});

test("Special Price product identification remains unchanged", () => {
  assert.equal(usesLowMarginDiscountSchema("ARTE-001", "Panel"), true);
  assert.equal(usesLowMarginDiscountSchema("SKU-001", "NewEdge Panel"), true);
  assert.equal(usesLowMarginDiscountSchema("STD-001", "Standard Panel"), false);
});
