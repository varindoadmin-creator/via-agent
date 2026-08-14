import assert from 'node:assert/strict';
import test from 'node:test';
import { getGreetingReply } from './greetings.ts';

test('answers a standalone English greeting briefly', () => {
  assert.equal(getGreetingReply('Hello VIA'), 'Hello, sir. What can I do for you today?');
  assert.equal(getGreetingReply('Hello, Varindo!'), 'Hello, sir. What can I do for you today?');
});

test('answers a standalone Indonesian greeting briefly', () => {
  assert.equal(getGreetingReply('Halo VIA'), 'Halo, Pak. Ada yang bisa saya bantu hari ini?');
  assert.equal(getGreetingReply('Hai Varindo'), 'Halo, Pak. Ada yang bisa saya bantu hari ini?');
});

test('does not intercept a greeting that includes a command', () => {
  assert.equal(getGreetingReply('Halo VIA, buat Sales Order untuk Profitto'), null);
});
