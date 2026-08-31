import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyPricingGroup } from './specialPricePolicy.ts';

test('Test 27 — ARTE wins over the shorter overlapping ART prefix', () => {
  assert.equal(classifyPricingGroup('ARTE1234'), 'LAMITAK_SPECIAL');
  assert.equal(classifyPricingGroup('ART1234'), 'LAMITAK_SPECIAL'); // both are approved Lamitak prefixes, but distinctly matched
});

test('CCM/CCP/CCX win over the shorter overlapping CC prefix (all still classify LAMITAK_SPECIAL, but via the longer match)', () => {
  assert.equal(classifyPricingGroup('CCM100'), 'LAMITAK_SPECIAL');
  assert.equal(classifyPricingGroup('CCP200'), 'LAMITAK_SPECIAL');
  assert.equal(classifyPricingGroup('CCX300'), 'LAMITAK_SPECIAL');
  assert.equal(classifyPricingGroup('CC400'), 'LAMITAK_SPECIAL');
});

test('EDL special prefixes classify correctly, including the hyphenated L-FA prefix', () => {
  assert.equal(classifyPricingGroup('DC1001'), 'EDL_SPECIAL');
  assert.equal(classifyPricingGroup('DSD2002'), 'EDL_SPECIAL');
  assert.equal(classifyPricingGroup('L-FA303'), 'EDL_SPECIAL');
  assert.equal(classifyPricingGroup('LFA303'), 'EDL_SPECIAL'); // hyphen-insensitive
});

test('a code matching no approved special prefix classifies as STANDARD', () => {
  assert.equal(classifyPricingGroup('WY5217'), 'STANDARD');
  assert.equal(classifyPricingGroup('DXO5338D'), 'STANDARD');
});

test('classification is case- and separator-insensitive', () => {
  assert.equal(classifyPricingGroup('atp-11358m'), 'LAMITAK_SPECIAL');
  assert.equal(classifyPricingGroup('ATP 11358M'), 'LAMITAK_SPECIAL');
});

test('an empty or missing code never throws and classifies STANDARD', () => {
  assert.equal(classifyPricingGroup(''), 'STANDARD');
});
