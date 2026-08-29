import assert from 'node:assert/strict';
import test from 'node:test';
import { acceptsJsonContentType, exceedsWatiWebhookLimit, isAuthorizedWatiWebhook, parseWatiWebhookPayload } from './webhook.ts';

test('accepts a generic valid WATI JSON test payload', () => {
  const parsed = parseWatiWebhookPayload('{"eventType":"messageReceived","test":true}');
  assert.equal(parsed?.metadata.eventType, 'messageReceived');
  assert.equal(parsed?.payload.test, true);
  assert.equal(acceptsJsonContentType('application/json; charset=utf-8'), true);
});
test('rejects invalid JSON and non-object JSON safely', () => {
  assert.equal(parseWatiWebhookPayload('{not-json}'), null);
  assert.equal(parseWatiWebhookPayload('[]'), null);
  assert.equal(acceptsJsonContentType('text/plain'), false);
});

test('allows unknown payload fields without interpretation', () => {
  const parsed = parseWatiWebhookPayload('{"randomField":"hello","nested":{"anything":true}}');
  assert.deepEqual(parsed?.payload, { randomField: 'hello', nested: { anything: true } });
  assert.equal(parsed?.metadata.eventType, null);
});

test('enforces an optional WATI bearer secret with timing-safe equality', () => {
  assert.equal(isAuthorizedWatiWebhook('Bearer correct-secret', 'correct-secret'), true);
  assert.equal(isAuthorizedWatiWebhook(null, 'correct-secret'), false);
  assert.equal(isAuthorizedWatiWebhook('Bearer wrong-secret', 'correct-secret'), false);
  assert.equal(isAuthorizedWatiWebhook(null, undefined), true);
});

test('bounds webhook payload size', () => {
  assert.equal(exceedsWatiWebhookLimit('1048577', '{}'), true);
  assert.equal(exceedsWatiWebhookLimit('2', '{}'), false);
});
