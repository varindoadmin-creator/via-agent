import assert from 'node:assert/strict';
import test from 'node:test';
import { choosePreferredVoice, textForSpeech } from './speech.ts';

test('prefers a female Indonesian voice', () => {
  const selected = choosePreferredVoice([
    { name: 'Alex', lang: 'en-US' },
    { name: 'Andika', lang: 'id-ID' },
    { name: 'Damayanti', lang: 'id-ID' },
  ]);
  assert.equal(selected?.name, 'Damayanti');
});

test('falls back to an English female voice', () => {
  const selected = choosePreferredVoice([
    { name: 'Alex', lang: 'en-US' },
    { name: 'Samantha', lang: 'en-US' },
  ]);
  assert.equal(selected?.name, 'Samantha');
});

test('removes markdown before speaking', () => {
  assert.equal(textForSpeech('## Ready\n- **Customer:** [Profitto](/customers)'), 'Ready Customer: Profitto');
});
