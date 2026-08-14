import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildOpenAISpeechRequest,
  decodeBase64Audio,
  DEFAULT_OPENAI_SPEECH_MODEL,
  DEFAULT_OPENAI_SPEECH_VOICE,
  VIA_SPEECH_INSTRUCTIONS,
} from './openaiSpeech.ts';

test('builds a natural bilingual audio request with safe defaults', () => {
  const request = buildOpenAISpeechRequest('Halo. Your Sales Order is ready.');
  assert.equal(request.model, DEFAULT_OPENAI_SPEECH_MODEL);
  assert.equal(request.audio.voice, DEFAULT_OPENAI_SPEECH_VOICE);
  assert.equal(request.audio.format, 'mp3');
  assert.deepEqual(request.modalities, ['text', 'audio']);
  assert.match(VIA_SPEECH_INSTRUCTIONS, /native Indonesian/i);
  assert.match(VIA_SPEECH_INSTRUCTIONS, /natural English/i);
  assert.match(VIA_SPEECH_INSTRUCTIONS, /vee-ah/i);
  assert.equal(request.messages[1].content, 'Halo. Your Sales Order is ready.');
});

test('allows model and voice configuration', () => {
  const request = buildOpenAISpeechRequest('Test', { model: 'audio-model', voice: 'coral' });
  assert.equal(request.model, 'audio-model');
  assert.equal(request.audio.voice, 'coral');
});

test('decodes base64 audio', () => {
  assert.deepEqual([...decodeBase64Audio(Buffer.from('audio').toString('base64'))], [...Buffer.from('audio')]);
});
