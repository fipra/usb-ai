import test from 'node:test';
import assert from 'node:assert/strict';
import { firstWelcome } from '../experimental-welcome.js';

test('the introductory response is available in every supported language', () => {
  for (const language of ['en', 'it', 'fr', 'de', 'es']) {
    const message = firstWelcome(language);
    assert.match(message, /LlamaNest/);
    assert.match(message, /Bonsai/);
    assert.match(message, /Hugging Face/);
  }
  assert.equal(firstWelcome('unknown'), firstWelcome('en'));
});
