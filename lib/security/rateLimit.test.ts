import assert from 'node:assert/strict';
import test from 'node:test';
import { checkRateLimit, resetRateLimitsForTest } from './rateLimit.ts';

test('a burst under the limit is entirely allowed', () => {
  resetRateLimitsForTest();
  const now = Date.now();
  for (let i = 0; i < 5; i++) {
    const result = checkRateLimit('key-a', 5, 60_000, now);
    assert.equal(result.allowed, true, `request ${i + 1} should be allowed`);
  }
});

test('a burst over the limit gets rejected once the limit is exceeded', () => {
  resetRateLimitsForTest();
  const now = Date.now();
  for (let i = 0; i < 5; i++) checkRateLimit('key-b', 5, 60_000, now);
  const sixth = checkRateLimit('key-b', 5, 60_000, now);
  assert.equal(sixth.allowed, false);
  assert.equal(sixth.remaining, 0);
});

test('the limit resets after the window elapses', () => {
  resetRateLimitsForTest();
  const now = Date.now();
  for (let i = 0; i < 5; i++) checkRateLimit('key-c', 5, 60_000, now);
  assert.equal(checkRateLimit('key-c', 5, 60_000, now).allowed, false);
  const afterWindow = checkRateLimit('key-c', 5, 60_000, now + 60_001);
  assert.equal(afterWindow.allowed, true);
});

test('different keys are tracked independently', () => {
  resetRateLimitsForTest();
  const now = Date.now();
  for (let i = 0; i < 5; i++) checkRateLimit('key-d', 5, 60_000, now);
  assert.equal(checkRateLimit('key-d', 5, 60_000, now).allowed, false);
  assert.equal(checkRateLimit('key-e', 5, 60_000, now).allowed, true);
});
