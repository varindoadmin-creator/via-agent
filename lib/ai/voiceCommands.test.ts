import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeVoiceCommand } from './voiceCommands.ts';

test('removes the VIA wake phrase from a spoken order', () => {
  assert.equal(
    normalizeVoiceCommand('Hello VIA. Create SO for Profitto, DXO 5338D standard size, 10 sheets'),
    'Create SO for Profitto, DXO 5338D standard size, 10 sheets'
  );
});

test('maps OK create only when a create preview is pending', () => {
  assert.equal(normalizeVoiceCommand('OK, create', 'create_so'), 'APPROVE CREATE SO');
  assert.equal(normalizeVoiceCommand('OK, create', null), 'OK, create');
});

test('keeps revision instructions as natural language', () => {
  assert.equal(
    normalizeVoiceCommand('Hello VIA, revise the quantity to 5 sheets', 'create_so'),
    'revise the quantity to 5 sheets'
  );
});

test('supports Bahasa wake and approval phrases', () => {
  assert.equal(
    normalizeVoiceCommand('Halo VIA, buat Sales Order untuk Profitto'),
    'Create Sales Order for Profitto'
  );
  assert.equal(normalizeVoiceCommand('OK, buat', 'create_so'), 'APPROVE CREATE SO');
});

test('accepts Varindo as an alternative wake name', () => {
  assert.equal(
    normalizeVoiceCommand('Hello, Varindo. Create SO for Profitto'),
    'Create SO for Profitto'
  );
  assert.equal(
    normalizeVoiceCommand('Halo Varindo, buat Sales Order untuk Profitto'),
    'Create Sales Order for Profitto'
  );
});

test('normalizes a Bahasa Sales Order request for reliable intent detection', () => {
  assert.equal(
    normalizeVoiceCommand('Halo VIA, buat Sales Order untuk Profitto, DXO 5338D ukuran standar 10 lembar'),
    'Create Sales Order for Profitto, DXO 5338D standard size 10 sheets'
  );
  assert.equal(
    normalizeVoiceCommand('Hello Varindo, tolong buatkan SO untuk Profitto, DXO 5338D ukuran jumbo 5 lembar'),
    'Create Sales Order for Profitto, DXO 5338D jumbo size 5 sheets'
  );
});
